"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, Timeframe } from "@tradingworld/shared";

interface User { id: string; email: string; displayName: string; role: string }
export type Theme = "night" | "day" | "system";

interface AppState {
  locale: Locale;
  theme: Theme;
  token?: string;
  user?: User;
  symbol: string;
  timeframe: Timeframe;
  mode: "manual" | "ai";
  showLowQuality: boolean;
  showInvalidated: boolean;
  watchlist: string[];
  /** routine checklist completion per day: dateKey → task ids */
  routineDone: Record<string, string[]>;
  setLocale: (l: Locale) => void;
  setTheme: (t: Theme) => void;
  setAuth: (token?: string, user?: User) => void;
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  setMode: (m: "manual" | "ai") => void;
  toggleLowQuality: () => void;
  toggleInvalidated: () => void;
  setWatchlist: (w: string[]) => void;
  toggleRoutine: (dateKey: string, taskId: string) => void;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  if (theme === "night") r.setAttribute("data-theme", "dark");
  else if (theme === "day") r.setAttribute("data-theme", "light");
  else r.removeAttribute("data-theme");
}

/** Persists the trader's last state: chart, timeframe, watchlist, locale, theme, routine. */
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      locale: "ar",
      theme: "night",
      symbol: "XAUUSD",
      timeframe: "5m",
      mode: "ai",
      showLowQuality: false,
      showInvalidated: false,
      watchlist: ["XAUUSD", "EURUSD", "BTCUSD", "US100"],
      routineDone: {},
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => { applyTheme(theme); set({ theme }); },
      setAuth: (token, user) => set({ token, user }),
      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setMode: (mode) => set({ mode }),
      toggleLowQuality: () => set((s) => ({ showLowQuality: !s.showLowQuality })),
      toggleInvalidated: () => set((s) => ({ showInvalidated: !s.showInvalidated })),
      setWatchlist: (watchlist) => set({ watchlist }),
      toggleRoutine: (dateKey, taskId) => set((s) => {
        const cur = s.routineDone[dateKey] ?? [];
        const next = cur.includes(taskId) ? cur.filter((t) => t !== taskId) : [...cur, taskId];
        return { routineDone: { ...s.routineDone, [dateKey]: next } };
      }),
    }),
    { name: "tw-app", version: 2 },
  ),
);
