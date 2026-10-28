import type { FastifyInstance } from "fastify";
import { ENGINE_VERSION, SCORING_VERSION } from "@tradingworld/analysis-engine";
import type { AppContext } from "../context.js";

export default async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/health", async () => ({
    ok: true,
    // DEPLOY-01: the commit the running images were built from, so a merge can be confirmed live
    commit: ctx.config.GIT_SHA ?? null,
    uptime: process.uptime(),
    engineVersion: ENGINE_VERSION,
    scoringVersion: SCORING_VERSION,
    providers: ctx.providers.statuses(),
    routes: ctx.providers.routes,
    warnings: ctx.providers.warnings,
    ai: ctx.ai.enabled ? "anthropic" : "deterministic",
  }));
}
