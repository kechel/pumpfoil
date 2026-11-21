import { Fragment, useEffect, useState } from "react";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { passtZu } from "../lib/suche";
import { Link } from "react-router-dom";
import { api, type WatchQualityRow } from "../lib/api";
import { usePumpFmt } from "../lib/pumpRate";
import { Card, Spinner } from "../components/ui";
import { WatchIcon, FoilIcon } from "../components/Icons";
import { Reiterleiste, useReiter } from "../components/Reiter";
import { useSort, SortHead } from "../components/SortableTable";
import { useT } from "../i18n";

type Row = Awaited<ReturnType<typeof api.watchStats>>[number];
type Qualitaet = Awaited<ReturnType<typeof api.watchQuality>> | null;

/**
 * „Wie gut zeichnen die Uhren auf?" — gemessen an unseren eigenen Aufnahmen, nicht an
 * Herstellerangaben (Jan, 05.09.2026).
 *
 * Die Zahlen kommen als fertiger Snapshot vom Server (`/api/app/watch-quality`, erzeugt von
 * `scripts/uhren-qualitaet.py`). Live rechnen ginge nicht: das Skript liest je Session die
 * Rohpunkte und laeuft Minuten.
 *
 * Drei Dinge stehen bewusst dabei, weil die Tabelle sonst mehr behauptet, als sie weiss:
 * - **Stand und Datenbasis** ueber der Tabelle. Der Snapshot wird alle paar Wochen erneuert.
 * - **Zahl der Fahrer je Modell**, und ab `WENIG_NUTZER` abwaerts ein sichtbarer Hinweis.
 *   Die Zahlen bleiben trotzdem stehen: es gibt bewusst KEIN Urteil in dieser Tabelle (Jan,
 *   05.09.) -- wer selbst entscheiden soll, braucht die Werte und nicht Striche.
 * - **Ortungsguete steht getrennt.** Garmin liefert eine Stufe (Connect IQ, „GOOD"), die
 *   anderen Meter — eine gemeinsame Spalte waere schlicht falsch.
 */
// Ab dieser Zahl abwaerts (also 3 und weniger) wird die Zeile als duenn gekennzeichnet.
const WENIG_NUTZER = 3;

/** Freitext-Filter ueber den Modellnamen: Teiltreffer, Gross/Klein egal, leer = alles.
 *  Akzente und ® zaehlen nicht (lib/suche.ts: „vivo" findet „vívoactive®").
 *  Beide Tabellen benutzen denselben Begriff — sie zeigen dieselben Uhren aus zwei Blickwinkeln,
 *  und getrennte Suchfelder waeren nur doppelte Arbeit fuer denselben Gedanken. */
function passend<T>(zeilen: T[], name: (z: T) => string, suche: string): T[] {
  const q = suche.trim().toLowerCase();
  if (!q) return [...zeilen];
  return zeilen.filter((z) => passtZu(name(z), q));
}

/** Woher die Zahl kommt (Jan, 15.10.2026: neuere Daten nehmen, wo die App sich geaendert hat,
 *  und das kenntlich machen). `ab` = nur Aufnahmen ab dieser App-Version, `alt` = es gibt nur
 *  Aufnahmen aus aelteren Versionen, die heutige App zeichnet anders auf. */
function Herkunft({ ab, alt }: { ab?: string | null; alt?: boolean }) {
  const t = useT();
  if (ab) return <div className="text-xs font-normal text-slate-400">{t("watchQuality.since", { v: ab })}</div>;
  if (alt) return <div className="text-xs font-normal text-amber-700 dark:text-amber-400">{t("watchQuality.oldApp")}</div>;
  return null;
}

/** Eine Tabellenzeile der Auswertung. `unter` = Unterzeile eines Modells mit beiden Wegen (Name steht in der
 *  Kopfzeile darueber, hier nur der Weg); sonst steht der Name hier, mit dem Weg als Kennzeichen darunter. */
