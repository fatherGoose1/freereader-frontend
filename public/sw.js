const CACHE = "freereader-shell-v3";
const SHELL = ["/reader", "/icon.svg?v=3", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("freereader-shell-") && key !== CACHE)
    .map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Ephemeral scan pages/status must use the network, never a cached reader fallback.
  if (url.pathname === "/scan-mobile" || /\/scans\/mobile(?:-sessions|\/)/.test(url.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((response) => response || caches.match("/reader"))));
});
