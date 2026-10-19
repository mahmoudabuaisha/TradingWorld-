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

  /** Watchlist overview for the Daily Sheet: regime, bias, zones, last liquidity event, narrative and a terrain spark per symbol. */
  app.get("/overview", async (req) => {
    const symbols = String((req.query as { symbols?: string }).symbols ?? "XAUUSD,EURUSD,BTCUSD,US100").split(",").slice(0, 12);
    const rows = await Promise.all(symbols.map(async (s) => {
      try {
        const r = await ctx.analysis.run(s, "15m");
        const instrument = findInstrument(s);
        const spark = instrument ? (await ctx.providers.for(instrument).getCandles(instrument, "15m", 48)).map((c) => c.close) : [];
        const sweep = r.base.sweeps.filter((x) => x.reclaimed).slice(-1)[0];
        const first = spark[0] ?? r.lastPrice;
        return {
          symbol: r.symbol,
          price: r.lastPrice,
          precision: instrument?.pricePrecision ?? 2,
          changePct: first ? ((r.lastPrice - first) / first) * 100 : 0,
          regime: r.base.regime.trend,
          volatility: r.base.regime.volatility,
          htfBias: r.htfBias,
          baseBias: r.base.bias,
          session: r.session.current,
          zones: r.zones.length,
          topZone: r.zones[0] ? { id: r.zones[0].id, name: r.zones[0].name, nameAr: r.zones[0].nameAr, score: r.zones[0].score, status: r.zones[0].status, direction: r.zones[0].direction, top: r.zones[0].top, bottom: r.zones[0].bottom } : null,
          lastSweep: sweep ? { side: sweep.side, level: sweep.level, poolKind: sweep.poolKind, displacementAfter: sweep.displacementAfter, time: sweep.time } : null,
          narrative: r.narrative,
          spark,
        };
      } catch (e) {
        return { symbol: s, error: (e as Error).message };
      }
    }));
    return { rows, generatedAt: Math.floor(Date.now() / 1000) };
  });
}
