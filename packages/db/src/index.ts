/**
 * Database client entry point. `prisma generate` runs as part of `pnpm --filter @tradingworld/db build`
 * (no database needed); migrations are applied with `pnpm --filter @tradingworld/db migrate:deploy`.
 * The generated client is CommonJS; Node's CJS interop exposes these named exports to ESM importers.
 */
export { PrismaClient, Prisma } from "../generated/client/index.js";
export type { User, Alert, Trade, Watchlist, AuditLog, ZoneLog, Instrument } from "../generated/client/index.js";
