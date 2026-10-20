import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { findInstrument, type Instrument, type Timeframe } from "@tradingworld/shared";
import type { Candle } from "@tradingworld/analysis-engine";
import { loadConfig } from "../config.js";
import { MemoryCandleStore, type CandleStore } from "../store/candleStore.js";
import { TimescaleCandleStore } from "../store/timescale.js";
import { findGaps } from "../store/gaps.js";
import { BackfillService, derivedTargets } from "../services/backfill.js";
import { ProviderRegistry } from "../providers/registry.js";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "../providers/types.js";

const EURUSD = findInstrument("EURUSD")!;
const BTCUSD = findInstrument("BTCUSD")!;
const MON = Date.UTC(2026, 9, 19, 0, 0) / 1000; // Monday 2026-10-19 00:00 UTC

function minuteSeries(n: number, start = MON, price = 1.08): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 60,
    open: price + i * 0.0001,
    high: price + i * 0.0001 + 0.0002,
    low: price + i * 0.0001 - 0.0002,
    close: price + i * 0.0001 + 0.0001,
    volume: 10,
  }));
}

/** A source with a continuous 1-minute history that answers "last `limit` bars before `to`". */
class PagedProvider implements MarketDataProvider {
  readonly id = "twelvedata" as const;
  calls: { limit: number; to?: number }[] = [];
  constructor(
    private readonly history: Candle[],
    public nowSec: number,
  ) {}
  supports(i: Instrument) {
    return !!i.providerSymbols.twelvedata;
  }
  async getCandles(_i: Instrument, _tf: Timeframe, limit: number, to?: number) {
    this.calls.push({ limit, to });
    const end = to ?? this.nowSec + 60;
    return this.history.filter((c) => c.time < end && c.time <= this.nowSec).slice(-limit);
  }
  subscribe(_i: Instrument, _tf: Timeframe, _on: (u: CandleUpdate) => void) {
    return () => {};
  }
  status(): ProviderStatus {
    return { id: this.id, live: true, state: "DELAYED", transport: "poll", licensed: true };
  }
}

const TEST_DB = process.env.TEST_DATABASE_URL;
const stores: { name: string; make: () => Promise<CandleStore> }[] = [{ name: "memory", make: async () => new MemoryCandleStore() }];
if (TEST_DB)
  stores.push({
    name: "timescale",
    make: async () => {
      const s = new TimescaleCandleStore(TEST_DB);
      await s.truncate();
      return s;
    },
  });

