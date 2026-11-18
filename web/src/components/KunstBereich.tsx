import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type KunstBild, type KunstEvent, type KunstRunde } from "../lib/api";
import { useT } from "../i18n";
import { Spinner } from "./ui";
import { fehlerCode } from "../lib/teamKennzahlen";

/**
 * GPS-Kunst-Event (Jan 10./18.11.2026, server app/kunst.py): „Wer malt das coolste Bild aufs Wasser?"
 * Runden mit Einreichen -> Abstimmen (anonym, bis zu 3 Herzen, Zwischenstand verborgen) -> Aufloesung mit Namen.
 * Die Linie kommt normiert vom Server (0..1000, ohne Koordinaten). Im Editor wird dieselbe Rechnung zur Vorschau gemacht.
 */
const BOX = 1000;

export function KunstLinie({ linie, klein = false }: { linie: [number, number][]; klein?: boolean }) {
  // Immer schwarz auf weiss (wie besprochen: „nur der Track als Linie auf weissem Grund"), in beiden Farbschemata.
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} className="aspect-square w-full rounded-lg bg-white" role="img" aria-hidden="true">
      <polyline points={linie.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#0f172a"
        strokeWidth={klein ? 14 : 10} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Vorschau wie server kunst.linie: Bildschirm-Koordinaten (Norden oben), im Uhrzeigersinn drehen, mittig einpassen. */
function normiere(punkte: [number, number, number][], drehung: number): [number, number][] {
  if (punkte.length < 2) return [];
  const w = (drehung * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w);
  const q = punkte.map(([, x, y]) => [x * c - -y * s, x * s + -y * c] as [number, number]);
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), bx = Math.max(...xs) - minX, by = Math.max(...ys) - minY;
  const m = Math.max(bx, by) || 1, rand = BOX * 0.04, f = (BOX - 2 * rand) / m;
  const ox = (BOX - bx * f) / 2 - minX * f, oy = (BOX - by * f) / 2 - minY * f;
  return q.map(([x, y]) => [Math.round(x * f + ox), Math.round(y * f + oy)]);
}

