import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { api } from "../lib/api";
import { basiskarten } from "../lib/mapTiles";
import { heatZeichnen, zellKanten } from "../lib/heatmap";
import { lageText, MAX_POSITIONEN, richtungName, routenVorschlagen, type Route, type RoutenErgebnis, type Startposition } from "../lib/routen";
import { Card } from "./ui";
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

function gemerkt(): Wahl {
  try {
    const v = localStorage.getItem(SPEICHER);
    return v === "30d" || v === "off" ? v : "365d";
  } catch { return "365d"; }
}

function gemerkteArt(): Art {
  try { return localStorage.getItem(SPEICHER_ART) === "start" ? "start" : "foil"; }
  catch { return "foil"; }
}

export function SpotHeatmap({ spotId }: { spotId: number }) {
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
  const [wahl, setWahlRoh] = useState<Wahl>(gemerkt);
  const setWahl = (w: Wahl) => {
    setWahlRoh(w);
    try { localStorage.setItem(SPEICHER, w); } catch { /* privat/blockiert: gilt nur jetzt */ }
  };
  const [planen, setPlanen] = useState(false);
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
    basiskarten(m, { street: tRef.current("map.street"), satellite: tRef.current("map.satellite") });
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
      api.heatmap(wahl, k.m.getZoom(), b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), art)
        .then((r) => { if (!weg) heatZeichnen(k.grp, k.renderer, r); })
        .catch(() => {});
    };
    const spaeter = () => { window.clearTimeout(timer); timer = window.setTimeout(laden, 250); };
    laden();
    k.m.on("moveend", spaeter);
    return () => { weg = true; window.clearTimeout(timer); k.m.off("moveend", spaeter); };
  }, [bereit, wahl, art]);

  if (leer) return null;
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
        <div className="text-base font-semibold text-slate-100">{t("spots.heatmap")}</div>
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
      {wahl !== "off" && (
        <p className="mt-2 text-xs text-slate-400">
          {t(art === "start" ? "spots.heatHintStart" : "spots.heatHint")}
        </p>
      )}
      <RoutenVorschlag spotId={spotId} karte={bereit ? karte.current?.m ?? null : null}
        offen={planen} schliessen={() => setPlanen(false)} />
    </Card>
  );
}

// Routen-Vorschlaege unter der Karte (Jan, 16.10.2026). Ablauf:
//   1. Knopf „Route planen" — erst danach erscheint der Rest.
//   2. Zuverlaessigkeit (Startpunkt mind. N-mal genutzt) und die Startpunkte als Leiste, nummeriert
//      (1 = meistgenutzt) mit Lage zum meistgenutzten; Start per Leiste oder Klick auf die Karte,
//      Vorgabe der meistgenutzte.
//   3. Mindest-/Hoechstabstand zwischen zwei Startpunkten, darunter die Vorschlaege; ein Klick
//      zeigt die Route auf der Karte. Rechnung in lib/routen.ts.
const ZUVERLAESSIG = [2, 3, 5, 10];
type Spalte = "empf" | "meter" | "legs" | "kreuz" | "doppelt";

