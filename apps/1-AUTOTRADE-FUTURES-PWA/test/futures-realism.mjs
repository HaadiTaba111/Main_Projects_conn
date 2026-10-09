// تست واقع‌گرایی فیوچرز: لیکویید، فاندینگ، مهاجرت تنظیمات، هم‌خوانی پروفایل متوسط
import { PaperBroker } from '../src/js/services/paper-broker.js';
import { DEFAULT_SETTINGS, RISK_PROFILES } from '../src/js/core/config.js';
import { migrateSettings } from '../src/js/services/settings-store.js';

const TF = 15 * 60000; let t = 2_000_000_000;
const H8 = 8 * 3600000;
const mk = over => ({ value: { ...DEFAULT_SETTINGS, slippagePct: 0, cooldownSec: 0, maxOpenPositions: 5, minScore: 60,
  feeOpenPct: 0, feeClosePct: 0, timeframe: '15', maxHoldMinutes: 0, minHoldCandles: 0, profitMode: 'float', fadeCandles: 0,
  leverage: 5, maintenanceMarginPct: 0.5, fundingIntervalHours: 8, ...over } });
const sig = (side = 'LONG') => ({ symbol: 'BTCUSDT', side, entry: 100, stop: side === 'LONG' ? 98 : 102,
  take: side === 'LONG' ? 104 : 96, qty: 2, notional: 200, score: 90, atr: 1, rsi: 50, movePct: 0, emaFast: 101, emaSlow: 100,
  volX: 1, signalId: 'f' + Math.random(), candleTs: 1000, tfMs: TF });
const quiet = { info() {} };
const tick = (price, rate, ts) => new Map([['BTCUSDT', { price, tickerRaw: { fundingRate: rate }, lastCandle: { ts, high: price + 0.1, low: price - 0.1 } }]]);
const res = []; const check = (name, cond) => res.push([name, !!cond]);
const near = (a, b, eps = 1e-9) => Math.abs(Number(a) - Number(b)) <= eps;

