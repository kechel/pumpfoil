// Oeffentliche Foiler-Seite EINES Nutzers — sichtbar fuer angemeldete Foiler, nicht fuer
// Suchmaschinen (der Endpunkt verlangt eine Anmeldung).
//
// Was hier NICHT steht und auch nicht dazukommen darf: eine Liste seiner Sessions.
// Produktentscheidung vom 04.09.2026 — aus gebuendelten Sessions einer Person liest man Spot,
// Wochentage und Uhrzeiten ab, also ein Bewegungsprofil. Die Rekord-Kacheln sind Einzelwerte,
// die im Community-Bereich ohnehin mit Namen und Datum stehen.
//
// Welche Bloecke erscheinen, entscheidet der SERVER anhand der Schalter des Nutzers. Diese Seite
// prueft nichts nachtraeglich: fehlt ein Feld, wird es nicht gezeigt.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, OverallStats } from "../lib/api";
import { Card, Avatar } from "../components/ui";
import { ScrollToTop } from "../components/ScrollToTop";
import { useT, useNumberFormat } from "../i18n";
import { fmtDate } from "../lib/time";

// Bewusst dieselbe Formel wie auf der eigenen Startseite (`PersonalHome.fmtDur`) — eine zweite
// Schreibweise fuer dieselbe Zahl liest sich wie ein anderer Wert.
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function Foiler() {
  const { id } = useParams();
  const t = useT();
  const nf = useNumberFormat();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.foilerProfil>> | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    setD(null); setFehler(false);
    api.foilerProfil(Number(id)).then(setD).catch(() => setFehler(true));
  }, [id]);

  if (fehler) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-slate-400">{t("foiler.notFound")}</p>
      </div>
    );
  }
  if (!d) return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-400">{t("common.loading")}</div>;

  const r = d.rekorde?.records;
  // Dieselben Kacheln und dieselbe Formatierung wie auf der eigenen Startseite — driftet die
  // Darstellung auseinander, wirken es zwei verschiedene Zahlen.
  const rekorde: { label: string; wert: number | undefined; fmt: (v: number) => string; datum?: string | null; tz?: string | null }[] = [
    { label: t("rec.farthestRun"), wert: r?.distance?.value, fmt: (v) => `${Math.round(v)} m`, datum: r?.distance?.started_at, tz: (r?.distance as any)?.tz },
    { label: t("rec.longestRun"), wert: r?.duration?.value, fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`, datum: r?.duration?.started_at, tz: (r?.duration as any)?.tz },
    { label: t("rec.topSpeed"), wert: r?.speed?.value, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h`, datum: r?.speed?.started_at, tz: (r?.speed as any)?.tz },
    { label: t("rec.longestGlide"), wert: r?.glide?.value, fmt: (v) => `${v.toFixed(1)} s`, datum: r?.glide?.started_at, tz: (r?.glide as any)?.tz },
    { label: t("rec.mostRuns"), wert: r?.runs?.value, fmt: (v) => `${Math.round(v)}`, datum: r?.runs?.started_at, tz: (r?.runs as any)?.tz },
  ];
  const s: OverallStats | undefined = d.rekorde;
  const summen = s ? [
    { label: t("side.sessions"), wert: String(s.count) },
    { label: t("stat.runs"), wert: String(s.runs_total) },
    { label: t("side.foiling"), wert: `${s.foiling_km.toFixed(1)} km` },
    { label: t("side.foilingTime"), wert: fmtDur(s.foiling_min) },
    { label: t("side.pumps"), wert: nf(s.pumps) },
  ] : [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <ScrollToTop />
      {/* Nur der Besitzer sieht diesen Hinweis — sonst waere „ist abgeschaltet" selbst eine
          Auskunft ueber ein fremdes Konto. Der Server liefert `aus` deshalb auch nur ihm. */}
      {d.ich && d.aus && (
        <Card className="mb-4 p-3 text-sm text-amber-700 dark:text-amber-300">
          {t("foiler.offHint")} <Link to="/einstellungen" className="underline">{t("nav.profile")}</Link>
        </Card>
      )}

      <div className="mb-5 flex items-center gap-3">
        <Avatar name={d.name} url={d.avatar_url} seed={d.id} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{d.name ?? "—"}</h1>
          {d.seit && (
            <p className="text-sm text-slate-400">
              {t("foiler.since", { date: fmtDate(d.seit, null, { day: "2-digit", month: "long", year: "numeric" }) })}
            </p>
          )}
        </div>
      </div>

      {/* Ausruestung und Homespot als Zeilen, nicht als Kacheln: es sind Angaben, keine Zahlen. */}
      <div className="mb-5 space-y-1.5 text-sm">
        {d.homespot && (
          <p className="text-slate-300"><span className="text-slate-400">{t("foiler.homespot")}: </span>{d.homespot}</p>
        )}
        {d.uhren && d.uhren.length > 0 && (
          <p className="text-slate-300"><span className="text-slate-400">{t("foiler.watch")}: </span>{d.uhren.join(" · ")}</p>
        )}
        {d.foils && d.foils.length > 0 && (
          <p className="text-slate-300">
            <span className="text-slate-400">{t("foiler.foil")}: </span>
            {d.foils.map((f) => `${f.brand} ${f.model} ${f.size}`).join(" · ")}
          </p>
        )}
      </div>

      {d.zeigt.records && s && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("foiler.records")}</h2>
          <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-5">
            {rekorde.map((x) => (
              <Card key={x.label} className="h-full px-2.5 py-1.5">
                <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
                <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">
                  {x.wert && x.wert > 0 ? x.fmt(x.wert) : "–"}
                </div>
                {x.wert && x.wert > 0 && x.datum && (
                  <div className="text-[10px] leading-tight tabular-nums text-slate-500">
                    {fmtDate(x.datum, x.tz ?? null, { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </div>
                )}
              </Card>
            ))}
            {summen.map((x) => (
              <Card key={x.label} className="h-full px-2.5 py-1.5">
                <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
                <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">{x.wert}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
