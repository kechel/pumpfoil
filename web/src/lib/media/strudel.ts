// Media-Ansicht, Teil B (docs/MEDIA.md): Strudel laden, live vorspielen und offline rendern.
//
// Strudel (AGPL-3.0 wie unser Repo) ist ein Live-Coding-Werkzeug und wertet den Musik-Code zur Laufzeit als
// JavaScript aus — das braucht 'unsafe-eval', und das bekommt die App NICHT (CSP script-src 'self'). Strudel laeuft
// deshalb auf einer eigenen Seite `/strudel-host.html` (web/public, Server-CSP `_csp_strudel`) in einem iframe mit
// sandbox="allow-scripts": undurchsichtige Herkunft, kein Zugriff auf die App, ihre Cookies oder den Login. Gesprochen
// wird per postMessage.
//
// Das Buendel `@strudel/web/dist/index.mjs` kopiert Vite per `?url` unveraendert als eigene Datei (nicht im Precache);
// der Wirt laedt sie als Modul (Server liefert sie mit CORS aus).
//
// * Live-Vorschau: ein dauerhafter Wirt.
// * Ton fuer den Export: je Export ein FRISCHER Wirt — Strudels renderPatternAudio schliesst den Audiokontext und
//   poolt Audio-Knoten ohne Kontext-Trennung (gemessen 24.11.2026: zweites Rendern in derselben Instanz ->
//   „different audio context"). Danach wird er entfernt.

import strudelUrl from "@strudel/web/dist/index.mjs?url";

interface Wirt { f: HTMLIFrameElement; bereit: Promise<void>; senden: (m: any) => void; weg: () => void }

let zaehler = 0;
let freigabeFertig: (() => void) | null = null;
const offen = new Map<number, { ok: (d: any) => void; fehler: (e: Error) => void }>();

function neuerWirt(): Wirt {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts");
  f.setAttribute("allow", "autoplay");
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  let bereitOk: () => void, bereitFehler: (e: Error) => void;
  const bereit = new Promise<void>((a, b) => { bereitOk = a; bereitFehler = b; });
  const hoer = (e: MessageEvent) => {
    if (e.source !== f.contentWindow) return;
    const d = e.data ?? {};
    if (d.typ === "geladen") f.contentWindow?.postMessage({ typ: "init", url: new URL(strudelUrl, location.href).href }, "*");
    else if (d.typ === "bereit") bereitOk();
    else if (d.typ === "fehler") bereitFehler(new Error(d.fehler));
    else if (d.typ === "freigegeben") { freigabeFertig?.(); freigabeFertig = null; }
    else if ((d.typ === "antwort" || d.typ === "wav") && offen.has(d.id)) {
      const o = offen.get(d.id)!; offen.delete(d.id);
      if (d.fehler) o.fehler(new Error(d.fehler)); else o.ok(d);
    }
  };
  window.addEventListener("message", hoer);
  f.src = "/strudel-host.html";
  document.body.appendChild(f);
  return {
    f, bereit,
    // Ziel "*": die Herkunft des Wirts ist absichtlich undurchsichtig. Der Code ist nicht geheim.
    senden: (m) => f.contentWindow?.postMessage(m, "*"),
    weg: () => { window.removeEventListener("message", hoer); f.remove(); },
  };
}

function frage(w: Wirt, m: any): Promise<any> {
  const id = ++zaehler;
  return new Promise((ok, fehler) => { offen.set(id, { ok, fehler }); w.senden({ ...m, id }); });
}

let live: Wirt | null = null;
function liveWirt(): Wirt {
  if (!live) {
    live = neuerWirt();
    live.bereit.catch(() => { live?.weg(); live = null; });
  }
  return live;
}

/** Vorladen (z. B. beim Einschalten der Musik), damit der erste Klick auf Abspielen sofort klingt. */
export function vorladen(): void { liveWirt(); }

// --- Vorschau ---------------------------------------------------------------------------------------------------
// Zwei Wege. LIVE: Strudel spielt im Wirt, Aenderungen sofort hoerbar (Chrome). PUFFER: Safari gibt den Ton im
// abgeschotteten iframe nur nach einem Klick IN diesem iframe frei (gemessen 24.11.2026 mit WebKit) — dann rendert
// ein frischer Wirt die Musik offline und die SEITE spielt das Ergebnis ab; ihr AudioContext wird im Klick auf
// „Abspielen" entsperrt (`entsperren`). Nach einer Aenderung am Mischpult wird neu gerendert.
let modus: "live" | "puffer" | null = null;
let ctx: AudioContext | null = null;
let quelle: AudioBufferSourceNode | null = null;
let puffer: { code: string; buf: AudioBuffer } | null = null;
let auftrag = 0;

