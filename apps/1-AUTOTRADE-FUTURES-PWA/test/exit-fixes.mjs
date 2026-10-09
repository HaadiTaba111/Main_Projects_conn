import { PaperBroker } from '../src/js/services/paper-broker.js';
import { DEFAULT_SETTINGS } from '../src/js/core/config.js';
const TF = 15 * 60000; let t = 1_000_000_000;
const mk = over => ({ value: { ...DEFAULT_SETTINGS, slippagePct: 0, cooldownSec: 0, maxOpenPositions: 5, minScore: 60,
  feeOpenPct: 0, feeClosePct: 0, timeframe: '15', maxHoldMinutes: 20, profitMode: 'float', fadeCandles: 0, ...over } });
const sig = { symbol: 'BTCUSDT', side: 'LONG', entry: 100, stop: 98, take: 104, qty: 2, notional: 200, score: 90,
  atr: 1, rsi: 50, movePct: 0, emaFast: 101, emaSlow: 100, volX: 1, signalId: 'c1', candleTs: 1000, tfMs: TF };
const res = [];
const check = (name, cond) => res.push([name, !!cond]);
// 1) کف نگهداری: maxHold=20 دقیقه ولی ۴ کندل ۱۵ دقیقه‌ای = ۶۰ دقیقه
{
  const b = new PaperBroker(mk(), { info() {} }, { now: () => t });
  b.open(sig, 'auto', true);
  t += 30 * 60000; b.updateStops(new Map([['BTCUSDT', { price: 100, lastCandle: { ts: 2000, high: 100.2, low: 99.8 } }]]), null);
  check('۳۰ دقیقه: هنوز باز', b.state.paperPositions.length === 1);
  t += 31 * 60000; b.updateStops(new Map([['BTCUSDT', { price: 100, lastCandle: { ts: 3000, high: 100.2, low: 99.8 } }]]), null);
  check('۶۱ دقیقه: MAX_HOLD بسته', b.state.paperTrades[0]?.reason === 'MAX_HOLD_EXIT');
}
// 2) کندل ورود نباید سقف قبل از ورود را به highWater ببرد
{
  const b = new PaperBroker(mk({ maxHoldMinutes: 0, minHoldCandles: 0 }), { info() {} }, { now: () => t });
  b.open(sig, 'auto', true);
  b.updateStops(new Map([['BTCUSDT', { price: 100, lastCandle: { ts: 1000, high: 150, low: 99 } }]]), null);
  check('کندل ورود (ts=candleTs) وارد highWater نمی‌شود', b.state.paperPositions[0].highWater === 100);
  b.updateStops(new Map([['BTCUSDT', { price: 101, lastCandle: { ts: 2000, high: 101.5, low: 100.5 } }]]), null);
  check('کندل بعد از ورود وارد highWater می‌شود', b.state.paperPositions[0].highWater === 101.5);
}
// 3) همان کندل دوباره وارد نمی‌شود (بعد از بسته‌شدن و cooldown)
{
  const b = new PaperBroker(mk({ cooldownSec: 0 }), { info() {} }, { now: () => t });
  b.open(sig, 'auto', true);
  b.close(b.state.paperPositions[0], 100, 'manual');
  const v = b.evaluate(sig);
  check('همان candleTs دوباره باز نمی‌شود', v.ok === false);
  check('کندل جدید باز می‌شود', b.evaluate({ ...sig, candleTs: 5000, signalId: 'c2' }).ok === true);
}
// 4) پرش قیمت: استاپ ۹۸ ولی قیمت ۹۵ → خروج با قیمت بدتر، نه ۹۸
{
  const b = new PaperBroker(mk({ maxHoldMinutes: 0, minHoldCandles: 0, slippagePct: 0.02 }), { info() {} }, { now: () => t });
  b.open(sig, 'auto', true);
  b.updateStops(new Map([['BTCUSDT', { price: 95, lastCandle: { ts: 2000, high: 95.5, low: 94.8 } }]]), null);
  const tr = b.state.paperTrades[0];
  check('SL با پرش: exit ≈ 95×(1−0.0002)', tr && Math.abs(tr.exit - 95 * 0.9998) < 1e-6);
}
let fail = 0;
for (const [n, c] of res) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(fail ? `FAIL ${fail}` : 'ALL OK');
process.exit(fail ? 1 : 0);
