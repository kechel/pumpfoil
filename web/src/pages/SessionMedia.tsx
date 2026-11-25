// Media-Ansicht einer Session (docs/MEDIA.md, Jan 24.11.2026): Overlay-Video ohne Kartenhintergrund konfigurieren
// und im Browser erzeugen. Oben die Metadaten der Session mit Zurueck-Pfeil, darunter Vorschau und Einstellungen.
// In der bekannten Session-Ansicht aendert sich dafuer nur der Knopf „Media" neben „Abspielen".

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { Card, Spinner, ErrorBox } from "../components/ui";
import { api, type CarveData } from "../lib/api";
import { useT } from "../i18n";
import { fmtDate, fmtTime } from "../lib/time";
import { ladeSessionView } from "../lib/sessionViewPrefs";
import { fmtPumpRate, usePumpUnit } from "../lib/pumpRate";
import { baueClip } from "../lib/media/clip";
import {
  ANKER, CFG_DEFAULT, EL_KEYS, type Anker, type ElKey, type Format, type MediaCfg, type Texte,
  masse, sprintName, videoDauer, zeichne,
} from "../lib/media/zeichnen";
import { MAX_SEKUNDEN, alphaMoeglich, erzeugeVideo, webCodecsDa } from "../lib/media/export";
import { FXS, MUSIK_DEFAULT, strudelCode, strudelLink, verfuegbar, type MusikCfg } from "../lib/media/musik";
import { MediaStimmen } from "../components/MediaStimmen";
import { MediaMixe } from "../components/MediaMixe";
import { entsperren, rendere, spiele, stoppe, vorladen, wavZuBuffer, zeigeFreigabe } from "../lib/media/strudel";
import { MediaMitfahrer, type Mitfahrer } from "../components/MediaMitfahrer";
import { ANZEIGE_HAUPT, FAHRER_FARBEN, baueMehrfach, type Anzeige, type Modus } from "../lib/media/mehrfach";

/** Index des Laufs mit der laengsten Strecke (Vorauswahl). */
function besterLauf(segs: any[]): number {
  let best = 0;
  segs.forEach((g, i) => { if ((g.distance_m ?? 0) > (segs[best].distance_m ?? 0)) best = i; });
  return best;
}

const LS_KEY = "pumpfoil_media_cfg";

/** Gemerkte Einstellungen (nur dieses Geraet; ins Profil kommen sie mit Schritt 2, docs/MEDIA.md). */
function ladeCfg(): MediaCfg {
  try {
    const roh = JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
    if (roh && typeof roh === "object") {
      const el = { ...CFG_DEFAULT.el };
      for (const k of EL_KEYS) if (roh.el?.[k]) el[k] = { ...el[k], ...roh.el[k] };
      return { ...CFG_DEFAULT, ...roh, el, ebenen: { ...CFG_DEFAULT.ebenen, ...(roh.ebenen ?? {}) } };
    }
  } catch { /* Privatmodus, kaputter Eintrag */ }
  return CFG_DEFAULT;
}

// Neues Format seit den Stimmen (24.11.2026) -> eigener Schluessel, alte Einstellungen werden nicht falsch gelesen.
const LS_MUSIK = "pumpfoil_media_musik2";
function ladeMusik(): MusikCfg {
  try {
    const roh = JSON.parse(localStorage.getItem(LS_MUSIK) ?? "null");
    if (roh && typeof roh === "object" && Array.isArray(roh.stimmen)) return {
      ...MUSIK_DEFAULT, ...roh, fx: { ...MUSIK_DEFAULT.fx, ...(roh.fx ?? {}) },
    };
  } catch { /* egal */ }
  return MUSIK_DEFAULT;
}

// Je Session gemerkt (Jan 25.11.2026): Lauf, weitere Fahrer, Modus … — ueberlebt Reload und PWA-Update.
// Darstellung (cfg) und Musik gelten fuer alle Sessions und liegen in den Schluesseln oben.
const LS_SITZUNG = "pumpfoil_media_sitzung";
const SITZUNG_MAX = 30;
interface SitzungsStand {
  lauf: number | "alle"; reiter: "video" | "musik"; fahrer: Mitfahrer[]; modus: Modus;
  sprintWahl: string | null; drehen: boolean; hauptAnzeige: Anzeige; t: number;
}
function alleStaende(): Record<string, SitzungsStand> {
  try {
    const roh = JSON.parse(localStorage.getItem(LS_SITZUNG) ?? "null");
    return roh && typeof roh === "object" ? roh : {};
  } catch { return {}; }
}
function ladeStand(sid: string | undefined): Partial<SitzungsStand> {
  const st = sid ? alleStaende()[sid] : undefined;
  if (!st || typeof st !== "object") return {};
  return { ...st, fahrer: Array.isArray(st.fahrer) ? st.fahrer.filter((f) => f && Number.isFinite(f.sessionId) && f.nr >= 2 && f.nr <= 4) : [] };
}
function speichereStand(sid: string, st: Omit<SitzungsStand, "t">) {
  try {
    const alle = alleStaende();
    alle[sid] = { ...st, t: Date.now() };
    // Nur die zuletzt benutzten Sessions behalten.
    const keys = Object.keys(alle).sort((a, b) => (alle[b].t ?? 0) - (alle[a].t ?? 0));
    for (const k of keys.slice(SITZUNG_MAX)) delete alle[k];
    localStorage.setItem(LS_SITZUNG, JSON.stringify(alle));
  } catch { /* Privatmodus, voll */ }
}

