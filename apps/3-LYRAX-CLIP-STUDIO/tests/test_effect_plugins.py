import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from backend.effects.audio import detect_beat_events
from backend.models import Project
from backend.effects import registry
from backend.effects import fireworks, lightning


class FakeRenderer:
    @staticmethod
    def _format_ass_time(seconds):
        seconds = max(0.0, float(seconds))
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        whole_seconds = int(seconds % 60)
        centiseconds = int(round((seconds - int(seconds)) * 100))
        return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{centiseconds:02d}"

    @staticmethod
    def _hex_to_ass_color(color, alpha=0):
        text = str(color).lstrip("#")
        if len(text) != 6:
            text = "FFFFFF"
        red, green, blue = text[0:2], text[2:4], text[4:6]
        return f"&H{max(0, min(255, int(alpha))):02X}{blue}{green}{red}&"


class EffectPluginTests(unittest.TestCase):
    def test_registry_discovers_lightning_and_fireworks_manifests(self):
        specs = registry.get_effect_specs()
        by_id = {spec["id"]: spec for spec in specs}
        self.assertIn("lightning", by_id)
        self.assertIn("fireworks", by_id)
        self.assertEqual(by_id["lightning"]["preview_module"], "/static/js/effects/lightning.js")
        self.assertTrue(by_id["fireworks"]["controls"])

    def test_lightning_note_branch_probabilities_are_deterministic(self):
        args = (100, 4, "left", 12345, 200, 400, 5.0, 8, 16.0, False)
        no_branch = lightning._build_bolt_path(*args, "realistic", branch_prob=0.0)
        with_branch = lightning._build_bolt_path(*args, "realistic", branch_prob=1.0)
        self.assertEqual(no_branch.count("m "), 1)
        self.assertEqual(with_branch.count("m "), 2)

        seed = 5
        fork_args = (100, 4, "right", seed, 200, 400, 3.0, 11, 22.0, False)
        sparse_fork = lightning._build_bolt_path(*fork_args, "forked", branch_prob=0.0)
        full_fork = lightning._build_bolt_path(*fork_args, "forked", branch_prob=1.0)
        self.assertEqual(sparse_fork.count("m "), 2)  # main bolt + one guaranteed fork
        self.assertEqual(full_fork.count("m "), 1 + 2 + (seed % 3))

    def test_beat_detector_preserves_simultaneous_frequency_bands(self):
        sample_rate = 22050
        sample_count = 512
        times = np.arange(sample_count, dtype=np.float64) / sample_rate
        samples = sum(
            12000.0 * np.sin(2 * np.pi * (bin_index * sample_rate / sample_count) * times)
            for bin_index in (2, 20, 100)
        )
        events = detect_beat_events(samples, sample_rate=sample_rate, sensitivity=1.35, min_gap_sec=0.22)
        self.assertEqual({event["freq_band"] for event in events}, {"bass", "mid", "treble"})
        self.assertEqual(len({event["t"] for event in events}), 1)

    def test_discovery_is_directory_based_for_new_modules(self):
        package = importlib.import_module("backend.effects")
        original_dir = registry._PACKAGE_DIR
        original_path = list(package.__path__)
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                (root / "demo_effect.py").write_text(
                    "EFFECT_SPEC = {'id': 'demo_effect', 'name': 'Demo'}\n"
                    "def build_events(layer, context): return [{'t': 1.0}]\n"
                    "def render_ass(renderer, layer, events, width, height, ass_layer=2): return ['demo-layer-' + str(ass_layer)]\n",
                    encoding="utf-8",
                )
                registry._PACKAGE_DIR = root
                package.__path__.append(str(root))
                sys.modules.pop("backend.effects.demo_effect", None)
                discovered = registry.discover_effects()
                self.assertIn("demo_effect", discovered)
                rendered = registry.render_effect_layers(
                    FakeRenderer(), [{"id": "demo-instance", "type": "demo_effect"}],
                    {"duration": 2, "width": 320, "height": 240},
                )
                self.assertEqual(rendered, ["demo-layer-2"])
        finally:
            sys.modules.pop("backend.effects.demo_effect", None)
            registry._PACKAGE_DIR = original_dir
            package.__path__[:] = original_path
            importlib.invalidate_caches()

    def test_lightning_interval_and_manual_events_are_layer_scoped(self):
        context = {"duration": 8.0}
        interval_layer = {
            "type": "lightning", "start_time": 2.0, "end_time": 8.0,
            "settings": {"mode": "interval", "intervalSec": 3.0}, "events": []
        }
        manual_layer = {
            "type": "lightning", "start_time": 0.0, "end_time": 8.0,
            "settings": {"mode": "manual"},
            "events": [{"t": 4.25, "tier": 3}, {"t": 5.0, "tier": 2, "seed": None}]
        }
        interval_events = lightning.build_events(interval_layer, context)
        manual_events = lightning.build_events(manual_layer, context)
        self.assertEqual([event["t"] for event in interval_events], [2.0, 5.0, 8.0])
        self.assertEqual([(event["t"], event["tier"]) for event in manual_events], [(4.25, 3), (5.0, 2)])
        from backend.effects.utils import seed_for_time
        self.assertEqual(interval_events[0]["seed"], seed_for_time(2.0, 1))
        self.assertEqual(manual_events[1]["seed"], seed_for_time(5.0, 2))

    def test_fireworks_interval_and_manual_tiers(self):
        interval_events = fireworks.build_events(
            {"type": "fireworks", "start_time": 1, "end_time": 7,
             "settings": {"mode": "interval", "intervalSec": 3}, "events": []},
            {"duration": 10},
        )
        manual_events = fireworks.build_events(
            {"type": "fireworks", "settings": {"mode": "manual"},
             "events": [{"t": 2.0, "tier": 3, "seed": 123}, {"t": 3.0, "tier": 1, "seed": None}]},
            {"duration": 10},
        )
        self.assertEqual([event["t"] for event in interval_events], [1.0, 4.0, 7.0])
        self.assertEqual(manual_events[0]["tier"], 3)
        self.assertEqual(manual_events[0]["seed"], 123)
        from backend.effects.utils import seed_for_time
        self.assertEqual(manual_events[1]["seed"], seed_for_time(3.0, 1))

    def test_multiple_instances_of_one_effect_keep_independent_ass_layers(self):
        lines = registry.render_effect_layers(
            FakeRenderer(),
            [
                {"id": "bolt-a", "type": "lightning", "order": 0,
                 "settings": {"mode": "manual", "colorMode": "custom", "color": "#FF0000"},
                 "events": [{"t": 1, "tier": 1}]},
                {"id": "bolt-b", "type": "lightning", "order": 1,
                 "settings": {"mode": "manual", "colorMode": "custom", "color": "#00FF00"},
                 "events": [{"t": 2, "tier": 2}]},
            ],
            {"duration": 5, "width": 1080, "height": 1920},
        )
        first_layer = [line for line in lines if line.startswith("Dialogue: 2,")]
        second_layer = [line for line in lines if line.startswith("Dialogue: 3,")]
        self.assertTrue(first_layer)
        self.assertTrue(second_layer)
        self.assertTrue(any("&H000000FF&" in line for line in first_layer))
        self.assertTrue(any("&H0000FF00&" in line for line in second_layer))
        self.assertGreater(len(lines), 6)

    def test_effect_layers_render_on_distinct_ass_tracks(self):
        lines = registry.render_effect_layers(
            FakeRenderer(),
            [
                {"id": "bolt-a", "type": "lightning", "order": 0,
                 "settings": {"mode": "manual"}, "events": [{"t": 1, "tier": 2}]},
                {"id": "spark-b", "type": "fireworks", "order": 1,
                 "settings": {"mode": "manual"}, "events": [{"t": 2, "tier": 1}]},
            ],
            {"duration": 5, "width": 1080, "height": 1920},
        )
        self.assertTrue(any(line.startswith("Dialogue: 2,") for line in lines))
        self.assertTrue(any(line.startswith("Dialogue: 3,") for line in lines))
        self.assertGreater(len(lines), 10)

    def test_effect_event_end_time_overrides_plugin_default_duration(self):
        context = {"duration": 5, "width": 1080, "height": 1920}
        lightning_lines = registry.render_effect_layers(
            FakeRenderer(),
            [{"id": "bolt", "type": "lightning", "settings": {"mode": "manual"},
              "events": [{"t": 1.0, "end_time": 1.123, "tier": 1}]}],
            context,
        )
        fireworks_lines = registry.render_effect_layers(
            FakeRenderer(),
            [{"id": "spark", "type": "fireworks", "settings": {"mode": "manual"},
              "events": [{"t": 1.0, "end_time": 1.623, "tier": 1}]}],
            context,
        )
        self.assertTrue(any("0:00:01.00,0:00:01.12" in line for line in lightning_lines))
        self.assertTrue(any("0:00:01.00,0:00:01.62" in line for line in fireworks_lines))


