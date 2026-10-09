import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
const { DEFAULT_SETTINGS } = await import('../src/js/core/config.js');
const { MarketClient } = await import('../src/js/services/market-client.js');

const T0 = Date.now() - 100 * 3_600_000, H = 3_600_000;
const kl = n => Array.from({ length: n }, (_, i) => [String(T0 + (n - 1 - i) * H), '100', '101', '99', '100.5', '10', '1000']); // newest-first
const reply = (body, source) => new Response(JSON.stringify(body), { status: 200, headers: source ? { 'x-data-source': source, 'content-type': 'application/json' } : { 'content-type': 'application/json' } });
const ticker = { retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '100.5' }] }, time: 1 };
const client = (over = {}) => new MarketClient({ value: { ...DEFAULT_SETTINGS, ...over } }, { info() {} });
const stub = fn => { globalThis.fetch = async url => fn(String(url)); };

test('ticker and candles from the SAME venue are accepted and labelled', async () => {
  stub(url => reply(url.includes('/kline') ? { retCode: 0, result: { list: kl(60) } } : ticker, 'OKX SWAP'));
  const m = await client().get('BTCUSDT');
  assert.equal(m.source, 'OKX SWAP LIVE');
  assert.ok(m.lastCandle.ts > m.candles[0].ts, 'candles are oldest->newest after the client reverse');
});

test('ticker from one venue + candles from another is REJECTED', async () => {
  stub(url => url.includes('/kline') ? reply({ retCode: 0, result: { list: kl(60) } }, 'OKX SWAP') : reply(ticker, 'BYBIT'));
  await assert.rejects(client().get('BTCUSDT'), /یکی نیست/);
});

test('official Bybit host called directly (no proxy header) is accepted as BYBIT', async () => {
  stub(url => reply(url.includes('/kline') ? { retCode: 0, result: { list: kl(60) } } : ticker, null));
  const m = await client({ dataBaseUrl: 'https://api.bytick.com' }).get('BTCUSDT');
  assert.equal(m.source, 'BYBIT LIVE');
});

test('proxy response without venue header is refused (source unknown = not trusted)', async () => {
  stub(url => reply(url.includes('/kline') ? { retCode: 0, result: { list: kl(60) } } : ticker, null));
  await assert.rejects(client().get('BTCUSDT'), /منبع داده مشخص نیست/);
});

test('exit candles: only candles that START after the entry, oldest-first', async () => {
  const since = 1_000_000;
  const row = ts => [String(ts), '100', '101', '99', '100', '1'];
  stub(() => reply({ retCode: 0, result: { list: [row(since + 120_000), row(since + 60_000), row(since), row(since - 60_000)] } }, 'BYBIT'));
  const out = await client().getExitCandles('BTCUSDT', since);
  assert.deepEqual(out.map(c => c.ts), [since + 60_000, since + 120_000]);
});
