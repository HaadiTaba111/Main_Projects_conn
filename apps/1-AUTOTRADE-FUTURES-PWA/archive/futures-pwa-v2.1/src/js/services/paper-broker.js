import { STORAGE_KEYS } from '../core/config.js';
import { readJson, timeframeMs, uid, writeJson } from '../core/utils.js';

export class PaperBroker {
  constructor(settings, logger) {
    this.s = settings;
    this.log = logger;
    const saved = readJson(STORAGE_KEYS.state, null);
    this.state = this.normalise(saved || this.initial());
    this.migrateDay();
  }

  initial() {
    const equity = Number(this.s.value.paperInitialEquity);
    return {
      paperEquity: equity,
      paperPositions: [],
      paperTrades: [],
      realOrders: [],
      lastCooldown: {},
      usedSignals: {},
      profileStarts: {},
      feesPaid: 0,
      day: new Date().toDateString(),
      dayStartEquity: equity
    };
  }

  normalise(saved) {
    const base = this.initial();
    const positions = Array.isArray(saved.paperPositions)
      ? saved.paperPositions.map(position => {
        const migrated = { ...position, riskProfile: position.riskProfile || 'medium' };
        // v2.0 positions have no frozen risk distance. Use the stop only if it still sits on
        // the loss side of the entry (otherwise it was already moved); floor at 0.5% of entry.
        if (!(Number(migrated.stopDistance) > 0)) {
          const entry = Number(migrated.entry);
          const lossSide = migrated.side === 'LONG' ? Number(migrated.stop) < entry : Number(migrated.stop) > entry;
          migrated.stopDistance = Math.max(lossSide ? Math.abs(entry - Number(migrated.stop)) : 0, entry * 0.005);
          migrated.initialStop = migrated.initialStop ?? migrated.stop;
        }
        migrated.stage = migrated.stage || 0;
        migrated.lastCandleTs = Number(migrated.lastCandleTs) || Date.now();
        return migrated;
      })
      : [];
    const trades = Array.isArray(saved.paperTrades)
      ? saved.paperTrades.map(trade => ({ ...trade, riskProfile: trade.riskProfile || 'medium' }))
      : [];
    const profileStarts = saved.profileStarts && typeof saved.profileStarts === 'object'
      ? { ...saved.profileStarts }
      : {};
    // Existing v3 history predates profile tags; treat it as the default medium run.
    if (trades.length && profileStarts.medium === undefined) profileStarts.medium = Number(this.s.value.paperInitialEquity);
    return {
      ...base,
      ...saved,
      paperPositions: positions,
      paperTrades: trades,
      realOrders: Array.isArray(saved.realOrders) ? saved.realOrders : [],
      lastCooldown: saved.lastCooldown && typeof saved.lastCooldown === 'object' ? saved.lastCooldown : {},
      usedSignals: saved.usedSignals && typeof saved.usedSignals === 'object' ? saved.usedSignals : {},
      profileStarts,
      feesPaid: Number.isFinite(Number(saved.feesPaid)) ? Number(saved.feesPaid) : 0
    };
  }

  save() {
    writeJson(STORAGE_KEYS.state, this.state);
  }

  reset() {
    this.state = this.initial();
    this.save();
  }

  migrateDay() {
    const today = new Date().toDateString();
    if (this.state.day !== today) {
      this.state.day = today;
      this.state.dayStartEquity = this.state.paperEquity;
      this.save();
    }
  }

  oneWayFee(notional, percentage) {
    return Math.abs(Number(notional)) * (Number(percentage) / 100);
  }

  grossPnl(position, mark) {
    const direction = position.side === 'LONG' ? 1 : -1;
    return (Number(mark) - Number(position.entry)) * direction * Number(position.qty);
  }

  closeFee(position, mark) {
    return this.oneWayFee(Number(mark) * Number(position.qty), this.s.value.feeClosePct);
  }

