"""Lightning effect plugin: beat, interval and hand-timed lightning layers."""
from __future__ import annotations

from backend.effects.audio import detect_beat_times
from backend.effects.utils import clamp, deterministic_random, normalize_seed, seed_for_time

LIGHTNING_TIERS = {
    1: {"thickness": 4.0, "segments": 6, "wig": 12.0, "duration": 0.35, "branch": False},
    2: {"thickness": 7.0, "segments": 8, "wig": 16.0, "duration": 0.42, "branch": False},
    3: {"thickness": 11.0, "segments": 11, "wig": 22.0, "duration": 0.55, "branch": True},
}

LIGHTNING_STYLES = {
    "bass": {"style": "realistic", "color": "#FF4500", "glow_color": "#FF6347", "thickness_mult": 1.4, "duration_mult": 1.3, "branch_prob": 0.35},
    "mid": {"style": "zigzag", "color": "#FFF700", "glow_color": "#FFFF66", "thickness_mult": 1.0, "duration_mult": 1.0, "branch_prob": 0.2},
    "treble": {"style": "forked", "color": "#00BFFF", "glow_color": "#87CEEB", "thickness_mult": 0.6, "duration_mult": 0.7, "branch_prob": 0.6},
}

EFFECT_SPEC = {
    "id": "lightning",
    "name": "رعدوبرق",
    "icon": "⚡",
    "description": "رعد سه‌سطحی و واکنش‌گرا به انرژی و باند فرکانسی آهنگ.",
    "order": 20,
    "event_duration": 0.75,
    "defaults": {
        "mode": "beat",
        "sensitivity": 1.35,
        "minGapSec": 0.22,
        "intervalSec": 4.0,
        "colorMode": "frequency",
        "color": "#FFF700",
        "intensity": 80,
    },
    "controls": [
        {"key": "mode", "label": "روش تریگر", "type": "select", "options": [
            {"value": "beat", "label": "تشخیص ضرب آهنگ"},
            {"value": "interval", "label": "فاصله‌ی زمانی ثابت"},
            {"value": "manual", "label": "فقط دستی"},
        ]},
        {"key": "sensitivity", "label": "حساسیت ضرب", "type": "range", "min": 1.05, "max": 2.5, "step": 0.05, "suffix": "×"},
        {"key": "minGapSec", "label": "حداقل فاصله‌ی ضرب‌ها", "type": "range", "min": 0.1, "max": 1, "step": 0.05, "suffix": " ثانیه"},
        {"key": "intervalSec", "label": "فاصله‌ی رعدها", "type": "range", "min": 0.5, "max": 15, "step": 0.5, "suffix": " ثانیه"},
        {"key": "colorMode", "label": "رنگ", "type": "select", "options": [
            {"value": "frequency", "label": "واکنش‌گرا به فرکانس"},
            {"value": "custom", "label": "رنگ دلخواه"},
        ]},
        {"key": "color", "label": "رنگ دلخواه", "type": "color"},
        {"key": "intensity", "label": "شدت نور", "type": "range", "min": 20, "max": 100, "step": 5, "suffix": "%"},
    ],
    "manual_triggers": [
        {"id": "tier-1", "label": "⚡ معمولی", "payload": {"tier": 1}},
        {"id": "tier-2", "label": "⚡ کلفت‌تر", "payload": {"tier": 2}},
        {"id": "tier-3", "label": "🌩️ قوی و شاخه‌دار", "payload": {"tier": 3}},
    ],
}


def _settings(layer):
    settings = dict(EFFECT_SPEC["defaults"])
    custom = layer.get("settings") if isinstance(layer.get("settings"), dict) else {}
    settings.update(custom)
    return settings


