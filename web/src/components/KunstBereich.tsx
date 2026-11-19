import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type KunstBild, type KunstEvent, type KunstLinieDaten, type KunstRunde } from "../lib/api";
import { useT } from "../i18n";
import { Spinner } from "./ui";
import { fehlerCode } from "../lib/teamKennzahlen";

/**
 * GPS-Kunst-Event (Jan 10./18.11.2026, server app/kunst.py): „Wer malt das coolste Bild aufs Wasser?"
 * Runden mit Einreichen -> Abstimmen (anonym, bis zu 3 Herzen, Zwischenstand verborgen) -> Aufloesung mit Namen.
 * Die Linie kommt normiert vom Server (0..1000, ohne Koordinaten). Im Editor wird dieselbe Rechnung zur Vorschau gemacht.
 */
const BOX = 1000;

// Winternacht (Jan 18.11.2026: „sieht so trocken aus, etwas weihnachtlicher?"): flaches Nachtblau (keine Verlaeufe,
// docs/BRAND.md), Schneeflocken je Bild fest verteilt (Saat = Bild-id, sonst springen sie beim Neuladen), der Track dick
// in Marken-Cyan mit leichtem Leuchten darunter — wie eine Lichterkette auf dem Wasser.
const NACHT = "#0b1a33";
const CYAN = "#22d3ee";

function schnee(saat: number): { x: number; y: number; r: number; o: number }[] {
  let z = (saat * 2654435761) % 4294967296 || 1;
  const zufall = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296; };
  return Array.from({ length: 46 }, () => ({ x: zufall() * BOX, y: zufall() * BOX, r: 3 + zufall() * 6, o: 0.25 + zufall() * 0.55 }));
}

/** Einzelner Strich (aeltere Bilder) oder mehrere (ein Strich je Lauf) -> immer Liste von Strichen. */
function alsStriche(l: KunstLinieDaten): [number, number][][] {
  if (!l.length) return [];
  return Array.isArray((l as [number, number][][])[0][0]) ? (l as [number, number][][]) : [l as [number, number][]];
}

/** `zeichnen` (ms): die Linie wird ueber diese Zeit „gefahren" — Striche nacheinander, je nach Laenge (Jan 19.11.2026:
 *  Aufloesung, fix 3 s je Bild). Ohne `zeichnen` steht sie sofort da. */
export function KunstLinie({ linie, klein = false, saat = 0, zeichnen }: { linie: KunstLinieDaten; klein?: boolean; saat?: number; zeichnen?: number }) {
  const roh = alsStriche(linie);
  const striche = roh.map((st) => st.map(([x, y]) => `${x},${y}`).join(" "));
  const flocken = useMemo(() => schnee(saat), [saat]);
  const dick = klein ? 30 : 22;
  // Laenge je Strich -> Anteil an der Gesamtzeit; Strich k startet, wenn k-1 fertig ist.
  const zeit = useMemo(() => {
    if (!zeichnen) return null;
    const len = roh.map((st) => st.reduce((s, [x, y], i) => i ? s + Math.hypot(x - st[i - 1][0], y - st[i - 1][1]) : 0, 0) || 1);
    const summe = len.reduce((a, b) => a + b, 0);
    let t = 0;
    return len.map((l) => { const d = (zeichnen * l) / summe, v = t; t += d; return { l, d, v }; });
  }, [linie, zeichnen]);   // eslint-disable-line react-hooks/exhaustive-deps
  // opacity 0 bis zum eigenen Start (Jan 19.11.: sonst stand das runde Linienende eines spaeteren Laufs als Punkt
  // schon die ganze Zeit da); `forwards` statt `both`, damit die Wartezeit den Grundstil (unsichtbar) behaelt.
  const anim = (i: number) => zeit ? {
    strokeDasharray: zeit[i].l, strokeDashoffset: zeit[i].l, opacity: 0,
    animation: `kunstZiehen ${zeit[i].d}ms linear ${zeit[i].v}ms forwards`,
  } : undefined;
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} className="aspect-square w-full rounded-lg" style={{ background: NACHT }} role="img" aria-hidden="true">
      {zeit && <style>{"@keyframes kunstZiehen{from{opacity:1}to{stroke-dashoffset:0;opacity:1}}"}</style>}
      {flocken.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r} fill="#ffffff" opacity={f.o} />)}
      {striche.map((p, i) => <polyline key={`g${i}`} points={p} fill="none" stroke={CYAN} strokeOpacity={0.22} strokeWidth={dick * 2.6} strokeLinecap="round" strokeLinejoin="round" style={anim(i)} />)}
      {striche.map((p, i) => <polyline key={`l${i}`} points={p} fill="none" stroke={CYAN} strokeWidth={dick} strokeLinecap="round" strokeLinejoin="round" style={anim(i)} />)}
    </svg>
  );
}

/** Vorschau wie server kunst.linie: nur Punkte in Laeufen (ein Strich je Lauf), Bildschirm-Koordinaten (Norden oben),
 *  im Uhrzeigersinn drehen, mittig einpassen. */
function normiere(punkte: [number, number, number][], drehung: number, laeufe: [number, number][]): [number, number][][] {
  const striche: [number, number][][] = [];
  let akt: [number, number][] = [], aktL = -1;
  for (const [t, x, y] of punkte) {
    const l = laeufe.findIndex(([a, z]) => a <= t && t <= z);
    if (l < 0) continue;
    if (l !== aktL && akt.length) { striche.push(akt); akt = []; }
    aktL = l; akt.push([x, y]);
  }
  if (akt.length) striche.push(akt);
  const gut = striche.filter((st) => st.length >= 2);
  if (!gut.length) return [];
  const w = (drehung * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w);
  const q = gut.map((st) => st.map(([x, y]) => [x * c - -y * s, x * s + -y * c] as [number, number]));
  const alle = q.flat();
  const xs = alle.map((p) => p[0]), ys = alle.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), bx = Math.max(...xs) - minX, by = Math.max(...ys) - minY;
  const m = Math.max(bx, by) || 1, rand = BOX * 0.04, f = (BOX - 2 * rand) / m;
  const ox = (BOX - bx * f) / 2 - minX * f, oy = (BOX - by * f) / 2 - minY * f;
  return q.map((st) => st.map(([x, y]) => [Math.round(x * f + ox), Math.round(y * f + oy)] as [number, number]));
}

