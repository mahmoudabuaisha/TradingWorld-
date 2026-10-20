import type { FastifyInstance } from "fastify";
import { alertCreateSchema, watchlistUpdateSchema, journalTradeSchema, realizedR, findInstrument } from "@tradingworld/shared";
import type { AppContext } from "../context.js";

export default async function userRoutes(app: FastifyInstance, ctx: AppContext) {
  // ── watchlist
  app.get("/watchlist", { preHandler: app.authenticate }, async (req) => ({ symbols: await ctx.repos.watchlists.get(req.user.id) }));
  app.put("/watchlist", { preHandler: app.authenticate }, async (req, reply) => {
    const body = watchlistUpdateSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION" });
    const valid = body.data.symbols.map((s) => s.toUpperCase()).filter((s) => findInstrument(s));
    return { symbols: await ctx.repos.watchlists.set(req.user.id, valid) };
  });

  // ── alerts
  app.get("/alerts", { preHandler: app.authenticate }, async (req) => ({ alerts: await ctx.repos.alerts.list(req.user.id) }));
  app.post("/alerts", { preHandler: app.authenticate }, async (req, reply) => {
    const body = alertCreateSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    if (!findInstrument(body.data.symbol)) return reply.code(404).send({ error: "UNKNOWN_INSTRUMENT" });
    if (body.data.kind !== "zone_enter" && body.data.price === undefined) return reply.code(400).send({ error: "PRICE_REQUIRED" });
    if (body.data.kind === "zone_enter" && (body.data.zoneTop === undefined || body.data.zoneBottom === undefined)) return reply.code(400).send({ error: "ZONE_REQUIRED" });
    const alert = await ctx.repos.alerts.create({ ...body.data, symbol: body.data.symbol.toUpperCase(), userId: req.user.id });
    await ctx.repos.audit.append({ actorId: req.user.id, action: "alert.create", target: alert.id });
    return { alert };
  });
  app.delete("/alerts/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const ok = await ctx.repos.alerts.remove((req.params as { id: string }).id, req.user.id);
    return ok ? { ok: true } : reply.code(404).send({ error: "NOT_FOUND" });
  });

  // ── journal
  app.get("/journal", { preHandler: app.authenticate }, async (req) => {
    const trades = await ctx.repos.journal.list(req.user.id);
    const closed = trades.filter((t) => t.rMultiple !== undefined);
    const wins = closed.filter((t) => (t.rMultiple ?? 0) > 0).length;
    const avgR = closed.length ? closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length : 0;
    return { trades, stats: { total: trades.length, closed: closed.length, winRate: closed.length ? wins / closed.length : 0, avgR: Math.round(avgR * 100) / 100, expectancy: Math.round(avgR * 100) / 100 } };
  });
  app.post("/journal", { preHandler: app.authenticate }, async (req, reply) => {
    const body = journalTradeSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    const d = body.data;
    const rMultiple = d.exitPrice !== undefined ? realizedR(d.entry, d.stopLoss, d.exitPrice, d.direction) : undefined;
    const trade = await ctx.repos.journal.create({ ...d, symbol: d.symbol.toUpperCase(), userId: req.user.id, rMultiple });
    return { trade };
  });
  app.patch("/journal/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const body = journalTradeSchema.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION" });
    const id = (req.params as { id: string }).id;
    const existing = (await ctx.repos.journal.list(req.user.id)).find((t) => t.id === id);
    if (!existing) return reply.code(404).send({ error: "NOT_FOUND" });
    const merged = { ...existing, ...body.data };
    const rMultiple = merged.exitPrice !== undefined ? realizedR(merged.entry, merged.stopLoss, merged.exitPrice, merged.direction) : undefined;
    const trade = await ctx.repos.journal.update(id, req.user.id, { ...body.data, rMultiple });
    return { trade };
  });
  app.delete("/journal/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const ok = await ctx.repos.journal.remove((req.params as { id: string }).id, req.user.id);
    return ok ? { ok: true } : reply.code(404).send({ error: "NOT_FOUND" });
  });

  // ── settings
  app.patch("/settings", { preHandler: app.authenticate }, async (req) => {
    const patch = (req.body ?? {}) as Record<string, unknown>;
    const user = await ctx.repos.users.byId(req.user.id);
    const settings = { ...(user?.settings ?? {}), ...patch };
    await ctx.repos.users.update(req.user.id, { settings });
    return { settings };
  });
}