const datum = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function KunstBereich({ eventId }: { eventId: number }) {
  const t = useT();
  const [d, setD] = useState<KunstEvent | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nr, setNr] = useState<number | null>(null);
  const [editor, setEditor] = useState(false);
  const laden = () => api.kunst(eventId).then((x) => { setD(x); setFehler(null); }).catch((e) => setFehler(String(e)));
  useEffect(() => { laden(); }, [eventId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Standard-Runde: laufende Abstimmung vor laufendem Einreichen, sonst die letzte fertige.
  const runde: KunstRunde | null = useMemo(() => {
    if (!d) return null;
    const r = d.runden;
    return r.find((x) => x.nr === nr) ?? r.find((x) => x.phase === "abstimmen") ?? r.find((x) => x.phase === "einreichen")
      ?? [...r].reverse().find((x) => x.phase === "fertig") ?? r[0] ?? null;
  }, [d, nr]);

  if (fehler) return <p className="mb-4 text-sm text-red-700 dark:text-red-400">{fehler}</p>;
  if (!d || !runde) return <Spinner />;
  const meldung = (x: unknown) => setFehler(t(`kunst.err.${fehlerCode(x)}`));

  return (
    <section className="mb-6">
      <p className="mb-3 text-sm text-slate-300">{t("kunst.intro", { n: String(d.herzen_je_runde) })}</p>
      {d.runden.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {d.runden.map((r) => (
            <button key={r.nr} type="button" onClick={() => setNr(r.nr)} aria-pressed={r.nr === runde.nr}
              className={`rounded-lg px-3 py-1.5 text-sm ${r.nr === runde.nr ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:text-slate-100"}`}>
              {t("kunst.runde", { n: String(r.nr) })} · {t(`kunst.phase.${r.phase}`)}
            </button>
          ))}
        </div>
      )}
      <p className="mb-3 text-sm font-medium text-slate-200">
        {runde.phase === "kommt" && t("kunst.info.kommt", { datum: datum(runde.start) })}
        {runde.phase === "einreichen" && t("kunst.info.einreichen", { datum: datum(runde.ende), n: String(runde.anzahl) })}
        {runde.phase === "abstimmen" && t("kunst.info.abstimmen", { datum: datum(runde.abstimmen_bis),
          rest: String(d.herzen_je_runde - runde.herzen_vergeben), n: String(d.herzen_je_runde) })}
        {runde.phase === "fertig" && t("kunst.info.fertig", { n: String(runde.ergebnis?.length ?? 0) })}
      </p>

      {/* Eigenes Bild der Runde */}
      {d.teilnehmen && runde.phase !== "kommt" && runde.phase !== "fertig" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 p-3">
          {runde.eigen ? (
            <div className="w-24 shrink-0"><KunstLinie linie={runde.eigen.linie} klein /></div>
          ) : null}
          <div className="min-w-0 flex-1 text-sm text-slate-300">
            {runde.eigen?.entfernt
              ? <span className="text-red-700 dark:text-red-300">{t("kunst.eigenEntfernt", { grund: runde.eigen.entfernt })}</span>
              : runde.eigen ? t("kunst.eigenDa") : runde.phase === "einreichen" ? t("kunst.eigenNoch") : t("kunst.eigenKeins")}
          </div>
          {runde.phase === "einreichen" && !runde.eigen?.entfernt && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditor(true)}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
                {runde.eigen ? t("kunst.aendern") : t("kunst.einreichen")}
              </button>
              {runde.eigen && (
                <button type="button" onClick={() => api.kunstZurueckziehen(eventId, runde.nr).then(laden).catch(meldung)}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">{t("kunst.zurueckziehen")}</button>
              )}
            </div>
          )}
        </div>
      )}

      {runde.phase === "fertig" ? (
        <Aufloesung runde={runde} />
      ) : runde.galerie.length === 0 ? (
        runde.phase !== "kommt" && <p className="text-sm text-slate-400">{t("kunst.leer")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {runde.galerie.map((b) => (
            <GalerieBild key={b.id} b={b} runde={runde} d={d} neu={laden} meldung={meldung} />
          ))}
        </div>
      )}

      {editor && <Editor eventId={eventId} runde={runde} onZu={() => setEditor(false)} onFertig={() => { setEditor(false); laden(); }} />}
    </section>
  );
}

