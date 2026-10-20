import { PrismaClient, Prisma } from "@tradingworld/db";
import { DEFAULT_INSTRUMENTS, type Role, type Drawing, type DrawingKind, type DrawingPoint, type Delivery } from "@tradingworld/shared";
import type { Zone, OutcomeLabel } from "@tradingworld/analysis-engine";
import type {
  Repositories,
  User,
  Alert,
  JournalTrade,
  ZoneLogEntry,
  AuditEntry,
  TrackedZone,
  ZoneQuery,
  ZoneFeedbackEntry,
  PushSub,
  StoredNotification,
} from "./memory.js";

const DEFAULT_WATCHLIST = ["XAUUSD", "EURUSD", "BTCUSD", "US100"];

// ── conversions: the repository interface speaks ms timestamps (trade open/close in Unix seconds), undefined for absent
const ms = (d: Date) => d.getTime();
const optMs = (d: Date | null) => (d ? d.getTime() : undefined);
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
/** Unix seconds → Date; tolerates millisecond values from older clients (see docs/06). */
export const secToDate = (t: number) => new Date(t > 1e12 ? t : t * 1000);
const dateToSec = (d: Date) => Math.floor(d.getTime() / 1000);
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** For updates: keys present with `undefined` mean "clear" (memory semantics), so they become null; absent keys stay untouched. */
function nullify<T extends object>(patch: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in patch) out[k as string] = patch[k] === undefined ? null : patch[k];
  return out;
}

type DbUser = Prisma.UserGetPayload<object>;
type DbAlert = Prisma.AlertGetPayload<object>;
type DbTrade = Prisma.TradeGetPayload<object>;
type DbZone = Prisma.ZoneGetPayload<{ include: { outcome: true } }>;

const toTracked = (z: DbZone): TrackedZone => ({
  key: z.id,
  symbol: z.symbol,
  timeframe: z.timeframe,
  engineVersion: z.engineVersion,
  scoringVersion: z.scoringVersion,
  provider: z.provider,
  zone: z.snapshot as unknown as Zone,
  atr: z.atr,
  context: z.context as unknown as TrackedZone["context"],
  detectedBarTime: dateToSec(z.detectedBarTime),
  detectedAt: ms(z.detectedAt),
  outcome: z.outcome
    ? {
        outcomeVersion: z.outcome.outcomeVersion,
        label: z.outcome.label as OutcomeLabel,
        reason: z.outcome.reason as "invalidated" | "horizon",
        finalStatus: z.outcome.finalStatus,
        mfeAtr: z.outcome.mfeAtr,
        maeAtr: z.outcome.maeAtr,
        reactionAtr: z.outcome.reactionAtr,
        barsToOutcome: z.outcome.barsToOutcome,
        barsObserved: z.outcome.barsObserved,
        horizonBars: z.outcome.horizonBars,
        retests: z.outcome.retests,
        resolvedAt: ms(z.outcome.resolvedAt),
      }
    : undefined,
});

type DbDrawing = Prisma.DrawingGetPayload<object>;
const toDrawing = (d: DbDrawing): Drawing => ({
  id: d.id,
  symbol: d.symbol,
  kind: d.kind as DrawingKind,
  points: d.points as unknown as DrawingPoint[],
  createdAt: ms(d.createdAt),
  updatedAt: ms(d.updatedAt),
});

type DbFeedback = Prisma.ZoneFeedbackGetPayload<object>;
const toFeedback = (f: DbFeedback): ZoneFeedbackEntry => ({
  id: f.id,
  zoneKey: f.zoneId,
  userId: f.userId,
  useful: f.useful,
  bestFactor: opt(f.bestFactor),
  comment: opt(f.comment),
  createdAt: ms(f.createdAt),
  updatedAt: ms(f.updatedAt),
});

const zoneWhere = (q: ZoneQuery): Prisma.ZoneWhereInput => ({
  ...(q.resolved === undefined ? {} : q.resolved ? { outcome: { isNot: null } } : { outcome: { is: null } }),
  ...(q.includeDemo ? {} : { provider: { not: "demo" } }),
  ...(q.engineVersion ? { engineVersion: q.engineVersion } : {}),
  ...(q.scoringVersion ? { scoringVersion: q.scoringVersion } : {}),
});

