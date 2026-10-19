import { describe, it, expect, vi, afterEach } from "vitest";
import { findInstrument, marketState, localClock, type Instrument } from "@tradingworld/shared";
import type { Candle } from "@tradingworld/analysis-engine";
import { loadConfig } from "../config.js";
import { RateBudget } from "../providers/support/rateBudget.js";
import { TickAggregator } from "../providers/support/tickAggregator.js";
import { CachedProvider, mergeCandles, defaultRefreshSeconds } from "../providers/support/cached.js";
import { providerState } from "../providers/support/status.js";
import { TwelveDataProvider, parseTimeSeries, parseTwelveDateTime, TwelveDataError } from "../providers/twelvedata.js";
import { PolygonProvider, parseAggregates, polygonChannel, rangeSeconds } from "../providers/polygon.js";
import { ProviderRegistry, parseRoutes } from "../providers/registry.js";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "../providers/types.js";

const EURUSD = findInstrument("EURUSD")!;
const BTCUSD = findInstrument("BTCUSD")!;
const US100 = findInstrument("US100")!;
const USOIL = findInstrument("USOIL")!;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchMock = (handler: (url: URL) => unknown) => vi.fn(async (input: string | URL | Request) => jsonResponse(handler(new URL(String(input))))) as unknown as typeof fetch;

/** Minimal WebSocket double: records sent frames and lets the test drive open / message / close. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  // test helpers
  serverOpen() { this.readyState = 1; this.onopen?.(); }
  serverMessage(o: unknown) { this.onmessage?.({ data: typeof o === "string" ? o : JSON.stringify(o) }); }
  serverDrop() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
  frames() { return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>); }
}
const FakeSocketCtor = FakeSocket as unknown as typeof WebSocket;

const TD_SERIES = {
  meta: { symbol: "EUR/USD", interval: "5min", type: "Physical Currency" },
  values: [
    { datetime: "2026-10-19 12:10:00", open: "1.08500", high: "1.08560", low: "1.08480", close: "1.08550" },
    { datetime: "2026-10-19 12:05:00", open: "1.08450", high: "1.08520", low: "1.08430", close: "1.08500" },
    { datetime: "2026-10-19 12:00:00", open: "1.08400", high: "1.08470", low: "1.08380", close: "1.08450" },
  ],
  status: "ok",
};
const TD_ERROR = { code: 429, message: "You have run out of API credits for the current minute. 9 API credits were used, with the current limit being 8.", status: "error" };

function series(n: number, start = 1_760_000_000, step = 300, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ time: start + i * step, open: price + i, high: price + i + 1, low: price + i - 1, close: price + i + 0.5, volume: 1 }));
}

/** Scripted inner provider for CachedProvider / registry tests. */
class FakeProvider implements MarketDataProvider {
  calls: { limit: number; to?: number }[] = [];
  listeners: ((u: CandleUpdate) => void)[] = [];
  statusValue: ProviderStatus;
  constructor(public readonly id: "twelvedata" | "polygon" | "binance", private data: Candle[], status?: Partial<ProviderStatus>) {
    this.statusValue = { id, live: true, state: "DELAYED", transport: "poll", licensed: true, pollSeconds: 15, lastUpdate: Date.now(), ...status };
  }
  supports(i: Instrument) { return !!i.providerSymbols[this.id]; }
  async getCandles(_i: Instrument, _tf: string, limit: number, to?: number) { this.calls.push({ limit, to }); return this.data.slice(-limit); }
  subscribe(_i: Instrument, _tf: string, on: (u: CandleUpdate) => void) { this.listeners.push(on); return () => { this.listeners = this.listeners.filter((l) => l !== on); }; }
  status() { return this.statusValue; }
  push(candle: Candle, closed = false) { for (const l of this.listeners) l({ symbol: "EURUSD", timeframe: "5m", candle, closed, receivedAt: Date.now(), eventTime: candle.time }); }
}

afterEach(() => { vi.useRealTimers(); FakeSocket.instances = []; });

