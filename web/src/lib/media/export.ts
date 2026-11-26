// Media-Ansicht (docs/MEDIA.md): Overlay-Video im Browser erzeugen.
//
// Bild fuer Bild mit festem Takt (t = frame/fps) zeichnen und mit WebCodecs kodieren; Muxer ist mediabunny
// (MPL-2.0), das erst hier nachgeladen wird. Der Server ist nicht beteiligt — die Datei entsteht im Browser
// und wird direkt heruntergeladen (docs/MEDIA.md, „Alles im Browser").

import type { Clip } from "./clip";
import { type EventOverlay, type MediaCfg, type Texte, masse, videoDauer, zeichne } from "./zeichnen";
import type { Mehrfach } from "./mehrfach";

export const MAX_SEKUNDEN = 180;

export interface Ergebnis { blob: Blob; endung: "mp4" | "webm"; durchsichtig: boolean }

export function webCodecsDa(): boolean {
  return typeof (globalThis as any).VideoEncoder === "function";
}

/** Kann dieser Browser durchsichtiges WebM erzeugen? mediabunny kodiert den Alphakanal als eigenen VP9-Strom
 *  (Seitendaten im WebM, `alpha_mode=1`) — es reicht also ein VP9-Encoder; ein Encoder mit `alpha: "keep"` ist
 *  NICHT noetig. Gemessen 24.11.2026 in Chromium: `isConfigSupported({alpha:"keep"})` sagt nein, die Datei hat
 *  trotzdem echtes Alpha 0..255. */
export async function alphaMoeglich(w: number, h: number): Promise<boolean> {
  if (!webCodecsDa()) return false;
  try {
    const VE = (globalThis as any).VideoEncoder;
    const r = await VE.isConfigSupported({ codec: "vp09.00.10.08", width: w, height: h });
    return !!r?.supported;
  } catch { return false; }
}

/** `ton`: fertig gerenderte Musik (Teil B) — kommt als Tonspur dazu (WebM: Opus, MP4: AAC, ersatzweise Opus). */
export async function erzeugeVideo(clip: Clip, cfg: MediaCfg, tx: Texte,
  fortschritt: (anteil: number) => void, abbruch: AbortSignal, ton?: AudioBuffer | null, mehr: Mehrfach | null = null, ev: EventOverlay | null = null): Promise<Ergebnis> {
  const mb = await import("mediabunny");
  const { w, h } = masse(cfg);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: true })!;

  const durchsichtig = cfg.hintergrund === "alpha";
  let endung: "mp4" | "webm" = "mp4";
  let codec: "avc" | "vp9" = "avc";
  if (durchsichtig) { endung = "webm"; codec = "vp9"; }
  else if (!(await mb.canEncodeVideo("avc", { width: w, height: h }))) { endung = "webm"; codec = "vp9"; }   // z. B. Firefox ohne H.264-Encoder

  const output = new mb.Output({
    format: endung === "mp4" ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const quelle = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH, alpha: durchsichtig ? "keep" : "discard" });
  output.addVideoTrack(quelle, { frameRate: cfg.fps });
  let tonQuelle: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (ton) {
    const aac = endung === "mp4" && await mb.canEncodeAudio("aac", { numberOfChannels: ton.numberOfChannels, sampleRate: ton.sampleRate });
    tonQuelle = new mb.AudioBufferSource({ codec: aac ? "aac" : "opus", quality: mb.QUALITY_HIGH });
    output.addAudioTrack(tonQuelle);
  }
  await output.start();
  if (tonQuelle && ton) { await tonQuelle.add(ton); tonQuelle.close(); }

  const dauer = videoDauer(clip, cfg, ev);
  const n = Math.max(1, Math.round(dauer * cfg.fps));
  try {
    for (let f = 0; f < n; f++) {
      if (abbruch.aborted) throw new DOMException("abgebrochen", "AbortError");
      zeichne(ctx, clip, cfg, f / cfg.fps, tx, cfg.hintergrund, mehr, ev);
      await quelle.add(f / cfg.fps, 1 / cfg.fps);
      if (f % 5 === 0) fortschritt(f / n);
    }
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch { /* schon zu */ }
    throw e;
  }
  fortschritt(1);
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  return { blob: new Blob([buf], { type: endung === "mp4" ? "video/mp4" : "video/webm" }), endung, durchsichtig };
}
