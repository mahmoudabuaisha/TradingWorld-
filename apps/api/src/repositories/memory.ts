import { randomUUID } from "node:crypto";
import type { Role, Drawing, DrawingKind, DrawingPoint, AppNotification, Delivery } from "@tradingworld/shared";
import type { Zone, Regime, OutcomeLabel } from "@tradingworld/analysis-engine";

/**
 * In-memory repositories — the default store for local development and tests.
 * The same interfaces are implemented by Prisma repositories (./prisma.ts) in production;
 * __tests__/repositories.test.ts runs one contract suite against both.
 * Keeping the interface identical lets the API run with zero infrastructure.
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  createdAt: number;
  settings: Record<string, unknown>;
}
export interface Alert {
  id: string;
  userId: string;
  symbol: string;
  kind: "price_above" | "price_below" | "zone_enter";
  price?: number;
  zoneId?: string;
  zoneTop?: number;
  zoneBottom?: number;
  note?: string;
  active: boolean;
  createdAt: number;
  triggeredAt?: number;
}
export interface PushSub {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: number;
  lastSuccessAt?: number;
  failures: number;
}
export interface StoredNotification extends AppNotification {
  userId: string;
}
export interface JournalTrade {
  id: string;
  userId: string;
  symbol: string;
  direction: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit?: number;
  size: number;
  riskAmount?: number;
  openedAt: number;
  closedAt?: number;
  exitPrice?: number;
  rMultiple?: number;
  setup?: string;
  strategy?: string;
  reason?: string;
  emotion?: string;
  notes?: string;
  zoneId?: string;
  createdAt: number;
}
export interface ZoneLogEntry {
  id: string;
  symbol: string;
  timeframe: string;
  engineVersion: string;
  scoringVersion: string;
  zone: Zone;
  loggedAt: number;
}
/** A zone followed by the outcome tracker (AI-01), snapshotted at first observation. */
export interface TrackedZone {
  /** stable key: symbol:timeframe:origin:direction:createdTime:engineVersion:scoringVersion */
  key: string;
  symbol: string;
  timeframe: string;
  engineVersion: string;
  scoringVersion: string;
  provider: string;
  zone: Zone;
  /** base-timeframe ATR at detection */
  atr: number;
  context: { regime: Regime; session: string; htfBias: string };
  /** s — the last candle the detector had seen */
  detectedBarTime: number;
  /** ms */
  detectedAt: number;
  outcome?: TrackedOutcome;
}
export interface TrackedOutcome {
  outcomeVersion: string;
  label: OutcomeLabel;
  reason: "invalidated" | "horizon";
  finalStatus: Zone["status"];
  mfeAtr: number;
  maeAtr: number;
  reactionAtr: number;
  barsToOutcome: number;
  barsObserved: number;
  horizonBars: number;
  retests: number;
  /** ms */
  resolvedAt: number;
}
/** AI-02: one user's opinion of one tracked zone. */
export interface ZoneFeedbackEntry {
  id: string;
  zoneKey: string;
  userId: string;
  useful: boolean;
  bestFactor?: string;
  comment?: string;
  createdAt: number;
  updatedAt: number;
}
export interface ZoneQuery {
  resolved?: boolean;
  includeDemo?: boolean;
  engineVersion?: string;
  scoringVersion?: string;
  limit?: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  actorId?: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
}

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
    /** atomic: flips an ACTIVE alert to triggered and returns it; undefined if it was already triggered or removed (fires once) */
    trigger(id: string, at: number): Promise<Alert | undefined>;
  };
  /** NOTIF-01: Web Push subscriptions */
  push: {
    /** keyed by endpoint: re-subscribing the same browser moves it to the current user */
    upsert(userId: string, s: { endpoint: string; p256dh: string; auth: string; userAgent?: string }): Promise<PushSub>;
    list(userId: string): Promise<PushSub[]>;
    remove(endpoint: string, userId?: string): Promise<boolean>;
    result(endpoint: string, ok: boolean): Promise<void>;
  };
  /** NOTIF-01: in-app inbox + delivery log */
  notifications: {
    create(n: Omit<StoredNotification, "id" | "createdAt" | "readAt">): Promise<StoredNotification>;
    setDeliveries(id: string, deliveries: Delivery[]): Promise<void>;
    list(userId: string, limit: number): Promise<StoredNotification[]>;
    unread(userId: string): Promise<number>;
    /** ids omitted → all; returns how many were marked */
    markRead(userId: string, ids?: string[]): Promise<number>;
  };
  journal: {
    create(t: Omit<JournalTrade, "id" | "createdAt">): Promise<JournalTrade>;
    list(userId: string): Promise<JournalTrade[]>;
    update(id: string, userId: string, patch: Partial<JournalTrade>): Promise<JournalTrade | undefined>;
    remove(id: string, userId: string): Promise<boolean>;
  };
  zoneLog: {
    append(e: Omit<ZoneLogEntry, "id" | "loggedAt">): Promise<void>;
    recent(limit: number): Promise<ZoneLogEntry[]>;
    count(): Promise<number>;
  };
  audit: { append(e: Omit<AuditEntry, "id" | "at">): Promise<void>; recent(limit: number): Promise<AuditEntry[]> };
  /** outcome tracker (AI-01) */
  zones: {
    /** first observation wins: returns false (and changes nothing) when the key is already tracked */
    track(z: Omit<TrackedZone, "outcome" | "detectedAt"> & { detectedAt?: number }): Promise<boolean>;
    /** unresolved zones, oldest detection first */
    open(limit: number): Promise<TrackedZone[]>;
    resolve(key: string, outcome: TrackedOutcome): Promise<void>;
    /** newest detection first */
    list(q: ZoneQuery): Promise<TrackedZone[]>;
    count(q: ZoneQuery): Promise<number>;
    get(key: string): Promise<TrackedZone | undefined>;
  };
  /** chart drawings (UI-01), per user and symbol */
  drawings: {
    list(userId: string, symbol: string): Promise<Drawing[]>;
    count(userId: string, symbol: string): Promise<number>;
    /** owner-scoped */
    get(id: string, userId: string): Promise<Drawing | undefined>;
    create(userId: string, d: { symbol: string; kind: DrawingKind; points: DrawingPoint[] }): Promise<Drawing>;
    /** owner-scoped; undefined when not found or not the owner */
    update(id: string, userId: string, points: DrawingPoint[]): Promise<Drawing | undefined>;
    remove(id: string, userId: string): Promise<boolean>;
    clear(userId: string, symbol: string): Promise<number>;
  };
  /** user feedback (AI-02) — kept apart from outcomes on purpose */
  feedback: {
    /** one vote per user and zone: replaces the previous one (absent optional fields are cleared) */
    upsert(f: { zoneKey: string; userId: string; useful: boolean; bestFactor?: string; comment?: string }): Promise<ZoneFeedbackEntry>;
    get(zoneKey: string, userId: string): Promise<ZoneFeedbackEntry | undefined>;
    remove(zoneKey: string, userId: string): Promise<boolean>;
    /** newest first, joined with the tracked zone (and its outcome when resolved) */
    list(q: { includeDemo?: boolean; limit?: number }): Promise<(ZoneFeedbackEntry & { zone: TrackedZone })[]>;
  };
}

