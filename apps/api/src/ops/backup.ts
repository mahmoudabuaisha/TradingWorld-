/**
 * OPS-02 — database backups and restore drills.
 *
 * A backup is one `pg_dump --format=custom` of the whole database (Prisma's `public` schema, the `market` candle store
 * and, on TimescaleDB, its catalog) taken inside an exported snapshot, so the manifest written next to it (row count
 * of every user table and a content hash of every small one) describes exactly the data in the dump. Optionally the
 * dump is streamed through `age` to public keys (the backup host cannot read its own backups) and copied offsite with
 * `rclone`.
 *
 * A restore drill proves a backup can actually be used: checksum → (fetch from the remote) → decrypt → restore into a
 * scratch database → compare every table's row count and content hash, the applied Prisma migrations and the schema
 * check the API runs at startup → drop the scratch database. Its result and duration (the RTO evidence) are recorded.
 *
 * Passwords never appear in process arguments: connections go to the PostgreSQL tools as PG* environment variables.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import pg from "pg";

export const MANIFEST_VERSION = 1;

export interface TableStat {
  /** schema-qualified, quoted as PostgreSQL prints it, e.g. public."User" */
  table: string;
  rows: number;
  /** md5 of every row as text, order-independent; only for tables up to hashMaxRows */
  hash?: string;
}

export interface Manifest {
  version: number;
  file: string;
  createdAt: string;
  durationMs: number;
  bytes: number;
  sha256: string;
  encrypted: boolean;
  database: string;
  server: string;
  pgDump: string;
  extensions: { name: string; version: string }[];
  migrations: string[];
  tables: TableStat[];
  remote?: string;
}

export interface DrillReport {
  file: string;
  ok: boolean;
  startedAt: string;
  durationMs: number;
  restoreMs: number;
  source: "local" | "remote";
  /** how old the backup was when drilled (the recovery point it would give) */
  backupAgeHours: number;
  checks: { name: string; ok: boolean; detail?: string }[];
  error?: string;
}

export interface BackupStatus {
  lastBackup?: { file: string; at: string; bytes: number; encrypted: boolean; remote?: string; durationMs: number };
  lastFailure?: { at: string; error: string };
  lastDrill?: DrillReport;
  updatedAt: string;
}

export type Log = (msg: string) => void;

// ── connections ─────────────────────────────────────────────

/** libpq environment for a postgres:// URL. Prisma's `?schema=` is not a libpq parameter and is dropped. */
export function pgEnv(url: string, database?: string): Record<string, string> {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error(`not a postgres URL: ${u.protocol}`);
  const env: Record<string, string> = {
    PGHOST: decodeURIComponent(u.hostname) || "localhost",
    PGPORT: u.port || "5432",
    PGDATABASE: database ?? decodeURIComponent(u.pathname.replace(/^\//, "") || "postgres"),
  };
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const ssl = u.searchParams.get("sslmode");
  if (ssl) env.PGSSLMODE = ssl;
  return env;
}

/** The same URL pointing at another database (and without Prisma's `schema` parameter). */
export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = "/" + encodeURIComponent(database);
  u.searchParams.delete("schema");
  return u.toString();
}

function client(url: string): pg.Client {
  const u = new URL(url);
  u.searchParams.delete("schema");
  // fixed text formats: the content hashes compare rows as text, and must not depend on the server's TimeZone/DateStyle
  return new pg.Client({
    connectionString: u.toString(),
    options: "-c TimeZone=UTC -c DateStyle=ISO,YMD -c IntervalStyle=postgres -c extra_float_digits=1",
  });
}

// ── processes ───────────────────────────────────────────────

interface RunOpts {
  env?: Record<string, string>;
}

/** Runs a tool to completion; rejects with the tail of stderr. Resolves stdout. */
export function run(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", (e) => reject(new Error(`${cmd}: ${e.message}`)));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.trim().split("\n").slice(-6).join(" | ")}`)),
    );
  });
}

