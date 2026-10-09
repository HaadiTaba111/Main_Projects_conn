/**
 * 🐋 ماژول ۳: whale-radar.js
 * اتصال به رادار نهنگ‌ها و دریافت فاندینگ ریت و تغییرات Open Interest (OI) فیوچرز بایننس.
 */

const WHALE_ALERT_URL = 'https://api.whale-alert.io/v1/transactions';

export async function fetchWhaleAlerts({ apiKey, minValue = 1_000_000, minutes = 30 } = {}) {
  if (!apiKey) return { ok: false, error: 'API key موجود نیست', alerts: [] };
  const start = Math.floor((Date.now() - minutes * 60_000) / 1000);
  const url = `${WHALE_ALERT_URL}?api_key=${apiKey}&min_value=${minValue}&start=${start}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, alerts: [] };
    const data = await res.json();
    const alerts = (data.transactions || []).map(tx => ({
      ts: tx.timestamp * 1000,
      chain: tx.blockchain,
      symbol: tx.symbol,
      amount: tx.amount,
      amountUsd: tx.amount_usd,
      from: tx.from?.owner_type || 'unknown',
      to: tx.to?.owner_type || 'unknown',
      // ورود به صرافی = احتمال فروش، خروج = احتمال هولد
      flow: tx.to?.owner_type === 'exchange' ? 'inflow' : tx.from?.owner_type === 'exchange' ? 'outflow' : 'transfer'
    }));
    return { ok: true, alerts };
  } catch (err) {
    return { ok: false, error: err.message, alerts: [] };
  }
}

export function whalePressureScore(alerts, { windowMinutes = 30 } = {}) {
  if (!Array.isArray(alerts) || !alerts.length) return { score: 0, count: 0 };
  const since = Date.now() - windowMinutes * 60_000;
  const recent = alerts.filter(a => a.ts >= since);
  let score = 0;
  for (const a of recent) {
    const weight = Math.min(3, (a.amountUsd || 1_000_000) / 5_000_000);
    if (a.flow === 'outflow') score += weight * 5;   // خروج از صرافی = صعودی
    if (a.flow === 'inflow') score -= weight * 5;    // ورود به صرافی = نزولی
  }
  return { score: Math.max(-30, Math.min(30, Number(score.toFixed(1)))), count: recent.length };
}

export async function fetchFundingAndOI(symbol = 'BTCUSDT') {
  try {
    const [fundingRes, oiRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: AbortSignal.timeout(3000) }),
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, { signal: AbortSignal.timeout(3000) })
    ]);
    const funding = fundingRes.ok ? await fundingRes.json() : {};
    const oi = oiRes.ok ? await oiRes.json() : {};
    return {
      ok: true,
      fundingRate: Number(funding.lastFundingRate) || 0,
      nextFundingTime: Number(funding.nextFundingTime) || 0,
      openInterest: Number(oi.openInterest) || 0,
      markPrice: Number(funding.markPrice) || 0
    };
  } catch (err) {
    return { ok: false, error: err.message, fundingRate: 0, openInterest: 0 };
  }
}
