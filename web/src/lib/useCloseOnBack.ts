import { useEffect, useRef } from "react";
import { istSelbstPop, selbstPopAnkuendigen } from "./selfPop";

// Fängt die Zurück-Geste/den Zurück-Button ab, solange ein Overlay (Popup, Galerie,
// Teilen-Dialog …) offen ist: die erste Zurück-Aktion schließt NUR das Overlay, erst die
// nächste verlässt die Seite. Umsetzung: beim Öffnen einen Marker-History-Eintrag schieben;
// `popstate` (Swipe/Back) schließt das Overlay. Wird das Overlay per Button/Backdrop
// geschlossen, wird der Marker-Eintrag wieder konsumiert — außer der Nutzer ist inzwischen
// weiternavigiert (z. B. Link im Overlay), dann bleibt die Navigation erhalten.
export function useCloseOnBack(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    window.history.pushState({ __overlay: true }, "");
    // Selbst ausgelöste Pops (ein anderes Overlay räumt seinen Marker ab) sind keine Zurück-Geste.
    const onPop = () => { if (istSelbstPop()) return; onCloseRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Marker nur zurücknehmen, wenn er noch obenauf liegt (Schließen per Button/Backdrop).
      // Nach einer Zurück-Geste bzw. einer Navigation im Overlay ist er das nicht mehr.
      if ((window.history.state as any)?.__overlay) {
        // ANMELDEN, bevor wir zurückgehen: sonst hält ein anderer Handler (z. B. der Chat mit
        // seinen eigenen Ebenen-Markern) dieses popstate für eine Wisch-Geste und schließt sich.
        selbstPopAnkuendigen();
        window.history.back();
      }
    };
  }, [active]);
}
