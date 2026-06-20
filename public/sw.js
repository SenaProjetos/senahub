// Service Worker do SenaHub — Web Push + clique em notificação + suporte offline.
// O som de notificação é tocado pela página (quando aberta); o SW exibe
// a notificação do sistema mesmo com o app fechado.
//
// SUPORTE OFFLINE (conservador):
// - Navegações (mode === "navigate"): NETWORK-FIRST com fallback ao cache.
//   Nunca cache-first em HTML para não servir páginas obsoletas.
// - Assets estáticos (/_next/static, /icons): cache-first (são versionados/imutáveis).
// - TODO o resto (POST, Server Actions, APIs): pass-through (não intercepta).
//
// Para "resetar" o SW em caso de problema: DevTools → Application → Service Workers
// → Unregister (ou marque "Update on reload"); ou faça bump do CACHE abaixo.

const CACHE = "senahub-v1";

// App shell mínimo a precachear no install. Mantido curto de propósito.
const PRECACHE = [
  "/ponto",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll falha tudo se um item falhar; cacheamos um a um para ser tolerante.
      await Promise.allSettled(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches de versões anteriores.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só lidamos com GET. POST/Server Actions/etc. → pass-through (browser trata).
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Apenas same-origin; cross-origin → pass-through.
  if (url.origin !== self.location.origin) return;

  // 1) Navegações (HTML): NETWORK-FIRST com fallback ao cache.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Guarda a navegação bem-sucedida para uso offline futuro.
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone()).catch(() => undefined);
          }
          return fresh;
        } catch {
          // Sem rede: tenta a própria URL no cache; depois /ponto; depois erro.
          const cache = await caches.open(CACHE);
          const cached = (await cache.match(req)) || (await cache.match("/ponto"));
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title>" +
              "<body style=\"font-family:system-ui;padding:2rem;text-align:center\">" +
              "<h1>Sem conexão</h1><p>Você está offline. Reconecte para continuar.</p>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // 2) Assets estáticos versionados/imutáveis: CACHE-FIRST.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          // Sem rede e sem cache — deixa falhar como o browser faria.
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // 3) Qualquer outra coisa: pass-through (não intercepta).
});

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
