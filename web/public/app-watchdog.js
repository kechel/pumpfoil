// Blank-Screen-Selbstheiler (unabhängig vom App-Bundle — läuft auch, wenn das JS-Bundle
// nach einem PWA-Update auf gelöschte/alte Chunks zeigt und React gar nicht mountet).
// Prüft kurz nach dem Laden, ob die App im #root gemountet ist; wenn nicht, EINMAL pro
// Browser-Session neu laden (der frisch aktivierte Service Worker liefert dann konsistente
// Assets). Kein Reload-Loop: der Recovery-Versuch wird je Session gemerkt, bei erfolgreichem
// Mount wieder gelöscht. Bewusst als eigenes, CSP-konformes same-origin-Skript (kein Inline).
(function () {
  var KEY = "pf_blank_recover";
  function check() {
    var root = document.getElementById("root");
    var mounted = root && root.childElementCount > 0;
    if (mounted) {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      return;
    }
    try {
      if (sessionStorage.getItem(KEY)) { return; }   // schon einmal versucht -> kein Loop
      sessionStorage.setItem(KEY, "1");
    } catch (e) { /* ignore */ }
    location.reload();
  }
  window.addEventListener("load", function () { setTimeout(check, 8000); });
})();
