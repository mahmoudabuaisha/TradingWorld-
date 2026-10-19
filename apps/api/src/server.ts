import { buildApp } from "./app.js";

const app = await buildApp();
const { API_PORT, API_HOST } = app.ctx.config;
try {
  await app.listen({ port: API_PORT, host: API_HOST });
  const routes = Object.entries(app.ctx.providers.routes).map(([c, p]) => `${c}=${p}`).join(",") || "all=demo";
  app.log.info(`TradingWorld API ready on http://${API_HOST}:${API_PORT}/api/v1 (ws: /ws) — data routes: ${routes}`);
  for (const w of app.ctx.providers.warnings) app.log.warn(`market data: ${w}`);
  app.log.info(`candle store: ${app.ctx.store.kind}${app.ctx.config.BACKFILL_ENABLED ? ` — backfill job on (${app.ctx.config.BACKFILL_BASE_TIMEFRAME} × ${app.ctx.config.BACKFILL_BARS} bars, every ${app.ctx.config.BACKFILL_INTERVAL_MINUTES} min)` : " — backfill job off (BACKFILL_ENABLED=false)"}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => { await app.close(); process.exit(0); });
}
