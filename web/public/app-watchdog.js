// Blank-Screen-Selbstheiler (unabhängig vom App-Bundle — läuft auch, wenn das JS-Bundle
// nach einem PWA-Update auf gelöschte/alte Chunks zeigt und React gar nicht mountet).
// Bewusst als eigenes, CSP-konformes same-origin-Skript (kein Inline).
//
// 24.10.2026 umgebaut, nachdem Jans installierte PWA (Android) weiss haengen blieb und Neuladen nichts
// half: ein normales `location.reload()` bekommt dieselbe alte Huelle aus dem Cache des alten Service
// Workers, und die Sperre „einmal pro Sitzung" gab in einer PWA (Sitzung = solange das Fenster lebt)
// nach dem ersten Versuch fuer immer auf. Jetzt:
//   - pfNeustart(): HARTER Neustart — Service Worker abmelden, seine Caches loeschen, neu laden.
//     localStorage (Login, Sprache, Theme) bleibt. Offline nur normales Neuladen, sonst waere die
//     Offline-App weg.
//   - Sperre zeitbasiert: automatisch hoechstens 2 Versuche in 5 Minuten (kein Dauer-Reload).
//   - Ladebildschirm in index.html (#pf-start im #root) zeigt nach 3 s den Knopf „App neu laden";
//     React ersetzt den Inhalt von #root beim ersten Rendern, der Knopf verschwindet dann von selbst.
//   main.tsx ruft pfNeustart("preload") bei `vite:preloadError`.
(function () {
  var KEY = "pf_neustart_ts";
  var FENSTER_MS = 5 * 60 * 1000;
  var MAX_AUTO = 2;

  function versuche() {
    try {
      var jetzt = Date.now();
      return (JSON.parse(localStorage.getItem(KEY) || "[]") || []).filter(function (t) { return jetzt - t < FENSTER_MS; });
    } catch (e) { return []; }
  }

  function neuLaden() { location.reload(); }

  function hart() {
    if (navigator.onLine === false) { neuLaden(); return; }
    var schritte = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        schritte.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }));
      }
      if (window.caches && caches.keys) {
        schritte.push(caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        }));
      }
    } catch (e) { /* weiter zum Reload */ }
    var fertig = false;
    function los() { if (!fertig) { fertig = true; neuLaden(); } }
    Promise.all(schritte).then(los, los);
    setTimeout(los, 4000);   // haengt ein Schritt, trotzdem neu laden
  }

  // automatisch = aus Wächter/Ladefehler (mit Sperre); sonst = Knopf (immer)
  window.pfNeustart = function (grund) {
    var auto = grund !== "knopf";
    if (auto) {
      var v = versuche();
      if (v.length >= MAX_AUTO) return false;
      v.push(Date.now());
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
    }
    hart();
    return true;
  };

  function gemountet() {
    var root = document.getElementById("root");
    return !!root && root.childElementCount > 0 && !document.getElementById("pf-start");
  }

  // Knopftext in der Sprache der App (foil_lang), sonst Pfad-Praefix bzw. Browsersprache.
  var TEXT = {
    de: "App neu laden", gsw: "App nöi lade", "de-AT": "App neu laden", en: "Reload app",
    fr: "Recharger l’app", it: "Ricarica l’app", es: "Recargar la app", pt: "Recarregar o app",
    "pt-PT": "Recarregar a app", nl: "App opnieuw laden", nb: "Last inn appen på nytt",
    fi: "Lataa sovellus uudelleen", cs: "Znovu načíst aplikaci", pl: "Załaduj aplikację ponownie",
    ru: "Перезагрузить приложение", id: "Muat ulang aplikasi", ja: "アプリを再読み込み", zh: "重新加载应用"
  };
  function sprache() {
    var l = null;
    try { l = localStorage.getItem("foil_lang"); } catch (e) { /* ignore */ }
    if (l && TEXT[l]) return l;
    var p = location.pathname.split("/")[1] || "";
    if (TEXT[p]) return p;
    var n = (navigator.language || "en");
    if (TEXT[n]) return n;
    n = n.slice(0, 2).toLowerCase();
    return TEXT[n] ? n : "en";
  }

  function knopfEinrichten() {
    var k = document.getElementById("pf-start-knopf");
    if (!k) return;
    k.textContent = TEXT[sprache()];
    k.addEventListener("click", function () { window.pfNeustart("knopf"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", knopfEinrichten);
  else knopfEinrichten();

  function pruefen() {
    if (gemountet()) {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      return;
    }
    window.pfNeustart("waechter");
  }
  // 20 s Wartezeit: auf langsamen Verbindungen mountet React sonst evtl. noch, während der
  // Timer schon feuert -> unnötiges (störendes) Neuladen. Bis dahin gibt es den Knopf.
  window.addEventListener("load", function () { setTimeout(pruefen, 20000); });
})();
