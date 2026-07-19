import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { api } from "../lib/api";
import { Spinner, Card } from "../components/ui";
import { SpotsIcon } from "../components/Icons";
import { SpotCompare } from "../components/SpotCompare";
import { useT } from "../i18n";

type Spot = { spot: string; spot_id: number | null; lat: number; lon: number; sessions: number };

// Kartenansicht aller Spot-Locations. Marker -> Sessions an dem Spot.
export default function Spots() {
  const t = useT();
  const nav = useNavigate();
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [q, setQ] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);

  // Immer ALLE Spots (auch GPS-only mit erkanntem On-Foil) — die Karte ist reine Übersicht.
  useEffect(() => { api.spotMap(false).then(setSpots).catch(() => setSpots([])); }, []);

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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
      markers.current = L.layerGroup().addTo(m);
      setTimeout(() => m.invalidateSize(), 100);
    }
    // Marker bei jedem Datenwechsel (auch Accel/GPS-Umschaltung) neu setzen.
    const m = mapObj.current;
    const grp = markers.current!;
    grp.clearLayers();
    const pts: [number, number][] = [];
    for (const s of spots) {
      const mk = L.circleMarker([s.lat, s.lon], {
        radius: 9, color: "#0f172a", weight: 1.5, fillColor: "#22d3ee", fillOpacity: 0.95,
      });
      mk.bindTooltip(`${s.spot} · ${s.sessions}`, { direction: "top" });
      mk.on("click", () => nav(`/sessions?spot=${s.spot_id ?? encodeURIComponent(s.spot)}`));
      grp.addLayer(mk);
      pts.push([s.lat, s.lon]);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
    else m.setView([47.5, 9.5], 6);
  }, [spots, nav]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <SpotsIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">
          {t("nav.spots")}
          {(spots?.length ?? 0) > 0 && <span className="ml-2 text-lg font-normal text-slate-400">({spots!.length})</span>}
        </h2>
      </div>
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
            {/* Alternativ: Dropdown zum Durchsehen aller Spots (bis es zu viele werden). */}
            <select
              value=""
              onChange={(e) => { if (e.target.value) { setQ(e.target.value); focusSpot(e.target.value); } }}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{t("home.spotPick")}</option>
              {[...spots].sort((a, b) => a.spot.localeCompare(b.spot)).map((s) => (
                <option key={s.spot} value={s.spot}>{s.spot} · {s.sessions}</option>
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
