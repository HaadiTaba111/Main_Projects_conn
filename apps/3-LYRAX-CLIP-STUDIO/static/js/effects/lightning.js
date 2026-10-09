import { clamp, deterministicRandom, detectBeat, getBandEnergies, normalizeSeed, seedForTime } from './shared.js';

const TIERS = {
    1: { thickness: 4, segments: 6, wig: 12, duration: 0.35, glow: 25, branch: false },
    2: { thickness: 7, segments: 8, wig: 16, duration: 0.42, glow: 34, branch: false },
    3: { thickness: 11, segments: 11, wig: 22, duration: 0.55, glow: 46, branch: true }
};

const FREQUENCY_STYLES = {
    bass: { color: '#FF4500', glow: '#FF6347', thickness: 1.4, duration: 1.3, style: 'realistic', branchProb: 0.35 },
    mid: { color: '#FFF700', glow: '#FFFF66', thickness: 1.0, duration: 1.0, style: 'zigzag', branchProb: 0.2 },
    treble: { color: '#00BFFF', glow: '#87CEEB', thickness: 0.6, duration: 0.7, style: 'forked', branchProb: 0.6 }
};

function normalizedTier(value) {
    const tier = Math.trunc(Number(value) || 1);
    return TIERS[tier] ? tier : 1;
}

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

    const mode = settings.mode || 'beat';
    if (state.lastMode !== mode) {
        state.nextIntervalTime = undefined;
        state.lastMode = mode;
    }
    if (mode === 'interval') {
        const interval = Math.max(0.5, Number(settings.intervalSec) || 4);
        if (state.nextIntervalTime === undefined || now < (state.lastUpdateTime ?? -1)) {
            const elapsedInLayer = Math.max(0, now - start);
            state.nextIntervalTime = elapsedInLayer > interval ? now : start;
        }
        if (now + 1e-3 >= state.nextIntervalTime) {
            state.transientEvents.push({
                t: Math.round(state.nextIntervalTime * 1000) / 1000,
                tier: 1,
                energy_factor: 1,
                freq_band: 'mid',
                seed: seedForTime(state.nextIntervalTime, 1),
                source: 'interval'
            });
            state.nextIntervalTime += interval;
        }
    } else if (mode === 'beat') {
        const events = detectBeat(now, settings, runtime.audio, state, ['bass', 'mid', 'treble']);
        state.transientEvents.push(...events);
    }

    state.transientEvents = state.transientEvents.filter(event => now - event.t < 1.25 && now >= event.t - 0.05);
    state.lastUpdateTime = now;
}

