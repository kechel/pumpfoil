import { useEffect, useState } from "react";
import { fmtDate } from "../lib/time";
import { Link } from "react-router-dom";
import { api, CommunityRecords, RecordSet, CommunitySession, Leaders, LeaderRow, CommunityPhoto, WatchLayout } from "../lib/api";
import { LayoutPreview } from "../components/LayoutPreview";
import { WatchShape } from "../lib/watchLayout";
import { Card, Avatar } from "../components/ui";
import { SocialFeed } from "../components/SocialFeed";
import { SessionRow } from "../components/SessionRow";
import { Lightbox } from "../components/Lightbox";
import { VideoModal, ytId } from "../components/VideoModal";
import { TrackPreview } from "../components/TrackPreview";
import { CommunityIcon, PlayIcon, HeartIcon, LocationIcon, FoilIcon, WatchIcon } from "../components/Icons";
import { AccelToggle } from "../components/AccelToggle";
import { CommunityStats } from "../components/CommunityStats";
import { useAccelDefault } from "../lib/useAccelDefault";
import { useT } from "../i18n";

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

export const PERIODS: [string, string][] = [
  ["today", "period.today"],
  ["10d", "period.10d"],
  ["30d", "period.30d"],
  ["365d", "period.365d"],
  ["all", "period.all"],
];

// Sekunden-seit-Mitternacht -> "HH:MM" (Early Bird / Night Owl, Sonnenzeit).
const hhmm = (v: number) => `${String(Math.floor(v / 3600)).padStart(2, "0")}:${String(Math.floor((v % 3600) / 60)).padStart(2, "0")}`;

