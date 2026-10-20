/**
 * OPS-02 — backups and restore drills (docs/13-backups.md):
 *   node apps/api/dist/tools/backup.js run                       one backup now (+ offsite copy, + local retention)
 *   node apps/api/dist/tools/backup.js drill [MANIFEST] [--local] [--keep]
 *                                                                restore the newest (or given) backup into a scratch
 *                                                                database and check it; from the offsite copy unless --local
 *   node apps/api/dist/tools/backup.js restore MANIFEST --target postgresql://…/new_db
 *                                                                restore into an EMPTY database (disaster recovery)
 *   node apps/api/dist/tools/backup.js status [--check]          last backup and drill; --check exits 1 on a problem
 *   node apps/api/dist/tools/backup.js prune                     apply the local retention policy
 *   node apps/api/dist/tools/backup.js schedule                  daemon: daily at BACKUP_AT UTC, drill per BACKUP_DRILL
 */
import { access } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { loadConfig } from "../config.js";
import {
  createBackup,
  drill,
  latestManifest,
  manifestPath,
  prune,
  readStatus,
  restoreInto,
  run,
  statusProblems,
  withDatabase,
  writeStatus,
  type DrillReport,
  type Manifest,
} from "../ops/backup.js";
import { readFile, writeFile } from "node:fs/promises";

