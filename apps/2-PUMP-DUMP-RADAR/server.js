// Pump/Dump Lab — سرور استاتیک مینیمال + پل یک‌طرفه /api/hot
// این اپ کاملاً مستقل از Futures Scalp Lab است و هیچ وابستگی runtime به آن ندارد.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8790);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// آخرین snapshot نمادهای داغ که کلاینت (رادار مرورگر) با POST به‌روز می‌کند.
// اتوتریدر Futures Scalp Lab می‌تواند به‌صورت اختیاری همین endpoint را بخواند (پل یک‌طرفه).
let hotSnapshot = { updatedAt: 0, symbols: [] };

// Fixed allowlist: never accept an arbitrary upstream URL from a browser request.
const MARKET_PROXY_ROUTES = [
  {
    name: 'BYBIT', prefix: '/api/market/bybit', base: 'https://api.bybit.com',
    allow: pathname => ['/v5/market/tickers', '/v5/market/kline'].includes(pathname)
  },
  {
    name: 'BINANCE', prefix: '/api/market/binance', base: 'https://api.binance.com',
    allow: pathname => ['/api/v3/ticker/24hr', '/api/v3/klines'].includes(pathname)
  },
  {
    name: 'OKX', prefix: '/api/market/okx', base: 'https://www.okx.com',
    allow: pathname => ['/api/v5/market/tickers', '/api/v5/market/candles'].includes(pathname)
  },
  {
    name: 'COINGECKO', prefix: '/api/market/coingecko', base: 'https://api.coingecko.com',
    allow: pathname => pathname === '/api/v3/coins/markets' || /^\/api\/v3\/coins\/[a-z0-9-]+\/ohlc$/.test(pathname)
  }
];

const server = http.createServer(async (req, res) => {
  // URL routing only needs the request path; do not trust the Host header as a URL base.
  const url = new URL(req.url || '/', 'http://localhost');
  const send = (code, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(code, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': type,
      ...extra
    });
    res.end(body);
  };

  if (req.method === 'OPTIONS') return send(204, '');

  if (url.pathname === '/api/hot') {
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try {
          const body = JSON.parse(raw || '{}');
          const symbols = Array.isArray(body.symbols)
            ? body.symbols.filter(s => typeof s === 'string' && s.length < 24).slice(0, 40)
            : [];
          hotSnapshot = { updatedAt: Date.now(), symbols, active: Array.isArray(body.active) ? body.active.slice(0, 40) : [] };
          send(200, JSON.stringify({ ok: true }));
        } catch {
          send(400, JSON.stringify({ ok: false, error: 'bad json' }));
        }
      });
      return;
    }
    return send(200, JSON.stringify(hotSnapshot));
  }

  if (url.pathname === '/api/health') return send(200, JSON.stringify({ ok: true, service: 'pump-dump-lab' }));

  if (url.pathname.startsWith('/api/market/')) {
    if (req.method !== 'GET') return send(405, JSON.stringify({ ok: false, error: 'GET only' }));
    const route = MARKET_PROXY_ROUTES.find(item => url.pathname.startsWith(item.prefix));
    if (!route) return send(404, JSON.stringify({ ok: false, error: 'market source not found' }));
    const upstreamPath = url.pathname.slice(route.prefix.length) || '/';
    if (!route.allow(upstreamPath)) return send(404, JSON.stringify({ ok: false, error: 'market endpoint not allowed' }));

    try {
      const target = new URL(upstreamPath, route.base);
      url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
      const upstream = await fetch(target, {
        headers: { Accept: 'application/json', 'User-Agent': 'pump-dump-lab/1.0' },
        signal: AbortSignal.timeout(6000)
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      return send(upstream.status, body, upstream.headers.get('content-type') || 'application/json; charset=utf-8', {
        'X-Data-Source': `${route.name} LIVE SERVER PROXY`
      });
    } catch (error) {
      return send(502, JSON.stringify({
        ok: false,
        source: `${route.name} SERVER PROXY`,
        error: String(error?.message || 'upstream unavailable').slice(0, 200)
      }));
    }
  }

  // Static files — decode first, then resolve and enforce a path-boundary check.
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(400, 'Bad URL', 'text/plain; charset=utf-8');
  }
  const relativePath = (pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, ''));
  const full = path.resolve(__dirname, relativePath);
  if (full !== __dirname && !full.startsWith(`${__dirname}${path.sep}`)) {
    return send(403, JSON.stringify({ error: 'forbidden' }));
  }
  try {
    const data = await readFile(full);
    return send(200, data, MIME[path.extname(full)] || 'application/octet-stream');
  } catch {
    return send(404, JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Pump/Dump Lab (standalone): http://localhost:${PORT}`);
  console.log('📡 Whole-market radar: Bybit → Binance → OKX → CoinGecko (server proxy + browser fallback) | 🔊 Audio alerts | 🧭 Independent from futures autotrader\n');
});
