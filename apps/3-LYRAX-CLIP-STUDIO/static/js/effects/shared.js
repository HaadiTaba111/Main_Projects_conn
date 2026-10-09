export const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function deterministicRandom(seed, index, min = 0, max = 1) {
    // Math.imul preserves the low 32 bits exactly; ordinary JS multiplication
    // loses precision for the large seeds used by the Python renderer.
    const x = (Math.imul(Math.trunc(seed), 1103515245)
        + 12345
        + Math.imul(Math.trunc(index), 2654435761)) & 0x7fffffff;
    return min + ((x % 10000) / 10000) * (max - min);
}

export function seedForTime(timeSeconds, salt = 0) {
    return (Math.round((Number(timeSeconds) || 0) * 1000) * 997 + Math.trunc(salt) * 104729) & 0x7fffffff;
}

export function normalizeSeed(value, fallback) {
    if (value === null || value === undefined || typeof value === 'boolean' || !Number.isFinite(Number(value))) {
        return Math.trunc(Number(fallback) || 0) & 0x7fffffff;
    }
    return Math.trunc(Number(value)) & 0x7fffffff;
}

export function getBandEnergies(audio, history = null) {
    const data = audio?.frequencyData;
    const sampleRate = Number(audio?.sampleRate) || 44100;
    const bands = { bass: 0, mid: 0, treble: 0 };
    if (!data || !data.length) return bands;

    const binHz = sampleRate / (data.length * 2);
    const ranges = { bass: [20, 250], mid: [250, 4000], treble: [4000, sampleRate / 2] };
    for (const [name, [lowHz, highHz]] of Object.entries(ranges)) {
        const start = Math.max(0, Math.floor(lowHz / binHz));
        const end = Math.min(data.length, Math.max(start + 1, Math.ceil(highHz / binHz)));
        let sum = 0;
        for (let i = start; i < end; i++) sum += Number(data[i]) || 0;
        bands[name] = end > start ? sum / (end - start) : 0;
    }
    return bands;
}

/**
 * Shared adaptive beat detector for browser effect plugins. State belongs to one
 * effect layer, so two layers can use different sensitivity/refractory settings.
 */
export function detectBeat(timeSeconds, settings, audio, state, allowedBands = ['bass', 'mid', 'treble']) {
    if (!audio?.frequencyData?.length) return null;
    state.energyHistory ||= { bass: [], mid: [], treble: [] };
    state.lastTriggerByBand ||= { bass: -Infinity, mid: -Infinity, treble: -Infinity };
    const current = getBandEnergies(audio);
    const sensitivity = Math.max(1.01, Number(settings?.sensitivity) || 1.35);
    const minGapSec = Math.max(0, Number(settings?.minGapSec) || 0.22);
    const candidates = [];

    for (const band of allowedBands) {
        const history = state.energyHistory[band] || (state.energyHistory[band] = []);
        const energy = current[band] || 0;
        const average = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
        const threshold = Math.max(18, average * sensitivity, average * 0.05 + 8);
        if (energy > threshold && Number(timeSeconds) - state.lastTriggerByBand[band] >= minGapSec) {
            const ratio = average > 1 ? energy / average : energy / 18;
            const tier = ratio >= sensitivity * 1.55 ? 3 : ratio >= sensitivity * 1.15 ? 2 : 1;
            candidates.push({
                t: Math.round(Number(timeSeconds) * 1000) / 1000,
                tier,
                energy_factor: clamp(ratio, 0.7, 1.8),
                freq_band: band,
                seed: seedForTime(timeSeconds, tier),
                source: 'beat'
            });
        }
        history.push(energy);
        if (history.length > 40) history.shift();
    }

    if (!candidates.length) return [];
    candidates.sort((a, b) => b.energy_factor - a.energy_factor || a.freq_band.localeCompare(b.freq_band));
    // Lightning uses all simultaneous bands to select distinct styles. Effects
    // such as fireworks may intentionally collapse these to one strongest hit.
    for (const event of candidates) state.lastTriggerByBand[event.freq_band] = Number(timeSeconds);
    return candidates;
}
