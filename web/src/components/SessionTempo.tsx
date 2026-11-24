// Session-Details › Tempo-Verteilung (Jan 24.11.2026, docs/TEMPO-VERTEILUNG.md Schritt 2): aufklappbar unter der
// Lauftabelle. Ganze Session, oder — ist ein Lauf gewaehlt — dieser Lauf mit der Session als Vergleichslinie. Der
// Besitzer kann stattdessen mit seinen uebrigen Sessions auf demselben Foil vergleichen (nur er: das verraet etwas
// ueber seine anderen Sessions). Gerechnet im Browser aus den schon geladenen Daten (lib/tempoHist.ts).

import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { TEMPO_BREITE_KMH, tempoHist } from "../lib/tempoHist";
import { TempoVerteilung, type TempoReihe } from "./TempoVerteilung";

const SCHLUESSEL = "pumpfoil_session_tempo_offen";
const SEL = "min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100";

export function SessionTempo({ sessionId, segments, speeds1, selectedRun, foilId, foilLabel, eigene }: {
  sessionId: number; segments: any[]; speeds1: (number | null)[]; selectedRun: number | null;
  foilId: number | null; foilLabel: string | null; eigene: boolean;
}) {
  const t = useT();
  const [offen, setOffen] = useState(() => { try { return localStorage.getItem(SCHLUESSEL) === "1"; } catch { return false; } });
  const [vgl, setVgl] = useState<"auto" | "keiner" | "foil">("auto");
  const [foilReihe, setFoilReihe] = useState<TempoReihe | null>(null);
  const [foilLeer, setFoilLeer] = useState(false);

  const lauf = selectedRun != null && segments[selectedRun] ? selectedRun : null;
  const session = useMemo(() => tempoHist(segments, speeds1), [segments, speeds1]);
  const einLauf = useMemo(() => (lauf != null ? tempoHist([segments[lauf]], speeds1) : null), [segments, speeds1, lauf]);

  useEffect(() => {
    if (!offen || vgl !== "foil" || foilId == null || foilReihe) return;
    api.tempoEigen({ foilId, ohneSession: sessionId, period: "all" })
      .then((r) => {
        if (r.a.some((x) => x > 0)) setFoilReihe({ a: r.a, label: t("tempo.sessionOthers", { foil: foilLabel ?? "" }) });
        else setFoilLeer(true);
      }).catch(() => setFoilLeer(true));
  }, [offen, vgl, foilId, sessionId, foilReihe, foilLabel, t]);

  if (!session.a.some((x) => x > 0)) return null;

  const umschalten = () => {
    const neu = !offen; setOffen(neu);
    try { localStorage.setItem(SCHLUESSEL, neu ? "1" : "0"); } catch { /* egal */ }
  };
  const haupt: TempoReihe = einLauf
    ? { ...einLauf, label: t("tempo.run", { n: String((lauf ?? 0) + 1) }) }
    : { ...session, label: t("tempo.thisSession") };
  const vergleich: TempoReihe | null =
    vgl === "foil" ? foilReihe
      : vgl === "auto" && einLauf ? { a: session.a, label: t("tempo.thisSession") }
        : null;

  return (
    <div className="mt-4 rounded-xl border border-slate-800">
      <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-900/60"
        aria-expanded={offen} onClick={umschalten}>
        <span>{t("tempo.title")}{einLauf ? ` · ${t("tempo.run", { n: String((lauf ?? 0) + 1) })}` : ""}</span>
        <span className={`text-slate-400 transition-transform ${offen ? "rotate-90" : ""}`} aria-hidden>›</span>
      </button>
      {offen && (
        <div className="space-y-2 border-t border-slate-800 p-3">
          {(einLauf || (eigene && foilId != null)) && (
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              {t("tempo.compare")}
              <select className={SEL} value={vgl} onChange={(e) => setVgl(e.target.value as typeof vgl)}>
                {einLauf ? <option value="auto">{t("tempo.wholeSession")}</option> : <option value="auto">—</option>}
                {einLauf && <option value="keiner">—</option>}
                {eigene && foilId != null && <option value="foil">{t("tempo.sessionOthers", { foil: foilLabel ?? "" })}</option>}
              </select>
            </label>
          )}
          <TempoVerteilung breiteKmh={TEMPO_BREITE_KMH} haupt={haupt} vergleich={vergleich} />
          {vgl === "foil" && foilLeer && <p className="text-xs text-slate-400">{t("tempo.sessionOthersNone")}</p>}
        </div>
      )}
    </div>
  );
}
