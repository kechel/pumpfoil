import L from "leaflet";

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
export function basiskarten(
  map: L.Map,
  namen: { street: string; satellite: string },
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
  return { strasse, satellit };
}
