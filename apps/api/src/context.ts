import type { Config } from "./config.js";
import type { Repositories } from "./repositories/memory.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { AnalysisService } from "./services/analysis.js";
import type { AiService } from "./services/ai.js";
import type { AlertService } from "./services/alerts.js";

/** Dependency container shared by every route module. */
export interface AppContext {
  config: Config;
  repos: Repositories;
  providers: ProviderRegistry;
  analysis: AnalysisService;
  ai: AiService;
  alerts: AlertService;
}
