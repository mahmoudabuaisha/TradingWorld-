import { findInstrument } from "@tradingworld/shared";
import type { AnalysisResult } from "@tradingworld/analysis-engine";
import type { Repositories, Alert } from "../repositories/memory.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { describeError } from "../providers/support/status.js";
import { traced } from "../ops/telemetry.js";

export interface AlertEvent {
  alert: Alert;
  price: number;
  title: { ar: string; en: string };
  message: { ar: string; en: string };
  at: number;
}
export interface PriceBar {
  high: number;
  low: number;
  close: number;
}

/** The condition alone, as a pure function: did this bar (or tick: high = low = close) meet the alert? */
export function alertCondition(a: Alert, bar: PriceBar, analysis?: AnalysisResult): { ar: string; en: string } | undefined {
  if (a.kind === "price_above" && a.price !== undefined && bar.high >= a.price)
    return { ar: `السعر تجاوز ${a.price}`, en: `Price crossed above ${a.price}` };
  if (a.kind === "price_below" && a.price !== undefined && bar.low <= a.price)
    return { ar: `السعر كسر ${a.price}`, en: `Price crossed below ${a.price}` };
  if (a.kind === "zone_enter") {
    if (a.zoneTop !== undefined && a.zoneBottom !== undefined) {
      if (bar.low <= a.zoneTop && bar.high >= a.zoneBottom)
        return {
          ar: `السعر دخل منطقة تحليلية محددة مسبقًا (${a.zoneBottom} – ${a.zoneTop})`,
          en: `Price entered a pre-defined analysis zone (${a.zoneBottom} – ${a.zoneTop})`,
        };
    } else if (a.zoneId && analysis) {
      // legacy alerts without bounds: only matchable while the same analysis window is live
      const z = analysis.zones.find((z) => z.id === a.zoneId);
      if (z && bar.low <= z.top && bar.high >= z.bottom)
        return { ar: `السعر دخل منطقة تحليلية محددة مسبقًا: ${z.nameAr}`, en: `Price entered a pre-defined analysis zone: ${z.name}` };
    }
  }
  return undefined;
}

export interface AlertWatchOptions {
  pollSeconds: number;
  now?: () => number;
  log?: (m: string) => void;
}

/**
 * Evaluates user alerts against prices — from live ticks while a chart is open AND from a server-side watcher that
 * polls every symbol with an active alert, so alerts fire (and notify) when nobody is looking.
 * An alert fires once: the repository's atomic trigger decides between concurrent evaluations.
 * Notifications never say BUY/SELL — only that a pre-defined analytical condition was met.
 */
export class AlertService {
  private listeners = new Set<(e: AlertEvent) => void>();
  private timer?: NodeJS.Timeout;
  private watching = false;
  private readonly now: () => number;
  private readonly log: (m: string) => void;
  readonly stats = { polls: 0, fired: 0, lastPollAt: 0, errors: 0 };

  constructor(
    private repos: Repositories,
    private providers?: ProviderRegistry,
    private opts: AlertWatchOptions = { pollSeconds: 15 },
  ) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
  }

  onTrigger(fn: (e: AlertEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** A live tick (or the last analysed price). */
  async evaluate(symbol: string, price: number, analysis?: AnalysisResult): Promise<AlertEvent[]> {
    return this.evaluateBar(symbol, { high: price, low: price, close: price }, analysis);
  }

  /**
   * A bar's range. `barStartMs` guards against firing on a spike that happened before the alert existed:
   * for alerts created after the bar opened only the close is used.
   */
  async evaluateBar(symbol: string, bar: PriceBar, analysis?: AnalysisResult, barStartMs?: number): Promise<AlertEvent[]> {
    const fired: AlertEvent[] = [];
    for (const a of await this.repos.alerts.listActive()) {
      if (a.symbol !== symbol) continue;
      const effective = barStartMs !== undefined && barStartMs < a.createdAt ? { high: bar.close, low: bar.close, close: bar.close } : bar;
      const what = alertCondition(a, effective, analysis);
      if (!what) continue;
      const at = this.now();
      const won = await this.repos.alerts.trigger(a.id, at);
      if (!won) continue; // someone else fired it first
      const ev: AlertEvent = {
        alert: won,
        price: bar.close,
        at,
        title: { ar: `تنبيه ${symbol}`, en: `${symbol} alert` },
        message: {
          ar: `${symbol}: ${what.ar}. افتح تفاصيل التحليل قبل أي قرار.`,
          en: `${symbol}: ${what.en}. Open the analysis details before any decision.`,
        },
      };
      fired.push(ev);
      this.stats.fired++;
      for (const l of this.listeners) {
        try {
          l(ev);
        } catch (e) {
          this.log(`alert listener: ${describeError(e)}`);
        }
      }
    }
    return fired;
  }

  /** One watcher pass: the last two 1-minute bars of every symbol that has an active alert. */
  async watchOnce(): Promise<number> {
    if (!this.providers || this.watching) return 0;
    this.watching = true;
    let fired = 0;
    try {
      const symbols = [...new Set((await this.repos.alerts.listActive()).map((a) => a.symbol))];
      for (const symbol of symbols) {
        const instrument = findInstrument(symbol);
        if (!instrument) continue;
        try {
          const bars = await this.providers.for(instrument).getCandles(instrument, "1m", 2);
          for (const b of bars) fired += (await this.evaluateBar(symbol, b, undefined, b.time * 1000)).length;
        } catch (e) {
          this.stats.errors++;
          this.log(`watch ${symbol}: ${describeError(e)}`);
        }
      }
    } finally {
      this.watching = false;
      this.stats.polls++;
      this.stats.lastPollAt = this.now();
    }
    return fired;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void traced("job alerts.watch", () => this.watchOnce()), this.opts.pollSeconds * 1000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
