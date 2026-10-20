// DEMO-MODUS für Screen-Recordings — NUR für Admins, NUR in der PWA.
//
// Zweck: zeigen, was die App kann, ohne echte Nutzernamen ins Video zu bekommen.
//
// WARUM NICHT einfach per CSS verschwommen: dann steht der echte Name weiter im DOM, und jede
// Stelle, die man beim Markieren übersieht, zeigt ihn im Video LESBAR. In der PWA rendern rund
// 56 Stellen Namen — eine davon zu vergessen ist wahrscheinlich, und der Schaden (ein echter
// Name in einem veröffentlichten Video) ist nicht rückholbar.
//
// Deshalb greift der Modus eine Ebene tiefer: in `api.req()` wird jede Antwort durchlaufen und
// jeder bekannte Nutzername in JEDEM String durch ein Pseudonym ersetzt. Damit gilt:
//   • Eine neue Komponente ist automatisch mit abgedeckt, ohne dass jemand daran denken muss.
//   • Auch Namen IM TEXT werden erfasst — z. B. „@Franz kannst du…" in einer Chat-Nachricht.
//     Kein feldbasierter Ansatz würde das finden, und im Chat-Mitschnitt wäre es ein Leck.
//
// Warum nicht über die Feldform raten (z. B. „Objekte mit avatar_url"): das wäre in BEIDE
// Richtungen falsch. `SpotRecHolder` und die Admin-Listen führen Nutzernamen OHNE avatar_url,
// während `WatchLayout.name` (Layout) und `AppDevice.name` (Uhrenmodell) Namen sind, die keine
// Personen bezeichnen. Nachgesehen, nicht vermutet.
//
// Die CSS-Unschärfe (`.pf-name` + `html.demo-names`) kommt obendrauf und ist reine Optik: sie
// muss nichts absichern, weil im DOM ohnehin nur Pseudonyme stehen.
//
// AUSGENOMMEN ist `/api/admin/…` (Vorgabe Jan: „die Admin-Ansicht zeige ich doch nicht
// öffentlich"). Zwei Gründe: mit Pseudonymen liesse sich nicht mehr moderieren — man sieht nicht,
// WEN man gerade sperrt —, und die Nutzerliste ist genau die Antwort, aus der der Modus seine
// Namen lernt. Die Ausnahme heisst auch: wer den Admin-Bereich doch aufnimmt, sieht echte Namen.

import type { AdminUser } from "./api";

const KEY = "foil_demo_names";
const START_KEY = "foil_demo_start";

let aktiv = localStorage.getItem(KEY) === "1";
// Ersetzungen, LÄNGSTE ZUERST: sonst frisst ein kurzer Name das Präfix eines langen
// („Mia" in „Miathegoat" — mit Wortgrenzen unkritisch, aber die Reihenfolge kostet nichts).
let regeln: Array<{ re: RegExp; ersatz: string }> = [];
const horcher = new Set<() => void>();

export function demoAktiv(): boolean {
  return aktiv && regeln.length > 0;
}

/** Nur die gespeicherte Absicht — auch dann true, wenn die Namen noch nicht geladen sind. */
export function demoGewuenscht(): boolean {
  return aktiv;
}

export function demoBeobachten(cb: () => void): () => void {
  horcher.add(cb);
  return () => horcher.delete(cb);
}

function melden() {
  document.documentElement.classList.toggle("demo-names", demoAktiv());
  horcher.forEach((h) => h());
}

/** Sonderzeichen im Namen entschärfen, damit er als Literal und nicht als Muster wirkt. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wortgrenzen mit Unicode: `\b` ist ASCII-basiert und würde bei Namen wie „Émile" oder „Jörg"
 * an der falschen Stelle greifen. Lookarounds auf Buchstaben/Ziffern lösen das; falls eine
 * alte Engine sie nicht kennt, fällt es auf `\b` zurück.
 */
