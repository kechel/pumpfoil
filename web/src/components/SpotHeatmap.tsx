import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { api } from "../lib/api";
import { basiskarten } from "../lib/mapTiles";
import { heatZeichnen, zellKanten } from "../lib/heatmap";
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
        </div>
      </div>
      <div ref={box} className="mt-2 h-64 w-full overflow-hidden rounded-lg sm:h-80" />
      {wahl !== "off" && (
        <p className="mt-2 text-xs text-slate-400">
          {t(art === "start" ? "spots.heatHintStart" : "spots.heatHint")}
        </p>
      )}
    </Card>
  );
}
