import {
  DEFAULT_INSTRUMENTS,
  marketState,
  type AssetClass,
  type Instrument,
  type FeedStatus,
  type ProviderId,
  type ProviderStatus,
} from "@tradingworld/shared";
import type { Config } from "../config.js";
import type { MarketDataProvider } from "./types.js";
import { DemoProvider } from "./demo.js";
import { BinanceProvider } from "./binance.js";
import { TwelveDataProvider } from "./twelvedata.js";
import { PolygonProvider } from "./polygon.js";
import { CachedProvider } from "./support/cached.js";
import { staleAfterMs } from "./support/status.js";
import type { CandleStore } from "../store/candleStore.js";

export type Routes = Partial<Record<AssetClass, ProviderId>>;

export const ASSET_CLASSES: AssetClass[] = ["forex", "metal", "crypto", "index", "stock", "commodity"];
const PROVIDER_IDS: ProviderId[] = ["demo", "binance", "twelvedata", "polygon"];

/** "forex=twelvedata,crypto=binance" → routes. Bad entries are reported, not thrown: a typo in a dev .env must not stop the API. */
export function parseRoutes(spec: string | undefined): { routes: Routes; errors: string[] } {
  const routes: Routes = {};
  const errors: string[] = [];
  for (const raw of (spec ?? "").split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const [cls, id] = entry.split("=").map((s) => s.trim().toLowerCase());
    if (!cls || !id || !(ASSET_CLASSES as string[]).includes(cls) || !(PROVIDER_IDS as string[]).includes(id)) {
      errors.push(`MARKET_DATA_ROUTES: cannot parse "${entry}" (expected <asset class>=<provider>)`);
      continue;
    }
    routes[cls as AssetClass] = id as ProviderId;
  }
  return { routes, errors };
}

export interface RegistryDeps {
  /** test seam: pre-built providers by id */
  providers?: Partial<Record<ProviderId, MarketDataProvider>>;
  /** candle store shared by every budgeted provider (memory when omitted) */
  store?: CandleStore;
  now?: () => number;
}

/**
 * Routes every instrument to a data source by asset class and always falls back to demo, so development
 * never breaks and a missing key is a visible warning rather than a silent empty chart.
 * Budgeted providers are wrapped in the in-memory candle store (CachedProvider).
 */
export class ProviderRegistry {
  private readonly byId = new Map<ProviderId, MarketDataProvider>();
  readonly routes: Routes;
  readonly warnings: string[] = [];
  readonly demo: MarketDataProvider;
  private readonly now: () => number;

  constructor(cfg: Config, deps: RegistryDeps = {}) {
    this.now = deps.now ?? Date.now;
    const pre = deps.providers ?? {};
    this.demo = pre.demo ?? new DemoProvider();
    this.byId.set("demo", this.demo);
    const cached = (p: MarketDataProvider) => new CachedProvider(p, { store: deps.store, now: this.now });
    this.byId.set("binance", pre.binance ?? cached(new BinanceProvider({ baseUrl: cfg.BINANCE_BASE_URL })));
    if (pre.twelvedata) this.byId.set("twelvedata", pre.twelvedata);
    else if (cfg.TWELVEDATA_API_KEY)
      this.byId.set(
        "twelvedata",
        cached(
          new TwelveDataProvider({
            apiKey: cfg.TWELVEDATA_API_KEY,
            creditsPerMinute: cfg.TWELVEDATA_CREDITS_PER_MINUTE,
            useWebSocket: cfg.TWELVEDATA_WS,
            pollSeconds: cfg.TWELVEDATA_POLL_SECONDS,
            plan: cfg.TWELVEDATA_PLAN,
          }),
        ),
      );
    if (pre.polygon) this.byId.set("polygon", pre.polygon);
    else if (cfg.POLYGON_API_KEY)
      this.byId.set(
        "polygon",
        cached(
          new PolygonProvider({
            apiKey: cfg.POLYGON_API_KEY,
            requestsPerMinute: cfg.POLYGON_REQUESTS_PER_MINUTE,
            useWebSocket: cfg.POLYGON_WS,
            pollSeconds: cfg.POLYGON_POLL_SECONDS,
            plan: cfg.POLYGON_PLAN,
          }),
        ),
      );

    const parsed = parseRoutes(cfg.MARKET_DATA_ROUTES);
    this.warnings.push(...parsed.errors);
    if (Object.keys(parsed.routes).length) this.routes = parsed.routes;
    else if (cfg.MARKET_DATA_PROVIDER !== "demo")
      this.routes = Object.fromEntries(ASSET_CLASSES.map((c) => [c, cfg.MARKET_DATA_PROVIDER])) as Routes;
    else this.routes = {};

    for (const cls of ASSET_CLASSES) {
      const id = this.routes[cls];
      if (!id || id === "demo") continue;
      if (!this.byId.has(id))
        this.warnings.push(`${cls} is routed to ${id} but it is not configured (missing API key) — serving demo data instead`);
      else {
        const missing = DEFAULT_INSTRUMENTS.filter((i) => i.assetClass === cls && !this.byId.get(id)!.supports(i)).map((i) => i.symbol);
        if (missing.length) this.warnings.push(`${id} has no symbol for ${missing.join(", ")} — serving demo data for those`);
      }
    }
    if (cfg.NODE_ENV === "production" && !Object.values(this.routes).some((id) => id && id !== "demo"))
      this.warnings.push("production is running on synthetic demo data — set MARKET_DATA_ROUTES");
  }

