import type { FastifyInstance } from "fastify";
import { pushSubscriptionSchema, notificationPrefsSchema } from "@tradingworld/shared";
import type { AppContext } from "../context.js";
import { prefsOf } from "../services/notifications.js";

/** NOTIF-01 — the inbox, channel preferences and Web Push subscriptions of the signed-in user. */
export default async function notificationRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: app.authenticate };

  app.get("/notifications", auth, async (req) => {
    const limit = Math.min(Math.max(Number((req.query as { limit?: string }).limit ?? 50) || 50, 1), 200);
    const [notifications, unread] = await Promise.all([ctx.repos.notifications.list(req.user.id, limit), ctx.repos.notifications.unread(req.user.id)]);
    return { notifications: notifications.map(({ userId: _u, ...n }) => n), unread };
  });

  app.post("/notifications/read", auth, async (req, reply) => {
    const ids = (req.body as { ids?: unknown } | undefined)?.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((x) => typeof x !== "string") || ids.length > 500)) return reply.code(400).send({ error: "VALIDATION" });
    return { marked: await ctx.repos.notifications.markRead(req.user.id, ids as string[] | undefined) };
  });

  app.get("/notifications/settings", auth, async (req) => {
    const user = await ctx.repos.users.byId(req.user.id);
    const subs = await ctx.repos.push.list(req.user.id);
    return {
      prefs: prefsOf(user),
      push: { configured: ctx.notifications.pushConfigured, publicKey: ctx.notifications.publicKey ?? null, subscriptions: subs.length },
      email: { configured: ctx.notifications.emailConfigured, address: user?.email ?? null },
      watcher: { pollSeconds: ctx.config.ALERT_POLL_SECONDS, enabled: ctx.config.ALERT_WATCH_ENABLED },
    };
  });

  app.put("/notifications/settings", auth, async (req, reply) => {
    const body = notificationPrefsSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    const user = await ctx.repos.users.byId(req.user.id);
    if (!user) return reply.code(404).send({ error: "NOT_FOUND" });
    const prefs = { ...prefsOf(user), ...body.data };
    await ctx.repos.users.update(user.id, { settings: { ...user.settings, notifications: prefs } });
    await ctx.repos.audit.append({ actorId: user.id, action: "notifications.prefs", meta: prefs });
    return { prefs };
  });

  app.post("/push/subscriptions", { ...auth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = pushSubscriptionSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    const ua = String(req.headers["user-agent"] ?? "").slice(0, 200) || undefined;
    await ctx.repos.push.upsert(req.user.id, { endpoint: body.data.endpoint, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, userAgent: ua });
    return { ok: true, subscriptions: (await ctx.repos.push.list(req.user.id)).length };
  });

  app.post("/push/unsubscribe", auth, async (req, reply) => {
    const endpoint = (req.body as { endpoint?: unknown } | undefined)?.endpoint;
    if (typeof endpoint !== "string") return reply.code(400).send({ error: "VALIDATION" });
    return { removed: await ctx.repos.push.remove(endpoint, req.user.id) };
  });

  /** Sends a harmless test through every enabled channel, so the user can see what arrives where. */
  app.post("/notifications/test", { ...auth, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req) => {
    const n = await ctx.notifications.notify(req.user.id, {
      kind: "test",
      title: { ar: "إشعار تجريبي", en: "Test notification" },
      body: { ar: "هكذا تصل تنبيهاتك من TradingWorld. لا شيء مطلوب منك.", en: "This is how your TradingWorld alerts arrive. Nothing to do." },
      url: "/alerts",
    });
    const { userId: _u, ...rest } = n;
    return { notification: rest };
  });
}
