import type { Candle, KeyLevel, LiquidityPool, SessionInfo } from "../types.js";
import { primarySessionAt, isLondonNewYorkOverlap, type SessionName, type Timeframe } from "@tradingworld/shared";

function dayKey(t: number): number {
  return Math.floor(t / 86400);
}
function weekKey(t: number): number {
  return Math.floor((t + 4 * 86400) / 604800);
} // weeks starting Monday

/** Previous day / week high & low from the base candles (any timeframe ≤ 1d). */
export function previousPeriodLevels(candles: Candle[], timeframe: Timeframe): LiquidityPool[] {
  const out: LiquidityPool[] = [];
  const last = candles[candles.length - 1]!;
  for (const [kind, keyFn, labelH, labelL] of [
    ["day", dayKey, "PDH", "PDL"],
    ["week", weekKey, "PWH", "PWL"],
  ] as const) {
    const currentKey = keyFn(last.time);
    let prevKey: number | undefined;
    let hi = -Infinity,
      lo = Infinity,
      hiIdx = -1,
      loIdx = -1;
    for (let i = candles.length - 1; i >= 0; i--) {
      const k = keyFn(candles[i]!.time);
      if (k === currentKey) continue;
      if (prevKey === undefined) prevKey = k;
      if (k !== prevKey) break;
      const c = candles[i]!;
      if (c.high > hi) {
        hi = c.high;
        hiIdx = i;
      }
      if (c.low < lo) {
        lo = c.low;
        loIdx = i;
      }
    }
    if (hiIdx >= 0) {
      out.push({
        id: `${labelH.toLowerCase()}`,
        kind: labelH,
        side: "buy-side",
        price: hi,
        touches: 1,
        indices: [hiIdx],
        swept: false,
        label: kind === "day" ? "Previous Day High" : "Previous Week High",
        timeframe,
      });
      out.push({
        id: `${labelL.toLowerCase()}`,
        kind: labelL,
        side: "sell-side",
        price: lo,
        touches: 1,
        indices: [loIdx],
        swept: false,
        label: kind === "day" ? "Previous Day Low" : "Previous Week Low",
        timeframe,
      });
    }
  }
  return out;
}

/** Session high/low for the current and previous session. */
export function sessionLevels(candles: Candle[], timeframe: Timeframe): { info: SessionInfo; pools: LiquidityPool[] } {
  const last = candles[candles.length - 1]!;
  const current = primarySessionAt(last.time);
  const overlap = isLondonNewYorkOverlap(last.time);
  const pools: LiquidityPool[] = [];
  const info: SessionInfo = { current, overlap };

  // walk back and split into contiguous session blocks
  const blocks: { name: SessionName; hi: number; lo: number; hiIdx: number; loIdx: number }[] = [];
  for (let i = candles.length - 1; i >= 0 && blocks.length < 2; i--) {
    const c = candles[i]!;
    const s = primarySessionAt(c.time);
    const b = blocks[blocks.length - 1];
    if (!b || b.name !== s) {
      if (blocks.length === 2) break;
      blocks.push({ name: s, hi: c.high, lo: c.low, hiIdx: i, loIdx: i });
    } else {
      if (c.high > b.hi) {
        b.hi = c.high;
        b.hiIdx = i;
      }
      if (c.low < b.lo) {
        b.lo = c.low;
        b.loIdx = i;
      }
    }
  }
  const cur = blocks[0];
  const prev = blocks[1];
  if (cur) {
    info.sessionHigh = cur.hi;
    info.sessionLow = cur.lo;
  }
  if (prev) {
    info.previousSessionHigh = prev.hi;
    info.previousSessionLow = prev.lo;
    pools.push({
      id: `sh-${prev.name}`,
      kind: "SESSION_HIGH",
      side: "buy-side",
      price: prev.hi,
      touches: 1,
      indices: [prev.hiIdx],
      swept: false,
      label: `${prev.name} Session High`,
      timeframe,
    });
    pools.push({
      id: `sl-${prev.name}`,
      kind: "SESSION_LOW",
      side: "sell-side",
      price: prev.lo,
      touches: 1,
      indices: [prev.loIdx],
      swept: false,
      label: `${prev.name} Session Low`,
      timeframe,
    });
  }
  return { info, pools };
}

export function poolsToKeyLevels(pools: LiquidityPool[]): KeyLevel[] {
  return pools.map((p) => ({ id: `kl-${p.id}`, kind: p.kind, price: p.price, timeframe: p.timeframe, label: p.label }));
}
