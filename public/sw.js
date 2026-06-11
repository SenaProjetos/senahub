// Service Worker do SenaHub — Web Push + clique em notificação.
// O som de notificação é tocado pela página (quando aberta); o SW exibe
// a notificação do sistema mesmo com o app fechado.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "SenaHub", body: event.data.text() };
  }
  const title = data.title || "SenaHub";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: data.icon || "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag,
        data: { url: data.url || "/" },
        vibrate: [80, 40, 80],
      });
      // Avisa as abas abertas para tocarem o som de notificação.
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) c.postMessage({ type: "notificacao", payload: data });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const match = list.find((c) => c.url.includes(url));
        if (match) return match.focus();
        return self.clients.openWindow(url);
      }),
  );
});
