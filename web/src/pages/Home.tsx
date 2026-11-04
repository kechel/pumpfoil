import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../lib/time";
import { Link, useSearchParams } from "react-router-dom";
import { api, setFreundeAnsicht, CommunityRecords, RecordSet, CommunitySession, Leaders, LeaderRow, CommunityPhoto, WatchLayout, FoilBand, TeamEventKurz, TeamListenEintrag, TeamVergleich, TeamVergleichKennzahl, TeamVergleichZeile } from "../lib/api";
import EventKurzKachel from "../components/EventKurzKachel";
import { LayoutPreview } from "../components/LayoutPreview";
import { WatchShape } from "../lib/watchLayout";
import { Card, Avatar, SELECT_SCHRUMPFT } from "../components/ui";
import { Flagge } from "../components/Flagge";
import { SocialFeed } from "../components/SocialFeed";
import { Reiterleiste, useReiter, type ReiterDef } from "../components/Reiter";
import BestenlisteBildDialog from "../components/BestenlisteBildDialog";
import TeamListenKachel from "../components/TeamListenKachel";
import TeamWappen, { teamInitialen } from "../components/TeamWappen";
import { TeamHerkunft } from "../components/TeamHerkunft";
import { TEAM_FARBEN, teamFarbStil } from "../lib/teamFarben";
import { initialenAus } from "../lib/bestenlisteBild";
import { SessionRow } from "../components/SessionRow";
import { Lightbox } from "../components/Lightbox";
import { VideoModal, ytId } from "../components/VideoModal";
import { TrackPreview } from "../components/TrackPreview";
import { CommunityIcon, PlayIcon, HeartIcon, LocationIcon, FoilIcon, WatchIcon, FlagIcon, ShareIcon } from "../components/Icons";
import { AccelToggle } from "../components/AccelToggle";
import { CommunityStats } from "../components/CommunityStats";
import { useAccelDefault } from "../lib/useAccelDefault";
import { useT } from "../i18n";
import { MOTOR_SPORTS, PADDEL_SPORTS, WIND_SPORTS, sortiereNachSport } from "../lib/sportClass";
import { fmtLaufDauer } from "../lib/dauer";

