import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { TeamTafelMitZeilen, TeamWertungZeile, TeamZeile } from "../lib/api";
import { kennzahl } from "../lib/teamKennzahlen";
import { TeamHerkunft } from "./TeamHerkunft";
import TeamWappen from "./TeamWappen";
import { Card } from "./ui";

// Siegertreppchen ueber der Bestenliste beendeter Events (Jan, 09.11.2026). Erst nur Admins, seit 09.11. fuer alle; nur PWA
// (Entwurf: Canvas „Event-Siegertreppchen"). Zeigt die gerade gewaehlte Bestenliste: Fahrer als schwebende Foils
// (Gold am hoechsten), bei globalen Events umschaltbar auf die Team-Wertung — je Team ein Foil (Mastlaenge = Platz), darauf je Mitglied
// ein Kopf (hell = im Event gefahren, grau = nicht; wer in die Wertung kam, ist egal).
//
// Ton: „Winner Awards Logo" von tunetank (Pixabay, ID 484333, Pixabay-Lizenz: Einbau ohne Namensnennung erlaubt,
// Weitergabe der Datei fuer sich allein nicht) — liegt deshalb NICHT im Repo, sondern in server/media/sounds/ samt
// Lizenzzertifikat. Spielt bei jedem Betreten der Seite (Jan: „mit autoplay beim betreten der seite"), dazu per Knopf;
// stumm schaltbar (pro Browser). Das Podest selbst erscheint nur bei eingefrorenen Events.

const TON = "/media/sounds/winner-awards-484333.mp3";
const STUMM = "podest-stumm";

function lies(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function schreib(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* egal */ } }

// Foil in Seitenansicht wie im Wappen von Team 9: Brett flach, Mast bei ~80 %, Frontfluegel mittig, Stab hinten.
const METALL = [
  { fill: "#facc15", rand: "#a16207" },   // Gold
  { fill: "#cbd5e1", rand: "#475569" },   // Silber
  { fill: "#ea8a4a", rand: "#9a3412" },   // Bronze
];

function Foil({ platz, breite }: { platz: number; breite: number }) {
  const m = METALL[platz - 1] ?? METALL[2];
  const gold = platz === 1;
  return (
    // Breite skaliert mit der Spalte (Handy), hoechstens `breite` px.
    <svg viewBox="-20 22 162 82" className="block h-auto w-full" style={{ maxWidth: breite }} aria-hidden="true">
      {gold && (
        <g fill="#16a34a">
          <ellipse cx="-12" cy="88" rx="6" ry="3" transform="rotate(-70 -12 88)" />
          <ellipse cx="-12" cy="70" rx="6" ry="3" transform="rotate(-95 -12 70)" />
          <ellipse cx="-6" cy="53" rx="6" ry="3" transform="rotate(-120 -6 53)" />
          <ellipse cx="134" cy="88" rx="6" ry="3" transform="rotate(70 134 88)" />
          <ellipse cx="134" cy="70" rx="6" ry="3" transform="rotate(95 134 70)" />
          <ellipse cx="128" cy="53" rx="6" ry="3" transform="rotate(120 128 53)" />
          <path d="M-4 100 Q-20 75 -2 44" fill="none" stroke="#16a34a" strokeWidth="2" />
          <path d="M126 100 Q142 75 124 44" fill="none" stroke="#16a34a" strokeWidth="2" />
        </g>
      )}
      <g fill={m.fill} stroke={m.rand} strokeWidth="0.8">
        <rect x="4" y="28" width="96" height="8" rx="4" />
        <rect x="80" y="36" width="6.5" height="58" />
        <rect x="40" y="94" width="78" height="4" rx="2" />
        <path d="M36 96 Q44 91.6 58 92.6 Q68 93.4 68 96 Q68 98.6 58 99.4 Q44 100.4 36 96 Z" />
        <path d="M101 96 Q109 92.8 118.5 94.8 L118.5 97.2 Q109 99.2 101 96 Z" />
      </g>
    </svg>
  );
}

function Kopf({ gefahren, gross = false }: { gefahren: boolean; gross?: boolean }) {
  return (
    <svg width={gross ? 22 : 16} height={gross ? 34 : 25} viewBox="0 0 18 28" className={`-mx-0.5 ${gefahren ? "text-slate-100" : "text-slate-600"}`} aria-hidden="true">
      <circle cx="9" cy="6" r="4.8" fill="currentColor" />
      <path d="M1.6 27.4 Q1.6 13.6 9 13.6 Q16.4 13.6 16.4 27.4 Z" fill="currentColor" />
    </svg>
  );
}

