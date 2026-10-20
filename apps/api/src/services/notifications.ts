import webpush from "web-push";
import nodemailer from "nodemailer";
import { DEFAULT_NOTIFICATION_PREFS, type Delivery, type NotificationPrefs } from "@tradingworld/shared";
import type { Repositories, PushSub, StoredNotification, User } from "../repositories/memory.js";
import { describeError } from "../providers/support/status.js";

export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };
export interface Senders {
  push?: (sub: PushSub, payload: string) => Promise<PushResult>;
  email?: (msg: { to: string; subject: string; text: string; html: string }) => Promise<void>;
}

export interface NotificationConfig {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  smtpUrl?: string;
  emailFrom: string;
  appUrl: string;
}

export interface NotifyInput {
  kind: StoredNotification["kind"];
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  url?: string;
  alertId?: string;
}

export function prefsOf(u: Pick<User, "settings"> | undefined): NotificationPrefs {
  const p = (u?.settings?.notifications ?? {}) as Partial<NotificationPrefs>;
  return { push: p.push ?? DEFAULT_NOTIFICATION_PREFS.push, email: p.email ?? DEFAULT_NOTIFICATION_PREFS.email };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * NOTIF-01 — every notification lands in the in-app inbox, then goes out on the channels the user enabled:
 * Web Push (VAPID) to each of their browsers and email (SMTP). Each channel's outcome is written to the
 * notification's delivery log; dead push subscriptions (404/410) are removed. Nothing here is advice.
 */
export class NotificationService {
  private listeners = new Set<(n: StoredNotification) => void>();
  private readonly senders: Senders;

  constructor(
    private readonly repos: Repositories,
    private readonly cfg: NotificationConfig,
    senders: Senders = {},
    private readonly log: (m: string) => void = () => {},
  ) {
    this.senders = { push: senders.push ?? this.defaultPush(), email: senders.email ?? this.defaultEmail() };
  }

  get pushConfigured(): boolean {
    return !!this.senders.push;
  }
  get emailConfigured(): boolean {
    return !!this.senders.email;
  }
  get publicKey(): string | undefined {
    return this.cfg.vapidPublicKey;
  }

  onNotify(fn: (n: StoredNotification) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async notify(userId: string, input: NotifyInput): Promise<StoredNotification> {
    const n = await this.repos.notifications.create({ userId, ...input, deliveries: [] });
    for (const l of this.listeners) {
      try {
        l(n);
      } catch {
        /* a socket listener must not break delivery */
      }
    }
    const user = await this.repos.users.byId(userId);
    const prefs = prefsOf(user);
    const locale = (user?.settings?.locale as "ar" | "en" | undefined) === "en" ? "en" : "ar";
    const deliveries: Delivery[] = [await this.sendPush(userId, n, prefs, locale), await this.sendEmail(user, n, prefs, locale)];
    await this.repos.notifications.setDeliveries(n.id, deliveries);
    return { ...n, deliveries };
  }

  private async sendPush(userId: string, n: StoredNotification, prefs: NotificationPrefs, locale: "ar" | "en"): Promise<Delivery> {
    const at = Date.now();
    if (!prefs.push) return { channel: "push", status: "skipped", detail: "disabled", at };
    if (!this.senders.push) return { channel: "push", status: "skipped", detail: "not configured", at };
    const subs = await this.repos.push.list(userId);
    if (!subs.length) return { channel: "push", status: "skipped", detail: "no subscription", at };
    const payload = JSON.stringify({
      title: n.title[locale],
      body: n.body[locale],
      url: n.url ?? "/alerts",
      tag: n.alertId ?? n.id,
      id: n.id,
      dir: locale === "ar" ? "rtl" : "ltr",
      lang: locale,
    });
    let ok = 0;
    const errors: string[] = [];
    for (const s of subs) {
      const r = await this.senders.push(s, payload).catch((e): PushResult => ({ ok: false, gone: false, error: describeError(e) }));
      if (r.ok) {
        ok++;
        await this.repos.push.result(s.endpoint, true);
        continue;
      }
      errors.push(r.error);
      if (r.gone)
        await this.repos.push.remove(s.endpoint); // the browser unsubscribed or the subscription expired
      else await this.repos.push.result(s.endpoint, false);
    }
    return ok
      ? { channel: "push", status: "sent", detail: `${ok}/${subs.length} devices`, at }
      : { channel: "push", status: "failed", detail: errors[0], at };
  }

  private async sendEmail(user: User | undefined, n: StoredNotification, prefs: NotificationPrefs, locale: "ar" | "en"): Promise<Delivery> {
    const at = Date.now();
    if (!prefs.email) return { channel: "email", status: "skipped", detail: "disabled", at };
    if (!this.senders.email) return { channel: "email", status: "skipped", detail: "not configured", at };
    if (!user?.email) return { channel: "email", status: "skipped", detail: "no address", at };
    const link = `${this.cfg.appUrl.replace(/\/$/, "")}${n.url ?? "/alerts"}`;
    const disclaimer =
      locale === "ar"
        ? "تنبيه تحليلي وليس توصية. أي قرار تداول مسؤوليتك وحدك."
        : "Analytical alert, not advice. Any trading decision is yours alone.";
    const open = locale === "ar" ? "افتح التحليل" : "Open the analysis";
    const text = `${n.body[locale]}\n\n${open}: ${link}\n\n${disclaimer}`;
    const html = `<div dir="${locale === "ar" ? "rtl" : "ltr"}" style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a2124">
<p style="margin:0 0 12px">${esc(n.body[locale])}</p><p style="margin:0 0 16px"><a href="${esc(link)}" style="color:#0a7a66">${open}</a></p>
<p style="margin:0;font-size:12px;color:#616e74">${disclaimer}</p></div>`;
    try {
      await this.senders.email({ to: user.email, subject: `TradingWorld · ${n.title[locale]}`, text, html });
      return { channel: "email", status: "sent", at };
    } catch (e) {
      this.log(`email to user ${user.id}: ${describeError(e)}`);
      return { channel: "email", status: "failed", detail: describeError(e), at };
    }
  }

  private defaultPush(): Senders["push"] {
    const { vapidPublicKey: pub, vapidPrivateKey: priv, vapidSubject: subject } = this.cfg;
    if (!pub || !priv || !subject) return undefined;
    webpush.setVapidDetails(subject, pub, priv);
    return async (sub, payload) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: 3600,
          urgency: "high",
        });
        return { ok: true };
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        return { ok: false, gone: status === 404 || status === 410, error: status ? `HTTP ${status}` : describeError(e) };
      }
    };
  }

  private defaultEmail(): Senders["email"] {
    if (!this.cfg.smtpUrl) return undefined;
    const transport = nodemailer.createTransport(this.cfg.smtpUrl);
    return async (m) => {
      await transport.sendMail({ from: this.cfg.emailFrom, ...m });
    };
  }
}