describe.each(stores)("CandleStore ($name)", ({ make }) => {
  let store: CandleStore;
  beforeEach(async () => {
    store = await make();
  });
  afterAll(async () => {
    if (store instanceof TimescaleCandleStore) await store.truncate();
    await store?.close();
  });

  it("upserts, reads the tail, ranges and lists series", async () => {
    const bars = minuteSeries(120);
    expect(await store.upsert("EURUSD", "1m", bars, "twelvedata")).toBe(120);
    const tail = await store.read("EURUSD", "1m", 10);
    expect(tail.length).toBe(10);
    expect(tail[9]!.time).toBe(bars[119]!.time);
    expect(tail[0]!.time).toBeLessThan(tail[9]!.time);
    const before = await store.read("EURUSD", "1m", 5, bars[50]!.time);
    expect(before.map((c) => c.time)).toEqual(bars.slice(45, 50).map((c) => c.time));
    const range = await store.readRange("EURUSD", "1m", bars[10]!.time, bars[13]!.time);
    expect(range.map((c) => c.time)).toEqual(bars.slice(10, 13).map((c) => c.time));
    expect(await store.range("EURUSD", "1m")).toEqual({
      symbol: "EURUSD",
      timeframe: "1m",
      first: bars[0]!.time,
      last: bars[119]!.time,
      count: 120,
    });
    await store.upsert(
      "EURUSD",
      "5m",
      minuteSeries(3, MON, 1).map((c, i) => ({ ...c, time: MON + i * 300 })),
      "aggregate:1m",
      { mode: "derived" },
    );
    expect((await store.series()).map((s) => `${s.symbol}:${s.timeframe}:${s.count}`)).toEqual(["EURUSD:1m:120", "EURUSD:5m:3"]);
    expect(await store.range("GBPUSD", "1m")).toBeUndefined();
  });

  it("updates existing bars in place; derived rows never overwrite native ones", async () => {
    const bars = minuteSeries(5);
    await store.upsert("EURUSD", "1m", bars, "twelvedata");
    await store.upsert("EURUSD", "1m", [{ ...bars[4]!, close: 9.99 }], "twelvedata");
    expect((await store.read("EURUSD", "1m", 1))[0]!.close).toBe(9.99);
    expect(await store.range("EURUSD", "1m")).toMatchObject({ count: 5 });
    // derived must not clobber native
    await store.upsert("EURUSD", "1m", [{ ...bars[4]!, close: 1.11 }], "aggregate:1m", { mode: "derived" });
    expect((await store.read("EURUSD", "1m", 1))[0]!.close).toBe(9.99);
    // derived may replace derived; native replaces derived
    await store.upsert("EURUSD", "1h", [{ ...bars[0]!, time: MON, close: 1 }], "aggregate:1m", { mode: "derived" });
    await store.upsert("EURUSD", "1h", [{ ...bars[0]!, time: MON, close: 2 }], "aggregate:1m", { mode: "derived" });
    expect((await store.read("EURUSD", "1h", 1))[0]!.close).toBe(2);
    await store.upsert("EURUSD", "1h", [{ ...bars[0]!, time: MON, close: 3 }], "twelvedata");
    expect((await store.read("EURUSD", "1h", 1))[0]!.close).toBe(3);
    await store.upsert("EURUSD", "1h", [{ ...bars[0]!, time: MON, close: 4 }], "aggregate:1m", { mode: "derived" });
    expect((await store.read("EURUSD", "1h", 1))[0]!.close).toBe(3);
  });

  it("handles a batch larger than one upsert statement", async () => {
    const bars = minuteSeries(6001);
    expect(await store.upsert("BTCUSD", "1m", bars, "binance")).toBe(6001);
    expect((await store.range("BTCUSD", "1m"))?.count).toBe(6001);
  });
});

describe.skipIf(!TEST_DB)("TimescaleCandleStore run log", () => {
  let store: TimescaleCandleStore;
  beforeAll(async () => {
    store = new TimescaleCandleStore(TEST_DB!);
    await store.truncate();
  });
  afterAll(async () => {
    await store.close();
  });
  it("records backfill runs", async () => {
    await store.logRun({
      symbol: "EURUSD",
      timeframe: "1m",
      kind: "backfill",
      from: MON,
      to: MON + 600,
      bars: 10,
      status: "done",
      startedAt: Date.now() - 1000,
      finishedAt: Date.now(),
    });
    await store.logRun({
      symbol: "EURUSD",
      timeframe: "1m",
      kind: "gaps",
      bars: 0,
      status: "failed",
      error: "boom",
      startedAt: Date.now(),
    });
    const runs = await store.recentRuns(10);
    expect(runs.length).toBe(2);
    expect(runs[0]).toMatchObject({ kind: "gaps", status: "failed", error: "boom" });
    expect(runs[1]).toMatchObject({ kind: "backfill", from: MON, to: MON + 600, bars: 10 });
  });
});

