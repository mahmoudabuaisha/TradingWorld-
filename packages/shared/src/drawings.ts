/**
 * UI-01 — the human's drawings on the chart, in chalk. Pure geometry and vocabulary shared by the web (rendering,
 * interaction) and the API (validation, storage). Every point is anchored to (time, price), never to pixels or bar
 * indices, so a drawing survives zoom, scrolling, timeframe changes and new candles.
 */
export const DRAWING_KINDS = ["trendline", "hline", "rect", "fib"] as const;
export type DrawingKind = (typeof DRAWING_KINDS)[number];

export interface DrawingPoint {
  /** unix seconds */
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  symbol: string;
  kind: DrawingKind;
  points: DrawingPoint[];
  /** ms */
  createdAt: number;
  updatedAt: number;
}

/** points needed to complete each tool */
export const DRAWING_POINTS: Record<DrawingKind, number> = { trendline: 2, hline: 1, rect: 2, fib: 2 };
export const MAX_DRAWINGS_PER_SYMBOL = 200;

/**
 * Fibonacci retracement of the move from the first point (start) to the second (end):
 * level 0 sits on the end of the move, level 1 back on its start; 0.382 / 0.5 / 0.618 are the classic retracements.
 */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export function fibLevels(start: DrawingPoint, end: DrawingPoint): { ratio: number; price: number }[] {
  return FIB_LEVELS.map((ratio) => ({ ratio, price: end.price + (start.price - end.price) * ratio }));
}

/**
 * Time → fractional bar index over an ascending list of bar times. Between two bars it interpolates (a 5m drawing
 * viewed on 15m lands inside the right bar); before the first / after the last bar it extrapolates by `step` seconds,
 * so drawings reach into the empty future area right of the last candle.
 */
export function timeToLogical(times: readonly number[], time: number, step: number): number {
  const n = times.length;
  if (!n) return 0;
  if (time <= times[0]!) return (time - times[0]!) / step;
  if (time >= times[n - 1]!) return n - 1 + (time - times[n - 1]!) / step;
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= time) lo = mid;
    else hi = mid;
  }
  const a = times[lo]!,
    b = times[hi]!;
  return lo + (b === a ? 0 : (time - a) / (b - a));
}

/** Inverse of timeToLogical. Snaps to whole seconds. */
export function logicalToTime(times: readonly number[], logical: number, step: number): number {
  const n = times.length;
  if (!n) return 0;
  if (logical <= 0) return Math.round(times[0]! + logical * step);
  if (logical >= n - 1) return Math.round(times[n - 1]! + (logical - (n - 1)) * step);
  const i = Math.floor(logical);
  const a = times[i]!,
    b = times[i + 1]!;
  return Math.round(a + (b - a) * (logical - i));
}

/** Shortest pixel distance from (px, py) to the segment a–b. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Pixel geometry of one drawing, as the renderer lays it out. */
export interface DrawingPixels {
  kind: DrawingKind;
  pts: { x: number; y: number }[];
  levels?: { y: number }[];
}

/**
 * Hit test in pixel space: which handle (point index) or the body is under the pointer, if any.
 * Handles win over the body so endpoints stay grabbable on short lines.
 */
export function hitTest(
  d: DrawingPixels,
  x: number,
  y: number,
  width: number,
  tolerance = 6,
): { part: "handle"; index: number } | { part: "body" } | undefined {
  for (let i = 0; i < d.pts.length; i++)
    if (Math.hypot(x - d.pts[i]!.x, y - d.pts[i]!.y) <= tolerance + 2) return { part: "handle", index: i };
  const [a, b] = d.pts;
  if (!a) return undefined;
  switch (d.kind) {
    case "hline":
      return Math.abs(y - a.y) <= tolerance && x >= 0 && x <= width ? { part: "body" } : undefined;
    case "trendline":
      return b && distToSegment(x, y, a.x, a.y, b.x, b.y) <= tolerance ? { part: "body" } : undefined;
    case "rect": {
      if (!b) return undefined;
      const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)],
        [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      const inside = x >= x1 - tolerance && x <= x2 + tolerance && y >= y1 - tolerance && y <= y2 + tolerance;
      return inside ? { part: "body" } : undefined;
    }
    case "fib": {
      if (!b) return undefined;
      const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      if (x < x1 - tolerance || x > x2 + tolerance) return undefined;
      return (d.levels ?? []).some((l) => Math.abs(y - l.y) <= tolerance) || distToSegment(x, y, a.x, a.y, b.x, b.y) <= tolerance
        ? { part: "body" }
        : undefined;
    }
  }
}
