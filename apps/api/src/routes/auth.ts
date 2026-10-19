import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "@tradingworld/shared";
import { hashPassword, verifyPassword } from "../services/password.js";
import type { AppContext } from "../context.js";

export default async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION", issues: body.error.issues });
    const email = body.data.email.toLowerCase();
    if (await ctx.repos.users.byEmail(email)) return reply.code(409).send({ error: "EMAIL_TAKEN" });
    const isFirst = (await ctx.repos.users.list()).length === 0;
    const user = await ctx.repos.users.create({ email, displayName: body.data.displayName, passwordHash: await hashPassword(body.data.password), role: isFirst ? "admin" : "user", settings: { locale: "ar", theme: "dark" } });
    await ctx.repos.audit.append({ actorId: user.id, action: "user.register" });
    const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role });
    return { token, user: publicUser(user) };
  });

  app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "VALIDATION" });
    const user = await ctx.repos.users.byEmail(body.data.email.toLowerCase());
    if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    await ctx.repos.audit.append({ actorId: user.id, action: "user.login" });
    const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role });
    return { token, user: publicUser(user) };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (req, reply) => {
    const user = await ctx.repos.users.byId(req.user.id);
    if (!user) return reply.code(404).send({ error: "NOT_FOUND" });
    return { user: publicUser(user) };
  });
}

export function publicUser(u: { id: string; email: string; displayName: string; role: string; createdAt: number; settings: Record<string, unknown> }) {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, createdAt: u.createdAt, settings: u.settings };
}
