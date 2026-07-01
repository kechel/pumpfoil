import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { api } from "../lib/api";
import { speedColor } from "../lib/trackColors";
import { useT } from "../i18n";
import { Card, Spinner } from "./ui";
import { PlayIcon } from "./Icons";

type Track = { session_id: number; started_at: string | null; foiling_km: number; track: [number, number, number | null][] };

// Verlaufs-Animation: alle eigenen Sessions eines Spots chronologisch durchschalten, auf
// FIXEM Kartenausschnitt (Union aller Spuren). Farbe = Speed (3s), keine Optionen/Pump-Marker.
export function SpotProgression() {
  const t = useT();
  const [spots, setSpots] = useState<{ spot: string; count: number }[]>([]);
  const [spot, setSpot] = useState("");
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mul, setMul] = useState(1);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const curRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => { api.mySpots().then((s) => { setSpots(s); if (s[0]) setSpot(s[0].spot); }).catch(() => setSpots([])); }, []);
  useEffect(() => {
    if (!spot) return;
    setTracks(null); setIdx(0); setPlaying(false);
    api.spotTracks(spot).then(setTracks).catch(() => setTracks([]));
  }, [spot]);

  // Speed-Skala (km/h) aus den Daten: 5.–95. Perzentil für guten Kontrast.
  const [lo, hi] = useMemo<[number, number]>(() => {
    const sp: number[] = [];
    tracks?.forEach((tr) => tr.track.forEach((p) => { if (p[2] != null) sp.push(p[2] * 3.6); }));
    if (sp.length < 10) return [8, 25];
    sp.sort((a, b) => a - b);
    const q = (f: number) => sp[Math.min(sp.length - 1, Math.floor(f * sp.length))];
    const a = Math.max(0, Math.round(q(0.05))), b = Math.round(q(0.95));
    return [a, Math.max(b, a + 5)];
  }, [tracks]);

  // Karte + fixer Ausschnitt (Union aller Spuren) — nur bei Spot-/Track-Wechsel.
  useEffect(() => {
    if (!mapRef.current || !tracks || !tracks.length) return;
    if (!mapObj.current) {
      mapObj.current = L.map(mapRef.current, { zoomControl: false, maxZoom: 22, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(mapObj.current);
    }
    const map = mapObj.current;
    map.eachLayer((l) => { if (l instanceof L.LayerGroup || l instanceof L.Polyline) map.removeLayer(l); });
    const all: [number, number][] = [];
    const ghost = L.layerGroup().addTo(map);
    tracks.forEach((tr) => {
      const pts = tr.track.map((p) => [p[0], p[1]] as [number, number]);
      all.push(...pts);
      L.polyline(pts, { color: "#334155", weight: 1.5, opacity: 0.35 }).addTo(ghost);
    });
    curRef.current = L.layerGroup().addTo(map);
    if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [20, 20] });
    setTimeout(() => map.invalidateSize(), 50);
  }, [tracks]);

  // Aktuelle Session farbig zeichnen (Speed) — bei Index-Wechsel, Ausschnitt bleibt fix.
  useEffect(() => {
    const map = mapObj.current, lg = curRef.current, tr = tracks?.[idx];
    if (!map || !lg || !tr) return;
    lg.clearLayers();
    for (let i = 0; i < tr.track.length - 1; i++) {
      const a = tr.track[i], b = tr.track[i + 1];
      const color = b[2] == null ? "#64748b" : speedColor(b[2] * 3.6, lo, hi);
      L.polyline([[a[0], a[1]], [b[0], b[1]]], { color, weight: 4, opacity: 0.95 }).addTo(lg);
    }
  }, [idx, tracks, lo, hi]);

  // Autoplay: eine Session pro Tick.
  useEffect(() => {
    if (!playing || !tracks || !tracks.length) return;
    const iv = setInterval(() => setIdx((p) => {
      if (p >= tracks.length - 1) { setPlaying(false); return p; }
      return p + 1;
    }), 1100 / mul);
    return () => clearInterval(iv);
  }, [playing, tracks, mul]);

  const cur = tracks?.[idx];
  const dateStr = cur?.started_at ? new Date(cur.started_at).toLocaleDateString() : "";

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("hist.spotAnim")}</h3>
        <select value={spot} onChange={(e) => setSpot(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100">
          {spots.length === 0 && <option value="">–</option>}
          {spots.map((s) => <option key={s.spot} value={s.spot}>{s.spot} ({s.count})</option>)}
        </select>
      </div>

      {!spot ? (
        <p className="text-sm text-slate-400">{t("hist.spotAnimHint")}</p>
      ) : !tracks ? <Spinner /> : tracks.length === 0 ? (
        <p className="text-sm text-slate-400">{t("sessions.none")}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div ref={mapRef} style={{ width: "100%", height: "50vh", minHeight: 300 }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => { if (idx >= tracks.length - 1) setIdx(0); setPlaying((v) => !v); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400">
              {playing
                ? <><span className="inline-block h-3 w-3" style={{ borderLeft: "3px solid currentColor", borderRight: "3px solid currentColor" }} /> {t("sd.pause")}</>
                : <><PlayIcon className="h-4 w-4" /> {t("sd.play")}</>}
            </button>
            {[1, 2, 4].map((m) => (
              <button key={m} onClick={() => setMul(m)}
                className={`rounded-lg px-2 py-1 text-xs ${mul === m ? "bg-brand-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-200"}`}>{m}×</button>
            ))}
            <input type="range" min={0} max={tracks.length - 1} value={idx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
              className="min-w-[120px] flex-1 accent-brand-500" />
            <span className="w-40 shrink-0 text-right text-xs tabular-nums text-slate-300">
              {dateStr} · {cur?.foiling_km.toFixed(1)} km · {idx + 1}/{tracks.length}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
