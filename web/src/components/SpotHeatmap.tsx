import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { api } from "../lib/api";
import { basiskarten, kartenTexte } from "../lib/mapTiles";
import { heatZeichnen, zellKanten } from "../lib/heatmap";
import { abstandM, lageText, MAX_NACHBARN, warumKeine, routenVorschlagen, type Route, type RoutenErgebnis, type Startposition } from "../lib/routen";
import { Card } from "./ui";
import { rampColor } from "../lib/trackColors";
import { useT } from "../i18n";

// Heatmap EINES Spots auf seiner Sessions-Seite, zwischen Rekord-Kacheln und Wetter (Jan,
// 16.10.2026: „einfach die heatmap ganz normal so wie in spots … passend eingezoomt und nur die
// heatmap, nicht umschaltbar auf spotanzeige"). Dieselben Daten und Farben wie die Spot-Karte
// (lib/heatmap.ts), keine Pins. Knoepfe: „Auf dem Foil" / „Startpunkte" und 1 Jahr (Vorgabe) /
// 30 Tage / Aus. „Aus" nimmt nur die Heatmap weg, die Karte bleibt — damit man den See sieht (Jan).
// Beide Wahlen gelten im Browser fuer alle Spots weiter (localStorage, reine Bequemlichkeit).
//
// Eingezoomt wird auf die gefahrenen Zellen des letzten Jahres im Umkreis UMKREIS_GRAD um den
// Spot; der Zeitraum aendert danach nur die Farben, nicht den Ausschnitt. Ohne Zellen dort (neuer
// Spot, nur verborgene Aufnahmen) bleibt das Panel ganz weg.
const UMKREIS_GRAD = 0.02;      // ~2 km Breite; Laeufe liegen am Spot
const SPEICHER = "spot_heatmap";
const SPEICHER_ART = "spot_heatmap_art";
type Wahl = "365d" | "30d" | "off";
type Art = "foil" | "start";

function gemerkteWahl(): Wahl {
  try {
    const v = localStorage.getItem(SPEICHER);
    return v === "30d" || v === "off" ? v : "365d";
  } catch { return "365d"; }
}

function gemerkteArt(): Art {
  try { return localStorage.getItem(SPEICHER_ART) === "start" ? "start" : "foil"; }
  catch { return "foil"; }
}

