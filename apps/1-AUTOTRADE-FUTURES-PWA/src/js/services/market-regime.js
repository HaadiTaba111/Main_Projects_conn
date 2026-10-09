import { mean } from '../core/utils.js';

/**
 * 🌪️ فیلتر رژیم بازار (Market Regime Filter) — تشخیص روند در برابر رنج و امواج فرسایشی
 * ----------------------------------------------------------------------------------
 * ۱. ADX (Average Directional Index): سنجش قدرت روند (بالای ۲۵ = روند قوی، زیر ۲۰ = رنج/خطر فیک)
 * ۲. Kaufman Efficiency Ratio (ER): نسبت جابه‌جایی خالص به نوسان کل (زیر ۰.۲ = نویز تصادفی)
 */

export function calculateADX(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period * 2) return { adx: 25, plusDI: 20, minusDI: 20 };

  const trList = [];
  const plusDMList = [];
  const minusDMList = [];

  for (let i = 1; i < candles.length; i += 1) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trList.push(tr);

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDMList.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMList.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smooth Wilder's
  const smooth = (list, p) => {
    let val = list.slice(0, p).reduce((a, b) => a + b, 0);
    const res = [val];
    for (let i = p; i < list.length; i += 1) {
      val = val - (val / p) + list[i];
      res.push(val);
    }
    return res;
  };

  const trSmooth = smooth(trList, period);
  const plusDMSmooth = smooth(plusDMList, period);
  const minusDMSmooth = smooth(minusDMList, period);

  const dxList = [];
  for (let i = 0; i < trSmooth.length; i += 1) {
    const tr = trSmooth[i] || 1e-6;
    const plusDI = (plusDMSmooth[i] / tr) * 100;
    const minusDI = (minusDMSmooth[i] / tr) * 100;
    const sumDI = plusDI + minusDI;
    const dx = sumDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / sumDI) * 100;
    dxList.push(dx);
  }

  const adx = mean(dxList.slice(-period));
  const lastTr = trSmooth.at(-1) || 1e-6;
  const plusDI = (plusDMSmooth.at(-1) / lastTr) * 100;
  const minusDI = (minusDMSmooth.at(-1) / lastTr) * 100;

  return {
    adx: Number.isFinite(adx) ? Math.round(adx * 10) / 10 : 25,
    plusDI: Math.round(plusDI * 10) / 10,
    minusDI: Math.round(minusDI * 10) / 10
  };
}

export function calculateKaufmanER(candles, period = 10) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0.5;

  const currentClose = candles.at(-1).close;
  const oldClose = candles.at(-period - 1).close;
  const change = Math.abs(currentClose - oldClose);

  let volatility = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    volatility += Math.abs(candles[i].close - candles[i - 1].close);
  }

  if (volatility === 0) return 0;
  const er = change / volatility;
  return Number.isFinite(er) ? Math.round(er * 100) / 100 : 0.5;
}

export class MarketRegimeClassifier {
  constructor(settings) {
    this.s = settings;
  }

  classify(candles) {
    const adxObj = calculateADX(candles, 14);
    const er = calculateKaufmanER(candles, 10);
    const adx = adxObj.adx;

    // تشخیص رژیم بازار
    const isTrending = adx >= 25 && er >= 0.30;
    const isChoppy = adx < 20 || er < 0.20;
    const isTransitional = !isTrending && !isChoppy;

    const filterEnabled = String(this.s?.value?.regimeFilter) === 'true';
    let penaltyFactor = 1.0;
    let label = 'رونددار (Trending)';
    let warning = '';

    if (isChoppy) {
      if (filterEnabled) penaltyFactor = 0.40; // جریمه ۶۰٪ برای فرار از فیک‌بریک‌اوت‌های بازار رنج
      label = 'بی‌روند و رنج (Choppy Range)';
      if (filterEnabled) warning = `⚠️ بازار بی‌روند/رنج (ADX=${adx}, ER=${er}) — جریمه فیک‌بریک‌اوت`;
    } else if (isTransitional) {
      if (filterEnabled) penaltyFactor = 0.80;
      label = 'در حال شکل‌گیری (Transitional)';
    }

    return {
      adx,
      plusDI: adxObj.plusDI,
      minusDI: adxObj.minusDI,
      er,
      isTrending,
      isChoppy,
      penaltyFactor,
      label,
      warning
    };
  }
}