class ProjectEffectLayerTests(unittest.TestCase):
    def test_effect_layers_round_trip_and_are_deep_copied(self):
        source = [{"id": "fx-one", "type": "fireworks", "enabled": True,
                   "settings": {"palette": "warm"}, "events": [{"t": 6.0, "tier": 2}]}]
        project = Project.from_dict({"name": "layers", "duration": 3, "effect_layers": source})
        source[0]["settings"]["palette"] = "cool"
        data = project.to_dict()
        self.assertEqual(data["effect_layers"][0]["settings"]["palette"], "warm")
        self.assertGreaterEqual(project.duration, 7.5)
        restored = Project.from_dict(data)
        self.assertEqual(restored.to_dict()["effect_layers"], data["effect_layers"])

    def test_event_end_override_sets_effect_render_duration(self):
        project = Project.from_dict({
            "name": "custom-effect-end",
            "effect_layers": [{
                "id": "fireworks-custom", "type": "fireworks",
                "settings": {"mode": "manual"},
                "events": [{"t": 1.0, "end_time": 1.234, "tier": 1}],
            }],
        })
        self.assertAlmostEqual(project.calculate_duration(), 1.234)
        restored = Project.from_dict(project.to_dict())
        self.assertAlmostEqual(restored.calculate_duration(), 1.234)

    def test_declared_project_duration_is_preserved_as_a_floor(self):
        project = Project.from_dict({"name": "duration-floor", "duration": 42.5, "events": []})
        self.assertAlmostEqual(project.calculate_duration(), 42.5)

    def test_render_end_time_caps_audio_lyrics_and_effects(self):
        project = Project.from_dict({
            "name": "stopped-audio-segment",
            "duration": 180.0,
            "render_end_time": 7.425,
            "events": [
                {"id": "audio", "type": "audio", "start_time": 0, "end_time": 180, "content": "song.mp3"},
                {"id": "lyric", "type": "lyrics", "start_time": 12, "end_time": 16, "content": "later lyric"},
            ],
            "effect_layers": [{
                "id": "late-effect", "type": "fireworks", "start_time": 0,
                "events": [{"t": 20.0, "tier": 2}],
            }],
        })
        self.assertAlmostEqual(project.duration, 7.425)
        self.assertAlmostEqual(project.calculate_duration(), 7.425)
        self.assertAlmostEqual(Project.from_dict(project.to_dict()).duration, 7.425)

    def test_invalid_render_end_time_does_not_cap_duration(self):
        project = Project.from_dict({
            "name": "invalid-cutoff", "duration": 12,
            "render_end_time": "not-a-time", "events": [],
        })
        self.assertAlmostEqual(project.duration, 12.0)

    def test_overlay_rotation_round_trips_with_event_coordinates(self):
        from backend.models import Event
        event = Event.from_dict({
            "id": "rotated", "type": "image", "content": "media/overlay.png",
            "coordinate": {"x": "10%", "y": "20%", "width": "40%", "height": "30%", "rotation": 27.5},
            "fit": "cover",
        })
        self.assertEqual(event.to_dict()["coordinate"]["rotation"], 27.5)
        self.assertEqual(event.to_dict()["fit"], "cover")
        self.assertEqual(event.coordinate.to_pixels(1000, 500), {"x": 100, "y": 100, "w": 400, "h": 150})

    def test_legacy_lightning_settings_migrate_to_a_layer(self):
        project = Project.from_dict({
            "name": "legacy",
            "lightning": {"enabled": True, "mode": "interval", "intervalSec": 2.5},
            "manual_lightning_timestamps": [1.25, {"t": 4.0, "tier": 3}, "invalid"],
        })
        data = project.to_dict()
        self.assertEqual(len(data["effect_layers"]), 1)
        layer = data["effect_layers"][0]
        self.assertEqual(layer["type"], "lightning")
        self.assertTrue(layer["enabled"])
        self.assertEqual([event["t"] for event in layer["events"]], [1.25, 4.0])
        self.assertNotIn("manual_lightning_timestamps", data)

    def test_legacy_automatic_lightning_without_enabled_flag_stays_active(self):
        project = Project.from_dict({"lightning": {"mode": "beat", "sensitivity": 1.5}})
        layer = project.to_dict()["effect_layers"][0]
        self.assertTrue(layer["enabled"])
        self.assertEqual(layer["settings"]["mode"], "beat")

    def test_disabled_legacy_lightning_stays_disabled(self):
        project = Project.from_dict({
            "lightning": {"enabled": False},
            "manual_lightning_timestamps": [{"t": 1.0, "tier": 2}],
        })
        self.assertFalse(project.to_dict()["effect_layers"][0]["enabled"])

    def test_legacy_lightning_is_appended_when_other_layers_exist(self):
        project = Project.from_dict({
            "effect_layers": [{"id": "fireworks-one", "type": "fireworks", "events": []}],
            "lightning": {"enabled": True, "mode": "interval"},
            "manual_lightning_timestamps": [2.0],
        })
        layers = project.to_dict()["effect_layers"]
        self.assertEqual([layer["type"] for layer in layers], ["fireworks", "lightning"])
        self.assertEqual(layers[1]["events"][0]["t"], 2.0)


