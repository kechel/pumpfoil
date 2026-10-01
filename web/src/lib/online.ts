// Gruener Online-Punkt am Profilbild (Jan, 01.10.2026: „ueberall wo das profilbild angezeigt wird",
// „egal ob app oder web"). Jedes sichtbare <Avatar userId=…> meldet sich hier an; EIN Aufruf
// fragt alle angemeldeten IDs gemeinsam ab (GET /api/chat/online), hoechstens minuetlich und nur
// bei sichtbarem Tab. So bekommt keine der vielen Listen-Antworten ein eigenes Feld.
import { useEffect, useSyncExternalStore } from "react";
import { api, getToken } from "./api";

const TAKT_MS = 60_000;
const angemeldet = new Map<number, number>();   // id -> Zahl der sichtbaren Profilbilder
let online = new Set<number>();
const hoerer = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let bald: ReturnType<typeof setTimeout> | null = null;
let gefragt = new Set<number>();                // was der letzte Abruf schon enthielt

async function abfragen() {
  bald = null;
  if (typeof document !== "undefined" && document.hidden) return;
  if (!getToken() || angemeldet.size === 0) return;
  const ids = [...angemeldet.keys()].slice(0, 200);
  try {
    const r = await api.chatOnline(ids);
    gefragt = new Set(ids);
    online = new Set(r.online);
    hoerer.forEach((h) => h());
  } catch { /* offline oder abgemeldet: Punkte bleiben wie sie sind */ }
}

function planen(sofort = false) {
  if (bald) clearTimeout(bald);
  bald = setTimeout(abfragen, sofort ? 0 : 400);   // viele neue Profilbilder -> ein Aufruf
  if (!timer) {
    timer = setInterval(abfragen, TAKT_MS);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", () => { if (!document.hidden) planen(true); });
  }
}

function anmelden(id: number) {
  angemeldet.set(id, (angemeldet.get(id) ?? 0) + 1);
  if (!gefragt.has(id)) planen();
}
function abmelden(id: number) {
  const n = (angemeldet.get(id) ?? 1) - 1;
  if (n <= 0) angemeldet.delete(id); else angemeldet.set(id, n);
}

/** Ist dieser Nutzer gerade online? `null`/`undefined` (unbekannte ID) -> nie. */
export function useOnline(id: number | null | undefined): boolean {
  useEffect(() => {
    if (!id) return;
    anmelden(id);
    return () => abmelden(id);
  }, [id]);
  return useSyncExternalStore(
    (h) => { hoerer.add(h); return () => { hoerer.delete(h); }; },
    () => !!id && online.has(id),
  );
}
