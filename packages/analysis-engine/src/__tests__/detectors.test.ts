import { describe, it, expect } from "vitest";
import { candlesFrom, flat } from "./helpers.js";
import { detectSwings } from "../detectors/swings.js";
import { detectStructure } from "../detectors/structure.js";
import { detectFVGs } from "../detectors/fvg.js";
import { detectDisplacements } from "../detectors/displacement.js";
import { detectOrderBlocks } from "../detectors/orderBlocks.js";
import { detectEqualLevels, detectSweeps } from "../detectors/liquidity.js";
import { atr } from "../indicators.js";
import { aggregate } from "../mtf/aggregate.js";

describe("swings", () => {
  it("finds a clear swing high and low", () => {
    const c = candlesFrom([
      [100, 101, 99, 100], [100, 102, 99, 101], [101, 105, 100, 104], [104, 104.5, 101, 102], [102, 103, 100, 101],
      [101, 102, 97, 98], [98, 99, 95, 96], [96, 97, 96, 97], [97, 99, 96.5, 98], [98, 100, 97, 99],
    ]);
    const s = detectSwings(c, 2);
    expect(s.find((x) => x.kind === "high")?.index).toBe(2);
    expect(s.find((x) => x.kind === "low")?.index).toBe(6);
  });

  it("never marks the last `lookback` candles (no repainting)", () => {
    const c = flat(30, 100);
    c[28] = { ...c[28]!, high: 200 };
    expect(detectSwings(c, 3).some((s) => s.index === 28)).toBe(false);
  });
});

describe("structure", () => {
  it("emits BOS on close above last swing high in bullish trend and CHoCH on reversal", () => {
    const rows: [number, number, number, number][] = [
      [100, 101, 99, 100], [100, 101, 99, 100], [100, 103, 99, 102], [102, 102.5, 100, 101], [101, 101.5, 99.5, 100], // swing high @2 = 103
      [100, 101, 98, 99], [99, 100, 97, 98], [98, 99, 97.5, 98.5], [98.5, 100, 98, 99.5], [99.5, 101, 99, 100.5],      // swing low @6 = 97
      [100.5, 104, 100, 103.8], // close > 103 → BOS bullish (trend neutral→bullish)
      [103.8, 104.5, 103, 104], [104, 104.2, 102, 102.5], [102.5, 103, 101, 101.5], [101.5, 102, 100, 100.5],
      [100.5, 101, 99, 99.5], [99.5, 100, 96, 96.5], // close < 97 → CHoCH bearish
      [96.5, 97, 95, 95.5], [95.5, 96, 94, 94.5], [94.5, 95, 93, 93.5],
    ];
    const c = candlesFrom(rows);
    const st = detectStructure(c, detectSwings(c, 2));
    expect(st.events[0]?.kind).toBe("BOS");
    expect(st.events[0]?.direction).toBe("bullish");
    expect(st.events.find((e) => e.direction === "bearish")?.kind).toBe("CHoCH");
    expect(st.trend).toBe("bearish");
  });
});

describe("fvg", () => {
  it("detects a bullish gap and tracks mitigation", () => {
    const c = candlesFrom([
      [100, 101, 99, 100], [100, 100.5, 99.5, 100], [100, 101, 99.8, 100.9], [101, 106, 100.9, 105.8], [105.8, 107, 103, 106],
      [106, 106.5, 104, 104.5], [104.5, 105, 100.5, 101], // dips into gap
    ]);
    const a = atr(c, 3);
    const gaps = detectFVGs(c, a, 0.1);
    const bull = gaps.find((g) => g.direction === "bullish" && g.size > 1)!;
    expect(bull).toBeDefined();
    expect(bull.top).toBeCloseTo(103);
    expect(bull.bottom).toBeCloseTo(101);
    expect(bull.mitigated).toBe(true);
  });
});

describe("displacement + order block", () => {
  it("finds the bearish candle before a bullish displacement", () => {
    const pad = flat(20, 100);
    const c = [...pad, ...candlesFrom([[100, 100.2, 99.5, 99.6], [99.6, 104, 99.5, 103.9], [103.9, 104.5, 103, 104]], pad[pad.length - 1]!.time + 300)];
    const a = atr(c, 14);
    const d = detectDisplacements(c, a, 1.5);
    expect(d.length).toBeGreaterThan(0);
    const obs = detectOrderBlocks(c, d);
    expect(obs[0]?.direction).toBe("bullish");
    expect(obs[0]?.index).toBe(20);
    expect(obs[0]?.mitigated).toBe(false);
  });
});

describe("liquidity", () => {
  it("clusters equal lows and detects a sell-side sweep with reclaim", () => {
    const rows: [number, number, number, number][] = [
      [100, 101, 99, 100], [100, 101, 99.5, 100.5], [100.5, 101, 98.02, 99.5], [99.5, 100.5, 99, 100], [100, 101, 99.5, 100.8],
      [100.8, 101.5, 100, 101], [101, 101.2, 99.5, 100], [100, 100.5, 98.0, 99.3], [99.3, 100.5, 99, 100.2], [100.2, 101, 99.8, 100.9],
      [100.9, 101.5, 100.5, 101], [101, 101.2, 100, 100.3], [100.3, 100.6, 96.5, 100.4], // sweep below 98 and close back above
      [100.4, 103, 100.2, 102.8], [102.8, 103.5, 102, 103], [103, 103.2, 102.5, 102.9], [102.9, 103, 102.4, 102.6],
    ];
    const c = candlesFrom(rows);
    const a = atr(c, 5);
    const sw = detectSwings(c, 2);
    const pools = detectEqualLevels(sw, a[a.length - 1]!, 0.2, "5m");
    const eql = pools.find((p) => p.kind === "EQL");
    expect(eql).toBeDefined();
    expect(eql!.touches).toBe(2);
    const sweeps = detectSweeps(c, pools, detectDisplacements(c, a, 1.2));
    const s = sweeps.find((x) => x.side === "sell-side");
    expect(s).toBeDefined();
    expect(s!.index).toBe(12);
    expect(s!.reclaimed).toBe(true);
  });
});

describe("aggregate", () => {
  it("resamples 5m into 15m preserving OHLC", () => {
    const c = candlesFrom([[1, 2, 0.5, 1.5], [1.5, 3, 1, 2], [2, 2.5, 0.2, 1], [1, 1.2, 0.9, 1.1]], 1_700_000_100);
    const out = aggregate(c, "15m");
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ open: 1, high: 3, low: 0.2, close: 1 });
  });
});
