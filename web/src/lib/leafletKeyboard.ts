import L from "leaflet";

// Leaflets Tastatur-Navigation darf NIE Tippen in Eingabefeldern schlucken.
//
// Befund 17.08. (PeterH, dann Jan): mit Fokus im Chat-Eingabefeld zoomte die Taste `-` weiterhin
// die Karte. Leaflets `_onKeyDown` prüft NUR Alt/Ctrl/Meta und verlässt sich sonst darauf, dass
// der Handler bloß bei Fokus auf dem Kartencontainer registriert ist (`_addHooks` bei focus,
// `_removeHooks` bei blur). Diese Buchhaltung reicht in einer SPA nicht: der Listener hängt am
// `document`, und sobald Fokus/Blur einmal nicht sauber durchlaufen — schwebendes Chat-Widget,
// programmatischer Fokus, Portal — greift er wieder auf der ganzen Seite.
//
// Betroffen sind Leaflets Vorgaben `zoomIn [187,107,61,171]` und `zoomOut [189,109,54,173]` plus
// die Pfeiltasten. Auf deutscher Tastatur sind das die Tasten `-`, `+` und `6`, mit Shift also
// `_`, `*` und `&` — genau Peters Liste. Die 54 (Ziffer 6) führt Leaflet für AZERTY-Layouts.
//
// Deshalb hier eine Zusatzbedingung statt `keyboard: false`: die Karte bleibt per Tastatur
// bedienbar (Barrierefreiheit), sie hört nur weg, wenn gerade jemand schreibt. Einmal global
// gepatcht, damit es für JEDE Karte gilt — auch für die nächste, die jemand einbaut.
const KEYBOARD = (L.Map as unknown as { Keyboard: { prototype: Record<string, unknown> } }).Keyboard;
const original = KEYBOARD.prototype._onKeyDown as (e: KeyboardEvent) => void;

KEYBOARD.prototype._onKeyDown = function (this: unknown, e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t) {
    const tag = t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
  }
  return original.call(this, e);
};

export {};
