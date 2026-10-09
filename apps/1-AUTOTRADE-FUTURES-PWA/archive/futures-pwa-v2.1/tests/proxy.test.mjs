import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const SERVER = process.env.SERVER_UNDER_TEST || path.join(here, '..', 'server.js');
let nextPort = 18700 + Math.floor(Math.random() * 500);

async function withServer(state, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-'));
  const stateFile = path.join(dir, 'state.json'), logFile = path.join(dir, 'calls.log');
  fs.writeFileSync(stateFile, JSON.stringify(state)); fs.writeFileSync(logFile, '');
  const port = nextPort++;
  const child = spawn(process.execPath, ['--import', path.join(here, 'mock-fetch.mjs'), SERVER], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MOCK_STATE: stateFile, MOCK_LOG: logFile }, stdio: 'ignore'
  });
  try {
    for (let i = 0; i < 50; i += 1) {
      try { await fetch(`http://127.0.0.1:${port}/api/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const get = async p => { const r = await fetch(`http://127.0.0.1:${port}${p}`); return { status: r.status, source: r.headers.get('x-data-source'), body: await r.json() }; };
    return await fn(get, () => fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean));
  } finally { child.kill(); }
}
const KL = '/api/bybit/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&limit=200';
const TK = '/api/bybit/v5/market/tickers?category=linear&symbol=BTCUSDT';
const newestFirst = list => list.every((row, i) => i === 0 || Number(list[i - 1][0]) > Number(row[0]));

test('Bybit OK: passthrough, labelled BYBIT', () => withServer({ bybit: 'ok', okx: 'ok', binance: 'ok' }, async get => {
  const k = await get(KL);
  assert.equal(k.status, 200); assert.equal(k.source, 'BYBIT');
  assert.ok(newestFirst(k.body.result.list));
}));

test('Bybit blocked -> OKX PERPETUAL SWAP (not spot), newest-first, same venue for ticker+kline', () => withServer({ bybit: 'blocked', okx: 'ok', binance: 'ok' }, async (get, calls) => {
  const t = await get(TK), k = await get(KL);
  assert.equal(t.source, 'OKX SWAP'); assert.equal(k.source, 'OKX SWAP');
  assert.ok(newestFirst(k.body.result.list), 'OKX candles must stay newest-first (client reverses them)');
  assert.equal(k.body.result.list[0][5], '12.5', 'volume = base-coin amount, no invention');
  assert.equal(t.body.result.list[0].markPrice, '', 'fields the venue does not provide stay empty');
  const log = calls().join('\n');
  assert.match(log, /BTC-USDT-SWAP/); assert.doesNotMatch(log, /instId=BTC-USDT(&|$)/);
  assert.doesNotMatch(log, /coingecko|\/\/api\.binance\.com/);
}));

test('Bybit + OKX down -> Binance USD-M FUTURES, flipped to newest-first', () => withServer({ bybit: 'blocked', okx: 'down', binance: 'ok' }, async (get, calls) => {
  const k = await get(KL);
  assert.equal(k.source, 'BINANCE FUTURES');
  assert.ok(newestFirst(k.body.result.list));
  assert.match(calls().join('\n'), /fapi\.binance\.com\/fapi\/v1\/klines/);
}));

test('everything down -> explicit 503, NO data, CoinGecko/spot never touched', () => withServer({ bybit: 'blocked', okx: 'down', binance: 'down' }, async (get, calls) => {
  const k = await get(KL);
  assert.equal(k.status, 503);
  assert.equal(k.body.result, undefined);
  assert.doesNotMatch(calls().join('\n'), /coingecko|\/\/api\.binance\.com/);
}));

test('input validation: bad symbol 400, unsupported interval 400, unknown endpoint 404 (no silent BTC default)', () => withServer({ bybit: 'ok' }, async get => {
  assert.equal((await get('/api/bybit/v5/market/tickers?symbol=BTC')).status, 400);
  assert.equal((await get('/api/bybit/v5/market/tickers')).status, 400);
  assert.equal((await get('/api/bybit/v5/market/kline?symbol=BTCUSDT&interval=7')).status, 400);
  assert.equal((await get('/api/bybit/v5/market/orderbook?symbol=BTCUSDT')).status, 404);
}));
