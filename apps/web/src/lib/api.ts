import type { AnalysisResult, Candle } from "@tradingworld/analysis-engine";
import type { Timeframe, ProviderStatus, FeedStatus, FeedState, ProviderId, AssetClass, Drawing, DrawingKind, DrawingPoint } from "@tradingworld/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    // content-type only with a body: Fastify rejects a body-less request (e.g. DELETE) that claims to carry JSON with 400
    headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; engineVersion: string; providers: ProviderStatus[]; routes: Routes; warnings: string[]; ai: string }>("/health"),
  feeds: () => request<FeedsResponse>("/feeds"),
  candles: (symbol: string, timeframe: Timeframe, limit = 500) => request<{ candles: Candle[]; provider: string; status: ProviderStatus; feed: FeedStatus }>(`/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`),
  analysis: (symbol: string, timeframe: Timeframe, includeLowQuality = false, includeInvalidated = false) => request<AnalysisResult>(`/analysis?symbol=${symbol}&timeframe=${timeframe}&includeLowQuality=${includeLowQuality}&includeInvalidated=${includeInvalidated}`),
  chat: (body: { symbol: string; timeframe: Timeframe; question: string; locale: "ar" | "en"; zoneId?: string }) => request<{ answer: string; provider: string }>("/ai/chat", { method: "POST", body: JSON.stringify(body) }),
  overview: (symbols: string[]) => request<{ rows: OverviewRow[]; generatedAt: number }>(`/overview?symbols=${symbols.join(",")}`),
  register: (b: { email: string; password: string; displayName: string }) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; password: string }) => request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  alerts: (token: string) => request<{ alerts: Alert[] }>("/alerts", {}, token),
  createAlert: (token: string, b: { symbol: string; kind: string; price?: number; zoneId?: string; note?: string }) => request<{ alert: Alert }>("/alerts", { method: "POST", body: JSON.stringify(b) }, token),
  deleteAlert: (token: string, id: string) => request<{ ok: true }>(`/alerts/${id}`, { method: "DELETE" }, token),
  journal: (token: string) => request<{ trades: Trade[]; stats: { total: number; closed: number; winRate: number; avgR: number } }>("/journal", {}, token),
  addTrade: (token: string, b: Record<string, unknown>) => request<{ trade: Trade }>("/journal", { method: "POST", body: JSON.stringify(b) }, token),
  deleteTrade: (token: string, id: string) => request<{ ok: true }>(`/journal/${id}`, { method: "DELETE" }, token),
  adminOverview: (token: string) => request<AdminOverview>("/admin/overview", {}, token),
  adminBackfill: (token: string) => request<AdminBackfill>("/admin/backfill", {}, token),
  triggerBackfill: (token: string, b: { kind?: "cycle" | "backfill" | "catchup" | "gaps" | "aggregate"; symbol?: string; bars?: number }) => request<{ accepted: boolean }>("/admin/backfill", { method: "POST", body: JSON.stringify(b) }, token),
  adminOutcomes: (token: string, includeDemo = false) => request<AdminOutcomes>(`/admin/outcomes${includeDemo ? "?includeDemo=1" : ""}`, {}, token),
  runOutcomes: (token: string) => request<{ run: { checked: number; resolved: number; failed: number } }>("/admin/outcomes/run", { method: "POST", body: "{}" }, token),
  zoneFeedback: (token: string, key: string) => request<{ tracked: boolean; feedback: ZoneFeedback | null }>(`/zones/${encodeURIComponent(key)}/feedback`, {}, token),
  saveZoneFeedback: (token: string, key: string, b: { useful: boolean; bestFactor?: string; comment?: string }) => request<{ feedback: ZoneFeedback }>(`/zones/${encodeURIComponent(key)}/feedback`, { method: "PUT", body: JSON.stringify(b) }, token),
  deleteZoneFeedback: (token: string, key: string) => request<{ ok: true }>(`/zones/${encodeURIComponent(key)}/feedback`, { method: "DELETE" }, token),
  adminFeedback: (token: string, includeDemo = false) => request<AdminFeedback>(`/admin/feedback${includeDemo ? "?includeDemo=1" : ""}`, {}, token),
  drawings: (token: string, symbol: string) => request<{ drawings: Drawing[] }>(`/drawings?symbol=${encodeURIComponent(symbol)}`, {}, token),
  createDrawing: (token: string, b: { symbol: string; kind: DrawingKind; points: DrawingPoint[] }) => request<{ drawing: Drawing }>("/drawings", { method: "POST", body: JSON.stringify(b) }, token),
  updateDrawing: (token: string, id: string, points: DrawingPoint[]) => request<{ drawing: Drawing }>(`/drawings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ points }) }, token),
  deleteDrawing: (token: string, id: string) => request<{ ok: true }>(`/drawings/${encodeURIComponent(id)}`, { method: "DELETE" }, token),
  clearDrawings: (token: string, symbol: string) => request<{ removed: number }>(`/drawings?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" }, token),
  adminFactors: (token: string) => request<{ sample: number; factors: Record<string, { present: number; total: number; avgScoreWhenPresent: number }>; byStatus: Record<string, number> }>("/admin/research/factors", {}, token),
};

