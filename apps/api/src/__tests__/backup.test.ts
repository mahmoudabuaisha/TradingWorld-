import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import {
  createBackup,
  drill,
  manifestPath,
  pgEnv,
  prune,
  restoreInto,
  retained,
  statusProblems,
  withDatabase,
  writeStatus,
  type BackupStatus,
  type Manifest,
} from "../ops/backup.js";

const has = (cmd: string) => {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

describe("backup helpers", () => {
  it("turns a Prisma URL into libpq environment without the schema parameter", () => {
    const env = pgEnv("postgresql://tw%40ops:p%40ss%2Fword@db.internal:6543/trading?schema=public&sslmode=require");
    expect(env).toEqual({
      PGHOST: "db.internal",
      PGPORT: "6543",
      PGDATABASE: "trading",
      PGUSER: "tw@ops",
      PGPASSWORD: "p@ss/word",
      PGSSLMODE: "require",
    });
    expect(withDatabase("postgresql://u:p@h:5432/trading?schema=public", "postgres")).toBe("postgresql://u:p@h:5432/postgres");
    expect(() => pgEnv("mysql://x@y/z")).toThrow(/not a postgres URL/);
  });

  it("keeps the newest backup per day, ISO week and month (grandfather-father-son)", () => {
    // two backups a day for 120 days, newest 2026-10-20
    const files: string[] = [];
    for (let d = 0; d < 120; d++)
      for (const h of ["02", "14"]) {
        const t = new Date(Date.UTC(2026, 9, 20, Number(h)) - d * 864e5);
        files.push(`tw-x-${t.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z.manifest.json`);
      }
    const keep = [...retained(files, { daily: 7, weekly: 4, monthly: 6 })].sort();
    // 7 days (14:00 of each), ISO weeks 43,42,41,40 (Sundays + this week's newest), months Oct..Jun (last day of each)
    expect(keep).toContain("tw-x-20261020T140000Z.manifest.json");
    expect(keep).toContain("tw-x-20261014T140000Z.manifest.json");
    expect(keep).toContain("tw-x-20261011T140000Z.manifest.json"); // Sunday of week 41
    expect(keep).toContain("tw-x-20260930T140000Z.manifest.json"); // last of September
    expect(keep).toContain("tw-x-20260630T140000Z.manifest.json"); // oldest month that fits
    expect(keep.every((f) => f.includes("T14"))).toBe(true); // never the earlier backup of a day
    expect(keep.length).toBeLessThanOrEqual(7 + 4 + 6);
    expect(retained(files.slice(0, 1), { daily: 1, weekly: 0, monthly: 0 }).size).toBe(1);
  });

  it("reports stale backups, failed runs and failed or overdue drills", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const ok: BackupStatus = {
      lastBackup: { file: "a", at: "2026-10-20T02:30:00Z", bytes: 1, encrypted: true, durationMs: 1 },
      lastDrill: {
        file: "a",
        ok: true,
        startedAt: "2026-10-18T02:31:00Z",
        durationMs: 1,
        restoreMs: 1,
        source: "remote",
        backupAgeHours: 0,
        checks: [],
      },
      updatedAt: "",
    };
    const opts = { maxAgeHours: 26, drillMaxAgeDays: 8, now };
    expect(statusProblems(ok, opts)).toEqual([]);
    expect(statusProblems(undefined, opts)).toEqual(["no backup has been taken yet"]);
    expect(statusProblems({ ...ok, lastBackup: { ...ok.lastBackup!, at: "2026-10-18T02:30:00Z" } }, opts)[0]).toMatch(/57\.5 h old/);
    expect(statusProblems({ ...ok, lastFailure: { at: "2026-10-20T03:00:00Z", error: "disk full" } }, opts)).toEqual([
      "last backup run failed: disk full",
    ]);
    expect(statusProblems({ ...ok, lastDrill: { ...ok.lastDrill!, ok: false, error: "checksum mismatch" } }, opts)).toEqual([
      "last restore drill failed: checksum mismatch",
    ]);
    expect(statusProblems({ ...ok, lastDrill: { ...ok.lastDrill!, startedAt: "2026-10-01T00:00:00Z" } }, opts)[0]).toMatch(
      /drill is 19\.5 days old/,
    );
  });
});