/** `a | b`: both must succeed. */
function pipeline2(a: [string, string[]], b: [string, string[]], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const pa = spawn(a[0], a[1], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const pb = spawn(b[0], b[1], { env: { ...process.env, ...env }, stdio: ["pipe", "ignore", "pipe"] });
    let errA = "",
      errB = "",
      codeA: number | null | undefined,
      codeB: number | null | undefined;
    pa.stderr.on("data", (d: Buffer) => (errA += d.toString()));
    pb.stderr.on("data", (d: Buffer) => (errB += d.toString()));
    pa.stdout.pipe(pb.stdin);
    const done = () => {
      if (codeA === undefined || codeB === undefined) return;
      if (codeA !== 0) reject(new Error(`${a[0]} exited ${codeA}: ${errA.trim().split("\n").slice(-6).join(" | ")}`));
      else if (codeB !== 0) reject(new Error(`${b[0]} exited ${codeB}: ${errB.trim().split("\n").slice(-6).join(" | ")}`));
      else resolve();
    };
    pa.on("error", (e) => reject(new Error(`${a[0]}: ${e.message}`)));
    pb.on("error", (e) => reject(new Error(`${b[0]}: ${e.message}`)));
    pa.on("close", (c) => ((codeA = c), done()));
    pb.on("close", (c) => ((codeB = c), done()));
  });
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

// ── what is in the database ─────────────────────────────────

const SYSTEM_SCHEMAS = `('pg_catalog','information_schema','pg_toast','toolkit_experimental')`;

async function userTables(c: pg.Client): Promise<string[]> {
  const { rows } = await c.query<{ t: string }>(
    `SELECT format('%I.%I', schemaname, tablename) AS t FROM pg_tables
     WHERE schemaname NOT IN ${SYSTEM_SCHEMAS} AND schemaname NOT LIKE '\\_timescaledb%' AND schemaname NOT LIKE 'timescaledb\\_%'
     ORDER BY 1`,
  );
  return rows.map((r) => r.t);
}

