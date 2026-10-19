import type {
  Candle, Zone, Factor, Direction, ZoneOrigin, TimeframeAnalysis, HtfContext, KeyLevel, Sweep, SessionInfo, Bias, EngineOptions,
} from "../types.js";
import type { Timeframe } from "@tradingworld/shared";
import { makeFactor, scoreFactors, qualityFromScore } from "../scoring/confluence.js";
import { nameZone } from "./naming.js";
import { evaluateLifecycle } from "./lifecycle.js";
import { explainZone } from "../explain/explainer.js";

interface Candidate {
  origin: ZoneOrigin;
  direction: Direction;
  top: number;
  bottom: number;
  createdIndex: number;
  sourceIds: string[];
  sweep?: Sweep;
}

/**
 * 1. Collect candidates (unmitigated FVGs, OBs, sweep-reclaim wicks, HTF levels near price).
 * 2. Evaluate the 10 confluence factors for each with explicit evidence.
 * 3. Score, name, replay lifecycle, explain.
 * 4. Merge overlaps, drop invalidated, filter by quality tier → "less noise, more information".
 */
export function buildZones(
  candles: Candle[],
  base: TimeframeAnalysis,
  htf: HtfContext[],
  htfBias: Bias,
  keyLevels: KeyLevel[],
  session: SessionInfo,
  timeframe: Timeframe,
  precision: number,
  opts: EngineOptions,
): { zones: Zone[]; hiddenLowQuality: number } {
  const n = candles.length;
  const last = candles[n - 1]!;
  const atr = base.atr;
  const minIdx = Math.max(0, n - opts.zoneLookback);
  const candidates: Candidate[] = [];

  for (const g of base.fvgs) if (!g.mitigated && g.index >= minIdx) candidates.push({ origin: "FVG", direction: g.direction, top: g.top, bottom: g.bottom, createdIndex: g.index, sourceIds: [g.id] });
  for (const ob of base.orderBlocks) if (!ob.mitigated && ob.index >= minIdx) candidates.push({ origin: "ORDER_BLOCK", direction: ob.direction, top: ob.top, bottom: ob.bottom, createdIndex: ob.index, sourceIds: [ob.id] });
  for (const s of base.sweeps) {
    if (!s.reclaimed || s.index < minIdx) continue;
    const direction: Direction = s.side === "sell-side" ? "bullish" : "bearish";
    const top = s.side === "sell-side" ? s.level : s.wickExtreme;
    const bottom = s.side === "sell-side" ? s.wickExtreme : s.level;
    if (top - bottom < atr * 0.05) continue;
    candidates.push({ origin: "SWEEP_RECLAIM", direction, top, bottom, createdIndex: s.index, sourceIds: [s.id], sweep: s });
  }
  for (const k of keyLevels) {
    if (Math.abs(k.price - last.close) > atr * 4) continue;
    const direction: Direction = k.price < last.close ? "bullish" : "bearish";
    const band = atr * 0.25;
    candidates.push({ origin: "HTF_LEVEL", direction, top: (k.top ?? k.price) + band, bottom: (k.bottom ?? k.price) - band, createdIndex: n - 1, sourceIds: [k.id] });
  }

  const zones: Zone[] = candidates.map((c, i) => {
    const factors = evaluateFactors(c, base, htf, htfBias, keyLevels, session, atr, precision);
    const score = scoreFactors(factors);
    const htfLevel = keyLevels.find((k) => overlaps(c.bottom - atr * 0.5, c.top + atr * 0.5, k.bottom ?? k.price, k.top ?? k.price));
    const names = nameZone(c.direction, c.origin, factors, c.sweep ?? nearestSweep(c, base.sweeps, atr), htfLevel?.timeframe);
    const zone: Zone = {
      id: `z-${timeframe}-${c.origin.toLowerCase()}-${c.createdIndex}-${i}`,
      name: names.en,
      nameAr: names.ar,
      origin: c.origin,
      direction: c.direction,
      timeframe,
      top: round(c.top, precision),
      bottom: round(c.bottom, precision),
      createdIndex: c.createdIndex,
      createdTime: candles[c.createdIndex]!.time,
      score,
      quality: qualityFromScore(score),
      factors,
      status: "DETECTED",
      tests: 0,
      invalidation: { price: c.direction === "bullish" ? round(c.bottom, precision) : round(c.top, precision), ar: "", en: "" },
      htfContext: htf.map((h) => `${h.timeframe} ${h.bias}`),
      sourceIds: c.sourceIds,
      explanation: { summary: { ar: "", en: "" }, reasons: [], weaknesses: [], invalidation: { ar: "", en: "" } },
    };
    const life = evaluateLifecycle(zone, candles, atr);
    zone.status = life.status;
    zone.tests = life.tests;
    zone.lastTestIndex = life.lastTestIndex;
    zone.invalidatedIndex = life.invalidatedIndex;
    // FRESH factor depends on lifecycle → recompute after replay
    const fresh = zone.factors.find((f) => f.key === "FRESH")!;
    fresh.present = zone.tests === 0;
    fresh.contribution = fresh.present ? fresh.weight : 0;
    fresh.evidence = fresh.present ? { ar: "لم يعد السعر إلى المنطقة بعد تكوّنها.", en: "Price has not returned to the zone since it formed." } : undefined;
    zone.score = scoreFactors(zone.factors);
    zone.quality = qualityFromScore(zone.score);
    zone.explanation = explainZone(zone.direction, timeframe, zone.top, zone.bottom, zone.factors, zone.tests, precision);
    zone.invalidation.ar = zone.explanation.invalidation.ar;
    zone.invalidation.en = zone.explanation.invalidation.en;
    return zone;
  });

  const live = zones.filter((z) => z.status !== "INVALIDATED").sort((a, b) => b.score - a.score);
  const merged: Zone[] = [];
  for (const z of live) {
    const dup = merged.find((m) => m.direction === z.direction && overlapRatio(m, z) > 0.5);
    if (dup) { dup.sourceIds.push(...z.sourceIds); continue; }
    merged.push(z);
  }
  const high = merged.filter((z) => z.quality === "HIGH").slice(0, opts.maxHigh);
  const medium = merged.filter((z) => z.quality === "MEDIUM").slice(0, opts.maxMedium);
  const low = merged.filter((z) => z.quality === "LOW");
  const shown = [...high, ...medium, ...(opts.includeLowQuality ? low.slice(0, 5) : [])];
  // recently invalidated zones are kept (stamped) so the trader can learn from them; never merged, never counted
  const recentlyInvalidated = opts.keepInvalidatedBars > 0
    ? zones.filter((z) => z.status === "INVALIDATED" && z.invalidatedIndex !== undefined && n - 1 - z.invalidatedIndex <= opts.keepInvalidatedBars && z.quality !== "LOW")
        .sort((a, b) => (b.invalidatedIndex ?? 0) - (a.invalidatedIndex ?? 0)).slice(0, 4)
    : [];
  return { zones: [...shown, ...recentlyInvalidated], hiddenLowQuality: opts.includeLowQuality ? Math.max(0, low.length - 5) : low.length };
}

