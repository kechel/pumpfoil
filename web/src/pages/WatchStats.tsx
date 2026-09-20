import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { usePumpFmt } from "../lib/pumpRate";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon, WatchIcon, FoilIcon } from "../components/Icons";
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
 *  Beide Tabellen benutzen denselben Begriff — sie zeigen dieselben Uhren aus zwei Blickwinkeln,
 *  und getrennte Suchfelder waeren nur doppelte Arbeit fuer denselben Gedanken. */
function passend<T>(zeilen: T[], name: (z: T) => string, suche: string): T[] {
  const q = suche.trim().toLowerCase();
  if (!q) return [...zeilen];
  return zeilen.filter((z) => (name(z) ?? "").toLowerCase().includes(q));
}

function Uhrenqualitaet({ d, suche }: { d: Qualitaet; suche: string }) {
  const t = useT();
  if (!d || !d.modelle?.length) return null;

  // Nach Sessions sortiert. Frueher stand hier eine Urteilsspalte und die Reihenfolge folgte
  // ihr -- das Urteil ist weg (Jan, 05.09.: das sollen Nutzer selbst entscheiden), also
  // entscheidet jetzt die Datenmenge ueber die Reihenfolge.
  const zeilen = passend(d.modelle, (m) => m.modell, suche)
    .sort((a, b) => b.sessions - a.sessions);

  return (
    <section id="wie-gut" className="mt-10 scroll-mt-24">
      <h3 className="mb-1 text-lg font-bold">{t("watchQuality.title")}</h3>
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
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-left text-slate-300">
              <th className="max-w-[11rem] px-3 py-3">{t("watchStats.colWatch")}</th>
              <th className="px-4 py-3 text-right">{t("watchStats.colUsers")}</th>
              <th className="px-4 py-3 text-right">{t("watchStats.colSessions")}</th>
              <th className="px-4 py-3 text-right">{t("watchQuality.colPump")}</th>
              <th className="px-4 py-3 text-right">{t("watchQuality.colGps")}</th>
              <th className="px-4 py-3 text-right">{t("watchQuality.colHr")}</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((r) => {
              const duenn = r.nutzer <= WENIG_NUTZER;
              const gps = r.guete_gut != null ? t("watchQuality.gpsGood", { pct: r.guete_gut.toFixed(0) })
                        : r.hacc_m != null ? `${r.hacc_m.toFixed(1)} m` : "–";
              return (
                <tr key={`${r.plattform}-${r.modell}`} className="border-t border-slate-800">
                  {/* Schmaler als der Rest: die Garmin-Namen sind lang, duerfen aber
                      umbrechen statt die Tabelle zu sprengen. */}
                  <td className="max-w-[11rem] px-3 py-3 font-semibold leading-snug">{r.modell}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.nutzer}
                    {duenn && (
                      <div className="text-xs font-normal text-amber-700 dark:text-amber-400">
                        {t("watchQuality.few")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.accel_hz != null ? `${r.accel_hz.toFixed(0)} Hz` : "–"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{gps}</td>
                  {/* Puls als WERTWECHSEL je Minute. Der Anteil fehlender Werte taugte nicht:
                      bis App 1.1.29 schrieb die Apple Watch den letzten bekannten Wert in jeden
                      Punkt — 99,5 % der Punkte trugen einen Wert, er war nur alt. Ein Wechsel
                      entsteht dagegen nur bei einer echten neuen Messung. */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.puls_wechsel == null ? "–"
                      : t("watchQuality.hrRate", { n: r.puls_wechsel.toFixed(0) })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <p className="mt-3 text-sm text-slate-400">{t("watchQuality.note")}</p>
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

  // Weicher Sprung statt Sprung mit Ruck; der href bleibt stehen, damit Mittelklick und
  // Tastatur weiter funktionieren.
  const zurQualitaet = (e: React.MouseEvent) => {
    const ziel = document.getElementById("wie-gut");
    if (!ziel) return;
    e.preventDefault();
    ziel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="w-full">
      <Link to="/community" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("home.community")}
      </Link>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><WatchIcon className="h-6 w-6 text-brand-400" /> {t("watchStats.title")}</h2>
        <Link to="/foil-stats" title={t("foilStats.title")} aria-label={t("foilStats.title")}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-600 dark:text-brand-300 hover:bg-slate-700">
          <FoilIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
        </Link>
      </div>
      <p className="mb-3 text-sm text-slate-300">{t("watchStats.hint")}</p>

      {/* Suche links, Sprunglink rechts. EIN Suchfeld fuer beide Tabellen (Jan, 20.09.): sie
          zeigen dieselben Uhren aus zwei Blickwinkeln. Auf dem Handy bricht die Zeile um, der
          Link rutscht unter das Feld. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search" value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t("watchStats.search")} aria-label={t("watchStats.search")}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:w-64"
        />
        {qualitaet?.modelle?.length ? (
          <a href="#wie-gut" onClick={zurQualitaet}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300 sm:ml-auto">
            <ChevronIcon className="h-4 w-4 rotate-90" />
            {t("watchStats.scrollTo")} {t("watchQuality.title")}
          </a>
        ) : null}
      </div>

      {/* Zwei Abschnitte, zwei Ueberschriften (Jan, 20.09.: „watch stats sind beide abschnitte,
          oben foiling per watch unten rekording per watch"). Die Seitenueberschrift bleibt die
          Klammer darueber. */}
      <h3 className="mb-2 text-lg font-bold">{t("watchStats.sectionFoiling")}</h3>

      {!rows ? (
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

      <Uhrenqualitaet d={qualitaet} suche={suche} />
    </div>
  );
}
