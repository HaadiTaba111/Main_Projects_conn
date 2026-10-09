// lyricsParser.js — Parse lyrics with timestamps

const TIME_REGEX = /\[([0-9]+:)?([0-9]+\.[0-9]+)\]/g;

/**
 * Parse raw lyrics text into timed lines.
 * Supports formats:
 *   [00:12.34] Line text
 *   [12.34] Line text
 *   Plain text (auto-distributed evenly across audio duration)
 */
export function parseLyrics(rawText, audioDuration = 60) {
  const lines = rawText.trim().split("\n").map(l => l.trim()).filter(Boolean);
  const entries = [];

  for (const line of lines) {
    const matches = [...line.matchAll(TIME_REGEX)];
    if (matches.length > 0) {
      const text = line.replace(TIME_REGEX, "").trim();
      for (const m of matches) {
        const timeStr = m[0]; // e.g. [00:12.34]
        const seconds = _parseTime(timeStr);
        entries.push({ time: seconds, text, id: entries.length });
      }
    } else {
      entries.push({ time: null, text: line, id: entries.length });
    }
  }

  // Sort by time
  entries.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));

  // Auto-assign times for untimed lines
  const untimed = entries.filter(e => e.time === null);
  if (untimed.length > 0 && audioDuration > 0) {
    const timedCount = entries.length - untimed.length;
    const segment = audioDuration / (timedCount + untimed.length + 1);
    let idx = 1;
    for (const e of entries) {
      if (e.time === null) {
        e.time = segment * idx;
        idx++;
      }
    }
    entries.sort((a, b) => a.time - b.time);
  }

  return entries;
}

function _parseTime(str) {
  const inner = str.replace(/\[|\]/g, "");
  if (inner.includes(":")) {
    const [min, sec] = inner.split(":");
    return parseInt(min, 10) * 60 + parseFloat(sec);
  }
  return parseFloat(inner);
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const cs = Math.floor((sec % 1) * 100).toString().padStart(2, "0");
  return `${m}:${s}.${cs}`;
}
