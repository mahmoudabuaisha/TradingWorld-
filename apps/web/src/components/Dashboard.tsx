"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type OverviewRow } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { TradingClock } from "./tools/TradingClock";
import { PLATFORM_MODULES } from "@tradingworld/shared";

export function Dashboard() {
  const { locale, watchlist, user, setSymbol } = useApp();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.health>>>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { api.overview(watchlist).then((r) => setRows(r.rows)).catch(() => {}); api.health().then(setHealth).catch(() => {}); }, [watchlist]);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const quick = [["📊", L("فتح الشارت", "Open chart"), "/chart"], ["📒", L("تسجيل صفقة", "Log trade"), "/journal"], ["🧮", L("حاسبة المخاطرة", "Risk calc"), "/tools/risk"], ["🔔", L("التنبيهات", "Alerts"), "/alerts"], ["🎓", L("الأكاديمية", "Academy"), "/academy"]];
  const done = PLATFORM_MODULES.filter((m) => m.status !== "planned").length;
  return (
    <div className="space-y-4">
      <section className="card relative overflow-hidden p-6">
        <div className="text-[11px] tracking-[3px] text-gold">AI MARKET INTELLIGENCE</div>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">{mounted && user ? L(`أهلًا ${user.displayName}`, `Welcome, ${user.displayName}`) : L("بيئة متكاملة للمتداول", "One integrated environment for the trader")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{L("تعلّم، حلّل، خطّط، تابع السوق، سجّل صفقاتك، وراجع أداءك — ومحرك تحليل قابل للتفسير يعمل خلف الشارت.", "Learn, analyse, plan, follow the market, log trades and review performance — with an explainable analysis engine behind the chart.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">{quick.map(([i, l, h]) => <Link key={h} href={h} className="btn">{i} {l}</Link>)}</div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="chip">engine v{health?.engineVersion ?? "…"}</span>
          <span className={`chip ${health?.providers[0]?.live ? "text-up" : "text-warn"}`}>{health?.providers[0]?.id ?? "api offline"} · {health?.providers[0]?.message ?? ""}</span>
          <span className="chip">AI: {health?.ai ?? "…"}</span>
          <span className="chip">{done}/60 {L("وحدة قيد العمل", "modules in progress")}</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs font-bold tracking-wider text-gold">{L("قائمة المتابعة", "WATCHLIST")}<Link href="/markets" className="font-normal text-ink-muted hover:text-ink">{L("الكل →", "All →")}</Link></div>
          <table className="w-full text-sm">
            <thead className="text-[11px] text-ink-muted"><tr>{[L("الأصل", "Symbol"), L("السعر", "Price"), L("الحالة", "Regime"), "HTF", L("مناطق", "Zones"), L("أقوى منطقة", "Top zone")].map((h) => <th key={h} className="px-4 py-2 text-start font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-t border-line hover:bg-bg-hover">
                  <td className="px-4 py-2"><Link href="/chart" onClick={() => setSymbol(r.symbol)} className="font-mono font-bold text-gold-light">{r.symbol}</Link></td>
                  <td className="px-4 py-2 font-mono">{r.price ?? "—"}</td>
                  <td className="px-4 py-2"><span className="chip">{r.regime ?? r.error}</span> <span className="chip">{r.volatility}</span></td>
                  <td className={`px-4 py-2 ${r.htfBias === "bullish" ? "text-up" : r.htfBias === "bearish" ? "text-down" : ""}`}>{r.htfBias}</td>
                  <td className="px-4 py-2 font-mono">{r.zones}</td>
                  <td className="px-4 py-2 text-xs text-ink-muted">{r.topZone ? `${r.topZone.score}/100 · ${locale === "ar" ? r.topZone.nameAr : r.topZone.name}` : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">{L("جارٍ تحميل نظرة الأسواق… (يتطلب تشغيل الـ API)", "Loading market overview… (requires the API)")}</td></tr>}
            </tbody>
          </table>
        </section>
        <TradingClock />
      </div>
    </div>
  );
}
