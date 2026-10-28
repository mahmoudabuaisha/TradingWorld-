import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { ensureAdmin } from "../ops/admin.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import { verifyPassword } from "../services/password.js";

const prod = {
  NODE_ENV: "production",
  JWT_SECRET: "prod-secret-prod-secret-0123456789",
  MARKET_DATA_PROVIDER: "demo",
  OPS_WATCHDOG_ENABLED: "false",
  ALERT_WATCH_ENABLED: "false",
  OUTCOME_ENABLED: "false",
} as const;
const register = (app: Awaited<ReturnType<typeof buildApp>>, email: string) =>
  app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email, password: "kharita-2026", displayName: "Visitor" } });

describe("admin account (DEPLOY-01)", () => {
  it("in production the first registration is a plain user, and the configured admin can log in", async () => {
    const app = await buildApp({
      config: loadConfig({ ...prod, ADMIN_EMAIL: "Admin@MediaTechnologies.uk", ADMIN_PASSWORD: "a-long-admin-password" }),
      logger: false,
    });
    try {
      expect((await register(app, "first@visitor.test")).json().user.role).toBe("user");
      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "admin@mediatechnologies.uk", password: "a-long-admin-password" },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().user.role).toBe("admin");
      const h = { authorization: `Bearer ${login.json().token as string}` };
      expect((await app.inject({ method: "GET", url: "/api/v1/admin/overview", headers: h })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("keeps the development habit: outside production the first account is admin", async () => {
    const app = await buildApp({ config: loadConfig({ ...prod, NODE_ENV: "development" }), logger: false });
    try {
      expect((await register(app, "dev@local.test")).json().user.role).toBe("admin");
      expect((await register(app, "second@local.test")).json().user.role).toBe("user");
    } finally {
      await app.close();
    }
  });

  it("creates once, promotes an existing account, and never resets a password on restart", async () => {
    const repos = createMemoryRepositories();
    expect(await ensureAdmin(repos, "ops@tw.test", "first-password-123")).toBe("created");
    expect(await ensureAdmin(repos, "OPS@tw.test", "another-password-456")).toBe("unchanged");
    const admin = (await repos.users.byEmail("ops@tw.test"))!;
    expect(await verifyPassword("first-password-123", admin.passwordHash)).toBe(true);

    const u = await repos.users.create({ email: "member@tw.test", displayName: "M", passwordHash: "x", role: "user", settings: {} });
    expect(await ensureAdmin(repos, "member@tw.test", "ignored-password-1")).toBe("promoted");
    expect((await repos.users.byId(u.id))!).toMatchObject({ role: "admin", passwordHash: "x" });
    expect((await repos.audit.recent(10)).map((e) => e.action)).toEqual(expect.arrayContaining(["admin.create", "admin.promote"]));
  });

  it("reports the deployed commit on /health", async () => {
    const app = await buildApp({ config: loadConfig({ ...prod, GIT_SHA: "4894dc3" }), logger: false });
    try {
      expect((await app.inject({ method: "GET", url: "/api/v1/health" })).json()).toMatchObject({ ok: true, commit: "4894dc3" });
    } finally {
      await app.close();
    }
  });
});
