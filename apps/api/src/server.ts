import { buildApp } from "./app.js";

const app = await buildApp();
const { API_PORT, API_HOST } = app.ctx.config;
try {
  await app.listen({ port: API_PORT, host: API_HOST });
  app.log.info(`TradingWorld API ready on http://${API_HOST}:${API_PORT}/api/v1 (ws: /ws) — provider: ${app.ctx.providers.all()[0]?.id}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => { await app.close(); process.exit(0); });
}
