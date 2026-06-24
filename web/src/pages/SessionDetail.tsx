import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import L from "leaflet";
import { api, SessionSummary, SessionSocial as SocialData } from "../lib/api";
import { Card, Stat, Spinner, ErrorBox, Avatar } from "../components/ui";
import { ChevronIcon, HeartIcon, CameraIcon, VideoIcon, PlayIcon, FlagIcon, FakeIcon, LocationIcon, EditIcon, StarIcon, CloseIcon, KeyboardIcon, WifiOffIcon, EyeIcon, EyeOffIcon } from "../components/Icons";
import { Lightbox } from "../components/Lightbox";
import { FoilSelect } from "../components/FoilSelect";
import { FoilPower } from "../components/FoilPower";
import { Chat } from "../components/Chat";
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

// Speed-Farbskala (km/h) blau(langsam) -> rot(schnell). Grenzen pro User einstellbar.
function rampColor(t: number): string {
  const c = Math.min(Math.max(t, 0), 1);
  return `hsl(${(1 - c) * 240}, 85%, 55%)`;
}
function speedColor(kmh: number, lo: number, hi: number): string {
  if (kmh < lo || kmh > hi) return "#000000"; // außerhalb der Skala -> schwarz
  return rampColor((kmh - lo) / Math.max(hi - lo, 1));
}

