import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CommunityRecords, RecordSet, CommunitySession, Leaders, LeaderRow, CommunityPhoto } from "../lib/api";
import { Card, Avatar } from "../components/ui";
import { SessionRow } from "../components/SessionRow";
import { Lightbox } from "../components/Lightbox";
import { VideoModal, ytId } from "../components/VideoModal";
import { TrackPreview } from "../components/TrackPreview";
import { CommunityIcon } from "../components/Icons";
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

export default function Home() {
  return (
    <div>
      <InstallButton />
      <CommunitySection />
    </div>
  );
}

const PERIODS: [string, string][] = [
  ["today", "period.today"],
  ["10d", "period.10d"],
  ["30d", "period.30d"],
  ["365d", "period.365d"],
  ["all", "period.all"],
];

const REC_ITEMS: { key: keyof RecordSet; labelKey: string; fmt: (v: number) => string }[] = [
  { key: "distance", labelKey: "rec.farthestRun", fmt: (v) => `${Math.round(v)} m` },
  { key: "duration", labelKey: "rec.longestRun", fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` },
  { key: "speed", labelKey: "rec.topSpeed", fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` },
  { key: "glide", labelKey: "rec.longestGlide", fmt: (v) => `${v.toFixed(1)} s` },
  { key: "runs", labelKey: "rec.mostRuns", fmt: (v) => `${Math.round(v)}` },
];

