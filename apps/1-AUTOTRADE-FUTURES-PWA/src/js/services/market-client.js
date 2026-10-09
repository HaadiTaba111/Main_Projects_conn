import { mean, timeframeMs } from '../core/utils.js';
import { alignCandles, tfMs as tfMilliseconds } from '../core/timeframe.js';

// These bases are used only when the user explicitly selects Mock Local in Settings.
const MOCK_BASES = Object.freeze({
  BTCUSDT: 65000,
  ETHUSDT: 3400,
  SOLUSDT: 145,
  XRPUSDT: 0.52,
  BNBUSDT: 585,
  DOGEUSDT: 0.12,
  ADAUSDT: 0.41,
  AVAXUSDT: 28,
  LINKUSDT: 14,
  TONUSDT: 7
});

// مپ تایم‌فریم مشترک برای مسیرهای مستقیم (Direct) صرافی‌ها
const OKX_BARS = Object.freeze({ '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1H', '120': '2H', '240': '4H', 'D': '1D' });

// ⏱ هر درخواست شبکه سقف زمان دارد. بدون این سقف، روی شبکهٔ فیلترشده یک
// اتصال بی‌پاسخ می‌تواند دقیقه‌ها معلق بماند و کل حلقهٔ اسکن خودکار را بخواباند.
const DEFAULT_HTTP_TIMEOUT_MS = 4500;