// Reihenfolge im Raster: 2 – 1 – 3 (bei weniger als drei Plaetzen nur die vorhandenen).
function treppe<T>(l: T[]): { x: T; platz: number }[] {
  const mit = l.slice(0, 3).map((x, i) => ({ x, platz: i + 1 }));
  return mit.length === 3 ? [mit[1], mit[0], mit[2]] : mit.length === 2 ? [mit[1], mit[0]] : mit;
}

function FahrerPlatz({ z, platz, fmt }: { z: TeamZeile; platz: number; fmt: (v: number) => string }) {
  const hoch = platz === 1 ? "pb-14" : platz === 2 ? "pb-6" : "pb-0";
  const breite = platz === 1 ? 230 : platz === 2 ? 180 : 160;
  const w = z.teams?.[0];
  return (
    <div className={`flex min-w-0 flex-col items-center gap-1.5 ${hoch}`}>
      <div className="flex w-full justify-center"><Foil platz={platz} breite={breite} /></div>
      <span className={`font-extrabold leading-none tabular-nums ${platz === 1 ? "text-3xl sm:text-5xl" : platz === 2 ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl"}`}
        style={{ color: METALL[platz - 1].rand }}>{platz}.</span>
      {z.user_id ? (
        <Link to={`/foiler/${z.user_id}`} className={`max-w-full truncate font-extrabold text-slate-100 hover:text-brand-400 ${platz === 1 ? "text-base sm:text-2xl" : "text-sm sm:text-lg"}`}>{z.name ?? z.initialen}</Link>
      ) : (
        <span className={`max-w-full truncate font-extrabold text-slate-100 ${platz === 1 ? "text-base sm:text-2xl" : "text-sm sm:text-lg"}`}>{z.name ?? z.initialen}</span>
      )}
      <span className="flex max-w-full items-center gap-1.5 text-xs text-slate-400 sm:text-sm">
        <TeamHerkunft land={z.land} kuerzel={false} />
        {w && <><TeamWappen name={w.name} logo={w.logo_url} farbe={w.farbe} size={20} /><span className="hidden max-w-[10rem] truncate sm:inline">{w.name}</span></>}
      </span>
      <span className={`font-extrabold tabular-nums text-slate-100 ${platz === 1 ? "text-base sm:text-2xl" : "text-sm sm:text-lg"}`}>{fmt(z.value)}</span>
    </div>
  );
}

// Teams (Jan, 09.11.2026): statt Podest ein Foil je Team in Gold/Silber/Bronze, darauf stehen die Mitglieder,
// die Mastlaenge gibt die Hoehe (Gold am laengsten). Alle Fluegel stehen auf einer Linie.
const MAST = [70, 44, 22];
// Hoechstens so viele Koepfe (Jan, 09.11.2026); die echten Zahlen stehen darunter. Mitfahrer zuerst.
const KOEPFE_MAX = 30;

function TeamFoil({ platz }: { platz: number }) {
  const m = METALL[platz - 1] ?? METALL[2];
  const L = MAST[platz - 1] ?? 22;
  const y = 6.5 + L;           // Hoehe der Fluegel (Brett 6 hoch)
  // Ganz in Gold/Silber/Bronze, auch das Brett (Jan, 09.11.2026: „keine anderen farben").
  return (
    <svg viewBox={`0 0 122 ${y + 6}`} className="block w-full" aria-hidden="true">
      <g fill={m.fill} stroke={m.rand} strokeWidth="0.6">
        <rect x="80" y="6.5" width="6" height={L} />
        <rect x="40" y={y - 2} width="78" height="4" rx="2" />
        <path d={`M36 ${y} Q44 ${y - 4.4} 58 ${y - 3.4} Q68 ${y - 2.6} 68 ${y} Q68 ${y + 2.6} 58 ${y + 3.4} Q44 ${y + 4.4} 36 ${y} Z`} />
        <path d={`M101 ${y} Q109 ${y - 3.2} 118.5 ${y - 1.2} L118.5 ${y + 1.2} Q109 ${y + 3.2} 101 ${y} Z`} />
        <rect x="4" y="0.75" width="96" height="6" rx="3" />
      </g>
    </svg>
  );
}

