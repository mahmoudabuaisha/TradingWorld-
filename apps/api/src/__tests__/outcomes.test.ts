import { describe, it, expect, beforeEach } from "vitest";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";
import type { Instrument, Timeframe } from "@tradingworld/shared";
import { loadConfig } from "../config.js";
import { createMemoryRepositories, type Repositories } from "../repositories/memory.js";
import { ProviderRegistry } from "../providers/registry.js";
import { OutcomeService, parseScan, zoneKey } from "../services/outcomes.js";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "../providers/types.js";

const T0 = Date.UTC(2026, 9, 20, 10, 0) / 1000; // detection bar (5m)
const STEP = 300;

const mkZone = (over: Partial<Zone> = {}): Zone => ({
  id: "z-5m-fvg-412-0", name: "Demand", nameAr: "طلب", origin: "FVG", direction: "bullish", timeframe: "5m", top: 102, bottom: 100, createdIndex: 412, createdTime: T0 - 3000,
  score: 72, quality: "HIGH", status: "ACTIVE", tests: 0, factors: [{ key: "FVG", present: true }, { key: "FRESH", present: true }],
  invalidation: { price: 100, ar: "", en: "" }, htfContext: [], sourceIds: [], explanation: {}, ...over,
}) as unknown as Zone;

const mkResult = (zones: Zone[], lastCandleTime = T0, ids?: string[]): AnalysisResult => ({
  symbol: "EURUSD", timeframe: "5m", engineVersion: "1.1.1", scoringVersion: "scoring-v1", lastCandleTime,
  base: { atr: 1, regime: { trend: "RANGING", volatility: "NORMAL", phase: "NEUTRAL", atr: 1, atrRatio: 1, rangeWidthAtr: 3 } },
  session: { current: "LONDON", overlap: false }, htfBias: "bullish", zones: zones.map((z, i) => (ids ? { ...z, id: ids[i]! } : z)),
}) as unknown as AnalysisResult;

const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ time: T0 + i * STEP, open: o, high: h, low: l, close: c, volume: 1 });

/** Serves `bars` like a real source: the last `limit` bars before `to`. */
class ScriptedProvider implements MarketDataProvider {
  readonly id = "twelvedata" as const;
  bars: Candle[] = [];
  calls: { limit: number; to?: number }[] = [];
  supports(i: Instrument) { return !!i.providerSymbols.twelvedata; }
  async getCandles(_i: Instrument, _tf: Timeframe, limit: number, to?: number) { this.calls.push({ limit, to }); return this.bars.filter((c) => to === undefined || c.time < to).slice(-limit); }
  subscribe(_i: Instrument, _tf: Timeframe, _on: (u: CandleUpdate) => void) { return () => {}; }
  status(): ProviderStatus { return { id: this.id, live: true, state: "DELAYED", transport: "poll", licensed: true }; }
}

