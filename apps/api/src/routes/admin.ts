import type { FastifyInstance } from "fastify";
import { ENGINE_VERSION, SCORING_VERSION, FACTOR_WEIGHTS } from "@tradingworld/analysis-engine";
import { PLATFORM_MODULES, ROLES } from "@tradingworld/shared";
import { publicUser } from "./auth.js";
import type { AppContext } from "../context.js";

export default async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const admin = app.requireRole("admin");

  app.get("/admin/overview", { preHandler: admin }, async () => ({
    users: (await ctx.repos.users.list()).length,
    zonesLogged: await ctx.repos.zoneLog.count(),
    analysisCache: ctx.analysis.stats(),
    providers: ctx.providers.all().map((p) => p.status()),
    engine: { version: ENGINE_VERSION, scoring: SCORING_VERSION, weights: FACTOR_WEIGHTS },
    ai: ctx.ai.enabled ? "anthropic" : "deterministic",
    modules: PLATFORM_MODULES.map((m) => ({ id: m.id, status: m.status, phase: m.phase })),
    memory: process.memoryUsage().rss,
    uptime: process.uptime(),
  }));

  app.get("/admin/users", { preHandler: admin }, async () => ({ users: (await ctx.repos.users.list()).map(publicUser) }));

  app.patch("/admin/users/:id/role", { preHandler: admin }, async (req, reply) => {
    const { role } = (req.body ?? {}) as { role?: string };
    if (!role || !(ROLES as readonly string[]).includes(role)) return reply.code(400).send({ error: "INVALID_ROLE" });
    const id = (req.params as { id: string }).id;
    const user = await ctx.repos.users.update(id, { role: role as (typeof ROLES)[number] });
    if (!user) return reply.code(404).send({ error: "NOT_FOUND" });
    await ctx.repos.audit.append({ actorId: req.user.id, action: "user.role.change", target: id, meta: { role } });
    return { user: publicUser(user) };
  });

  app.get("/admin/zones", { preHandler: admin }, async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 100), 1000);
    return { entries: await ctx.repos.zoneLog.recent(limit) };
  });

  app.get("/admin/audit", { preHandler: admin }, async () => ({ entries: await ctx.repos.audit.recent(200) }));

  /** Research: factor frequency across logged zones — first step of the AI Research Dashboard. */
  app.get("/admin/research/factors", { preHandler: admin }, async () => {
    const entries = await ctx.repos.zoneLog.recent(5000);
    const stats: Record<string, { present: number; total: number; avgScoreWhenPresent: number }> = {};
    for (const e of entries) {
      for (const f of e.zone.factors) {
        const s = (stats[f.key] ??= { present: 0, total: 0, avgScoreWhenPresent: 0 });
        s.total++;
        if (f.present) { s.avgScoreWhenPresent = (s.avgScoreWhenPresent * s.present + e.zone.score) / (s.present + 1); s.present++; }
      }
    }
    const byStatus: Record<string, number> = {};
    for (const e of entries) byStatus[e.zone.status] = (byStatus[e.zone.status] ?? 0) + 1;
    return { sample: entries.length, factors: stats, byStatus };
  });
}