// against a real PostgreSQL server and the real pg_dump / pg_restore (CI provides both, plus age and rclone)
const DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!DB || !has("pg_dump"))("backup → drill → restore on PostgreSQL", () => {
  const src = `tw_backup_src_${process.pid}`;
  const adminUrl = withDatabase(DB ?? "postgresql://x@localhost/x", "postgres");
  const srcUrl = withDatabase(DB ?? "postgresql://x@localhost/x", src) + "?schema=public";
  const useAge = has("age-keygen");
  const useRclone = has("rclone");
  let dir = "",
    identity: string | undefined,
    recipient: string | undefined;
  const admin = () => new pg.Client({ connectionString: adminUrl });
  const drillDbs = async () => {
    const c = admin();
    await c.connect();
    const { rows } = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'tw_drill_%'`);
    await c.end();
    return rows[0]!.n;
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "tw-backup-"));
    if (useAge) {
      identity = join(dir, "identity.txt");
      execFileSync("age-keygen", ["-o", identity], { stdio: "ignore" });
      recipient = execFileSync("age-keygen", ["-y", identity]).toString().trim();
    }
    const c = admin();
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${src} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${src}`);
    await c.end();
    const s = new pg.Client({ connectionString: withDatabase(DB!, src) });
    await s.connect();
    await s.query(`
      CREATE TABLE public._prisma_migrations (migration_name text, finished_at timestamptz, rolled_back_at timestamptz);
      INSERT INTO public._prisma_migrations VALUES ('20261020000000_init', now(), NULL), ('20261020210000_notifications', now(), NULL), ('x_rolled_back', now(), now());
      CREATE TABLE public."User" (id text PRIMARY KEY, email text, "createdAt" timestamptz, settings jsonb);
      INSERT INTO public."User" VALUES ('u1', 'survey@tradingworld.test', '2026-10-20 10:00:00+00', '{"notifications":{"push":true}}'), ('u2', 'المسّاح@tw.test', '2026-10-19 08:00:00+03', NULL);
      CREATE SCHEMA market;
      CREATE TABLE market.candles (symbol text, timeframe text, time timestamptz, open double precision, close double precision, PRIMARY KEY (symbol, timeframe, time));
      INSERT INTO market.candles SELECT 'XAUUSD', '1m', to_timestamp(1792400000 + g * 60), 2400 + g * 0.01, 2400.123456789 + g FROM generate_series(1, 5000) g;
    `);
    await s.end();
  });

  afterAll(async () => {
    const c = admin();
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${src} WITH (FORCE)`);
    await c.query(`DROP DATABASE IF EXISTS ${src}_restored WITH (FORCE)`);
    await c.end();
    await rm(dir, { recursive: true, force: true });
  });

  it("dumps inside one snapshot with a manifest, encrypts, copies offsite, and the drill restores it identically", async () => {
    const local = join(dir, "local"),
      offsite = join(dir, "offsite");
    const m = await createBackup({
      databaseUrl: srcUrl,
      dir: local,
      ageRecipients: recipient ? [recipient] : undefined,
      remote: useRclone ? offsite : undefined,
      hashMaxRows: 1000,
      now: new Date("2026-10-20T02:30:00Z"),
    });
    expect(m.file).toBe(`tw-${src}-20261020T023000Z.dump${useAge ? ".age" : ""}`);
    expect(m.migrations).toEqual(["20261020000000_init", "20261020210000_notifications"]);
    const t = Object.fromEntries(m.tables.map((x) => [x.table, x]));
    expect(t['public."User"']).toMatchObject({ rows: 2 });
    expect(t['public."User"']!.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(t["market.candles"]).toEqual({ table: "market.candles", rows: 5000 }); // above hashMaxRows: count only
    if (useAge) expect((await readFile(join(local, m.file))).subarray(0, 21).toString()).toBe("age-encryption.org/v1");
    if (useRclone) expect((await readdir(offsite)).sort()).toEqual([m.file, m.file.replace(/\.dump(\.age)?$/, ".manifest.json")].sort());

    const report = await drill({
      manifest: join(local, manifestPath(m.file)),
      drillUrl: adminUrl,
      ageIdentityFile: identity,
      fromRemote: useRclone ? offsite : undefined,
    });
    expect(report.checks.map((c) => [c.name, c.ok])).toEqual([
      ["checksum", true],
      ["restore", true],
      ["tables", true],
      ["migrations", true],
      ["api schema", true],
    ]);
    expect(report.ok).toBe(true);
    expect(report.source).toBe(useRclone ? "remote" : "local");
    expect(await drillDbs()).toBe(0); // the scratch database is gone

    // a disaster restore goes into an empty database only
    const c = admin();
    await c.connect();
    await c.query(`CREATE DATABASE ${src}_restored`);
    await c.end();
    const target = withDatabase(DB!, `${src}_restored`);
    await restoreInto(join(local, m.file), { targetUrl: target, ageIdentityFile: identity, timescale: false });
    const r = new pg.Client({ connectionString: target });
    await r.connect();
    const { rows } = await r.query<{ email: string }>(`SELECT email FROM public."User" ORDER BY id`);
    await r.end();
    expect(rows.map((x) => x.email)).toEqual(["survey@tradingworld.test", "المسّاح@tw.test"]);
    await expect(restoreInto(join(local, m.file), { targetUrl: target, ageIdentityFile: identity, timescale: false })).rejects.toThrow(
      /is not empty/,
    );
  });

  it("fails the drill on a corrupted file, on data that differs from the manifest, and on a missing key", async () => {
    const local = join(dir, "tamper");
    const m = await createBackup({
      databaseUrl: srcUrl,
      dir: local,
      ageRecipients: recipient ? [recipient] : undefined,
      hashMaxRows: 10_000,
    });
    const mf = join(local, manifestPath(m.file));

    const original = await readFile(join(local, m.file));
    const bad = Buffer.from(original);
    bad[Math.floor(bad.length / 2)]! ^= 0xff;
    await writeFile(join(local, m.file), bad);
    const corrupt = await drill({ manifest: mf, drillUrl: adminUrl, ageIdentityFile: identity });
    expect(corrupt.ok).toBe(false);
    expect(corrupt.checks[0]).toMatchObject({ name: "checksum", ok: false });
    await writeFile(join(local, m.file), original);

    const altered: Manifest = JSON.parse(await readFile(mf, "utf8"));
    altered.tables.find((x) => x.table === "market.candles")!.hash = "0".repeat(32);
    await writeFile(mf, JSON.stringify(altered));
    const differs = await drill({ manifest: mf, drillUrl: adminUrl, ageIdentityFile: identity });
    expect(differs.ok).toBe(false);
    expect(differs.checks.find((x) => x.name === "tables")).toMatchObject({ ok: false, detail: "market.candles content differs" });

    if (useAge) {
      const noKey = await drill({ manifest: mf, drillUrl: adminUrl });
      expect(noKey.ok).toBe(false);
      expect(noKey.error).toMatch(/BACKUP_AGE_IDENTITY_FILE/);
    }
    expect(await drillDbs()).toBe(0);
  });

  it("prunes local backups outside the retention policy", async () => {
    const local = join(dir, "prune");
    for (const day of ["20261018", "20261019", "20261020"])
      await createBackup({
        databaseUrl: srcUrl,
        dir: local,
        now: new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T02:30:00Z`),
      });
    const removed = await prune(local, { daily: 2, weekly: 0, monthly: 0 });
    expect(removed).toEqual([`tw-${src}-20261018T023000Z`]);
    expect((await readdir(local)).filter((f) => f.endsWith(".manifest.json")).length).toBe(2);
  });
});

