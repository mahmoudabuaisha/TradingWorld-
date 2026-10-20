import type { FastifyInstance } from "fastify";
import { drawingCreateSchema, drawingUpdateSchema, findInstrument, DRAWING_POINTS, MAX_DRAWINGS_PER_SYMBOL } from "@tradingworld/shared";
import type { AppContext } from "../context.js";

/** UI-01 — the user's chart drawings, per symbol (shared across timeframes), owner-scoped. */
export default async function drawingRoutes(app: FastifyInstance, ctx: AppContext) {
  const symbolOf = (q: unknown) => findInstrument(String((q as { symbol?: string }).symbol ?? ""))?.symbol;

  app.get("/drawings", { preHandler: app.authenticate }, async (req, reply) => {
    const symbol = symbolOf(req.query);
    if (!symbol) return reply.code(400).send({ error: "UNKNOWN_INSTRUMENT" });
    return { symbol, drawings: await ctx.repos.drawings.list(req.user.id, symbol) };
  });

  app.post(
    "/drawings",
    { preHandler: app.authenticate, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = drawingCreateSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
      const symbol = findInstrument(body.data.symbol)?.symbol;
      if (!symbol) return reply.code(404).send({ error: "UNKNOWN_INSTRUMENT" });
      if ((await ctx.repos.drawings.count(req.user.id, symbol)) >= MAX_DRAWINGS_PER_SYMBOL)
        return reply.code(409).send({ error: "TOO_MANY_DRAWINGS", limit: MAX_DRAWINGS_PER_SYMBOL });
      return { drawing: await ctx.repos.drawings.create(req.user.id, { ...body.data, symbol }) };
    },
  );

  app.patch(
    "/drawings/:id",
    { preHandler: app.authenticate, config: { rateLimit: { max: 240, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = drawingUpdateSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
      const id = (req.params as { id: string }).id;
      const existing = await ctx.repos.drawings.get(id, req.user.id);
      if (!existing) return reply.code(404).send({ error: "NOT_FOUND" });
      if (body.data.points.length !== DRAWING_POINTS[existing.kind])
        return reply.code(400).send({ error: "VALIDATION", message: "point count does not match the drawing kind" });
      const drawing = await ctx.repos.drawings.update(id, req.user.id, body.data.points);
      return drawing ? { drawing } : reply.code(404).send({ error: "NOT_FOUND" });
    },
  );

  app.delete("/drawings/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const ok = await ctx.repos.drawings.remove((req.params as { id: string }).id, req.user.id);
    return ok ? { ok: true } : reply.code(404).send({ error: "NOT_FOUND" });
  });

  /** clear every drawing of one symbol */
  app.delete("/drawings", { preHandler: app.authenticate }, async (req, reply) => {
    const symbol = symbolOf(req.query);
    if (!symbol) return reply.code(400).send({ error: "UNKNOWN_INSTRUMENT" });
    return { removed: await ctx.repos.drawings.clear(req.user.id, symbol) };
  });
}
