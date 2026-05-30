// BCO Service Worker — Run 4
// Handles offline caching using a cache-first strategy for static assets,
// and network-first for dynamic data.
// Registered by pwa.js → navigator.serviceWorker.register("/bco-sw.js")

const CACHE_NAME   = "bco-cache-v1";
const CORE_ASSETS  = [
  "/",
  "/index.html",
  "/bco/core/index.js",
  "/bco/ui/dashboard.js",
  "/bco/brand/brand-engine.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// ─────────────────────────────────────────────
// INSTALL — cache core assets
// ─────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[BCO SW] Caching core assets.");
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─────────────────────────────────────────────
// ACTIVATE — clean old caches
// ─────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─────────────────────────────────────────────
// FETCH — cache-first for assets, network-first for API
// ─────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API/data calls
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/bco/data/")) {
    event.respondWith(_networkFirst(request));
    return;
  }

  // Cache-first for everything else
  event.respondWith(_cacheFirst(request));
});

async function _cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function _networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

// ─────────────────────────────────────────────
// PUSH (native OS notifications)
// ─────────────────────────────────────────────

self.addEventListener("push", (event) => {
  const data = event.data?.json() || { title: "BCO Alert", body: "New notification" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data:  data
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || "/")
  );
});
