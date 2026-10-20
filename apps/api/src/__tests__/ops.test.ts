import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { RequestWindow } from "../ops/metrics.js";
import { startTelemetry, traced } from "../ops/telemetry.js";
import { Watchdog, type Rule, type Transition } from "../ops/watchdog.js";

// this file runs in its own worker: tracing on, spans kept in memory
const spans = new InMemorySpanExporter();
startTelemetry({ serviceName: "tw-test", spanProcessors: [new SimpleSpanProcessor(spans)] });

const base = { NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456", MARKET_DATA_PROVIDER: "demo" } as const;
const register = (app: Awaited<ReturnType<typeof buildApp>>, email: string) =>
  app
    .inject({ method: "POST", url: "/api/v1/auth/register", payload: { email, password: "kharita-2026", displayName: "Survey Ops" } })
    .then((r) => ({ authorization: `Bearer ${r.json().token as string}` }));

describe("RequestWindow", () => {
  it("reports volume, 5xx ratio and p95 over the last minutes and forgets older ones", () => {
    const w = new RequestWindow(15);
    const t0 = Date.UTC(2026, 9, 20, 12, 0, 30);
    for (let i = 0; i < 95; i++) w.record(200, 10 + i, t0);
    for (let i = 0; i < 5; i++) w.record(503, 1000, t0);
    const s = w.summary(5, t0);
    expect(s).toMatchObject({ requests: 100, errors: 5, errorRatio: 0.05, perMinute: 20 });
    expect(s.p95Ms).toBe(104); // the 95th of 100 sorted samples: 10..104, then five 1000s
    expect(w.summary(5, t0 + 6 * 60_000).requests).toBe(0);
  });
});

describe("Watchdog", () => {
  it("goes pending → firing after `for`, repeats, resolves, and keeps its state when a rule throws", async () => {
    let now = 0;
    let firing = false;
    let broken = false;
    const rule: Rule = {
      id: "r",
      severity: "critical",
      title: { ar: "ق", en: "rule" },
      forSeconds: 120,
      evaluate: () => {
        if (broken) throw new Error("no data");
        return { firing, summary: { ar: "س", en: firing ? "bad" : "fine" } };
      },
    };
    const got: Transition[] = [];
    const w = new Watchdog([rule], async (t) => void got.push(t), { now: () => now, repeatMs: 3_600_000 });
    const step = async (ms: number) => {
      now += ms;
      await w.evaluate();
    };

    firing = true;
    await step(0);
    expect(w.state()[0]).toMatchObject({ state: "pending" });
    await step(60_000);
    expect(got).toEqual([]);
    await step(60_000);
    expect(w.state()[0]).toMatchObject({ state: "firing" });
    expect(got.map((t) => t.kind)).toEqual(["firing"]);
    broken = true;
    await step(60_000);
    expect(w.state()[0]).toMatchObject({ state: "firing", error: "no data" });
    broken = false;
    await step(3_600_000);
    expect(got.map((t) => t.kind)).toEqual(["firing", "repeat"]);
    firing = false;
    await step(60_000);
    expect(w.state()[0]).toMatchObject({ state: "ok" });
    expect(got.map((t) => [t.kind, t.summary.en])).toEqual([
      ["firing", "bad"],
      ["repeat", "bad"],
      ["resolved", "fine"],
    ]);
    // a flap shorter than `for` never notifies
    firing = true;
    await step(60_000);
    firing = false;
    await step(60_000);
    expect(got).toHaveLength(3);
  });
});

describe("ops on a real app", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const hooks: { url: string; body: Record<string, unknown> }[] = [];
  const lines: Record<string, unknown>[] = [];
  let admin: { authorization: string }, user: { authorization: string };

  beforeAll(async () => {
    app = await buildApp({
      config: loadConfig({ ...base, OPS_ALERT_WEBHOOK_URL: "https://hooks.example.test/ops" }),
      logStream: { write: (l) => void lines.push(JSON.parse(l) as Record<string, unknown>) },
      fetch: (async (url: string, init: RequestInit) => {
        hooks.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    admin = await register(app, "ops@tw.test");
    user = await register(app, "user@tw.test");
  });
  afterAll(() => app.close());

  it("echoes a well-formed X-Request-Id and replaces a malformed one", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/v1/health", headers: { "x-request-id": "edge-7f3a2c19" } });
    expect(ok.headers["x-request-id"]).toBe("edge-7f3a2c19");
    const bad = await app.inject({ method: "GET", url: "/api/v1/health", headers: { "x-request-id": "x\nforged log line" } });
    expect(bad.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs JSON with secrets redacted and the trace id of the active span", async () => {
    app.log.info({ login: { email: "a@b.c", password: "hunter2", token: "eyJ…" } }, "credentials check");
    const line = lines.find((l) => l.msg === "credentials check")!;
    expect(line.login).toEqual({ email: "a@b.c", password: "[redacted]", token: "[redacted]" });
    await trace.getTracer("t").startActiveSpan("traced work", async (span) => {
      app.log.info("inside a span");
      span.end();
      const l = lines.find((x) => x.msg === "inside a span")!;
      expect(l.trace_id).toBe(span.spanContext().traceId);
      expect(l.span_id).toBe(span.spanContext().spanId);
    });
  });

  it("exposes per-route request metrics at /metrics (open in development)", async () => {
    await app.inject({ method: "GET", url: "/api/v1/candles?symbol=XAUUSD&timeframe=5m&limit=50" });
    await app.inject({ method: "GET", url: "/wp-admin/../../etc/passwd" });
    const m = await app.inject({ method: "GET", url: "/metrics" });
    expect(m.statusCode).toBe(200);
    expect(m.headers["content-type"]).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(m.body).toMatch(
      /http_server_request_duration_count\{http_request_method="GET",http_route="\/api\/v1\/candles",http_response_status_code="200"/,
    );
    expect(m.body).toMatch(/http_route="unmatched",http_response_status_code="404"/); // scanners collapse into one series
    expect(m.body).not.toMatch(/passwd/);
    expect(m.body).toMatch(/^tw_feed_up\{symbol="XAUUSD",provider="demo",licensed="false"/m);
    expect(m.body).toMatch(/^v8js_memory_heap_used/m); // runtime metrics
  });

  it("evaluates the platform rules: 5xx ratio, demo feeds ignored, a stalled alert watcher", async () => {
    const now = Date.now();
    const before = app.ctx.ops.window.summary(5, now); // the earlier tests' requests are in the window too
    for (let i = 0; i < 25; i++) app.ctx.ops.window.record(i < 5 ? 500 : 200, 20, now);
    const n = before.requests + 25;
    app.ctx.alerts.stats.lastPollAt = now - 10 * 60_000; // the watcher last polled 10 minutes ago
    const ratio = `${(((before.errors + 5) / n) * 100).toFixed(1)}% of ${n} requests`;
    const r = await app.inject({ method: "POST", url: "/api/v1/admin/ops/evaluate", headers: admin });
    const byId = Object.fromEntries(
      (r.json().alerts as { id: string; state: string; severity: string; summary: { en: string } }[]).map((a) => [a.id, a]),
    );
    expect(byId.api_errors).toMatchObject({ state: "firing", severity: "critical" });
    expect(byId.api_errors!.summary.en.startsWith(ratio)).toBe(true);
    expect(byId.feed_down).toMatchObject({ state: "ok" }); // demo never "goes down"
    expect(byId.alert_watcher).toMatchObject({ state: "firing", severity: "critical" });
    expect(byId.alert_watcher!.summary.en).toMatch(/user alerts are not firing$/);
    expect(byId.backups).toBeUndefined(); // production-only rules
    // admins got it in their inbox, plain users did not; the webhook got Slack/Discord-compatible JSON
    const inbox = (await app.inject({ method: "GET", url: "/api/v1/notifications", headers: admin })).json().notifications as {
      kind: string;
      title: { en: string };
    }[];
    expect(inbox.some((n) => n.kind === "ops" && n.title.en === "ALERT (critical): API is failing requests")).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/v1/notifications", headers: user })).json().notifications).toEqual([]);
    const hook = hooks.find((h) => (h.body.alert as { id: string }).id === "api_errors")!;
    expect(hook.url).toBe("https://hooks.example.test/ops");
    expect(hook.body.text).toBe(hook.body.content);
    expect(hook.body.text).toBe(`[TradingWorld] ALERT (critical): API is failing requests — ${byId.api_errors!.summary.en}`);
  });

  it("tells admins when a rule recovers, without the firing wording", async () => {
    app.ctx.alerts.stats.lastPollAt = Date.now();
    await app.inject({ method: "POST", url: "/api/v1/admin/ops/evaluate", headers: admin });
    const resolved = app.ctx.ops.watchdog.history.find((t) => t.id === "alert_watcher" && t.kind === "resolved")!;
    expect(resolved.summary.en).toMatch(/^last alert poll 0 s ago \(expected every 15 s\)$/);
    expect(hooks.at(-1)!.body.text).toMatch(/^\[TradingWorld\] RESOLVED \(critical\): Alert watcher stalled — last alert poll 0 s ago/);
  });

  it("serves /admin/ops to admins only and sends a test alert through every channel", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/ops", headers: user })).statusCode).toBe(403);
    const ops = (await app.inject({ method: "GET", url: "/api/v1/admin/ops", headers: admin })).json();
    expect(ops.telemetry).toMatchObject({ tracing: true, metrics: "open" });
    expect(ops.watchdog).toMatchObject({ webhook: true });
    expect(ops.signals.requests.requests).toBeGreaterThan(0);
    expect((ops.history as { kind: string }[]).map((h) => h.kind)).toEqual(expect.arrayContaining(["firing", "resolved"]));
    const before = hooks.length;
    const t = await app.inject({ method: "POST", url: "/api/v1/admin/ops/test", headers: admin });
    expect(t.json()).toEqual({ ok: true, webhook: true });
    expect((hooks[before]!.body.alert as { id: string }).id).toBe("test");
  });
});

describe("/metrics in production", () => {
  it("is off without METRICS_TOKEN and requires the bearer token with it", async () => {
    const prod = { ...base, NODE_ENV: "production", OPS_WATCHDOG_ENABLED: "false", ALERT_WATCH_ENABLED: "false", OUTCOME_ENABLED: "false" };
    const off = await buildApp({ config: loadConfig(prod), logger: false });
    expect((await off.inject({ method: "GET", url: "/metrics" })).json()).toMatchObject({ error: "METRICS_DISABLED" });
    await off.close();
    const on = await buildApp({ config: loadConfig({ ...prod, METRICS_TOKEN: "scrape-token-0123456789" }), logger: false });
    expect((await on.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(401);
    expect(
      (await on.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer scrape-token-0123456788" } })).statusCode,
    ).toBe(401);
    expect(
      (await on.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer scrape-token-0123456789" } })).statusCode,
    ).toBe(200);
    await on.close();
  });
});

describe("traces", () => {
  it("wraps job runs in a root span and records failures", async () => {
    spans.reset();
    await traced("job ok", async () => 1);
    await expect(traced("job broken", () => Promise.reject(new Error("provider 503")))).rejects.toThrow("provider 503");
    const [ok, broken] = spans.getFinishedSpans();
    expect(ok!.name).toBe("job ok");
    expect(broken!.name).toBe("job broken");
    expect(broken!.status).toMatchObject({ code: 2, message: "provider 503" });
    expect(broken!.events[0]!.name).toBe("exception");
  });

  it("drops parentless Prisma spans but keeps them inside a request or job", async () => {
    spans.reset();
    trace.getTracer("prisma").startSpan("prisma:client:connect").end();
    await traced("job with db", async () => trace.getTracer("prisma").startSpan("prisma:client:operation").end());
    expect(spans.getFinishedSpans().map((s) => s.name)).toEqual(["prisma:client:operation", "job with db"]);
  });
});
