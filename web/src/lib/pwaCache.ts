import { api } from "./api";

const CACHE = "api-session-detail-v2"; // identisch mit vite.config (Workbox runtimeCaching)
// Vorgaenger-Namen: beim Hochzaehlen hier eintragen, damit die alten Caches wirklich verschwinden
// (Workbox raeumt nur seinen Precache auf, nicht umbenannte Laufzeit-Caches).
const ALTE_CACHES = ["api-session-detail"];
const MEDIA_CACHE = "media";        // identisch mit vite.config runtimeCaching (/media/)

// /media/-URLs (Avatare, Fotos) proaktiv in den media-Cache laden, damit sie auch
// nach Neustart/offline sicher da sind. CacheFirst greift sonst erst nach dem
// ersten erfolgreichen Abruf — der bei cold start fehlen kann.
// Laufzeit-Caches mit NUTZERBEZOGENEN Antworten. Beim Abmelden müssen die weg: sonst sähe der
// nächste Anmelder auf demselben Gerät für einen Moment die Sessions, Einstellungen und den
// Namen seines Vorgängers, bevor die Hintergrund-Auffrischung greift (StaleWhileRevalidate
// liefert erst den Cache, dann das Netz). Namen identisch mit vite.config.ts.
// Öffentliche Caches (media, static-img) bleiben — die gehören niemandem.
const PERSOENLICHE_CACHES = ["api-my-sessions", "api-session-detail-v2", "api-session-detail",
                             "api-konto"];

/** Alles Nutzerbezogene aus den PWA-Caches werfen — beim Abmelden aufzurufen. */
export async function leerePersoenlicheCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  for (const name of PERSOENLICHE_CACHES) {
    try { await caches.delete(name); } catch { /* egal */ }
  }
}

/**
 * Die gecachten SESSION-LISTEN aus den PWA-Caches werfen — nach Löschen, Zusammenführen und
 * Auftrennen aufzurufen.
 *
 * WARUM DAS NÖTIG IST (Jan, 20.09.2026: „die session-listen aktualisieren sich nicht richtig
 * wenn ich sessions loesche in der pwa, in allen 3 ansichten"): `/api/sessions` und
 * `/api/community/sessions-grouped` laufen seit dem 15.09. auf **StaleWhileRevalidate**. Der
 * Service Worker liefert also erst den alten Stand und frischt ihn nur im Hintergrund auf. Die
 * Seite macht alles richtig — sie wirft ihren eigenen Cache weg und lädt neu —, bekommt vom SW
 * aber dieselbe Antwort von vorhin, samt der gerade gelöschten Session. Genau deshalb betrifft
 * es alle drei Ansichten: die Regel deckt die eigene Liste UND die Community-/Spot-Liste ab.
 *
 * Ein `fresh=1` am Aufruf würde nur den einen Abruf heilen — der gecachte Eintrag bliebe alt und
 * käme beim nächsten Öffnen der Liste ein weiteres Mal hoch. Deshalb der Eintrag selbst raus.
 *
 * Aus `api-community` werden NUR die Listen entfernt: Rekorde, Spots und der Social-Feed stehen
 * dort, damit die Seite beim Wiederkommen sofort vollständig dasteht — eine gelöschte Session
 * ändert an ihnen nichts.
 */
export async function verwerfeSessionListen(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try { await caches.delete("api-my-sessions"); } catch { /* egal */ }
  try {
    const cache = await caches.open("api-community");
    for (const req of await cache.keys()) {
      const pfad = new URL(req.url).pathname;
      if (pfad === "/api/community/sessions" || pfad === "/api/community/sessions-grouped") {
        await cache.delete(req);
      }
    }
  } catch { /* egal */ }
}

/** Alte Versionen des Session-Caches wegräumen (nach einem Namenswechsel). */
export async function raeumeAlteCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  for (const name of ALTE_CACHES) {
    try { await caches.delete(name); } catch { /* egal */ }
  }
}

export async function warmMedia(urls: (string | null | undefined)[]): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine || !("caches" in window)) return;
  const uniq = Array.from(new Set(urls.filter((u): u is string => !!u && u.startsWith("/media/"))));
  if (!uniq.length) return;
  const cache = await caches.open(MEDIA_CACHE);
  for (const u of uniq) {
    try {
      if (await cache.match(u)) continue;     // schon im Cache -> kein erneuter Traffic
      const res = await fetch(u);
      if (res.ok) await cache.put(u, res.clone());
    } catch {
      // einzelne Fehler ignorieren
    }
  }
}

// Die letzten 10 eigenen Sessions in den PWA-Cache vorladen — aber NUR die, die
// noch nicht drin liegen (kein unnötiger Traffic). Online + Cache-API nötig.
export async function warmMySessions(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine || !("caches" in window)) return;
  let list: { id: number }[];
  try {
    list = await api.sessions({ limit: 10 });
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  const cache = await caches.open(CACHE);
  for (const s of list) {
    try {
      const hit = await cache.match(`/api/sessions/${s.id}`);
      if (hit) continue; // schon im Cache -> nicht neu laden
      await api.session(s.id); // Antwort wird vom Service Worker gecacht
      await api.sessionSocial(s.id).catch(() => {}); // Fotos/Likes (best effort)
    } catch {
      // einzelne Fehler ignorieren, nächste Session versuchen
    }
  }
}
