"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, Timeframe } from "@tradingworld/shared";

interface User { id: string; email: string; displayName: string; role: string }

interface AppState {
  locale: Locale;
  token?: string;
  user?: User;
  symbol: string;
  timeframe: Timeframe;
  mode: "manual" | "ai";
  showLowQuality: boolean;
  watchlist: string[];
  setLocale: (l: Locale) => void;
  setAuth: (token?: string, user?: User) => void;
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  setMode: (m: "manual" | "ai") => void;
  toggleLowQuality: () => void;
  setWatchlist: (w: string[]) => void;
}

/** Persists "last state": last chart, timeframe, watchlist, locale — as the spec requires. */
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      locale: "ar",
      symbol: "XAUUSD",
      timeframe: "5m",
      mode: "ai",
      showLowQuality: false,
      watchlist: ["XAUUSD", "EURUSD", "BTCUSD", "US100"],
      setLocale: (locale) => set({ locale }),
      setAuth: (token, user) => set({ token, user }),
      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setMode: (mode) => set({ mode }),
      toggleLowQuality: () => set((s) => ({ showLowQuality: !s.showLowQuality })),
      setWatchlist: (watchlist) => set({ watchlist }),
    }),
    { name: "tw-app" },
  ),
);
