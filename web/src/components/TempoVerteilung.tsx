// Tempo-Verteilung (Jan 24.11.2026, docs/TEMPO-VERTEILUNG.md): Anteil der Zeit auf dem Foil je km/h-Stufe. Eine
// Komponente fuer alle Stellen (Home › Stats › Tempo, spaeter Session-Details und Foil-Seite).
//
// * Balken = Hauptreihe; unten dunkler der Anteil in ERKANNTEN Gleitphasen (pg-1, findet etwa die Haelfte — der
//   Hinweis darunter sagt das). Hochgerechnet je Stufe ueber die Laeufe, fuer die Gleiten bekannt ist (`g_basis`).
// * Stufenlinie = Vergleich (anderes Foil, anderer Zeitraum, Community).
// * Band oben: 10./50./90. Perzentil — der „nutzbare Bereich".
// Nur Anteile, keine Sekunden-Achse: so lassen sich Reihen mit ganz verschiedener Fahrzeit vergleichen.

import { useMemo, useState } from "react";
import { useT } from "../i18n";

export interface TempoReihe { a: number[]; g?: number[] | null; g_basis?: number[] | null; label: string }

const FARBE = "#22d3ee";        // Marke (cyan-400)
const FARBE_GLEIT = "#0891b2";  // cyan-600: Teil des Ganzen, gleicher Farbton dunkler
const FARBE_VGL = "#f59e0b";    // amber-500: zweite Reihe

const W = 640, H = 230, L = 34, R = 8, T = 26, B = 26;

/** Stufen auf `faktor` zusammenfassen (0,5 -> 1 km/h). */
function buendeln(xs: number[] | null | undefined, faktor: number): number[] {
  if (!xs) return [];
  const out: number[] = [];
  for (let i = 0; i < xs.length; i += faktor) out.push(xs.slice(i, i + faktor).reduce((s, x) => s + x, 0));
  return out;
}

function perzentil(anteile: number[], p: number, breite: number): number {
  let s = 0;
  for (let k = 0; k < anteile.length; k++) {
    if (s + anteile[k] >= p) return (k + (anteile[k] > 0 ? (p - s) / anteile[k] : 0)) * breite;
    s += anteile[k];
  }
  return anteile.length * breite;
}

const fmtMin = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

