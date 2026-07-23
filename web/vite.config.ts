import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Build-Stempel automatisch: Datum + kurzer Git-Hash. Ändert bei jedem Deploy den
// Bundle-Hash (löst das PWA-SW-Update aus) und zeigt in den Einstellungen den echten Stand.
function buildStamp(): string {
  const date = new Date().toISOString().slice(0, 10);
  try {
    return `${date}·${execSync("git rev-parse --short HEAD").toString().trim()}`;
  } catch {
    return date;
  }
}

// Dev-Server auf 8090 (passt zur Apache-Reverse-Proxy-Config). Im Dev wird /api
// an den lokal laufenden FastAPI-Server (Port 8000) weitergereicht.
const APP_BUILD = buildStamp();

export default defineConfig({
  // im Bundle (Settings-Anzeige) UND als statische /version.json (die laufende PWA
  // fragt sie ab, um im Update-Hinweis die NEUE Version zu nennen).
  define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
  plugins: [
    { name: "emit-version",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: APP_BUILD }) });
      } },
    react(),
    VitePWA({
      // prompt: neuer SW wartet, ein sichtbares Banner meldet "Neue Version verfügbar"
      // + "Aktualisieren"-Button (skipWaiting -> Reload erst auf Klick). Der Nutzer sieht so
      // klar, wann es was Neues gibt (autoUpdate griff hier unzuverlässig).
      registerType: "prompt",
      injectRegister: false,        // Registrierung via useRegisterSW (PwaStatus)
      manifest: false,              // wir behalten public/manifest.webmanifest
      workbox: {
        // NUR die App-Shell vorab cachen (JS/CSS/HTML/Fonts/kleine SVGs). Bilder (png/webp:
        // Changelog/Brand/Screenshots) NICHT precachen — das blähte den Precache auf ~10 MB und
        // verzögerte die SW-Installation/-Aktivierung bei jedem Update (langes „Laden"). Bilder
        // kommen bei Bedarf über runtimeCaching (static-img, unten).
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        importScripts: ["/push-sw.js"],   // Web-Push-Handler
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
        runtimeCaching: [
          {
            // Likes offline -> in Background-Sync-Queue, Versand sobald wieder online
            urlPattern: ({ url }) => /^\/api\/community\/sessions\/\d+\/like$/.test(url.pathname),
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: { name: "like-queue", options: { maxRetentionTime: 24 * 60 } },
            },
          },
          {
            // Community-Feed: letzter geladener Stand offline (Suche = eigene URLs -> offline Miss)
            urlPattern: ({ url }) => url.pathname === "/api/community/sessions",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-community",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Meine Sessions: Liste + Monate + Stats
            urlPattern: ({ url }) =>
              url.pathname === "/api/sessions" ||
              url.pathname === "/api/sessions/months" ||
              url.pathname === "/api/sessions/stats",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-my-sessions",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 12, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Session-Detail (+ neighbors + social/Fotos): die letzten ~10 Sessions
            // (proaktiv vorgewärmt) bzw. zuletzt angesehene.
            urlPattern: ({ url }) =>
              /^\/api\/sessions\/\d+(\/.*)?$/.test(url.pathname) ||
              /^\/api\/community\/sessions\/\d+\//.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-session-detail",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Bilder/Medien (Thumbnails, Fotos, Avatare)
            urlPattern: ({ url }) => url.pathname.startsWith("/media/"),
            handler: "CacheFirst",
            options: {
              cacheName: "media",
              expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Statische App-Bilder (Changelog/Brand/Screenshots) — nicht mehr im Precache,
            // dafür bei Bedarf gecacht (CacheFirst). Hält den SW-Update schlank.
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "static-img",
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 8090,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
