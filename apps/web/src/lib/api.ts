import type { AnalysisResult, Candle } from "@tradingworld/analysis-engine";
import type { Timeframe } from "@tradingworld/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
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
  health: () => request<{ ok: boolean; engineVersion: string; providers: { id: string; live: boolean; message?: string }[]; ai: string }>("/health"),
  candles: (symbol: string, timeframe: Timeframe, limit = 500) => request<{ candles: Candle[]; provider: string; status: { live: boolean; message?: string } }>(`/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`),
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
  adminFactors: (token: string) => request<{ sample: number; factors: Record<string, { present: number; total: number; avgScoreWhenPresent: number }>; byStatus: Record<string, number> }>("/admin/research/factors", {}, token),
};

export interface AuthResponse { token: string; user: { id: string; email: string; displayName: string; role: string } }
export interface Alert { id: string; symbol: string; kind: string; price?: number; zoneId?: string; note?: string; active: boolean; createdAt: number; triggeredAt?: number }
export interface Trade { id: string; symbol: string; direction: "long" | "short"; entry: number; stopLoss: number; takeProfit?: number; exitPrice?: number; size: number; rMultiple?: number; openedAt: number; setup?: string; strategy?: string; notes?: string }
export interface OverviewRow {
  symbol: string; price?: number; precision?: number; changePct?: number; regime?: string; volatility?: string; htfBias?: string; baseBias?: string; session?: string; zones?: number;
  topZone?: { id: string; name: string; nameAr: string; score: number; status: string; direction: string; top: number; bottom: number } | null;
  lastSweep?: { side: string; level: number; poolKind: string; displacementAfter: boolean; time: number } | null;
  narrative?: { ar: string; en: string }; spark?: number[]; error?: string;
}
export interface AdminOverview { users: number; zonesLogged: number; providers: { id: string; live: boolean; message?: string }[]; engine: { version: string; scoring: string; weights: Record<string, number> }; ai: string; modules: { id: string; status: string; phase: string }[]; memory: number; uptime: number }
