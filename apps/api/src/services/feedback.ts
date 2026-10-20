import type { Repositories, ZoneFeedbackEntry, TrackedZone } from "../repositories/memory.js";

type Row = ZoneFeedbackEntry & { zone: TrackedZone };
export interface FeedbackBucket { n: number; useful: number; usefulRate: number }

export interface FeedbackStats {
  includeDemo: boolean;
  total: number;
  zones: number;
  overall: FeedbackBucket;
  byQuality: Record<string, FeedbackBucket>;
  byOrigin: Record<string, FeedbackBucket>;
  byScoreBand: Record<string, FeedbackBucket>;
  /** how often each factor was named "most convincing" among useful votes */
  bestFactor: Record<string, number>;
  /**
   * Agreement with the market, for zones whose outcome is known: rows = user verdict, columns = outcome label.
   * Research only — opinions and outcomes are never merged into one label.
   */
  agreement: { useful: Record<string, number>; notUseful: Record<string, number>; resolved: number };
  recentComments: { zoneName: string; zoneNameAr: string; symbol: string; timeframe: string; useful: boolean; bestFactor?: string; comment: string; at: number; outcome?: string }[];
}

const scoreBand = (s: number) => (s >= 80 ? "80-100" : s >= 65 ? "65-79" : s >= 50 ? "50-64" : "0-49");
const LABELS = ["REACTED", "INVALIDATED", "TESTED", "UNTOUCHED"];

function bucket(rows: Row[]): FeedbackBucket {
  const useful = rows.filter((r) => r.useful).length;
  return { n: rows.length, useful, usefulRate: rows.length ? Math.round((useful / rows.length) * 1000) / 1000 : 0 };
}
function groupBy(rows: Row[], f: (r: Row) => string): Record<string, FeedbackBucket> {
  const g: Record<string, Row[]> = {};
  for (const r of rows) (g[f(r)] ??= []).push(r);
  return Object.fromEntries(Object.entries(g).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, bucket(v)]));
}

/** AI-02 — aggregates of user opinions for the admin research sheet. Users never see these counts (no herding). */
export async function feedbackStats(repos: Repositories, includeDemo = false): Promise<FeedbackStats> {
  const rows = await repos.feedback.list({ includeDemo, limit: 20_000 });
  const bestFactor: Record<string, number> = {};
  for (const r of rows) if (r.useful && r.bestFactor) bestFactor[r.bestFactor] = (bestFactor[r.bestFactor] ?? 0) + 1;
  const zero = () => Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<string, number>;
  const agreement = { useful: zero(), notUseful: zero(), resolved: 0 };
  for (const r of rows) {
    const label = r.zone.outcome?.label;
    if (!label) continue;
    agreement.resolved++;
    (r.useful ? agreement.useful : agreement.notUseful)[label]!++;
  }
  return {
    includeDemo,
    total: rows.length,
    zones: new Set(rows.map((r) => r.zoneKey)).size,
    overall: bucket(rows),
    byQuality: groupBy(rows, (r) => r.zone.zone.quality),
    byOrigin: groupBy(rows, (r) => r.zone.zone.origin),
    byScoreBand: groupBy(rows, (r) => scoreBand(r.zone.zone.score)),
    bestFactor: Object.fromEntries(Object.entries(bestFactor).sort((a, b) => b[1] - a[1])),
    agreement,
    // no user ids here: comments are read as research notes, not attributed
    recentComments: rows.filter((r) => r.comment).slice(0, 20).map((r) => ({
      zoneName: r.zone.zone.name, zoneNameAr: r.zone.zone.nameAr, symbol: r.zone.symbol, timeframe: r.zone.timeframe, useful: r.useful, bestFactor: r.bestFactor, comment: r.comment!, at: r.updatedAt, outcome: r.zone.outcome?.label,
    })),
  };
}