describe("RateBudget", () => {
  it("lets `limit` calls through per window and makes the next one wait for the oldest to expire", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const b = new RateBudget(2, 60_000, () => t, async (ms) => { sleeps.push(ms); t += ms; });
    await b.take(); await b.take();
    expect(b.snapshot()).toMatchObject({ used: 2, limit: 2, waiting: 0 });
    await b.take();
    expect(sleeps.length).toBeGreaterThan(0);
    expect(t).toBeGreaterThanOrEqual(60_000);
    expect(b.snapshot().used).toBe(1);
  });
});

describe("TickAggregator", () => {
  it("folds ticks into the timeframe and emits the finished candle before the new one", () => {
    const a = new TickAggregator("5m");
    expect(a.tick(100, 1_760_000_010)).toEqual([{ candle: { time: 1_760_000_000 - 1_760_000_000 % 300, open: 100, high: 100, low: 100, close: 100, volume: 0 }, closed: false }]);
    a.tick(101, 1_760_000_020); a.tick(99, 1_760_000_030);
    const cur = a.candle!;
    expect([cur.high, cur.low, cur.close]).toEqual([101, 99, 99]);
    const roll = a.tick(99.5, cur.time + 300);
    expect(roll.map((u) => u.closed)).toEqual([true, false]);
    expect(roll[0]!.candle.close).toBe(99);
    expect(roll[1]!.candle.time).toBe(cur.time + 300);
    expect(a.tick(50, cur.time - 10)).toEqual([]); // late tick for a finished bucket is ignored
  });
  it("merges lower-timeframe bars and honours a seed", () => {
    const a = new TickAggregator("15m", { time: 1_760_000_100 - 1_760_000_100 % 900, open: 10, high: 12, low: 9, close: 11, volume: 5 });
    const [u] = a.bar({ time: 1_760_000_100 - 1_760_000_100 % 900 + 60, open: 11, high: 13, low: 10.5, close: 12.5, volume: 2 });
    expect(u!.candle).toMatchObject({ open: 10, high: 13, low: 9, close: 12.5, volume: 7 });
  });
});

describe("CachedProvider", () => {
  it("fetches once, serves from memory inside the refresh window, then refreshes only the tail", async () => {
    let t = 1_000_000;
    const inner = new FakeProvider("twelvedata", series(700));
    const cached = new CachedProvider(inner, { now: () => t, tail: 3 });
    const a = await cached.getCandles(EURUSD, "5m", 600);
    expect(a.length).toBe(600);
    await cached.getCandles(EURUSD, "5m", 600);
    expect(inner.calls.length).toBe(1);
    t += defaultRefreshSeconds("5m") * 1000 + 1;
    const b = await cached.getCandles(EURUSD, "5m", 600);
    expect(inner.calls.length).toBe(2);
    expect(inner.calls[1]!.limit).toBe(3);
    expect(b.length).toBe(600);
    expect(cached.lastSeen("EURUSD")?.eventTime).toBe(b[b.length - 1]!.time);
  });
  it("merges live updates into the store and skips REST refreshes while streaming", async () => {
    let t = 1_000_000;
    const data = series(100);
    const inner = new FakeProvider("twelvedata", data);
    const cached = new CachedProvider(inner, { now: () => t });
    const seen: CandleUpdate[] = [];
    cached.subscribe(EURUSD, "5m", (u) => seen.push(u));
    await cached.getCandles(EURUSD, "5m", 50);
    const last = data[data.length - 1]!;
    inner.push({ ...last, close: 999 });
    inner.push({ time: last.time + 300, open: 999, high: 1000, low: 998, close: 999.5, volume: 1 });
    t += 10 * 60_000;
    const out = await cached.getCandles(EURUSD, "5m", 50);
    expect(inner.calls.length).toBe(1);
    expect(out[out.length - 2]!.close).toBe(999);
    expect(out[out.length - 1]!.time).toBe(last.time + 300);
    expect(seen.length).toBe(2);
  });
  it("mergeCandles upserts by time and keeps order", () => {
    const out = mergeCandles(series(3), [{ time: 1_760_000_300, open: 1, high: 2, low: 0, close: 1.5, volume: 9 }, { time: 1_760_000_900, open: 5, high: 6, low: 4, close: 5.5 }]);
    expect(out.map((c) => c.time)).toEqual([1_760_000_000, 1_760_000_300, 1_760_000_600, 1_760_000_900]);
    expect(out[1]!.close).toBe(1.5);
  });
});

