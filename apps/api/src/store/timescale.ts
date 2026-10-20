import pg from "pg";
import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe } from "@tradingworld/shared";
import type { CandleStore, CandleSource, SeriesRange, UpsertOptions } from "./candleStore.js";

/**
 * Lives in its own Postgres schema `market`, so Prisma owns `public` alone (`migrate deploy` refuses a non-empty
 * schema it did not create — P3005). Owned by the store, not by Prisma: hypertables, compression and retention are managed in SQL
 * (packages/db/prisma/sql/0001_timescale.sql turns `market.candles` into a hypertable when TimescaleDB is present).
 * This DDL is plain PostgreSQL so the store also works without the extension (tests, small deployments).
 */
export const CANDLE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS market;
CREATE TABLE IF NOT EXISTS market.candles (
  symbol      text NOT NULL,
  timeframe   text NOT NULL,
  time        timestamptz NOT NULL,
  open        double precision NOT NULL,
  high        double precision NOT NULL,
  low         double precision NOT NULL,
  close       double precision NOT NULL,
  volume      double precision,
  provider    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, timeframe, time)
);
CREATE INDEX IF NOT EXISTS candles_series_time_desc ON market.candles (symbol, timeframe, time DESC);
CREATE TABLE IF NOT EXISTS market.backfills (
  id          bigserial PRIMARY KEY,
  symbol      text NOT NULL,
  timeframe   text NOT NULL,
  kind        text NOT NULL,
  from_time   timestamptz,
  to_time     timestamptz,
  bars        integer NOT NULL DEFAULT 0,
  status      text NOT NULL,
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
`;

export interface BackfillRunRow {
  id: number;
  symbol: string;
  timeframe: string;
  kind: string;
  from?: number;
  to?: number;
  bars: number;
  status: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const UPSERT_BATCH = 5000;

/**
 * PostgreSQL / TimescaleDB candle store. Bulk upserts go through `unnest` arrays (one statement per 5000 rows);
 * reads are index-backed on (symbol, timeframe, time DESC).
 */
export class TimescaleCandleStore implements CandleStore {
  readonly kind = "timescale" as const;
  private readonly pool: pg.Pool;
  private ready?: Promise<void>;

  constructor(connectionString: string, opts: { max?: number } = {}) {
    this.pool = new pg.Pool({ connectionString, max: opts.max ?? 5 });
  }

  /** Creates the tables when missing (idempotent). Called lazily before the first query. */
  ensureSchema(): Promise<void> {
    return (this.ready ??= this.pool.query(CANDLE_SCHEMA_SQL).then(() => undefined));
  }

  async read(symbol: string, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    await this.ensureSchema();
    const params: unknown[] = [symbol, tf, limit];
    const bound = to !== undefined ? ` AND time < to_timestamp($4)` : "";
    if (to !== undefined) params.push(to);
    const { rows } = await this.pool.query<{ t: string; open: number; high: number; low: number; close: number; volume: number | null }>(
      `SELECT extract(epoch FROM time)::bigint AS t, open, high, low, close, volume FROM market.candles WHERE symbol = $1 AND timeframe = $2${bound} ORDER BY time DESC LIMIT $3`,
      params,
    );
    return rows.reverse().map(toCandle);
  }

  async readRange(symbol: string, tf: Timeframe, from: number, to: number): Promise<Candle[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ t: string; open: number; high: number; low: number; close: number; volume: number | null }>(
      `SELECT extract(epoch FROM time)::bigint AS t, open, high, low, close, volume FROM market.candles WHERE symbol = $1 AND timeframe = $2 AND time >= to_timestamp($3) AND time < to_timestamp($4) ORDER BY time ASC`,
      [symbol, tf, from, to],
    );
    return rows.map(toCandle);
  }

  async upsert(symbol: string, tf: Timeframe, candles: Candle[], source: CandleSource, opts: UpsertOptions = {}): Promise<number> {
    if (!candles.length) return 0;
    await this.ensureSchema();
    // derived rows may only replace other derived rows; native rows replace anything
    const guard = opts.mode === "derived" ? ` WHERE c.provider LIKE 'aggregate:%'` : "";
    let written = 0;
    for (let i = 0; i < candles.length; i += UPSERT_BATCH) {
      const batch = candles.slice(i, i + UPSERT_BATCH);
      const res = await this.pool.query(
        `INSERT INTO market.candles AS c (symbol, timeframe, time, open, high, low, close, volume, provider, received_at)
         SELECT $1, $2, to_timestamp(t), o, h, l, c, v, $3, now()
         FROM unnest($4::bigint[], $5::float8[], $6::float8[], $7::float8[], $8::float8[], $9::float8[]) AS u(t, o, h, l, c, v)
         ON CONFLICT (symbol, timeframe, time) DO UPDATE
           SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume, provider = EXCLUDED.provider, received_at = now()${guard}`,
        [
          symbol,
          tf,
          source,
          batch.map((c) => c.time),
          batch.map((c) => c.open),
          batch.map((c) => c.high),
          batch.map((c) => c.low),
          batch.map((c) => c.close),
          batch.map((c) => c.volume ?? null),
        ],
      );
      written += res.rowCount ?? 0;
    }
    return written;
  }

  async range(symbol: string, tf: Timeframe): Promise<SeriesRange | undefined> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ first: string | null; last: string | null; count: string }>(
      `SELECT extract(epoch FROM min(time))::bigint AS first, extract(epoch FROM max(time))::bigint AS last, count(*) AS count FROM market.candles WHERE symbol = $1 AND timeframe = $2`,
      [symbol, tf],
    );
    const r = rows[0];
    if (!r || r.first === null || r.last === null) return undefined;
    return { symbol, timeframe: tf, first: Number(r.first), last: Number(r.last), count: Number(r.count) };
  }

  async series(): Promise<SeriesRange[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ symbol: string; timeframe: Timeframe; first: string; last: string; count: string }>(
      `SELECT symbol, timeframe, extract(epoch FROM min(time))::bigint AS first, extract(epoch FROM max(time))::bigint AS last, count(*) AS count FROM market.candles GROUP BY symbol, timeframe ORDER BY symbol, timeframe`,
    );
    return rows.map((r) => ({
      symbol: r.symbol,
      timeframe: r.timeframe,
      first: Number(r.first),
      last: Number(r.last),
      count: Number(r.count),
    }));
  }

  // ── backfill run log ────────────────────────────────────────────────────────
  async logRun(run: {
    symbol: string;
    timeframe: string;
    kind: string;
    from?: number;
    to?: number;
    bars: number;
    status: string;
    error?: string;
    startedAt: number;
    finishedAt?: number;
  }): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO market.backfills (symbol, timeframe, kind, from_time, to_time, bars, status, error, started_at, finished_at)
       VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($5), $6, $7, $8, to_timestamp($9), to_timestamp($10))`,
      [
        run.symbol,
        run.timeframe,
        run.kind,
        run.from ?? null,
        run.to ?? null,
        run.bars,
        run.status,
        run.error ?? null,
        run.startedAt / 1000,
        run.finishedAt ? run.finishedAt / 1000 : null,
      ],
    );
  }

  async recentRuns(limit = 50): Promise<BackfillRunRow[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{
      id: string;
      symbol: string;
      timeframe: string;
      kind: string;
      from_time: Date | null;
      to_time: Date | null;
      bars: number;
      status: string;
      error: string | null;
      started_at: Date;
      finished_at: Date | null;
    }>(`SELECT * FROM market.backfills ORDER BY started_at DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      id: Number(r.id),
      symbol: r.symbol,
      timeframe: r.timeframe,
      kind: r.kind,
      from: r.from_time ? Math.floor(r.from_time.getTime() / 1000) : undefined,
      to: r.to_time ? Math.floor(r.to_time.getTime() / 1000) : undefined,
      bars: r.bars,
      status: r.status,
      error: r.error ?? undefined,
      startedAt: r.started_at.getTime(),
      finishedAt: r.finished_at ? r.finished_at.getTime() : undefined,
    }));
  }

  /** test helper */
  async truncate(): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(`TRUNCATE market.candles, market.backfills`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function toCandle(r: { t: string; open: number; high: number; low: number; close: number; volume: number | null }): Candle {
  return { time: Number(r.t), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? undefined };
}
