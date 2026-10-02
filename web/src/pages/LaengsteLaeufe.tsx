// Die laengsten EIGENEN Laeufe ueber alle Sessions, untereinander vergleichbar — dieselben drei
// Ansichten wie in einer Session (Puls ueber die Zeit, Lauf-Tabelle, Lage je Lauf), nur quer
// durch alle Sessions. Jan, 02.10.2026: „erstmal die fuenf laengsten … vielleicht spaeter andere
// Auswahlkriterien … erstmal wieder nur fuer Admins". Verlinkt ganz unten auf der Startseite.
//
// Woher die Daten kommen: die AUSWAHL liefert der Server in einem Aufruf
// (GET /api/sessions/longest-runs). Die Kurven je Lauf brauchen die volle Session (Puls je
// Trackpunkt) und bei „Handy am Brett" die Lage-Kennzahlen je Lauf — beides holt die Seite je
// betroffener Session nach. Bei fuenf Laeufen sind das hoechstens fuenf Abrufe.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, BoardAttitude, SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { CompareHrStrips, HrStripItem } from "../components/CompareHrStrips";
import { useT } from "../i18n";
import { fmtDate } from "../lib/time";
import { fmtPumpRate, pumpUnit } from "../lib/pumpRate";

type Lauf = Awaited<ReturnType<typeof api.longestRuns>>[number];
type LageZeile = NonNullable<BoardAttitude["laeufe"]>[number];

const ANZAHL = [5, 10, 20, 50];

