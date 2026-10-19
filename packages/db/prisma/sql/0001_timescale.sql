-- Executed automatically by docker-compose on first start (docker-entrypoint-initdb.d).
-- Run manually after `prisma migrate` on existing databases.
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Prisma creates the "Candle" table; convert it into a hypertable once it exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Candle') THEN
    PERFORM create_hypertable('"Candle"', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');
    -- compress chunks older than 30 days (OHLC is append-only)
    ALTER TABLE "Candle" SET (timescaledb.compress, timescaledb.compress_segmentby = 'symbol, timeframe');
    PERFORM add_compression_policy('"Candle"', INTERVAL '30 days', if_not_exists => TRUE);
  END IF;
END $$;
