import { z } from "zod";

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
  MARKET_DATA_PROVIDER: z.enum(["demo", "binance", "twelvedata"]).default("demo"),
  BINANCE_BASE_URL: z.string().default("https://api.binance.com"),
  TWELVEDATA_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(["anthropic", "none"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  AI_MAX_TOKENS: z.coerce.number().default(1024),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production" && cfg.JWT_SECRET.startsWith("dev-only")) {
    throw new Error("JWT_SECRET must be set in production");
  }
  return cfg;
}
