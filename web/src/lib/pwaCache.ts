import { api } from "./api";

const CACHE = "api-session-detail"; // identisch mit vite.config (Workbox runtimeCaching)

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
