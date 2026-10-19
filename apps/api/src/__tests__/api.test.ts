import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";

beforeAll(async () => {
  app = await buildApp({ config: loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", MARKET_DATA_PROVIDER: "demo" }), logger: false });
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe("api", () => {
  it("health", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it("register → first user is admin, login works, me requires token", async () => {
    const reg = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: "a@b.co", password: "password123", displayName: "Trader" } });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().user.role).toBe("admin");
    token = reg.json().token;
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "a@b.co", password: "password123" } });
    expect(login.statusCode).toBe(200);
    const bad = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(bad.statusCode).toBe(401);
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(me.json().user.email).toBe("a@b.co");
  });

  it("candles + analysis from demo provider", async () => {
    const c = await app.inject({ method: "GET", url: "/api/v1/candles?symbol=XAUUSD&timeframe=5m&limit=200" });
    expect(c.statusCode).toBe(200);
    expect(c.json().candles.length).toBe(200);
    const a = await app.inject({ method: "GET", url: "/api/v1/analysis?symbol=XAUUSD&timeframe=5m&includeLowQuality=true" });
    expect(a.statusCode).toBe(200);
    const body = a.json();
    expect(body.engineVersion).toBeTruthy();
    expect(Array.isArray(body.zones)).toBe(true);
    expect(body.htf.length).toBeGreaterThan(0);
  });

  it("query booleans: 'false' stays false, invalidated zones only on request", async () => {
    const plain = await app.inject({ method: "GET", url: "/api/v1/analysis?symbol=XAUUSD&timeframe=5m&includeLowQuality=false&includeInvalidated=false" });
    expect(plain.statusCode).toBe(200);
    expect(plain.json().zones.every((z: { quality: string; status: string }) => z.quality !== "LOW" && z.status !== "INVALIDATED")).toBe(true);
    const full = await app.inject({ method: "GET", url: "/api/v1/analysis?symbol=XAUUSD&timeframe=5m&includeLowQuality=true&includeInvalidated=true" });
    expect(full.json().zones.length).toBeGreaterThanOrEqual(plain.json().zones.length);
  });

  it("ai chat answers deterministically without a key", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/ai/chat", payload: { symbol: "XAUUSD", timeframe: "5m", question: "ماذا يحدث على الفريمات الأعلى؟", locale: "ar" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().provider).toBe("deterministic");
    expect(r.json().grounded).toBe(true);
  });

  it("alerts, watchlist, journal CRUD with R calculation", async () => {
    const h = { authorization: `Bearer ${token}` };
    const al = await app.inject({ method: "POST", url: "/api/v1/alerts", headers: h, payload: { symbol: "XAUUSD", kind: "price_above", price: 1 } });
    expect(al.statusCode).toBe(200);
    const fired = await app.ctx.alerts.evaluate("XAUUSD", 2);
    expect(fired.length).toBe(1);
    expect(fired[0]!.message.en).not.toMatch(/BUY|SELL/);

    const wl = await app.inject({ method: "PUT", url: "/api/v1/watchlist", headers: h, payload: { symbols: ["xauusd", "NOPE", "BTCUSD"] } });
    expect(wl.json().symbols).toEqual(["XAUUSD", "BTCUSD"]);

    const tr = await app.inject({ method: "POST", url: "/api/v1/journal", headers: h, payload: { symbol: "XAUUSD", direction: "long", entry: 100, stopLoss: 99, exitPrice: 103, size: 1, openedAt: 1 } });
    expect(tr.json().trade.rMultiple).toBe(3);
    const j = await app.inject({ method: "GET", url: "/api/v1/journal", headers: h });
    expect(j.json().stats.winRate).toBe(1);

    const forbidden = await app.inject({ method: "GET", url: "/api/v1/admin/overview" });
    expect(forbidden.statusCode).toBe(401);
    const ok = await app.inject({ method: "GET", url: "/api/v1/admin/overview", headers: h });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().engine.scoring).toBe("scoring-v1");
  });
});
