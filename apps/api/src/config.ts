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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production" && cfg.JWT_SECRET.startsWith("dev-only")) {
    throw new Error("JWT_SECRET must be set in production");
  }
  return cfg;
}