class TermuxCompatibilityTests(unittest.TestCase):
    def test_termux_ffmpeg_resolver_prefers_system_ffmpeg(self):
        from backend.ffmpeg_utils import get_ffmpeg_exe

        with patch.dict(os.environ, {"PREFIX": "/data/data/com.termux/files/usr"}):
            with patch("backend.ffmpeg_utils.shutil.which", return_value="/termux/usr/bin/ffmpeg"):
                self.assertEqual(get_ffmpeg_exe(), "/termux/usr/bin/ffmpeg")

    def test_termux_requirements_avoid_source_build_only_dependencies(self):
        requirements = Path(__file__).resolve().parents[1] / "requirements-termux.txt"
        content = requirements.read_text(encoding="utf-8")
        install_lines = [line.split("#", 1)[0].strip().lower() for line in content.splitlines()]
        install_lines = [line for line in install_lines if line]
        self.assertIn("python-bidi==0.4.2", install_lines)
        self.assertFalse(any(line.startswith("moviepy") for line in install_lines))
        self.assertFalse(any(line.startswith("imageio-ffmpeg") for line in install_lines))


class EffectsApiTests(unittest.TestCase):
    def test_effect_catalog_is_served_by_flask(self):
        from app import app
        response = app.test_client().get("/api/effects")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({spec["id"] for spec in response.json["effects"]}, {"lightning", "fireworks"})


if __name__ == "__main__":
    unittest.main()