const toUser = (u: DbUser): User => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  passwordHash: u.passwordHash,
  role: u.role as Role,
  createdAt: ms(u.createdAt),
  settings: (u.settings ?? {}) as Record<string, unknown>,
});
const toAlert = (a: DbAlert): Alert => ({
  id: a.id,
  userId: a.userId,
  symbol: a.symbol,
  kind: a.kind,
  price: opt(a.price),
  zoneId: opt(a.zoneId),
  zoneTop: opt(a.zoneTop),
  zoneBottom: opt(a.zoneBottom),
  note: opt(a.note),
  active: a.active,
  createdAt: ms(a.createdAt),
  triggeredAt: optMs(a.triggeredAt),
});
type DbPush = Prisma.PushSubscriptionGetPayload<object>;
const toPush = (p: DbPush): PushSub => ({
  id: p.id,
  userId: p.userId,
  endpoint: p.endpoint,
  p256dh: p.p256dh,
  auth: p.auth,
  userAgent: opt(p.userAgent),
  createdAt: ms(p.createdAt),
  lastSuccessAt: optMs(p.lastSuccessAt),
  failures: p.failures,
});
type DbNotification = Prisma.NotificationGetPayload<object>;
const toNotification = (n: DbNotification): StoredNotification => ({
  id: n.id,
  userId: n.userId,
  kind: n.kind as StoredNotification["kind"],
  title: n.title as StoredNotification["title"],
  body: n.body as StoredNotification["body"],
  url: opt(n.url),
  alertId: opt(n.alertId),
  deliveries: (n.deliveries ?? []) as unknown as Delivery[],
  readAt: optMs(n.readAt),
  createdAt: ms(n.createdAt),
});
const toTrade = (t: DbTrade): JournalTrade => ({
  id: t.id,
  userId: t.userId,
  symbol: t.symbol,
  direction: t.direction,
  entry: t.entry,
  stopLoss: t.stopLoss,
  takeProfit: opt(t.takeProfit),
  size: t.size,
  riskAmount: opt(t.riskAmount),
  openedAt: dateToSec(t.openedAt),
  closedAt: t.closedAt ? dateToSec(t.closedAt) : undefined,
  exitPrice: opt(t.exitPrice),
  rMultiple: opt(t.rMultiple),
  setup: opt(t.setup),
  strategy: opt(t.strategy),
  reason: opt(t.reason),
  emotion: opt(t.emotion),
  notes: opt(t.notes),
  zoneId: opt(t.zoneId),
  createdAt: ms(t.createdAt),
});

const TRADE_FIELDS = [
  "symbol",
  "direction",
  "entry",
  "stopLoss",
  "takeProfit",
  "size",
  "riskAmount",
  "exitPrice",
  "rMultiple",
  "setup",
  "strategy",
  "reason",
  "emotion",
  "notes",
  "zoneId",
] as const;

export interface PrismaRepositories extends Repositories {
  /** idempotent: Instrument Master rows the alert foreign key needs */
  seed(): Promise<void>;
  close(): Promise<void>;
  client: PrismaClient;
}

/** Throws with the fix when the schema has not been migrated yet. */
export async function assertMigrated(client: PrismaClient): Promise<void> {
  const rows = await client.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"User"') IS NOT NULL AS ok`;
  if (!rows[0]?.ok) throw new Error("database schema is not migrated — run: pnpm --filter @tradingworld/db migrate:deploy");
}

/**
 * PostgreSQL repositories through Prisma — same interface and semantics as the in-memory ones
 * (the contract suite in __tests__/repositories.test.ts runs against both).
 */
