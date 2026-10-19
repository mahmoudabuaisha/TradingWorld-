import type { Candle, AnalysisResult, TimeframeAnalysis, HtfContext, KeyLevel, EngineOptions, Bias, LiquidityPool } from "./types.js";
import { DEFAULT_ENGINE_OPTIONS } from "./types.js";
import { ENGINE_VERSION, SCORING_VERSION } from "./version.js";
import { atr as atrSeries } from "./indicators.js";
import { detectSwings } from "./detectors/swings.js";
import { detectStructure, structureBias } from "./detectors/structure.js";
import { detectFVGs } from "./detectors/fvg.js";
import { detectDisplacements } from "./detectors/displacement.js";
import { detectOrderBlocks } from "./detectors/orderBlocks.js";
import { detectEqualLevels, detectSweeps, swingLiquidity } from "./detectors/liquidity.js";
import { previousPeriodLevels, sessionLevels, poolsToKeyLevels } from "./detectors/levels.js";
import { detectRegime } from "./detectors/regime.js";
import { aggregate, canAggregate } from "./mtf/aggregate.js";
import { buildZones } from "./zones/builder.js";
import { narrative } from "./explain/explainer.js";
import { MTF_CONTEXT, DISCLAIMER, type Timeframe } from "@tradingworld/shared";

export interface AnalyzeInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  /** Optional explicit higher-timeframe candles (preferred). Missing ones are aggregated from the base series. */
  htfCandles?: Partial<Record<Timeframe, Candle[]>>;
  pricePrecision?: number;
  options?: Partial<EngineOptions>;
  now?: number;
}

/** Single-timeframe pass: all detectors over one candle series. */
export function analyzeTimeframe(candles: Candle[], timeframe: Timeframe, opts: EngineOptions): TimeframeAnalysis {
  const atrs = atrSeries(candles, opts.atrPeriod);
  const atr = atrs[atrs.length - 1] || 1;
  const swings = detectSwings(candles, opts.swingLookback);
  const structure = detectStructure(candles, swings);
  const displacements = detectDisplacements(candles, atrs, opts.displacementAtr);
  const fvgs = detectFVGs(candles, atrs, opts.minFvgAtr);
  const orderBlocks = detectOrderBlocks(candles, displacements);
  const liquidity: LiquidityPool[] = [
    ...detectEqualLevels(swings, atr, opts.equalTolAtr, timeframe),
    ...swingLiquidity(swings, candles, timeframe),
  ];
  const sweeps = detectSweeps(candles, liquidity, displacements);
  const regime = detectRegime(candles, atrs, structure);
  return { timeframe, bars: candles.length, bias: structureBias(structure), structure, fvgs, orderBlocks, displacements, liquidity, sweeps, regime, atr };
}

/**
 * Full pipeline: Market Data → Detection → Structured Analysis → Scoring → Explanation.
 * Pure and deterministic: the same input always yields the same output (required for replay/backtests).
 */
export function analyze(input: AnalyzeInput): AnalysisResult {
  const opts: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS, ...input.options };
  const candles = input.candles;
  if (candles.length < 50) throw new Error("analyze() needs at least 50 candles");
  const precision = input.pricePrecision ?? 2;
  const tf = input.timeframe;

  // ── base timeframe
  const base = analyzeTimeframe(candles, tf, opts);
  const prevLevels = previousPeriodLevels(candles, tf);
  const { info: session, pools: sessionPools } = sessionLevels(candles, tf);
  const basePools = [...prevLevels, ...sessionPools];
  // sweeps of PDH/PDL/session levels count too
  base.sweeps.push(...detectSweeps(candles, basePools, base.displacements));
  base.liquidity.push(...basePools);

  // ── higher timeframes
  const htf: HtfContext[] = [];
  const keyLevels: KeyLevel[] = poolsToKeyLevels(basePools);
  for (const h of MTF_CONTEXT[tf]) {
    let series = input.htfCandles?.[h];
    if (!series && canAggregate(tf, h)) series = aggregate(candles, h);
    if (!series || series.length < 20) continue;
    const a = analyzeTimeframe(series, h, { ...opts, swingLookback: Math.max(2, opts.swingLookback - 1) });
    const last = candles[candles.length - 1]!.close;
    const lv: KeyLevel[] = [];
    if (a.structure.lastSwingHigh) lv.push({ id: `kl-${h}-sh`, kind: "HTF_SWING_HIGH", price: a.structure.lastSwingHigh.price, timeframe: h, label: `${h} Swing High` });
    if (a.structure.lastSwingLow) lv.push({ id: `kl-${h}-sl`, kind: "HTF_SWING_LOW", price: a.structure.lastSwingLow.price, timeframe: h, label: `${h} Swing Low` });
    for (const g of a.fvgs.filter((g) => !g.mitigated).slice(-3)) lv.push({ id: `kl-${h}-${g.id}`, kind: "HTF_FVG", price: (g.top + g.bottom) / 2, top: g.top, bottom: g.bottom, timeframe: h, label: `${h} ${g.direction} FVG` });
    for (const o of a.orderBlocks.filter((o) => !o.mitigated).slice(-2)) lv.push({ id: `kl-${h}-${o.id}`, kind: "HTF_OB", price: (o.top + o.bottom) / 2, top: o.top, bottom: o.bottom, timeframe: h, label: `${h} ${o.direction} OB` });
    for (const p of a.liquidity.filter((p) => p.kind === "EQH" || p.kind === "EQL")) lv.push({ id: `kl-${h}-${p.id}`, kind: p.kind, price: p.price, timeframe: h, label: `${h} ${p.label}` });
    lv.sort((x, y) => Math.abs(x.price - last) - Math.abs(y.price - last));
    htf.push({ timeframe: h, bars: series.length, bias: a.bias, regime: a.regime.trend, keyLevels: lv });
    keyLevels.push(...lv);
  }
  const htfBias = dominantBias(htf);

  // ── zones
  const { zones, hiddenLowQuality } = buildZones(candles, base, htf, htfBias, keyLevels, session, tf, precision, opts);

  const lastCandle = candles[candles.length - 1]!;
  const partial = {
    engineVersion: ENGINE_VERSION,
    scoringVersion: SCORING_VERSION,
    symbol: input.symbol,
    timeframe: tf,
    generatedAt: input.now ?? Math.floor(Date.now() / 1000),
    lastPrice: lastCandle.close,
    lastCandleTime: lastCandle.time,
    base,
    htf,
    htfBias,
    keyLevels: keyLevels.sort((a, b) => Math.abs(a.price - lastCandle.close) - Math.abs(b.price - lastCandle.close)).slice(0, 12),
    session,
    zones,
    hiddenLowQuality,
  };
  return { ...partial, narrative: narrative(partial, precision), disclaimer: DISCLAIMER };
}

function dominantBias(htf: HtfContext[]): Bias {
  // weight higher timeframes more (first entries are highest)
  let score = 0;
  htf.forEach((h, i) => {
    const w = htf.length - i;
    if (h.bias === "bullish") score += w;
    else if (h.bias === "bearish") score -= w;
  });
  if (score > 0) return "bullish";
  if (score < 0) return "bearish";
  return "neutral";
}
