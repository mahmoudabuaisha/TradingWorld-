"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type NotificationSettings } from "@/lib/api";
import { currentSubscription, disablePush, enablePush, pushSupported } from "@/lib/push";
import { useApp } from "@/store/useApp";
import { Icon } from "./Icon";

/** NOTIF-01 — where alerts reach you: in-app always, Web Push per browser, email opt-in. */
export function NotificationsSettings() {
  const { locale, token } = useApp();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const [cfg, setCfg] = useState<NotificationSettings>();
  const [here, setHere] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const load = useCallback(async () => {
    if (!token) return;
    setCfg(await api.notificationSettings(token));
    setHere(!!(await currentSubscription().catch(() => null)));
  }, [token]);
  useEffect(() => {
    void load().catch((e) => setMsg((e as Error).message));
  }, [load]);

  if (!token)
    return (
      <div className="sheet p-4 text-sm text-ink-2">
        {L("سجّل الدخول لضبط الإشعارات.", "Sign in to set up notifications.")}{" "}
        <Link href="/login" className="underline">
          {L("تسجيل الدخول", "Sign in")}
        </Link>
      </div>
    );
  if (!cfg) return <div className="sheet p-4 text-sm text-ink-3">…</div>;

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(undefined);
    try {
      const m = await fn();
      if (m) setMsg(m);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const savePrefs = (p: Partial<NotificationSettings["prefs"]>) =>
    run(async () => {
      await api.saveNotificationPrefs(token, p);
    });
  const togglePush = () =>
    run(async () => {
      if (here) {
        await disablePush(token);
        return L("أُوقفت الإشعارات في هذا المتصفح.", "Push turned off for this browser.");
      }
      const r = await enablePush(token, cfg.push.publicKey!);
      if (r === "denied")
        return L(
          "رفض المتصفح الإذن. فعّله من إعدادات الموقع ثم أعد المحاولة.",
          "The browser denied permission. Allow it in site settings and try again.",
        );
      if (r === "unsupported") return L("هذا المتصفح لا يدعم Web Push.", "This browser does not support Web Push.");
      if (r === "default") return L("لم يُمنح الإذن بعد.", "Permission was not granted yet.");
      if (!cfg.prefs.push) await api.saveNotificationPrefs(token, { push: true });
    });
  const test = () =>
    run(async () => {
      const { notification: n } = await api.testNotification(token);
      return (
        n.deliveries.map((d) => `${d.channel.toUpperCase()} ${d.status.toUpperCase()}${d.detail ? ` (${d.detail})` : ""}`).join(" · ") ||
        L("أُرسل داخل التطبيق فقط.", "Sent in-app only.")
      );
    });

  const status = (ok: boolean, on: string, off: string) => (
    <span className={`chip ${ok ? "text-up-ink" : "text-ink-3"}`}>{ok ? on : off}</span>
  );
  return (
    <section className="sheet space-y-4 p-4" aria-labelledby="notif-h">
      <div className="flex items-center justify-between">
        <h2 id="notif-h" className="eyebrow">
          {L("الإشعارات", "NOTIFICATIONS")}
        </h2>
        <span className="mono text-2xs text-ink-3">
          {cfg.watcher.enabled
            ? L(`المراقب يفحص كل ${cfg.watcher.pollSeconds} ث`, `WATCHER · EVERY ${cfg.watcher.pollSeconds}S`)
            : L("المراقب متوقف", "WATCHER OFF")}
        </span>
      </div>
      <p className="text-xs text-ink-2">
        {L(
          "التنبيهات تُفحص على الخادم حتى لو كانت الصفحة مغلقة، ويُطلق كل تنبيه مرة واحدة. يصلك دائمًا داخل التطبيق، ويمكن إرساله أيضًا كإشعار متصفح أو بريد.",
          "Alerts are checked on the server even when the page is closed, and each fires once. It always lands in-app and can also go out as a browser push or an email.",
        )}
      </p>

      <div className="grid gap-2 border-t border-hair pt-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            Web Push {status(cfg.push.configured, L("مهيأ", "CONFIGURED"), L("غير مهيأ", "NOT CONFIGURED"))}
          </div>
          <div className="text-xs text-ink-3">
            {!cfg.push.configured
              ? L(
                  "أضف مفاتيح VAPID على الخادم (pnpm --filter @tradingworld/api vapid-keys).",
                  "Add VAPID keys on the server (pnpm --filter @tradingworld/api vapid-keys).",
                )
              : !pushSupported()
                ? L("هذا المتصفح لا يدعم Web Push.", "This browser does not support Web Push.")
                : L(
                    `هذا المتصفح: ${here ? "مشترك" : "غير مشترك"} · أجهزة مسجلة: ${cfg.push.subscriptions}`,
                    `This browser: ${here ? "subscribed" : "not subscribed"} · registered devices: ${cfg.push.subscriptions}`,
                  )}
          </div>
        </div>
        <button
          id="notif-push"
          className={here ? "btn-ghost" : "btn"}
          disabled={busy || !cfg.push.configured || !pushSupported()}
          onClick={togglePush}
        >
          <Icon name="bell" size={15} />
          {here ? L("إيقاف في هذا المتصفح", "Turn off here") : L("تفعيل في هذا المتصفح", "Enable in this browser")}
        </button>
        {cfg.push.subscriptions > 0 && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id="notif-push-pref"
              type="checkbox"
              className="accent-ink"
              checked={cfg.prefs.push}
              disabled={busy}
              onChange={(e) => savePrefs({ push: e.target.checked })}
            />
            {L("إرسال التنبيهات إلى أجهزتي المسجلة", "Send alerts to my registered devices")}
          </label>
        )}
      </div>

      <div className="grid gap-2 border-t border-hair pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {L("البريد", "Email")} {status(cfg.email.configured, L("مهيأ", "CONFIGURED"), L("غير مهيأ", "NOT CONFIGURED"))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            id="notif-email"
            type="checkbox"
            className="accent-ink"
            checked={cfg.prefs.email}
            disabled={busy || !cfg.email.configured}
            onChange={(e) => savePrefs({ email: e.target.checked })}
          />
          {L(`إرسال التنبيهات إلى ${cfg.email.address ?? "بريدي"}`, `Email alerts to ${cfg.email.address ?? "my address"}`)}
        </label>
        {!cfg.email.configured && (
          <div className="text-xs text-ink-3">
            {L("يحتاج الخادم إلى SMTP_URL و EMAIL_FROM.", "The server needs SMTP_URL and EMAIL_FROM.")}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-3">
        <button id="notif-test" className="btn-ghost" disabled={busy} onClick={test}>
          {L("إرسال إشعار تجريبي", "Send a test notification")}
        </button>
        <Link href="/alerts#inbox" className="btn-ghost">
          {L("صندوق الإشعارات", "Inbox")}
        </Link>
        {msg && (
          <span id="notif-msg" role="status" className="mono text-2xs text-ink-2">
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}
