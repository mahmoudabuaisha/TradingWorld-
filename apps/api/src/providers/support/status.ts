import type { FeedState, FeedTransport, ProviderId, ProviderStatus, RateBudgetSnapshot } from "@tradingworld/shared";

/** What an adapter tracks about its own health; `buildStatus` turns it into the public status. */
export interface FeedClock {
  transport: FeedTransport;
  lastUpdate?: number; // ms
  lastEventTime?: number; // s
  latencyMs?: number; // ws ticks only
  lastError?: string;
  lastErrorAt?: number; // ms
  pollSeconds?: number;
}

export function staleAfterMs(transport: FeedTransport, pollSeconds?: number): number {
  return transport === "ws" ? 60_000 : Math.max(3 * (pollSeconds ?? 15) * 1000, 60_000);
}

export function providerState(c: FeedClock, now = Date.now()): FeedState {
  if (c.transport === "synthetic") return "LIVE";
  if (!c.lastUpdate) return "OFFLINE";
  if (c.lastErrorAt && c.lastErrorAt > c.lastUpdate) return "OFFLINE";
  if (now - c.lastUpdate > staleAfterMs(c.transport, c.pollSeconds)) return "STALE";
  return c.transport === "ws" ? "LIVE" : "DELAYED";
}

export function buildStatus(
  id: ProviderId,
  c: FeedClock,
  extra: { licensed: boolean; plan?: string; budget?: RateBudgetSnapshot; message?: string },
  now = Date.now(),
): ProviderStatus {
  const state = providerState(c, now);
  const message =
    extra.message ??
    (state === "OFFLINE"
      ? (c.lastError ?? "idle — no requests yet")
      : c.lastError && c.lastErrorAt && now - c.lastErrorAt < 300_000
        ? `last error: ${c.lastError}`
        : undefined);
  return {
    id,
    live: state === "LIVE" || state === "DELAYED",
    state,
    transport: c.transport,
    licensed: extra.licensed,
    plan: extra.plan,
    lastUpdate: c.lastUpdate,
    lastEventTime: c.lastEventTime,
    latencyMs: c.latencyMs,
    pollSeconds: c.transport === "poll" ? c.pollSeconds : undefined,
    budget: extra.budget,
    message,
  };
}

/** "fetch failed (ENOTFOUND)" — the network cause is what an operator needs, not the generic message. */
export function describeError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  const cause = err?.cause?.code ?? err?.cause?.message;
  return `${err?.message ?? String(e)}${cause ? ` (${cause})` : ""}`;
}
