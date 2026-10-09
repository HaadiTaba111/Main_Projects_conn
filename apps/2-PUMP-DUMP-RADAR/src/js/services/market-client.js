/**
 * کلاینت دیتای رادار پمپ/دامپ — فقط کندل تایم‌فریم ورود (1m/3m/5m).
 * زنجیرهٔ دریافت: پراکسی هم‌مبدأ Termux → مستقیم؛ Bybit → Binance → OKX.
 * نکته: تایم‌فریم اصلی اتوتریدر اینجا بی‌معناست؛ رادار روی تایم‌فریم ریز کار می‌کند.
 */
const OKX_BARS = Object.freeze({ '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1H' });
const BINANCE_TFS = Object.freeze({ '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1h' });

const parseRows = (list, newestFirst) => (list || [])
  .map(row => ({
    ts: Number(row[0]) * (String(row[0]).length === 10 ? 1000 : 1),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }))
  .filter(c => [c.ts, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) && c.volume >= 0)
  .sort((a, b) => a.ts - b.ts)
  .slice(-120); // فقط ۱۲۰ کندل آخر برای موتور ریز‌تایم کافی است

/** تست سبک یک مسیر دیتا (برای دکمهٔ «🔌 تست اتصال») — همیشه سقف زمانی دارد. */
export async function probeUrl(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs) || 4000));
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true, ms: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, ms: Date.now() - startedAt, error: (error?.message || String(error)).slice(0, 90) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 5500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${body?.retMsg || body?.error || response.statusText || 'HTTP error'}`);
    if (body && body.retCode !== undefined && Number(body.retCode) !== 0) throw new Error(`Bybit ${body.retCode}: ${body.retMsg || 'API error'}`);
    if (body && body.code !== undefined && String(body.code) !== '0') throw new Error(`OKX ${body.code}: ${body.msg || 'API error'}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonFallback(candidates) {
  const failures = [];
  for (const candidate of candidates) {
    try {
      return { body: await fetchJson(candidate.url), route: candidate.route };
    } catch (error) {
      failures.push(`${candidate.route}: ${error?.message || 'network error'}`);
    }
  }
  throw new Error(failures.join(' | '));
}

export class MarketClient {
  constructor(settings, logger) {
    this.s = settings;
    this.log = logger;
    this.cache = new Map();
  }

  async getKlines(symbol, timeframe, { ttlMs = 6000 } = {}) {
    const key = `${symbol}:${timeframe}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < ttlMs) return cached.result;
    const result = await this.fetchKlines(symbol, timeframe);
    this.cache.set(key, { at: Date.now(), result });
    return result;
  }

  async fetchKlines(symbol, timeframe) {
    const tf = String(timeframe || this.s.value.entryTimeframe || '1');
    const failures = [];
    const source = async (name, proxyUrl, directUrl) => {
      try {
        return await fetchJsonFallback([
          { url: proxyUrl, route: 'SERVER PROXY' },
          { url: directUrl, route: 'DIRECT' }
        ]);
      } catch (error) {
        failures.push(`${name}: ${error.message}`);
        return null;
      }
    };

    // ۱) Bybit V5: same-origin proxy در Termux و سپس درخواست مستقیم.
    const bybit = await source(
      'Bybit',
      `/api/market/bybit/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(tf)}&limit=120`,
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(tf)}&limit=120`
    );
    const bybitRows = bybit?.body?.result?.list;
    if (Array.isArray(bybitRows) && bybitRows.length >= 10) {
      const candles = parseRows(bybitRows, true);
      if (candles.length >= 10) return { candles, source: `BYBIT LIVE (${bybit.route})` };
    }
    if (bybit) failures.push('Bybit: پاسخ کندل خالی/نامعتبر');

    // ۲) Binance
    const interval = BINANCE_TFS[tf] || '1m';
    const binance = await source(
      'Binance',
      `/api/market/binance/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=120`,
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=120`
    );
    if (Array.isArray(binance?.body) && binance.body.length >= 10) {
      const candles = parseRows(binance.body, false);
      if (candles.length >= 10) return { candles, source: `BINANCE LIVE (${binance.route})` };
    }
    if (binance) failures.push('Binance: پاسخ کندل خالی/نامعتبر');

    // ۳) OKX
    const inst = symbol.replace('USDT', '-USDT');
    const bar = OKX_BARS[tf] || '1m';
    const okx = await source(
      'OKX',
      `/api/market/okx/api/v5/market/candles?instId=${encodeURIComponent(inst)}&bar=${bar}&limit=100`,
      `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(inst)}&bar=${bar}&limit=100`
    );
    if (okx?.body?.data?.length >= 10) {
      const candles = parseRows(okx.body.data, true);
      if (candles.length >= 10) return { candles, source: `OKX LIVE (${okx.route})` };
    }
    if (okx) failures.push('OKX: پاسخ کندل خالی/نامعتبر');

    throw new Error(`دریافت کندل ${tf}m برای ${symbol} از Bybit/Binance/OKX ممکن نشد — ${failures.join(' | ')}`);
  }
}
