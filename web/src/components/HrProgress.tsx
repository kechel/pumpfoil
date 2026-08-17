import { useEffect, useMemo, useState } from "react";
import { api, type HrProgress as HrProgressData } from "../lib/api";
import { useT } from "../i18n";
import { Card } from "./ui";
import { LineChart, DAY_MS, type Mode, type Pt } from "../pages/History";

// Trainingskurve: Höchstpuls nach 30 s, 1, 2 und 5 Minuten Lauf, über die Sessions hinweg.
//
// Idee von Jan (17.08.): die Anstrengung beim Pumpen hängt fast nur an der DAUER und kaum am Foil
// („man ist nur schneller oder langsamer mit grösseren oder kleineren foils"). Damit ist die
// Lauf-Dauer die ehrliche Achse — und wer fitter wird, hat nach zwei Minuten Pumpen einen
// niedrigeren Puls als vorher.
//
// Bewusst EIN Diagramm je Marke statt vier Linien übereinander: die Marken haben verschiedene
// Stichproben (nach 5 min bleiben oft ein, zwei Läufe übrig) und wären zusammen irreführend.
//
// Diagramm, Hover, Datums-Ticks und Klick auf die Session kommen aus demselben `LineChart` wie die
// übrigen Diagramme dieser Seite — kein zweiter Stil.
export function HrProgress({ mode, domain, onPick }: { mode: Mode; domain: [number, number]; onPick: (p: Pt) => void }) {
  const t = useT();
  const [data, setData] = useState<HrProgressData | null>(null);

  useEffect(() => {
    api.hrProgress().then(setData).catch(() => setData(null));
  }, []);

  const reihe = useMemo(() => data?.series ?? [], [data]);
  const marken = (data?.marks ?? []).filter((m) => reihe.some((x) => x[`hr${m}`] != null));

  if (reihe.length < 2 || !marken.length) return null;

  return (
    <Card className="p-4">
      <h3 className="mb-1 font-semibold">{t("hr.progressTitle")}</h3>
      <p className="mb-4 text-sm text-slate-300">{t("hr.progressHint")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {marken.map((m) => (
          <MarkChart key={m} mark={m} reihe={reihe} mode={mode} domain={domain} onPick={onPick} />
        ))}
      </div>
    </Card>
  );
}

function MarkChart({ mark, reihe, mode, domain, onPick }: {
  mark: number; reihe: HrProgressData["series"]; mode: Mode; domain: [number, number]; onPick: (p: Pt) => void;
}) {
  const t = useT();
  const fmt = (v: number) => `${Math.round(v)} bpm`;

  const roh = useMemo<Pt[]>(() => reihe
    .map((x) => ({
      t: new Date(String(x.started_at ?? "")).getTime(),
      v: Number(x[`hr${mark}`]),
      sid: Number(x.session_id),
      run: null,
    }))
    .filter((p) => isFinite(p.v) && p.v > 0 && isFinite(p.t))
    .sort((a, b) => a.t - b.t), [reihe, mark]);

  // Fenster-Logik wie bei den übrigen Diagrammen — nur mit umgekehrtem Vorzeichen: beim Puls ist
  // NIEDRIG das bessere Ergebnis, also der kleinste Wert im Fenster statt des größten, und
  // „gesamt" ist der laufende Bestwert nach unten.
  const pts = useMemo<Pt[]>(() => {
    if (roh.length < 2) return roh;
    if (mode === "cumulative") {
      let best = Infinity, sid = roh[0].sid;
      return roh.map((p) => {
        if (p.v < best) { best = p.v; sid = p.sid; }
        return { t: p.t, v: best, sid, run: null };
      });
    }
    const winMs = (mode === "window7" ? 7 : 30) * DAY_MS;
    const out: Pt[] = [];
    const at = (tt: number): Pt | null => {
      let mn = Infinity, sid = roh[0].sid;
      for (const p of roh) if (p.t > tt - winMs && p.t <= tt && p.v < mn) { mn = p.v; sid = p.sid; }
      return mn === Infinity ? null : { t: tt, v: mn, sid, run: null };
    };
    // Anders als bei Distanz/Tempo wird eine Lücke NICHT als 0 gezeichnet: ein Puls von 0 gibt es
    // nicht, und eine auf null fallende Linie würde Erholung vortäuschen. Leere Fenster fallen aus.
    for (let tt = domain[0]; tt < domain[1]; tt += DAY_MS) { const p = at(tt); if (p) out.push(p); }
    const letzte = at(domain[1]);
    if (letzte) out.push(letzte);
    return out;
  }, [roh, mode, domain]);

  const laeufe = reihe.reduce((n, x) => n + (Number(x[`n${mark}`]) || 0), 0);
  const werte = roh.map((p) => p.v);
  const cur = pts.length ? pts[pts.length - 1].v : 0;
  // y-Achse nicht bei 0 beginnen lassen: der interessante Bereich liegt zwischen 110 und 175 bpm.
  const vmin = werte.length ? Math.max(0, Math.min(...werte) - 8) : 0;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-200">
          {mark < 60 ? t("hr.afterSeconds", { sec: mark }) : t("hr.afterMinutes", { min: mark / 60 })}
        </span>
        <span className="tabular-nums font-bold text-rose-600 dark:text-rose-400">{cur ? fmt(cur) : "–"}</span>
      </div>
      {/* Diese Zeile ist die eigentliche Aussage — sie steht deshalb in normaler Schriftgröße und
          in Lesefarbe, nicht klein und grau (Jan, 17.08.). */}
      <div className="mb-1 text-sm text-slate-200">
        {t("hr.fromRuns", { runs: laeufe, sessions: roh.length })}
        {werte.length > 1 && (
          <span className="ml-2 tabular-nums">
            {Math.round(werte[0])} → {Math.round(werte[werte.length - 1])} bpm
          </span>
        )}
      </div>
      <LineChart pts={pts} color="#f43f5e" fmt={fmt} onPick={onPick} domain={domain} vmin={vmin} />
      <div className="mt-0.5 text-xs text-slate-300">{t("hr.axisHint")}</div>
    </div>
  );
}