  // This is the cash/equity delta at a mark. Opening fee is already removed
  // from paperEquity when the position is opened, so it is not removed twice.
  markToMarketDelta(position, mark) {
    return this.grossPnl(position, mark) - this.closeFee(position, mark);
  }

  // Net PnL shown for validation: gross movement minus both entry and exit fees.
  netPnl(position, mark) {
    return this.grossPnl(position, mark)
      - Number(position.openFee || 0)
      - this.closeFee(position, mark);
  }

  dailyLossExceeded() {
    const start = Number(this.state.dayStartEquity);
    if (!(start > 0)) return true;
    return ((start - Number(this.state.paperEquity)) / start * 100) >= Number(this.s.value.dailyLossLimitPct);
  }

  canOpen(signal) {
    const s = this.s.value;
    if (!signal || signal.side === 'WAIT' || this.dailyLossExceeded()) return false;
    if (this.state.paperPositions.length >= Number(s.maxOpenPositions)) return false;
    if (this.state.paperPositions.some(position => position.symbol === signal.symbol)) return false;
    // One trade per signal. The signal is built from a CLOSED candle, so it stays identical
    // for the whole candle; without this the same signal re-entered after every cooldown.
    if (signal.signalId && this.state.usedSignals[signal.signalId]) return false;
    const cooldown = Number(s.cooldownSec) * 1000;
    return Date.now() - Number(this.state.lastCooldown[signal.symbol] || 0) > cooldown;
  }

  open(signal, reason = 'auto', force = false) {
    if (!signal || signal.side === 'WAIT') return false;
    // Manual entry may bypass cooldown, never the account-level safety checks.
    if (this.dailyLossExceeded()) return false;
    if (this.state.paperPositions.length >= Number(this.s.value.maxOpenPositions)) return false;
    if (this.state.paperPositions.some(position => position.symbol === signal.symbol)) return false;
    if (!force && !this.canOpen(signal)) return false;

    const openFee = this.oneWayFee(signal.notional, this.s.value.feeOpenPct);
    const riskProfile = this.s.value.riskProfile || 'medium';
    if (!Object.prototype.hasOwnProperty.call(this.state.profileStarts, riskProfile)) {
      this.state.profileStarts[riskProfile] = this.state.paperEquity;
    }
    this.state.paperEquity -= openFee;
    this.state.feesPaid += openFee;
    this.state.paperPositions.push({
      id: uid(),
      symbol: signal.symbol,
      side: signal.side,
      entry: signal.entry,
      qty: signal.qty,
      notional: signal.notional,
      stop: signal.stop,
      take: signal.take,
      openFee,
      openedAt: Date.now(),
      reason,
      score: signal.score,
      riskProfile,
      signalId: signal.signalId,
      source: signal.source,
      candleTs: signal.candleTs,
      // Exit-engine anchors, frozen at entry (R = initial risk distance).
      initialStop: signal.stop,
      stopDistance: Math.abs(Number(signal.entry) - Number(signal.stop)),
      atr: Number(signal.atr) || 0,
      stage: 0,
      highWater: Number(signal.entry),
      lowWater: Number(signal.entry),
      lastCandleTs: Date.now()
    });
    if (signal.signalId) {
      this.state.usedSignals[signal.signalId] = Date.now();
      const keys = Object.keys(this.state.usedSignals);
      if (keys.length > 400) {
        keys.sort((a, b) => this.state.usedSignals[a] - this.state.usedSignals[b])
          .slice(0, keys.length - 300).forEach(key => delete this.state.usedSignals[key]);
      }
    }
    this.state.lastCooldown[signal.symbol] = Date.now();
    this.save();
    this.log.info('PAPER OPEN', {
      symbol: signal.symbol,
      side: signal.side,
      entry: signal.entry,
      qty: signal.qty,
      score: signal.score,
      feeOpen: openFee,
      source: signal.source
    });
    return true;
  }

