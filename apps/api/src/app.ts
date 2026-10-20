import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, type Config } from "./config.js";
import { createMemoryRepositories, type Repositories } from "./repositories/memory.js";
import { ProviderRegistry } from "./providers/registry.js";
import { AnalysisService } from "./services/analysis.js";
import { AiService } from "./services/ai.js";
import { AlertService } from "./services/alerts.js";
import { BackfillService } from "./services/backfill.js";
import { OutcomeService, parseScan } from "./services/outcomes.js";
import { createCandleStore } from "./store/index.js";
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import marketRoutes from "./routes/market.js";
import userRoutes from "./routes/user.js";
import adminRoutes from "./routes/admin.js";
import feedbackRoutes from "./routes/feedback.js";
import drawingRoutes from "./routes/drawings.js";
import realtime from "./realtime/ws.js";
import type { AppContext } from "./context.js";

export interface BuildOptions { config?: Config; repos?: Repositories; logger?: boolean }

/** memory, or PostgreSQL through Prisma when REPOSITORIES=prisma (or auto with DATABASE_URL). Loaded lazily so the
 *  in-memory path never needs the generated Prisma client. Fails fast with the fix when the schema is not migrated. */
export async function createRepositories(config: Config): Promise<Repositories & { close?: () => Promise<void> }> {
  const usePrisma = config.REPOSITORIES === "prisma" || (config.REPOSITORIES === "auto" && !!config.DATABASE_URL);
  if (!usePrisma) return createMemoryRepositories();
  if (!config.DATABASE_URL) throw new Error("REPOSITORIES=prisma needs DATABASE_URL");
  const { createPrismaRepositories } = await import("./repositories/prisma.js");
  const repos = createPrismaRepositories(config.DATABASE_URL);
  try { await repos.seed(); } catch (e) { await repos.close(); throw e; }
  return repos;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance & { ctx: AppContext }> {
  const config = opts.config ?? loadConfig();
  const repos: Repositories & { close?: () => Promise<void> } = opts.repos ?? (await createRepositories(config));
  const store = createCandleStore(config);
  const providers = new ProviderRegistry(config, { store });
  const analysis = new AnalysisService(providers, repos);
  const ai = new AiService(config);
  const alerts = new AlertService(repos);
  const app = Fastify({ logger: opts.logger ?? config.NODE_ENV !== "test", trustProxy: true });
  const backfill = new BackfillService(providers, store, {
    baseTimeframe: config.BACKFILL_BASE_TIMEFRAME, bars: config.BACKFILL_BARS, pageSize: config.BACKFILL_PAGE_SIZE, intervalMinutes: config.BACKFILL_INTERVAL_MINUTES,
    aggregateSeconds: config.BACKFILL_AGGREGATE_SECONDS, includeDemo: config.BACKFILL_INCLUDE_DEMO, symbols: config.BACKFILL_SYMBOLS?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    log: (m) => app.log.info(`[backfill] ${m}`),
  });
  const outcomes = new OutcomeService(repos, providers, { horizonBars: config.OUTCOME_HORIZON_BARS, intervalSeconds: config.OUTCOME_INTERVAL_SECONDS, scan: parseScan(config.OUTCOME_SCAN), log: (m) => app.log.info(`[outcomes] ${m}`) });
  analysis.outcomes = outcomes;
  outcomes.analyze = (symbol, timeframe) => analysis.run(symbol, timeframe, { force: true });
  const ctx: AppContext = { config, repos, providers, analysis, ai, alerts, store, backfill, outcomes };
  if (config.BACKFILL_ENABLED && config.NODE_ENV !== "test") backfill.start();
  if (config.OUTCOME_ENABLED && config.NODE_ENV !== "test") outcomes.start();
  app.addHook("onClose", async () => { backfill.stop(); outcomes.stop(); providers.close(); await store.close(); if (!opts.repos) await repos.close?.(); });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: config.RATE_LIMIT_WINDOW });
  await app.register(authPlugin, { config });

  await app.register(async (api) => {
    await healthRoutes(api, ctx);
    await authRoutes(api, ctx);
    await marketRoutes(api, ctx);
    await userRoutes(api, ctx);
    await adminRoutes(api, ctx);
    await feedbackRoutes(api, ctx);
    await drawingRoutes(api, ctx);
  }, { prefix: "/api/v1" });
  await realtime(app, ctx);

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    app.log.error(err);
    const status = err.statusCode ?? 500;
    reply.code(status).send({ error: status === 500 ? "INTERNAL" : err.name, message: status === 500 && config.NODE_ENV === "production" ? "Internal error" : err.message });
  });

  return Object.assign(app, { ctx }) as FastifyInstance & { ctx: AppContext };
}
