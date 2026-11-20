import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { Card, InfoDialog, InfoKnopf, Spinner } from "./ui";
import { sportLabel } from "../lib/sportClass";
import { Reiterleiste, useReiter } from "./Reiter";
import { BeatIcon, CalendarCheckIcon, DailyAverageIcon, PlaceLineIcon, PlacingGridIcon, FoilTimeIcon, LongestRunIcon, MedalIcon, PodiumIcon, SeasonCupIcon, Sprint100Icon, SprintMinuteIcon, TrophyIcon } from "./Icons";

/**
 * Home › Performance (Idee eines Fahrers, DM 16.11.2026; Jan 18.11.: „so wie empfohlen umsetzen").
 * Je Kalendertag (UTC) die EIGENE Platzierung in vier Kategorien gegen alle Fahrer weltweit derselben Sportart
 * (Server: /api/community/performance, nur die eigenen Zeilen). Platz immer mit Feldgroesse, Vergleich ueber das
 * Perzentil (Anteil geschlagener Fahrer), weil die Felder zwischen 15 und 80 Fahrern schwanken.
 * 18.11. abends (Jan: „erstmal das was gut und schnell umsetzbar ist"): aus den Entwuerfen des Fahrers Kategorie-Tabelle,
 * Bestleistungen, Platzverlauf je Kategorie, Zeitraum „letzte 25 Tage", aufgeteilt in Uebersicht | Verlauf.
 */
type Zeile = { tag: string; wert: number; platz: number; feld: number; perzentil: number; session_id: number; run_idx?: number;
  // laufender Tag (UTC): Platz und Feld aendern sich noch, Server rechnet alle ~10 min neu -> gelb hinterlegt
  vorlaeufig?: boolean };
// Ziel eines Verweises: direkt der Lauf (?run=), bei Sprints mit eingeschalteter Sprint-Anzeige (&sprint=) — wie die
// Bestenlisten (Jan 20.11.2026). Tagessumme (foil_time_day) hat keinen Lauf -> nur die Session.
function zielUrl(k: string, z: { session_id: number; run_idx?: number }): string {
  if (z.run_idx == null) return `/sessions/${z.session_id}`;
  return `/sessions/${z.session_id}?run=${z.run_idx}${k.startsWith("sprint_") ? `&sprint=${k}` : ""}`;
}
// Zwei Tempo-, zwei Ausdauer-Kategorien (Vorschlag eines Fahrers 19.11.2026, Jan 20.11.): `run_time` (laengste Laufzeit)
// ersetzt durch die Zeit auf dem Foil des ganzen Tages — die Laufzeit war dem laengsten Lauf zu aehnlich.
const KATS = ["sprint_100m", "sprint_60s", "run_distance", "foil_time_day"] as const;
// Eigene Icons je Kategorie (Jan 20.11.2026: „zu textlastig") — Icons.tsx
const KAT_ICON: Record<string, (p: { className?: string }) => JSX.Element> = {
  sprint_100m: Sprint100Icon, sprint_60s: SprintMinuteIcon, run_distance: LongestRunIcon, foil_time_day: FoilTimeIcon,
};
function KatIcon({ k, className = "h-4 w-4" }: { k: string; className?: string }) {
  const I = KAT_ICON[k];
  return I ? <I className={`${className} shrink-0`} /> : null;
}
type Kat = typeof KATS[number];
const BUCKETS: [string, (p: number) => boolean][] = [
  ["1", (p) => p === 1], ["2", (p) => p === 2], ["3", (p) => p === 3],
  ["4–5", (p) => p >= 4 && p <= 5], ["6–10", (p) => p >= 6 && p <= 10],
  // Weitere Stufen (Jan 18.11.2026): die Felder haben 15 bis 80 Fahrer, „11+" sagte zu wenig.
  ["11–20", (p) => p >= 11 && p <= 20], ["21–30", (p) => p >= 21 && p <= 30], ["31–50", (p) => p >= 31 && p <= 50],
  ["51+", (p) => p > 50],
];
type Zeitraum = "alle" | "30" | "25";