describe("findGaps", () => {
  it("reports missing open-market buckets and ignores closed hours", () => {
    const a = minuteSeries(60, MON + 10 * 3600); // Monday 10:00–11:00
    const b = minuteSeries(60, MON + 12 * 3600); // Monday 12:00–13:00 → 60 missing minutes between
    const gaps = findGaps([...a, ...b], "1m", EURUSD);
    expect(gaps).toEqual([{ from: MON + 11 * 3600, to: MON + 12 * 3600 - 60, bars: 60 }]);
    const fri = minuteSeries(30, MON + 4 * 86400 + 20 * 3600); // Friday 20:00 UTC (16:00 NY) — before the 17:00 NY close
    const nextMon = minuteSeries(30, MON + 7 * 86400 + 0 * 3600); // Monday 00:00 UTC — Sunday 20:00 NY, FX open again
    const weekend = findGaps([...fri, ...nextMon], "1m", EURUSD);
    // Friday 20:30 → 21:00 UTC and Sunday 21:00 UTC → Monday 00:00 are open; Saturday is not
    expect(weekend.length).toBe(2);
    expect(weekend[0]!.from).toBe(MON + 4 * 86400 + 20 * 3600 + 30 * 60);
    expect(weekend[1]!.to).toBe(MON + 7 * 86400 - 60);
    const crypto = findGaps([...fri, ...nextMon], "1m", BTCUSD);
    expect(crypto.length).toBe(1);
    expect(crypto[0]!.bars).toBe((nextMon[0]!.time - fri[29]!.time) / 60 - 1);
    expect(findGaps(minuteSeries(10), "1m", EURUSD)).toEqual([]);
  });
});

