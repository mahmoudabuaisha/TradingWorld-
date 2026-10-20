/**
 * Feed check — verifies a configured market-data route end to end with the real .env:
 *   node apps/api/dist/tools/feed-check.js [SYMBOL=EURUSD] [TIMEFRAME=5m] [STREAM_SECONDS=0]
 * Prints the routing table, warnings, the provider's status before/after a REST fetch (budget use),
 * the last candles, and — with STREAM_SECONDS > 0 — how many live updates arrived. Exit code 1 on failure.
 * Run it once after signing a plan, and again whenever a key or plan changes (docs/03 go-live checklist).
 */
import { findInstrument, isTimeframe, DEFAULT_INSTRUMENTS } from "@tradingworld/shared";
import { loadConfig } from "../config.js";
import { ProviderRegistry } from "../providers/registry.js";

const [symbolArg = "EURUSD", tfArg = "5m", streamArg = "0"] = process.argv.slice(2);
const instrument = findInstrument(symbolArg);
if (!instrument) {
  console.error(`unknown symbol ${symbolArg}; known: ${DEFAULT_INSTRUMENTS.map((i) => i.symbol).join(", ")}`);
  process.exit(1);
}
if (!isTimeframe(tfArg)) {
  console.error(`unknown timeframe ${tfArg}`);
  process.exit(1);
}
const streamSeconds = Math.max(0, Number(streamArg) || 0);

const cfg = loadConfig();
const registry = new ProviderRegistry(cfg);
const stamp = (s?: number) => (s ? new Date(s * 1000).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");

console.log("routes   :", Object.keys(registry.routes).length ? registry.routes : "(all demo)");
for (const w of registry.warnings) console.log("warning  :", w);
const provider = registry.for(instrument);
console.log(
  `provider : ${provider.id} for ${instrument.symbol} (${instrument.assetClass}) — symbol at source: ${instrument.providerSymbols[provider.id] ?? "n/a"}`,
);
console.log("before   :", provider.status());

try {
  const t0 = Date.now();
  const candles = await provider.getCandles(instrument, tfArg, 200);
  console.log(`candles  : ${candles.length} bars in ${Date.now() - t0} ms; last 3:`);
  for (const c of candles.slice(-3))
    console.log(`           ${stamp(c.time)}  O ${c.open}  H ${c.high}  L ${c.low}  C ${c.close}  V ${c.volume ?? "—"}`);
  if (candles.length < 50) {
    console.error("FAIL     : fewer than 50 bars — the engine needs at least 50");
    process.exit(1);
  }
  const gaps = candles.slice(1).filter((c, i) => c.time <= candles[i]!.time).length;
  if (gaps) {
    console.error(`FAIL     : ${gaps} non-ascending timestamps`);
    process.exit(1);
  }
} catch (e) {
  console.error("FAIL     :", (e as Error).message);
  console.log("after    :", provider.status());
  process.exit(1);
}
console.log("after    :", provider.status());
console.log("feed     :", registry.feed(instrument));

if (streamSeconds > 0) {
  let updates = 0,
    closed = 0,
    last: number | undefined;
  console.log(`stream   : subscribing for ${streamSeconds}s …`);
  const off = provider.subscribe(instrument, tfArg, (u) => {
    updates++;
    if (u.closed) closed++;
    last = u.candle.close;
  });
  await new Promise((r) => setTimeout(r, streamSeconds * 1000));
  off();
  console.log(`stream   : ${updates} updates (${closed} closed candles), last close ${last ?? "—"}`);
  console.log("feed     :", registry.feed(instrument));
  if (!updates) {
    console.error("FAIL     : no live updates — check the plan's WebSocket entitlement or the poll interval");
    registry.close();
    process.exit(1);
  }
}
registry.close();
console.log("OK");
process.exit(0);