// `sport`: Sportfilter der Seite („all" = alle). Heatmap, Startplaetze und Routen folgen ihm — so
// ist mit der Vorgabe niemand ausgeschlossen (Jan, 16.10.2026, Hinweis aus dem Spot-Chat).
export function SpotHeatmap({ spotId, sport = "all" }: { spotId: number; sport?: string }) {
  const t = useT();
  // `t` nicht in die Abhaengigkeiten der Karte: aendert es sich, wuerde die Karte neu gebaut und
  // der eingepasste Ausschnitt ginge verloren.
  const tRef = useRef(t);
  tRef.current = t;
  const box = useRef<HTMLDivElement>(null);
  const karte = useRef<{ m: L.Map; grp: L.LayerGroup; renderer: L.Renderer } | null>(null);
  const [mitte, setMitte] = useState<{ lat: number; lon: number } | null>(null);
  const [leer, setLeer] = useState(false);
  const [bereit, setBereit] = useState(false);
  const [wahl, setWahlRoh] = useState<Wahl>(gemerkteWahl);
  const setWahl = (w: Wahl) => {
    setWahlRoh(w);
    try { localStorage.setItem(SPEICHER, w); } catch { /* privat/blockiert: gilt nur jetzt */ }
  };
  const [planen, setPlanen] = useState(false);
  // Gemerkte Routen: immer unter der Karte (Jan), kompakt; Klick zeigt sie — im Planungsmodus
  // stellt er zusaetzlich das Formular ein.
  const [gemerkt, setGemerkt] = useState<Gemerkt[]>([]);
  const [gemerktWahl, setGemerktWahl] = useState<string | null>(null);
  const [aufruf, setAufruf] = useState<{ g: Gemerkt; n: number } | null>(null);
  const gemerktEbene = useRef<L.LayerGroup | null>(null);
  const gemerktLaden = () => {
    api.spotRouten(spotId).then((r) => setGemerkt(r as Gemerkt[])).catch(() => setGemerkt([]));
  };
  useEffect(() => { setGemerktWahl(null); gemerktLaden(); }, [spotId]);  // eslint-disable-line react-hooks/exhaustive-deps
  // Wo man selbst schon gestartet ist: diese Startplaetze gruen (Jan) — nur fuer einen selbst.
  const [meineStarts, setMeineStarts] = useState<Punkt[]>([]);
  useEffect(() => {
    let weg = false;
    api.spotMeineStarts(spotId, sport)
      .then((r) => { if (!weg) setMeineStarts(r.starts.map(([lat, lon]) => ({ lat, lon }))); })
      .catch(() => { if (!weg) setMeineStarts([]); });
    return () => { weg = true; };
  }, [spotId, sport]);
  const [art, setArtRoh] = useState<Art>(gemerkteArt);
  const setArt = (a: Art) => {
    setArtRoh(a);
    try { localStorage.setItem(SPEICHER_ART, a); } catch { /* s. o. */ }
  };

  useEffect(() => {
    setMitte(null); setLeer(false);
    api.spotMap(false, "all")
      .then((alle) => {
        const s = alle.find((x) => x.spot_id === spotId);
        if (s) setMitte({ lat: s.lat, lon: s.lon }); else setLeer(true);
      })
      .catch(() => setLeer(true));
  }, [spotId]);

  // Karte anlegen und einpassen.
  useEffect(() => {
    if (!mitte || !box.current) return;
    const m = L.map(box.current, {
      zoomControl: true, attributionControl: true, maxZoom: 20,
      // Die Seite soll beim Scrollen nicht an der Karte haengenbleiben.
      scrollWheelZoom: false, dragging: !L.Browser.mobile,
    }).setView([mitte.lat, mitte.lon], 15);
    basiskarten(m, kartenTexte(tRef.current), { legende: true });
    karte.current = { m, grp: L.layerGroup().addTo(m), renderer: L.canvas({ padding: 0.2 }) };
    let weg = false;
    const u = UMKREIS_GRAD;
    // Zoom 15 -> Zellen der Stufe 19 (~50 m): fein genug fuer einen engen Ausschnitt.
    api.heatmap("365d", 15, mitte.lon - u * 1.5, mitte.lat - u, mitte.lon + u * 1.5, mitte.lat + u)
      .then((r) => {
        if (weg) return;
        if (r.z == null || !r.cells.length) { setLeer(true); return; }
        const { lon, lat } = zellKanten(r.z);
        const xs = r.cells.map((c) => c[0]), ys = r.cells.map((c) => c[1]);
        m.fitBounds([[lat(Math.max(...ys) + 1), lon(Math.min(...xs))],
                     [lat(Math.min(...ys)), lon(Math.max(...xs) + 1)]],
                    { padding: [16, 16], maxZoom: 17, animate: false });
        setBereit(true);
      })
      .catch(() => setLeer(true));
    return () => { weg = true; setBereit(false); karte.current = null; m.remove(); };
  }, [mitte]);

  // Zellen fuer Ausschnitt und Zeitraum nachladen, bei jeder Bewegung (kurz entprellt).
  useEffect(() => {
    const k = karte.current;
    if (!bereit || !k) return;
    if (wahl === "off") { k.grp.clearLayers(); return; }
    let weg = false;
    let timer: number | undefined;
    const laden = () => {
      const b = k.m.getBounds();
      api.heatmap(wahl, k.m.getZoom(), b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), art, sport)
        .then((r) => { if (!weg) heatZeichnen(k.grp, k.renderer, r); })
        .catch(() => {});
    };
    const spaeter = () => { window.clearTimeout(timer); timer = window.setTimeout(laden, 250); };
    laden();
    k.m.on("moveend", spaeter);
    return () => { weg = true; window.clearTimeout(timer); k.m.off("moveend", spaeter); };
  }, [bereit, wahl, art, sport]);

  // Gewaehlte gemerkte Route ohne Planungsmodus auf der Karte (im Planungsmodus zeichnet die Planung).
  useEffect(() => {
    const k = karte.current;
    if (!bereit || !k) return;
    if (!gemerktEbene.current) gemerktEbene.current = L.layerGroup().addTo(k.m);
    const g = gemerktEbene.current;
    g.clearLayers();
    const r = gemerkt.find((x) => x.schluessel === gemerktWahl);
    if (planen || !r) return;
    const pts = r.punkte.map(([lat, lon]) => ({ lat, lon }));
    routeZeichnen(g, pts);
    pts.forEach((p, i) => {
      if (i > 0 && i === pts.length - 1 && abstandM(p, pts[0]) < 1) return;   // Rundkurs: Start nur einmal
      g.addLayer(L.circleMarker([p.lat, p.lon], { radius: i === 0 ? 7 : 5, color: "#0f172a", weight: 2,
        fillColor: i === 0 ? "#ffffff" : schonGestartet(meineStarts, p) ? GRUEN : "#22d3ee", fillOpacity: 1, interactive: false }));
    });
  }, [bereit, gemerkt, gemerktWahl, planen, meineStarts]);
  useEffect(() => () => { gemerktEbene.current = null; }, [mitte]);

  // Klick auf eine gemerkte Route oeffnet die Planung und stellt sie dort ein (Jan). Ist sie noch
  // hervorgehoben (also unveraendert eingestellt), schliesst ein zweiter Klick die Planung wieder.
  const gemerktKlick = (r: Gemerkt) => {
    if (planen && gemerktWahl === r.schluessel) {
      setGemerktWahl(null);
      setPlanen(false);
      return;
    }
    setGemerktWahl(r.schluessel);
    setPlanen(true);
    setAufruf((alt) => ({ g: r, n: (alt?.n ?? 0) + 1 }));
  };
  // Aus der Community-Liste verlinkt (?route=<id>): die Route einmal aufrufen wie per Klick, sobald
  // Karte und gemerkte Routen da sind, und das Panel in den Blick holen.
  const routeAusLink = useRef<number | null>(Number(new URLSearchParams(window.location.search).get("route")) || null);
  useEffect(() => {
    const id = routeAusLink.current;
    if (!id || !bereit || !gemerkt.length) return;
    routeAusLink.current = null;
    const r = gemerkt.find((x) => x.id === id);
    if (!r) return;
    gemerktKlick(r);
    box.current?.scrollIntoView({ block: "center" });
  }, [bereit, gemerkt]);  // eslint-disable-line react-hooks/exhaustive-deps
  // Datum in der Sprache der App (die setzt <html lang>), nicht in der des Browsers
  const datum = (iso: string) => new Date(iso).toLocaleDateString(document.documentElement.lang || undefined,
    { day: "2-digit", month: "2-digit", year: "numeric" });

  if (leer) return null;
  const leiste = gemerkt.length > 0 && (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">{t("routes.savedTitle")}</span>
          {gemerkt.map((r) => {
            const k = gemerktKurz(r);
            const an = gemerktWahl === r.schluessel;
            return (
              <span key={r.schluessel} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${an
                ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
                : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
                {/* eigene gemerkte: kleiner Punkt (nur fuer einen selbst sichtbar) */}
                {r.eigene_id != null && (
                  <span className={`h-2 w-2 rounded-full ${an ? "bg-slate-950" : "bg-brand-500"}`} title={t("routes.mine")} aria-label={t("routes.mine")} />
                )}
                <button onClick={() => gemerktKlick(r)} aria-pressed={an} className="tabular-nums">
                  {t("routes.savedChip", { n: k.starts, max: k.maxM, total: r.meter, datum: datum(r.gemerkt_am) })}
                  {/* mit selbst gesetzten Punkten (nicht aus echten Starts) — Jan: „markieren mit manuell" */}
                  {mitEigenen(r) && <span className={`ml-1.5 rounded px-1 ${an ? "bg-slate-950/15" : "bg-slate-700/60"}`}>{t("routes.manualTag")}</span>}
                </button>
              </span>
            );
          })}
        </div>
  );
  const knopf = (aktiv: boolean, text: string, klick: () => void) => (
    <button key={text} onClick={klick} aria-pressed={aktiv}
      className={`rounded-full border px-3 py-1 ${aktiv
        ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
        : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
      {text}
    </button>
  );
  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-base font-semibold text-slate-100">{t("spots.heatmapRoutes")}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {knopf(art === "foil", t("spots.heatFoil"), () => setArt("foil"))}
          {knopf(art === "start", t("spots.heatStart"), () => setArt("start"))}
          <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden />
          {knopf(wahl === "365d", t("period.365d"), () => setWahl("365d"))}
          {knopf(wahl === "30d", t("period.30d"), () => setWahl("30d"))}
          {knopf(wahl === "off", t("spots.heatOff"), () => setWahl("off"))}
          <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden />
          {/* Routen planen: oben bei den Karten-Einstellungen, hervorgehoben (Jan); die Planung
              selbst erscheint unter der Karte. */}
          <button onClick={() => setPlanen(!planen)} aria-pressed={planen}
            className={`rounded-full border px-3 py-1 font-semibold ${planen
              ? "border-brand-500 bg-brand-500 text-slate-950"
              : "border-brand-500 bg-brand-500/15 text-brand-600 dark:text-brand-300 hover:bg-brand-500/25"}`}>
            {t("routes.plan")}
          </button>
        </div>
      </div>
      <div ref={box} className="mt-2 h-64 w-full overflow-hidden rounded-lg sm:h-80" />
      {/* Ohne Planung stehen die gemerkten Routen direkt unter der Karte, mit Planung ganz unten
          ueber der Legende (Jan) */}
      {!planen && leiste}
      <RoutenVorschlag spotId={spotId} karte={bereit ? karte.current?.m ?? null : null} offen={planen}
        aufruf={aufruf} gemerkt={gemerkt} gemerktGeaendert={gemerktLaden} sport={sport}
        gemerktWahl={gemerktWahl} abweichung={() => setGemerktWahl(null)} meineStarts={meineStarts} mitte={mitte}
        leiste={leiste} />
    </Card>
  );
}

// Routen planen unter der Karte (Jan, 16.10.2026). Ablauf:
//   1. Knopf „Route planen" oben in der Kopfzeile — erst danach erscheint der Rest.
//   2. Zuverlaessigkeit (Startpunkt mind. N-mal genutzt), die Startpunkte als Leiste (1 = meist-
//      genutzt, Lage zum meistgenutzten; Start per Leiste oder Klick auf die Karte), Abstaende,
//      Zahl der Punkte, Kreuzungen, Rundkurs — und „Jetzt berechnen" (hervorgehoben, solange die
//      Einstellungen nicht zur Liste passen).
//   3. Vorschlaege als sortierbare Tabelle; die gewaehlte Route farbig auf der Karte (rot = laengster
//      Abschnitt), darunter ihre Abschnitte und „Merken".
//   4. Gemerkte Routen stehen immer als kurze Leiste unter der Karte (SpotHeatmap): oeffentlich, nur mit
//      Datum (nie wer). Im Planungsmodus stellt ein Klick das Formular wie
//      beim Merken ein, rechnet und waehlt die Route aus — damit sieht man alle Details.
// Rechnung in lib/routen.ts, gemerkte Routen: /api/community/spot/{id}/routen.
const ZUVERLAESSIG = [2, 3, 5];         // ≥ 10× und Fahrer ≥ 5 am 16.10. raus (Jan: zu eng in der Zeile)
const FAHRER = [1, 2, 3];
// km (Server: hoechstens 30 km, 50 Startplaetze). „nur dieser Spot" (0) am 16.10. raus (Jan: „2 km
// ist doch prima") — der Server kann es weiter.
const UMKREIS = [2, 5, 10, 20, 30];
const NAH_M = 40;                // gemerkter Punkt == heutiger Startpunkt, wenn so nah
type Spalte = "empf" | "meter" | "legs" | "kreuz" | "doppelt";
type Punkt = { lat: number; lon: number };
export type Gemerkt = {
  id?: number; schluessel: string; gemerkt_am: string; punkte: [number, number][]; meter: number; eigene_id: number | null;
  einstellungen: { min_starts?: number; min_fahrer?: number; start?: [number, number]; erstes_ziel?: [number, number] | null;
                   ziel?: [number, number] | null; min_m?: number;
                   max_m?: number; punkte?: number; ohne_kreuzung?: boolean; rundkurs?: boolean;
                  ausgeschlossen?: [number, number][]; eigene?: [number, number][];
                  umkreis_km?: number };
};
const GRUEN = "#4ade80";         // hier ist man selbst schon gestartet
const MEIN_M = 30;               // so nah an einem eigenen Start = „schon gestartet"
const EIGENE_MAX = 20;           // selbst gesetzte Punkte je Spot (wie der Server je Route)
type EigenerPunkt = Punkt & { lokal: boolean };   // lokal = selbst gesetzt; sonst aus einer aufgerufenen gemerkten Route

/** Ist man an dieser Stelle selbst schon gestartet? */
function schonGestartet(meine: Punkt[], p: Punkt): boolean {
  return meine.some((q) => abstandM(q, p) < MEIN_M);
}

/** Enthaelt die gemerkte Route selbst gesetzte Punkte? */
export function mitEigenen(g: Gemerkt): boolean {
  const e = g.einstellungen.eigene ?? [];
  return g.punkte.some(([la, lo]) => e.some(([a, b]) => abstandM({ lat: la, lon: lo }, { lat: a, lon: b }) < 5));
}

// Selbst gesetzte Punkte bleiben je Spot im Browser (Jan: „die sollten nicht verschwinden, nur weil
// sich die Startpunkte beim naechsten Laden veraendern"); mit einer gemerkten Route gehen sie in
// deren Einstellungen mit.
const EIGENE_SPEICHER = (spotId: number) => `routen_eigene_${spotId}`;
function eigeneLaden(spotId: number): EigenerPunkt[] {
  try {
    const v = JSON.parse(localStorage.getItem(EIGENE_SPEICHER(spotId)) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      .slice(0, EIGENE_MAX).map(([lat, lon]) => ({ lat, lon, lokal: true })) : [];
  } catch { return []; }
}
function eigeneSpeichern(spotId: number, e: EigenerPunkt[]) {
  try { localStorage.setItem(EIGENE_SPEICHER(spotId), JSON.stringify(e.filter((p) => p.lokal).map((p) => [p.lat, p.lon]))); }
  catch { /* privat/blockiert: gilt nur jetzt */ }
}
const PIN_PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><path d="M12 7.5v6M9 10.5h6"/></svg>';

/** Name eines Startplatzes: A, B, C … Z, AA, AB … (A = meistgenutzt). Buchstaben statt Zahlen,
 *  damit sie nicht mit den Abschnittsnummern auf den Linien verwechselt werden (Jan). */
export function platzName(i: number): string {
  let n = i, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** Abschnitte einer Punktfolge mit Laenge und Farbe (blau = kuerzester, rot = laengster). */
function abschnitte(pts: Punkt[], namen: string[]) {
  const ab = pts.slice(1).map((b, k) => ({ a: pts[k], b, von: namen[k], nach: namen[k + 1], meter: abstandM(pts[k], b) }));
  const lo = Math.min(...ab.map((x) => x.meter)), hi = Math.max(...ab.map((x) => x.meter));
  return ab.map((x) => ({ ...x, farbe: rampColor(hi > lo ? (x.meter - lo) / (hi - lo) : 0.5) }));
}

/** Index des heutigen Startpunkts an dieser Stelle, oder -1. */
function naechster(pos: Startposition[], p: Punkt): number {
  let best = -1, bm = NAH_M;
  pos.forEach((q, i) => { const m = abstandM(q, p); if (m < bm) { bm = m; best = i; } });
  return best;
}

/** Route auf die Karte: jeder Abschnitt in der Farbe seiner Laenge (Rampe wie beim Tempo, rot =
 *  laengster) unter einer dunklen Kontur, mittig die Abschnittsnummer weiss mit duennem Rand. */
function routeZeichnen(g: L.LayerGroup, linie: Punkt[]) {
  abschnitte(linie, linie.map(() => "")).forEach((ab, k) => {
    const l: [number, number][] = [[ab.a.lat, ab.a.lon], [ab.b.lat, ab.b.lon]];
    g.addLayer(L.polyline(l, { color: "#0f172a", weight: 7, opacity: 0.6, interactive: false }));
    g.addLayer(L.polyline(l, { color: ab.farbe, weight: 4, opacity: 1, interactive: false }));
    const html = `<div style="width:18px;height:18px;border-radius:9px;display:flex;align-items:center;` +
      `justify-content:center;font:700 11px ui-sans-serif,system-ui;background:#ffffff;` +
      `color:#0f172a;border:1px solid #0f172a">${k + 1}</div>`;
    g.addLayer(L.marker([(ab.a.lat + ab.b.lat) / 2, (ab.a.lon + ab.b.lon) / 2], {
      icon: L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false, keyboard: false,
    }));
  });
}

