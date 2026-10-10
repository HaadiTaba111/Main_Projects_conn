import { $ } from './core/utils.js';
import { tfLabel } from './core/timeframe.js';
import { SettingsStore } from './services/settings-store.js';
import { Logger } from './services/logger.js';
import { MarketClient, fetchWithTimeout } from './services/market-client.js';
import { MomentumScalpStrategy } from './services/strategy.js';
import { PaperBroker } from './services/paper-broker.js';
import { RealBroker } from './services/real-broker.js';
import { PerformanceReport } from './services/performance-report.js';
import { AudioAlerts } from './services/audio-alerts.js';
import { HotBridge } from './services/hot-bridge.js';
import { DashboardView } from './ui/view.js';
import { SignalValidator } from './services/signal-validator.js';

// ⏱ سقف زمان کار هر نماد در یک اسکن و سقف عمر یک اسکن معلق.
// بدون این‌ها، یک اتصال بی‌پاسخ می‌توانست حلقهٔ اسکن خودکار را برای همیشه بخواباند.
const SCAN_SYMBOL_TIMEOUT_MS = 25000;
const SCAN_WATCHDOG_MS = 90000;

const withDeadline = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label}: مهلت ${Math.round(ms / 1000)} ثانیه تمام شد`)), ms);
  promise.then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); }
  );
});

export class ScalpLabApp {
  constructor() {
    this.settings = new SettingsStore();
    this.logger = new Logger();
    this.signals = new Map();
    this.prices = new Map();
    this.marketData = new Map();
    this.dataErrors = new Map();
    this.lastErrorLog = new Map();
    // علت شفاف «چرا معامله خودکار باز نشد» برای هر نماد — روی کارت ارز نمایش داده می‌شود
    this.blockReasons = new Map();
    this.audio = new AudioAlerts(this.settings, this.logger);
    // پل اختیاری و غیرمسدودکننده به Pump/Dump Lab (پیش‌فرض خاموش)
    this.hotBridge = new HotBridge(this.settings, this.logger);
    this.timer = null;
    this.timerGeneration = 0;
    this.scanInFlight = false;
    this.scanStartedAt = 0;
    this.pendingManualScan = false;
    this.performance = new PerformanceReport();
    this.rebuildServices();
    // ✅ اعتبارسنج سیگنال — زمان قضاوت و آستانهٔ حرکت، زنده از Settings (v2.10.2)
    const svSet = this.settings.value;
    this.signalValidator = new SignalValidator({
      delayMs: Math.max(1, Number(svSet.signalCheckMinutes) || 15) * 60000,
      thresholdPct: Number(svSet.signalThresholdPct) > 0 ? Number(svSet.signalThresholdPct) : 1.5,
      persistKey: 'fsvp_signal_validator_v1'
    });
    this.view = new DashboardView(this);
  }

  rebuildServices() {
    this.market = new MarketClient(this.settings, this.logger);
    this.strategy = new MomentumScalpStrategy(this.settings);
    this.paper = new PaperBroker(this.settings, this.logger);
    // Rebuilding services deliberately resets the real gate. A settings change
    // must never silently preserve permission to send an order.
    if (this.real?.enabled) this.real.kill();
    this.real = new RealBroker(this.settings, this.paper, this.logger);
    if (typeof document !== 'undefined' && $('#realAutoToggle')) $('#realAutoToggle').checked = false;
  }

  modeLabel() {
    const mode = this.settings.value.dataMode;
    if (mode === 'mock-local') return 'MOCK LOCAL';
    if (mode === 'mock-server') return 'MOCK SERVER';
    return 'LIVE'; // failover واقعی: Bybit → OKX (منبع دقیق در تب Data Feed)
  }

  timeframeLabel() {
    return tfLabel(this.settings.value.timeframe);
  }

  /**
   * نگهبان اسکن معلق: اگر اسکنی بیش از حد مجاز در جریان مانده باشد (شبکهٔ بی‌پاسخ،
   * خطای پیش‌بینی‌نشده) قفل را آزاد می‌کند تا حلقهٔ خودکار هرگز برای همیشه نخوابد.
   */
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

      // لیست اسکن = نمادهای ثابت کاربر ∪ نمادهای داغ پل Pump/Dump Lab (فقط از کش؛ بدون await شبکه)
      const discovered = Array.isArray(this.hotBridge.symbols()) ? this.hotBridge.symbols() : [];
      const rawSymbols = Array.isArray(this.settings.value.symbols)
        ? this.settings.value.symbols
        : (typeof this.settings.value.symbols === 'string' ? this.settings.value.symbols.split(',') : []);
      const userSymbols = rawSymbols.map(s => String(s || '').trim().toUpperCase()).filter(Boolean);
      const symbols = [...new Set([...userSymbols, ...discovered])];
      if (!symbols.length) symbols.push('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT');
      const s = this.settings.value;
      const minScore = Number(s.minScore);
      const microOn = String(s.microCandleCheck) === 'true';
      const microTf = String(s.microCandleTf || '1');
      $('#statusText').textContent = `${this.modeLabel()}؛ در حال دریافت دیتا...`;

      // Clear old values first. If Bybit is unavailable, stale prices/signals are
      // not presented as if they were current and no synthetic fallback is used.
      this.signals.clear();
      this.prices.clear();
      this.marketData.clear();
      this.dataErrors.clear();
      this.blockReasons.clear();

      const results = await Promise.allSettled(symbols.map(symbol => withDeadline((async () => {
        const market = await this.market.get(symbol);
        // کندل‌های ریز تاییدیه: اگر تایم‌فریم ریز همان تایم‌فریم اصلی باشد،
        // بدون درخواست اضافه از همان کندل‌ها استفاده می‌شود (صرفه‌جویی API).
        if (microOn) {
          market.microCandles = String(microTf) === String(s.timeframe)
            ? { candles: market.candles, source: `${market.source} (همان TF)` }
            : await this.market.getKlines(symbol, microTf, { ttlMs: force ? 0 : 15000 }).catch(() => null);
        }
        return market;
      })(), SCAN_SYMBOL_TIMEOUT_MS, `دیتای ${symbol}`)));
      let ok = 0;

      results.forEach((result, index) => {
        const symbol = symbols[index];
        if (result.status !== 'fulfilled') {
          const message = result.reason?.message || 'خطای ناشناخته دیتا';
          this.dataErrors.set(symbol, message);
          this.blockReasons.set(symbol, 'دیتای زنده دریافت نشد؛ ساخت سیگنال و ورود خودکار مسدود است');
          this.audio.drop(symbol);
          if (this.lastErrorLog.get(symbol) !== message) {
            this.logger.info('DATA ERROR', { symbol, error: message });
            this.lastErrorLog.set(symbol, message);
          }
          return;
        }
        ok += 1;
        this.lastErrorLog.delete(symbol);
        const market = result.value;
        const signal = this.strategy.analyze(market);
        this.marketData.set(symbol, market);
        this.signals.set(symbol, signal);
        this.prices.set(symbol, market.price);

        // ✅ اعتبارسنج: ثبت سیگنال‌های قوی (یک بار به‌ازای هر نماد در هر ۳۰ دقیقه)
        if (signal.side !== 'WAIT' && Number(signal.score) >= 60) {
          this.signalValidator.track(
            `sig:${symbol}:${signal.side}:${Math.floor(Date.now() / (30 * 60000))}`,
            { symbol, direction: signal.side, refPrice: market.price, meta: { score: signal.score } }
          );
        }
      });

      // ✅ قضاوت سیگنال‌های سررسیدشده با قیمت زندهٔ همین اسکن
      for (const item of this.signalValidator.pending(Date.now())) {
        const price = this.prices.get(item.symbol) ?? this.marketData.get(item.symbol)?.price;
        if (Number.isFinite(price)) this.signalValidator.settle(item.id, price, Date.now());
      }

      // Process exits before new entries. Closed-candle OHLC is used only as an
      // evidence that a stop/target was touched; with both touched, SL wins.
      this.paper.updateStops(this.marketData, this.signals);

      const paperToggle = $('#dashPaperAutoToggle') || $('#paperAutoToggle');
      const paperEnabled = (paperToggle ? paperToggle.checked : (String(this.settings.value.paperAutoDefault) === 'true')) || this.real.enabled;
      for (const [symbol, signal] of this.signals.entries()) {
        // هشدار صوتی سطح ۱ — نزدیکی به آستانه ورود (Pre-Alert / Soft Chime)
        this.audio.preAlertCheck(signal);

        if (signal.side === 'WAIT') {
          const alreadyOpen = this.paper.state.paperPositions.some(position => position.symbol === symbol);
          const gateReason = signal.stale || signal.formulaMode === 'filter'
            ? signal.why
            : null;
          this.blockReasons.set(symbol, alreadyOpen
            ? `پوزیشن باز ${symbol} داریم؛ ورود جدید تا خروج مسدود است`
            : (gateReason || `امتیاز ${signal.score} کمتر از حد نصاب ${minScore} است (تایم‌فریم ${this.timeframeLabel()})`));
          continue;
        }

        if (paperEnabled) {
          const verdict = this.paper.evaluate(signal);
          if (!verdict.ok) {
            this.blockReasons.set(symbol, verdict.reason);
          } else if (this.paper.open(signal, 'auto')) {
            // هشدار صوتی سطح ۲ — معامله به صورت خودکار باز شد (Execution Beep)
            this.audio.execution(signal.side, symbol);
            this.blockReasons.delete(symbol);
          } else {
            this.blockReasons.set(symbol, 'باز شدن پوزیشن در PaperBroker رد شد');
          }
        } else {
          this.blockReasons.set(symbol, 'اتوترید مجازی (Paper Auto) خاموش است؛ سوییچ آن را در داشبورد روشن کن');
        }

        // Real is a second, explicit gate. It is never enabled by default and
        // requires BYBIT LIVE data plus a user-configured secure backend.
        if (this.real.enabled && signal.side !== 'WAIT' && signal.score >= minScore) {
          await this.real.send(signal);
        }
      }

      const update = new Date().toLocaleTimeString();
      const radarTail = discovered.length ? ` • 🚀+${discovered.length} کشف‌شده` : '';
      const activeSignals = [...this.signals.values()].filter(sig => sig.side !== 'WAIT').length;
      const reasons = this.reasonSummary();
      $('#lastUpdate').textContent = `آخرین اسکن: ${update} • دیتا ${ok}/${symbols.length} • سیگنال ${activeSignals} • پوزیشن ${this.paper.state.paperPositions.length}${reasons ? ` • علت رد: ${reasons}` : ''}${radarTail}`;
      if (ok > 0) {
        $('#statusText').textContent = `${this.modeLabel()} • ${ok}/${symbols.length} بازار • ${this.timeframeLabel()}${radarTail}`;
      } else {
        const firstError = [...this.dataErrors.values()][0] || 'علت نامشخص';
        $('#statusText').textContent = `⚠️ دیتای زنده صرافی در دسترس نیست — علت: ${String(firstError).slice(0, 160)} • دکمهٔ 🔌 تست اتصال را بزن (دکمهٔ حالت بالای صفحه فقط شبیه‌ساز آفلاین را روشن می‌کند)`;
      }
      this.view.renderAll();
    } catch (error) {
      const message = error?.message || String(error);
      this.logger.info('SCAN ERROR', { error: message });
      const status = typeof document !== 'undefined' ? document.querySelector('#statusText') : null;
      if (status) status.textContent = `⚠️ خطای اسکن: ${message} — اسکن بعدی خودکار ادامه می‌یابد`;
    } finally {
      this.scanInFlight = false;
      this.scanStartedAt = 0;
      if (this.pendingManualScan) {
        this.pendingManualScan = false;
        setTimeout(() => {
          void this.scan({ force: true }).catch(error => this.logger.info('MANUAL SCAN ERROR', { error: error?.message || String(error) }));
        }, 0);
      }
    }
  }

  applyRiskProfile(profile) {
    this.settings.applyRiskProfile(profile);
    this.rebuildServices();
    this.view.renderSettings();
    this.schedule();
    this.logger.info('RISK PROFILE APPLIED', { profile: this.settings.value.riskProfile });
    this.view.renderAll();
    void this.scan();
  }

  /** شمارش علت‌های رد ورود — برای اینکه «چرا معامله نمی‌شود» بدون حدس‌زدن مشخص باشد. */
  reasonBuckets() {
    const buckets = { stale: 0, off: 0, cooldown: 0, position: 0, data: 0, score: 0, other: 0 };
    for (const reason of this.blockReasons.values()) {
      const text = String(reason || '');
      if (/⏱|کهنه|کهنگی/.test(text)) buckets.stale += 1;
      else if (/خاموش/.test(text)) buckets.off += 1;
      else if (/[Cc]ooldown/.test(text)) buckets.cooldown += 1;
      else if (/سقف|پوزیشن باز/.test(text)) buckets.position += 1;
      else if (/دیتا|دریافت|ناموفق|مسدود است/.test(text)) buckets.data += 1;
      else if (/امتیاز|حد نصاب/.test(text)) buckets.score += 1;
      else buckets.other += 1;
    }
    return buckets;
  }

  reasonSummary() {
    const labels = { stale: 'کندل کهنه', off: 'اتوترید خاموش', cooldown: 'کول‌داون', position: 'سقف/پوزیشن باز', data: 'خطای دیتا', score: 'امتیاز کم', other: 'سایر' };
    return Object.entries(this.reasonBuckets())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${labels[key]} ${count}`)
      .join('، ');
  }

  /** 🔌 تست اتصال: کدام مسیر دیتا از همین دستگاه/سرور جواب می‌دهد و با چه تاخیری. */
  async diagnose() {
    const checks = [
      { name: 'سرور محلی (/api/health)', url: '/api/health' },
      { name: 'Bybit (پراکسی سرور + زنجیرهٔ صرافی‌ها)', url: '/api/bybit/v5/market/tickers?category=linear&symbol=BTCUSDT' },
      { name: 'OKX (پراکسی سرور)', url: '/api/okx/api/v5/market/tickers?instId=BTC-USDT' },
      { name: 'OKX (مستقیم از مرورگر)', url: 'https://www.okx.com/api/v5/market/tickers?instId=BTC-USDT' },
    ];
    const results = [];
    for (const check of checks) {
      const startedAt = Date.now();
      try {
        const response = await fetchWithTimeout(check.url, { timeoutMs: 4000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.text();
        results.push({ ...check, ok: true, ms: Date.now() - startedAt });
      } catch (error) {
        results.push({ ...check, ok: false, ms: Date.now() - startedAt, error: (error?.message || String(error)).slice(0, 90) });
      }
    }
    this.diagnostics = results;
    for (const result of results) {
      this.logger.info('DIAGNOSE', { source: result.name, ok: result.ok, ms: result.ms, error: result.error || '' });
    }
    const lines = results.map(result => `${result.ok ? '✅' : '❌'} ${result.name} — ${result.ms}ms${result.ok ? '' : ` (${result.error})`}`);
    return { results, text: `🔌 نتیجهٔ تست اتصال:\n${lines.join('\n')}\n\nاگر همهٔ مسیرهای مستقیم ❌ هستند، شبکه/فیلترینگ جلوی صرافی‌ها را گرفته؛ VPN یا شبکهٔ دیگر لازم است. مسیرهای «پراکسی سرور» از داخل سرور Termux تست می‌شوند.` };
  }

  stopSchedule() {
    this.timerGeneration += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    this.stopSchedule();
    if (!$('#autoScanToggle')?.checked) return;

    const intervalMs = Math.max(3, Number(this.settings.value.scanIntervalSec) || 5) * 1000;
    const generation = this.timerGeneration;
    const tick = async () => {
      if (generation !== this.timerGeneration) return;
      this.timer = null;
      try {
        await this.scan();
      } catch (error) {
        this.logger.info('AUTO SCAN ERROR', { error: error?.message || String(error) });
      }
      if (generation !== this.timerGeneration || !$('#autoScanToggle')?.checked) return;
      this.timer = setTimeout(tick, intervalMs);
    };
    this.timer = setTimeout(tick, intervalMs);
  }

  closeAllPaper() {
    for (const position of [...this.paper.state.paperPositions]) {
      this.paper.close(position, this.prices.get(position.symbol) || position.entry, 'close-all');
    }
    this.view.renderAll();
  }

  resetPaper() {
    this.paper.reset();
    this.view.renderAll();
  }

  buildManualSignal(symbol, side, price, existingSignal = {}) {
    const s = this.settings.value;
    const direction = side === 'LONG' ? 1 : -1;
    const atr = Number(existingSignal?.atr) || (price * 0.008);
    const stopDistance = Math.max(atr * Number(s.atrStopMult || 2.2), price * 0.002);
    const entry = price * (1 + direction * (Number(s.slippagePct || 0.03) / 100));
    const stop = entry - direction * stopDistance;
    const take = entry + direction * stopDistance * Number(s.takeProfitR || 2.0);
    const notional = Number(s.orderMargin || 40) * Number(s.leverage || 5);
    const qty = notional / (entry || price);
    const feeOpen = notional * (Number(s.feeOpenPct || 0.055) / 100);
    const feeClose = notional * (Number(s.feeClosePct || 0.055) / 100);

    return {
      symbol,
      side,
      price,
      entry,
      stop,
      take,
      qty,
      notional,
      feeOpen,
      feeClose,
      fee: feeOpen + feeClose,
      score: 100,
      why: `ورود دستی کاربر (${side})`,
      risk: Math.abs(entry - stop) * qty,
      reward: Math.abs(take - entry) * qty,
      timeframe: String(s.timeframe || '60'),
      tfMs: Number(existingSignal?.tfMs) || 3600000,
      signalId: `${symbol}:${Date.now()}:${side}:manual`
    };
  }

  async start() {
    this.view.bind();
    this.view.renderSettings();
    try {
      this.view.renderAll();
    } catch (error) {
      // خطای رندر نباید راه‌اندازی را متوقف کند (قبلاً همین باعث می‌شد حلقهٔ اسکن هرگز شروع نشود)
      this.logger.info('START RENDER ERROR', { error: error?.message || String(error) });
    }
    this.hotBridge.start();
    this.logger.info('APP START', { mode: this.modeLabel(), paperDefault: this.settings.value.paperAutoDefault, bridge: this.hotBridge.enabled() ? 'ON' : 'OFF' });
    // حلقهٔ خودکار قبل از اولین اسکن زمان‌بندی می‌شود تا هیچ خطایی آن را نخواباند
    this.schedule();
    await this.scan().catch(error => this.logger.info('INITIAL SCAN ERROR', { error: error?.message || String(error) }));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
