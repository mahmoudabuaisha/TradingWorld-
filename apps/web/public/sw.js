/* TradingWorld service worker — Web Push only (NOTIF-01). No caching, no offline logic. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "TradingWorld", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "TradingWorld";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || undefined,          // one alert = one notification, even if delivered twice
    renotify: false,
    dir: data.dir || "auto",
    lang: data.lang || undefined,
    data: { url: data.url || "/alerts", id: data.id },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/alerts", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin) { await tab.focus(); return tab.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
