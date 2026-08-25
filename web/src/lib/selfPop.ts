// Merker: DIESES `popstate` haben WIR selbst ausgelöst (ein Overlay hat seinen History-Marker
// wieder abgeräumt) — es ist keine Zurück-Geste des Nutzers.
//
// Warum es das braucht (Befund 25.08.): der Chat legt auf Touch-Geräten eigene Marker auf den
// History-Stack (eine Ebene je UI-Stufe) und schließt beim `popstate` eine Ebene. Das Diktier-
// Vollbild legt über `useCloseOnBack` einen WEITEREN Marker und räumt ihn beim Schließen per
// `history.back()` wieder ab. Dieses `back()` sieht der Chat-Handler nicht von einer Wisch-Geste
// zu unterscheiden — er schloss den Chatraum, die Chat-Komponente wurde ausgehängt, und der
// gerade diktierte Text war mit ihr weg. Gemeldet als „Bearbeiten lässt das Feld leer" UND
// „der Chatraum schließt sich dabei" — dieselbe Ursache.
//
// Ablauf: wer selbst `history.back()`/`go()` ruft, meldet es vorher an. Alle unsere
// popstate-Handler fragen `istSelbstPop()` und tun dann nichts. Zurückgesetzt wird NACH dem
// Ereignis-Durchlauf (setTimeout im einmaligen Listener), damit ALLE Handler denselben Stand
// sehen — nicht nur der erste.
let offen = false;

export function selbstPopAnkuendigen(): void {
  offen = true;
  window.addEventListener("popstate", () => {
    setTimeout(() => { offen = false; }, 0);
  }, { once: true });
}

export function istSelbstPop(): boolean {
  return offen;
}
