/** DEPLOY-01 — the admin account comes from the configuration, not from whoever registers first on a public server. */
import { roleAtLeast } from "@tradingworld/shared";
import type { Repositories } from "../repositories/memory.js";
import { hashPassword } from "../services/password.js";

export type AdminResult = "created" | "promoted" | "unchanged";

/**
 * Creates the admin account, or promotes an existing account with that email. An existing account keeps its password,
 * so a restart never undoes a password change made since.
 */
export async function ensureAdmin(repos: Repositories, email: string, password: string): Promise<AdminResult> {
  const address = email.toLowerCase();
  const existing = await repos.users.byEmail(address);
  if (existing) {
    if (roleAtLeast(existing.role, "admin")) return "unchanged";
    await repos.users.update(existing.id, { role: "admin" });
    await repos.audit.append({ actorId: existing.id, action: "admin.promote", meta: { by: "ADMIN_EMAIL" } });
    return "promoted";
  }
  const user = await repos.users.create({
    email: address,
    displayName: "Admin",
    passwordHash: await hashPassword(password),
    role: "admin",
    settings: { locale: "ar", theme: "dark" },
  });
  await repos.audit.append({ actorId: user.id, action: "admin.create", meta: { by: "ADMIN_EMAIL" } });
  return "created";
}