/** Schluessel wie auf dem Server (community._routen_schluessel): Punktfolge auf 4 Nachkommastellen,
 *  richtungsunabhaengig — damit „schon gemerkt" auch hier erkannt wird. */
function routenSchluessel(pts: Punkt[]): string {
  const seq = pts.map((p) => `${Number(p.lat.toFixed(4))},${Number(p.lon.toFixed(4))}`);
  const a = seq.join(";"), b = [...seq].reverse().join(";");
  return a < b ? a : b;
}

/** Kurzinfo einer gemerkten Route: verschiedene Startplaetze, laengster Abschnitt, Strecke. */
export function gemerktKurz(g: Gemerkt) {
  const pts = g.punkte.map(([lat, lon]) => ({ lat, lon }));
  const rund = pts.length > 2 && abstandM(pts[0], pts[pts.length - 1]) < 1;
  const legs = pts.slice(1).map((b, k) => abstandM(pts[k], b));
  return { starts: rund ? pts.length - 1 : pts.length, maxM: Math.round(Math.max(...legs)), pts };
}

function Abschnitte({ pts, namen }: { pts: Punkt[]; namen: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {abschnitte(pts, namen).map((ab, k) => (
        <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 tabular-nums text-slate-200">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ab.farbe }} aria-hidden />
          <span className="font-semibold">{k + 1}</span> · {ab.von}→{ab.nach} · {Math.round(ab.meter)} m
        </span>
      ))}
    </div>
  );
}