function RoutenVorschlag({ spotId, karte, offen, schliessen }: {
  spotId: number; karte: L.Map | null; offen: boolean; schliessen: () => void;
}) {
  const t = useT();
  const [minStarts, setMinStarts] = useState(3);
  const [start, setStart] = useState(0);
  const [minM, setMinM] = useState(50);
  const [maxM, setMaxM] = useState(300);
  const [anzahl, setAnzahl] = useState(99);           // Startpunkte auf der Route; 99 = alle
  const [ohneKreuzung, setOhneKreuzung] = useState(true);
  const [rundkurs, setRundkurs] = useState(true);
  const [gesamt, setGesamt] = useState(0);            // so viele Startpunkte gaebe es ohne Grenze
  // Richtung des ersten Abschnitts (Jan: „am Startpunkt 1 entweder Richtung W oder NO starten");
  // null = beliebig.
  const [richtung, setRichtung] = useState<number | null>(null);
  const [ergebnis, setErgebnis] = useState<RoutenErgebnis | null>(null);
  // Tabelle sortierbar (Jan): Vorgabe „Empfehlung" = wenige Kreuzungen, wenige doppelte
  // Abschnitte, dann die Wertung (Strecke + Kehren).
  const [sortierung, setSortierung] = useState<{ nach: Spalte; ab: boolean }>({ nach: "empf", ab: false });
  const [pos, setPos] = useState<Startposition[] | null>(null);
  const [routen, setRouten] = useState<Route[] | null>(null);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const ebene = useRef<L.LayerGroup | null>(null);

  // Startpunkte je Zuverlaessigkeit holen, sobald geplant wird.
  useEffect(() => {
    if (!offen) return;
    let weg = false;
    setPos(null);
    api.spotStartpositionen(spotId, minStarts)
      .then((r) => {
        if (weg) return;
        // nur die meistgenutzten (lib/routen.ts MAX_POSITIONEN) — Leiste, Karte und Suche gleich
        setGesamt(r.positionen.length);
        setPos(r.positionen.slice(0, MAX_POSITIONEN));
        setStart(0);
      })
      .catch(() => { if (!weg) setPos([]); });
    return () => { weg = true; };
  }, [offen, spotId, minStarts]);

  // Vorschlaege neu rechnen, wenn sich Punkte, Start oder Abstaende aendern.
  useEffect(() => {
    if (!pos) { setErgebnis(null); return; }
    setErgebnis(routenVorschlagen(pos, start, minM, Math.max(minM, maxM),
      { punkte: Math.min(anzahl, pos.length), ohneKreuzung, rundkurs }));
  }, [pos, start, minM, maxM, anzahl, ohneKreuzung, rundkurs]);
  // Neuer Startpunkt -> Richtung wieder beliebig (die alte gibt es dort vielleicht nicht).
  useEffect(() => { setRichtung(null); }, [start, pos]);
  // Richtungen, in die vom Start aus ueberhaupt eine Route losgeht.
  const richtungen = ergebnis
    ? [...new Set(ergebnis.routen.map((r) => r.richtung))].sort((a, b) => a - b)
    : [];
  useEffect(() => {
    if (!ergebnis) { setRouten(null); return; }
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
    setRouten(ergebnis.routen.filter((r) => richtung == null || r.richtung === richtung)
      .sort((a, b) => [a.kreuzungen, a.doppelt, a.wertung].reduce((acc, v, i) =>
        acc || v - [b.kreuzungen, b.doppelt, b.wertung][i], 0))
      .slice(0, 20)
      .sort(vgl));
    setGewaehlt(null);
  }, [ergebnis, richtung, sortierung]);

  // Startpunkte (nummeriert) und die gewaehlte Route auf die Karte; Klick auf einen Punkt = Start.
  useEffect(() => {
    if (!karte) return;
    if (!ebene.current) ebene.current = L.layerGroup();
    const g = ebene.current;
    g.clearLayers();
    if (!offen || !pos) { g.remove(); return; }
    g.addTo(karte);
    const r = gewaehlt != null ? routen?.[gewaehlt] : null;
    if (r) {
      g.addLayer(L.polyline(r.punkte.map((i) => [pos[i].lat, pos[i].lon] as [number, number]),
        { color: "#ffffff", weight: 4, opacity: 0.95, dashArray: "8 6", interactive: false }));
    }
    pos.forEach((p, i) => {
      const istStart = i === start;
      const aktiv = r ? r.punkte.includes(i) : true;
      const html = `<div style="width:24px;height:24px;border-radius:12px;display:flex;align-items:center;` +
        `justify-content:center;font:700 12px ui-sans-serif,system-ui;cursor:pointer;` +
        `border:${istStart ? "3px solid #ffffff" : "2px solid #0f172a"};` +
        `background:${aktiv ? "#22d3ee" : "#94a3b8"};color:#0f172a">${i + 1}</div>`;
      const mk = L.marker([p.lat, p.lon], {
        icon: L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12] }),
        title: `${i + 1} · ${p.starts}× · ${p.sessions} ${t("side.sessions")}`,
      });
      mk.on("click", () => setStart(i));
      g.addLayer(mk);
    });
    return () => { g.clearLayers(); };
  }, [karte, offen, pos, routen, gewaehlt, start, t]);

  useEffect(() => () => { ebene.current?.remove(); }, []);

  const pille = (aktiv: boolean) => `rounded-full border px-3 py-1 ${aktiv
    ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`;

  if (!offen) return null;
  const regler = (label: string, wert: number, setz: (v: number) => void, von: number, bis: number,
                  einheit = " m", schritt = 10) => (
    <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-slate-400">
      <span>{label}: <span className="font-semibold text-slate-100">{wert}{einheit}</span></span>
      <input type="range" min={von} max={bis} step={schritt} value={wert}
        onChange={(e) => setz(Number(e.target.value))} className="accent-brand-500" />
    </label>
  );
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-100">{t("routes.plan")}</div>
        <button onClick={schliessen} className="text-xs text-slate-400 hover:text-slate-200">
          {t("routes.close")}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-slate-400">{t("routes.reliability")}</span>
        {ZUVERLAESSIG.map((n) => (
          <button key={n} onClick={() => setMinStarts(n)} aria-pressed={minStarts === n} className={pille(minStarts === n)}>
            ≥ {n}×
          </button>
        ))}
      </div>
      {pos == null ? (
        <p className="text-xs text-slate-400">…</p>
      ) : (
        <>
          <div className="mb-1 text-xs text-slate-400">{t("routes.startPoint")}</div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 text-sm">
            {pos.map((p, i) => {
              const lage = lageText(p, pos[0]);
              return (
                <button key={i} onClick={() => setStart(i)} aria-pressed={start === i}
                  className={`shrink-0 whitespace-nowrap ${pille(start === i)}`}>
                  <span className="font-semibold">{i + 1}</span>
                  {lage && <span className="ml-1">· {lage}</span>}
                  <span className="ml-1 opacity-75">· {p.starts}×</span>
                </button>
              );
            })}
          </div>
          {richtungen.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-slate-400">{t("routes.direction")}</span>
              <button onClick={() => setRichtung(null)} aria-pressed={richtung == null} className={pille(richtung == null)}>
                {t("routes.anyDirection")}
              </button>
              {richtungen.map((r) => (
                <button key={r} onClick={() => setRichtung(r)} aria-pressed={richtung === r} className={pille(richtung === r)}>
                  {richtungName(r)}
                </button>
              ))}
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-4">
            {regler(t("routes.minDist"), minM, (v) => setMinM(Math.min(v, maxM)), 0, 1000)}
            {regler(t("routes.maxDist"), maxM, (v) => setMaxM(Math.max(v, minM)), 50, 2000)}
          </div>
          {pos.length >= 2 && (
            <div className="mb-3 flex flex-wrap items-end gap-4">
              {regler(t("routes.count"), Math.min(anzahl, pos.length), setAnzahl, 2, pos.length, "", 1)}
              <div className="flex flex-1 flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={ohneKreuzung} onChange={(e) => setOhneKreuzung(e.target.checked)}
                    className="h-4 w-4 accent-brand-500" />
                  {t("routes.noCrossing")}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={rundkurs} onChange={(e) => setRundkurs(e.target.checked)}
                    className="h-4 w-4 accent-brand-500" />
                  {t("routes.roundtrip")}
                </label>
              </div>
            </div>
          )}
          {!routen?.length ? (
            <p className="text-sm text-slate-300">{t("routes.none", { n: pos.length })}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                    {([["empf", "#"], ["route", t("routes.colRoute")], ["meter", t("routes.colDistance")],
                       ["legs", t("routes.colLegs")], ["kreuz", t("routes.colCrossings")],
                       ["doppelt", t("routes.colDuplicates")]] as [Spalte | "route", string][]).map(([sp, text]) => (
                      <th key={sp} className={`px-2 py-1 font-medium ${sp === "route" ? "" : "text-right"}`}>
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
                  {routen.map((r, i) => (
                    <tr key={r.punkte.join("-")} onClick={() => setGewaehlt(gewaehlt === i ? null : i)}
                      aria-selected={gewaehlt === i}
                      className={`cursor-pointer border-b border-slate-800/60 ${gewaehlt === i
                        ? "bg-brand-500/10 text-slate-100" : "text-slate-200 hover:bg-slate-800"}`}>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold tabular-nums">{r.punkte.map((q) => q + 1).join(" → ")}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Math.round(r.meter)} m</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.punkte.length - 1}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.kreuzungen}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.doppelt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ergebnis?.gekuerzt && <p className="mt-2 text-xs text-slate-400">{t("routes.cut")}</p>}
          {gesamt > pos.length && (
            <p className="mt-2 text-xs text-slate-400">{t("routes.capped", { n: pos.length, m: gesamt })}</p>
          )}
          <p className="mt-2 text-xs text-slate-400">{t("routes.hint", { n: pos.length })}</p>
        </>
      )}
    </div>
  );
}
