import type { FastifyInstance } from "fastify";
import { DEFAULT_INSTRUMENTS, findInstrument, candlesQuerySchema, analysisQuerySchema, aiChatSchema, TIMEFRAMES, PLATFORM_MODULES } from "@tradingworld/shared";
import type { AppContext } from "../context.js";

export default async function marketRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/instruments", async () => ({ instruments: DEFAULT_INSTRUMENTS, timeframes: TIMEFRAMES }));

  app.get("/modules", async () => ({ modules: PLATFORM_MODULES }));

  app.get("/candles", async (req, reply) => {
    const q = candlesQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "VALIDATION", issues: q.error.issues });
    const instrument = findInstrument(q.data.symbol);
    if (!instrument) return reply.code(404).send({ error: "UNKNOWN_INSTRUMENT" });
    const provider = ctx.providers.for(instrument);
    const candles = await provider.getCandles(instrument, q.data.timeframe, q.data.limit, q.data.to);
    return { symbol: instrument.symbol, timeframe: q.data.timeframe, provider: provider.id, status: provider.status(), candles };
  });

  app.get("/analysis", async (req, reply) => {
    const q = analysisQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "VALIDATION", issues: q.error.issues });
    try {
      const result = await ctx.analysis.run(q.data.symbol, q.data.timeframe, { limit: q.data.limit, includeLowQuality: q.data.includeLowQuality });
      return result;
    } catch (e) {
      return reply.code(400).send({ error: "ANALYSIS_FAILED", message: (e as Error).message });
    }
  });

  app.post("/ai/chat", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = aiChatSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    const result = await ctx.analysis.run(body.data.symbol, body.data.timeframe, { includeLowQuality: true });
    const answer = await ctx.ai.ask(result, body.data.question, body.data.locale, body.data.zoneId);
    return { ...answer, engineVersion: result.engineVersion, generatedAt: result.generatedAt };
  });

  /** Watchlist overview: regime / zones count / volatility per symbol. */
  app.get("/overview", async (req) => {
    const symbols = String((req.query as { symbols?: string }).symbols ?? "XAUUSD,EURUSD,BTCUSD,US100").split(",").slice(0, 12);
    const rows = await Promise.all(symbols.map(async (s) => {
      try {
        const r = await ctx.analysis.run(s, "15m");
        return { symbol: r.symbol, price: r.lastPrice, regime: r.base.regime.trend, volatility: r.base.regime.volatility, htfBias: r.htfBias, zones: r.zones.length, topZone: r.zones[0] ? { name: r.zones[0].name, nameAr: r.zones[0].nameAr, score: r.zones[0].score, status: r.zones[0].status } : null };
      } catch (e) {
        return { symbol: s, error: (e as Error).message };
      }
    }));
    return { rows };
  });
}
