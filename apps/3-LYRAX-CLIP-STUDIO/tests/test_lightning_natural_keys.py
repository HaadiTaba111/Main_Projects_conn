"""تست رعد طبیعی (tier 4) و نگاشت پنج کلید: ۱-۳ رعد، ۴ رعد طبیعی، ۵ آتش‌بازی.

اجرا:  python3 -m unittest tests.test_lightning_natural_keys
"""
import unittest

from backend.effects import fireworks, lightning, registry
from tests.test_effect_plugins import FakeRenderer


class HotkeyContractTests(unittest.TestCase):
    def _hotkeys(self):
        mapping = {}
        for module in (lightning, fireworks):
            for trigger in module.EFFECT_SPEC["manual_triggers"]:
                if "hotkey" in trigger:
                    mapping[trigger["hotkey"]] = (module.EFFECT_SPEC["id"], trigger["id"])
        return mapping

    def test_exactly_five_keys_are_bound(self):
        self.assertEqual(sorted(self._hotkeys()), ["1", "2", "3", "4", "5"])

    def test_keys_map_to_expected_effects(self):
        mapping = self._hotkeys()
        self.assertEqual(mapping["1"], ("lightning", "tier-1"))
        self.assertEqual(mapping["3"], ("lightning", "tier-3"))
        self.assertEqual(mapping["4"], ("lightning", "tier-4"))
        self.assertEqual(mapping["5"], ("fireworks", "single"))

    def test_manifest_served_to_browser_keeps_hotkeys(self):
        by_id = {spec["id"]: spec for spec in registry.get_effect_specs()}
        hotkeys = {t["hotkey"] for spec in by_id.values() for t in spec.get("manual_triggers", []) if "hotkey" in t}
        self.assertEqual(hotkeys, {"1", "2", "3", "4", "5"})


class NaturalLightningTests(unittest.TestCase):
    ARGS = (154, 22, "left", 12345, 1080, 1920, 5.0, 10, 20.0, True)

    def test_tier_four_exists_and_is_accepted_by_build_events(self):
        self.assertIn(4, lightning.LIGHTNING_TIERS)
        layer = {"type": "lightning", "settings": {"mode": "manual"}, "events": [{"t": 1.0, "tier": 4}]}
        events = lightning.build_events(layer, {"duration": 5.0})
        self.assertEqual(events[0]["tier"], 4)

    def test_natural_path_is_deterministic_and_branches(self):
        first = lightning._build_bolt_path(*self.ARGS, "natural", 0.4, natural_branches=4, natural_spread=1.0)
        second = lightning._build_bolt_path(*self.ARGS, "natural", 0.4, natural_branches=4, natural_spread=1.0)
        self.assertEqual(first, second)
        self.assertGreaterEqual(first.count("m "), 2, "natural storm should include branch ribbons")

    def test_branch_and_spread_parameters_change_the_bolt(self):
        few = lightning._build_bolt_path(*self.ARGS, "natural", 0.4, natural_branches=1, natural_spread=0.5)
        many = lightning._build_bolt_path(*self.ARGS, "natural", 0.4, natural_branches=6, natural_spread=2.0)
        self.assertNotEqual(few, many)

    def test_render_ass_emits_natural_bolt_layers(self):
        layer = {"id": "storm", "type": "lightning", "settings": {"mode": "manual", "naturalBranches": 3}}
        events = [{"t": 1.0, "tier": 4, "freq_band": "mid", "seed": 4242, "energy_factor": 1.0}]
        lines = lightning.render_ass(FakeRenderer(), layer, events, 1920, 1080, ass_layer=2)
        # tier 4 draws glow, middle, core passes plus the thin white core (tier >= 2)
        self.assertEqual(len(lines), 4)
        self.assertTrue(all("\\p1" in line for line in lines))

    def test_natural_polyline_trunk_stays_inside_frame_margins(self):
        polylines = lightning.natural_bolt_polylines(154, 22, "left", 99, 1080, 1920, 5.0, 4, 1.0)
        for points, _width in polylines:
            for x, _y in points:
                self.assertGreaterEqual(x, round(1920 * 0.08) - 1e-6)
                self.assertLessEqual(x, round(1920 * 0.92) + 1e-6)


if __name__ == "__main__":
    unittest.main()