def build_events(layer, context):
    """Return normalized lightning events for one independent effect layer."""
    settings = _settings(layer)
    mode = str(settings.get("mode", "beat"))
    duration = max(0.0, float(context.get("duration", 0.0) or 0.0))
    try:
        layer_start = max(0.0, float(layer.get("start_time", 0.0) or 0.0))
    except (TypeError, ValueError):
        layer_start = 0.0
    layer_end_raw = layer.get("end_time")
    try:
        layer_end = min(duration, float(layer_end_raw)) if layer_end_raw not in (None, "") else duration
    except (TypeError, ValueError):
        layer_end = duration
    if layer_end < layer_start:
        return []

    generated = []
    if mode == "interval":
        interval = max(0.5, float(settings.get("intervalSec", 4.0) or 4.0))
        t = layer_start
        while t <= layer_end + 1e-9:
            generated.append({"t": round(t, 3), "tier": 1, "energy_factor": 1.0, "freq_band": "mid", "source": "interval"})
            t += interval
    elif mode == "beat":
        detector = context.get("detect_beats")
        if callable(detector):
            generated = detector(
                sensitivity=float(settings.get("sensitivity", 1.35) or 1.35),
                min_gap_sec=float(settings.get("minGapSec", 0.22) or 0.22),
            )
        else:
            audio_path = context.get("audio_file_path")
            generated = detect_beat_times(
                audio_path,
                sensitivity=float(settings.get("sensitivity", 1.35) or 1.35),
                min_gap_sec=float(settings.get("minGapSec", 0.22) or 0.22),
            ) if audio_path else []

    for item in layer.get("events", []) if isinstance(layer.get("events"), list) else []:
        if not isinstance(item, dict):
            try:
                item = {"t": float(item), "tier": 1}
            except (TypeError, ValueError):
                continue
        try:
            tier = int(item.get("tier", 1) or 1)
            t = float(item.get("t", item.get("time", 0.0)))
        except (TypeError, ValueError):
            continue
        generated.append({
            **item,
            "t": round(t, 3),
            "tier": tier if tier in LIGHTNING_TIERS else 1,
            "energy_factor": clamp(item.get("energy_factor", 1.0) or 1.0, 0.7, 1.8),
            "freq_band": item.get("freq_band", "mid"),
            "source": "manual",
        })

    filtered = []
    for event in generated:
        try:
            t = float(event.get("t", 0.0))
        except (TypeError, ValueError):
            continue
        if layer_start <= t <= layer_end and 0 <= t <= duration:
            normalized = dict(event)
            normalized["t"] = round(t, 3)
            try:
                tier = int(normalized.get("tier", 1) or 1)
            except (TypeError, ValueError):
                tier = 1
            normalized["tier"] = tier if tier in LIGHTNING_TIERS else 1
            normalized["energy_factor"] = clamp(normalized.get("energy_factor", 1.0) or 1.0, 0.7, 1.8)
            if normalized.get("freq_band") not in LIGHTNING_STYLES:
                normalized["freq_band"] = "mid"
            normalized["seed"] = normalize_seed(
                normalized.get("seed"), seed_for_time(normalized["t"], normalized["tier"])
            )
            filtered.append(normalized)

    # Keep separate frequency-band events at the same time. Exact duplicates from
    # legacy/manual markers are collapsed without erasing the strongest tier.
    merged = {}
    for event in filtered:
        key = (event["t"], event.get("freq_band", "mid"), event.get("source", "auto"))
        previous = merged.get(key)
        if previous is None or event["tier"] > previous["tier"]:
            merged[key] = event
    return sorted(merged.values(), key=lambda event: (event["t"], event.get("freq_band", "mid")))


def _midpoint_displacement(p1, p2, displacement, roughness, seed, depth, clamp_min, clamp_max):
    if depth <= 0:
        return [p1]
    mid_x = (p1[0] + p2[0]) / 2.0
    mid_y = (p1[1] + p2[1]) / 2.0
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = max(0.001, (dx * dx + dy * dy) ** 0.5)
    nx, ny = -dy / length, dx / length
    offset = deterministic_random(seed, depth, -displacement, displacement)
    mid_x = max(clamp_min, min(clamp_max, mid_x + nx * offset))
    mid_y += ny * offset
    left = _midpoint_displacement(p1, (mid_x, mid_y), displacement * roughness, roughness, seed + 1, depth - 1, clamp_min, clamp_max)
    right = _midpoint_displacement((mid_x, mid_y), p2, displacement * roughness, roughness, seed + 2, depth - 1, clamp_min, clamp_max)
    return (left[:-1] if left else []) + right


