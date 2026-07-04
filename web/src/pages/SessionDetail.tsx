import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import L from "leaflet";
import { api, SessionSummary, SessionSocial as SocialData } from "../lib/api";
import { Card, Stat, Spinner, ErrorBox, Avatar } from "../components/ui";
import { ChevronIcon, HeartIcon, CameraIcon, VideoIcon, PlayIcon, FlagIcon, FakeIcon, LocationIcon, EditIcon, StarIcon, CloseIcon, KeyboardIcon, WifiOffIcon, EyeIcon, EyeOffIcon, CompareIcon, ChatBubbleIcon } from "../components/Icons";
import { Lightbox } from "../components/Lightbox";
import { FoilSelect } from "../components/FoilSelect";
import { invalidateSessionListCache } from "./Sessions";
import { FoilPowerStat } from "../components/FoilPower";
import { computeFoilPowerAtSpeed, DEFAULT_RIDER, calculateAR, calculateCLmax, calculateStallSpeed, calculateOptimalSpeed } from "../lib/foilPhysics";
import { rampColor, speedColor, optimalColor, OPTIMAL_SPAN } from "../lib/trackColors";
import { useCompare, toggleCompare, refKey } from "../lib/compare";
import { setLastSession, getLastSessionsSearch } from "../lib/lastSession";
import { useT } from "../i18n";

function fmtKm(m: number | null | undefined) {
  return m == null ? "–" : `${(m / 1000).toFixed(2)}`;
}
function fmtMMSS(s: number | null | undefined) {
  if (s == null) return "–";
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Sekunden immer; Stunden nur falls nötig.
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}
function fmtM(m: number | null | undefined) {
  return m == null ? "–" : `${Math.round(m)}`;
}
function fmtSpan(start: string, end: string) {
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)} h` : `${m}:${pad(s % 60)} min`;
}
function kmh(mps: number | null | undefined) {
  return mps == null ? "–" : `${(mps * 3.6).toFixed(1)}`;
}

type ColorMode = "speed" | "hr" | "pump" | "optimal";

// YouTube-Video-ID aus einer URL ziehen (watch?v=, youtu.be/, shorts/, embed/).
function ytId(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
    return u.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function SocialBar({ sessionId, owned, ownerName, ownerAvatar, youtubeUrl, onMeta }: {
  sessionId: number; owned: boolean; ownerName: string | null; ownerAvatar: string | null;
  youtubeUrl: string | null; onMeta: (s: SessionSummary) => void;
}) {
  const t = useT();
  const [s, setS] = useState<SocialData | null>(null);
  const [busy, setBusy] = useState(false);
  const [lb, setLb] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ytOpen, setYtOpen] = useState(false);
  const [yt, setYt] = useState(youtubeUrl ?? "");
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [video, setVideo] = useState(false);  // iframe-Popup offen?

  useEffect(() => { setYt(youtubeUrl ?? ""); }, [youtubeUrl]);
  useEffect(() => {
    api.sessionSocial(sessionId).then(setS).catch(() => {});
  }, [sessionId]);
  if (!s) return null;

  const saveVideo = () => {
    setMetaErr(null);
    api.updateSessionMeta(sessionId, { youtube_url: yt.trim() })
      .then((r) => { onMeta(r); setYtOpen(false); })
      .catch((e) => setMetaErr(String(e).includes("YouTube") ? t("meta.errYoutube") : t("profile.error")));
  };
  const removeVideo = () => {
    if (!confirm(t("sd.removeVideoConfirm"))) return;
    api.updateSessionMeta(sessionId, { youtube_url: "" })
      .then((r) => { onMeta(r); setYt(""); setYtOpen(false); })
      .catch(() => setMetaErr(t("profile.error")));
  };
  const vid = ytId(youtubeUrl);

  const like = () =>
    api.toggleLike(sessionId).then((r) => setS((p) => (p ? { ...p, liked: r.liked, like_count: r.like_count } : p))).catch(() => {});
  const vote = (kind: "fake" | "inappropriate") =>
    api.toggleVote(sessionId, kind).then((r) => setS((p) => (p ? { ...p, ...r } : p))).catch(() => {});
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    api
      .uploadSessionPhoto(sessionId, f)
      .then((ph) => setS((p) => (p ? { ...p, photos: [...p.photos, ph] } : p)))
      .catch((err) => alert(t("profile.uploadFail") + err))
      .finally(() => {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      });
  };
  const del = (pid: number) => {
    if (!confirm(t("sd.photoDeleteConfirm"))) return;
    api
      .deleteSessionPhoto(sessionId, pid)
      .then(() => setS((p) => (p ? { ...p, photos: p.photos.filter((x) => x.id !== pid) } : p)))
      .catch(() => {});
  };

  return (
    <div className="space-y-2">
      {/* Angehängte Medien (Fotos + ggf. Video) */}
      {(s.photos.length > 0 || vid) && (
        <div className="flex flex-wrap items-center gap-2">
          {s.photos.map((ph, idx) => (
            <div key={ph.id} className="relative">
              <button onClick={() => setLb(idx)}>
                <img src={ph.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
              </button>
              {owned && (
                <button
                  onClick={() => del(ph.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs leading-5 text-white hover:bg-black/80"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {vid && (
            <div className="relative">
              <button onClick={() => setVideo(true)} className="block">
                <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"><PlayIcon className="h-4 w-4" /></span>
                </span>
              </button>
              {owned && (
                <button
                  onClick={removeVideo}
                  aria-label={t("sd.removeVideo")}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs leading-5 text-white hover:bg-black/80"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Aktionszeile: Likes · Foto · Video … (rechtsbündig) wirkt unecht · unangemessen */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={like}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${s.liked ? "bg-rose-500/20 text-rose-600" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
        >
          <HeartIcon className="h-4 w-4" filled={s.liked} /> <span className="tabular-nums">{s.like_count}</span> <span className="text-xs">{t("sd.likes")}</span>
        </button>
        {owned && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              <CameraIcon className="h-4 w-4" /> {busy ? t("common.loading") : t("sd.addPhoto")}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
            <button
              onClick={() => { setYt(youtubeUrl ?? ""); setMetaErr(null); setYtOpen((o) => !o); }}
              className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              <VideoIcon className="h-4 w-4" /> {t("meta.linkVideo")}
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => vote("fake")}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs ${s.my_fake ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          >
            <FakeIcon className="h-4 w-4" /> {t("sd.fake")} {s.fake_count > 0 && <span className="tabular-nums">{s.fake_count}</span>}
          </button>
          <button
            onClick={() => { if (!s.my_inappropriate && !confirm(t("vote.reportConfirm"))) return; vote("inappropriate"); }}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs ${s.my_inappropriate ? "bg-red-500/20 text-red-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          >
            <FlagIcon className="h-4 w-4" /> {s.my_inappropriate ? t("sd.reported") : t("sd.inappropriate")} {s.inappropriate_count > 0 && <span className="tabular-nums">{s.inappropriate_count}</span>}
          </button>
        </div>
      </div>
      {owned && ytOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={yt}
            onChange={(e) => setYt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveVideo(); }}
            placeholder={t("meta.youtubePlaceholder")}
            className="min-w-[16rem] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
          />
          <button onClick={saveVideo} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("common.save")}
          </button>
          {metaErr && <span className="text-xs text-red-400">{metaErr}</span>}
        </div>
      )}
      {video && vid && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/85 p-4" onClick={() => setVideo(false)}>
          <button onClick={() => setVideo(false)} aria-label="Close"
            className="absolute right-3 top-3 rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20"><CloseIcon className="h-5 w-5" /></button>
          <div className="aspect-video" style={{ width: "min(96vw, calc((100vh - 5rem) * 16 / 9))" }} onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${vid}`}
              title="YouTube"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full rounded-xl"
            />
          </div>
        </div>
      )}
      {lb != null && (
        <Lightbox
          photos={s.photos.map((ph) => ({ url: ph.url, session_id: sessionId, name: ownerName, avatar_url: ownerAvatar }))}
          index={lb}
          onClose={() => setLb(null)}
        />
      )}
    </div>
  );
}