// Rundenzeitraum kurz („15.–18.11."), Ende als letzter Tag der Runde (das Ende selbst ist 0:00 des Folgetags).
const zeitraum = (a: string, z: string) => {
  const f = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "numeric" });
  return `${f(new Date(a))}–${f(new Date(new Date(z).getTime() - 1))}`;
};
// Naechster Schritt einer Runde: kommt -> Start, einreichen -> Einreichschluss, abstimmen -> Aufloesung; fertig -> keiner.
const ziel = (r: KunstRunde): string | null =>
  r.phase === "kommt" ? r.start : r.phase === "einreichen" ? (r.einreichen_bis ?? r.ende) : r.phase === "abstimmen" ? r.abstimmen_bis : null;
// „2d 5h 14m", in der letzten Stunde „14m 33s" — sprachneutral, wie die Event-Countdowns.
function restText(iso: string, jetzt: number): string {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - jetzt) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sek).padStart(2, "0")}s`;
}
const datum = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function KunstBereich({ eventId }: { eventId: number }) {
  const t = useT();
  const [d, setD] = useState<KunstEvent | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nr, setNr] = useState<number | null>(null);
  const [editor, setEditor] = useState(false);
  // Gesamtuebersicht aller fertigen Runden (Jan 18.11.2026), erst ab 2 fertigen Runden.
  const [alle, setAlle] = useState(false);
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => { const h = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(h); }, []);
  // Vollbild beim Abstimmen: Reihenfolge beim Oeffnen festgehalten, damit nach einem Herz nichts wegspringt.
  const [voll, setVoll] = useState<{ ids: number[]; start: number } | null>(null);
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
      {/* Testmodus (nur Admins, Jan 18.11.2026): alte Sessions zaehlen, Phase je Runde von Hand — alle Stufen an einem Abend. */}
      {d.admin && (
        <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-slate-200">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-1" checked={d.test} onChange={(x) => api.kunstTest(eventId, x.target.checked).then(laden).catch(meldung)} />
            <span><span className="font-semibold">{t("kunst.test.titel")}</span> — {t("kunst.test.hinweis")}</span>
          </label>
          {d.test && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400">{t("kunst.runde", { n: String(runde.nr) })}:</span>
              {(["einreichen", "abstimmen", "fertig"] as const).map((ph) => (
                <button key={ph} type="button" onClick={() => api.kunstPhase(eventId, runde.nr, ph).then(laden).catch(meldung)}
                  className={`rounded-lg px-2 py-1 text-xs ${runde.phase === ph ? "bg-amber-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
                  {t(`kunst.phase.${ph}`)}
                </button>
              ))}
              {d.phasen[String(runde.nr)] && (
                <button type="button" onClick={() => api.kunstPhase(eventId, runde.nr, null).then(laden).catch(meldung)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">{t("kunst.test.uhr")}</button>
              )}
            </div>
          )}
        </div>
      )}
      {d.runden.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {d.runden.map((r) => (
            <button key={r.nr} type="button" onClick={() => { setNr(r.nr); setAlle(false); }} aria-pressed={!alle && r.nr === runde.nr}
              className={`rounded-lg px-3 py-1.5 text-sm ${!alle && r.nr === runde.nr ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:text-slate-100"}`}>
              {t("kunst.runde", { n: String(r.nr) })} · {zeitraum(r.start, r.ende)} · {t(`kunst.phase.${r.phase}`)}
              {/* Countdown bis zum naechsten Schritt der Runde (Jan 18.11.2026: „eigene countdowns als 2te zeile"). */}
              {ziel(r) && <span className="block text-xs font-normal tabular-nums opacity-80">
                {t(r.phase === "kommt" ? "kunst.startetIn" : "kunst.noch", { zeit: restText(ziel(r)!, jetzt) })}</span>}
            </button>
          ))}
          {d.runden.filter((r) => r.phase === "fertig").length >= 2 && (
            <button type="button" onClick={() => setAlle(true)} aria-pressed={alle}
              className={`rounded-lg px-3 py-1.5 text-sm ${alle ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:text-slate-100"}`}>
              {t("kunst.alle")}
            </button>
          )}
        </div>
      )}
      {alle ? <Gesamt runden={d.runden.filter((r) => r.phase === "fertig")} /> : <>
      <p className="mb-3 text-sm font-medium text-slate-200">
        {runde.phase === "kommt" && t("kunst.info.kommt", { datum: datum(runde.start) })}
        {runde.phase === "einreichen" && t("kunst.info.einreichen", { datum: datum(runde.einreichen_bis ?? runde.ende), n: String(runde.anzahl) })}
        {runde.phase === "abstimmen" && t("kunst.info.abstimmen", { datum: datum(runde.abstimmen_bis),
          rest: String(d.herzen_je_runde - runde.herzen_vergeben), n: String(d.herzen_je_runde) })}
        {runde.phase === "fertig" && t("kunst.info.fertig", { n: String(runde.ergebnis?.length ?? 0) })}
      </p>

      {/* Eigenes Bild der Runde */}
      {d.teilnehmen && runde.phase !== "kommt" && runde.phase !== "fertig" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 p-3">
          {runde.eigen ? (
            <div className="w-24 shrink-0"><KunstLinie linie={runde.eigen.linie} saat={runde.eigen.id} klein /></div>
          ) : null}
          <div className="min-w-0 flex-1 text-sm text-slate-300">
            {runde.eigen?.entfernt
              ? <span className="text-red-700 dark:text-red-300">{t("kunst.eigenEntfernt", { grund: runde.eigen.entfernt })}</span>
              : runde.eigen ? t(runde.phase === "einreichen" ? "kunst.eigenDa" : "kunst.eigenAbstimmung")
              : runde.phase === "einreichen" ? t("kunst.eigenNoch") : t("kunst.eigenKeins")}
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
        <Aufloesung runde={runde} eventId={eventId} />
      ) : runde.galerie.length === 0 ? (
        runde.phase !== "kommt" && <p className="text-sm text-slate-400">
          {t(runde.phase === "einreichen" && !d.moderieren ? "kunst.galerieSpaeter" : "kunst.leer")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {/* Eigene Herzen zuerst (Jan 18.11.2026), sonst die feste Mischung des Servers. */}
          {[...runde.galerie].sort((a, b) => Number(!!b.herz) - Number(!!a.herz)).map((b, _i, liste) => (
            <GalerieBild key={b.id} b={b} runde={runde} d={d} neu={laden} meldung={meldung}
              onOeffnen={() => setVoll({ ids: liste.map((x) => x.id), start: liste.findIndex((x) => x.id === b.id) })} />
          ))}
        </div>
      )}

      </>}
      {voll && (
        <AbstimmGalerie ids={voll.ids} start={voll.start} runde={runde} d={d} neu={laden} meldung={meldung} onZu={() => setVoll(null)} />
      )}
      {editor && <Editor eventId={eventId} runde={runde} onZu={() => setEditor(false)} onFertig={() => { setEditor(false); laden(); }} />}
    </section>
  );
}

