/**
 * Database client entry point.
 * `pnpm --filter @tradingworld/db generate` must run (with DATABASE_URL set) before importing.
 * The API currently uses in-memory repositories by default; Prisma repositories are the next step
 * (tracked in PROGRESS.md → "DB-02").
 */
export * from "../generated/client/index.js";
