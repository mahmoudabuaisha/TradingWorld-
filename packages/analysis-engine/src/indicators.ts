import type { Candle } from "./types.js";

/** Wilder ATR. Returns an array aligned with candles (NaN until warm-up completes). */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length === 0) return out;
  let sum = 0;
  let prev: number | undefined;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const prevClose = i > 0 ? candles[i - 1]!.close : c.open;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = ((prev ?? tr) * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  // back-fill warm-up with the first valid value so callers never divide by NaN
  const firstValid = out.find((v) => !Number.isNaN(v)) ?? (candles[0]!.high - candles[0]!.low || 1);
  for (let i = 0; i < out.length; i++) if (Number.isNaN(out[i]!)) out[i] = firstValid;
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    prev = prev === undefined ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function lastValid(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]!;
    if (!Number.isNaN(v)) return v;
  }
  return NaN;
}
