/** Kharita line icons: one stroke weight, no fills, drawn for a 20px grid. No emoji anywhere in the shell. */
export type IconName =
  | "home" | "analysis" | "markets" | "tools" | "lab" | "journal" | "learn" | "community"
  | "search" | "settings" | "admin" | "user" | "sun" | "moon" | "close" | "bell" | "refresh" | "menu" | "chevron" | "logout" | "check";

const PATHS: Record<IconName, string> = {
  home: "M4 3h8.5L16 6.5V17H4zM12.5 3v3.5H16",
  analysis: "M3 15.5c3 0 3-6 6-6s3 6 6 6M3 10.5c3 0 3-5 6-5s3 5 6 5",
  markets: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 5.5l2 4.5-2 4.5-2-4.5z",
  tools: "M3 14l11-11 3 3-11 11H3zM6.5 10.5l3 3M9.5 7.5l3 3",
  lab: "M8 3v5l-4 7a1 1 0 0 0 .9 1.5h10.2A1 1 0 0 0 16 15l-4-7V3M7 3h6M5.5 13h9",
  journal: "M5 3h10v14H5zM8 3v14M11 7h2M11 10h2",
  learn: "M3 5c3-1 5-1 7 1 2-2 4-2 7-1v10c-3-1-5-1-7 1-2-2-4-2-7-1zM10 6v10",
  community: "M7 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM14 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 16c0-3 2-5 4.5-5s4.5 2 4.5 5M12 15.5c0-2 1.5-3.5 3.5-3.5S19 13.5 19 15.5",
  search: "M9 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13 13l4 4",
  settings: "M3 6h14M3 10h14M3 14h14M7 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM13 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  admin: "M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5z",
  user: "M10 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 17c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5",
  sun: "M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4",
  moon: "M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z",
  close: "M5 5l10 10M15 5L5 15",
  bell: "M6 8a4 4 0 0 1 8 0v3l1.5 2.5h-11L6 11zM8.5 16a1.5 1.5 0 0 0 3 0",
  refresh: "M4 10a6 6 0 0 1 10.5-4M16 10a6 6 0 0 1-10.5 4M14 3v3h-3M6 17v-3h3",
  menu: "M3 5h14M3 10h14M3 15h14",
  chevron: "M8 5l5 5-5 5",
  logout: "M8 4H4v12h4M12 7l3 3-3 3M7 10h8",
  check: "M4 10.5l4 4 8-9",
};

export function Icon({ name, size = 18, className = "", strokeWidth = 1.5 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
