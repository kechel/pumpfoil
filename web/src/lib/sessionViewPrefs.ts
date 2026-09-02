// Gemerkte Einstellungen der Session-Karte (Jan, 02.09.): Farbmodus, Glättung, Pump-Marker und
// Startversuche gelten über Sessions hinweg — wer die Karte nach Puls einfärbt, will das beim
// nächsten Öffnen wieder so, und nicht bei jeder Session neu klicken.
//
// Bewusst `localStorage` und nicht das Profil: es ist eine reine ANSICHTS-Wahl dieses Geräts,
// wie Sprache, Theme und Kartenebene (`map_layer`) auch. Ein Profil-Feld hieße einen Server-
// Aufruf je Umschaltung und dieselbe Ansicht auf Handy und Rechner — beides will hier niemand.
// Kein Tracking, first-party, funktional — passt zur Cookie-/Datenschutz-Linie des Projekts.
//
// Nicht gemerkt wird die Skala (`autoScale`, Min/Max): die hängt an der EINZELNEN Session
// (Auto-Skala passt sie an deren Spanne an), ein Übertrag wäre dort eher störend.

export type ColorMode = "speed" | "hr" | "pump" | "optimal" | "turns";
export type SmoothWin = "1" | "3" | "5";

export type SessionView = {
  colorMode: ColorMode;
  win: SmoothWin;
  showPumps: boolean;
  showAttempts: boolean;
};

const KEY = "foil_sd_view";

// Startversuche standardmäßig AN (Jans Vorgabe): sie erklären die Lücken zwischen den Läufen,
// und der Schalter erscheint ohnehin nur, wenn es misslungene Versuche gibt.
export const SESSION_VIEW_DEFAULT: SessionView = {
  colorMode: "speed",
  win: "3",
  showPumps: false,
  showAttempts: true,
};

const MODES: ColorMode[] = ["speed", "hr", "pump", "optimal", "turns"];
const WINS: SmoothWin[] = ["1", "3", "5"];

/** Gemerkte Ansicht lesen. Unbekannte/kaputte Werte fallen einzeln auf den Standard zurück. */
export function ladeSessionView(): SessionView {
  try {
    const roh = localStorage.getItem(KEY);
    if (!roh) return SESSION_VIEW_DEFAULT;
    const v = JSON.parse(roh) as Partial<SessionView>;
    return {
      colorMode: MODES.includes(v.colorMode as ColorMode) ? (v.colorMode as ColorMode) : SESSION_VIEW_DEFAULT.colorMode,
      win: WINS.includes(v.win as SmoothWin) ? (v.win as SmoothWin) : SESSION_VIEW_DEFAULT.win,
      showPumps: typeof v.showPumps === "boolean" ? v.showPumps : SESSION_VIEW_DEFAULT.showPumps,
      showAttempts: typeof v.showAttempts === "boolean" ? v.showAttempts : SESSION_VIEW_DEFAULT.showAttempts,
    };
  } catch {
    return SESSION_VIEW_DEFAULT;
  }
}

/** Ansicht merken. Fehler (privater Modus, voller Speicher) sind egal — dann eben nicht. */
export function merkeSessionView(v: SessionView): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* Anzeige-Komfort, kein Grund für einen Fehler */
  }
}
