import type { Timeframe, SessionName } from "@tradingworld/shared";

export interface Candle {
  time: number; // unix seconds, candle open time (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Direction = "bullish" | "bearish";
export type Bias = "bullish" | "bearish" | "neutral";

export interface Swing {
  index: number;
  time: number;
  price: number;
  kind: "high" | "low";
}

export interface StructureEvent {
  id: string;
  kind: "BOS" | "CHoCH";
  direction: Direction;
  index: number; // candle that closed through the level
  time: number;
  level: number; // swing level that was broken
  swingIndex: number; // index of the broken swing
}

export interface StructureState {
  trend: Bias;
  swings: Swing[];
  events: StructureEvent[];
  lastSwingHigh?: Swing;
  lastSwingLow?: Swing;
}

export interface FairValueGap {
  id: string;
  direction: Direction;
  index: number; // middle candle (the displacement candle)
  time: number;
  top: number;
  bottom: number;
  size: number;
  sizeAtr: number;
  mitigated: boolean;
  mitigatedIndex?: number;
  fillRatio: number; // 0..1 how much of the gap has been filled
}

export interface OrderBlock {
  id: string;
  direction: Direction;
  index: number; // the OB candle
  time: number;
  top: number;
  bottom: number;
  displacementIndex: number;
  mitigated: boolean;
  mitigatedIndex?: number;
}

export interface Displacement {
  id: string;
  index: number;
  time: number;
  direction: Direction;
  bodyAtr: number; // body size in ATR multiples
  bodyRatio: number; // body / range
}

export type LiquidityKind = "EQH" | "EQL" | "PDH" | "PDL" | "PWH" | "PWL" | "SESSION_HIGH" | "SESSION_LOW" | "SWING_HIGH" | "SWING_LOW";

export interface LiquidityPool {
  id: string;
  kind: LiquidityKind;
  side: "buy-side" | "sell-side"; // buy-side = above price (stops of shorts), sell-side = below
  price: number;
  touches: number;
  indices: number[];
  swept: boolean;
  sweptIndex?: number;
  label: string;
  timeframe: Timeframe;
}

export interface Sweep {
  id: string;
  poolId: string;
  poolKind: LiquidityKind;
  index: number;
  time: number;
  side: "buy-side" | "sell-side";
  level: number;
  wickExtreme: number;
  reclaimed: boolean; // closed back on the original side of the level
  displacementAfter: boolean; // a displacement candle followed within a few bars
}

export interface KeyLevel {
  id: string;
  kind: LiquidityKind | "HTF_SWING_HIGH" | "HTF_SWING_LOW" | "HTF_FVG" | "HTF_OB";
  price: number;
  top?: number;
  bottom?: number;
  timeframe: Timeframe;
  label: string;
}

export interface Regime {
  trend: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING";
  volatility: "HIGH" | "NORMAL" | "LOW";
  phase: "EXPANSION" | "CONSOLIDATION" | "NEUTRAL";
  atr: number;
  atrRatio: number; // current ATR / long-run average ATR
  rangeWidthAtr: number; // width of recent swing range in ATR
}

export type FactorKey =
  | "HTF_LEVEL"
  | "LIQUIDITY_SWEEP"
  | "STRUCTURE_SHIFT"
  | "DISPLACEMENT"
  | "FVG"
  | "ORDER_BLOCK"
  | "HTF_BIAS_ALIGN"
  | "SESSION_RELEVANCE"
  | "VOLATILITY_CONDITION"
  | "FRESH";

export interface Factor {
  key: FactorKey;
  present: boolean;
  weight: number;
  contribution: number;
  label: { ar: string; en: string };
  evidence?: { ar: string; en: string };
}

export type ZoneStatus = "DETECTED" | "CONFIRMED" | "ACTIVE" | "TESTED" | "REACTED" | "WEAKENED" | "INVALIDATED";

export type ZoneQuality = "HIGH" | "MEDIUM" | "LOW";

export type ZoneOrigin = "FVG" | "ORDER_BLOCK" | "SWEEP_RECLAIM" | "HTF_LEVEL";

export interface Zone {
  id: string;
  name: string;
  nameAr: string;
  origin: ZoneOrigin;
  direction: Direction;
  timeframe: Timeframe;
  top: number;
  bottom: number;
  createdIndex: number;
  createdTime: number;
  score: number;
  quality: ZoneQuality;
  factors: Factor[];
  status: ZoneStatus;
  tests: number;
  lastTestIndex?: number;
  /** candle index whose close invalidated the zone (only when status is INVALIDATED) */
  invalidatedIndex?: number;
  invalidation: { price: number; ar: string; en: string };
  htfContext: string[];
  sourceIds: string[];
  explanation: ZoneExplanation;
}

export interface ZoneExplanation {
  summary: { ar: string; en: string };
  reasons: { ar: string; en: string }[];
  weaknesses: { ar: string; en: string }[];
  invalidation: { ar: string; en: string };
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  bars: number;
  bias: Bias;
  structure: StructureState;
  fvgs: FairValueGap[];
  orderBlocks: OrderBlock[];
  displacements: Displacement[];
  liquidity: LiquidityPool[];
  sweeps: Sweep[];
  regime: Regime;
  atr: number;
}

export interface SessionInfo {
  current: SessionName;
  overlap: boolean;
  sessionHigh?: number;
  sessionLow?: number;
  previousSessionHigh?: number;
  previousSessionLow?: number;
}

export interface HtfContext {
  timeframe: Timeframe;
  bars: number;
  bias: Bias;
  regime: Regime["trend"];
  keyLevels: KeyLevel[];
}

export interface AnalysisResult {
  engineVersion: string;
  scoringVersion: string;
  symbol: string;
  timeframe: Timeframe;
  generatedAt: number;
  lastPrice: number;
  lastCandleTime: number;
  base: TimeframeAnalysis;
  htf: HtfContext[];
  htfBias: Bias;
  keyLevels: KeyLevel[];
  session: SessionInfo;
  zones: Zone[];
  hiddenLowQuality: number;
  narrative: { ar: string; en: string };
  disclaimer: { ar: string; en: string };
}

export interface EngineOptions {
  /** fractal lookback for swing detection */
  swingLookback: number;
  /** ATR period */
  atrPeriod: number;
  /** candle body must exceed this × ATR to count as displacement */
  displacementAtr: number;
  /** minimum FVG size in ATR multiples */
  minFvgAtr: number;
  /** equal highs/lows tolerance in ATR multiples */
  equalTolAtr: number;
  /** how many recent candles are eligible to spawn zones */
  zoneLookback: number;
  /** max zones shown per quality tier */
  maxHigh: number;
  maxMedium: number;
  includeLowQuality: boolean;
  /** keep zones invalidated within the last N candles in the output (stamped INVALIDATED); 0 = drop them */
  keepInvalidatedBars: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  swingLookback: 3,
  atrPeriod: 14,
  displacementAtr: 1.5,
  minFvgAtr: 0.3,
  equalTolAtr: 0.15,
  zoneLookback: 250,
  maxHigh: 3,
  maxMedium: 5,
  includeLowQuality: false,
  keepInvalidatedBars: 0,
};
