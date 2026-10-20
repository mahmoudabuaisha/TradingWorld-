import { describe, it, expect } from "vitest";
import { analyze } from "../engine.js";
import { evaluateLifecycle } from "../zones/lifecycle.js";
import { resolveOutcome, OUTCOME_VERSION } from "../outcomes/resolve.js";
import { candlesFrom } from "./helpers.js";
import type { Zone } from "../types.js";
import { SyntheticMarket } from "../data/synthetic.js";
import { FACTOR_WEIGHTS } from "../scoring/weights.js";
import { FACTOR_KEYS } from "@tradingworld/shared";
import { answerDeterministic, buildGrounding } from "../explain/llm.js";

const market = new SyntheticMarket(20_000, 1_720_000_000);
const base = market.candles("XAUUSD", "5m", 2350, 0.0006, 1500);
const htf = {
  "1h": market.candles("XAUUSD", "1h", 2350, 0.0006, 300),
  "4h": market.candles("XAUUSD", "4h", 2350, 0.0006, 120),
  "1d": market.candles("XAUUSD", "1d", 2350, 0.0006, 40),
};

describe("engine", () => {
  it("the shared FACTOR_KEYS list matches the engine's factors", () => {
    expect([...FACTOR_KEYS].sort()).toEqual(Object.keys(FACTOR_WEIGHTS).sort());
  });

  it("scoring weights sum to 100", () => {
    expect(Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("is deterministic", () => {
    const a = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base, htfCandles: htf, now: 1 });
    const b = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base, htfCandles: htf, now: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces explainable zones with factor breakdown, lifecycle and invalidation", () => {
    const r = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base, htfCandles: htf, now: 1, options: { includeLowQuality: true } });
    expect(r.engineVersion).toBeTruthy();
    expect(r.htf.length).toBeGreaterThan(0);
    expect(r.zones.length).toBeGreaterThan(0);
    for (const z of r.zones) {
      expect(z.top).toBeGreaterThan(z.bottom);
      expect(z.factors.length).toBe(10);
      expect(z.score).toBe(z.factors.reduce((s, f) => s + f.contribution, 0));
      expect(z.name).not.toMatch(/Zone \d/);
      expect(z.status).not.toBe("INVALIDATED");
      expect(z.explanation.invalidation.en).toContain("invalidates");
      expect(z.explanation.summary.ar.length).toBeGreaterThan(10);
    }
    // sorted by score desc within tiers and limited
    const highs = r.zones.filter((z) => z.quality === "HIGH");
    expect(highs.length).toBeLessThanOrEqual(3);
  });

  it("hides low quality zones by default", () => {
    const r = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base, htfCandles: htf, now: 1 });
    expect(r.zones.every((z) => z.quality !== "LOW")).toBe(true);
  });

  it("deterministic explainer answers from structured data only", () => {
    const r = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base, htfCandles: htf, now: 1, options: { includeLowQuality: true } });
    const why = answerDeterministic(r, "لماذا وضعت هذه المنطقة؟", "ar");
    expect(why).toContain("/100");
    const htfAnswer = answerDeterministic(r, "What happens on higher timeframes?", "en");
    expect(htfAnswer).toContain("1h");
    const g = buildGrounding(r, "en");
    expect(g.zones.length).toBe(r.zones.length);
    expect(g.engineVersion).toBe(r.engineVersion);
  });

  it("keeps recently invalidated zones only when asked, stamped INVALIDATED", () => {
    const base5 = market.candles("XAUUSD", "5m", 2350, 0.0006, 1500);
    const def = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base5, htfCandles: htf, now: 1 });
    expect(def.zones.some((z) => z.status === "INVALIDATED")).toBe(false);
    const kept = analyze({ symbol: "XAUUSD", timeframe: "5m", candles: base5, htfCandles: htf, now: 1, options: { keepInvalidatedBars: 250 } });
    const inv = kept.zones.filter((z) => z.status === "INVALIDATED");
    expect(kept.zones.length).toBeGreaterThanOrEqual(def.zones.length);
    for (const z of inv) {
      expect(z.invalidatedIndex).toBeDefined();
      expect(base5.length - 1 - (z.invalidatedIndex ?? 0)).toBeLessThanOrEqual(250);
    }
    // the live part of the output is unchanged by the option
    expect(kept.zones.filter((z) => z.status !== "INVALIDATED").map((z) => z.id)).toEqual(def.zones.map((z) => z.id));
  });

  it("lifecycle remembers a reaction even when the zone is invalidated later", () => {
    // Demand zone 100–102. Price tests it (bar 1), closes 1 ATR away (bars 2–3), then closes through the bottom (bar 5).
    const zone = { direction: "bullish", top: 102, bottom: 100, createdIndex: -1, factors: [] } as unknown as Zone;
    const candles = candlesFrom([
      [104, 105, 103, 104],
      [104, 104.5, 100.5, 101.5], // test
      [102.5, 104, 102.3, 103.5], // clear of the zone, close 1.5 ≥ ATR 1 above the top → reaction
      [103.5, 105, 103, 104.5],
      [104.5, 104.6, 101, 101.2],
      [101.2, 101.5, 98, 99],     // close < bottom → invalidated
    ]);
    const life = evaluateLifecycle(zone, candles, 1);
    expect(life.status).toBe("INVALIDATED");
    expect(life.invalidatedIndex).toBe(5);
    expect(life.firstTestIndex).toBe(1);
    expect(life.reacted).toBe(true);
    expect(life.reactedIndex).toBe(2);
    const untouched = evaluateLifecycle(zone, candlesFrom([[104, 105, 103, 104], [104, 106, 103.5, 105.5]]), 1);
    expect(untouched.reacted).toBe(false);
    expect(untouched.firstTestIndex).toBeUndefined();
  });

  it("resolveOutcome labels from future bars only: reaction, invalidation, horizon, untouched", () => {
    const zone = { direction: "bullish", top: 102, bottom: 100, factors: [] } as unknown as Zone;
    const bars = candlesFrom([
      [104, 105, 103, 104],
      [104, 104.5, 100.5, 101.5], // 1: first touch
      [102.5, 104, 102.3, 103.5], // 2: close 1.5 ATR above → reaction
      [103.5, 106, 103, 105.5],   // 3: high 106 → MFE 4 ATR
      [105.5, 105.6, 101, 101.2],
      [101.2, 101.5, 98, 99],     // 5: close below 100 → invalidated (after the reaction)
    ]);
    expect(OUTCOME_VERSION).toBe("outcome-v1");
    const r = resolveOutcome(zone, bars, 1, 50);
    expect(r).toMatchObject({ done: true, reason: "invalidated", label: "REACTED", finalStatus: "REACTED", firstTestIndex: 1, reactedIndex: 2, invalidatedIndex: 5, barsToOutcome: 3 });
    expect(r.mfeAtr).toBe(4);
    expect(r.maeAtr).toBe(2);     // low 98 on the invalidation bar
    expect(r.reactionAtr).toBe(3.5);
    // the same bars cut before the invalidation: horizon not reached → keep waiting, label so far REACTED
    expect(resolveOutcome(zone, bars.slice(0, 4), 1, 50)).toMatchObject({ done: false, label: "REACTED" });
    // horizon of 4 bars: decided at the horizon, the later invalidation is not seen
    expect(resolveOutcome(zone, bars, 1, 4)).toMatchObject({ done: true, reason: "horizon", label: "REACTED", barsObserved: 4 });
    // broken without a reaction
    const broken = candlesFrom([[104, 105, 103, 104], [104, 104, 100.5, 101], [101, 101.2, 98.5, 99]]);
    expect(resolveOutcome(zone, broken, 1, 50)).toMatchObject({ done: true, label: "INVALIDATED", finalStatus: "INVALIDATED", barsToOutcome: 3 });
    // never reached
    const away = candlesFrom([[110, 111, 109, 110], [110, 112, 109.5, 111]]);
    expect(resolveOutcome(zone, away, 1, 2)).toMatchObject({ done: true, reason: "horizon", label: "UNTOUCHED", mfeAtr: 0, maeAtr: 0, retests: 0 });
    expect(resolveOutcome(zone, [], 1, 2)).toMatchObject({ done: false, label: "UNTOUCHED", barsObserved: 0 });
    // a confirmed zone with no later candles yet: no crash, still waiting
    const confirmedZone = { ...zone, factors: [{ key: "DISPLACEMENT", present: true }] } as unknown as Zone;
    expect(resolveOutcome(confirmedZone, [], 1, 2)).toMatchObject({ done: false, finalStatus: "CONFIRMED" });
  });

  it("a live synthetic market keeps advancing with the clock, deterministically", () => {
    const a = new SyntheticMarket(500);
    const first = a.candles("XAUUSD", "1m", 2650, 0.00045, 5);
    const last = first[first.length - 1]!.time;
    expect(last).toBe(Math.floor(Date.now() / 60_000) * 60);
    // simulate time passing by rewinding the cached series, then asking again
    const m = a.master("XAUUSD", 2650, 0.00045);
    const cut = m.splice(-3);
    const again = a.candles("XAUUSD", "1m", 2650, 0.00045, 3);
    expect(again.map((c) => c.time)).toEqual(cut.map((c) => c.time));
    expect(a.master("XAUUSD", 2650, 0.00045).length).toBe(500);
    // another process extending the same minutes gets the same bars
    const b = new SyntheticMarket(500);
    const mb = b.master("XAUUSD", 2650, 0.00045);
    mb.splice(-3);
    expect(b.candles("XAUUSD", "1m", 2650, 0.00045, 3).map((c) => c.close)).toEqual(again.map((c) => c.close));
  });

  it("rejects too little data", () => {
    expect(() => analyze({ symbol: "X", timeframe: "5m", candles: base.slice(0, 10) })).toThrow();
  });
});