describe("GET /admin/backups", () => {
  it("shows the job's status to admins only, with what to act on", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tw-backup-status-"));
    const app = await buildApp({
      config: loadConfig({
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-test-secret-123456",
        DATABASE_URL: "postgresql://tw@db.internal:5432/tradingworld",
        REPOSITORIES: "memory",
        CANDLE_STORE: "memory",
        BACKUP_DIR: dir,
        BACKUP_RCLONE_REMOTE: "r2:tw-backups/db",
      }),
      logger: false,
    });
    try {
      const reg = (email: string) =>
        app.inject({
          method: "POST",
          url: "/api/v1/auth/register",
          payload: { email, password: "kharita-2026", displayName: "Survey Ops" },
        });
      const admin = { authorization: `Bearer ${(await reg("ops@tw.test")).json().token}` };
      const user = { authorization: `Bearer ${(await reg("user@tw.test")).json().token}` };
      expect((await app.inject({ method: "GET", url: "/api/v1/admin/backups", headers: user })).statusCode).toBe(403);

      const before = (await app.inject({ method: "GET", url: "/api/v1/admin/backups", headers: admin })).json();
      expect(before).toMatchObject({ database: true, status: null, problems: ["no backup has been taken yet"] });
      expect(before.policy).toMatchObject({ at: "02:30", drill: "weekly", encrypted: false, offsite: "r2:tw-backups/db" });

      const now = new Date().toISOString();
      await writeStatus(dir, {
        lastBackup: { file: "tw-x.dump.age", at: now, bytes: 1024, encrypted: true, remote: "r2:tw-backups/db", durationMs: 900 },
        lastDrill: {
          file: "tw-x.dump.age",
          ok: true,
          startedAt: now,
          durationMs: 2000,
          restoreMs: 1500,
          source: "remote",
          backupAgeHours: 0,
          checks: [],
        },
      });
      const after = (await app.inject({ method: "GET", url: "/api/v1/admin/backups", headers: admin })).json();
      expect(after.problems).toEqual([]);
      expect(after.status.lastDrill.ok).toBe(true);
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
