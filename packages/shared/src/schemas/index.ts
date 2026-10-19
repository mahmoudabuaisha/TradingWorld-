import { z } from "zod";
import { TIMEFRAMES } from "../timeframes.js";

export const timeframeSchema = z.enum(TIMEFRAMES);

/** Query-string boolean: "true"/"1" → true, anything else → false. (z.coerce.boolean() would turn "false" into true.) */
export const queryBool = z.preprocess((v) => v === true || v === "true" || v === "1", z.boolean());

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(60),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const candlesQuerySchema = z.object({
  symbol: z.string().min(3).max(20),
  timeframe: timeframeSchema,
  limit: z.coerce.number().int().min(10).max(5000).default(500),
  to: z.coerce.number().int().optional(), // unix seconds, exclusive end
});

export const analysisQuerySchema = z.object({
  symbol: z.string().min(3).max(20),
  timeframe: timeframeSchema,
  limit: z.coerce.number().int().min(100).max(5000).default(600),
  includeLowQuality: queryBool.default(false),
  includeInvalidated: queryBool.default(false),
  locale: z.enum(["ar", "en"]).default("ar"),
});

export const alertCreateSchema = z.object({
  symbol: z.string().min(3).max(20),
  kind: z.enum(["price_above", "price_below", "zone_enter"]),
  price: z.number().optional(),
  zoneId: z.string().optional(),
  note: z.string().max(200).optional(),
});

export const watchlistUpdateSchema = z.object({
  symbols: z.array(z.string().min(3).max(20)).max(50),
});

export const journalTradeSchema = z.object({
  symbol: z.string().min(3).max(20),
  direction: z.enum(["long", "short"]),
  entry: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive().optional(),
  size: z.number().positive(),
  riskAmount: z.number().nonnegative().optional(),
  openedAt: z.number().int(),
  closedAt: z.number().int().optional(),
  exitPrice: z.number().positive().optional(),
  setup: z.string().max(80).optional(),
  strategy: z.string().max(80).optional(),
  reason: z.string().max(2000).optional(),
  emotion: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  zoneId: z.string().optional(),
});

export const aiChatSchema = z.object({
  symbol: z.string().min(3).max(20),
  timeframe: timeframeSchema,
  question: z.string().min(2).max(1000),
  locale: z.enum(["ar", "en"]).default("ar"),
  zoneId: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CandlesQuery = z.infer<typeof candlesQuerySchema>;
export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;
export type AlertCreateInput = z.infer<typeof alertCreateSchema>;
export type JournalTradeInput = z.infer<typeof journalTradeSchema>;
export type AiChatInput = z.infer<typeof aiChatSchema>;
