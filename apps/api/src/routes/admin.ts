import type { FastifyInstance } from "fastify";
import { ENGINE_VERSION, SCORING_VERSION, FACTOR_WEIGHTS } from "@tradingworld/analysis-engine";
import { PLATFORM_MODULES, ROLES } from "@tradingworld/shared";
import { publicUser } from "./auth.js";
import type { AppContext } from "../context.js";
import { feedbackStats } from "../services/feedback.js";

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

  /** AI-02: what users think of the zones — aggregates, best factors, agreement with outcomes, recent comments. */
  app.get("/admin/feedback", { preHandler: admin }, async (req) => {
    const includeDemo = ["1", "true"].includes(String((req.query as { includeDemo?: string }).includeDemo ?? ""));
    return feedbackStats(ctx.repos, includeDemo);
  });

  /** AI-01: what happened to the zones the engine emitted — counts, reaction rates by quality/origin/session/score, recent labels. */
  app.get("/admin/outcomes", { preHandler: admin }, async (req) => {
    const includeDemo = ["1", "true"].includes(String((req.query as { includeDemo?: string }).includeDemo ?? ""));
    return { job: ctx.outcomes.status(), stats: await ctx.outcomes.stats(includeDemo) };
  });

  app.post("/admin/outcomes/run", { preHandler: admin }, async (req) => {
    await ctx.repos.audit.append({ actorId: req.user.id, action: "outcomes.run" });
    return { run: await ctx.outcomes.run() };
  });

  /** ML dataset: resolved zones in the exact shape services/ml POST /train expects. Demo data only on request. */
  app.get("/admin/research/dataset", { preHandler: admin }, async (req) => {
    const q = req.query as { engineVersion?: string; scoringVersion?: string; includeDemo?: string; limit?: string };
    const engineVersion = q.engineVersion ?? ENGINE_VERSION;
    const scoringVersion = q.scoringVersion ?? SCORING_VERSION;
    const samples = await ctx.outcomes.dataset({
      engineVersion,
      scoringVersion,
      includeDemo: ["1", "true"].includes(q.includeDemo ?? ""),
      limit: q.limit ? Math.min(Number(q.limit), 100_000) : undefined,
    });
    return { engine_version: engineVersion, scoring_version: scoringVersion, n_folds: 5, samples };
  });

  /** DATA-02: candle store coverage and the maintenance job's status. */
  app.get("/admin/backfill", { preHandler: admin }, async () => ({
    store: ctx.store.kind,
    enabled: ctx.config.BACKFILL_ENABLED,
    job: ctx.backfill.status(),
    series: await ctx.store.series(),
  }));

  /** Trigger maintenance now: a full cycle, or one step for one symbol. Runs in the background; poll GET for progress. */
  app.post("/admin/backfill", { preHandler: admin }, async (req, reply) => {
    const body = (req.body ?? {}) as { kind?: "cycle" | "backfill" | "catchup" | "gaps" | "aggregate"; symbol?: string; bars?: number };
    const kind = body.kind ?? "cycle";
    if (kind !== "cycle" && !body.symbol) return reply.code(400).send({ error: "SYMBOL_REQUIRED" });
    await ctx.repos.audit.append({
      actorId: req.user.id,
      action: "backfill.trigger",
      target: body.symbol,
      meta: { kind, bars: body.bars },
    });
    const work =
      kind === "cycle"
        ? ctx.backfill.runOnce()
        : kind === "backfill"
          ? ctx.backfill.backfill(body.symbol!, undefined, body.bars)
          : kind === "catchup"
            ? ctx.backfill.catchUp(body.symbol!)
            : kind === "gaps"
              ? ctx.backfill.repairGaps(body.symbol!)
              : ctx.backfill.aggregateDerived(body.symbol!, "full");
    void work.catch((e) => app.log.warn(`[backfill] ${(e as Error).message}`));
    return { accepted: true, kind, symbol: body.symbol };
  });

  /** Research: factor frequency across logged zones — first step of the AI Research Dashboard. */
  app.get("/admin/research/factors", { preHandler: admin }, async () => {
    const entries = await ctx.repos.zoneLog.recent(5000);
    const stats: Record<string, { present: number; total: number; avgScoreWhenPresent: number }> = {};
    for (const e of entries) {
      for (const f of e.zone.factors) {
        const s = (stats[f.key] ??= { present: 0, total: 0, avgScoreWhenPresent: 0 });
        s.total++;
        if (f.present) {
          s.avgScoreWhenPresent = (s.avgScoreWhenPresent * s.present + e.zone.score) / (s.present + 1);
          s.present++;
        }
      }
    }
    const byStatus: Record<string, number> = {};
    for (const e of entries) byStatus[e.zone.status] = (byStatus[e.zone.status] ?? 0) + 1;
    return { sample: entries.length, factors: stats, byStatus };
  });
}
