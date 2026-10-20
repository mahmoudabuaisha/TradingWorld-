import { describe, it, expect, beforeEach } from "vitest";
import type { Candle } from "@tradingworld/analysis-engine";
import type { Instrument, Timeframe } from "@tradingworld/shared";
import { loadConfig } from "../config.js";
import { createMemoryRepositories, type Repositories, type Alert, type PushSub } from "../repositories/memory.js";
import { ProviderRegistry } from "../providers/registry.js";
import { AlertService, alertCondition } from "../services/alerts.js";
import { NotificationService, prefsOf, type PushResult } from "../services/notifications.js";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "../providers/types.js";

class BarsProvider implements MarketDataProvider {
  readonly id = "twelvedata" as const;
  bars: Candle[] = [];
  supports(i: Instrument) { return !!i.providerSymbols.twelvedata; }
  async getCandles(_i: Instrument, _tf: Timeframe, limit: number) { return this.bars.slice(-limit); }
  subscribe(_i: Instrument, _tf: Timeframe, _on: (u: CandleUpdate) => void) { return () => {}; }
  status(): ProviderStatus { return { id: this.id, live: true, state: "DELAYED", transport: "poll", licensed: true }; }
}

const alertOf = (over: Partial<Alert>): Alert => ({ id: "a", userId: "u", symbol: "EURUSD", kind: "price_above", active: true, createdAt: 0, ...over });

describe("alert conditions", () => {
  it("uses the bar's extremes and zone bounds", () => {
    expect(alertCondition(alertOf({ price: 1.09 }), { high: 1.091, low: 1.08, close: 1.085 })).toBeTruthy();
    expect(alertCondition(alertOf({ price: 1.09 }), { high: 1.089, low: 1.08, close: 1.085 })).toBeUndefined();
    expect(alertCondition(alertOf({ kind: "price_below", price: 1.08 }), { high: 1.09, low: 1.0799, close: 1.085 })).toBeTruthy();
    const zone = alertOf({ kind: "zone_enter", zoneTop: 1.0805, zoneBottom: 1.08 });
    expect(alertCondition(zone, { high: 1.09, low: 1.0804, close: 1.085 })?.en).toMatch(/1.08 – 1.0805/);
    expect(alertCondition(zone, { high: 1.09, low: 1.0806, close: 1.085 })).toBeUndefined();
    expect(alertCondition(alertOf({ kind: "zone_enter", zoneId: "z-legacy" }), { high: 2, low: 0, close: 1 })).toBeUndefined();
  });
});