describe("Twelve Data", () => {
  it("parses time_series (newest first, daily and intraday stamps) into ascending candles", () => {
    expect(parseTwelveDateTime("2026-10-16")).toBe(Date.UTC(2026, 9, 16) / 1000);
    expect(parseTwelveDateTime("2026-10-19 12:05:00")).toBe(Date.UTC(2026, 9, 19, 12, 5) / 1000);
    const c = parseTimeSeries(TD_SERIES);
    expect(c.map((x) => x.time)).toEqual([Date.UTC(2026, 9, 19, 12, 0) / 1000, Date.UTC(2026, 9, 19, 12, 5) / 1000, Date.UTC(2026, 9, 19, 12, 10) / 1000]);
    expect(c[2]).toMatchObject({ open: 1.085, close: 1.0855, volume: undefined });
    expect(parseTimeSeries({ values: [{ datetime: "2026-10-16", open: "1", high: "2", low: "0.5", close: "1.5", volume: "12345" }] })[0]!.volume).toBe(12345);
    expect(() => parseTimeSeries(TD_ERROR)).toThrow(TwelveDataError);
    try { parseTimeSeries(TD_ERROR); } catch (e) { expect((e as TwelveDataError).code).toBe(429); }
  });

  it("requests the right interval, spends one credit per call and derives 3m from 1m", async () => {
    const urls: URL[] = [];
    const p = new TwelveDataProvider({ apiKey: "k", creditsPerMinute: 100, fetchImpl: fetchMock((u) => { urls.push(u); return u.searchParams.get("interval") === "1min" ? { values: series(30, 1_760_000_000, 60).reverse().map((c) => ({ datetime: new Date(c.time * 1000).toISOString().slice(0, 19).replace("T", " "), open: String(c.open), high: String(c.high), low: String(c.low), close: String(c.close) })), status: "ok" } : TD_SERIES; }) });
    const c = await p.getCandles(EURUSD, "5m", 200);
    expect(c.length).toBe(3);
    expect(urls[0]!.searchParams.get("symbol")).toBe("EUR/USD");
    expect(urls[0]!.searchParams.get("interval")).toBe("5min");
    expect(urls[0]!.searchParams.get("outputsize")).toBe("200");
    expect(urls[0]!.searchParams.get("apikey")).toBe("k");
    expect(p.status()).toMatchObject({ id: "twelvedata", state: "DELAYED", transport: "poll", licensed: true });
    expect(p.status().budget?.used).toBe(1);
    const d = await p.getCandles(EURUSD, "3m", 5);
    expect(urls[1]!.searchParams.get("interval")).toBe("1min");
    expect(d.length).toBe(5);
    expect(d.every((x, i) => i === 0 || x.time - d[i - 1]!.time === 180)).toBe(true);
  });

  it("reports an API error as OFFLINE with the message", async () => {
    const p = new TwelveDataProvider({ apiKey: "k", creditsPerMinute: 100, fetchImpl: fetchMock(() => TD_ERROR) });
    await expect(p.getCandles(EURUSD, "5m", 10)).rejects.toThrow(/credits/);
    expect(p.status().state).toBe("OFFLINE");
    expect(p.status().message).toMatch(/credits/);
  });

  it("polls when WebSocket is off and emits the previous bar closed on a new bucket", async () => {
    vi.useFakeTimers();
    let payload = TD_SERIES;
    const p = new TwelveDataProvider({ apiKey: "k", creditsPerMinute: 100, pollSeconds: 15, fetchImpl: fetchMock(() => payload) });
    const got: CandleUpdate[] = [];
    const off = p.subscribe(EURUSD, "5m", (u) => got.push(u));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(got.length).toBe(1);
    expect(got[0]!.closed).toBe(false);
    payload = { ...TD_SERIES, values: [{ datetime: "2026-10-19 12:15:00", open: "1.0855", high: "1.0860", low: "1.0850", close: "1.0858" }, ...TD_SERIES.values] };
    await vi.advanceTimersByTimeAsync(15_000);
    expect(got.slice(1).map((u) => u.closed)).toEqual([true, false]);
    expect(got[1]!.candle.time).toBe(Date.UTC(2026, 9, 19, 12, 10) / 1000);
    off();
  });

  it("streams prices over one WebSocket, folds them into candles, and resubscribes after a drop", async () => {
    vi.useFakeTimers();
    let t = Date.UTC(2026, 9, 19, 12, 0, 10);
    const p = new TwelveDataProvider({ apiKey: "k", creditsPerMinute: 100, useWebSocket: true, WebSocketCtor: FakeSocketCtor, now: () => t, fetchImpl: fetchMock(() => TD_SERIES) });
    const got: CandleUpdate[] = [];
    p.subscribe(EURUSD, "1m", (u) => got.push(u));
    const ws = FakeSocket.instances[0]!;
    expect(ws.url).toContain("apikey=k");
    ws.serverOpen();
    expect(ws.frames()).toContainEqual({ action: "subscribe", params: { symbols: "EUR/USD" } });
    ws.serverMessage({ event: "price", symbol: "EUR/USD", price: 1.0851, timestamp: t / 1000 });
    ws.serverMessage({ event: "price", symbol: "EUR/USD", price: 1.0853, timestamp: t / 1000 + 5 });
    expect(got.length).toBe(2);
    expect(got[1]!.candle).toMatchObject({ high: 1.0853, close: 1.0853 });
    expect(got[1]!.candle.time % 60).toBe(0);
    t += 60_000;
    ws.serverMessage({ event: "price", symbol: "EUR/USD", price: 1.0849, timestamp: t / 1000 });
    expect(got.slice(2).map((u) => u.closed)).toEqual([true, false]);
    expect(p.status()).toMatchObject({ state: "LIVE", transport: "ws" });
    ws.serverMessage({ event: "price", symbol: "GBP/USD", price: 1.29, timestamp: t / 1000 }); // not subscribed → ignored
    expect(got.length).toBe(4);
    ws.serverDrop();
    await vi.advanceTimersByTimeAsync(1_500);
    const ws2 = FakeSocket.instances[1]!;
    ws2.serverOpen();
    expect(ws2.frames()).toContainEqual({ action: "subscribe", params: { symbols: "EUR/USD" } });
    p.close();
  });
});

