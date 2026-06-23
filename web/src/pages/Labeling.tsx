import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import L from "leaflet";
import { api, LabelItem, RawData } from "../lib/api";
import { Card, Button, Spinner, ErrorBox } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import { TimeChart, LABEL_COLORS } from "../components/TimeChart";
import { useT } from "../i18n";

const LABELS = [
  { key: "pump", nameKey: "lab.pump" },
  { key: "glide", nameKey: "lab.glide" },
  { key: "not_foiling", nameKey: "lab.notFoiling" },
];

const STEP_MS = 500;  // Feinkorrektur der Markierung in 0,5-s-Schritten

export default function Labeling() {
  const t = useT();
  const { id } = useParams();
  const sid = Number(id);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [editLabelId, setEditLabelId] = useState<number | null>(null);  // gerade bearbeitetes Label
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.raw(sid), api.labels(sid)])
      .then(([r, l]) => { setRaw(r); setLabels(l); })
      .catch((e) => setError(String(e)));
  }, [sid]);

  const domain = useMemo<[number, number]>(() => {
    if (!raw) return [0, 1];
    const last = (a: number[]) => (a.length ? a[a.length - 1] : 0);
    return [0, Math.max(last(raw.gps_t_ms), last(raw.accel_t_ms), 1)];
  }, [raw]);

  // Markierungsgrenze (0 = Start, 1 = Ende) in 0,5-s-Schritten verschieben.
  const nudge = (idx: 0 | 1, d: number) => {
    setSelection((sel) => {
      if (!sel) return sel;
      const next: [number, number] = [sel[0], sel[1]];
      next[idx] = Math.max(domain[0], Math.min(domain[1], next[idx] + d));
      if (next[1] - next[0] < 200) return sel;  // min. 0,2 s
      return next;
    });
  };

  async function applyLabel(label: string) {
    if (!selection) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.addLabel(sid, Math.round(selection[0]), Math.round(selection[1]), label);
      if (editLabelId != null) await api.deleteLabel(sid, editLabelId);  // bearbeitetes Label ersetzen
      setLabels((ls) => [...ls.filter((l) => l.id !== editLabelId), created]);
      setSelection(null);
      setEditLabelId(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Gespeichertes Label anklicken -> als bearbeitbare Markierung laden.
  const editLabel = (l: LabelItem) => {
    setSelection([l.t_start_ms, l.t_end_ms]);
    setEditLabelId(l.id);
  };

  async function remove(labelId: number) {
    await api.deleteLabel(sid, labelId);
    setLabels((ls) => ls.filter((l) => l.id !== labelId));
  }

  if (error) return <ErrorBox message={error} />;
  if (!raw) return <Spinner />;

  const nb = (onClick: () => void, label: string) => (
    <button onClick={onClick} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">{label}</button>
  );

  return (
    <div>
      <Link to={`/sessions/${sid}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("row.session")}
      </Link>
      <h2 className="mb-1 text-xl font-bold">{t("lab.title")}</h2>
      <p className="mb-5 text-sm text-slate-300">{t("lab.intro")}</p>

      <LabelMap raw={raw} selection={selection} />

      <Card className="space-y-4 p-4">
        <TimeChart
          title={t("lab.chartSpeed")}
          t={raw.gps_t_ms}
          values={raw.gps_speed_mps}
          color="#38bdf8"
          domainMs={domain}
          spans={labels}
          selection={selection}
          onSelect={setSelection}
        />
        <TimeChart
          title={t("lab.chartAccel")}
          t={raw.accel_t_ms}
          values={raw.accel_band_g}
          color="#f472b6"
          domainMs={domain}
          spans={labels}
          selection={selection}
          onSelect={setSelection}
        />
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {selection ? (
          <span className="text-sm text-slate-200">
            {t("lab.selection", { start: (selection[0] / 1000).toFixed(1), end: (selection[1] / 1000).toFixed(1) })}
          </span>
        ) : (
          <span className="text-sm text-slate-400">{t("lab.noSelection")}</span>
        )}
        {LABELS.map((l) => (
          <Button
            key={l.key}
            onClick={() => applyLabel(l.key)}
            variant={selection ? "primary" : "ghost"}
            className="text-sm"
          >
            <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: LABEL_COLORS[l.key] }} />
            {t(l.nameKey)}
          </Button>
        ))}
        {selection && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">Start</span>
            {nb(() => nudge(0, -STEP_MS), "−")}
            {nb(() => nudge(0, STEP_MS), "+")}
            <span className="ml-2 text-xs text-slate-400">Ende</span>
            {nb(() => nudge(1, -STEP_MS), "−")}
            {nb(() => nudge(1, STEP_MS), "+")}
          </div>
        )}
      </div>

      <h3 className="mb-2 mt-7 text-sm font-semibold text-slate-200">
        {t("lab.labelsTitle", { count: labels.length })}
      </h3>
      <div className="space-y-2">
        {labels.length === 0 && <p className="text-sm text-slate-400">{t("lab.noLabels")}</p>}
        {labels
          .slice()
          .sort((a, b) => a.t_start_ms - b.t_start_ms)
          .map((l) => (
            <Card key={l.id} onClick={() => editLabel(l)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-slate-800/60 ${editLabelId === l.id ? "border-brand-500" : ""}`}>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LABEL_COLORS[l.label] }} />
                {(() => { const f = LABELS.find((x) => x.key === l.label); return f ? t(f.nameKey) : l.label; })()}
                <span className="text-slate-400">
                  {(l.t_start_ms / 1000).toFixed(0)}–{(l.t_end_ms / 1000).toFixed(0)} s
                </span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="text-slate-400 hover:text-red-400" disabled={busy}>
                {t("common.deleteLower")}
              </button>
            </Card>
          ))}
      </div>
    </div>
  );
}

