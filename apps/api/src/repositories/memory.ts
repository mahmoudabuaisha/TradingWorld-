import { randomUUID } from "node:crypto";
import type { Role } from "@tradingworld/shared";
import type { Zone } from "@tradingworld/analysis-engine";

/**
 * In-memory repositories — the default store for local development and tests.
 * The same interfaces are implemented by Prisma repositories (./prisma.ts) in production;
 * __tests__/repositories.test.ts runs one contract suite against both.
 * Keeping the interface identical lets the API run with zero infrastructure.
 */
export interface User { id: string; email: string; displayName: string; passwordHash: string; role: Role; createdAt: number; settings: Record<string, unknown> }
export interface Alert { id: string; userId: string; symbol: string; kind: "price_above" | "price_below" | "zone_enter"; price?: number; zoneId?: string; note?: string; active: boolean; createdAt: number; triggeredAt?: number }
export interface JournalTrade {
  id: string; userId: string; symbol: string; direction: "long" | "short"; entry: number; stopLoss: number; takeProfit?: number; size: number; riskAmount?: number;
  openedAt: number; closedAt?: number; exitPrice?: number; rMultiple?: number; setup?: string; strategy?: string; reason?: string; emotion?: string; notes?: string; zoneId?: string; createdAt: number;
}
export interface ZoneLogEntry { id: string; symbol: string; timeframe: string; engineVersion: string; scoringVersion: string; zone: Zone; loggedAt: number }
export interface AuditEntry { id: string; at: number; actorId?: string; action: string; target?: string; meta?: Record<string, unknown> }

export interface Repositories {
  users: {
    create(u: Omit<User, "id" | "createdAt">): Promise<User>;
    byEmail(email: string): Promise<User | undefined>;
    byId(id: string): Promise<User | undefined>;
    list(): Promise<User[]>;
    update(id: string, patch: Partial<User>): Promise<User | undefined>;
  };
  watchlists: { get(userId: string): Promise<string[]>; set(userId: string, symbols: string[]): Promise<string[]> };
  alerts: {
    create(a: Omit<Alert, "id" | "createdAt" | "active">): Promise<Alert>;
    list(userId: string): Promise<Alert[]>;
    listActive(): Promise<Alert[]>;
    update(id: string, patch: Partial<Alert>): Promise<Alert | undefined>;
    remove(id: string, userId: string): Promise<boolean>;
  };
  journal: {
    create(t: Omit<JournalTrade, "id" | "createdAt">): Promise<JournalTrade>;
    list(userId: string): Promise<JournalTrade[]>;
    update(id: string, userId: string, patch: Partial<JournalTrade>): Promise<JournalTrade | undefined>;
    remove(id: string, userId: string): Promise<boolean>;
  };
  zoneLog: { append(e: Omit<ZoneLogEntry, "id" | "loggedAt">): Promise<void>; recent(limit: number): Promise<ZoneLogEntry[]>; count(): Promise<number> };
  audit: { append(e: Omit<AuditEntry, "id" | "at">): Promise<void>; recent(limit: number): Promise<AuditEntry[]> };
}

export function createMemoryRepositories(): Repositories {
  const users = new Map<string, User>();
  const watchlists = new Map<string, string[]>();
  const alerts = new Map<string, Alert>();
  const trades = new Map<string, JournalTrade>();
  const zoneLog: ZoneLogEntry[] = [];
  const audit: AuditEntry[] = [];
  const MAX_LOG = 20_000;

  return {
    users: {
      async create(u) { const user: User = { ...u, id: randomUUID(), createdAt: Date.now() }; users.set(user.id, user); return user; },
      async byEmail(email) { return [...users.values()].find((u) => u.email === email.toLowerCase()); },
      async byId(id) { return users.get(id); },
      async list() { return [...users.values()]; },
      async update(id, patch) { const u = users.get(id); if (!u) return undefined; const n = { ...u, ...patch }; users.set(id, n); return n; },
    },
    watchlists: {
      async get(userId) { return watchlists.get(userId) ?? ["XAUUSD", "EURUSD", "BTCUSD", "US100"]; },
      async set(userId, symbols) { watchlists.set(userId, symbols); return symbols; },
    },
    alerts: {
      async create(a) { const al: Alert = { ...a, id: randomUUID(), createdAt: Date.now(), active: true }; alerts.set(al.id, al); return al; },
      async list(userId) { return [...alerts.values()].filter((a) => a.userId === userId); },
      async listActive() { return [...alerts.values()].filter((a) => a.active); },
      async update(id, patch) { const a = alerts.get(id); if (!a) return undefined; const n = { ...a, ...patch }; alerts.set(id, n); return n; },
      async remove(id, userId) { const a = alerts.get(id); if (!a || a.userId !== userId) return false; alerts.delete(id); return true; },
    },
    journal: {
      async create(t) { const tr: JournalTrade = { ...t, id: randomUUID(), createdAt: Date.now() }; trades.set(tr.id, tr); return tr; },
      async list(userId) { return [...trades.values()].filter((t) => t.userId === userId).sort((a, b) => b.openedAt - a.openedAt); },
      async update(id, userId, patch) { const t = trades.get(id); if (!t || t.userId !== userId) return undefined; const n = { ...t, ...patch }; trades.set(id, n); return n; },
      async remove(id, userId) { const t = trades.get(id); if (!t || t.userId !== userId) return false; trades.delete(id); return true; },
    },
    zoneLog: {
      async append(e) { zoneLog.push({ ...e, id: randomUUID(), loggedAt: Date.now() }); if (zoneLog.length > MAX_LOG) zoneLog.splice(0, zoneLog.length - MAX_LOG); },
      async recent(limit) { return zoneLog.slice(-limit).reverse(); },
      async count() { return zoneLog.length; },
    },
    audit: {
      async append(e) { audit.push({ ...e, id: randomUUID(), at: Date.now() }); if (audit.length > MAX_LOG) audit.splice(0, audit.length - MAX_LOG); },
      async recent(limit) { return audit.slice(-limit).reverse(); },
    },
  };
}
