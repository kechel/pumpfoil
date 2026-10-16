import L from "leaflet";
import { api } from "./api";

// Basiskarten für ALLE Leaflet-Karten der App: Straßenkarte (OpenStreetMap) und Luftbild
// (Esri World Imagery). Nutzerwunsch vom 26.08.: „How hard is it to have satellite view option
// on the tracking map."
//
// Warum Esri und nicht OSM: OpenStreetMap ist ein DATEN-Projekt und hat keine Luftbilder — das
// gibt es dort schlicht nicht. Esri liefert sie ohne Schlüssel und ohne Kosten gegen
// Namensnennung; Alternativen waren Mapbox (Schlüssel + Kosten ab 50 000 Aufrufen) und
// Sentinel-2 (wirklich frei, aber 10 m Auflösung — See ja, Steg nein).
//
// Datenschutz: die Kacheln kommen vom jeweiligen Anbieter, dabei sieht er IP und Kartenausschnitt.
// Für OSM gilt das ohnehin seit jeher; das Luftbild lädt NUR, wenn jemand es einschaltet.
// Beides steht seit 30.08. in der Datenschutzerklärung (imp.map*).
const SPEICHER = "map_layer";           // gemerkte Wahl: "karte" | "satellit"

export function gewaehlteKarte(): "karte" | "satellit" {
  try { return localStorage.getItem(SPEICHER) === "satellit" ? "satellit" : "karte"; }
  catch { return "karte"; }
}

/** Fügt Straßen- und Satellitenkarte samt Umschalter hinzu. Die Wahl gilt appweit — wer die
 *  Session-Karte auf Luftbild stellt, findet die Spot-Karte genauso vor. */
export type KartenTexte = {
  street: string; satellite: string; fullscreen?: string;
  schutz?: { nsg: string; ffh: string; verbot: string; hinweis: string };
};

/** Alle Beschriftungen fuer basiskarten aus der Uebersetzung — EINE Stelle statt in jeder Karte. */
export function kartenTexte(t: (k: string) => string): KartenTexte {
  return {
    street: t("map.street"), satellite: t("map.satellite"), fullscreen: t("map.fullscreen"),
    schutz: { nsg: t("map.nsg"), ffh: t("map.ffh"), verbot: t("map.prohibited"), hinweis: t("map.protectedHint") },
  };
}

export function basiskarten(
  map: L.Map,
  namen: KartenTexte,
  opts: { maxZoom?: number } = {},
) {
  const maxZoom = opts.maxZoom ?? 22;
  const strasse = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom,
    maxNativeZoom: 19,   // darüber wird skaliert statt nachzuladen
  });
  // Esri: Kachel-Adresse in der Reihenfolge z/y/x (nicht z/x/y wie bei OSM).
  const satellit = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "© Esri, Maxar, Earthstar Geographics", maxZoom, maxNativeZoom: 19 },
  );
  let aktiv: "karte" | "satellit" = gewaehlteKarte();
  (aktiv === "satellit" ? satellit : strasse).addTo(map);

  // EIN Knopf statt einer Auswahlliste (Jan, 31.08.): bei genau zwei Ebenen ist eine Liste mit
  // Radioknöpfen zwei Klicks für etwas, das einer sein sollte. Beschriftet ist er mit dem ZIEL —
  // steht „Satellit" drauf, kommt man mit einem Tipp dorthin.
  const Umschalter = L.Control.extend({
    options: { position: "topright" as L.ControlPosition },
    onAdd() {
      const box = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const knopf = L.DomUtil.create("a", "", box) as HTMLAnchorElement;
      knopf.href = "#";
      knopf.setAttribute("role", "button");
      knopf.style.cssText =
        "width:auto;padding:0 10px;line-height:30px;height:30px;font:600 12px/30px " +
        "ui-sans-serif,system-ui,sans-serif;white-space:nowrap;";
      const beschriften = () => {
        knopf.textContent = aktiv === "satellit" ? namen.street : namen.satellite;
        knopf.title = knopf.textContent;
        knopf.setAttribute("aria-label", knopf.textContent);
      };
      beschriften();
      L.DomEvent.on(knopf, "click", (e: Event) => {
        L.DomEvent.stop(e);
        const neu = aktiv === "satellit" ? "karte" : "satellit";
        map.removeLayer(aktiv === "satellit" ? satellit : strasse);
        (neu === "satellit" ? satellit : strasse).addTo(map);
        aktiv = neu;
        try { localStorage.setItem(SPEICHER, aktiv); }
        catch { /* privater Modus: dann gilt die Wahl nur für diese Sitzung */ }
        beschriften();
      });
      L.DomEvent.disableClickPropagation(box);
      return box;
    },
  });
  map.addControl(new Umschalter());
  vollbildKnopf(map, namen.fullscreen ?? "Fullscreen");
  if (namen.schutz) schutzgebiete(map, namen.schutz);
  return { strasse, satellit };
}

// Vollbild fuer JEDE Karte (Jan, 16.10.2026: „die Kartenansichten brauchen einen Fullscreen-Button
// als Icon im Eck"). Haengt an `basiskarten`, damit keine Karte ihn vergisst.
//
// Erst die Fullscreen-API des Browsers. iPhone-Safari kennt sie fuer normale Elemente nicht —
// dort (und wenn der Browser ablehnt) legt sich die Karte per CSS ueber den ganzen Bildschirm
// (`.karte-vollbild` in index.css); zurueck mit demselben Knopf oder Esc. Danach immer
// `invalidateSize`, sonst bleiben Kacheln grau, weil Leaflet die alte Groesse kennt.
const AUF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ZU = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