/** MUSS synchron im Klick-Handler laufen (vor dem ersten await) — sonst bleibt der Ton in Safari gesperrt. */
export function entsperren(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  } catch { /* ohne Web Audio gibt es eben keine Vorschau-Musik */ }
}

function pufferStopp() {
  try { quelle?.stop(); } catch { /* schon zu */ }
  quelle = null;
}

/** Code ab Video-Sekunde `ab()` spielen (Funktion: nach einem Rendern zaehlt die DANN aktuelle Stelle).
 *  Gibt einen Fehlertext zurueck oder null. */
export async function spiele(code: string, ab: () => number, dauer: number, nurPuffer = false): Promise<string | null> {
  const nr = ++auftrag;
  if (nurPuffer) modus = "puffer";
  try {
    if (modus !== "puffer") {
      const w = liveWirt();
      await w.bereit;
      const d = await frage(w, { typ: "spiele", code, ab: ab() });
      if (d.zustand === "running") { modus = "live"; return null; }
      return "FREIGABE";   // Ton im iframe gesperrt (Safari) -> Seite zeigt den Knopf im iframe (zeigeFreigabe)
    }
    if (!ctx) entsperren();
    if (!ctx) return "Web Audio fehlt";
    if (!puffer || puffer.code !== code) {
      const wav = await rendere(code, dauer);
      const buf = await ctx.decodeAudioData(await wav.arrayBuffer());
      if (nr !== auftrag) return null;   // inzwischen neuer Auftrag
      puffer = { code, buf };
    }
    if (nr !== auftrag) return null;
    pufferStopp();
    const q = ctx.createBufferSource();
    q.buffer = puffer.buf;
    q.connect(ctx.destination);
    q.start(0, Math.min(Math.max(ab(), 0), puffer.buf.duration));
    quelle = q;
    return null;
  } catch (e: any) { return String(e?.message ?? e); }
}

/** Safari: den Live-Wirt kurz sichtbar ueber `ziel` legen — mit einem Knopf IM iframe. Loest sich, sobald jemand
 *  darauf geklickt hat (Ton dann fuer die Sitzung frei). */
export function zeigeFreigabe(ziel: HTMLElement, text: string): Promise<void> {
  const w = liveWirt();
  const r = ziel.getBoundingClientRect();
  const alt = w.f.style.cssText;
  w.f.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${Math.max(r.width, 200)}px;` +
    `height:${Math.max(r.height, 40)}px;border:0;z-index:2147483647;visibility:visible;border-radius:10px`;
  w.f.tabIndex = 0;
  w.senden({ typ: "knopf", text });
  return new Promise((ok) => {
    freigabeFertig = () => { w.f.style.cssText = alt; w.f.tabIndex = -1; ok(); };
  });
}

export async function stoppe(): Promise<void> {
  auftrag++;
  live?.senden({ typ: "stoppe" });
  pufferStopp();
}

/** Offline rendern in einem frischen Wirt — liefert die WAV-Datei des ganzen Videos. */
export async function rendere(code: string, sekunden: number, abbruch?: AbortSignal): Promise<Blob> {
  const w = neuerWirt();
  const ab = () => w.weg();
  abbruch?.addEventListener("abort", ab);
  try {
    await w.bereit;
    if (abbruch?.aborted) throw new DOMException("abgebrochen", "AbortError");
    const d = await Promise.race([
      frage(w, { typ: "rendere", code, sekunden }),
      new Promise((_, nein) => abbruch?.addEventListener("abort", () => nein(new DOMException("abgebrochen", "AbortError")))),
    ]) as { wav: Blob };
    return d.wav;
  } finally {
    abbruch?.removeEventListener("abort", ab);
    w.weg();
  }
}

/** WAV-Blob in einen AudioBuffer (fuer den Muxer). */
export async function wavZuBuffer(wav: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, 48000);
  return ctx.decodeAudioData(await wav.arrayBuffer());
}