function QualiZeile({ r, unter, wegZeigen }: { r: WatchQualityRow; unter: boolean; wegZeigen: boolean }) {
  const t = useT();
  const duenn = r.nutzer <= WENIG_NUTZER;
  const weg = r.weg === "gc" ? t("watchQuality.viaGc") : t("watchQuality.viaApp");
  const gps = r.guete_gut != null ? t("watchQuality.gpsGood", { pct: r.guete_gut.toFixed(0) })
            : r.hacc_m != null ? `${r.hacc_m.toFixed(1)} m`
            // Ohne Guete/Meter (Garmin-Connect-Datei): Anteil eingefrorener Punkte in Fahrt — sonst sah „–" aus wie „kein GPS".
            : r.ortung_steht != null ? t("watchQuality.gpsStale", { pct: r.ortung_steht.toFixed(1) }) : "–";
  return (
    <tr className={unter ? "border-t border-slate-800/50" : "border-t border-slate-800"}>
      {/* Schmaler als der Rest: die Garmin-Namen sind lang, duerfen aber umbrechen statt die Tabelle zu sprengen. */}
      <td className={unter ? "max-w-[11rem] py-2 pl-6 pr-3 text-slate-300" : "max-w-[11rem] px-3 py-3 font-semibold leading-snug"}>
        {unter ? weg : r.modell}
        {!unter && wegZeigen && <div className="text-xs font-normal text-slate-400">{weg}</div>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {r.nutzer}
        {duenn && <div className="text-xs font-normal text-amber-700 dark:text-amber-400">{t("watchQuality.few")}</div>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
      {/* Pump-Erkennung: Rate UND Anteil auswertbarer Sessions. Ueber Garmin Connect haengt das daran, ob unsere App
          mitlief und die Uhr Beschleunigung in die Datei schreibt — die Rate allein fuehrte dort in die Irre. */}
      <td className="px-4 py-3 text-right tabular-nums">
        {r.accel_hz != null ? `${r.accel_hz.toFixed(0)} Hz` : t("watchQuality.gpsOnly")}
        {/* Garmin Connect zaehlt nur Dateien MIT Beschleunigung (scripts/uhren-qualitaet.py) — dort waere es immer 100 %. */}
        {r.accel_hz != null && r.weg !== "gc" && (
          <div className="text-xs font-normal text-slate-400">
            {t("watchQuality.pumpShare", { pct: (r.mit_accel ?? Math.max(0, 100 - r.gps_only)).toFixed(0) })}
          </div>
        )}
        {r.accel_hz != null && <Herkunft ab={r.accel_ab} alt={r.accel_alt} />}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{gps}</td>
      {/* Puls als WERTWECHSEL je Minute. Der Anteil fehlender Werte taugte nicht: bis App 1.1.29 schrieb die Apple
          Watch den letzten bekannten Wert in jeden Punkt. Ein Wechsel entsteht nur bei einer echten neuen Messung. */}
      <td className="px-4 py-3 text-right tabular-nums">
        {r.puls_wechsel == null ? "–" : t("watchQuality.hrRate", { n: r.puls_wechsel.toFixed(0) })}
        {r.puls_wechsel != null && <Herkunft ab={r.puls_ab} alt={r.puls_alt} />}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {r.vollstaendig != null ? `${r.vollstaendig.toFixed(0)} %` : "–"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{dauerHm(r.laengste_accel_s)}</td>
    </tr>
  );
}

/** Sekunden -> „1:32 h" */
function dauerHm(s?: number | null): string {
  if (s == null) return "–";
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/** Sortierwert eines Modells (alle Zeilen: App und Garmin Connect) je Spalte — Jan 21.11.2026: „spalten … direkt sortierbar
 *  bei klick auf den spaltentitel". Bei zwei Wegen zaehlt der bessere Wert; leere Werte landen unten (useSort-Regel). */
const QUALI_SORT: Record<string, (rs: WatchQualityRow[]) => string | number | null> = {
  modell: (rs) => rs[0].modell,
  nutzer: (rs) => Math.max(...rs.map((r) => r.nutzer)),
  sessions: (rs) => rs.reduce((n, r) => n + r.sessions, 0),
  pump: (rs) => best(rs.map((r) => r.accel_hz)),
  // Ortung: Garmin liefert eine Guete-Stufe, die anderen Meter — nicht vergleichbar; sortiert wird nach der Garmin-Guete,
  // die anderen stehen unten.
  gps: (rs) => best(rs.map((r) => r.guete_gut)),
  puls: (rs) => best(rs.map((r) => r.puls_wechsel)),
  komplett: (rs) => best(rs.map((r) => r.vollstaendig ?? null)),
  laengste: (rs) => best(rs.map((r) => r.laengste_accel_s ?? null)),
};
function best(werte: (number | null | undefined)[]): number | null {
  const w = werte.filter((x): x is number => x != null);
  return w.length ? Math.max(...w) : null;
}

function Uhrenqualitaet({ d, suche }: { d: Qualitaet; suche: string }) {
  const t = useT();
  const [sk, setSk] = useState("sessions");
  const [sd, setSd] = useState<"asc" | "desc">("desc");
  const sort = { key: sk, dir: sd, toggle: (k: string, def: "asc" | "desc" = "desc") => {
    if (k === sk) setSd(sd === "asc" ? "desc" : "asc"); else { setSk(k); setSd(def); } } };
  if (!d || !d.modelle?.length) return null;

  // Je Modell beide Wege (App, Garmin Connect, 15.11.2026) untereinander. Nach Sessions sortiert -- das Urteil ist
  // weg (Jan, 05.09.: das sollen Nutzer selbst entscheiden), also entscheidet die Datenmenge ueber die Reihenfolge.
  const alle = [...d.modelle.map((r) => ({ ...r, weg: r.weg ?? "app" })), ...(d.modelle_konto ?? [])];
  // Kennzeichen nur, wo es unterscheidet: Unterzeilen und reine Garmin-Connect-Zeilen (fast alles ist App).
  const mitKonto = (d.modelle_konto?.length ?? 0) > 0;
  const gruppen = new Map<string, WatchQualityRow[]>();
  for (const r of passend(alle, (m) => m.modell, suche)) {
    gruppen.set(r.modell, [...(gruppen.get(r.modell) ?? []), r]);
  }
  const wert = QUALI_SORT[sk] ?? QUALI_SORT.sessions;
  const zeilen = [...gruppen.entries()]
    .map(([modell, rs]) => ({ modell, rs: rs.sort((a, b) => (a.weg === "gc" ? 1 : 0) - (b.weg === "gc" ? 1 : 0)) }))
    .sort((a, b) => {
      const av = wert(a.rs), bv = wert(b.rs);
      if (av == null && bv == null) return a.modell.localeCompare(b.modell);
      if (av == null) return 1;                     // leere immer unten
      if (bv == null) return -1;
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return (sd === "asc" ? c : -c) || a.modell.localeCompare(b.modell);   // eindeutig: bei Gleichstand der Name
    });

  return (
    <section id="wie-gut">
      <p className="mb-2 text-sm text-slate-400">
        {t("watchQuality.lead", { sessions: String(d.sessions ?? 0), hours: String(d.stunden ?? 0),
                                  date: d.stand })}
      </p>
      {/* Ehrlicher Vorbehalt statt Kleingedrucktem: die Auswertung ist jung, und die duennen
          Zeilen sind es besonders. Steht bewusst UEBER der Tabelle — wer nur die Zahlen sieht,
          liest den Hinweis darunter nicht mehr. */}
      <p className="mb-3 rounded-lg bg-slate-800/60 p-2.5 text-sm text-slate-300">
        {t("watchQuality.new")}
      </p>
      {zeilen.length === 0 ? (
        <Card className="p-6 text-center text-slate-300">{t("watchStats.noMatch")}</Card>
      ) : (
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-left text-slate-300">
              <SortHead label={t("watchStats.colWatch")} sortKey="modell" sort={sort} align="left" defaultDir="asc" />
              <SortHead label={t("watchStats.colUsers")} sortKey="nutzer" sort={sort} />
              <SortHead label={t("watchStats.colSessions")} sortKey="sessions" sort={sort} />
              <SortHead label={t("watchQuality.colPump")} sortKey="pump" sort={sort} />
              <SortHead label={t("watchQuality.colGps")} sortKey="gps" sort={sort} />
              <SortHead label={t("watchQuality.colHr")} sortKey="puls" sort={sort} />
              <SortHead label={t("watchQuality.colComplete")} sortKey="komplett" sort={sort} />
              <SortHead label={t("watchQuality.colLongest")} sortKey="laengste" sort={sort} />
            </tr>
          </thead>
          <tbody>
            {zeilen.map(({ modell, rs }) => rs.length === 1 ? (
              <QualiZeile key={modell} r={rs[0]} unter={false} wegZeigen={rs[0].weg === "gc"} />
            ) : (
              <Fragment key={modell}>
                {/* Kopfzeile nur mit dem Namen: Nutzer lassen sich nicht addieren (dieselben fahren oft beide Wege). */}
                <tr className="border-t border-slate-800">
                  <td colSpan={8} className="px-3 pb-1 pt-3 font-semibold leading-snug">{modell}</td>
                </tr>
                {rs.map((r) => <QualiZeile key={`${modell}-${r.weg}`} r={r} unter wegZeigen />)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <p className="mt-3 text-sm text-slate-400">{t("watchQuality.note")}</p>
      {mitKonto && <p className="mt-2 text-sm text-slate-400">{t("watchQuality.noteWays")}</p>}
    </section>
  );
}

// Community-Vergleich je Uhr-Modell: was wird mit welcher Uhr gefahren.
export default function WatchStats() {
  const t = useT();
  const pf = usePumpFmt();
  const [rows, setRows] = useState<Row[] | null>(null);
  // Die Qualitaets-Zahlen holt die SEITE, nicht der Abschnitt: der Sprunglink oben darf nur
  // erscheinen, wenn es unten auch etwas gibt (der Abschnitt zeichnet ohne Daten gar nichts).
  const [qualitaet, setQualitaet] = useState<Qualitaet>(null);
  const [suche, setSuche] = useState("");
  // GEFILTERT in die Sortierung, nicht danach: sonst sortiert `useSort` den ganzen Bestand und
  // die Auswahl darunter waere eine andere Reihenfolge als die, die man angeklickt hat.
  const gefiltert = rows ? passend(rows, (r) => r.watch, suche) : null;
  const sort = useSort<Row>(gefiltert, "sessions", "desc");

  useEffect(() => { api.watchStats().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { api.watchQuality().then(setQualitaet).catch(() => setQualitaet(null)); }, []);

  // Die beiden Abschnitte als Reiter (Jan, 05.11.2026: „mach mal in watch stats die beiden abschnitte auch in tabs");
  // bis dahin untereinander mit einem Sprunglink nach unten. Der zweite Reiter nur, wenn es Qualitaets-Zahlen gibt.
  const mitQualitaet = !!qualitaet?.modelle?.length;
  const reiter = [
    { id: "foiling", label: t("watchStats.sectionFoiling") },
    ...(mitQualitaet ? [{ id: "qualitaet", label: t("watchQuality.title") }] : []),
  ];
  const [tab, setTab] = useReiter("watchstats", ["foiling", "qualitaet"], "foiling", { merken: true });
  const aktiv = tab === "qualitaet" && mitQualitaet ? "qualitaet" : "foiling";

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><ZurueckPfeil fallback="/community" /><WatchIcon className="h-6 w-6 text-brand-400" /> {t("watchStats.title")}</h2>
        <Link to="/foil-stats" title={t("foilStats.title")} aria-label={t("foilStats.title")}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-600 dark:text-brand-300 hover:bg-slate-700">
          <FoilIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
        </Link>
      </div>
      <p className="mb-3 text-sm text-slate-300">{t("watchStats.hint")}</p>

      {/* Reiter, darunter EIN Suchfeld fuer beide Tabellen (Jan, 20.09.): sie zeigen dieselben Uhren aus zwei
          Blickwinkeln, die Suche bleibt beim Reiterwechsel stehen. */}
      <Reiterleiste reiter={reiter} aktiv={aktiv} onWahl={setTab} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search" value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t("watchStats.search")} aria-label={t("watchStats.search")}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:w-64"
        />
      </div>

      {/* Zwei Abschnitte (Jan, 20.09.: „foiling per watch" und „rekording per watch"), seit 05.11.2026 als Reiter;
          die Reiter tragen die Ueberschriften. */}
      {aktiv === "qualitaet" ? <Uhrenqualitaet d={qualitaet} suche={suche} /> : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("watchStats.none")}</Card>
      ) : sort.sorted!.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("watchStats.noMatch")}</Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/70 text-left text-slate-300">
                <SortHead label={t("watchStats.colWatch")} sortKey="watch" sort={sort} align="left" defaultDir="asc" />
                <SortHead label={t("watchStats.colSessions")} sortKey="sessions" sort={sort} />
                <SortHead label={t("watchStats.colUsers")} sortKey="users" sort={sort} />
                <SortHead label={t("watchStats.colKm")} sortKey="foiling_km" sort={sort} />
                <SortHead label={t("watchStats.colAvgSpeed")} sortKey="avg_speed_kmh" sort={sort} />
                <SortHead label={t("watchStats.colBestDist")} sortKey="best_distance_m" sort={sort} />
                <SortHead label={t("watchStats.colBestSpeed")} sortKey="best_speed_kmh" sort={sort} />
                <SortHead label={t("watchStats.colAvgPump")} sortKey="avg_pump_hz" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted!.map((r) => (
                <tr key={r.watch} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-semibold">{r.watch}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.foiling_km} km</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_speed_kmh != null ? `${r.avg_speed_kmh.toFixed(1)} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_distance_m != null ? `${r.best_distance_m} m` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_speed_kmh != null ? `${r.best_speed_kmh.toFixed(1)} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pf.fmt(r.avg_pump_hz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
