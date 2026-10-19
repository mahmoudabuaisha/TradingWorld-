import type { Instrument } from "./instruments.js";

export interface MarketState {
  open: boolean;
  reason?: "weekend" | "after_hours" | "always_open";
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday (0 = Sunday) and minutes since midnight in a time zone, DST-correct via Intl. */
export function localClock(ms: number, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return { weekday: DAYS.indexOf(get("weekday")), minutes: hour * 60 + Number(get("minute")) };
}

/**
 * Coarse market calendar — enough to tell "closed" from "stale". Exchange holidays are not modelled (documented).
 * - crypto: 24/7
 * - forex, metals, commodities (spot / CFD): Sunday 17:00 → Friday 17:00 New York time
 * - indices, stocks: the regular session 09:30–16:00 in the instrument's exchange time zone, Monday–Friday
 */
export function marketState(instrument: Pick<Instrument, "assetClass" | "sessionTimezone">, nowMs = Date.now()): MarketState {
  switch (instrument.assetClass) {
    case "crypto":
      return { open: true, reason: "always_open" };
    case "forex":
    case "metal":
    case "commodity": {
      const { weekday, minutes } = localClock(nowMs, "America/New_York");
      const rollover = 17 * 60;
      if (weekday === 6 || (weekday === 0 && minutes < rollover) || (weekday === 5 && minutes >= rollover)) return { open: false, reason: "weekend" };
      return { open: true };
    }
    default: {
      const tz = instrument.sessionTimezone && instrument.sessionTimezone !== "UTC" ? instrument.sessionTimezone : "America/New_York";
      const { weekday, minutes } = localClock(nowMs, tz);
      if (weekday === 0 || weekday === 6) return { open: false, reason: "weekend" };
      if (minutes < 9 * 60 + 30 || minutes >= 16 * 60) return { open: false, reason: "after_hours" };
      return { open: true };
    }
  }
}