// Karte des Tracks; nur der aktuell markierte Zeitbereich wird farbig hervorgehoben.
function LabelMap({ raw, selection }: { raw: RawData; selection: [number, number] | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  // Track-Punkte (lat,lon,t) mit gültigen Koordinaten.
  const pts = useMemo(() => {
    const out: { lat: number; lon: number; t: number }[] = [];
    for (let i = 0; i < raw.gps_t_ms.length; i++) {
      const la = raw.gps_lat[i], lo = raw.gps_lon[i];
      if (la != null && lo != null) out.push({ lat: la, lon: lo, t: raw.gps_t_ms[i] });
    }
    return out;
  }, [raw]);

  useEffect(() => {
    if (!mapRef.current || pts.length < 2 || mapObj.current) return;
    mapObj.current = L.map(mapRef.current, { zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 22, maxNativeZoom: 19 }).addTo(mapObj.current);
    layer.current = L.layerGroup().addTo(mapObj.current);
    mapObj.current.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon] as [number, number])), { padding: [20, 20] });
    setTimeout(() => mapObj.current?.invalidateSize(), 100);
  }, [pts]);

  useEffect(() => {
    const lg = layer.current, map = mapObj.current;
    if (!lg || !map) return;
    lg.clearLayers();
    const [a, b] = selection ?? [Infinity, -Infinity];
    for (let i = 0; i < pts.length - 1; i++) {
      const inSel = selection != null && pts[i].t >= a && pts[i].t <= b;
      L.polyline([[pts[i].lat, pts[i].lon], [pts[i + 1].lat, pts[i + 1].lon]], {
        color: inSel ? "#22d3ee" : "#475569",
        weight: inSel ? 5 : 3,
        opacity: inSel ? 1 : 0.6,
      }).addTo(lg);
    }
  }, [pts, selection]);

  if (pts.length < 2) return null;
  return <div ref={mapRef} className="mb-4 h-64 w-full overflow-hidden rounded-2xl border border-slate-800" />;
}
