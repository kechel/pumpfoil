import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { Card, Spinner } from "./ui";
import { sportLabel } from "../lib/sportClass";

/**
 * Home › Performance (Idee eines Fahrers, DM 16.11.2026; Jan 18.11.: „so wie empfohlen umsetzen").
 * Je Kalendertag (UTC) die EIGENE Platzierung in vier Kategorien gegen alle Fahrer weltweit derselben Sportart
 * (Server: /api/community/performance, nur die eigenen Zeilen). Platz immer mit Feldgroesse, Vergleich ueber das
 * Perzentil (Anteil geschlagener Fahrer), weil die Felder zwischen 15 und 80 Fahrern schwanken.
 */
type Zeile = { tag: string; wert: number; platz: number; feld: number; perzentil: number; session_id: number };
const KATS = ["sprint_100m", "sprint_60s", "run_distance", "run_time"] as const;
type Kat = typeof KATS[number];
const BUCKETS: [string, (p: number) => boolean][] = [
  ["1", (p) => p === 1], ["2", (p) => p === 2], ["3", (p) => p === 3],
  ["4–5", (p) => p >= 4 && p <= 5], ["6–10", (p) => p >= 6 && p <= 10],
  // Weitere Stufen (Jan 18.11.2026): die Felder haben 15 bis 80 Fahrer, „11+" sagte zu wenig.
  ["11–20", (p) => p >= 11 && p <= 20], ["21–30", (p) => p >= 21 && p <= 30], ["31–50", (p) => p >= 31 && p <= 50],
  ["51+", (p) => p > 50],
];

