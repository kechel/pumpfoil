// Media-Overlay mit mehreren Fahrern (docs/MEDIA.md Schritt 6, Jan 25.11.2026): Knopf „+ Fahrer", Auswahl-Popup und
// je Fahrer die Einstellungen (Lauf, Datenfelder, Spurfarbe). Gerechnet und gezeichnet wird in lib/media/mehrfach.ts.

import { useEffect, useState } from "react";
import { api, type MitfahrerZeile, type TeamEvent, type TeamEventKurz } from "../lib/api";
import { useT } from "../i18n";
import { fmtDate, fmtTime } from "../lib/time";
import { useCompare } from "../lib/compare";
import { kennzahl } from "../lib/teamKennzahlen";
import { sprintName } from "../lib/media/zeichnen";
import { FAHRER_FARBEN, FELD_KEYS, MAX_MITFAHRER, ANZEIGE_MIT, type Anzeige, type FeldKey, type Modus } from "../lib/media/mehrfach";

export interface Mitfahrer {
  sessionId: number;
  lauf: number | null;       // null = bester Lauf (laengste Strecke)
  name: string;
  nr: number;                // 2..4, bestimmt die Farbe (FAHRER_FARBEN[nr - 1])
  anzeige: Anzeige;
}

type Quelle = "gleichzeitig" | "tag" | "event" | "freunde" | "korb" | "eigene";
const QUELLEN: Quelle[] = ["gleichzeitig", "tag", "event", "freunde", "korb", "eigene"];

interface Kandidat { sessionId: number; lauf: number | null; name: string; zeile?: MitfahrerZeile; info?: string; ueberlappt?: boolean | null }

function Punkt({ nr }: { nr: number }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 text-xs font-extrabold text-slate-950"
      style={{ background: FAHRER_FARBEN[nr - 1] }}>{nr}</span>
  );
}

function datumText(z: { started_at: string | null; tz: string | null; zeit_verborgen?: boolean }): string {
  if (!z.started_at) return "";
  const d = fmtDate(z.started_at, z.tz ?? undefined, { day: "2-digit", month: "short", year: "numeric" });
  return z.zeit_verborgen ? d : `${d} ${fmtTime(z.started_at, z.tz ?? undefined)}`;
}

