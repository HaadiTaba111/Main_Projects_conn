# LyraX effect-layer plugins

LyraX discovers effect plugins from `backend/effects/` at runtime. Each configured effect is a separate, ordered project layer with its own `id`, `type`, `enabled` flag, time range, settings, and manual events. The FFmpeg compositor assigns each layer its own ASS track; the browser manager gives each layer an independent preview canvas.

## Add a plugin without changing the renderer or layer manager

1. Add `backend/effects/<effect_id>.py` (the `effect_id` must match the filename).
2. Export an `EFFECT_SPEC` JSON-safe manifest containing at least `id`, `name`, `defaults`, `controls`, and optional `manual_triggers` / `event_duration`.
3. Implement:
   - `build_events(layer, context) -> list[dict]`
   - `render_ass(renderer, layer, events, width, height, ass_layer=2) -> list[str]`
4. Add `static/js/effects/<effect_id>.js` with `renderPreview(ctx, layer, timeSeconds, state, runtime)`. Optional hooks are `updateLayer(layer, timeSeconds, runtime, state)` and `createManualEvent({ layer, time, triggerId, runtime })`.

The registry validates backend hooks and exposes manifests through `GET /api/effects`. The browser manager imports the `preview_module` path from that manifest and creates controls, reorder/delete actions, manual triggers, and preview layers from the schema. Keep `EFFECT_SPEC` values JSON serializable; browser control types currently include `range`, `number`, `text`, `color`, `checkbox`, and `select`.

## Project layer format

```json
{
  "id": "fx-lightning-abc123",
  "type": "lightning",
  "name": "رعدوبرق",
  "enabled": true,
  "order": 0,
  "start_time": 0.0,
  "end_time": null,
  "settings": { "mode": "beat", "sensitivity": 1.35 },
  "events": [{ "t": 4.25, "tier": 3, "source": "manual" }]
}
```

A manual event may include an absolute `end_time` in addition to `t`; when present, its displayed row duration and the project duration use that override. Plugins that expose editable trigger ends should consume it in both `renderPreview()` and `render_ass()` (without central-renderer changes). `event_duration` supplies the grid's default end when an event has no override.

Old root-level `lightning` and `manual_lightning_timestamps` project fields are migrated to a `lightning` effect layer when loaded. New exports store `effect_layers` only.

## Current plugins

`fireworks` (`order: 10`) holds the slot `lightning` (`order: 20`) used to occupy, so the studio selector, quick-trigger bar under the preview and the `GET /api/effects` catalog all lead with it. Both stay fully available — only their order changed.

- `fireworks`: beat/interval/manual triggers, single/double/finale bursts, configurable particle count, duration, intensity, and palettes. The preview includes the pre-burst rocket for known/manual/interval events and uses the same seeded burst positions as export. Quick triggers (`🎆 یک انفجار` / `🎇 دو انفجار` / `✨ فیناله`) sit right under the clip preview so the video stays visible while you fire them.
- `lightning`: beat/interval/manual triggers, three strength tiers, bass/mid/treble color and shape styles from `docs_lightning.md` (bass/mid/treble branch probabilities: 0.35/0.2/0.6). Browser preview and ASS rendering share deterministic event seeds and branch geometry.