function RecordGrid({ rec, showSpot }: { rec?: RecordSet | null; showSpot?: boolean }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {REC_ITEMS.map((it) => {
        const r = rec?.[it.key];
        const has = !!(r && r.session_id && r.value);
        const inner = (
          <Card className="relative h-full overflow-hidden p-3">
            {has && r!.track_preview && (
              <TrackPreview data={r!.track_preview} className="pointer-events-none absolute right-2 top-1/2 h-3/4 w-20 -translate-y-1/2 text-brand-400/70" />
            )}
            <div className="text-lg font-bold tabular-nums text-white">{has ? it.fmt(r!.value) : "–"}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-300">{t(it.labelKey)}</div>
            {has && (
              <div className="mt-0.5 text-[11px] text-slate-300">
                {r!.name && (
                  <span className="inline-flex items-center gap-1 align-middle">
                    <Avatar name={r!.name} url={r!.avatar_url} size={20} />
                    <span className="text-brand-300">{r!.name}</span>
                  </span>
                )}
                {r!.started_at && (
                  <span className="text-slate-400">
                    {r!.name ? " · " : ""}
                    {new Date(r!.started_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                )}
                {showSpot && r!.spot && <span className="block text-slate-400">📍 {r!.spot}</span>}
              </div>
            )}
          </Card>
        );
        return has ? (
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
          <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{r.name}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{r[field] as number}</span>
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
          const thumb = isVideo ? `https://img.youtube.com/vi/${ytId(p.youtube_url)}/hqdefault.jpg` : p.url || "";
          const openMedia = () => isVideo ? setVid(p.youtube_url || null) : setLb(photoItems.findIndex((x) => x.session_id === p.session_id && x.url === p.url));
          return (
            <div key={`${p.kind}-${p.session_id}`} className="group">
              <button onClick={openMedia} className="relative block w-full">
                <img src={thumb} alt="" className="aspect-square w-full rounded-xl object-cover transition-opacity group-hover:opacity-90" />
                {isVideo && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">▶</span>
                  </span>
                )}
              </button>
              <div className="mt-1 flex items-center gap-1.5">
                <Avatar name={p.name} url={p.avatar_url} size={18} />
                <div className="min-w-0 text-[11px] leading-tight">
                  <div className="truncate text-slate-200">{p.name || "—"}</div>
                  <div className="truncate text-slate-400">
                    {p.started_at && new Date(p.started_at).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                    {p.spot ? ` · ${p.spot}` : ""}
                  </div>
                </div>
              </div>
              {p.caption && <div className="mt-0.5 truncate text-[11px] italic text-slate-300">{p.caption}</div>}
              <div className="mt-1 flex items-center gap-1">
                <button onClick={() => like(p.session_id)} title={st.liked ? t("row.unlike") : t("row.like")}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${st.liked ? "text-rose-400" : "text-slate-400 hover:text-slate-200"}`}>
                  {st.liked ? "❤️" : "🤍"}{st.like_count > 0 && <span className="tabular-nums">{st.like_count}</span>}
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

function Leaderboards({ period }: { period: string }) {
  const t = useT();
  const [data, setData] = useState<Leaders | null>(null);
  useEffect(() => {
    api.leaders(period).then(setData).catch(() => {});
  }, [period]);
  if (!data) return null;
  const empty = data.sessions.length === 0 && data.runs.length === 0 && data.spots.length === 0;
  if (empty) return null;
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">{t("home.leaderboards")}</h3>
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
  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">{t("home.topRated")}</h3>
      <div className="space-y-1.5">
        {items.map((s) => (
          <SessionRow key={s.session_id} s={s} />
        ))}
      </div>
    </div>
  );
}

function SpotSessions({ spot }: { spot: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunitySession[] | null>(null);

  useEffect(() => {
    if (open && items === null) {
      api.spotSessions(spot).then(setItems).catch(() => setItems([]));
    }
  }, [open, spot]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [period, setPeriod] = useState("10d");

  useEffect(() => {
    api.communityRecords().then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <CommunityIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">{t("home.community")}</h2>
        <Link to="/foil-stats" className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-700">
          🛩 {t("foilStats.title")}
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {PERIODS.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            className={`rounded-lg px-2.5 py-1 text-xs ${period === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <RecordGrid rec={data[period]} showSpot />
      <LatestMedia />
      <Leaderboards period={period} />
      <TopLiked period={period} />
      <SpotSection period={period} />
    </div>
  );
}

function SpotSection({ period }: { period: string }) {
  const t = useT();
  const [spots, setSpots] = useState<{ mine: string[]; all: string[] } | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [recs, setRecs] = useState<Record<string, RecordSet>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    api.communitySpots().then((s) => { setSpots(s); setShown(s.mine); }).catch(() => {});
  }, []);

  // Rekorde je Spot für den aktuellen Zeitraum laden (Key = period:spot).
  useEffect(() => {
    shown.forEach((sp) => {
      const key = `${period}:${sp}`;
      if (!(key in recs)) {
        api.spotRecords(sp, period).then((r) => setRecs((prev) => ({ ...prev, [key]: r }))).catch(() => {});
      }
    });
  }, [shown, period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!spots) return null;

  const addSpot = (sp: string) => {
    setShown((prev) => (prev.includes(sp) ? prev : [sp, ...prev]));
    setQ("");
  };
  const matches = q.trim()
    ? spots.all.filter((s) => s.toLowerCase().includes(q.trim().toLowerCase()) && !shown.includes(s)).slice(0, 6)
    : [];

  return (
    <div className="mt-8">
      <h3 className="mb-2 text-lg font-bold">{t("home.spots")}</h3>
      <div className="relative mb-4 max-w-xs">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home.spotSearch")}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        {matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
            {matches.map((m) => (
              <button key={m} onClick={() => addSpot(m)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-800">
                📍 {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-400">{t("home.noSpots")}</p>
      ) : (
        <div className="space-y-5">
          {shown.map((sp) => (
            <div key={sp}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-semibold text-brand-300">📍 {sp}</span>
                {!spots.mine.includes(sp) && (
                  <button onClick={() => setShown((prev) => prev.filter((x) => x !== sp))} className="text-xs text-slate-400 hover:text-slate-200">
                    {t("home.remove")}
                  </button>
                )}
              </div>
              <RecordGrid rec={recs[`${period}:${sp}`]} />
              <SpotSessions spot={sp} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
