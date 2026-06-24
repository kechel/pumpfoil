import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { api } from "../lib/api";
import { Spinner, Card } from "../components/ui";
import { SpotsIcon } from "../components/Icons";
import { useT } from "../i18n";

type Spot = { spot: string; lat: number; lon: number; sessions: number };

// Kartenansicht aller Spot-Locations. Marker -> Sessions an dem Spot.
export default function Spots() {
  const t = useT();
  const nav = useNavigate();
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  useEffect(() => { api.spotMap().then(setSpots).catch(() => setSpots([])); }, []);

  useEffect(() => {
    if (!spots || !mapRef.current || mapObj.current) return;
    const m = L.map(mapRef.current, { attributionControl: false });
    mapObj.current = m;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
    const pts: [number, number][] = [];
    for (const s of spots) {
      const mk = L.circleMarker([s.lat, s.lon], {
        radius: 9, color: "#0f172a", weight: 1.5, fillColor: "#22d3ee", fillOpacity: 0.95,
      }).addTo(m);
      mk.bindTooltip(`${s.spot} · ${s.sessions}`, { direction: "top" });
      mk.on("click", () => nav(`/alle-sessions?spot=${encodeURIComponent(s.spot)}`));
      pts.push([s.lat, s.lon]);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
    else m.setView([47.5, 9.5], 6);
    setTimeout(() => m.invalidateSize(), 100);
  }, [spots, nav]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <SpotsIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">{t("nav.spots")}</h2>
      </div>
      {!spots ? (
        <Spinner />
      ) : spots.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("spots.none")}</Card>
      ) : (
        <div ref={mapRef} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-800" />
      )}
    </div>
  );
}
