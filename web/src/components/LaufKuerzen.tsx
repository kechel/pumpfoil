import { useMemo, useState } from "react";
import { api, SessionSummary } from "../lib/api";
import { CloseIcon } from "./Icons";
import { useT } from "../i18n";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// „Anfang/Ende kürzen" für EINEN Lauf (Wunsch u836, Jan 23.10.2026: „erstmal nur kuerzen, eigenes popup und
// nur web erstmal"). Seltener Fall, deshalb im „⋯"-Menü der Lauf-Tabelle versteckt.
// Kein neues Datenmodell: der abgeschnittene Rand wird ein aussortierter Bereich (`excluded_ranges`,
// POST …/runs/exclude mit start_ms/end_ms, Session-ms) — er steht danach im bekannten Hinweis-Kasten und
// lässt sich dort wieder aufnehmen. VERLÄNGERN geht bewusst nicht: dafür müsste die Auswertung feste
// Laufgrenzen übernehmen (Analyse-Pipeline, eigenes OK).

const RAND_MS = 30_000;   // Kontext vor/nach dem Lauf im Diagramm (nur zum Ansehen)

export function LaufKuerzen({ sessionId, nr, vonMs, bisMs, zeiten, speeds, hr, onClose, onSaved }: {
  sessionId: number;
  nr: number;                       // Laufnummer für den Titel (1-basiert)
  vonMs: number; bisMs: number;     // erkannte Grenzen in SESSION-ms (t_*_ms + trim_start_ms)
  zeiten: number[];                 // Session-ms je Track-Punkt (GET …/track-times)
  speeds: number[];                 // m/s je Track-Punkt
  hr: (number | null)[];            // bpm je Track-Punkt
  onClose: () => void;
  onSaved: (s: SessionSummary) => void;
}) {
  const t = useT();
  useCloseOnBack(true, onClose);
  const [start, setStart] = useState(vonMs);
  const [ende, setEnde] = useState(bisMs);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState(false);
  const schritt = 1000;
  const geaendert = start > vonMs || ende < bisMs;

  // Punkte im Ausschnitt [Lauf − 30 s, Lauf + 30 s]
  const pts = useMemo(() => {
    const a = vonMs - RAND_MS, b = bisMs + RAND_MS, out: { t: number; v: number | null; h: number | null }[] = [];
    for (let i = 0; i < zeiten.length; i++) {
      const z = zeiten[i];
      if (z < a || z > b) continue;
      const v = speeds[i], h = hr[i];
      out.push({ t: z, v: v != null && Number.isFinite(v) ? v * 3.6 : null, h: h != null && h > 0 ? h : null });
    }
    return out;
  }, [vonMs, bisMs, zeiten, speeds, hr]);
  const t0 = vonMs - RAND_MS, t1 = bisMs + RAND_MS;
  const W = 600, H = 90;
  const x = (z: number) => ((z - t0) / (t1 - t0)) * W;
  const vMax = Math.max(5, ...pts.map((p) => p.v ?? 0));
  const hVals = pts.map((p) => p.h).filter((h): h is number => h != null);
  const hMin = hVals.length ? Math.min(...hVals) - 5 : 0, hMax = hVals.length ? Math.max(...hVals) + 5 : 1;
  // Linie mit Luecken: fehlende Werte unterbrechen sie (keine Null zeichnen, wo nichts gemessen ist).
  const linie = (wert: (p: typeof pts[number]) => number | null, y: (v: number) => number) => {
    let d = "", offen = false, letzt = -Infinity;
    for (const p of pts) {
      const v = wert(p);
      if (v == null || p.t - letzt > 5000) offen = false;
      if (v != null) { d += `${offen ? "L" : "M"}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`; offen = true; }
      letzt = p.t;
    }
    return d;
  };
  const yV = (v: number) => H - (v / vMax) * (H - 6) - 3;
  const yH = (h: number) => H - ((h - hMin) / (hMax - hMin)) * (H - 6) - 3;
  const mmss = (ms: number) => {
    const s = Math.round((ms - vonMs) / 1000);
    return `${s < 0 ? "−" : s > 0 ? "+" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
  };

  async function uebernehmen() {
    setBusy(true); setFehler(false);
    try {
      let s: SessionSummary | null = null;
      if (start > vonMs) s = await api.excludeRange(sessionId, vonMs, start);
      if (ende < bisMs) s = await api.excludeRange(sessionId, ende, bisMs);
      if (s) onSaved(s);
      onClose();
    } catch {
      setFehler(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">{t("sd.trimRunTitle", { n: nr })}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-300">{t("sd.trimRunHint")}</p>

        <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full rounded-lg bg-slate-950/60" preserveAspectRatio="none">
          {/* abgeschnittene Teile grau hinterlegt, Lauf-Grenzen gestrichelt */}
          <rect x={0} y={0} width={x(start)} height={H} className="fill-slate-700/50" />
          <rect x={x(ende)} y={0} width={W - x(ende)} height={H} className="fill-slate-700/50" />
          <line x1={x(vonMs)} x2={x(vonMs)} y1={0} y2={H} className="stroke-slate-500" strokeDasharray="3 3" />
          <line x1={x(bisMs)} x2={x(bisMs)} y1={0} y2={H} className="stroke-slate-500" strokeDasharray="3 3" />
          {hVals.length > 0 && <path d={linie((p) => p.h, yH)} fill="none" stroke="#f43f5e" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
          <path d={linie((p) => p.v, yV)} fill="none" stroke="#22d3ee" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <line x1={x(start)} x2={x(start)} y1={0} y2={H} stroke="#f59e0b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <line x1={x(ende)} x2={x(ende)} y1={0} y2={H} stroke="#f59e0b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
          <span><span className="text-brand-400">━</span> km/h (max {vMax.toFixed(0)})</span>
          {hVals.length > 0 ? <span><span className="text-rose-700 dark:text-rose-400">━</span> bpm</span> : <span>{t("sd.trimRunNoHr")}</span>}
          <span>{t("sd.trimRunContext")}</span>
        </div>

        <label className="mt-3 block text-sm text-slate-200">
          {t("sd.trimRunStart")}: <span className="tabular-nums">{mmss(start)}</span>
          <input type="range" className="w-full" min={vonMs} max={bisMs} step={schritt} value={start}
            onChange={(e) => setStart(Math.min(Number(e.target.value), ende - 5000))} />
        </label>
        <label className="mt-2 block text-sm text-slate-200">
          {t("sd.trimRunEnd")}: <span className="tabular-nums">{mmss(ende)}</span>
          <input type="range" className="w-full" min={vonMs} max={bisMs} step={schritt} value={ende}
            onChange={(e) => setEnde(Math.max(Number(e.target.value), start + 5000))} />
        </label>
        <div className="mt-1 flex gap-2 text-xs">
          {[-1, 1].map((d) => (
            <button key={`s${d}`} type="button" className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
              onClick={() => setStart((v) => Math.min(Math.max(vonMs, v + d * schritt), ende - 5000))}>
              {t("sd.trimRunStart")} {d < 0 ? "−1 s" : "+1 s"}
            </button>
          ))}
          {[-1, 1].map((d) => (
            <button key={`e${d}`} type="button" className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
              onClick={() => setEnde((v) => Math.max(Math.min(bisMs, v + d * schritt), start + 5000))}>
              {t("sd.trimRunEnd")} {d < 0 ? "−1 s" : "+1 s"}
            </button>
          ))}
        </div>

        {fehler && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{t("sd.excludeFail")}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={!geaendert || busy} onClick={() => { setStart(vonMs); setEnde(bisMs); }}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40">{t("sd.trimRunReset")}</button>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">{t("rate.cancel")}</button>
          <button type="button" disabled={!geaendert || busy} onClick={uebernehmen}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40">{t("sd.trimRunApply")}</button>
        </div>
      </div>
    </div>
  );
}
