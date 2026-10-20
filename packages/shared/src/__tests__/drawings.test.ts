import { describe, it, expect } from "vitest";
import { fibLevels, timeToLogical, logicalToTime, distToSegment, hitTest, DRAWING_POINTS } from "../drawings.js";
import { drawingCreateSchema } from "../schemas/index.js";

const T = 1_792_400_000;
const m5 = [0, 1, 2, 3, 4].map((i) => T + i * 300);

describe("drawings geometry", () => {
  it("maps time to a fractional bar index, interpolating and extrapolating", () => {
    expect(timeToLogical(m5, T, 300)).toBe(0);
    expect(timeToLogical(m5, T + 600, 300)).toBe(2);
    expect(timeToLogical(m5, T + 450, 300)).toBe(1.5); // between bars
    expect(timeToLogical(m5, T + 1500, 300)).toBe(5); // future area, beyond the last bar
    expect(timeToLogical(m5, T - 600, 300)).toBe(-2); // before the first bar
    // a 5m drawing on a 15m chart lands inside the right bar
    const m15 = [0, 1, 2].map((i) => T + i * 900);
    expect(timeToLogical(m15, T + 300, 900)).toBeCloseTo(1 / 3);
    // a gap (weekend) between bars is interpolated over the gap, not the step
    const gap = [T, T + 300, T + 300 + 172_800];
    expect(timeToLogical(gap, T + 300 + 86_400, 300)).toBe(1.5);
    expect(timeToLogical([], T, 300)).toBe(0);
  });

  it("logicalToTime is the inverse of timeToLogical", () => {
    for (const t of [T - 900, T, T + 150, T + 900, T + 1200, T + 3000]) expect(logicalToTime(m5, timeToLogical(m5, t, 300), 300)).toBe(t);
  });

  it("computes Fibonacci retracement levels: 0 at the end of the move, 1 at its start", () => {
    const lv = fibLevels({ time: T, price: 100 }, { time: T + 900, price: 200 });
    expect(lv.map((l) => l.ratio)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(lv[0]!.price).toBe(200);
    expect(lv[3]!.price).toBe(150);
    expect(lv[4]!.price).toBeCloseTo(138.2);
    expect(lv[6]!.price).toBe(100);
  });

  it("hit-tests handles before bodies, per kind", () => {
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(-3, 4, 0, 0, 10, 0)).toBe(5);
    const line = {
      kind: "trendline" as const,
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    expect(hitTest(line, 1, 1, 500)).toEqual({ part: "handle", index: 0 });
    expect(hitTest(line, 50, 52, 500)).toEqual({ part: "body" });
    expect(hitTest(line, 50, 80, 500)).toBeUndefined();
    expect(hitTest({ kind: "hline", pts: [{ x: 40, y: 200 }] }, 400, 203, 500)).toEqual({ part: "body" });
    const rect = {
      kind: "rect" as const,
      pts: [
        { x: 10, y: 10 },
        { x: 60, y: 40 },
      ],
    };
    expect(hitTest(rect, 30, 25, 500)).toEqual({ part: "body" });
    expect(hitTest(rect, 60, 40, 500)).toEqual({ part: "handle", index: 1 });
    expect(hitTest(rect, 90, 25, 500)).toBeUndefined();
    const fib = {
      kind: "fib" as const,
      pts: [
        { x: 0, y: 100 },
        { x: 100, y: 0 },
      ],
      levels: [{ y: 0 }, { y: 50 }, { y: 100 }],
    };
    expect(hitTest(fib, 70, 51, 500)).toEqual({ part: "body" });
    expect(hitTest(fib, 70, 75, 500)).toBeUndefined();
    expect(hitTest(fib, 150, 50, 500)).toBeUndefined();
  });

  it("validates drawings: point count per tool, sane times and prices", () => {
    expect(DRAWING_POINTS).toEqual({ trendline: 2, hline: 1, rect: 2, fib: 2 });
    const ok = drawingCreateSchema.safeParse({
      symbol: "XAUUSD",
      kind: "fib",
      points: [
        { time: T, price: 2400 },
        { time: T + 900, price: 2450 },
      ],
    });
    expect(ok.success).toBe(true);
    expect(
      drawingCreateSchema.safeParse({
        symbol: "XAUUSD",
        kind: "hline",
        points: [
          { time: T, price: 2400 },
          { time: T, price: 2401 },
        ],
      }).success,
    ).toBe(false);
    expect(drawingCreateSchema.safeParse({ symbol: "XAUUSD", kind: "trendline", points: [{ time: T, price: 2400 }] }).success).toBe(false);
    expect(
      drawingCreateSchema.safeParse({
        symbol: "XAUUSD",
        kind: "rect",
        points: [
          { time: T * 1000, price: 1 },
          { time: T, price: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(drawingCreateSchema.safeParse({ symbol: "XAUUSD", kind: "hline", points: [{ time: T, price: Number.NaN }] }).success).toBe(
      false,
    );
    expect(drawingCreateSchema.safeParse({ symbol: "XAUUSD", kind: "circle", points: [{ time: T, price: 1 }] }).success).toBe(false);
  });
});
