import { useCallback, useEffect, useRef, useState } from "react";
import { api, AppState, encPath, fmtDur, RenderResult, Track } from "./api";
import { Icon } from "./icons";
import Uploads from "./Uploads";

// Muss zu den Server-Konstanten passen (TEXT_FADE/TEXT_HOLD/OUTRO_*)
const TXN = 6;
const TXF = 0.5;
const TXH = 2.0;
const TXS = 60;
const OUTRO_SECS = 2.5;
const OUTRO_SECS_LONG = 4.0;
const OUTRO_LONG_AB = 20.0;

interface TextSlot {
  start: number | null;
  text: string;
  hold: number;
}
const emptyTexts = (): TextSlot[] =>
  Array.from({ length: TXN }, () => ({ start: null, text: "", hold: TXH }));

type Sel = { youtube: string | null; instagram: string | null };
type PvPlatform = "youtube" | "instagram" | "tiktok";

const OUTRO_ICONS: Record<PvPlatform, [string, string][]> = {
  youtube: [
    ["M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z", "thumbsup"],
    ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0", "bell"],
  ],
  instagram: [
    ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", "heart"],
    ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z", "comment"],
    ["m22 2-7 20-4-9-9-4ZM22 2 11 13", "send"],
  ],
  tiktok: [
    ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", "heart"],
    ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z", "comment"],
    ["m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3", "repost"],
  ],
};

function drawIconPath(g: CanvasRenderingContext2D, d: string, x: number, y: number, size: number) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineWidth = 2;
  g.stroke(new Path2D(d));
  g.restore();
}

export default function App() {
  const [tab, setTab] = useState<"studio" | "uploads">("studio");
  return (
    <>
      <div className="tabbar">
        <span className="brand">🌊 Pumpfoil Shorts</span>
        <button className={`tab ${tab === "studio" ? "on" : ""}`} onClick={() => setTab("studio")}>
          <Icon name="film" /> Studio
        </button>
        <button className={`tab ${tab === "uploads" ? "on" : ""}`} onClick={() => setTab("uploads")}>
          <Icon name="upload" /> Uploads
        </button>
      </div>
      {tab === "studio" ? <Studio /> : <Uploads />}
    </>
  );
}

