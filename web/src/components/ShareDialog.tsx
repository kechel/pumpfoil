import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, getToken } from "../lib/api";
import { useT } from "../i18n";
import { CloseIcon, ShareIcon, CameraIcon } from "./Icons";

// Konfig-Dialog vor dem Teilen einer Session-Card. Track-Farbmodus, Stats-Auswahl
// (leere Stats erscheinen nicht), optionales Hintergrund-Foto mit Pinch-Zoom/Verschieben.
// Farbe + Stats werden im Nutzerprofil (settings.share) als Default gespeichert.
// Card kommt server-generiert; das Foto wird lokal per Canvas darunter komponiert.

const N = 1080;
const STAT_ORDER = ["foiling", "runs", "pumps", "speed", "time", "longest", "distance", "pumprate"] as const;
const STAT_LABEL: Record<string, string> = {
  foiling: "Foiling", runs: "Läufe", pumps: "Pumps", speed: "Top-Speed",
  time: "Foil-Zeit", longest: "Längster", distance: "Strecke", pumprate: "Ø Pumps/min",
};

function availableStats(a: any): string[] {
  if (!a) return [];
  const ok: Record<string, boolean> = {
    foiling: a.foiling_distance_m > 0, runs: a.num_runs > 0, pumps: a.pump_count > 0,
    speed: a.max_speed_mps > 0, time: a.foiling_time_s > 0, longest: a.best_distance_m > 0,
    distance: a.total_distance_m > 0, pumprate: a.foiling_time_s > 0 && a.pump_count > 0,
  };
  return STAT_ORDER.filter((k) => ok[k]);
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

export function ShareDialog({ sessionId, analysis, defaultPhoto, onClose }: {
  sessionId: number; analysis: any; defaultPhoto?: string | null; onClose: () => void;
}) {
  const t = useT();
  const avail = availableStats(analysis);
  const hasHr = !!((analysis?.track_geojson?.properties?.hr || []).some((v: number | null) => v != null));
  const [color, setColor] = useState<"cyan" | "speed" | "hr">("cyan");
  const [sel, setSel] = useState<Set<string>>(new Set(avail));
  const [hasPhoto, setHasPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);   // Vorschau wird (neu) berechnet

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLImageElement | null>(null);      // server-Card (navy o. transparent)
  const photoRef = useRef<HTMLImageElement | null>(null);
  const xf = useRef({ x: 0, y: 0, w: N, h: N });              // Foto-Rechteck in 1080-Einheiten
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);

  // Defaults aus dem Profil laden
  useEffect(() => {
    api.getSettings().then((s) => {
      const sh = (s as any)?.share || {};
      if (sh.color === "cyan" || sh.color === "speed" || (sh.color === "hr" && hasHr)) setColor(sh.color);
      if (Array.isArray(sh.stats)) {
        const keep = sh.stats.filter((k: string) => avail.includes(k));
        if (keep.length) setSel(new Set(keep));
      }
    }).catch(() => {}).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session-Foto (falls vorhanden) automatisch als Hintergrund vorbelegen.
  useEffect(() => {
    if (!defaultPhoto) return;
    loadImg(defaultPhoto).then((img) => {
      photoRef.current = img;
      const s = Math.max(N / img.width, N / img.height);
      xf.current = { x: (N - img.width * s) / 2, y: (N - img.height * s) / 2, w: img.width * s, h: img.height * s };
      setHasPhoto(true);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defaults speichern (entprellt), sobald geladen
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      api.saveSettings({ share: { color, stats: STAT_ORDER.filter((k) => sel.has(k)) } }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, [...sel].sort().join(","), loaded]);

  function draw() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!; ctx.clearRect(0, 0, N, N);
    if (hasPhoto && photoRef.current) {
      const r = xf.current; ctx.drawImage(photoRef.current, r.x, r.y, r.w, r.h);
      ctx.fillStyle = "rgba(2,6,23,0.55)"; ctx.fillRect(0, 0, N, N);
    }
    if (cardRef.current) ctx.drawImage(cardRef.current, 0, 0, N, N);
  }

  // Card (server) neu holen bei Farbe/Stats/Foto-An-Aus -> solange Vorschau veraltet: Ladeindikator
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const tok = getToken();
        const chosen = STAT_ORDER.filter((k) => sel.has(k));
        const q = new URLSearchParams({ color, bg: hasPhoto ? "transparent" : "navy" });
        if (chosen.length) q.set("stats", chosen.join(","));
        const res = await fetch(`/api/sessions/${sessionId}/share.png?${q}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!res.ok || !alive) return;
        const img = await loadImg(URL.createObjectURL(await res.blob()));
        if (!alive) return;
        cardRef.current = img; draw();
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    }, 160);
    return () => { alive = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, [...sel].sort().join(","), hasPhoto]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const img = await loadImg(URL.createObjectURL(f));
    photoRef.current = img;
    // Cover-Fit als Start
    const s = Math.max(N / img.width, N / img.height);
    xf.current = { x: (N - img.width * s) / 2, y: (N - img.height * s) / 2, w: img.width * s, h: img.height * s };
    setHasPhoto(true); requestAnimationFrame(draw);
  }

  // --- Gesten (nur mit Foto): 1 Finger schieben, 2 Finger zoomen ---
  function toCanvas(e: React.PointerEvent) {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); const k = N / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  function onDown(e: React.PointerEvent) {
    if (!hasPhoto) return;
    canvasRef.current!.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, toCanvas(e));
  }
  function onMove(e: React.PointerEvent) {
    if (!hasPhoto || !ptrs.current.has(e.pointerId)) return;
    const prev = ptrs.current.get(e.pointerId)!; const cur = toCanvas(e); const r = xf.current;
    if (ptrs.current.size >= 2) {
      const o = [...ptrs.current.entries()].find(([k]) => k !== e.pointerId)![1];
      const pMid = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 }, cMid = { x: (cur.x + o.x) / 2, y: (cur.y + o.y) / 2 };
      const pD = Math.hypot(prev.x - o.x, prev.y - o.y), cD = Math.hypot(cur.x - o.x, cur.y - o.y);
      const f = pD > 0 ? cD / pD : 1;
      r.x += cMid.x - pMid.x; r.y += cMid.y - pMid.y;
      r.x = cMid.x + (r.x - cMid.x) * f; r.y = cMid.y + (r.y - cMid.y) * f; r.w *= f; r.h *= f;
    } else {
      r.x += cur.x - prev.x; r.y += cur.y - prev.y;
    }
    ptrs.current.set(e.pointerId, cur); draw();
  }
  function onUp(e: React.PointerEvent) { ptrs.current.delete(e.pointerId); }
  function onWheel(e: React.WheelEvent) {
    if (!hasPhoto) return;
    const cv = canvasRef.current!; const rect = cv.getBoundingClientRect(); const k = N / rect.width;
    const mx = (e.clientX - rect.left) * k, my = (e.clientY - rect.top) * k; const r = xf.current;
    const f = e.deltaY < 0 ? 1.06 : 0.94;
    r.x = mx + (r.x - mx) * f; r.y = my + (r.y - my) * f; r.w *= f; r.h *= f; draw();
  }

  async function doShare() {
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png"));
      const file = new File([blob], `pumpfoil-${sessionId}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "pumpfoil.org" } as ShareData);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url);
      }
    } catch { /* abgebrochen */ }
    finally { setBusy(false); }
  }

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const seg = "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium";

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">{t("sd.share")}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
        </div>

        <div className="relative mb-1">
          <canvas
            ref={canvasRef} width={N} height={N}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
            className={`block aspect-square w-full touch-none rounded-xl bg-slate-950 ${hasPhoto ? "cursor-move" : ""}`}
          />
          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/50">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-brand-400" />
            </div>
          )}
        </div>
        {hasPhoto && <div className="mb-3 text-center text-[11px] text-slate-500">{t("share.photoHint")}</div>}

        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("share.trackColor")}</div>
        <div className="mb-3 flex gap-2">
          {((hasHr ? ["cyan", "speed", "hr"] : ["cyan", "speed"]) as ("cyan" | "speed" | "hr")[]).map((c) => (
            <button key={c} onClick={() => setColor(c)} className={`${seg} ${color === c ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
              {t(`share.color.${c}`)}
            </button>
          ))}
        </div>

        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("share.background")}</div>
        <div className="mb-3 flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
            <CameraIcon className="h-4 w-4" /> {hasPhoto ? t("share.changePhoto") : t("share.addPhoto")}
          </button>
          {hasPhoto && (
            <button onClick={() => { photoRef.current = null; setHasPhoto(false); }} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">{t("share.noPhoto")}</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        </div>

        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("share.stats")}</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {avail.map((k) => (
            <button key={k} onClick={() => toggle(k)} className={`rounded-lg px-2.5 py-1 text-sm ${sel.has(k) ? "bg-brand-500/20 text-brand-300" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
              {STAT_LABEL[k]}
            </button>
          ))}
        </div>

        <button onClick={doShare} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          <ShareIcon className="h-5 w-5" /> {busy ? "…" : t("sd.share")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
