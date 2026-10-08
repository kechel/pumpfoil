import { useT } from "../i18n";
import type { KurveGerade, Technik, TechnikPaar } from "../lib/api";

// Technik-Kennzahlen des Bretts (Handy am Brett), korrigiert und unkorrigiert nebeneinander, mit
// Legende unter der Tabelle (Jan, 08.10.2026: „vor allem soll es klar erkenntlich sein welche zahl
// was aussagt … und auch die unkorrigierte fassung weiterhin mit anzeigen"). Rechnung:
// server/app/analysis/lage.py `technik_kennzahlen` — nur der ruhige Mittelteil von Laeufen ab 30 s.

type Zeile = { key: keyof Technik; label: string; legende: string; fmt: (v: number) => string };

export function TechnikTabelle({ paar, laeufe }: { paar: TechnikPaar; laeufe?: number }) {
  const t = useT();
  const grad = (v: number) => `±${v.toFixed(1)}°`;
  const zeilen: Zeile[] = [
    { key: "pump_nicken_deg", label: t("tech.pumpPitch"), legende: t("tech.lPumpPitch"), fmt: grad },
    { key: "pump_rollen_deg", label: t("tech.pumpRoll"), legende: t("tech.lPumpRoll"), fmt: grad },
    { key: "wackeln_deg", label: t("tech.wobble"), legende: t("tech.lWobble"), fmt: grad },
    { key: "kurvenlage_deg", label: t("tech.curve"), legende: t("tech.lCurve"), fmt: (v) => `${v.toFixed(1)}°` },
    { key: "hub_cm", label: t("tech.heave"), legende: t("tech.lHeave"), fmt: (v) => `${v.toFixed(0)} cm` },
    { key: "takt_hz", label: t("tech.cadence"), legende: t("tech.lCadence"), fmt: (v) => `${v.toFixed(2)} Hz` },
  ];
  const zelle = (x: Technik | null | undefined, z: Zeile) => {
    const v = x?.[z.key];
    return typeof v === "number" ? z.fmt(v) : "–";
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-slate-300">
              <th className="px-3 py-2 text-left font-medium">{t("tech.title")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tech.colWith")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tech.colWithout")}</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.key} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{z.label}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-400">{zelle(paar.mit, z)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{zelle(paar.ohne, z)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legende: jede Zeile in einem Satz, dann was „korrigiert" heisst und was gezaehlt wird. */}
      <dl className="space-y-0.5 text-sm text-slate-400">
        {zeilen.map((z) => (
          <div key={z.key}><dt className="inline font-semibold text-slate-300">{z.label}:</dt> <dd className="inline">{z.legende}</dd></div>
        ))}
      </dl>
      <p className="text-sm text-slate-400">{t("tech.lCorrection")}</p>
      <p className="text-sm text-slate-400">
        {t("tech.lMiddle", { n: String(laeufe ?? paar.mit?.laeufe ?? paar.ohne?.laeufe ?? 1) })}
      </p>
    </div>
  );
}

/**
 * Legende zur Tabelle „Lage je Lauf" (Session-Details): dort stehen die Technikzahlen als
 * Zeilen IN den Zellen (Jan, 08.10.2026: „ohne zusaetzliche spalten"), korrigiert vorn,
 * unkorrigiert in Klammern.
 */
export function LaufLegende({ n }: { n: number }) {
  const t = useT();
  const zeilen: [string, string][] = [
    [`${t("board.pitch")} · ${t("tech.sPump")}`, t("tech.lPumpPitch")],
    [`${t("board.pitch")} · ${t("tech.sWhole")}`, t("tech.lWhole")],
    [`${t("board.roll")} · ${t("tech.sPump")}`, t("tech.lPumpRoll")],
    [`${t("board.roll")} · ${t("tech.sWobble")}`, t("tech.lWobble")],
    [`${t("board.roll")} · ${t("tech.sCurve")}`, t("tech.lCurve")],
    [t("tech.heave"), t("tech.lHeave")],
    [`${t("tech.sTurn")} · ${t("tech.sStraight")}`, t("tech.lTurnStraight")],
  ];
  return (
    <div className="space-y-1 px-3 pb-3 pt-2 text-sm text-slate-400">
      <dl className="space-y-0.5">
        {zeilen.map(([k, v]) => (
          <div key={k}><dt className="inline font-semibold text-slate-300">{k}:</dt> <dd className="inline">{v}</dd></div>
        ))}
      </dl>
      <p>{t("tech.lBrackets")}. {t("tech.lCorrection")}</p>
      <p>{t("tech.lMiddle", { n: String(n) })}</p>
    </div>
  );
}

/** Startseite: Pumpzuege in der Kurve gegen geradeaus (Median ueber die Laeufe), mit Legende. */
export function KurveGeradeTabelle({ kg }: { kg: KurveGerade }) {
  const t = useT();
  const zeilen: [string, (x: NonNullable<KurveGerade["kurve"]>) => string][] = [
    [t("tech.cadence"), (x) => (x.takt_hz != null ? `${x.takt_hz.toFixed(2)} Hz` : "–")],
    [t("tech.pumpPitch"), (x) => (x.nicken_deg != null ? `±${x.nicken_deg.toFixed(1)}°` : "–")],
    [t("tech.heave"), (x) => (x.hub_cm != null ? `${x.hub_cm.toFixed(0)} cm` : "–")],
    [t("tech.strokes"), (x) => String(x.zuege)],
  ];
  return (
    <div className="mt-3 space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-slate-300">
              <th className="px-3 py-2 text-left font-medium">{t("tech.kgTitle")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tech.sTurn")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tech.sStraight")}</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(([label, f]) => (
              <tr key={label} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{kg.kurve ? f(kg.kurve) : "–"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{kg.gerade ? f(kg.gerade) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-400">{t("tech.lTurnStraight")}</p>
    </div>
  );
}