function RoutenVorschlag({ spotId, karte, offen, aufruf, gemerkt, gemerktGeaendert, sport, gemerktWahl, abweichung, meineStarts, mitte, leiste }: {
  spotId: number; karte: L.Map | null; offen: boolean;
  aufruf: { g: Gemerkt; n: number } | null; gemerkt: Gemerkt[]; gemerktGeaendert: () => void; sport: string;
  gemerktWahl: string | null; abweichung: () => void; meineStarts: Punkt[]; mitte: Punkt | null;
  leiste: React.ReactNode;
}) {
  const t = useT();
  const [minStarts, setMinStarts] = useState(3);
  const [minFahrer, setMinFahrer] = useState(1);   // verschiedene Fahrer an einem Startplatz
  // Umkreis in km: 0 = nur die Startplaetze dieses Spots, sonst auch die aller Spots im Umkreis
  // (Jan: „eine Route mit 30 Stops rund um den Zuerichsee … einen Regler fuer Umkreis").
  // Vorgabe 2 km (Jan): Nachbarspots direkt nebenan gehoeren meist zum selben See.
  const [umkreis, setUmkreis] = useState(2);
  const [start, setStart] = useState(0);
  const [minM, setMinM] = useState(50);
  const [maxM, setMaxM] = useState(300);
  const [anzahl, setAnzahl] = useState(6);            // Startpunkte auf der Route (Start mitgezaehlt)
  const [ohneKreuzung, setOhneKreuzung] = useState(true);
  const [rundkurs, setRundkurs] = useState(true);
  const [zielPlatz, setZielPlatz] = useState<number | null>(null);   // ohne Rundkurs: wo die Route endet
  // Erstes Ziel = die Richtung, in die man losfaehrt (Jan: statt Himmelsrichtung der naechste
  // Startplatz); Index in `pos`.
  // null = beliebig. Filtert die berechnete Liste, braucht keine neue Rechnung.
  const [richtung, setRichtung] = useState<number | null>(null);
  const [aus, setAus] = useState<Set<number>>(new Set());          // ausgeschlossene Startplaetze
  const [serverPos, setServerPos] = useState<Startposition[] | null>(null);
  // Selbst gesetzte Punkte („+" auf der Karte, Jan): gleichwertig, haengen hinten an die echten
  // Startplaetze an und bekommen die Buchstaben fortlaufend weiter.
  const [eigene, setEigeneRoh] = useState<EigenerPunkt[]>(() => eigeneLaden(spotId));
  const setEigene = (e: EigenerPunkt[]) => { setEigeneRoh(e); eigeneSpeichern(spotId, e); };
  useEffect(() => { setEigeneRoh(eigeneLaden(spotId)); }, [spotId]);
  const [setzen, setSetzen] = useState(false);       // naechster Klick auf die Karte setzt einen Punkt
  const pos = useMemo<Startposition[] | null>(() => serverPos && [...serverPos,
    ...eigene.map((p) => ({ lat: p.lat, lon: p.lon, starts: 0, sessions: 0, fahrer: 0, eigen: true }))], [serverPos, eigene]);
  const nServer = serverPos?.length ?? 0;
  const [ergebnis, setErgebnis] = useState<RoutenErgebnis | null>(null);
  const [gerechnetMit, setGerechnetMit] = useState("");
  const [anstoss, setAnstoss] = useState(0);
  const [sortierung, setSortierung] = useState<{ nach: Spalte; ab: boolean }>({ nach: "empf", ab: false });
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);     // Schluessel = Punktfolge
  const [merkStatus, setMerkStatus] = useState<string | null>(null);
  // Wiederherstellen einer gemerkten Route: wartet auf die Startpunkte der passenden Zuverlaessigkeit.
  const [wieder, setWieder] = useState<Gemerkt | null>(null);
  const [ueberlagert, setUeberlagert] = useState<Gemerkt | null>(null); // gemerkte, die heute nicht mehr passt
  const ebene = useRef<L.LayerGroup | null>(null);
  const erstGerechnet = useRef(false);
  const umkreisSetzen = (km: number) => { if (km !== umkreis) { einpassen.current = true; setUmkreis(km); } };
  // Startplaetze vor dem Neuladen: Start, Ausschluesse und Ziel werden ueber die Lage uebernommen,
  // statt bei jeder anderen Zuverlaessigkeit/jedem Umkreis auf den Anfang zu springen.
  const posRef = useRef<Startposition[] | null>(null);
  const vorher = useRef<Startposition[] | null>(null);
  const einpassen = useRef(false);                     // nach Umkreis-Wechsel die Karte auf die Startplaetze

  const zielAktiv = !rundkurs && zielPlatz != null && zielPlatz !== start && !aus.has(zielPlatz) ? zielPlatz : null;
  posRef.current = pos;
  const einstellungsSchluessel = JSON.stringify([minStarts, minFahrer, umkreis, start, minM, maxM, anzahl, ohneKreuzung, rundkurs, [...aus].sort(), zielAktiv,
                                                 eigene.map((p) => [p.lat, p.lon])]);
  // Auch ohne Ergebnis „veraltet": nach dem Neuladen der Startplaetze ist es verworfen — stellt man
  // die alte Einstellung wieder her, stuende sonst weder Liste noch Knopf da.
  const veraltet = pos != null && (gerechnetMit !== einstellungsSchluessel || ergebnis == null);


  // Startpunkte je Zuverlaessigkeit holen.
  useEffect(() => {
    if (!offen) { erstGerechnet.current = false; return; }
    let weg = false;
    if (posRef.current) vorher.current = posRef.current;
    setServerPos(null); setErgebnis(null);
    api.spotStartpositionen(spotId, minStarts, minFahrer, sport, umkreis)
      .then((r) => { if (!weg) setServerPos(r.positionen); })
      .catch(() => { if (!weg) setServerPos([]); });
    return () => { weg = true; };
  }, [offen, spotId, minStarts, minFahrer, sport, umkreis]);
  useEffect(() => { if (!offen) vorher.current = null; }, [offen]);

  // Neue Startpunkte: Start auf den meistgenutzten — oder auf den einer gemerkten Route — und rechnen.
  useEffect(() => {
    if (!pos) return;
    const alt = wieder ? null : vorher.current;
    vorher.current = null;
    const neu = (i: number | null) => (i == null || !alt?.[i] ? -1 : naechster(pos, alt[i]));
    // Vorgabe-Start: der meistgenutzte Startplatz DIESES Spots (mit Umkreis kommen fremde dazu)
    let s = Math.max(0, pos.findIndex((p) => p.vom_spot !== false && !p.eigen));
    if (wieder?.einstellungen.start) {
      const [la, lo] = wieder.einstellungen.start;
      const i = naechster(pos, { lat: la, lon: lo });
      if (i >= 0) s = i;
    } else if (alt && neu(start) >= 0) s = neu(start);
    setStart(s);
    // Ausschluesse: bei einer gemerkten Route deren Plaetze, sonst die bisherigen (ueber die Lage)
    const ex = new Set<number>();
    const exAlt: [number, number][] = wieder ? (wieder.einstellungen.ausgeschlossen ?? [])
      : alt ? [...aus].filter((i) => alt[i]).map((i) => [alt[i].lat, alt[i].lon]) : [];
    for (const [la, lo] of exAlt) {
      const i = naechster(pos, { lat: la, lon: lo });
      if (i >= 0 && i !== s) ex.add(i);
    }
    setAus(ex);
    // Ziel (ohne Rundkurs): bei einer gemerkten Route deren Ziel, sonst das bisherige
    const wz = wieder?.einstellungen.ziel;
    const wzi = wz ? naechster(pos, { lat: wz[0], lon: wz[1] }) : neu(zielPlatz);
    setZielPlatz(wzi >= 0 ? wzi : null);
    // Umkreis gewechselt: Karte auf alle Startplaetze einpassen
    if (einpassen.current && karte && pos.length) {
      einpassen.current = false;
      karte.fitBounds(L.latLngBounds(pos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [24, 24], maxZoom: 16, animate: false });
    }
    // Automatisch nur beim ersten Oeffnen und beim Aufrufen einer gemerkten Route; sonst (andere
    // Zuverlaessigkeit/Fahrerzahl) verschwindet die Liste und „Jetzt berechnen" erscheint — wie bei
    // jeder anderen Einstellung (Jan).
    if (!erstGerechnet.current || wieder) {
      erstGerechnet.current = true;
      setAnstoss((n) => n + 1);
    }
  }, [serverPos]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Rechnen — nur auf Anstoss („Jetzt berechnen", neue Startpunkte, gemerkte Route aufgerufen).
  useEffect(() => {
    if (!pos || anstoss === 0) return;
    const neu = routenVorschlagen(pos, start, minM, Math.max(minM, maxM),
      { punkte: Math.min(anzahl, pos.length), ohneKreuzung, rundkurs, ausgeschlossen: aus, ziel: zielAktiv ?? undefined });
    setErgebnis(neu);
    setGerechnetMit(einstellungsSchluessel);
    setGewaehlt(null);
    setMerkStatus(null);
  }, [anstoss]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Nach dem Rechnen einer aufgerufenen gemerkten Route: Richtung setzen und die Route auswaehlen.
  useEffect(() => {
    if (!wieder || !ergebnis || !pos) return;
    const idx = wieder.punkte.map(([la, lo]) => naechster(pos, { lat: la, lon: lo }));
    const passt = idx.every((i) => i >= 0)
      ? (ergebnis.routen.find((r) => r.punkte.join("-") === idx.join("-"))          // gemerkte Richtung zuerst
         ?? ergebnis.routen.find((r) => r.punkte.join("-") === [...idx].reverse().join("-")))
      : undefined;
    const ez = wieder.einstellungen.erstes_ziel;
    const ezIdx = ez ? naechster(pos, { lat: ez[0], lon: ez[1] }) : -1;
    setRichtung(ezIdx >= 0 ? ezIdx : null);
    setGewaehlt(passt ? passt.punkte.join("-") : null);
    setUeberlagert(passt ? null : wieder);
    setWieder(null);
    aufrufLaeuft.current = false;
  }, [ergebnis]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Begruendung ohne Route: rechnet mehrmals, deshalb nur einmal je Ergebnis (nicht bei jedem Rendern)
  const grund = useMemo(() => (!pos || !ergebnis || ergebnis.routen.length ? null
    : warumKeine(pos, start, minM, Math.max(minM, maxM),
      { punkte: Math.min(anzahl, pos.length), ohneKreuzung, rundkurs, ausgeschlossen: aus, ziel: zielAktiv ?? undefined })),
    [ergebnis]);  // eslint-disable-line react-hooks/exhaustive-deps
  // Moegliche erste Ziele ohne gueltige Liste: wie die Suche — die MAX_NACHBARN naechsten im Abstand
  const richtungsWahl: number[] = !veraltet && ergebnis ? (() => {
    const r = [...new Set(ergebnis.routen.map((x) => x.erstesZiel))];
    // vorab gewaehlte Richtung bleibt sichtbar, auch wenn sie die Liste (noch) nicht hergibt
    return (richtung != null && !r.includes(richtung) ? [...r, richtung] : r).sort((a, b) => a - b);
  })() : pos && pos[start] ? pos.map((p, j) => ({ j, m: abstandM(pos[start], p) }))
    .filter(({ j, m }) => j !== start && !aus.has(j) && m >= minM && m <= Math.max(minM, maxM))
    .sort((a, b) => a.m - b.m).slice(0, MAX_NACHBARN).map(({ j }) => j).sort((a, b) => a - b) : [];
  const listeFuer = (rich: number | null): Route[] => {
    if (!ergebnis) return [];
    const wert = (r: Route): number[] => {
      switch (sortierung.nach) {
        case "meter": return [r.meter];
        case "legs": return [r.punkte.length - 1, r.meter];
        case "kreuz": return [r.kreuzungen, r.wertung];
        case "doppelt": return [r.doppelt, r.wertung];
        default: return [r.kreuzungen, r.doppelt, r.wertung];
      }
    };
    const vgl = (a: Route, b: Route) => {
      const x = wert(a), y = wert(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] - y[i]) * (sortierung.ab ? -1 : 1);
      return 0;
    };
    const empf = (a: Route, b: Route) => (a.kreuzungen - b.kreuzungen) || (a.doppelt - b.doppelt) || (a.wertung - b.wertung);
    return ergebnis.routen.filter((r) => rich == null || r.erstesZiel === rich).sort(empf).slice(0, 20).sort(vgl);
  };
  const routen = listeFuer(richtung);
  // Nach jeder Berechnung die erste Route direkt auswaehlen (Jan) — ausser beim Aufrufen einer
  // gemerkten, die waehlt ihre eigene (Effekt oben).
  const ersteRoute = routen[0]?.punkte.join("-") ?? null;
  useEffect(() => {
    if (!wieder) setGewaehlt(ersteRoute);
  }, [ergebnis]);  // eslint-disable-line react-hooks/exhaustive-deps
  // Erstes Ziel wechseln: nur ein Filter auf die berechnete Liste (die Suche behaelt die besten
  // Routen JE erstem Ziel) — kein neues Rechnen noetig; die erste der neuen Liste wird gewaehlt.
  // Start gewechselt: eine Richtung zum neuen Start selbst oder zu einem ausgeschlossenen Platz gilt nicht
  useEffect(() => {
    if (richtung != null && (richtung === start || aus.has(richtung))) setRichtung(null);
  }, [start, aus]);  // eslint-disable-line react-hooks/exhaustive-deps
  const richtungWaehlen = (r: number | null) => {
    setRichtung(r);
    setGewaehlt(listeFuer(r)[0]?.punkte.join("-") ?? null);
  };
  const gewaehlteRoute = veraltet ? null : routen.find((r) => r.punkte.join("-") === gewaehlt) ?? null;

  // Karte: Startpunkte (nummeriert; Klick = Start) und die gewaehlte bzw. ueberlagerte Route.
  useEffect(() => {
    if (!karte) return;
    if (!ebene.current) ebene.current = L.layerGroup();
    const g = ebene.current;
    g.clearLayers();
    if (!offen || !pos) { g.remove(); return; }
    g.addTo(karte);
    if (umkreis > 0 && mitte) {
      g.addLayer(L.circle([mitte.lat, mitte.lon], { radius: umkreis * 1000, color: "#22d3ee", weight: 1.5,
        dashArray: "6 6", fill: false, interactive: false }));
    }
    const linie = gewaehlteRoute ? gewaehlteRoute.punkte.map((i) => pos[i] as Punkt)
      : ueberlagert && !veraltet ? ueberlagert.punkte.map(([lat, lon]) => ({ lat, lon })) : null;
    if (linie) {
      // Jeder Abschnitt in der Farbe seiner Laenge (Rampe wie beim Tempo, rot = laengster), unter
      // einer dunklen Kontur, damit die Farbe auf Luftbild und Karte gleich lesbar ist.
      routeZeichnen(g, linie);
    }
    pos.forEach((p, i) => {
      const istStart = i === start;
      const raus = aus.has(i);
      const aktiv = !raus && (gewaehlteRoute ? gewaehlteRoute.punkte.includes(i) : true);
      // gruen = hier ist man selbst schon gestartet; gestrichelt = selbst gesetzter Punkt
      const farbe = !aktiv ? "#94a3b8" : schonGestartet(meineStarts, p) ? GRUEN : "#22d3ee";
      const html = `<div style="width:24px;height:24px;border-radius:12px;display:flex;align-items:center;` +
        `justify-content:center;font:700 12px ui-sans-serif,system-ui;cursor:pointer;box-sizing:border-box;` +
        `border:${istStart ? "3px solid #ffffff" : `2px ${p.eigen ? "dashed" : "solid"} #0f172a`};` +
        `background:${farbe};color:#0f172a;` +
        `${raus ? "text-decoration:line-through;opacity:0.6;" : ""}">${platzName(i)}</div>`;
      const mk = L.marker([p.lat, p.lon], {
        icon: L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12] }),
        title: p.eigen ? t("routes.ownPointInfo", { name: platzName(i) })
          : t("routes.spotInfo", { name: platzName(i), starts: p.starts, sessions: p.sessions, fahrer: p.fahrer ?? "?" }),
        draggable: !!p.eigen,
      });
      mk.on("click", () => { if (!raus) setStart(i); });
      if (p.eigen) {
        // Verschieben per Ziehen; danach gilt er als selbst gesetzt (auch wenn er aus einer gemerkten Route kam)
        mk.on("dragend", () => {
          const ll = mk.getLatLng();
          setEigene(eigene.map((q, k) => (k === i - nServer ? { lat: ll.lat, lon: ll.lng, lokal: true } : q)));
        });
      }
      g.addLayer(mk);
    });
    return () => { g.clearLayers(); };
  }, [karte, offen, pos, gewaehlteRoute, ueberlagert, veraltet, start, aus, t, meineStarts, umkreis, mitte]);  // eslint-disable-line react-hooks/exhaustive-deps

  // „+" auf der Karte (Jan): danach setzt der naechste Klick auf die Karte einen eigenen Punkt.
  // Als Leaflet-Knopf, damit er auch im Vollbild da ist.
  const setzKnopf = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (!karte || !offen) return;
    const Knopf = L.Control.extend({
      options: { position: "topleft" as L.ControlPosition },
      onAdd() {
        const box = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        const a = L.DomUtil.create("a", "", box) as HTMLAnchorElement;
        a.href = "#";
        a.setAttribute("role", "button");
        a.innerHTML = PIN_PLUS;
        a.style.cssText = "display:flex;align-items:center;justify-content:center;width:30px;height:30px;";
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(a, "click", (ev) => { L.DomEvent.preventDefault(ev); setSetzen((x) => !x); });
        setzKnopf.current = a;
        return box;
      },
    });
    const k = new Knopf();
    k.addTo(karte);
    return () => { k.remove(); setzKnopf.current = null; setSetzen(false); };
  }, [karte, offen]);
  useEffect(() => {
    const a = setzKnopf.current;
    if (!a) return;
    const name = t("routes.addPoint");
    a.title = name;
    a.setAttribute("aria-label", name);
    a.setAttribute("aria-pressed", String(setzen));
    a.style.background = setzen ? "#22d3ee" : "";
    a.style.color = setzen ? "#0f172a" : "";
  }, [setzen, t, karte, offen]);
  useEffect(() => {
    if (!karte || !setzen) return;
    const el = karte.getContainer();
    el.style.cursor = "crosshair";
    const klick = (e: L.LeafletMouseEvent) => {
      setSetzen(false);
      if (eigene.length >= EIGENE_MAX) return;
      setEigene([...eigene, { lat: e.latlng.lat, lon: e.latlng.lng, lokal: true }]);
    };
    karte.on("click", klick);
    return () => { karte.off("click", klick); el.style.cursor = ""; };
  }, [karte, setzen, eigene]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Eigenen Punkt entfernen: Indizes dahinter ruecken eins vor (Start, Ausschluesse, Ziel, Richtung).
  const eigenenEntfernen = (k: number) => {
    const gi = nServer + k;
    const ruecken = (i: number) => (i > gi ? i - 1 : i);
    setStart((s) => (s === gi ? 0 : ruecken(s)));
    setAus((a) => new Set([...a].filter((i) => i !== gi).map(ruecken)));
    setZielPlatz((z) => (z == null || z === gi ? null : ruecken(z)));
    setRichtung((r) => (r == null || r === gi ? null : ruecken(r)));
    setEigene(eigene.filter((_, j) => j !== k));
  };

  // Manuelle Punkte einer aufgerufenen Route (nicht die eigenen) entfernen: bei der naechsten eigenen
  // Berechnung und beim Schliessen der Planung (Jan: „verschwinden, sobald die Planung nicht mehr
  // diese Route ist"). Solange man nur in der Liste eine andere Route waehlt, bleiben sie — die Liste
  // ist mit ihnen gerechnet. Gibt zurueck, ob etwas entfernt wurde.
  const fremdeEntfernen = (): boolean => {
    if (!eigene.some((p) => !p.lokal)) return false;
    const neuIndex: number[] = [];                    // alter Index -> neuer (-1 = entfernt)
    let n = 0;
    for (let i = 0; i < nServer + eigene.length; i++) {
      neuIndex.push(i < nServer || eigene[i - nServer].lokal ? n++ : -1);
    }
    const um = (i: number) => neuIndex[i] ?? -1;
    setStart((s) => Math.max(0, um(s)));
    setAus((a) => new Set([...a].map(um).filter((i) => i >= 0)));
    setZielPlatz((z) => (z == null || um(z) < 0 ? null : um(z)));
    setRichtung((r) => (r == null || um(r) < 0 ? null : um(r)));
    setEigene(eigene.filter((p) => p.lokal));
    return true;
  };
  useEffect(() => { if (!offen) fremdeEntfernen(); }, [offen]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { ebene.current?.remove(); }, []);

  const merken = (r: Route) => {
    if (!pos) return;
    setMerkStatus("…");
    api.spotRouteMerken(spotId, {
      punkte: r.punkte.map((i) => [pos[i].lat, pos[i].lon]),
      einstellungen: { min_starts: minStarts, min_fahrer: minFahrer, start: [pos[start].lat, pos[start].lon],
                       erstes_ziel: richtung != null ? [pos[richtung].lat, pos[richtung].lon] : null,
                       ziel: zielAktiv != null ? [pos[zielAktiv].lat, pos[zielAktiv].lon] : null,
                       min_m: minM, max_m: maxM, punkte: anzahl, ohne_kreuzung: ohneKreuzung, rundkurs,
                       ausgeschlossen: [...aus].map((i) => [pos[i].lat, pos[i].lon]),
                       // nur die manuellen Punkte, die die Route wirklich anfaehrt (Jan)
                       eigene: [...new Set(r.punkte.filter((i) => i >= nServer))].map((i) => [pos[i].lat, pos[i].lon]),
                       umkreis_km: umkreis },
    })
      .then(() => { setMerkStatus("ok"); gemerktGeaendert(); })
      .catch((e) => setMerkStatus(String(e).includes("409") ? "limit" : "fehler"));
  };

  const aufrufen = (g: Gemerkt) => {
    const e = g.einstellungen;
    setUeberlagert(null);
    setWieder(g);
    // Manuelle Punkte der Route dazunehmen (nur fuer jetzt, nicht in die eigenen gespeichert), ausser
    // es liegt schon einer der eigenen an der Stelle. Sie gehoeren zu DIESER Route: die einer vorher
    // aufgerufenen fliegen raus, statt sich anzusammeln (Jan, 16.10.2026). Start, Ausschluesse und
    // Ziel stellt der Aufruf ohnehin neu ein, Indizes muessen hier nicht nachgezogen werden.
    const lokale = eigene.filter((p) => p.lokal);
    const dazu = (e.eigene ?? []).map(([lat, lon]) => ({ lat, lon, lokal: false }))
      .filter((p) => !lokale.some((q) => abstandM(p, q) < 5));
    const neueEigene = [...lokale, ...dazu].slice(0, EIGENE_MAX);
    if (neueEigene.length !== eigene.length || neueEigene.some((p, i) => p !== eigene[i])) setEigene(neueEigene);
    const posNeu: Startposition[] | null = serverPos && [...serverPos,
      ...neueEigene.map((p) => ({ lat: p.lat, lon: p.lon, starts: 0, sessions: 0, eigen: true }))];
    if (e.min_m != null) setMinM(e.min_m);
    if (e.max_m != null) setMaxM(e.max_m);
    if (e.punkte != null) setAnzahl(e.punkte);
    if (e.ohne_kreuzung != null) setOhneKreuzung(e.ohne_kreuzung);
    if (e.rundkurs != null) setRundkurs(e.rundkurs);
    const ms = e.min_starts ?? minStarts, mf = e.min_fahrer ?? 1, uk = e.umkreis_km || 2;   // vor dem Umkreis gemerkt: wie die Vorgabe
    if (ms !== minStarts || mf !== minFahrer || uk !== umkreis) {      // laedt die Startpunkte neu, rechnet dann
      setMinStarts(ms); setMinFahrer(mf); umkreisSetzen(uk);
    }
    else if (posNeu) {                                  // gleiche Startpunkte: Start setzen, rechnen
      const st = e.start ? naechster(posNeu, { lat: e.start[0], lon: e.start[1] }) : -1;
      if (st >= 0) setStart(st);
      const ex = new Set<number>();
      for (const [la, lo] of e.ausgeschlossen ?? []) {
        const i = naechster(posNeu, { lat: la, lon: lo });
        if (i >= 0 && i !== st) ex.add(i);
      }
      setAus(ex);
      const zz = e.ziel ? naechster(posNeu, { lat: e.ziel[0], lon: e.ziel[1] }) : -1;
      setZielPlatz(zz >= 0 ? zz : null);
      window.setTimeout(() => setAnstoss((n) => n + 1), 0);
    }
  };

  // Gemerkte Route aus der Leiste unter der Karte aufgerufen (im Planungsmodus).
  const aufrufLaeuft = useRef(false);
  useEffect(() => {
    if (offen && aufruf) { aufrufLaeuft.current = true; aufrufen(aufruf.g); }
  }, [aufruf]);  // eslint-disable-line react-hooks/exhaustive-deps
  // Weicht die Planung von der aufgerufenen gemerkten Route ab (andere Route gewaehlt, Einstellung
  // geaendert), ist es nicht mehr sie -> Hervorhebung in der Leiste weg (Jan). Nicht waehrend des
  // Aufrufs selbst, der stellt erst nach und nach alles ein.
  // Verglichen wird ueber die Lage (je Punkt NAH_M), nicht ueber den gerundeten Schluessel: die
  // Startplaetze werden taeglich neu gebuendelt und verschieben sich um ein paar Meter.
  const gleicheRoute = (g: Gemerkt, pts: Punkt[]) => {
    const a = g.punkte.map(([lat, lon]) => ({ lat, lon }));
    // MIT Richtung: dieselbe Runde andersherum ist zum Fahren eine andere Route
    return pts.length === a.length && pts.every((p, i) => abstandM(p, a[i]) < NAH_M);
  };
  const istNochGemerkte = (() => {
    const g = gemerkt.find((x) => x.schluessel === gemerktWahl);
    if (!g || veraltet) return false;
    if (gewaehlteRoute && pos) return gleicheRoute(g, gewaehlteRoute.punkte.map((q) => pos[q]));
    return ueberlagert?.schluessel === g.schluessel;
  })();
  useEffect(() => {
    if (!offen || !gemerktWahl || aufrufLaeuft.current || wieder) return;
    if (!istNochGemerkte) abweichung();
  }, [istNochGemerkte, gemerktWahl, offen, wieder]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!offen) return null;
  const pille = (aktiv: boolean) => `rounded-full border px-3 py-1 ${aktiv
    ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`;
  const regler = (label: string, wert: number, setz: (v: number) => void, von: number, bis: number,
                  einheit = " m", schritt = 10) => (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span>{label}: <span className="font-semibold text-slate-100">{wert}{einheit}</span></span>
      <input type="range" min={von} max={bis} step={schritt} value={wert}
        onChange={(e) => setz(Number(e.target.value))} className="accent-brand-500" />
    </label>
  );
  const nummern = (pts: [number, number][]) =>
    pts.map(([lat, lon]) => { const i = pos ? naechster(pos, { lat, lon }) : -1; return i >= 0 ? platzName(i) : "·"; });

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      {(
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {/* Die drei Bedingungen an die Startplaetze in einem Kasten (Jan) */}
            <fieldset className="min-w-0 max-w-full rounded-xl border border-slate-700 px-3 pb-2 pt-0.5">
            <legend className="px-1 text-xs font-medium text-slate-300">{t("routes.startReq")}</legend>
            <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{t("routes.reliability")}</span>
            {ZUVERLAESSIG.map((n) => (
              <button key={n} onClick={() => setMinStarts(n)} aria-pressed={minStarts === n} className={pille(minStarts === n)}>
                ≥ {n}×
              </button>
            ))}
            </span>
            <span className="mx-1 hidden h-5 w-px bg-slate-700 sm:block" aria-hidden />
            <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{t("routes.riders")}</span>
            {FAHRER.map((n) => (
              <button key={n} onClick={() => setMinFahrer(n)} aria-pressed={minFahrer === n} className={pille(minFahrer === n)}>
                ≥ {n}
              </button>
            ))}
            </span>
            <span className="mx-1 hidden h-5 w-px bg-slate-700 sm:block" aria-hidden />
            <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{t("routes.radius")}</span>
            {UMKREIS.map((km) => (
              <button key={km} onClick={() => umkreisSetzen(km)} aria-pressed={umkreis === km} className={pille(umkreis === km)}>
                {km} km
              </button>
            ))}
            </span>
            </div>
            </fieldset>
          </div>
          {setzen && (
            <p className="mb-3 rounded-lg border border-brand-500 bg-brand-500/10 p-2 text-sm text-slate-200">
              {eigene.length >= EIGENE_MAX ? t("routes.addPointLimit", { n: EIGENE_MAX }) : t("routes.addPointHint")}
            </p>
          )}
          {pos == null ? (
            <p className="text-xs text-slate-400">…</p>
          ) : (
            <>
              {/* Alles, was die Route selbst festlegt, in einem Kasten (Jan) */}
              <fieldset className="mb-3 min-w-0 rounded-xl border border-slate-700 px-3 pb-3 pt-0.5">
              <legend className="px-1 text-xs font-medium text-slate-300">{t("routes.config")}</legend>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="shrink-0 text-xs text-slate-400">{t("routes.startPoints")}</span>
                {pos.map((p, i) => {
                  // Lage zum Spot selbst (mit Umkreis ist der meistgenutzte Platz oft ein fremder)
                  const lage = lageText(p, mitte ?? pos[0], t("map.compass").split(","));
                  const raus = aus.has(i);
                  return [
                    <span key={i} title={p.eigen ? t("routes.ownPointInfo", { name: platzName(i) })
                      : t("routes.spotInfo", { name: platzName(i), starts: p.starts, sessions: p.sessions, fahrer: p.fahrer ?? "?" })}
                      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap ${pille(start === i)} ${raus ? "opacity-50" : ""}`}>
                      {/* Haken = Startplatz wird angefahren; abhaken schliesst ihn aus (Jan). Eigener Knopf
                          statt nativer Checkbox: die war 14 px gross, in Safari kaum zu treffen, und ein Klick
                          daneben machte den Platz zum Start. Der gewaehlte Start ist immer dabei. */}
                      <button type="button" disabled={start === i} aria-pressed={!raus}
                        onClick={(e) => { e.stopPropagation(); setAus((alt) => { const n = new Set(alt); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }}
                        title={t(raus ? "routes.include" : "routes.exclude")} aria-label={t(raus ? "routes.include" : "routes.exclude")}
                        className={`-my-1 -ml-2 flex h-7 w-7 items-center justify-center rounded-full border-r ${start === i
                          ? "cursor-default border-transparent opacity-60" : "border-current/30 hover:bg-black/10"}`}>
                        {raus ? "○" : "✓"}
                      </button>
                      <button onClick={() => { if (!raus) setStart(i); }} aria-pressed={start === i} disabled={raus}
                        className={`inline-flex items-center ${raus ? "line-through" : ""}`}>
                        {schonGestartet(meineStarts, p) && (
                          <span className="mr-1.5 h-2.5 w-2.5 rounded-full border border-slate-900" style={{ background: GRUEN }}
                            title={t("routes.myStart")} aria-label={t("routes.myStart")} />
                        )}
                        <span className={`font-semibold ${p.eigen ? "underline decoration-dashed underline-offset-2" : ""}`}>{platzName(i)}</span>
                        {lage && <span className="ml-1">· {lage}</span>}
                      </button>
                      {p.eigen && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); eigenenEntfernen(i - nServer); }}
                          title={t("routes.removePoint")} aria-label={t("routes.removePoint")}
                          className="-my-1 -mr-2 flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/10">
                          ✕
                        </button>
                      )}
                    </span>,
                    // Losfahren nach … direkt hinter dem gewaehlten Start (Jan). Gilt die berechnete
                    // Liste, kommen die Richtungen aus ihr; sonst (Start gewechselt o. ae.) stehen die
                    // Plaetze zur Wahl, die die Suche vom Start aus anfahren kann (Jan: „warum kann ich
                    // den 2. Punkt nicht waehlen … erst nach Klick auf Berechnen").
                    start === i && richtungsWahl.length > 0 && (
                      <span key={`r${i}`} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                        <span className="text-xs text-slate-400">{t("routes.direction")}</span>
                        {[null, ...richtungsWahl].map((r) => (
                          <button key={String(r)} onClick={() => richtungWaehlen(r)} aria-pressed={richtung === r}
                            className={`${pille(richtung === r)} px-2`}>
                            {r == null ? t("routes.anyDirection") : platzName(r)}
                          </button>
                        ))}
                      </span>
                    ),
                  ];
                })}
              </div>
              {/* Ziel waehlen, nur ohne Rundkurs (Jan) — eine echte Einstellung: die Suche nimmt dann
                  nur Routen, die dort enden. */}
              {!rundkurs && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="shrink-0 text-xs text-slate-400">{t("routes.target")}</span>
                  <button onClick={() => setZielPlatz(null)} aria-pressed={zielAktiv == null} className={`${pille(zielAktiv == null)} px-2`}>
                    {t("routes.anyDirection")}
                  </button>
                  {pos.map((_, i) => i !== start && !aus.has(i) && (
                    <button key={i} onClick={() => setZielPlatz(i)} aria-pressed={zielAktiv === i} className={`${pille(zielAktiv === i)} px-2`}>
                      {platzName(i)}
                    </button>
                  ))}
                </div>
              )}
              {/* Regler und die beiden Haken in einer Zeile (Jan), auf schmalen Bildschirmen untereinander */}
              <div className="grid items-end gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
                {regler(t("routes.minDist"), minM, (v) => setMinM(Math.min(v, maxM)), 0, 1000)}
                {/* mit Umkreis liegen die Startplaetze Kilometer auseinander (Zuerichsee) -> bis 10 km */}
                {regler(t("routes.maxDist"), maxM, (v) => setMaxM(Math.max(v, minM)), 50, umkreis > 0 ? 10000 : 2000, " m", umkreis > 0 ? 50 : 10)}
                {pos.length >= 2 ? regler(t("routes.count"), Math.min(anzahl, pos.length), setAnzahl, 2, pos.length, "", 1) : <span />}
                <div className="flex flex-wrap items-center gap-4 pb-0.5 sm:col-span-3 lg:col-span-1">
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-200">
                    <input type="checkbox" checked={ohneKreuzung} onChange={(e) => setOhneKreuzung(e.target.checked)}
                      className="h-4 w-4 accent-brand-500" />
                    {t("routes.noCrossing")}
                  </label>
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-200">
                    <input type="checkbox" checked={rundkurs} onChange={(e) => setRundkurs(e.target.checked)}
                      className="h-4 w-4 accent-brand-500" />
                    {t("routes.roundtrip")}
                  </label>
                </div>
              </div>
              </fieldset>
              {/* Passt die Liste nicht mehr zu den Einstellungen, verschwindet sie und der Knopf
                  erscheint (Jan: eine stehengebliebene Tabelle verwirrt). */}
              {(<>
              {veraltet && (
                <button onClick={() => {
                  setUeberlagert(null);
                  // erst die fremden Punkte weg, dann mit den neuen Startplaetzen rechnen
                  if (fremdeEntfernen()) window.setTimeout(() => setAnstoss((n) => n + 1), 0);
                  else setAnstoss((n) => n + 1);
                }}
                  className="mb-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400">
                  {t("routes.compute")}
                </button>
              )}
              {!veraltet && (<>

              {ueberlagert && (
                <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">
                  <p className="mb-1.5">{t("routes.changed")}</p>
                  <Abschnitte pts={ueberlagert.punkte.map(([lat, lon]) => ({ lat, lon }))} namen={nummern(ueberlagert.punkte)} />
                </div>
              )}
              {!routen.length ? (
                ergebnis && (() => {
                  // Begruendung statt leerer Liste (Jan)
                  // Routen gibt es, nur nicht in die gewaehlte Richtung: das sagen, statt die Wahl
                  // still auf „beliebig" zu setzen (Jan)
                  if (richtung != null && ergebnis.routen.length > 0) {
                    return <p className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">
                      {t("routes.whyDirection", { name: platzName(richtung) })}</p>;
                  }
                  const w = grund ?? { grund: "unbekannt" as const };
                  const text = w.grund === "nachbar" ? (w.naechsterM == null ? t("routes.whyNoOther")
                      : t("routes.whyNeighbour", { m: w.naechsterM, min: minM, max: maxM }))
                    : w.grund === "zuWenig" ? t("routes.whyTooFew", { n: w.verfuegbar, soll: Math.min(anzahl, pos.length) })
                    : w.grund === "rundkurs" ? t("routes.whyRoundtrip")
                    : w.grund === "kreuzung" ? t("routes.whyCrossing")
                    : w.grund === "punkte" ? t("routes.whyPoints", { n: w.hoechstens })
                    : w.grund === "ziel" ? t("routes.whyTarget")
                    : t("routes.none", { n: pos.length });
                  return <p className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">{text}</p>;
                })()
              ) : (
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-900">
                      <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                        {([["empf", "#"], ["route", t("routes.colRoute")], ["meter", t("routes.colDistance")],
                           ["legs", t("routes.colLegs")], ["kreuz", t("routes.colCrossings")],
                           ["doppelt", t("routes.colDuplicates")]] as [Spalte | "route", string][]).map(([sp, text]) => (
                          <th key={sp} className={`px-2 py-1 font-medium ${sp === "route" ? ""
                            : sp === "legs" || sp === "kreuz" || sp === "doppelt" ? "text-center" : "text-right"}`}>
                            {sp === "route" ? text : (
                              <button onClick={() => setSortierung((alt) => ({ nach: sp, ab: alt.nach === sp ? !alt.ab : false }))}
                                className={`hover:text-slate-200 ${sortierung.nach === sp ? "text-slate-100" : ""}`}>
                                {text}{sortierung.nach === sp ? (sortierung.ab ? " ▼" : " ▲") : ""}
                              </button>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {routen.map((r, i) => {
                        const schl = r.punkte.join("-");
                        const an = gewaehlt === schl;
                        return [
                          <tr key={schl} onClick={() => { setGewaehlt(an ? null : schl); setMerkStatus(null); setUeberlagert(null); }}
                            aria-selected={an}
                            className={`cursor-pointer border-b border-slate-800/60 ${an
                              ? "bg-brand-500/10 text-slate-100" : "text-slate-200 hover:bg-slate-800"}`}>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1.5 font-semibold tabular-nums">{r.punkte.map(platzName).join(" → ")}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{Math.round(r.meter)} m</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">{r.punkte.length - 1}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">{r.kreuzungen}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">{r.doppelt}</td>
                          </tr>,
                          an && (
                            <tr key={schl + "-details"} className="border-b border-slate-800/60 bg-brand-500/5">
                              <td />
                              <td colSpan={5} className="px-2 pb-2 pt-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Abschnitte pts={r.punkte.map((q) => pos[q])} namen={r.punkte.map(platzName)} />
                                  {(() => {
                                    // Schon selbst gemerkt -> kein zweites Mal (Jan); von anderen gemerkt -> darf man auch
                                    const meine = gemerkt.find((x) => x.eigene_id != null
                                      && x.schluessel === routenSchluessel(r.punkte.map((q) => pos[q])));
                                    return meine || merkStatus === "ok"
                                      ? (
                                        <span className="inline-flex items-center gap-3 text-xs">
                                          <span className="font-semibold text-brand-600 dark:text-brand-300">{t("routes.saved")}</span>
                                          {/* Loeschen nur hier, mit Rueckfrage (Jan) — entfernt nur den EIGENEN
                                              Eintrag; haben andere die Route auch gemerkt, bleibt sie stehen. */}
                                          {meine?.eigene_id != null && (
                                            <button onClick={() => {
                                              if (!window.confirm(t("routes.deleteConfirm"))) return;
                                              api.spotRouteVergessen(spotId, meine.eigene_id as number)
                                                .then(() => { setMerkStatus(null); gemerktGeaendert(); }).catch(() => {});
                                            }} className="text-slate-400 underline hover:text-slate-200">
                                              {t("routes.delete")}
                                            </button>
                                          )}
                                        </span>
                                      )
                                      : (
                                  <button onClick={() => merken(r)} disabled={merkStatus === "…"}
                                    className="rounded-full border border-brand-500 bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-500/25 disabled:opacity-70 dark:text-brand-300">
                                    {t("routes.save")}
                                  </button>);
                                  })()}
                                </div>
                                {merkStatus === "limit" && <p className="mt-1 text-xs text-slate-400">{t("routes.limit")}</p>}
                              </td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {ergebnis?.gekuerzt && <p className="mt-2 text-xs text-slate-400">{t("routes.cut")}</p>}
              </>)}
              </>)}
            </>
          )}
          {/* Gemerkte Routen und Legende unter der Tabelle (Jan) */}
          {leiste}
          {pos && (<>
              {/* Legende ganz unten (Jan), nur wenn es etwas zu erklaeren gibt */}
              {(pos.some((p) => schonGestartet(meineStarts, p)) || eigene.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                  {pos.some((p) => schonGestartet(meineStarts, p)) && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full border border-slate-900" style={{ background: GRUEN }} aria-hidden />
                      {t("routes.myStart")}
                    </span>
                  )}
                  {eigene.length > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full border-2 border-dashed border-slate-300 bg-brand-500" aria-hidden />
                      {t("routes.ownPoint")}
                    </span>
                  )}
                </div>
              )}
          </>)}
        </>
      )}
    </div>
  );
}
