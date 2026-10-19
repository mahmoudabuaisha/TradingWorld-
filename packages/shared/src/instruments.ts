/**
 * Instrument Master — a central registry of tradable symbols.
 * The platform never assumes a single provider covers every asset.
 */
export type AssetClass = "forex" | "metal" | "crypto" | "index" | "stock" | "commodity";

export interface Instrument {
  symbol: string;          // canonical symbol used inside the platform (e.g. XAUUSD)
  name: string;
  nameAr: string;
  assetClass: AssetClass;
  base: string;            // base currency / underlying
  quote: string;           // quote currency
  pricePrecision: number;  // decimal places for display
  pipSize: number;         // size of one "pip"/point for calculators
  contractSize: number;    // standard lot size (units of base)
  sessionTimezone: string; // exchange / reference timezone
  providerSymbols: Partial<Record<"demo" | "binance" | "twelvedata" | "polygon", string>>;
}

export const DEFAULT_INSTRUMENTS: Instrument[] = [
  { symbol: "XAUUSD", name: "Gold / US Dollar", nameAr: "الذهب / دولار", assetClass: "metal", base: "XAU", quote: "USD", pricePrecision: 2, pipSize: 0.1, contractSize: 100, sessionTimezone: "UTC", providerSymbols: { demo: "XAUUSD", twelvedata: "XAU/USD" } },
  { symbol: "XAGUSD", name: "Silver / US Dollar", nameAr: "الفضة / دولار", assetClass: "metal", base: "XAG", quote: "USD", pricePrecision: 3, pipSize: 0.01, contractSize: 5000, sessionTimezone: "UTC", providerSymbols: { demo: "XAGUSD", twelvedata: "XAG/USD" } },
  { symbol: "EURUSD", name: "Euro / US Dollar", nameAr: "يورو / دولار", assetClass: "forex", base: "EUR", quote: "USD", pricePrecision: 5, pipSize: 0.0001, contractSize: 100000, sessionTimezone: "UTC", providerSymbols: { demo: "EURUSD", twelvedata: "EUR/USD" } },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", nameAr: "جنيه إسترليني / دولار", assetClass: "forex", base: "GBP", quote: "USD", pricePrecision: 5, pipSize: 0.0001, contractSize: 100000, sessionTimezone: "UTC", providerSymbols: { demo: "GBPUSD", twelvedata: "GBP/USD" } },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", nameAr: "دولار / ين ياباني", assetClass: "forex", base: "USD", quote: "JPY", pricePrecision: 3, pipSize: 0.01, contractSize: 100000, sessionTimezone: "UTC", providerSymbols: { demo: "USDJPY", twelvedata: "USD/JPY" } },
  { symbol: "BTCUSD", name: "Bitcoin / US Dollar", nameAr: "بيتكوين / دولار", assetClass: "crypto", base: "BTC", quote: "USD", pricePrecision: 2, pipSize: 1, contractSize: 1, sessionTimezone: "UTC", providerSymbols: { demo: "BTCUSD", binance: "BTCUSDT" } },
  { symbol: "ETHUSD", name: "Ethereum / US Dollar", nameAr: "إيثيريوم / دولار", assetClass: "crypto", base: "ETH", quote: "USD", pricePrecision: 2, pipSize: 0.1, contractSize: 1, sessionTimezone: "UTC", providerSymbols: { demo: "ETHUSD", binance: "ETHUSDT" } },
  { symbol: "US100", name: "Nasdaq 100", nameAr: "ناسداك 100", assetClass: "index", base: "NDX", quote: "USD", pricePrecision: 2, pipSize: 1, contractSize: 1, sessionTimezone: "America/New_York", providerSymbols: { demo: "US100", twelvedata: "NDX" } },
  { symbol: "US500", name: "S&P 500", nameAr: "ستاندرد آند بورز 500", assetClass: "index", base: "SPX", quote: "USD", pricePrecision: 2, pipSize: 0.25, contractSize: 1, sessionTimezone: "America/New_York", providerSymbols: { demo: "US500", twelvedata: "SPX" } },
  { symbol: "USOIL", name: "WTI Crude Oil", nameAr: "النفط الخام", assetClass: "commodity", base: "WTI", quote: "USD", pricePrecision: 2, pipSize: 0.01, contractSize: 1000, sessionTimezone: "America/New_York", providerSymbols: { demo: "USOIL", twelvedata: "WTI/USD" } },
];

export function findInstrument(symbol: string): Instrument | undefined {
  return DEFAULT_INSTRUMENTS.find((i) => i.symbol === symbol.toUpperCase());
}
