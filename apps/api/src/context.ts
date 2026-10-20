import type { Config } from "./config.js";
import type { Repositories } from "./repositories/memory.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { AnalysisService } from "./services/analysis.js";
import type { AiService } from "./services/ai.js";
import type { AlertService } from "./services/alerts.js";
import type { BackfillService } from "./services/backfill.js";
import type { OutcomeService } from "./services/outcomes.js";
import type { CandleStore } from "./store/candleStore.js";

/** Dependency container shared by every route module. */
export interface AppContext {
  config: Config;
  repos: Repositories;
  providers: ProviderRegistry;
  analysis: AnalysisService;
  ai: AiService;
  alerts: AlertService;
  /** DATA-02: the candle store behind every budgeted provider and the job that keeps it complete */
  store: CandleStore;
  backfill: BackfillService;
  /** AI-01: zone outcome tracker */
  outcomes: OutcomeService;
}