  /** The source for an instrument: its routed provider when configured and able, else demo. */
  for(instrument: Instrument): MarketDataProvider {
    const id = this.routes[instrument.assetClass];
    const p = id ? this.byId.get(id) : undefined;
    return p && p.supports(instrument) ? p : this.demo;
  }

  get(id: ProviderId): MarketDataProvider | undefined {
    return this.byId.get(id);
  }

  /** Providers in use: the routed ones in route order, then demo. */
  all(): MarketDataProvider[] {
    const out: MarketDataProvider[] = [];
    for (const id of Object.values(this.routes)) {
      const p = id ? this.byId.get(id) : undefined;
      if (p && !out.includes(p)) out.push(p);
    }
    if (!out.includes(this.demo)) out.push(this.demo);
    return out;
  }

  statuses(): ProviderStatus[] {
    return this.all().map((p) => p.status());
  }

  /** Feed state of one instrument: provider health × that instrument's market calendar. */
  feed(instrument: Instrument, nowMs = this.now()): FeedStatus {
    const provider = this.for(instrument);
    const st = provider.status();
    const market = marketState(instrument, nowMs);
    const seen = provider.lastSeen?.(instrument.symbol);
    const receivedAt = seen?.receivedAt ?? st.lastUpdate;
    const routed = this.routes[instrument.assetClass];
    const fallbackNote =
      provider.id === "demo" && routed && routed !== "demo" ? `${routed} unavailable for ${instrument.symbol} — demo fallback` : undefined;
    const base: FeedStatus = {
      symbol: instrument.symbol,
      provider: provider.id,
      state: "OFFLINE",
      transport: st.transport,
      licensed: st.licensed,
      marketOpen: market.open,
      lastEventTime: seen?.eventTime ?? st.lastEventTime,
      receivedAt,
      ageSeconds: receivedAt ? Math.max(0, Math.floor((nowMs - receivedAt) / 1000)) : undefined,
      delaySeconds: st.pollSeconds,
      message: fallbackNote ?? st.message,
    };
    if (st.transport === "synthetic") return { ...base, state: "LIVE" };
    if (!market.open) return { ...base, state: "CLOSED" };
    if (st.state === "OFFLINE") return base;
    if (!receivedAt) return { ...base, state: st.state };
    if (nowMs - receivedAt > staleAfterMs(st.transport, st.pollSeconds)) return { ...base, state: "STALE" };
    return { ...base, state: st.transport === "ws" ? "LIVE" : "DELAYED" };
  }

  feeds(nowMs = this.now()): FeedStatus[] {
    return DEFAULT_INSTRUMENTS.map((i) => this.feed(i, nowMs));
  }

  /** Closes streaming sockets (tests / shutdown). */
  close() {
    for (const p of this.byId.values()) (p as { close?: () => void }).close?.();
  }
}