// the backup job never touches tokens, so it runs without JWT_SECRET
const cfg = loadConfig(process.env, { requireJwtSecret: false });
const [cmd = "status", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const positional = rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--target");
const dir = resolve(cfg.BACKUP_DIR);
const log = (m: string) => console.log(`${new Date().toISOString().slice(0, 19)}Z  ${m}`);
const policy = { daily: cfg.BACKUP_KEEP_DAILY, weekly: cfg.BACKUP_KEEP_WEEKLY, monthly: cfg.BACKUP_KEEP_MONTHLY };
const recipients = cfg.BACKUP_AGE_RECIPIENTS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function databaseUrl(): string {
  if (!cfg.DATABASE_URL) throw new Error("DATABASE_URL is not set: there is no database to back up (memory repositories persist nothing)");
  return cfg.DATABASE_URL;
}

async function backupNow(): Promise<Manifest> {
  try {
    const m = await createBackup({
      databaseUrl: databaseUrl(),
      dir,
      ageRecipients: recipients,
      remote: cfg.BACKUP_RCLONE_REMOTE,
      hashMaxRows: cfg.BACKUP_HASH_MAX_ROWS,
      log,
    });
    log(
      `backup ${m.file} · ${mb(m.bytes)} · ${m.encrypted ? "encrypted (age)" : "NOT encrypted"} · ${m.remote ? "offsite ✓" : "local only"} · ${(m.durationMs / 1000).toFixed(1)} s`,
    );
    await writeStatus(dir, {
      lastBackup: { file: m.file, at: m.createdAt, bytes: m.bytes, encrypted: m.encrypted, remote: m.remote, durationMs: m.durationMs },
    });
    await prune(dir, policy, log);
    return m;
  } catch (e) {
    await writeStatus(dir, { lastFailure: { at: new Date().toISOString(), error: (e as Error).message } });
    throw e;
  }
}

async function drillNow(manifest?: string): Promise<DrillReport> {
  const mf = manifest ?? (await latestManifest(dir));
  if (!mf) throw new Error(`no backup in ${dir}`);
  const remote = flags.has("--local") ? undefined : cfg.BACKUP_RCLONE_REMOTE;
  log(`restore drill of ${basename(mf)}${remote ? ` from ${remote}` : " (local copy)"}`);
  const report = await drill({
    manifest: mf,
    drillUrl: cfg.BACKUP_DRILL_URL ?? withDatabase(databaseUrl(), "postgres"),
    ageIdentityFile: cfg.BACKUP_AGE_IDENTITY_FILE,
    fromRemote: remote,
    keep: flags.has("--keep"),
    log,
  });
  await writeFile(mf.replace(/\.manifest\.json$/, ".drill.json"), JSON.stringify(report, null, 2) + "\n");
  await writeStatus(dir, { lastDrill: report });
  log(
    `drill ${report.ok ? "PASSED" : "FAILED"} in ${(report.durationMs / 1000).toFixed(1)} s (restore ${(report.restoreMs / 1000).toFixed(1)} s)`,
  );
  return report;
}

async function restoreCmd(): Promise<void> {
  const target = rest[rest.indexOf("--target") + 1];
  const mf = positional[0];
  if (!mf || !rest.includes("--target") || !target)
    throw new Error("usage: backup restore MANIFEST --target postgresql://user:pass@host:5432/new_empty_db");
  const m = JSON.parse(await readFile(mf, "utf8")) as Manifest;
  const artifact = join(mf.slice(0, mf.length - basename(mf).length), m.file);
  const exists = await access(artifact).then(
    () => true,
    () => false,
  );
  if (!exists) {
    if (!cfg.BACKUP_RCLONE_REMOTE) throw new Error(`${artifact} not found and no BACKUP_RCLONE_REMOTE to fetch it from`);
    log(`fetching ${m.file} from ${cfg.BACKUP_RCLONE_REMOTE}`);
    await run("rclone", ["copyto", `${cfg.BACKUP_RCLONE_REMOTE.replace(/\/$/, "")}/${m.file}`, artifact]);
  }
  log(`restoring ${m.file} (${m.createdAt}) into ${new URL(target).pathname.slice(1)}`);
  const t0 = Date.now();
  await restoreInto(artifact, {
    targetUrl: target,
    ageIdentityFile: cfg.BACKUP_AGE_IDENTITY_FILE,
    timescale: m.extensions.some((e) => e.name === "timescaledb"),
    pgDump: m.pgDump,
    log,
  });
  log(`restored in ${((Date.now() - t0) / 1000).toFixed(1)} s. Run a drill on it or point DATABASE_URL at it; nothing else was changed.`);
}

async function statusCmd(): Promise<number> {
  const s = await readStatus(dir);
  const problems = statusProblems(s, { maxAgeHours: cfg.BACKUP_MAX_AGE_HOURS, drillMaxAgeDays: cfg.BACKUP_DRILL_MAX_AGE_DAYS });
  if (s?.lastBackup)
    console.log(
      `last backup : ${s.lastBackup.at} · ${s.lastBackup.file} · ${mb(s.lastBackup.bytes)}${s.lastBackup.remote ? ` · offsite ${s.lastBackup.remote}` : ""}`,
    );
  if (s?.lastDrill) console.log(`last drill  : ${s.lastDrill.startedAt} · ${s.lastDrill.ok ? "passed" : "FAILED"} · ${s.lastDrill.file}`);
  for (const p of problems) console.log(`problem     : ${p}`);
  if (!problems.length) console.log("ok");
  return flags.has("--check") && problems.length ? 1 : 0;
}

/** ms until the next HH:MM UTC */
function untilNext(at: string, now = new Date()): number {
  const [h, m] = at.split(":").map(Number) as [number, number];
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** a drill is due per BACKUP_DRILL: daily, or when the last one is older than 6.5 days */
async function drillDue(): Promise<boolean> {
  if (cfg.BACKUP_DRILL === "off") return false;
  const last = (await readStatus(dir))?.lastDrill;
  return cfg.BACKUP_DRILL === "daily" || !last || Date.now() - Date.parse(last.startedAt) > 6.5 * 864e5;
}

async function cycle(): Promise<void> {
  try {
    const m = await backupNow();
    if (await drillDue()) await drillNow(join(dir, basename(manifestPath(m.file))));
  } catch (e) {
    log(`FAILED: ${(e as Error).message}`);
  }
}

async function schedule(): Promise<never> {
  log(
    `backups daily at ${cfg.BACKUP_AT} UTC into ${dir}; drill ${cfg.BACKUP_DRILL}; offsite ${cfg.BACKUP_RCLONE_REMOTE ?? "none"}; ${recipients?.length ? "encrypted" : "NOT encrypted"}`,
  );
  // catch up at start: a new deployment, or a container that was down past its slot, does not wait a day
  const last = (await readStatus(dir))?.lastBackup;
  if (!last || Date.now() - Date.parse(last.at) > cfg.BACKUP_MAX_AGE_HOURS * 36e5) {
    log(last ? `last backup ${last.at} is older than ${cfg.BACKUP_MAX_AGE_HOURS} h: backing up now` : "no backup yet: backing up now");
    await cycle();
  }
  for (;;) {
    const wait = untilNext(cfg.BACKUP_AT);
    log(`next backup in ${(wait / 36e5).toFixed(2)} h`);
    await new Promise((r) => setTimeout(r, wait));
    await cycle();
  }
}

try {
  let code = 0;
  if (cmd === "run") await backupNow();
  else if (cmd === "drill") code = (await drillNow(positional[0])).ok ? 0 : 1;
  else if (cmd === "restore") await restoreCmd();
  else if (cmd === "status") code = await statusCmd();
  else if (cmd === "prune") await prune(dir, policy, log);
  else if (cmd === "schedule") await schedule();
  else {
    console.error(`unknown command ${cmd}: run | drill | restore | status | prune | schedule`);
    code = 2;
  }
  process.exit(code);
} catch (e) {
  console.error(`backup ${cmd}: ${(e as Error).message}`);
  process.exit(1);
}
