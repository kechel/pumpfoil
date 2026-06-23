// Minimaler Service Worker — nötig, damit die App auf Android/Chrome installierbar
// ist (beforeinstallprompt). Kein aggressives Caching (immer Netzwerk), damit
// Updates sofort ankommen.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
