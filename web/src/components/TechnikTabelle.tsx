import type React from "react";
import { useState } from "react";
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
export function LaufLegende({ n, mitteText = "tech.gMiddle" }: { n: number; mitteText?: string; ganzerLauf?: boolean }) {
  // Erst die Spalten, dann die Phasen (Jan, 08.10.2026: Phasen als eigene Spalte), dann was gezaehlt wird.
  const t = useT();
  const zeilen: [string, string][] = [
    [`${t("board.pitch")}, ${t("board.roll")}, ${t("sd.colPitchRhythm")}, ${t("sd.colHeave")}`, t("tech.gPump")],
    [t("tech.wobble"), t("tech.gWobble")],
    [t("tech.colLean"), t("tech.gLean")],
    [t("tech.sStable"), t("tech.gStable")],
    [`${t("tech.sTurn")} · ${t("tech.sStraight")}`, t("tech.gTurnStraight")],
    [t("tech.sWhole"), t("tech.gWhole")],
  ];
  return (
    <div className="space-y-1 px-3 pb-3 pt-2 text-sm text-slate-400">
      <p>{t("tech.gColumns")}</p>
      <dl className="space-y-0.5">
        {zeilen.map(([k, v]) => (
          <div key={k}><dt className="inline font-semibold text-slate-300">{k}:</dt> <dd className="inline">{v}</dd></div>
        ))}
      </dl>
      <p>{t("tech.lCorrection")}</p>
      <p>{t("tech.gSpread")} {t(mitteText, { n: String(n) })}</p>
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
export function TechnikUebersicht({ zeilen, titel, mitteText }: {
  zeilen: { label: string; technik?: TechnikPaar | null; kg?: KurveGerade | null; kgOhne?: KurveGerade | null;
    ganz?: TechnikPaar | null; nurGanz?: boolean }[];
  titel?: string; mitteText?: string;
}) {
  const t = useT();
  const pump = usePumpFmt();
  const [korr, setKorr] = useState(true);
  const mitDaten = zeilen.filter((z) => z.technik?.mit || z.technik?.ohne);
  if (!mitDaten.length) return null;
  const n = (z: { technik?: TechnikPaar | null }) => z.technik?.mit?.laeufe ?? z.technik?.ohne?.laeufe ?? 0;
  const seite = (x: KurveGeradeSeite | null | undefined): Partial<Technik> | null => x
    ? { pump_nicken_deg: x.nicken_deg, pump_rollen_deg: x.rollen_deg ?? null, takt_hz: x.takt_hz, hub_cm: x.hub_cm,
      wackeln_deg: x.wackeln_deg ?? null, kurvenlage_deg: x.kurvenlage_deg ?? null } : null;
  const f = (p: TechnikPaar | null | undefined) => (korr ? p?.mit : p?.ohne);
  const phasen = (z: typeof mitDaten[number]): PhaseZeile[] => {
    const kg = korr ? z.kg : z.kgOhne;
    return z.nurGanz
      ? [{ phase: t("tech.sWhole"), mit: f(z.technik), haupt: true }]
      : [
          { phase: t("tech.sStable"), mit: f(z.technik), haupt: true },
          ...(kg ? [{ phase: t("tech.sTurn"), mit: seite(kg.kurve), haupt: false },
                    { phase: t("tech.sStraight"), mit: seite(kg.gerade), haupt: false }] : []),
          ...(z.ganz && (z.ganz.mit || z.ganz.ohne) ? [{ phase: t("tech.sWhole"), mit: f(z.ganz), haupt: false }] : []),
        ];
  };
  return (
    <div className="mt-3">
    <div className="mb-1 flex flex-wrap items-center gap-2">
      {titel && <div className="text-sm font-semibold text-slate-200">{titel}</div>}
      <span className="ml-auto"><KorrekturUmschalter korr={korr} onChange={setKorr} /></span>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-slate-400">
            <th className="px-3 py-2 font-medium"></th>
            <th className="px-3 py-2 font-medium">{t("tech.colPhase")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("board.pitch")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("board.roll")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("tech.wobble")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("tech.colLean")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("tech.cadence")} <span className="font-normal">{pump.suffix}</span></th>
            <th className="px-3 py-2 text-right font-medium">{t("tech.heave")}</th>
          </tr>
        </thead>
        <tbody>
          {mitDaten.map((z) => {
            const ph = phasen(z);
            return ph.map((p, i) => (
              <tr key={`${z.label}|${p.phase}`} className={i === ph.length - 1 ? "border-b border-slate-800" : ""}>
                {i === 0 && (
                  <td rowSpan={ph.length} className="px-3 py-1.5 align-top">
                    <div>{z.label}</div>
                    <div className="tabular-nums">{t("home.baRuns", { n: String(n(z)) })}</div>
                  </td>
                )}
                <td className="px-3 py-1.5 whitespace-nowrap">{p.phase}</td>
                <PhasenWerte z={p} takt={(hz) => String(pump.value(hz))} />
              </tr>
            ));
          })}
        </tbody>
      </table>
      <LaufLegende n={n(mitDaten[0])} mitteText={mitteText} />
    </div>
    </div>
  );
}

/**
 * Die Lage-Zellen EINES Laufs (Nicken, Rollen, Gieren, Takt, Hub) — gemeinsam fuer die Tabelle
 * „Lage je Lauf" der Session-Details und die Seite „Laengste Laeufe" (Jan, 08.10.2026: „bitte auch
 * die neue darstellung"), damit beide nie auseinanderlaufen.
 */
/** Eine Phase in der Lage-Tabelle: Werte korrigiert (mit) und unkorrigiert (ohne, in Klammern). */
type PhaseZeile = { phase: string; mit: Partial<Technik> | null | undefined; haupt: boolean };

/** Phasen eines Laufs (Jan, 08.10.2026: „4 zeilen je lauf mit einer neuen spalte phase"): stabile Phase,
 *  Kurve, gerade, ganzer Lauf. Kurze Laeufe (unter lage.TECHNIK_MIN_S) nur „ganzer Lauf". */
function phasenDesLaufs(k: NonNullable<BoardAttitude["laeufe"]>[number], t: (k: string) => string, korr: boolean): PhaseZeile[] {
  const x = k.technik;
  if (!x) return [{ phase: t("tech.sWhole"), mit: null, haupt: false }];
  const f = (p: TechnikPaar | null | undefined) => (korr ? p?.mit : p?.ohne);
  if (x.teil === "ganz") return [{ phase: t("tech.sWhole"), mit: f(x), haupt: true }];
  const kg = korr ? x.kurve_gerade : x.kurve_gerade_ohne;
  const seite = (z: KurveGeradeSeite | null | undefined): Partial<Technik> | null => z
    ? { pump_nicken_deg: z.nicken_deg, pump_rollen_deg: z.rollen_deg ?? null, takt_hz: z.takt_hz, hub_cm: z.hub_cm,
      wackeln_deg: z.wackeln_deg ?? null, kurvenlage_deg: z.kurvenlage_deg ?? null } : null;
  return [
    { phase: t("tech.sStable"), mit: f(x), haupt: true },
    ...(kg ? [{ phase: t("tech.sTurn"), mit: seite(kg.kurve), haupt: false },
              { phase: t("tech.sStraight"), mit: seite(kg.gerade), haupt: false }] : []),
    ...(x.ganz ? [{ phase: t("tech.sWhole"), mit: f(x.ganz), haupt: false }] : []),
  ];
}

/** Die Wert-Zellen EINER Phase: Nicken | Rollen | Wackeln | Schraeglage | Takt | Hub. */
function PhasenWerte({ z, takt }: { z: PhaseZeile; takt?: (hz: number) => string }) {
  const zelle = (v: number | null | undefined, f: (n: number) => string) => (
    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
      <span className={z.haupt ? "font-semibold text-brand-700 dark:text-brand-300" : ""}>{v != null ? f(v) : "–"}</span>
    </td>
  );
  const g = (n: number) => `±${n.toFixed(1)}°`;
  const m = z.mit;
  return (
    <>
      {zelle(m?.pump_nicken_deg, g)}
      {zelle(m?.pump_rollen_deg, g)}
      {zelle(m?.wackeln_deg, g)}
      {zelle(m?.kurvenlage_deg, (n) => `${n.toFixed(1)}°`)}
      {zelle(m?.takt_hz, takt ?? ((n) => `${n.toFixed(2)} Hz`))}
      {zelle(m?.hub_cm, (n) => `${n.toFixed(0)} cm`)}
    </>
  );
}

/** Kopfzellen ab „Phase" (fuer Session-Details und Laengste Laeufe gleich). */
export function PhasenKopf({ sortierbar }: { sortierbar?: (key: string, label: string) => React.ReactNode }) {
  const t = useT();
  const th = (key: string, label: string) => sortierbar ? sortierbar(key, label)
    : <th key={key} className="px-3 py-2 text-right font-medium">{label}</th>;
  return (
    <>
      <th className="px-3 py-2 font-medium">{t("tech.colPhase")}</th>
      {th("pitch", t("board.pitch"))}
      {th("roll", t("board.roll"))}
      {th("wobble", t("tech.wobble"))}
      {th("lean", t("tech.colLean"))}
      {th("pitchHz", t("sd.colPitchRhythm"))}
      {th("hub", t("sd.colHeave"))}
      {th("yaw", t("board.yaw"))}
    </>
  );
}

/**
 * Alle Zeilen EINES Laufs: je Phase eine Zeile. `vorne`/`hinten` sind die Zellen, die nur einmal je Lauf
 * stehen (Nummer, Datum, Montage …) — sie bekommen `rowSpan` = Anzahl Phasen. Gieren steht ebenfalls
 * einmal je Lauf (es ist keine Pumpzug-Groesse).
 */
export function LaufPhasenZeilen({ k, vorne, hinten, onClick, className, korr = true }: {
  k: NonNullable<BoardAttitude["laeufe"]>[number];
  vorne: (rowSpan: number) => React.ReactNode; hinten?: (rowSpan: number) => React.ReactNode;
  onClick?: () => void; className?: string; korr?: boolean;
}) {
  const t = useT();
  const zeilen = phasenDesLaufs(k, t, korr);
  const n = zeilen.length;
  return (
    <>
      {zeilen.map((z, i) => (
        <tr key={z.phase} onClick={onClick}
          className={`${className ?? ""} ${i === n - 1 ? "border-b border-slate-800" : ""}`}>
          {i === 0 && vorne(n)}
          <td className="px-3 py-1.5 whitespace-nowrap">{z.phase}</td>
          <PhasenWerte z={z} />
          {i === 0 && (
            <td rowSpan={n} className="px-3 py-1.5 text-right align-top tabular-nums">
              <span className="font-semibold text-brand-700 dark:text-brand-300">{k.gier_rms_deg_s != null ? `${k.gier_rms_deg_s.toFixed(0)}°/s` : "–"}</span>
            </td>
          )}
          {i === 0 && hinten?.(n)}
        </tr>
      ))}
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


/** Umschalter fuer eine Lage-Tabelle (Jan, 08.10.2026: „die ganze tabelle umschaltbar mit default
 *  korrigiert | ohne korrektur") — ersetzt die Klammerwerte. */
export function KorrekturUmschalter({ korr, onChange }: { korr: boolean; onChange: (v: boolean) => void }) {
  const t = useT();
  const knopf = (an: boolean, label: string) => (
    <button onClick={() => onChange(an)}
      className={`px-2.5 py-0.5 ${korr === an ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
      {label}
    </button>
  );
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs font-medium">
      {knopf(true, t("tech.colWith"))}
      {knopf(false, t("tech.colWithout"))}
    </div>
  );
}
