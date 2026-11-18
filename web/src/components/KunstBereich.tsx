import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { basiskarten, kartenTexte } from "../lib/mapTiles";
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

export function KunstLinie({ linie, klein = false, saat = 0 }: { linie: KunstLinieDaten; klein?: boolean; saat?: number }) {
  const striche = alsStriche(linie).map((st) => st.map(([x, y]) => `${x},${y}`).join(" "));
  const flocken = useMemo(() => schnee(saat), [saat]);
  const dick = klein ? 30 : 22;
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} className="aspect-square w-full rounded-lg" style={{ background: NACHT }} role="img" aria-hidden="true">
      {flocken.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r} fill="#ffffff" opacity={f.o} />)}
      {striche.map((p, i) => <polyline key={`g${i}`} points={p} fill="none" stroke={CYAN} strokeOpacity={0.22} strokeWidth={dick * 2.6} strokeLinecap="round" strokeLinejoin="round" />)}
      {striche.map((p, i) => <polyline key={`l${i}`} points={p} fill="none" stroke={CYAN} strokeWidth={dick} strokeLinecap="round" strokeLinejoin="round" />)}
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
            <button key={r.nr} type="button" onClick={() => setNr(r.nr)} aria-pressed={r.nr === runde.nr}
              className={`rounded-lg px-3 py-1.5 text-sm ${r.nr === runde.nr ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:text-slate-100"}`}>
              {t("kunst.runde", { n: String(r.nr) })} · {zeitraum(r.start, r.ende)} · {t(`kunst.phase.${r.phase}`)}
            </button>
          ))}
        </div>
      )}
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
      <KunstLinie linie={b.linie} saat={b.id} />
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

// Aufloesung (Jan 18.11.2026: „mit musik und treppchen … alle anderen darunter auch und bei klick in einen vollbildpopup /
// gallery"): Platz 1-3 als Treppchen (2-1-3, Gold/Silber/Bronze) mit derselben Fanfare wie beim Event-Treppchen
// (components/EventPodest, Ton nicht im Repo, Stumm-Einstellung geteilt), darunter alle weiteren, Klick -> Vollbild-Galerie.
type Ergebnis = NonNullable<KunstRunde["ergebnis"]>[number];
// Eigener Jingle (Jan sucht einen, 18.11.2026): server/media/sounds/gpskunst.mp3 — fehlt die Datei, spielt die Event-Fanfare.
const TON_KUNST = "/media/sounds/gpskunst.mp3";
const TON = "/media/sounds/winner-awards-484333.mp3";
const STUMM = "podest-stumm";
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

function Aufloesung({ runde }: { runde: KunstRunde }) {
  const t = useT();
  const e = runde.ergebnis ?? [];
  const [offen, setOffen] = useState<number | null>(null);      // Index in e
  const [stumm, setStumm] = useState(() => lies(STUMM) === "1");
  const ton = useRef<HTMLAudioElement | null>(null);
  const fanfare = () => {
    try {
      ton.current?.pause();
      const spiel = (url: string, ersatz?: string) => {
        const a = new Audio(url); a.volume = 0.6; ton.current = a;
        if (ersatz) a.addEventListener("error", () => spiel(ersatz), { once: true });
        a.play().catch(() => { /* ohne vorherige Bedienung blockt der Browser — dann per Knopf */ });
      };
      spiel(TON_KUNST, TON);
    } catch { /* egal */ }
  };
  useEffect(() => {
    if (!stumm && e.length) fanfare();
    return () => { ton.current?.pause(); };
  }, [runde.nr]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!e.length) return <p className="text-sm text-slate-400">{t("kunst.leer")}</p>;
  const top = e.slice(0, 3).map((z, i) => ({ z, i }));
  const treppe = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={fanfare} title={t("team.podest.ton")} aria-label={t("team.podest.ton")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" />
          </svg>
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
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
    </>
  );
}

/** Vollbild-Galerie der Auflösung: grosses Bild mit Umschalter Bild | Karte, Name, Platz, Herzen, Spot, Link; Pfeile/Tasten
 *  blaettern, Esc schliesst. */
