import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Dev-Server auf 8090 (passt zur Apache-Reverse-Proxy-Config). Im Dev wird /api
// an den lokal laufenden FastAPI-Server (Port 8000) weitergereicht.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // prompt: neuer SW wartet, ein sichtbares Banner meldet "Neue Version verfügbar"
      // + "Aktualisieren"-Button (skipWaiting -> Reload erst auf Klick). Der Nutzer sieht so
      // klar, wann es was Neues gibt (autoUpdate griff hier unzuverlässig).
      registerType: "prompt",
      injectRegister: false,        // Registrierung via useRegisterSW (PwaStatus)
      manifest: false,              // wir behalten public/manifest.webmanifest
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
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
