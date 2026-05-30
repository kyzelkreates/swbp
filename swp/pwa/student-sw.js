// WellTrack — Student Welfare PWA Service Worker
// Provides offline support for the student-facing app
// Cache-first for assets, network-first for fresh data

const CACHE_NAME = "welltrack-student-v1";

const PRECACHE_ASSETS = [
  "/student.html",
  "/swp/pwa/student-pwa.js",
  "/swp/pwa/student-manifest.json",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
];

// Install: precache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, stale-while-revalidate for navigation
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== "GET") return;

  // Navigation: serve student.html offline fallback
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/student.html"))
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|json|png|jpg|svg|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // Default: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