describe("Polygon", () => {
  it("maps tickers to clusters and channels", () => {
    expect(polygonChannel(EURUSD)).toEqual({ cluster: "forex", channel: "CA.C:EUR-USD", keys: ["C:EURUSD", "EUR/USD", "EUR-USD"] });
    expect(polygonChannel(BTCUSD)).toMatchObject({ cluster: "crypto", channel: "XA.X:BTC-USD" });
    expect(polygonChannel(US100)).toMatchObject({ cluster: "indices", channel: "AM.I:NDX" });
    expect(polygonChannel(USOIL)).toBeUndefined();
    expect(rangeSeconds(600, "5m", "stock")).toBeGreaterThan(rangeSeconds(600, "5m", "forex"));
  });

  it("parses aggregates (ms → s) and reports API errors", () => {
    const c = parseAggregates({ ticker: "C:EURUSD", status: "OK", results: [{ v: 1000, o: 1.084, c: 1.0845, h: 1.0847, l: 1.0838, t: 1_760_875_500_000 }, { v: 900, o: 1.083, c: 1.084, h: 1.0842, l: 1.0829, t: 1_760_875_200_000 }] });
    expect(c.map((x) => x.time)).toEqual([1_760_875_200, 1_760_875_500]);
    expect(c[1]).toMatchObject({ open: 1.084, close: 1.0845, volume: 1000 });
    expect(parseAggregates({ status: "OK", resultsCount: 0 })).toEqual([]);
    expect(() => parseAggregates({ status: "ERROR", error: "Unknown API Key" })).toThrow(/Unknown API Key/);
  });

  it("requests the aggregate range for the timeframe and budgets the call", async () => {
    const urls: URL[] = [];
    const now = 1_760_875_800_000;
    const p = new PolygonProvider({ apiKey: "pk", requestsPerMinute: 100, now: () => now, fetchImpl: fetchMock((u) => { urls.push(u); return { status: "OK", results: [{ o: 1, h: 2, l: 0.5, c: 1.5, v: 1, t: now - 600_000 }, { o: 1.5, h: 2, l: 1, c: 1.8, v: 1, t: now - 300_000 }] }; }) });
    const c = await p.getCandles(EURUSD, "5m", 100);
    expect(c.length).toBe(2);
    expect(urls[0]!.pathname).toMatch(/\/v2\/aggs\/ticker\/C%3AEURUSD\/range\/5\/minute\/\d+\/1760875800000$/);
    expect(urls[0]!.searchParams.get("apiKey")).toBe("pk");
    expect(p.status()).toMatchObject({ state: "DELAYED", licensed: true });
    expect(p.status().budget?.used).toBe(1);
  });

  it("authenticates the cluster socket, subscribes after auth_success and folds minute aggregates", async () => {
    let t = Date.UTC(2026, 9, 19, 12, 0, 0);
    const p = new PolygonProvider({ apiKey: "pk", requestsPerMinute: 100, useWebSocket: true, WebSocketCtor: FakeSocketCtor, now: () => t, fetchImpl: fetchMock(() => ({ status: "OK", results: [] })) });
    const got: CandleUpdate[] = [];
    p.subscribe(EURUSD, "5m", (u) => got.push(u));
    const ws = FakeSocket.instances[0]!;
    expect(ws.url).toBe("wss://socket.polygon.io/forex");
    ws.serverOpen();
    expect(ws.frames()[0]).toEqual({ action: "auth", params: "pk" });
    ws.serverMessage([{ ev: "status", status: "auth_success", message: "authenticated" }]);
    expect(ws.frames()[1]).toEqual({ action: "subscribe", params: "CA.C:EUR-USD" });
    ws.serverMessage([{ ev: "CA", pair: "EUR/USD", o: 1.08, h: 1.081, l: 1.079, c: 1.0805, v: 10, s: t, e: t + 60_000 }]);
    ws.serverMessage([{ ev: "CA", pair: "EUR/USD", o: 1.0805, h: 1.082, l: 1.0801, c: 1.0815, v: 12, s: t + 60_000, e: t + 120_000 }]);
    expect(got.length).toBe(2);
    expect(got[1]!.candle).toMatchObject({ time: t / 1000, open: 1.08, high: 1.082, low: 1.079, close: 1.0815, volume: 22 });
    expect(p.status()).toMatchObject({ state: "LIVE", transport: "ws" });
    p.close();
  });
});

