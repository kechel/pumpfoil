import { useT } from "../i18n";
import type { BoardAttitude, KurveGerade, KurveGeradeSeite, Technik, TechnikPaar } from "../lib/api";
import { usePumpFmt } from "../lib/pumpRate";

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
export function LaufLegende({ n, ganzerLauf = true, mitteText = "tech.lMiddle" }: { n: number; ganzerLauf?: boolean; mitteText?: string }) {
  // Kategorien statt Spalte × Kategorie (Jan, 08.10.2026): „per pump", „wobble" usw. bedeuten in
  // jeder Spalte dasselbe — einmal erklaeren, die Spalten selbst in einer Zeile.
  const t = useT();
  const zeilen: [string, string][] = [
    [t("tech.sStable"), t("tech.gStable")],
    [t("tech.sPump"), t("tech.gPump")],
    [t("tech.sWobble"), t("tech.gWobble")],
    [t("tech.sCurve"), t("tech.gLean")],
    [`${t("tech.sTurn")} · ${t("tech.sStraight")}`, t("tech.gTurnStraight")],
    ...(ganzerLauf ? [[t("tech.sWhole"), t("tech.gWhole")] as [string, string]] : []),
  ];
  return (
    <div className="space-y-1 px-3 pb-3 pt-2 text-sm text-slate-400">
      <p>{t("tech.gColumns")}</p>
      <dl className="space-y-0.5">
        {zeilen.map(([k, v]) => (
          <div key={k}><dt className="inline font-semibold text-slate-300">{k}:</dt> <dd className="inline">{v}</dd></div>
        ))}
      </dl>
      <p>{t("tech.gSpread")} {t(ganzerLauf ? "tech.gMiddle" : mitteText, { n: String(n) })}</p>
      <p>{t("tech.lBrackets")}. {t("tech.lCorrection")}</p>
      {/* Hub = Bewegung AM HANDY (Jan, 08.10.2026): je nach Lage am Brett kommt das Nicken als Hebel
          dazu. Der Drehpunkt ist NICHT der Mast (Jan: „vorsicht") und nicht bekannt; einen Abstand
          Handy–Brett-Punkt erfassen wir bewusst nicht — also offen sagen. */}
      <p>{t("tech.gHeave")}</p>
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



/**
 * Startseite (Jan, 08.10.2026: „noch die alte unuebersichtliche Darstellung"): EINE Tabelle wie
 * „Lage je Lauf" — Zeilen = alle Laeufe und je Foil, Spalten = Nicken / Rollen / Hub / Takt, mehrere
 * Zahlen untereinander in der Zelle, eine Legende darunter. Ersetzt die getrennten Technik- und
 * Kurve/Gerade-Tabellen samt der alten Tabelle je Lauflaenge.
 */
export function TechnikUebersicht({ zeilen, titel, mitteText, phase = "tech.sStable" }: {
  zeilen: { label: string; technik?: TechnikPaar | null; kg?: KurveGerade | null }[];
  titel?: string; mitteText?: string; phase?: string;
}) {
  const t = useT();
  const pump = usePumpFmt();
  const mitDaten = zeilen.filter((z) => z.technik?.mit || z.technik?.ohne);
  if (!mitDaten.length) return null;
  const n = (z: { technik?: TechnikPaar | null }) => z.technik?.mit?.laeufe ?? z.technik?.ohne?.laeufe ?? 0;
  return (
    <div className="mt-3">
    {titel && <div className="mb-1 text-sm font-semibold text-slate-200">{titel}</div>}
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-slate-400">
            <th className="px-3 py-2 font-medium"></th>
            <th className="px-3 py-2 font-medium">{t("board.pitch")}</th>
            <th className="px-3 py-2 font-medium">{t("board.roll")}</th>
            <th className="px-3 py-2 font-medium">{t("tech.heave")}</th>
            <th className="px-3 py-2 font-medium">{t("tech.cadence")} <span className="font-normal">{pump.suffix}</span></th>
          </tr>
        </thead>
        <tbody>
          {mitDaten.map((z) => {
            const m = z.technik?.mit, o = z.technik?.ohne;
            return (
              <tr key={z.label} className="border-b border-slate-800/50 align-top">
                <td className="px-3 py-2">
                  <div className="text-slate-200">{z.label}</div>
                  <div className="tabular-nums">{t("home.baRuns", { n: String(n(z)) })}</div>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <Raster zeilen={[
                    { label: t(phase), wert: grad(m?.pump_nicken_deg), klammer: grad(o?.pump_nicken_deg), haupt: true },
                    ...kgZeilen(z.kg, (x) => grad(x.nicken_deg), t)]} />
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <Raster zeilen={[
                    { label: t("tech.sPump"), wert: grad(m?.pump_rollen_deg), klammer: grad(o?.pump_rollen_deg), haupt: true },
                    ...kgZeilen(z.kg, (x) => grad(x.rollen_deg), t),
                    { label: t("tech.sWobble"), wert: grad(m?.wackeln_deg), klammer: grad(o?.wackeln_deg), haupt: true },
                    { label: t("tech.sCurve"), wert: grad(m?.kurvenlage_deg, ""), klammer: grad(o?.kurvenlage_deg, ""), haupt: true }]} />
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <Raster zeilen={[
                    { label: t(phase), wert: m?.hub_cm != null ? `${m.hub_cm.toFixed(0)} cm` : null, haupt: true },
                    ...kgZeilen(z.kg, (x) => (x.hub_cm != null ? `${x.hub_cm.toFixed(0)} cm` : null), t)]} />
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <Raster zeilen={[
                    { label: t(phase), wert: m?.takt_hz != null ? String(pump.value(m.takt_hz)) : null, haupt: true },
                    ...kgZeilen(z.kg, (x) => (x.takt_hz != null ? String(pump.value(x.takt_hz)) : null), t)]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <LaufLegende n={n(mitDaten[0])} ganzerLauf={false} mitteText={mitteText} />
    </div>
    </div>
  );
}

/**
 * Die Lage-Zellen EINES Laufs (Nicken, Rollen, Gieren, Takt, Hub) — gemeinsam fuer die Tabelle
 * „Lage je Lauf" der Session-Details und die Seite „Laengste Laeufe" (Jan, 08.10.2026: „bitte auch
 * die neue darstellung"), damit beide nie auseinanderlaufen.
 */
export function LageZellen({ k }: { k: NonNullable<BoardAttitude["laeufe"]>[number] }) {
  const t = useT();
  // Lauf mit stabiler Phase (ab lage.TECHNIK_MIN_S): dann kommen alle oberen Zahlen aus ihr. Kurze Laeufe
  // zeigen nur die bisherige Zahl ueber den ganzen Lauf. Korrigiert vorn, unkorrigiert in Klammern.
  const lang = !!(k.technik?.mit && k.technik.teil !== "ganz");
  const m = k.technik?.mit, o = k.technik?.ohne, kg = lang ? k.technik?.kurve_gerade : null;
  const ganz = (v: number | null | undefined): RasterZeile[] => [{ label: t("tech.sWhole"), wert: grad(v, "±", 0), haupt: true }];
  return (
    <>
      <td className="px-3 py-2 align-top tabular-nums" title={`${t("tech.sWhole")}: ±${k.pitch_amplitude_deg?.toFixed(0)}°`}>
        <Raster zeilen={lang ? [
          { label: t("tech.sStable"), wert: grad(m?.pump_nicken_deg), klammer: grad(o?.pump_nicken_deg), haupt: true },
          ...kgZeilen(kg, (x) => grad(x.nicken_deg), t),
        ] : ganz(k.pitch_amplitude_deg)} />
      </td>
      <td className="px-3 py-2 align-top tabular-nums" title={`${t("tech.sWhole")}: ±${k.roll_amplitude_deg?.toFixed(0)}°`}>
        <Raster zeilen={lang ? [
          { label: t("tech.sPump"), wert: grad(m?.pump_rollen_deg), klammer: grad(o?.pump_rollen_deg), haupt: true },
          ...kgZeilen(kg, (x) => grad(x.rollen_deg), t),
          { label: t("tech.sWobble"), wert: grad(m?.wackeln_deg), klammer: grad(o?.wackeln_deg), haupt: true },
          { label: t("tech.sCurve"), wert: grad(m?.kurvenlage_deg, ""), klammer: grad(o?.kurvenlage_deg, ""), haupt: true },
        ] : ganz(k.roll_amplitude_deg)} />
      </td>
      <td className="px-3 py-2 align-top tabular-nums"><span className="font-semibold text-brand-700 dark:text-brand-300">{k.gier_rms_deg_s?.toFixed(0)}°/s</span></td>
      <td className="px-3 py-2 align-top tabular-nums">
        <Raster zeilen={lang && m?.takt_hz != null ? [
          { label: t("tech.sStable"), wert: `${m.takt_hz.toFixed(2)} Hz`, haupt: true },
          ...kgZeilen(kg, (x) => (x.takt_hz != null ? `${x.takt_hz.toFixed(2)} Hz` : null), t),
        ] : [{ label: "", wert: k.pitch_hz != null ? `${k.pitch_hz.toFixed(2)} Hz` : null, haupt: true }]} />
      </td>
      {/* Ein unsicherer Hub (nur bei kurzen Laeufen, ueber den ganzen Lauf) steht in Klammern und grau. */}
      <td className={`px-3 py-2 align-top tabular-nums ${lang || k.hub_sicher ? "" : "text-slate-500"}`}
        title={lang || k.hub_sicher ? undefined : t("board.heaveShaky", {
          s: (k.hub_fenster_s ?? 3).toFixed(1).replace(/\.0$/, "") })}>
        <Raster zeilen={lang && m?.hub_cm != null ? [
          { label: t("tech.sStable"), wert: `${m.hub_cm.toFixed(0)} cm`, haupt: true },
          ...kgZeilen(kg, (x) => (x.hub_cm != null ? `${x.hub_cm.toFixed(0)} cm` : null), t),
        ] : [{ label: "", wert: k.hub_pp_cm != null ? (k.hub_sicher ? `${k.hub_pp_cm.toFixed(0)} cm` : `(${k.hub_pp_cm.toFixed(0)} cm)`) : null, haupt: true }]} />
      </td>
    </>
  );
}

/** Eine Zeile im Zell-Raster: Beschriftung | Wert | Klammer (unkorrigiert). `haupt` = Hauptzahl (cyan, fett). */
export type RasterZeile = { label: string; wert: string | null; klammer?: string | null; haupt?: boolean };

/**
 * Zell-Inhalt als Raster (Jan, 08.10.2026: „alignen, so dass die werte untereinander stehen"): drei
 * Spalten, Werte rechtsbuendig untereinander, Kurve und gerade je eine eigene Zeile.
 */
export function Raster({ zeilen }: { zeilen: RasterZeile[] }) {
  return (
    <div className="inline-grid grid-cols-[auto_auto_auto] gap-x-2 whitespace-nowrap">
      {zeilen.map((z) => (
        <div key={z.label} className="contents">
          <span>{z.label}</span>
          <span className={`text-right ${z.haupt ? "font-semibold text-brand-700 dark:text-brand-300" : ""}`}>{z.wert ?? "–"}</span>
          <span>{z.klammer ? `(${z.klammer})` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/** Zwei Raster-Zeilen „Kurve" und „gerade" aus einer Kurve/Gerade-Auswertung; leer, wenn es keine gibt. */
export function kgZeilen(kg: KurveGerade | null | undefined, wert: (x: KurveGeradeSeite) => string | null,
  t: (k: string) => string): RasterZeile[] {
  if (!kg || (!kg.kurve && !kg.gerade)) return [];
  return [
    { label: t("tech.sTurn"), wert: kg.kurve ? wert(kg.kurve) : null },
    { label: t("tech.sStraight"), wert: kg.gerade ? wert(kg.gerade) : null },
  ];
}

const grad = (v: number | null | undefined, vz = "±", nk = 1) => (v != null ? `${vz}${v.toFixed(nk)}°` : null);