function vollbildKnopf(map: L.Map, name: string) {
  const Knopf = L.Control.extend({
    options: { position: "topleft" as L.ControlPosition },
    onAdd() {
      const box = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const a = L.DomUtil.create("a", "", box) as HTMLAnchorElement;
      a.href = "#";
      a.setAttribute("role", "button");
      a.title = name;
      a.setAttribute("aria-label", name);
      a.style.cssText = "display:flex;align-items:center;justify-content:center;width:30px;height:30px;";
      const el = map.getContainer();
      let ersatz = false;
      const istVoll = () => document.fullscreenElement === el || ersatz;
      const zeigen = () => {
        a.innerHTML = istVoll() ? ZU : AUF;
        a.setAttribute("aria-pressed", String(istVoll()));
        window.setTimeout(() => map.invalidateSize(), 60);
      };
      const ersatzAus = () => {
        ersatz = false;
        el.classList.remove("karte-vollbild");
        document.removeEventListener("keydown", esc);
        zeigen();
      };
      const esc = (e: KeyboardEvent) => { if (e.key === "Escape") ersatzAus(); };
      const ersatzAn = () => {
        ersatz = true;
        el.classList.add("karte-vollbild");
        document.addEventListener("keydown", esc);
        zeigen();
      };
      L.DomEvent.on(a, "click", (e: Event) => {
        L.DomEvent.stop(e);
        if (istVoll()) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else ersatzAus();
        } else if (el.requestFullscreen) {
          el.requestFullscreen().catch(ersatzAn);
        } else {
          ersatzAn();
        }
      });
      document.addEventListener("fullscreenchange", zeigen);
      map.on("unload", () => {
        document.removeEventListener("fullscreenchange", zeigen);
        document.removeEventListener("keydown", esc);
      });
      L.DomEvent.disableClickPropagation(box);
      zeigen();
      return box;
    },
  });
  map.addControl(new Knopf());
}


// Schutzgebiete IMMER auf jeder Karte (Jan, 16.10.2026, nicht ausblendbar): Naturschutzgebiete,
// FFH/Natura 2000 und — wo in OSM eingetragen — Bade-/Fahrverbote an Wasserflaechen. Vogelschutz-
// und Landschaftsschutzgebiete nicht. Daten vom eigenen Server (GET /api/community/schutzgebiete,
// dort aus OSM/Overpass geholt und 30 Tage zwischengespeichert) — kein weiterer fremder Dienst im
// Browser. Erst ab SCHUTZ_AB_ZOOM, darunter waere der Ausschnitt zu gross. Beim Antippen Name und
// Art plus der Hinweis, dass das keine Rechtsauskunft ist.
const SCHUTZ_AB_ZOOM = 11;
const SCHUTZ_STIL: Record<string, L.PathOptions> = {
  nsg: { color: "#dc2626", weight: 2, fillColor: "#dc2626", fillOpacity: 0.1 },
  ffh: { color: "#f59e0b", weight: 1.5, dashArray: "6 4", fillColor: "#f59e0b", fillOpacity: 0.05 },
  verbot: { color: "#b91c1c", weight: 3, fillColor: "#b91c1c", fillOpacity: 0.25 },
};

type Schutzflaeche = { id: string; art: "nsg" | "ffh" | "verbot"; name: string; titel: string;
                       aussen: [number, number][][]; innen: [number, number][][] };

function esc(x: string) {
  return x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function schutzgebiete(map: L.Map, texte: NonNullable<KartenTexte["schutz"]>) {
  map.createPane("schutz");
  const pane = map.getPane("schutz");
  if (pane) pane.style.zIndex = "330";             // ueber den Kacheln, unter Heatmap und Routen
  const grp = L.layerGroup().addTo(map);
  const da = new Set<string>();
  let timer: number | undefined, nochmal: number | undefined, versuche = 0, weg = false;
  const laden = () => {
    if (weg) return;
    if (map.getZoom() < SCHUTZ_AB_ZOOM) return;
    const b = map.getBounds();
    api.schutzgebiete(b.getWest(), b.getSouth(), b.getEast(), b.getNorth())
      .then((r) => {
        if (weg) return;
        for (const f of r.flaechen as Schutzflaeche[]) {
          if (da.has(f.id)) continue;
          da.add(f.id);
          const art = f.art === "verbot" ? texte.verbot : f.art === "ffh" ? texte.ffh : texte.nsg;
          L.polygon([...f.aussen, ...f.innen], { ...SCHUTZ_STIL[f.art], pane: "schutz" })
            .bindPopup(`<b>${esc(f.name || art)}</b><br>${esc(art)}${f.titel && f.titel !== art ? ` · ${esc(f.titel)}` : ""}` +
              `<br><span style="font-size:11px;opacity:.75">${esc(texte.hinweis)}</span>`)
            .addTo(grp);
        }
        // Server hat nicht alles holen koennen (Overpass langsam/ueberlastet): spaeter nachfragen
        window.clearTimeout(nochmal);
        if (r.unvollstaendig && versuche < 6) { versuche++; nochmal = window.setTimeout(laden, 6000); }
      })
      .catch(() => {});
  };
  const spaeter = () => { window.clearTimeout(timer); versuche = 0; timer = window.setTimeout(laden, 400); };
  map.whenReady(laden);
  map.on("moveend", spaeter);
  map.on("unload", () => { weg = true; window.clearTimeout(timer); window.clearTimeout(nochmal); });
}
