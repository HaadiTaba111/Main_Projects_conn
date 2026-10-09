/**
 * 🧱 ماژول ۲: microstructure.js
 * تشخیص Iceberg، Spoofing، CVD تیک‌محور، عدم تعادل دفتر سفارش (OBI) و دیوارهای نهنگ.
 */

export function detectIceberg(trades, { tickSize = 0.1, windowMs = 3000, minCount = 8 } = {}) {
  if (!Array.isArray(trades) || !trades.length) return { detected: false };
  const now = Date.now();
  const recent = trades.filter(t => now - t.ts < windowMs);
  const groups = new Map();
  for (const t of recent) {
    const key = `${Number(t.price || 0).toFixed(2)}_${Math.round(Number(t.qty || 0) / tickSize)}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  let best = { detected: false };
  for (const [key, count] of groups) {
    if (count >= minCount && (!best.detected || count > best.count)) {
      const [price] = key.split('_');
      best = { detected: true, price: Number(price), count };
    }
  }
  return best;
}

export function detectSpoofing(snapshots, { windowMs = 5000, threshold = 0.3 } = {}) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) return { detected: false };
  const now = Date.now();
  const recent = snapshots.filter(s => now - s.ts < windowMs);
  if (recent.length < 2) return { detected: false };
  const first = recent[0], last = recent.at(-1);
  const bidChange = (last.bidDepth - first.bidDepth) / (first.bidDepth || 1);
  const askChange = (last.askDepth - first.askDepth) / (first.askDepth || 1);
  const priceStable = Math.abs(last.bestBid - first.bestBid) / (first.bestBid || 1) < 0.001;
  const detected = priceStable && (Math.abs(bidChange) > threshold || Math.abs(askChange) > threshold);
  return { detected, bidChange, askChange, side: bidChange > threshold ? 'bid' : askChange > threshold ? 'ask' : null };
}

export function computeCVD(trades) {
  if (!Array.isArray(trades) || !trades.length) return { cvd: 0, absorption: false };
  let cvd = 0;
  for (const t of trades) cvd += t.side === 'buy' ? t.qty : -t.qty;
  const priceChange = (trades.at(-1)?.price || 0) - (trades[0]?.price || 0);
  const cvdChange = cvd;
  const avgQty = trades.reduce((s, t) => s + (t.qty || 0), 0) / trades.length;
  // انباشت مخفی: قیمت ثابت، ولی CVD در حرکت
  const absorption = Math.abs(priceChange) / (trades[0]?.price || 1) < 0.001 && Math.abs(cvdChange) > avgQty * 3;
  return { cvd, cvdChange, priceChange, absorption, direction: cvdChange > 0 ? 'buy' : 'sell' };
}

export function detectOrderbookImbalance(snapshot, levels = 10) {
  if (!snapshot) return 0;
  const { bids = [], asks = [] } = snapshot;
  const bidVol = bids.slice(0, levels).reduce((s, b) => s + (b.qty || 0), 0);
  const askVol = asks.slice(0, levels).reduce((s, a) => s + (a.qty || 0), 0);
  const total = bidVol + askVol;
  return total ? (bidVol - askVol) / total : 0;
}

export function findWalls(snapshot, { minSize = 500_000 } = {}) {
  const walls = { bidWall: null, askWall: null };
  if (!snapshot) return walls;
  const price = snapshot.bestAsk || snapshot.price || 1;
  for (const b of snapshot.bids || []) {
    if (b.price * b.qty > minSize) {
      const distancePct = Math.abs((price - b.price) / price) * 100;
      if (!walls.bidWall || b.price * b.qty > walls.bidWall.size) {
        walls.bidWall = { price: b.price, size: b.price * b.qty, distancePct: Number(distancePct.toFixed(2)) };
      }
    }
  }
  for (const a of snapshot.asks || []) {
    if (a.price * a.qty > minSize) {
      const distancePct = Math.abs((a.price - price) / price) * 100;
      if (!walls.askWall || a.price * a.qty > walls.askWall.size) {
        walls.askWall = { price: a.price, size: a.price * a.qty, distancePct: Number(distancePct.toFixed(2)) };
      }
    }
  }
  return walls;
}
