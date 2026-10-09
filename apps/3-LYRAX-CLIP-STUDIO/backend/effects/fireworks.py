"""Fireworks effect plugin. Each instance is an independently ordered layer."""
from __future__ import annotations

import math

from backend.effects.audio import detect_beat_times
from backend.effects.utils import clamp, deterministic_random, normalize_seed, seed_for_time

PALETTES = {
    "festival": ["#FF3B30", "#FFD60A", "#30D158", "#64D2FF", "#BF5AF2", "#FF9F0A"],
    "warm": ["#FF3B30", "#FF9F0A", "#FFD60A", "#FF6B35", "#FFE8A3"],
    "cool": ["#64D2FF", "#5E5CE6", "#BF5AF2", "#A7F3FF", "#FFFFFF"],
}

EFFECT_SPEC = {
    "id": "fireworks",
    "name": "آتش‌بازی",
    "icon": "🎆",
    "description": "موشک و انفجارهای چندرنگ با ذرات قطعی و قابل‌تکرار.",
    "order": 10,  # جای رعدوبرق: افکت پیش‌فرض/اول فهرست
    "event_duration": 2.5,
    "defaults": {
        "mode": "manual",
        "sensitivity": 1.35,
        "intervalSec": 5.0,
        "intensity": 85,
        "particles": 36,
        "duration": 1.25,
        "palette": "festival",
    },
    "controls": [
        {"key": "mode", "label": "روش تریگر", "type": "select", "options": [
            {"value": "beat", "label": "تشخیص ضرب آهنگ"},
            {"value": "interval", "label": "فاصله‌ی زمانی ثابت"},
            {"value": "manual", "label": "فقط دستی"},
        ]},
        {"key": "sensitivity", "label": "حساسیت ضرب", "type": "range", "min": 1.05, "max": 2.5, "step": 0.05, "suffix": "×"},
        {"key": "intervalSec", "label": "فاصله‌ی آتش‌بازی", "type": "range", "min": 1, "max": 20, "step": 0.5, "suffix": " ثانیه"},
        {"key": "intensity", "label": "شدت نور", "type": "range", "min": 20, "max": 100, "step": 5, "suffix": "%"},
        {"key": "particles", "label": "تعداد ذرات هر انفجار", "type": "range", "min": 12, "max": 72, "step": 4},
        {"key": "duration", "label": "مدت محوشدن", "type": "range", "min": 0.5, "max": 2.5, "step": 0.1, "suffix": " ثانیه"},
        {"key": "palette", "label": "پالت رنگ", "type": "select", "options": [
            {"value": "festival", "label": "جشن رنگی"},
            {"value": "warm", "label": "گرم / طلایی"},
            {"value": "cool", "label": "سرد / یخی"},
        ]},
    ],
    "manual_triggers": [
        {"id": "single", "label": "🎆 آتش‌بازی", "payload": {"tier": 1}},
        {"id": "double", "label": "🎇 دو انفجار", "payload": {"tier": 2}},
        {"id": "finale", "label": "✨ فیناله", "payload": {"tier": 3}},
    ],
}


def _settings(layer):
    settings = dict(EFFECT_SPEC["defaults"])
    custom = layer.get("settings") if isinstance(layer.get("settings"), dict) else {}
    settings.update(custom)
    return settings


def build_events(layer, context):
    settings = _settings(layer)
    mode = str(settings.get("mode", "manual"))
    duration = max(0.0, float(context.get("duration", 0.0) or 0.0))
    try:
        layer_start = max(0.0, float(layer.get("start_time", 0.0) or 0.0))
    except (TypeError, ValueError):
        layer_start = 0.0
    end_value = layer.get("end_time")
    try:
        layer_end = min(duration, float(end_value)) if end_value not in (None, "") else duration
    except (TypeError, ValueError):
        layer_end = duration
    if layer_end < layer_start:
        return []

    generated = []
    if mode == "interval":
        interval = max(1.0, float(settings.get("intervalSec", 5.0) or 5.0))
        t = layer_start
        while t <= layer_end + 1e-9:
            generated.append({"t": round(t, 3), "tier": 1, "source": "interval"})
            t += interval
    elif mode == "beat":
        detector = context.get("detect_beats")
        if callable(detector):
            beats = detector(sensitivity=float(settings.get("sensitivity", 1.35) or 1.35))
        else:
            audio_path = context.get("audio_file_path")
            beats = detect_beat_times(audio_path, sensitivity=float(settings.get("sensitivity", 1.35) or 1.35)) if audio_path else []
        generated.extend({"t": event["t"], "tier": event.get("tier", 1), "source": "beat"} for event in beats)

    manual = layer.get("events", [])
    if isinstance(manual, list):
        for event in manual:
            if isinstance(event, (float, int)):
                event = {"t": event}
            if not isinstance(event, dict):
                continue
            try:
                tier = int(event.get("tier", 1) or 1)
                event_time = float(event.get("t", event.get("time", 0.0)))
            except (TypeError, ValueError):
                continue
            generated.append({**event, "t": round(event_time, 3), "tier": tier if tier in (1, 2, 3) else 1, "source": "manual"})

    unique = {}
    for event in generated:
        try:
            t = round(float(event.get("t", 0.0)), 3)
            tier = int(event.get("tier", 1) or 1)
        except (TypeError, ValueError):
            continue
        if layer_start <= t <= layer_end and 0 <= t <= duration:
            key = (t, event.get("source", "auto"))
            current = unique.get(key)
            normalized = {**event, "t": t, "tier": tier if tier in (1, 2, 3) else 1,
                          "seed": normalize_seed(event.get("seed"), seed_for_time(t, tier))}
            if current is None or normalized["tier"] > current["tier"]:
                unique[key] = normalized
    return sorted(unique.values(), key=lambda event: (event["t"], event["tier"]))


