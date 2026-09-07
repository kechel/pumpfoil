// Datum des neuesten Changelog-Eintrags — EINE Quelle fuer drei Stellen: das Menue-Badge
// (App.tsx), die Kachel auf der Startseite (PersonalHome.tsx) und die Seite selbst.
//
// Warum ein eigenes Modul: bis zum 07.09.2026 war das eine Konstante
// (`LATEST_CHANGELOG_DATE = ENTRIES[0].date`), weil die ganze Liste im Code stand. Jetzt kommt
// sie vom Server, und ein `await` laesst sich nicht in eine Konstante schreiben. Der Wert wird
// deshalb EINMAL geholt, im Modul behalten und an die Abonnenten gemeldet — drei Komponenten
// loesen also nicht drei Abrufe aus.
//
// Der letzte bekannte Wert liegt zusaetzlich im localStorage: beim naechsten Start steht das
// Badge sofort richtig, statt fuer einen Moment zu fehlen (und offline bleibt es stehen).
import { api } from "./api";

export const CHANGELOG_SEEN_KEY = "foil_changelog_seen";
const CACHE_KEY = "foil_changelog_latest";

let neuestes: string = (() => {
  try { return localStorage.getItem(CACHE_KEY) || ""; } catch { return ""; }
})();
let laeuft = false;
const horcher = new Set<(d: string) => void>();

function setzen(d: string) {
  if (!d || d === neuestes) return;
  neuestes = d;
  try { localStorage.setItem(CACHE_KEY, d); } catch { /* ignore */ }
  horcher.forEach((h) => h(d));
}

/** Holt das Datum hoechstens einmal je Seitenaufruf. Fehler sind stumm: ohne Datum zeigt das
 *  Badge einfach den zuletzt bekannten Wert (oder keinen), das ist kein Grund fuer eine Meldung. */
export function ladeNeuestes() {
  if (laeuft) return;
  laeuft = true;
  api.changelog().then((d) => setzen(d.latest || "")).catch(() => { /* ignore */ });
}

export function neuestesDatum(): string { return neuestes; }

export function abonnieren(h: (d: string) => void): () => void {
  horcher.add(h);
  ladeNeuestes();
  return () => { horcher.delete(h); };
}