function evaluateFactors(c: Candidate, base: TimeframeAnalysis, htf: HtfContext[], htfBias: Bias, keyLevels: KeyLevel[], session: SessionInfo, atr: number, precision: number): Factor[] {
  const f: Factor[] = [];
  const fmt = (n: number) => n.toFixed(precision);
  const tol = atr * 0.5;

  const htfLevel = keyLevels.find((k) => overlaps(c.bottom - tol, c.top + tol, k.bottom ?? k.price, k.top ?? k.price));
  f.push(makeFactor("HTF_LEVEL", !!htfLevel, htfLevel ? { ar: `تتقاطع المنطقة مع ${htfLevel.label} (${htfLevel.timeframe}) عند ${fmt(htfLevel.price)}.`, en: `The zone intersects ${htfLevel.label} (${htfLevel.timeframe}) at ${fmt(htfLevel.price)}.` } : undefined));

  const sweep = c.sweep ?? base.sweeps.find((s) => s.reclaimed && Math.abs(s.index - c.createdIndex) <= 12 && (c.direction === "bullish" ? s.side === "sell-side" : s.side === "buy-side") && Math.abs(s.level - (c.direction === "bullish" ? c.bottom : c.top)) <= atr * 1.5);
  f.push(makeFactor("LIQUIDITY_SWEEP", !!sweep, sweep ? { ar: `تم سحب ${sweep.side === "sell-side" ? "سيولة البيع" : "سيولة الشراء"} (${sweep.poolKind}) عند ${fmt(sweep.level)} مع إغلاق معاكس.`, en: `${sweep.side === "sell-side" ? "Sell-side" : "Buy-side"} liquidity (${sweep.poolKind}) was swept at ${fmt(sweep.level)} with a reclaim close.` } : undefined));

  const shift = base.structure.events.find((e) => e.direction === c.direction && e.index >= c.createdIndex && e.index <= c.createdIndex + 30);
  f.push(makeFactor("STRUCTURE_SHIFT", !!shift, shift ? { ar: `حدث ${shift.kind} ${c.direction === "bullish" ? "صاعد" : "هابط"} بكسر ${fmt(shift.level)} بعد تكوّن المنطقة.`, en: `A ${c.direction} ${shift.kind} broke ${fmt(shift.level)} after the zone formed.` } : undefined));

  const disp = base.displacements.find((d) => d.direction === c.direction && d.index >= c.createdIndex && d.index <= c.createdIndex + 5);
  f.push(makeFactor("DISPLACEMENT", !!disp, disp ? { ar: `شمعة اندفاع بحجم ${disp.bodyAtr.toFixed(1)}×ATR انطلقت من المنطقة.`, en: `A displacement candle of ${disp.bodyAtr.toFixed(1)}×ATR left the zone.` } : undefined));

  const fvg = base.fvgs.find((g) => g.direction === c.direction && !g.mitigated && overlaps(c.bottom, c.top, g.bottom, g.top));
  f.push(makeFactor("FVG", !!fvg, fvg ? { ar: `توجد فجوة قيمة عادلة غير مغطاة بحجم ${fvg.sizeAtr.toFixed(1)}×ATR داخل المنطقة.`, en: `An unmitigated fair value gap of ${fvg.sizeAtr.toFixed(1)}×ATR sits inside the zone.` } : undefined));

  const ob = base.orderBlocks.find((o) => o.direction === c.direction && !o.mitigated && overlaps(c.bottom, c.top, o.bottom, o.top));
  f.push(makeFactor("ORDER_BLOCK", !!ob, ob ? { ar: `تتداخل المنطقة مع Order Block ${c.direction === "bullish" ? "صاعد" : "هابط"} غير مُخفف.`, en: `The zone overlaps an unmitigated ${c.direction} order block.` } : undefined));

  const aligned = htfBias === c.direction;
  f.push(makeFactor("HTF_BIAS_ALIGN", aligned, aligned ? { ar: `اتجاه المنطقة يوافق الاتجاه الغالب على الفريمات الأعلى (${htf.map((h) => h.timeframe).join("/")}).`, en: `Zone direction matches the dominant higher-timeframe bias (${htf.map((h) => h.timeframe).join("/")}).` } : undefined));

  const activeSession = session.current !== "OFF" && session.current !== "ASIA";
  f.push(makeFactor("SESSION_RELEVANCE", activeSession, activeSession ? { ar: `تكوّنت خلال جلسة ${session.current}${session.overlap ? " (تداخل لندن/نيويورك)" : ""}.`, en: `Formed during the ${session.current} session${session.overlap ? " (London/NY overlap)" : ""}.` } : undefined));

  const volOk = base.regime.volatility !== "LOW";
  f.push(makeFactor("VOLATILITY_CONDITION", volOk, volOk ? { ar: `التقلب الحالي (${base.regime.volatility}) يدعم تفاعل السعر مع المناطق.`, en: `Current volatility (${base.regime.volatility}) supports reactions at zones.` } : undefined));

  f.push(makeFactor("FRESH", true));
  return f;
}

function nearestSweep(c: Candidate, sweeps: Sweep[], atr: number): Sweep | undefined {
  return sweeps.find((s) => s.reclaimed && Math.abs(s.index - c.createdIndex) <= 12 && Math.abs(s.level - (c.direction === "bullish" ? c.bottom : c.top)) <= atr * 1.5);
}

function overlaps(aLo: number, aHi: number, bLo: number, bHi: number): boolean {
  return aLo <= bHi && aHi >= bLo;
}

function overlapRatio(a: Zone, b: Zone): number {
  const inter = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
  if (inter <= 0) return 0;
  const smaller = Math.min(a.top - a.bottom, b.top - b.bottom) || 1e-9;
  return inter / smaller;
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
