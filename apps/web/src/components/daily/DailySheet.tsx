"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { findInstrument } from "@tradingworld/shared";
import { api, type OverviewRow, type Trade } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { useClock, fmtMinutes, sessionLabel } from "@/hooks/useClock";
import { t } from "@/i18n/dictionary";
import { Terrain } from "../marks/Terrain";
import { Dimension } from "../marks/Dimension";
import { SessionDial } from "../marks/SessionDial";
import { Icon } from "../Icon";

const ROUTINE = [
  { id: "calendar", ar: "فحص التقويم الاقتصادي", en: "Check the economic calendar" },
  { id: "bias", ar: "تحديد الانحياز على 1d و4h", en: "Set the bias on 1d and 4h" },
  { id: "levels", ar: "مراجعة المستويات على أصول المتابعة", en: "Review levels on the watchlist" },
  { id: "risk", ar: "تحديد سقف المخاطرة لليوم", en: "Set today's risk cap" },
  { id: "session", ar: "جلسة التداول أو الدراسة", en: "Trading or study session" },
  { id: "review", ar: "مراجعة الصفقات وإغلاق الورقة", en: "Review trades and close the sheet" },
];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function isoWeek(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

function fmtPrice(p: number | undefined, precision: number) {
  if (p === undefined) return { main: "—", pip: "" };
  const s = p.toFixed(precision);
  if (precision < 2) return { main: Number(s).toLocaleString("en-US"), pip: "" };
  const [i, f] = s.split(".");
  return { main: `${Number(i).toLocaleString("en-US")}.${f!.slice(0, -2)}`, pip: f!.slice(-2) };
}

function line(r: OverviewRow, locale: "ar" | "en"): { glyph: string; text: string; tone: string } {
  const inst = findInstrument(r.symbol);
  const name = locale === "ar" ? (inst?.nameAr ?? r.symbol) : r.symbol;
  if (r.error)
    return {
      glyph: "!",
      text: `${name}: ${locale === "ar" ? "مصدر البيانات غير متاح" : "data source unavailable"}${r.feed ? ` (${r.feed.provider.toUpperCase()} · ${r.feed.state})` : ""} — ${r.error}`,
      tone: "text-stamp",
    };
  const regime = {
    TRENDING_UP: ["اتجاه صاعد", "trending up"],
    TRENDING_DOWN: ["اتجاه هابط", "trending down"],
    RANGING: ["نطاق عرضي", "ranging"],
  }[r.regime ?? "RANGING"] ?? ["", ""];
  const vol = {
    HIGH: ["بتقلب مرتفع", "high volatility"],
    NORMAL: ["بتقلب طبيعي", "normal volatility"],
    LOW: ["بتقلب منخفض", "low volatility"],
  }[r.volatility ?? "NORMAL"] ?? ["", ""];
  const p = r.precision ?? 2;
  const sweep = r.lastSweep
    ? locale === "ar"
      ? ` سحب ${r.lastSweep.side === "sell-side" ? "سيولة البيع" : "سيولة الشراء"} عند ${r.lastSweep.level.toFixed(p)}${r.lastSweep.displacementAfter ? " تبعه اندفاع." : " ثم استعادة."}`
      : ` ${r.lastSweep.side === "sell-side" ? "Sell-side" : "Buy-side"} liquidity swept at ${r.lastSweep.level.toFixed(p)}${r.lastSweep.displacementAfter ? ", followed by displacement." : ", then reclaimed."}`
    : "";
  const zone = r.topZone
    ? locale === "ar"
      ? ` أقوى منطقة ${r.topZone.score}/100 · ${r.topZone.status}.`
      : ` Strongest zone ${r.topZone.score}/100 · ${r.topZone.status}.`
    : locale === "ar"
      ? " لا منطقة تتجاوز حد الجودة."
      : " No zone above the quality threshold.";
  const glyph = r.htfBias === "bullish" ? "▲" : r.htfBias === "bearish" ? "▼" : "≈";
  const tone = r.htfBias === "bullish" ? "text-up-ink" : r.htfBias === "bearish" ? "text-down-ink" : "text-ink-3";
  return {
    glyph,
    text: locale === "ar" ? `${name}: ${regime[0]} ${vol[0]}.${sweep}${zone}` : `${name}: ${regime[1]}, ${vol[1]}.${sweep}${zone}`,
    tone,
  };
}

/** SHEET 00 — the trader's daily field sheet. What changed, the watchlist as terrain, today's routine, open trades dimensioned. */
export function DailySheet() {
  const { locale, watchlist, token, user, setSymbol, routineDone, toggleRoutine } = useApp();
  const clock = useClock(1000);
  const [rows, setRows] = useState<OverviewRow[]>();
  const [err, setErr] = useState<string>();
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.health>>>();
  const [feeds, setFeeds] = useState<Awaited<ReturnType<typeof api.feeds>>>();
  const [trades, setTrades] = useState<Trade[]>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    api
      .overview(watchlist)
      .then((r) => setRows(r.rows))
      .catch((e) => setErr((e as Error).message));
    api
      .health()
      .then(setHealth)
      .catch(() => {});
    api
      .feeds()
      .then(setFeeds)
      .catch(() => {});
  }, [watchlist]);
  useEffect(() => {
    if (token)
      api
        .journal(token)
        .then((j) => setTrades(j.trades.filter((x) => x.exitPrice === undefined)))
        .catch(() => setTrades([]));
    else setTrades(undefined);
  }, [token]);

  const dateKey = clock?.dateKey ?? "";
  // one line for the watchlist's sources: "DEMO ×3 · BINANCE OFFLINE ×1" — synthetic data is named, never shown as live
  const feedSummary = useMemo(() => {
    if (!feeds) return undefined;
    const mine = feeds.feeds.filter((f) => watchlist.includes(f.symbol));
    const counts = new Map<string, number>();
    for (const f of mine) {
      const k = f.transport === "synthetic" ? "DEMO" : `${f.provider.toUpperCase()} ${f.state}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].map(([k, n]) => `${k} ×${n}`).join(" · ");
  }, [feeds, watchlist]);
  const feedTrouble = feeds?.feeds.some((f) => watchlist.includes(f.symbol) && (f.state === "OFFLINE" || f.state === "STALE"));
  const done = routineDone[dateKey] ?? [];
  const header = useMemo(() => {
    if (!clock) return "";
    const d = clock.now;
    const next = clock.next ? ` · ${sessionLabel(clock.next.name)} OPEN IN ${fmtMinutes(clock.next.minutes)}` : "";
    return `${DAYS[d.getUTCDay()]} · ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · WEEK ${isoWeek(d)}${next}`;
  }, [clock]);
  const open = trades ?? [];
  const priceOf = (sym: string) => rows?.find((r) => r.symbol === sym)?.price;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">SHEET 00 · DAILY · {header}</span>
          <h1 className="text-2xl font-semibold">
            {mounted && user ? (locale === "ar" ? `ورقة ${user.displayName}` : `${user.displayName}'s sheet`) : t(locale, "daily", "title")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link href="/chart" className="btn">
            <Icon name="analysis" size={15} />
            {t(locale, "nav", "chart")}
          </Link>
          <Link href="/journal" className="btn-ghost">
            <Icon name="journal" size={15} />
            {t(locale, "nav", "journal")}
          </Link>
          <Link href="/tools/risk" className="btn-ghost">
            <Icon name="tools" size={15} />
            {locale === "ar" ? "حاسبة المخاطرة" : "Risk calculator"}
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <section className="sheet p-5">
            <h2 className="text-lg font-semibold">{t(locale, "daily", "title")}</h2>
            <div className="mt-3 space-y-2 text-sm">
              {!rows && !err && <div className="text-ink-3">{t(locale, "daily", "loading")}</div>}
              {err && (
                <div className="text-stamp">
                  {t(locale, "daily", "offline")} <span className="mono text-xs">({err})</span>
                </div>
              )}
              {rows?.map((r) => {
                const l = line(r, locale);
                return (
                  <div key={r.symbol} className="grid grid-cols-[20px_1fr] gap-2 border-b border-dashed border-hair pb-2">
                    <span className={`mono text-xs ${l.tone}`}>{l.glyph}</span>
                    <span>{l.text}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="sheet overflow-hidden">
            <div className="flex items-center justify-between border-b border-hair px-5 py-2">
              <span className="eyebrow">WATCHLIST · TERRAIN</span>
              <Link href="/markets" className="text-xs text-ink-3 hover:text-ink">
                {t(locale, "nav", "markets")}
              </Link>
            </div>
            <div className="divide-y divide-hair">
              {(rows ?? watchlist.map((s) => ({ symbol: s }) as OverviewRow)).map((r) => {
                const p = fmtPrice(r.price, r.precision ?? findInstrument(r.symbol)?.pricePrecision ?? 2);
                return (
                  <Link
                    key={r.symbol}
                    href="/chart"
                    onClick={() => setSymbol(r.symbol)}
                    className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-3 px-5 py-2 hover:bg-raised"
                  >
                    <span className="mono text-sm font-semibold">{r.symbol}</span>
                    <Terrain values={r.spark ?? []} height={34} />
                    <span className="mono text-end text-sm">
                      {p.main}
                      <span className="pip">{p.pip}</span>
                      <span className={`ms-2 text-xs ${(r.changePct ?? 0) >= 0 ? "text-up-ink" : "text-down-ink"}`}>
                        {r.changePct !== undefined ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%` : ""}
                      </span>
                    </span>
                    <span className={`sw ${r.htfBias === "bearish" ? "hatch-down" : "hatch-up"}`} title={r.htfBias} />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="sheet p-5">
            <span className="eyebrow">OPEN TRADES</span>
            {!token && (
              <p className="mt-2 text-sm text-ink-3">
                {t(locale, "daily", "signinOpen")}{" "}
                <Link href="/login" className="underline">
                  {t(locale, "shell", "signin")}
                </Link>
              </p>
            )}
            {token && open.length === 0 && <p className="mt-2 text-sm text-ink-3">{t(locale, "daily", "noOpen")}</p>}
            {open.map((tr) => (
              <div key={tr.id} className="mt-3 border-t border-hair pt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="mono font-semibold">{tr.symbol}</span>
                  <span className={`chip ${tr.direction === "long" ? "text-up-ink" : "text-down-ink"}`}>{tr.direction}</span>
                  <span className="mono text-ink-3">{tr.size} lot</span>
                  {tr.setup && <span className="chip">{tr.setup}</span>}
                </div>
                <Dimension
                  entry={tr.entry}
                  stop={tr.stopLoss}
                  target={tr.takeProfit}
                  current={priceOf(tr.symbol)}
                  direction={tr.direction}
                  precision={findInstrument(tr.symbol)?.pricePrecision ?? 2}
                />
              </div>
            ))}
          </section>
        </div>

        <div className="space-y-5">
          <section className="sheet p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t(locale, "daily", "routine")}</h2>
              <span className="mono text-xs text-ink-3">
                {done.length}/{ROUTINE.length}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {ROUTINE.map((task) => {
                const checked = done.includes(task.id);
                return (
                  <label
                    key={task.id}
                    className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition ${checked ? "border-hair text-ink-3 line-through" : "border-hair hover:border-rule"}`}
                  >
                    <input
                      type="checkbox"
                      id={`routine-${task.id}`}
                      className="accent-ink"
                      checked={checked}
                      onChange={() => dateKey && toggleRoutine(dateKey, task.id)}
                    />
                    <span>{locale === "ar" ? task.ar : task.en}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-ink-3">{t(locale, "daily", "goals")}</p>
          </section>

          <section className="sheet p-5">
            <span className="eyebrow">SURVEY CLOCK</span>
            {clock && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <SessionDial size={108} labels={false} />
                  <div>
                    <div className="mono text-3xl font-medium leading-none">
                      {clock.utc}
                      <span className="text-base text-ink-3"> UTC</span>
                    </div>
                    <div className="mono mt-1 text-xs text-ink-3">LOCAL {clock.local}</div>
                  </div>
                </div>
                <div className="text-end text-xs">
                  <div className="flex flex-wrap justify-end gap-1">
                    {clock.sessions.map((s) => (
                      <span key={s} className={`chip ${s === "OFF" ? "" : "text-up-ink"}`}>
                        {sessionLabel(s)}
                      </span>
                    ))}
                  </div>
                  {clock.next && (
                    <div className="mono mt-1 text-ink-3">
                      {t(locale, "shell", "nextSession")} {sessionLabel(clock.next.name)} · {fmtMinutes(clock.next.minutes)}
                    </div>
                  )}
                </div>
              </div>
            )}
            <Link href="/tools/sessions" className="mt-3 inline-block text-xs text-ink-3 hover:text-ink">
              {locale === "ar" ? "قرص الجلسات الكامل" : "Full session dial"}
            </Link>
          </section>

          <div className="tblock sheet">
            <div>
              <b>ENGINE</b>
              <span>{health?.engineVersion ?? "…"}</span>
            </div>
            <div>
              <b>FEED</b>
              <span className={`mono ${feedTrouble ? "text-down-ink" : ""}`} title={feeds?.warnings.join("\n")}>
                {feedSummary ?? "…"}
              </span>
            </div>
            <div>
              <b>AI</b>
              <span>{health?.ai?.toUpperCase() ?? "…"}</span>
            </div>
            <div>
              <b>SHEETS</b>
              <span>{watchlist.length} WATCHED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
