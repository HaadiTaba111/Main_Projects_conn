import { mean } from '../core/utils.js';

/**
 * 🌪️ ماژول ۱: regime-filter.js
 * تشخیص رژیم بازار (رونددار یا بی‌روند). بدون این، سیگنال‌ها در بازار Range فیک می‌شوند.
 */

export function computeADX(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period * 2) return 25;
  const trs = [], plusDM = [], minusDM = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let trS = mean(trs.slice(0, period));
  let plusS = mean(plusDM.slice(0, period));
  let minusS = mean(minusDM.slice(0, period));
  const dxs = [];
  for (let i = period; i < trs.length; i++) {
    trS = (trS * (period - 1) + trs[i]) / period;
    plusS = (plusS * (period - 1) + plusDM[i]) / period;
    minusS = (minusS * (period - 1) + minusDM[i]) / period;
    const plusDI = trS ? (plusS / trS) * 100 : 0;
    const minusDI = trS ? (minusS / trS) * 100 : 0;
    const sum = plusDI + minusDI;
    dxs.push(sum ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0);
  }
  if (!dxs.length) return 25;
  let adx = mean(dxs.slice(0, period));
  for (let i = period; i < dxs.length; i++) adx = (adx * (period - 1) + dxs[i]) / period;
  return Number.isFinite(adx) ? adx : 25;
}

export function computeKaufmanER(candles, period = 10) {
  if (!Array.isArray(candles) || candles.length <= period) return 0.5;
  const change = Math.abs(candles.at(-1).close - candles.at(-period - 1).close);
  let volatility = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    volatility += Math.abs(candles[i].close - candles[i - 1].close);
  }
  return volatility === 0 ? 0 : change / volatility;
}

/**
 * خروجی: { regime, adx, er, multiplier, why }
 * multiplier در امتیاز نهایی ضرب می‌شود (0.4 تا 1.2)
 */
export function detectRegime(candles) {
  const adx = computeADX(candles);
  const er = computeKaufmanER(candles);
  let regime, multiplier, why;

  if (adx > 25 && er > 0.35) {
    regime = 'TREND'; multiplier = 1.2;
    why = `روند قوی (ADX=${adx.toFixed(1)}, ER=${er.toFixed(2)})`;
  } else if (adx < 18 || er < 0.18) {
    regime = 'RANGE'; multiplier = 0.4;
    why = `بازار بی‌رونده (ADX=${adx.toFixed(1)}, ER=${er.toFixed(2)}) — سیگنال‌ها ضعیف`;
  } else {
    regime = 'MIXED'; multiplier = 1.0;
    why = `رژیم مختلط (ADX=${adx.toFixed(1)}, ER=${er.toFixed(2)})`;
  }
  return { regime, adx, er, multiplier, why };
}
