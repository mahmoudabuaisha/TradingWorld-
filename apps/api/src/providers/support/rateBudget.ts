import type { RateBudgetSnapshot } from "@tradingworld/shared";

/**
 * Sliding-window budget for provider credits / requests per minute. Callers await a slot instead of
 * firing and getting 429s; the snapshot is shown on the admin sheet so a plan upgrade is a visible decision.
 */
export class RateBudget {
  private stamps: number[] = [];
  private waiting = 0;

  constructor(
    public readonly limit: number,
    public readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private prune() {
    const cut = this.now() - this.windowMs;
    while (this.stamps.length && this.stamps[0]! <= cut) this.stamps.shift();
  }

  /** Resolves once `cost` units fit in the window, waiting for the oldest stamps to expire if needed. */
  async take(cost = 1): Promise<void> {
    if (cost > this.limit) throw new Error(`RateBudget: cost ${cost} exceeds limit ${this.limit}`);
    for (;;) {
      this.prune();
      if (this.stamps.length + cost <= this.limit) {
        const t = this.now();
        for (let i = 0; i < cost; i++) this.stamps.push(t);
        return;
      }
      const wait = Math.max(25, this.stamps[0]! + this.windowMs - this.now());
      this.waiting++;
      try { await this.sleep(wait); } finally { this.waiting--; }
    }
  }

  snapshot(): RateBudgetSnapshot {
    this.prune();
    const resetInSeconds = this.stamps.length ? Math.max(0, Math.ceil((this.stamps[0]! + this.windowMs - this.now()) / 1000)) : 0;
    return { used: this.stamps.length, limit: this.limit, windowSeconds: this.windowMs / 1000, resetInSeconds, waiting: this.waiting };
  }
}
