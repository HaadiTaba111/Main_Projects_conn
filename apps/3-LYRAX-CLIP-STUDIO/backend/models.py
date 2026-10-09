import json
import os
import copy
import math

class Coordinate:
    def __init__(self, x=0, y=0, width="100%", height="100%", rotation=0):
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        try:
            self.rotation = float(rotation or 0)
        except (TypeError, ValueError):
            self.rotation = 0.0

    @staticmethod
    def _parse_val(val, total):
        if isinstance(val, str) and val.strip().endswith('%'):
            try:
                pct = float(val.strip()[:-1])
                return int((pct / 100.0) * total)
            except ValueError:
                return 0
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return 0

    def to_pixels(self, canvas_w, canvas_h):
        return {
            "x": self._parse_val(self.x, canvas_w),
            "y": self._parse_val(self.y, canvas_h),
            "w": self._parse_val(self.width, canvas_w),
            "h": self._parse_val(self.height, canvas_h)
        }

    def to_dict(self):
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "rotation": self.rotation
        }


class Event:
    def __init__(self, event_id, name, event_type, start_time=0.0, end_time=0.0, content="", coordinate=None, style=None, fit="contain"):
        self.id = event_id
        self.name = name
        self.type = event_type  # 'audio', 'video', 'image', 'lyrics', 'text'
        self.start_time = float(start_time)
        self.end_time = float(end_time)
        self.content = content  # filename or text string
        self.coordinate = coordinate if coordinate else Coordinate()
        self.fit = str(fit or "contain").lower()
        self.style = style if style else {
            "font_size": 52,
            "color": "#FFF000",       # Lemon yellow
            "stroke_color": "#000000",# Black outline
            "stroke_width": 4
        }

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "content": self.content,
            "coordinate": self.coordinate.to_dict(),
            "style": self.style,
            "fit": self.fit
        }

    @classmethod
    def from_dict(cls, d):
        coord_d = d.get("coordinate", {})
        coord = Coordinate(
            x=coord_d.get("x", 0),
            y=coord_d.get("y", 0),
            width=coord_d.get("width", "100%"),
            height=coord_d.get("height", "100%"),
            rotation=coord_d.get("rotation", coord_d.get("rotation_degrees", 0))
        )
        return cls(
            event_id=d.get("id", ""),
            name=d.get("name", ""),
            event_type=d.get("type", "text"),
            start_time=d.get("start_time", 0.0),
            end_time=d.get("end_time", 0.0),
            content=d.get("content", ""),
            coordinate=coord,
            style=d.get("style", None),
            fit=d.get("fit", "contain")
        )


