import { useEffect, useRef } from "react";

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
    const onPop = () => onCloseRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Marker nur zurücknehmen, wenn er noch obenauf liegt (Schließen per Button/Backdrop).
      // Nach einer Zurück-Geste bzw. einer Navigation im Overlay ist er das nicht mehr.
      if ((window.history.state as any)?.__overlay) window.history.back();
    };
  }, [active]);
}
