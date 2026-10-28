/**
 * DEPLOY-01 — admin accounts from the server, for when there is no mailbox to recover a password:
 *   node apps/api/dist/tools/admin.js reset-password EMAIL     new random password, printed once
 *   node apps/api/dist/tools/admin.js promote EMAIL            make an existing account admin
 *   node apps/api/dist/tools/admin.js list                     admins and moderators
 * In docker-compose: docker compose -f deploy/docker-compose.prod.yml exec api node apps/api/dist/tools/admin.js …
 */
import { randomBytes } from "node:crypto";
import { roleAtLeast } from "@tradingworld/shared";
import { createRepositories } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../services/password.js";

const [cmd, email] = process.argv.slice(2);
const repos = await createRepositories(loadConfig(process.env, { requireJwtSecret: false }));
let code = 0;
try {
  if (cmd === "list") {
    for (const u of await repos.users.list()) if (roleAtLeast(u.role, "moderator")) console.log(`${u.role.padEnd(10)} ${u.email}`);
  } else if ((cmd === "reset-password" || cmd === "promote") && email) {
    const user = await repos.users.byEmail(email.toLowerCase());
    if (!user) throw new Error(`no account with email ${email}`);
    if (cmd === "promote") {
      await repos.users.update(user.id, { role: "admin" });
      await repos.audit.append({ actorId: user.id, action: "admin.promote", meta: { by: "cli" } });
      console.log(`${user.email} is now admin`);
    } else {
      // 18 random bytes → 24 base64url characters, no ambiguous symbols to mistype
      const password = randomBytes(18).toString("base64url");
      await repos.users.update(user.id, { passwordHash: await hashPassword(password) });
      await repos.audit.append({ actorId: user.id, action: "user.password_reset", meta: { by: "cli" } });
      console.log(`new password for ${user.email}: ${password}`);
    }
  } else {
    console.error("usage: admin.js reset-password EMAIL | promote EMAIL | list");
    code = 2;
  }
} catch (e) {
  console.error(`admin ${cmd}: ${(e as Error).message}`);
  code = 1;
} finally {
  await repos.close?.();
}
process.exit(code);
