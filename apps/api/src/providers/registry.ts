import type { Instrument } from "@tradingworld/shared";
import type { Config } from "../config.js";
import type { MarketDataProvider } from "./types.js";
import { DemoProvider } from "./demo.js";
import { BinanceProvider } from "./binance.js";
import { TwelveDataProvider } from "./twelvedata.js";

/** Chooses the configured provider per instrument, always falling back to demo so dev never breaks. */
export class ProviderRegistry {
  private providers: MarketDataProvider[] = [];
  private demo = new DemoProvider();

  constructor(cfg: Config) {
    if (cfg.MARKET_DATA_PROVIDER === "binance") this.providers.push(new BinanceProvider(cfg.BINANCE_BASE_URL));
    if (cfg.MARKET_DATA_PROVIDER === "twelvedata" && cfg.TWELVEDATA_API_KEY) this.providers.push(new TwelveDataProvider(cfg.TWELVEDATA_API_KEY));
    this.providers.push(this.demo);
  }

  for(instrument: Instrument): MarketDataProvider {
    return this.providers.find((p) => p.supports(instrument)) ?? this.demo;
  }

  all(): MarketDataProvider[] { return this.providers; }
}
