/**
 * Backfill — fills the candle store from the configured sources with the real .env:
 *   node apps/api/dist/tools/backfill.js [SYMBOL|all=all] [BARS=BACKFILL_BARS] [--cycle]
 * Without --cycle: backfill the base timeframe to BARS bars, repair gaps, then derive every higher timeframe.
 * With --cycle: one maintenance cycle (catch-up → gaps → aggregation), the same thing the in-process job does.
 * Needs CANDLE_STORE=timescale (or DATABASE_URL); with the memory store it only proves the sources work.
 */
import { DEFAULT_INSTRUMENTS, findInstrument } from "@tradingworld/shared";
import { loadConfig } from "../config.js";
import { ProviderRegistry } from "../providers/registry.js";
import { BackfillService } from "../services/backfill.js";
import { createCandleStore } from "../store/index.js";

const args = process.argv.slice(2);
const cycle = args.includes("--cycle");
const [symbolArg = "all", barsArg] = args.filter((a) => !a.startsWith("--"));
const cfg = loadConfig();
const store = createCandleStore(cfg);
const registry = new ProviderRegistry(cfg, { store });
const service = new BackfillService(registry, store, {
  baseTimeframe: cfg.BACKFILL_BASE_TIMEFRAME,
  bars: barsArg ? Number(barsArg) : cfg.BACKFILL_BARS,
  pageSize: cfg.BACKFILL_PAGE_SIZE,
  includeDemo: cfg.BACKFILL_INCLUDE_DEMO || symbolArg !== "all",
  symbols:
    symbolArg === "all"
      ? cfg.BACKFILL_SYMBOLS?.split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : [symbolArg.toUpperCase()],
  log: (m) => console.log("  ·", m),
});
const stamp = (s?: number) => (s ? new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z" : "—");

console.log(`store    : ${store.kind}${store.kind === "memory" ? " (nothing persists — set CANDLE_STORE=timescale + DATABASE_URL)" : ""}`);
console.log("routes   :", Object.keys(registry.routes).length ? registry.routes : "(all demo)");
for (const w of registry.warnings) console.log("warning  :", w);
if (symbolArg !== "all" && !findInstrument(symbolArg)) {
  console.error(`unknown symbol ${symbolArg}; known: ${DEFAULT_INSTRUMENTS.map((i) => i.symbol).join(", ")}`);
  process.exit(1);
}
const targets = service.instruments();
if (!targets.length) {
  console.error("nothing to do: no instrument is routed to a real source (set MARKET_DATA_ROUTES, or BACKFILL_INCLUDE_DEMO=true)");
  process.exit(1);
}
console.log(`targets  : ${targets.map((i) => `${i.symbol}←${registry.for(i).id}`).join("  ")}`);

let failed = false;
try {
  if (cycle) {
    for (const r of await service.runOnce())
      console.log(`  ${r.kind.padEnd(9)} ${r.symbol} ${r.timeframe}: ${r.status} · ${r.bars} bars${r.error ? ` · ${r.error}` : ""}`);
  } else {
    for (const i of targets) {
      const b = await service.backfill(i.symbol);
      console.log(`  backfill  ${i.symbol} ${b.timeframe}: ${b.status} · ${b.bars} bars · ${stamp(b.from)} → ${stamp(b.to)}`);
      const g = await service.repairGaps(i.symbol);
      console.log(`  gaps      ${i.symbol}: ${g.status} · ${g.bars} bars`);
      const a = await service.aggregateDerived(i.symbol, "full");
      console.log(`  aggregate ${i.symbol}: ${a.status} · ${a.bars} derived bars`);
    }
  }
  console.log("coverage :");
  for (const s of await store.series())
    console.log(
      `  ${s.symbol.padEnd(7)} ${s.timeframe.padEnd(3)} ${String(s.count).padStart(6)} bars  ${stamp(s.first)} → ${stamp(s.last)}`,
    );
} catch (e) {
  failed = true;
  console.error("FAIL     :", (e as Error).message);
} finally {
  registry.close();
  await store.close();
}
process.exit(failed ? 1 : 0);