describe("AlertService watcher", () => {
  let repos: Repositories;
  let provider: BarsProvider;
  let svc: AlertService;
  let now: number;
  beforeEach(() => {
    repos = createMemoryRepositories();
    provider = new BarsProvider();
    now = Date.UTC(2026, 9, 20, 12, 0, 30);
    const registry = new ProviderRegistry(loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", MARKET_DATA_ROUTES: "forex=twelvedata" }), { providers: { twelvedata: provider } });
    svc = new AlertService(repos, registry, { pollSeconds: 15, now: () => now });
  });

  it("fires alerts from the server without any viewer, exactly once", async () => {
    const t0 = Date.UTC(2026, 9, 20, 11, 59) / 1000;
    const a = await repos.alerts.create({ userId: "u1", symbol: "EURUSD", kind: "price_above", price: 1.09 });
    // the alert exists since before both bars opened
    (await repos.alerts.listActive())[0]!.createdAt = (t0 - 60) * 1000;
    provider.bars = [{ time: t0, open: 1.085, high: 1.0905, low: 1.084, close: 1.086 }, { time: t0 + 60, open: 1.086, high: 1.087, low: 1.085, close: 1.0865 }];
    const events: string[] = [];
    svc.onTrigger((e) => events.push(e.alert.id));
    const [n1, n2] = await Promise.all([svc.watchOnce(), svc.evaluate("EURUSD", 1.095)]);
    expect(events).toEqual([a.id]);
    expect(n1 + (n2 as unknown[]).length).toBe(1);
    expect((await repos.alerts.list("u1"))[0]).toMatchObject({ active: false, triggeredAt: now });
    expect(await svc.watchOnce()).toBe(0);
    expect(svc.stats.polls).toBeGreaterThanOrEqual(1);
  });

  it("never fires on a spike that happened before the alert was created", async () => {
    const t0 = Date.UTC(2026, 9, 20, 12, 0) / 1000;
    await repos.alerts.create({ userId: "u1", symbol: "EURUSD", kind: "price_above", price: 1.09 });
    (await repos.alerts.listActive())[0]!.createdAt = (t0 + 10) * 1000; // created 10 s after the bar opened
    provider.bars = [{ time: t0, open: 1.085, high: 1.095, low: 1.084, close: 1.086 }];
    expect(await svc.watchOnce()).toBe(0);
    provider.bars = [{ time: t0, open: 1.085, high: 1.095, low: 1.084, close: 1.091 }]; // the close itself crosses
    expect(await svc.watchOnce()).toBe(1);
  });
});

describe("NotificationService", () => {
  let repos: Repositories;
  let pushed: { sub: PushSub; payload: string }[];
  let emails: { to: string; subject: string; text: string }[];
  let pushResult: (s: PushSub) => PushResult;
  const make = (withEmail = true) => new NotificationService(repos, { emailFrom: "TW <a@b.c>", appUrl: "https://app.example/" }, {
    push: async (sub, payload) => { pushed.push({ sub, payload }); return pushResult(sub); },
    email: withEmail ? async (m) => { emails.push(m); } : undefined,
  });
  beforeEach(() => { repos = createMemoryRepositories(); pushed = []; emails = []; pushResult = () => ({ ok: true }); });

  it("lands in the inbox, then goes out per preferences; email is opt-in", async () => {
    const u = await repos.users.create({ email: "me@tw.test", displayName: "Me", passwordHash: "h", role: "user", settings: { locale: "ar" } });
    expect(prefsOf(u)).toEqual({ push: true, email: false });
    const svc = make();
    const seen: string[] = [];
    svc.onNotify((n) => seen.push(n.userId));
    let n = await svc.notify(u.id, { kind: "alert", title: { ar: "تنبيه XAUUSD", en: "XAUUSD alert" }, body: { ar: "السعر تجاوز 2500", en: "Price crossed above 2500" }, url: "/chart?symbol=XAUUSD", alertId: "a1" });
    expect(seen).toEqual([u.id]);
    expect(n.deliveries.map((d) => `${d.channel}:${d.status}:${d.detail}`)).toEqual(["push:skipped:no subscription", "email:skipped:disabled"]);
    await repos.push.upsert(u.id, { endpoint: "https://push.example.test/1", p256dh: "p".repeat(20), auth: "a".repeat(12) });
    await repos.push.upsert(u.id, { endpoint: "https://push.example.test/2", p256dh: "q".repeat(20), auth: "b".repeat(12) });
    await repos.users.update(u.id, { settings: { ...u.settings, notifications: { push: true, email: true } } });
    pushResult = (s) => (s.endpoint.endsWith("/2") ? { ok: false, gone: true, error: "HTTP 410" } : { ok: true });
    n = await svc.notify(u.id, { kind: "alert", title: { ar: "تنبيه XAUUSD", en: "XAUUSD alert" }, body: { ar: "السعر تجاوز 2500", en: "Price crossed above 2500" }, url: "/chart?symbol=XAUUSD", alertId: "a1" });
    expect(n.deliveries.map((d) => `${d.channel}:${d.status}:${d.detail ?? ""}`)).toEqual(["push:sent:1/2 devices", "email:sent:"]);
    expect(JSON.parse(pushed[0]!.payload)).toMatchObject({ title: "تنبيه XAUUSD", body: "السعر تجاوز 2500", url: "/chart?symbol=XAUUSD", tag: "a1", dir: "rtl", lang: "ar" });
    expect((await repos.push.list(u.id)).map((s) => s.endpoint)).toEqual(["https://push.example.test/1"]); // the gone one is removed
    expect(emails[0]).toMatchObject({ to: "me@tw.test", subject: "TradingWorld · تنبيه XAUUSD" });
    expect(emails[0]!.text).toContain("https://app.example/chart?symbol=XAUUSD");
    expect(emails[0]!.text).toContain("ليس توصية");
    const inbox = await repos.notifications.list(u.id, 10);
    expect(inbox.length).toBe(2);
    expect(inbox[0]!.deliveries.length).toBe(2);
  });

  it("reports unconfigured channels and failures without throwing", async () => {
    const u = await repos.users.create({ email: "x@tw.test", displayName: "X", passwordHash: "h", role: "user", settings: { locale: "en", notifications: { push: true, email: true } } });
    await repos.push.upsert(u.id, { endpoint: "https://push.example.test/9", p256dh: "p".repeat(20), auth: "a".repeat(12) });
    pushResult = () => ({ ok: false, gone: false, error: "HTTP 500" });
    const n = await make(false).notify(u.id, { kind: "test", title: { ar: "ت", en: "Test" }, body: { ar: "ن", en: "Body" } });
    expect(n.deliveries.map((d) => `${d.channel}:${d.status}:${d.detail}`)).toEqual(["push:failed:HTTP 500", "email:skipped:not configured"]);
    expect((await repos.push.list(u.id))[0]!.failures).toBe(1);
    const plain = new NotificationService(repos, { emailFrom: "x", appUrl: "http://x" });
    expect([plain.pushConfigured, plain.emailConfigured]).toEqual([false, false]);
  });
});
