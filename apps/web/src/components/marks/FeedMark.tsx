import type { FeedState, FeedTransport, ProviderId } from "@tradingworld/shared";

/** The subset of a feed status the marks need; both FeedStatus and ProviderStatus satisfy it. */
export interface FeedLike {
  provider: ProviderId | string;
  state: FeedState;
  transport?: FeedTransport;
  delaySeconds?: number;
  ageSeconds?: number;
}

export function feedTone(state?: FeedState, transport?: FeedTransport): string {
  if (transport === "synthetic") return "text-ink-2";
  switch (state) {
    case "LIVE":
      return "text-up-ink";
    case "DELAYED":
      return "text-ink";
    case "CLOSED":
      return "text-ink-3";
    case "STALE":
    case "OFFLINE":
      return "text-down-ink";
    default:
      return "text-ink-3";
  }
}

function age(s: number): string {
  if (s < 90) return `${s}S`;
  if (s < 5400) return `${Math.round(s / 60)} MIN`;
  return `${Math.round(s / 3600)} H`;
}

/** "TWELVEDATA · DELAYED · 15S POLL" — source, state and how the data travels, as a surveyor's legend entry. */
export function feedLabel(f: FeedLike): string {
  const parts = [f.provider.toUpperCase()];
  if (f.transport === "synthetic") {
    parts.push("SYNTHETIC");
    return parts.join(" · ");
  }
  parts.push(f.state);
  if (f.state === "LIVE" && f.transport === "ws") parts.push("WS");
  else if (f.state === "DELAYED" && f.delaySeconds) parts.push(`${f.delaySeconds}S POLL`);
  else if ((f.state === "STALE" || f.state === "OFFLINE") && f.ageSeconds !== undefined) parts.push(age(f.ageSeconds));
  return parts.join(" · ");
}

export function FeedMark({ feed, className = "" }: { feed?: FeedLike; className?: string }) {
  if (!feed) return <span className={`mono text-ink-3 ${className}`}>—</span>;
  return <span className={`mono ${feedTone(feed.state, feed.transport)} ${className}`}>{feedLabel(feed)}</span>;
}