function mmss(s: number | null | undefined) {
  if (s == null) return "–";
  const t = Math.round(s), m = Math.floor(t / 60), ss = t % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

/** Puls Start / Ø / Ende eines Laufs aus den Trackpunkten der Session (wie die Lauf-Tabelle). */
function pulsDesLaufs(s: SessionSummary | undefined, runIdx: number): [number | null, number | null, number | null] {
  const seg = s?.analysis?.segments?.[runIdx];
  const hr = s?.analysis?.track_geojson?.properties?.hr as (number | null)[] | undefined;
  if (!seg || !hr) return [null, null, null];
  const w = hr.slice(seg.i_start, seg.i_end + 1).filter((x): x is number => x != null && x > 0);
  if (!w.length) return [null, null, null];
  return [w[0], Math.round(w.reduce((a, b) => a + b, 0) / w.length), w[w.length - 1]];
}

export default function LaengsteLaeufe() {
  const t = useT();
  const [n, setN] = useState(5);
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [sessions, setSessions] = useState<Record<number, SessionSummary>>({});
  const [lage, setLage] = useState<Record<number, LageZeile[]>>({});
  // Lage ueber die Zeit je Brett-Lauf (Schluessel "session-lauf"): 10 Hz, damit der Nick-Takt
  // (~1,4 Hz) sichtbar bleibt — mit 2 Hz waere er nur noch Rauschen.
  const [kurven, setKurven] = useState<Record<string, BoardAttitude>>({});
  const [fehler, setFehler] = useState(false);
  const einheit = pumpUnit();
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => { api.getProfile().then((p) => setAdmin(!!p.is_admin)).catch(() => setAdmin(false)); }, []);

  useEffect(() => {
    if (!admin) return;
    setLaeufe(null); setFehler(false);
    api.longestRuns(n).then(setLaeufe).catch(() => setFehler(true));
  }, [n, admin]);

  // Je betroffener Session die volle Session (Puls) und bei „Handy am Brett" die Lage je Lauf.
  useEffect(() => {
    if (!laeufe) return;
    const ids = [...new Set(laeufe.map((l) => l.session_id))].filter((id) => !sessions[id]);
    ids.forEach((id) => api.session(id).then((s) => setSessions((alt) => ({ ...alt, [id]: s }))).catch(() => {}));
    const brett = [...new Set(laeufe.filter((l) => l.placement === "board").map((l) => l.session_id))]
      .filter((id) => !lage[id]);
    brett.forEach((id) => api.boardAttitude(id, { hz: 2, jeLauf: true })
      .then((a) => setLage((alt) => ({ ...alt, [id]: a.laeufe ?? [] }))).catch(() => {}));
    laeufe.filter((l) => l.placement === "board" && !kurven[`${l.session_id}-${l.run_idx}`]).forEach((l) =>
      api.boardAttitude(l.session_id, { run: l.run_idx, hz: 10, padS: 0 })
        .then((a) => setKurven((alt) => ({ ...alt, [`${l.session_id}-${l.run_idx}`]: a }))).catch(() => {}));
  }, [laeufe]); // eslint-disable-line react-hooks/exhaustive-deps

  const datum = (l: Lauf) => (l.started_at ? fmtDate(l.started_at, l.tz) : "–");
  const items: HrStripItem[] = useMemo(() => (laeufe ?? [])
    .filter((l) => sessions[l.session_id])
    .map((l) => ({ key: `${l.session_id}-${l.run_idx}`, label: l.started_at ? fmtDate(l.started_at, l.tz, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–",   // kurz; die Lauf-Nummer setzt CompareHrStrips selbst
                   session: sessions[l.session_id], runIdx: l.run_idx })),
  [laeufe, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const brettLaeufe = (laeufe ?? []).filter((l) => l.placement === "board");

  if (admin === null) return <Spinner />;
  if (!admin) return <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-slate-400">{t("longest.adminOnly")}</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold">{t("longest.title")}</h1>
      <p className="mb-4 text-sm text-slate-400">{t("longest.intro")}</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {ANZAHL.map((k) => (
          <button key={k} onClick={() => setN(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${n === k ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {t("longest.top", { n: k })}
          </button>
        ))}
      </div>

      {fehler && <Card className="p-4 text-sm text-red-400">{t("profile.error")}</Card>}
      {!laeufe && !fehler && <Spinner />}
      {laeufe && laeufe.length === 0 && <Card className="p-4 text-sm text-slate-400">{t("longest.none")}</Card>}

      {laeufe && laeufe.length > 0 && (
        <>
          {/* 1. Lauf-Tabelle: dieselben Spalten wie in der Session (sd.col*), plus woher der Lauf stammt. */}
          <Card className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">{t("longest.session")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colDuration")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colDistance")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colHrStart")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colHrAvg")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colHrEnd")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colAvg")}</th>
                  <th className="px-3 py-2 font-medium">{t("longest.max")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colPumps")}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colAvgPump", { unit: einheit === "hz" ? "Hz" : t("unit.pumpPerMin") })}</th>
                  <th className="px-3 py-2 font-medium">{t("sd.colGlide")}</th>
                </tr>
              </thead>
              <tbody>
                {laeufe.map((l, i) => {
                  const [hs, ha, he] = pulsDesLaufs(sessions[l.session_id], l.run_idx);
                  return (
                    <tr key={`${l.session_id}-${l.run_idx}`} className="border-b border-slate-800/50">
                      <td className="px-3 py-2 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link to={`/sessions/${l.session_id}?run=${l.run_idx}`} className="text-brand-600 hover:underline dark:text-brand-300">
                          {datum(l)} · #{l.run_idx + 1}
                        </Link>
                        {l.spot && <span className="ml-1 text-slate-400">· {l.spot}</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{mmss(l.duration_s)}</td>
                      <td className="px-3 py-2 tabular-nums">{l.distance_m != null ? `${Math.round(l.distance_m)} m` : "–"}</td>
                      <td className="px-3 py-2 tabular-nums">{hs ?? "–"}</td>
                      <td className="px-3 py-2 tabular-nums"><b>{ha ?? "–"}</b></td>
                      <td className="px-3 py-2 tabular-nums">{he ?? "–"}</td>
                      <td className="px-3 py-2 tabular-nums">{l.avg_speed_mps != null ? (l.avg_speed_mps * 3.6).toFixed(1) : "–"}</td>
                      <td className="px-3 py-2 tabular-nums">{l.max_speed_mps != null ? (l.max_speed_mps * 3.6).toFixed(1) : "–"}</td>
                      <td className="px-3 py-2 tabular-nums">{l.pumps ?? "–"}</td>
                      <td className="px-3 py-2 tabular-nums">{l.avg_pump_hz != null ? fmtPumpRate(l.avg_pump_hz, einheit, t) : "–"}</td>
                      <td className="px-3 py-2 tabular-nums">{l.longest_glide_s != null ? `${l.longest_glide_s.toFixed(1)} s` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* 2. Puls ueber die Zeit — dieselben Streifen wie in der Session, je Lauf eine Zeile. */}
          <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("longest.hrTitle")}</h2>
          {items.length > 0 ? <CompareHrStrips items={items} /> : <Spinner />}

          {/* 3. Lage je Lauf — nur Laeufe mit „Handy am Brett". */}
          {brettLaeufe.length > 0 && (
            <Card className="mt-6 overflow-x-auto">
              <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sd.attitudePerRun")}</p>
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-medium">{t("longest.session")}</th>
                    <th className="px-3 py-2 font-medium">{t("board.pitch")}</th>
                    <th className="px-3 py-2 font-medium">{t("board.roll")}</th>
                    <th className="px-3 py-2 font-medium">{t("board.yaw")}</th>
                    <th className="px-3 py-2 font-medium">{t("sd.colPitchRhythm")}</th>
                    <th className="px-3 py-2 font-medium">{t("sd.colHeave")}</th>
                  </tr>
                </thead>
                <tbody>
                  {brettLaeufe.map((l) => {
                    const k = lage[l.session_id]?.find((x) => x.lauf === l.run_idx);
                    return (
                      <tr key={`${l.session_id}-${l.run_idx}`} className="border-b border-slate-800/50">
                        <td className="px-3 py-2">
                          <Link to={`/sessions/${l.session_id}?run=${l.run_idx}`} className="text-brand-600 hover:underline dark:text-brand-300">
                            {datum(l)} · #{l.run_idx + 1}
                          </Link>
                        </td>
                        {!lage[l.session_id] ? <td colSpan={5} className="px-3 py-2 text-slate-500">…</td>
                          : !k?.ok ? <td colSpan={5} className="px-3 py-2 text-slate-500">–</td> : (
                          <>
                            <td className="px-3 py-2 tabular-nums">±{k.pitch_amplitude_deg?.toFixed(0)}°</td>
                            <td className="px-3 py-2 tabular-nums">±{k.roll_amplitude_deg?.toFixed(0)}°</td>
                            <td className="px-3 py-2 tabular-nums">{k.gier_rms_deg_s?.toFixed(0)}°/s</td>
                            <td className="px-3 py-2 tabular-nums">{k.pitch_hz != null ? `${k.pitch_hz.toFixed(2)} Hz` : "–"}</td>
                            <td className={`px-3 py-2 tabular-nums ${k.hub_sicher ? "" : "text-slate-500"}`}>
                              {k.hub_pp_cm != null ? (k.hub_sicher ? `${k.hub_pp_cm.toFixed(0)} cm` : `(${k.hub_pp_cm.toFixed(0)} cm)`) : "–"}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* 4. Lage UEBER DIE ZEIT je Brett-Lauf (Jan, 02.10.2026: „das gleiche unten drunter noch mit
              den Onboard-Stats, also Nick, Rollwinkel, Hub"): wie die Puls-Streifen eine Zeile je
              Lauf auf gemeinsamer Zeitachse, aber als Kurve — Nicken schwingt mit ~1,4 Hz, als
              Farbstreifen waere das nur ein Streifenmuster. */}
          {brettLaeufe.length > 0 && (
            <LageKurven laeufe={brettLaeufe} kurven={kurven} datum={datum} />
          )}
        </>
      )}
    </div>
  );
}


// Drei Kennlinien je Lauf, gemeinsame Zeitachse (laengster Lauf = volle Breite) und gemeinsame
// Skala je Groesse ueber ALLE Laeufe — sonst saehe ein ruhiger Lauf genauso wild aus wie ein wilder.
const LAGE_REIHEN: { key: "pitch_deg" | "roll_deg" | "hub_cm"; tKey: string; einheit: string; farbe: string }[] = [
  { key: "pitch_deg", tKey: "board.pitch", einheit: "°", farbe: "#22d3ee" },
  { key: "roll_deg", tKey: "board.roll", einheit: "°", farbe: "#a3e635" },
  { key: "hub_cm", tKey: "sd.colHeave", einheit: "cm", farbe: "#f59e0b" },
];

function LageKurven({ laeufe, kurven, datum }: {
  laeufe: Lauf[]; kurven: Record<string, BoardAttitude>; datum: (l: Lauf) => string;
}) {
  const t = useT();
  const da = laeufe.map((l) => ({ l, k: kurven[`${l.session_id}-${l.run_idx}`] }));
  const geladen = da.filter((x) => x.k?.ok && x.k.t_ms?.length);
  const dauerMs = Math.max(1, ...geladen.map((x) => (x.k!.t_ms![x.k!.t_ms!.length - 1] - x.k!.t_ms![0])));
  // Gemeinsamer Ausschlag je Groesse (98. Perzentil des Betrags, damit ein Ausreisser nicht alles plattdrueckt).
  const skala = Object.fromEntries(LAGE_REIHEN.map((r) => {
    const w = geladen.flatMap((x) => (x.k![r.key] ?? []) as number[]).map(Math.abs).sort((a, b) => a - b);
    return [r.key, Math.max(1, w.length ? w[Math.floor(w.length * 0.98)] : 1)];
  })) as Record<string, number>;
  const B = 600, H = 34;

  return (
    <Card className="mt-6 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("longest.attTimeTitle")}</p>
      {da.length > geladen.length && <Spinner />}
      {geladen.map(({ l, k }) => {
        const t0 = k!.t_ms![0];
        return (
          <div key={`${l.session_id}-${l.run_idx}`} className="mb-3">
            <div className="mb-0.5 text-sm text-slate-300">{datum(l)} <span className="text-slate-500">#{l.run_idx + 1}</span></div>
            {LAGE_REIHEN.map((r) => {
              const ys = (k![r.key] ?? []) as (number | null)[];
              if (!ys.length) return null;
              const pkt = k!.t_ms!.map((tm, i) => {
                const y = ys[i]; if (y == null) return null;
                const x = ((tm - t0) / dauerMs) * B;
                const yy = H / 2 - (Math.max(-1, Math.min(1, y / skala[r.key])) * (H / 2 - 2));
                return `${x.toFixed(1)},${yy.toFixed(1)}`;
              }).filter(Boolean).join(" ");
              return (
                <div key={r.key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-right text-xs text-slate-400">{t(r.tKey)}</span>
                  <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="h-[34px] min-w-0 flex-1 rounded bg-slate-900/40">
                    <line x1="0" x2={B} y1={H / 2} y2={H / 2} stroke="currentColor" className="text-slate-700" strokeWidth="0.5" />
                    <polyline points={pkt} fill="none" stroke={r.farbe} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <span className="w-14 shrink-0 text-xs tabular-nums text-slate-500">±{skala[r.key].toFixed(0)} {r.einheit}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {geladen.length > 0 && (
        <div className="ml-[4.5rem] mr-16 flex justify-between text-xs tabular-nums text-slate-500">
          <span>0:00</span><span>{mmss(dauerMs / 1000)}</span>
        </div>
      )}
    </Card>
  );
}
