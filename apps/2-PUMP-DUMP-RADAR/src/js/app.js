import { $, ignitionSummaryText } from './core/utils.js';
import { readJson, writeJson } from './core/utils.js';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './core/config.js';
import { Logger } from './services/logger.js';
import { PumpRadar } from './services/radar.js';
import { AudioAlerts } from './services/audio-alerts.js';
import { MarketClient, probeUrl } from './services/market-client.js';
import { IgnitionStrategy } from './services/ignition.js';
import { PaperBroker } from './services/paper-broker.js';
import { DashboardView } from './ui/view.js';
import { SignalValidator } from './services/signal-validator.js';

class SettingsStore {
  constructor() {
    this.value = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...readJson(STORAGE_KEYS.settings, {}) };
  }
  save(next = this.value) {
    this.value = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...next };
    writeJson(STORAGE_KEYS.settings, this.value);
  }
  reset() {
    this.save(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  }
}

// ⏱ سقف زمان کار هر نماد و سقف عمر یک اسکن معلق — تضمین می‌کند حلقهٔ خودکار هرگز نخوابد.
const SCAN_SYMBOL_TIMEOUT_MS = 25000;
const SCAN_WATCHDOG_MS = 90000;

const withDeadline = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label}: مهلت ${Math.round(ms / 1000)} ثانیه تمام شد`)), ms);
  promise.then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); }
  );
});

/**
 * Pump/Dump Lab — اپ مستقل. چون اینجا فقط «یک» موتور (رادار + Ignition) دارد،
 * پول رادار همان حلقه اصلی است؛ برخلاف اتوتریدر که هیچ چیز نباید اسکنش را معطل کند.
 */
export class PumpDumpApp {
  constructor() {
    this.settings = new SettingsStore();
    this.logger = new Logger();
    this.radar = new PumpRadar(this.settings, this.logger);
    this.audio = new AudioAlerts(this.settings, this.logger);
    this.market = new MarketClient(this.settings, this.logger);
    this.strategy = new IgnitionStrategy(this.settings);
    this.paper = new PaperBroker(this.settings, this.logger);
    this.signals = new Map();
    this.marketData = new Map();
    this.blockReasons = new Map();
    this.timer = null;
    this.timerGeneration = 0;
    this.scanInFlight = false;
    this.scanStartedAt = 0;
    this.pendingManualScan = false;
    this.lastKlineErrorLog = new Map();
    // ✅ اعتبارسنج رادار — زمان قضاوت و آستانهٔ حرکت، زنده از Settings (v1.2.2)
    const svSet = this.settings.value;
    this.signalValidator = new SignalValidator({
      delayMs: Math.max(1, Number(svSet.radarCheckMinutes) || 10) * 60000,
      thresholdPct: Number(svSet.radarThresholdPct) > 0 ? Number(svSet.radarThresholdPct) : 1.5,
      persistKey: 'pdvp_signal_validator_v1'
    });
    this.view = new DashboardView(this);
  }

  /** نگهبان اسکن معلق — اگر اسکنی بیش از حد مجاز در جریان بماند، قفل آزاد می‌شود. */
  guardStuckScan(now = Date.now()) {
    if (!this.scanInFlight) return false;
    if (!this.scanStartedAt || now - this.scanStartedAt < SCAN_WATCHDOG_MS) return false;
    const stuckSec = Math.round((now - this.scanStartedAt) / 1000);
    this.logger.info('SCAN WATCHDOG', { stuckSec });
    this.scanInFlight = false;
    this.scanStartedAt = 0;
    const status = typeof document !== 'undefined' ? document.querySelector('#statusText') : null;
    if (status) status.textContent = `♻️ اسکن قبلی ${stuckSec} ثانیه معلق مانده بود؛ حلقه دوباره راه افتاد`;
    return true;
  }

  async scan({ force = false } = {}) {
    if (this.scanInFlight) {
      if (!this.guardStuckScan()) {
        if (force) this.pendingManualScan = true;
        return;
      }
    }
    this.scanInFlight = true;
    this.scanStartedAt = Date.now();
    try {
      this.paper.migrateDay();
      $('#statusText').textContent = 'رادار؛ در حال پایش کل بازار...';

      // ۱) پول رادار خودکار بر اساس فاصلهٔ تنظیم‌شده؛ رفرش دستی فاصله را دور می‌زند.
      if (this.radar.shouldPoll(force)) {
        try {
          const events = await this.radar.poll();
          for (const ev of events) {
            this.audio.radarAlert(ev.type);
            this.logger.info('RADAR EVENT', ev);
            // ✅ ثبت برای اعتبارسنج (PUMP→انتظار رشد، DUMP→انتظار ریزش)
            if (ev.type !== 'NEW' && Number.isFinite(Number(ev.price))) {
              this.signalValidator.track(
                `ev:${ev.symbol}:${Math.floor(ev.t / 60000)}`,
                { symbol: ev.symbol, direction: ev.type === 'PUMP' ? 'LONG' : 'SHORT', refPrice: ev.price, meta: { changePct: ev.changePct } }
              );
            }
          }
          // ✅ قضاوت رویدادهای سررسیدشده (حداکثر ۵ تا در هر اسکن — سبک)
          for (const item of this.signalValidator.pending(Date.now()).slice(0, 5)) {
            try {
              const k = await this.market.getKlines(item.symbol, '5m');
              const last = k.candles?.at(-1);
              if (last) this.signalValidator.settle(item.id, last.close, Date.now());
            } catch { /* تلاش مجدد در اسکن بعدی */ }
          }
          this.publishBridge();
        } catch (error) {
          this.radar.meta.error = error.message;
          this.logger.info('RADAR ERROR', { error: error.message });
        }
      }

      // ۲) موتور Ignition فقط روی نمادهای کشف‌شده (نه WATCH)
      this.signals.clear();
      this.marketData.clear();
      this.blockReasons.clear();
      const autoOn = $('#autoTradeToggle')?.checked ?? true;
      const targets = [...this.radar.active.values()].filter(rec => rec.side !== 'WATCH');

      const results = await Promise.allSettled(targets.map(rec => withDeadline((async () => ({
        rec,
        klines: await this.market.getKlines(rec.symbol, this.settings.value.entryTimeframe, { ttlMs: force ? 0 : 6000 })
      }))(), SCAN_SYMBOL_TIMEOUT_MS, `کندل ${rec.symbol}`)));

      let klineFails = 0;
      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const symbol = targets[index]?.symbol || '?';
        if (result.status !== 'fulfilled') {
          klineFails += 1;
          const message = result.reason?.message || String(result.reason || 'خطای ناشناخته کندل');
          this.blockReasons.set(symbol, `دیتای کندل دریافت نشد: ${message}`);
          if (this.lastKlineErrorLog.get(symbol) !== message) {
            this.logger.info('KLINE ERROR', { symbol, error: message });
            this.lastKlineErrorLog.set(symbol, message);
          }
          continue;
        }
        const { rec, klines } = result.value;
        const last = klines?.candles?.at(-1);
        if (!last || !Number.isFinite(Number(last.close))) {
          klineFails += 1;
          const message = 'پاسخ صرافی کندل معتبر/آخرین قیمت ندارد';
          this.blockReasons.set(rec.symbol, message);
          if (this.lastKlineErrorLog.get(rec.symbol) !== message) {
            this.logger.info('KLINE ERROR', { symbol: rec.symbol, error: message });
            this.lastKlineErrorLog.set(rec.symbol, message);
          }
          continue;
        }
        this.lastKlineErrorLog.delete(rec.symbol);
        const signal = this.strategy.analyze(rec, klines);
        this.signals.set(rec.symbol, signal);
        this.marketData.set(rec.symbol, {
          symbol: rec.symbol,
          price: Number(last.close),
          lastCandle: last,
          atr: signal.atr,
          source: klines.source
        });
      }

      // ۳) مدیریت خروج پوزیشن‌های باز (SL سخت / Breakeven / ترلینگ / MaxHold)
      this.paper.updateStops(this.marketData);

      // ۴) ورود خودکار بدون انتظار برای تایید دستی (Zero-Wait)
      for (const signal of this.signals.values()) {
        if (signal.side === 'WAIT') {
          this.blockReasons.set(signal.symbol, `امتیاز ورود ${signal.score} < ${this.settings.value.ignitionMinScore} یا فیلترها تایید نکردند: ${signal.why}`);
          continue;
        }
        if (!autoOn) {
          this.blockReasons.set(signal.symbol, 'اتوترید مجازی خاموش است');
          continue;
        }
        const verdict = this.paper.evaluate(signal);
        if (!verdict.ok) {
          this.blockReasons.set(signal.symbol, verdict.reason);
          continue;
        }
        if (this.paper.open(signal, 'auto')) {
          this.audio.execution(signal.side, signal.symbol);
          this.blockReasons.delete(signal.symbol);
        }
      }

      const activeCount = this.radar.active.size;
      const liveSignals = [...this.signals.values()].filter(sg => sg.side !== 'WAIT').length;
      this.ignitionSummary = ignitionSummaryText({
        targets: targets.length,
        klineFails,
        blocked: this.blockReasons.size,
        live: liveSignals,
        positions: this.paper.state.paperPositions.length
      });
      const radarError = this.radar.meta.error ? ` • خطای آخر رادار: ${this.radar.meta.error}` : '';
      $('#statusText').textContent = `${this.radar.meta.source} • ${this.radar.meta.universe} نماد تحت پایش • ${activeCount} کشف‌شده • ${this.ignitionSummary}${radarError}`;
      this.view.renderAll();
    } catch (error) {
      // 🛡 خطای اسکن هرگز رادار را خاموش نمی‌کند: ثبت + نمایش + رندر — اسکن بعدی ادامه می‌یابد
      this.logger.info('SCAN ERROR', { error: error.message });
      const st = typeof document !== 'undefined' ? document.querySelector('#statusText') : null;
      if (st) st.textContent = `⚠️ خطای اسکن: ${error.message} — اسکن ادامه می‌یابد`;
      try { this.view.renderAll(); } catch { /* رندر حداقلی */ }
    } finally {
      this.scanInFlight = false;
      this.scanStartedAt = 0;
      if (this.pendingManualScan) {
        this.pendingManualScan = false;
        setTimeout(() => { void this.scan({ force: true }); }, 0);
      }
    }
  }

  /** 🔌 تست اتصال: کدام منبع (پراکسی سرور یا مستقیم) از این شبکه جواب می‌دهد. */
  async diagnose() {
    const checks = [
      { name: 'سرور محلی (/api/health)', url: '/api/health' },
      { name: 'Bybit (پراکسی سرور)', url: '/api/market/bybit/v5/market/tickers?category=linear' },
      { name: 'Binance (پراکسی سرور)', url: '/api/market/binance/api/v3/ticker/24hr' },
      { name: 'OKX (پراکسی سرور)', url: '/api/market/okx/api/v5/market/tickers?instType=SPOT' },
      { name: 'CoinGecko (پراکسی سرور)', url: '/api/market/coingecko/api/v3/coins/markets?vs_currency=usd&per_page=5&page=1' },
      { name: 'Bybit (مستقیم از مرورگر)', url: 'https://api.bybit.com/v5/market/tickers?category=linear' },
      { name: 'Binance (مستقیم از مرورگر)', url: 'https://api.binance.com/api/v3/ticker/24hr' },
      { name: 'OKX (مستقیم از مرورگر)', url: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT' },
      { name: 'CoinGecko (مستقیم از مرورگر)', url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd' }
    ];
    const results = [];
    for (const check of checks) {
      results.push({ ...check, ...(await probeUrl(check.url)) });
    }
    this.diagnostics = results;
    for (const result of results) {
      this.logger.info('DIAGNOSE', { source: result.name, ok: result.ok, ms: result.ms, error: result.error || '' });
    }
    const lines = results.map(result => `${result.ok ? '✅' : '❌'} ${result.name} — ${result.ms}ms${result.ok ? '' : ` (${result.error})`}`);
    return { results, text: `🔌 نتیجهٔ تست اتصال رادار:\n${lines.join('\n')}\n\nاگر همهٔ مسیرهای «مستقیم» ❌ هستند ولی پراکسی سرور ✅ است، سرور Termux دیتا را می‌آورد و رادار سالم کار می‌کند.` };
  }

  // پل یک‌طرفه اختیاری: انتشار نمادهای داغ برای اتوتریدر (فقط اگر روشن باشد)
  publishBridge() {
    if (String(this.settings.value.bridgePublish) !== 'true') return;
    const payload = {
      symbols: [...this.radar.active.values()].filter(r => r.side !== 'WATCH').map(r => r.symbol),
      active: [...this.radar.active.values()].map(r => ({ symbol: r.symbol, side: r.side, changePct: r.changePct }))
    };
    fetch('/api/hot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  stopSchedule() {
    this.timerGeneration += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    this.stopSchedule();
    if (!($('#autoScanToggle')?.checked ?? true)) return;

    const intervalMs = Math.max(3, Number(this.settings.value.scanIntervalSec) || 8) * 1000;
    const generation = this.timerGeneration;
    const tick = async () => {
      if (generation !== this.timerGeneration) return;
      this.timer = null;
      try {
        await this.scan();
      } catch (error) {
        this.logger.info('AUTO SCAN ERROR', { error: error?.message || String(error) });
      }
      if (generation !== this.timerGeneration || !($('#autoScanToggle')?.checked ?? true)) return;
      this.timer = setTimeout(tick, intervalMs);
    };
    this.timer = setTimeout(tick, intervalMs);
  }

  killAll() {
    for (const position of [...this.paper.state.paperPositions]) {
      const market = this.marketData.get(position.symbol);
      this.paper.close(position, market?.price || position.entry, 'kill-switch');
    }
    if ($('#autoScanToggle')) $('#autoScanToggle').checked = false;
    if ($('#autoTradeToggle')) $('#autoTradeToggle').checked = false;
    this.pendingManualScan = false;
    this.stopSchedule();
    this.view.renderAll();
  }

  async start() {
    this.view.bind();
    this.view.renderSettings();
    this.view.renderAll();
    this.logger.info('PUMP LAB START', { mode: this.radar.meta.source });
    await this.scan().catch(error => this.logger.info('INITIAL SCAN ERROR', { error: error.message }));
    this.schedule();
  }
}