/** Doppeltipp/Doppelklick erkennen (Jan 19.11.2026: „double-tap / doubleclick auf das bild vergibt ein herz oder nimmt es
 *  wieder weg"). Eigene Zeitmessung statt onDoubleClick — mobil feuert dblclick nicht ueberall verlaesslich. Ein einfacher
 *  Klick wird um DOPPEL ms verzoegert, damit er beim zweiten Tipp verworfen werden kann. */
const DOPPEL = 280;
function useDoppeltipp(einfach: (() => void) | null, doppel: () => void) {
  const uhr = useRef<number | null>(null);
  useEffect(() => () => { if (uhr.current) clearTimeout(uhr.current); }, []);
  return () => {
    if (uhr.current) { clearTimeout(uhr.current); uhr.current = null; doppel(); return; }
    uhr.current = window.setTimeout(() => { uhr.current = null; einfach?.(); }, DOPPEL);
  };
}

/** Kurz aufleuchtendes grosses Herz in der Bildmitte nach einem Doppeltipp. */
function HerzPuls({ an, voll }: { an: number; voll: boolean }) {
  if (!an) return null;
  return (
    <span key={an} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <style>{"@keyframes kunstHerzPuls{0%{transform:scale(.4);opacity:0}25%{transform:scale(1.1);opacity:.95}70%{transform:scale(1);opacity:.9}100%{transform:scale(1.15);opacity:0}}"}</style>
      <svg viewBox="0 0 24 24" className="h-1/3 w-1/3 drop-shadow-lg" fill={voll ? "#22d3ee" : "none"} stroke="#22d3ee" strokeWidth="2"
        style={{ animation: "kunstHerzPuls 700ms ease-out forwards" }}>
        <path d="M12 21s-7-4.35-9.5-8.5C.9 9.6 2.4 5.5 6.2 5.1 8.4 4.9 10 6.2 12 8.3c2-2.1 3.6-3.4 5.8-3.2 3.8.4 5.3 4.5 3.7 7.4C19 16.65 12 21 12 21z" />
      </svg>
    </span>
  );
}