function muster(name: string): RegExp {
  const n = esc(name);
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, "giu");
  } catch {
    return new RegExp(`\\b${n}\\b`, "gi");
  }
}

/**
 * Pseudonym je Nutzer, stabil über die ganze Aufnahme: nach id sortiert, dann durchnummeriert.
 * Bewusst „Rider N" und nicht ein erfundener Vorname — im Video soll erkennbar bleiben, dass
 * hier anonymisiert wurde, statt dass jemand die Namen für echt hält.
 */
function pseudonym(i: number): string {
  return `Rider ${i + 1}`;
}

/** Namen laden und Regeln bauen. Nur Admins dürfen die Nutzerliste holen. */
async function regelnLaden(): Promise<void> {
  const { api } = await import("./api");
  // Alle in einem Zug (der Endpunkt hat keine Obergrenze); nach id sortiert = stabile Nummern.
  const users: AdminUser[] = await api.adminUsers("", 5000, 0, undefined, "id");
  const namen = users
    .map((u, i) => ({ name: (u.display_name || "").trim(), ersatz: pseudonym(i) }))
    // Leere Namen übergeht der Server schon selbst („User #<id>“), die sind anonym.
    .filter((x) => x.name.length > 0)
    // LÄNGSTE ZUERST ersetzen, damit ein kurzer Name nicht Teil eines langen wegnimmt.
    .sort((a, b) => b.name.length - a.name.length);
  regeln = namen.map((x) => ({ re: muster(x.name), ersatz: x.ersatz }));
  melden();
}

export async function demoSetzen(on: boolean): Promise<void> {
  aktiv = on;
  localStorage.setItem(KEY, on ? "1" : "0");
  // Wiederholung der gruenen Spots beginnt mit jedem Einschalten von vorn (s. demoLive).
  try { if (on) localStorage.setItem(START_KEY, String(Date.now())); else localStorage.removeItem(START_KEY); } catch { /* egal */ }
  liveCache = null;
  if (on && regeln.length === 0) await regelnLaden();
  else melden();
}

/** Beim Start: war der Modus an, Namen gleich nachladen (nur wenn wirklich Admin). */
export async function demoStart(istAdmin: boolean): Promise<void> {
  if (!istAdmin) {
    // Kein Admin -> Modus hart aus, egal was im localStorage steht.
    aktiv = false;
    regeln = [];
    melden();
    return;
  }
  if (aktiv) await regelnLaden();
  else melden();
}

function ersetzeText(s: string): string {
  let out = s;
  for (const r of regeln) out = out.replace(r.re, r.ersatz);
  return out;
}

/**
 * Antwort-Daten durchlaufen und in jedem String die bekannten Namen ersetzen.
 * Nur WERTE, keine Schlüssel. Gibt die Eingabe unverändert zurück, wenn der Modus aus ist —
 * im Normalbetrieb kostet das also einen Vergleich, keinen Durchlauf.
 */
export function demoAnonymisieren<T>(daten: T, pfad = ""): T {
  if (!demoAktiv()) return daten;
  // Admin-Antworten bleiben unangetastet — sonst waere Moderation blind, und die Nutzerliste ist
  // die Quelle der Namen (Henne und Ei).
  if (pfad.startsWith("/api/admin/")) return daten;
  return gehe(daten) as T;
}

function gehe(v: unknown): unknown {
  if (typeof v === "string") return ersetzeText(v);
  if (Array.isArray(v)) return v.map(gehe);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = gehe(val);
    return out;
  }
  return v;
}

/** Wie viele Namen der Modus gerade kennt — für die Anzeige im Admin-Bereich. */
export function demoAnzahl(): number {
  return regeln.length;
}