function wertText(k: Kat, v: number): string {
  if (k === "sprint_100m" || k === "sprint_60s") return `${(v * 3.6).toFixed(1)} km/h`;
  if (k === "run_distance") return `${Math.round(v)} m`;
  const s = Math.round(v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

// Eine Farbe (Marken-Cyan), Deckkraft nach Perzentil: je dunkler, desto mehr Fahrer geschlagen. Die Zahl steht immer
// in der Zelle — die Farbe allein traegt keine Information.
function zellFarbe(perz: number): string {
  const a = 0.12 + 0.78 * Math.max(0, Math.min(1, perz / 100));
  return `rgba(34, 211, 238, ${a.toFixed(2)})`;
}

export function PerformanceBereich() {
  const t = useT();
  const [sport, setSport] = useState<"pumpfoil" | "pumpfoil+foil_scoot">("pumpfoil");
  const [zeitraum, setZeitraum] = useState<"alle" | "30">("alle");
  const [daten, setDaten] = useState<Awaited<ReturnType<typeof api.performance>> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aus = false;
    setDaten(null); setFehler(null);
    api.performance(sport).then((d) => { if (!aus) setDaten(d); }).catch((e) => { if (!aus) setFehler(String(e)); });
    return () => { aus = true; };
  }, [sport]);

  const grenze = useMemo(() => {
    if (zeitraum === "alle") return "";
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toISOString().slice(0, 10);
  }, [zeitraum]);
  const je: Record<Kat, Zeile[]> = useMemo(() => {
    const o = {} as Record<Kat, Zeile[]>;
    for (const k of KATS) o[k] = (daten?.kategorien[k] ?? []).filter((z) => z.tag >= grenze);
    return o;
  }, [daten, grenze]);
  const alle = KATS.flatMap((k) => je[k]);
  const tage = [...new Set(alle.map((z) => z.tag))].sort().reverse();

  const katName = (k: Kat) => t(`perf.kat.${k}`);
  const quote = (n: number) => (alle.length ? `${Math.round((100 * n) / alle.length)} %` : "–");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Foil Scoot nur zusammen mit Pumpfoil — allein zu wenige Fahrer fuer ein Feld (Jan 18.11.2026). */}
        {(["pumpfoil", "pumpfoil+foil_scoot"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSport(s)} aria-pressed={sport === s}
            className={`rounded-lg px-3 py-1.5 text-sm ${sport === s ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:text-slate-100"}`}>
            {sportLabel(s, t)}
          </button>
        ))}
        <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value as "alle" | "30")}
          className="ml-auto rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100">
          <option value="alle">{t("perf.seit", { datum: daten?.ab ? new Date(daten.ab).toLocaleDateString() : "…" })}</option>
          <option value="30">{t("perf.tage30")}</option>
        </select>
      </div>

      <p className="text-sm text-slate-400">{t("perf.intro", { n: daten?.min_feld ?? 5 })}</p>

      {fehler ? <Card className="p-4 text-sm text-red-700 dark:text-red-400">{fehler}</Card> : !daten ? <Spinner /> : alle.length === 0 ? (
        <Card className="p-6 text-center text-slate-300">{t("perf.leer")}</Card>
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              [t("perf.tage"), String(tage.length)],
              [t("perf.besserAls"), `${Math.round(alle.reduce((a, z) => a + z.perzentil, 0) / alle.length)} %`],
              [t("perf.siege"), String(alle.filter((z) => z.platz === 1).length)],
              [t("perf.podium"), quote(alle.filter((z) => z.platz <= 3).length)],
              [t("perf.top10"), quote(alle.filter((z) => z.platz <= 10).length)],
            ].map(([l, v]) => (
              <Card key={l} className="p-3">
                <div className="text-xs text-slate-400">{l}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{v}</div>
              </Card>
            ))}
          </div>

          {/* Je Kategorie: Haeufigkeit der Plaetze */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KATS.map((k) => {
              const z = je[k];
              const max = Math.max(1, ...BUCKETS.map(([, f]) => z.filter((x) => f(x.platz)).length));
              const bestPlatz = z.length ? Math.min(...z.map((x) => x.platz)) : null;
              const bestWert = z.length ? Math.max(...z.map((x) => x.wert)) : null;
              return (
                <Card key={k} className="p-3">
                  <div className="font-semibold text-slate-100">{katName(k)}</div>
                  {z.length === 0 ? <div className="mt-2 text-sm text-slate-400">{t("perf.keineTage")}</div> : <>
                    <div className="mt-1 text-xs text-slate-400">
                      {t("perf.katZeile", { n: z.length, perz: Math.round(z.reduce((a, x) => a + x.perzentil, 0) / z.length) })}
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
                    <div className="mt-2 text-xs text-slate-400">
                      {t("perf.bester", { platz: bestPlatz ?? "–", wert: bestWert != null ? wertText(k, bestWert) : "–" })}
                    </div>
                  </>}
                </Card>
              );
            })}
          </div>

          {/* Raster Kategorie x Tag: Zahl = Platz, Farbe = Anteil geschlagener Fahrer */}
          <Card className="p-3">
            <div className="mb-2 font-semibold text-slate-100">{t("perf.raster")}</div>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th />
                    {tage.map((d) => (
                      <th key={d} className="px-0.5 pb-1 font-normal text-slate-400" title={d}>
                        {new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "numeric" })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KATS.map((k) => {
                    const m = new Map(je[k].map((z) => [z.tag, z]));
                    return (
                      <tr key={k}>
                        <th className="whitespace-nowrap pr-2 text-left font-medium text-slate-300">{katName(k)}</th>
                        {tage.map((d) => {
                          const z = m.get(d);
                          return (
                            <td key={d} className="p-0.5">
                              {z ? (
                                <Link to={`/sessions/${z.session_id}`}
                                  title={`${d} · ${t("perf.platzVon", { platz: z.platz, feld: z.feld })} · ${wertText(k, z.wert)}`}
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
          </Card>

          {/* Verlauf: Ø Perzentil je Tag ueber alle Kategorien */}
          <Card className="p-3">
            <div className="mb-2 font-semibold text-slate-100">{t("perf.verlauf")}</div>
            <Verlauf punkte={[...tage].reverse().map((d) => {
              const z = alle.filter((x) => x.tag === d);
              return { tag: d, perz: z.reduce((a, x) => a + x.perzentil, 0) / z.length };
            })} />
          </Card>

          <p className="text-xs text-slate-400">{t("perf.hinweis")}</p>
        </>
      )}
    </div>
  );
}

function Verlauf({ punkte }: { punkte: { tag: string; perz: number }[] }) {
  const t = useT();
  const B = 600, H = 160, L = 34, R = 8, O = 8, U = 22;
  if (punkte.length < 2) return <div className="text-sm text-slate-400">{t("perf.zuWenig")}</div>;
  const x = (i: number) => L + ((B - L - R) * i) / (punkte.length - 1);
  const y = (p: number) => O + ((H - O - U) * (100 - p)) / 100;
  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="h-44 w-full" role="img" aria-label={t("perf.verlauf")}>
      {[0, 50, 100].map((p) => (
        <g key={p}>
          <line x1={L} x2={B - R} y1={y(p)} y2={y(p)} stroke="currentColor" className="text-slate-700" strokeWidth={1} />
          <text x={L - 4} y={y(p) + 4} textAnchor="end" className="fill-slate-400" fontSize={11}>{p}%</text>
        </g>
      ))}
      <polyline fill="none" stroke="#22d3ee" strokeWidth={2} points={punkte.map((p, i) => `${x(i)},${y(p.perz)}`).join(" ")} />
      {punkte.map((p, i) => (
        <circle key={p.tag} cx={x(i)} cy={y(p.perz)} r={4} fill="#22d3ee">
          <title>{`${p.tag} · ${Math.round(p.perz)} %`}</title>
        </circle>
      ))}
      <text x={L} y={H - 6} className="fill-slate-400" fontSize={11}>{punkte[0].tag}</text>
      <text x={B - R} y={H - 6} textAnchor="end" className="fill-slate-400" fontSize={11}>{punkte[punkte.length - 1].tag}</text>
    </svg>
  );
}
