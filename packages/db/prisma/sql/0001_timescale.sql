-- Market data tables are owned by SQL, not by Prisma: hypertables, compression and retention do not fit
-- Prisma migrations. The API creates the plain tables itself when they are missing (apps/api/src/store/timescale.ts);
-- this file adds the TimescaleDB layer. Executed automatically by docker-compose on first start
-- (docker-entrypoint-initdb.d); run manually on existing databases: psql $DATABASE_URL -f this-file.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS market_candles (
  symbol      text NOT NULL,
  timeframe   text NOT NULL,
  time        timestamptz NOT NULL,
  open        double precision NOT NULL,
  high        double precision NOT NULL,
  low         double precision NOT NULL,
  close       double precision NOT NULL,
  volume      double precision,
  provider    text NOT NULL,            -- source id, or aggregate:<base timeframe> for locally derived bars
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, timeframe, time)
);
CREATE INDEX IF NOT EXISTS market_candles_series_time_desc ON market_candles (symbol, timeframe, time DESC);

CREATE TABLE IF NOT EXISTS market_backfills (
  id          bigserial PRIMARY KEY,
  symbol      text NOT NULL,
  timeframe   text NOT NULL,
  kind        text NOT NULL,            -- backfill | catchup | gaps | aggregate
  from_time   timestamptz,
  to_time     timestamptz,
  bars        integer NOT NULL DEFAULT 0,
  status      text NOT NULL,            -- running | done | failed
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- 7-day chunks; compress chunks older than 30 days (OHLC is append-mostly). Re-backfilling into a compressed
-- range needs the chunks decompressed first: SELECT decompress_chunk(c) FROM show_chunks('market_candles', older_than => INTERVAL '30 days') c;
SELECT create_hypertable('market_candles', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days', migrate_data => TRUE);
ALTER TABLE market_candles SET (timescaledb.compress, timescaledb.compress_segmentby = 'symbol, timeframe', timescaledb.compress_orderby = 'time DESC');
SELECT add_compression_policy('market_candles', INTERVAL '30 days', if_not_exists => TRUE);
