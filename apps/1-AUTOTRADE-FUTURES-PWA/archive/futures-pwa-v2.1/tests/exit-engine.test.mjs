import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
const { DEFAULT_SETTINGS } = await import('../src/js/core/config.js');
const { PaperBroker } = await import('../src/js/services/paper-broker.js');

const MIN = 60_000;
function makeBroker(over = {}) {
  localStorage._d = {};
  const settings = { value: { ...DEFAULT_SETTINGS, cooldownSec: 0, ...over } };
  return new PaperBroker(settings, { info() {} });
}
// LONG entry 100, stop 98 (R = 2), ATR 1.0, TP 104.
const longSig = (id = 'X:1:LONG') => ({ symbol: 'X', side: 'LONG', entry: 100, qty: 2, notional: 200, stop: 98, take: 104, score: 90, atr: 1.0, signalId: id, source: 'T', candleTs: 1000 });
const shortSig = (id = 'X:1:SHORT') => ({ symbol: 'X', side: 'SHORT', entry: 100, qty: 2, notional: 200, stop: 102, take: 96, score: 90, atr: 1.0, signalId: id, source: 'T', candleTs: 1000 });
// A CLOSED signal-timeframe candle from BEFORE the entry: its low is below the entry. This is what broke v2.0.
const preEntryCandle = { ts: 0, open: 98, high: 100.4, low: 98.6, close: 100 };
const mk = (price, extra = {}) => new Map([['X', { symbol: 'X', price, lastCandle: preEntryCandle, ...extra }]]);
const noSignal = new Map();
const age = (b, ms) => { const p = b.state.paperPositions[0]; p.openedAt = Date.now() - ms; p.lastCandleTs = p.openedAt; return p; };

test('REGRESSION: profit is not cut one scan after break-even (old bug)', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  for (const price of [100.0, 100.3, 100.9, 101.2, 101.8]) b.updateStops(mk(price), noSignal);
  assert.equal(b.state.paperPositions.length, 1, 'position must still be open at +1.8%');
  assert.equal(b.state.paperTrades.length, 0);
  assert.equal(b.state.paperPositions[0].stop, 98, 'stop must not move before breakevenAtR');
});

test('winner runs, ATR trail locks most of the move', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  for (const price of [101, 102.5, 104, 103.5]) b.updateStops(mk(price), noSignal);
  assert.equal(b.state.paperPositions.length, 1);
  assert.ok(b.state.paperPositions[0].stop > 102.5, 'trail follows the 104 high at 1.25 ATR');
  b.updateStops(mk(102.7), noSignal);
  const t = b.state.paperTrades[0];
  assert.equal(t.reason, 'TRAIL_STOP');
  assert.ok(t.exit > 102.5 && t.exit < 102.8, `exit ${t.exit}`);
  assert.ok(t.pnl > 4, `net pnl ${t.pnl}`);
});

test('hard stop still works on a plain tick', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  b.updateStops(mk(97.9), noSignal);
  const t = b.state.paperTrades[0];
  assert.equal(t.reason, 'SL');
  assert.ok(t.pnl < 0);
});

test('gap through the stop fills at the gap price, not at the stop', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  b.updateStops(mk(95), noSignal);
  assert.ok(b.state.paperTrades[0].exit < 95.01);
});

test('pre-entry candles are ignored; post-entry candles are honoured', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  const p = age(b, 10 * MIN);
  const before = { ts: p.openedAt - 5 * MIN, open: 100, high: 100, low: 90, close: 100 };   // pre-entry crash
  b.updateStops(mk(100.5, { exitCandles: [before] }), noSignal);
  assert.equal(b.state.paperPositions.length, 1, 'pre-entry low must not stop us out');
  const after = { ts: p.openedAt + 2 * MIN, open: 100, high: 100.2, low: 97.5, close: 99 }; // post-entry wick through the stop
  b.updateStops(mk(100.5, { exitCandles: [after] }), noSignal);
  assert.equal(b.state.paperTrades[0].reason, 'SL', 'a real post-entry wick through the stop must stop us out');
});

test('same candle touches both stop and a better level: stop wins (conservative)', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  const p = age(b, 10 * MIN);
  b.updateStops(mk(100.5, { exitCandles: [{ ts: p.openedAt + MIN, open: 100, high: 102.6, low: 97.9, close: 100 }] }), noSignal);
  assert.equal(b.state.paperTrades[0].reason, 'SL');
});

test('each candle is replayed once (no false stop from replay against a raised stop)', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  const p = age(b, 10 * MIN);
  const c1 = { ts: p.openedAt + MIN, open: 100, high: 104, low: 99.8, close: 103.9 };   // rally -> stop ladder rises
  const c2 = { ts: p.openedAt + 2 * MIN, open: 103.9, high: 104.1, low: 103.6, close: 104 };
  b.updateStops(mk(104, { exitCandles: [c1, c2] }), noSignal);
  assert.equal(b.state.paperPositions.length, 1);
  const stopAfter = b.state.paperPositions[0].stop;
  // Same candles delivered again by the next scan must be a no-op (c1.low 99.8 < raised stop).
  b.updateStops(mk(104, { exitCandles: [c1, c2] }), noSignal);
  assert.equal(b.state.paperPositions.length, 1, 'replaying old candles must not stop us out');
  assert.equal(b.state.paperPositions[0].stop, stopAfter);
});