// Studio-Einstellungen überleben Reloads via localStorage
const SETTINGS_KEY = "shorts-studio-v1";
function loadSaved(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function Studio() {
  const [saved] = useState(loadSaved);
  const sv = <T,>(key: string, fallback: T): T =>
    (saved[key] !== undefined ? (saved[key] as T) : fallback);

  const [state, setState] = useState<AppState | null>(null);
  const [curVideo, setCurVideo] = useState<string | null>(sv("curVideo", null));
  const [curPlay, setCurPlay] = useState<string | null>(null);
  const [renderingVideo, setRenderingVideo] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(sv("sel", { youtube: null, instagram: null }));
  const [pvPlatform, setPvPlatform] = useState<PvPlatform>(sv("pvPlatform", "youtube"));
  const [trim, setTrim] = useState<{ start: number | null; end: number | null }>(sv("trim", { start: null, end: null }));
  const [texts, setTexts] = useState<TextSlot[]>(sv("texts", emptyTexts()));
  const [gain, setGain] = useState(sv("gain", -12));
  const [fade, setFade] = useState(sv("fade", 2));
  const [outName, setOutName] = useState(sv("outName", ""));
  const [ovOn, setOvOn] = useState(sv("ovOn", true));
  const [ovSel, setOvSel] = useState(sv("ovSel", ""));
  const [ovAlpha, setOvAlpha] = useState(sv("ovAlpha", 1));
  const [outroOn, setOutroOn] = useState(sv("outroOn", true));
  const [fltYT, setFltYT] = useState(sv("fltYT", true));
  const [fltIG, setFltIG] = useState(sv("fltIG", true));
  const [search, setSearch] = useState("");

  // bei jeder Änderung speichern
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      curVideo, sel, pvPlatform, trim, texts, gain, fade,
      outName, ovOn, ovSel, ovAlpha, outroOn, fltYT, fltIG,
    }));
  }, [curVideo, sel, pvPlatform, trim, texts, gain, fade, outName, ovOn, ovSel, ovAlpha, outroOn, fltYT, fltIG]);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [dirInput, setDirInput] = useState("");
  const [log, setLog] = useState("");
  const [aMsg, setAMsg] = useState("");
  const [prog, setProg] = useState<{ label: string; pct: number } | null>(null);
  const [rendering, setRendering] = useState(false);

  const vidRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const txovRefs = useRef<(HTMLDivElement | null)[]>([]);
  const outroImgRef = useRef<HTMLImageElement>(null);
  const allowPlayRef = useRef(0);
  const playTimerRef = useRef<number | undefined>(undefined);
  const lastTRef = useRef(0);
  const outroCacheRef = useRef<{ key: string; url: string }>({ key: "", url: "" });

  // Live-Werte für den rAF-Loop (State-Snapshot ohne Re-Subscribe)
  const live = useRef({ trim, texts, outroOn, pvPlatform, curPlay });
  live.current = { trim, texts, outroOn, pvPlatform, curPlay };

  const load = useCallback(async () => {
    const s = await api.list();
    setState(s);
    return s;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-Pick: beim ersten Laden das gemerkte Video wiederherstellen,
  // sonst das erste wählen, wenn keins (mehr) gewählt ist
  const initedRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    setDirInput((d) => (d === "" || !document.activeElement?.classList?.contains("dirinput") ? state.video_dir : d));
    if (!initedRef.current) {
      initedRef.current = true;
      if (curVideo && state.videos.includes(curVideo)) {
        pickVideo(curVideo);
        return;
      }
    }
    if ((!curVideo || !state.videos.includes(curVideo)) && state.videos.length) {
      pickVideo(state.videos[0]);
    }
    if (!state.overlays.includes(ovSel)) {
      const def = "youtube-overlay-xxsmall-noshadow-1080x1920.png";
      setOvSel(state.overlays.includes(def) ? def : (state.overlays[0] ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const stopMusic = useCallback(() => {
    musicRef.current?.pause();
    setCurPlay(null);
  }, []);

  const pickVideo = useCallback(
    (v: string) => {
      const vid = vidRef.current;
      setCurVideo(v);
      if (vid) {
        vid.pause();
        vid.src = "/media/video/" + encodeURIComponent(v);
        window.clearTimeout(playTimerRef.current);
        // Wächter: bis der Timer abläuft, wird JEDES Play sofort wieder pausiert
        allowPlayRef.current = performance.now() + 950;
        playTimerRef.current = window.setTimeout(() => {
          allowPlayRef.current = 0;
          vid.play().catch(() => {});
        }, 1000);
      }
      stopMusic();
    },
    [stopMusic],
  );

  // Video-Events: Play-Wächter, Musik-Sync
  useEffect(() => {
    const vid = vidRef.current;
    const music = musicRef.current;
    if (!vid || !music) return;
    const onPlay = () => {
      if (performance.now() < allowPlayRef.current) {
        vid.pause();
        return;
      }
      if (live.current.curPlay && music.paused) void music.play();
    };
    const onPause = () => music.pause();
    const onSeeked = () => {
      if (live.current.curPlay && music.duration) {
        music.currentTime = Math.max(0, vid.currentTime - (live.current.trim.start ?? 0)) % music.duration;
      }
    };
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("seeked", onSeeked);
    return () => {
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("seeked", onSeeked);
    };
  }, []);

  // rAF-Loop: Trim-Loop + Text-Overlay-Vorschau + Outro-Vorschau
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const vid = vidRef.current;
      if (vid) {
        const { trim, texts, outroOn, pvPlatform } = live.current;
        const t = vid.currentTime;
        if (!vid.paused) {
          if (trim.end != null && t >= trim.end) vid.currentTime = trim.start ?? 0;
          else if (trim.start && t < trim.start && lastTRef.current > t + 1) vid.currentTime = trim.start;
        }
        lastTRef.current = t;
        const scale = vid.videoWidth ? vid.clientWidth / vid.videoWidth : 1;
        texts.forEach((tx, i) => {
          const el = txovRefs.current[i];
          if (!el) return;
          if (tx.start == null || !tx.text.trim()) {
            el.style.opacity = "0";
            return;
          }
          const e = tx.start + 2 * TXF + (tx.hold ?? TXH);
          const a = Math.max(0, Math.min(Math.min((t - tx.start) / TXF, (e - t) / TXF), 1));
          el.textContent = tx.text;
          el.style.fontSize = `${TXS * scale}px`;
          el.style.opacity = String(a);
        });
        const oi = outroImgRef.current;
        if (oi) {
          const dur = vid.duration;
          if (outroOn && isFinite(dur) && dur > 0) {
            const end = trim.end ?? dur;
            const effLen = end - (trim.start ?? 0);
            const secs = effLen > OUTRO_LONG_AB ? OUTRO_SECS_LONG : OUTRO_SECS;
            const st = Math.max(trim.start ?? 0, end - secs);
            const a = Math.max(0, Math.min((t - st) / TXF, 1));
            const key = pvPlatform + "|" + vid.videoWidth;
            if (a > 0 && outroCacheRef.current.key !== key) {
              outroCacheRef.current = { key, url: outroPng(pvPlatform, vid) };
              oi.src = outroCacheRef.current.url;
            }
            oi.style.opacity = String(a);
          } else {
            oi.style.opacity = "0";
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Musik-Lautstärke aus Gain
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = Math.pow(10, gain / 20);
  }, [gain, curPlay]);

  function outroPng(pf: PvPlatform, vid: HTMLVideoElement): string {
    const w = vid.videoWidth || 1080;
    const h = vid.videoHeight || 1920;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const items = OUTRO_ICONS[pf];
    const size = 110;
    const gap = 54;
    const total = items.length * size + (items.length - 1) * gap;
    let x = (w - total) / 2;
    const y = h * 0.68;
    g.strokeStyle = "#fff";
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 8;
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 2;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const [d] of items) {
      drawIconPath(g, d, x, y, size);
      x += size + gap;
    }
    return c.toDataURL("image/png");
  }

  function textPng(tx: TextSlot): string {
    const vid = vidRef.current;
    const w = vid?.videoWidth || 1080;
    const h = vid?.videoHeight || 1920;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.font = `${TXS}px Arial`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 6;
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 2;
    const lines = tx.text.split("\n");
    const lh = TXS * 1.15;
    const y0 = h / 2 - ((lines.length - 1) / 2) * lh;
    lines.forEach((ln, i) => g.fillText(ln, w / 2, y0 + i * lh));
    return c.toDataURL("image/png");
  }

  const setDir = useCallback(
    async (dir: string) => {
      const d = await api.post<AppState & { error?: string }>("/api/setdir", { dir });
      if (d.error) {
        setLog(d.error);
        return;
      }
      setCurVideo(null);
      stopMusic();
      setState(d);
    },
    [stopMusic],
  );

  const toggleStar = useCallback(async (v: string, on: boolean) => {
    setState(await api.post<AppState>("/api/star", { video: v, on }));
  }, []);

  const sortedVids = useCallback((): string[] => {
    if (!state) return [];
    const starred = new Set(state.stars);
    return [...state.videos].sort(
      (a, b) => (starred.has(b) ? 1 : 0) - (starred.has(a) ? 1 : 0) || a.localeCompare(b),
    );
  }, [state]);

  const discard = useCallback(
    async (v: string, category: string) => {
      const order = sortedVids();
      const idx = order.indexOf(v);
      const d = await api.post<AppState & { error?: string }>("/api/discard", { video: v, category });
      if (d.error) {
        setLog(d.error);
        return;
      }
      // nächstes Video in Listenreihenfolge wählen (sonst das davor)
      let next: string | null = null;
      for (let i = idx + 1; i < order.length; i++) if (d.videos.includes(order[i])) { next = order[i]; break; }
      if (!next) for (let i = idx - 1; i >= 0; i--) if (d.videos.includes(order[i])) { next = order[i]; break; }
      setState(d);
      if (curVideo === v) {
        if (next) pickVideo(next);
        else setCurVideo(null);
      }
    },
    [curVideo, pickVideo, sortedVids],
  );

  const undo = useCallback(async () => {
    const d = await api.post<AppState & { undone: string | null }>("/api/undo", {});
    const u = d.undone;
    setState(d);
    setAMsg(u ? `wiederhergestellt: ${u}` : "nichts rückgängig zu machen");
    if (u && d.videos.includes(u)) pickVideo(u);
  }, [pickVideo]);

  const togglePlay = useCallback(
    (t: Track) => {
      const music = musicRef.current;
      const vid = vidRef.current;
      if (!music) return;
      if (curPlay === t.rel) {
        stopMusic();
        return;
      }
      setCurPlay(t.rel);
      music.src = "/media/musik/" + encPath(t.rel);
      music.volume = Math.pow(10, gain / 20);
      void music.play();
      if (vid?.src) {
        allowPlayRef.current = 0;
        window.clearTimeout(playTimerRef.current);
        vid.currentTime = trim.start ?? 0;
        vid.muted = false;
        void vid.play();
      }
    },
    [curPlay, gain, stopMusic, trim.start],
  );

  const playSelected = useCallback(
    (pf: PvPlatform) => {
      setPvPlatform(pf);
      outroCacheRef.current = { key: "", url: "" };
      const vid = vidRef.current;
      if (pf === "tiktok" || !sel[pf as "youtube" | "instagram"]) {
        stopMusic();
        if (pf === "tiktok" && vid?.src) {
          allowPlayRef.current = 0;
          window.clearTimeout(playTimerRef.current);
          vid.currentTime = trim.start ?? 0;
          vid.muted = false;
          void vid.play();
        }
        return;
      }
      const rel = sel[pf as "youtube" | "instagram"]!;
      const track = state?.tracks.find((t) => t.rel === rel);
      if (track) togglePlay(track);
    },
    [sel, state, stopMusic, togglePlay, trim.start],
  );

  const selectTrack = useCallback((pf: "youtube" | "instagram", rel: string) => {
    setSel((s) => {
      const selecting = s[pf] !== rel;
      if (selecting) {
        if (pf === "youtube") setFltYT(false);
        else setFltIG(false);
        setFltYT((y) => {
          setFltIG((g) => {
            if (!y && !g) {
              setFltYT(true);
              return true;
            }
            return g;
          });
          return y;
        });
      }
      return { ...s, [pf]: selecting ? rel : null };
    });
  }, []);

  const effLen = useCallback((): number | null => {
    const vid = vidRef.current;
    const end = trim.end ?? (vid && isFinite(vid.duration) ? vid.duration : null);
    if (end == null) return null;
    return end - (trim.start ?? 0);
  }, [trim]);

  const resetAll = useCallback(() => {
    if (!window.confirm("Alle Studio-Einstellungen zurücksetzen (Texte, Trim, Musikwahl, Name …)?")) return;
    localStorage.removeItem(SETTINGS_KEY);
    setSel({ youtube: null, instagram: null });
    setPvPlatform("youtube");
    setTrim({ start: null, end: null });
    setTexts(emptyTexts());
    setGain(-12);
    setFade(2);
    setOutName("");
    setOvOn(true);
    setOvAlpha(1);
    setOutroOn(true);
    setFltYT(true);
    setFltIG(true);
    setSearch("");
    setAMsg("");
    setLog("");
    if (state?.videos.length) pickVideo(state.videos[0]);
  }, [state, pickVideo]);

  const ready = !!(curVideo && sel.youtube && sel.instagram && outName.trim());

  const doRender = useCallback(async () => {
    if (!ready || !curVideo) return;
    setRendering(true);
    setLog("");
    stopMusic();
    vidRef.current?.pause();
    setRenderingVideo(curVideo);
    setProg({ label: "", pct: 0 });
    const iv = window.setInterval(async () => {
      try {
        const p = await api.progress();
        if (p.active) setProg({ label: p.label, pct: p.pct });
      } catch {
        /* ignore */
      }
    }, 400);
    try {
      const r = await api.post<RenderResult>("/api/render", {
        video: curVideo,
        tracks: sel,
        gain_db: gain,
        fade_out: fade,
        overlay: (ovOn && ovSel) || null,
        overlay_alpha: ovAlpha,
        trim_start: trim.start,
        trim_end: trim.end,
        out_name: outName,
        texts: texts
          .filter((t) => t.text.trim() && t.start != null)
          .map((t) => ({ start: t.start, hold: t.hold, png: textPng(t) })),
        outros: outroOn && vidRef.current
          ? {
              youtube: outroPng("youtube", vidRef.current),
              instagram: outroPng("instagram", vidRef.current),
              tiktok: outroPng("tiktok", vidRef.current),
            }
          : null,
      });
      const errs = Object.entries(r.results).filter(([, res]) => !res.ok);
      setLog(errs.map(([pf, res]) => `✗ ${pf}: ${res.error}`).join("\n"));
      // verwendeten Namen (inkl. Nummer) behalten → erneutes Rendern überschreibt
      const first = Object.values(r.results).find((res) => res.ok && res.out);
      if (first?.out) setOutName(first.out.split("/").pop()!.replace(/\.mp4$/, ""));
    } catch (e) {
      setLog(`Fehler: ${e}`);
    }
    window.clearInterval(iv);
    setProg(null);
    setRenderingVideo(null);
    setRendering(false);
    void load();
  }, [ready, curVideo, sel, gain, fade, ovOn, ovSel, trim, outName, texts, outroOn, stopMusic, load]);

  if (!state) return <div style={{ padding: 20, opacity: 0.6 }}>lade …</div>;

  const starred = new Set(state.stars);
  const vids = sortedVids();
  const len = effLen();
  const q = search.trim().toLowerCase();
  const want: string[] = [];
  if (fltYT) want.push("youtube");
  if (fltIG) want.push("instagram");
  const isSel = (t: Track) => sel.youtube === t.rel || sel.instagram === t.rel;
  const tooShort = (t: Track) => !!(t.dur && len && t.dur < len - 0.5);
  const selTracks = state.tracks.filter(isSel);
  const listTracks = state.tracks.filter(
    (t) =>
      !isSel(t) &&
      (!q || t.rel.toLowerCase().includes(q)) &&
      t.platforms.some((p) => want.includes(p)) &&
      !tooShort(t),
  );
  const isStarred = !!(curVideo && starred.has(curVideo));
  const pvTrackName =
    pvPlatform === "tiktok"
      ? "O-Ton, ohne Musik"
      : (sel[pvPlatform]?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "–");

  const trackRow = (t: Track) => (
    <div key={t.rel} className={`item trk ${curPlay === t.rel ? "playing" : ""}`}>
      <button className="mini playbtn" onClick={() => togglePlay(t)}>
        <Icon name={curPlay === t.rel ? "pause" : "play"} filled size={11} />
      </button>
      <div className="name">
        {t.rel.split("/").pop()!.replace(/\.[^.]+$/, "")}{" "}
        <span className="folder">
          {t.folder}
          {t.dur ? ` · ${Math.round(t.dur)}s` : ""}
        </span>
        {tooShort(t) && <span title="kürzer als das Video — wird beim Rendern geloopt"> ⚠️</span>}
      </div>
      {t.platforms.map((pf) => (
        <button
          key={pf}
          className={`mini ${sel[pf as "youtube" | "instagram"] === t.rel ? "sel" : ""}`}
          onClick={() => selectTrack(pf as "youtube" | "instagram", t.rel)}
        >
          {pf === "youtube" ? "YT" : "IG"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="studio">
      {/* ---------- linke Spalte: Videos ---------- */}
      <div className="col left">
        <h2 className="dirtitle">{state.video_dir.split("/").pop() || "/"}</h2>
        <div className="dirrow">
          <input
            className="dirinput"
            spellCheck={false}
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void setDir(dirInput)}
            title="Ordner mit den Videos"
          />
          <button className="btn" title="Ordner durchsuchen" onClick={() => setBrowserOpen((b) => !b)}>
            <Icon name="folder" size={14} />
          </button>
          <button className="btn" onClick={() => void setDir(dirInput)}>Laden</button>
        </div>
        <div className="quickrow">
          {state.quick_dirs.map((qd) => (
            <button
              key={qd.dir}
              className={`chip ${qd.dir === state.video_dir ? "on" : ""}`}
              title={qd.dir}
              onClick={() => void setDir(qd.dir)}
            >
              {qd.label}
            </button>
          ))}
        </div>
        {browserOpen && (
          <div className="browser">
            {state.parent !== state.video_dir && (
              <div className="item" onClick={() => void setDir(state.parent)}>
                <Icon name="up" size={13} /> ..
              </div>
            )}
            {state.subdirs.map((s) => (
              <div key={s.name} className="item" onClick={() => void setDir(state.video_dir + "/" + s.name)}>
                <Icon name="folder" size={13} /> {s.name}
                {s.mp4s ? ` (${s.mp4s})` : ""}
              </div>
            ))}
            {!state.subdirs.length && <div className="item" style={{ opacity: 0.5, cursor: "default" }}>keine Unterordner</div>}
          </div>
        )}
        <div className="scroll">
          {vids.map((v) => (
            <div
              key={v}
              className={`item vid ${v === curVideo ? "active" : ""} ${v === renderingVideo ? "rendering" : ""}`}
              onClick={() => pickVideo(v)}
            >
              <div className="hdr">
                <span className="vn">
                  {starred.has(v) && (
                    <span className="starmark">
                      <Icon name="star" filled size={11} />
                    </span>
                  )}
                  {v.replace(/\.mp4$/, "")}
                  {(state.rendered[v] ?? []).map((pf) => (
                    <span key={pf} className="badge done">
                      {pf === "youtube" ? "YT" : pf === "instagram" ? "IG" : "TT"}
                    </span>
                  ))}
                </span>
                <span className="vdur">{fmtDur(state.vdurs[v])}</span>
              </div>
              <div className="thumbs">
                {[1, 5].map((t) => (
                  <img
                    key={t}
                    loading="lazy"
                    alt=""
                    src={`/thumb/${encodeURIComponent(v)}?t=${t}`}
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Mitte: Player + Aktionen ---------- */}
      <div className="col center">
        <div className="stage">
          <div className="vwrap">
            <video ref={vidRef} controls playsInline loop />
            {ovOn && ovSel && (
              <img className="ovimg" alt="" style={{ opacity: ovAlpha }} src={`/media/overlay/${encodeURIComponent(ovSel)}`} />
            )}
            <img ref={outroImgRef} className="outroimg" alt="" style={{ opacity: 0 }} />
            {texts.map((_, i) => (
              <div key={i} ref={(el) => { txovRefs.current[i] = el; }} className="txov" />
            ))}
          </div>
          <div className="actions">
            <button className={`abtn ${isStarred ? "starred" : ""}`} onClick={() => curVideo && void toggleStar(curVideo, !isStarred)}>
              <Icon name="star" filled={isStarred} size={18} /> {isStarred ? "gemerkt" : "merken"}
            </button>
            <button className="abtn" onClick={() => curVideo && void discard(curVideo, "privat")}>
              <Icon name="lock" size={18} /> privat
            </button>
            <button className="abtn" onClick={() => curVideo && void discard(curVideo, "never-give-up")}>
              <Icon name="dumbbell" size={18} /> never-give-up
            </button>
            <button className="abtn" onClick={() => curVideo && void discard(curVideo, "aussortiert")}>
              <Icon name="trash" size={18} /> aussortieren
            </button>
            <button className="abtn" onClick={() => void undo()}>
              <Icon name="undo" size={18} /> rückgängig
            </button>
            <div className="texts">
              {texts.map((tx, i) => (
                <div key={i} className="txrow">
                  <button
                    className="mini"
                    title="Startzeit = aktuelle Videoposition"
                    onClick={() =>
                      setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, start: vidRef.current?.currentTime ?? 0 } : t)))
                    }
                  >
                    @ {tx.start == null ? "–" : tx.start.toFixed(1) + "s"}
                  </button>
                  <textarea
                    className="txt"
                    rows={2}
                    placeholder="Text …"
                    spellCheck={false}
                    value={tx.text}
                    onChange={(e) => setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, text: e.target.value } : t)))}
                  />
                  <input
                    type="number"
                    className="thold"
                    min={0}
                    max={60}
                    step={1}
                    value={tx.hold}
                    title="Anzeigedauer in Sekunden (ohne Ein-/Ausblenden)"
                    onChange={(e) =>
                      setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, hold: Math.max(0, +e.target.value || 0) } : t)))
                    }
                  />
                  <button
                    className="mini"
                    title="löschen"
                    onClick={() => setTexts((ts) => ts.map((t, j) => (j === i ? { start: null, text: "", hold: TXH } : t)))}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="amsg">{aMsg}</div>
          </div>
        </div>
        <div className="pvbar">
          <span className="nm">{curVideo ?? ""}</span>
          {(["youtube", "instagram", "tiktok"] as PvPlatform[]).map((pf) => (
            <button key={pf} className={`mini ${pvPlatform === pf ? "sel" : ""}`} onClick={() => playSelected(pf)}>
              {pf === "youtube" ? "YT" : pf === "instagram" ? "IG" : "TT"}
            </button>
          ))}
          <span className="trkname">{pvTrackName}</span>
          <button className="mini" style={{ marginLeft: "auto" }} title="Alle Studio-Einstellungen zurücksetzen" onClick={resetAll}>
            Reset
          </button>
        </div>
      </div>

      {/* ---------- rechte Spalte: Musik + Render ---------- */}
      <div className="col right">
        <h2>Musik</h2>
        <div className="panel">
          <div className="row">
            Musik-Pegel
            <input type="range" min={-30} max={0} step={1} value={gain} onChange={(e) => setGain(+e.target.value)} />
            <span>{gain} dB</span>
          </div>
          <div className="row">
            Fade-out
            <input type="number" min={0} max={15} step={0.5} value={fade} onChange={(e) => setFade(+e.target.value)} /> s
          </div>
          <div className="row">
            <label>
              <input type="checkbox" checked={ovOn} onChange={(e) => setOvOn(e.target.checked)} /> Overlay
            </label>
            <select value={ovSel} onChange={(e) => { setOvSel(e.target.value); if (e.target.value) setOvOn(true); }}>
              {state.overlays.map((o) => (
                <option key={o} value={o}>{o.replace(/\.png$/, "")}</option>
              ))}
            </select>
          </div>
          <div className="row" style={{ paddingLeft: 24 }}>
            Deckkraft
            <input type="range" min={0.05} max={1} step={0.05} value={ovAlpha} onChange={(e) => setOvAlpha(+e.target.value)} />
            <span>{Math.round(ovAlpha * 100)} %</span>
          </div>
          <div className="row">
            <label>
              <input type="checkbox" checked={outroOn} onChange={(e) => setOutroOn(e.target.checked)} /> Outro-Icons (letzte 2,5–4 s)
            </label>
          </div>
          <div className="row">
            Trim
            <button
              className="mini"
              onClick={() =>
                setTrim((tr) => {
                  const s = vidRef.current?.currentTime ?? 0;
                  return { start: s, end: tr.end != null && tr.end <= s ? null : tr.end };
                })
              }
            >
              [ Start
            </button>
            <button
              className="mini"
              onClick={() =>
                setTrim((tr) => {
                  const e = vidRef.current?.currentTime ?? 0;
                  return { start: tr.start != null && tr.start >= e ? null : tr.start, end: e };
                })
              }
            >
              Ende ]
            </button>
            <button className="mini" onClick={() => setTrim({ start: null, end: null })}>
              <Icon name="x" size={11} />
            </button>
            <span style={{ opacity: 0.7 }}>
              {trim.start == null && trim.end == null
                ? "–"
                : `${trim.start != null ? trim.start.toFixed(1) + "s" : "0s"} → ${trim.end != null ? trim.end.toFixed(1) + "s" : "Ende"}`}
            </span>
          </div>
          <div className="row">
            Name <span style={{ opacity: 0.6 }}>{String(state.next_number).padStart(3, "0")}-{state.name_prefix}</span>
            <input
              type="text"
              placeholder="z.B. sunset-carving"
              spellCheck={false}
              value={outName}
              onChange={(e) => setOutName(e.target.value)}
            />
          </div>
          <button
            className="renderbtn"
            disabled={!ready || rendering}
            title={ready ? "" : "Erst Name eintragen und für YouTube und Instagram je einen Track wählen"}
            onClick={() => void doRender()}
          >
            {rendering ? "Rendere …" : "Rendern → shorts-mit-musik/"}
          </button>
          <button
            className="btn"
            style={{ width: "100%", marginTop: 6 }}
            title="Gerenderte Dateien des letzten Renders löschen und das Quellvideo zurückholen (Original bleibt erhalten)"
            onClick={async () => {
              if (!window.confirm("Letzten Render zurückholen?\nDie 3 gerenderten Dateien werden gelöscht, das Quellvideo kommt zurück in die Auswahl.")) return;
              const d = await api.post<AppState & { restored?: string; error?: string }>("/api/redo_last", {});
              if (d.error) {
                setLog(d.error);
                return;
              }
              setState(d);
              if (d.restored) pickVideo(d.restored);
            }}
          >
            ↩ Letzten Render zurückholen
          </button>
          {prog && (
            <div className="prog" style={{ display: "block" }}>
              <div className="track">
                <div className="fill" style={{ width: `${prog.pct.toFixed(0)}%` }} />
              </div>
              <div className="txt">
                {{ youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" }[prog.label] ?? prog.label} {prog.pct.toFixed(0)} %
              </div>
            </div>
          )}
          {log && <div className="log">{log}</div>}
        </div>
        <div className="searchrow">
          <input
            type="search"
            placeholder="Musik durchsuchen …"
            spellCheck={false}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            <input type="checkbox" checked={fltYT} onChange={(e) => setFltYT(e.target.checked)} /> YT
          </label>
          <label>
            <input type="checkbox" checked={fltIG} onChange={(e) => setFltIG(e.target.checked)} /> IG
          </label>
        </div>
        <div className="scroll">
          {selTracks.length > 0 && <div className="seltracks">{selTracks.map(trackRow)}</div>}
          {listTracks.map(trackRow)}
        </div>
        <audio ref={musicRef} loop />
      </div>
    </div>
  );
}