describe("OutcomeService", () => {
  let repos: Repositories;
  let provider: ScriptedProvider;
  let nowMs: number;
  let svc: OutcomeService;

  beforeEach(() => {
    repos = createMemoryRepositories();
    provider = new ScriptedProvider();
    nowMs = (T0 + STEP) * 1000;
    const registry = new ProviderRegistry(loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", MARKET_DATA_ROUTES: "forex=twelvedata" }), { providers: { twelvedata: provider } });
    svc = new OutcomeService(repos, registry, { horizonBars: 6, now: () => nowMs });
  });

  it("tracks each market zone once, at first observation, and skips invalidated ones", async () => {
    const z = mkZone();
    expect(await svc.observe(mkResult([z, mkZone({ origin: "ORDER_BLOCK", status: "INVALIDATED" })]), "twelvedata")).toBe(1);
    // the same zone in a later window: different engine id and score, same market zone → not re-tracked, snapshot kept
    expect(await svc.observe(mkResult([{ ...z, score: 90 }], T0 + STEP, ["z-5m-fvg-500-0"]), "twelvedata")).toBe(0);
    const open = await repos.zones.open(10);
    expect(open.length).toBe(1);
    expect(open[0]).toMatchObject({ key: "EURUSD:5m:FVG:bullish:" + (T0 - 3000) + ":1.1.1:scoring-v1", detectedBarTime: T0, atr: 1, provider: "twelvedata", context: { session: "LONDON", htfBias: "bullish" } });
    expect(open[0]!.zone.score).toBe(72);
    expect(zoneKey(mkResult([z]), z)).toBe(open[0]!.key);
  });

  it("labels from strictly later closed bars: the detection bar and the forming bar are never used", async () => {
    await svc.observe(mkResult([mkZone()]), "twelvedata");
    provider.bars = [
      bar(0, 101, 101, 95, 96),   // detection bar closes through the zone — already seen by the detector, must be ignored
      bar(1, 104, 104.5, 100.5, 101.5), // touch
      bar(2, 102.5, 104, 102.3, 103.5), // reaction (close 1.5 ATR above)
      bar(3, 103.5, 103.6, 98, 99),     // forming bar: would invalidate, but its bucket has not closed
    ];
    nowMs = (T0 + 3 * STEP + 120) * 1000;
    let run = await svc.run();
    expect(run).toMatchObject({ checked: 1, resolved: 0 });                  // reacted, but no invalidation and horizon not reached
    nowMs = (T0 + 4 * STEP + 1) * 1000;                                       // bar 3 is closed now → invalidated after the reaction
    run = await svc.run();
    expect(run.resolved).toBe(1);
    const [z] = await repos.zones.list({ resolved: true });
    expect(z!.outcome).toMatchObject({ outcomeVersion: "outcome-v1", label: "REACTED", reason: "invalidated", finalStatus: "REACTED", barsToOutcome: 2, barsObserved: 3, horizonBars: 6, retests: 1 });
    expect(await repos.zones.count({ resolved: false })).toBe(0);
  });

  it("labels at the horizon when nothing decisive happens", async () => {
    await svc.observe(mkResult([mkZone()]), "twelvedata");
    provider.bars = [0, 1, 2, 3, 4, 5, 6].map((i) => bar(i, 110, 111, 109, 110));
    nowMs = (T0 + 6 * STEP) * 1000;
    expect((await svc.run()).resolved).toBe(0);                               // 5 closed bars after detection
    nowMs = (T0 + 7 * STEP) * 1000;
    expect((await svc.run()).resolved).toBe(1);
    const [z] = await repos.zones.list({ resolved: true });
    expect(z!.outcome).toMatchObject({ label: "UNTOUCHED", reason: "horizon", barsObserved: 6, mfeAtr: 0 });
  });

  it("fetches an old zone's own window when it is beyond one page", async () => {
    const old = T0 - 6000 * STEP;
    await svc.observe(mkResult([mkZone()], old), "twelvedata");
    provider.bars = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ ...bar(i, 110, 111, 109, 110), time: old + i * STEP }));
    nowMs = (T0 + STEP) * 1000;
    expect((await svc.run()).resolved).toBe(1);
    expect(provider.calls.at(-1)).toEqual({ limit: 8, to: old + 8 * STEP });
  });

  it("aggregates stats, keeps demo out of research unless asked, and exports ML samples", async () => {
    await svc.observe(mkResult([mkZone()]), "twelvedata");
    await svc.observe({ ...mkResult([mkZone({ origin: "ORDER_BLOCK", quality: "MEDIUM", score: 55 })]), symbol: "EURUSD" } as AnalysisResult, "demo");
    provider.bars = [bar(0, 101, 101, 101, 101), bar(1, 104, 104.5, 100.5, 101.5), bar(2, 102.5, 104, 102.3, 103.5), bar(3, 103, 103, 99, 99.5)];
    nowMs = (T0 + 4 * STEP) * 1000;
    expect((await svc.run()).resolved).toBe(2);
    const real = await svc.stats(false);
    expect(real).toMatchObject({ outcomeVersion: "outcome-v1", horizonBars: 6, open: 0, resolved: 1, overall: { n: 1, reacted: 1, reactionRate: 1 } });
    expect(Object.keys(real.byQuality)).toEqual(["HIGH"]);
    const all = await svc.stats(true);
    expect(all.resolved).toBe(2);
    expect(all.byScoreBand).toMatchObject({ "65-79": { n: 1 }, "50-64": { n: 1 } });
    expect(all.recent[0]).toMatchObject({ label: "REACTED", symbol: "EURUSD" });
    const ds = await svc.dataset({ engineVersion: "1.1.1", scoringVersion: "scoring-v1" });
    expect(ds.length).toBe(1);
    expect(ds[0]!.zone.factors[0]).toMatchObject({ key: "FVG", present: true });
    expect(ds[0]!.regime).toMatchObject({ trend: "RANGING", volatility: "NORMAL", atr: 1 });
    expect(ds[0]!.session).toBe("LONDON");
    expect(ds[0]!.outcome).toMatchObject({ finalStatus: "REACTED", provider: "twelvedata" });
    expect((await svc.dataset({ includeDemo: true })).length).toBe(2);
    expect(await svc.dataset({ engineVersion: "9.9.9" })).toEqual([]);
  });

  it("parses the scan list", () => {
    expect(parseScan("xauusd:15m, EURUSD:1h,BAD:5m,US100:7m")).toEqual([{ symbol: "XAUUSD", timeframe: "15m" }, { symbol: "EURUSD", timeframe: "1h" }]);
    expect(parseScan(undefined)).toEqual([]);
  });
});