test('SHORT mirrors LONG (no early cut, trail works)', () => {
  const b = makeBroker();
  b.open(shortSig(), 'auto', true);
  for (const price of [99.7, 99.1, 98.8]) b.updateStops(mk(price), noSignal);
  assert.equal(b.state.paperPositions.length, 1);
  for (const price of [97.5, 96, 96.5]) b.updateStops(mk(price), noSignal);
  assert.equal(b.state.paperPositions.length, 1);
  b.updateStops(mk(97.4), noSignal);
  assert.equal(b.state.paperTrades[0].reason, 'TRAIL_STOP');
  assert.ok(b.state.paperTrades[0].pnl > 3);
});

test("tpMode 'fixed' closes at TP", () => {
  const b = makeBroker({ tpMode: 'fixed' });
  b.open(longSig(), 'auto', true);
  b.updateStops(mk(104.1), noSignal);
  assert.equal(b.state.paperTrades[0].reason, 'TP');
  assert.equal(b.state.paperTrades[0].exit, 104);
});

test('one trade per signal: same signalId cannot re-enter, a new candle can', () => {
  const b = makeBroker();
  assert.equal(b.open(longSig('X:1:LONG')), true);
  b.updateStops(mk(97.9), noSignal);
  assert.equal(b.state.paperPositions.length, 0);
  assert.equal(b.open(longSig('X:1:LONG')), false, 'same closed-candle signal must not re-enter');
  b.state.lastCooldown.X = Date.now() - 10_000;   // cooldown elapsed (cooldownSec=0 needs >0 ms)
  assert.equal(b.open(longSig('X:1:LONG')), false, 'still blocked after cooldown: same signal');
  assert.equal(b.open(longSig('X:2:LONG')), true, 'next candle signal is allowed');
});

test('max hold scales with the timeframe (1h signal is not killed by a 20-minute scalp limit)', () => {
  const b = makeBroker({ timeframe: '60', maxHoldMinutes: 20, maxHoldCandles: 3 });
  b.open(longSig(), 'auto', true);
  age(b, 170 * MIN);
  b.updateStops(mk(100.2), noSignal);
  assert.equal(b.state.paperPositions.length, 1, '170 min < 3 x 1h');
  age(b, 181 * MIN);
  b.updateStops(mk(100.2), noSignal);
  assert.equal(b.state.paperTrades[0].reason, 'MAX_HOLD');
  const c = makeBroker({ timeframe: '1', maxHoldMinutes: 20, maxHoldCandles: 3 });
  c.open(longSig(), 'auto', true);
  age(c, 21 * MIN);
  c.updateStops(mk(100.2), noSignal);
  assert.equal(c.state.paperTrades[0].reason, 'MAX_HOLD', '1m scalp keeps its 20 min limit');
});

test('reversal exit fires once per NEWLY CLOSED candle, not every tick', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  for (const price of [101, 102.6]) b.updateStops(mk(price), noSignal);        // reach stage >= 1
  assert.ok(b.state.paperPositions[0].stage >= 1);
  const bearish = candleTs => new Map([['X', { candleTs, rsi: 50, movePct: 0, emaFast: 99, emaSlow: 100, volX: 2, atr: 1 }]]);
  b.updateStops(mk(102.6), bearish(1000));                                      // same candle as entry -> ignored
  assert.equal(b.state.paperPositions.length, 1);
  b.updateStops(mk(102.6), bearish(2000));                                      // new closed candle -> exit
  assert.equal(b.state.paperTrades[0].reason, 'REVERSAL_EMA');
});

test('stage-0 positions ignore reversal exits (no "profit" to protect yet)', () => {
  const b = makeBroker();
  b.open(longSig(), 'auto', true);
  b.updateStops(mk(100.4), new Map([['X', { candleTs: 2000, rsi: 80, movePct: -1, emaFast: 99, emaSlow: 100, volX: 3, atr: 1 }]]));
  assert.equal(b.state.paperPositions.length, 1);
});

test('legacy v2.0 position from localStorage is migrated safely (no instant exit, sane R)', async () => {
  localStorage._d = {};
  const legacy = { paperEquity: 1000, paperPositions: [{ id: 'a', symbol: 'X', side: 'LONG', entry: 100, qty: 2, notional: 200, stop: 100.2 /* already moved to v2.0 break-even */, take: 104, openFee: 0.11, openedAt: Date.now() - MIN, riskProfile: 'medium', score: 90, candleTs: 1 }], paperTrades: [], realOrders: [], lastCooldown: {}, profileStarts: {}, feesPaid: 0, day: new Date().toDateString(), dayStartEquity: 1000 };
  localStorage.setItem('scalp.lab.state.v3', JSON.stringify(legacy));
  const b = new PaperBroker({ value: { ...DEFAULT_SETTINGS } }, { info() {} });
  const p = b.state.paperPositions[0];
  assert.ok(p.stopDistance >= 0.5, `R floor 0.5% of entry, got ${p.stopDistance}`);
  b.updateStops(mk(100.6), noSignal);
  assert.equal(b.state.paperPositions.length, 1);
});