function Galerie({ liste, start, onZu }: { liste: Ergebnis[]; start: number; onZu: () => void }) {
  const t = useT();
  const [i, setI] = useState(start);
  const [karte, setKarte] = useState(false);
  const z = liste[i];
  const weiter = (d: number) => { setKarte(false); setI((x) => (x + d + liste.length) % liste.length); };
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3" onClick={onZu}>
      <div className="relative w-full max-w-[min(92vw,78vh)]" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl p-1.5" style={{ background: p <= 3 ? METALL[p - 1] : "transparent" }}>
          {karte ? <KunstKarte bildId={z.bild_id} /> : <KunstLinie linie={z.linie} saat={z.bild_id} />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-white">
          <span className="text-2xl font-extrabold tabular-nums" style={{ color: p <= 3 ? METALL[p - 1] : "#e2e8f0" }}>{z.platz}.</span>
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{z.name ?? "—"}</span>
          <Herzen n={z.herzen} gross hell />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm" style={{ color: "#cbd5e1" }}>
          {z.spot && <span>{z.spot}</span>}
          {z.session_id && <Link to={`/sessions/${z.session_id}`} className="text-brand-400 hover:underline">{t("kunst.zurSession")}</Link>}
          {z.karte && (
            <span className="ml-auto inline-flex rounded-lg bg-slate-800 p-0.5 text-xs">
              {([false, true] as const).map((k) => (
                <button key={String(k)} type="button" onClick={() => setKarte(k)} aria-pressed={karte === k}
                  className={`rounded-md px-2 py-0.5 ${karte === k ? "bg-brand-500 font-semibold text-slate-950" : "text-slate-300 hover:text-slate-100"}`}>
                  {k ? t("kunst.ansichtKarte") : t("kunst.ansichtBild")}
                </button>
              ))}
            </span>
          )}
        </div>
        {liste.length > 1 && (
          <>
            <button type="button" onClick={() => weiter(-1)} aria-label={t("kunst.zurueck")}
              className="absolute left-1 top-[40%] rounded-full bg-black/50 px-3 py-2 text-2xl text-white hover:bg-black/70">‹</button>
            <button type="button" onClick={() => weiter(1)} aria-label={t("kunst.weiter")}
              className="absolute right-1 top-[40%] rounded-full bg-black/50 px-3 py-2 text-2xl text-white hover:bg-black/70">›</button>
          </>
        )}
        <button type="button" onClick={onZu} aria-label={t("common.close")}
          className="absolute -top-2 right-0 rounded-full bg-black/60 px-3 py-1 text-xl text-white hover:bg-black/80">×</button>
      </div>
    </div>,
    document.body,
  );
}

/** Echter Track auf der Karte (Strasse/Luftbild wie ueberall), Norden oben, auf den Track eingepasst. */
function KunstKarte({ bildId }: { bildId: number }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (!box.current) return;
    // keyboard: false — sonst haengt Leaflets Tastatur-Handler am document und schluckt Tasten (Spots.tsx, 17.08.).
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, keyboard: false, maxZoom: 20 });
    basiskarten(m, kartenTexte(t), { maxZoom: 20 });
    let aus = false;
    api.kunstKarte(bildId).then((r) => {
      if (aus) return;
      const grenzen = L.latLngBounds([]);
      for (const st of r.striche) {
        // Dunkler Rand darunter: Cyan allein verschwindet auf hellblauem Wasser.
        L.polyline(st as L.LatLngExpression[], { color: "#0b1a33", weight: 7, opacity: 0.85 }).addTo(m);
        L.polyline(st as L.LatLngExpression[], { color: "#22d3ee", weight: 4, opacity: 1 }).addTo(m);
        st.forEach((p) => grenzen.extend(p as L.LatLngExpression));
      }
      if (grenzen.isValid()) m.fitBounds(grenzen, { padding: [12, 12] });
    }).catch((x) => { if (!aus) setFehler(t(`kunst.err.${fehlerCode(x)}`)); });
    return () => { aus = true; m.remove(); };
  }, [bildId]);   // eslint-disable-line react-hooks/exhaustive-deps
  return fehler ? <p className="flex aspect-square items-center justify-center text-sm text-slate-400">{fehler}</p>
    : <div ref={box} className="aspect-square w-full overflow-hidden rounded-lg" />;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
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
