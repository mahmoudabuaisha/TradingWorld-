import type { Config } from "./config.js";
import type { Repositories } from "./repositories/memory.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { AnalysisService } from "./services/analysis.js";
import type { AiService } from "./services/ai.js";
import type { AlertService } from "./services/alerts.js";
import type { BackfillService } from "./services/backfill.js";
import type { OutcomeService } from "./services/outcomes.js";
import type { NotificationService } from "./services/notifications.js";
import type { CandleStore } from "./store/candleStore.js";
import type { Telemetry } from "./ops/telemetry.js";
import type { RequestWindow } from "./ops/metrics.js";
import type { Notify, Watchdog } from "./ops/watchdog.js";

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
  /** NOTIF-01: in-app inbox, Web Push, email */
  notifications: NotificationService;
  /** OPS-01: telemetry, the last minutes of requests, the watchdog, live WebSocket count */
  ops: { telemetry: Telemetry; window: RequestWindow; watchdog: Watchdog; notify: Notify; ws: { open: number } };
}