function GalerieBild({ b, runde, d, neu, meldung }: { b: KunstBild; runde: KunstRunde; d: KunstEvent; neu: () => void; meldung: (x: unknown) => void }) {
  const t = useT();
  const [gemeldet, setGemeldet] = useState(false);
  const abstimmen = runde.phase === "abstimmen" && d.teilnehmen && !b.eigen && !b.entfernt;
  const voll = runde.herzen_vergeben >= d.herzen_je_runde && !b.herz;
  return (
    <div className={`rounded-xl border p-2 ${b.herz ? "border-brand-500" : "border-slate-700"} ${b.entfernt ? "opacity-50" : ""}`}>
      <KunstLinie linie={b.linie} />
      <div className="mt-2 flex items-center gap-2">
        {abstimmen && (
          <button type="button" disabled={voll} onClick={() => api.kunstHerz(b.id).then(neu).catch(meldung)}
            aria-pressed={!!b.herz} title={voll ? t("kunst.keineHerzen") : t("kunst.herz")}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold disabled:opacity-40 ${
              b.herz ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={b.herz ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s-7-4.35-9.5-8.5C.9 9.6 2.4 5.5 6.2 5.1 8.4 4.9 10 6.2 12 8.3c2-2.1 3.6-3.4 5.8-3.2 3.8.4 5.3 4.5 3.7 7.4C19 16.65 12 21 12 21z" />
            </svg>
            {t("kunst.herz")}
          </button>
        )}
        {b.eigen && <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">{t("kunst.deinBild")}</span>}
        {!b.eigen && !d.moderieren && (
          <button type="button" disabled={gemeldet} onClick={() => {
            const grund = window.prompt(t("kunst.meldenFrage"));
            if (grund === null) return;
            api.kunstMelden(b.id, grund).then(() => setGemeldet(true)).catch(meldung);
          }} className="ml-auto text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50">
            {gemeldet ? t("kunst.gemeldet") : t("kunst.melden")}
          </button>
        )}
        {d.moderieren && (
          <span className="ml-auto flex items-center gap-2 text-xs">
            {(b.meldungen ?? 0) > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">{t("kunst.meldungenN", { n: String(b.meldungen) })}</span>}
            {b.entfernt ? (
              <button type="button" onClick={() => api.kunstZurueckholen(b.id).then(neu).catch(meldung)} className="text-slate-300 hover:underline">{t("kunst.zurueckholen")}</button>
            ) : (
              <button type="button" onClick={() => {
                const grund = window.prompt(t("kunst.entfernenFrage"));
                if (grund && grund.trim().length >= 3) api.kunstEntfernen(b.id, grund.trim()).then(neu).catch(meldung);
              }} className="text-red-700 hover:underline dark:text-red-300">{t("kunst.entfernen")}</button>
            )}
          </span>
        )}
      </div>
      {b.entfernt && <p className="mt-1 text-xs text-slate-400">{b.entfernt}</p>}
    </div>
  );
}

function Aufloesung({ runde }: { runde: KunstRunde }) {
  const t = useT();
  const e = runde.ergebnis ?? [];
  if (!e.length) return <p className="text-sm text-slate-400">{t("kunst.leer")}</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {e.map((z) => (
        <div key={z.bild_id} className={`rounded-xl border p-2 ${z.platz <= 3 ? "border-brand-500" : "border-slate-700"}`}>
          <KunstLinie linie={z.linie} />
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold tabular-nums text-slate-100">{z.platz}.</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{z.name ?? "—"}</span>
            <span className="text-sm tabular-nums text-slate-300">{t("kunst.herzenN", { n: String(z.herzen) })}</span>
          </div>
          <div className="text-xs text-slate-400">
            {z.spot ?? ""}{z.spot && z.session_id ? " · " : ""}
            {z.session_id && <Link to={`/sessions/${z.session_id}`} className="text-brand-700 hover:underline dark:text-brand-300">{t("kunst.zurSession")}</Link>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Editor({ eventId, runde, onZu, onFertig }: { eventId: number; runde: KunstRunde; onZu: () => void; onFertig: () => void }) {
  const t = useT();
  const [kand, setKand] = useState<Awaited<ReturnType<typeof api.kunstKandidaten>> | null>(null);
  const [sid, setSid] = useState<number | null>(runde.eigen?.session_id ?? null);
  const [spur, setSpur] = useState<[number, number, number][] | null>(null);
  const [von, setVon] = useState(0);
  const [bis, setBis] = useState(0);
  const [dreh, setDreh] = useState(runde.eigen?.drehung ?? 0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => { api.kunstKandidaten(eventId, runde.nr).then(setKand).catch(() => setKand([])); }, [eventId, runde.nr]);
  useEffect(() => {
    if (sid == null) return;
    setSpur(null); setFehler(null);
    api.kunstSpur(eventId, sid).then((r) => {
      const p = r.punkte;
      setSpur(p);
      // Beim eigenen, schon eingereichten Bild das gewaehlte Stueck wiederherstellen, sonst die ganze Session.
      const e = runde.eigen && runde.eigen.session_id === sid ? runde.eigen : null;
      const iv = e ? Math.max(0, p.findIndex((x) => x[0] >= e.von_ms)) : 0;
      const ib = e ? p.reduce((a, x, i) => (x[0] <= e.bis_ms ? i : a), p.length - 1) : p.length - 1;
      setVon(iv); setBis(Math.max(iv + 1, ib));
    }).catch((x) => setFehler(t(`kunst.err.${fehlerCode(x)}`)));
  }, [sid]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stueck = spur ? spur.slice(von, bis + 1) : [];
  const vorschau = useMemo(() => normiere(stueck, dreh), [spur, von, bis, dreh]);   // eslint-disable-line react-hooks/exhaustive-deps
  const zeit = (i: number) => (spur && spur[i] ? Math.round((spur[i][0] - spur[0][0]) / 60000) : 0);

  const senden = () => {
    if (!spur || sid == null) return;
    setLaeuft(true); setFehler(null);
    api.kunstEinreichen(eventId, { runde: runde.nr, session_id: sid, von_ms: spur[von][0], bis_ms: spur[bis][0], drehung: ((dreh % 360) + 360) % 360 })
      .then(onFertig)
      .catch((x) => setFehler(t(`kunst.err.${fehlerCode(x)}`)))
      .finally(() => setLaeuft(false));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-white p-5 dark:bg-slate-900">
        <h3 className="mb-1 text-lg font-bold text-slate-100">{t("kunst.editorTitel", { n: String(runde.nr) })}</h3>
        <p className="mb-3 text-sm text-slate-400">{t("kunst.editorHinweis")}</p>
        {!kand ? <Spinner /> : kand.length === 0 ? (
          <p className="mb-3 text-sm text-slate-300">{t("kunst.keineSessions", { von: datum(runde.start), bis: datum(runde.ende) })}</p>
        ) : (
          <select value={sid ?? ""} onChange={(x) => setSid(Number(x.target.value) || null)}
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100">
            <option value="">{t("kunst.sessionWaehlen")}</option>
            {kand.map((k) => (
              <option key={k.id} value={k.id}>
                {new Date(k.started_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {k.sport_class ? ` · ${t(`cls.sport.${k.sport_class}`)}` : ""}{k.caption ? ` · ${k.caption}` : ""}
              </option>
            ))}
          </select>
        )}
        {sid != null && !spur && !fehler && <Spinner />}
        {spur && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><KunstLinie linie={vorschau} /></div>
            <div className="space-y-3 text-sm text-slate-300">
              <label className="block">{t("kunst.von", { min: String(zeit(von)) })}
                <input type="range" min={0} max={spur.length - 2} value={von} className="w-full"
                  onChange={(x) => { const v = Number(x.target.value); setVon(v); if (bis <= v) setBis(v + 1); }} />
              </label>
              <label className="block">{t("kunst.bis", { min: String(zeit(bis)) })}
                <input type="range" min={1} max={spur.length - 1} value={bis} className="w-full"
                  onChange={(x) => { const v = Number(x.target.value); setBis(v); if (von >= v) setVon(v - 1); }} />
              </label>
              <label className="block">{t("kunst.drehung", { grad: String(((dreh % 360) + 360) % 360) })}
                <input type="range" min={0} max={359} value={((dreh % 360) + 360) % 360} className="w-full"
                  onChange={(x) => setDreh(Number(x.target.value))} />
              </label>
              <div className="flex gap-2">
                {[-90, -15, 15, 90].map((g) => (
                  <button key={g} type="button" onClick={() => setDreh((x) => x + g)}
                    className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">{g > 0 ? `+${g}°` : `${g}°`}</button>
                ))}
              </div>
              <p className="text-xs text-slate-400">{t("kunst.punkte", { n: String(stueck.length) })}</p>
            </div>
          </div>
        )}
        {fehler && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!spur || laeuft || stueck.length < 10} onClick={senden}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-40">
            {runde.eigen ? t("kunst.speichern") : t("kunst.einreichen")}
          </button>
          <button type="button" onClick={onZu} className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">{t("common.cancel")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