type ColorMode = "speed" | "hr" | "pump";

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

  // Hotkeys: Ziffern 1–9 wählen den entsprechenden Lauf, 0 zeigt alle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const n = session?.analysis?.segments?.length ?? 0;
        if (idx < n) setSelectedRun(idx);
      } else if (e.key === "0") {
        setSelectedRun(null);
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
    lg.clearLayers();
    const gj = session.analysis.track_geojson;
    const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
    const hr: (number | null)[] = gj.properties?.hr ?? [];
    const phz: (number | null)[] = gj.properties?.pump_hz ?? [];

    // Nur die Foiling-Läufe zeichnen — Nicht-Foiling wird komplett ausgeblendet.
    const MAX_DRAW_GAP_M = 30;
    const segs = session.analysis.segments ?? [];
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
  }, [session, colorMode, selectedRun, hrRange, pumpRange, speedMin, speedMax, win, showPumps, fullscreen]);

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
  const maxPump = argBest((s) => s.max_pump_hz, (x, y) => x > y);
  const minPump = argBest((s) => s.min_pump_hz, (x, y) => x < y);
  const hasPumpStats = m?.avg_pump_hz != null && (a?.pump_count ?? 0) > 0;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/sessions" className="inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
          <ChevronIcon className="h-4 w-4 rotate-180" /> {t("sessions.title")}
        </Link>
        <div className="flex items-center gap-2">
          <button
            disabled={neighbors.older == null}
            onClick={() => neighbors.older != null && nav(`/sessions/${neighbors.older}`)}
            className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 enabled:hover:bg-slate-700 disabled:opacity-40"
            title={t("sd.olderTitle")}
          >
            {t("sd.older")}
          </button>
          <button
            disabled={neighbors.newer == null}
            onClick={() => neighbors.newer != null && nav(`/sessions/${neighbors.newer}`)}
            className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 enabled:hover:bg-slate-700 disabled:opacity-40"
            title={t("sd.newerTitle")}
          >
            {t("sd.newer")}
          </button>
        </div>
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
      <p className="mb-5 text-sm text-slate-300">
        {new Date(session.started_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        {session.ended_at && (
          <>
            {` ${t("sessions.timeTo")} `}
            {new Date(session.ended_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            <span className="text-slate-400"> · {t("sd.duration")} {fmtSpan(session.started_at, session.ended_at)}</span>
          </>
        )}
        {session.place_name && <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs"><LocationIcon className="h-3.5 w-3.5" /> {session.place_name}</span>}
        {session.sport && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs">{session.sport}</span>}
        <FoilSelect session={session} owned={owned} onMeta={setSession} />
        {!owned && <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-300">{t("sd.communityView")}</span>}
      </p>
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
        <div className="mb-4 rounded-xl border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {t("sd.gpsWarning")}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
        <Stat label={t("stat.foiling")} value={fmtKm(a?.foiling_distance_m)} sub="km" />
        <Stat label={t("stat.foilingTime")} value={fmtMMSS(a?.foiling_time_s)} sub="min:s" />
        <Stat label={t("stat.runs")} value={String(segs.length)} />
        <Stat label={t("sd.avgSpeed")} value={kmh(m?.avg_speed_mps)} sub="km/h" />

        <ClickStat label={t("sd.maxSpeed", { win })} value={maxSp.v != null ? (maxSp.v * 3.6).toFixed(1) : "–"} sub="km/h"
          runIdx={maxSp.i} selected={selectedRun} onSelect={setSelectedRun} />
        <ClickStat label={t("sd.minSpeed", { win })} value={minSp.v != null ? (minSp.v * 3.6).toFixed(1) : "–"} sub="km/h"
          runIdx={minSp.i} selected={selectedRun} onSelect={setSelectedRun} />
        <ClickStat label={t("sd.maxGlide")} value={maxGl.v != null ? maxGl.v.toFixed(1) : "–"} sub="s"
          runIdx={maxGl.i} selected={selectedRun} onSelect={setSelectedRun} />
        <Stat label={t("stat.pumps")} value={a?.pump_count != null ? String(a.pump_count) : "–"}
          sub={hasPumpStats ? `Ø ${m!.avg_pump_hz!.toFixed(2)} Hz` : t("sd.phase2")} />
        {hasPumpStats && (
          <>
            <ClickStat label={t("sd.maxPump")} value={maxPump.v != null ? maxPump.v.toFixed(2) : "–"} sub="Hz"
              runIdx={maxPump.i} selected={selectedRun} onSelect={setSelectedRun} />
            <ClickStat label={t("sd.minPump")} value={minPump.v != null ? minPump.v.toFixed(2) : "–"} sub="Hz"
              runIdx={minPump.i} selected={selectedRun} onSelect={setSelectedRun} />
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

      {session.foil?.span_cm && session.foil?.area_cm2 && session.foil?.thickness_mm && (
        <div className="mt-4">
          <FoilPower
            foil={{
              brand: session.foil.brand, model: session.foil.model, size: session.foil.size,
              span_cm: session.foil.span_cm, area_cm2: session.foil.area_cm2, thickness_mm: session.foil.thickness_mm,
            }}
            avgKmh={m?.avg_speed_mps != null ? m.avg_speed_mps * 3.6 : null}
            maxKmh={(m?.max_speed_5s_mps ?? a?.max_speed_mps) != null ? (m?.max_speed_5s_mps ?? a?.max_speed_mps)! * 3.6 : null}
            pumpHz={m?.avg_pump_hz ?? null}
            estimated={session.foil.thickness_estimated}
          />
        </div>
      )}

      <div className={fullscreen ? "fixed inset-0 z-[2000] flex flex-col bg-slate-950" : "mt-5"}>
        <div className={`flex flex-wrap items-center gap-2 ${fullscreen ? "shrink-0 p-2" : ""}`}>
          <span className="text-xs text-slate-400">{t("sd.coloring")}</span>
          <ModeButton active={colorMode === "speed"} onClick={() => setColorMode("speed")}>{t("sd.colorSpeed")}</ModeButton>
          <ModeButton active={colorMode === "hr"} onClick={() => setColorMode("hr")}>{t("sd.colorPulse")}</ModeButton>
          {hasPump && (
            <ModeButton active={colorMode === "pump"} onClick={() => setColorMode("pump")}>{t("sd.colorPumpHz")}</ModeButton>
          )}
          {colorMode === "speed" && (
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

        <div className={`flex flex-wrap items-center justify-between gap-4 px-1 ${fullscreen ? "shrink-0 bg-slate-950 p-2" : ""}`}>
          <div className="flex flex-wrap items-center gap-4">
            <Legend mode={colorMode} hrRange={hrRange} speedRange={[speedMin, speedMax]} pumpRange={pumpRange} />
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

      <RunsTable segments={a?.segments ?? []} selected={selectedRun} onSelect={setSelectedRun} win={win} />

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">{t("sd.discussion")}</h3>
        <Card className="p-4"><Chat scope={`session:${session.id}`} /></Card>
      </div>

      {owned && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={() => {
              if (!confirm(t("sd.deleteConfirm"))) return;
              api.deleteSession(session.id).then(() => nav("/sessions")).catch((e) => alert(t("sd.deleteFail") + e));
            }}
            className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/60"
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
        <span className="text-base font-bold tabular-nums text-slate-100 sm:text-lg">{value}</span>
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

function Legend({ mode, hrRange, speedRange, pumpRange }: { mode: ColorMode; hrRange: [number, number]; speedRange: [number, number]; pumpRange: [number, number] }) {
  const [lo, hi] = mode === "speed" ? speedRange : mode === "pump" ? pumpRange : hrRange;
  const unit = mode === "speed" ? "km/h" : mode === "pump" ? "Hz" : "bpm";
  const ticksT = [0, 0.25, 0.5, 0.75, 1];
  const stops = ticksT.map((t) => rampColor(t)).join(", ");
  const ticks = ticksT.map((t) =>
    mode === "pump" ? (lo + t * (hi - lo)).toFixed(1) : Math.round(lo + t * (hi - lo))
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
}: {
  segments: any[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  win: "1" | "3" | "5";
}) {
  const t = useT();
  if (!segments.length) return null;
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
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("sd.colDistance")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colDuration")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colAvg", { win })}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colMax", { win })}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colMin", { win })}</th>
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
                  <td className="px-3 py-2 tabular-nums">
                    {i + 1}{best && <span className="ml-1 inline-flex align-middle text-brand-400" title={t("sd.farthestRunTitle")}><StarIcon className="h-3.5 w-3.5" filled /></span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{Math.round(s.distance_m)} m</td>
                  <td className="px-3 py-2 tabular-nums">{fmtMMSS(s.duration_s)}</td>
                  <td className="px-3 py-2 tabular-nums">{val(s, "avg")}</td>
                  <td className="px-3 py-2 tabular-nums">{val(s, "max")}</td>
                  <td className="px-3 py-2 tabular-nums">{val(s, "min")}</td>
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
