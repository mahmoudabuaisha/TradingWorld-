import type { Candle } from "../types.js";
import { TIMEFRAME_SECONDS, type Timeframe } from "@tradingworld/shared";
import { aggregate } from "../mtf/aggregate.js";

/** Deterministic PRNG (mulberry32) so demo data and tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface SyntheticOptions {
  symbol: string;
  startPrice: number;
  bars: number;
  timeframe: Timeframe;
  /** per-bar volatility as fraction of price (e.g. 0.0006 for 1m gold) */
  vol: number;
  endTime?: number; // unix seconds; defaults to "now" aligned to timeframe
}

/**
 * Regime-switching random walk with volatility clustering, session volatility profile and
 * occasional liquidity-sweep wicks, so that structure/FVG/sweep detectors have realistic material.
 */
export function generateSyntheticCandles(o: SyntheticOptions): Candle[] {
  const rnd = mulberry32(hashSeed(o.symbol + ":" + o.timeframe));
  const step = TIMEFRAME_SECONDS[o.timeframe];
  const end = Math.floor((o.endTime ?? Math.floor(Date.now() / 1000)) / step) * step;
  const start = end - step * (o.bars - 1);
  const out: Candle[] = [];
  let price = o.startPrice;
  let drift = 0;
  let volMult = 1;
  let regimeLeft = 0;
  const gauss = () => {
    const u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  for (let i = 0; i < o.bars; i++) {
    const t = start + i * step;
    if (regimeLeft <= 0) {
      regimeLeft = 60 + Math.floor(rnd() * 400);
      const r = rnd();
      drift = r < 0.3 ? o.vol * 0.25 : r < 0.6 ? -o.vol * 0.25 : 0;
      volMult = 0.6 + rnd() * 1.2;
    }
    regimeLeft--;
    const hour = new Date(t * 1000).getUTCHours();
    const sessionMult = hour >= 12 && hour < 16 ? 1.5 : hour >= 7 && hour < 21 ? 1.1 : 0.6;
    const sigma = price * o.vol * volMult * sessionMult;
    const open = price;
    let close = open + drift * price + gauss() * sigma;
    const wickUp = Math.abs(gauss()) * sigma * 0.6;
    const wickDn = Math.abs(gauss()) * sigma * 0.6;
    let high = Math.max(open, close) + wickUp;
    let low = Math.min(open, close) - wickDn;
    // occasional sweep: long wick beyond recent extremes, close back inside
    if (rnd() < 0.03 && out.length > 20) {
      const recent = out.slice(-20);
      if (rnd() < 0.5) { low = Math.min(...recent.map((c) => c.low)) - sigma * 0.5; close = open + Math.abs(gauss()) * sigma * 1.2; high = Math.max(high, close); }
      else { high = Math.max(...recent.map((c) => c.high)) + sigma * 0.5; close = open - Math.abs(gauss()) * sigma * 1.2; low = Math.min(low, close); }
    }
    // occasional displacement candle
    if (rnd() < 0.04) {
      const dir = rnd() < 0.5 ? 1 : -1;
      close = open + dir * sigma * (2 + rnd() * 2);
      high = Math.max(open, close) + sigma * 0.15;
      low = Math.min(open, close) - sigma * 0.15;
    }
    const volume = Math.round(500 + rnd() * 1500 * sessionMult);
    out.push({ time: t, open, high, low, close, volume });
    price = close;
  }
  return out;
}

/** Long 1m master series resampled to any timeframe — one consistent price history per symbol. */
export class SyntheticMarket {
  private cache = new Map<string, Candle[]>();
  /** @param endTime fixed end timestamp (tests/replay); omitted → series ends "now" */
  constructor(private readonly masterBars = 60_000, private readonly endTime?: number) {}

  master(symbol: string, startPrice: number, vol: number): Candle[] {
    const key = `${symbol}:${this.endTime ?? "live"}`;
    let m = this.cache.get(key);
    if (!m) {
      m = generateSyntheticCandles({ symbol, startPrice, bars: this.masterBars, timeframe: "1m", vol, endTime: this.endTime });
      this.cache.set(key, m);
    }
    if (this.endTime === undefined) this.extend(symbol, m, vol);
    return m;
  }

  /**
   * A live series keeps moving: append every minute that has elapsed since the last bar (up to the current one),
   * each seeded by symbol + minute so separate processes produce the same bars. The length stays `masterBars`.
   */
  private extend(symbol: string, m: Candle[], vol: number, nowMs = Date.now()): void {
    const current = Math.floor(nowMs / 60_000) * 60;
    let last = m[m.length - 1];
    if (!last || last.time >= current) return;
    const added: Candle[] = [];
    for (let t = last.time + 60; t <= current && added.length < this.masterBars; t += 60) {
      const r = mulberry32(hashSeed(`${symbol}:${t}`));
      const open = last.close;
      const close = open * (1 + (r() - 0.5) * 2 * vol * 1.7);
      const high = Math.max(open, close) * (1 + r() * vol * 0.6);
      const low = Math.min(open, close) * (1 - r() * vol * 0.6);
      last = { time: t, open, high, low, close, volume: Math.round(40 + r() * 120) };
      added.push(last);
    }
    m.push(...added);
    if (m.length > this.masterBars) m.splice(0, m.length - this.masterBars);
  }

  candles(symbol: string, timeframe: Timeframe, startPrice: number, vol: number, limit: number, to?: number): Candle[] {
    const m = this.master(symbol, startPrice, vol);
    const series = timeframe === "1m" ? m : aggregate(m, timeframe);
    const filtered = to ? series.filter((c) => c.time < to) : series;
    return filtered.slice(-limit);
  }
}
