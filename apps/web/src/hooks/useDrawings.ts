"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_DRAWINGS_PER_SYMBOL, type Drawing, type DrawingKind, type DrawingPoint } from "@tradingworld/shared";
import { api } from "@/lib/api";

const LOCAL_KEY = "tw-drawings-v1";

function readLocal(): Record<string, Drawing[]> {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") as Record<string, Drawing[]>; } catch { return {}; }
}
function writeLocal(all: Record<string, Drawing[]>) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch { /* storage full or blocked: drawings stay in memory */ }
}

/**
 * UI-01 — the user's drawings for one symbol. Signed in: stored on the API (follows the user across devices);
 * signed out: kept in this browser's localStorage. Changes are applied optimistically and rolled back on error.
 */
export function useDrawings(symbol: string, token?: string) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [error, setError] = useState<string>();
  const ref = useRef<Drawing[]>([]);
  ref.current = drawings;

  useEffect(() => {
    let live = true;
    setError(undefined);
    if (token) api.drawings(token, symbol).then((r) => live && setDrawings(r.drawings)).catch((e) => live && setError((e as Error).message));
    else setDrawings(readLocal()[symbol] ?? []);
    return () => { live = false; };
  }, [symbol, token]);

  const persistLocal = (next: Drawing[]) => { const all = readLocal(); all[symbol] = next; writeLocal(all); };

  const add = useCallback(async (kind: DrawingKind, points: DrawingPoint[]): Promise<Drawing | undefined> => {
    if (ref.current.length >= MAX_DRAWINGS_PER_SYMBOL) { setError("TOO_MANY_DRAWINGS"); return undefined; }
    const now = Date.now();
    const temp: Drawing = { id: `local-${now}-${Math.random().toString(36).slice(2, 8)}`, symbol, kind, points, createdAt: now, updatedAt: now };
    setDrawings((d) => [...d, temp]);
    if (!token) { persistLocal([...ref.current, temp]); return temp; }
    try {
      const { drawing } = await api.createDrawing(token, { symbol, kind, points });
      setDrawings((d) => d.map((x) => (x.id === temp.id ? drawing : x)));
      return drawing;
    } catch (e) { setDrawings((d) => d.filter((x) => x.id !== temp.id)); setError((e as Error).message); return undefined; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, token]);

  const update = useCallback(async (id: string, points: DrawingPoint[]) => {
    const before = ref.current;
    const next = before.map((d) => (d.id === id ? { ...d, points, updatedAt: Date.now() } : d));
    setDrawings(next);
    if (!token) { persistLocal(next); return; }
    try { await api.updateDrawing(token, id, points); } catch (e) { setDrawings(before); setError((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, token]);

  const remove = useCallback(async (id: string) => {
    const before = ref.current;
    const next = before.filter((d) => d.id !== id);
    setDrawings(next);
    if (!token) { persistLocal(next); return; }
    try { await api.deleteDrawing(token, id); } catch (e) { setDrawings(before); setError((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, token]);

  const clear = useCallback(async () => {
    const before = ref.current;
    setDrawings([]);
    if (!token) { persistLocal([]); return; }
    try { await api.clearDrawings(token, symbol); } catch (e) { setDrawings(before); setError((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, token]);

  return { drawings, add, update, remove, clear, error, clearError: () => setError(undefined) };
}