function TeamPlatz({ x, platz, fmt }: { x: TeamWertungZeile & { mitglieder?: number; banner_url?: string | null; banner_fokus?: string | null }; platz: number; fmt: (v: number) => string }) {
  const mitglieder = Math.max(x.mitglieder ?? x.teilnehmer, x.teilnehmer);
  // Ueber KOEPFE_MAX: im Verhaeltnis verkleinert, mindestens ein heller Kopf, wenn jemand gefahren ist.
  const koepfe = Math.min(mitglieder, KOEPFE_MAX);
  const hell = mitglieder <= KOEPFE_MAX ? x.teilnehmer : Math.max(x.teilnehmer > 0 ? 1 : 0, Math.round(x.teilnehmer * KOEPFE_MAX / mitglieder));
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 pb-4">
      <span className={`font-extrabold leading-none tabular-nums ${platz === 1 ? "text-3xl sm:text-5xl" : platz === 2 ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl"}`}
        style={{ color: METALL[platz - 1].rand }}>{platz}.</span>
      <TeamWappen name={x.name} logo={x.logo_url} farbe={x.farbe} size={platz === 1 ? 56 : 44} />
      <Link to={`/teams/${x.slug}`} className="max-w-full truncate text-center text-sm font-extrabold text-slate-100 hover:text-brand-400 sm:text-lg">{x.name}</Link>
      <TeamHerkunft land={x.land} kuerzel={false} />
      <span className="text-base font-extrabold tabular-nums text-slate-100 sm:text-xl">{fmt(x.value)}</span>
      <div className="w-full" style={{ maxWidth: platz === 1 ? 230 : platz === 2 ? 190 : 170 }}>
        {/* Die Mitglieder stehen auf dem Brett (Brett = 3 %…82 % der Breite). */}
        <div className="ml-[3%] flex w-[79%] flex-wrap items-end justify-center gap-y-0.5" title={`${x.teilnehmer} / ${mitglieder}`}>
          {Array.from({ length: koepfe }, (_, i) => <Kopf key={i} gefahren={i < hell} gross />)}
        </div>
        <TeamFoil platz={platz} />
      </div>
      <span className="text-xs font-semibold text-slate-400">{x.teilnehmer} / {mitglieder}</span>
    </div>
  );
}

export default function EventPodest({ evId, tf, global, t }: { evId: number; tf: TeamTafelMitZeilen; global: boolean;
  t: (k: string, p?: Record<string, string>) => string }) {
  const k = kennzahl(tf.kennzahl);
  const teamsDa = global && (tf.teams?.length ?? 0) > 0;
  const [ansicht, setAnsicht] = useState<"fahrer" | "teams">("fahrer");
  const [stumm, setStumm] = useState(() => lies(STUMM) === "1");
  const ton = useRef<HTMLAudioElement | null>(null);
  const fanfareStarten = () => {
    try {
      ton.current?.pause();
      const a = new Audio(TON);
      a.volume = 0.6;
      ton.current = a;
      a.play().catch(() => { /* ohne vorherige Bedienung blockt der Browser — dann eben nur per Knopf */ });
    } catch { /* egal */ }
  };
  // Beim Betreten (je Event), wenn nicht stumm. Ohne vorherige Bedienung der Seite kann der Browser das blocken.
  useEffect(() => {
    if (stumm) return;
    fanfareStarten();
    return () => { ton.current?.pause(); };
  }, [evId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { ton.current?.pause(); }, []);

  const zeilen = tf.zeilen.slice(0, 3);
  const teams = (tf.teams ?? []).slice(0, 3);
  if (!zeilen.length && !teams.length) return null;
  const zeigeTeams = teamsDa && ansicht === "teams";
  return (
    <Card className="mb-3 overflow-hidden p-4 pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="team-akzent min-w-0 flex-1 text-lg font-bold">{t(k.labelKey)}</h3>
        <button onClick={fanfareStarten} title={t("team.podest.ton")} aria-label={t("team.podest.ton")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" />
          </svg>
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={stumm} onChange={(e) => { setStumm(e.target.checked); schreib(STUMM, e.target.checked ? "1" : null); if (e.target.checked) ton.current?.pause(); }} />
          {t("team.podest.stumm")}
        </label>
        {teamsDa && (
          <div role="group" className="flex rounded-xl bg-slate-800 p-0.5">
            {(["fahrer", "teams"] as const).map((a) => (
              <button key={a} onClick={() => setAnsicht(a)}
                className={`min-h-[36px] rounded-lg px-3 text-sm font-semibold ${ansicht === a ? "bg-slate-950 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
                {t(a === "fahrer" ? "team.podest.fahrer" : "team.event.teams")}
              </button>
            ))}
          </div>
        )}
      </div>
      {zeigeTeams ? (
        <div className="mt-3 grid grid-cols-3 items-end gap-2 sm:gap-4">
          {treppe(teams).map(({ x, platz }) => <TeamPlatz key={x.slug ?? x.name} x={x} platz={platz} fmt={k.fmt} />)}
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 items-end gap-2 sm:gap-4 pb-5">
          {treppe(zeilen).map(({ x, platz }) => <FahrerPlatz key={x.user_id ?? x.rang} z={x} platz={platz} fmt={k.fmt} />)}
        </div>
      )}
    </Card>
  );
}