export default function SessionDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [cap, setCap] = useState("");            // Beschriftungs-Eingabe (Inline-Edit in der Überschrift)
  const [editingCap, setEditingCap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<{ older?: number; newer?: number }>({});

  useEffect(() => {
    setLastSession(Number(id));  // Liste hebt die zuletzt geöffnete Session hervor
    api.sessionNeighbors(Number(id))
      .then((n) => setNeighbors({ older: n.older ?? undefined, newer: n.newer ?? undefined }))
      .catch(() => {});
  }, [id]);
  const [colorMode, setColorMode] = useState<ColorMode>("speed");
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [speedMin, setSpeedMin] = useState(8);
  const [speedMax, setSpeedMax] = useState(25);
  const [autoScaleOn, setAutoScaleOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [win, setWin] = useState<"1" | "3" | "5">("3");
  const [showPumps, setShowPumps] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const compareRefs = useCompare();

  // --- Play-Animation: zeichnet die Strecke über die Zeit auf (wie beim Fahren) ---
  const [playMode, setPlayMode] = useState(false);   // Wiedergabe-Modus aktiv (Teilstrecke sichtbar)
  const [playing, setPlaying] = useState(false);      // läuft gerade (vs. pausiert)
  const [playMul, setPlayMul] = useState(8);          // Tempo-Faktor (1× ≈ Echtzeit bei ~1 Hz GPS)
  const [progress, setProgress] = useState(0);        // 0..1 (für Fortschrittsbalken)
  const playheadRef = useRef(0);                      // aktuelle (Float-)Position in der Play-Timeline
  const posMarkerRef = useRef<L.CircleMarker | null>(null);
  const tipRef = useRef<L.Polyline | null>(null);     // bewegliche Spitze (interpoliertes Teilstück)

  // --- Tap-to-Label: echte Pump-Zeitpunkte antippen (Owner/Admin), für Modell-Training ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [tagMode, setTagMode] = useState(false);      // Tap-Modus aktiv (PUMP-Button + Leertaste)
  const [taps, setTaps] = useState<number[]>([]);     // getappte Zeitpunkte (ms ab Session-Start)
  const [countdown, setCountdown] = useState(0);      // 3-2-1 vor Play-Start (zum Sync mit Video)
  const [tapSaved, setTapSaved] = useState<string>(""); // kurze Speicher-Rückmeldung
  const [takeCount, setTakeCount] = useState(0);       // bereits gespeicherte Durchläufe
  const [cmp, setCmp] = useState<Awaited<ReturnType<typeof api.comparePumpTruth>> | null>(null);
  useEffect(() => { api.getProfile().then((p) => setIsAdmin(p.is_admin)).catch(() => {}); }, []);

  useEffect(() => {
    api.getSettings().then((s) => {
      const w = Number(s.weight_kg);
      setWeightKg(Number.isFinite(w) && w > 0 ? w : DEFAULT_RIDER.riderWeight);
    }).catch(() => setWeightKg(DEFAULT_RIDER.riderWeight));
  }, []);

  // Hotkeys: Ziffern 1–9 wählen den Lauf direkt, 0 zeigt alle; ←/→ (bzw. ↑/↓) blättern
  // durch die Einzelläufe (Reihenfolge: alle → Lauf 1 → … → Lauf n → alle).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const n = session?.analysis?.segments?.length ?? 0;
      if (n === 0) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (idx < n) setSelectedRun(idx);
      } else if (e.key === "0") {
        setSelectedRun(null);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRun((p) => (p === null ? 0 : p + 1 >= n ? null : p + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRun((p) => (p === null ? n - 1 : p - 1 < 0 ? null : p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  useEffect(() => {
    // Nach Größenwechsel mehrfach invalidateSize, damit OSM-Kacheln neu laden.
    const ts = [60, 250, 500].map((d) =>
      setTimeout(() => mapObj.current?.invalidateSize(), d)
    );
    return () => ts.forEach(clearTimeout);
  }, [fullscreen]);

  useEffect(() => {
    // Bei Fenster-/Orientierungswechsel (mobil) Kartengröße neu messen,
    // sonst behält Leaflet eine zu breite Pixelgröße und die Seite scrollt horizontal.
    const onResize = () => mapObj.current?.invalidateSize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  function computeAutoRange(): [number, number] | null {
    const gj = session?.analysis?.track_geojson;
    const segs = session?.analysis?.segments ?? [];
    if (!gj || !segs.length) return null;
    const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
    const ranges = selectedRun != null && segs[selectedRun] ? [segs[selectedRun]] : segs;
    const vals: number[] = [];
    for (const s of ranges)
      for (let i = s.i_start; i <= s.i_end; i++) {
        const v = speeds[i];
        if (v != null && isFinite(v)) vals.push(v * 3.6);
      }
    if (!vals.length) return null;
    return [Math.max(0, Math.floor(Math.min(...vals))), Math.min(50, Math.ceil(Math.max(...vals)))];
  }

  // Einstellungen laden: Auto-Modus + (bei manuell) gespeicherte Skala-Grenzen.
  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.speed_auto != null) setAutoScaleOn(!!s.speed_auto);
      if (!s.speed_auto) {
        if (s.speed_min != null) setSpeedMin(s.speed_min);
        if (s.speed_max != null) setSpeedMax(s.speed_max);
      }
    }).catch(() => {});
  }, []);

  // Beim Aufruf über einen Rekord-Link (?run=N) den Lauf vorauswählen (einmal je Session).
  const appliedRunRef = useRef<string | null>(null);
  useEffect(() => {
    const sgs = session?.analysis?.segments;
    const runParam = searchParams.get("run");
    if (!sgs || runParam == null) return;
    const key = `${session!.id}:${runParam}`;
    if (appliedRunRef.current === key) return;
    const i = Number(runParam);
    if (i >= 0 && i < sgs.length) {
      setSelectedRun(i);
      appliedRunRef.current = key;
    }
  }, [session, searchParams]);

  // Auto-Skala (Checkbox): folgt der Session bzw. Lauf-Auswahl/Glättung, solange aktiv.
  useEffect(() => {
    if (!autoScaleOn) return;
    const r = computeAutoRange();
    if (r) {
      setSpeedMin(r[0]);
      setSpeedMax(r[1]);
    }
  }, [session, selectedRun, win, autoScaleOn]);

  function toggleAuto(on: boolean) {
    setAutoScaleOn(on);
    api.saveSettings({ speed_auto: on }).catch(() => {});
    if (!on) saveScale(speedMin, speedMax); // beim Ausschalten aktuellen Bereich als manuell sichern
  }

  function saveScale(lo: number, hi: number) {
    setSpeedMin(lo); setSpeedMax(hi);
    api.saveSettings({ speed_min: lo, speed_max: hi }).catch(() => {});
  }
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const trackLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    api.session(Number(id)).then(setSession).catch((e) => setError(String(e)));
  }, [id]);

  // Spot-Name wird serverseitig im HINTERGRUND aufgelöst (OSM/Overpass kann dauern) -> die
  // Session kommt sofort ohne Namen. Solange place_name noch null ist (nicht "" = definitiv
  // kein Gewässer), degressiv nachpollen und übernehmen, sobald da.
  useEffect(() => {
    if (!session || session.place_name != null) return;
    const delays = [1000, 3000, 5000, 10000, 20000, 30000];
    let cancelled = false;
    let acc = 0;
    const timers = delays.map((d) => {
      acc += d;
      return window.setTimeout(() => {
        if (cancelled) return;
        api.session(Number(id)).then((fresh) => {
          if (!cancelled && fresh.place_name != null) setSession(fresh);
        }).catch(() => {});
      }, acc);
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [id, session?.place_name]);

  // HR-Bereich der Foiling-Punkte (für die Puls-Farbskala).
  const hrRange = useMemo<[number, number]>(() => {
    const hr: (number | null)[] = session?.analysis?.track_geojson?.properties?.hr ?? [];
    const vals = hr.filter((v): v is number => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [100, 170];
  }, [session]);

  // Pump-Frequenz-Bereich (Hz) der Foiling-Punkte -> automatische Skala min..max.
  const pumpHz: (number | null)[] = session?.analysis?.track_geojson?.properties?.pump_hz ?? [];
  const hasPump = pumpHz.some((v) => v != null);
  const pumpRange = useMemo<[number, number]>(() => {
    const vals = pumpHz.filter((v): v is number => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 2];
  }, [session]);

  // Falls Pump-Modus aktiv, aber Session keine Pump-Daten hat -> zurück auf Speed.
  useEffect(() => {
    if (colorMode === "pump" && !hasPump) setColorMode("speed");
  }, [colorMode, hasPump]);

  // Optimale Geschwindigkeit (km/h) für das Foil dieser Session beim Gewicht des Nutzers.
  const optimalKmh = useMemo(() => {
    const fo = session?.foil;
    if (!fo?.span_cm || !fo?.area_cm2 || !fo?.thickness_mm) return null;
    const rider = { riderWeight: weightKg ?? DEFAULT_RIDER.riderWeight, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
    const ar = calculateAR(fo.span_cm, fo.area_cm2);
    const clmax = calculateCLmax(ar, fo.thickness_mm, fo.area_cm2, 15);
    const stall = calculateStallSpeed(fo.area_cm2, clmax, rider);
    return calculateOptimalSpeed(stall);   // ≈ 1,75 × Stall
  }, [session?.foil, weightKg]);

  // Optimal-Modus aktiv, aber keine Foil-Maße/Gewicht -> zurück auf Speed.
  useEffect(() => {
    if (colorMode === "optimal" && !optimalKmh) setColorMode("speed");
  }, [colorMode, optimalKmh]);

  // Play-Timeline: geordnete Punkt-Indizes, die abgespielt werden — der gewählte Lauf,
  // sonst alle Foiling-Läufe nacheinander, sonst (GPS-only) die ganze Spur. ~1 Hz GPS,
  // d.h. ein Index ≈ eine Sekunde.
  const playTimeline = useMemo<number[]>(() => {
    const gj = session?.analysis?.track_geojson;
    if (!gj) return [];
    const n = gj.geometry.coordinates.length;
    const segs = session?.analysis?.segments ?? [];
    const push = (s: any, out: number[]) => {
      for (let i = s.i_start; i <= s.i_end && i < n; i++) out.push(i);
    };
    if (selectedRun != null && segs[selectedRun]) { const a: number[] = []; push(segs[selectedRun], a); return a; }
    if (segs.length) { const a: number[] = []; segs.forEach((s: any) => push(s, a)); return a; }
    return Array.from({ length: n }, (_, i) => i);
  }, [session, selectedRun]);

  // Wechselt die Timeline (Lauf-Auswahl/Session), Wiedergabe zurücksetzen.
  useEffect(() => {
    playheadRef.current = 0; setProgress(0); setPlaying(false); setPlayMode(false);
  }, [playTimeline]);

  const togglePlay = () => {
    if (playTimeline.length < 2) return;
    if (!playMode) {
      if (playheadRef.current >= playTimeline.length - 1) { playheadRef.current = 0; setProgress(0); }
      setPlayMode(true); setPlaying(true); return;
    }
    if (playing) { setPlaying(false); return; }              // Pause
    if (playheadRef.current >= playTimeline.length - 1) { playheadRef.current = 0; setProgress(0); }
    setPlaying(true);                                         // Fortsetzen / Neu
  };
  const stopPlay = () => {
    setPlaying(false); setPlayMode(false);
    playheadRef.current = 0; setProgress(0); posMarkerRef.current = null;
  };

  // coords-Index (aus der Play-Timeline) -> ms ab Session-Start, via Lauf-Segment-Interpolation.
  const ciToMs = (ci: number): number | null => {
    const segs = session?.analysis?.segments ?? [];
    for (const s of segs) {
      if (ci >= s.i_start && ci <= s.i_end) {
        const span = s.i_end - s.i_start;
        const f = span > 0 ? (ci - s.i_start) / span : 0;
        return Math.round(s.t_start_ms + f * (s.t_end_ms - s.t_start_ms));
      }
    }
    return null;
  };

  // Beim Betreten des Tap-Modus (bzw. Lauf-Wechsel): gespeicherte Durchläufe zählen.
  // Der Tap-Puffer bleibt LEER — jeder Durchlauf wird frisch getappt und als neuer Take gespeichert.
  useEffect(() => {
    if (!tagMode || !session) return;
    setTaps([]); setCmp(null);
    api.getPumpTruth(session.id, selectedRun).then((r) => setTakeCount(r.takes.length)).catch(() => {});
  }, [tagMode, session?.id, selectedRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Einen Tap aufnehmen: aktuelle (Float-)Playhead-Position -> ms. WICHTIG: die Nachkommastelle
  // zwischen zwei GPS-Punkten interpolieren, NICHT runden — sonst wäre die Tap-Zeit auf das
  // 1-Hz-GPS-Raster (±0,5 s) gequantelt und Offset/Jitter zwischen Takes verschwänden künstlich.
  const recordTap = () => {
    if (!playTimeline.length) return;
    const f = Math.min(Math.max(playheadRef.current, 0), playTimeline.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(i0 + 1, playTimeline.length - 1);
    const ms0 = ciToMs(playTimeline[i0]);
    if (ms0 == null) return;
    const ms1 = ciToMs(playTimeline[i1]);
    const ms = ms1 == null ? ms0 : Math.round(ms0 + (f - i0) * (ms1 - ms0));
    setTaps((prev) => [...prev, ms].sort((a, b) => a - b));
  };

  // Play mit 3-2-1-Countdown starten (Zeit, um das Video synchron zu starten).
  const startTagPlay = () => {
    if (playTimeline.length < 2 || countdown > 0) return;
    playheadRef.current = 0; setProgress(0); setPlayMode(true); setPlaying(false);
    let c = 3; setCountdown(c);
    const iv = setInterval(() => {
      c -= 1;
      if (c <= 0) { clearInterval(iv); setCountdown(0); setPlayMul(1); setPlaying(true); }
      else setCountdown(c);
    }, 1000);
  };

  // Aktuellen Durchlauf als NEUEN Take speichern (hängt an, überschreibt nichts) -> Puffer leeren.
  const saveTaps = () => {
    if (!session || !taps.length) return;
    api.savePumpTruth(session.id, taps, selectedRun).then((r) => {
      setTakeCount(r.n_takes); setTaps([]);
      setTapSaved(t("sd.tapSavedTake", { take: r.take, saved: r.saved }));
      setTimeout(() => setTapSaved(""), 3000);
    }).catch(() => setTapSaved("!"));
  };

  const runCompare = () => {
    if (!session) return;
    api.comparePumpTruth(session.id, selectedRun).then(setCmp).catch(() => setCmp(null));
  };

  // Alle gespeicherten Durchläufe dieses Laufs verwerfen (Bestätigung).
  const clearTakes = () => {
    if (!session || !takeCount) return;
    if (!window.confirm(t("sd.tapDeleteConfirm", { n: takeCount }))) return;
    api.deletePumpTruth(session.id, selectedRun).then(() => {
      setTakeCount(0); setCmp(null); setTaps([]); setTapSaved("");
    }).catch(() => {});
  };

  // Leertaste = Tap (nur im Tap-Modus, nicht in Eingabefeldern).
  useEffect(() => {
    if (!tagMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); recordTap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tagMode, playTimeline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Beschriftung: Eingabewert bei Session-Wechsel initialisieren.
  useEffect(() => { setCap(session?.caption ?? ""); }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveCaption = () => {
    if (!session) return;
    const v = cap.trim();
    setEditingCap(false);
    if (v === (session.caption ?? "")) return;
    api.updateSessionMeta(session.id, { caption: v }).then(setSession).catch(() => {});
  };

  // Karte initialisieren (einmal je Session).
  useEffect(() => {
    if (!session?.analysis?.track_geojson || !mapRef.current) return;
    const coords: [number, number][] =
      session.analysis.track_geojson.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    if (coords.length === 0) return;
    if (!mapObj.current) {
      mapObj.current = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 });
      L.control.zoom({ position: "bottomright" }).addTo(mapObj.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 22,        // erlaubt weiteres Reinzoomen ...
        maxNativeZoom: 19,  // ... über die OSM-Kacheln hinaus (überzoomt/skaliert)
      }).addTo(mapObj.current);
      // Eigene Panes über den Track-Linien (overlayPane z=400): Pump-Marker + die
      // bewegte Position bleiben so immer sichtbar, egal in welcher Reihenfolge die
      // Linien gezeichnet werden.
      mapObj.current.createPane("pumpPane"); mapObj.current.getPane("pumpPane")!.style.zIndex = "640";
      mapObj.current.createPane("posPane"); mapObj.current.getPane("posPane")!.style.zIndex = "650";
      trackLayer.current = L.layerGroup().addTo(mapObj.current);
    }
    mapObj.current.fitBounds(L.latLngBounds(coords), { padding: [24, 24] });
    setTimeout(() => mapObj.current?.invalidateSize(), 100);
  }, [session]);

  // Track (neu) einfärben bei Moduswechsel / Lauf-Auswahl.
  useEffect(() => {
    const map = mapObj.current;
    const lg = trackLayer.current;
    if (!map || !lg || !session?.analysis?.track_geojson) return;
    if (playMode) return;   // im Wiedergabe-Modus übernimmt der Play-Effekt das Zeichnen
    lg.clearLayers();
    const gj = session.analysis.track_geojson;
    const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
    const hr: (number | null)[] = gj.properties?.hr ?? [];
    const phz: (number | null)[] = gj.properties?.pump_hz ?? [];

    // Nur die Foiling-Läufe zeichnen — Nicht-Foiling wird komplett ausgeblendet.
    const MAX_DRAW_GAP_M = 30;
    const segs = session.analysis.segments ?? [];
    // Ohne erkannte Foiling-Läufe (z. B. GPS-only / grobes FIT-GPS): die KOMPLETTE
    // GPS-Spur normal speed-gefärbt zeichnen (so gut es eben ohne Accel/Pump-Erkennung
    // geht), damit man die Fahrt trotzdem sieht. Großzügige Lückenschwelle für grobe
    // Trackpoints.
    if (segs.length === 0) {
      for (let i = 0; i < coords.length - 1; i++) {
        if (map.distance(coords[i], coords[i + 1]) > 200) continue;
        let color: string;
        if (colorMode === "optimal") color = optimalColor((speeds[i + 1] ?? 0) * 3.6, optimalKmh ?? 0);
        else if (colorMode === "pump") { const v = phz[i + 1]; const [lo, hi] = pumpRange; color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1e-6)); }
        else if (colorMode === "hr") { const v = hr[i + 1]; const [lo, hi] = hrRange; color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1)); }
        else color = speedColor((speeds[i + 1] ?? 0) * 3.6, speedMin, speedMax);
        L.polyline([coords[i], coords[i + 1]], { color, weight: 5, opacity: 0.95 }).addTo(lg);
      }
      if (coords.length) {
        L.circleMarker(coords[0], { radius: 5, color: "#052e16", weight: 1.5, fillColor: "#22c55e", fillOpacity: 1 }).addTo(lg);
        L.circleMarker(coords[coords.length - 1], { radius: 5, color: "#450a0a", weight: 1.5, fillColor: "#ef4444", fillOpacity: 1 }).addTo(lg);
      }
    }
    segs.forEach((seg: any, idx: number) => {
      // Inaktive Läufe nur grau + transparent (nicht farbig), wenn einer aktiv ist.
      const dim = selectedRun != null && idx !== selectedRun;
      for (let i = seg.i_start; i < seg.i_end; i++) {
        if (map.distance(coords[i], coords[i + 1]) > MAX_DRAW_GAP_M) continue;
        let color: string;
        if (dim) {
          color = "#64748b";
        } else if (colorMode === "speed") {
          color = speedColor((speeds[i + 1] ?? 0) * 3.6, speedMin, speedMax);
        } else if (colorMode === "optimal") {
          color = optimalColor((speeds[i + 1] ?? 0) * 3.6, optimalKmh ?? 0);
        } else if (colorMode === "pump") {
          const v = phz[i + 1];
          const [lo, hi] = pumpRange;
          color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1e-6));
        } else {
          const v = hr[i + 1];
          const [lo, hi] = hrRange;
          color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1));
        }
        L.polyline([coords[i], coords[i + 1]], { color, weight: dim ? 3 : 5, opacity: dim ? 0.35 : 0.95 })
          .on("click", () => setSelectedRun((p) => (p === idx ? null : idx)))
          .addTo(lg);
      }
      // Pump-Marker auf der Linie (ein-/ausblendbar), bleiben weiß. Bei gedimmten Läufen weglassen.
      if (showPumps && !dim) {
        for (const idx of seg.pump_idx ?? []) {
          if (coords[idx]) {
            L.circleMarker(coords[idx], {
              radius: 2.5, color: "#0f172a", weight: 1,
              fillColor: "#f8fafc", fillOpacity: 0.9,
            }).addTo(lg);
          }
        }
      }
      // Start (grün) & Ende (rot) nur für den aktiven Lauf. start_pt/end_pt = [lon, lat].
      if (!dim) {
        const startLL = seg.start_pt ? [seg.start_pt[1], seg.start_pt[0]] : coords[seg.i_start];
        const endLL = seg.end_pt ? [seg.end_pt[1], seg.end_pt[0]] : coords[seg.i_end];
        if (startLL)
          L.circleMarker(startLL as [number, number], {
            radius: 5, color: "#052e16", weight: 1.5, fillColor: "#22c55e", fillOpacity: 1,
          }).addTo(lg);
        if (endLL)
          L.marker(endLL as [number, number], {
            icon: L.divIcon({
              className: "",
              html: '<div style="width:10px;height:10px;background:#ef4444;border:1.5px solid #450a0a;border-radius:1px"></div>',
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            }),
            interactive: false,
          }).addTo(lg);
      }
    });
    if (selectedRun != null && segs[selectedRun]) {
      const seg = segs[selectedRun];
      map.fitBounds(L.latLngBounds(coords.slice(seg.i_start, seg.i_end + 1)), { padding: [40, 40] });
    }
  }, [session, colorMode, selectedRun, hrRange, pumpRange, speedMin, speedMax, win, showPumps, fullscreen, optimalKmh, playMode]);

  // Play-Animation: zeichnet die Timeline progressiv (wie beim Fahren). Beim (Wieder-)
  // Eintritt komplett bis zum aktuellen Kopf neu zeichnen (mit aktuellen Farben), dann —
  // falls laufend — pro Frame die neuen Segmente anhängen + Positionsmarker bewegen.
  useEffect(() => {
    const map = mapObj.current;
    const lg = trackLayer.current;
    const gj = session?.analysis?.track_geojson;
    if (!map || !lg || !gj || !playMode || playTimeline.length < 2) return;

    const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
    const hr: (number | null)[] = gj.properties?.hr ?? [];
    const phz: (number | null)[] = gj.properties?.pump_hz ?? [];
    const segs = session?.analysis?.segments ?? [];
    const runs = selectedRun != null && segs[selectedRun] ? [segs[selectedRun]] : segs;
    const pumpSet = new Set<number>();
    runs.forEach((s: any) => (s.pump_idx ?? []).forEach((pi: number) => pumpSet.add(pi)));
    const MAX_GAP = 30;
    const lastIdx = playTimeline.length - 1;

    const colorAt = (i: number): string => {
      if (colorMode === "optimal") return optimalColor((speeds[i] ?? 0) * 3.6, optimalKmh ?? 0);
      if (colorMode === "pump") { const v = phz[i]; const [lo, hi] = pumpRange; return v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1e-6)); }
      if (colorMode === "hr") { const v = hr[i]; const [lo, hi] = hrRange; return v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1)); }
      return speedColor((speeds[i] ?? 0) * 3.6, speedMin, speedMax);
    };
    // Sind timeline[k] und timeline[k+1] ein zeichenbares Nachbarpaar (keine Lücke)?
    const adj = (k: number): boolean => {
      const a = playTimeline[k], b = playTimeline[k + 1];
      return b === a + 1 && map.distance(coords[a], coords[b]) <= MAX_GAP;
    };
    const lerp = (a: [number, number], b: [number, number], f: number): [number, number] =>
      [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    // Permanentes Segment k->k+1 (Linie + ggf. Pump-Marker am Zielpunkt, eigene Pane = oben).
    const addSeg = (k: number) => {
      const a = playTimeline[k], b = playTimeline[k + 1];
      if (adj(k)) L.polyline([coords[a], coords[b]], { color: colorAt(b), weight: 5, opacity: 0.95 }).addTo(lg);
      if (showPumps && pumpSet.has(b) && coords[b])
        L.circleMarker(coords[b], { pane: "pumpPane", radius: 3, color: "#0f172a", weight: 1, fillColor: "#f8fafc", fillOpacity: 1 }).addTo(lg);
    };
    const setPos = (ll: [number, number]) => {
      if (!posMarkerRef.current) posMarkerRef.current = L.circleMarker(ll, { pane: "posPane", radius: 7, color: "#0f172a", weight: 2, fillColor: "#22d3ee", fillOpacity: 1 }).addTo(lg);
      else posMarkerRef.current.setLatLng(ll);
    };
    // Bewegliche Spitze: interpoliertes Teilstück von Punkt hi zum nächsten + Positionsmarker
    // an der interpolierten Stelle -> kontinuierlicher Verlauf statt punktweisem Springen.
    const renderTip = (hi: number, frac: number) => {
      const a = coords[playTimeline[hi]];
      if (!a) return;
      let p: [number, number] = a;
      if (hi < lastIdx && frac > 0 && adj(hi)) {
        p = lerp(a, coords[playTimeline[hi + 1]], Math.min(frac, 1));
        if (!tipRef.current) tipRef.current = L.polyline([a, p], { color: colorAt(playTimeline[hi + 1]), weight: 5, opacity: 0.95 }).addTo(lg);
        else { tipRef.current.setLatLngs([a, p]); tipRef.current.setStyle({ color: colorAt(playTimeline[hi + 1]) }); }
      } else if (tipRef.current) {
        tipRef.current.setLatLngs([a, a]);
      }
      setPos(p);
    };

    // Bis zum aktuellen (Float-)Kopf neu aufbauen (Farb-/Lauf-/Pump-Änderungen greifen live).
    lg.clearLayers();
    posMarkerRef.current = null; tipRef.current = null;
    let headF = Math.min(playheadRef.current, lastIdx);
    if (coords[playTimeline[0]])
      L.circleMarker(coords[playTimeline[0]], { radius: 5, color: "#052e16", weight: 1.5, fillColor: "#22c55e", fillOpacity: 1 }).addTo(lg);
    let drawn = Math.floor(headF);
    for (let k = 0; k < drawn; k++) addSeg(k);
    renderTip(drawn, headF - drawn);

    if (!playing) return;   // pausiert: Standbild, keine Animation

    let raf = 0;
    let last = performance.now();
    const PPS = 1;   // ~1 GPS-Punkt/s -> 1× ≈ Echtzeit
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      headF = Math.min(headF + dt * playMul * PPS, lastIdx);
      const hi = Math.floor(headF);
      for (let k = drawn; k < hi; k++) addSeg(k);
      drawn = hi;
      renderTip(hi, headF - hi);
      playheadRef.current = headF;
      setProgress(lastIdx > 0 ? headF / lastIdx : 0);
      if (headF >= lastIdx) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playMode, playing, playMul, playTimeline, session, colorMode, selectedRun, showPumps, speedMin, speedMax, win, hrRange, pumpRange, optimalKmh, fullscreen]);

  if (error) {
    // Offline + nicht im Cache -> klare Meldung statt technischem Fehler.
    if (!navigator.onLine) return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center text-slate-300">
        <WifiOffIcon className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <p className="font-semibold text-slate-100">{t("pwa.sessionOfflineTitle")}</p>
        <p className="mt-1 text-sm">{t("pwa.sessionOfflineBody")}</p>
      </Card>
    );
    return <ErrorBox message={error} />;
  }
  if (!session) return <Spinner />;

  const a = session.analysis;
  const m = a?.metrics;
  const segs: any[] = a?.segments ?? [];
  const owned = session.owned !== false;

  // Theoretische Leistung (W) für oben + je Lauf. Ohne Pump-Frequenz pauschal +50 W.
  const fo = session.foil;
  const foilDims = fo?.span_cm && fo?.area_cm2 && fo?.thickness_mm
    ? { span_cm: fo.span_cm, area_cm2: fo.area_cm2, thickness_mm: fo.thickness_mm } : null;
  const powerFor = (avgMps?: number | null, pumpHz?: number | null): number | null => {
    if (!foilDims || !avgMps || avgMps <= 0) return null;
    const rider = { riderWeight: weightKg ?? DEFAULT_RIDER.riderWeight, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
    const pump = pumpHz && pumpHz > 0 ? { heaveAmp_cm: 12, pumpFreq_hz: pumpHz, recoveryLoss_pct: 35 } : undefined;
    const r = computeFoilPowerAtSpeed(foilDims, avgMps * 3.6, { rider, pump });
    return Math.round(r.dragPower + (pump ? r.inertiaPower : 50));
  };
  const argBest = (
    getter: (s: any) => number | null | undefined,
    better: (x: number, y: number) => boolean,
  ): { i: number; v: number | null } => {
    let bi = -1;
    let bv: number | null = null;
    segs.forEach((s, i) => {
      const v = getter(s);
      if (v != null && (bv === null || better(v, bv))) { bv = v; bi = i; }
    });
    return { i: bi, v: bv };
  };
  const maxSp = argBest((s) => s[`max_${win}s`], (x, y) => x > y);
  const minSp = argBest((s) => s[`min_${win}s`], (x, y) => x < y);
  const maxGl = argBest((s) => s.longest_glide_s, (x, y) => x > y);
  const longSeg = argBest((s) => s.duration_s, (x, y) => x > y);
  const farSeg = argBest((s) => s.distance_m, (x, y) => x > y);
  const hasPumpStats = m?.avg_pump_hz != null && (a?.pump_count ?? 0) > 0;
  return (
    <div>
      {/* Kopfzeile: mobil zwei Reihen (Sessions+Nav / Spot-Chat+Vergleich), ab sm eine Reihe.
          Der w-full-Umbruch greift nur mobil; ab sm sitzt alles nebeneinander (Spot-Chat inhaltsbreit). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to={`/sessions${getLastSessionsSearch()}`} className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
          <ChevronIcon className="h-4 w-4 rotate-180" /> {t("sessions.title")}
        </Link>
        <div className="ml-auto inline-flex shrink-0 overflow-hidden rounded-lg sm:order-last sm:ml-0">
          <button
            disabled={neighbors.older == null}
            onClick={() => neighbors.older != null && nav(`/sessions/${neighbors.older}`)}
            className="bg-slate-800 px-3 py-1 text-sm text-slate-200 enabled:hover:bg-slate-700 disabled:opacity-40"
            title={t("sd.olderTitle")}
          >
            {t("sd.older")}
          </button>
          <button
            disabled={neighbors.newer == null}
            onClick={() => neighbors.newer != null && nav(`/sessions/${neighbors.newer}`)}
            className="border-l border-slate-900/60 bg-slate-800 px-3 py-1 text-sm text-slate-200 enabled:hover:bg-slate-700 disabled:opacity-40"
            title={t("sd.newerTitle")}
          >
            {t("sd.newer")}
          </button>
        </div>
        {/* erzwingt mobil den Zeilenumbruch vor Spot-Chat; ab sm unsichtbar (eine Reihe) */}
        <div className="w-full sm:hidden" />
        {session.place_name && (
          <Link
            to={`/chat?scope=${encodeURIComponent(`spot:${session.place_name}`)}`}
            title={`${t("chat.spotChat")} ${session.place_name}`}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700 sm:ml-auto sm:flex-none"
          >
            <ChatBubbleIcon className="h-4 w-4 shrink-0 text-brand-400" />
            <span className="truncate">{t("chat.spotChat")} {session.place_name}</span>
          </Link>
        )}
        {(() => {
          const inCmp = compareRefs.some((r) => refKey(r) === refKey({ sessionId: session.id, runIdx: null }));
          return (
            <button
              onClick={() => toggleCompare({ sessionId: session.id, runIdx: null })}
              title={inCmp ? t("compare.remove") : t("compare.add")}
              className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1 text-sm ${session.place_name ? "sm:ml-0" : "sm:ml-auto"} ${inCmp ? "bg-brand-500/20 text-brand-300" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
            >
              <CompareIcon className="h-4 w-4 shrink-0" /> {inCmp ? t("compare.inList") : t("compare.add")}
            </button>
          );
        })()}
      </div>
      <div className="mb-4 flex items-start gap-3">
        {/* Profilbild zuerst, daneben Überschrift + Meta + Medien/Aktionen */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <Avatar name={session.owner_name ?? null} url={session.owner_avatar_url ?? null} size={96} className="h-24 w-24" />
          {session.owner_name && <span className="max-w-24 truncate text-[10px] text-slate-300">{session.owner_name}</span>}
        </div>
        <div className="min-w-0 flex-1">
      <h2 className="mb-1 text-xl font-bold">
        {new Date(session.started_at).toLocaleDateString(undefined, {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
        {!owned && session.owner_name && (
          <span className="text-brand-400"> · {session.owner_name}</span>
        )}
        {owned ? (
          (editingCap || !session.caption) ? (
            <input
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              onBlur={saveCaption}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              maxLength={30}
              autoFocus={editingCap}
              placeholder={t("meta.captionPlaceholder")}
              className="ml-2 w-64 max-w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-base font-normal text-slate-100"
            />
          ) : (
            <span className="text-brand-300"> · {session.caption}
              <button onClick={() => { setCap(session.caption ?? ""); setEditingCap(true); }} title={t("meta.edit")}
                className="ml-1 inline-flex align-middle text-slate-400 hover:text-slate-200"><EditIcon className="h-4 w-4" /></button>
            </span>
          )
        ) : (
          session.caption && <span className="text-brand-300"> · {session.caption}</span>
        )}
      </h2>
      <p className="mb-2 text-sm text-slate-300">
        {new Date(session.started_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        {session.ended_at && (
          <>
            {` ${t("sessions.timeTo")} `}
            {new Date(session.ended_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            <span className="text-slate-400"> · {t("sd.duration")} {fmtSpan(session.started_at, session.ended_at)}</span>
          </>
        )}
      </p>
      {/* Badges einheitlich hoch + horizontal ausgerichtet (flex, items-center). */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        {session.place_name && <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1"><LocationIcon className="h-3.5 w-3.5" /> {session.place_name}</span>}
        {session.sport && <span className="inline-flex items-center rounded bg-slate-800 px-2 py-1">{session.sport}</span>}
        <FoilSelect session={session} owned={owned} onMeta={setSession} />
        {!owned && <span className="inline-flex items-center rounded bg-sky-500/15 px-2 py-1 text-sky-700 dark:text-sky-300">{t("sd.communityView")}</span>}
      </div>
        </div>
      </div>

      {/* Aktionszeile volle Breite (links), nicht in der eingerückten Textspalte. */}
      <div className="mb-4">
        <SocialBar
          sessionId={session.id}
          owned={owned}
          ownerName={session.owner_name ?? null}
          ownerAvatar={session.owner_avatar_url ?? null}
          youtubeUrl={session.youtube_url ?? null}
          onMeta={setSession}
        />
      </div>

      {m?.detection === "gps_only" && (
        <div className="mb-4 rounded-xl border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("sd.gpsWarning")}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
        <Stat label={t("stat.foiling")}
          value={a?.foiling_distance_m == null ? "–" : a.foiling_distance_m < 1000 ? String(Math.round(a.foiling_distance_m)) : (a.foiling_distance_m / 1000).toFixed(2)}
          sub={a?.foiling_distance_m != null && a.foiling_distance_m < 1000 ? "m" : "km"} />
        <Stat label={t("stat.foilingTime")} value={fmtMMSS(a?.foiling_time_s)} sub="min:s" />
        <Stat label={t("stat.runs")} value={String(segs.length)} />
        <Stat label={t("sd.avgSpeed")} value={kmh(m?.avg_speed_mps)} sub="km/h" />
        {session.foil?.span_cm && session.foil?.area_cm2 && session.foil?.thickness_mm && (
          <FoilPowerStat
            foil={{
              brand: session.foil.brand, model: session.foil.model, size: session.foil.size,
              span_cm: session.foil.span_cm, area_cm2: session.foil.area_cm2, thickness_mm: session.foil.thickness_mm,
            }}
            avgKmh={m?.avg_speed_mps != null ? m.avg_speed_mps * 3.6 : null}
            pumpHz={m?.avg_pump_hz ?? null}
            estimated={session.foil.thickness_estimated}
          />
        )}

        <ClickStat label={t("sd.maxSpeed", { win })} value={maxSp.v != null ? (maxSp.v * 3.6).toFixed(1) : "–"} sub="km/h"
          runIdx={maxSp.i} selected={selectedRun} onSelect={setSelectedRun} />
        <ClickStat label={t("sd.minSpeed", { win })} value={minSp.v != null ? (minSp.v * 3.6).toFixed(1) : "–"} sub="km/h"
          runIdx={minSp.i} selected={selectedRun} onSelect={setSelectedRun} />
        <ClickStat label={t("sd.maxGlide")} value={maxGl.v != null ? maxGl.v.toFixed(1) : "–"} sub="s"
          runIdx={maxGl.i} selected={selectedRun} onSelect={setSelectedRun} />
        <Stat label={t("stat.pumps")} value={a?.pump_count != null ? String(a.pump_count) : "–"}
          sub={hasPumpStats ? undefined : t("sd.phase2")} />
        {hasPumpStats && (
          <>
            <Stat label={t("sd.avgPump")} value={m!.avg_pump_hz!.toFixed(2)} sub="Hz" />
            <Stat label={t("sd.avgDistPerPump")}
              value={a?.pump_count && a.foiling_distance_m != null ? (a.foiling_distance_m / a.pump_count).toFixed(1) : "–"} sub="m/Pump" />
          </>
        )}

        <Stat label={t("sd.avgHr")} value={m?.avg_hr != null ? String(m.avg_hr) : "–"} sub="bpm" />
        <Stat label={t("sd.maxHr")} value={m?.max_hr != null ? String(m.max_hr) : "–"} sub="bpm" />
        <ClickStat label={t("rec.longestRun")} value={longSeg.v != null ? fmtMMSS(longSeg.v) : "–"} sub="min:s"
          runIdx={longSeg.i} selected={selectedRun} onSelect={setSelectedRun} />
        <ClickStat label={t("rec.farthestRun")} value={farSeg.v != null ? fmtM(farSeg.v) : "–"} sub="m"
          runIdx={farSeg.i} selected={selectedRun} onSelect={setSelectedRun} />
      </div>

      <div className={fullscreen ? "fixed inset-0 z-[2000] flex flex-col bg-slate-950" : "mt-5"}>
        <div className={`flex flex-wrap items-center gap-2 ${fullscreen ? "shrink-0 p-2" : ""}`}>
          <span className="text-xs text-slate-400">{t("sd.coloring")}</span>
          <ModeButton active={colorMode === "speed"} onClick={() => setColorMode("speed")}>{t("sd.colorSpeed")}</ModeButton>
          <ModeButton active={colorMode === "hr"} onClick={() => setColorMode("hr")}>{t("sd.colorPulse")}</ModeButton>
          {hasPump && (
            <ModeButton active={colorMode === "pump"} onClick={() => setColorMode("pump")}>{t("sd.colorPumpHz")}</ModeButton>
          )}
          {optimalKmh != null && (
            <ModeButton active={colorMode === "optimal"} onClick={() => setColorMode("optimal")}>{t("sd.colorOptimal")}</ModeButton>
          )}
          {(colorMode === "speed" || colorMode === "optimal") && (
            <>
              <span className="ml-2 text-xs text-slate-400">{t("sd.smoothing")}</span>
              {(["1", "3", "5"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWin(w)}
                  className={`rounded-lg px-2.5 py-1 text-xs ${win === w ? "bg-brand-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-200"}`}
                >
                  {w}s
                </button>
              ))}
            </>
          )}
          <button
            onClick={() => setShowPumps((v) => !v)}
            className={`ml-2 rounded-lg px-2.5 py-1 text-xs ${showPumps ? "bg-brand-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-200"}`}
          >
            <span className="inline-flex items-center gap-1">{t("stat.pumps")} {showPumps ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}</span>
          </button>
          {selectedRun != null && (
            <button onClick={() => setSelectedRun(null)} title={t("sd.clearSelection")} className="ml-1 rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
          >
            {fullscreen ? t("sd.close") : t("sd.fullscreen")}
          </button>
        </div>

        {/* KEINE Card (backdrop-blur = Containing-Block). Vollbild: Karte füllt den
            flex-1-Bereich; Karte selbst nur height:100% (kein position-Hack). */}
        <div className={fullscreen ? "min-h-0 flex-1" : "overflow-hidden rounded-2xl border border-slate-800"}>
          <div
            ref={mapRef}
            style={{ width: "100%", height: fullscreen ? "100%" : "60vh", minHeight: fullscreen ? undefined : 320 }}
          />
        </div>

        {/* Play: Strecke über die Zeit aufzeichnen (wie beim Fahren) — gesamt oder gewählter
            Lauf. Sitzt zwischen Karte und Legende. */}
        {playTimeline.length >= 2 && (
          <div className={`flex flex-wrap items-center gap-2 ${fullscreen ? "shrink-0 bg-slate-950 px-2 pt-1" : "mt-2"}`}>
            <button
              onClick={togglePlay}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400"
              title={playing ? t("sd.pause") : t("sd.play")}
            >
              {playing
                ? <><span className="inline-block h-3 w-3" style={{ borderLeft: "3px solid currentColor", borderRight: "3px solid currentColor" }} /> {t("sd.pause")}</>
                : <><PlayIcon className="h-4 w-4" /> {t("sd.play")}</>}
            </button>
            {playMode && (
              <button
                onClick={stopPlay}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-sm text-slate-200 hover:bg-slate-700"
                title={t("sd.stop")}
              >
                <span className="inline-block h-3 w-3 bg-current" /> {t("sd.stop")}
              </button>
            )}
            <span className="ml-1 text-xs text-slate-400">{t("sd.playSpeed")}</span>
            {[1, 2, 4, 8, 16].map((mul) => (
              <button
                key={mul}
                onClick={() => setPlayMul(mul)}
                className={`rounded-lg px-2 py-1 text-xs ${playMul === mul ? "bg-brand-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-200"}`}
              >
                {mul}×
              </button>
            ))}
            <span className="text-xs tabular-nums text-slate-400">
              {selectedRun != null ? t("sd.playRun") : t("sd.playWhole")}
            </span>
            <div className="flex min-w-[120px] flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
                {fmtMMSS(progress * (playTimeline.length - 1))} / {fmtMMSS(playTimeline.length - 1)}
              </span>
            </div>
          </div>
        )}

        {/* Tap-to-Label: Steuerung — nur im Tag-Modus, linksbündig direkt unter der Karte.
            Der Ein/Aus-Schalter „Pumps taggen" sitzt rechts neben „Labeln" (siehe unten). */}
        {playTimeline.length >= 2 && (owned || isAdmin) && tagMode && (
          <div className={`flex flex-wrap items-center gap-2 ${fullscreen ? "shrink-0 bg-slate-950 px-2 pb-1" : "mt-1"}`}>
                <button
                  onClick={startTagPlay}
                  disabled={countdown > 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50"
                  title={t("sd.tapStartTitle")}
                >
                  {countdown > 0 ? countdown : <><PlayIcon className="h-4 w-4" /> {t("sd.tapStart")}</>}
                </button>
                <button
                  onClick={recordTap}
                  disabled={!playing}
                  className="rounded-lg bg-rose-500 px-5 py-1 text-base font-bold text-white hover:bg-rose-400 disabled:opacity-40"
                  title={t("sd.tapHint")}
                >
                  PUMP
                </button>
                <span className="text-xs tabular-nums text-slate-300">{t("sd.tapCount", { n: taps.length })}</span>
                <button onClick={() => setTaps((p) => p.slice(0, -1))} disabled={!taps.length}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                  {t("sd.tapUndo")}
                </button>
                <button onClick={() => setTaps([])} disabled={!taps.length}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                  {t("sd.tapClear")}
                </button>
                <button onClick={saveTaps} disabled={!taps.length}
                  className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">
                  {t("sd.tapSaveTake")}
                </button>
                <span className="text-xs tabular-nums text-slate-400">{t("sd.tapTakes", { n: takeCount })}</span>
                <button onClick={runCompare} disabled={takeCount < 1}
                  className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                  {t("sd.tapCompare")}
                </button>
                <button onClick={clearTakes} disabled={!takeCount}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-rose-300 hover:bg-slate-700 disabled:opacity-40">
                  {t("sd.tapDeleteAll")}
                </button>
                {tapSaved && <span className="text-xs text-emerald-400">{tapSaved}</span>}
                <p className="w-full rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm leading-relaxed text-slate-300"
                  dangerouslySetInnerHTML={{ __html: t("sd.tapHelp") }} />
                {cmp && (() => {
                  const qual = new Map(cmp.quality?.map((q) => [q.take, q]));
                  const vClass = cmp.verdict === "verified" ? "bg-emerald-500/20 text-emerald-300"
                    : cmp.verdict === "unverified" ? "bg-amber-500/20 text-amber-300"
                    : "bg-rose-500/20 text-rose-300";
                  return (
                  <div className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-slate-300">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${vClass}`}>{t(`sd.tapVerdict.${cmp.verdict}`)}</span>
                      <span>{t("sd.tapCmpHead", { n: cmp.n_takes, ref: cmp.ref_take ?? 0 })}
                        {" · "}{t("sd.tapCmpConsensus", { n: cmp.consensus_n ?? 0 })}</span>
                    </div>
                    <table className="tabular-nums text-slate-400">
                      <thead><tr className="text-slate-500">
                        <th className="pr-3 text-left">Take</th><th className="pr-3 text-right">{t("stat.pumps")}</th>
                        <th className="pr-3 text-right">Offset</th><th className="pr-3 text-right">Match</th>
                        <th className="pr-3 text-right">Jitter</th><th className="pr-2 text-right">Hz</th><th className="pl-1 text-center">✓</th>
                      </tr></thead>
                      <tbody>
                        {cmp.takes.map((r) => {
                          const q = qual.get(r.take);
                          const bad = q && !q.plausible;
                          return (
                          <tr key={r.take} className={bad ? "text-rose-300/80" : r.is_ref ? "text-brand-300" : ""}>
                            <td className="pr-3">{r.take}{r.is_ref ? " ★" : ""}</td>
                            <td className="pr-3 text-right">{r.n}</td>
                            <td className="pr-3 text-right">{r.is_ref ? "–" : `${r.offset_ms > 0 ? "+" : ""}${(r.offset_ms / 1000).toFixed(2)}s`}</td>
                            <td className="pr-3 text-right">{r.is_ref ? "–" : r.matched}</td>
                            <td className="pr-3 text-right">{r.is_ref ? "–" : `±${Math.round(r.jitter_ms)}ms`}</td>
                            <td className="pr-2 text-right">{q ? q.cadence_hz.toFixed(1) : "–"}</td>
                            <td className="pl-1 text-center">{q ? (q.plausible ? "✓" : "⚠") : ""}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[11px] text-slate-500">{t("sd.tapVerdictHint")}</p>
                  </div>
                  );
                })()}
          </div>
        )}

        <div className={`flex flex-wrap items-center justify-between gap-4 px-1 ${fullscreen ? "shrink-0 bg-slate-950 p-2" : ""}`}>
          <div className="flex flex-wrap items-center gap-4">
            <Legend mode={colorMode} hrRange={hrRange} speedRange={[speedMin, speedMax]} pumpRange={pumpRange} optimal={optimalKmh} />
            {colorMode === "speed" && (
              <span className="flex items-center gap-1 text-xs text-slate-300">
                <label className="mr-1 flex items-center gap-1" title={t("sd.autoScaleTitle")}>
                  <input type="checkbox" checked={autoScaleOn} onChange={(e) => toggleAuto(e.target.checked)} className="accent-brand-500" />
                  {t("sd.auto")}
                </label>
                {t("sd.scale")}
                <input
                  type="number" min={0} max={50} value={speedMin} disabled={autoScaleOn}
                  onChange={(e) => saveScale(Number(e.target.value), speedMax)}
                  className="w-14 rounded bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-50"
                />
                –
                <input
                  type="number" min={0} max={50} value={speedMax} disabled={autoScaleOn}
                  onChange={(e) => saveScale(speedMin, Number(e.target.value))}
                  className="w-14 rounded bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-50"
                />
                km/h
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {playTimeline.length >= 2 && (owned || isAdmin) && (
              <button
                onClick={() => { setTagMode((v) => !v); setTapSaved(""); }}
                className={`rounded-xl px-3 py-2 text-sm ${tagMode ? "bg-amber-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-100 hover:bg-slate-700"}`}
                title={t("sd.tapModeTitle")}
              >
                {tagMode ? t("sd.tapModeOn") : t("sd.tapMode")}
              </button>
            )}
            {!fullscreen && owned && (
              <Link
                to={`/sessions/${session.id}/label`}
                className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700"
              >
                {t("sd.label")}
              </Link>
            )}
          </div>
        </div>
      </div>

      {segs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-400">{t("sd.run")}</span>
          <span className="mr-1 inline-flex items-center gap-1 text-[10px] text-slate-500" title="1–9"><KeyboardIcon className="h-3.5 w-3.5" /> 1–9</span>
          {segs.map((_, i) => (
            <button
              key={i}
              onClick={() => setSelectedRun(selectedRun === i ? null : i)}
              className={`rounded-lg px-2.5 py-1 text-xs tabular-nums ${selectedRun === i ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
            >
              {i + 1}
            </button>
          ))}
          {selectedRun != null && (
            <button
              onClick={() => setSelectedRun(null)}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              {t("sd.allRuns")}
            </button>
          )}
        </div>
      )}

      {owned && <TrimEditor session={session} onSaved={setSession} />}

      <RunsTable segments={a?.segments ?? []} selected={selectedRun} onSelect={setSelectedRun} win={win} powerFor={powerFor} sessionId={session.id} compareRefs={compareRefs} startedAt={session.started_at} />

      {/* Session-Chats vorerst ausgeblendet — wir nutzen nur Spot-Chats. */}

      {owned && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={() => {
              if (!confirm(t("sd.deleteConfirm"))) return;
              api.deleteSession(session.id).then(() => { invalidateSessionListCache(); nav("/sessions"); }).catch((e) => alert(t("sd.deleteFail") + e));
            }}
            className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 hover:bg-red-500/20 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
          >
            {t("sd.deleteSession")}
          </button>
        </div>
      )}
    </div>
  );
}

function ClickStat({
  label, value, sub, runIdx, selected, onSelect,
}: {
  label: string; value: string; sub?: string;
  runIdx: number; selected: number | null; onSelect: (i: number | null) => void;
}) {
  const t = useT();
  const clickable = runIdx >= 0;
  const isSel = selected === runIdx && runIdx >= 0;
  return (
    <button
      disabled={!clickable}
      onClick={() => onSelect(isSel ? null : runIdx)}
      className={`overflow-hidden rounded-xl border p-1.5 text-left ${isSel ? "border-brand-500 bg-brand-500/10" : "border-slate-800 bg-slate-900/60"} ${clickable ? "hover:border-slate-600" : ""}`}
    >
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-base font-bold tabular-nums text-brand-400 sm:text-lg">{value}</span>
        {sub && <span className="truncate text-[11px] font-normal text-slate-400">{sub}</span>}
      </div>
      <div className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-slate-300">
        {label}{clickable && <span className="ml-1 text-brand-400">{t("sd.runN", { n: runIdx + 1 })}</span>}
      </div>
    </button>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-sm ${active ? "bg-brand-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-200"}`}
    >
      {children}
    </button>
  );
}

function Legend({ mode, hrRange, speedRange, pumpRange, optimal }: { mode: ColorMode; hrRange: [number, number]; speedRange: [number, number]; pumpRange: [number, number]; optimal?: number | null }) {
  const t = useT();
  // Optimal-Modus: divergierende Skala blau -> grün (Optimal) -> rot mit km/h-Ticks.
  if (mode === "optimal") {
    const opt = optimal ?? 0;
    const ticks = [1 - OPTIMAL_SPAN, 1, 1 + OPTIMAL_SPAN].map((r) => Math.round(opt * r));
    return (
      <div className="text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <div className="w-48">
            <div className="h-2 w-full rounded" style={{ background: "linear-gradient(to right, hsl(220,80%,48%), hsl(140,80%,48%), hsl(0,80%,48%))" }} />
            <div className="mt-1 flex w-full justify-between tabular-nums">
              {ticks.map((v, i) => <span key={i}>{v}</span>)}
            </div>
          </div>
          <span>km/h</span>
          <span className="text-slate-400">{t("sd.optimalLegend", { v: String(Math.round(opt)) })}</span>
        </div>
      </div>
    );
  }
  const [lo, hi] = mode === "speed" ? speedRange : mode === "pump" ? pumpRange : hrRange;
  const unit = mode === "speed" ? "km/h" : mode === "pump" ? "Hz" : "bpm";
  const ticksT = [0, 0.25, 0.5, 0.75, 1];
  const stops = ticksT.map((tt) => rampColor(tt)).join(", ");
  const ticks = ticksT.map((tt) =>
    mode === "pump" ? (lo + tt * (hi - lo)).toFixed(1) : Math.round(lo + tt * (hi - lo))
  );
  return (
    <div className="text-xs text-slate-300">
      <div className="flex items-center gap-3">
        <div className="w-48">
          <div className="h-2 w-full rounded" style={{ background: `linear-gradient(to right, ${stops})` }} />
          <div className="mt-1 flex w-full justify-between tabular-nums">
            {ticks.map((v, i) => <span key={i}>{v}</span>)}
          </div>
        </div>
        <span>{unit}</span>
        {mode === "speed" && (
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-4 rounded border border-slate-600 bg-black" /> außerhalb
          </span>
        )}
      </div>
    </div>
  );
}

function TrimEditor({ session, onSaved }: { session: SessionSummary; onSaved: (s: SessionSummary) => void }) {
  const t = useT();
  const totalSec = Math.max(
    1,
    Math.round((new Date(session.ended_at ?? session.started_at).getTime() - new Date(session.started_at).getTime()) / 1000)
  );
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(Math.round((session.trim_start_ms ?? 0) / 1000));
  const [b, setB] = useState(Math.round((session.trim_end_ms ?? totalSec * 1000) / 1000));
  const [saving, setSaving] = useState(false);
  const trimmed = session.trim_start_ms != null || session.trim_end_ms != null;

  async function apply(clear: boolean) {
    setSaving(true);
    try {
      const r = clear
        ? await api.trimSession(session.id, null, null)
        : await api.trimSession(session.id, a * 1000, Math.min(b, totalSec) * 1000);
      onSaved(r);
      if (clear) setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
      >
        {t("sd.trim")}{trimmed && <span className="ml-1 text-brand-400">{t("sd.trimActive")}</span>}
      </button>
      {open && (
        <Card className="mt-2 space-y-4 p-4">
          <p className="text-xs text-slate-300">
            {t("sd.trimHint", { total: fmtMMSS(totalSec) })}
          </p>
          <label className="block text-sm text-slate-200">
            {t("sd.start")} <span className="tabular-nums text-slate-100">{fmtMMSS(a)}</span>
            <input type="range" min={0} max={totalSec} value={a}
              onChange={(e) => setA(Math.min(Number(e.target.value), b - 1))}
              className="mt-1 w-full accent-brand-500" />
          </label>
          <label className="block text-sm text-slate-200">
            {t("sd.end")} <span className="tabular-nums text-slate-100">{fmtMMSS(b)}</span>
            <input type="range" min={0} max={totalSec} value={b}
              onChange={(e) => setB(Math.max(Number(e.target.value), a + 1))}
              className="mt-1 w-full accent-brand-500" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={saving} onClick={() => apply(false)}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
              {saving ? "…" : t("sd.saveReanalyze")}
            </button>
            {trimmed && (
              <button disabled={saving} onClick={() => apply(true)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                {t("common.reset")}
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function RunsTable({
  segments,
  selected,
  onSelect,
  win,
  powerFor,
  sessionId,
  compareRefs,
  startedAt,
}: {
  segments: any[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  win: "1" | "3" | "5";
  powerFor?: (avgMps?: number | null, pumpHz?: number | null) => number | null;
  sessionId: number;
  compareRefs: { sessionId: number; runIdx: number | null }[];
  startedAt: string;
}) {
  const t = useT();
  if (!segments.length) return null;
  // Uhrzeit des Lauf-Starts = Session-Start + t_start_ms (ms ab Session-Start).
  const sessionStartMs = new Date(startedAt).getTime();
  const runClock = (s: any): string =>
    s?.t_start_ms == null
      ? "–"
      : new Date(sessionStartMs + s.t_start_ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const showPower = !!powerFor && segments.some((s) => powerFor(s.avg_speed_mps, s.avg_pump_hz) != null);
  const bestDist = Math.max(...segments.map((s) => s.distance_m ?? 0));
  const hasPump = segments.some((s) => s.avg_pump_hz != null && (s.pumps ?? 0) > 0);
  const hz = (v: number | null | undefined) => (v != null ? v.toFixed(2) : "–");
  const val = (s: any, kind: "avg" | "max" | "min") => {
    const v = s[`${kind}_${win}s`] ?? (kind === "avg" ? s.avg_speed_mps : kind === "max" ? s.max_speed_mps : s.min_speed_mps);
    return v != null ? (v * 3.6).toFixed(1) : "–";
  };
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{t("sd.runsTitle", { count: segments.length })}</h3>
        <span className="ml-auto text-xs text-slate-400">{t("sd.smoothToggle", { win })}</span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium" title={t("compare.add")}><CompareIcon className="h-4 w-4" /></th>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("sd.colStart")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colDistance")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colDuration")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colAvg")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colMax", { win })}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colMin", { win })}</th>
              {showPower && <th className="px-3 py-2 font-medium">{t("sd.colPower")}</th>}
              <th className="px-3 py-2 font-medium">{t("sd.colPumps")}</th>
              {hasPump && <th className="px-3 py-2 font-medium">{t("sd.colDistPerPump")}</th>}
              {hasPump && <th className="px-3 py-2 font-medium">{t("sd.colAvgPump")}</th>}
              {hasPump && <th className="px-3 py-2 font-medium">{t("sd.colPumpMaxMin")}</th>}
              <th className="px-3 py-2 font-medium">{t("sd.colGlide")}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s, i) => {
              const best = (s.distance_m ?? 0) === bestDist;
              const sel = selected === i;
              return (
                <tr
                  key={i}
                  onClick={() => onSelect(sel ? null : i)}
                  className={`cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/50 ${sel ? "bg-brand-500/20" : best ? "bg-brand-500/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    {(() => {
                      const inCmp = compareRefs.some((r) => refKey(r) === refKey({ sessionId, runIdx: i }));
                      return (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCompare({ sessionId, runIdx: i }); }}
                          title={inCmp ? t("compare.remove") : t("compare.add")}
                          className={inCmp ? "text-brand-400" : "text-slate-400 hover:text-slate-200"}
                        >
                          <CompareIcon className="h-4 w-4" />
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {i + 1}{best && <span className="ml-1 inline-flex align-middle text-brand-400" title={t("sd.farthestRunTitle")}><StarIcon className="h-3.5 w-3.5" filled /></span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">{runClock(s)}</td>
                  <td className="px-3 py-2 tabular-nums">{Math.round(s.distance_m)} m</td>
                  <td className="px-3 py-2 tabular-nums">{fmtMMSS(s.duration_s)}</td>
                  <td className="px-3 py-2 tabular-nums">{s.avg_speed_mps != null ? (s.avg_speed_mps * 3.6).toFixed(1) : "–"}</td>
                  <td className="px-3 py-2 tabular-nums">{val(s, "max")}</td>
                  <td className="px-3 py-2 tabular-nums">{val(s, "min")}</td>
                  {showPower && (
                    <td className="px-3 py-2 tabular-nums text-brand-400">
                      {(() => { const w = powerFor!(s.avg_speed_mps, s.avg_pump_hz); return w != null ? `${w} W` : "–"; })()}
                    </td>
                  )}
                  <td className="px-3 py-2 tabular-nums">{s.pumps ?? "–"}</td>
                  {hasPump && <td className="px-3 py-2 tabular-nums">{s.pumps ? `${(s.distance_m / s.pumps).toFixed(1)} m` : "–"}</td>}
                  {hasPump && <td className="px-3 py-2 tabular-nums">{hz(s.avg_pump_hz)}</td>}
                  {hasPump && <td className="px-3 py-2 tabular-nums">{hz(s.max_pump_hz)} / {hz(s.min_pump_hz)}</td>}
                  <td className="px-3 py-2 tabular-nums">{s.longest_glide_s != null ? `${s.longest_glide_s.toFixed(1)} s` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 px-1 text-xs text-slate-400">
        {t("sd.tableFooter")}
      </p>
    </div>
  );
}
