import { useSyncExternalStore } from "react";

// Session-Listen als Kacheln oder als EINE ZEILE je Session (Nutzerwunsch 30.09.2026, Feedback #156:
// „on a laptop i can only fit 3-4 sessions on one screen … an option for a oneline view would be
// great!"). EIN Schalter fuer ALLE Listen (Startseite, Meine/Alle Sessions, Spot, Foiler) — wer
// kompakt will, will es ueberall. Gemerkt je Geraet in localStorage (Komfort, keine Datenhaltung);
// jede Liste und jeder Umschalter hoert auf dieselbe Quelle, damit sich alle gleichzeitig umstellen.
const KEY = "foil_list_compact";
const hoerer = new Set<() => void>();

function lesen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setKompakteListe(an: boolean): void {
  try { localStorage.setItem(KEY, an ? "1" : "0"); } catch { /* privater Modus: nur fuer diese Seite */ }
  aktuell = an;
  hoerer.forEach((f) => f());
}

let aktuell = lesen();

function abonnieren(f: () => void): () => void {
  hoerer.add(f);
  // Andere Tabs desselben Browsers mitnehmen
  const aufSpeicher = (e: StorageEvent) => { if (e.key === KEY) { aktuell = lesen(); f(); } };
  window.addEventListener("storage", aufSpeicher);
  return () => { hoerer.delete(f); window.removeEventListener("storage", aufSpeicher); };
}

export function useKompakteListe(): boolean {
  return useSyncExternalStore(abonnieren, () => aktuell, () => false);
}
