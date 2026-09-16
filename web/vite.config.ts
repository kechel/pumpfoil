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
        // Das App-Bundle hat 2026-07-26 die Workbox-Standardgrenze von 2 MiB überschritten →
        // Build brach ab und der SW wäre ohne App-Shell ausgeliefert worden (kein Offline).
        // Grenze hochgezogen; TODO bleibt: das Bundle per Code-Splitting kleiner machen.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        importScripts: ["/push-sw.js"],   // Web-Push-Handler
        navigateFallback: "/index.html",
        // /demo + die OAuth-Brücken (…-oauth) liefert der Server selbst aus —
        // ohne Ausnahme zeigt der SW dafür die gecachte SPA-Shell (= 404 im Router).
        //
        // sitemap.xml, robots.txt, .well-known und die Google-Bestätigungsdatei kamen am
        // 06.09.2026 dazu, nachdem `pumpfoil.org/sitemap.xml` im Browser auf der Startseite
        // landete: der SW beantwortet JEDE Navigation aus dem Cache mit `index.html`, der
        // Router sieht dann `/sitemap.xml`, erkennt darin keine Sprache und leitet auf `/`.
        // Googlebot führt keinen Service Worker aus und bekam die Datei — für Menschen (und
        // für die Prüfung in der Search Console) war sie aber unerreichbar.
        navigateFallbackDenylist: [
          // /promo kam am 11.09.2026 dazu: die Endcards zum Verlinken in Foren lagen richtig
          // auf dem Server, der SW beantwortete den Aufruf aber aus dem Cache mit der App-Shell
          // — im Browser stand dann „Unexpected Application Error! 404 Not Found" aus dem
          // Router. Genau der Fall, den der Absatz darueber beschreibt.
          // /landing-vorschau zeigt die Seiten der Zusatz-Domains (foilers.org & Co.)
          // unter pumpfoil.org an, solange der Proxy dort noch umleitet.
          /^\/api/, /^\/media/, /^\/demo/, /^\/promo/, /^\/landing-vorschau/, /-oauth(\?|$)/,
          /^\/sitemap\.xml$/, /^\/robots\.txt$/, /^\/\.well-known/,
          // Search Console legt eine Datei wie `google1a2b3c4d5e.html` in den Wurzelordner.
          /^\/google[0-9a-f]+\.html$/,
        ],
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
          // Sessionlisten: SOFORT aus dem Cache zeigen, parallel nachladen (15.09.2026).
          //
          // Vorher stand hier NetworkFirst mit 4 s Timeout — die PWA wartete also erst aufs
          // Netz, bevor ueberhaupt etwas zu sehen war, und lieferte nach dem Timeout trotzdem
          // den alten Stand. Genau umgekehrt ist es richtig (Jan): „die PWA soll moeglichst
          // sofort und ohne Verzoegerung das Gecachte anzeigen und gleichzeitig ein Update
          // requesten … und wenn es keine Aenderung gibt, soll gar nichts passieren."
          //
          // StaleWhileRevalidate liefert den Cache ohne Wartezeit und frischt ihn im
          // Hintergrund auf. Der Haken: DIESELBE Antwort bekommt auch die Nachpruefung der
          // Seite — sie erfuehre also nie von einer Aenderung. Deshalb traegt der
          // Nachpruef-Aufruf `fresh=1` und wird hier ausgenommen: er geht garantiert ans Netz,
          // und `Sessions.tsx` mischt sein Ergebnis ein (gleiche Referenz bei Gleichstand ->
          // kein Render, kein Scroll-Sprung).
          {
            // Community-Feed: letzter geladener Stand offline (Suche = eigene URLs -> offline Miss)
            // `sessions-grouped` MIT aufnehmen: das ist der Endpunkt, den die Sessions- und die
            // Community-Seite wirklich benutzen. Die Regel traf bisher exakt `/api/community/
            // sessions` — der Feed war also ueberhaupt nicht gecacht und lud jedes Mal neu.
            urlPattern: ({ url }) =>
              (url.pathname === "/api/community/sessions" ||
               url.pathname === "/api/community/sessions-grouped") && !url.searchParams.has("fresh"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-community",
              expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Meine Sessions: Liste + Monate + Stats
            urlPattern: ({ url }) =>
              (url.pathname === "/api/sessions" ||
               url.pathname === "/api/sessions/months" ||
               url.pathname === "/api/sessions/stats") && !url.searchParams.has("fresh"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-my-sessions",
              expiration: { maxEntries: 12, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Community-REKORDE: der mit Abstand teuerste Aufruf der Community-Seite — gemessen
            // am 16.09.2026 lokal 271 ms und 268 KB, ueber die echte Verbindung 1,25 s (Jan).
            // Fuenf Zeitfenster (heute/10d/30d/365d/alle) mit je zwoelf Kategorien, in EINER
            // Antwort. Deshalb sofort aus dem Cache zeigen und im Hintergrund auffrischen; die
            // Seite holt sich die Wahrheit mit `fresh=1` daneben (s. Home.tsx) — solche Aufrufe
            // nimmt die Regel aus, sonst bekaeme auch die Nachpruefung den alten Stand.
            urlPattern: ({ url }) =>
              url.pathname === "/api/community/records" && !url.searchParams.has("fresh"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-community-records",
              // Je Kombination aus Genauigkeit, Sportart und Foil-Band eine eigene URL.
              expiration: { maxEntries: 24, maxAgeSeconds: 7 * 24 * 3600 },
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
              // v2 (02.09.): Namenswechsel verwirft die alten Eintraege. Noetig, weil die
              // Antwort seit heute `start_attempts` traegt — eine aus dem Cache bediente
              // Session zeigte sonst weiter „4 Laeufe" statt „4/4" (Jans Befund an #3219).
              // MERKE: bei jedem NEUEN FELD in /api/sessions/<id> hier hochzaehlen.
              cacheName: "api-session-detail-v2",
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