const FORMATE: Format[] = ["9:16", "4:5", "1:1", "16:9"];
const TEMPI = [1, 2, 4, 8];
const GROESSEN = [0.7, 1, 1.4];

function Knopf({ an, onClick, children, title }: { an: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${an ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
      {children}
    </button>
  );
}

/** 3×3-Raster zur Wahl des Ankers. */
function AnkerWahl({ wert, onChange }: { wert: Anker; onChange: (a: Anker) => void }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-md bg-slate-800 p-0.5" role="radiogroup">
      {ANKER.map((a) => (
        <button key={a} onClick={() => onChange(a)} aria-checked={a === wert} role="radio" aria-label={a}
          className={`h-3.5 w-5 rounded-sm ${a === wert ? "bg-brand-400" : "bg-slate-600 hover:bg-slate-500"}`} />
      ))}
    </div>
  );
}

export default function SessionMedia() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [gemerkt] = useState(() => ladeStand(id));
  const t = useT();
  const unit = usePumpUnit();
  const [session, setSession] = useState<any>(null);
  const [zeiten, setZeiten] = useState<number[] | null>(null);
  const [carves, setCarves] = useState<CarveData | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [cfg, setCfg] = useState<MediaCfg>(ladeCfg);
  const [lauf, setLauf] = useState<number | "alle">(gemerkt.lauf ?? "alle");
  const [alphaOk, setAlphaOk] = useState<boolean | null>(null);
  // Rechte Spalte: Video- oder Musik-Einstellungen (Jan 24.11.2026); der Export darunter gilt fuer beides.
  const [reiter, setReiter] = useState<"video" | "musik">(gemerkt.reiter === "musik" ? "musik" : "video");
  const [musik, setMusik] = useState<MusikCfg>(ladeMusik);
  const [musikFehler, setMusikFehler] = useState<string | null>(null);
  const [musikLaedt, setMusikLaedt] = useState(false);
  useEffect(() => { try { localStorage.setItem(LS_MUSIK, JSON.stringify(musik)); } catch { /* egal */ } }, [musik]);
  useEffect(() => { if (musik.an) vorladen(); }, [musik.an]);
  // Echte Instrumente gibt es nur, wenn der Server sie hat (scripts/media-klaenge.py beim Build) — sonst nur Synths.
  const [klangUrl, setKlangUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = `${location.origin}/klaenge/strudel.json`;
    fetch(url, { method: "HEAD" }).then((r) => setKlangUrl(r.ok && (r.headers.get("content-type") ?? "").includes("json") ? url : null))
      .catch(() => setKlangUrl(null));
  }, []);
  useEffect(() => () => { stoppe(); }, []);

  useEffect(() => {
    let weg = false;
    const sid = Number(id);
    api.session(sid).then((s) => {
      if (weg) return;
      setSession(s);
      // Vorbelegt: der in der Session gewaehlte Lauf (?lauf=), sonst der gemerkte, sonst der mit der laengsten Strecke.
      const segs: any[] = s?.analysis?.segments ?? [];
      const gewaehlt = Number(searchParams.get("lauf"));
      if (searchParams.get("lauf") != null && Number.isInteger(gewaehlt) && segs[gewaehlt]) setLauf(gewaehlt);
      else if (gemerkt.lauf === "alle" || (typeof gemerkt.lauf === "number" && segs[gemerkt.lauf])) setLauf(gemerkt.lauf);
      else if (segs.length) setLauf(besterLauf(segs));
    }).catch((e) => !weg && setFehler(String(e)));
    api.sessionTrackTimes(sid).then((r) => !weg && setZeiten(r.t_ms ?? null)).catch(() => {});
    api.sessionCarves(sid).then((c) => !weg && setCarves(c)).catch(() => {});
    return () => { weg = true; };
  }, [id]);

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* egal */ } }, [cfg]);

  const { w, h } = masse(cfg);
  useEffect(() => { alphaMoeglich(w, h).then(setAlphaOk); }, [w, h]);
  // Kann der Browser kein durchsichtiges WebM: auf MP4 auf Schwarz ausweichen (geht ueberall).
  useEffect(() => { if (alphaOk === false && cfg.hintergrund === "alpha") setCfg((c) => ({ ...c, hintergrund: "schwarz" })); }, [alphaOk, cfg.hintergrund]);

  const basisClip = useMemo(
    () => (session ? baueClip(session, zeiten, carves, lauf, ladeSessionView().win) : null),
    [session, zeiten, carves, lauf],
  );

  // --- Weitere Fahrer (docs/MEDIA.md Schritt 6): je Session auf diesem Geraet gemerkt (LS_SITZUNG) ---
  const [fahrer, setFahrer] = useState<Mitfahrer[]>(gemerkt.fahrer ?? []);
  const [mitDaten, setMitDaten] = useState<Record<number, { session: any; zeiten: number[] | null }>>({});
  const [modus, setModus] = useState<Modus>(gemerkt.modus ?? "start");
  const [sprintWahl, setSprintWahl] = useState<string | null>(gemerkt.sprintWahl ?? null);
  const [drehen, setDrehen] = useState(gemerkt.drehen ?? false);
  const [hauptAnzeige, setHauptAnzeige] = useState<Anzeige>(gemerkt.hauptAnzeige ?? ANZEIGE_HAUPT);
  // Erst speichern, wenn die Session da ist — sonst ueberschriebe der Startwert „alle" den gemerkten Lauf.
  useEffect(() => {
    if (!id || !session || String(session.id) !== id) return;
    speichereStand(id, { lauf, reiter, fahrer, modus, sprintWahl, drehen, hauptAnzeige });
  }, [id, session, lauf, reiter, fahrer, modus, sprintWahl, drehen, hauptAnzeige]);
  useEffect(() => {
    let weg = false;
    for (const f of fahrer) {
      if (mitDaten[f.sessionId]) continue;
      Promise.all([api.session(f.sessionId), api.sessionTrackTimes(f.sessionId).then((r) => r.t_ms ?? null).catch(() => null)])
        .then(([s, z]) => {
          if (weg) return;
          setMitDaten((d) => ({ ...d, [f.sessionId]: { session: s, zeiten: z } }));
          // Aus dem Vergleichskorb kommt nur die Nummer — Name aus der Session nachtragen (nur fuer die Legende).
          if (f.name.startsWith("#") && (s as any)?.owner_name) setFahrer((l) => l.map((x) => (x.sessionId === f.sessionId ? { ...x, name: (s as any).owner_name } : x)));
        })
        .catch(() => { if (!weg) setFahrer((l) => l.filter((x) => x.sessionId !== f.sessionId)); });
    }
    return () => { weg = true; };
  }, [fahrer]);   // eslint-disable-line react-hooks/exhaustive-deps
  // „Uhrzeit verbergen" sperrt den Echtzeit-Versatz (Jan 25.11.2026) — fuer alle, auch Freunde.
  const echtzeitGesperrt = !!session?.zeit_verborgen || fahrer.some((f) => mitDaten[f.sessionId]?.session?.zeit_verborgen);
  useEffect(() => { if (echtzeitGesperrt && modus === "echtzeit") setModus("start"); }, [echtzeitGesperrt, modus]);
  // Gleicher Start braucht einen einzelnen Lauf des Hauptfahrers.
  useEffect(() => {
    const segs: any[] = session?.analysis?.segments ?? [];
    if (fahrer.length && modus === "start" && lauf === "alle" && segs.length) setLauf(besterLauf(segs));
  }, [fahrer.length, modus, lauf, session]);
  const mitSprintKz = useMemo(() => Array.from(new Set((basisClip?.sprints ?? []).map((s) => s.kz))).sort(), [basisClip]);
  const sprintAktiv = sprintWahl && mitSprintKz.includes(sprintWahl) ? sprintWahl : (mitSprintKz[0] ?? null);
  const fahrerClips = useMemo(() => fahrer.flatMap((f) => {
    const d = mitDaten[f.sessionId];
    if (!d) return [];
    const segs: any[] = d.session?.analysis?.segments ?? [];
    const l: number | "alle" = modus === "start" && segs.length ? (f.lauf != null && segs[f.lauf] ? f.lauf : besterLauf(segs)) : "alle";
    const c = baueClip(d.session, d.zeiten, null, l, ladeSessionView().win);
    return c ? [{ f, clip: c, session: d.session }] : [];
  }), [fahrer, mitDaten, modus]);
  const mehrErg = useMemo(() => {
    if (!basisClip || !session || !fahrerClips.length) return null;
    return baueMehrfach(basisClip, session.started_at, hauptAnzeige, fahrerClips.map(({ f, clip: c, session: s }) => ({
      clip: c, startedAt: s.started_at, anzeige: f.anzeige, farbe: FAHRER_FARBEN[f.nr - 1], nr: f.nr,
    })), modus, { sprintKz: sprintAktiv, drehen });
  }, [basisClip, session, fahrerClips, hauptAnzeige, modus, sprintAktiv, drehen]);
  const clip = mehrErg?.clip ?? basisClip;
  const mehr = mehrErg?.mehr ?? null;
  const mitHinweis = !fahrerClips.length ? null
    : !mehrErg && modus === "sprint" ? t("media.mit.noSprintMain")
    : mehr && mehr.mit.length < fahrerClips.length ? t("media.mit.noSprintSome")
    : mehr?.fern ? t("media.mit.far") : null;
  const dauer = clip ? videoDauer(clip, cfg) : 0;
  const zuLang = dauer > MAX_SEKUNDEN;
  // Ein Strudel-Code fuer Vorschau, Export und den Link nach strudel.cc.
  const code = useMemo(
    () => (clip && musik.an ? strudelCode(clip, cfg, musik, { sessionId: id ?? "", lauf: lauf === "alle" ? "all runs" : `run ${lauf + 1}`, klangUrl }) : null),
    [clip, cfg, musik, lauf, id, klangUrl],
  );

  const tx: Texte = useMemo(() => ({
    speed: t("media.l.speed"), pumps: t("stat.pumps"), pumprate: t("media.l.pumprate"), hr: t("media.l.hr"),
    distance: t("media.l.distance"), time: t("media.l.time"), carves: t("media.l.carves"),
    kmh: "km/h", bpm: "bpm",
    pumpRate: (hz: number) => fmtPumpRate(hz, unit, t),
  }), [t, unit]);

  // --- Vorschau: eigener Zeichen-Takt per requestAnimationFrame, ohne React bei jedem Bild neu zu rendern ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reglerRef = useRef<HTMLInputElement>(null);
  const zeitRef = useRef<HTMLSpanElement>(null);
  const tvRef = useRef(0);
  const [spielt, setSpielt] = useState(false);
  const spielKnopfRef = useRef<HTMLButtonElement>(null);

  const zeichneVorschau = () => {
    const c = canvasRef.current;
    if (!c || !clip) return;
    // Halbe Aufloesung reicht fuer die Vorschau; gezeichnet wird relativ zur Canvas-Groesse.
    const vw = Math.round(w / 2), vh = Math.round(h / 2);
    if (c.width !== vw || c.height !== vh) { c.width = vw; c.height = vh; }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    zeichne(ctx, clip, cfg, tvRef.current, tx, cfg.hintergrund === "alpha" ? "alpha" : cfg.hintergrund, mehr);
    if (reglerRef.current) reglerRef.current.value = String(tvRef.current);
    if (zeitRef.current) zeitRef.current.textContent = `${tvRef.current.toFixed(1)} / ${dauer.toFixed(1)} s`;
  };

  useEffect(() => {
    if (tvRef.current > dauer) tvRef.current = 0;
    zeichneVorschau();
  });   // nach jeder Aenderung der Einstellungen neu zeichnen

  // Musik zur Vorschau: startet mit Abspielen, stoppt mit Pause/Ende. Aenderungen am Mischpult oder ein Sprung im
  // Schieberegler setzen sie an der aktuellen Stelle neu auf (live mixen).
  useEffect(() => { if (!spielt) stoppe(); }, [spielt]);
  const musikNeuRef = useRef(0);
  const musikNeu = () => {
    window.clearTimeout(musikNeuRef.current);
    musikNeuRef.current = window.setTimeout(() => {
      if (code) spiele(code, () => tvRef.current, dauer).then(setMusikFehler).catch((e) => setMusikFehler(String(e?.message ?? e)));
    }, 250);
  };
  const ersterCode = useRef(code);
  useEffect(() => {
    if (ersterCode.current === code) return;
    ersterCode.current = code;
    if (spielt) { if (code) musikNeu(); else stoppe(); }
  }, [code]);   // eslint-disable-line react-hooks/exhaustive-deps
  const abspielen = async () => {
    if (spielt) { setSpielt(false); return; }
    if (tvRef.current >= dauer) tvRef.current = 0;
    if (code) {
      entsperren();   // synchron im Klick — Safari gibt den Ton sonst nicht frei
      setMusikLaedt(true);
      try {
        let r = await spiele(code, () => tvRef.current, dauer);
        if (r === "FREIGABE" && spielKnopfRef.current) {
          // Safari: Ton im Strudel-iframe erst nach einem Klick DORT — Knopf im iframe ueber den Abspielen-Knopf legen.
          setMusikLaedt(false);
          await zeigeFreigabe(spielKnopfRef.current, t("media.music.unlock"));
          setMusikLaedt(true);
          r = await spiele(code, () => tvRef.current, dauer);
          // Immer noch gesperrt: gerenderten Ton nehmen (langsam, aber geht in jedem Browser).
          if (r === "FREIGABE") r = await spiele(code, () => tvRef.current, dauer, true);
        }
        setMusikFehler(r === "FREIGABE" ? t("media.music.locked") : r);
      }
      catch (e: any) { setMusikFehler(String(e?.message ?? e)); }
      finally { setMusikLaedt(false); }
    }
    setSpielt(true);
  };

  useEffect(() => {
    if (!spielt) return;
    let raf = 0, zuletzt = performance.now();
    const schritt = (jetzt: number) => {
      tvRef.current += (jetzt - zuletzt) / 1000;
      zuletzt = jetzt;
      // Dauerschleife (Jan 24.11.2026): am Ende wieder von vorn, die Musik setzt am Anfang neu auf.
      if (tvRef.current >= dauer) {
        tvRef.current = 0;
        if (code) spiele(code, () => 0, dauer).then(setMusikFehler).catch(() => {});
      }
      zeichneVorschau();
      raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [spielt, clip, cfg, dauer, code, mehr]);   // eslint-disable-line react-hooks/exhaustive-deps

  // --- Export ---
  const [fortschritt, setFortschritt] = useState<number | null>(null);
  const [ergebnis, setErgebnis] = useState<{ url: string; name: string; mb: number } | null>(null);
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  const [phase, setPhase] = useState<"musik" | "video" | null>(null);
  const [wav, setWav] = useState<{ url: string; name: string; mb: number } | null>(null);
  useEffect(() => () => { if (wav) URL.revokeObjectURL(wav.url); }, [wav]);
  const abbruchRef = useRef<AbortController | null>(null);
  useEffect(() => () => { if (ergebnis) URL.revokeObjectURL(ergebnis.url); }, [ergebnis]);

  const erzeugen = async () => {
    if (!clip || zuLang) return;
    setSpielt(false);
    setExportFehler(null);
    if (ergebnis) { URL.revokeObjectURL(ergebnis.url); setErgebnis(null); }
    if (wav) { URL.revokeObjectURL(wav.url); setWav(null); }
    const ab = new AbortController();
    abbruchRef.current = ab;
    setFortschritt(0);
    const teil = lauf === "alle" ? "alle" : `lauf${lauf + 1}`;
    // Zeitstempel des Exports vorn (Jan 24.11.2026: „202611241047-pumpfoil-21673-lauf2-9x16.webm") — sortiert sich im
    // Download-Ordner von selbst, mehrere Exporte desselben Laufs ueberschreiben sich nicht.
    const j = new Date(), zz = (n: number) => String(n).padStart(2, "0");
    const stempel = `${j.getFullYear()}${zz(j.getMonth() + 1)}${zz(j.getDate())}${zz(j.getHours())}${zz(j.getMinutes())}`;
    try {
      // Erst die Musik (offline, im iframe), dann das Bild mit der Tonspur.
      let ton: AudioBuffer | null = null;
      if (code) {
        setPhase("musik");
        const w = await rendere(code, dauer, ab.signal);
        ton = await wavZuBuffer(w);
        setWav({ url: URL.createObjectURL(w), name: `${stempel}-pumpfoil-${id}-${teil}-${musik.vorlage}.wav`, mb: w.size / 1e6 });
      }
      setPhase("video");
      const r = await erzeugeVideo(clip, cfg, tx, setFortschritt, ab.signal, ton, mehr);
      // Export-Zaehler des geteilten Mixes, auf dem die Musik beruht (zaehlt der Server nur bei fremden Mixen).
      if (ton && musik.basisMix) api.mixExportiert(musik.basisMix).catch(() => {});
      setErgebnis({ url: URL.createObjectURL(r.blob), name: `${stempel}-pumpfoil-${id}-${teil}-${cfg.format.replace(":", "x")}.${r.endung}`, mb: r.blob.size / 1e6 });
    } catch (e: any) {
      if (e?.name !== "AbortError") setExportFehler(String(e?.message ?? e));
    } finally {
      setFortschritt(null);
      setPhase(null);
      abbruchRef.current = null;
    }
  };

  const setEl = (k: ElKey, p: Partial<MediaCfg["el"][ElKey]>) => setCfg((c) => ({ ...c, el: { ...c.el, [k]: { ...c.el[k], ...p } } }));

  // Position (3×3) + Groesse S/M/L eines Elements.
  const PlatzWahl = ({ k }: { k: ElKey }) => (
    <div className="flex items-center gap-3">
      <AnkerWahl wert={cfg.el[k].pos} onChange={(a) => setEl(k, { pos: a, an: true })} />
      <div className="flex gap-1">
        {GROESSEN.map((g, gi) => (
          <button key={g} onClick={() => setEl(k, { gr: g })}
            className={`h-7 w-7 rounded-md text-xs font-bold ${cfg.el[k].gr === g ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {["S", "M", "L"][gi]}
          </button>
        ))}
      </div>
    </div>
  );
  // Welche Sprint-Kennzahlen — gilt fuer die Ebene auf der Spur UND das Datenfeld (eine Einstellung).
  const SprintWahl = () => sprintKz.length > 0 ? (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
      <span>{t("media.el.sprint")}:</span>
      {sprintKz.map((kz) => (
        <Knopf key={kz} an={cfg.sprints.includes(kz)}
          onClick={() => setCfg({ ...cfg, sprints: cfg.sprints.includes(kz) ? cfg.sprints.filter((x) => x !== kz) : [...cfg.sprints, kz] })}>
          {sprintName(kz)}
        </Knopf>
      ))}
    </div>
  ) : null;

  if (fehler) return <ErrorBox message={fehler} />;
  if (!session) return <Spinner />;

  const segs: any[] = session.analysis?.segments ?? [];
  const sprintKz = Array.from(new Set((clip?.sprints ?? []).map((s) => s.kz))).sort();
  const elSichtbar = (k: ElKey) =>
    !((k === "pumps" || k === "pumprate") && clip && !clip.hatPumps) && !(k === "hr" && clip && !clip.hatPuls)
    && !(k === "sprint" && !sprintKz.length) && !(k === "carve" && !(clip?.carves.length)) && !(k === "fahrer" && !mehr?.mit.length);
  const hochkant = h > w;
  const hauptName: string = session.owner_name ?? t("media.mit.me");
  // Startzeit eines Laufs (Jan 24.11.2026: hilft, die zugehoerige Videoaufnahme zu finden) — Uhrzeit mit Sekunden in der
  // Ortszeit des Spots; hat der Besitzer die Uhrzeit verborgen, nur der Abstand zum Session-Beginn.
  const laufStart = (g: any): string => {
    const ms = g.t_start_session_ms ?? g.t_start_ms;
    if (ms == null) return "";
    if (session.zeit_verborgen) { const sk = Math.round(ms / 1000); return `+${Math.floor(sk / 60)}:${String(sk % 60).padStart(2, "0")}`; }
    return fmtTime(new Date(new Date(session.started_at).getTime() + ms).toISOString(), session.tz, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Kopf: Zurueck + Metadaten der Session */}
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <ZurueckPfeil fallback={`/sessions/${id}`} />
          <span>{t("media.title")}</span>
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          {fmtDate(session.started_at, session.tz, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          {!session.zeit_verborgen && <> · {fmtTime(session.started_at, session.tz)}</>}
          {session.caption && <span className="text-brand-600 dark:text-brand-300"> · {session.caption}</span>}
          {session.place_name && <span className="text-slate-400"> · {session.place_name}</span>}
          {segs.length > 0 && <span className="text-slate-400"> · {segs.length} {t("stat.runs")}</span>}
        </p>
      </div>

      {!clip ? <ErrorBox message={t("media.noData")} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Vorschau */}
          <Card className="p-3 lg:sticky lg:top-2 lg:self-start">
            <div className="flex justify-center">
              <canvas ref={canvasRef}
                className={`rounded-lg ${hochkant ? "max-h-[60vh] w-auto" : "h-auto w-full"} max-w-full`}
                style={{
                  aspectRatio: `${w} / ${h}`,
                  // Schachbrett = durchsichtig (nur in der Vorschau; die Datei bleibt leer bzw. schwarz/gruen)
                  background: cfg.hintergrund === "alpha"
                    ? "repeating-conic-gradient(#475569 0% 25%, #334155 0% 50%) 50% / 24px 24px" : undefined,
                }} />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button ref={spielKnopfRef} onClick={abspielen} disabled={musikLaedt}
                className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-60">
                {musikLaedt ? t("media.music.loading") : spielt ? t("sd.pause") : t("sd.play")}
              </button>
              <input ref={reglerRef} type="range" min={0} max={dauer} step={0.05} defaultValue={0}
                onChange={(e) => { tvRef.current = Number(e.target.value); zeichneVorschau(); if (spielt && code) musikNeu(); }}
                className="flex-1 accent-brand-400" aria-label={t("media.preview")} />
              <span ref={zeitRef} className="w-24 text-right text-xs tabular-nums text-slate-400" />
            </div>
            {/* Legende: Namen NUR hier, nie im Video (Jan 25.11.2026: „wer namen will, baut sie selber ein"). */}
            {mehr && mehr.mit.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {[{ nr: 1, name: hauptName, s: session, lauf: lauf === "alle" ? null : lauf },
                  ...fahrerClips.filter(({ f }) => mehr.mit.some((m) => m.nr === f.nr)).map(({ f, session: s }) => ({
                    nr: f.nr, name: f.name, s,
                    lauf: modus === "start" ? (f.lauf ?? besterLauf(s?.analysis?.segments ?? [])) : null,
                  }))].map((r) => (
                  <li key={r.nr} className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 text-[11px] font-extrabold text-slate-950"
                      style={{ background: FAHRER_FARBEN[r.nr - 1] }}>{r.nr}</span>
                    <span className="font-semibold text-slate-100">{r.name}</span>
                    <span className="truncate text-xs text-slate-400">
                      {fmtDate(r.s.started_at, r.s.tz, { day: "2-digit", month: "short", year: "numeric" })}
                      {!r.s.zeit_verborgen && <> {fmtTime(r.s.started_at, r.s.tz)}</>}
                      {r.s.place_name && <> · {r.s.place_name}</>}
                      {r.lauf != null && <> · {t("media.runN", { n: String(r.lauf + 1) })}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Einstellungen: Reiter Video | Musik, darunter der gemeinsame Export */}
          <div className="space-y-4">
            <div className="flex gap-1 rounded-xl bg-slate-800 p-1" role="tablist">
              {(["video", "musik"] as const).map((r) => (
                <button key={r} role="tab" aria-selected={reiter === r} onClick={() => setReiter(r)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${reiter === r ? "bg-brand-500 text-slate-950" : "text-slate-300 hover:bg-slate-700"}`}>
                  {t(r === "video" ? "media.tab.video" : "media.tab.music")}{r === "musik" && musik.an ? " ●" : ""}
                </button>
              ))}
            </div>
            {reiter === "video" && <>
            <Card className="space-y-3 p-4">
              <h3 className="font-semibold">{t("media.video")}</h3>
              <label className="block text-sm text-slate-300">{t("media.run")}
                <select value={String(lauf)} onChange={(e) => setLauf(e.target.value === "alle" ? "alle" : Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
                  {segs.length > 1 && <option value="alle">{t("media.allRuns")}</option>}
                  {segs.map((g, i) => (
                    <option key={i} value={i}>
                      {t("media.runN", { n: String(i + 1) })} · {laufStart(g)} · {Math.round(g.distance_m ?? 0)} m{g.pumps ? ` · ${g.pumps} ${t("stat.pumps")}` : ""}
                    </option>
                  ))}
                  {!segs.length && <option value="alle">{t("media.wholeTrack")}</option>}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className="w-20">{t("media.tempo")}</span>
                {TEMPI.map((x) => <Knopf key={x} an={cfg.tempo === x} onClick={() => setCfg({ ...cfg, tempo: x })}>{x}×</Knopf>)}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                <label className="flex items-center gap-2">{t("media.before")}
                  <input type="number" min={0} max={10} step={0.5} value={cfg.vor}
                    onChange={(e) => setCfg({ ...cfg, vor: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" /> s</label>
                <label className="flex items-center gap-2">{t("media.after")}
                  <input type="number" min={0} max={10} step={0.5} value={cfg.nach}
                    onChange={(e) => setCfg({ ...cfg, nach: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" /> s</label>
                <span className={zuLang ? "font-semibold text-red-700 dark:text-red-300" : "text-slate-400"}>
                  {t("media.length", { s: dauer.toFixed(1) })}
                </span>
              </div>
              {zuLang && <p className="text-sm text-red-700 dark:text-red-300">{t("media.tooLong", { max: String(MAX_SEKUNDEN) })}</p>}
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className="w-20">{t("media.format")}</span>
                {FORMATE.map((f) => <Knopf key={f} an={cfg.format === f} onClick={() => setCfg({ ...cfg, format: f })}>{f}</Knopf>)}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className="w-20">{t("media.quality")}</span>
                <Knopf an={cfg.hoehe === 720} onClick={() => setCfg({ ...cfg, hoehe: 720 })}>720p</Knopf>
                <Knopf an={cfg.hoehe === 1080} onClick={() => setCfg({ ...cfg, hoehe: 1080 })}>1080p</Knopf>
                <span className="w-2" />
                <Knopf an={cfg.fps === 30} onClick={() => setCfg({ ...cfg, fps: 30 })}>30 fps</Knopf>
                <Knopf an={cfg.fps === 60} onClick={() => setCfg({ ...cfg, fps: 60 })}>60 fps</Knopf>
                <span className="text-xs text-slate-400">{w}×{h}</span>
              </div>
              <MediaMitfahrer sessionId={Number(id)} hauptName={hauptName} hauptAnzeige={hauptAnzeige} setHauptAnzeige={setHauptAnzeige}
                fahrer={fahrer} setFahrer={setFahrer} sessions={Object.fromEntries(Object.entries(mitDaten).map(([k, v]) => [k, v.session]))}
                modus={modus} setModus={setModus} echtzeitGesperrt={echtzeitGesperrt}
                sprintKz={mitSprintKz} sprintWahl={sprintAktiv} setSprintWahl={setSprintWahl}
                drehen={drehen} setDrehen={setDrehen} hinweis={mitHinweis} />
            </Card>

            {/* Spur: was IM Track gezeigt wird (Jan 24.11.2026: Spur und Datenfelder getrennt, getrennt schaltbar). */}
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" checked={cfg.el.track.an} onChange={(e) => setEl("track", { an: e.target.checked })} className="accent-brand-400" />
                  <h3 className="font-semibold">{t("media.el.track")}</h3>
                </label>
                <PlatzWahl k="track" />
              </div>
              {cfg.el.track.an && (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                    <span>{t("media.trackColor")}</span>
                    <Knopf an={cfg.farbe === "speed"} onClick={() => setCfg({ ...cfg, farbe: "speed" })}>{t("share.color.speed")}</Knopf>
                    {clip.hatPuls && <Knopf an={cfg.farbe === "hr"} onClick={() => setCfg({ ...cfg, farbe: "hr" })}>{t("share.color.hr")}</Knopf>}
                    {clip.hatPumps && <Knopf an={cfg.farbe === "pump"} onClick={() => setCfg({ ...cfg, farbe: "pump" })}>{t("media.el.pumprate")}</Knopf>}
                    <Knopf an={cfg.farbe === "cyan"} onClick={() => setCfg({ ...cfg, farbe: "cyan" })}>{t("share.color.cyan")}</Knopf>
                    <Knopf an={cfg.farbe === "weiss"} onClick={() => setCfg({ ...cfg, farbe: "weiss" })}>{t("media.white")}</Knopf>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                    <span>{t("media.trackWidth")}</span>
                    {([[1, "media.width.thin"], [1.6, "media.width.medium"], [2.4, "media.width.thick"]] as const).map(([d, k]) => (
                      <Knopf key={d} an={(cfg.dicke || 1) === d} onClick={() => setCfg({ ...cfg, dicke: d })}>{t(k)}</Knopf>
                    ))}
                  </div>
                  {/* Ebenen ueber der Spur, wie in der Karte — laufen mit der Zeit mit. */}
                  <div className="text-sm text-slate-300">{t("media.layers")}</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {([
                      ["glides", t("media.el.glide"), clip.glides.length > 0],
                      ["carves", t("media.el.carve"), clip.carves.length > 0],
                      ["sprints", t("media.el.sprint"), sprintKz.length > 0],
                      ["pumps", t("media.el.pumps"), clip.hatPumps],
                    ] as const).filter(([, , da]) => da).map(([k, name]) => (
                      <label key={k} className="flex items-center gap-2">
                        <input type="checkbox" checked={cfg.ebenen[k]} className="accent-brand-400"
                          onChange={(e) => setCfg({ ...cfg, ebenen: { ...cfg.ebenen, [k]: e.target.checked } })} />
                        {name}
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={cfg.geist} onChange={(e) => setCfg({ ...cfg, geist: e.target.checked })} className="accent-brand-400" />
                      {t("media.ghost")}
                    </label>
                  </div>
                  {cfg.ebenen.sprints && <SprintWahl />}
                </>
              )}
            </Card>

            {/* Datenfelder: Zahlen und Anzeigen neben der Spur. */}
            <Card className="space-y-2 p-4">
              <h3 className="font-semibold">{t("media.fields")}</h3>
              <p className="text-xs text-slate-400">{t("media.fieldsHint")}</p>
              <ul className="divide-y divide-slate-800">
                {EL_KEYS.filter((k) => k !== "track" && elSichtbar(k)).map((k) => (
                  <li key={k} className="flex flex-wrap items-center gap-3 py-2">
                    <label className="flex min-w-36 flex-1 items-center gap-2 text-sm">
                      <input type="checkbox" checked={cfg.el[k].an} onChange={(e) => setEl(k, { an: e.target.checked })} className="accent-brand-400" />
                      {t(`media.el.${k}`)}
                    </label>
                    <PlatzWahl k={k} />
                  </li>
                ))}
              </ul>
              {cfg.el.sprint.an && !(cfg.el.track.an && cfg.ebenen.sprints) && <SprintWahl />}
              <label className="flex items-center gap-2 pt-1 text-sm text-slate-300">
                <input type="checkbox" checked={cfg.schatten} onChange={(e) => setCfg({ ...cfg, schatten: e.target.checked })} className="accent-brand-400" />
                {t("media.shadow")}
              </label>
            </Card>
            </>}

            {reiter === "musik" && (
              <Card className="space-y-4 p-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={musik.an} onChange={(e) => setMusik({ ...musik, an: e.target.checked })} className="accent-brand-400" />
                  <h3 className="font-semibold">{t("media.music.on")}</h3>
                </label>
                <p className="text-xs text-slate-400">{t("media.music.hint")}</p>
                {musik.an && (
                  <>
                    <MediaMixe musik={musik} setMusik={setMusik} />
                    <MediaStimmen musik={musik} setMusik={setMusik} klaengeDa={!!klangUrl} da={verfuegbar(clip, cfg)} />
                    {/* Effekte zu einzelnen Momenten des Laufs (Jan 24.11.2026) — nur die, fuer die der Lauf Daten hat. */}
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">{t("media.music.fx")}</div>
                      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                        {FXS.filter((f) =>
                          !((f === "sprintTempo" || f === "riser") && !clip.sprints.length)
                          && !(f === "carveWhoosh" && !clip.carves.length)
                          && !(f === "kampf" && !clip.hatPumps),
                        ).map((f) => (
                          <label key={f} className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={musik.fx[f]} className="accent-brand-400"
                              onChange={(e) => setMusik({ ...musik, fx: { ...musik.fx, [f]: e.target.checked } })} />
                            {t(`media.fx.${f}`)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">{t("media.music.previewHint")}</p>
                    {code && (
                      <div className="flex flex-wrap items-center gap-3">
                        <a href={strudelLink(code)} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300">
                          {t("media.music.strudel")}
                        </a>
                        <span className="text-xs text-slate-400">{t("media.music.license")} {t("media.music.privacy")}</span>
                      </div>
                    )}
                    {code && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-slate-300">{t("media.music.code")}</summary>
                        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{code}</pre>
                      </details>
                    )}
                    {musikFehler && <ErrorBox message={t("media.music.error", { e: musikFehler })} />}
                  </>
                )}
              </Card>
            )}

            <Card className="space-y-3 p-4">
              <h3 className="font-semibold">{t("media.output")}</h3>
              {(["alpha", "schwarz", "gruen"] as const).map((o) => (
                <label key={o} className={`flex gap-3 rounded-lg p-2 ${cfg.hintergrund === o ? "bg-slate-800" : ""}`}>
                  <input type="radio" name="ausgabe" checked={cfg.hintergrund === o} onChange={() => setCfg({ ...cfg, hintergrund: o })}
                    className="mt-1 accent-brand-400" disabled={o === "alpha" && alphaOk === false} />
                  <span>
                    <span className="block text-sm font-semibold">{t(`media.out.${o}`)}</span>
                    <span className="block text-xs text-slate-400">{t(`media.outHint.${o}`)}</span>
                    {o === "alpha" && alphaOk === false && <span className="block text-xs text-amber-700 dark:text-amber-300">{t("media.alphaUnsupported")}</span>}
                  </span>
                </label>
              ))}
              {!webCodecsDa() ? <ErrorBox message={t("media.noWebcodecs")} /> : (
                <div className="flex flex-wrap items-center gap-3">
                  {fortschritt == null ? (
                    <button onClick={erzeugen} disabled={zuLang || (cfg.hintergrund === "alpha" && alphaOk === false)}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
                      {t("media.create")}
                    </button>
                  ) : (
                    <>
                      <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-brand-400" style={{ width: `${Math.round(fortschritt * 100)}%` }} />
                      </div>
                      <span className="text-sm tabular-nums text-slate-300">
                        {phase === "musik" ? t("media.music.rendering") : `${Math.round(fortschritt * 100)} %`}
                      </span>
                      <button onClick={() => abbruchRef.current?.abort()} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
                        {t("media.cancel")}
                      </button>
                    </>
                  )}
                  {ergebnis && fortschritt == null && (
                    <a href={ergebnis.url} download={ergebnis.name}
                      className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300">
                      {t("media.download", { mb: ergebnis.mb.toFixed(1) })}
                    </a>
                  )}
                  {wav && fortschritt == null && (
                    <a href={wav.url} download={wav.name}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
                      {t("media.music.wav", { mb: wav.mb.toFixed(1) })}
                    </a>
                  )}
                </div>
              )}
              {exportFehler && <ErrorBox message={t("media.error", { e: exportFehler })} />}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
