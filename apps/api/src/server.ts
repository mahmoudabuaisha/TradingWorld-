// OPS-01: telemetry starts before fastify, pg or Prisma are loaded, so their instrumentation can hook them. Only
// config and the OpenTelemetry SDK are imported statically; the app comes in through a dynamic import below.
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { loadConfig } from "./config.js";
import { startTelemetry } from "./ops/telemetry.js";

const cfg = loadConfig();
const tracesTo = cfg.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? cfg.OTEL_EXPORTER_OTLP_ENDPOINT;
const tracing = !!tracesTo || cfg.OTEL_TRACES_CONSOLE;
// ESM modules are only patched through the import hook (CommonJS ones through require hooks)
if (tracing) register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
const tel = startTelemetry({
  serviceName: cfg.OTEL_SERVICE_NAME,
  serviceVersion: (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version,
  environment: cfg.NODE_ENV,
  otlpEndpoint: cfg.OTEL_EXPORTER_OTLP_ENDPOINT,
  otlpTracesEndpoint: cfg.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  otlpHeaders: cfg.OTEL_EXPORTER_OTLP_HEADERS,
  sampleRatio: cfg.OTEL_TRACES_SAMPLE_RATIO,
  consoleTraces: cfg.OTEL_TRACES_CONSOLE,
});
const { buildApp } = await import("./app.js");

const app = await buildApp({ config: cfg });
const { API_PORT, API_HOST } = app.ctx.config;
try {
  await app.listen({ port: API_PORT, host: API_HOST });
  const routes =
    Object.entries(app.ctx.providers.routes)
      .map(([c, p]) => `${c}=${p}`)
      .join(",") || "all=demo";
  app.log.info(`TradingWorld API ready on http://${API_HOST}:${API_PORT}/api/v1 (ws: /ws) — data routes: ${routes}`);
  for (const w of app.ctx.providers.warnings) app.log.warn(`market data: ${w}`);
  app.log.info(
    `telemetry: metrics at /metrics${cfg.METRICS_TOKEN ? " (bearer token)" : cfg.NODE_ENV === "production" ? " DISABLED (set METRICS_TOKEN)" : " (open, development)"}; traces ${tel.tracing ? `on${tel.otlp ? ` → ${tracesTo}` : " (console)"}` : "off (set OTEL_EXPORTER_OTLP_ENDPOINT)"}; watchdog ${cfg.OPS_WATCHDOG_ENABLED ? "on" : "off"}${cfg.OPS_ALERT_WEBHOOK_URL ? " + webhook" : ""}`,
  );
  app.log.info(`repositories: ${"client" in app.ctx.repos ? "postgres (prisma)" : "memory — nothing persists across restarts"}`);
  app.log.info(
    `candle store: ${app.ctx.store.kind}${app.ctx.config.BACKFILL_ENABLED ? ` — backfill job on (${app.ctx.config.BACKFILL_BASE_TIMEFRAME} × ${app.ctx.config.BACKFILL_BARS} bars, every ${app.ctx.config.BACKFILL_INTERVAL_MINUTES} min)` : " — backfill job off (BACKFILL_ENABLED=false)"}`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    app.close().then(
      () => tel.shutdown().finally(() => process.exit(0)),
      (e: unknown) => {
        app.log.error(e);
        process.exit(1);
      },
    );
  });
}
