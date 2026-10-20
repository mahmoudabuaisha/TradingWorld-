import { z } from "zod";

/** Env boolean: "true"/"1" → true, anything else → false (z.coerce.boolean() would turn "false" into true). */
const envBool = z.preprocess((v) => v === true || v === "true" || v === "1", z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(16).default("dev-only-secret-change-me-please-now"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  /** users, alerts, journal, watchlists, zone log, audit: memory (default without DATABASE_URL) or PostgreSQL via Prisma (DB-02) */
  REPOSITORIES: z.enum(["auto", "memory", "prisma"]).default("auto"),
  /** NOTIF-01: server-side alert watcher (alerts fire without anyone watching the chart) */
  ALERT_WATCH_ENABLED: envBool.default(true),
  ALERT_POLL_SECONDS: z.coerce.number().int().min(5).default(15),
  /** Web Push (VAPID) — generate once: node apps/api/dist/tools/vapid-keys.js */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  /** email: smtp(s)://user:pass@host:port — unset disables the email channel */
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("TradingWorld <alerts@tradingworld.local>"),
  /** public web URL used in notification links (defaults to the first CORS origin) */
  APP_URL: z.string().optional(),
  /** OPS-01 logs: pino level */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** OPS-01 OpenTelemetry: OTLP/HTTP base URL (collector, Grafana Cloud, Honeycomb…); enables traces and metric push */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** vendor headers for the OTLP endpoint, "k=v,k2=v2" */
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default("tradingworld-api"),
  /** share of new traces kept, 0..1 (a trace's children follow it) */
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(1),
  /** print spans to stdout (debugging without a collector) */
  OTEL_TRACES_CONSOLE: envBool.default(false),
  /** bearer token for GET /metrics (Prometheus format); required in production, optional in development */
  METRICS_TOKEN: z.string().min(16).optional(),
  /** OPS-01 watchdog: checks the process every minute and notifies admins (inbox/push/email) and the webhook */
  OPS_WATCHDOG_ENABLED: envBool.default(true),
  /** POST target for ops alerts: Slack/Discord/Teams-compatible JSON ({ text, content }) */
  OPS_ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** re-notify a still-firing alert after this many hours */
  OPS_ALERT_REPEAT_HOURS: z.coerce.number().min(0.25).default(4),
  OPS_ERROR_RATIO: z.coerce.number().min(0).max(1).default(0.05),
  OPS_P95_MS: z.coerce.number().min(50).default(2000),
  OPS_FEED_DOWN_MINUTES: z.coerce.number().min(1).default(5),
  OPS_EVENT_LOOP_P99_MS: z.coerce.number().min(10).default(500),
  OPS_HEAP_RATIO: z.coerce.number().min(0.1).max(1).default(0.85),
  /** OPS-02 backups (node apps/api/dist/tools/backup.js): where dumps, manifests and status.json live */
  BACKUP_DIR: z.string().default("./backups"),
  /** daily backup time for `backup schedule`, HH:MM UTC */
  BACKUP_AT: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("02:30"),
  /** restore drill after the scheduled backup: every day, once a week, or never */
  BACKUP_DRILL: z.enum(["daily", "weekly", "off"]).default("weekly"),
  /** connection with CREATE DATABASE rights for the drill's scratch database (default: DATABASE_URL's server) */
  BACKUP_DRILL_URL: z.string().optional(),
  /** age public keys (age1…, comma-separated): dumps are encrypted to them; the private key stays off the backup host */
  BACKUP_AGE_RECIPIENTS: z.string().optional(),
  /** age identity (private key) file, needed only where drills or restores run */
  BACKUP_AGE_IDENTITY_FILE: z.string().optional(),
  /** rclone destination for the offsite copy, e.g. r2:tradingworld-backups/db (remote configured via RCLONE_CONFIG_*) */
  BACKUP_RCLONE_REMOTE: z.string().optional(),
  BACKUP_KEEP_DAILY: z.coerce.number().int().min(1).default(7),
  BACKUP_KEEP_WEEKLY: z.coerce.number().int().min(0).default(4),
  BACKUP_KEEP_MONTHLY: z.coerce.number().int().min(0).default(6),
  /** `backup status --check` fails beyond these (container healthcheck, admin sheet) */
  BACKUP_MAX_AGE_HOURS: z.coerce.number().min(1).default(26),
  BACKUP_DRILL_MAX_AGE_DAYS: z.coerce.number().min(1).default(8),
  /** tables up to this many rows also get a content hash in the manifest, compared row for row by the drill */
  BACKUP_HASH_MAX_ROWS: z.coerce.number().int().min(0).default(200_000),
  /** AI-01 outcome tracker: labels every observed zone once it is invalidated or OUTCOME_HORIZON_BARS have closed */
  OUTCOME_ENABLED: envBool.default(true),
  OUTCOME_HORIZON_BARS: z.coerce.number().int().min(10).max(2000).default(120),
  OUTCOME_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  /** analysed every run so the dataset grows without viewers, e.g. "XAUUSD:15m,EURUSD:15m,US100:1h" */
  OUTCOME_SCAN: z.string().optional(),
  /** where candles live: memory (default without DATABASE_URL) or the Timescale/PostgreSQL store */
  CANDLE_STORE: z.enum(["auto", "memory", "timescale"]).default("auto"),
  /** DATA-02 maintenance job: backfill, catch-up, gap repair and timeframe aggregation into the store */
  BACKFILL_ENABLED: envBool.default(false),
  BACKFILL_BASE_TIMEFRAME: z.enum(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "12h", "1d", "1w", "1M"]).default("1m"),
  BACKFILL_BARS: z.coerce.number().int().min(100).default(20000),
  BACKFILL_PAGE_SIZE: z.coerce.number().int().min(100).max(5000).default(5000),
  BACKFILL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  BACKFILL_AGGREGATE_SECONDS: z.coerce.number().int().min(10).default(60),
  BACKFILL_INCLUDE_DEMO: envBool.default(false),
  BACKFILL_SYMBOLS: z.string().optional(),
  /** legacy single-provider switch; MARKET_DATA_ROUTES wins when set */
  MARKET_DATA_PROVIDER: z.enum(["demo", "binance", "twelvedata", "polygon"]).default("demo"),
  /** per-asset-class routing, e.g. "forex=twelvedata,metal=twelvedata,index=twelvedata,commodity=twelvedata,crypto=binance,stock=polygon" */
  MARKET_DATA_ROUTES: z.string().optional(),
  BINANCE_BASE_URL: z.string().default("https://api.binance.com"),
  TWELVEDATA_API_KEY: z.string().optional(),
  TWELVEDATA_PLAN: z.string().optional(),
  TWELVEDATA_CREDITS_PER_MINUTE: z.coerce.number().int().positive().default(8),
  TWELVEDATA_WS: envBool.default(false),
  TWELVEDATA_POLL_SECONDS: z.coerce.number().int().min(5).default(15),
  POLYGON_API_KEY: z.string().optional(),
  POLYGON_PLAN: z.string().optional(),
  POLYGON_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(5),
  POLYGON_WS: envBool.default(false),
  POLYGON_POLL_SECONDS: z.coerce.number().int().min(5).default(15),
  AI_PROVIDER: z.enum(["anthropic", "none"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  AI_MAX_TOKENS: z.coerce.number().default(1024),
});

export type Config = z.infer<typeof schema>;

/** `requireJwtSecret: false` for tools that never sign or verify tokens (the backup job) */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, opts: { requireJwtSecret?: boolean } = {}): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
  }
  const cfg = parsed.data;
  if ((opts.requireJwtSecret ?? true) && cfg.NODE_ENV === "production" && cfg.JWT_SECRET.startsWith("dev-only")) {
    throw new Error("JWT_SECRET must be set in production");
  }
  return cfg;
}
