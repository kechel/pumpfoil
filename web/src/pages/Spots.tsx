import { useEffect, useMemo, useRef, useState } from "react";
import { passtZu, suchform } from "../lib/suche";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { basiskarten, kartenTexte } from "../lib/mapTiles";
import { heatZeichnen } from "../lib/heatmap";
import { api, type AktiverFreund } from "../lib/api";
import { Spinner, Card } from "../components/ui";
import { SpotsIcon } from "../components/Icons";
import { SpotCompare } from "../components/SpotCompare";
import { useT } from "../i18n";

// Gruen fuer „gerade aktiv" — Tailwind green-400, hebt sich vom Marken-Cyan ab.
const GRUEN = "#4ade80";

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
  // Gruene Spots „gerade aktiv" (Jan, 14.10.2026). `einzeln` = Spot darf selbst gruen werden
  // (>= 4 Fahrer in 180 Tagen), `gegend` = kleiner Spot in einer aktiven Kachel: faerbt nur ein
  // BUENDEL, nie den Spot selbst — Regeln und Gruende in server `devices.aktive_spots`.
  // Freunde (15.10.2026): ihr Spot wird einzeln gruen — auch ein kleiner, s. server app/freunde.py.
  const [aktiv, setAktiv] = useState<{ einzeln: Set<number>; gegend: Set<number>; freunde: AktiverFreund[] }>({ einzeln: new Set(), gegend: new Set(), freunde: [] });
  const [nurAktiv, setNurAktiv] = useState(false);
  useEffect(() => {
    let weg = false;
    const holen = () => api.spotActive()
      .then((r) => {
        if (weg) return;
        const freunde = r.friends ?? [];
        setAktiv({ einzeln: new Set([...r.spots, ...freunde.map((f) => f.spot_id as number)]), gegend: new Set(r.area), freunde });
      })
      .catch(() => {});
    holen();
    const iv = window.setInterval(holen, 120_000);
    return () => { weg = true; window.clearInterval(iv); };
  }, []);
  // Heatmap (Jan, 15.10.2026): wo auf dem Wasser gefahren wird — Zahl der Sessions je Zelle, nur
  // die Laeufe, fuer alle gleich und einmal taeglich vorgerechnet (server app/heatmap.py).
  // Oben ein Schalter „Spots | Heatmap" (Jan, 15.10.2026): bei Spots die Haken „gerade aktiv" /
  // „mit Beschreibung", bei Heatmap die Zeitraeume. In der Heatmap-Ansicht sind die Pins weg.
  const [ansicht, setAnsicht] = useState<"spots" | "heat">("spots");
  const [heatZeitraum, setHeatZeitraum] = useState<"30d" | "365d">("365d");
  // „Auf dem Foil" (die Laeufe) oder „Startpunkte" (wo die Laeufe beginnen) — Jan, 16.10.2026.
  const [heatArt, setHeatArt] = useState<"foil" | "start">("foil");
  const heat = ansicht === "heat" ? heatZeitraum : null;
  const [heatStand, setHeatStand] = useState<{ stand: string | null; sessions: number } | null>(null);
  const heatLayer = useRef<L.LayerGroup | null>(null);
  // Sportart (Nutzerwunsch 27.09.2026: „where others are wake-thiefing"). Default „all" wie
  // bisher; „Alle Sportarten" bleibt immer waehlbar (Jan).
  const [sport, setSport] = useState("all");
  const [sports, setSports] = useState<{ sport: string; runs: number }[]>([]);
  useEffect(() => { api.communitySports().then(setSports).catch(() => {}); }, []);
  // „Gerade aktiv" zeigt die einzeln gruenen Spots UND die kleinen aus aktiven Kacheln — sonst
  // waere ein gruenes Buendel nach dem Filtern verschwunden. Die kleinen bleiben dabei blau.
  const istAktiv = (s: Spot) => s.spot_id != null && (aktiv.einzeln.has(s.spot_id) || aktiv.gegend.has(s.spot_id));
  const spots = useMemo(
    () => (alle == null ? null : alle.filter((s) => (!nurNotes || (s.notes ?? 0) > 0) && (!nurAktiv || istAktiv(s)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alle, nurNotes, nurAktiv, aktiv]);
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
  // Die Sportart geht an den Server: die Zahl je Spot zaehlt dann nur diese Sportart, und der
  // Klick fuehrt in die Sessions-Liste mit DEMSELBEN Filter — Etikett und Klickziel meinen so
  // dieselbe Menge (s. `spot_map`).
  useEffect(() => { api.spotMap(false, sport).then(setAlle).catch(() => setAlle([])); }, [sport]);

  // Spot suchen -> zentrieren + ~50 km Radius (Quadrat 100 km) als Zoom.
  function focusSpot(name: string) {
    const n = name.trim().toLowerCase();
    if (!n || !spots || !mapObj.current) return;
    const s = spots.find((x) => suchform(x.spot) === suchform(n)) || spots.find((x) => passtZu(x.spot, n));
    if (s) mapObj.current.fitBounds(L.latLng(s.lat, s.lon).toBounds(100000));
  }

  useEffect(() => {
    if (!spots || !mapRef.current) return;
    // Karte einmalig erstellen.
    if (!mapObj.current) {
      const m = L.map(mapRef.current, { attributionControl: false });
      mapObj.current = m;
      basiskarten(m, kartenTexte(t), { maxZoom: 19, legende: true });
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
          const gruen = s.spot_id != null && aktiv.einzeln.has(s.spot_id);
          const mk = L.circleMarker([s.lat, s.lon], {
            radius: 9, color: "#0f172a", weight: 1.5, fillColor: gruen ? GRUEN : "#22d3ee", fillOpacity: 0.95,
          });
          // Gewaesser mit in den Tooltip: Spots am selben Ort heissen „Berlin 3"/„Berlin 4" und sind
          // sonst nicht auseinanderzuhalten (Jan, 24.08.).
          const hier = aktiv.freunde.filter((f) => f.spot_id === s.spot_id).map((f) => f.name ?? "—");
          mk.bindTooltip(`${esc(s.spot)} · ${s.sessions}` + (s.water ? `<br><span style="opacity:.7">${esc(s.water)}</span>` : "")
                         + (hier.length ? `<br><b>${esc(t("friends.hereNow", { names: hier.join(", ") }))}</b>` : ""), { direction: "top" });
          mk.on("click", () => nav(`/sessions?spot=${s.spot_id ?? encodeURIComponent(s.spot)}`
                                   + (sport !== "all" ? `&sport=${encodeURIComponent(sport)}` : "")));
          grp.addLayer(mk);
          continue;
        }
        // Buendel: Kreis mit der Anzahl darin, Tooltip nennt die Spots. Klick zoomt hinein,
        // damit der Nutzer selbst waehlt, statt dass die Zeichenreihenfolge fuer ihn waehlt.
        const teil = gruppe.map((k) => spots[k]);
        const summe = teil.reduce((n, s) => n + s.sessions, 0);
        const gruen = teil.some((s) => istAktiv(s));
        const mitte = L.latLngBounds(teil.map((s) => [s.lat, s.lon] as [number, number]));
        const bk = L.marker(mitte.getCenter(), {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;`
              + `border-radius:9999px;background:${gruen ? GRUEN : "#22d3ee"};color:#0f172a;border:2px solid #0f172a;`
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, nav, spotsLabel, sport, aktiv]);

  // Heatmap-Zellen fuer den aktuellen Ausschnitt nachladen (bei jeder Bewegung, kurz entprellt).
  // Unter den Spot-Markern (eigene Ebene, zuerst angelegt), damit die Spots klickbar bleiben.
  useEffect(() => {
    const m = mapObj.current;
    if (!m) return;
    if (!heatLayer.current) {
      m.createPane("heat");
      const pane = m.getPane("heat");
      if (pane) { pane.style.zIndex = "350"; pane.style.pointerEvents = "none"; }
      heatLayer.current = L.layerGroup().addTo(m);
    }
    const grp = heatLayer.current;
    // Pins nur in der Spot-Ansicht.
    if (markers.current) { if (heat) markers.current.remove(); else markers.current.addTo(m); }
    if (!heat) { grp.clearLayers(); setHeatStand(null); return; }
    const renderer = L.canvas({ pane: "heat", padding: 0.2 });
    let weg = false;
    let timer: number | undefined;
    const laden = () => {
      const b = m.getBounds();
      // Heatmap folgt dem Sportarten-Filter oben (Jan, 16.10.2026: „all sports" = alle Laeufe)
      api.heatmap(heat, m.getZoom(), b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), heatArt, sport)
        .then((r) => {
          if (weg) return;
          setHeatStand({ stand: r.stand, sessions: r.sessions });
          heatZeichnen(grp, renderer, r);
        })
        .catch(() => {});
    };
    const spaeter = () => { window.clearTimeout(timer); timer = window.setTimeout(laden, 250); };
    laden();
    m.on("moveend", spaeter);
    return () => { weg = true; window.clearTimeout(timer); m.off("moveend", spaeter); };
  // `spots` mit drin: die Karte entsteht erst, wenn die Spots da sind.
  }, [heat, heatArt, sport, spots]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SpotsIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">
          {t("nav.spots")}
          {(spots?.length ?? 0) > 0 && <span className="ml-2 text-lg font-normal text-slate-400">({spots!.length})</span>}
        </h2>
        {/* Filter rechtsbuendig auf Hoehe der Ueberschrift (Jan, 30.08.) — er stand vorher als
            eigene Zeile ueber der Karte und schob sie nach unten. */}
        {(sports.length > 1 || sport !== "all") && (
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className="ml-auto min-w-0 max-w-full truncate rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
            <option value="all">{t("all.allSports")}</option>
            {sports.map((x) => <option key={x.sport} value={x.sport}>{t(`cls.sport.${x.sport}`)}</option>)}
          </select>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-700 text-sm">
            {(["spots", "heat"] as const).map((a) => (
              <button key={a} onClick={() => setAnsicht(a)} aria-pressed={ansicht === a}
                className={`px-3 py-1.5 ${ansicht === a
                  ? "bg-brand-500 font-semibold text-slate-950"
                  : "bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
                {a === "spots" ? t("nav.spots") : t("spots.heatmap")}
              </button>
            ))}
          </div>
          {ansicht === "heat" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(["foil", "start"] as const).map((a) => (
                <button key={a} onClick={() => setHeatArt(a)} aria-pressed={heatArt === a}
                  className={`rounded-full border px-3 py-1 ${heatArt === a
                    ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
                  {t(a === "foil" ? "spots.heatFoil" : "spots.heatStart")}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden />
              {(["30d", "365d"] as const).map((p) => (
                <button key={p} onClick={() => setHeatZeitraum(p)} aria-pressed={heatZeitraum === p}
                  className={`rounded-full border px-3 py-1 ${heatZeitraum === p
                    ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
                  {t(`period.${p}`)}
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Nicht an der GEFILTERTEN Liste festmachen: mit Haken und einer Sportart ohne
                  Beschreibungen waere sie leer, der Haken verschwaende — und mit ihm der Weg zurueck
                  (Jan, 28.09.2026). */}
              {(aktiv.einzeln.size + aktiv.gegend.size > 0 || nurAktiv) && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={nurAktiv} onChange={(e) => setNurAktiv(e.target.checked)}
                    className="h-4 w-4 accent-green-500" />
                  {t("spots.onlyActive")}
                </label>
              )}
              {((alle ?? []).some((s) => (s.notes ?? 0) > 0) || nurNotes) && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={nurNotes} onChange={(e) => setNurNotes(e.target.checked)}
                    className="h-4 w-4 accent-brand-500" />
                  {t("spots.onlyWithNotes")}
                  <span className="text-slate-500">({(alle ?? []).filter((s) => (s.notes ?? 0) > 0).length})</span>
                </label>
              )}
            </>
          )}
        </div>
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
            {/* Die Auswahlliste „Spot waehlen …" daneben ist am 14.10.2026 raus (Jan): sie tat dasselbe
                wie das Suchfeld, und bei 578 Spots blaettert niemand mehr durch. Das Suchfeld zeigt die
                Namen beim Tippen ohnehin als Vorschlaege (datalist). */}
          </div>
          <div ref={mapRef} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-800" />
          {heat ? (
            <p className="mt-2 text-sm text-slate-400">
              {t(heatArt === "start" ? "spots.heatHintStart" : "spots.heatHint")}{heatStand ? ` · ${heatStand.sessions} ${t("side.sessions")}` : ""}
            </p>
          ) : (
            <p className="mt-2 flex gap-2 text-sm text-slate-400">
              <span aria-hidden className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: GRUEN }} />
              <span>{t("spots.activeLegend")}</span>
            </p>
          )}
          <SpotCompare />
        </>
      )}
    </div>
  );
}