export function createManualEvent({ layer, time, triggerId, runtime }) {
    const tier = normalizedTier(String(triggerId || '').replace('tier-', ''));
    const bands = getBandEnergies(runtime?.audio);
    const values = Object.values(bands);
    const peak = Math.max(0, ...values);
    const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1;
    const band = peak <= 1 ? 'mid' : (Object.entries(bands).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mid');
    return {
        t: Math.round(Number(time) * 1000) / 1000,
        tier,
        energy_factor: clamp(peak / Math.max(average, 1), 0.7, 1.8),
        freq_band: band,
        seed: seedForTime(time, tier),
        source: 'manual'
    };
}

function midpointDisplacement(p1, p2, displacement, roughness, seed, depth, minX, maxX) {
    if (depth <= 0) return [p1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const offset = deterministicRandom(seed, depth, -displacement, displacement);
    const x = clamp(midX - (dy / length) * offset, minX, maxX);
    const y = midY + (dx / length) * offset;
    const left = midpointDisplacement(p1, { x, y }, displacement * roughness, roughness, seed + 1, depth - 1, minX, maxX);
    const right = midpointDisplacement({ x, y }, p2, displacement * roughness, roughness, seed + 2, depth - 1, minX, maxX);
    return left.slice(0, -1).concat(right);
}

function makeBoltPoints(width, height, side, seed, tier, style) {
    const cfg = TIERS[tier];
    const dir = side === 'left' ? 1 : -1;
    const start = { x: Math.round(width * 0.08), y: Math.round(height * 0.02) };
    if (side === 'right') start.x = width - start.x;
    const total = height * 0.28;
    const minX = Math.round(width * 0.08), maxX = Math.round(width * 0.92);
    const end = { x: clamp(start.x + dir * total * 0.35, minX, maxX), y: start.y + total };

    if (style === 'realistic') {
        const points = midpointDisplacement(start, end, cfg.wig * 1.5, 0.55, seed * 1000 + 7, Math.floor(cfg.segments / 2) + 2, minX, maxX);
        points.push(end);
        return points;
    }
    if (style === 'forked') {
        const mid = { x: clamp(start.x + dir * total * 0.17, minX, maxX), y: start.y + total * 0.5 };
        return [start, mid, end];
    }

    const points = [start];
    let x = start.x, y = start.y;
    const step = total / cfg.segments;
    for (let i = 0; i < cfg.segments; i++) {
        const wiggle = (((seed + 2) * (i + 3)) % 7 - 3) * cfg.wig;
        x = clamp(x + dir * step * 0.35 + wiggle, minX, maxX);
        y += step;
        points.push({ x, y });
    }
    return points;
}

function strokePoints(ctx, points, width, color, alpha, glow, shadowBlur = 22) {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = glow ? shadowBlur : 0;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
}

function drawEvent(ctx, event, timeSeconds, layer, width, height, eventIndex) {
    const tier = normalizedTier(event.tier);
    const cfg = TIERS[tier];
    const bandStyle = FREQUENCY_STYLES[event.freq_band] || FREQUENCY_STYLES.mid;
    const settings = layer.settings || {};
    const customColor = settings.colorMode === 'custom';
    const color = customColor ? (settings.color || '#FFF700') : bandStyle.color;
    const glow = customColor ? color : bandStyle.glow;
    const eventTime = Number(event.t || 0);
    const elapsed = timeSeconds - eventTime;
    const defaultDuration = cfg.duration * bandStyle.duration;
    const requestedEnd = Number(event.end_time);
    const duration = Number.isFinite(requestedEnd) && event.end_time !== null && event.end_time !== undefined && event.end_time !== ''
        ? Math.max(0.001, requestedEnd - eventTime) : defaultDuration;
    if (elapsed < 0 || elapsed > duration) return;
    const progress = clamp(elapsed / duration, 0, 1);
    const intensity = Number.isFinite(Number(settings.intensity)) ? Number(settings.intensity) : 80;
    const alpha = clamp(intensity / 100, 0, 1) * (1 - progress);
    const energy = clamp(event.energy_factor || 1, 0.7, 1.8);
    const thickness = cfg.thickness * bandStyle.thickness * (0.75 + 0.25 * energy);
    const seed = normalizeSeed(event.seed, seedForTime(event.t, tier));
    const side = event.side || (eventIndex % 2 === 0 ? 'left' : 'right');
    const points = makeBoltPoints(width, height, side, seed, tier, bandStyle.style);
    const paths = [points];
    const totalLength = height * 0.28;
    const minX = Math.round(width * 0.08), maxX = Math.round(width * 0.92);
    const startX = side === 'left' ? minX : width - minX;
    const startY = Math.round(height * 0.02);
    const dirSign = side === 'left' ? 1 : -1;
    const branchRoll = deterministicRandom(seed, 99);

    if (bandStyle.style === 'forked') {
        const branchCount = branchRoll < bandStyle.branchProb ? 2 + (seed % 3) : 1;
        for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
            const branchSeed = seed * 100 + branchIndex;
            const branchStartY = startY + totalLength * (0.3 + branchIndex * 0.2);
            const branchStartX = clamp(
                startX + dirSign * totalLength * (0.1 + branchIndex * 0.05), minX, maxX
            );
            const end = {
                x: clamp(branchStartX + deterministicRandom(branchSeed, 1, -totalLength * 0.3, totalLength * 0.3), minX, maxX),
                y: branchStartY + totalLength * 0.3
            };
            const branch = midpointDisplacement(
                { x: branchStartX, y: branchStartY }, end, cfg.wig * 0.8, 0.5,
                branchSeed * 1000 + 3, 3, minX, maxX
            );
            branch.push(end);
            paths.push(branch);
        }
    } else if (cfg.branch || branchRoll < bandStyle.branchProb) {
        const mid = points[Math.max(1, Math.min(points.length - 1, Math.floor(points.length / 2)))];
        const end = {
            x: clamp(mid.x + deterministicRandom(seed, 40, -totalLength * 0.25, totalLength * 0.25), minX, maxX),
            y: mid.y + totalLength * 0.35
        };
        const branch = midpointDisplacement(
            mid, end, cfg.wig * 0.7, 0.5, seed * 1000 + 13, 3, minX, maxX
        );
        branch.push(end);
        paths.push(branch);
    }

    // Four visual passes mirror the multi-layer ASS glow used by the final renderer.
    for (const path of paths) strokePoints(ctx, path, thickness * 2.5, glow, alpha * 0.28, glow, 12);
    for (const path of paths) strokePoints(ctx, path, thickness * 1.5, glow, alpha * 0.55, glow, 5);
    for (const path of paths) strokePoints(ctx, path, thickness, color, alpha, glow, 2);
    if (tier >= 2) {
        for (const path of paths) strokePoints(ctx, path, Math.max(1.4, thickness * 0.24), '#FFFFFF', alpha * 0.82, '#FFFFFF', 0);
    }
}

export function renderPreview(ctx, layer, timeSeconds, state, runtime) {
    const settings = layer.settings || {};
    const width = Number(runtime?.width) || ctx.canvas.width;
    const height = Number(runtime?.height) || ctx.canvas.height;
    const duration = Number(runtime?.duration) || Infinity;
    if (timeSeconds < (Number(layer.start_time) || 0) || timeSeconds > Number(layer.end_time ?? duration)) return;
    const events = [
        ...(Array.isArray(layer.events) ? layer.events : []),
        ...(state.transientEvents || [])
    ].sort((a, b) => (Number(a.t) - Number(b.t))
        || String(a.freq_band || 'mid').localeCompare(String(b.freq_band || 'mid'))
        || Number(a.source === 'manual') - Number(b.source === 'manual'));
    for (let i = 0; i < events.length; i++) drawEvent(ctx, events[i], timeSeconds, layer, width, height, i);
}
