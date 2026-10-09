import { clamp, deterministicRandom, detectBeat, normalizeSeed, seedForTime } from './shared.js';

const PALETTES = {
    festival: ['#FF3B30', '#FFD60A', '#30D158', '#64D2FF', '#BF5AF2', '#FF9F0A'],
    warm: ['#FF3B30', '#FF9F0A', '#FFD60A', '#FF6B35', '#FFE8A3'],
    cool: ['#64D2FF', '#5E5CE6', '#BF5AF2', '#A7F3FF', '#FFFFFF']
};

export function updateLayer(layer, timeSeconds, runtime, state) {
    const settings = layer.settings || {};
    const now = Number(timeSeconds) || 0;
    const start = Math.max(0, Number(layer.start_time) || 0);
    const end = layer.end_time === null || layer.end_time === undefined
        ? Infinity : Math.max(start, Number(layer.end_time) || 0);
    state.transientEvents ||= [];
    if (!runtime?.playing || now < start || now > end) {
        state.lastUpdateTime = now;
        if (now > end) state.transientEvents = [];
        return;
    }

    const mode = settings.mode || 'manual';
    if (state.lastMode !== mode) {
        state.nextIntervalTime = undefined;
        state.lastMode = mode;
    }
    if (mode === 'interval') {
        const interval = Math.max(1, Number(settings.intervalSec) || 5);
        if (state.nextIntervalTime === undefined || now < (state.lastUpdateTime ?? -1)) {
            const elapsedInLayer = Math.max(0, now - start);
            state.nextIntervalTime = elapsedInLayer > interval ? now : start;
        }
        if (state.nextIntervalTime <= end && now + 0.42 + 1e-3 >= state.nextIntervalTime) {
            state.transientEvents.push({ t: Math.round(state.nextIntervalTime * 1000) / 1000, tier: 1, seed: seedForTime(state.nextIntervalTime, 1), source: 'interval' });
            state.nextIntervalTime += interval;
        }
    } else if (mode === 'beat') {
        const events = detectBeat(now, settings, runtime.audio, state, ['bass', 'mid', 'treble']);
        // The backend collapses simultaneous band hits to the strongest burst;
        // preserve all bands only for lightning's frequency-specific appearance.
        if (events.length) {
            const strongest = events.reduce((best, event) => event.tier > best.tier ? event : best, events[0]);
            state.transientEvents.push(strongest);
        }
    }
    state.transientEvents = state.transientEvents.filter(event => now - event.t < 3 && event.t - now <= 0.42);
    state.lastUpdateTime = now;
}

export function createManualEvent({ time, triggerId }) {
    const tierById = { single: 1, double: 2, finale: 3 };
    const tier = tierById[triggerId] || 1;
    return { t: Math.round(Number(time) * 1000) / 1000, tier, seed: seedForTime(time, tier), source: 'manual' };
}

function burstCenter(width, height, seed, index) {
    return {
        x: Math.round(width * (0.18 + deterministicRandom(seed, 1 + index, 0, 0.64))),
        y: Math.round(height * (0.15 + deterministicRandom(seed, 7 + index, 0, 0.38)))
    };
}

