import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { zoneTrackKey } from "@tradingworld/shared";

let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
const sentPush: { endpoint: string; payload: string }[] = [];
const sentEmail: { to: string; subject: string; text: string }[] = [];

beforeAll(async () => {
  app = await buildApp({
    config: loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", MARKET_DATA_PROVIDER: "demo" }),
    logger: false,
    senders: {
      push: async (sub, payload) => {
        sentPush.push({ endpoint: sub.endpoint, payload });
        return { ok: true };
      },
      email: async (m) => {
        sentEmail.push(m);
      },
    },
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
const ctxRepos = () => app.ctx.repos;

describe("api", () => {
  it("health", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it("register → first user is admin, login works, me requires token", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "a@b.co", password: "password123", displayName: "Trader" },
    });
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
    const plain = await app.inject({
      method: "GET",
      url: "/api/v1/analysis?symbol=XAUUSD&timeframe=5m&includeLowQuality=false&includeInvalidated=false",
    });
    expect(plain.statusCode).toBe(200);
    expect(plain.json().zones.every((z: { quality: string; status: string }) => z.quality !== "LOW" && z.status !== "INVALIDATED")).toBe(
      true,
    );
    const full = await app.inject({
      method: "GET",
      url: "/api/v1/analysis?symbol=XAUUSD&timeframe=5m&includeLowQuality=true&includeInvalidated=true",
    });
    expect(full.json().zones.length).toBeGreaterThanOrEqual(plain.json().zones.length);
  });

  it("feeds: every instrument reports its source and state; candles carry the feed", async () => {
    const f = await app.inject({ method: "GET", url: "/api/v1/feeds" });
    expect(f.statusCode).toBe(200);
    const body = f.json();
    expect(body.feeds.length).toBe(10);
    expect(body.feeds.every((x: { provider: string; state: string }) => x.provider === "demo" && x.state === "LIVE")).toBe(true);
    expect(body.providers[0]).toMatchObject({ id: "demo", transport: "synthetic", licensed: false });
    const c = await app.inject({ method: "GET", url: "/api/v1/candles?symbol=EURUSD&timeframe=15m&limit=60" });
    expect(c.json().feed).toMatchObject({ symbol: "EURUSD", provider: "demo", state: "LIVE" });
    const h = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(h.json().routes).toEqual({});
  });

  it("outcome tracker: analysis registers zones; research excludes demo data by default", async () => {
    await app.inject({ method: "GET", url: "/api/v1/analysis?symbol=EURUSD&timeframe=15m&includeLowQuality=true" });
    const h = { authorization: `Bearer ${token}` };
    const withDemo = (await app.inject({ method: "GET", url: "/api/v1/admin/outcomes?includeDemo=1", headers: h })).json();
    expect(withDemo.stats.open).toBeGreaterThan(0);
    expect(withDemo.stats.outcomeVersion).toBe("outcome-v1");
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/outcomes", headers: h })).json().stats.open).toBe(0);
    const run = await app.inject({ method: "POST", url: "/api/v1/admin/outcomes/run", headers: h });
    expect(run.json().run.checked).toBeGreaterThan(0);
    const ds = (await app.inject({ method: "GET", url: "/api/v1/admin/research/dataset", headers: h })).json();
    expect(ds).toMatchObject({ engine_version: expect.any(String), scoring_version: "scoring-v1", n_folds: 5, samples: [] });
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/outcomes" })).statusCode).toBe(401);
  });

  it("zone feedback: own vote only, validated against the zone, separate from outcomes", async () => {
    const a = (await app.inject({ method: "GET", url: "/api/v1/analysis?symbol=XAUUSD&timeframe=15m&includeLowQuality=true" })).json();
    const zone = a.zones.find((z: { status: string }) => z.status !== "INVALIDATED");
    expect(zone).toBeTruthy();
    const key = encodeURIComponent(zoneTrackKey(a, zone));
    const present = zone.factors.find((f: { present: boolean }) => f.present).key;
    const absent = zone.factors.find((f: { present: boolean }) => !f.present)?.key;
    const h = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: "PUT", url: `/api/v1/zones/${key}/feedback`, payload: { useful: true } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: `/api/v1/zones/${key}/feedback`, headers: h })).json()).toEqual({
      tracked: true,
      feedback: null,
    });
    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/zones/${key}/feedback`,
      headers: h,
      payload: { useful: true, bestFactor: present, comment: "  منطقة\nواضحة  " },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().feedback).toMatchObject({ useful: true, bestFactor: present, comment: "منطقة واضحة" });
    if (absent)
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/api/v1/zones/${key}/feedback`,
            headers: h,
            payload: { useful: true, bestFactor: absent },
          })
        ).json().error,
      ).toBe("FACTOR_NOT_PRESENT");
    expect(
      (await app.inject({ method: "PUT", url: `/api/v1/zones/${key}/feedback`, headers: h, payload: { useful: "yes" } })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/v1/zones/${encodeURIComponent("XAUUSD:15m:FVG:bullish:1:x:y")}/feedback`,
          headers: h,
          payload: { useful: true },
        })
      ).json().error,
    ).toBe("ZONE_NOT_TRACKED");
    // a second user sees only their own (empty) vote
    const other = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "fb-other@b.co", password: "password123", displayName: "Other" },
    });
    const h2 = { authorization: `Bearer ${other.json().token}` };
    expect((await app.inject({ method: "GET", url: `/api/v1/zones/${key}/feedback`, headers: h2 })).json().feedback).toBeNull();
    await app.inject({ method: "PUT", url: `/api/v1/zones/${key}/feedback`, headers: h2, payload: { useful: false } });
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/feedback", headers: h2 })).statusCode).toBe(403);
    const stats = (await app.inject({ method: "GET", url: "/api/v1/admin/feedback?includeDemo=1", headers: h })).json();
    expect(stats).toMatchObject({ total: 2, zones: 1, overall: { n: 2, useful: 1, usefulRate: 0.5 }, bestFactor: { [present]: 1 } });
    expect(stats.recentComments[0]).toMatchObject({ comment: "منطقة واضحة", useful: true });
    expect(stats.recentComments[0].userId).toBeUndefined();
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/feedback", headers: h })).json().total).toBe(0); // demo excluded by default
    expect((await app.inject({ method: "DELETE", url: `/api/v1/zones/${key}/feedback`, headers: h })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/zones/${key}/feedback`, headers: h })).statusCode).toBe(404);
  });

  it("drawings: create, list per symbol, move, validate, owner-only, limit, clear", async () => {
    const h = { authorization: `Bearer ${token}` };
    const T = 1_792_400_000;
    expect((await app.inject({ method: "GET", url: "/api/v1/drawings?symbol=XAUUSD" })).statusCode).toBe(401);
    const fib = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: h,
      payload: {
        symbol: "xauusd",
        kind: "fib",
        points: [
          { time: T, price: 2400 },
          { time: T + 3600, price: 2450 },
        ],
      },
    });
    expect(fib.statusCode).toBe(200);
    expect(fib.json().drawing).toMatchObject({ symbol: "XAUUSD", kind: "fib" });
    const id = fib.json().drawing.id;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/drawings",
          headers: h,
          payload: {
            symbol: "XAUUSD",
            kind: "hline",
            points: [
              { time: T, price: 1 },
              { time: T, price: 2 },
            ],
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/drawings",
          headers: h,
          payload: { symbol: "NOPE1", kind: "hline", points: [{ time: T, price: 1 }] },
        })
      ).json().error,
    ).toBe("UNKNOWN_INSTRUMENT");
    expect((await app.inject({ method: "GET", url: "/api/v1/drawings?symbol=XAUUSD", headers: h })).json().drawings.length).toBe(1);
    expect((await app.inject({ method: "GET", url: "/api/v1/drawings?symbol=EURUSD", headers: h })).json().drawings).toEqual([]);
    // move: point count must match the stored kind
    expect(
      (await app.inject({ method: "PATCH", url: `/api/v1/drawings/${id}`, headers: h, payload: { points: [{ time: T, price: 2401 }] } }))
        .statusCode,
    ).toBe(400);
    const moved = await app.inject({
      method: "PATCH",
      url: `/api/v1/drawings/${id}`,
      headers: h,
      payload: {
        points: [
          { time: T + 300, price: 2401 },
          { time: T + 3900, price: 2455 },
        ],
      },
    });
    expect(moved.json().drawing.points[0]).toEqual({ time: T + 300, price: 2401 });
    // another user cannot see, move or delete it
    const other = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "draw-other@b.co", password: "password123", displayName: "Other" },
    });
    const h2 = { authorization: `Bearer ${other.json().token}` };
    expect((await app.inject({ method: "GET", url: "/api/v1/drawings?symbol=XAUUSD", headers: h2 })).json().drawings).toEqual([]);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/drawings/${id}`,
          headers: h2,
          payload: {
            points: [
              { time: T, price: 1 },
              { time: T, price: 2 },
            ],
          },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/drawings/${id}`, headers: h2 })).statusCode).toBe(404);
    // per-symbol limit
    for (let i = 0; i < 199; i++)
      await ctxRepos().drawings.create(other.json().user.id, {
        symbol: "EURUSD",
        kind: "hline",
        points: [{ time: T, price: 1 + i / 1000 }],
      });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/drawings",
          headers: h2,
          payload: { symbol: "EURUSD", kind: "hline", points: [{ time: T, price: 2 }] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/drawings",
          headers: h2,
          payload: { symbol: "EURUSD", kind: "hline", points: [{ time: T, price: 2 }] },
        })
      ).json().error,
    ).toBe("TOO_MANY_DRAWINGS");
    expect((await app.inject({ method: "DELETE", url: "/api/v1/drawings?symbol=EURUSD", headers: h2 })).json()).toEqual({ removed: 200 });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/drawings/${id}`, headers: h })).json()).toEqual({ ok: true });
  });

  it("body-less DELETE requests succeed the way browsers send them (regression: content-type without a body was a 400)", async () => {
    const h = { authorization: `Bearer ${token}` };
    const al = (
      await app.inject({
        method: "POST",
        url: "/api/v1/alerts",
        headers: h,
        payload: { symbol: "XAUUSD", kind: "price_above", price: 9999 },
      })
    ).json().alert;
    // what the web client used to send: JSON content-type, no body
    expect(
      (await app.inject({ method: "DELETE", url: `/api/v1/alerts/${al.id}`, headers: { ...h, "content-type": "application/json" } }))
        .statusCode,
    ).toBe(400);
    // what it sends now
    expect((await app.inject({ method: "DELETE", url: `/api/v1/alerts/${al.id}`, headers: h })).json()).toEqual({ ok: true });
  });

  it("notifications: alert fires from the watcher, lands in the inbox, goes out on enabled channels", async () => {
    const h = { authorization: `Bearer ${token}` };
    const settings = (await app.inject({ method: "GET", url: "/api/v1/notifications/settings", headers: h })).json();
    expect(settings).toMatchObject({
      prefs: { push: true, email: false },
      push: { configured: true, subscriptions: 0 },
      email: { configured: true, address: "a@b.co" },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/push/subscriptions",
          headers: h,
          payload: { endpoint: "http://insecure.example/x", keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/push/subscriptions",
          headers: h,
          payload: { endpoint: "https://push.example.test/me", keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } },
        })
      ).json(),
    ).toEqual({ ok: true, subscriptions: 1 });
    expect(
      (await app.inject({ method: "PUT", url: "/api/v1/notifications/settings", headers: h, payload: { email: true } })).json().prefs,
    ).toEqual({ push: true, email: true });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/alerts",
          headers: h,
          payload: { symbol: "XAUUSD", kind: "zone_enter", zoneId: "k" },
        })
      ).json().error,
    ).toBe("VALIDATION");
    for (const price of [-50, 0])
      expect(
        (
          await app.inject({ method: "POST", url: "/api/v1/alerts", headers: h, payload: { symbol: "XAUUSD", kind: "price_above", price } })
        ).json().error,
      ).toBe("VALIDATION");
    const al = (
      await app.inject({ method: "POST", url: "/api/v1/alerts", headers: h, payload: { symbol: "XAUUSD", kind: "price_above", price: 1 } })
    ).json().alert;
    expect(await app.ctx.alerts.watchOnce()).toBe(1);
    await new Promise((r) => setTimeout(r, 50)); // notify() runs after the trigger
    const inbox = (await app.inject({ method: "GET", url: "/api/v1/notifications", headers: h })).json();
    expect(inbox.unread).toBe(1);
    expect(inbox.notifications[0]).toMatchObject({
      kind: "alert",
      alertId: al.id,
      url: "/chart?symbol=XAUUSD",
      deliveries: [
        { channel: "push", status: "sent" },
        { channel: "email", status: "sent" },
      ],
    });
    expect(inbox.notifications[0].userId).toBeUndefined();
    expect(JSON.parse(sentPush.at(-1)!.payload).url).toBe("/chart?symbol=XAUUSD");
    expect(sentEmail.at(-1)!.to).toBe("a@b.co");
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/alerts", headers: h })).json().alerts.find((a: { id: string }) => a.id === al.id)
        .active,
    ).toBe(false);
    expect((await app.inject({ method: "POST", url: "/api/v1/notifications/read", headers: h, payload: {} })).json().marked).toBe(1);
    const test = (await app.inject({ method: "POST", url: "/api/v1/notifications/test", headers: h })).json().notification;
    expect(test).toMatchObject({
      kind: "test",
      deliveries: [
        { channel: "push", status: "sent" },
        { channel: "email", status: "sent" },
      ],
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/push/unsubscribe",
          headers: h,
          payload: { endpoint: "https://push.example.test/me" },
        })
      ).json(),
    ).toEqual({ removed: true });
    expect((await app.inject({ method: "GET", url: "/api/v1/notifications" })).statusCode).toBe(401);
  });

  it("alerts over the WebSocket reach only their owner", async () => {
    const other = (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "ws-other@b.co", password: "password123", displayName: "Other" },
      })
    ).json();
    // a real port and real WebSocket clients (injectWS has no socket address, which trustProxy needs)
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const url = address.replace(/^http/, "ws") + "/ws";
    const collect = async (tok?: string) => {
      const ws = new WebSocket(url);
      const got: { type: string }[] = [];
      ws.onmessage = (ev) => got.push(JSON.parse(String(ev.data)));
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("ws error"));
      });
      ws.send(JSON.stringify({ type: "subscribe", symbol: "EURUSD", timeframe: "15m", token: tok }));
      return { ws, got };
    };
    const mine = await collect(token),
      theirs = await collect(other.token),
      anon = await collect();
    await new Promise((r) => setTimeout(r, 300));
    const h = { authorization: `Bearer ${token}` };
    await app.inject({ method: "POST", url: "/api/v1/alerts", headers: h, payload: { symbol: "EURUSD", kind: "price_above", price: 0.5 } });
    await app.ctx.alerts.evaluate("EURUSD", 1.1);
    await new Promise((r) => setTimeout(r, 200));
    const kinds = (g: { type: string }[]) => g.map((m) => m.type).filter((t) => t === "alert" || t === "notification");
    expect(kinds(mine.got).sort()).toEqual(["alert", "notification"]);
    expect(kinds(theirs.got)).toEqual([]);
    expect(kinds(anon.got)).toEqual([]);
    for (const c of [mine, theirs, anon]) c.ws.close();
  });

  it("ai chat answers deterministically without a key", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      payload: { symbol: "XAUUSD", timeframe: "5m", question: "ماذا يحدث على الفريمات الأعلى؟", locale: "ar" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().provider).toBe("deterministic");
    expect(r.json().grounded).toBe(true);
  });

  it("alerts, watchlist, journal CRUD with R calculation", async () => {
    const h = { authorization: `Bearer ${token}` };
    const al = await app.inject({
      method: "POST",
      url: "/api/v1/alerts",
      headers: h,
      payload: { symbol: "XAUUSD", kind: "price_above", price: 1 },
    });
    expect(al.statusCode).toBe(200);
    const fired = await app.ctx.alerts.evaluate("XAUUSD", 2);
    expect(fired.length).toBe(1);
    expect(fired[0]!.message.en).not.toMatch(/BUY|SELL/);

    const wl = await app.inject({
      method: "PUT",
      url: "/api/v1/watchlist",
      headers: h,
      payload: { symbols: ["xauusd", "NOPE", "BTCUSD"] },
    });
    expect(wl.json().symbols).toEqual(["XAUUSD", "BTCUSD"]);

    const tr = await app.inject({
      method: "POST",
      url: "/api/v1/journal",
      headers: h,
      payload: { symbol: "XAUUSD", direction: "long", entry: 100, stopLoss: 99, exitPrice: 103, size: 1, openedAt: 1 },
    });
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
