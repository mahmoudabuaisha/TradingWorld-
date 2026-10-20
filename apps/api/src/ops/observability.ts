/**
 * OPS-01 — what app.ts plugs in: structured logs, request ids, per-route HTTP metrics, span names, /metrics.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import { isSpanContextValid, trace } from "@opentelemetry/api";
import type { FastifyInstance, FastifyServerOptions, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { instruments, type RequestWindow } from "./metrics.js";
import type { Telemetry } from "./telemetry.js";

/** pino destination for tests */
export interface LogStream {
  write(line: string): void;
}

/**
 * JSON logs: level from LOG_LEVEL, secrets redacted wherever they appear, trace/span ids on every line written inside a
 * traced request so a log line leads to its trace.
 */
export function loggerOptions(cfg: Config, stream?: LogStream): FastifyServerOptions["logger"] {
  return {
    level: cfg.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "*.password",
        "*.token",
        "*.apiKey",
        "*.secret",
        "*.authorization",
        "*.smtpUrl",
        "*.databaseUrl",
      ],
      censor: "[redacted]",
    },
    mixin() {
      const s = trace.getActiveSpan()?.spanContext();
      return s && isSpanContextValid(s) ? { trace_id: s.traceId, span_id: s.spanId } : {};
    },
    ...(stream ? { stream } : {}),
  };
}

const REQ_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Uses a well-formed incoming X-Request-Id (from a proxy or the client), otherwise a new UUID. */
export function genReqId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers["x-request-id"];
  return typeof h === "string" && REQ_ID.test(h) ? h : randomUUID();
}

const routeOf = (req: FastifyRequest) => req.routeOptions.url ?? "unmatched";

export function registerHttpObservability(app: FastifyInstance, cfg: Config, tel: Telemetry, window: RequestWindow) {
  const { httpDuration } = instruments(tel.meter);
  const started = new WeakMap<FastifyRequest, number>();

  app.addHook("onRequest", async (req, reply) => {
    started.set(req, performance.now());
    reply.header("x-request-id", req.id);
    // the HTTP instrumentation names server spans "GET"; the route makes them readable and groupable
    const span = trace.getActiveSpan();
    if (span) {
      const route = routeOf(req);
      span.updateName(`${req.method} ${route}`);
      span.setAttribute("http.route", route);
      span.setAttribute("tw.request_id", req.id);
    }
  });

  app.addHook("onResponse", async (req, reply) => {
    const t0 = started.get(req);
    if (t0 === undefined) return;
    const ms = performance.now() - t0;
    const route = routeOf(req);
    // unmatched URLs collapse into one series: scanners must not create unbounded label values
    httpDuration.record(ms / 1000, {
      "http.request.method": req.method,
      "http.route": route,
      "http.response.status_code": reply.statusCode,
    });
    if (route !== "/metrics" && !route.endsWith("/health")) window.record(reply.statusCode, ms);
  });

  // Prometheus scrape target. Production requires METRICS_TOKEN (Authorization: Bearer …); development is open.
  app.get("/metrics", { config: { rateLimit: false } }, async (req, reply) => {
    const token = cfg.METRICS_TOKEN;
    if (!token && cfg.NODE_ENV === "production")
      return reply.code(404).send({ error: "METRICS_DISABLED", message: "set METRICS_TOKEN to expose /metrics in production" });
    if (token) {
      const got = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
      const want = Buffer.from(token);
      if (got.length !== want.length || !timingSafeEqual(got, want))
        return reply.code(401).header("www-authenticate", "Bearer").send({ error: "UNAUTHORIZED" });
    }
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return tel.prometheus();
  });
}
