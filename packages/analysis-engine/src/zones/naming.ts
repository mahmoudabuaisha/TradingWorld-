import type { Factor, Direction, ZoneOrigin, Sweep } from "../types.js";

interface NameParts { en: string; ar: string }

/**
 * Analytical names, never "Zone 1". Composed from the strongest present factors.
 * e.g. "HTF Level + Sell-Side Liquidity Sweep + Bullish Displacement Zone"
 */
export function nameZone(direction: Direction, origin: ZoneOrigin, factors: Factor[], sweep?: Sweep, htfTf?: string): NameParts {
  const dirEn = direction === "bullish" ? "Bullish" : "Bearish";
  const dirAr = direction === "bullish" ? "صاعدة" : "هابطة";
  const parts: NameParts[] = [];
  const present = new Set(factors.filter((f) => f.present).map((f) => f.key));

  if (present.has("HTF_LEVEL")) parts.push({ en: `${htfTf ?? "HTF"} Key Level`, ar: `مستوى ${htfTf ?? "فريم أعلى"}` });
  if (present.has("LIQUIDITY_SWEEP")) {
    const side = sweep?.side === "buy-side" ? { en: "Buy-Side", ar: "سيولة الشراء" } : { en: "Sell-Side", ar: "سيولة البيع" };
    parts.push({ en: `${side.en} Liquidity Sweep`, ar: `سحب ${side.ar}` });
  }
  if (present.has("STRUCTURE_SHIFT")) parts.push({ en: `${dirEn} Structure Shift`, ar: `تحول بنية ${dirAr}` });
  if (present.has("DISPLACEMENT")) parts.push({ en: `${dirEn} Displacement`, ar: `اندفاع ${dirAr === "صاعدة" ? "صاعد" : "هابط"}` });
  if (origin === "FVG" || present.has("FVG")) parts.push({ en: "FVG", ar: "FVG" });
  if (origin === "ORDER_BLOCK" || present.has("ORDER_BLOCK")) parts.push({ en: "Order Block", ar: "Order Block" });

  const top = dedupe(parts).slice(0, 3);
  if (top.length === 0) {
    const base = origin === "SWEEP_RECLAIM" ? { en: "Liquidity Reclaim", ar: "استعادة سيولة" } : { en: `${dirEn} ${origin.replace("_", " ")}`, ar: `${origin} ${dirAr}` };
    top.push(base);
  }
  const kind = direction === "bullish" ? { en: "Demand", ar: "طلب" } : { en: "Supply", ar: "عرض" };
  return {
    en: `${top.map((p) => p.en).join(" + ")} ${kind.en} Zone`,
    ar: `منطقة ${kind.ar}: ${top.map((p) => p.ar).join(" + ")}`,
  };
}

function dedupe(parts: NameParts[]): NameParts[] {
  const seen = new Set<string>();
  return parts.filter((p) => (seen.has(p.en) ? false : (seen.add(p.en), true)));
}