describe.each(stores)("BackfillService ($name)", ({ make }) => {
  const history = minuteSeries(2000); // Monday 00:00 → Tuesday 09:19 (2000 minutes)
  const nowSec = history[history.length - 1]!.time + 30; // 30 s into the bar after the last one
  let store: CandleStore;
  let provider: PagedProvider;
  let service: BackfillService;
  const base = { NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", MARKET_DATA_ROUTES: "forex=twelvedata" };

  beforeEach(async () => {
    store = await make();
    provider = new PagedProvider(history, nowSec);
    const registry = new ProviderRegistry(loadConfig(base), { providers: { twelvedata: provider }, store, now: () => nowSec * 1000 });
    service = new BackfillService(registry, store, { bars: 500, pageSize: 200, symbols: ["EURUSD"], now: () => nowSec * 1000 });
  });
  afterAll(async () => {
    if (store instanceof TimescaleCandleStore) await store.truncate();
    await store?.close();
  });

  it("pages history backwards until the requested depth is stored", async () => {
    const run = await service.backfill("EURUSD");
    expect(run).toMatchObject({ kind: "backfill", status: "done", bars: 500 });
    expect(provider.calls.length).toBe(3);
    expect(provider.calls.map((c) => c.limit)).toEqual([200, 200, 100]);
    const range = (await store.range("EURUSD", "1m"))!;
    expect(range.count).toBe(500);
    expect(range.last).toBe(history[history.length - 1]!.time);
    expect(run.from).toBe(range.first);
    // a second backfill is a no-op
    expect((await service.backfill("EURUSD")).bars).toBe(0);
    // deeper request extends backwards from the first stored bar
    const deeper = await service.backfill("EURUSD", "1m", 700);
    expect(deeper.bars).toBe(200);
    expect((await store.range("EURUSD", "1m"))!.first).toBe(history[2000 - 700]!.time);
  });

  it("catches up after time passes and repairs holes inside the series", async () => {
    await service.backfill("EURUSD");
    const later = minuteSeries(2100);
    provider = new PagedProvider(later, later[2099]!.time + 30);
    const registry = new ProviderRegistry(loadConfig(base), {
      providers: { twelvedata: provider },
      store,
      now: () => (later[2099]!.time + 30) * 1000,
    });
    service = new BackfillService(registry, store, {
      bars: 500,
      pageSize: 200,
      symbols: ["EURUSD"],
      now: () => (later[2099]!.time + 30) * 1000,
    });
    const run = await service.catchUp("EURUSD");
    expect(run).toMatchObject({ kind: "catchup", status: "done" });
    expect(run.bars).toBe(100);
    expect((await store.range("EURUSD", "1m"))!.last).toBe(later[2099]!.time);
    expect((await service.catchUp("EURUSD")).bars).toBe(0);
    // punch a hole: rebuild the store from two disjoint ranges
    const fresh = await make();
    await fresh.upsert("EURUSD", "1m", later.slice(1500, 1600), "twelvedata");
    await fresh.upsert("EURUSD", "1m", later.slice(1700, 2100), "twelvedata");
    const reg2 = new ProviderRegistry(loadConfig(base), {
      providers: { twelvedata: provider },
      store: fresh,
      now: () => (later[2099]!.time + 30) * 1000,
    });
    const svc2 = new BackfillService(reg2, fresh, {
      bars: 500,
      pageSize: 200,
      symbols: ["EURUSD"],
      now: () => (later[2099]!.time + 30) * 1000,
    });
    const gaps = await svc2.repairGaps("EURUSD");
    expect(gaps).toMatchObject({ kind: "gaps", status: "done", bars: 100, from: later[1600]!.time, to: later[1699]!.time });
    expect((await fresh.range("EURUSD", "1m"))!.count).toBe(600);
    expect((await svc2.repairGaps("EURUSD")).bars).toBe(0);
    await fresh.close();
  });

  it("derives every higher timeframe with the engine's buckets and never overwrites native bars", async () => {
    await service.backfill("EURUSD", "1m", 1600); // Monday 06:40 → Tuesday 09:19
    const TUE = MON + 86400;
    await store.upsert("EURUSD", "1h", [{ time: TUE + 2 * 3600, open: 1, high: 1, low: 1, close: 42, volume: 1 }], "twelvedata");
    const run = await service.aggregateDerived("EURUSD", "full");
    expect(run.status).toBe("done");
    expect(derivedTargets("1m")).toEqual(["3m", "5m", "15m", "30m", "1h", "2h", "4h", "12h", "1d", "1w", "1M"]);
    const first = (await store.range("EURUSD", "1m"))!.first;
    expect(first).toBe(history[400]!.time);
    const fiveMin = await store.read("EURUSD", "5m", 1000);
    expect(fiveMin.length).toBe(320);
    expect(fiveMin[0]!.time).toBe(first);
    expect(fiveMin[0]!.open).toBe(history[400]!.open);
    expect(fiveMin[0]!.close).toBe(history[404]!.close);
    expect(fiveMin[0]!.high).toBe(Math.max(...history.slice(400, 405).map((c) => c.high)));
    expect(fiveMin[0]!.volume).toBe(50);
    const hours = await store.read("EURUSD", "1h", 100);
    expect(hours.find((c) => c.time === TUE + 2 * 3600)!.close).toBe(42); // native row kept
    expect(hours[hours.length - 1]!.time).toBe(TUE + 9 * 3600); // the current (partial) hour is written too
    // a target bucket that began before the stored history is incomplete and never written:
    // Monday's 12h/1d/1w/1M buckets start at 00:00 < 06:40, so only Monday 12:00 (12h) and Tuesday's partial buckets exist
    expect((await store.read("EURUSD", "12h", 10)).map((c) => c.time)).toEqual([MON + 12 * 3600, TUE]);
    expect((await store.read("EURUSD", "1d", 10)).map((c) => c.time)).toEqual([TUE]);
    expect((await store.read("EURUSD", "1w", 10)).length).toBe(0);
    const again = await service.aggregateDerived("EURUSD", "recent");
    expect(again.status).toBe("done");
    expect(again.bars).toBeGreaterThan(0);
  });

  it("runs a whole cycle and reports status", async () => {
    expect(service.status()).toMatchObject({ started: false, running: false, baseTimeframe: "1m", bars: 500, symbols: ["EURUSD"] });
    const runs = await service.runOnce();
    expect(runs.map((r) => r.kind)).toEqual(["backfill", "gaps", "aggregate"]);
    expect(runs.every((r) => r.status === "done")).toBe(true);
    const st = service.status();
    expect(st.lastRunAt).toBeDefined();
    expect(st.runs.length).toBe(3);
    expect(st.runs[0]!.kind).toBe("aggregate");
    // 500 minutes from Tuesday 01:00: every intraday target has complete buckets; 12h/1d/1w/1M would start before the history
    expect((await store.series()).map((s) => s.timeframe)).toEqual(["15m", "1h", "1m", "2h", "30m", "3m", "4h", "5m"]);
    expect(service.instruments().map((i) => i.symbol)).toEqual(["EURUSD"]);
  });
});