  close(position, mark, reason = 'manual') {
    const exit = Number(mark);
    if (!Number.isFinite(exit) || exit <= 0) return false;
    const gross = this.grossPnl(position, exit);
    const feeClose = this.closeFee(position, exit);
    const feeOpen = Number(position.openFee || 0);
    const net = gross - feeOpen - feeClose;

    // openFee has already been charged; here we settle gross PnL and exit fee.
    this.state.paperEquity += gross - feeClose;
    this.state.feesPaid += feeClose;
    this.state.paperPositions = this.state.paperPositions.filter(item => item.id !== position.id);
    this.state.paperTrades.unshift({
      time: Date.now(),
      symbol: position.symbol,
      side: position.side,
      entry: Number(position.entry),
      exit,
      grossPnl: gross,
      feeOpen,
      feeClose,
      fees: feeOpen + feeClose,
      pnl: net,
      reason,
      score: position.score,
      riskProfile: position.riskProfile || this.s.value.riskProfile || 'legacy',
      source: position.source,
      durationSec: Math.max(0, Math.round((Date.now() - Number(position.openedAt)) / 1000))
    });
    this.state.paperTrades = this.state.paperTrades.slice(0, 350);
    this.save();
    this.log.info('PAPER CLOSE', {
      symbol: position.symbol,
      side: position.side,
      exit,
      gross,
      fees: feeOpen + feeClose,
      net,
      reason
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Exit engine v2.1
  //  * Only price action AFTER the entry can touch a stop or move the trailing
  //    anchor (v2.0 used the last closed signal-timeframe candle, which is older than
  //    the entry, so the break-even stop was hit one scan after it was set).
  //  * Post-entry 1m candles are replayed in order, then the live tick is applied.
  //    Inside one bar the stop is checked BEFORE the bar can raise the stop or take
  //    profit, so ambiguity always resolves against the trade.
  //  * Stop ladder: initial ATR stop -> break-even(+costs) at breakevenAtR -> ATR trail.
  //  * tpMode 'fixed' closes at TP; 'trail' lets the winner run.
  //  * Reversal exit only on a newly closed signal candle. Max hold scales with timeframe.
  // ---------------------------------------------------------------------------
  holdLimitMs() {
    const s = this.s.value;
    return Math.max(Number(s.maxHoldMinutes) * 60_000, Number(s.maxHoldCandles) * timeframeMs(s.timeframe));
  }

  breakevenPrice(position) {
    const s = this.s.value;
    const entry = Number(position.entry);
    const costPct = (Number(s.feeOpenPct) + Number(s.feeClosePct) + 2 * Number(s.slippagePct)) / 100;
    return position.side === 'LONG' ? entry * (1 + costPct) : entry * (1 - costPct);
  }

  // Fill for a stop order: never better than the stop, and a gap through it fills at the open.
  stopFill(position, stop, reference) {
    const slip = Number(this.s.value.slippagePct) / 100;
    if (position.side === 'LONG') {
      const base = Number.isFinite(reference) ? Math.min(stop, reference) : stop;
      return base * (1 - slip);
    }
    const base = Number.isFinite(reference) ? Math.max(stop, reference) : stop;
    return base * (1 + slip);
  }

  // Apply one price bar {open, high, low}. Returns { exit, reason } when it closes the trade.
  applyBar(position, bar) {
    const s = this.s.value;
    const isLong = position.side === 'LONG';
    const entry = Number(position.entry);
    const R = Number(position.stopDistance) || Math.abs(entry - Number(position.initialStop ?? position.stop));
    if (!(R > 0)) return null;

    // 1) Stop first (worst case inside the bar).
    const stop = Number(position.stop);
    const hitStop = isLong ? bar.low <= stop : bar.high >= stop;
    if (hitStop) {
      const beyondEntry = isLong ? stop >= entry : stop <= entry;
      const reason = !beyondEntry ? 'SL' : (position.stage >= 2 ? 'TRAIL_STOP' : 'BREAKEVEN_STOP');
      return { exit: this.stopFill(position, stop, bar.open), reason };
    }

    // 2) Fixed take-profit.
    const take = Number(position.take);
    if (s.tpMode === 'fixed' && Number.isFinite(take) && (isLong ? bar.high >= take : bar.low <= take)) {
      return { exit: take, reason: 'TP' };
    }

    // 3) Favourable extreme since entry (post-entry data only).
    if (isLong) position.highWater = Math.max(Number(position.highWater) || entry, bar.high);
    else position.lowWater = Math.min(Number(position.lowWater) || entry, bar.low);
    const favourable = isLong ? position.highWater - entry : entry - position.lowWater;

    // 4) Stop ladder — effective from the NEXT bar.
    if (favourable >= R * Number(s.breakevenAtR)) {
      const be = this.breakevenPrice(position);
      if (isLong ? be > position.stop : be < position.stop) position.stop = be;
      position.stage = Math.max(position.stage || 0, 1);
      if (s.tpMode === 'trail') {
        const atr = Number(position.atr) > 0 ? Number(position.atr) : R / Math.max(0.1, Number(s.atrStopMult) || 1);
        const dist = atr * Number(s.trailAtrMult);
        const trail = isLong ? position.highWater - dist : position.lowWater + dist;
        if (isLong ? trail > position.stop : trail < position.stop) {
          position.stop = trail;
          position.stage = 2;
        }
      }
    }
    return null;
  }

  updateStops(marketMap, signalsMap) {
    const s = this.s.value;
    const now = Date.now();
    const feedMs = timeframeMs(s.exitFeedTimeframe || '1');
    let mutated = false;

    for (const position of [...this.state.paperPositions]) {
      const market = marketMap.get(position.symbol);
      if (!market) continue;
      const mark = Number(market.price);
      if (!(mark > 0)) continue;
      const signal = signalsMap ? signalsMap.get(position.symbol) : null;
      let result = null;

      // a) Replay COMPLETE post-entry candles in order (each exactly once).
      const candles = (market.exitCandles || [])
        .filter(c => c.ts > Number(position.openedAt) && c.ts > Number(position.lastCandleTs || 0) && c.ts + feedMs <= now)
        .sort((x, y) => x.ts - y.ts);
      for (const candle of candles) {
        result = this.applyBar(position, candle);
        position.lastCandleTs = candle.ts;
        mutated = true;
        if (result) break;
      }

      // b) Live tick as a zero-width bar.
      if (!result) {
        result = this.applyBar(position, { open: mark, high: mark, low: mark });
        mutated = true;
      }

      // c) Time stop (scaled to the signal timeframe).
      if (!result && now - Number(position.openedAt) >= this.holdLimitMs()) {
        result = { exit: mark, reason: 'MAX_HOLD' };
      }

      // d) Reversal exit, once per newly closed signal candle, only while in profit.
      if (!result && s.reversalExit === 'true' && signal && (position.stage || 0) >= 1
          && Number(signal.candleTs) > Number(position.candleTs)
          && Number(signal.candleTs) !== Number(position.lastReversalTs || 0)) {
        position.lastReversalTs = Number(signal.candleTs);
        mutated = true;
        const long = position.side === 'LONG';
        const rsiRev = long ? (signal.rsi > 68 && signal.movePct < -0.15) : (signal.rsi < 32 && signal.movePct > 0.15);
        const emaRev = long ? (signal.emaFast < signal.emaSlow) : (signal.emaFast > signal.emaSlow);
        if (rsiRev || (emaRev && signal.volX > 1.3)) {
          result = { exit: mark, reason: rsiRev ? 'REVERSAL_RSI' : 'REVERSAL_EMA' };
        }
      }

      if (result) this.close(position, result.exit, result.reason);
    }
    if (mutated) this.save();
  }
}