export async function fetchWithTimeout(url, { timeoutMs = DEFAULT_HTTP_TIMEOUT_MS, headers = { Accept: 'application/json' } } = {}) {
  const controller = new AbortController();
  const waitMs = Math.max(500, Number(timeoutMs) || DEFAULT_HTTP_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), waitMs);
  try {
    return await fetch(url, { signal: controller.signal, headers, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export class MarketClient {
  constructor(settings, logger) {
    this.s = settings;
    this.log = logger;
    // کش کوتاه‌مدت کندل‌های تایم‌فریم ریز (Micro-Candle) برای کاهش ترافیک صرافی
    this.klineCache = new Map();
  }


  /**
   * نرمال‌سازی نهایی دیتای کندل برای همهٔ مسیرها (پروکسی/OKX):
   * هم‌ترازی روی مرز تایم‌فریم + حذف تکراری + حذف کندل در حال تشکیل +
   * ثبت کهنگی کندل بسته. این همان گامی است که «تحلیل ۱ساعته، بستن ۱دقیقه‌ای» را غیرممکن می‌کند.
   */
  normalizeMarket(symbol, payload, timeframe, { dropForming = true, now = Date.now() } = {}) {
    const ms = tfMilliseconds(timeframe);
    const aligned = alignCandles(payload.candles || [], { ms, now, dropForming });
    const keepOpen = !dropForming && payload.candles?.length ? payload.candles.at(-1) : null;
    const keptCandles = aligned.candles.length ? aligned.candles : (keepOpen ? [keepOpen] : []);
    const lastKept = keptCandles.at(-1) || null;
    return {
      ...payload,
      symbol,
      candles: keptCandles,
      tfMs: ms,
      timeframe: String(timeframe),
      lastClosedTs: aligned.lastClosedTs,
      candleAgeMs: aligned.lastClosedAgeMs,
      gapCount: aligned.gaps,
      formingDropped: aligned.formingDropped,
      lastCandle: lastKept,
      // آیا آخرین کندلِ موجود در لیست هنوز در حال تشکیل است؟ (فقط وقتی useClosedCandle=false)
      currentCandleIsOpen: !!(lastKept && lastKept.ts + ms > now + 2000)
    };
  }

  buildUrl(base, path) {
    const cleanBase = String(base || '').replace(/\/$/, '');
    const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
    if (!cleanBase) throw new Error('Market data base URL خالی است');
    return `${cleanBase}${cleanPath}`;
  }

  interpolate(path, symbol, timeframe) {
    const s = this.s.value;
    const tf = timeframe === undefined ? s.timeframe : timeframe;
    return String(path)
      .replaceAll('{symbol}', encodeURIComponent(symbol))
      .replaceAll('{timeframe}', encodeURIComponent(tf))
      .replaceAll('{category}', encodeURIComponent(s.bybitCategory || 'linear'));
  }

  // نرمال‌ساز ردیف کندل؛ خروجی همیشه به ترتیب زمانی صعودی (قدیمی → جدید) است
  // تا موتور استراتژی با candles.at(-1) آخرین کندل بسته‌شده را ببیند.
  parseCandleRows(list, { newestFirst = true, binanceExtras = false } = {}) {
    const rows = (list || [])
      .map(row => ({
        ts: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        // 🐋 فیلدهای تیکری Binance (تحلیل جریان/ضد‌نهنگ): [8]=تعداد ترید، [9]=حجم خرید تیکری
        ...(binanceExtras ? { trades: Number(row[8]), takerBuy: Number(row[9]) } : {})
      }))
      .filter(c => [c.ts, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite));
    // Bybit و OKX جدیدترین را اول می‌فرستند؛ Binance قدیمی‌ترین را اول.
    return newestFirst ? rows.reverse() : rows;
  }


  /**
   * 🛰fetch با نردبان مسیر: اول پروکسی سرورِ همین‌origin (بدون CORS، از egress سرور)،
   * بعد مستقیم از مرورگر. خطای هر مسیر جمع و در پیام نهایی می‌آید تا علت قطعی دیتا
   * همیشه قابل مشاهده باشد (Diagnose: دقیقاً کدام مسیر چرا شکست).
   */
  async fetchLadder(paths, { timeoutMs = DEFAULT_HTTP_TIMEOUT_MS } = {}) {
    const errors = [];
    for (const candidate of paths) {
      try {
        const response = await fetchWithTimeout(candidate.url, { timeoutMs });
        const text = await response.text();
        if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 120) || response.statusText}`);
        return JSON.parse(text || '{}');
      } catch (error) {
        errors.push(`${candidate.name}: ${(error?.message || String(error)).slice(0, 120)}`);
      }
    }
    throw new Error(errors.join(' | '));
  }

  async fetchJson(url, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
    const response = await fetchWithTimeout(url, { timeoutMs });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { retMsg: text.slice(0, 180) };
    }
    if (!response.ok) {
      const message = body?.retMsg || body?.error || response.statusText || 'HTTP error';
      throw new Error(`${response.status}: ${message}`);
    }
    if (body && body.retCode !== undefined && Number(body.retCode) !== 0) {
      throw new Error(`Bybit ${body.retCode}: ${body.retMsg || 'API error'}`);
    }
    return body;
  }

  isOfficialLiveBase(base) {
    const value = String(base || '').trim();
    if (value === '/api/bybit' || value.startsWith('/api/bybit/')) return true;
    try {
      const host = new URL(value).hostname.toLowerCase();
      return [
        'api.bybit.com',
        'api.bytick.com',
        'api.bybit.eu',
        'api.bybit.kz',
        'api.bybit-tr.com',
        'api.bybit.id',
        'api.bybit.nl',
        'api.bybit.ae',
        'api.byhkbit.com',
        'api.bybitgeorgia.ge',
        'api.manepa.jp'
      ].includes(host);
    } catch {
      return false;
    }
  }

  async fetchDirectLiveExchanges(symbol) {
    const s = this.s.value;
    const okxInst = symbol.replace('USDT', '-USDT-SWAP'); // 📌 قرارداد دائمی (نه اسپات)
    const pathErrors = [];

    // 1. OKX V5 — نردبان: پروکسی سرور → مستقیم مرورگر
    try {
      const bar = OKX_BARS[String(s.timeframe)] || '1H';
      const [tData, kData] = await Promise.all([
        this.fetchLadder([
          { name: 'okx-proxy', url: `/api/okx/api/v5/market/ticker?instId=${okxInst}` },
          { name: 'okx-direct', url: `https://www.okx.com/api/v5/market/ticker?instId=${okxInst}` }
        ]),
        this.fetchLadder([
          { name: 'okx-proxy', url: `/api/okx/api/v5/market/candles?instId=${okxInst}&bar=${bar}&limit=90` },
          { name: 'okx-direct', url: `https://www.okx.com/api/v5/market/candles?instId=${okxInst}&bar=${bar}&limit=90` }
        ])
      ]);

      if (tData.code === '0' && tData.data?.[0] && kData.code === '0' && Array.isArray(kData.data)) {
        const d = tData.data[0];
        const price = Number(d.last);
        const candles = this.parseCandleRows(kData.data, { newestFirst: true });
        this.lastPathErrors = '';
        // 🔧 فیکس باگ هم‌ترازی: حتی در مسیر مستقیم OKX، کندل در حال تشکیل حذف و
        // بقیه روی مرز تایم‌فریم هم‌تراز می‌شوند (قبلاً کندل باز تحلیل می‌شد!)
        return this.normalizeMarket(symbol, {
          price,
          candles,
          source: 'OKX LIVE (DIRECT)',
          exchangeTime: Number(d.ts || Date.now()),
          receivedAt: Date.now(),
          requestInfo: { tickerUrl: 'okx-direct', klineUrl: 'okx-direct' },
          tickerRaw: { symbol, lastPrice: String(price), markPrice: String(price) }
        }, this.s.value.timeframe, { dropForming: this.s.value.useClosedCandle === 'true' });
      } else {
        throw new Error(`okx: پاسخ نامعتبر (code=${tData.code}/${kData.code})`);
      }
    } catch (e) { pathErrors.push(String(e?.message || e).slice(0, 140)); }

    const detail = pathErrors.join(' | ');
    this.lastPathErrors = detail;
    throw new Error(`هیچ مسیر دیتا کار نکرد (${symbol}): ${detail || 'okx ناموفق'}`);
  }

  /**
   * دریافت کندل‌های یک تایم‌فریم دلخواه (مخصوصاً ریز: 1m/3m) برای فیلتر
   * Micro-Candle. با کش ۱۵ ثانیه‌ای تا اسکن‌های ۵ ثانیه‌ای ترافیک اضافه نسازند.
   * مسیرها همان زنجیره ضدتحریم اصلی است: پروکسی Bybit → OKX مستقیم.
   */
  async getKlines(symbol, timeframe, { ttlMs = 15000 } = {}) {
    const key = `${symbol}:${timeframe}`;
    const cached = this.klineCache.get(key);
    if (cached && Date.now() - cached.at < ttlMs) return cached.result;
    const result = await this.fetchKlines(symbol, timeframe);
    this.klineCache.set(key, { at: Date.now(), result });
    return result;
  }

  /** پایه‌های واجدشرط: پایهٔ تنظیمات + پراکسی هم‌مبدأ همین سرور (ضد تنظیمات قدیمی/فیلترشده). */
  liveBases(base, mode) {
    const bases = [base];
    if (mode === 'live' && String(base) !== '/api/bybit') bases.push('/api/bybit');
    return [...new Set(bases.filter(Boolean))];
  }

  async fetchKlines(symbol, timeframe) {
    const s = this.s.value;
    if (s.dataMode === 'mock-local') {
      return { candles: this.mock(symbol).candles, source: 'MOCK LOCAL (EXPLICIT)', timeframe: String(timeframe) };
    }
    const mode = s.dataMode === 'mock-server' ? 'mock-server' : 'live';
    const errors = [];
    for (const base of this.liveBases(mode === 'mock-server' ? s.mockBaseUrl : s.dataBaseUrl, mode)) {
      try {
        const url = this.buildUrl(base, this.interpolate(s.klinePath, symbol, timeframe));
        const body = await this.fetchJson(url);
        const candles = this.parseCandleRows(body?.result?.list, { newestFirst: true });
        if (candles.length >= 5) {
          const aligned = alignCandles(candles, { ms: tfMilliseconds(timeframe), now: Date.now(), dropForming: true });
          if (aligned.candles.length >= 4) {
            return { candles: aligned.candles, source: mode === 'live' ? 'BYBIT LIVE' : 'MOCK SERVER (EXPLICIT)', timeframe: String(timeframe), lastClosedTs: aligned.lastClosedTs };
          }
          errors.push(`${base}: کندل کافی نبود`);
        } else {
          errors.push(`${base}: پاسخ کندل خالی`);
        }
      } catch (error) {
        errors.push(`${base}: ${(error?.message || String(error)).slice(0, 90)}`);
      }
    }
    try {
      return await this.fetchDirectKlines(symbol, timeframe);
    } catch (error) {
      throw new Error(`${error.message} | ${errors.join(' | ')}`.slice(0, 400));
    }
  }

  /**
   * کندل پشتیبان وقتی مسیر اصلی جواب نداد. ترتیب: پراکسی سرور (OKX) و بعد مستقیم. هر تلاش سقف زمانی دارد تا اسکن خودکار هرگز معلق نماند.
   */
  async fetchDirectKlines(symbol, timeframe) {
    const okxInst = symbol.replace('USDT', '-USDT-SWAP'); // 📌 قرارداد دائمی (نه اسپات)
    const bar = OKX_BARS[String(timeframe)] || '1m';
    const okxCandles = body => (body?.code === '0' && Array.isArray(body.data) ? { rows: body.data, newestFirst: true } : null);
    const attempts = [
      { name: 'okx-proxy', url: `/api/okx/api/v5/market/candles?instId=${okxInst}&bar=${bar}&limit=60`, source: 'OKX LIVE (SERVER PROXY)', parse: okxCandles },
      { name: 'okx-direct', url: `https://www.okx.com/api/v5/market/candles?instId=${okxInst}&bar=${bar}&limit=60`, source: 'OKX LIVE (DIRECT)', parse: okxCandles },
    ];

    const errors = [];
    for (const attempt of attempts) {
      try {
        const response = await fetchWithTimeout(attempt.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = attempt.parse(await response.json());
        if (!parsed) throw new Error('پاسخ نامعتبر');
        const candles = this.parseCandleRows(parsed.rows, { newestFirst: parsed.newestFirst });
        const aligned = alignCandles(candles, { ms: tfMilliseconds(timeframe), now: Date.now(), dropForming: true });
        if (aligned.candles.length >= 4) {
          this.lastPathErrors = '';
          return { candles: aligned.candles, source: attempt.source, timeframe: String(timeframe), lastClosedTs: aligned.lastClosedTs };
        }
        throw new Error(`کندل کافی نیست (${aligned.candles.length})`);
      } catch (error) {
        errors.push(`${attempt.name}: ${(error?.message || String(error)).slice(0, 90)}`);
      }
    }
    this.lastPathErrors = errors.join(' | ');
    throw new Error(`دریافت کندل ${timeframe}m برای ${symbol} ممکن نشد — ${this.lastPathErrors}`);
  }

  async get(symbol) {
    const s = this.s.value;
    if (s.dataMode === 'mock-local') return this.mock(symbol);

    const mode = s.dataMode === 'mock-server' ? 'mock-server' : 'live';
    const base = mode === 'mock-server' ? s.mockBaseUrl : s.dataBaseUrl;

    // پایهٔ تنظیمات اول امتحان می‌شود؛ اگر جواب نداد، پراکسی هم‌مبدأ همین سرور
    // (که خودش Bybit → OKX را زنجیره می‌کند) و در نهایت مسیر مستقیم.
    const errors = [];
    for (const candidate of this.liveBases(base, mode)) {
      const tickerUrl = this.buildUrl(candidate, this.interpolate(s.tickerPath, symbol));
      const klineUrl = this.buildUrl(candidate, this.interpolate(s.klinePath, symbol));
      try {
        const [ticker, kline] = await Promise.all([
          this.fetchJson(tickerUrl),
          this.fetchJson(klineUrl)
        ]);
        const tickerRow = ticker?.result?.list?.[0];
        const price = Number(tickerRow?.lastPrice || tickerRow?.markPrice || 0);
        const rawCandles = this.parseCandleRows(kline?.result?.list, { newestFirst: true });
        const normalized = this.normalizeMarket(symbol, {
          price, candles: rawCandles,
          exchangeTime: Number(ticker?.time || kline?.time || 0),
          receivedAt: Date.now(),
          requestInfo: { tickerUrl, klineUrl },
          tickerRaw: {
            symbol: tickerRow?.symbol || symbol,
            lastPrice: tickerRow?.lastPrice || null,
            markPrice: tickerRow?.markPrice || null,
            indexPrice: tickerRow?.indexPrice || null,
            volume24h: tickerRow?.volume24h || null,
            turnover24h: tickerRow?.turnover24h || null,
            fundingRate: tickerRow?.fundingRate ?? null,
            nextFundingTime: tickerRow?.nextFundingTime ?? null
          }
        }, s.timeframe, { dropForming: s.useClosedCandle === 'true' });
        if (price && normalized.candles.length >= 10) {
          normalized.source = mode === 'live' ? 'BYBIT LIVE' : 'MOCK SERVER (EXPLICIT)';
          return normalized;
        }
        errors.push(`${candidate}: دیتای ناقص (price=${price || 0}, candles=${normalized.candles.length})`);
      } catch (error) {
        errors.push(`${candidate}: ${(error?.message || String(error)).slice(0, 90)}`);
      }
    }

    const baseErrors = errors.join(' | ');
    this.lastPathErrors = baseErrors;
    try {
      return await this.fetchDirectLiveExchanges(symbol);
    } catch (error) {
      // خطای پایه‌های اصلی اول می‌آید تا در پایان‌بندی متن هرگز حذف نشود.
      throw new Error(`${baseErrors} | ${error.message}`.slice(0, 600));
    }
  }

  mock(symbol) {
    const base = MOCK_BASES[symbol] || 100;
    const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    let price = base * (1 + Math.sin(Date.now() / 160000 + seed) / 80);
    const candles = [];

    // 🔧 کندل‌های Mock هم دقیقاً مثل دیتای واقعی روی مرز تایم‌فریم می‌نشینند
    // و آخرین کندل «بسته» است — تا تست UI روی هر تایم‌فریمی رفتار واقعی بدهد.
    const ms = tfMilliseconds(this.s.value.timeframe);
    const now = Date.now();
    const lastClosedStart = Math.floor(now / ms) * ms - ms;
    for (let i = 89; i >= 0; i -= 1) {
      const hot = i > 84;
      const open = price;
      price = Math.max(
        0.0001,
        price * (1 + Math.sin((now / 60000 + i + seed) / 9) * 0.001
          + (hot ? (Math.random() - 0.38) * 0.012 : (Math.random() - 0.5) * 0.004))
      );
      const high = Math.max(open, price) * (1 + Math.random() * 0.0025);
      const low = Math.min(open, price) * (1 - Math.random() * 0.0025);
      const volume = (900 + Math.random() * 900) * (hot ? 1.7 + Math.random() * 2.5 : 1);
      candles.push({
        ts: lastClosedStart - i * ms,
        open,
        high,
        low,
        close: price,
        volume
      });
    }

    return {
      symbol,
      price,
      candles,
      source: 'MOCK LOCAL (EXPLICIT)',
      exchangeTime: 0,
      receivedAt: now,
      tfMs: ms,
      timeframe: String(this.s.value.timeframe),
      lastClosedTs: candles.at(-1).ts,
      candleAgeMs: now - (candles.at(-1).ts + ms),
      gapCount: 0,
      formingDropped: true,
      lastCandle: candles.at(-1),
      currentCandleIsOpen: false,
      requestInfo: { tickerUrl: 'mock-local', klineUrl: 'mock-local' },
      tickerRaw: { symbol, lastPrice: String(price), markPrice: String(price), indexPrice: null, volume24h: null, turnover24h: null },
      avgVol: mean(candles.map(c => c.volume))
    };
  }
}
