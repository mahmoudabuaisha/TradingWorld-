"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Zone } from "@tradingworld/analysis-engine";
import { FEEDBACK_COMMENT_MAX, zoneTrackKey } from "@tradingworld/shared";
import { api, type ZoneFeedback as Feedback } from "@/lib/api";
import { useApp } from "@/store/useApp";

export interface TrackContext {
  symbol: string;
  timeframe: string;
  engineVersion: string;
  scoringVersion: string;
}

/**
 * AI-02 — the user's field note on a zone: useful or not, the factor that convinced them most, an optional remark.
 * Stored apart from market outcomes, never changes the score, and only the author ever sees it (no public counts).
 */
export function ZoneFeedback({ zone, ctx }: { zone: Zone; ctx: TrackContext }) {
  const { locale, token } = useApp();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const key = zoneTrackKey(ctx, zone);
  const [saved, setSaved] = useState<Feedback | null>();
  const [useful, setUseful] = useState<boolean>();
  const [best, setBest] = useState<string>();
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error" | "untracked">("idle");

  useEffect(() => {
    setSaved(undefined);
    setUseful(undefined);
    setBest(undefined);
    setComment("");
    setState("idle");
    if (!token) return;
    let live = true;
    api
      .zoneFeedback(token, key)
      .then((r) => {
        if (!live) return;
        if (!r.tracked) {
          setState("untracked");
          return;
        }
        setSaved(r.feedback);
        if (r.feedback) {
          setUseful(r.feedback.useful);
          setBest(r.feedback.bestFactor);
          setComment(r.feedback.comment ?? "");
        }
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [token, key]);

  if (!token)
    return (
      <p className="text-xs text-ink-3">
        <Link href="/login" className="underline">
          {L("سجّل الدخول", "Sign in")}
        </Link>{" "}
        {L("لتسجيل رأيك في هذه المنطقة.", "to rate this zone.")}
      </p>
    );
  if (state === "untracked") return null;

  const present = zone.factors.filter((f) => f.present);
  const dirty =
    useful !== undefined &&
    (useful !== saved?.useful || (best ?? null) !== (saved?.bestFactor ?? null) || comment.trim() !== (saved?.comment ?? ""));
  const save = async () => {
    if (useful === undefined) return;
    setState("saving");
    try {
      const r = await api.saveZoneFeedback(token, key, {
        useful,
        bestFactor: useful ? best : undefined,
        comment: comment.trim() || undefined,
      });
      setSaved(r.feedback);
      setComment(r.feedback.comment ?? "");
      setState("saved");
    } catch {
      setState("error");
    }
  };
  const retract = async () => {
    try {
      await api.deleteZoneFeedback(token, key);
      setSaved(null);
      setUseful(undefined);
      setBest(undefined);
      setComment("");
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="border-t border-hair pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="eyebrow">FIELD NOTE · {L("رأيك", "Your note")}</span>
        {saved && (
          <span className="mono text-2xs text-ink-3">SAVED {new Date(saved.updatedAt).toISOString().slice(5, 16).replace("T", " ")}Z</span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-2">{L("هل كان هذا التحليل مفيدًا لك؟", "Was this analysis useful to you?")}</p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label={L("تقييم المنطقة", "Rate this zone")}>
        <button
          type="button"
          aria-pressed={useful === true}
          onClick={() => setUseful(true)}
          className={useful === true ? "btn" : "btn-ghost"}
        >
          {L("مفيد", "Useful")}
        </button>
        <button
          type="button"
          aria-pressed={useful === false}
          onClick={() => {
            setUseful(false);
            setBest(undefined);
          }}
          className={useful === false ? "btn" : "btn-ghost"}
        >
          {L("غير مفيد", "Not useful")}
        </button>
      </div>
      {useful === true && present.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-ink-2">{L("أي عامل أقنعك أكثر؟ (اختياري)", "Which factor convinced you most? (optional)")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label={L("العامل الأكثر إقناعًا", "Most convincing factor")}>
            {present.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={best === f.key}
                onClick={() => setBest(best === f.key ? undefined : f.key)}
                className={`rounded border px-2 py-1 text-xs ${best === f.key ? "border-ink text-ink" : "border-hair text-ink-2 hover:border-rule"}`}
              >
                <span className="sw me-1.5 inline-block h-2 w-2 align-middle hatch-up" />
                {f.label[locale]}
              </button>
            ))}
          </div>
        </div>
      )}
      {useful !== undefined && (
        <div className="mt-2">
          <label htmlFor="zone-feedback-comment" className="label">
            {L("ملاحظة (اختياري)", "Remark (optional)")}
          </label>
          <input
            id="zone-feedback-comment"
            className="input"
            maxLength={FEEDBACK_COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={L("ما الذي جعلها مفيدة أو غير مفيدة؟", "What made it useful or not?")}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={!dirty || state === "saving"} onClick={save}>
              {state === "saving" ? "…" : L("حفظ الرأي", "Save note")}
            </button>
            {saved && (
              <button type="button" className="btn-ghost" onClick={retract}>
                {L("سحب الرأي", "Retract")}
              </button>
            )}
            <span role="status" className="text-xs text-ink-3">
              {state === "saved" ? L("حُفظ ✓", "Saved ✓") : state === "error" ? L("تعذّر الحفظ", "Could not save") : ""}
            </span>
          </div>
        </div>
      )}
      <p className="mt-2 text-2xs text-ink-3">
        {L(
          "رأيك يُحفظ منفصلًا عن نتيجة السوق، لا يغيّر الدرجة، ولا يراه غيرك.",
          "Your note is kept apart from the market outcome, never changes the score, and nobody else sees it.",
        )}
      </p>
    </div>
  );
}