const matches = (z: TrackedZone, q: ZoneQuery) =>
  (q.resolved === undefined || (q.resolved ? !!z.outcome : !z.outcome)) &&
  (q.includeDemo || z.provider !== "demo") &&
  (!q.engineVersion || z.engineVersion === q.engineVersion) &&
  (!q.scoringVersion || z.scoringVersion === q.scoringVersion);

export function createMemoryRepositories(): Repositories {
  const users = new Map<string, User>();
  const watchlists = new Map<string, string[]>();
  const alerts = new Map<string, Alert>();
  const trades = new Map<string, JournalTrade>();
  const zoneLog: ZoneLogEntry[] = [];
  const tracked = new Map<string, TrackedZone>();
  const feedback = new Map<string, ZoneFeedbackEntry>(); // `${zoneKey}|${userId}`
  const drawings = new Map<string, Drawing & { userId: string }>();
  const pushSubs = new Map<string, PushSub>(); // by endpoint
  const notifications: StoredNotification[] = [];
  const publicDrawing = ({ userId: _u, ...d }: Drawing & { userId: string }): Drawing => ({
    ...d,
    points: d.points.map((p) => ({ ...p })),
  });
  const audit: AuditEntry[] = [];
  const MAX_LOG = 20_000;

  return {
    users: {
      async create(u) {
        const user: User = { ...u, id: randomUUID(), createdAt: Date.now() };
        users.set(user.id, user);
        return user;
      },
      async byEmail(email) {
        return [...users.values()].find((u) => u.email === email.toLowerCase());
      },
      async byId(id) {
        return users.get(id);
      },
      async list() {
        return [...users.values()];
      },
      async update(id, patch) {
        const u = users.get(id);
        if (!u) return undefined;
        const n = { ...u, ...patch };
        users.set(id, n);
        return n;
      },
    },
    watchlists: {
      async get(userId) {
        return watchlists.get(userId) ?? ["XAUUSD", "EURUSD", "BTCUSD", "US100"];
      },
      async set(userId, symbols) {
        watchlists.set(userId, symbols);
        return symbols;
      },
    },
    alerts: {
      async create(a) {
        const al: Alert = { ...a, id: randomUUID(), createdAt: Date.now(), active: true };
        alerts.set(al.id, al);
        return al;
      },
      async list(userId) {
        return [...alerts.values()].filter((a) => a.userId === userId);
      },
      async listActive() {
        return [...alerts.values()].filter((a) => a.active);
      },
      async update(id, patch) {
        const a = alerts.get(id);
        if (!a) return undefined;
        const n = { ...a, ...patch };
        alerts.set(id, n);
        return n;
      },
      async remove(id, userId) {
        const a = alerts.get(id);
        if (!a || a.userId !== userId) return false;
        alerts.delete(id);
        return true;
      },
      async trigger(id, at) {
        const a = alerts.get(id);
        if (!a || !a.active) return undefined;
        a.active = false;
        a.triggeredAt = at;
        return { ...a };
      },
    },
    push: {
      async upsert(userId, s) {
        const prev = pushSubs.get(s.endpoint);
        const sub: PushSub = {
          id: prev?.id ?? randomUUID(),
          userId,
          ...s,
          createdAt: prev?.createdAt ?? Date.now(),
          failures: 0,
          lastSuccessAt: prev?.lastSuccessAt,
        };
        pushSubs.set(s.endpoint, sub);
        return { ...sub };
      },
      async list(userId) {
        return [...pushSubs.values()].filter((p) => p.userId === userId).map((p) => ({ ...p }));
      },
      async remove(endpoint, userId) {
        const p = pushSubs.get(endpoint);
        if (!p || (userId && p.userId !== userId)) return false;
        pushSubs.delete(endpoint);
        return true;
      },
      async result(endpoint, ok) {
        const p = pushSubs.get(endpoint);
        if (!p) return;
        if (ok) {
          p.failures = 0;
          p.lastSuccessAt = Date.now();
        } else p.failures++;
      },
    },
    notifications: {
      async create(n) {
        const row: StoredNotification = { ...n, id: randomUUID(), createdAt: Date.now() };
        notifications.push(row);
        if (notifications.length > MAX_LOG) notifications.shift();
        return { ...row };
      },
      async setDeliveries(id, deliveries) {
        const n = notifications.find((x) => x.id === id);
        if (n) n.deliveries = deliveries;
      },
      async list(userId, limit) {
        return notifications
          .filter((n) => n.userId === userId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
          .map((n) => ({ ...n }));
      },
      async unread(userId) {
        return notifications.filter((n) => n.userId === userId && !n.readAt).length;
      },
      async markRead(userId, ids) {
        let c = 0;
        const now = Date.now();
        for (const n of notifications)
          if (n.userId === userId && !n.readAt && (!ids || ids.includes(n.id))) {
            n.readAt = now;
            c++;
          }
        return c;
      },
    },
    journal: {
      async create(t) {
        const tr: JournalTrade = { ...t, id: randomUUID(), createdAt: Date.now() };
        trades.set(tr.id, tr);
        return tr;
      },
      async list(userId) {
        return [...trades.values()].filter((t) => t.userId === userId).sort((a, b) => b.openedAt - a.openedAt);
      },
      async update(id, userId, patch) {
        const t = trades.get(id);
        if (!t || t.userId !== userId) return undefined;
        const n = { ...t, ...patch };
        trades.set(id, n);
        return n;
      },
      async remove(id, userId) {
        const t = trades.get(id);
        if (!t || t.userId !== userId) return false;
        trades.delete(id);
        return true;
      },
    },
    zoneLog: {
      async append(e) {
        zoneLog.push({ ...e, id: randomUUID(), loggedAt: Date.now() });
        if (zoneLog.length > MAX_LOG) zoneLog.splice(0, zoneLog.length - MAX_LOG);
      },
      async recent(limit) {
        return zoneLog.slice(-limit).reverse();
      },
      async count() {
        return zoneLog.length;
      },
    },
    audit: {
      async append(e) {
        audit.push({ ...e, id: randomUUID(), at: Date.now() });
        if (audit.length > MAX_LOG) audit.splice(0, audit.length - MAX_LOG);
      },
      async recent(limit) {
        return audit.slice(-limit).reverse();
      },
    },
    zones: {
      async track(z) {
        if (tracked.has(z.key)) return false;
        tracked.set(z.key, { ...z, detectedAt: z.detectedAt ?? Date.now() });
        return true;
      },
      async open(limit) {
        return [...tracked.values()]
          .filter((z) => !z.outcome)
          .sort((a, b) => a.detectedAt - b.detectedAt)
          .slice(0, limit);
      },
      async resolve(key, outcome) {
        const z = tracked.get(key);
        if (z) z.outcome = outcome;
      },
      async list(q) {
        return [...tracked.values()]
          .filter((z) => matches(z, q))
          .sort((a, b) => b.detectedAt - a.detectedAt)
          .slice(0, q.limit ?? 1000);
      },
      async count(q) {
        return [...tracked.values()].filter((z) => matches(z, q)).length;
      },
      async get(key) {
        return tracked.get(key);
      },
    },
    drawings: {
      async list(userId, symbol) {
        return [...drawings.values()]
          .filter((d) => d.userId === userId && d.symbol === symbol)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(publicDrawing);
      },
      async count(userId, symbol) {
        return [...drawings.values()].filter((d) => d.userId === userId && d.symbol === symbol).length;
      },
      async get(id, userId) {
        const d = drawings.get(id);
        return d && d.userId === userId ? publicDrawing(d) : undefined;
      },
      async create(userId, d) {
        const now = Date.now();
        const row = { ...d, points: d.points.map((p) => ({ ...p })), id: randomUUID(), userId, createdAt: now, updatedAt: now };
        drawings.set(row.id, row);
        return publicDrawing(row);
      },
      async update(id, userId, points) {
        const d = drawings.get(id);
        if (!d || d.userId !== userId) return undefined;
        d.points = points.map((p) => ({ ...p }));
        d.updatedAt = Date.now();
        return publicDrawing(d);
      },
      async remove(id, userId) {
        const d = drawings.get(id);
        if (!d || d.userId !== userId) return false;
        drawings.delete(id);
        return true;
      },
      async clear(userId, symbol) {
        let n = 0;
        for (const [id, d] of drawings)
          if (d.userId === userId && d.symbol === symbol) {
            drawings.delete(id);
            n++;
          }
        return n;
      },
    },
    feedback: {
      async upsert(f) {
        const k = `${f.zoneKey}|${f.userId}`;
        const prev = feedback.get(k);
        const now = Date.now();
        const e: ZoneFeedbackEntry = {
          id: prev?.id ?? randomUUID(),
          zoneKey: f.zoneKey,
          userId: f.userId,
          useful: f.useful,
          bestFactor: f.bestFactor,
          comment: f.comment,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        };
        feedback.set(k, e);
        return e;
      },
      async get(zoneKey, userId) {
        return feedback.get(`${zoneKey}|${userId}`);
      },
      async remove(zoneKey, userId) {
        return feedback.delete(`${zoneKey}|${userId}`);
      },
      async list(q) {
        return [...feedback.values()]
          .map((f) => ({ ...f, zone: tracked.get(f.zoneKey)! }))
          .filter((f) => f.zone && (q.includeDemo || f.zone.provider !== "demo"))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, q.limit ?? 5000);
      },
    },
  };
}
