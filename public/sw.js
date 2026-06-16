// Botly service worker — shared by both PWAs (بوتلي زبون / بوتلي تاجر).
//
// Both manifests live on the same origin, so ONE worker serves both installs;
// app identity (name, icon, start_url, scope) comes from each manifest, not
// from the worker. Strategy:
//   - navigations  : network-first → cache fallback → offline.html
//   - static assets: stale-while-revalidate (same-origin only)
//   - /api/*       : network only (never cached — auth + live data)
//   - push         : show a notification, focus/open the target URL on click

const VERSION = "botly-pwa-v6";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest-customer.webmanifest",
  "/manifest-merchant.webmanifest",
  "/manifest-fitter.webmanifest",
  "/icons/customer.svg",
  "/icons/merchant.svg",
  "/icons/fitter.svg",
  "/icons/customer-192.png",
  "/icons/customer-512.png",
  "/icons/merchant-192.png",
  "/icons/merchant-512.png",
  "/icons/fitter-192.png",
  "/icons/fitter-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        // Precache files individually; only store OK responses so a missing
        // asset never blocks install nor poisons the cache with a 404 page.
        return Promise.allSettled(
          PRECACHE.map((url) =>
            fetch(url).then((r) => {
              if (r.ok) return cache.put(url, r);
            }),
          ),
        ).then(() => self.skipWaiting());
      })
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Live data + server functions: never intercept.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  if (url.searchParams.has("_serverFn") || url.pathname.startsWith("/_serverFn")) return;

  // Page navigations: network-first so users always get fresh HTML.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

// --------------------------------------------------------------------------
// Notifications
// --------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Botly";
  const isMerchant = (payload.app || "") === "merchant";
  const isFitter = (payload.app || "") === "fitter";
  const icon = isFitter ? "/icons/fitter-192.png" : isMerchant ? "/icons/merchant-192.png" : "/icons/customer-192.png";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon,
      badge: icon,
      dir: "rtl",
      lang: "ar",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
