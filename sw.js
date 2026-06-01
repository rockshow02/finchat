// ============================================================
//  FinChat — Service Worker
//  Cache static assets untuk offline support
// ============================================================

const CACHE_NAME = "finchat-v1";
const CACHE_TIMEOUT = 5000; // 5 detik timeout untuk network

// File yang di-cache untuk offline
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/chat.js",
  "/js/chart.js",
  "/js/api.js",
  "/js/parser.js",
  "/js/dashboard.js",
  "/js/features.js",
  "/js/core-features.js",
  "/js/export.js",
  "/config.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  // CDN libraries
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
];

// ── Install — cache semua static assets ───────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching static assets");
        // Cache satu per satu, jangan gagal semua kalau satu error
        return Promise.allSettled(
          STATIC_ASSETS.map((url) =>
            cache.add(url).catch((e) => {
              console.warn("[SW] Failed to cache:", url, e);
            }),
          ),
        );
      })
      .then(() => self.skipWaiting()),
  );
});

// ── Activate — hapus cache lama ────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch — strategi cache ─────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API request ke Anthropic — selalu network, tidak di-cache
  if (url.pathname === "/api/messages") {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fonts Google — stale-while-revalidate
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
          return response;
        });
        return cached || networkFetch;
      }),
    );
    return;
  }

  // Static assets — cache first, fallback network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type === "opaque"
          ) {
            return response;
          }
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Offline fallback — return index.html untuk navigasi
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
    }),
  );
});

// ── Background sync untuk transaksi offline ───────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Handle notifikasi dari halaman ────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, icon, badge, tag, data } = event.data;
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data,
      vibrate: [200, 100, 200],
    });
  }
});

// ── Klik notifikasi → buka app ────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Kalau app sudah terbuka → focus
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        // Kalau belum → buka baru
        if (clients.openWindow) return clients.openWindow("/");
      }),
  );
});
