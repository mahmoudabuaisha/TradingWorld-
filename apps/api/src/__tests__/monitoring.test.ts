import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { trace } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { writeStatus } from "../ops/backup.js";
import { startTelemetry } from "../ops/telemetry.js";

// OPS-01b — production monitoring: traces to Jaeger (which has no OTLP metrics receiver), dashboards linked for admins.
// Its own worker: the telemetry below is global to the process.
const received: string[] = [];
let collector: Server;
let url = "";

beforeAll(async () => {
  collector = createServer((req, res) => {
    received.push(`${req.method} ${req.url}`);
    req.resume();
    req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end("{}"));
  });
  await new Promise<void>((r) => collector.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => collector.close(() => r())));

describe("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", () => {
  it("exports traces to that exact URL and pushes no metrics (Prometheus scrapes them)", async () => {
    const tel = startTelemetry({ serviceName: "tw-test", otlpTracesEndpoint: `${url}/collector/v1/traces` });
    expect(tel).toMatchObject({ tracing: true, otlp: true });
    trace.getTracer("t").startActiveSpan("GET /api/v1/health", (s) => s.end());
    await tel.shutdown(); // flushes the batch
    expect(received).toContain("POST /collector/v1/traces");
    expect(received.some((r) => r.includes("/v1/metrics"))).toBe(false);
  });

  it("is a URL", () => {
    const base = { NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123456" };
    expect(() => loadConfig({ ...base, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "jaeger 4318" })).toThrow();
    expect(loadConfig({ ...base, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://jaeger:4318/v1/traces" })).toMatchObject({
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://jaeger:4318/v1/traces",
    });
  });
});

describe("MONITORING_URL", () => {
  it("is linked from /admin/ops, and absent when unset", async () => {
    const base = {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-test-secret-123456",
      MARKET_DATA_PROVIDER: "demo",
      OPS_WATCHDOG_ENABLED: "false",
    };
    for (const [env, expected] of [
      [{ MONITORING_URL: "https://trading.example.test/grafana/" }, "https://trading.example.test/grafana/"],
      [{}, null],
    ] as const) {
      const app = await buildApp({ config: loadConfig({ ...base, ...env }), logger: false });
      const reg = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "ops@example.test", password: "kharita-2026", displayName: "Ops" },
      });
      const ops = await app.inject({
        method: "GET",
        url: "/api/v1/admin/ops",
        headers: { authorization: `Bearer ${reg.json().token as string}` },
      });
      expect(ops.json().telemetry.dashboardUrl).toBe(expected);
      await app.close();
    }
  });
});

describe("disk rule", () => {
  it("fires above OPS_DISK_RATIO and reports what is left", async () => {
    const base = {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-test-secret-123456",
      MARKET_DATA_PROVIDER: "demo",
      OPS_WATCHDOG_ENABLED: "false",
    };
    const states: Record<string, string> = {};
    for (const ratio of ["0.01", "1"]) {
      const app = await buildApp({ config: loadConfig({ ...base, OPS_DISK_RATIO: ratio }), logger: false });
      const reg = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "ops@example.test", password: "kharita-2026", displayName: "Ops" },
      });
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/admin/ops/evaluate",
        headers: { authorization: `Bearer ${reg.json().token as string}` },
      });
      const disk = (r.json().alerts as { id: string; state: string; severity: string; summary: { en: string } }[]).find(
        (a) => a.id === "disk",
      )!;
      expect(disk.severity).toBe("critical");
      expect(disk.summary.en).toMatch(/^disk \d+\.\d% full, \d+\.\d GB free \(limit \d+\.\d%\)$/);
      states[ratio] = disk.state;
      await app.close();
    }
    expect(states).toEqual({ "0.01": "firing", "1": "ok" });
  });
});

describe("backup_offsite rule (OPS-02b)", () => {
  it("warns in production while the last backup has no offsite copy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tw-offsite-"));
    const app = await buildApp({
      config: loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "test-secret-test-secret-123456",
        DATABASE_URL: "postgresql://tw@db.internal:5432/tradingworld",
        REPOSITORIES: "memory",
        CANDLE_STORE: "memory",
        MARKET_DATA_PROVIDER: "demo",
        BACKUP_DIR: dir,
        FIRST_USER_ADMIN: "true",
        OPS_WATCHDOG_ENABLED: "false",
        ALERT_WATCH_ENABLED: "false",
        OUTCOME_ENABLED: "false",
      }),
      logger: false,
    });
    try {
      const reg = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "ops@example.test", password: "kharita-2026", displayName: "Ops" },
      });
      const evaluate = async () =>
        (
          (
            await app.inject({
              method: "POST",
              url: "/api/v1/admin/ops/evaluate",
              headers: { authorization: `Bearer ${reg.json().token as string}` },
            })
          ).json().alerts as { id: string; state: string; severity: string; summary: { en: string } }[]
        ).find((a) => a.id === "backup_offsite")!;
      const at = new Date().toISOString();
      const before = await evaluate(); // no backup yet
      expect(before).toMatchObject({ state: "firing", severity: "warning" });
      expect(before.summary.en).toMatch(/^the last backup has no offsite copy/);
      await writeStatus(dir, { lastBackup: { file: "tw-1.dump.age", at, bytes: 9, encrypted: true, durationMs: 1 } });
      expect((await evaluate()).state).toBe("firing"); // local only
      await writeStatus(dir, { lastBackup: { file: "tw-2.dump.age", at, bytes: 9, encrypted: true, remote: "r2:tw/db", durationMs: 1 } });
      expect(await evaluate()).toMatchObject({ state: "ok", summary: { en: "last backup copied to r2:tw/db" } });
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