function InstallButton() {
  const t = useT();
  const [deferred, setDeferred] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone;
  if (standalone) return null;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (deferred) {
    return (
      <button
        onClick={async () => {
          deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
        className="mb-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-brand-400"
      >
        {t("home.installA2HS")}
      </button>
    );
  }
  if (isIos) {
    return (
      <div className="mb-5">
        <button
          onClick={() => setShowIos((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700"
        >
          {t("home.installIos")}
        </button>
        {showIos && (
          <p className="mt-2 text-xs text-slate-300" dangerouslySetInnerHTML={{ __html: t("home.installIosHint") }} />
        )}
      </div>
    );
  }
  return null;
}

// ACHTUNG: Diese Datei (Home.tsx) ist die COMMUNITY-Seite (Route /community in main.tsx)!
// Sie war früher mal die Startseite, ist es aber NICHT mehr. Die echte Startseite ist
// PersonalHome.tsx (Routen "/" und "/home"). Persönliches (Upload-Karte, eigene Stats etc.)
// gehört nach PersonalHome.tsx, NICHT hierher.
export default function Home() {
  return (
    <div>
      <InstallButton />
      <CommunitySection />
    </div>
  );
}

/**
 * Ab wie vielen FAHRERN ein Foil-Band überhaupt angeboten wird.
 *
 * Ein „Rekord" aus zwei Fahrern ist keiner, sondern eine persönliche Bestleistung mit Etikett.
 * Gemessen am Bestand (01.09.): die dünnsten Bänder sind „unter 1200 cm²" (5 Fahrer) und
 * „AR unter 9" (10) — die bleiben also drin, aber die Schwelle greift, sobald man zusätzlich
 * Sportart oder „nur präzise" einschränkt.
 */
/** Bis zu dieser Antwortzeit gilt eine Antwort als aus dem Service-Worker-Cache: der Cache
 *  antwortet in Millisekunden, das Netz brauchte fuer diesen Aufruf gemessene 1,25 s. Nur dann
 *  lohnt die Nachpruefung mit `fresh=1`. */
const CACHE_SCHWELLE_MS = 400;

const MIN_BAND_FAHRER = 3;

// „Heute" zuerst, dann „Gestern" (Jan, 03.11.2026: „ueberall bitte zuerst Heute"; am 02.11. stand Gestern vorn);
// der Server begrenzt „Gestern" auch nach oben.
export const PERIODS: [string, string][] = [
  ["today", "period.today"],
  ["yesterday", "period.yesterday"],
  ["10d", "period.10d"],
  ["30d", "period.30d"],
  ["365d", "period.365d"],
  ["all", "period.all"],
];

// Sekunden-seit-Mitternacht -> "HH:MM" (Early Bird / Night Owl, Sonnenzeit).
const hhmm = (v: number) => `${String(Math.floor(v / 3600)).padStart(2, "0")}:${String(Math.floor((v % 3600) / 60)).padStart(2, "0")}`;

// Auch die Foiler-Profilseite nutzt das: Label UND Formatierung je Kennzahl gehoeren an
// EINE Stelle, sonst steht derselbe Rekord an zwei Orten mit zwei Zahlen.
export const REC_ITEMS: { key: keyof RecordSet; labelKey: string; fmt: (v: number) => string }[] = [
  // Ab 1000 m in km (Jan, 01.10.2026: „23647 m" beim weitesten Lauf) — ein Pumpfoil-Lauf bleibt
  // fast immer darunter, darum fiel es erst bei einer 23-km-Fahrt auf.
  { key: "distance", labelKey: "rec.farthestRun", fmt: (v) => (v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(2)} km`) },
  { key: "duration", labelKey: "rec.longestRun", fmt: (v) => fmtLaufDauer(v) },
  { key: "speed", labelKey: "rec.topSpeed", fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` },
  { key: "glide", labelKey: "rec.longestGlide", fmt: (v) => `${v.toFixed(1)} s` },
  { key: "runs", labelKey: "rec.mostRuns", fmt: (v) => `${Math.round(v)}` },
  { key: "session_distance", labelKey: "rec.sessionDistance", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
  { key: "session_time", labelKey: "rec.sessionTime", fmt: (v) => `${Math.round(v / 60)} min` },
  { key: "session_pumps", labelKey: "rec.sessionPumps", fmt: (v) => `${Math.round(v)}` },
  { key: "max_hr", labelKey: "rec.maxHr", fmt: (v) => `${Math.round(v)} bpm` },
  { key: "early_bird", labelKey: "rec.earlyBird", fmt: hhmm },
  // Ende nach Mitternacht kommt als >24 h (z. B. 27:04) -> mod 24 h anzeigen (03:04).
  { key: "night_owl", labelKey: "rec.nightOwl", fmt: (v) => hhmm(v % 86400) },
  // Gehört einem NUTZER, nicht einer Session (Summe im Zeitraum) -> ohne Datum/Spot/Link.
  { key: "carves180", labelKey: "rec.carves180", fmt: (v) => `${Math.round(v)}` },
  // Nur Wind-Sportarten (19.10.2026): laengste Fahrt als Gesamtstrecke (der Server liefert sie nur dort).
  { key: "session_total", labelKey: "rec.sessionTotal", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
  // Rekorde je Sportart (20.10.2026, server/app/sportrekorde.py). Quoten kommen als Anteil 0..1.
  { key: "jibe_quote", labelKey: "rec.jibeQuote", fmt: (v) => `${Math.round(v * 100)} %` },
  { key: "tack_quote", labelKey: "rec.tackQuote", fmt: (v) => `${Math.round(v * 100)} %` },
  { key: "vmg_best", labelKey: "rec.vmgBest", fmt: (v) => `${v.toFixed(1)} km/h` },
  { key: "upwind_m", labelKey: "rec.upwind", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
  { key: "jibes_foil", labelKey: "rec.jibesFoil", fmt: (v) => `${Math.round(v)}` },
  { key: "ride_longest", labelKey: "rec.rideLongest", fmt: (v) => fmtLaufDauer(v) },
  { key: "ride_farthest", labelKey: "rec.rideFarthest", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
  { key: "paddle_success", labelKey: "rec.paddleSuccess", fmt: (v) => `${Math.round(v)}` },
  { key: "paddle_quote", labelKey: "rec.paddleQuote", fmt: (v) => `${Math.round(v * 100)} %` },
  { key: "paddle_foil_longest", labelKey: "rec.paddleFoilLongest", fmt: (v) => fmtLaufDauer(v) },
  { key: "wake_longest", labelKey: "rec.wakeLongest", fmt: (v) => fmtLaufDauer(v) },
  { key: "wake_time", labelKey: "rec.wakeTime", fmt: (v) => fmtLaufDauer(v) },
  { key: "dw_ab", labelKey: "rec.dwAb", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
  { key: "dw_ab_speed", labelKey: "rec.dwAbSpeed", fmt: (v) => `${v.toFixed(1)} km/h` },
  { key: "waves", labelKey: "rec.waves", fmt: (v) => `${Math.round(v)}` },
  { key: "wave_longest", labelKey: "rec.waveLongest", fmt: (v) => fmtLaufDauer(v) },
];

// Eigene Bestwerte je Sportart, eine abgesetzte Zeile je Sportart (Jan, 20.10.2026: „auch fuer einen selber im
// eigenen home und auf der eigenen Profilseite, je sportart in einer eigenen zeile etwas abgegrenzt").
export function SportRekordeZeilen({ sportarten, titel }: {
  sportarten: { sport: string; rekorde: Record<string, any> }[]; titel: string;
}) {
  const t = useT();
  if (!sportarten.length) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-2 text-xl font-bold">{titel}</h2>
      <div className="space-y-4">
        {sportarten.map((z) => (
          <div key={z.sport} className="rounded-xl border border-slate-800 p-3">
            <div className="mb-2 inline-flex rounded bg-amber-500/15 px-2 py-0.5 text-sm text-amber-700 dark:text-amber-300">{t(`cls.sport.${z.sport}`)}</div>
            <RecordGrid rec={z.rekorde as RecordSet} sport={z.sport} nurSport showSpot />
          </div>
        ))}
      </div>
    </div>
  );
}

// Rekorde je Sportart (20.10.2026): welche Zusatz-Kacheln zu welcher Sportart gehoeren.
export const SPORT_REC: Record<string, string[]> = {
  wingfoil: ["jibe_quote", "tack_quote", "vmg_best", "upwind_m", "jibes_foil", "ride_longest", "ride_farthest"],
  kitefoil: ["jibe_quote", "tack_quote", "vmg_best", "upwind_m", "jibes_foil", "ride_longest", "ride_farthest"],
  parawing: ["jibe_quote", "tack_quote", "vmg_best", "upwind_m", "jibes_foil", "ride_longest", "ride_farthest"],
  kitesurf: ["vmg_best", "upwind_m", "ride_longest", "ride_farthest"],
  windsurf: ["vmg_best", "upwind_m", "ride_longest", "ride_farthest"],
  snowkite: ["vmg_best", "upwind_m", "ride_longest", "ride_farthest"],
  kite_atb: ["vmg_best", "upwind_m", "ride_longest", "ride_farthest"],
  kitebuggy: ["vmg_best", "upwind_m", "ride_longest", "ride_farthest"],
  sup_paddle: ["paddle_success", "paddle_quote", "paddle_foil_longest"],
  sup: ["ride_longest", "ride_farthest"],
  wakethief: ["wake_longest", "wake_time"],
  surf_downwind: ["dw_ab", "dw_ab_speed"],
  surf_wave: ["waves", "wave_longest"],
};
const ALLE_SPORT_REC = new Set(Object.values(SPORT_REC).flat());

// Welche Rekord-Arten je Sportart sinnvoll sind (19.10.2026, Stand-Buch „Rekorde je Gruppe").
// Pumpfoil und alle nicht genannten: wie bisher (ohne session_total).
function recItemsFuer(sport?: string) {
  // Sportart-Rekorde ans Ende (20.10.2026); bei anderen Sportarten nie.
  const zusatz = REC_ITEMS.filter((it) => (SPORT_REC[sport ?? ""] ?? []).includes(it.key as string));
  return [...recItemsBasis(sport).filter((it) => !ALLE_SPORT_REC.has(it.key as string)), ...zusatz];
}

function recItemsBasis(sport?: string) {
  if (sport && (WIND_SPORTS.includes(sport) || PADDEL_SPORTS.includes(sport))) {
    // Die ganze Fahrt zuerst — beim Wingen ist sie die Hauptzahl (wie auf der Session-Seite).
    const rest = REC_ITEMS.filter((it) => !["glide", "session_pumps", "runs", "carves180", "session_total"].includes(it.key as string));
    return [REC_ITEMS.find((it) => it.key === "session_total")!, ...rest];
  }
  if (sport && MOTOR_SPORTS.includes(sport))
    return REC_ITEMS.filter((it) => !["glide", "session_pumps", "session_total"].includes(it.key as string));
  return REC_ITEMS.filter((it) => it.key !== "session_total");
}

// Auch von der Foil-Detailseite benutzt — dieselben Kacheln, damit Rekorde ueberall gleich aussehen.
export function RecordGrid({ rec, showSpot, sport, nurSport, nurBelegt }: { rec?: RecordSet | null; showSpot?: boolean; sport?: string; nurSport?: boolean; nurBelegt?: boolean }) {
  const t = useT();
  // `nurSport`: nur die Rekorde je Sportart (eigene Zeile je Sportart auf Home/Profil, 20.10.2026).
  const alleItems = nurSport ? REC_ITEMS.filter((it) => (SPORT_REC[sport ?? ""] ?? []).includes(it.key as string)) : recItemsFuer(sport);
  // `nurBelegt` (Spot-Ansicht, Jan 28.10.2026): nur Kacheln mit Rekord, keine Reihen aus „–".
  // Hat das Zeitfenster gar keinen Rekord, bleiben die „–"-Kacheln (statt einer leeren Flaeche).
  const belegt = nurBelegt && rec
    ? alleItems.filter((it) => { const r = rec[it.key]; return !!(r && r.value && (r.session_id || it.key === "carves180")); })
    : [];
  const items = belegt.length ? belegt : alleItems;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((it) => {
        const r = rec?.[it.key];
        // Der Carve-Rekord hängt an keiner Session (session_id ist null) — für ihn reicht ein Wert.
        const has = !!(r && r.value && (r.session_id || it.key === "carves180"));
        const inner = (
          <Card className="relative h-full overflow-hidden p-3">
            {/* Streckenverlauf auf JEDER Kachel (Jan, 02.11.2026: der Versuch „nur die erste" ist zurueckgenommen). */}
            {has && r!.track_preview && (
              <TrackPreview data={r!.track_preview} className="pointer-events-none absolute right-2 top-1/2 h-3/4 w-20 -translate-y-1/2 text-brand-400/70" />
            )}
            {/* Quoten mit Anzahl („100 % von 146", 20.10.2026): sonst sagt 100 % allein wenig. */}
            <div className="text-lg font-bold tabular-nums text-brand-400">
              {has ? ((r as any).anzahl ? t("rec.ofN", { p: it.fmt(r!.value), n: String((r as any).anzahl) }) : it.fmt(r!.value)) : "–"}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-300">{t(it.labelKey)}</div>
            {has && (
              <div className="mt-0.5 text-[11px] text-slate-300">
                {r!.name && (
                  <span className="inline-flex items-center gap-1 align-middle">
                    <Avatar name={r!.name} url={r!.avatar_url} userId={r!.user_id} size={20} />
                    <span className="pf-name text-brand-600 dark:text-brand-300">{r!.name}</span>
                  </span>
                )}
                {r!.started_at && (
                  <span className="text-slate-400">
                    {r!.name ? " · " : ""}
                    {fmtDate(r!.started_at, r!.tz, { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                )}
                {showSpot && r!.spot && <span className="flex items-center gap-1 text-slate-400"><LocationIcon className="h-3.5 w-3.5" /> {r!.spot}</span>}
              </div>
            )}
          </Card>
        );
        return has && r!.session_id ? (
          <Link
            key={it.key}
            to={`/sessions/${r!.session_id}${r!.run_idx != null ? `?run=${r!.run_idx}` : ""}`}
            className="block transition-colors hover:opacity-90"
          >
            {inner}
          </Link>
        ) : (
          <div key={it.key}>{inner}</div>
        );
      })}
    </div>
  );
}

/** Zeit auf dem Foil als h:mm (unter einer Stunde m:ss), Strecke in km mit einer Nachkommastelle. */
const dauerText = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

// On-Foil-Strecke und -Zeit (Jan, 01.11.2026): zaehlen auch GPS-only-Fahrten, die bei den Pumps nie auftauchen. Je
// zweimal, die zweite Reihe des Rasters: weitester/laengster EINZELNER Lauf (Beschriftung wie bei den Rekorden) und
// die Summe im Zeitraum. Einheit fest („km", „h" bzw. „min" — international lesbar).
const LEADER_KINDS: { key: Exclude<keyof Leaders, "me">; labelKey: string; field: keyof LeaderRow; unitKey?: string;
                      unit?: (v: number) => string; fmt?: (v: number) => string }[] = [
  // Reihenfolge nach dem Vorschlag eines Team-Kapitaens (02.11.2026): zuerst die Laufdauer — weltweit DIE Kennzahl —,
  // dann die Summen, zuletzt der weiteste Lauf (fast dieselbe Reihung wie die Dauer). Bei Wind/Paddeln vorne die ganze Fahrt.
  { key: "ride_total", labelKey: "rec.sessionTotal", field: "ride_total_m", unit: () => "km", fmt: (v) => (v / 1000).toFixed(1) },
  { key: "run_time", labelKey: "rec.longestRun", field: "run_time_s", unit: (v) => (v >= 3600 ? "h" : "min"), fmt: dauerText },
  { key: "distance", labelKey: "leader.totalDistance", field: "distance_m", unit: () => "km", fmt: (v) => (v / 1000).toFixed(1) },
  { key: "time", labelKey: "leader.totalTime", field: "time_s", unit: (v) => (v >= 3600 ? "h" : "min"), fmt: dauerText },
  { key: "runs", labelKey: "leader.mostRuns", field: "runs", unitKey: "unit.runs" },
  { key: "pumps", labelKey: "leader.mostPumps", field: "pumps", unitKey: "unit.pumps" },
  { key: "sessions", labelKey: "leader.mostSessions", field: "sessions", unitKey: "unit.sessions" },
  { key: "spots", labelKey: "leader.mostSpots", field: "spots", unitKey: "unit.spots" },
  { key: "run_distance", labelKey: "rec.farthestRun", field: "run_distance_m", unit: () => "km", fmt: (v) => (v / 1000).toFixed(2) },
];

function LeaderList({ rows, field, unit, fmt, me }: { rows: LeaderRow[]; field: keyof LeaderRow; unit: string | ((v: number) => string);
                      fmt?: (v: number) => string; me?: LeaderRow | null }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">—</p>;
  const zeile = (r: LeaderRow, platz: number, ich = false) => {
    const inhalt = (
      <>
        <span className="pf-name min-w-0 flex-1 truncate text-sm text-slate-200">{r.name}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-100">{fmt ? fmt(r[field] as number) : r[field] as number}</span>
        <span className="shrink-0 text-[10px] uppercase text-slate-400">{typeof unit === "function" ? unit(r[field] as number) : unit}</span>
      </>
    );
    return (
      <div key={ich ? "ich" : r.name} className={`flex items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-1.5 ${ich ? "ring-1 ring-cyan-400/60" : ""}`}>
        <span className="min-w-4 shrink-0 text-center text-xs font-bold tabular-nums text-slate-400">{platz}</span>
        <Avatar name={r.name} url={r.avatar_url} userId={r.user_id} size={30} />
        <Flagge land={r.land} />
        {/* Einzellauf-Listen fuehren direkt zur Session (Jan, 01.11.2026). Das Profilbild bleibt eigener Link aufs
            Profil, deshalb ist nur der Rest der Zeile der Link (kein <a> im <a>). */}
        {r.session_id
          ? <Link to={`/sessions/${r.session_id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">{inhalt}</Link>
          : <div className="flex min-w-0 flex-1 items-center gap-2">{inhalt}</div>}
      </div>
    );
  };
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => zeile(r, i + 1))}
      {/* Die eigene Stelle unter Platz 10 (Olek, 01.11.2026) — der Server liefert sie nur, wenn man nicht schon oben steht. */}
      {me && me.rank != null && (
        <>
          <div className="text-center text-xs leading-none text-slate-400" aria-hidden>⋮</div>
          {zeile(me, me.rank, true)}
        </>
      )}
    </div>
  );
}

function LatestMedia() {
  const t = useT();
  const [media, setMedia] = useState<CommunityPhoto[] | null>(null);
  const [lb, setLb] = useState<number | null>(null);
  const [vid, setVid] = useState<string | null>(null);
  // Lokaler Like-/Melde-Status je session_id (initial aus der API).
  const [soc, setSoc] = useState<Record<number, { liked: boolean; like_count: number; my_inappropriate: boolean }>>({});
  useEffect(() => {
    api.communityLatestPhotos(30).then((ps) => {
      setMedia(ps);
      const init: Record<number, { liked: boolean; like_count: number; my_inappropriate: boolean }> = {};
      ps.forEach((p) => { init[p.session_id] = { liked: !!p.liked, like_count: p.like_count ?? 0, my_inappropriate: !!p.my_inappropriate }; });
      setSoc(init);
    }).catch(() => {});
  }, []);
  if (!media || media.length === 0) return null;

  const like = (sid: number) =>
    api.toggleLike(sid).then((r) => setSoc((s) => ({ ...s, [sid]: { ...s[sid], liked: r.liked, like_count: r.like_count } }))).catch(() => {});

  // Nur Fotos kommen in die Lightbox; Index dort getrennt zählen.
  const photoItems = media.filter((m) => m.kind !== "video" && m.url);

  return (
    <div>
      <h3 className="mb-2 text-lg font-bold">{t("home.latestMedia")}</h3>
      {/* Eine Zeile, seitlich wischbar (Jan, 02.11.2026) — die Medien sollen den Reiter nicht fuellen. */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {media.map((p) => {
          const st = soc[p.session_id] ?? { liked: false, like_count: 0, my_inappropriate: false };
          const isVideo = p.kind === "video";
          const thumb = isVideo ? `/api/public/video-thumb/${ytId(p.youtube_url)}` : (p.thumb_url || p.url) || "";
          const openMedia = () => isVideo ? setVid(p.youtube_url || null) : setLb(photoItems.findIndex((x) => x.session_id === p.session_id && x.url === p.url));
          return (
            <div key={`${p.kind}-${p.session_id}`} className="group w-44 shrink-0 snap-start sm:w-52">
              <button onClick={openMedia} className="relative block w-full">
                <img src={thumb} alt="" className="aspect-square w-full rounded-xl object-cover transition-opacity group-hover:opacity-90" />
                {isVideo && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white"><PlayIcon className="h-5 w-5" /></span>
                  </span>
                )}
              </button>
              <div className="mt-1 flex items-center gap-1.5">
                <Avatar name={p.name} url={p.avatar_url} userId={p.user_id} size={18} />
                <div className="min-w-0 text-[11px] leading-tight">
                  <div className="truncate text-slate-200">{p.name || "—"}</div>
                  <div className="truncate text-slate-400">
                    {p.started_at && fmtDate(p.started_at, p.tz, { day: "2-digit", month: "short" })}
                    {p.spot ? ` · ${p.spot}` : ""}
                  </div>
                </div>
              </div>
              {p.caption && <div className="mt-0.5 truncate text-[11px] italic text-slate-300">{p.caption}</div>}
              <div className="mt-1 flex items-center gap-1">
                <button onClick={() => like(p.session_id)} title={st.liked ? t("row.unlike") : t("row.like")}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${st.liked ? "text-rose-400" : "text-slate-400 hover:text-slate-200"}`}>
                  <HeartIcon className="h-3.5 w-3.5" filled={st.liked} />{st.like_count > 0 && <span className="tabular-nums">{st.like_count}</span>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {lb != null && lb >= 0 && (
        <Lightbox
          photos={photoItems.map((p) => ({ ...p, url: p.url as string, ...soc[p.session_id] }))}
          index={lb}
          onClose={() => setLb(null)}
        />
      )}
      {vid && <VideoModal url={vid} onClose={() => setVid(null)} />}
    </div>
  );
}

/**
 * Beschriftung eines Foil-Bandes — EINE Stelle, damit Dropdown und Bestenlisten-Kopf nie
 * auseinanderlaufen. Reine Zahlenbereiche brauchen keinen Übersetzungs-Schlüssel.
 */
export function bandLabel(b: FoilBand, t: (k: string, p?: Record<string, string>) => string): string {
  if (b.art === "alle") return t("cr.foilAll");
  if (b.art === "eigenes") return t("cr.foilMine");
  if (b.art === "ar") {
    return b.von != null ? t("cr.foilHighAspect", { n: String(b.von) }) : t("cr.foilThick", { n: String(b.bis) });
  }
  if (b.von != null && b.bis != null) return `${b.von}–${b.bis} cm²`;
  if (b.bis != null) return t("cr.foilUnder", { n: String(b.bis) });
  return `${b.von}+ cm²`;
}

/**
 * Was ein Band GENAU einschliesst — als Satz unter der Auswahl.
 *
 * Warum es das braucht: „Wie mein Foil" sagt nicht, welches Foil gemeint ist und wie weit der
 * Vergleich reicht (Jan, 04.09.: „es fehlt aber eine info was dann genau die grenzen sind, und
 * ich weiss auch nicht welche von meinen foils da dann verwendet werden"). Der Server liefert
 * beides seit jeher mit (`foil`, `von`/`bis`, `ar_von`/`ar_bis`) — es stand nur nirgends.
 */
export function bandInfo(b: FoilBand, t: (k: string, p?: Record<string, string>) => string): string | null {
  if (b.art === "alle") return null;
  const teile: string[] = [];
  if (b.von != null && b.bis != null && b.art !== "ar") teile.push(`${b.von}–${b.bis} cm²`);
  else if (b.art !== "ar" && b.bis != null) teile.push(`< ${b.bis} cm²`);
  else if (b.art !== "ar" && b.von != null) teile.push(`> ${b.von} cm²`);
  // Dezimaltrennzeichen NICHT hart setzen: „10,2" ist deutsch, „10.2" englisch. toLocaleString
  // nimmt die Sprache des Browsers — dieselbe Zahl, richtig geschrieben.
  const zahl = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString());
  if (b.ar_von != null && b.ar_bis != null) {
    teile.push(t("cr.bandAspect", { a: zahl(b.ar_von), b: zahl(b.ar_bis) }));
  } else if (b.art === "ar") {
    teile.push(b.von != null
      ? t("cr.bandAspectFrom", { n: zahl(b.von) })
      : t("cr.bandAspectTo", { n: zahl(b.bis) }));
  }
  const grenzen = teile.join(" · ");
  if (b.art === "eigenes") {
    return b.foil
      ? t("cr.bandMine", { foil: b.foil, grenzen })
      : t("cr.bandMineNone");
  }
  return grenzen ? t("cr.bandRange", { grenzen }) : null;
}

export function Leaderboards({ period, accelOnly, sport = "pumpfoil", band, kopf, spot }: { period: string; accelOnly: boolean; sport?: string; band?: FoilBand; kopf?: React.ReactNode; spot?: string }) {
  const t = useT();
  const [data, setData] = useState<Leaders | null>(null);
  // Nur EINE Bestenliste sichtbar, umschaltbar ueber Reiter (Jan, 01.11.2026: mit acht Listen nebeneinander war die
  // Seite unuebersichtlich). Die Wahl merkt sich der Browser (nur Komfort; ohne Speicher gilt „Sessions").
  // Die Wahl steht in der Adresse (`lb`), damit ein geteilter Link genau diese Liste zeigt und man beim Zurueckkommen
  // dort landet (02.11.2026); ohne Adresse gilt die zuletzt gewaehlte (nur Komfort), sonst die laengste Laufdauer.
  const [sp, setSp] = useSearchParams();
  const wahl = sp.get("lb") || (() => { try { return localStorage.getItem("foil_leader_wahl"); } catch { return null; } })() || "run_time";
  const waehlen = (k: string) => {
    try { localStorage.setItem("foil_leader_wahl", k); } catch { /* egal */ }
    setSp((alt) => { const n = new URLSearchParams(alt); n.set("lb", k); return n; }, { replace: true });
  };
  // Als Bild teilen (Vorschlag eines Team-Kapitaens, 02.11.2026) — derselbe Dialog wie bei den Team-Bestenlisten.
  const [bild, setBild] = useState(false);
  useEffect(() => {
    let aktiv = true;
    const bk = band?.key ?? "all";
    const begonnen = performance.now();
    api.leaders(period, accelOnly, sport, bk, false, spot).then((d) => {
      if (!aktiv) return;
      setData(d);
      if (performance.now() - begonnen > CACHE_SCHWELLE_MS) return;   // kam vom Netz, also frisch
      const gezeigt = JSON.stringify(d);
      return api.leaders(period, accelOnly, sport, bk, true, spot).then((frisch) => {
        if (aktiv && JSON.stringify(frisch) !== gezeigt) setData(frisch);
      });
    }).catch(() => {});
    return () => { aktiv = false; };
  }, [period, accelOnly, sport, band?.key, spot]);
  if (!data) return null;
  // Leer: Ueberschrift und Filter bleiben stehen — man soll den Zeitraum hier auch wieder weiter stellen koennen.
  const empty = data.sessions.length === 0 && data.runs.length === 0 && data.spots.length === 0;
  const periodLabelKey = PERIODS.find(([k]) => k === period)?.[1] ?? "";
  return (
    <div>
      <h3 className="mb-2 text-lg font-bold">
        {t("home.leaderboards")}
        {periodLabelKey && <span className="ml-2 text-sm font-normal text-slate-400">· {t(periodLabelKey)}</span>}
        {/* Das gewählte Foil-Band gehört in die Überschrift: sonst steht hier eine Bestenliste,
            die nur einen Teil der Flotte umfasst, ohne dass man es sieht (Jans Vorgabe 01.09.). */}
        {band && band.art !== "alle" && (
          <span className="ml-2 text-sm font-normal text-brand-600 dark:text-brand-300">· {bandLabel(band, t)}</span>
        )}
      </h3>
      {kopf}
      {empty ? <p className="text-xs text-slate-400">—</p> : <>
      {/* Je Sportart (19.10.2026): bei Wind zaehlen weder Pumps noch Laeufe (viele Laeufe heisst
          dort eher viele Stuerze), bei Motor keine Pumps. Pumpfoil wie bisher. */}
      {(() => {
        const arten = LEADER_KINDS.filter((k) => !(
          ((WIND_SPORTS.includes(sport) || PADDEL_SPORTS.includes(sport)) && (k.key === "pumps" || k.key === "runs"))
          || (MOTOR_SPORTS.includes(sport) && k.key === "pumps")
          || (k.key === "ride_total" && !(WIND_SPORTS.includes(sport) || PADDEL_SPORTS.includes(sport)))));
        const k = arten.find((a) => a.key === wahl) ?? arten[0];
        return (
          <>
            <div className="mb-3 flex flex-wrap gap-1" role="tablist">
              {arten.map((a) => (
                <button key={a.key} role="tab" aria-selected={a.key === k.key} onClick={() => waehlen(a.key)}
                  className={`rounded-lg px-2.5 py-1 text-xs ${a.key === k.key ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}>
                  {t(a.labelKey)}
                </button>
              ))}
            </div>
            <div className="max-w-xl">
              <LeaderList rows={data[k.key] ?? []} field={k.field} unit={k.unit ?? t(k.unitKey ?? "")} fmt={k.fmt} me={data.me?.[k.key]} />
              {(data[k.key] ?? []).length > 0 && (
                <button onClick={() => setBild(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-brand-600 hover:bg-slate-700 dark:text-brand-300">
                  <ShareIcon className="h-4 w-4" /> {t("team.bild.titel")}
                </button>
              )}
            </div>
            {bild && (() => {
              const fmtWert = (r: LeaderRow) => {
                const v = r[k.field] as number;
                const u = typeof k.unit === "function" ? k.unit(v) : t(k.unitKey ?? "");
                return `${k.fmt ? k.fmt(v) : v} ${u}`;
              };
              const zeile = (r: LeaderRow, rang: number) => ({ rang, name: r.name, initialen: initialenAus(r.name), wert: fmtWert(r), land: r.land });
              const eigene = data.me?.[k.key];
              return (
                <BestenlisteBildDialog onClose={() => setBild(false)} titel={t("team.bild.titel")} dateiname={`pumpfoil-${k.key}.jpg`}
                  daten={{
                    titel: t(k.labelKey),
                    unterzeile: [t(`cls.sport.${sport}`), t(periodLabelKey), band && band.art !== "alle" ? bandLabel(band, t) : null,
                      new Date().toLocaleDateString(document.documentElement.lang || undefined)].filter(Boolean).join(" · "),
                    zeilen: (data[k.key] ?? []).slice(0, 10).map((r, i) => zeile(r, i + 1)),
                    eigene: eigene && eigene.rank != null ? zeile(eigene, eigene.rank) : null,
                    leer: "—",
                  }} />
              );
            })()}
          </>
        );
      })()}
      </>}
    </div>
  );
}

/** „Best bewertet" und „Meist kommentiert" (Jan, 03.11.2026) — dieselbe Liste, nur anders sortiert. Unter jeder
 *  Ueberschrift stehen die Zeitknoepfe (`zeit`, derselbe Zeitraum wie die Bestenliste); mit ihnen bleibt der Block auch
 *  leer stehen, damit man den Zeitraum zurueckstellen kann. */
function TopLiked({ period, nach = "likes", zeit }: { period: string; nach?: "likes" | "kommentare"; zeit?: React.ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<CommunitySession[] | null>(null);
  useEffect(() => {
    (nach === "kommentare" ? api.topCommented(period) : api.topLiked(period)).then(setItems).catch(() => {});
  }, [period, nach]);
  if (!items || (items.length === 0 && !zeit)) return null;
  const periodLabelKey = PERIODS.find(([k]) => k === period)?.[1] ?? "";
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">
        {t(nach === "kommentare" ? "home.topCommented" : "home.topRated")}
        {!zeit && periodLabelKey && <span className="ml-2 text-sm font-normal text-slate-400">· {t(periodLabelKey)}</span>}
      </h3>
      {zeit && <div className="mb-3 flex flex-wrap items-center gap-1">{zeit}</div>}
      {items.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
        <div className="space-y-1.5">
          {items.map((s) => (
            <SessionRow key={s.session_id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}


function CommunitySection() {
  const t = useT();
  const reiter: ReiterDef[] = [
    // Rekorde und Bestenliste in EINER Ansicht (Jan, 02.11.2026: „die kacheln passen gut ueber die leaderboards, sonst
    // werden die seiten zuuu klein"). Alte Links mit ?tab=rekorde landen ueber den Rueckfall ebenfalls hier.
    { id: "bestenliste", label: t("tab.rankings") },
    { id: "medien", label: t("tab.media") },
    { id: "teams", label: t("land.teamsTitle") },
  ];
  const [tab, setTab] = useReiter("community", reiter.map((r) => r.id), "bestenliste", { merken: true });
  const [data, setData] = useState<CommunityRecords | null>(null);
  // Sportart-Filter (docs/sport-classification.md). Nur Sportarten mit mindestens EINEM Lauf
  // all time stehen zur Wahl (Jans Vorgabe) — sonst neun Kategorien, acht davon leer.
  // Zeitraum, Sportart und Foil stehen in der Adresse (02.11.2026): beim Zurueckkommen ist die Auswahl noch da, und ein
  // geteilter Link zeigt genau diese Ansicht. Wechsel ersetzen den Verlaufseintrag, wie die Reiter.
  const [sp, setSp] = useSearchParams();
  const setzeParam = (k: string, v: string, standard: string) =>
    setSp((alt) => { const n = new URLSearchParams(alt); v === standard ? n.delete(k) : n.set(k, v); return n; }, { replace: true });
  const sport = sp.get("sport") || "pumpfoil";
  const setSport = (v: string) => setzeParam("sport", v, "pumpfoil");
  const [sports, setSports] = useState<{ sport: string; runs: number }[]>([]);
  // Ohne Wahl in der Adresse: „Heute", sobald heute alle 10 Plaetze der Bestenliste besetzt sind (Vorschlag eines
  // Team-Kapitaens, 02.11.2026 — „wenn heute mit heute uebereinstimmt, wirkt die Seite gepflegt"), sonst 10 Tage.
  const [autoPeriod, setAutoPeriod] = useState("10d");
  const period = sp.get("period") || autoPeriod;
  const setPeriod = (v: string) => setSp((alt) => { const n = new URLSearchParams(alt); n.set("period", v); return n; }, { replace: true });
  // nur Accel (präzise) vs. auch GPS-only (mit erkanntem On-Foil). Default smart:
  // accel, wenn der Nutzer Accel-Daten hat, sonst alle.
  const [accelWahl, setAccelOnly] = useAccelDefault();
  // Dritte Taste „Freunde" (Jan, 15.10.2026): die GANZE Seite nur ueber mich + meine Freunde —
  // Rekorde, Medien, Ranglisten, Spots. Wie „alle" (auch GPS-only), nur eingegrenzt; der Filter
  // sitzt im Server (`_community`), hier wird er nur beim RENDERN eingeschaltet, damit auch die
  // Effekte der Kinder (die vor denen dieser Komponente laufen) ihn schon sehen.
  const [freunde, setFreunde] = useState(false);
  const accelOnly = accelWahl && !freunde;
  setFreundeAnsicht(freunde);
  useEffect(() => () => setFreundeAnsicht(false), []);
  useEffect(() => {
    if (sp.get("period")) return;
    let aktuell = true;
    api.leaders("today", accelOnly, sport).then((d) => { if (aktuell && d.sessions.length >= 10) setAutoPeriod("today"); }).catch(() => {});
    return () => { aktuell = false; };
  }, [sport]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Foil-Band („vergleichbare Foils") für Rekorde UND Bestenlisten — NICHT für Spots und
  // „Am besten bewertet" (Jans Vorgabe): dort geht es nicht um Vergleichbarkeit der Ausrüstung.
  // Die Bänder samt Session- und Fahrerzahl kommen vom Server (s. /api/community/foil-bands),
  // damit hier keine Grenzen fest verdrahtet sind und die Oberfläche dünne Gruppen ausblenden kann.
  const [bands, setBands] = useState<FoilBand[]>([]);
  const bandKey = sp.get("band") || "all";
  const setBandKey = (v: string) => setzeParam("band", v, "all");
  const band = bands.find((b) => b.key === bandKey);
  // Alles, was den Inhalt der Rekorde aendert — wechselt eines davon, sind die gemerkten
  // Zeitraeume wertlos. Die Sportart gehoert ausdruecklich dazu (Jan, 16.09.2026).
  const filterKey = `${accelOnly}|${sport}|${bandKey}|${freunde}`;
  const geholt = useRef<{ key: string; perioden: Set<string> }>({ key: "", perioden: new Set() });

  // Rekorde werden ZEITRAUMWEISE geholt und behalten (16.09.2026). Die Seite zeigt immer genau
  // einen Zeitraum, geliefert wurden bis dahin alle fuenf: 268 KB roh, 50 KB gzip, 254 ms
  // Rechenzeit — bei Jan ueber die echte Verbindung 1,25 s, und so lange blieb die halbe
  // Community-Seite leer. Vier Fuenftel davon sah nie jemand.
  // Schon geholte Zeitraeume bleiben liegen, ein Wechsel zurueck steht also sofort da; ein
  // Wechsel von Genauigkeit, Sportart oder Foil-Band wirft alles weg (`filterKey`).
  //
  // ZWEI Aufrufe je Zeitraum, mit Absicht: der erste darf aus dem Service-Worker-Cache kommen
  // und steht sofort da, der zweite geht garantiert ans Netz (`fresh`) und ersetzt den Stand nur
  // bei echter Aenderung. Sie laufen NACHEINANDER, nicht nebeneinander — beim ersten Anlauf
  // standen sie parallel, und bei leerem Cache gingen dann beide ans Netz; Jan gemeldet:
  // „jetzt laedt die community seite noch langsamer". Ob der erste aus dem Cache kam, verraet
  // `fetch` nicht, aber die Zeit tut es: Cache antwortet in Millisekunden.
  useEffect(() => {
    const g = geholt.current;
    if (g.key !== filterKey) { g.key = filterKey; g.perioden = new Set(); setData(null); }
    if (g.perioden.has(period)) return;      // dieser Zeitraum liegt schon vor -> sofort da
    g.perioden.add(period);
    const meinKey = filterKey;
    // Spaete Antwort eines inzwischen abgewaehlten Filters verwerfen.
    const uebernehmen = (d: CommunityRecords) =>
      setData((alt) => (geholt.current.key !== meinKey ? alt : { ...(alt || {}), ...d }));

    const begonnen = performance.now();
    api.communityRecords(accelOnly, sport, bandKey, undefined, false, period).then((d) => {
      uebernehmen(d);
      if (performance.now() - begonnen > CACHE_SCHWELLE_MS) return;   // kam vom Netz, also frisch
      const gezeigt = JSON.stringify(d[period as keyof CommunityRecords]);
      return api.communityRecords(accelOnly, sport, bandKey, undefined, true, period).then((frisch) => {
        if (JSON.stringify(frisch[period as keyof CommunityRecords]) !== gezeigt) uebernehmen(frisch);
      });
    }).catch(() => { g.perioden.delete(period); });   // gescheitert -> beim naechsten Mal erneut
  }, [filterKey, period]);

  useEffect(() => {
    api.foilBands(accelOnly, sport).then((bs) => {
      setBands(bs);
      // Zurück auf „Alle Foils", wenn das gewählte Band durch einen Wechsel von Sportart oder
      // Genauigkeit zu dünn geworden ist — sonst stünde man vor leeren Rekorden.
      if (!bs.some((b) => b.key === bandKey && (b.art === "alle" || b.fahrer >= MIN_BAND_FAHRER))) {
        setBandKey("all");
      }
    }).catch(() => setBands([]));
  }, [accelOnly, sport, freunde]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.communitySports().then(setSports).catch(() => {});
  }, []);

  // KEINE Sperre auf `data` mehr (16.09.2026). Frueher stand hier `if (!data) return null;` —
  // damit warteten Kopf, Zaehlersatz, Filter, Medien, Ranglisten, Layouts und Spots alle auf den
  // teuersten Aufruf der Seite, obwohl ihre eigenen Daten in 2–10 ms da sind (nachgemessen).
  // `RecordGrid` kommt ohne Daten aus und zeichnet „–"-Kacheln derselben Groesse, die sich
  // fuellen, sobald die Rekorde eintreffen — es springt also nichts nach.
  // Filterzeile (Zeitraum, accel/alle/Freunde, Sportart, Foil-Band) — EINMAL gebaut, zweimal gezeigt: oben ueber den
  // Rekorden und nochmal ueber der Bestenliste (Jan, 01.11.2026). Beide haengen am selben Zustand, aendern also
  // immer beides.
  const waehlbareBaender = bands.filter((b) => b.art === "alle" || b.fahrer >= MIN_BAND_FAHRER);
  // Nur die Zeitknoepfe gibt es auch einzeln: im Reiter Medien ueber „Best bewertet"/„Meist kommentiert", die sich
  // nur nach dem Zeitraum richten (Sportart, Foil und accel gelten dort nicht).
  const zeitKnoepfe = PERIODS.map(([k, labelKey]) => (
    <button
      key={k}
      onClick={() => setPeriod(k)}
      className={`rounded-lg px-2.5 py-1 text-xs ${period === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
    >
      {t(labelKey)}
    </button>
  ));
  const filterZeile = (
      <div className="mb-3 flex flex-wrap items-center gap-1">
      {zeitKnoepfe}
      <AccelToggle value={accelWahl} onChange={(v) => { setFreunde(false); setAccelOnly(v); }} className="ml-auto"
                   freunde={freunde} onFreunde={() => setFreunde(true)} />
      {/* Sportart-Filter: erscheint erst, wenn es überhaupt eine zweite Sportart mit Läufen gibt
          (Jan: „nur die mit mind. einem lauf all time"). Betrifft Rekorde, Rangliste und Spots —
          NICHT „Neueste Medien", „Am besten bewertet" und die Uhr-Layouts: die kommen absichtlich
          immer aus allen Sportarten. */}
      {sports.length > 1 && (
        <select value={sport} onChange={(e) => setSport(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
          {sortiereNachSport(sports, (x) => x.sport, t).map((x) => <option key={x.sport} value={x.sport}>{t(`cls.sport.${x.sport}`)}</option>)}
        </select>
      )}
      {/* Foil-Band. Reihenfolge kommt vom Server (Nützlichstes oben). Die Sessionzahl steht
          dabei, weil jede Auswahl außer „Alle Foils" den Topf verkleinert — 36 % der Sessions
          haben gar kein Foil hinterlegt und fallen dann heraus. */}
      {/* Erst filtern, dann zaehlen (02.11.2026): bisher stand die Auswahl schon da, wenn es nur zu duenne Baender gab —
          dann enthielt sie allein „Alle Foils" und sah kaputt aus. */}
      {waehlbareBaender.length > 1 && (
        <select value={bandKey} onChange={(e) => setBandKey(e.target.value)}
          title={t("cr.foilAll")}
          className={`${SELECT_SCHRUMPFT} rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100`}>
          {waehlbareBaender
            .map((b) => (
              <option key={b.key} value={b.key}>
                {bandLabel(b, t)}{b.art === "alle" ? "" : ` (${b.sessions})`}
              </option>
            ))}
        </select>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <CommunityIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">{t("home.community")}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to="/foil-stats" title={t("foilStats.title")} aria-label={t("foilStats.title")}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-600 dark:text-brand-300 hover:bg-slate-700">
            <FoilIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
          </Link>
          <Link to="/watch-stats" title={t("watchStats.title")} aria-label={t("watchStats.title")}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-600 dark:text-brand-300 hover:bg-slate-700">
            <WatchIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
          </Link>
        </div>
      </div>
      <CommunityStats className="mb-3" />
      {/* Reiter (Plan docs/UX-IA.md, 02.11.2026). Die letzte Wahl merkt sich der Browser. Spots und Routen stehen jetzt
          unter der Hauptnavigation „Spots", die Uhr-Layouts unter Medien. */}
      <Reiterleiste reiter={reiter} aktiv={tab} onWahl={setTab} />
      {tab === "bestenliste" && <>
        {filterZeile}
        {/* Grenzen des gewaehlten Bandes im Klartext — sonst raet man, was „Wie mein Foil" heisst. */}
        {band && bandInfo(band, t) && (
          <p className="mb-3 text-sm text-slate-400">{bandInfo(band, t)}</p>
        )}
        <RecordGrid rec={data?.[period as keyof CommunityRecords]} showSpot sport={sport} />
        {/* `key` = neu laden beim Umschalten auf/von „Freunde" — ihre eigenen Abhaengigkeiten aendern sich dabei nicht immer.
            Die Filterzeile steht unter der Ueberschrift noch einmal (Jan, 01.11.2026): auf dem Handy liegen zwoelf Kacheln
            dazwischen. */}
        <div className="mt-8">
          <Leaderboards key={`l${freunde}`} period={period} accelOnly={accelOnly} sport={sport} band={band} kopf={filterZeile} />
        </div>
      </>}
      {tab === "medien" && <>
        <LatestMedia key={`m${freunde}`} />
        {/* Dieselbe Zeitwahl wie bei der Bestenliste (Jan, 03.11.2026), unter beiden Ueberschriften. */}
        <TopLiked key={`t${freunde}`} period={period} zeit={zeitKnoepfe} />
        <TopLiked key={`k${freunde}`} period={period} nach="kommentare" zeit={zeitKnoepfe} />
        <SocialFeed />
        <LayoutTeaser />
      </>}
      {tab === "teams" && <TeamsSection />}
    </div>
  );
}

// Teams der Community (Jan, 31.10.2026: „in der generellen community seite soll dann nur ein neuer
// abschnitt rein mit den teams"). Seit 01.11.2026 ohne Teamliste (die steht auf /teams/liste), nur mit den
// aktuellen Events und den Links „Alle Teams" / „Team gruenden".
function TeamsSection() {
  const t = useT();
  const [events, setEvents] = useState<TeamEventKurz[] | null>(null);
  useEffect(() => { api.teamsEventsAktuell().then(setEvents).catch(() => setEvents([])); }, []);
  return (
    <div className="mt-6">
      {/* Team-Bestenlisten ganz oben, ueber den Events (Jan, 03.11.2026). */}
      <TeamBestenlisten />
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <FlagIcon className="h-5 w-5 text-brand-400" />
        <h3 className="text-lg font-bold">{t("team.eventsAktuell")}</h3>
      </div>
      {/* Keine Teams mehr direkt hier (eigene Seite /teams/liste, Jan 01.11.2026) — nur laufende und in den naechsten
          3 Tagen beginnende Events, alle (vorerst ohne Grenze). Kachel wie auf der Teamseite. */}
      {events && events.length === 0 && <p className="text-sm text-slate-400">{t("team.event.keineAktuellen")}</p>}
      {!!events?.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((e) => <EventKurzKachel key={`${e.team.slug}-${e.id}`} e={e} />)}
        </div>
      )}
      {/* Die Wege weiter als Knoepfe unter dem jeweiligen Abschnitt (Jan, 02.11.2026), nicht mehr als Links im Kopf. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/events" className={KNOPF_WEITER}>{t("team.alleEvents")} →</Link>
      </div>
      <AktivsteTeams />
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/teams/liste" className={KNOPF_WEITER}>{t("team.alle")} →</Link>
        <Link to="/teams" className={KNOPF_WEITER}>{t("team.gruenden")} →</Link>
      </div>
    </div>
  );
}

const KNOPF_WEITER = "inline-flex items-center rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-slate-700 dark:text-brand-300";

/** Die 10 aktivsten Teams (Jan, 02.11.2026): Sessions der Mitglieder in den letzten 30 Tagen, Kacheln untereinander. */
function AktivsteTeams() {
  const t = useT();
  const [teams, setTeams] = useState<TeamListenEintrag[] | null>(null);
  useEffect(() => { api.teamsListe().then(setTeams).catch(() => setTeams([])); }, []);
  const top = (teams ?? []).filter((x) => (x.sessions_30d ?? 0) > 0)
    .sort((a, b) => (b.sessions_30d ?? 0) - (a.sessions_30d ?? 0)).slice(0, 10);
  if (!top.length) return null;
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">{t("team.aktivste")}</h3>
      <div className="max-w-2xl space-y-2">{top.map((tm) => <TeamListenKachel key={tm.id} tm={tm} aktivitaet />)}</div>
    </div>
  );
}

/** Team-Bestenlisten (Jan, 03.11.2026: „leaderboards, aber eben nicht mit einzelpersonen sondern mit teams"): je Kennzahl
 *  die Summe der besten 3/5/10 Fahrer eines Teams, damit ein grosses Team nicht allein durch seine Groesse gewinnt.
 *  Gerechnet am Server fuer alle Teams gleich (T.vergleich), hier nur sortiert. */
const VERGLEICH_ARTEN: [TeamVergleichKennzahl, string][] = [
  ["pumps", "team.stat.pumps"], ["distance_m", "team.stat.strecke"], ["time_s", "team.stat.zeit"],
  ["sessions", "team.stat.sessions"], ["runs", "team.stat.laeufe"],
];

function TeamBestenlisten() {
  const t = useT();
  const [period, setPeriod] = useState("30d");
  const [top, setTop] = useState(5);
  const [art, setArt] = useState<TeamVergleichKennzahl>("pumps");
  const [d, setD] = useState<TeamVergleich | null>(null);
  const [bild, setBild] = useState(false);
  // Eigene Teams fuer die Hervorhebung im Bild (04.11.2026).
  const [meine, setMeine] = useState<Set<string>>(new Set());
  useEffect(() => { api.teamsMine().then((l) => setMeine(new Set(l.filter((x) => x.status === "aktiv").map((x) => x.slug)))).catch(() => {}); }, []);
  useEffect(() => {
    let aktiv = true;
    api.teamsVergleich(period, top).then((x) => { if (aktiv) setD(x); }).catch(() => {});
    return () => { aktiv = false; };
  }, [period, top]);
  const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`);
  const zeit = (sek: number) => (sek < 3600 ? `${Math.round(sek / 60)} min` : `${(sek / 3600).toFixed(1)} h`);
  const wert = (z: TeamVergleichZeile) => (art === "distance_m" ? km(z[art]) : art === "time_s" ? zeit(z[art]) : z[art].toLocaleString());
  const zeilen = (d?.teams ?? []).filter((z) => z[art] > 0).sort((a, b) => b[art] - a[art] || a.name.localeCompare(b.name));
  const knopf = (an: boolean) => `rounded-lg px-2.5 py-1 text-xs ${an ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`;
  const bildZeile = (z: TeamVergleichZeile, i: number) => {
    const f = TEAM_FARBEN[z.farbe || "cyan"] ?? TEAM_FARBEN.cyan;
    return {
      rang: i + 1, name: z.name, initialen: teamInitialen(z.name), wert: wert(z), ich: meine.has(z.slug),
      land: z.land || null,   // Kontinent/Erde als Umriss (BestenlisteBildDialog kontinentBild)
      wappen: { logo: z.logo_url, flaeche: f.dunkelFlaeche ?? f.dunkel, schrift: f.dunkelAuf ?? "#020617",
                flaecheHell: f.hellFlaeche ?? f.hell, schriftHell: f.hellAuf ?? "#ffffff" },
    };
  };
  return (
    <div className="mb-8">
      <h3 className="mb-1 text-lg font-bold">{t("team.vergleich.titel")}</h3>
      <p className="mb-2 text-sm text-slate-400">{t("team.vergleich.hinweis", { n: String(top) })}</p>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {PERIODS.map(([k, lk]) => <button key={k} onClick={() => setPeriod(k)} className={knopf(period === k)}>{t(lk)}</button>)}
        <span className="ml-auto flex gap-1">
          {[3, 5, 10].map((n) => <button key={n} onClick={() => setTop(n)} className={knopf(top === n)}>{t("team.vergleich.top", { n: String(n) })}</button>)}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist">
        {VERGLEICH_ARTEN.map(([k, lk]) => (
          <button key={k} role="tab" aria-selected={art === k} onClick={() => setArt(k)} className={knopf(art === k)}>{t(lk)}</button>
        ))}
      </div>
      {!d ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : zeilen.length === 0
        ? <p className="text-sm text-slate-400">{t("team.vergleich.leer")}</p> : (
        <div className="max-w-2xl space-y-2">
          {zeilen.map((z, i) => (
            <Link key={z.slug} to={`/teams/${z.slug}`} style={teamFarbStil(z.farbe)}
              className="team-farbe flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 hover:border-slate-700">
              <span className="w-6 shrink-0 text-center text-lg font-bold tabular-nums text-slate-400">{i + 1}</span>
              <TeamWappen name={z.name} logo={z.logo_url} farbe={z.farbe} size={40} />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="team-akzent truncate font-semibold">{z.name}</span><TeamHerkunft land={z.land} />
              </span>
              <span className="shrink-0 text-right text-xs text-slate-400">
                <span className="team-akzent block text-base font-bold tabular-nums">{wert(z)}</span>
                {t("team.vergleich.ausFahrern", { n: String(z[`${art}_fahrer`]) })}
              </span>
            </Link>
          ))}
          {/* Als Bild teilen wie die Bestenliste der Fahrer (Jan, 03.11.2026). Flaggen nur fuer Laender; Kontinent/Erde
              („k:…") haben kein Flaggenbild und bleiben im Bild ohne Zeichen. */}
          <button onClick={() => setBild(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-brand-600 hover:bg-slate-700 dark:text-brand-300">
            <ShareIcon className="h-4 w-4" /> {t("team.bild.titel")}
          </button>
        </div>
      )}
      {bild && (
        <BestenlisteBildDialog onClose={() => setBild(false)} titel={t("team.bild.titel")} dateiname={`pumpfoil-teams-${art}.jpg`}
          daten={{
            titel: t(VERGLEICH_ARTEN.find(([k]) => k === art)?.[1] ?? ""),
            unterzeile: [t("team.vergleich.titel"), t("team.vergleich.top", { n: String(top) }),
              t(PERIODS.find(([k]) => k === period)?.[1] ?? ""),
              new Date().toLocaleDateString(document.documentElement.lang || undefined)].join(" · "),
            // Wappen je Zeile und das eigene Team hervorgehoben; liegt es hinter Platz 10, steht es darunter (04.11.2026).
            zeilen: zeilen.slice(0, 10).map((z, i) => bildZeile(z, i)),
            eigene: (() => { const i = zeilen.findIndex((z, j) => j >= 10 && meine.has(z.slug)); return i >= 0 ? bildZeile(zeilen[i], i) : null; })(),
            leer: "—",
          }} />
      )}
    </div>
  );
}

// Uhr-Layouts der Community, ganz unten auf der Community-Seite: höchstens 5, sortiert wie die
// Galerie (meistgenutzte zuerst, s. layouts._usage_stats). Klick irgendwo -> Galerie.
//
// ALLE Kategorien, nicht nur „während des Laufs" (Jan, 02.09.): gefragt ist, was am häufigsten
// wirklich gefahren wird — ob das eine On-Foil-Seite, die Zusammenfassung nach dem Lauf oder die
// Pausenseite ist, entscheidet die Nutzung, nicht wir. Damit die Karten trotzdem lesbar bleiben,
// steht die Kategorie unter dem Namen.
// Wischen statt Pfeil-Knöpfe: eine Scroll-Snap-Reihe. Auf dem Handy ist EINE Karte volle Breite
// (`w-full`), also wischt man genau von Layout zu Layout; ab sm liegen sie nebeneinander. Das
// braucht keine Karussell-Bibliothek und funktioniert mit Touch, Trackpad und Tastatur.
function LayoutTeaser() {
  const t = useT();
  const [rows, setRows] = useState<WatchLayout[] | null>(null);
  useEffect(() => {
    api.layoutCommunity()
      .then((r) => setRows(r.slice(0, 5)))
      .catch(() => setRows([]));
  }, []);
  if (!rows || rows.length === 0) return null;   // nichts veröffentlicht -> keine leere Box
  return (
    <div className="mt-6">
      <div className="mb-1.5 flex items-center gap-2">
        <WatchIcon className="h-5 w-5 text-brand-400" />
        <h3 className="text-lg font-bold">{t("home.layouts")}</h3>
        <Link to="/layouts/community" className="ml-auto text-sm text-brand-700 hover:underline dark:text-brand-300">
          {t("home.layoutsAll")} →
        </Link>
      </div>
      <p className="mb-2 text-sm text-slate-300">{t("home.layoutsHint")}</p>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
        {rows.map((l) => (
          <Link key={l.id} to="/layouts/community"
            className="w-full shrink-0 snap-center sm:w-56">
            <Card className="flex h-full flex-col items-center gap-2 p-3 hover:border-slate-600">
              <LayoutPreview layout={l} w={l.authored_w || 240} h={l.authored_h || 240}
                shape={(l.authored_shape as WatchShape) || "round"} px={150} />
              <div className="w-full min-w-0 text-center">
                <div className="pf-name truncate text-sm font-semibold">{l.name}</div>
                <div className="truncate text-sm text-slate-400">
                  {t("lay.byAuthor", { name: l.author ?? "?" })}
                </div>
                <div className="truncate text-sm text-slate-400">{t(`lay.cat.${l.category}`)}</div>
                {(l.used_by ?? 0) > 0 && (
                  <div className="text-sm text-brand-700 dark:text-brand-300">
                    {t(l.used_by === 1 ? "lay.usedBy1" : "lay.usedBy", { n: l.used_by ?? 0 })}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}


