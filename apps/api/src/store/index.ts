import type { Config } from "../config.js";
import { MemoryCandleStore, type CandleStore } from "./candleStore.js";
import { TimescaleCandleStore } from "./timescale.js";

export type { CandleStore, SeriesRange, CandleSource, UpsertOptions } from "./candleStore.js";
export { MemoryCandleStore } from "./candleStore.js";
export { TimescaleCandleStore } from "./timescale.js";

/** memory unless CANDLE_STORE=timescale (or auto with DATABASE_URL set). */
export function createCandleStore(cfg: Pick<Config, "CANDLE_STORE" | "DATABASE_URL">): CandleStore {
  const useDb = cfg.CANDLE_STORE === "timescale" || (cfg.CANDLE_STORE === "auto" && !!cfg.DATABASE_URL);
  if (useDb) {
    if (!cfg.DATABASE_URL) throw new Error("CANDLE_STORE=timescale needs DATABASE_URL");
    return new TimescaleCandleStore(cfg.DATABASE_URL);
  }
  return new MemoryCandleStore();
}
