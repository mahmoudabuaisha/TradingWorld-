"use client";
import { api } from "./api";

/** Browser support for Web Push (service worker + PushManager + Notification). */
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** The current browser's subscription, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Asks permission (only from a user gesture), subscribes this browser with the server's VAPID key and registers it
 * with the API. Returns the permission outcome so the UI can explain a "denied".
 */
export async function enablePush(token: string, publicKey: string): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.subscribePush(token, { endpoint: json.endpoint, keys: json.keys });
  return "granted";
}

export async function disablePush(token: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.unsubscribePush(token, sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}