function GalerieBild({ b, runde, d, neu, meldung, onOeffnen }: { b: KunstBild; runde: KunstRunde; d: KunstEvent; neu: () => void;
  meldung: (x: unknown) => void; onOeffnen: () => void }) {
  const t = useT();
  const [gemeldet, setGemeldet] = useState(false);
  const abstimmen = runde.phase === "abstimmen" && d.teilnehmen && !b.eigen && !b.entfernt;
  const voll = runde.herzen_vergeben >= d.herzen_je_runde && !b.herz;
  const [puls, setPuls] = useState(0);
  const herzTippen = () => { if (abstimmen && !voll) { setPuls((x) => x + 1); api.kunstHerz(b.id).then(neu).catch(meldung); } };
  const tipp = useDoppeltipp(onOeffnen, herzTippen);
  return (
    <div className={`rounded-xl border p-2 ${b.herz ? "border-brand-500" : "border-slate-700"} ${b.entfernt ? "opacity-50" : ""}`}>
      <button type="button" onClick={tipp} className="relative block w-full touch-manipulation select-none" aria-label={t("kunst.gross")}>
        <KunstLinie linie={b.linie} saat={b.id} />
        <HerzPuls an={puls} voll={!b.herz} />
      </button>
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

/** Vollbild zum Abstimmen (Jan 18.11.2026: „fullscreen-popup-variante zum durchschalten und gleichzeitig herzen vergeben"):
 *  grosses Bild, Herz-Knopf mit Restzahl, Pfeile/Tasten blaettern, Esc schliesst. Herz-Stand kommt live aus der Runde. */
function AbstimmGalerie({ ids, start, runde, d, neu, meldung, onZu }: { ids: number[]; start: number; runde: KunstRunde; d: KunstEvent;
  neu: () => void; meldung: (x: unknown) => void; onZu: () => void }) {
  const t = useT();
  const [i, setI] = useState(start);
  const b = runde.galerie.find((x) => x.id === ids[i]);
  const weiter = (dd: number) => setI((x) => (x + dd + ids.length) % ids.length);
  const abstimmen = !!b && runde.phase === "abstimmen" && d.teilnehmen && !b.eigen && !b.entfernt;
  const voll = !!b && runde.herzen_vergeben >= d.herzen_je_runde && !b.herz;
  const herz = () => { if (b && abstimmen && !voll) api.kunstHerz(b.id).then(neu).catch(meldung); };
  const [puls, setPuls] = useState(0);
  // Admins: schon vor der Aufloesung Bild | Karte (Jan 19.11.2026), Wahl gemerkt wie in der Ergebnis-Galerie.
  const [karteGewaehlt, setKarteGewaehlt] = useState(() => lies(ANSICHT) === "karte");
  const karteErlaubt = !!d.admin && !!b?.karte;
  const karte = karteErlaubt && karteGewaehlt;
  const tipp = useDoppeltipp(null, () => { if (abstimmen && !voll) { setPuls((x) => x + 1); herz(); } });
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZu();
      else if (e.key === "ArrowRight") weiter(1);
      else if (e.key === "ArrowLeft") weiter(-1);
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [ids.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return null;
  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/85 p-3" onClick={onZu}>
      {/* Eigene Karte (Jan 18.11.2026: „braucht noch einen rahmen und hintergrund"): im dunklen Modus verschwamm das Bild
          sonst mit der abgedunkelten Seite. Feste Farben, weil der Kasten in beiden Farbschemata gleich aussieht. */}
      <div className="relative w-full max-w-[min(92vw,74vh)] rounded-3xl p-3 shadow-2xl sm:p-4"
        style={{ background: "#020617", border: "1px solid rgba(34,211,238,0.35)", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className={`relative touch-manipulation select-none rounded-2xl p-1.5 ${b.herz ? "bg-brand-500" : ""}`} onClick={tipp}>
          {karte ? <KunstKarte bildId={b.id} /> : <KunstLinie linie={b.linie} saat={b.id} />}
          <HerzPuls an={puls} voll={!b.herz} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3" style={{ color: "#e2e8f0" }}>
          <span className="text-sm tabular-nums">{i + 1} / {ids.length}</span>
          {karteErlaubt && (
            <span className="inline-flex rounded-lg p-0.5 text-xs" style={{ background: "#1e293b" }}>
              {([false, true] as const).map((k) => (
                <button key={String(k)} type="button" aria-pressed={karte === k}
                  onClick={() => { setKarteGewaehlt(k); schreib(ANSICHT, k ? "karte" : null); }}
                  className="rounded-md px-2 py-0.5"
                  style={karte === k ? { background: "#22d3ee", color: "#020617", fontWeight: 600 } : { color: "#cbd5e1" }}>
                  {k ? t("kunst.ansichtKarte") : t("kunst.ansichtBild")}
                </button>
              ))}
            </span>
          )}
          {b.eigen && <span className="text-sm font-semibold" style={{ color: "#22d3ee" }}>{t("kunst.deinBild")}</span>}
          {runde.phase === "abstimmen" && d.teilnehmen && (
            <span className="ml-auto text-sm">{t("kunst.uebrig", { rest: String(d.herzen_je_runde - runde.herzen_vergeben), n: String(d.herzen_je_runde) })}</span>
          )}
          {abstimmen && (
            <button type="button" disabled={voll} onClick={herz} aria-pressed={!!b.herz} title={voll ? t("kunst.keineHerzen") : t("kunst.herz")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-base font-bold disabled:opacity-40 ${b.herz ? "bg-brand-500 text-slate-950" : "bg-white/15 hover:bg-white/25"}`}
              style={b.herz ? undefined : { color: "#ffffff" }}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill={b.herz ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 21s-7-4.35-9.5-8.5C.9 9.6 2.4 5.5 6.2 5.1 8.4 4.9 10 6.2 12 8.3c2-2.1 3.6-3.4 5.8-3.2 3.8.4 5.3 4.5 3.7 7.4C19 16.65 12 21 12 21z" />
              </svg>
              {t("kunst.herz")}
            </button>
          )}
        </div>
        {ids.length > 1 && (
          <>
            <button type="button" onClick={() => weiter(-1)} aria-label={t("kunst.zurueck")}
              className="absolute left-4 top-[42%] rounded-full bg-black/55 px-3 py-2 text-2xl text-white hover:bg-black/75">‹</button>
            <button type="button" onClick={() => weiter(1)} aria-label={t("kunst.weiter")}
              className="absolute right-4 top-[42%] rounded-full bg-black/55 px-3 py-2 text-2xl text-white hover:bg-black/75">›</button>
          </>
        )}
        <button type="button" onClick={onZu} aria-label={t("common.close")}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full text-xl text-white" style={{ background: "#0f172a", border: "1px solid rgba(34,211,238,0.5)" }}>×</button>
      </div>
    </div>,
    document.body,
  );
}

/** Gesamtuebersicht (Jan 18.11.2026: „aus allen 4 wochen, sortiert nach zuerst die 4 ersten plaetze, dann die 4 2ten"): je
 *  Platz eine Zeile mit den Bildern aller fertigen Runden, jedes mit seiner Runde beschriftet; Klick -> Vollbild-Galerie. */
function Gesamt({ runden }: { runden: KunstRunde[] }) {
  const t = useT();
  const [offen, setOffen] = useState<number | null>(null);
  const alle = runden.flatMap((r) => (r.ergebnis ?? []).map((z) => ({ ...z, runde: r.nr })))
    .sort((a, b) => a.platz - b.platz || a.runde - b.runde || b.herzen - a.herzen);
  const plaetze = [...new Set(alle.map((z) => z.platz))];
  return (
    <div className="space-y-4">
      {plaetze.map((p) => (
        <div key={p}>
          <div className="mb-1.5 text-sm font-bold" style={{ color: p <= 3 ? METALL_TEXT[p - 1] : undefined }}>{t("kunst.platzN", { n: String(p) })}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {alle.map((z, i) => z.platz !== p ? null : (
              <button key={z.bild_id} type="button" onClick={() => setOffen(i)}
                className="rounded-lg p-1.5 text-left" style={{ background: p <= 3 ? METALL[p - 1] : "transparent", border: p <= 3 ? "none" : "1px solid #334155" }}>
                <KunstLinie linie={z.linie} saat={z.bild_id} klein />
                <div className="mt-1 flex items-center gap-1 rounded bg-slate-950/70 px-1 text-xs" style={{ color: "#e2e8f0" }}>
                  <span className="shrink-0 font-semibold">{t("kunst.runde", { n: String(z.runde) })}</span>
                  <span className="min-w-0 flex-1 truncate">· {z.name ?? "—"}</span>
                  <Herzen n={z.herzen} hell />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {offen != null && <Galerie liste={alle} start={offen} onZu={() => setOffen(null)} />}
    </div>
  );
}

// Aufloesung (Jan 18.11.2026: „mit musik und treppchen … alle anderen darunter auch und bei klick in einen vollbildpopup /
// gallery"): Platz 1-3 als Treppchen (2-1-3, Gold/Silber/Bronze) mit derselben Fanfare wie beim Event-Treppchen
// (components/EventPodest, Ton nicht im Repo, Stumm-Einstellung geteilt), darunter alle weiteren, Klick -> Vollbild-Galerie.
type Ergebnis = NonNullable<KunstRunde["ergebnis"]>[number];
// Eigener Jingle (Jan sucht einen, 18.11.2026): server/media/sounds/gpskunst.mp3 — fehlt die Datei, spielt die Event-Fanfare.
const TON_KUNST = "/media/sounds/gpskunst.mp3";
const TON = "/media/sounds/winner-awards-484333.mp3";
const STUMM = "podest-stumm";
const ANSICHT = "kunst-ansicht";   // Galerie: "karte" oder leer (= Bild)
const ZIEHEN = 5000;   // ms je Treppchen-Bild (Jan 19.11.: erst 3 s probiert, dann „mach mal 5s statt 3")
const BLINK = 400;     // ms je Blinken (zweimal), danach Name + Herzen
const STEHEN = 2000;   // ms steht das fertige Bild mit Name
const EXTRA = 2000;    // ms danach die echte Karte (wenn der Ort gezeigt wird)
const FOTO = 4000;     // ms danach das Session-Foto, wenn vorhanden (Jan 19.11.: 2 s waren „zu kurz")
const ruhig = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const METALL = ["#facc15", "#cbd5e1", "#ea8a4a"];   // Gold, Silber, Bronze (wie EventPodest)
const METALL_TEXT = ["#a16207", "#475569", "#9a3412"];   // dunklere Randfarben fuer Zahlen (lesbar auf hell), wie EventPodest
const lies = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const schreib = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* egal */ } };

function Herzen({ n, gross = false, hell = false }: { n: number; gross?: boolean; hell?: boolean }) {
  const t = useT();
  // `hell`: auf dem immer dunklen Galerie-Hintergrund fest weiss (slate kippt im hellen Thema).
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${hell ? "" : "text-slate-200"} ${gross ? "text-base" : "text-sm"}`}
      style={hell ? { color: "#ffffff" } : undefined} aria-label={t("kunst.herzenN", { n: String(n) })}>
      {n}
      <svg viewBox="0 0 24 24" className={gross ? "h-5 w-5" : "h-4 w-4"} fill="#22d3ee" aria-hidden="true">
        <path d="M12 21s-7-4.35-9.5-8.5C.9 9.6 2.4 5.5 6.2 5.1 8.4 4.9 10 6.2 12 8.3c2-2.1 3.6-3.4 5.8-3.2 3.8.4 5.3 4.5 3.7 7.4C19 16.65 12 21 12 21z" />
      </svg>
    </span>
  );
}

function Aufloesung({ runde, eventId }: { runde: KunstRunde; eventId: number }) {
  const t = useT();
  const e = runde.ergebnis ?? [];
  const [offen, setOffen] = useState<number | null>(null);      // Index in e
  const [stumm, setStumm] = useState(() => lies(STUMM) === "1");
  const ton = useRef<HTMLAudioElement | null>(null);
  const fanfare = () => {
    try {
      ton.current?.pause();
      // Zweimal hintereinander (Jan 19.11.2026: „sonst ist der zu kurz" fuer die Enthuellung).
      const spiel = (url: string, ersatz?: string) => {
        const a = new Audio(url); a.volume = 0.6; ton.current = a;
        if (ersatz) a.addEventListener("error", () => spiel(ersatz), { once: true });
        a.addEventListener("ended", () => { if (ton.current === a) { a.currentTime = 0; a.play().catch(() => {}); } }, { once: true });
        a.play().catch(() => { /* ohne vorherige Bedienung blockt der Browser — dann per Knopf */ });
      };
      spiel(TON_KUNST, TON);
    } catch { /* egal */ }
  };
  // Enthuellung im Vollbild (Jan 19.11.2026): beim ersten Ansehen einer fertigen Runde automatisch, danach per Knopf.
  const gesehenKey = `kunst-gesehen-${eventId}-${runde.nr}`;
  const [zeigen, setZeigen] = useState(false);
  const enthuellen = () => { schreib(gesehenKey, "1"); setZeigen(true); if (!stumm) fanfare(); };
  useEffect(() => {
    setZeigen(false);
    if (e.length && !ruhig() && lies(gesehenKey) !== "1") enthuellen();
    return () => { ton.current?.pause(); };
  }, [runde.nr, eventId]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!e.length) return <p className="text-sm text-slate-400">{t("kunst.leer")}</p>;
  const top = e.slice(0, 3).map((z, i) => ({ z, i }));
  const treppe = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return (
    <>
      {/* Knopf zentriert ueber Platz 1, primaer (Jan 19.11.2026); „Stumm" rechts daneben */}
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span />
        <button type="button" onClick={enthuellen}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
          {t("kunst.enth.nochmal")}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 justify-self-end text-xs text-slate-400">
          <input type="checkbox" checked={stumm} onChange={(x) => { setStumm(x.target.checked); schreib(STUMM, x.target.checked ? "1" : null); if (x.target.checked) ton.current?.pause(); }} />
          {t("team.podest.stumm")}
        </label>
      </div>
      {/* Treppchen 2-1-3: Gold am hoechsten */}
      <div className={`mb-5 grid items-end gap-3 sm:gap-5 ${treppe.length === 3 ? "grid-cols-3" : treppe.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {treppe.map(({ z, i }) => {
          const p = Math.min(z.platz, 3);
          return (
            <button key={z.bild_id} type="button" onClick={() => setOffen(i)}
              className={`mx-auto flex w-full flex-col items-center gap-1.5 text-center ${p === 1 ? "max-w-[260px] pb-10" : p === 2 ? "max-w-[210px] pb-4" : "max-w-[190px]"}`}>
              <div className="w-full rounded-xl p-1.5" style={{ background: METALL[p - 1] }}>
                <KunstLinie linie={z.linie} saat={z.bild_id} />
              </div>
              <span className={`font-extrabold tabular-nums ${p === 1 ? "text-3xl" : "text-2xl"}`} style={{ color: METALL_TEXT[p - 1] }}>{z.platz}.</span>
              <span className={`max-w-full truncate font-extrabold text-slate-100 ${p === 1 ? "text-lg sm:text-xl" : "text-sm sm:text-base"}`}>{z.name ?? "—"}</span>
              <Herzen n={z.herzen} gross={p === 1} />
            </button>
          );
        })}
      </div>
      {/* Alle weiteren */}
      {e.length > 3 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {e.slice(3).map((z, k) => (
            <button key={z.bild_id} type="button" onClick={() => setOffen(k + 3)} className="rounded-lg border border-slate-700 p-1.5 text-left hover:border-slate-500">
              <KunstLinie linie={z.linie} saat={z.bild_id} klein />
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span className="font-bold tabular-nums text-slate-300">{z.platz}.</span>
                <span className="min-w-0 flex-1 truncate text-slate-300">{z.name ?? "—"}</span>
                <Herzen n={z.herzen} />
              </div>
            </button>
          ))}
        </div>
      )}
      {offen != null && <Galerie liste={e} start={offen} onZu={() => setOffen(null)} />}
      {zeigen && <Enthuellung liste={e} rundeNr={runde.nr} onZu={() => setZeigen(false)} />}
    </>
  );
}

/** Vollbild-Enthuellung (Jan 19.11.2026): Platz 3, dann 2, dann 1 — je Bild wird die Linie in ZIEHEN ms gefahren, blinkt
 *  zweimal, dann erscheinen Name und Herzen und das Bild steht STEHEN ms, bevor das naechste kommt. Danach Knopf
 *  „Alle Plaetze ansehen" zurueck zur Seite. Bei Gleichstand gilt die Reihenfolge der Liste (letzter Index zuerst). */
function Enthuellung({ liste, rundeNr, onZu }: { liste: Ergebnis[]; rundeNr: number; onZu: () => void }) {
  const t = useT();
  const reihe = liste.slice(0, 3).map((_, i) => i).reverse();   // [2, 1, 0]
  useEffect(() => {   // alles fuer die drei Plaetze sofort vorladen, nicht erst kurz vor dem Einblenden
    for (const z of liste.slice(0, 3)) {
      if (z.karte) ladeKarte(z.bild_id).catch(() => {});
      if (z.foto) ladeFoto(z.foto);
    }
  }, [liste]);
  const [k, setK] = useState(0);
  type Phase = "ziehen" | "blinken" | "stehen" | "karte" | "foto" | "ende";
  const [phase, setPhase] = useState<Phase>("ziehen");
  const [rest, setRest] = useState(0);   // Sekunden bis zum naechsten Platz (Countdown unter dem Bild, Jan 19.11.)
  const letzter = k + 1 >= reihe.length;
  const akt = liste[reihe[k]];
  // Nach dem Namen je 2 s ueberblenden: echte Karte (nur wenn der Ort gezeigt werden darf) und danach das erste Foto der
  // Session, falls es eins gibt (Jan 19.11.2026). Der Countdown laeuft in der letzten dieser Ansichten.
  const extras: Phase[] = [...(akt?.karte ? ["karte" as const] : []), ...(akt?.foto ? ["foto" as const] : [])];
  const zaehlPhase: Phase = extras.length ? extras[extras.length - 1] : "stehen";
  useEffect(() => {
    if (phase === "ende") return;
    if (phase === zaehlPhase) {
      if (rest <= 0) {
        if (letzter) setPhase("ende"); else { setK(k + 1); setPhase("ziehen"); }
        return;
      }
      const u = window.setTimeout(() => setRest(rest - 1), 1000);
      return () => clearTimeout(u);
    }
    const naechste: Phase = phase === "ziehen" ? "blinken" : phase === "blinken" ? "stehen"
      : extras[phase === "stehen" ? 0 : extras.indexOf(phase) + 1];
    const dauer = phase === "ziehen" ? ZIEHEN : phase === "blinken" ? BLINK * 2 : phase === "stehen" ? STEHEN : phase === "foto" ? FOTO : EXTRA;
    const u = window.setTimeout(() => {
      if (naechste === zaehlPhase) setRest(Math.round((naechste === "stehen" ? STEHEN : naechste === "foto" ? FOTO : EXTRA) / 1000));
      setPhase(naechste);
    }, dauer);
    return () => clearTimeout(u);
  }, [k, phase, rest, letzter, zaehlPhase]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const taste = (x: KeyboardEvent) => { if (x.key === "Escape") onZu(); };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [onZu]);
  const z = liste[reihe[k]];
  const p = Math.min(z.platz, 3);
  const nameDa = phase === "stehen" || phase === "karte" || phase === "foto" || phase === "ende";
  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90 p-3">
      <style>{"@keyframes kunstBlink{0%,100%{opacity:1}50%{opacity:.12}}"}</style>
      <div className="relative w-full max-w-[min(92vw,70vh)] rounded-3xl p-3 shadow-2xl sm:p-4"
        style={{ background: "#020617", border: "1px solid rgba(34,211,238,0.35)", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px rgba(0,0,0,0.6)" }}>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>{t("kunst.enth.titel", { n: String(rundeNr) })}</span>
          <span className="text-3xl font-extrabold tabular-nums" style={{ color: METALL[p - 1] }}>{t("kunst.platzN", { n: String(z.platz) })}</span>
        </div>
        <div className="relative rounded-2xl p-1.5" style={{ background: METALL[p - 1], animation: phase === "blinken" ? `kunstBlink ${BLINK}ms ease-in-out 0s 2` : undefined }}>
          <KunstLinie key={k} linie={z.linie} saat={z.bild_id} zeichnen={ZIEHEN} />
          {/* Karte und Foto schon in „stehen" unsichtbar laden, damit sie beim Ueberblenden da sind */}
          {z.karte && (phase === "stehen" || phase === "karte" || phase === "foto") && (
            <div className={`absolute inset-1.5 transition-opacity duration-700 ${phase === "karte" ? "opacity-100" : "opacity-0"}`}>
              <KunstKarte key={z.bild_id} bildId={z.bild_id} />
            </div>
          )}
          {z.foto && (phase === "stehen" || phase === "karte" || phase === "foto") && (
            <div className={`absolute inset-1.5 transition-opacity duration-700 ${phase === "foto" ? "opacity-100" : "opacity-0"}`}>
              <img src={z.foto} alt="" className="aspect-square w-full rounded-lg object-cover" />
            </div>
          )}
        </div>
        <div className={`mt-3 flex min-h-[2.5rem] items-center gap-3 text-white transition-opacity duration-500 ${nameDa ? "opacity-100" : "opacity-0"}`}>
          <span className="min-w-0 flex-1 truncate text-xl font-extrabold">{z.name ?? "—"}</span>
          <Herzen n={z.herzen} gross hell />
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {phase === zaehlPhase && !letzter && rest > 0 && (
            <span className="mr-auto text-sm tabular-nums" style={{ color: "#94a3b8" }}>{t("kunst.enth.naechster", { n: String(rest) })}</span>
          )}
          {phase === "ende" ? (
            <button type="button" onClick={onZu}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400">{t("kunst.enth.alle")}</button>
          ) : (
            <button type="button" onClick={() => { if (letzter) setPhase("ende"); else { setK(k + 1); setPhase("ziehen"); } }}
              className="rounded-lg px-3 py-2 text-sm hover:bg-slate-800" style={{ color: "#cbd5e1" }}>{t("kunst.enth.skip")}</button>
          )}
        </div>
        <button type="button" onClick={onZu} aria-label={t("common.close")}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full text-xl text-white" style={{ background: "#0f172a", border: "1px solid rgba(34,211,238,0.5)" }}>×</button>
      </div>
    </div>,
    document.body,
  );
}

/** Vollbild-Galerie der Auflösung: grosses Bild mit Umschalter Bild | Karte, Name, Platz, Herzen, Spot, Link; Pfeile/Tasten
 *  blaettern, Esc schliesst. */
function Galerie({ liste, start, onZu }: { liste: (Ergebnis & { runde?: number })[]; start: number; onZu: () => void }) {
  const t = useT();
  const [i, setI] = useState(start);
  // Bild | Karte wird gemerkt (Jan 19.11.2026) und gilt beim Blaettern weiter; Bilder ohne freigegebenen Ort zeigen
  // trotzdem das Bild, ohne die Wahl zu aendern. „Abspielen" zeigt bis zum Blaettern das Bild.
  const [karteGewaehlt, setKarteGewaehlt] = useState(() => lies(ANSICHT) === "karte");
  const setKarte = (k: boolean) => { setKarteGewaehlt(k); setSpiel(0); schreib(ANSICHT, k ? "karte" : null); };
  const [spiel, setSpiel] = useState(0);   // „Abspielen" (Jan 19.11.2026): Linie nochmal fahren wie in der Enthuellung
  const z = liste[i];
  const karte = karteGewaehlt && !!z.karte && !spiel;
  const weiter = (d: number) => { setSpiel(0); setI((x) => (x + d + liste.length) % liste.length); };
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZu();
      else if (e.key === "ArrowRight") weiter(1);
      else if (e.key === "ArrowLeft") weiter(-1);
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [liste.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const p = Math.min(z.platz, 4);
  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/85 p-3" onClick={onZu}>
      {/* Eigene Karte (Jan 18.11.2026: „braucht noch einen rahmen und hintergrund"): im dunklen Modus verschwamm das Bild
          sonst mit der abgedunkelten Seite. Feste Farben, weil der Kasten in beiden Farbschemata gleich aussieht. */}
      <div className="relative w-full max-w-[min(92vw,74vh)] rounded-3xl p-3 shadow-2xl sm:p-4"
        style={{ background: "#020617", border: "1px solid rgba(34,211,238,0.35)", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl p-1.5" style={{ background: p <= 3 ? METALL[p - 1] : "transparent" }}>
          {karte ? <KunstKarte bildId={z.bild_id} />
            : <KunstLinie key={`${i}-${spiel}`} linie={z.linie} saat={z.bild_id} zeichnen={spiel ? ZIEHEN : undefined} />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-white">
          <span className="text-2xl font-extrabold tabular-nums" style={{ color: p <= 3 ? METALL[p - 1] : "#e2e8f0" }}>{z.platz}.</span>
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{z.name ?? "—"}
            {z.runde != null && <span className="ml-2 text-sm font-normal" style={{ color: "#94a3b8" }}>{t("kunst.runde", { n: String(z.runde) })}</span>}</span>
          <Herzen n={z.herzen} gross hell />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm" style={{ color: "#cbd5e1" }}>
          {z.spot && <span>{z.spot}</span>}
          <button type="button" onClick={() => setSpiel((x) => x + 1)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold" style={{ background: "#1e293b", color: "#f1f5f9" }}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
            {t("kunst.abspielen")}
          </button>
          {z.session_id && (
            <Link to={`/sessions/${z.session_id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold"
              style={{ background: "#22d3ee", color: "#020617" }}>
              {t("kunst.zurSession")}
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          )}
          {z.karte && (
            <span className="ml-auto inline-flex rounded-lg p-0.5 text-xs" style={{ background: "#1e293b" }}>   {/* feste Farben: Kasten immer dunkel */}
              {([false, true] as const).map((k) => (
                <button key={String(k)} type="button" onClick={() => setKarte(k)} aria-pressed={karte === k}
                  className="rounded-md px-2 py-0.5"
                  style={karte === k ? { background: "#22d3ee", color: "#020617", fontWeight: 600 } : { color: "#cbd5e1" }}>
                  {k ? t("kunst.ansichtKarte") : t("kunst.ansichtBild")}
                </button>
              ))}
            </span>
          )}
        </div>
        {liste.length > 1 && (
          <>
            <button type="button" onClick={() => weiter(-1)} aria-label={t("kunst.zurueck")}
              className="absolute left-4 top-[42%] rounded-full bg-black/55 px-3 py-2 text-2xl text-white hover:bg-black/75">‹</button>
            <button type="button" onClick={() => weiter(1)} aria-label={t("kunst.weiter")}
              className="absolute right-4 top-[42%] rounded-full bg-black/55 px-3 py-2 text-2xl text-white hover:bg-black/75">›</button>
          </>
        )}
        <button type="button" onClick={onZu} aria-label={t("common.close")}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full text-xl text-white" style={{ background: "#0f172a", border: "1px solid rgba(34,211,238,0.5)" }}>×</button>
      </div>
    </div>,
    document.body,
  );
}

/** Echter Track als Satellitenbild vom Server (Jan 19.11.2026: keine interaktive Karte im Event — „hier ist das
 *  overkill", zoomen geht in den Session-Details). Norden oben, Quellennennung ist eingebrannt. */
// Kartenbilder einmal je Seitenaufruf laden und behalten (Object-URLs) — die Enthuellung laedt alle drei Plaetze schon
// beim Oeffnen vor (Jan 19.11.2026: „gepreloaded … fuer ein fluessiges abspielen"), Galerie und Blaettern nutzen denselben Speicher.
const kartenSpeicher = new Map<number, Promise<string>>();
function ladeKarte(bildId: number): Promise<string> {
  let p = kartenSpeicher.get(bildId);
  if (!p) {
    p = api.kunstKartenBild(bildId).then((b) => URL.createObjectURL(b));
    p.catch(() => kartenSpeicher.delete(bildId));   // Fehler nicht merken, beim naechsten Mal neu versuchen
    kartenSpeicher.set(bildId, p);
  }
  return p;
}
/** Fotos vorladen: der Browser behaelt sie im Cache, das spaetere <img> ist dann sofort da. */
const fotoVorrat = new Map<string, HTMLImageElement>();
function ladeFoto(url: string) {
  if (fotoVorrat.has(url)) return;
  const i = new Image(); i.decoding = "async"; i.src = url; fotoVorrat.set(url, i);
}

function KunstKarte({ bildId }: { bildId: number }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let aus = false;
    setUrl(null); setFehler(null);
    ladeKarte(bildId).then((u) => { if (!aus) setUrl(u); })
      .catch((x) => { if (!aus) setFehler(t(`kunst.err.${fehlerCode(x)}`)); });
    return () => { aus = true; };
  }, [bildId]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (fehler) return <p className="flex aspect-square items-center justify-center text-sm text-slate-400">{fehler}</p>;
  return url ? <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
    : <div className="aspect-square w-full rounded-lg" style={{ background: NACHT }} />;
}

function Editor({ eventId, runde, onZu, onFertig }: { eventId: number; runde: KunstRunde; onZu: () => void; onFertig: () => void }) {
  const t = useT();
  const [kand, setKand] = useState<Awaited<ReturnType<typeof api.kunstKandidaten>> | null>(null);
  const [sid, setSid] = useState<number | null>(runde.eigen?.session_id ?? null);
  const [spur, setSpur] = useState<[number, number, number][] | null>(null);
  const [laeufe, setLaeufe] = useState<[number, number][]>([]);
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
      setLaeufe(r.laeufe);
      // Beim eigenen, schon eingereichten Bild das gewaehlte Stueck wiederherstellen, sonst die ganze Session.
      const e = runde.eigen && runde.eigen.session_id === sid ? runde.eigen : null;
      const iv = e ? Math.max(0, p.findIndex((x) => x[0] >= e.von_ms)) : 0;
      const ib = e ? p.reduce((a, x, i) => (x[0] <= e.bis_ms ? i : a), p.length - 1) : p.length - 1;
      setVon(iv); setBis(Math.max(iv + 1, ib));
    }).catch((x) => setFehler(t(`kunst.err.${fehlerCode(x)}`)));
  }, [sid]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stueck = spur ? spur.slice(von, bis + 1) : [];
  const vorschau = useMemo(() => normiere(stueck, dreh, laeufe), [spur, von, bis, dreh, laeufe]);   // eslint-disable-line react-hooks/exhaustive-deps
  const aufFoil = vorschau.reduce((n, st) => n + st.length, 0);
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
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-white p-5 dark:bg-slate-900">
        <h3 className="mb-1 text-lg font-bold text-slate-100">{t("kunst.editorTitel", { n: String(runde.nr) })}</h3>
        <p className="mb-3 text-sm text-slate-400">{t("kunst.editorHinweis")}</p>
        {!kand ? <Spinner /> : kand.length === 0 ? (
          <p className="mb-3 text-sm text-slate-300">{t("kunst.keineSessions", { von: datum(runde.start), bis: datum(runde.ende) })}</p>
        ) : (
          // Kacheln mit der ganzen Session als Vorschau (Jan 18.11.2026: „track-thumbnails zum leichteren auffinden").
          // Ist eine gewaehlt, verschwindet die Auswahl (Jan: „nur das zu bearbeitende bild anzeigen").
          sid != null ? (() => {
            const k = kand.find((x) => x.id === sid);
            return (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className="min-w-0 flex-1 truncate">
                  {k ? new Date(k.started_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  {k?.sport_class ? ` · ${t(`cls.sport.${k.sport_class}`)}` : ""}
                </span>
                <button type="button" onClick={() => { setSid(null); setSpur(null); }}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">{t("kunst.andereSession")}</button>
              </div>
            );
          })() : (
          <div className="mb-3 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
            {kand.map((k) => (
              <button key={k.id} type="button" onClick={() => setSid(k.id)} aria-pressed={sid === k.id}
                className={`rounded-lg border-2 p-1 text-left ${sid === k.id ? "border-brand-500" : "border-transparent hover:border-slate-600"}`}>
                <KunstLinie linie={k.vorschau} saat={k.id} klein />
                <div className="mt-1 truncate text-xs text-slate-300">
                  {new Date(k.started_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="truncate text-xs text-slate-400">{k.sport_class ? t(`cls.sport.${k.sport_class}`) : ""}{k.caption ? ` · ${k.caption}` : ""}</div>
              </button>
            ))}
          </div>
          )
        )}
        {sid != null && !spur && !fehler && <Spinner />}
        {spur && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><KunstLinie linie={vorschau} saat={sid ?? 0} /></div>
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
              <p className="text-xs text-slate-400">{t("kunst.punkte", { n: String(aufFoil) })}</p>
            </div>
          </div>
        )}
        {fehler && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!spur || laeuft || aufFoil < 10} onClick={senden}
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