const REC_ITEMS: { key: keyof RecordSet; labelKey: string; fmt: (v: number) => string }[] = [
  { key: "distance", labelKey: "rec.farthestRun", fmt: (v) => `${Math.round(v)} m` },
  { key: "duration", labelKey: "rec.longestRun", fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` },
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
];

function RecordGrid({ rec, showSpot }: { rec?: RecordSet | null; showSpot?: boolean }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {REC_ITEMS.map((it) => {
        const r = rec?.[it.key];
        // Der Carve-Rekord hängt an keiner Session (session_id ist null) — für ihn reicht ein Wert.
        const has = !!(r && r.value && (r.session_id || it.key === "carves180"));
        const inner = (
          <Card className="relative h-full overflow-hidden p-3">
            {has && r!.track_preview && (
              <TrackPreview data={r!.track_preview} className="pointer-events-none absolute right-2 top-1/2 h-3/4 w-20 -translate-y-1/2 text-brand-400/70" />
            )}
            <div className="text-lg font-bold tabular-nums text-brand-400">{has ? it.fmt(r!.value) : "–"}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-300">{t(it.labelKey)}</div>
            {has && (
              <div className="mt-0.5 text-[11px] text-slate-300">
                {r!.name && (
                  <span className="inline-flex items-center gap-1 align-middle">
                    <Avatar name={r!.name} url={r!.avatar_url} size={20} />
                    <span className="pf-name text-brand-300">{r!.name}</span>
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

const LEADER_KINDS: { key: keyof Leaders; labelKey: string; field: keyof LeaderRow; unitKey: string }[] = [
  { key: "sessions", labelKey: "leader.mostSessions", field: "sessions", unitKey: "unit.sessions" },
  { key: "runs", labelKey: "leader.mostRuns", field: "runs", unitKey: "unit.runs" },
  { key: "pumps", labelKey: "leader.mostPumps", field: "pumps", unitKey: "unit.pumps" },
  { key: "spots", labelKey: "leader.mostSpots", field: "spots", unitKey: "unit.spots" },
];

function LeaderList({ rows, field, unit }: { rows: LeaderRow[]; field: keyof LeaderRow; unit: string }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">—</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-1.5">
          <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-slate-400">{i + 1}</span>
          <Avatar name={r.name} url={r.avatar_url} size={30} />
          <span className="pf-name min-w-0 flex-1 truncate text-sm text-slate-200">{r.name}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-100">{r[field] as number}</span>
          <span className="shrink-0 text-[10px] uppercase text-slate-400">{unit}</span>
        </div>
      ))}
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
    api.communityLatestPhotos(8).then((ps) => {
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
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">{t("home.latestMedia")}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {media.map((p) => {
          const st = soc[p.session_id] ?? { liked: false, like_count: 0, my_inappropriate: false };
          const isVideo = p.kind === "video";
          const thumb = isVideo ? `https://img.youtube.com/vi/${ytId(p.youtube_url)}/hqdefault.jpg` : (p.thumb_url || p.url) || "";
          const openMedia = () => isVideo ? setVid(p.youtube_url || null) : setLb(photoItems.findIndex((x) => x.session_id === p.session_id && x.url === p.url));
          return (
            <div key={`${p.kind}-${p.session_id}`} className="group">
              <button onClick={openMedia} className="relative block w-full">
                <img src={thumb} alt="" className="aspect-square w-full rounded-xl object-cover transition-opacity group-hover:opacity-90" />
                {isVideo && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white"><PlayIcon className="h-5 w-5" /></span>
                  </span>
                )}
              </button>
              <div className="mt-1 flex items-center gap-1.5">
                <Avatar name={p.name} url={p.avatar_url} size={18} />
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

function Leaderboards({ period, accelOnly, sport = "pumpfoil" }: { period: string; accelOnly: boolean; sport?: string }) {
  const t = useT();
  const [data, setData] = useState<Leaders | null>(null);
  useEffect(() => {
    api.leaders(period, accelOnly, sport).then(setData).catch(() => {});
  }, [period, accelOnly, sport]);
  if (!data) return null;
  const empty = data.sessions.length === 0 && data.runs.length === 0 && data.spots.length === 0;
  if (empty) return null;
  const periodLabelKey = PERIODS.find(([k]) => k === period)?.[1] ?? "";
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">
        {t("home.leaderboards")}
        {periodLabelKey && <span className="ml-2 text-sm font-normal text-slate-400">· {t(periodLabelKey)}</span>}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LEADER_KINDS.map((k) => (
          <div key={k.key}>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-300">{t(k.labelKey)}</div>
            <LeaderList rows={data[k.key]} field={k.field} unit={t(k.unitKey)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TopLiked({ period }: { period: string }) {
  const t = useT();
  const [items, setItems] = useState<CommunitySession[] | null>(null);
  useEffect(() => {
    api.topLiked(period).then(setItems).catch(() => {});
  }, [period]);
  if (!items || items.length === 0) return null;
  const periodLabelKey = PERIODS.find(([k]) => k === period)?.[1] ?? "";
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">
        {t("home.topRated")}
        {periodLabelKey && <span className="ml-2 text-sm font-normal text-slate-400">· {t(periodLabelKey)}</span>}
      </h3>
      <div className="space-y-1.5">
        {items.map((s) => (
          <SessionRow key={s.session_id} s={s} />
        ))}
      </div>
    </div>
  );
}

function SpotSessions({ spot, accelOnly }: { spot: string; accelOnly: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunitySession[] | null>(null);

  // Umschalten Accel/GPS -> neu laden.
  useEffect(() => { setItems(null); }, [accelOnly]);
  useEffect(() => {
    if (open && items === null) {
      api.spotSessions(spot, accelOnly).then(setItems).catch(() => setItems([]));
    }
  }, [open, spot, accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} className="text-xs text-slate-300 hover:text-slate-200">
        {open ? t("home.hideSessions") : t("home.showSpotSessions")}
      </button>
      {open && items && (
        <div className="mt-2 space-y-1.5">
          {items.length === 0 ? (
            <p className="text-xs text-slate-400">{t("home.noSessionsShort")}</p>
          ) : (
            items.map((s) => <SessionRow key={s.session_id} s={s} showSpot={false} />)
          )}
        </div>
      )}
    </div>
  );
}

function CommunitySection() {
  const t = useT();
  const [data, setData] = useState<CommunityRecords | null>(null);
  // Sportart-Filter (docs/sport-classification.md). Nur Sportarten mit mindestens EINEM Lauf
  // all time stehen zur Wahl (Jans Vorgabe) — sonst neun Kategorien, acht davon leer.
  const [sport, setSport] = useState("pumpfoil");
  const [sports, setSports] = useState<{ sport: string; runs: number }[]>([]);
  const [period, setPeriod] = useState("10d");
  // nur Accel (präzise) vs. auch GPS-only (mit erkanntem On-Foil). Default smart:
  // accel, wenn der Nutzer Accel-Daten hat, sonst alle.
  const [accelOnly, setAccelOnly] = useAccelDefault();

  useEffect(() => {
    api.communityRecords(accelOnly, sport).then(setData).catch(() => {});
  }, [accelOnly, sport]);

  useEffect(() => {
    api.communitySports().then(setSports).catch(() => {});
  }, []);

  if (!data) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <CommunityIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">{t("home.community")}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to="/foil-stats" title={t("foilStats.title")} aria-label={t("foilStats.title")}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-700">
            <FoilIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
          </Link>
          <Link to="/watch-stats" title={t("watchStats.title")} aria-label={t("watchStats.title")}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-700">
            <WatchIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
          </Link>
        </div>
      </div>
      <CommunityStats className="mb-3" />
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {PERIODS.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            className={`rounded-lg px-2.5 py-1 text-xs ${period === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
          >
            {t(labelKey)}
          </button>
        ))}
        <AccelToggle value={accelOnly} onChange={setAccelOnly} className="ml-auto" />
        {/* Sportart-Filter: erscheint erst, wenn es überhaupt eine zweite Sportart mit Läufen gibt
            (Jan: „nur die mit mind. einem lauf all time"). Betrifft Rekorde, Rangliste und Spots —
            NICHT „Neueste Medien", „Am besten bewertet" und die Uhr-Layouts: die kommen absichtlich
            immer aus allen Sportarten. */}
        {sports.length > 1 && (
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
            {sports.map((x) => <option key={x.sport} value={x.sport}>{t(`cls.sport.${x.sport}`)}</option>)}
          </select>
        )}
      </div>
      <RecordGrid rec={data[period]} showSpot />
      {/* Social-Feed ueber „Medien" (Jan, 30.08., nachdem er sich gefuellt hat): die Videos der
          Community sind das Lebendigste auf der Seite, die Fotos darunter ergaenzen sie. */}
      <SocialFeed />
      <LatestMedia />
      <Leaderboards period={period} accelOnly={accelOnly} sport={sport} />
      <TopLiked period={period} />
      <SpotSection period={period} accelOnly={accelOnly} sport={sport} />
      <LayoutTeaser />
    </div>
  );
}

// Uhr-Layouts der Community, ganz unten auf der Community-Seite: höchstens 5, sortiert wie die
// Galerie (meistgenutzte zuerst, s. layouts._usage_stats). Klick irgendwo -> Galerie.
// Wischen statt Pfeil-Knöpfe: eine Scroll-Snap-Reihe. Auf dem Handy ist EINE Karte volle Breite
// (`w-full`), also wischt man genau von Layout zu Layout; ab sm liegen sie nebeneinander. Das
// braucht keine Karussell-Bibliothek und funktioniert mit Touch, Trackpad und Tastatur.
function LayoutTeaser() {
  const t = useT();
  const [rows, setRows] = useState<WatchLayout[] | null>(null);
  useEffect(() => {
    api.layoutCommunity({ category: "on_foil" })
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
                {(l.used_by ?? 0) > 0 && (
                  <div className="text-sm text-brand-700 dark:text-brand-300">
                    {t("lay.usedBy", { n: l.used_by ?? 0 })}
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

function SpotSection({ period, accelOnly, sport = "pumpfoil" }: { period: string; accelOnly: boolean; sport?: string }) {
  const t = useT();
  const [spots, setSpots] = useState<{ mine: string[]; all: string[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recs, setRecs] = useState<Record<string, RecordSet>>({});
  const [q, setQ] = useState("");

  // Spot-Liste immer vollständig (auch GPS-only) laden, damit man ALLE Spots findet;
  // die Rekorde/Sessions je Spot respektieren weiterhin den accel|alle-Umschalter.
  // Default: der eigene Homespot (aus den Einstellungen) — sonst nichts.
  useEffect(() => {
    api.communitySpots(false, sport).then(setSpots).catch(() => {});   // Sportart wechselt -> andere Spots
    api.getSettings().then((s) => {
      const hs = typeof s.homespot === "string" ? s.homespot : "";
      setSelected(hs || null);
    }).catch(() => {});
  }, [sport]);

  // Rekorde des gewählten Spots für Zeitraum + Accel/GPS laden (Key = accelOnly:period:spot).
  useEffect(() => {
    if (!selected) return;
    const key = `${sport}:${accelOnly}:${period}:${selected}`;
    if (!(key in recs)) {
      api.spotRecords(selected, period, accelOnly, sport).then((r) => setRecs((prev) => ({ ...prev, [key]: r }))).catch(() => {});
    }
  }, [selected, period, accelOnly, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!spots) return null;

  const pick = (sp: string) => { setSelected(sp); setQ(""); };   // ersetzt (immer nur EIN Spot)
  const matches = q.trim()
    ? spots.all.filter((s) => s.toLowerCase().includes(q.trim().toLowerCase()) && s !== selected).slice(0, 6)
    : [];
  const others = spots.all.filter((s) => s !== selected);

  const periodLabelKey = PERIODS.find(([k]) => k === period)?.[1] ?? "";
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">
        {t("home.spots")}
        {periodLabelKey && <span className="ml-2 text-sm font-normal text-slate-400">· {t(periodLabelKey)}</span>}
      </h3>
      {/* Suche + Auswahl NEBENEINANDER (Jan): beides sind Wege zum selben Ziel, gestapelt sahen sie
          wie zwei Schritte aus. `flex-1 basis-40` statt fixer Breite -> teilen sich die Zeile und
          brechen erst um, wenn wirklich kein Platz ist. Die Trefferliste hängt am Suchfeld
          (`relative`), nicht an der Zeile — sonst würde sie über das Dropdown laufen. */}
      <div className="mb-4 flex max-w-xl flex-wrap items-start gap-2">
        <div className="relative min-w-0 flex-1 basis-40">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("home.spotSearch")}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
              {matches.map((m) => (
                <button key={m} onClick={() => pick(m)} className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm hover:bg-slate-800">
                  <LocationIcon className="h-4 w-4 text-slate-400" /> {m}
                </button>
              ))}
            </div>
          )}
        </div>
        {others.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) pick(e.target.value); }}
            className="min-w-0 flex-1 basis-40 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">{t("home.spotPick")}</option>
            {others.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {selected && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-semibold text-brand-300"><LocationIcon className="h-4 w-4" /> {selected}</span>
          </div>
          <RecordGrid rec={recs[`${sport}:${accelOnly}:${period}:${selected}`]} />
          <SpotSessions spot={selected} accelOnly={accelOnly} />
        </div>
      )}
    </div>
  );
}
