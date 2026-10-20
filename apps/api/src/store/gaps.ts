import { bucketStart, type Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, marketState, type Instrument, type Timeframe } from "@tradingworld/shared";

export interface Gap {
  /** s — first and last missing bucket start (inclusive) */
  from: number;
  to: number;
  bars: number;
}

/**
 * Missing buckets inside a stored series, ignoring buckets that fall in closed market hours
 * (a forex weekend is not a gap). Monthly series are not scanned (buckets are calendar-sized).
 */
export function findGaps(
  candles: Candle[],
  tf: Timeframe,
  instrument: Pick<Instrument, "assetClass" | "sessionTimezone">,
  opts: { maxGaps?: number } = {},
): Gap[] {
  if (tf === "1M" || candles.length < 2) return [];
  const step = TIMEFRAME_SECONDS[tf];
  const maxGaps = opts.maxGaps ?? 200;
  const gaps: Gap[] = [];
  let current: Gap | undefined;
  const flush = () => {
    if (current) {
      gaps.push(current);
      current = undefined;
    }
  };
  for (let i = 1; i < candles.length && gaps.length < maxGaps; i++) {
    const prev = candles[i - 1]!.time;
    const next = candles[i]!.time;
    if (next - prev <= step) continue;
    for (let t = bucketStart(prev + step, tf); t < next; t += step) {
      // a bucket is expected only if the market is open somewhere inside it
      const open = marketState(instrument, t * 1000 + Math.floor(step / 2) * 1000).open || marketState(instrument, t * 1000).open;
      if (!open) {
        flush();
        continue;
      }
      if (current && current.to + step === t) {
        current.to = t;
        current.bars++;
      } else {
        flush();
        current = { from: t, to: t, bars: 1 };
      }
    }
    flush();
  }
  return gaps;
}
