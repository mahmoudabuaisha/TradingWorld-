import { buildApp } from "./app.js";

const app = await buildApp();
const { API_PORT, API_HOST } = app.ctx.config;
try {
  await app.listen({ port: API_PORT, host: API_HOST });
  const routes = Object.entries(app.ctx.providers.routes).map(([c, p]) => `${c}=${p}`).join(",") || "all=demo";
  app.log.info(`TradingWorld API ready on http://${API_HOST}:${API_PORT}/api/v1 (ws: /ws) — data routes: ${routes}`);
  for (const w of app.ctx.providers.warnings) app.log.warn(`market data: ${w}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => { app.ctx.providers.close(); await app.close(); process.exit(0); });
}
