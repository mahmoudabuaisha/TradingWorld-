import type { FastifyInstance } from "fastify";
import { zoneFeedbackSchema } from "@tradingworld/shared";
import type { AppContext } from "../context.js";

/**
 * AI-02 — a user's opinion of a zone, by its stable tracking key (shared zoneTrackKey).
 * Separate from market outcomes, never changes the score, and each user only sees their own vote.
 */
export default async function feedbackRoutes(app: FastifyInstance, ctx: AppContext) {
  const keyOf = (req: { params: unknown }) => decodeURIComponent((req.params as { key: string }).key);

  app.get("/zones/:key/feedback", { preHandler: app.authenticate }, async (req) => {
    const key = keyOf(req);
    const [zone, mine] = await Promise.all([ctx.repos.zones.get(key), ctx.repos.feedback.get(key, req.user.id)]);
    return { tracked: !!zone, feedback: mine ?? null };
  });

  app.put("/zones/:key/feedback", { preHandler: app.authenticate, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = zoneFeedbackSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    const key = keyOf(req);
    const zone = await ctx.repos.zones.get(key);
    if (!zone) return reply.code(404).send({ error: "ZONE_NOT_TRACKED", message: "Only zones the engine has shown (and not invalidated at the time) can be rated." });
    if (body.data.bestFactor && !zone.zone.factors.some((f) => f.key === body.data.bestFactor && f.present)) {
      return reply.code(400).send({ error: "FACTOR_NOT_PRESENT", message: `${body.data.bestFactor} is not a present factor of this zone` });
    }
    const feedback = await ctx.repos.feedback.upsert({ zoneKey: key, userId: req.user.id, useful: body.data.useful, bestFactor: body.data.bestFactor, comment: body.data.comment });
    await ctx.repos.audit.append({ actorId: req.user.id, action: "zone.feedback", target: key, meta: { useful: body.data.useful } });
    return { feedback };
  });

  app.delete("/zones/:key/feedback", { preHandler: app.authenticate }, async (req, reply) => {
    const ok = await ctx.repos.feedback.remove(keyOf(req), req.user.id);
    return ok ? { ok: true } : reply.code(404).send({ error: "NOT_FOUND" });
  });
}