function drawBurst(ctx, center, timeSeconds, startTime, seed, tier, settings, width, height, burstIndex) {
    const eventDurationOverride = Number(settings.eventDurationOverride);
    const durationSetting = Number.isFinite(eventDurationOverride) && eventDurationOverride > 0
        ? Math.max(0.05, eventDurationOverride)
        : (Number.isFinite(Number(settings.duration)) ? Number(settings.duration) : 1.25);
    const duration = (Number.isFinite(eventDurationOverride) && eventDurationOverride > 0
        ? durationSetting : clamp(durationSetting, 0.5, 2.5)) * (1 - 0.08 * burstIndex);
    const elapsed = timeSeconds - startTime;
    const intensity = Number.isFinite(Number(settings.intensity)) ? Number(settings.intensity) : 85;
    const particleSetting = Number.isFinite(Number(settings.particles)) ? Number(settings.particles) : 36;
    const particles = Math.min(96, Math.max(8, particleSetting || 36) + (tier - 1) * 12);
    const palette = PALETTES[settings.palette] || PALETTES.festival;

    ctx.save();
    // The rocket exists during the 420 ms before its burst, even though the
    // particle explosion has not started yet.
    const launchStart = Math.max(0, startTime - 0.42);
    const launchAge = timeSeconds - launchStart;
    if (launchAge >= 0 && launchAge <= 0.42 && timeSeconds < startTime) {
        const launchProgress = launchAge / 0.42;
        const launchFade = launchAge <= 0.30 ? 1 : (0.42 - launchAge) / 0.12;
        const launchX = Math.round(center.x + deterministicRandom(seed, 50, -width * 0.16, width * 0.16));
        const launchY = height + 24 + (center.y - height - 24) * launchProgress;
        ctx.globalAlpha = clamp(intensity / 100, 0, 1) * clamp(launchFade, 0, 1);
        ctx.strokeStyle = '#FFFFFF';
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 10;
        ctx.lineWidth = Math.max(2, width * 0.0025);
        ctx.beginPath();
        ctx.moveTo(launchX, launchY + height * 0.025);
        ctx.lineTo(launchX, launchY);
        ctx.stroke();
    }

    if (elapsed < 0 || elapsed > duration) {
        ctx.restore();
        return;
    }
    const progress = clamp(elapsed / duration, 0, 1);
    const baseAlpha = clamp(intensity / 100, 0, 1) * (1 - progress);

    for (let i = 0; i < particles; i++) {
        const angle = (2 * Math.PI * i / particles) + deterministicRandom(seed, i, -0.45, 0.45);
        const speed = deterministicRandom(seed, 100 + i, height * 0.035, height * (0.12 + 0.015 * tier));
        const targetX = Math.round(Math.cos(angle) * speed);
        const targetY = Math.round(Math.sin(angle) * speed);
        const x = center.x + targetX * progress;
        const y = center.y + targetY * progress;
        const tailX = Math.round(-targetX * 0.08);
        const tailY = Math.round(-targetY * 0.08);
        const color = palette[(i + burstIndex + (seed % palette.length)) % palette.length];
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 1;
        ctx.lineWidth = 1 + tier;
        ctx.beginPath();
        ctx.moveTo(x + tailX, y + tailY);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 3, y + 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Deterministic star glints follow the same fixed-radius, upward drift as ASS.
    const glints = Math.max(4, Math.floor(particles / 8));
    for (let i = 0; i < glints; i++) {
        const angle = deterministicRandom(seed, 500 + i, 0, Math.PI * 2);
        const radius = deterministicRandom(seed, 700 + i, height * 0.035, height * 0.12);
        const x = Math.round(center.x + Math.cos(angle) * radius);
        const y = Math.round(center.y + Math.sin(angle) * radius) - Math.round(height * 0.025) * progress;
        const size = 5 + tier * 2;
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = palette[(i + burstIndex) % palette.length];
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size / 3, y - size / 3);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size / 3, y + size / 3);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size / 3, y + size / 3);
        ctx.lineTo(x - size, y);
        ctx.lineTo(x - size / 3, y - size / 3);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

export function renderPreview(ctx, layer, timeSeconds, state, runtime) {
    const settings = layer.settings || {};
    const width = Number(runtime?.width) || ctx.canvas.width;
    const height = Number(runtime?.height) || ctx.canvas.height;
    const duration = Number(runtime?.duration) || Infinity;
    if (timeSeconds < (Number(layer.start_time) || 0) || timeSeconds > Number(layer.end_time ?? duration)) return;
    const events = [...(Array.isArray(layer.events) ? layer.events : []), ...(state.transientEvents || [])]
        .sort((a, b) => (Number(a.t) - Number(b.t))
            || (Number(a.tier) - Number(b.tier))
            || Number(a.source === 'manual') - Number(b.source === 'manual'));
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const eventTime = Number(event.t) || 0;
        const tier = Math.max(1, Math.min(3, Number(event.tier) || 1));
        const seed = normalizeSeed(event.seed, seedForTime(eventTime, tier));
        const burstCount = tier >= 3 ? 3 : tier === 2 ? 2 : 1;
        const requestedEnd = Number(event.end_time);
        const burstSpacing = burstCount > 1 ? 0.16 : 0;
        const eventHasEnd = Number.isFinite(requestedEnd) && event.end_time !== null && event.end_time !== undefined && event.end_time !== '';
        const eventSettings = eventHasEnd ? {
            ...settings,
            eventDurationOverride: Math.max(0.05, requestedEnd - eventTime - burstSpacing * (burstCount - 1))
        } : settings;
        for (let burstIndex = 0; burstIndex < burstCount; burstIndex++) {
            const center = burstCenter(width, height, seed, burstIndex);
            drawBurst(ctx, center, timeSeconds, eventTime + burstIndex * burstSpacing, seed + burstIndex * 7919, tier, eventSettings, width, height, burstIndex);
        }
    }
}