export type Routes = Partial<Record<AssetClass, ProviderId>>;
export interface FeedsResponse { routes: Routes; warnings: string[]; providers: ProviderStatus[]; feeds: FeedStatus[]; generatedAt: number }
export interface AuthResponse { token: string; user: { id: string; email: string; displayName: string; role: string } }
export interface Alert { id: string; symbol: string; kind: string; price?: number; zoneId?: string; note?: string; active: boolean; createdAt: number; triggeredAt?: number }
export interface Trade { id: string; symbol: string; direction: "long" | "short"; entry: number; stopLoss: number; takeProfit?: number; exitPrice?: number; size: number; rMultiple?: number; openedAt: number; setup?: string; strategy?: string; notes?: string }
export interface OverviewRow {
  symbol: string; price?: number; precision?: number; changePct?: number; regime?: string; volatility?: string; htfBias?: string; baseBias?: string; session?: string; zones?: number;
  topZone?: { id: string; name: string; nameAr: string; score: number; status: string; direction: string; top: number; bottom: number } | null;
  lastSweep?: { side: string; level: number; poolKind: string; displacementAfter: boolean; time: number } | null;
  narrative?: { ar: string; en: string }; spark?: number[]; error?: string;
  feed?: { provider: ProviderId; state: FeedState; licensed: boolean };
}
export interface BackfillRun { symbol: string; timeframe: string; kind: "backfill" | "catchup" | "gaps" | "aggregate"; from?: number; to?: number; bars: number; status: "running" | "done" | "failed"; error?: string; startedAt: number; finishedAt?: number }
export interface AdminBackfill {
  store: "memory" | "timescale"; enabled: boolean;
  job: { running: boolean; started: boolean; baseTimeframe: string; bars: number; symbols: string[]; lastRunAt?: number; nextRunAt?: number; runs: BackfillRun[] };
  series: { symbol: string; timeframe: string; first: number; last: number; count: number }[];
}
export interface ZoneFeedback { id: string; zoneKey: string; useful: boolean; bestFactor?: string; comment?: string; createdAt: number; updatedAt: number }
export interface FeedbackBucket { n: number; useful: number; usefulRate: number }
export interface AdminFeedback {
  includeDemo: boolean; total: number; zones: number; overall: FeedbackBucket;
  byQuality: Record<string, FeedbackBucket>; byOrigin: Record<string, FeedbackBucket>; byScoreBand: Record<string, FeedbackBucket>;
  bestFactor: Record<string, number>;
  agreement: { useful: Record<string, number>; notUseful: Record<string, number>; resolved: number };
  recentComments: { zoneName: string; zoneNameAr: string; symbol: string; timeframe: string; useful: boolean; bestFactor?: string; comment: string; at: number; outcome?: string }[];
}
export interface OutcomeBucket { n: number; reacted: number; invalidated: number; tested: number; untouched: number; reactionRate: number; avgMfeAtr?: number; avgMaeAtr?: number }
export interface AdminOutcomes {
  job: { running: boolean; started: boolean; horizonBars: number; intervalSeconds: number; scan: string[]; runs: { at: number; scanned: number; checked: number; resolved: number; failed: number; ms: number }[] };
  stats: {
    outcomeVersion: string; horizonBars: number; includeDemo: boolean; open: number; resolved: number; overall: OutcomeBucket;
    byQuality: Record<string, OutcomeBucket>; byOrigin: Record<string, OutcomeBucket>; bySession: Record<string, OutcomeBucket>; byTimeframe: Record<string, OutcomeBucket>; byScoreBand: Record<string, OutcomeBucket>;
    recent: { key: string; symbol: string; timeframe: string; name: string; nameAr: string; quality: string; score: number; provider: string; label: string; reason: string; barsToOutcome: number; mfeAtr: number; resolvedAt: number }[];
  };
}
export interface AdminOverview { users: number; zonesLogged: number; providers: ProviderStatus[]; engine: { version: string; scoring: string; weights: Record<string, number> }; ai: string; modules: { id: string; status: string; phase: string }[]; memory: number; uptime: number }
