import { detectRegime } from './regime-filter.js';
import { detectIceberg, detectSpoofing, computeCVD, findWalls } from './microstructure.js';
import { whalePressureScore, fetchFundingAndOI } from './whale-radar.js';
import { getNewsSignal } from './news-sentiment.js';

/**
 * 🌐 ماژول ۵: context-aggregator.js
 * جمع‌آوری یکپارچه رژیم بازار، فاکتورهای میکروساختار، فشار نهنگ‌ها، فاندینگ و احساسات.
 */
export async function buildMarketContext({ candles = [], trades = [], snapshots = [], alerts = [], apiKeys = {}, symbol = 'BTCUSDT', currency = 'BTC' } = {}) {
  const regime = detectRegime(candles);
  const iceberg = detectIceberg(trades);
  const spoofing = detectSpoofing(snapshots);
  const cvd = computeCVD(trades);
  const walls = snapshots.length ? findWalls(snapshots.at(-1)) : { bidWall: null, askWall: null };
  const whale = whalePressureScore(alerts);
  const [funding, news] = await Promise.all([
    fetchFundingAndOI(symbol),
    apiKeys?.cryptopanic ? getNewsSignal({ apiKey: apiKeys.cryptopanic, currency }) : Promise.resolve({ ok: false, score: 0 })
  ]);

  return { regime, iceberg, spoofing, cvd, walls, whale, funding, news };
}