// 1) فرمول قیمت لیکویید
{
  const b = new PaperBroker(mk(), quiet, { now: () => t });
  check('لیکویید LONG اهرم ۵، MMR ۰٫۵٪ = 80.5', near(b.liquidationPrice('LONG', 100, 5, 0.5), 80.5));
  check('لیکویید SHORT اهرم ۵، MMR ۰٫۵٪ = 119.5', near(b.liquidationPrice('SHORT', 100, 5, 0.5), 119.5));
}
// 2) لیکویید: استاپ عریض‌تر از لیکویید (۷۹ < ۸۰٫۵) → اول لیکویید رخ می‌دهد نه SL
{
  const b = new PaperBroker(mk({ profitMode: 'fixed' }), quiet, { now: () => t });
  b.open({ ...sig('LONG'), stop: 79 }, 'auto', true);
  const pos = b.state.paperPositions[0];
  check('لیکویید در ورود ثبت شده', near(pos.liqPrice, 80.5));
  b.updateStops(tick(81, 0, 2000), null);
  check('قیمت ۸۱ هنوز لیکویید نشده', b.state.paperPositions.length === 1);
  b.updateStops(tick(80, 0, 3000), null);
  const tr = b.state.paperTrades[0];
  check('به ۸۰ رسید → LIQUIDATION', tr?.reason === 'LIQUIDATION');
  check('خروج روی قیمت لیکویید ۸۰٫۵ ثبت شد', tr && near(tr.exit, 80.5));
}
// 2b) گپ قیمتی: از ۱۰۰ به ۷۸ (هم از لیکویید و هم از SL رد شد) → خروج روی لیکویید، نه قیمت گپ
{
  const b = new PaperBroker(mk({ profitMode: 'fixed' }), quiet, { now: () => t });
  b.open({ ...sig('LONG'), stop: 79 }, 'auto', true);
  b.updateStops(tick(78, 0, 2000), null);
  const tr = b.state.paperTrades[0];
  check('گپ به ۷۸ → LIQUIDATION روی ۸۰٫۵ (نه SL)', tr?.reason === 'LIQUIDATION' && near(tr.exit, 80.5));
}
// 3) فاندینگ: LONG با نرخ مثبت پرداخت می‌کند؛ ۸ ساعت × نرخ ۰٫۰۱٪ × ۲ واحد × ۱۰۰ = ۰٫۰۲
{
  const b = new PaperBroker(mk(), quiet, { now: () => t });
  b.open(sig('LONG'), 'auto', true);
  b.updateStops(tick(100, 0.0001, 2000), null); // ثبت آغاز فاندینگ
  t += H8; b.updateStops(tick(100, 0.0001, 3000), null);
  check('فاندینگ LONG بعد از ۸ ساعت = 0.02 پرداخت', near(b.state.paperPositions[0].fundingPaid, 0.02, 1e-9));
}
// 4) فاندینگ: SHORT با همان نرخ مثبت دریافت می‌کند
{
  const b = new PaperBroker(mk(), quiet, { now: () => t });
  b.open(sig('SHORT'), 'auto', true);
  b.updateStops(tick(100, 0.0001, 2000), null);
  t += H8; b.updateStops(tick(100, 0.0001, 3000), null);
  check('فاندینگ SHORT با نرخ مثبت = -0.02 (دریافت)', near(b.state.paperPositions[0].fundingPaid, -0.02, 1e-9));
}
// 5) فاندینگ در PnL نهایی و موجودی لحاظ می‌شود
{
  const b = new PaperBroker(mk(), quiet, { now: () => t });
  b.open(sig('LONG'), 'auto', true);
  const eq0 = b.state.paperEquity;
  b.updateStops(tick(100, 0.0001, 2000), null);
  t += H8; b.updateStops(tick(100, 0.0001, 3000), null);
  b.close(b.state.paperPositions[0], 100, 'manual');
  const tr = b.state.paperTrades[0];
  check('pnl خالص LONG بدون حرکت قیمت = -0.02 (فاندینگ)', near(tr.pnl, -0.02, 1e-9));
  check('trade.funding ثبت شد = 0.02', near(tr.funding, 0.02, 1e-9));
  check('موجودی فقط با فاندینگ کم شد', near(b.state.paperEquity, eq0 - 0.02, 1e-9));
}
// 6) نرخ نداشته باشیم (مثلاً OKX) → فاندینگ صفر، بدون خطا
{
  const b = new PaperBroker(mk(), quiet, { now: () => t });
  b.open(sig('LONG'), 'auto', true);
  t += H8; b.updateStops(new Map([['BTCUSDT', { price: 100, tickerRaw: {}, lastCandle: { ts: 3000, high: 100.1, low: 99.9 } }]]), null);
  check('بدون نرخ فاندینگ هزینه‌ای حساب نمی‌شود', near(b.state.paperPositions[0].fundingPaid, 0));
}
// 7) مهاجرت تنظیمات: نسخهٔ قدیمی با تایم‌فریم ۶۰ → ۱۵ یک‌بار؛ انتخاب کاربر در نسخهٔ جدید دست‌نخورده
{
  const old = migrateSettings({ timeframe: '60', minScore: 70 });
  check('نسخهٔ قدیمی: تایم‌فریم ۶۰ → ۱۵', old.timeframe === '15' && old.minScore === 70);
  check('نسخهٔ قدیمی بعد از مهاجرت شماره‌نسخه می‌گیرد', old.settingsVersion === DEFAULT_SETTINGS.settingsVersion);
  const current = migrateSettings({ timeframe: '60', settingsVersion: DEFAULT_SETTINGS.settingsVersion });
  check('نسخهٔ فعلی: انتخاب کاربر ۶۰ حفظ می‌شود', current.timeframe === '60');
  check('تنظیمات خالی → بدون تغییر تایم‌فریم', migrateSettings({}).timeframe === undefined);
}
// 8) پروفایل متوسط با پیش‌فرض‌ها هم‌خوان است
{
  const keys = Object.keys(RISK_PROFILES.medium);
  const same = keys.every(k => RISK_PROFILES.medium[k] === DEFAULT_SETTINGS[k]);
  check('پروفایل متوسط = پیش‌فرض‌ها (' + keys.join(',') + ')', same);
}

const failed = res.filter(([, ok]) => !ok);
for (const [name, ok] of res) console.log(`${ok ? '✅' : '❌'} ${name}`);
if (failed.length) { console.error(`\n${failed.length} تست ناموفق`); process.exit(1); }
console.log('\nALL OK (futures realism)');