function wertText(k: Kat, v: number): string {
  if (k === "sprint_100m" || k === "sprint_60s") return `${(v * 3.6).toFixed(1)} km/h`;
  if (k === "run_distance") return `${Math.round(v)} m`;
  const s = Math.round(v);
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} h`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

const schnitt = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const tagKurz = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "numeric" });

// Eine Farbe (Marken-Cyan), Deckkraft nach Perzentil: je dunkler, desto mehr Fahrer geschlagen. Die Zahl steht immer
// in der Zelle — die Farbe allein traegt keine Information.
function zellFarbe(perz: number): string {
  const a = 0.12 + 0.78 * Math.max(0, Math.min(1, perz / 100));
  return `rgba(34, 211, 238, ${a.toFixed(2)})`;
}

export function PerformanceBereich() {
  const t = useT();
  const [sport, setSport] = useState<"pumpfoil" | "pumpfoil+foil_scoot">("pumpfoil");
  const [zeitraum, setZeitraum] = useState<Zeitraum>("25");
  const [daten, setDaten] = useState<Awaited<ReturnType<typeof api.performance>> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const reiter = [{ id: "uebersicht", label: t("perf.tabUebersicht") }, { id: "verlauf", label: t("perf.tabVerlauf") }];
  const [sub, setSub] = useReiter("homeperf", reiter.map((r) => r.id), "uebersicht", { param: "sub" });

  useEffect(() => {
    let aus = false;
    setDaten(null); setFehler(null);
    api.performance(sport).then((d) => { if (!aus) setDaten(d); }).catch((e) => { if (!aus) setFehler(String(e)); });
    // Der laufende Tag ist vorlaeufig und wird serverseitig alle ~10 min neu gerechnet: offene Seite still nachladen
    // (nur sichtbar, Fehler beim Nachladen ignorieren — die alten Zahlen bleiben stehen).
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") api.performance(sport).then((d) => { if (!aus) setDaten(d); }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => { aus = true; window.clearInterval(iv); };
  }, [sport]);

  const grenze = useMemo(() => {
    if (zeitraum === "30") return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    if (zeitraum === "25") {
      const alleTage = [...new Set(KATS.flatMap((k) => (daten?.kategorien[k] ?? []).map((z) => z.tag)))].sort().reverse();
      return alleTage[24] ?? "";
    }
    return "";
  }, [zeitraum, daten]);
  const je: Record<Kat, Zeile[]> = useMemo(() => {
    const o = {} as Record<Kat, Zeile[]>;
    for (const k of KATS) o[k] = (daten?.kategorien[k] ?? []).filter((z) => z.tag >= grenze);
    return o;
  }, [daten, grenze]);
  const alle = KATS.flatMap((k) => je[k]);
  const tage = [...new Set(alle.map((z) => z.tag))].sort().reverse();

  return (
    <div>
      {/* Sportart + Zeitraum rechts in der Reiterleiste (Jan 20.11.2026: „sportarten & zeitraum mit in die tab-zeile") */}
      <Reiterleiste reiter={reiter} aktiv={sub} onWahl={setSub} stufe={2} rechts={<>
          {/* Foil Scoot nur zusammen mit Pumpfoil — allein zu wenige Fahrer fuer ein Feld (Jan 18.11.2026). */}
          {(["pumpfoil", "pumpfoil+foil_scoot"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSport(s)} aria-pressed={sport === s}
              className={`rounded-lg px-3 py-1.5 text-sm ${sport === s ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-950/60 text-slate-300 hover:text-slate-100"}`}>
              {sportLabel(s, t)}
            </button>
          ))}
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value as Zeitraum)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100">
            <option value="alle">{t("perf.seit", { datum: daten?.ab ? new Date(daten.ab).toLocaleDateString() : "…" })}</option>
            <option value="30">{t("perf.tage30")}</option>
            <option value="25">{t("perf.letzte25")}</option>
          </select>
      </>} />
      <div className="space-y-4">



        {fehler ? <Card className="p-4 text-sm text-red-700 dark:text-red-400">{fehler}</Card> : !daten ? <Spinner /> : alle.length === 0 ? (
          <Card className="p-6 text-center text-slate-300">{t("perf.leer")}</Card>
        ) : sub === "verlauf" ? (
          <VerlaufTab je={je} alle={alle} tage={tage} />
        ) : (
          <UebersichtTab je={je} alle={alle} tage={tage} saison={daten?.saison} />
        )}
        <p className="text-xs text-slate-400">{t("perf.intro", { n: daten?.min_feld ?? 5 })}</p>
      </div>
    </div>
  );
}