def _build_bolt_path(start_x, start_y, side, seed, res_h, res_w, thickness, segments, wig_scale, branch, style, branch_prob=0.0):
    dir_sign = 1 if side == "left" else -1
    total_len = res_h * 0.28
    clamp_min, clamp_max = round(res_w * 0.08), round(res_w * 0.92)
    end_x = max(clamp_min, min(clamp_max, start_x + dir_sign * total_len * 0.35))
    end_y = start_y + total_len

    if style == "realistic":
        points = _midpoint_displacement(
            (start_x, start_y), (end_x, end_y), wig_scale * 1.5, 0.55,
            seed * 1000 + 7, segments // 2 + 2, clamp_min, clamp_max,
        )
        points.append((end_x, end_y))
    elif style == "forked":
        mid_y = start_y + total_len * 0.5
        mid_x = max(clamp_min, min(clamp_max, start_x + dir_sign * total_len * 0.17))
        points = [(start_x, start_y), (mid_x, mid_y), (end_x, end_y)]
    else:
        step_len = total_len / max(1, segments)
        points = [(start_x, start_y)]
        x, y = start_x, start_y
        for i in range(segments):
            wig = (((seed + 2) * (i + 3)) % 7 - 3) * wig_scale
            x = max(clamp_min, min(clamp_max, x + dir_sign * (step_len * 0.35) + wig))
            y += step_len
            points.append((x, y))

    def build_ribbon(pts, ribbon_thickness):
        if len(pts) < 2:
            return ""
        half = ribbon_thickness / 2.0
        left_side, right_side = [], []
        for index, (px, py) in enumerate(pts):
            if index == 0:
                dx, dy = pts[1][0] - px, pts[1][1] - py
            elif index == len(pts) - 1:
                dx, dy = px - pts[index - 1][0], py - pts[index - 1][1]
            else:
                dx, dy = pts[index + 1][0] - pts[index - 1][0], pts[index + 1][1] - pts[index - 1][1]
            length = max(0.001, (dx * dx + dy * dy) ** 0.5)
            nx, ny = -dy / length, dx / length
            left_side.append((px + nx * half, py + ny * half))
            right_side.append((px - nx * half, py - ny * half))
        polygon = left_side + list(reversed(right_side))
        commands = [f"m {round(polygon[0][0])} {round(polygon[0][1])}"]
        commands.extend(f"l {round(x)} {round(y)}" for x, y in polygon[1:])
        return " ".join(commands)

    path = build_ribbon(points, thickness)
    branch_prob = clamp(branch_prob, 0.0, 1.0)
    branch_roll = deterministic_random(seed, 99)
    if style == "forked":
        # Treble bolts keep at least one fork; the note-defined 2–4 branches
        # appear with the configured probability for a less repetitive look.
        branch_count = 2 + (seed % 3) if branch_roll < branch_prob else 1
        for branch_index in range(branch_count):
            branch_seed = seed * 100 + branch_index
            branch_start_y = start_y + total_len * (0.3 + branch_index * 0.2)
            branch_start_x = max(
                clamp_min,
                min(clamp_max, start_x + dir_sign * total_len * (0.1 + branch_index * 0.05)),
            )
            branch_end_x = max(
                clamp_min,
                min(clamp_max, branch_start_x + deterministic_random(
                    branch_seed, 1, -total_len * 0.3, total_len * 0.3
                )),
            )
            branch_end_y = branch_start_y + total_len * 0.3
            branch_points = _midpoint_displacement(
                (branch_start_x, branch_start_y), (branch_end_x, branch_end_y),
                wig_scale * 0.8, 0.5, branch_seed * 1000 + 3, 3, clamp_min, clamp_max,
            )
            branch_points.append((branch_end_x, branch_end_y))
            path += " " + build_ribbon(branch_points, max(2.0, thickness * 0.5))
    elif branch or branch_roll < branch_prob:
        mid_index = max(1, min(len(points) - 1, len(points) // 2))
        bx, by = points[mid_index]
        branch_end_x = max(
            clamp_min,
            min(clamp_max, bx + deterministic_random(seed, 40, -total_len * 0.25, total_len * 0.25)),
        )
        branch_end_y = by + total_len * 0.35
        branch_points = _midpoint_displacement(
            (bx, by), (branch_end_x, branch_end_y), wig_scale * 0.7, 0.5,
            seed * 1000 + 13, 3, clamp_min, clamp_max,
        )
        branch_points.append((branch_end_x, branch_end_y))
        path += " " + build_ribbon(branch_points, max(2.0, thickness * 0.45))
    return path


def render_ass(renderer, layer, events, width, height, ass_layer=2):
    settings = _settings(layer)
    intensity = clamp(settings.get("intensity", 80), 0, 100)
    # ASS alpha: 0 is opaque and 255 is transparent.
    base_alpha = round((1.0 - intensity / 100.0) * 255)
    lines = []
    for index, event in enumerate(events):
        t = float(event["t"])
        tier = int(event.get("tier", 1))
        tier_cfg = LIGHTNING_TIERS.get(tier, LIGHTNING_TIERS[1])
        band = event.get("freq_band", "mid")
        style_cfg = LIGHTNING_STYLES.get(band, LIGHTNING_STYLES["mid"])
        if settings.get("colorMode", "frequency") == "custom":
            color = str(settings.get("color", "#FFF700"))
            glow_color = color
        else:
            color = style_cfg["color"]
            glow_color = style_cfg["glow_color"]
        energy = clamp(event.get("energy_factor", 1.0) or 1.0, 0.7, 1.8)
        thickness = tier_cfg["thickness"] * style_cfg["thickness_mult"] * (0.75 + 0.25 * energy)
        default_flash_duration = tier_cfg["duration"] * style_cfg["duration_mult"]
        try:
            requested_end = event.get("end_time")
            flash_duration = max(0.001, float(requested_end) - t) if requested_end not in (None, "") else default_flash_duration
        except (TypeError, ValueError):
            flash_duration = default_flash_duration
        side = "left" if index % 2 == 0 else "right"
        margin = round(width * 0.08)
        start_x = margin if side == "left" else width - margin
        start_y = round(height * 0.02)
        seed = int(event.get("seed", seed_for_time(t, tier)))
        path = _build_bolt_path(
            start_x, start_y, side, seed, height, width,
            thickness, tier_cfg["segments"], tier_cfg["wig"], tier_cfg["branch"],
            style_cfg["style"], style_cfg["branch_prob"],
        )
        start_str = renderer._format_ass_time(t)
        end_str = renderer._format_ass_time(t + flash_duration)
        fade_ms = int(flash_duration * 1000)

        # Separate ASS drawing dialogues make the glow and bolt independently
        # composited within this effect layer.
        outer = renderer._hex_to_ass_color(glow_color, alpha=max(0, base_alpha - 180))
        middle = renderer._hex_to_ass_color(glow_color, alpha=max(0, base_alpha - 100))
        fill = renderer._hex_to_ass_color(color, alpha=base_alpha)
        core = renderer._hex_to_ass_color(glow_color, alpha=min(255, base_alpha + 60))
        layer_number = int(ass_layer)
        lines.append(f"Dialogue: {layer_number},{start_str},{end_str},Watermark,,0,0,0,,{{\\an7\\pos(0,0)\\1c{outer}\\3c{outer}\\bord{int(thickness * 2.5)}\\shad0\\fad(0,{fade_ms})\\blur12}}{{\\p1}}{path}{{\\p0}}")
        lines.append(f"Dialogue: {layer_number},{start_str},{end_str},Watermark,,0,0,0,,{{\\an7\\pos(0,0)\\1c{middle}\\3c{middle}\\bord{int(thickness * 1.5)}\\shad0\\fad(0,{fade_ms})\\blur5}}{{\\p1}}{path}{{\\p0}}")
        lines.append(f"Dialogue: {layer_number},{start_str},{end_str},Watermark,,0,0,0,,{{\\an7\\pos(0,0)\\1c{fill}\\3c{core}\\bord2\\shad0\\fad(0,{fade_ms})}}{{\\p1}}{path}{{\\p0}}")
        if tier >= 2:
            white = renderer._hex_to_ass_color("#FFFFFF", alpha=min(255, base_alpha + 30))
            thin_path = _build_bolt_path(
                start_x, start_y, side, seed, height, width,
                thickness * 0.35, tier_cfg["segments"], tier_cfg["wig"], False,
                style_cfg["style"], style_cfg["branch_prob"],
            )
            lines.append(f"Dialogue: {layer_number},{start_str},{end_str},Watermark,,0,0,0,,{{\\an7\\pos(0,0)\\1c{white}\\bord0\\shad0\\fad(0,{fade_ms})}}{{\\p1}}{thin_path}{{\\p0}}")
    return lines