export function TempoVerteilung({ haupt, vergleich, breiteKmh, sekunden = true }: {
  haupt: TempoReihe; vergleich?: TempoReihe | null; breiteKmh: number; sekunden?: boolean;
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const [tabelle, setTabelle] = useState(false);

  const d = useMemo(() => {
    const sumH = haupt.a.reduce((s, x) => s + x, 0);
    // Feiner (0,5 km/h) erst ab 2 h Fahrzeit und ohne Vergleich, sonst wird die Kurve zackig und zwei Reihen lassen
    // sich schlecht nebeneinander lesen. Anteile statt Sekunden ab hier.
    const faktor = sekunden && sumH >= 7200 && !vergleich ? 1 : Math.max(1, Math.round(1 / breiteKmh));
    const br = breiteKmh * faktor;
    const ah = buendeln(haupt.a, faktor), gh = buendeln(haupt.g, faktor), gb = buendeln(haupt.g_basis, faktor);
    const av = vergleich ? buendeln(vergleich.a, faktor) : [];
    const sumV = av.reduce((s, x) => s + x, 0);
    const anH = ah.map((x) => (sumH ? x / sumH : 0));
    const anV = av.map((x) => (sumV ? x / sumV : 0));
    // Gleit-Anteil je Stufe: Verhaeltnis aus den Laeufen mit pg-1, auf die ganze Stufe hochgerechnet.
    const anG = gh.length && gb.some((x) => x > 0) ? anH.map((x, k) => (gb[k] > 0 ? x * Math.min(gh[k] / gb[k], 1) : 0)) : null;
    // Bereich: Ausreisser (GPS-Spruenge) abschneiden — 0,2 % an jedem Ende, ueber beide Reihen.
    const grenze = (an: number[]) => {
      let s = 0, lo = 0, hi = an.length - 1;
      for (let k = 0; k < an.length; k++) { s += an[k]; if (s > 0.002) { lo = k; break; } }
      s = 0;
      for (let k = an.length - 1; k >= 0; k--) { s += an[k]; if (s > 0.002) { hi = k; break; } }
      return [lo, hi];
    };
    const [l1, h1] = grenze(anH);
    const [l2, h2] = av.length && sumV ? grenze(anV) : [l1, h1];
    const lo = Math.max(0, Math.min(l1, l2) - 1), hi = Math.min(anH.length - 1, Math.max(h1, h2) + 1);
    const yMax = Math.max(...anH.slice(lo, hi + 1), ...anV.slice(lo, hi + 1), 0.001);
    return {
      br, ah, anH, anV, anG, lo, hi, yMax, sumH, sumV,
      p: [0.1, 0.5, 0.9].map((p) => perzentil(anH, p, br)),
    };
  }, [haupt, vergleich, breiteKmh, sekunden]);

  if (!d.sumH) return <p className="text-sm text-slate-400">{t("tempo.empty")}</p>;

  const n = d.hi - d.lo + 1;
  const bw = (W - L - R) / n;
  const x = (kmh: number) => L + ((kmh / d.br) - d.lo) * bw;
  // y-Achse: glatter Hoechstwert in Prozent
  const schritt = [1, 2, 5, 10, 20, 25, 50].find((s) => (d.yMax * 100) / s <= 5) ?? 50;
  const yTop = Math.ceil((d.yMax * 100) / schritt) * schritt / 100;
  const y = (v: number) => H - B - (v / yTop) * (H - T - B);
  const xSchritt = n * d.br > 24 ? 5 : n * d.br > 10 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil((d.lo * d.br) / xSchritt) * xSchritt; v <= (d.hi + 1) * d.br; v += xSchritt) ticks.push(v);
  const yTicks: number[] = [];
  for (let v = 0; v <= yTop + 1e-9; v += schritt / 100) yTicks.push(v);
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} %`;
  const kmh = (v: number) => v.toFixed(Number.isInteger(v) ? 0 : 1);

  // Vergleich als Stufenlinie ueber die Balken
  let pfad = "";
  if (d.anV.length) {
    for (let k = d.lo; k <= d.hi; k++) {
      const x0 = L + (k - d.lo) * bw, x1 = x0 + bw, yy = y(d.anV[k] ?? 0);
      pfad += k === d.lo ? `M${x0},${yy}H${x1}` : `V${yy}H${x1}`;
    }
  }
  const legende = !!(d.anG || d.anV.length);
  const hk = hover;

  return (
    <div className="space-y-2">
      {legende && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: FARBE }} />{haupt.label}</span>
          {d.anG && <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: FARBE_GLEIT }} />{t("tempo.glideShare")}</span>}
          {vergleich && d.anV.length > 0 && <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: FARBE_VGL }} />{vergleich.label}</span>}
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img"
          aria-label={t("tempo.aria", { p10: kmh(d.p[0]), p50: kmh(d.p[1]), p90: kmh(d.p[2]) })}
          onMouseLeave={() => setHover(null)}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-800" strokeWidth={1} />
              <text x={L - 4} y={y(v) + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>{Math.round(v * 100)}</text>
            </g>
          ))}
          <text x={L - 4} y={T - 10} textAnchor="end" className="fill-slate-400" fontSize={10}>%</text>
          {/* Nutzbarer Bereich: 10.–90. Perzentil als Band oben, Median als Strich */}
          <rect x={x(d.p[0])} width={Math.max(x(d.p[2]) - x(d.p[0]), 1)} y={T - 16} height={4} rx={2} className="fill-slate-600" />
          <line x1={x(d.p[1])} x2={x(d.p[1])} y1={T - 19} y2={T - 9} className="stroke-slate-300" strokeWidth={2} />
          {d.anH.slice(d.lo, d.hi + 1).map((v, i) => {
            const k = d.lo + i;
            const x0 = L + i * bw + 1, w = Math.max(bw - 2, 1);
            const g = d.anG?.[k] ?? 0;
            const r = Math.min(3, w / 2);
            return (
              <g key={k} opacity={hk != null && hk !== k ? 0.55 : 1}>
                {v > 0 && <path d={`M${x0},${y(0)}V${y(v) + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${y(0)}Z`} fill={FARBE} />}
                {g > 0 && <rect x={x0} width={w} y={y(g) + (v - g > 0.0005 ? 1 : 0)} height={Math.max(y(0) - y(g) - (v - g > 0.0005 ? 1 : 0), 0)} fill={FARBE_GLEIT} />}
              </g>
            );
          })}
          {pfad && <path d={pfad} fill="none" stroke={FARBE_VGL} strokeWidth={2} strokeLinejoin="round" />}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-slate-600" strokeWidth={1} />
          {ticks.map((v) => (
            <text key={v} x={x(v)} y={H - B + 14} textAnchor="middle" className="fill-slate-400" fontSize={10}>{v}</text>
          ))}
          <text x={W - R} y={H - 2} textAnchor="end" className="fill-slate-400" fontSize={10}>km/h</text>
          {/* Trefferflaechen: ganze Hoehe je Stufe */}
          {d.anH.slice(d.lo, d.hi + 1).map((_, i) => (
            <rect key={i} x={L + i * bw} width={bw} y={T} height={H - T - B} fill="transparent"
              onMouseEnter={() => setHover(d.lo + i)} onClick={() => setHover(d.lo + i)} />
          ))}
        </svg>
        {hk != null && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow-lg"
            style={{ left: `${Math.min(Math.max(((L + (hk - d.lo + 0.5) * bw) / W) * 100, 12), 78)}%`, transform: "translateX(-50%)" }}>
            <div className="font-semibold">{kmh(hk * d.br)}–{kmh((hk + 1) * d.br)} km/h</div>
            <div className="tabular-nums">{haupt.label}: {pct(d.anH[hk])}{sekunden ? ` · ${fmtMin(d.ah[hk])}` : ""}</div>
            {d.anG && <div className="tabular-nums">{t("tempo.glideShare")}: {pct(d.anG[hk])}</div>}
            {vergleich && d.anV.length > 0 && <div className="tabular-nums">{vergleich.label}: {pct(d.anV[hk] ?? 0)}</div>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{t("tempo.range", { p10: kmh(d.p[0]), p50: kmh(d.p[1]), p90: kmh(d.p[2]) })}{sekunden ? ` · ${fmtMin(d.sumH)}` : ""}</span>
        <button className="rounded-md px-2 py-0.5 text-brand-600 hover:bg-slate-800 dark:text-brand-300" onClick={() => setTabelle(!tabelle)}>
          {tabelle ? t("tempo.hideTable") : t("tempo.showTable")}
        </button>
      </div>
      {tabelle && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-900/70 text-slate-300">
              <th className="px-2 py-1 text-left font-medium">km/h</th>
              <th className="px-2 py-1 text-right font-medium">{haupt.label}</th>
              {d.anG && <th className="px-2 py-1 text-right font-medium">{t("tempo.glideShare")}</th>}
              {vergleich && d.anV.length > 0 && <th className="px-2 py-1 text-right font-medium">{vergleich.label}</th>}
            </tr></thead>
            <tbody>
              {d.anH.slice(d.lo, d.hi + 1).map((v, i) => {
                const k = d.lo + i;
                return (
                  <tr key={k} className="border-t border-slate-800">
                    <td className="px-2 py-0.5 tabular-nums text-slate-300">{kmh(k * d.br)}–{kmh((k + 1) * d.br)}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums text-slate-200">{pct(v)}</td>
                    {d.anG && <td className="px-2 py-0.5 text-right tabular-nums text-slate-200">{pct(d.anG[k])}</td>}
                    {vergleich && d.anV.length > 0 && <td className="px-2 py-0.5 text-right tabular-nums text-slate-200">{pct(d.anV[k] ?? 0)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {d.anG && <p className="text-xs text-slate-400">{t("tempo.glideHint")}</p>}
    </div>
  );
}
