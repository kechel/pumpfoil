// Die laengsten EIGENEN Laeufe ueber alle Sessions, untereinander vergleichbar — dieselben drei
// Ansichten wie in einer Session (Puls ueber die Zeit, Lauf-Tabelle, Lage je Lauf), nur quer
// durch alle Sessions. Jan, 02.10.2026: „erstmal die fuenf laengsten … vielleicht spaeter andere
// Auswahlkriterien". Seit 02.10.2026 fuer alle; Knopf ganz unten auf der Startseite.
//
// Woher die Daten kommen: die AUSWAHL liefert der Server in einem Aufruf
// (GET /api/sessions/longest-runs). Die Kurven je Lauf brauchen die volle Session (Puls je
// Trackpunkt) und bei „Handy am Brett" die Lage-Kennzahlen je Lauf — beides holt die Seite je
// betroffener Session nach. Bei fuenf Laeufen sind das hoechstens fuenf Abrufe.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api, BoardAttitude, SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { CompareHrStrips, HrStripItem } from "../components/CompareHrStrips";
import { useT } from "../i18n";
import { fmtDate } from "../lib/time";
import { fmtPumpRate, pumpUnit } from "../lib/pumpRate";
import { useCompare } from "../lib/compare";

type Lauf = Awaited<ReturnType<typeof api.longestRuns>>[number] & {
  fahrer?: string | null;   // nur bei Laeufen aus dem Vergleichskorb, die einem anderen gehoeren
};
type LageZeile = NonNullable<BoardAttitude["laeufe"]>[number];

