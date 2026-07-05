import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getToken } from "../lib/api";
import { useT } from "../i18n";
import { CloseIcon, ShareIcon, CameraIcon } from "./Icons";

// Konfig-Dialog vor dem Teilen einer Session-Card: Track-Farbmodus, Stats-Auswahl,
// optionales Hintergrund-Foto (Galerie/Kamera), Live-Vorschau. Die Card kommt server-
// generiert (bg=navy direkt; bg=transparent -> hier ueber das Foto komponiert).

const STAT_ORDER = ["foiling", "runs", "pumps", "speed", "time", "longest", "distance", "pumprate"] as const;
const STAT_LABEL: Record<string, string> = {
  foiling: "Foiling", runs: "Läufe", pumps: "Pumps", speed: "Top-Speed",
  time: "Foil-Zeit", longest: "Längster", distance: "Strecke", pumprate: "Ø Pumps/min",
};

function availableStats(a: any): string[] {
  if (!a) return [];
  const ppm = (a.foiling_time_s > 0 && a.pump_count > 0);
  const ok: Record<string, boolean> = {
    foiling: a.foiling_distance_m > 0, runs: a.num_runs > 0, pumps: a.pump_count > 0,
    speed: a.max_speed_mps > 0, time: a.foiling_time_s > 0, longest: a.best_distance_m > 0,
    distance: a.total_distance_m > 0, pumprate: ppm,
  };
  return STAT_ORDER.filter((k) => ok[k]);
}

function imgFrom(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
}

export function ShareDialog({ sessionId, analysis, onClose }: {
  sessionId: number; analysis: any; onClose: () => void;
}) {
  const t = useT();
  const avail = availableStats(analysis);
  const hasHr = !!((analysis?.track_geojson?.properties?.hr || []).some((v: number | null) => v != null));
  const [color, setColor] = useState<"cyan" | "speed" | "hr">("cyan");
  const [sel, setSel] = useState<Set<string>>(new Set(avail));
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<Blob | null>(null);

  async function buildBlob(): Promise<Blob> {
    const tok = getToken();
    const usePhoto = !!photoUrl;
    const chosen = STAT_ORDER.filter((k) => sel.has(k));
    const q = new URLSearchParams({ color, bg: usePhoto ? "transparent" : "navy" });
    if (chosen.length) q.set("stats", chosen.join(","));
    const res = await fetch(`/api/sessions/${sessionId}/share.png?${q}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!res.ok) throw new Error("share");
    const card = await res.blob();
    if (!usePhoto) return card;
    // Foto (cover) + dunkler Scrim + Card komponieren
    const [cardImg, photo] = await Promise.all([imgFrom(URL.createObjectURL(card)), imgFrom(photoUrl!)]);
    const N = 1080;
    const cv = document.createElement("canvas"); cv.width = cv.height = N;
    const ctx = cv.getContext("2d")!;
    const s = Math.max(N / photo.width, N / photo.height);
    const w = photo.width * s, h = photo.height * s;
    ctx.drawImage(photo, (N - w) / 2, (N - h) / 2, w, h);
    ctx.fillStyle = "rgba(2,6,23,0.55)"; ctx.fillRect(0, 0, N, N);
    ctx.drawImage(cardImg, 0, 0, N, N);
    return await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), "image/png"));
  }

  // Vorschau bei jeder Aenderung neu bauen (leicht entprellt).
  useEffect(() => {
    let alive = true; const id = setTimeout(async () => {
      try {
        const blob = await buildBlob();
        if (!alive) return;
        blobRef.current = blob;
        setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
      } catch { /* ignore */ }
    }, 180);
    return () => { alive = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, photoUrl, [...sel].sort().join(",")]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, []); // eslint-disable-line

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(f));
  }

  async function doShare() {
    setBusy(true);
    try {
      const blob = blobRef.current || await buildBlob();
      const file = new File([blob], `pumpfoil-${sessionId}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "pumpfoil.org" } as ShareData);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* abgebrochen */ }
    finally { setBusy(false); }
  }

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const seg = "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium";

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">{t("sd.share")}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
        </div>

        {/* Vorschau */}
        <div className="mb-3 overflow-hidden rounded-xl bg-slate-950">
          {preview
            ? <img src={preview} alt="" className="mx-auto block aspect-square w-full object-contain" />
            : <div className="flex aspect-square items-center justify-center text-sm text-slate-500">…</div>}
        </div>

        {/* Track-Farbe */}
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("share.trackColor")}</div>
        <div className="mb-3 flex gap-2">
          {((hasHr ? ["cyan", "speed", "hr"] : ["cyan", "speed"]) as ("cyan" | "speed" | "hr")[]).map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className={`${seg} ${color === c ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
              {t(`share.color.${c}`)}
            </button>
          ))}
        </div>

        {/* Foto-Hintergrund */}
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("share.background")}</div>
        <div className="mb-3 flex gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
            <CameraIcon className="h-4 w-4" /> {photoUrl ? t("share.changePhoto") : t("share.addPhoto")}
          </button>
          {photoUrl && (
            <button onClick={() => { URL.revokeObjectURL(photoUrl); setPhotoUrl(null); }}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">{t("share.noPhoto")}</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        </div>

        {/* Stats */}
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("share.stats")}</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {avail.map((k) => (
            <button key={k} onClick={() => toggle(k)}
              className={`rounded-lg px-2.5 py-1 text-sm ${sel.has(k) ? "bg-brand-500/20 text-brand-300" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
              {STAT_LABEL[k]}
            </button>
          ))}
        </div>

        <button onClick={doShare} disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          <ShareIcon className="h-5 w-5" /> {busy ? "…" : t("sd.share")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
