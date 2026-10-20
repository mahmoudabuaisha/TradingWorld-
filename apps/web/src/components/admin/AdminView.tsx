"use client";
import { useEffect, useState } from "react";
import { TIMEFRAMES } from "@tradingworld/shared";
import {
  api,
  type AdminOverview,
  type FeedsResponse,
  type AdminBackfill,
  type AdminOutcomes,
  type OutcomeBucket,
  type AdminFeedback,
  type AdminBackups,
  type AdminOps,
} from "@/lib/api";
import { useApp } from "@/store/useApp";
import { FeedMark } from "../marks/FeedMark";
import { BackupPanel } from "./BackupPanel";
import { OpsPanel } from "./OpsPanel";

/** SHEET 58 — the admin panel: system health, feeds, engine, module status and the research sheet. */
export function AdminView() {
  const { token, user, locale } = useApp();
  const [o, setO] = useState<AdminOverview>();
  const [factors, setFactors] = useState<Awaited<ReturnType<typeof api.adminFactors>>>();
  const [feeds, setFeeds] = useState<FeedsResponse>();
  const [backfill, setBackfill] = useState<AdminBackfill>();
  const [backups, setBackups] = useState<AdminBackups>();
  const [ops, setOps] = useState<AdminOps>();
  const [outcomes, setOutcomes] = useState<AdminOutcomes>();
  const [withDemo, setWithDemo] = useState(false);
  const [feedback, setFeedback] = useState<AdminFeedback>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    if (!token) return;
    api
      .adminOverview(token)
      .then(setO)
      .catch((e) => setErr(e.message));
    api
      .adminFactors(token)
      .then(setFactors)
      .catch(() => {});
    const loadFeeds = () => {
      api
        .feeds()
        .then(setFeeds)
        .catch(() => {});
      api
        .adminBackfill(token)
        .then(setBackfill)
        .catch(() => {});
      api
        .adminBackups(token)
        .then(setBackups)
        .catch(() => {});
      api
        .adminOps(token)
        .then(setOps)
        .catch(() => {});
    };
    void loadFeeds();
    const timer = setInterval(loadFeeds, 15_000);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    api
      .adminOutcomes(token, withDemo)
      .then(setOutcomes)
      .catch(() => {});
    api
      .adminFeedback(token, withDemo)
      .then(setFeedback)
      .catch(() => {});
  }, [token, withDemo]);
  const runOutcomes = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await api.runOutcomes(token);
      setOutcomes(await api.adminOutcomes(token, withDemo));
    } finally {
      setBusy(false);
    }
  };
  const runBackfill = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await api.triggerBackfill(token, { kind: "cycle" });
      setTimeout(
        () =>
          void api
            .adminBackfill(token)
            .then(setBackfill)
            .catch(() => {}),
        1500,
      );
    } finally {
      setBusy(false);
    }
  };
  const stamp = (s?: number) => (s ? new Date(s * 1000).toISOString().slice(5, 16).replace("T", " ") : "—");
  const ago = (ms?: number) => (ms ? `${Math.max(0, Math.round((Date.now() - ms) / 60000))} MIN AGO` : "—");
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  if (!token || user?.role !== "admin")
    return <div className="sheet mx-auto mt-6 max-w-lg p-6 text-center text-ink-2">{L("هذه الورقة للمشرفين فقط.", "Admins only.")}</div>;
  if (err) return <div className="sheet mx-auto mt-6 max-w-lg p-6 text-stamp">{err}</div>;
  if (!o) return <div className="sheet p-6 text-ink-3">…</div>;
  const counts = o.modules.reduce<Record<string, number>>((a, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
  const weights = Object.entries(o.engine.weights).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-5">
      <div>
        <span className="eyebrow">ADMIN · 58 · SYSTEM SHEET</span>
        <h1 className="text-2xl font-semibold">{L("لوحة الإدارة", "Admin Panel")}</h1>
      </div>
      <div className="tblock sheet">
        <div>
          <b>USERS</b>
          <span>{o.users}</span>
        </div>
        <div>
          <b>ZONES LOGGED</b>
          <span>{o.zonesLogged}</span>
        </div>
        <div>
          <b>ENGINE</b>
          <span>
            {o.engine.version} · {o.engine.scoring}
          </span>
        </div>
        <div>
          <b>AI</b>
          <span>{o.ai.toUpperCase()}</span>
        </div>
        <div>
          <b>ANALYSIS CACHE</b>
          <span>{(o as AdminOverview & { analysisCache?: { cached: number } }).analysisCache?.cached ?? "—"}</span>
        </div>
        <div>
          <b>UPTIME</b>
          <span>{Math.round(o.uptime / 60)} MIN</span>
        </div>
        <div>
          <b>RSS</b>
          <span>{Math.round(o.memory / 1e6)} MB</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {ops && <OpsPanel data={ops} token={token} locale={locale} L={L} onChange={setOps} />}
        <section className="sheet p-4 md:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="eyebrow">DATA FEEDS · {L("مصادر البيانات", "Sources")}</span>
            <span className="mono text-2xs text-ink-3">
              ROUTES ·{" "}
              {feeds && Object.keys(feeds.routes).length
                ? Object.entries(feeds.routes)
                    .map(([c, p]) => `${c.toUpperCase()}=${String(p).toUpperCase()}`)
                    .join(" · ")
                : "ALL DEMO"}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-hair text-sm">
            {(feeds?.providers ?? o.providers).map((p) => (
              <li key={p.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 py-1.5">
                <span className="mono font-semibold">{p.id.toUpperCase()}</span>
                <span className="mono text-2xs text-ink-2">
                  {p.transport.toUpperCase()}
                  {p.plan ? ` · ${p.plan.toUpperCase()}` : ""}
                  {p.budget
                    ? ` · BUDGET ${p.budget.used}/${p.budget.limit} PER ${p.budget.windowSeconds}S${p.budget.waiting ? ` · ${p.budget.waiting} WAITING` : ""}`
                    : ""}{" "}
                  · {p.licensed ? "LICENSED" : "UNLICENSED"}
                  {p.message ? <span className="block truncate text-ink-3">{p.message}</span> : null}
                </span>
                <FeedMark
                  feed={{
                    provider: p.id,
                    state: p.state,
                    transport: p.transport,
                    delaySeconds: p.pollSeconds,
                    ageSeconds: p.lastUpdate ? Math.max(0, Math.floor((Date.now() - p.lastUpdate) / 1000)) : undefined,
                  }}
                  className="text-xs"
                />
              </li>
            ))}
          </ul>
          {feeds?.warnings.length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-down-ink">
              {feeds.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
          {feeds && (
            <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {feeds.feeds.map((f) => (
                <div
                  key={f.symbol}
                  className="grid grid-cols-[72px_1fr_auto] items-center gap-2 border-t border-hair py-1 text-xs"
                  title={f.message}
                >
                  <span className="mono font-semibold">{f.symbol}</span>
                  <span className="text-2xs text-ink-3">
                    {f.marketOpen ? L("السوق مفتوح", "market open") : L("السوق مغلق", "market closed")}
                    {f.ageSeconds !== undefined ? (
                      <span dir="ltr" className="mono ms-1">
                        · {f.ageSeconds}S
                      </span>
                    ) : null}
                  </span>
                  <FeedMark feed={f} className="text-2xs" />
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-3">
            {L(
              "المصدر ووقت الاستلام وحالة التدفق لكل أداة. CLOSED يعني أن السوق مغلق لا أن البيانات متوقفة. التفاصيل والخطط في docs/03.",
              "Source, receipt time and flow state per instrument. CLOSED means the market is closed, not that data stopped. Plans and details in docs/03.",
            )}
          </p>
        </section>
        {outcomes && (
          <OutcomesPanel
            data={outcomes}
            withDemo={withDemo}
            setWithDemo={setWithDemo}
            onRun={runOutcomes}
            busy={busy}
            L={L}
            locale={locale}
          />
        )}
        {feedback && <FeedbackPanel data={feedback} L={L} locale={locale} />}
        {backups && <BackupPanel data={backups} L={L} />}
        <section className="sheet p-4 md:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="eyebrow">
              CANDLE STORE · {L("مخزن الشموع", "Candle store")} · {(backfill?.store ?? "…").toUpperCase()}
            </span>
            <span className="mono text-2xs text-ink-3">
              {backfill
                ? `JOB ${backfill.enabled ? "ON" : "OFF"} · BASE ${backfill.job.baseTimeframe} × ${backfill.job.bars} · ${backfill.job.symbols.length} SYMBOLS · LAST ${ago(backfill.job.lastRunAt)}${backfill.job.running ? " · RUNNING" : ""}`
                : ""}
            </span>
          </div>
          {backfill && (
            <>
              <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {backfill.series.length ? (
                  [...backfill.series]
                    .sort(
                      (a, b) =>
                        a.symbol.localeCompare(b.symbol) ||
                        (TIMEFRAMES as readonly string[]).indexOf(a.timeframe) - (TIMEFRAMES as readonly string[]).indexOf(b.timeframe),
                    )
                    .map((s) => (
                      <div
                        key={`${s.symbol}:${s.timeframe}`}
                        className="grid grid-cols-[72px_36px_1fr_auto] items-center gap-2 border-t border-hair py-1 text-xs"
                      >
                        <span className="mono font-semibold">{s.symbol}</span>
                        <span className="mono text-ink-2">{s.timeframe}</span>
                        <span dir="ltr" className="mono text-2xs text-ink-3">
                          {stamp(s.first)} → {stamp(s.last)}
                        </span>
                        <span className="mono text-end">{s.count.toLocaleString("en-US")}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-ink-3">
                    {L(
                      "لا سلاسل مخزنة بعد. شغّل دورة التعبئة أو فعّل BACKFILL_ENABLED.",
                      "No series stored yet. Run a maintenance cycle or enable BACKFILL_ENABLED.",
                    )}
                  </p>
                )}
              </div>
              {backfill.job.runs.length > 0 && (
                <ul className="mt-3 space-y-0.5 border-t border-hair pt-2 text-2xs">
                  {backfill.job.runs.slice(0, 8).map((r, idx) => (
                    <li key={idx} className="mono flex flex-wrap items-center gap-2 text-ink-2">
                      <span className={`chip ${r.status === "failed" ? "text-down-ink" : r.status === "running" ? "" : "text-up-ink"}`}>
                        {r.status.toUpperCase()}
                      </span>
                      <span>
                        {r.kind.toUpperCase()} · {r.symbol} {r.timeframe} · {r.bars} BARS
                      </span>
                      <span dir="ltr" className="text-ink-3">
                        {new Date(r.startedAt).toISOString().slice(11, 19)}Z
                        {r.finishedAt ? ` · ${Math.round((r.finishedAt - r.startedAt) / 100) / 10}S` : ""}
                      </span>
                      {r.error && <span className="text-down-ink">{r.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className="btn" disabled={busy || backfill.job.running} onClick={runBackfill}>
                  {L("تشغيل دورة صيانة الآن", "Run a maintenance cycle now")}
                </button>
                <span className="text-xs text-ink-3">
                  {L(
                    "تعبئة/لحاق → إصلاح الفجوات → اشتقاق الفريمات الأعلى. كل طلب يمر عبر ميزانية المزود.",
                    "Backfill/catch-up → gap repair → derive higher timeframes. Every request goes through the provider's budget.",
                  )}
                </span>
              </div>
            </>
          )}
        </section>
        <section className="sheet p-4">
          <span className="eyebrow">SHEETS · {o.modules.length}</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(counts).map(([s, n]) => (
              <span key={s} className="chip">
                {s.replace("_", " ")} · {n}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {L(
              "المصدر: سجل الوحدات المشترك. التعديل من PROGRESS.md وسجل الوحدات.",
              "Source: the shared module registry. Edit from PROGRESS.md and the registry.",
            )}
          </p>
        </section>
        <section className="sheet p-4">
          <span className="eyebrow">SCORING WEIGHTS · {o.engine.scoring}</span>
          <ul className="mt-2 space-y-1 text-xs">
            {weights.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[150px_1fr_36px] items-center gap-2">
                <span className="mono text-ink-2">{k}</span>
                <span className="h-2 bg-raised">
                  <span className="block h-2 hatch-up" style={{ width: `${(v / 18) * 100}%` }} />
                </span>
                <span className="mono text-end">{v}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="sheet p-4">
          <span className="eyebrow">RESEARCH · FACTOR FREQUENCY · SAMPLE {factors?.sample ?? 0}</span>
          <ul className="mt-2 space-y-1 text-xs">
            {factors &&
              Object.entries(factors.factors).map(([k, s]) => (
                <li key={k} className="grid grid-cols-[150px_1fr_90px] items-center gap-2">
                  <span className="mono text-ink-2">{k}</span>
                  <span className="h-2 bg-raised">
                    <span className="block h-2 hatch-up" style={{ width: `${s.total ? (s.present / s.total) * 100 : 0}%` }} />
                  </span>
                  <span className="mono text-end">
                    {s.total ? Math.round((s.present / s.total) * 100) : 0}% · {Math.round(s.avgScoreWhenPresent)}
                  </span>
                </li>
              ))}
          </ul>
          {factors && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(factors.byStatus).map(([s, n]) => (
                <span key={s} className="chip">
                  {s} · {n}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-3">
            {L(
              "نسبة حضور كل عامل في المناطق المسجلة ومتوسط الدرجة عند حضوره. الخطوة الأولى في ورقة الأبحاث.",
              "How often each factor is present in logged zones and the mean score when present. First step of the research sheet.",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** One reaction-rate row: hatched bar = share of zones that reacted, n = resolved zones behind it. */
function RateRows({ title, rows }: { title: string; rows: Record<string, OutcomeBucket> }) {
  const entries = Object.entries(rows);
  return (
    <div>
      <span className="eyebrow">{title}</span>
      {entries.length ? (
        <ul className="mt-1 space-y-1 text-xs">
          {entries.map(([k, b]) => (
            <li key={k} className="grid grid-cols-[96px_1fr_88px] items-center gap-2">
              <span className="mono truncate text-ink-2">{k}</span>
              <span className="h-2 bg-raised">
                <span className="block h-2 hatch-up" style={{ width: pct(b.reactionRate) }} />
              </span>
              <span dir="ltr" className="mono text-end">
                {pct(b.reactionRate)} · n {b.n}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-ink-3">—</p>
      )}
    </div>
  );
}

/** AI-01 — what happened to the zones the engine emitted. Reaction-based labels, never profit. */
function OutcomesPanel({
  data,
  withDemo,
  setWithDemo,
  onRun,
  busy,
  L,
  locale,
}: {
  data: AdminOutcomes;
  withDemo: boolean;
  setWithDemo: (v: boolean) => void;
  onRun: () => void;
  busy: boolean;
  L: (ar: string, en: string) => string;
  locale: string;
}) {
  const s = data.stats;
  const tone: Record<string, string> = { REACTED: "text-up-ink", INVALIDATED: "text-down-ink", TESTED: "", UNTOUCHED: "text-ink-3" };
  return (
    <section className="sheet p-4 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="eyebrow">
          ZONE OUTCOMES · {L("نتائج المناطق", "Zone outcomes")} · {s.outcomeVersion} · HORIZON {s.horizonBars} BARS
        </span>
        <label htmlFor="outcomes-demo" className="flex items-center gap-2 text-xs text-ink-2">
          <input id="outcomes-demo" type="checkbox" checked={withDemo} onChange={(e) => setWithDemo(e.target.checked)} />
          {L("تضمين بيانات العرض (اصطناعية)", "Include demo (synthetic) data")}
        </label>
      </div>
      <div className="tblock mt-2">
        <div>
          <b>OPEN</b>
          <span>{s.open}</span>
        </div>
        <div>
          <b>RESOLVED</b>
          <span>{s.resolved}</span>
        </div>
        <div>
          <b>REACTION RATE</b>
          <span className="text-up-ink">{s.overall.n ? pct(s.overall.reactionRate) : "—"}</span>
        </div>
        <div>
          <b>INVALIDATED</b>
          <span className="text-down-ink">{s.overall.invalidated}</span>
        </div>
        <div>
          <b>AVG MFE / MAE</b>
          <span>{s.overall.avgMfeAtr !== undefined ? `${s.overall.avgMfeAtr} / ${s.overall.avgMaeAtr} ATR` : "—"}</span>
        </div>
        <div>
          <b>JOB</b>
          <span>
            {data.job.started ? `EVERY ${Math.round(data.job.intervalSeconds / 60)} MIN` : "OFF"}
            {data.job.scan.length ? ` · SCAN ${data.job.scan.join(" ")}` : ""}
          </span>
        </div>
      </div>
      {s.resolved > 0 ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <RateRows title={L("حسب الجودة", "By quality")} rows={s.byQuality} />
          <RateRows title={L("حسب نطاق الدرجة", "By score band")} rows={s.byScoreBand} />
          <RateRows title={L("حسب الأصل", "By origin")} rows={s.byOrigin} />
          <RateRows title={L("حسب الجلسة", "By session")} rows={s.bySession} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-3">
          {L(
            "لا نتائج محلولة بعد. كل منطقة تُتابَع من أول ظهور لها، وتُوسَم عند إبطالها أو بعد اكتمال الأفق.",
            "No resolved outcomes yet. Every zone is followed from its first appearance and labelled when it is invalidated or its horizon closes.",
          )}
          {!withDemo && s.open === 0
            ? ` ${L("فعّل «تضمين بيانات العرض» لرؤية مناطق المزود الاصطناعي.", "Enable “include demo” to see zones from the synthetic provider.")}`
            : ""}
        </p>
      )}
      {s.recent.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-hair pt-2 text-2xs">
          {s.recent.slice(0, 8).map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2 text-ink-2">
              <span className={`chip mono ${tone[r.label] ?? ""}`}>{r.label}</span>
              <span className="mono">
                {r.symbol} {r.timeframe}
              </span>
              <span className="truncate">{locale === "ar" ? r.nameAr : r.name}</span>
              <span dir="ltr" className="mono text-ink-3">
                {r.quality} {Math.round(r.score)} · {r.barsToOutcome} BARS · MFE {r.mfeAtr} ATR{r.provider === "demo" ? " · DEMO" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy} onClick={onRun}>
          {L("وسم المناطق المفتوحة الآن", "Label open zones now")}
        </button>
        <span className="text-xs text-ink-3">
          {L(
            "الوسم يقيس التفاعل لا الربح، ويستخدم فقط الشموع المغلقة بعد لحظة الاكتشاف. مجموعة التدريب: GET /admin/research/dataset (بلا بيانات العرض).",
            "Labels measure reaction, not profit, using only closed bars after detection. Training set: GET /admin/research/dataset (demo excluded).",
          )}
        </span>
      </div>
    </section>
  );
}

/** AI-02 — what users think of the zones. Admin-only aggregates; users only ever see their own vote. */
function FeedbackPanel({ data, L, locale }: { data: AdminFeedback; L: (ar: string, en: string) => string; locale: string }) {
  const labels = ["REACTED", "INVALIDATED", "TESTED", "UNTOUCHED"];
  const rate = (rows: Record<string, { n: number; useful: number; usefulRate: number }>) =>
    Object.fromEntries(
      Object.entries(rows).map(([k, b]) => [
        k,
        { n: b.n, reacted: b.useful, invalidated: 0, tested: 0, untouched: 0, reactionRate: b.usefulRate } as OutcomeBucket,
      ]),
    );
  const factors = Object.entries(data.bestFactor);
  const maxF = Math.max(1, ...factors.map(([, n]) => n));
  return (
    <section className="sheet p-4 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="eyebrow">
          USER FEEDBACK · {L("آراء المستخدمين", "User feedback")} · {L("منفصلة عن نتائج السوق", "kept apart from outcomes")}
        </span>
        <span className="mono text-2xs text-ink-3">{data.includeDemo ? "INCL. DEMO" : "REAL DATA ONLY"}</span>
      </div>
      <div className="tblock mt-2">
        <div>
          <b>VOTES</b>
          <span>{data.total}</span>
        </div>
        <div>
          <b>ZONES RATED</b>
          <span>{data.zones}</span>
        </div>
        <div>
          <b>USEFUL</b>
          <span className="text-up-ink">{data.total ? pct(data.overall.usefulRate) : "—"}</span>
        </div>
        <div>
          <b>ON RESOLVED ZONES</b>
          <span>{data.agreement.resolved}</span>
        </div>
      </div>
      {data.total > 0 ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <RateRows title={L("نسبة «مفيد» حسب الجودة", "Useful by quality")} rows={rate(data.byQuality)} />
          <RateRows title={L("نسبة «مفيد» حسب نطاق الدرجة", "Useful by score band")} rows={rate(data.byScoreBand)} />
          <div>
            <span className="eyebrow">{L("العامل الأكثر إقناعًا", "Most convincing factor")}</span>
            {factors.length ? (
              <ul className="mt-1 space-y-1 text-xs">
                {factors.map(([k, n]) => (
                  <li key={k} className="grid grid-cols-[150px_1fr_36px] items-center gap-2">
                    <span className="mono truncate text-ink-2">{k}</span>
                    <span className="h-2 bg-raised">
                      <span className="block h-2 hatch-up" style={{ width: `${(n / maxF) * 100}%` }} />
                    </span>
                    <span className="mono text-end">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-3">—</p>
            )}
          </div>
          <div>
            <span className="eyebrow">{L("الرأي مقابل نتيجة السوق", "Opinion vs market outcome")}</span>
            <table className="mt-1 w-full text-2xs">
              <thead>
                <tr>
                  <th className="text-start font-normal" />
                  {labels.map((l) => (
                    <th key={l} className="mono px-1 text-end font-normal text-ink-3">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["useful", L("مفيد", "Useful")],
                    ["notUseful", L("غير مفيد", "Not useful")],
                  ] as const
                ).map(([row, name]) => (
                  <tr key={row} className="border-t border-hair">
                    <td className="py-1 text-ink-2">{name}</td>
                    {labels.map((l) => (
                      <td key={l} className="mono px-1 text-end">
                        {data.agreement[row][l] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-2xs text-ink-3">
              {L(
                "للبحث فقط: الرأي والنتيجة لا يُدمجان في وسم واحد.",
                "Research only: opinion and outcome are never merged into one label.",
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-3">
          {L(
            "لا آراء بعد. يسجّل المستخدم رأيه من بطاقة المنطقة على الشارت.",
            "No feedback yet. Users rate a zone from its callout on the chart.",
          )}
        </p>
      )}
      {data.recentComments.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-hair pt-2 text-xs">
          {data.recentComments.slice(0, 6).map((c, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2">
              <span className={`chip ${c.useful ? "text-up-ink" : "text-down-ink"}`}>{c.useful ? "USEFUL" : "NOT USEFUL"}</span>
              <span className="mono text-2xs text-ink-3">
                {c.symbol} {c.timeframe}
                {c.outcome ? ` · ${c.outcome}` : ""}
              </span>
              <span className="text-ink-2">«{c.comment}»</span>
              <span className="truncate text-2xs text-ink-3">{locale === "ar" ? c.zoneNameAr : c.zoneName}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