// --- „Currently pumping" im Demo-Modus (Jan, 20.10.2026) -------------------------------------
// Statt der echten gruenen Spots zeigt die Seite eine Wiederholung des bisher vollsten Moments:
// So 04.10.2026 ab 13:05 UTC (26-27 Spots, ~30 Fahrer gleichzeitig). Die Zeit laeuft ab dem
// Einschalten mit und beginnt nach DEMO_DAUER_MIN von vorn. Gerechnet wird auf dem Server mit
// den Regeln der Live-Karte (kleine Spots nur als Buendel), `/api/admin/demo-aktiv`.
// Dazu zwei ECHTE Freunde des Admins an gruenen Spots der Wiederholung (Server waehlt sie aus; Jan:
// „nimm halt meine echten freunde und lass … 2 davon gerade irgendwo zusaetzlich am pumpen sein") —
// die Namen laufen hier durch die Pseudonyme. Ohne Freunde zwei erfundene an einem erfundenen Spot
// (negative ids: kein Konto, kein Link, s. FreundePumpen.tsx).
const DEMO_START_MS = Date.parse("2026-10-04T13:05:00Z");
const DEMO_DAUER_MIN = 40;
const DEMO_FREUNDE = [
  { user_id: -1, name: "Rider 7", avatar_url: null, spot_id: -1, spot: "Lago Pumpino" },
  { user_id: -2, name: "Rider 23", avatar_url: null, spot_id: -1, spot: "Lago Pumpino" },
];
type DemoFreund = { user_id: number; name: string | null; avatar_url: string | null; spot_id: number; spot: string };
type DemoLive = { spots: number[]; area: number[]; pumping_now: number; freunde: DemoFreund[] };
let liveCache: { bis: number; daten: DemoLive } | null = null;

async function demoLiveDaten(): Promise<DemoLive | null> {
  if (liveCache && liveCache.bis > Date.now()) return liveCache.daten;
  let start = Date.now();
  try { start = Number(localStorage.getItem(START_KEY)) || start; } catch { /* egal */ }
  const versatz = (Date.now() - start) % (DEMO_DAUER_MIN * 60_000);
  const t = new Date(DEMO_START_MS + versatz).toISOString();
  try {
    const { api } = await import("./api");
    const roh = await api.adminDemoAktiv(t);
    // /api/admin bleibt sonst unangetastet — die Freunde sind aber fuer die Seite, also Pseudonyme.
    const daten = { ...roh, freunde: demoAnonymisieren(roh.freunde?.length ? roh.freunde : DEMO_FREUNDE, "/api/friends/active") };
    liveCache = { bis: Date.now() + 60_000, daten };
    return daten;
  } catch {
    return null;   // dann bleiben die echten Werte stehen
  }
}

/** Antworten mit „gerade aktiv" im Demo-Modus durch die Wiederholung ersetzen (s. oben). */
export async function demoLive<T>(daten: T, pfad: string): Promise<T> {
  if (!demoAktiv() || pfad.startsWith("/api/admin/")) return daten;
  const freundeAktiv = pfad.startsWith("/api/friends/active");
  const istKarte = pfad.startsWith("/api/community/spot-active");
  const istStats = pfad.startsWith("/api/community/stats");
  const heute = pfad.startsWith("/api/community/sessions-today");
  if (!istKarte && !istStats && !heute && !freundeAktiv) return daten;
  const d = await demoLiveDaten();
  if (!d) return daten;
  if (freundeAktiv) return d.freunde as T;
  if (istKarte) return { spots: d.spots, area: d.area, friends: d.freunde.filter((f) => f.spot_id >= 0) } as T;
  // Die Demo-Freunde zaehlen mit.
  if (istStats) return { ...(daten as object), pumping_now: d.pumping_now + d.freunde.length } as T;
  const q = new URLSearchParams(pfad.split("?")[1] || "");
  const spot = q.get("spot") || "";
  if (!/^\d+$/.test(spot) || q.get("mine") === "true" || q.get("mine") === "1") return daten;
  const hier = d.freunde.filter((f) => f.spot_id === Number(spot)).map((f) => ({ user_id: f.user_id, name: f.name }));
  return { ...(daten as object), pumping_here: d.spots.includes(Number(spot)), friends_here: hier } as T;
}
