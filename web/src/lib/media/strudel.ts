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

/** Code auswerten und ab Video-Sekunde `ab` spielen. Gibt einen Fehlertext zurueck oder null. */
export async function spiele(code: string, ab: number): Promise<string | null> {
  const w = liveWirt();
  try {
    await w.bereit;
    await frage(w, { typ: "spiele", code, ab });
    return null;
  } catch (e: any) { return String(e?.message ?? e); }
}

export async function stoppe(): Promise<void> { live?.senden({ typ: "stoppe" }); }

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
