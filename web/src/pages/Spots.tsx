import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { basiskarten } from "../lib/mapTiles";
import { api } from "../lib/api";
import { Spinner, Card } from "../components/ui";
import { SpotsIcon } from "../components/Icons";
import { SpotCompare } from "../components/SpotCompare";
import { useT } from "../i18n";

type Spot = { spot: string; spot_id: number | null; water?: string | null; lat: number; lon: number; sessions: number; notes?: number };

// Spot-Namen kommen aus dem Geocoder bzw. einer Admin-Umbenennung und landen im Tooltip-HTML —
// deshalb maskieren, statt darauf zu vertrauen, dass nie eine spitze Klammer darin steht.
function esc(x: string) {
  return x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Kartenansicht aller Spot-Locations. Marker -> Sessions an dem Spot.
export default function Spots() {
  const t = useT();
  const nav = useNavigate();
  const spotsLabel = t("nav.spots");   // Wort fuer die Buendel-Beschriftung (uebersetzt)
  const [alle, setAlle] = useState<Spot[] | null>(null);
  const [q, setQ] = useState("");
  // Filter „nur mit Beschreibung" (Wunsch Jan): rein clientseitig — `spot-map` liefert je Spot
  // schon die Anzahl der sichtbaren Beschreibungen mit, ein zweiter Server-Aufruf waere unnoetig.
  const [nurNotes, setNurNotes] = useState(false);
  const spots = useMemo(
    () => (alle == null ? null : (nurNotes ? alle.filter((s) => (s.notes ?? 0) > 0) : alle)),
    [alle, nurNotes]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  // Karte beim Verlassen der Seite ZERSTOEREN. Ohne das bleibt Leaflets Tastatur-Handler als
  // `keydown`-Listener am DOCUMENT haengen: er wird bei Fokus auf dem Kartencontainer registriert
  // und erst beim Blur wieder entfernt — beim Unmount feuert kein Blur mehr. Der tote Listener
  // schluckt dann seine Zoom-/Pan-Tasten auf der GANZEN Seite, auch in Eingabefeldern.
  // Gemeldet 17.08. (PeterH, Firefox): nach einem Klick auf einen Spot in der Karte liessen sich
  // im Chat -, _, +, *, 6, & und die Pfeiltasten nicht mehr tippen, Einfuegen ging weiter, ein
  // Reload half. Das sind exakt Leaflets Vorgaben `zoomIn [187,107,61,171]`,
  // `zoomOut [189,109,54,173]` und die Pfeile — auf deutscher Tastatur ergeben die drei Tasten
  // -, + und 6 mit Shift genau _, * und &. Die 54 (Ziffer 6) hat uns zusaetzlich die
  // Lauf-Auswahl per Zifferntaste lahmgelegt.
  useEffect(() => () => { mapObj.current?.remove(); mapObj.current = null; }, []);
  const markers = useRef<L.LayerGroup | null>(null);
  // Ausschnitt + Zoom fuer DIESE Sitzung merken (Wunsch Jan, 18.08.): wer einen Spot anschaut und
  // zurueckgeht, landete vorher wieder auf der Weltkarte, weil der Marker-Effekt jedes Mal
  // `fitBounds` ueber ALLE Spots gerufen hat.
  // Bewusst sessionStorage und nicht localStorage: der Ausschnitt soll die Sitzung ueberleben, nicht
  // ewig — beim naechsten Besuch ist die Uebersicht ueber alle Spots wieder die richtige Ansicht.
  // (Rein funktional, kein Tracking; siehe Datenschutz-Vorgabe im Repo.)
  const VIEW_KEY = "spotsMapView";
  // Sobald wir EINEN Ausschnitt gesetzt haben (gemerkt oder per fitBounds), nicht mehr
  // hineinregieren: sonst reisst ein spaeteres Neuladen der Spots dem Nutzer die Ansicht weg.
  const viewGesetzt = useRef(false);

  // Immer ALLE Spots (auch GPS-only mit erkanntem On-Foil) — die Karte ist reine Übersicht.
  useEffect(() => { api.spotMap(false).then(setAlle).catch(() => setAlle([])); }, []);

  // Spot suchen -> zentrieren + ~50 km Radius (Quadrat 100 km) als Zoom.
  function focusSpot(name: string) {
    const n = name.trim().toLowerCase();
    if (!n || !spots || !mapObj.current) return;
    const s = spots.find((x) => x.spot.toLowerCase() === n) || spots.find((x) => x.spot.toLowerCase().includes(n));
    if (s) mapObj.current.fitBounds(L.latLng(s.lat, s.lon).toBounds(100000));
  }

  useEffect(() => {
    if (!spots || !mapRef.current) return;
    // Karte einmalig erstellen.
    if (!mapObj.current) {
      const m = L.map(mapRef.current, { attributionControl: false });
      mapObj.current = m;
      basiskarten(m, { street: t("map.street"), satellite: t("map.satellite") }, { maxZoom: 19 });
      markers.current = L.layerGroup().addTo(m);
      setTimeout(() => m.invalidateSize(), 100);
      // Gemerkten Ausschnitt herstellen, bevor der Marker-Block unten `fitBounds` erwaegt.
      try {
        const roh = sessionStorage.getItem(VIEW_KEY);
        const v = roh ? JSON.parse(roh) : null;
        if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Number.isFinite(v.z)) {
          m.setView([v.lat, v.lon], v.z);
          viewGesetzt.current = true;
        }
      } catch {
        // Kaputter/alter Eintrag -> ignorieren und normal auf alle Spots zoomen.
      }
      // Jede Bewegung mitschreiben. `moveend` deckt auch Zoom ab, `zoomend` ist der Guertel dazu.
      const merken = () => {
        try {
          const c = m.getCenter();
          sessionStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lon: c.lng, z: m.getZoom() }));
        } catch {
          // Privater Modus o. ae. -> dann eben nicht merken, die Karte funktioniert trotzdem.
        }
      };
      m.on("moveend", merken);
      m.on("zoomend", merken);
    }
    // Marker bei jedem Datenwechsel (auch Accel/GPS-Umschaltung) neu setzen.
    const m = mapObj.current;
    const grp = markers.current!;

    // Marker BUENDELN, solange sie sich bei diesem Zoom ueberdecken (2026-08-20).
    // Befund aus einer Nutzermeldung („I click a spot and see randomly person"): die Kreise haben 9 px
    // Radius, beim Oeffnen zoomt die Karte per fitBounds auf alle Spots (Europa, Zoom 4-5) — dort
    // ueberdeckten sich 130 von 163 Markern. Geklickt hat Leaflet den zuletzt gezeichneten, und
    // die Reihenfolge kam aus einem GROUP BY ohne ORDER BY: der Klick landete in einem beliebigen
    // Nachbarspot, teils 40 km entfernt. Ein Buendel zeigt stattdessen, DASS dort mehrere Spots
    // liegen, und zoomt beim Klick hinein, statt eine Zufallsauswahl zu treffen.
    const zeichne = () => {
      grp.clearLayers();
      const z = m.getZoom();
      const px = spots.map((s) => m.project([s.lat, s.lon], z));
      // Die dicksten Spots zuerst -> sie werden Buendel-Anker und behalten ihren eigenen Marker,
      // wenn nichts anderes dazukommt. Deterministisch, nicht mehr von der Datenreihenfolge abhaengig.
      const idx = spots.map((_, i) => i).sort((a, b) => spots[b].sessions - spots[a].sessions);
      const belegt = new Set<number>();
      for (const i of idx) {
        if (belegt.has(i)) continue;
        const gruppe = [i];
        belegt.add(i);
        for (const j of idx) {
          if (belegt.has(j)) continue;
          if (px[i].distanceTo(px[j]) < 26) { gruppe.push(j); belegt.add(j); }
        }
        if (gruppe.length === 1) {
          const s = spots[i];
          const mk = L.circleMarker([s.lat, s.lon], {
            radius: 9, color: "#0f172a", weight: 1.5, fillColor: "#22d3ee", fillOpacity: 0.95,
          });
          // Gewaesser mit in den Tooltip: Spots am selben Ort heissen „Berlin 3"/„Berlin 4" und sind
          // sonst nicht auseinanderzuhalten (Jan, 24.08.).
          mk.bindTooltip(`${esc(s.spot)} · ${s.sessions}` + (s.water ? `<br><span style="opacity:.7">${esc(s.water)}</span>` : ""), { direction: "top" });
          mk.on("click", () => nav(`/sessions?spot=${s.spot_id ?? encodeURIComponent(s.spot)}`));
          grp.addLayer(mk);
          continue;
        }
        // Buendel: Kreis mit der Anzahl darin, Tooltip nennt die Spots. Klick zoomt hinein,
        // damit der Nutzer selbst waehlt, statt dass die Zeichenreihenfolge fuer ihn waehlt.
        const teil = gruppe.map((k) => spots[k]);
        const summe = teil.reduce((n, s) => n + s.sessions, 0);
        const mitte = L.latLngBounds(teil.map((s) => [s.lat, s.lon] as [number, number]));
        const bk = L.marker(mitte.getCenter(), {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;`
              + `border-radius:9999px;background:#22d3ee;color:#0f172a;border:2px solid #0f172a;`
              + `font:600 12px/1 ui-sans-serif,system-ui;">${teil.length}</div>`,
            iconSize: [30, 30], iconAnchor: [15, 15],
          }),
        });
        const namen = teil.slice(0, 6).map((s) => `${esc(s.spot)} · ${s.sessions}`).join("<br>");
        bk.bindTooltip(namen + (teil.length > 6 ? `<br>… +${teil.length - 6}` : "")
          + `<br><b>${teil.length} ${esc(spotsLabel)} · ${summe}</b>`, { direction: "top" });
        bk.on("click", () => m.fitBounds(mitte.pad(0.5), { maxZoom: Math.min(z + 5, 16) }));
        grp.addLayer(bk);
      }
    };
    zeichne();
    m.on("zoomend", zeichne);

    // Startausschnitt nur EINMAL bestimmen — und nur, wenn nicht schon ein gemerkter steht.
    if (!viewGesetzt.current) {
      const pts = spots.map((s) => [s.lat, s.lon] as [number, number]);
      if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
      else m.setView([47.5, 9.5], 6);
      viewGesetzt.current = true;
    }
    return () => { m.off("zoomend", zeichne); };
  }, [spots, nav, spotsLabel]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <SpotsIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">
          {t("nav.spots")}
          {(spots?.length ?? 0) > 0 && <span className="ml-2 text-lg font-normal text-slate-400">({spots!.length})</span>}
        </h2>
        {/* Filter rechtsbuendig auf Hoehe der Ueberschrift (Jan, 30.08.) — er stand vorher als
            eigene Zeile ueber der Karte und schob sie nach unten. */}
        {(spots?.length ?? 0) > 0 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={nurNotes} onChange={(e) => setNurNotes(e.target.checked)}
              className="h-4 w-4 accent-brand-500" />
            {t("spots.onlyWithNotes")}
            <span className="text-slate-500">({(alle ?? []).filter((s) => (s.notes ?? 0) > 0).length})</span>
          </label>
        )}
      </div>
      {/* Dritter Nutzer in Folge suchte einen "Spot anlegen"-Knopf — den es bewusst nicht
          gibt. Einmal erklaeren, wie Spots entstehen (und warum ein Name kurz fehlen kann). */}
      <p className="mb-4 text-slate-400">{t("spots.autoHint")}</p>
      {!spots ? (
        <Spinner />
      ) : spots.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("spots.none")}</Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <form onSubmit={(e) => { e.preventDefault(); focusSpot(q); }} className="max-w-sm flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (spots.some((s) => s.spot === v)) focusSpot(v); }}
                list="spot-list"
                placeholder={t("spots.search")}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <datalist id="spot-list">
                {spots.map((s) => <option key={s.spot} value={s.spot} />)}
              </datalist>
            </form>
            {/* Alternativ: Dropdown zum Durchsehen aller Spots (bis es zu viele werden).
                Ein <select> ist so breit wie seine laengste Option — mit 231 Spotnamen sprengte es
                auf schmalen Schirmen die Zeile (Jan, 30.08.). Auf dem Handy deshalb volle Breite
                (durch den Container gedeckelt), ab sm wieder mitwachsend, aber begrenzt. */}
            <select
              value=""
              onChange={(e) => { if (e.target.value) { setQ(e.target.value); focusSpot(e.target.value); } }}
              className="w-full min-w-0 max-w-full truncate rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 sm:w-auto sm:max-w-xs"
            >
              <option value="">{t("home.spotPick")}</option>
              {[...spots].sort((a, b) => a.spot.localeCompare(b.spot)).map((s) => (
                <option key={s.spot} value={s.spot}>
                  {s.spot} · {s.sessions}{s.water && s.water !== s.spot ? ` · ${s.water}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div ref={mapRef} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-800" />
          <SpotCompare />
        </>
      )}
    </div>
  );
}