/** Row count of every user table, plus an order-independent content hash for the small ones. */
export async function tableStats(c: pg.Client, hashMaxRows: number): Promise<TableStat[]> {
  const out: TableStat[] = [];
  for (const table of await userTables(c)) {
    const { rows } = await c.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${table}`);
    const n = Number(rows[0]!.n);
    const stat: TableStat = { table, rows: n };
    if (n <= hashMaxRows) {
      const h = await c.query<{ h: string | null }>(`SELECT md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))) AS h FROM ${table} x`);
      stat.hash = h.rows[0]!.h ?? "empty";
    }
    out.push(stat);
  }
  return out;
}

async function appliedMigrations(c: pg.Client): Promise<string[]> {
  const exists = await c.query<{ ok: boolean }>(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS ok`);
  if (!exists.rows[0]!.ok) return [];
  const { rows } = await c.query<{ migration_name: string }>(
    `SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
  );
  return rows.map((r) => r.migration_name);
}

async function extensions(c: pg.Client): Promise<{ name: string; version: string }[]> {
  const { rows } = await c.query<{ name: string; version: string }>(
    `SELECT extname AS name, extversion AS version FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY 1`,
  );
  return rows;
}

// ── backup ──────────────────────────────────────────────────

export interface BackupOptions {
  databaseUrl: string;
  dir: string;
  /** age public keys (age1…); empty = unencrypted */
  ageRecipients?: string[];
  /** rclone destination, e.g. "r2:tradingworld-backups/db" or a local path */
  remote?: string;
  hashMaxRows?: number;
  now?: Date;
  log?: Log;
}

export const stampOf = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

export async function createBackup(o: BackupOptions): Promise<Manifest> {
  const log = o.log ?? (() => {});
  const started = Date.now();
  const now = o.now ?? new Date();
  const env = pgEnv(o.databaseUrl);
  const encrypted = !!o.ageRecipients?.length;
  const file = `tw-${env.PGDATABASE}-${stampOf(now)}.dump${encrypted ? ".age" : ""}`;
  const path = join(o.dir, file);
  const partial = path + ".partial";
  await mkdir(o.dir, { recursive: true });

  const c = client(o.databaseUrl);
  await c.connect();
  try {
    // one snapshot for the manifest and the dump: the counts describe exactly what pg_dump writes
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snap = (await c.query<{ s: string }>("SELECT pg_export_snapshot() AS s")).rows[0]!.s;
    const server = (await c.query<{ v: string }>("SELECT current_setting('server_version') AS v")).rows[0]!.v;
    const ext = await extensions(c);
    const migrations = await appliedMigrations(c);
    log(`snapshot ${snap} · server ${server}${ext.length ? ` · ${ext.map((e) => `${e.name} ${e.version}`).join(", ")}` : ""}`);
    const tables = await tableStats(c, o.hashMaxRows ?? 200_000);
    log(`${tables.length} tables · ${tables.reduce((s, t) => s + t.rows, 0).toLocaleString("en-US")} rows`);
    const dump: [string, string[]] = ["pg_dump", ["--format=custom", `--snapshot=${snap}`, "--no-password"]];
    if (encrypted) await pipeline2(dump, ["age", [...o.ageRecipients!.flatMap((r) => ["-r", r]), "-o", partial]], env);
    else await run(dump[0], [...dump[1], `--file=${partial}`], { env });
    await c.query("COMMIT");
    const pgDump = (await run("pg_dump", ["--version"])).trim();
    await rename(partial, path);
    const bytes = (await stat(path)).size;
    const manifest: Manifest = {
      version: MANIFEST_VERSION,
      file,
      createdAt: now.toISOString(),
      durationMs: 0,
      bytes,
      sha256: await sha256File(path),
      encrypted,
      database: env.PGDATABASE!,
      server,
      pgDump,
      extensions: ext,
      migrations,
      tables,
    };
    if (o.remote) {
      await upload(path, o.remote);
      manifest.remote = o.remote;
      log(`copied offsite → ${o.remote}`);
    }
    manifest.durationMs = Date.now() - started;
    const mpath = manifestPath(path);
    await writeFile(mpath, JSON.stringify(manifest, null, 2) + "\n");
    if (o.remote) await upload(mpath, o.remote);
    return manifest;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    await rm(partial, { force: true });
    throw e;
  } finally {
    await c.end();
  }
}

export const manifestPath = (artifact: string) => artifact.replace(/\.dump(\.age)?$/, "") + ".manifest.json";

/** Copies a file offsite and confirms the remote size matches. */
async function upload(path: string, remote: string): Promise<void> {
  const dest = `${remote.replace(/\/$/, "")}/${basename(path)}`;
  await run("rclone", ["copyto", path, dest]);
  const listed = JSON.parse(await run("rclone", ["lsjson", dest])) as { Size: number }[];
  const size = (await stat(path)).size;
  if (listed[0]?.Size !== size) throw new Error(`offsite copy of ${basename(path)} has ${listed[0]?.Size ?? "no"} bytes, expected ${size}`);
}

// ── restore ─────────────────────────────────────────────────

export interface RestoreOptions {
  /** an EMPTY target database */
  targetUrl: string;
  ageIdentityFile?: string;
  /** from the manifest: TimescaleDB needs its pre/post restore hooks */
  timescale: boolean;
  /** from the manifest (`pg_dump --version`): a dump made by a newer major version is refused */
  pgDump?: string;
  log?: Log;
}

/** "pg_dump (PostgreSQL) 16.15 (Ubuntu …)" → 16 */
export const majorOf = (version: string) => Number(/(\d+)(?:\.\d+)?/.exec(version.replace(/^[^\d]*/, ""))?.[1] ?? NaN);

/** Restores an artifact (plain or .age) into an empty database. Refuses a database that already has user tables. */
export async function restoreInto(artifact: string, o: RestoreOptions): Promise<void> {
  const env = pgEnv(o.targetUrl);
  const c = client(o.targetUrl);
  await c.connect();
  try {
    const existing = await userTables(c);
    if (existing.length)
      throw new Error(
        `target database ${env.PGDATABASE} is not empty (${existing.length} tables, e.g. ${existing[0]}); restore into a new database`,
      );
    // pg_dump writes SQL for its own major version (17+ emits SET transaction_timeout, unknown to 16): restoring a newer
    // dump into an older server fails halfway, so say so before touching anything
    const serverMajor = Math.floor(
      Number((await c.query<{ v: string }>("SELECT current_setting('server_version_num') AS v")).rows[0]!.v) / 10000,
    );
    if (o.pgDump && majorOf(o.pgDump) > serverMajor)
      throw new Error(
        `this dump was made by pg_dump ${majorOf(o.pgDump)}, newer than the target server (PostgreSQL ${serverMajor}); restore into PostgreSQL ${majorOf(o.pgDump)} or newer`,
      );
    if (o.timescale) {
      await c.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
      await c.query("SELECT timescaledb_pre_restore()");
    }
    const restore: [string, string[]] = [
      "pg_restore",
      ["--no-owner", "--no-acl", "--exit-on-error", `--dbname=${env.PGDATABASE}`, "--no-password"],
    ];
    if (artifact.endsWith(".age")) {
      if (!o.ageIdentityFile) throw new Error("encrypted backup: set BACKUP_AGE_IDENTITY_FILE to the age identity (private key) file");
      await pipeline2(["age", ["-d", "-i", o.ageIdentityFile, artifact]], restore, env);
    } else await run(restore[0], [...restore[1], artifact], { env });
    if (o.timescale) await c.query("SELECT timescaledb_post_restore()");
  } finally {
    await c.end();
  }
}

// ── restore drill ───────────────────────────────────────────

export interface DrillOptions {
  /** the manifest of the backup to drill */
  manifest: string;
  /** connection with CREATE DATABASE rights on the server that hosts the scratch database */
  drillUrl: string;
  ageIdentityFile?: string;
  /** fetch the artifact from the remote first (proves the offsite copy, not just the local one) */
  fromRemote?: string;
  keep?: boolean;
  now?: Date;
  log?: Log;
}

export async function drill(o: DrillOptions): Promise<DrillReport> {
  const log = o.log ?? (() => {});
  const t0 = Date.now();
  const m = JSON.parse(await readFile(o.manifest, "utf8")) as Manifest;
  const dir = o.manifest.slice(0, o.manifest.length - basename(o.manifest).length);
  const report: DrillReport = {
    file: m.file,
    ok: false,
    startedAt: (o.now ?? new Date()).toISOString(),
    durationMs: 0,
    restoreMs: 0,
    source: o.fromRemote ? "remote" : "local",
    backupAgeHours: Math.round((((o.now ?? new Date()).getTime() - Date.parse(m.createdAt)) / 36e5) * 10) / 10,
    checks: [],
  };
  const check = (name: string, ok: boolean, detail?: string) => {
    report.checks.push({ name, ok, detail });
    log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
    return ok;
  };
  const scratchName = `tw_drill_${stampOf(o.now ?? new Date()).toLowerCase()}`;
  const admin = client(o.drillUrl);
  let artifact = join(dir, m.file);
  let fetched: string | undefined;
  let created = false;
  try {
    if (o.fromRemote) {
      fetched = join(dir, `.drill-${m.file}`);
      await run("rclone", ["copyto", `${o.fromRemote.replace(/\/$/, "")}/${m.file}`, fetched]);
      artifact = fetched;
      log(`fetched ${m.file} from ${o.fromRemote}`);
    }
    const sum = await sha256File(artifact);
    if (
      !check(
        "checksum",
        sum === m.sha256,
        sum === m.sha256 ? "sha256 matches the manifest" : `sha256 ${sum.slice(0, 12)}… ≠ ${m.sha256.slice(0, 12)}…`,
      )
    )
      throw new Error("checksum mismatch: the backup is corrupt or was altered");

    await admin.connect();
    await admin.query(`CREATE DATABASE "${scratchName}"`);
    created = true;
    const scratchUrl = withDatabase(o.drillUrl, scratchName);
    const r0 = Date.now();
    await restoreInto(artifact, {
      targetUrl: scratchUrl,
      ageIdentityFile: o.ageIdentityFile,
      timescale: m.extensions.some((e) => e.name === "timescaledb"),
      pgDump: m.pgDump,
      log,
    });
    report.restoreMs = Date.now() - r0;
    check("restore", true, `pg_restore into ${scratchName} in ${(report.restoreMs / 1000).toFixed(1)} s`);

    const c = client(scratchUrl);
    await c.connect();
    try {
      const restored = await tableStats(c, Number.MAX_SAFE_INTEGER);
      const byName = new Map(restored.map((t) => [t.table, t]));
      const bad: string[] = [];
      for (const t of m.tables) {
        const r = byName.get(t.table);
        if (!r) bad.push(`${t.table} missing`);
        else if (r.rows !== t.rows) bad.push(`${t.table} ${r.rows} rows ≠ ${t.rows}`);
        else if (t.hash && r.hash !== t.hash) bad.push(`${t.table} content differs`);
      }
      const hashed = m.tables.filter((t) => t.hash).length;
      check(
        "tables",
        !bad.length,
        bad.length
          ? bad.slice(0, 5).join("; ")
          : `${m.tables.length} tables, ${m.tables.reduce((s, t) => s + t.rows, 0).toLocaleString("en-US")} rows; content identical in ${hashed}`,
      );
      const migs = await appliedMigrations(c);
      check(
        "migrations",
        migs.join() === m.migrations.join(),
        m.migrations.length ? `${migs.length}/${m.migrations.length} Prisma migrations applied` : "no Prisma migrations in this database",
      );
      if (m.migrations.length) {
        const ok = (await c.query<{ ok: boolean }>(`SELECT to_regclass('public."User"') IS NOT NULL AS ok`)).rows[0]!.ok;
        check("api schema", ok, ok ? "the API's startup check passes" : 'table "User" missing');
      }
      if (m.extensions.some((e) => e.name === "timescaledb")) {
        const { rows } = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM timescaledb_information.hypertables`);
        check("hypertables", rows[0]!.n > 0, `${rows[0]!.n} hypertable(s) after timescaledb_post_restore()`);
      }
    } finally {
      await c.end();
    }
    report.ok = report.checks.every((x) => x.ok);
  } catch (e) {
    report.error = (e as Error).message;
    if (!report.checks.some((x) => !x.ok)) check("drill", false, report.error);
  } finally {
    if (created && !o.keep)
      await admin
        .query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)
        .catch((e: Error) => log(`could not drop ${scratchName}: ${e.message}`));
    await admin.end().catch(() => undefined);
    if (fetched) await rm(fetched, { force: true });
    report.durationMs = Date.now() - t0;
  }
  return report;
}