type Saison = NonNullable<Awaited<ReturnType<typeof api.performance>>["saison"]>;

/** Saison mit Punkten (Jan 20.11.2026: „die ab 1.1.27 zu fuellende gesamtpunkte-anzeige schon richtig, und die info was das
 *  ist … hinter einem (i) das das in einem popup anzeigt"). Server: community._saison. */
function SaisonKarte({ s }: { s: Saison }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const kats = s.regel.kategorien.map((k) => t(`perf.kat.${k}`)).join(" · ");
  const status = !s.gestartet ? t("perf.saison.startet", { jahr: String(s.jahr) })
    : s.rang ? t("perf.saison.rang", { rang: String(s.rang), fahrer: String(s.fahrer), tage: String(s.tage) })
    : t("perf.saison.nochKeine");
  return (
    <>
      {/* Sechste Kennzahl-Kachel (Jan 20.11.2026: „mach die gesamtpunkte doch in die zeile drunter"): Pokal links,
          Punkte mittig, „Season 2027" als Label; Status (startet am …, Rang) und Regeln im (i)-Fenster. */}
      <div className="relative rounded-xl border border-brand-500/40 bg-brand-500/10 p-3">
        <InfoKnopf label={t("perf.saisonTitel")} onClick={() => setOffen(true)} />
        <div className="flex items-center gap-3">
          <SeasonCupIcon className="h-12 w-12 shrink-0 text-brand-700 dark:text-brand-400" />
          <div className="min-w-0 flex-1">
            <div className="text-center text-2xl font-bold tabular-nums text-slate-100">{s.punkte}</div>
            <div className="text-center text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{t("perf.saisonTitel")}</div>
          </div>
        </div>
      </div>
      {offen && (
        <InfoDialog title={t("perf.saisonTitel")} text={t("perf.saison.infoIntro")} onClose={() => setOffen(false)}>
          <p className="mt-2 rounded-lg bg-brand-500/10 px-3 py-2 text-sm font-medium text-slate-100">{status}</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400"><th className="text-left font-normal">{t("perf.saison.platz")}</th>
                <th className="text-right font-normal">{t("perf.saison.punkte")}</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {s.regel.platz.map((p, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="py-0.5 text-slate-200">{i + 1}.</td>
                  <td className="py-0.5 text-right font-semibold text-slate-100">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 rounded-lg bg-brand-500/10 px-3 py-2 text-sm text-slate-200">{t("perf.saison.mitmachen", { n: String(s.regel.mitmachen) })}</p>
          <p className="mt-3 text-sm text-slate-300">{t("perf.saison.kategorien", { kats })}</p>
          <p className="mt-2 text-xs text-slate-400">{t("perf.saison.regeln", { n: String(s.regel.min_feld), max: String(s.regel.max_tag), jahr: String(s.jahr) })}</p>
        </InfoDialog>
      )}
    </>
  );
}

function UebersichtTab({ je, alle, tage, saison }: { je: Record<Kat, Zeile[]>; alle: Zeile[]; tage: string[]; saison?: Saison | null }) {
  const t = useT();
  const quote = (n: number) => (alle.length ? `${Math.round((100 * n) / alle.length)} %` : "–");
  const katName = (k: Kat) => t(`perf.kat.${k}`);
  return (
    <>
      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {([
          [t("perf.tage"), String(tage.length), CalendarCheckIcon],
          [t("perf.besserAls"), `${Math.round(schnitt(alle.map((z) => z.perzentil)))} %`, BeatIcon],
          [t("perf.siege"), String(alle.filter((z) => z.platz === 1).length), TrophyIcon],
          [t("perf.podium"), quote(alle.filter((z) => z.platz <= 3).length), PodiumIcon],
          [t("perf.top10"), quote(alle.filter((z) => z.platz <= 10).length), MedalIcon],
        ] as const).map(([l, v, I]) => (
          <Card key={l} className="p-3">
            {/* Icon ueber die ganze Hoehe links; rechts Wert und Label mittig darunter (Jan 20.11.2026) */}
            <div className="flex items-center gap-3">
              <I className="h-12 w-12 shrink-0 text-brand-700 dark:text-brand-400" />
              <div className="min-w-0 flex-1">
                <div className="text-center text-2xl font-semibold tabular-nums text-slate-100">{v}</div>
                <div className="text-center text-xs text-slate-400">{l}</div>
              </div>
            </div>
          </Card>
        ))}
        {saison && <SaisonKarte s={saison} />}
      </div>

      {/* Kategorie-Tabelle: Ø Platz immer mit Ø Feld, sonst sagt die Zahl nichts */}
      <Card className="overflow-x-auto p-3">
        <div className="mb-2 font-semibold text-slate-100">{t("perf.tabelle")}</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="py-1 pr-3 font-normal">{t("perf.spKategorie")}</th>
              <th className="px-2 py-1 text-right font-normal">{t("perf.tage")}</th>
              <th className="px-2 py-1 text-right font-normal">{t("perf.spSchnitt")}</th>
              <th className="px-2 py-1 text-right font-normal">{t("perf.spBester")}</th>
              <th className="px-2 py-1 text-right font-normal">{t("perf.spTop3")}</th>
              <th className="px-2 py-1 text-right font-normal">{t("perf.siege")}</th>
            </tr>
          </thead>
          <tbody>
            {KATS.map((k) => {
              const z = je[k];
              return (
                <tr key={k} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 font-medium text-slate-200"><span className="flex items-center gap-1.5"><KatIcon k={k} className="h-4 w-4 text-brand-700 dark:text-brand-400" />{katName(k)}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{z.length || "–"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{z.length
                    ? t("perf.schnittVon", { platz: schnitt(z.map((x) => x.platz)).toFixed(1), feld: Math.round(schnitt(z.map((x) => x.feld))) })
                    : "–"}</td>
                  {/* bester Platz = ein einzelner Tag/Lauf -> direkt zur Session (Jan 20.11.2026); bei Gleichstand der neueste */}
                  <td className="px-2 py-1.5 text-right tabular-nums">{z.length ? (() => {
                    const b = z.reduce((a, x) => (x.platz < a.platz || (x.platz === a.platz && x.tag > a.tag) ? x : a));
                    return <Link to={zielUrl(k, b)} title={b.tag} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{b.platz}</Link>;
                  })() : "–"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{z.length ? `${Math.round((100 * z.filter((x) => x.platz <= 3).length) / z.length)} %` : "–"}</td>
                  {/* genau ein Sieg = ein Lauf -> verlinkt */}
                  <td className="px-2 py-1.5 text-right tabular-nums">{z.length ? (() => {
                    const s1 = z.filter((x) => x.platz === 1);
                    return s1.length === 1
                      ? <Link to={zielUrl(k, s1[0])} title={s1[0].tag} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">1</Link>
                      : s1.length;
                  })() : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Bestleistungen: der beste eigene Wert je Kategorie im Zeitraum, mit Tag und Platz, fuehrt zur Session */}
      <Card className="p-3">
        <div className="mb-2 font-semibold text-slate-100">{t("perf.bestleistungen")}</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KATS.map((k) => {
            const z = je[k];
            const b = z.length ? z.reduce((a, x) => (x.wert > a.wert ? x : a)) : null;
            return (
              <div key={k} className="rounded-lg bg-slate-800/50 p-2.5">
                {/* wie die Kennzahl-Kacheln: Icon ueber die ganze Hoehe, Wert und Label mittig (Jan 20.11.2026) */}
                <div className="flex items-center gap-3">
                  <KatIcon k={k} className="h-12 w-12 shrink-0 text-brand-700 dark:text-brand-400" />
                  <div className="min-w-0 flex-1">
                    {b ? (
                      <Link to={zielUrl(k, b)} className="block text-center text-2xl font-semibold tabular-nums text-slate-100 hover:text-brand-700 dark:hover:text-brand-300">{wertText(k, b.wert)}</Link>
                    ) : <div className="text-center text-2xl text-slate-400">–</div>}
                    <div className="text-center text-xs text-slate-400">{katName(k)}</div>
                    {b && <div className="text-center text-xs text-slate-400">{tagKurz(b.tag)} · {t("perf.platzVon", { platz: b.platz, feld: b.feld })}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Je Kategorie: Haeufigkeit der Plaetze */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KATS.map((k) => {
          const z = je[k];
          const max = Math.max(1, ...BUCKETS.map(([, f]) => z.filter((x) => f(x.platz)).length));
          return (
            <Card key={k} className="p-3">
              <div className="flex items-center gap-1.5 font-semibold text-slate-100"><KatIcon k={k} className="h-4 w-4 text-brand-700 dark:text-brand-400" />{katName(k)}</div>
              {z.length === 0 ? <div className="mt-2 text-sm text-slate-400">{t("perf.keineTage")}</div> : <>
                <div className="mt-1 text-xs text-slate-400">
                  {t("perf.katZeile", { n: z.length, perz: Math.round(schnitt(z.map((x) => x.perzentil))) })}
                </div>
                <div className="mt-2 space-y-1">
                  {BUCKETS.map(([label, f]) => {
                    const n = z.filter((x) => f(x.platz)).length;
                    return (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="w-11 shrink-0 text-right tabular-nums text-slate-400">{label}</span>
                        <div className="h-3 flex-1 rounded bg-slate-800">
                          {n > 0 && <div className="h-3 rounded bg-brand-500" style={{ width: `${(100 * n) / max}%` }} />}
                        </div>
                        <span className="w-6 shrink-0 tabular-nums text-slate-300">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </>}
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">{t("perf.hinweis")}</p>
    </>
  );
}

function VerlaufTab({ je, alle, tage }: { je: Record<Kat, Zeile[]>; alle: Zeile[]; tage: string[] }) {
  const t = useT();
  const [kat, setKat] = useState<Kat>("sprint_100m");
  const katName = (k: Kat) => t(`perf.kat.${k}`);
  const reihe = [...je[kat]].sort((a, b) => a.tag.localeCompare(b.tag));
  const vorl = new Set(alle.filter((z) => z.vorlaeufig).map((z) => z.tag));
  return (
    <>
      {/* Platz je Tag in EINER Kategorie: Hoehe = Anteil geschlagener Fahrer (vergleichbar ueber Feldgroessen), die Zahl
          am Punkt ist der Platz. Baender ab 80 % / 50 % statt fester Plaetze — Platz 6 von 80 ist stark, 6 von 8 nicht. */}
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 font-semibold text-slate-100"><PlaceLineIcon className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400" />{t("perf.platzverlauf")}</span>
          <div className="ml-auto flex flex-wrap gap-1">
            {KATS.map((k) => (
              <button key={k} type="button" onClick={() => setKat(k)} aria-pressed={kat === k}
                className={`rounded-lg px-2.5 py-1 text-xs ${kat === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:text-slate-100"}`}>
                <span className="flex items-center gap-1"><KatIcon k={k} className="h-3.5 w-3.5" />{katName(k)}</span>
              </button>
            ))}
          </div>
        </div>
        {reihe.length === 0 ? <div className="text-sm text-slate-400">{t("perf.keineTage")}</div> : (
          <PlatzLinie reihe={reihe} kat={kat} />
        )}
        {reihe.some((z) => z.vorlaeufig) && <VorlHinweis />}
        <p className="mt-1 text-xs text-slate-400">{t("perf.platzverlaufHint")}</p>
      </Card>

      {/* Raster Kategorie x Tag: Zahl = Platz, Farbe = Anteil geschlagener Fahrer. Zeit laeuft von links nach rechts wie in
          den anderen Darstellungen (Hinweis eines Fahrers, 19.11.2026). */}
      <Card className="p-3">
        <div className="mb-2 flex items-center gap-2 font-semibold text-slate-100"><PlacingGridIcon className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400" />{t("perf.raster")}</div>
        {/* steht beim Oeffnen ganz rechts (neueste Tage, heute): rtl-Rollbereich beginnt von selbst am rechten Ende, auch
            wenn sich die Breite nach dem ersten Zeichnen noch aendert; die Tabelle selbst bleibt ltr */}
        <div className="overflow-x-auto" dir="rtl">
          <table className="text-xs" dir="ltr">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900 dark:bg-[#0a1121]" />
                {[...tage].reverse().map((d) => (
                  <th key={d} className={`px-0.5 pb-1 font-normal ${vorl.has(d) ? "rounded-t bg-amber-300/40 text-amber-800 dark:bg-amber-400/25 dark:text-amber-200" : "text-slate-400"}`}
                    title={vorl.has(d) ? `${d} · ${t("perf.vorlaeufig")}` : d}>{tagKurz(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KATS.map((k) => {
                const m = new Map(je[k].map((z) => [z.tag, z]));
                return (
                  <tr key={k}>
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-slate-900 pr-2 dark:bg-[#0a1121] text-left font-medium text-slate-300" title={katName(k)}>
                      <span className="flex items-center gap-1.5"><KatIcon k={k} className="h-4 w-4 text-brand-700 dark:text-brand-400" /><span className="hidden sm:inline">{katName(k)}</span></span></th>
                    {[...tage].reverse().map((d) => {
                      const z = m.get(d);
                      return (
                        <td key={d} className={`p-0.5 ${vorl.has(d) ? "bg-amber-300/40 dark:bg-amber-400/25" : ""}`}>
                          {z ? (
                            <Link to={zielUrl(k, z)}
                              title={`${d} · ${t("perf.platzVon", { platz: z.platz, feld: z.feld })} · ${wertText(k, z.wert)}${z.vorlaeufig ? ` · ${t("perf.vorlaeufig")}` : ""}`}
                              className="flex h-7 w-8 items-center justify-center rounded font-semibold tabular-nums text-slate-50"
                              style={{ background: zellFarbe(z.perzentil) }}>
                              {z.platz}
                            </Link>
                          ) : <div className="h-7 w-8 rounded bg-slate-800/40" />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>{t("perf.legende")}</span>
          {[10, 50, 90].map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-5 rounded" style={{ background: zellFarbe(p) }} />{p} %
            </span>
          ))}
        </div>
        {vorl.size > 0 && <VorlHinweis />}
      </Card>

      {/* Ø Perzentil je Tag ueber alle Kategorien */}
      <Card className="p-3">
        <div className="mb-2 flex items-center gap-2 font-semibold text-slate-100"><DailyAverageIcon className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400" />{t("perf.verlauf")}</div>
        <Verlauf punkte={[...tage].reverse().map((d) => ({ tag: d, perz: schnitt(alle.filter((x) => x.tag === d).map((x) => x.perzentil)), vorl: vorl.has(d) }))} />
        {vorl.size > 0 && <VorlHinweis />}
      </Card>
    </>
  );
}

const B0 = 600, H = 170, L = 34, R = 10, O = 14, U = 22;

// Diagramme auf volle Breite (Jan 20.11.2026): feste Hoehe in px, die viewBox-Breite folgt der gemessenen Breite —
// so fuellt die Linie die Karte, Schrift und Punkte bleiben unverzerrt (kein preserveAspectRatio="none").
function useViewBreite(hoeheEinheiten: number, hoehePx: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [b, setB] = useState(B0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const messen = () => { const w = el.clientWidth; if (w > 0) setB(Math.max(300, (w * hoeheEinheiten) / hoehePx)); };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hoeheEinheiten, hoehePx]);
  return [ref, b] as const;
}

function PlatzLinie({ reihe, kat }: { reihe: Zeile[]; kat: string }) {
  const t = useT();
  const nav = useNavigate();
  const [ref, B] = useViewBreite(H, 192);   // h-48
  const n = reihe.length;
  const x = (i: number) => (n === 1 ? (L + B - R) / 2 : L + ((B - L - R) * i) / (n - 1));
  const y = (p: number) => O + ((H - O - U) * (100 - p)) / 100;
  const nurZahlenJeder = n > 30 ? Math.ceil(n / 30) : 1;   // bei vielen Tagen nicht jede Zahl, sonst ueberlappen sie
  return (
    <div ref={ref} className="w-full"><svg viewBox={`0 0 ${B} ${H}`} className="h-48 w-full" role="img" aria-label={t("perf.platzverlauf")}>
      {/* Baender: ab 80 % und ab 50 % geschlagener Fahrer */}
      <rect x={L} y={y(100)} width={B - L - R} height={y(80) - y(100)} className="fill-emerald-500/15" />
      <rect x={L} y={y(80)} width={B - L - R} height={y(50) - y(80)} className="fill-amber-500/10" />
      {[0, 50, 80, 100].map((p) => (
        <g key={p}>
          <line x1={L} x2={B - R} y1={y(p)} y2={y(p)} stroke="currentColor" className="text-slate-700" strokeWidth={1} />
          <text x={L - 4} y={y(p) + 4} textAnchor="end" className="fill-slate-400" fontSize={11}>{p}%</text>
        </g>
      ))}
      {reihe.map((z, i) => z.vorlaeufig && <rect key={`v${z.tag}`} x={x(i) - 9} y={y(100)} width={18} height={y(0) - y(100)} rx={3} className="fill-amber-300/50 dark:fill-amber-400/25" />)}
      {n > 1 && <polyline fill="none" stroke="#22d3ee" strokeWidth={2} points={reihe.map((z, i) => `${x(i)},${y(z.perzentil)}`).join(" ")} />}
      {reihe.map((z, i) => (
        <g key={z.tag}>
          {/* jeder Punkt = ein Tag, eine Session -> antippen fuehrt hin (Jan 20.11.2026); grosse Trefferflaeche */}
          <circle cx={x(i)} cy={y(z.perzentil)} r={11} fill="transparent" className="cursor-pointer" onClick={() => nav(zielUrl(kat, z))}>
            <title>{`${z.tag} · ${t("perf.platzVon", { platz: z.platz, feld: z.feld })}`}</title>
          </circle>
          <circle cx={x(i)} cy={y(z.perzentil)} r={4} fill={z.vorlaeufig ? "#f59e0b" : "#22d3ee"} className="pointer-events-none">
            <title>{`${z.tag} · ${t("perf.platzVon", { platz: z.platz, feld: z.feld })} · ${Math.round(z.perzentil)} %`}</title>
          </circle>
          {i % nurZahlenJeder === 0 && (
            <text x={x(i)} y={y(z.perzentil) - 7} textAnchor="middle" className="fill-slate-200" fontSize={10} fontWeight={600}>{z.platz}</text>
          )}
        </g>
      ))}
      <text x={L} y={H - 6} className="fill-slate-400" fontSize={11}>{reihe[0].tag}</text>
      <text x={B - R} y={H - 6} textAnchor="end" className="fill-slate-400" fontSize={11}>{reihe[n - 1].tag}</text>
    </svg></div>
  );
}

// Legende fuer den gelb hinterlegten laufenden Tag (Jan 20.11.2026: „drunter in der Legende … Preliminary Results")
function VorlHinweis() {
  const t = useT();
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
      <span className="inline-block h-3 w-5 shrink-0 rounded bg-amber-300/60 dark:bg-amber-400/40" />{t("perf.vorlaeufigLegende")}
    </div>
  );
}

function Verlauf({ punkte }: { punkte: { tag: string; perz: number; vorl?: boolean }[] }) {
  const t = useT();
  const H2 = 160, O2 = 8;
  const [ref, B] = useViewBreite(H2, 176);  // h-44
  if (punkte.length < 2) return <div className="text-sm text-slate-400">{t("perf.zuWenig")}</div>;
  const x = (i: number) => L + ((B - L - R) * i) / (punkte.length - 1);
  const y = (p: number) => O2 + ((H2 - O2 - U) * (100 - p)) / 100;
  return (
    <div ref={ref} className="w-full"><svg viewBox={`0 0 ${B} ${H2}`} className="h-44 w-full" role="img" aria-label={t("perf.verlauf")}>
      {[0, 50, 100].map((p) => (
        <g key={p}>
          <line x1={L} x2={B - R} y1={y(p)} y2={y(p)} stroke="currentColor" className="text-slate-700" strokeWidth={1} />
          <text x={L - 4} y={y(p) + 4} textAnchor="end" className="fill-slate-400" fontSize={11}>{p}%</text>
        </g>
      ))}
      {punkte.map((p, i) => p.vorl && <rect key={`v${p.tag}`} x={x(i) - 9} y={y(100)} width={18} height={y(0) - y(100)} rx={3} className="fill-amber-300/50 dark:fill-amber-400/25" />)}
      <polyline fill="none" stroke="#22d3ee" strokeWidth={2} points={punkte.map((p, i) => `${x(i)},${y(p.perz)}`).join(" ")} />
      {punkte.map((p, i) => (
        <circle key={p.tag} cx={x(i)} cy={y(p.perz)} r={4} fill={p.vorl ? "#f59e0b" : "#22d3ee"}>
          <title>{`${p.tag} · ${Math.round(p.perz)} %`}</title>
        </circle>
      ))}
      <text x={L} y={H2 - 6} className="fill-slate-400" fontSize={11}>{punkte[0].tag}</text>
      <text x={B - R} y={H2 - 6} textAnchor="end" className="fill-slate-400" fontSize={11}>{punkte[punkte.length - 1].tag}</text>
    </svg></div>
  );
}
