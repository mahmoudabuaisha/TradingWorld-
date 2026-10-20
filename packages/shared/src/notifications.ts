/** NOTIF-01 — notification vocabulary shared by the API and the web. Notifications state facts, never BUY/SELL. */
export type NotificationChannel = "push" | "email";
export type DeliveryStatus = "sent" | "failed" | "skipped";

export interface Delivery {
  channel: NotificationChannel;
  status: DeliveryStatus;
  /** why skipped/failed: "disabled", "no subscription", "not configured", provider error … */
  detail?: string;
  /** ms */
  at: number;
}

export interface AppNotification {
  id: string;
  kind: "alert" | "test" | "ops";
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  url?: string;
  alertId?: string;
  deliveries: Delivery[];
  /** ms */
  readAt?: number;
  createdAt: number;
}

/** Per-user channel preferences (users.settings.notifications). In-app is always on. Email is opt-in. */
export interface NotificationPrefs {
  push: boolean;
  email: boolean;
}
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { push: true, email: false };
