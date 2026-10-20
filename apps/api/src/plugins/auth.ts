import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { roleAtLeast, type Role } from "@tradingworld/shared";
import type { Config } from "../config.js";

export interface JwtUser {
  id: string;
  email: string;
  role: Role;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (min: Role) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance, opts: { config: Config }) {
  await app.register(jwt, { secret: opts.config.JWT_SECRET, sign: { expiresIn: opts.config.JWT_EXPIRES_IN } });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
  });

  app.decorate("requireRole", (min: Role) => async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    if (!roleAtLeast(req.user.role, min)) return reply.code(403).send({ error: "FORBIDDEN" });
  });
});
