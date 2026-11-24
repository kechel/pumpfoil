// Home › Stats › Tempo (Jan 24.11.2026, docs/TEMPO-VERTEILUNG.md): die eigene Tempo-Verteilung, gefiltert nach
// Zeitraum, Foil und Spot; Vergleich mit einem anderen eigenen Foil oder mit allen Fahrern auf dem gewaehlten Foil.

import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { api, type TempoEigen, type TempoFoil } from "../lib/api";
import { PERIODS } from "../pages/Home";
import { TempoVerteilung } from "./TempoVerteilung";

const SEL = "min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100";

export function TempoBereich() {
  const t = useT();
  const [period, setPeriod] = useState("all");
  const [foilId, setFoilId] = useState<number | null>(null);
  const [spotId, setSpotId] = useState<number | null>(null);
  const [vgl, setVgl] = useState<string>("");          // "" | "foil:<id>" | "community"
  const [d, setD] = useState<TempoEigen | null>(null);
  const [vd, setVd] = useState<{ a: number[]; label: string } | null>(null);
  const [vInfo, setVInfo] = useState<TempoFoil | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    setFehler(false);
    api.tempoEigen({ period, foilId, spotId }).then(setD).catch(() => setFehler(true));
  }, [period, foilId, spotId]);

  useEffect(() => {
    setVd(null); setVInfo(null);
    if (vgl.startsWith("foil:")) {
      const id = Number(vgl.slice(5));
      const label = d?.foils.find((f) => f.id === id)?.label ?? "";
      api.tempoEigen({ period, foilId: id, spotId }).then((r) => setVd({ a: r.a, label })).catch(() => {});
    } else if (vgl === "community" && foilId != null) {
      api.tempoFoil(foilId).then((r) => {
        setVInfo(r);
        if (r.genug && r.a) setVd({ a: r.a, label: t("tempo.community", { n: String(r.fahrer) }) });
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vgl, period, spotId, foilId, d?.foils.length]);

  // Vergleich mit dem gerade gewaehlten Foil selbst ergibt nichts -> zuruecksetzen
  useEffect(() => { if (vgl === `foil:${foilId}` || (vgl === "community" && foilId == null)) setVgl(""); }, [foilId, vgl]);

  const fLabel = foilId != null ? d?.foils.find((f) => f.id === foilId)?.label : null;
  const label = fLabel ?? t("tempo.mine");

  return (
    <div className="mt-8 space-y-3">
      <h2 className="text-xl font-bold">{t("tempo.title")}</h2>
      <p className="text-sm text-slate-400">{t("tempo.intro")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={SEL} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("tempo.period")}>
          {PERIODS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
        <select className={SEL} value={foilId ?? ""} onChange={(e) => setFoilId(e.target.value ? Number(e.target.value) : null)} aria-label={t("tempo.foil")}>
          <option value="">{t("tempo.allFoils")}</option>
          {d?.foils.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select className={SEL} value={spotId ?? ""} onChange={(e) => setSpotId(e.target.value ? Number(e.target.value) : null)} aria-label={t("tempo.spot")}>
          <option value="">{t("tempo.allSpots")}</option>
          {d?.spots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          {t("tempo.compare")}
          <select className={SEL} value={vgl} onChange={(e) => setVgl(e.target.value)}>
            <option value="">—</option>
            {foilId != null && <option value="community">{t("tempo.compareCommunity")}</option>}
            {d?.foils.filter((f) => f.id !== foilId).map((f) => <option key={f.id} value={`foil:${f.id}`}>{f.label}</option>)}
          </select>
        </label>
      </div>
      {fehler && <p className="text-sm text-red-700 dark:text-red-300">{t("tempo.error")}</p>}
      {d && (
        <TempoVerteilung breiteKmh={d.breite_kmh}
          haupt={{ a: d.a, g: d.g, g_basis: d.g_basis, label }}
          vergleich={vd} />
      )}
      {vgl === "community" && vInfo && !vInfo.genug && (
        <p className="text-xs text-slate-400">{t("tempo.communityTooFew", { n: String(vInfo.min_fahrer), m: String(vInfo.fahrer) })}</p>
      )}
      {d && d.unvollstaendig > 0 && <p className="text-xs text-slate-400">{t("tempo.incomplete", { n: String(d.unvollstaendig) })}</p>}
    </div>
  );
}
