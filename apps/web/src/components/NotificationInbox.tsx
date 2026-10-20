"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AppNotification } from "@tradingworld/shared";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";

/** Fired after the inbox changes so the sheet-bar bell refreshes without waiting for its poll. */
export const INBOX_EVENT = "tw:inbox";

/** Unread count for the bell: polled every 30 s and on INBOX_EVENT. */
export function useUnread(token?: string): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!token) { setN(0); return; }
    let live = true;
    const tick = () => api.notifications(token, 1).then((r) => { if (live) setN(r.unread); }).catch(() => undefined);
    void tick();
    const onEvent = () => void tick();
    const id = setInterval(onEvent, 30_000);
    window.addEventListener(INBOX_EVENT, onEvent);
    return () => { live = false; clearInterval(id); window.removeEventListener(INBOX_EVENT, onEvent); };
  }, [token]);
  return n;
}

/** SHEET 11 · inbox — every fired alert with what happened on each channel. */
export function NotificationInbox({ refreshKey = 0 }: { refreshKey?: number }) {
  const { locale, token } = useApp();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    if (!token) return;
    const r = await api.notifications(token, 50);
    setItems(r.notifications); setUnread(r.unread);
  }, [token]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  if (!token) return null;
  const markAll = async () => { await api.markNotificationsRead(token); await load(); window.dispatchEvent(new Event(INBOX_EVENT)); };
  const chip = (d: AppNotification["deliveries"][number]) => (
    <span key={d.channel} title={d.detail} className={`chip ${d.status === "sent" ? "text-up-ink" : d.status === "failed" ? "text-stamp" : "text-ink-3"}`}>{d.channel.toUpperCase()} · {d.status.toUpperCase()}</span>
  );
  return (
    <section id="inbox" className="sheet overflow-hidden">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2">
        <span className="eyebrow">{L("صندوق الإشعارات", "INBOX")} · {items.length}{unread ? <span className="text-stamp"> · {unread} {L("غير مقروء", "UNREAD")}</span> : null}</span>
        <span className="flex items-center gap-2">
          <Link href="/settings#notifications" className="mono text-2xs text-ink-3 underline">{L("القنوات", "CHANNELS")}</Link>
          <button id="inbox-read" className="btn-ghost px-2 py-1 text-xs" disabled={!unread} onClick={markAll}>{L("تعليم الكل كمقروء", "Mark all read")}</button>
        </span>
      </div>
      <ul className="divide-y divide-hair">
        {items.map((n) => (
          <li key={n.id} className={`grid gap-1 px-4 py-2.5 ${n.readAt ? "" : "border-s-2 border-s-ink"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.url ? <Link href={n.url} className="hover:underline">{locale === "ar" ? n.title.ar : n.title.en}</Link> : (locale === "ar" ? n.title.ar : n.title.en)}</span>
              <span className="mono text-2xs text-ink-3">{new Date(n.createdAt).toISOString().slice(0, 16).replace("T", " ")}Z</span>
            </div>
            <div className="text-xs text-ink-2">{locale === "ar" ? n.body.ar : n.body.en}</div>
            <div className="flex flex-wrap gap-1"><span className="chip text-up-ink">IN-APP</span>{n.deliveries.map(chip)}</div>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">{L("لا إشعارات بعد. عندما يتحقق شرط تنبيه يظهر هنا.", "No notifications yet. When an alert condition is met it shows up here.")}</li>}
      </ul>
    </section>
  );
}
