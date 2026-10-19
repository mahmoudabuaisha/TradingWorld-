import type { Candle } from "../types.js";

/** Build candles from a compact spec: [open, high, low, close] rows, 5-minute spacing. */
export function candlesFrom(rows: [number, number, number, number][], start = 1_700_000_000, step = 300): Candle[] {
  return rows.map(([open, high, low, close], i) => ({ time: start + i * step, open, high, low, close, volume: 100 }));
}

/** Flat-ish series used as padding. */
export function flat(n: number, price: number, start = 1_700_000_000, step = 300): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const wiggle = (i % 2 === 0 ? 1 : -1) * price * 0.0005;
    out.push({ time: start + i * step, open: price, high: price + Math.abs(wiggle) * 2, low: price - Math.abs(wiggle) * 2, close: price + wiggle, volume: 100 });
  }
  return out;
}