/** Auswahl-Popup: Quelle waehlen, dann einen Eintrag antippen. */
function Wahl({ sessionId, schonDa, onWahl, onClose }: {
  sessionId: number; schonDa: Set<number>; onWahl: (k: Kandidat) => void; onClose: () => void;
}) {
  const t = useT();
  const [quelle, setQuelle] = useState<Quelle>("gleichzeitig");
  const [liste, setListe] = useState<Kandidat[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [events, setEvents] = useState<TeamEventKurz[] | null>(null);
  const [eventWahl, setEventWahl] = useState<string>("");
  const [ev, setEv] = useState<TeamEvent | null>(null);
  const [tafel, setTafel] = useState(0);
  const korb = useCompare();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let weg = false;
    setListe(null); setFehler(null);
    if (quelle === "event") {
      if (!events) {
        Promise.all([api.teamsEventsAktuell().catch(() => []), api.teamsEventsMeine().catch(() => []), api.teamsEventsAlle(0, 30).catch(() => [])])
          .then((ls) => {
            if (weg) return;
            const je = new Map<number, TeamEventKurz>();
            for (const l of ls) for (const e of l) if (e.status !== "kommend") je.set(e.id, e);
            setEvents(Array.from(je.values()).sort((a, b) => b.start.localeCompare(a.start)));
          });
      }
      return () => { weg = true; };
    }
    if (quelle === "korb") {
      setListe(korb.filter((r) => r.sessionId !== sessionId && !r.modell).map((r) => ({
        sessionId: r.sessionId, lauf: r.runIdx, name: `#${r.sessionId}`,
        info: r.runIdx != null ? t("media.runN", { n: String(r.runIdx + 1) }) : (r.date ?? ""),
      })));
      return () => { weg = true; };
    }
    api.sessionMitfahrer(sessionId, quelle).then((r) => {
      if (weg) return;
      setListe(r.zeilen.map((z) => ({
        sessionId: z.session_id, lauf: null, name: z.name ?? `#${z.session_id}`, zeile: z, ueberlappt: z.ueberlappt,
        info: [datumText(z), z.spot, `${z.runs} ${t("stat.runs")}`, `${z.foiling_km.toFixed(2)} km`].filter(Boolean).join(" · "),
      })));
    }).catch((e) => !weg && setFehler(String(e?.message ?? e)));
    return () => { weg = true; };
  }, [quelle, sessionId]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (quelle !== "event" || !eventWahl) return;
    const [slug, id] = eventWahl.split("|");
    let weg = false;
    setEv(null); setTafel(0);
    api.teamEvent(slug, id).then((e) => !weg && setEv(e)).catch((e) => !weg && setFehler(String(e?.message ?? e)));
    return () => { weg = true; };
  }, [quelle, eventWahl]);

  const eventListe: Kandidat[] = ev && ev.tafeln[tafel]
    ? ev.tafeln[tafel].zeilen.filter((z) => z.session_id).slice(0, 10).map((z) => ({
      sessionId: z.session_id!, lauf: z.run_idx ?? null, name: z.name ?? z.initialen,
      info: [`${z.rang}.`, z.spot, z.run_idx != null ? t("media.runN", { n: String(z.run_idx + 1) }) : null].filter(Boolean).join(" · "),
    }))
    : [];
  const zeigen = quelle === "event" ? (ev ? eventListe : null) : liste;

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-slate-900 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">{t("media.mit.add")}</h3>
          <button onClick={onClose} aria-label={t("media.cancel")} className="rounded-full p-1.5 text-slate-300 hover:bg-slate-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <select value={quelle} onChange={(e) => setQuelle(e.target.value as Quelle)}
          className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100">
          {QUELLEN.map((q) => <option key={q} value={q}>{t(`media.mit.q.${q}`)}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-400">{t(`media.mit.qHint.${quelle}`)}</p>

        {quelle === "event" && (
          <div className="mt-3 space-y-2">
            <select value={eventWahl} onChange={(e) => setEventWahl(e.target.value)}
              className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100">
              <option value="">{events ? t("media.mit.chooseEvent") : t("media.music.loading")}</option>
              {(events ?? []).map((e) => <option key={e.id} value={`${e.team.slug}|${e.id}`}>{e.titel} · {fmtDate(e.start, e.zeitzone ?? undefined, { day: "2-digit", month: "short", year: "numeric" })}</option>)}
            </select>
            {ev && ev.tafeln.length > 1 && (
              <select value={tafel} onChange={(e) => setTafel(Number(e.target.value))}
                className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100">
                {ev.tafeln.map((tf, i) => <option key={i} value={i}>{t(kennzahl(tf.kennzahl).labelKey)}</option>)}
              </select>
            )}
          </div>
        )}

        {fehler && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        {zeigen == null ? (!fehler && (quelle !== "event" || eventWahl) && <p className="mt-3 text-sm text-slate-400">{t("media.music.loading")}</p>) : zeigen.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{t("media.mit.empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800">
            {zeigen.map((k) => {
              const da = schonDa.has(k.sessionId) || k.sessionId === sessionId;
              return (
                <li key={`${k.sessionId}:${k.lauf ?? "s"}`}>
                  <button disabled={da} onClick={() => onWahl(k)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800 disabled:opacity-50">
                    {k.zeile?.avatar_url
                      ? <img src={k.zeile.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      : <span className="h-8 w-8 shrink-0 rounded-full bg-slate-700" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-100">{k.name}</span>
                      <span className="block truncate text-xs text-slate-400">{k.info}</span>
                    </span>
                    {k.ueberlappt && <span className="shrink-0 rounded-md bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">{t("media.mit.overlaps")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Abschnitt in der Video-Kachel: Fahrerliste, Modus, Knopf „+ Fahrer". */
export function MediaMitfahrer({ sessionId, hauptName, hauptAnzeige, setHauptAnzeige, fahrer, setFahrer, sessions,
  modus, setModus, echtzeitGesperrt, sprintKz, sprintWahl, setSprintWahl, drehen, setDrehen, hinweis }: {
  sessionId: number; hauptName: string;
  hauptAnzeige: Anzeige; setHauptAnzeige: (a: Anzeige) => void;
  fahrer: Mitfahrer[]; setFahrer: (f: Mitfahrer[]) => void;
  sessions: Record<number, any>;
  modus: Modus; setModus: (m: Modus) => void; echtzeitGesperrt: boolean;
  sprintKz: string[]; sprintWahl: string | null; setSprintWahl: (k: string) => void;
  drehen: boolean; setDrehen: (d: boolean) => void;
  hinweis: string | null;
}) {
  const t = useT();
  const [offen, setOffen] = useState(false);

  const hinzu = (k: Kandidat) => {
    const belegt = new Set(fahrer.map((f) => f.nr));
    const nr = [2, 3, 4].find((n) => !belegt.has(n));
    if (!nr) return;
    if (!fahrer.length) setModus(k.ueberlappt && !echtzeitGesperrt && !k.zeile?.zeit_verborgen ? "echtzeit" : "start");
    setFahrer([...fahrer, { sessionId: k.sessionId, lauf: k.lauf, name: k.name, nr, anzeige: ANZEIGE_MIT }]);
    setOffen(false);
  };
  const aendern = (i: number, p: Partial<Mitfahrer>) => setFahrer(fahrer.map((f, j) => (j === i ? { ...f, ...p } : f)));

  const FeldKnoepfe = ({ a, set }: { a: Anzeige; set: (a: Anzeige) => void }) => (
    <div className="flex flex-wrap items-center gap-1">
      {FELD_KEYS.map((k: FeldKey) => (
        <button key={k} onClick={() => set({ ...a, felder: { ...a.felder, [k]: !a.felder[k] } })}
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${a.felder[k] ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
          {t(`media.el.${k}`)}
        </button>
      ))}
      <button onClick={() => set({ ...a, spur: a.spur === "daten" ? "fahrer" : "daten" })} title={t("media.mit.trackColorHint")}
        className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300 hover:bg-slate-700">
        {t(a.spur === "daten" ? "media.mit.trackData" : "media.mit.trackRider")}
      </button>
    </div>
  );

  return (
    <div className="space-y-3 border-t border-slate-800 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t("media.mit.title")}</h4>
        <button onClick={() => setOffen(true)} disabled={fahrer.length >= MAX_MITFAHRER}
          className="rounded-lg border border-brand-500 px-3 py-1 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 disabled:opacity-50 dark:text-brand-300">
          + {t("media.mit.add")}
        </button>
      </div>
      {fahrer.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            {(["echtzeit", "start", "sprint"] as Modus[]).map((m) => {
              const aus = (m === "echtzeit" && echtzeitGesperrt) || (m === "sprint" && !sprintKz.length);
              return (
                <button key={m} disabled={aus} onClick={() => setModus(m)} title={t(`media.mit.modeHint.${m}`)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${modus === m ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                  {t(`media.mit.mode.${m}`)}
                </button>
              );
            })}
            {modus === "sprint" && sprintKz.length > 0 && (
              <select value={sprintWahl ?? ""} onChange={(e) => setSprintWahl(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
                {sprintKz.map((k) => <option key={k} value={k}>{sprintName(k)}</option>)}
              </select>
            )}
          </div>
          <p className="text-xs text-slate-400">{t(`media.mit.modeHint.${modus}`)}</p>
          {echtzeitGesperrt && <p className="text-xs text-amber-700 dark:text-amber-300">{t("media.mit.realtimeLocked")}</p>}
          {modus !== "echtzeit" && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={drehen} onChange={(e) => setDrehen(e.target.checked)} className="accent-brand-400" />
              {t("media.mit.rotate")}
            </label>
          )}
          {hinweis && <p className="text-xs text-amber-700 dark:text-amber-300">{hinweis}</p>}
          <ul className="space-y-2">
            <li className="space-y-1.5 rounded-lg bg-slate-800/50 p-2">
              <div className="flex items-center gap-2 text-sm"><Punkt nr={1} /><span className="font-semibold">{hauptName}</span></div>
              <FeldKnoepfe a={hauptAnzeige} set={setHauptAnzeige} />
            </li>
            {fahrer.map((f, i) => {
              const s = sessions[f.sessionId];
              const segs: any[] = s?.analysis?.segments ?? [];
              return (
                <li key={f.sessionId} className="space-y-1.5 rounded-lg bg-slate-800/50 p-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Punkt nr={f.nr} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                    {modus === "start" && segs.length > 0 && (
                      <select value={f.lauf ?? ""} onChange={(e) => aendern(i, { lauf: e.target.value === "" ? null : Number(e.target.value) })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-100">
                        <option value="">{t("media.mit.bestRun")}</option>
                        {segs.map((g, j) => <option key={j} value={j}>{t("media.runN", { n: String(j + 1) })} · {Math.round(g.distance_m ?? 0)} m</option>)}
                      </select>
                    )}
                    {!s && <span className="text-xs text-slate-400">{t("media.music.loading")}</span>}
                    <button onClick={() => setFahrer(fahrer.filter((_, j) => j !== i))} aria-label={t("media.mit.remove")}
                      className="rounded-md px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700">{t("media.mit.remove")}</button>
                  </div>
                  <FeldKnoepfe a={f.anzeige} set={(a) => aendern(i, { anzeige: a })} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      {offen && <Wahl sessionId={sessionId} schonDa={new Set(fahrer.map((f) => f.sessionId))} onWahl={hinzu} onClose={() => setOffen(false)} />}
    </div>
  );
}
