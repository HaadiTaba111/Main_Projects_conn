import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(fileURLToPath(new URL('.', import.meta.url))).replace(new RegExp(`${sep}$`), '');
const PORT = Number(process.env.PORT || 8787);
const BYBIT_BASE_URL = process.env.BYBIT_API_URL || process.env.BYBIT_BASE_URL || 'https://api.bybit.com';
const OKX_BASE = 'https://www.okx.com/api/v5';
const BINANCE_FUTURES_BASE = process.env.BINANCE_FAPI_URL || 'https://fapi.binance.com/fapi/v1';
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function headers(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-Webhook-Token',
    ...extra
  };
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra
  }));
  res.end(JSON.stringify(body));
}

function mockCandles(symbol, interval = '60', limit = 90) {
  const bases = { BTCUSDT: 64500, ETHUSDT: 3450, SOLUSDT: 145, XRPUSDT: 0.52, BNBUSDT: 585, DOGEUSDT: 0.12, ADAUSDT: 0.41, AVAXUSDT: 28, LINKUSDT: 14, TONUSDT: 7 };
  const base = bases[symbol] || 100;
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let price = base * (1 + Math.sin(Date.now() / 160000 + seed) / 80);
  const out = [];
  const minutes = Number(interval) || 60;
  const safeLimit = Math.max(30, Math.min(200, Number(limit) || 90));

  for (let index = 0; index < safeLimit; index += 1) {
    const hot = index > safeLimit - 6;
    const open = price;
    price = Math.max(0.0001, price * (
      1 + Math.sin((Date.now() / 60000 + index + seed) / 9) * 0.001
      + (hot ? (Math.random() - 0.38) * 0.012 : (Math.random() - 0.5) * 0.004)
    ));
    const high = Math.max(open, price) * (1 + Math.random() * 0.0025);
    const low = Math.min(open, price) * (1 - Math.random() * 0.0025);
    const volume = (900 + Math.random() * 900) * (hot ? 1.7 + Math.random() * 2.5 : 1);
    const timestamp = Date.now() - (safeLimit - index) * minutes * 60_000;
    out.push([String(timestamp), String(open), String(high), String(low), String(price), String(volume), String(volume * price)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LIVE FUTURES DATA PROXY — real perpetual-futures data only.
// Order: Bybit linear -> OKX USDT-SWAP -> Binance USD-M futures.
// Rules (the previous version broke all three):
//  * Every fallback venue is a FUTURES venue (the old OKX/Binance tiers were SPOT).
//  * CoinGecko is gone: it is spot/aggregated, ignores the requested interval and
//    its volume was fabricated, which polluted the volume-spike score.
//  * No invented fields: if a venue does not provide a value it is left empty.
//  * Every response carries x-data-source so the client can refuse to mix a
//    ticker from one venue with candles from another.
//  * Candle order is ALWAYS newest-first (Bybit format; the client reverses it).
//  * A venue that failed is skipped for VENUE_COOLDOWN_MS so ticker and kline
//    of the same scan come from the same venue.
// ---------------------------------------------------------------------------
const SYMBOL_RE = /^[A-Z0-9]{3,20}USDT$/;
const VENUE_COOLDOWN_MS = 60_000;
const venueDownUntil = { bybit: 0, okx: 0, binance: 0 };

const OKX_BAR = { '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1H', '120': '2H', '240': '4H', 'D': '1D', 'W': '1W' };
const BINANCE_INTERVAL = { '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '120': '2h', '240': '4h', 'D': '1d', 'W': '1w' };

const toOkxSwapId = symbol => `${symbol.slice(0, -4)}-USDT-SWAP`;

async function getJson(url, timeoutMs = 3500) {
  const resp = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'futures-scalp-lab/2.1' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

const clampLimit = (value, max) => Math.max(30, Math.min(max, Number(value) || 200));

async function okxTicker(symbol) {
  const data = await getJson(`${OKX_BASE}/market/ticker?instId=${toOkxSwapId(symbol)}`);
  const d = data?.data?.[0];
  if (data?.code !== '0' || !d || !(Number(d.last) > 0)) throw new Error(`OKX ticker: ${data?.msg || 'no data'}`);
  return {
    symbol, lastPrice: String(d.last), markPrice: '', indexPrice: '',
    highPrice24h: String(d.high24h || ''), lowPrice24h: String(d.low24h || ''),
    prevPrice24h: String(d.open24h || ''), volume24h: String(d.volCcy24h || ''), turnover24h: ''
  };
}

async function okxKline(symbol, interval, limit) {
  const bar = OKX_BAR[interval];
  const data = await getJson(`${OKX_BASE}/market/candles?instId=${toOkxSwapId(symbol)}&bar=${bar}&limit=${clampLimit(limit, 300)}`);
  if (data?.code !== '0' || !Array.isArray(data.data) || !data.data.length) throw new Error(`OKX kline: ${data?.msg || 'empty'}`);
  // OKX is already newest-first (same as Bybit). Volume = base-coin amount (k[6]),
  // comparable to Bybit linear volume. Do NOT reverse here.
  return data.data.map(k => [String(k[0]), String(k[1]), String(k[2]), String(k[3]), String(k[4]), String(k[6]), String(k[7] ?? '')]);
}

async function binanceTicker(symbol) {
  const d = await getJson(`${BINANCE_FUTURES_BASE}/ticker/24hr?symbol=${symbol}`);
  if (!(Number(d?.lastPrice) > 0)) throw new Error('Binance futures ticker: no data');
  return {
    symbol, lastPrice: String(d.lastPrice), markPrice: '', indexPrice: '',
    highPrice24h: String(d.highPrice), lowPrice24h: String(d.lowPrice),
    prevPrice24h: String(d.openPrice), volume24h: String(d.volume), turnover24h: String(d.quoteVolume)
  };
}

async function binanceKline(symbol, interval, limit) {
  const data = await getJson(`${BINANCE_FUTURES_BASE}/klines?symbol=${symbol}&interval=${BINANCE_INTERVAL[interval]}&limit=${clampLimit(limit, 1500)}`);
  if (!Array.isArray(data) || !data.length) throw new Error('Binance futures kline: empty');
  // Binance is oldest-first -> flip to newest-first.
  return data.map(k => [String(k[0]), String(k[1]), String(k[2]), String(k[3]), String(k[4]), String(k[5]), String(k[7])]).reverse();
}

async function proxyBybit(req, res, url) {
  if (req.method !== 'GET') return json(res, 405, { retCode: -1, retMsg: 'GET only' });
  const suffix = url.pathname.replace(/^\/api\/bybit/, '') || '/';
  const isTicker = suffix === '/v5/market/tickers';
  const isKline = suffix === '/v5/market/kline';
  if (!isTicker && !isKline) return json(res, 404, { retCode: -1, retMsg: 'UNSUPPORTED_ENDPOINT' });

  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return json(res, 400, { retCode: -1, retMsg: 'INVALID_SYMBOL (only USDT perpetuals, e.g. BTCUSDT)' });
  const interval = url.searchParams.get('interval') || '60';
  const limit = url.searchParams.get('limit') || '200';
  if (isKline && (!OKX_BAR[interval] || !BINANCE_INTERVAL[interval])) {
    return json(res, 400, { retCode: -1, retMsg: `UNSUPPORTED_INTERVAL ${interval}` });
  }

  const errors = [];
  const now = Date.now();

  // Tier 1: Bybit linear (official)
  if (now >= venueDownUntil.bybit) {
    try {
      const target = new URL(suffix, `${BYBIT_BASE_URL.replace(/\/$/, '')}/`);
      url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
      const upstream = await fetch(target, {
        headers: { Accept: 'application/json', 'User-Agent': 'futures-scalp-lab/2.1' },
        signal: AbortSignal.timeout(3000)
      });
      if (upstream.ok) {
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-data-source': 'BYBIT' }));
        res.end(body);
        return true;
      }
      throw new Error(`HTTP ${upstream.status}`);
    } catch (err) {
      venueDownUntil.bybit = Date.now() + VENUE_COOLDOWN_MS;
      errors.push(`bybit: ${err.message}`);
    }
  } else {
    errors.push('bybit: cooling down');
  }

  // Tier 2: OKX perpetual swap, Tier 3: Binance USD-M futures
  const tiers = [
    { id: 'okx', label: 'OKX SWAP', ticker: okxTicker, kline: okxKline },
    { id: 'binance', label: 'BINANCE FUTURES', ticker: binanceTicker, kline: binanceKline }
  ];
  for (const tier of tiers) {
    if (Date.now() < venueDownUntil[tier.id]) { errors.push(`${tier.id}: cooling down`); continue; }
    try {
      const result = isTicker
        ? { category: 'linear', list: [await tier.ticker(symbol)] }
        : { symbol, category: 'linear', list: await tier.kline(symbol, interval, limit) };
      return json(res, 200, { retCode: 0, retMsg: `OK (${tier.label})`, result, time: Date.now() }, { 'x-data-source': tier.label });
    } catch (err) {
      venueDownUntil[tier.id] = Date.now() + VENUE_COOLDOWN_MS;
      errors.push(`${tier.id}: ${err.message}`);
    }
  }

  // Nothing real is reachable -> explicit error. Never fabricate data.
  return json(res, 503, {
    retCode: -1,
    retMsg: 'ALL_LIVE_FUTURES_VENUES_UNREACHABLE',
    error: 'No live futures market connection; check internet/VPN',
    details: errors
  });
}

// Explicit MOCK mode (only used when user chooses Mock Local/Server)
function mockBybit(url, res) {
  if (url.pathname.endsWith('/v5/market/tickers')) {
    const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
    const last = Number(mockCandles(symbol, '60', 2).at(-1)[4]);
    return json(res, 200, {
      retCode: 0,
      retMsg: 'OK (EXPLICIT MOCK)',
      result: {
        category: 'linear',
        list: [{
          symbol,
          lastPrice: String(last),
          markPrice: String(last),
          indexPrice: String(last),
          volume24h: String(1_000_000 + Math.random() * 5_000_000),
          turnover24h: String(last * 1_000_000)
        }]
      }
    }, { 'x-data-source': 'MOCK SERVER EXPLICIT' });
  }
  if (url.pathname.endsWith('/v5/market/kline')) {
    const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
    const interval = url.searchParams.get('interval') || '60';
    const limit = url.searchParams.get('limit') || '90';
    return json(res, 200, {
      retCode: 0,
      retMsg: 'OK (EXPLICIT MOCK)',
      result: {
        symbol,
        category: 'linear',
        list: mockCandles(symbol, interval, limit).reverse()
      }
    }, { 'x-data-source': 'MOCK SERVER EXPLICIT' });
  }
  return json(res, 404, { retCode: -1, retMsg: 'Unknown mock market route' });
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function routeApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers());
    res.end();
    return true;
  }
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      bybitBaseUrl: BYBIT_BASE_URL,
      mode: 'live-futures-failover',
      exchanges: ['Bybit linear', 'OKX USDT-SWAP', 'Binance USD-M futures'],
      venueDownUntil
    });
  }
  if (url.pathname.startsWith('/api/bybit/v5/market/')) {
    return proxyBybit(req, res, url);
  }
  if (url.pathname.startsWith('/api/mock/bybit/v5/market/')) {
    return mockBybit(url, res);
  }
  if (url.pathname === '/api/lbank/order' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      return json(res, 200, {
        ok: true,
        mode: 'DRY_RUN_ONLY',
        exchange: 'lbank-futures',
        acceptedAt: new Date().toISOString(),
        orderId: `dry_${Math.random().toString(36).slice(2)}`,
        received: body
      });
    } catch (error) {
      return json(res, 400, { ok: false, mode: 'DRY_RUN_ONLY', error: error.message });
    }
  }
  return json(res, 404, { ok: false, error: 'API route not found' });
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, headers({ 'content-type': 'text/plain; charset=utf-8' }));
    res.end('Bad URL');
    return;
  }
  const relative = (pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  const file = normalize(join(ROOT, relative));
  if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
    res.writeHead(403, headers({ 'content-type': 'text/plain; charset=utf-8' }));
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) throw new Error('not a file');
    const data = await readFile(file);
    res.writeHead(200, headers({
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    }));
    res.end(data);
  } catch {
    res.writeHead(404, headers({ 'content-type': 'text/plain; charset=utf-8' }));
    res.end('404 Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await routeApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    if (!res.headersSent) json(res, 500, { ok: false, error: error.message });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n🚀 Futures Scalp Lab (Live Futures Failover): http://${HOST}:${PORT}`);
  console.log(`📡 Real-Time Exchanges: Bybit linear -> OKX USDT-SWAP -> Binance USD-M futures`);
  console.log('🛡️  Zero fake data in LIVE mode; 100% real market prices.\n');
});