// ── retention ───────────────────────────────────────────────

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

const STAMP = /-(\d{8}T\d{6}Z)\.manifest\.json$/;
export const stampToDate = (s: string) =>
  new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return `${y}-W${Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)}`;
}

/**
 * Grandfather-father-son: the newest backup of each of the last `daily` days, `weekly` ISO weeks and `monthly` months.
 * Returns the manifests to keep; everything else may go. The newest backup is always kept.
 */
export function retained(manifests: string[], p: RetentionPolicy): Set<string> {
  const dated = manifests
    .map((f) => ({ f, m: STAMP.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => !!x.m)
    .map((x) => ({ f: x.f, d: stampToDate(x.m[1]!) }))
    .sort((a, b) => b.d.getTime() - a.d.getTime());
  const keep = new Set<string>();
  const pick = (bucket: (d: Date) => string, n: number) => {
    const seen = new Set<string>();
    for (const x of dated) {
      const b = bucket(x.d);
      if (seen.has(b)) continue;
      if (seen.size >= n) break;
      seen.add(b);
      keep.add(x.f);
    }
  };
  pick((d) => d.toISOString().slice(0, 10), p.daily);
  pick(isoWeek, p.weekly);
  pick((d) => d.toISOString().slice(0, 7), p.monthly);
  if (dated[0]) keep.add(dated[0].f);
  return keep;
}

/** Deletes local backups outside the policy. Offsite copies are left to the bucket's lifecycle rules (see docs/13). */
export async function prune(dir: string, p: RetentionPolicy, log: Log = () => {}): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const manifests = names.filter((n) => n.endsWith(".manifest.json"));
  const keep = retained(manifests, p);
  const removed: string[] = [];
  for (const mf of manifests) {
    if (keep.has(mf)) continue;
    const base = mf.replace(/\.manifest\.json$/, "");
    for (const n of names) if (n === mf || n.startsWith(base + ".")) await rm(join(dir, n), { force: true });
    removed.push(base);
    log(`pruned ${base}`);
  }
  return removed;
}

/** Newest manifest in a directory. */
export async function latestManifest(dir: string): Promise<string | undefined> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => STAMP.test(n)).sort();
  const last = names[names.length - 1];
  return last ? join(dir, last) : undefined;
}