const ANZAHL = [5, 10, 20];   // Jan, 02.10.2026: „maximal bis top 20"

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
  // Die Ansicht steht in der ADRESSE (Top x, markierte Laeufe) — so bringt der Zurueck-Knopf der
  // Session-Detailansicht genau hierher zurueck (Jan, 02.10.2026). `replace`, damit das Markieren
  // nicht jede Zeile einzeln in den Browser-Verlauf schreibt.
  const [suche, setSuche] = useSearchParams();
  const ort = useLocation();
  const n = [5, 10, 20].includes(Number(suche.get("n"))) ? Number(suche.get("n")) : 5;
  const setN = (k: number) => { const q = new URLSearchParams(suche); q.set("n", String(k)); setSuche(q, { replace: true }); };
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [sessions, setSessions] = useState<Record<number, SessionSummary>>({});
  const [lage, setLage] = useState<Record<number, LageZeile[]>>({});
  // Eigene Auswahl fuer den Lage-Abschnitt: die N laengsten Laeufe MIT Handy am Brett (Jan,
  // 02.10.2026: „bei Top 5 im Abschnitt fuer die Attitude die 5 laengsten mit phone on board") —
  // unabhaengig von der Gesamtliste, deren laengste Laeufe meist von der Uhr stammen.
  const [brettLaeufe, setBrettLaeufe] = useState<Lauf[] | null>(null);
  // MARKIERTE Laeufe, gemeinsam fuer alle drei Ansichten (Jan, 02.10.2026: „egal in welcher der
  // drei Tabellen ich auf eine Zeile klicke … in allen Tabellen hervorheben und nach ganz oben
  // schieben, Mehrfachauswahl"). Reihenfolge = Reihenfolge des Markierens.
  const markiert = useMemo(() => (suche.get("m") ?? "").split(",").filter((x) => /^\d+-\d+$/.test(x)), [suche]);
  const setMarkiert = (f: string[] | ((alt: string[]) => string[])) => {
    const neu = typeof f === "function" ? f(markiert) : f;
    const q = new URLSearchParams(suche);
    if (neu.length) q.set("m", neu.join(",")); else q.delete("m");
    setSuche(q, { replace: true });
  };
  const markSet = useMemo(() => new Set(markiert), [markiert]);
  const umschalten = (k: string) => setMarkiert((alt) => alt.includes(k) ? alt.filter((x) => x !== k) : [...alt, k]);
  const schl = (l: Lauf) => `${l.session_id}-${l.run_idx}`;

  // VERGLEICHSKORB (Jan, 02.10.2026: „die laengsten Laeufe der Sessions, die ich zum Vergleich
  // markiert habe, ebenso anzeigen, auch die von anderen Fahrern, mit anderer Farbmarkierung"):
  // ein Lauf im Korb -> genau dieser; eine ganze Session -> ihr laengster Lauf.
  const korb = useCompare();
  useEffect(() => {
    korb.map((r) => r.sessionId).filter((id) => !sessions[id])
      .forEach((id) => api.session(id).then((x) => setSessions((alt) => ({ ...alt, [id]: x }))).catch(() => {}));
  }, [korb]); // eslint-disable-line react-hooks/exhaustive-deps
  const vergleich: Lauf[] = useMemo(() => korb.flatMap((r) => {
    const x = sessions[r.sessionId]; const segs = x?.analysis?.segments ?? [];
    if (!x || !segs.length) return [];
    const ri = r.runIdx ?? segs.reduce((b, sg, i) => ((sg.duration_s ?? 0) > (segs[b].duration_s ?? 0) ? i : b), 0);
    const sg = segs[ri]; if (!sg) return [];
    return [{ session_id: r.sessionId, run_idx: ri, started_at: x.started_at, tz: x.tz ?? null,
      spot: x.place_name ?? null, placement: x.placement ?? null, duration_s: sg.duration_s ?? null,
      distance_m: sg.distance_m ?? null, avg_speed_mps: sg.avg_speed_mps ?? null, max_speed_mps: sg.max_speed_mps ?? null,
      pumps: sg.pumps ?? null, avg_pump_hz: sg.avg_pump_hz ?? null, longest_glide_s: sg.longest_glide_s ?? null,
      t_start_ms: null, fahrer: x.owned === false ? (x.owner_name ?? "—") : null } as Lauf];
  }), [korb, sessions]);
  const vglSet = useMemo(() => new Set(vergleich.map(schl)), [vergleich]);
  useEffect(() => {
    vergleich.filter((l) => l.placement === "board" && !lage[l.session_id]).forEach((l) =>
      api.boardAttitude(l.session_id, { hz: 2, jeLauf: true })
        .then((a) => setLage((alt) => ({ ...alt, [l.session_id]: a.laeufe ?? [] }))).catch(() => {}));
  }, [vergleich]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reihenfolge in jeder Ansicht: markierte (Markier-Reihenfolge) -> Vergleichskorb -> Rest.
  // MARKIERTE erscheinen in JEDER Ansicht, auch wenn sie dort nicht in den Top x stehen (Jan,
  // 02.10.2026: „wenn ich einen Lauf aus der Phone-on-board-Tabelle waehle, soll der auch in den
  // beiden anderen Tabellen angezeigt werden"). Die Lage-Tabelle nimmt davon nur Brett-Laeufe —
  // fuer die anderen gibt es keine Lage.
  function anordnen(arr: Lauf[], mitVergleich: Lauf[], nurBrett = false): Lauf[] {
    const bekannt = [...(laeufe ?? []), ...(brettLaeufe ?? []), ...vergleich];
    const zusatz = markiert.map((k) => bekannt.find((l) => schl(l) === k))
      .filter((x): x is Lauf => !!x && (!nurBrett || x.placement === "board"));
    const alle: Lauf[] = [];
    for (const l of [...arr, ...mitVergleich, ...zusatz]) if (!alle.some((a) => schl(a) === schl(l))) alle.push(l);
    const oben = markiert.map((k) => alle.find((l) => schl(l) === k)).filter((x): x is Lauf => !!x);
    const vgl = alle.filter((l) => vglSet.has(schl(l)) && !markSet.has(schl(l)));
    return [...oben, ...vgl, ...alle.filter((l) => !markSet.has(schl(l)) && !vglSet.has(schl(l)))];
  }
  // Scrollposition fuer den Rueckweg aus der Session-Detailansicht.
  const merkeScroll = () => { try { sessionStorage.setItem("laeufeScroll", String(window.scrollY)); } catch { /* egal */ } };
  const zuSession = (l: Lauf) => ({ pathname: `/sessions/${l.session_id}`, search: `?run=${l.run_idx}` });
  const zurueckState = { zurueck: `${ort.pathname}${ort.search}`, zurueckText: t("longest.title") };
  // Rueckweg aus der Session-Detailansicht: Position wiederherstellen, sobald die Liste da ist,
  // und bis zu ~4 s nachsetzen — das Seiten-Scrollen der App und die nachladenden Puls-Streifen
  // (die Seite waechst) schieben sie sonst wieder weg.
  const listeDa = !!laeufe;
  useEffect(() => {
    if (!listeDa) return;
    let y: string | null = null;
    try { y = sessionStorage.getItem("laeufeScroll"); sessionStorage.removeItem("laeufeScroll"); } catch { /* egal */ }
    if (!y) return;
    const ziel = Number(y);
    let n = 0;
    const iv = setInterval(() => {
      if (Math.abs(window.scrollY - ziel) > 4) window.scrollTo(0, ziel);
      if (++n >= 26) clearInterval(iv);
    }, 150);
    return () => clearInterval(iv);
  }, [listeDa]);
  const zeilenFarbe = (l: Lauf) => markSet.has(schl(l)) ? "bg-brand-500/20" : vglSet.has(schl(l)) ? "bg-amber-500/20" : "";
  const [fehler, setFehler] = useState(false);
  const einheit = pumpUnit();
  // Seit 02.10.2026 fuer alle (Jan: „jetzt auch fuer alle anzeigen, nicht mehr nur Admins").

  useEffect(() => {
    setLaeufe(null); setBrettLaeufe(null); setFehler(false);
    api.longestRuns(n).then(setLaeufe).catch(() => setFehler(true));
    api.longestRuns(n, true).then(setBrettLaeufe).catch(() => setBrettLaeufe([]));
  }, [n]);
  useEffect(() => {
    // Volle Session auch fuer Brett-Laeufe: markiert man einen, erscheint er in den Puls-Streifen.
    (brettLaeufe ?? []).map((l) => l.session_id).filter((id, i, a) => a.indexOf(id) === i && !sessions[id])
      .forEach((id) => api.session(id).then((x) => setSessions((alt) => ({ ...alt, [id]: x }))).catch(() => {}));
    (brettLaeufe ?? []).map((l) => l.session_id).filter((id, i, a) => a.indexOf(id) === i && !lage[id])
      .forEach((id) => api.boardAttitude(id, { hz: 2, jeLauf: true })
        .then((a) => setLage((alt) => ({ ...alt, [id]: a.laeufe ?? [] }))).catch(() => {}));
  }, [brettLaeufe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Je betroffener Session die volle Session (Puls) und bei „Handy am Brett" die Lage je Lauf.
  useEffect(() => {
    if (!laeufe) return;
    const ids = [...new Set(laeufe.map((l) => l.session_id))].filter((id) => !sessions[id]);
    ids.forEach((id) => api.session(id).then((s) => setSessions((alt) => ({ ...alt, [id]: s }))).catch(() => {}));
  }, [laeufe]); // eslint-disable-line react-hooks/exhaustive-deps

  const datum = (l: Lauf) => (l.started_at ? fmtDate(l.started_at, l.tz) : "–");
  const items: HrStripItem[] = useMemo(() => anordnen(laeufe ?? [], vergleich)
    .filter((l) => sessions[l.session_id])
    .map((l) => ({ key: `${l.session_id}-${l.run_idx}`, label: (l.fahrer ? `${l.fahrer} · ` : "") + (l.started_at ? fmtDate(l.started_at, l.tz, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–"),   // kurz; die Lauf-Nummer setzt CompareHrStrips selbst
                   session: sessions[l.session_id], runIdx: l.run_idx })),
  [laeufe, brettLaeufe, sessions, markiert, vergleich]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="py-2">   {/* volle Breite (Jan, 02.10.2026) — der Rahmen der App polstert schon */}
      <h1 className="mb-4 text-xl font-bold">{t("longest.title")}</h1>
      <div className="mb-5 flex flex-wrap gap-2">
        {ANZAHL.map((k) => (
          <button key={k} onClick={() => setN(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${n === k ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {t("longest.top", { n: k })}
          </button>
        ))}
        {markiert.length > 0 && (
          <button onClick={() => setMarkiert([])} className="rounded-lg px-3 py-1.5 text-sm text-brand-600 hover:underline dark:text-brand-300">
            {t("longest.unmark", { n: markiert.length })}
          </button>
        )}
      </div>
      <p className="-mt-3 mb-4 text-sm text-slate-400">{t("longest.markHint")}</p>

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
                {anordnen(laeufe, vergleich).map((l) => {
                  const [hs, ha, he] = pulsDesLaufs(sessions[l.session_id], l.run_idx);
                  return (
                    <tr key={schl(l)} onClick={() => umschalten(schl(l))}
                      className={`cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/50 ${zeilenFarbe(l)}`}>
                      {/* Rang in der Gesamtliste — bleibt beim Hochschieben stehen; Vergleichslaeufe: „V". */}
                      <td className="px-3 py-2 tabular-nums text-slate-400">{laeufe.indexOf(l) >= 0 ? laeufe.indexOf(l) + 1 : vglSet.has(schl(l)) ? "V" : "–"}</td>
                      <td className="px-3 py-2">
                        <Link to={zuSession(l)} state={zurueckState} onClick={(e) => { e.stopPropagation(); merkeScroll(); }} className="text-brand-600 hover:underline dark:text-brand-300">
                          {datum(l)} · #{l.run_idx + 1}
                        </Link>
                        {l.fahrer && <span className="ml-1 font-semibold text-amber-600 dark:text-amber-300">· {l.fahrer}</span>}
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
          {items.length > 0 ? <CompareHrStrips items={items} markiert={markSet} onKlick={umschalten} vergleich={vglSet} /> : <Spinner />}

          {/* 3. Lage je Lauf — nur Laeufe mit „Handy am Brett". */}
          {brettLaeufe && brettLaeufe.length > 0 && (
            <Card className="mt-6 overflow-x-auto">
              <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sd.attitudePerRun")}</p>
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-medium">{t("longest.session")}</th>
                    <th className="px-3 py-2 font-medium">{t("sd.colDuration")}</th>
                    <th className="px-3 py-2 font-medium">{t("sd.colDistance")}</th>
                    <th className="px-3 py-2 font-medium">{t("board.pitch")}</th>
                    <th className="px-3 py-2 font-medium">{t("board.roll")}</th>
                    <th className="px-3 py-2 font-medium">{t("board.yaw")}</th>
                    <th className="px-3 py-2 font-medium">{t("sd.colPitchRhythm")}</th>
                    <th className="px-3 py-2 font-medium">{t("sd.colHeave")}</th>
                  </tr>
                </thead>
                <tbody>
                  {anordnen(brettLaeufe, vergleich.filter((v) => v.placement === "board"), true).map((l) => {
                    const k = lage[l.session_id]?.find((x) => x.lauf === l.run_idx);
                    return (
                      <tr key={schl(l)} onClick={() => umschalten(schl(l))}
                        className={`cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/50 ${zeilenFarbe(l)}`}>
                        <td className="px-3 py-2">
                          <Link to={zuSession(l)} state={zurueckState} onClick={(e) => { e.stopPropagation(); merkeScroll(); }} className="text-brand-600 hover:underline dark:text-brand-300">
                            {datum(l)} · #{l.run_idx + 1}
                          </Link>
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold">{mmss(l.duration_s)}</td>
                        <td className="px-3 py-2 tabular-nums">{l.distance_m != null ? `${Math.round(l.distance_m)} m` : "–"}</td>
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

        </>
      )}
    </div>
  );
}

