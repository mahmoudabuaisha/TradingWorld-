import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Zone } from "@tradingworld/analysis-engine";
import { createMemoryRepositories, type Repositories } from "../repositories/memory.js";
import { createPrismaRepositories, type PrismaRepositories } from "../repositories/prisma.js";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const withSchema = (url: string, schema: string) => `${url}${url.includes("?") ? "&" : "?"}schema=${schema}`;
const REPO_URL = TEST_DB ? withSchema(TEST_DB, "tw_repo_test") : "";
const DB_PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/db");

function migrate(url: string) {
  execFileSync(path.join(DB_PKG, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: DB_PKG, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}

let prisma: PrismaRepositories | undefined;
async function resetPrisma() {
  const db = prisma!.client;
  await db.$executeRawUnsafe(`TRUNCATE "Drawing", "ZoneFeedback", "ZoneOutcome", "Zone", "AuditLog", "ZoneLog", "Trade", "Alert", "Watchlist", "Session", "User" CASCADE`);
}

const impls: { name: string; make: () => Promise<Repositories> }[] = [{ name: "memory", make: async () => createMemoryRepositories() }];
if (TEST_DB) impls.push({ name: "prisma", make: async () => { await resetPrisma(); return prisma!; } });

beforeAll(async () => {
  if (!TEST_DB) return;
  migrate(REPO_URL);
  prisma = createPrismaRepositories(REPO_URL);
  await prisma.seed();
}, 120_000);
afterAll(async () => { if (prisma) { await resetPrisma(); await prisma.close(); } });

const zone = (id: string, status: string, score: number) => ({ id, status, score, name: `zone ${id}`, direction: "bullish", top: 2, bottom: 1, factors: [{ key: "FVG", present: true, weight: 10, evidence: "gap" }] }) as unknown as Zone;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** absent = missing or undefined (memory omits the key, Prisma returns it as undefined) */
const expectAbsent = (o: object, keys: string[]) => { for (const k of keys) expect((o as Record<string, unknown>)[k], k).toBeUndefined(); };

describe.each(impls)("Repositories contract ($name)", ({ make }) => {
  let repos: Repositories;
  beforeEach(async () => { repos = await make(); });

  it("users: create, find case-insensitively, list in creation order, partial update", async () => {
    const a = await repos.users.create({ email: "first@tw.test", displayName: "First", passwordHash: "h1", role: "admin", settings: { locale: "ar", theme: "dark" } });
    await sleep(5);
    const b = await repos.users.create({ email: "second@tw.test", displayName: "Second", passwordHash: "h2", role: "user", settings: {} });
    expect(a.id).toBeTruthy();
    expect(typeof a.createdAt).toBe("number");
    expect((await repos.users.byEmail("FIRST@tw.test"))?.id).toBe(a.id);
    expect(await repos.users.byEmail("nobody@tw.test")).toBeUndefined();
    expect((await repos.users.byId(b.id))?.settings).toEqual({});
    expect((await repos.users.list()).map((u) => u.email)).toEqual(["first@tw.test", "second@tw.test"]);
    const upd = await repos.users.update(b.id, { role: "coach", settings: { locale: "en", nested: { x: 1 } } });
    expect(upd).toMatchObject({ role: "coach", displayName: "Second", passwordHash: "h2", settings: { locale: "en", nested: { x: 1 } } });
    expect(await repos.users.update("00000000-0000-0000-0000-000000000000", { role: "admin" })).toBeUndefined();
  });

  it("watchlists: default list until set", async () => {
    const u = await repos.users.create({ email: "w@tw.test", displayName: "W", passwordHash: "h", role: "user", settings: {} });
    expect(await repos.watchlists.get(u.id)).toEqual(["XAUUSD", "EURUSD", "BTCUSD", "US100"]);
    expect(await repos.watchlists.set(u.id, ["GBPUSD", "XAGUSD"])).toEqual(["GBPUSD", "XAGUSD"]);
    expect(await repos.watchlists.get(u.id)).toEqual(["GBPUSD", "XAGUSD"]);
    expect(await repos.watchlists.set(u.id, [])).toEqual([]);
  });

  it("alerts: create active, list per user, trigger, clear a field, remove only own", async () => {
    const u = await repos.users.create({ email: "a@tw.test", displayName: "A", passwordHash: "h", role: "user", settings: {} });
    const other = await repos.users.create({ email: "b@tw.test", displayName: "B", passwordHash: "h", role: "user", settings: {} });
    const a1 = await repos.alerts.create({ userId: u.id, symbol: "XAUUSD", kind: "price_below", price: 2355.5, note: "demand" });
    const a2 = await repos.alerts.create({ userId: u.id, symbol: "EURUSD", kind: "zone_enter", zoneId: "z-5m-fvg-412-0" });
    await repos.alerts.create({ userId: other.id, symbol: "BTCUSD", kind: "price_above", price: 70000 });
    expect(a1).toMatchObject({ active: true, price: 2355.5, note: "demand" });
    expectAbsent(a1, ["zoneId", "triggeredAt"]);
    expect((await repos.alerts.list(u.id)).map((a) => a.id)).toEqual([a1.id, a2.id]);
    expect((await repos.alerts.listActive()).length).toBe(3);
    const at = Date.now();
    const trig = await repos.alerts.update(a1.id, { active: false, triggeredAt: at });
    expect(trig).toMatchObject({ active: false, triggeredAt: at });
    expect((await repos.alerts.listActive()).length).toBe(2);
    expect((await repos.alerts.update(a1.id, { note: undefined }))?.note).toBeUndefined();
    expect(await repos.alerts.update("00000000-0000-0000-0000-000000000000", { active: false })).toBeUndefined();
    expect(await repos.alerts.remove(a2.id, other.id)).toBe(false);
    expect(await repos.alerts.remove(a2.id, u.id)).toBe(true);
    expect((await repos.alerts.list(u.id)).length).toBe(1);
  });

  it("journal: seconds round-trip, newest first, owner-scoped update/remove, clearing fields", async () => {
    const u = await repos.users.create({ email: "j@tw.test", displayName: "J", passwordHash: "h", role: "user", settings: {} });
    const other = await repos.users.create({ email: "k@tw.test", displayName: "K", passwordHash: "h", role: "user", settings: {} });
    const now = Math.floor(Date.now() / 1000);
    const older = await repos.journal.create({ userId: u.id, symbol: "EURUSD", direction: "short", entry: 1.089, stopLoss: 1.0912, takeProfit: 1.0824, size: 1, openedAt: now - 90_000, closedAt: now - 80_000, exitPrice: 1.0836, rMultiple: 2.45, setup: "Supply + CHoCH", notes: "خروج قبل الهدف" });
    const newer = await repos.journal.create({ userId: u.id, symbol: "XAUUSD", direction: "long", entry: 2362.4, stopLoss: 2354.9, size: 0.5, openedAt: now - 7200 });
    expect(newer.openedAt).toBe(now - 7200);
    expectAbsent(newer, ["closedAt", "exitPrice", "rMultiple", "takeProfit"]);
    expect(older).toMatchObject({ openedAt: now - 90_000, closedAt: now - 80_000, rMultiple: 2.45, notes: "خروج قبل الهدف" });
    expect((await repos.journal.list(u.id)).map((t) => t.id)).toEqual([newer.id, older.id]);
    expect(await repos.journal.update(newer.id, other.id, { exitPrice: 2370 })).toBeUndefined();
    const closed = await repos.journal.update(newer.id, u.id, { exitPrice: 2384.9, rMultiple: 3, closedAt: now });
    expect(closed).toMatchObject({ exitPrice: 2384.9, rMultiple: 3, closedAt: now, entry: 2362.4 });
    const reopened = await repos.journal.update(newer.id, u.id, { exitPrice: undefined, rMultiple: undefined, closedAt: undefined });
    expectAbsent(reopened!, ["exitPrice", "rMultiple", "closedAt"]);
    expect(await repos.journal.remove(older.id, other.id)).toBe(false);
    expect(await repos.journal.remove(older.id, u.id)).toBe(true);
    expect((await repos.journal.list(u.id)).length).toBe(1);
    expect(await repos.journal.list(other.id)).toEqual([]);
  });

  it("zone log: append, newest first, count, full zone round-trip", async () => {
    await repos.zoneLog.append({ symbol: "XAUUSD", timeframe: "5m", engineVersion: "1.1.1", scoringVersion: "scoring-v1", zone: zone("z-5m-fvg-1-0", "ACTIVE", 72) });
    await sleep(3);
    await repos.zoneLog.append({ symbol: "XAUUSD", timeframe: "5m", engineVersion: "1.1.1", scoringVersion: "scoring-v1", zone: zone("z-5m-fvg-1-0", "REACTED", 72) });
    await sleep(3);
    await repos.zoneLog.append({ symbol: "EURUSD", timeframe: "15m", engineVersion: "1.1.1", scoringVersion: "scoring-v1", zone: zone("z-15m-ob-3-1", "TESTED", 57.6) });
    expect(await repos.zoneLog.count()).toBe(3);
    const recent = await repos.zoneLog.recent(2);
    expect(recent.map((e) => `${e.symbol}:${e.zone.status}`)).toEqual(["EURUSD:TESTED", "XAUUSD:REACTED"]);
    expect(recent[0]!.zone).toEqual(zone("z-15m-ob-3-1", "TESTED", 57.6));
    expect(typeof recent[0]!.loggedAt).toBe("number");
  });

  it("zones (outcome tracker): first observation wins, open oldest first, resolve, filters", async () => {
    const z = (key: string, provider: string, detectedAt: number, score = 72) => ({
      key, symbol: "EURUSD", timeframe: "5m", engineVersion: "1.1.1", scoringVersion: "scoring-v1", provider, atr: 0.0012, detectedBarTime: 1_792_400_000, detectedAt,
      context: { regime: { trend: "RANGING", volatility: "NORMAL", phase: "NEUTRAL", atr: 0.0012, atrRatio: 1, rangeWidthAtr: 3 }, session: "LONDON", htfBias: "bullish" },
      zone: { id: "z-5m-fvg-1-0", name: "Demand", nameAr: "طلب", origin: "FVG", direction: "bullish", top: 1.09, bottom: 1.089, createdTime: 1_792_399_000, score, quality: "HIGH", status: "ACTIVE", tests: 0, factors: [{ key: "FVG", present: true }], invalidation: { price: 1.089, ar: "", en: "" }, htfContext: ["1d bullish"] } as unknown as Zone,
    }) as Parameters<Repositories["zones"]["track"]>[0];
    const t = Date.now();
    expect(await repos.zones.track(z("k-old", "twelvedata", t - 2000))).toBe(true);
    expect(await repos.zones.track(z("k-old", "twelvedata", t, 99))).toBe(false);
    expect(await repos.zones.track(z("k-new", "twelvedata", t - 1000))).toBe(true);
    expect(await repos.zones.track(z("k-demo", "demo", t - 500))).toBe(true);
    const open = await repos.zones.open(10);
    expect(open.map((x) => x.key)).toEqual(["k-old", "k-new", "k-demo"]);
    expect(open[0]).toMatchObject({ detectedBarTime: 1_792_400_000, atr: 0.0012, context: { session: "LONDON" } });
    expect(open[0]!.zone.score).toBe(72);
    expect(open[0]!.zone.htfContext).toEqual(["1d bullish"]);
    expectAbsent(open[0]!, ["outcome"]);
    const outcome = { outcomeVersion: "outcome-v1", label: "REACTED" as const, reason: "invalidated" as const, finalStatus: "REACTED" as const, mfeAtr: 2.5, maeAtr: 0.4, reactionAtr: 1.8, barsToOutcome: 7, barsObserved: 12, horizonBars: 120, retests: 1, resolvedAt: t };
    await repos.zones.resolve("k-old", outcome);
    await repos.zones.resolve("k-demo", { ...outcome, label: "UNTOUCHED", finalStatus: "ACTIVE", reason: "horizon" });
    expect((await repos.zones.open(10)).map((x) => x.key)).toEqual(["k-new"]);
    expect((await repos.zones.list({ resolved: true })).map((x) => x.key)).toEqual(["k-old"]);
    expect((await repos.zones.list({ resolved: true, includeDemo: true })).map((x) => x.key)).toEqual(["k-demo", "k-old"]);
    expect((await repos.zones.list({ resolved: true }))[0]!.outcome).toEqual(outcome);
    expect(await repos.zones.count({ includeDemo: true })).toBe(3);
    expect(await repos.zones.count({ resolved: false })).toBe(1);
    expect(await repos.zones.count({ engineVersion: "0.0.1" })).toBe(0);
  });

  it("feedback: one vote per user and zone, edit replaces, list joins the zone and skips demo", async () => {
    const u = await repos.users.create({ email: "fb@tw.test", displayName: "Fb", passwordHash: "h", role: "user", settings: {} });
    const v = await repos.users.create({ email: "fb2@tw.test", displayName: "Fb2", passwordHash: "h", role: "user", settings: {} });
    const base = { symbol: "EURUSD", timeframe: "5m", engineVersion: "1.1.1", scoringVersion: "scoring-v1", atr: 0.001, detectedBarTime: 1_792_400_000,
      context: { regime: { trend: "RANGING", volatility: "NORMAL", phase: "NEUTRAL", atr: 0.001, atrRatio: 1, rangeWidthAtr: 3 }, session: "LONDON", htfBias: "bullish" },
      zone: { id: "z", name: "Demand", nameAr: "طلب", origin: "FVG", direction: "bullish", top: 1.09, bottom: 1.089, createdTime: 1_792_399_000, score: 70, quality: "HIGH", status: "ACTIVE", tests: 0, factors: [{ key: "FVG", present: true }], invalidation: { price: 1.089, ar: "", en: "" }, htfContext: [] } as unknown as Zone };
    await repos.zones.track({ ...base, key: "fk-real", provider: "twelvedata" } as Parameters<Repositories["zones"]["track"]>[0]);
    await repos.zones.track({ ...base, key: "fk-demo", provider: "demo" } as Parameters<Repositories["zones"]["track"]>[0]);
    expect((await repos.zones.get("fk-real"))?.zone.quality).toBe("HIGH");
    expect(await repos.zones.get("nope")).toBeUndefined();
    const first = await repos.feedback.upsert({ zoneKey: "fk-real", userId: u.id, useful: true, bestFactor: "FVG", comment: "واضحة" });
    expect(first).toMatchObject({ zoneKey: "fk-real", userId: u.id, useful: true, bestFactor: "FVG", comment: "واضحة" });
    await sleep(5);
    const edited = await repos.feedback.upsert({ zoneKey: "fk-real", userId: u.id, useful: false });
    expect(edited.id).toBe(first.id);
    expect(edited.createdAt).toBe(first.createdAt);
    expect(edited.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(edited.useful).toBe(false);
    expectAbsent(edited, ["bestFactor", "comment"]);
    expect(await repos.feedback.get("fk-real", v.id)).toBeUndefined();
    await repos.feedback.upsert({ zoneKey: "fk-real", userId: v.id, useful: true });
    await repos.feedback.upsert({ zoneKey: "fk-demo", userId: v.id, useful: true });
    const list = await repos.feedback.list({});
    expect(list.length).toBe(2);
    expect(list.every((r) => r.zone.key === "fk-real" && r.zone.provider === "twelvedata")).toBe(true);
    expect((await repos.feedback.list({ includeDemo: true })).length).toBe(3);
    expect(await repos.feedback.remove("fk-real", u.id)).toBe(true);
    expect(await repos.feedback.remove("fk-real", u.id)).toBe(false);
    expect(await repos.feedback.get("fk-real", u.id)).toBeUndefined();
  });

  it("drawings: per user and symbol, owner-scoped update/remove, clear", async () => {
    const u = await repos.users.create({ email: "dr@tw.test", displayName: "Dr", passwordHash: "h", role: "user", settings: {} });
    const v = await repos.users.create({ email: "dr2@tw.test", displayName: "Dr2", passwordHash: "h", role: "user", settings: {} });
    const T = 1_792_400_000;
    const a = await repos.drawings.create(u.id, { symbol: "XAUUSD", kind: "trendline", points: [{ time: T, price: 2400.5 }, { time: T + 900, price: 2412.25 }] });
    await sleep(3);
    const b = await repos.drawings.create(u.id, { symbol: "XAUUSD", kind: "hline", points: [{ time: T, price: 2390 }] });
    await repos.drawings.create(u.id, { symbol: "EURUSD", kind: "fib", points: [{ time: T, price: 1.08 }, { time: T + 600, price: 1.09 }] });
    await repos.drawings.create(v.id, { symbol: "XAUUSD", kind: "rect", points: [{ time: T, price: 1 }, { time: T + 1, price: 2 }] });
    expect(a).toMatchObject({ symbol: "XAUUSD", kind: "trendline", points: [{ time: T, price: 2400.5 }, { time: T + 900, price: 2412.25 }] });
    expect(typeof a.createdAt).toBe("number");
    expect((a as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((await repos.drawings.list(u.id, "XAUUSD")).map((d) => d.id)).toEqual([a.id, b.id]);
    expect(await repos.drawings.count(u.id, "XAUUSD")).toBe(2);
    expect((await repos.drawings.get(a.id, u.id))?.kind).toBe("trendline");
    expect(await repos.drawings.get(a.id, v.id)).toBeUndefined();
    expect(await repos.drawings.update(a.id, v.id, [{ time: T, price: 1 }, { time: T, price: 2 }])).toBeUndefined();
    await sleep(3);
    const moved = await repos.drawings.update(a.id, u.id, [{ time: T + 300, price: 2401 }, { time: T + 1200, price: 2415 }]);
    expect(moved?.points).toEqual([{ time: T + 300, price: 2401 }, { time: T + 1200, price: 2415 }]);
    expect(moved!.updatedAt).toBeGreaterThan(a.updatedAt);
    expect(await repos.drawings.remove(b.id, v.id)).toBe(false);
    expect(await repos.drawings.remove(b.id, u.id)).toBe(true);
    expect(await repos.drawings.clear(u.id, "XAUUSD")).toBe(1);
    expect(await repos.drawings.list(u.id, "XAUUSD")).toEqual([]);
    expect((await repos.drawings.list(u.id, "EURUSD")).length).toBe(1);
    expect((await repos.drawings.list(v.id, "XAUUSD")).length).toBe(1);
  });

  it("audit: append with meta, newest first", async () => {
    const u = await repos.users.create({ email: "au@tw.test", displayName: "Au", passwordHash: "h", role: "admin", settings: {} });
    await repos.audit.append({ actorId: u.id, action: "user.register" });
    await sleep(3);
    await repos.audit.append({ actorId: u.id, action: "user.role.change", target: "x", meta: { role: "coach" } });
    await sleep(3);
    await repos.audit.append({ action: "system.start" });
    const r = await repos.audit.recent(10);
    expect(r.map((e) => e.action)).toEqual(["system.start", "user.role.change", "user.register"]);
    expect(r[1]).toMatchObject({ actorId: u.id, target: "x", meta: { role: "coach" } });
    expect(r[0]!.actorId).toBeUndefined();
  });
});

describe.skipIf(!TEST_DB)("Prisma repositories — persistence and setup", () => {
  it("data written by one client is read by a fresh one; the seed is idempotent", async () => {
    await resetPrisma();
    const u = await prisma!.users.create({ email: "persist@tw.test", displayName: "P", passwordHash: "h", role: "user", settings: { a: 1 } });
    await prisma!.alerts.create({ userId: u.id, symbol: "XAUUSD", kind: "price_above", price: 2500 });
    const second = createPrismaRepositories(REPO_URL);
    try {
      await second.seed();
      expect((await second.users.byEmail("persist@tw.test"))?.settings).toEqual({ a: 1 });
      expect((await second.alerts.list(u.id)).length).toBe(1);
      expect(await second.client.instrument.count()).toBe(10);
    } finally { await second.close(); }
  });

  it("an unmigrated database fails fast with the command that fixes it", async () => {
    const bare = createPrismaRepositories(withSchema(TEST_DB!, "tw_never_migrated"));
    try { await expect(bare.seed()).rejects.toThrow(/migrate:deploy/); } finally { await bare.close(); }
  });

  it("the API keeps a registered user across a restart (REPOSITORIES=prisma)", async () => {
    await resetPrisma();
    const cfg = loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", REPOSITORIES: "prisma", DATABASE_URL: REPO_URL, CANDLE_STORE: "memory" });
    const app1 = await buildApp({ config: cfg, logger: false });
    const reg = await app1.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: "Restart@tw.test", password: "password123", displayName: "Restart" } });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().user.role).toBe("admin");
    const token = reg.json().token;
    const al = await app1.inject({ method: "POST", url: "/api/v1/alerts", headers: { authorization: `Bearer ${token}` }, payload: { symbol: "XAUUSD", kind: "price_below", price: 2300 } });
    expect(al.statusCode).toBe(200);
    const tr = await app1.inject({ method: "POST", url: "/api/v1/journal", headers: { authorization: `Bearer ${token}` }, payload: { symbol: "XAUUSD", direction: "long", entry: 100, stopLoss: 99, exitPrice: 103, size: 1, openedAt: 1_792_400_000 } });
    expect(tr.json().trade.rMultiple).toBe(3);
    await app1.close();

    const app2 = await buildApp({ config: cfg, logger: false });
    try {
      const login = await app2.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "restart@tw.test", password: "password123" } });
      expect(login.statusCode).toBe(200);
      const h = { authorization: `Bearer ${login.json().token}` };
      expect((await app2.inject({ method: "GET", url: "/api/v1/alerts", headers: h })).json().alerts.length).toBe(1);
      const j = (await app2.inject({ method: "GET", url: "/api/v1/journal", headers: h })).json();
      expect(j.trades[0]).toMatchObject({ openedAt: 1_792_400_000, rMultiple: 3 });
      expect(j.stats).toMatchObject({ total: 1, closed: 1, winRate: 1 });
      const second = await app2.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: "two@tw.test", password: "password123", displayName: "Two" } });
      expect(second.json().user.role).toBe("user");
    } finally { await app2.close(); }
  }, 60_000);
});