class Project:
    OPTIONAL_FIELDS = ("subtitle_defaults", "audio_eq", "watermark", "render_end_time")

    def __init__(self, name="default_project", resolution=None, fps=30, background="#000000"):
        self.name = name
        self.resolution = resolution if resolution else [1080, 1920] # Vertical 9:16
        self.fps = int(fps)
        self.background = background
        self.events = []
        self.effect_layers = []
        self.duration = 0.0
        self._duration_floor = 0.0

    def add_event(self, event: Event):
        self.events.append(event)
        if event.end_time > self.duration:
            self.duration = event.end_time

    def calculate_duration(self):
        max_t = max(0.0, float(getattr(self, "_duration_floor", 0.0) or 0.0))
        for event in self.events:
            if event.end_time > max_t:
                max_t = event.end_time

        try:
            from backend.effects.registry import get_effect_plugins
            plugins = get_effect_plugins()
        except Exception:
            plugins = {}
        for layer in self.effect_layers:
            if not isinstance(layer, dict):
                continue
            try:
                layer_end = layer.get("end_time")
                if layer_end not in (None, ""):
                    max_t = max(max_t, float(layer_end))
            except (TypeError, ValueError):
                pass
            plugin = plugins.get(str(layer.get("type", "")))
            try:
                event_duration = max(0.0, float(getattr(plugin, "EFFECT_SPEC", {}).get("event_duration", 0.0)))
            except (TypeError, ValueError, AttributeError):
                event_duration = 0.0
            layer_events = layer.get("events", [])
            if isinstance(layer_events, list):
                for item in layer_events:
                    try:
                        event_time = float(item if isinstance(item, (int, float)) else item.get("t", item.get("time", 0.0)))
                        event_end = item.get("end_time") if isinstance(item, dict) else None
                        if event_end not in (None, ""):
                            max_t = max(max_t, max(event_time, float(event_end)))
                        else:
                            max_t = max(max_t, event_time + event_duration)
                    except (TypeError, ValueError, AttributeError):
                        continue
        render_end_time = getattr(self, "render_end_time", None)
        try:
            hard_end = float(render_end_time) if render_end_time not in (None, "") else None
            if hard_end is not None and math.isfinite(hard_end) and hard_end > 0:
                max_t = min(max_t, hard_end)
        except (TypeError, ValueError):
            pass

        self.duration = max_t
        return self.duration

    def to_dict(self):
        data = {
            "name": self.name,
            "resolution": self.resolution,
            "fps": self.fps,
            "background": self.background,
            "duration": self.duration,
            "events": [e.to_dict() for e in self.events],
            # Each effect is an independently configured, ordered timeline layer.
            "effect_layers": copy.deepcopy(self.effect_layers),
        }
        for optional_key in self.OPTIONAL_FIELDS:
            if hasattr(self, optional_key):
                data[optional_key] = copy.deepcopy(getattr(self, optional_key))
        return data

    @classmethod
    def from_dict(cls, d):
        d = d if isinstance(d, dict) else {}
        proj = cls(
            name=d.get("name", "default_project"),
            resolution=d.get("resolution", [1080, 1920]),
            fps=d.get("fps", 30),
            background=d.get("background", "#000000")
        )
        try:
            proj._duration_floor = max(0.0, float(d.get("duration", 0.0) or 0.0))
        except (TypeError, ValueError):
            proj._duration_floor = 0.0
        source_events = d.get("events", [])
        if not isinstance(source_events, list):
            source_events = []
        for e_dict in source_events:
            if isinstance(e_dict, dict):
                proj.add_event(Event.from_dict(e_dict))

        for optional_key in cls.OPTIONAL_FIELDS:
            if optional_key in d:
                setattr(proj, optional_key, copy.deepcopy(d[optional_key]))

        # New projects use effect_layers. Migrate the old lightning fields once,
        # so older JSON projects continue to preview and render without a branch
        # in the central renderer for each legacy effect.
        layers = d.get("effect_layers")
        proj.effect_layers = copy.deepcopy(layers) if isinstance(layers, list) else []
        has_legacy_lightning = "lightning" in d or "manual_lightning_timestamps" in d
        has_lightning_layer = any(
            isinstance(layer, dict) and (layer.get("type") or layer.get("effect_type")) == "lightning"
            for layer in proj.effect_layers
        )
        if has_legacy_lightning and not has_lightning_layer:
            old_settings = d.get("lightning") if isinstance(d.get("lightning"), dict) else {}
            old_events = d.get("manual_lightning_timestamps", [])
            if not isinstance(old_events, list):
                old_events = []
            normalized_events = []
            for item in old_events:
                if isinstance(item, dict):
                    normalized_events.append(copy.deepcopy(item))
                else:
                    try:
                        normalized_events.append({"t": float(item), "tier": 1})
                    except (TypeError, ValueError):
                        continue
            legacy_enabled = old_settings.get("enabled", bool(old_settings) or bool(normalized_events))
            if isinstance(legacy_enabled, str):
                legacy_enabled = legacy_enabled.strip().lower() not in {"", "0", "false", "no", "off"}
            proj.effect_layers.append({
                "id": "legacy-lightning",
                "type": "lightning",
                "name": "رعدوبرق",
                # Older projects commonly omitted `enabled` while storing only
                # automatic-trigger settings; preserve that configured effect.
                "enabled": bool(legacy_enabled),
                "order": len(proj.effect_layers),
                "start_time": 0.0,
                "end_time": None,
                "settings": copy.deepcopy(old_settings),
                "events": normalized_events,
            })
        try:
            proj._duration_floor = max(0.0, float(d.get("duration", 0.0) or 0.0))
        except (TypeError, ValueError):
            proj._duration_floor = 0.0
        proj.calculate_duration()
        return proj