def _burst_centers(seed, width, height, burst_index=0):
    x = width * (0.18 + deterministic_random(seed, 1 + burst_index, 0.0, 0.64))
    y = height * (0.15 + deterministic_random(seed, 7 + burst_index, 0.0, 0.38))
    return round(x), round(y)


def render_ass(renderer, layer, events, width, height, ass_layer=2):
    settings = _settings(layer)
    intensity = clamp(settings.get("intensity", 85), 0, 100)
    alpha = round((1.0 - intensity / 100.0) * 255)
    base_particles = max(8, min(96, int(settings.get("particles", 36) or 36)))
    base_duration = clamp(settings.get("duration", 1.25), 0.5, 2.5)
    palette = PALETTES.get(str(settings.get("palette", "festival")), PALETTES["festival"])
    lines = []

    for event_index, event in enumerate(events):
        event_time = max(0.0, float(event.get("t", 0.0)))
        tier = int(event.get("tier", 1) or 1)
        seed = int(event.get("seed", seed_for_time(event_time, event_index)))
        burst_count = 3 if tier >= 3 else 2 if tier == 2 else 1
        particles = min(96, base_particles + (tier - 1) * 12)
        burst_spacing = 0.16 if burst_count > 1 else 0.0
        try:
            requested_end = event.get("end_time")
            event_duration_override = max(0.05, float(requested_end) - event_time) if requested_end not in (None, "") else None
        except (TypeError, ValueError):
            event_duration_override = None
        override_burst_duration = max(0.05, event_duration_override - burst_spacing * (burst_count - 1)) if event_duration_override else None

        for burst_index in range(burst_count):
            burst_time = event_time + burst_index * burst_spacing
            cx, cy = _burst_centers(seed, width, height, burst_index)
            burst_seed = seed + burst_index * 7919
            duration = (override_burst_duration if override_burst_duration is not None else base_duration) * (1.0 - 0.08 * burst_index)
            start = renderer._format_ass_time(max(0.0, burst_time - 0.42))
            burst = renderer._format_ass_time(burst_time)
            end = renderer._format_ass_time(burst_time + duration)
            fade_ms = int(duration * 1000)

            # Rocket streak from the lower edge to the deterministic explosion center.
            launch_x = round(cx + deterministic_random(burst_seed, 50, -width * 0.16, width * 0.16))
            launch_y = height + 24
            launch_path = "m -3 0 l 3 -22 l 3 22 l 0 0"
            launch_color = renderer._hex_to_ass_color("#FFFFFF", alpha=alpha)
            launch_tags = (
                f"{{\\an7\\move({launch_x},{launch_y},{cx},{cy},0,420)"
                f"\\1c{launch_color}\\3c{launch_color}\\bord4\\blur2\\shad0\\fad(0,120)\\p1}}"
            )
            lines.append(f"Dialogue: {int(ass_layer)},{start},{burst},Watermark,,0,0,0,,{launch_tags}{launch_path}{{\\p0}}")

            for particle_index in range(particles):
                jitter = deterministic_random(burst_seed, particle_index, -0.45, 0.45)
                angle = (2.0 * math.pi * particle_index / particles) + jitter
                speed = deterministic_random(burst_seed, 100 + particle_index, height * 0.035, height * (0.12 + 0.015 * tier))
                dx = round(math.cos(angle) * speed)
                dy = round(math.sin(angle) * speed)
                color = palette[(particle_index + burst_index + (burst_seed % len(palette))) % len(palette)]
                ass_color = renderer._hex_to_ass_color(color, alpha=alpha)
                glow = renderer._hex_to_ass_color(color, alpha=min(255, alpha + 25))
                tail_x = round(-dx * 0.08)
                tail_y = round(-dy * 0.08)
                # A small tapered trail, translated outward by ASS \\move.
                trail = f"m {tail_x} {tail_y} l 0 0 l 3 1 l {tail_x} {tail_y}"
                tags = (
                    f"{{\\an7\\move({cx},{cy},{cx + dx},{cy + dy},0,{fade_ms})"
                    f"\\1c{ass_color}\\3c{glow}\\bord{1 + tier}\\blur1\\shad0\\fad(0,{fade_ms})\\p1}}"
                )
                lines.append(f"Dialogue: {int(ass_layer)},{burst},{end},Watermark,,0,0,0,,{tags}{trail}{{\\p0}}")

            # A few slower sparkles make the burst legible on small/mobile previews.
            for sparkle_index in range(max(4, particles // 8)):
                angle = deterministic_random(burst_seed, 500 + sparkle_index, 0.0, 2.0 * math.pi)
                radius = deterministic_random(burst_seed, 700 + sparkle_index, height * 0.035, height * 0.12)
                sx, sy = round(cx + math.cos(angle) * radius), round(cy + math.sin(angle) * radius)
                size = 5 + tier * 2
                color = renderer._hex_to_ass_color(palette[(sparkle_index + burst_index) % len(palette)], alpha=alpha)
                sparkle_path = f"m 0 {-size} l {size // 3} {-size // 3} l {size} 0 l {size // 3} {size // 3} l 0 {size} l {-size // 3} {size // 3} l {-size} 0 l {-size // 3} {-size // 3}"
                sparkle_tags = f"{{\\an7\\move({sx},{sy},{sx},{sy - round(height * 0.025)},0,{fade_ms})\\1c{color}\\bord0\\blur2\\fad(0,{fade_ms})\\p1}}"
                lines.append(f"Dialogue: {int(ass_layer)},{burst},{end},Watermark,,0,0,0,,{sparkle_tags}{sparkle_path}{{\\p0}}")

    return lines