describe("market hours", () => {
  it("knows weekends, the FX week and exchange hours (DST-aware)", () => {
    const sat = Date.UTC(2026, 9, 17, 12);            // Saturday
    const wed = Date.UTC(2026, 9, 21, 14);            // Wednesday 10:00 New York (EDT)
    const friLate = Date.UTC(2026, 9, 23, 21, 30);    // Friday 17:30 New York → FX closed
    const sunEve = Date.UTC(2026, 9, 18, 22, 30);     // Sunday 18:30 New York → FX open
    expect(marketState(EURUSD, sat)).toEqual({ open: false, reason: "weekend" });
    expect(marketState(EURUSD, wed)).toEqual({ open: true });
    expect(marketState(EURUSD, friLate).open).toBe(false);
    expect(marketState(EURUSD, sunEve).open).toBe(true);
    expect(marketState(BTCUSD, sat).open).toBe(true);
    expect(marketState(US100, wed).open).toBe(true);
    expect(marketState(US100, Date.UTC(2026, 9, 21, 12)).reason).toBe("after_hours");
    expect(localClock(Date.UTC(2026, 9, 21, 4), "America/New_York")).toEqual({ weekday: 3, minutes: 0 });
  });
});

describe("ProviderRegistry", () => {
  const base = { NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456" };

  it("parses routes and reports bad entries without throwing", () => {
    expect(parseRoutes("forex=twelvedata, crypto=binance")).toEqual({ routes: { forex: "twelvedata", crypto: "binance" }, errors: [] });
    expect(parseRoutes("bonds=twelvedata,forex=nope").errors.length).toBe(2);
    expect(parseRoutes(undefined).routes).toEqual({});
  });

  it("routes by asset class, warns about missing keys and falls back to demo", () => {
    const td = new FakeProvider("twelvedata", series(100));
    const reg = new ProviderRegistry(loadConfig({ ...base, MARKET_DATA_ROUTES: "forex=twelvedata,metal=twelvedata,crypto=binance,stock=polygon" }), { providers: { twelvedata: td } });
    expect(reg.for(EURUSD).id).toBe("twelvedata");
    expect(reg.for(BTCUSD).id).toBe("binance");
    expect(reg.for(US100).id).toBe("demo");
    expect(reg.warnings.join("\n")).toMatch(/stock is routed to polygon but it is not configured/);
    expect(reg.all().map((p) => p.id)).toEqual(["twelvedata", "binance", "demo"]);
  });

  it("legacy MARKET_DATA_PROVIDER routes every class to that provider; demo config routes nothing", () => {
    const legacy = new ProviderRegistry(loadConfig({ ...base, MARKET_DATA_PROVIDER: "binance" }));
    expect(legacy.for(BTCUSD).id).toBe("binance");
    expect(legacy.for(EURUSD).id).toBe("demo");
    expect(new ProviderRegistry(loadConfig({ ...base })).routes).toEqual({});
    expect(providerState({ transport: "synthetic" })).toBe("LIVE");
  });

  it("derives the feed state from provider health and the market calendar", () => {
    const wed = Date.UTC(2026, 9, 21, 14);
    const sat = Date.UTC(2026, 9, 17, 12);
    const td = new FakeProvider("twelvedata", series(100), { lastUpdate: wed - 5_000 });
    const reg = new ProviderRegistry(loadConfig({ ...base, MARKET_DATA_ROUTES: "forex=twelvedata" }), { providers: { twelvedata: td }, now: () => wed });
    expect(reg.feed(EURUSD)).toMatchObject({ provider: "twelvedata", state: "DELAYED", transport: "poll", licensed: true, marketOpen: true, delaySeconds: 15, ageSeconds: 5 });
    expect(reg.feed(EURUSD, sat)).toMatchObject({ state: "CLOSED", marketOpen: false });
    td.statusValue = { ...td.statusValue, lastUpdate: wed - 10 * 60_000 };
    expect(reg.feed(EURUSD).state).toBe("STALE");
    td.statusValue = { ...td.statusValue, state: "OFFLINE", live: false, message: "HTTP 401" };
    expect(reg.feed(EURUSD)).toMatchObject({ state: "OFFLINE", message: "HTTP 401" });
    td.statusValue = { ...td.statusValue, state: "LIVE", live: true, transport: "ws", lastUpdate: wed - 1_000 };
    expect(reg.feed(EURUSD).state).toBe("LIVE");
    expect(reg.feed(BTCUSD)).toMatchObject({ provider: "demo", state: "LIVE", transport: "synthetic", licensed: false });
    expect(reg.feeds().length).toBe(10);
  });
});
