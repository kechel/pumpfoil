import { api } from "./api";

const CACHE = "api-session-detail"; // identisch mit vite.config (Workbox runtimeCaching)
const MEDIA_CACHE = "media";        // identisch mit vite.config runtimeCaching (/media/)

// /media/-URLs (Avatare, Fotos) proaktiv in den media-Cache laden, damit sie auch
// nach Neustart/offline sicher da sind. CacheFirst greift sonst erst nach dem
// ersten erfolgreichen Abruf — der bei cold start fehlen kann.
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
