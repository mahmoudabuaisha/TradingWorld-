/** Trading sessions in UTC. Overlaps are derived, DST nuances documented in docs/03-data-providers.md. */
export type SessionName = "ASIA" | "LONDON" | "NEW_YORK" | "OFF";

export interface SessionWindow {
  name: SessionName;
  startHourUtc: number; // inclusive
  endHourUtc: number;   // exclusive
  label: string;
  labelAr: string;
}

export const SESSION_WINDOWS: SessionWindow[] = [
  { name: "ASIA", startHourUtc: 0, endHourUtc: 8, label: "Asia", labelAr: "آسيا" },
  { name: "LONDON", startHourUtc: 7, endHourUtc: 16, label: "London", labelAr: "لندن" },
  { name: "NEW_YORK", startHourUtc: 12, endHourUtc: 21, label: "New York", labelAr: "نيويورك" },
];

export function sessionsAt(utcSeconds: number): SessionName[] {
  const hour = new Date(utcSeconds * 1000).getUTCHours();
  const active = SESSION_WINDOWS.filter((w) => hour >= w.startHourUtc && hour < w.endHourUtc).map((w) => w.name);
  return active.length ? active : ["OFF"];
}

export function primarySessionAt(utcSeconds: number): SessionName {
  const s = sessionsAt(utcSeconds);
  if (s.includes("NEW_YORK") && s.includes("LONDON")) return "LONDON"; // overlap – London/NY
  return s[0] ?? "OFF";
}

export function isLondonNewYorkOverlap(utcSeconds: number): boolean {
  const s = sessionsAt(utcSeconds);
  return s.includes("NEW_YORK") && s.includes("LONDON");
}