// ── status ──────────────────────────────────────────────────

export const statusPath = (dir: string) => join(dir, "status.json");

export async function readStatus(dir: string): Promise<BackupStatus | undefined> {
  try {
    return JSON.parse(await readFile(statusPath(dir), "utf8")) as BackupStatus;
  } catch {
    return undefined;
  }
}

export async function writeStatus(dir: string, patch: Partial<BackupStatus>): Promise<BackupStatus> {
  const next: BackupStatus = { ...(await readStatus(dir)), ...patch, updatedAt: new Date().toISOString() };
  await mkdir(dir, { recursive: true });
  await writeFile(statusPath(dir) + ".tmp", JSON.stringify(next, null, 2) + "\n");
  await rename(statusPath(dir) + ".tmp", statusPath(dir));
  return next;
}

/** Problems an operator must act on: no backup, a stale one, a failed run, a failed or overdue drill. */
export function statusProblems(s: BackupStatus | undefined, o: { maxAgeHours: number; drillMaxAgeDays: number; now?: Date }): string[] {
  const now = (o.now ?? new Date()).getTime();
  if (!s?.lastBackup) return ["no backup has been taken yet"];
  const out: string[] = [];
  const age = (now - Date.parse(s.lastBackup.at)) / 36e5;
  if (age > o.maxAgeHours) out.push(`last backup is ${age.toFixed(1)} h old (limit ${o.maxAgeHours} h)`);
  if (s.lastFailure && Date.parse(s.lastFailure.at) > Date.parse(s.lastBackup.at))
    out.push(`last backup run failed: ${s.lastFailure.error}`);
  if (!s.lastDrill) out.push("no restore drill has run yet");
  else {
    if (!s.lastDrill.ok)
      out.push(`last restore drill failed: ${s.lastDrill.error ?? s.lastDrill.checks.find((c) => !c.ok)?.detail ?? "see report"}`);
    const dAge = (now - Date.parse(s.lastDrill.startedAt)) / 864e5;
    if (dAge > o.drillMaxAgeDays) out.push(`last restore drill is ${dAge.toFixed(1)} days old (limit ${o.drillMaxAgeDays})`);
  }
  return out;
}