export function createPrismaRepositories(databaseUrl: string, opts: { client?: PrismaClient } = {}): PrismaRepositories {
  const db = opts.client ?? new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  return {
    client: db,
    async seed() {
      await assertMigrated(db);
      for (const i of DEFAULT_INSTRUMENTS) {
        const data = {
          name: i.name,
          nameAr: i.nameAr,
          assetClass: i.assetClass,
          base: i.base,
          quote: i.quote,
          pricePrecision: i.pricePrecision,
          pipSize: i.pipSize,
          contractSize: i.contractSize,
          sessionTimezone: i.sessionTimezone,
          providerSymbols: json(i.providerSymbols),
        };
        await db.instrument.upsert({ where: { symbol: i.symbol }, create: { symbol: i.symbol, ...data }, update: data });
      }
    },
    async close() {
      await db.$disconnect();
    },

    users: {
      async create(u) {
        return toUser(
          await db.user.create({
            data: {
              email: u.email.toLowerCase(),
              displayName: u.displayName,
              passwordHash: u.passwordHash,
              role: u.role,
              settings: json(u.settings ?? {}),
            },
          }),
        );
      },
      async byEmail(email) {
        const u = await db.user.findUnique({ where: { email: email.toLowerCase() } });
        return u ? toUser(u) : undefined;
      },
      async byId(id) {
        const u = await db.user.findUnique({ where: { id } });
        return u ? toUser(u) : undefined;
      },
      async list() {
        return (await db.user.findMany({ orderBy: { createdAt: "asc" } })).map(toUser);
      },
      async update(id, patch) {
        const data: Prisma.UserUpdateInput = {};
        if (patch.email !== undefined) data.email = patch.email.toLowerCase();
        if (patch.displayName !== undefined) data.displayName = patch.displayName;
        if (patch.passwordHash !== undefined) data.passwordHash = patch.passwordHash;
        if (patch.role !== undefined) data.role = patch.role;
        if (patch.settings !== undefined) data.settings = json(patch.settings);
        try {
          return toUser(await db.user.update({ where: { id }, data }));
        } catch (e) {
          if (isNotFound(e)) return undefined;
          throw e;
        }
      },
    },

    watchlists: {
      async get(userId) {
        const w = await db.watchlist.findUnique({ where: { userId_name: { userId, name: "default" } } });
        return w ? w.symbols : [...DEFAULT_WATCHLIST];
      },
      async set(userId, symbols) {
        const w = await db.watchlist.upsert({
          where: { userId_name: { userId, name: "default" } },
          create: { userId, name: "default", symbols },
          update: { symbols },
        });
        return w.symbols;
      },
    },

    alerts: {
      async create(a) {
        return toAlert(
          await db.alert.create({
            data: {
              userId: a.userId,
              symbol: a.symbol,
              kind: a.kind,
              price: a.price,
              zoneId: a.zoneId,
              zoneTop: a.zoneTop,
              zoneBottom: a.zoneBottom,
              note: a.note,
              triggeredAt: a.triggeredAt ? new Date(a.triggeredAt) : undefined,
            },
          }),
        );
      },
      async list(userId) {
        return (await db.alert.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map(toAlert);
      },
      async listActive() {
        return (await db.alert.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } })).map(toAlert);
      },
      async update(id, patch) {
        const data: Record<string, unknown> = nullify(patch, ["price", "zoneId", "note", "active", "kind"] as const);
        if ("triggeredAt" in patch) data.triggeredAt = patch.triggeredAt === undefined ? null : new Date(patch.triggeredAt);
        try {
          return toAlert(await db.alert.update({ where: { id }, data }));
        } catch (e) {
          if (isNotFound(e)) return undefined;
          throw e;
        }
      },
      async remove(id, userId) {
        return (await db.alert.deleteMany({ where: { id, userId } })).count > 0;
      },
      async trigger(id, at) {
        // conditional update = the database decides who wins when the watcher and a live tick fire together
        const res = await db.alert.updateMany({ where: { id, active: true }, data: { active: false, triggeredAt: new Date(at) } });
        if (!res.count) return undefined;
        const a = await db.alert.findUnique({ where: { id } });
        return a ? toAlert(a) : undefined;
      },
    },

    push: {
      async upsert(userId, s) {
        const data = { userId, p256dh: s.p256dh, auth: s.auth, userAgent: s.userAgent ?? null, failures: 0 };
        return toPush(
          await db.pushSubscription.upsert({ where: { endpoint: s.endpoint }, create: { endpoint: s.endpoint, ...data }, update: data }),
        );
      },
      async list(userId) {
        return (await db.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map(toPush);
      },
      async remove(endpoint, userId) {
        return (await db.pushSubscription.deleteMany({ where: { endpoint, ...(userId ? { userId } : {}) } })).count > 0;
      },
      async result(endpoint, ok) {
        await db.pushSubscription.updateMany({
          where: { endpoint },
          data: ok ? { failures: 0, lastSuccessAt: new Date() } : { failures: { increment: 1 } },
        });
      },
    },

    notifications: {
      async create(n) {
        return toNotification(
          await db.notification.create({
            data: {
              userId: n.userId,
              kind: n.kind,
              title: json(n.title),
              body: json(n.body),
              url: n.url,
              alertId: n.alertId,
              deliveries: json(n.deliveries),
            },
          }),
        );
      },
      async setDeliveries(id, deliveries) {
        await db.notification.updateMany({ where: { id }, data: { deliveries: json(deliveries) } });
      },
      async list(userId, limit) {
        return (await db.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit })).map(
          toNotification,
        );
      },
      async unread(userId) {
        return db.notification.count({ where: { userId, readAt: null } });
      },
      async markRead(userId, ids) {
        return (
          await db.notification.updateMany({
            where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
            data: { readAt: new Date() },
          })
        ).count;
      },
    },

    journal: {
      async create(t) {
        return toTrade(
          await db.trade.create({
            data: {
              userId: t.userId,
              symbol: t.symbol,
              direction: t.direction,
              entry: t.entry,
              stopLoss: t.stopLoss,
              takeProfit: t.takeProfit,
              size: t.size,
              riskAmount: t.riskAmount,
              openedAt: secToDate(t.openedAt),
              closedAt: t.closedAt !== undefined ? secToDate(t.closedAt) : undefined,
              exitPrice: t.exitPrice,
              rMultiple: t.rMultiple,
              setup: t.setup,
              strategy: t.strategy,
              reason: t.reason,
              emotion: t.emotion,
              notes: t.notes,
              zoneId: t.zoneId,
            },
          }),
        );
      },
      async list(userId) {
        return (await db.trade.findMany({ where: { userId }, orderBy: { openedAt: "desc" } })).map(toTrade);
      },
      async update(id, userId, patch) {
        const data: Record<string, unknown> = nullify(patch, TRADE_FIELDS);
        if ("openedAt" in patch && patch.openedAt !== undefined) data.openedAt = secToDate(patch.openedAt);
        if ("closedAt" in patch) data.closedAt = patch.closedAt === undefined ? null : secToDate(patch.closedAt);
        const res = await db.trade.updateMany({ where: { id, userId }, data });
        if (!res.count) return undefined;
        const t = await db.trade.findUnique({ where: { id } });
        return t ? toTrade(t) : undefined;
      },
      async remove(id, userId) {
        return (await db.trade.deleteMany({ where: { id, userId } })).count > 0;
      },
    },

    zoneLog: {
      async append(e) {
        await db.zoneLog.create({
          data: {
            symbol: e.symbol,
            timeframe: e.timeframe,
            engineVersion: e.engineVersion,
            scoringVersion: e.scoringVersion,
            zoneId: e.zone.id,
            status: e.zone.status,
            score: Math.round(e.zone.score),
            zone: json(e.zone),
          },
        });
      },
      async recent(limit) {
        const rows = await db.zoneLog.findMany({ orderBy: [{ loggedAt: "desc" }, { id: "desc" }], take: limit });
        return rows.map((r): ZoneLogEntry => ({
          id: r.id,
          symbol: r.symbol,
          timeframe: r.timeframe,
          engineVersion: r.engineVersion,
          scoringVersion: r.scoringVersion,
          zone: r.zone as unknown as Zone,
          loggedAt: ms(r.loggedAt),
        }));
      },
      async count() {
        return db.zoneLog.count();
      },
    },

    zones: {
      async track(t) {
        const z = t.zone;
        try {
          await db.zone.create({
            data: {
              id: t.key,
              symbol: t.symbol,
              timeframe: t.timeframe,
              engineVersion: t.engineVersion,
              scoringVersion: t.scoringVersion,
              provider: t.provider,
              origin: z.origin,
              direction: z.direction,
              name: z.name,
              nameAr: z.nameAr,
              top: z.top,
              bottom: z.bottom,
              score: z.score,
              quality: z.quality,
              status: z.status,
              tests: z.tests,
              factors: json(z.factors),
              htfContext: json(z.htfContext),
              invalidation: z.invalidation.price,
              atr: t.atr,
              context: json(t.context),
              snapshot: json(z),
              createdTime: new Date(z.createdTime * 1000),
              detectedBarTime: new Date(t.detectedBarTime * 1000),
              detectedAt: t.detectedAt ? new Date(t.detectedAt) : undefined,
            },
          });
          return true;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // already tracked: first observation wins
          throw e;
        }
      },
      async open(limit) {
        return (
          await db.zone.findMany({
            where: { outcome: { is: null } },
            include: { outcome: true },
            orderBy: { detectedAt: "asc" },
            take: limit,
          })
        ).map(toTracked);
      },
      async resolve(key, o) {
        const z = await db.zone.findUnique({ where: { id: key }, select: { context: true } });
        if (!z) return;
        const ctx = z.context as unknown as TrackedZone["context"];
        const data = {
          outcomeVersion: o.outcomeVersion,
          label: o.label,
          reason: o.reason,
          finalStatus: o.finalStatus,
          mfeAtr: o.mfeAtr,
          maeAtr: o.maeAtr,
          reactionAtr: o.reactionAtr,
          barsToOutcome: o.barsToOutcome,
          barsObserved: o.barsObserved,
          horizonBars: o.horizonBars,
          retests: o.retests,
          regime: json(ctx.regime),
          session: ctx.session,
          resolvedAt: new Date(o.resolvedAt),
        };
        await db.zoneOutcome.upsert({ where: { zoneId: key }, create: { zoneId: key, ...data }, update: data });
      },
      async list(q) {
        return (
          await db.zone.findMany({
            where: zoneWhere(q),
            include: { outcome: true },
            orderBy: { detectedAt: "desc" },
            take: q.limit ?? 1000,
          })
        ).map(toTracked);
      },
      async count(q) {
        return db.zone.count({ where: zoneWhere(q) });
      },
      async get(key) {
        const z = await db.zone.findUnique({ where: { id: key }, include: { outcome: true } });
        return z ? toTracked(z) : undefined;
      },
    },

    drawings: {
      async list(userId, symbol) {
        return (await db.drawing.findMany({ where: { userId, symbol }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(toDrawing);
      },
      async count(userId, symbol) {
        return db.drawing.count({ where: { userId, symbol } });
      },
      async get(id, userId) {
        const d = await db.drawing.findFirst({ where: { id, userId } });
        return d ? toDrawing(d) : undefined;
      },
      async create(userId, d) {
        return toDrawing(await db.drawing.create({ data: { userId, symbol: d.symbol, kind: d.kind, points: json(d.points) } }));
      },
      async update(id, userId, points) {
        const res = await db.drawing.updateMany({ where: { id, userId }, data: { points: json(points) } });
        if (!res.count) return undefined;
        const d = await db.drawing.findUnique({ where: { id } });
        return d ? toDrawing(d) : undefined;
      },
      async remove(id, userId) {
        return (await db.drawing.deleteMany({ where: { id, userId } })).count > 0;
      },
      async clear(userId, symbol) {
        return (await db.drawing.deleteMany({ where: { userId, symbol } })).count;
      },
    },

    feedback: {
      async upsert(f) {
        const data = { useful: f.useful, bestFactor: f.bestFactor ?? null, comment: f.comment ?? null };
        return toFeedback(
          await db.zoneFeedback.upsert({
            where: { zoneId_userId: { zoneId: f.zoneKey, userId: f.userId } },
            create: { zoneId: f.zoneKey, userId: f.userId, ...data },
            update: data,
          }),
        );
      },
      async get(zoneKey, userId) {
        const f = await db.zoneFeedback.findUnique({ where: { zoneId_userId: { zoneId: zoneKey, userId } } });
        return f ? toFeedback(f) : undefined;
      },
      async remove(zoneKey, userId) {
        return (await db.zoneFeedback.deleteMany({ where: { zoneId: zoneKey, userId } })).count > 0;
      },
      async list(q) {
        const rows = await db.zoneFeedback.findMany({
          where: q.includeDemo ? {} : { zone: { provider: { not: "demo" } } },
          include: { zone: { include: { outcome: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit ?? 5000,
        });
        return rows.map((r) => ({ ...toFeedback(r), zone: toTracked(r.zone) }));
      },
    },

    audit: {
      async append(e) {
        await db.auditLog.create({
          data: { actorId: e.actorId, action: e.action, target: e.target, meta: e.meta === undefined ? undefined : json(e.meta) },
        });
      },
      async recent(limit) {
        const rows = await db.auditLog.findMany({ orderBy: [{ at: "desc" }, { id: "desc" }], take: limit });
        return rows.map((r): AuditEntry => ({
          id: r.id,
          at: ms(r.at),
          actorId: opt(r.actorId),
          action: r.action,
          target: opt(r.target),
          meta: (r.meta ?? undefined) as Record<string, unknown> | undefined,
        }));
      },
    },
  };
}

function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}
