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
  (gewaehlteKarte() === "satellit" ? satellit : strasse).addTo(map);
  L.control.layers({ [namen.street]: strasse, [namen.satellite]: satellit }, undefined,
    { position: "topright" }).addTo(map);
  // Wahl merken — über die Ebene selbst, nicht über den angezeigten Namen: der ist übersetzt
  // und würde beim Sprachwechsel nicht mehr passen.
  map.on("baselayerchange", (e: L.LayersControlEvent) => {
    try { localStorage.setItem(SPEICHER, e.layer === satellit ? "satellit" : "karte"); }
    catch { /* privater Modus: dann gilt die Wahl eben nur für diese Sitzung */ }
  });
  return { strasse, satellit };
}
