// Strudel-Wirt der Media-Ansicht (docs/MEDIA.md, 24.11.2026). Wird als abgeschotteter iframe geladen und per
// postMessage gesteuert:
//   {typ:"init", url}                    -> Strudel-Buendel laden, antwortet {typ:"bereit"} bzw. {typ:"fehler"}
//   {typ:"spiele", id, code, ab}         -> live spielen ab Video-Sekunde `ab`, antwortet {typ:"antwort", id, fehler}
//   {typ:"stoppe"}
//   {typ:"rendere", id, code, sekunden}  -> offline rendern, antwortet {typ:"wav", id, wav} oder {typ:"antwort", id, fehler}
// Ein Wirt rendert hoechstens EINMAL: Strudels renderPatternAudio schliesst den Audiokontext und poolt Knoten ohne
// Kontext-Trennung. Die Media-Ansicht nimmt fuers Rendern deshalb jedes Mal einen frischen iframe.
"use strict";
(function () {
  // Ohne allow-same-origin gibt es hier weder localStorage noch Service Worker — Strudel fragt beides beim Laden ab
  // und wirft sonst Fehler in die Konsole. Harmlose Platzhalter (Speicher nur im Arbeitsspeicher).
  try {
    var mem = {};
    var speicher = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; }, key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; },
    };
    Object.defineProperty(window, "localStorage", { value: speicher, configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: speicher, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", { value: undefined, configurable: true });
  } catch (x) { /* dann eben mit Konsolenmeldung */ }
  var sw = null, repl = null;
  var melde = function (d) { parent.postMessage(d, "*"); };   // eigene Herkunft ist undurchsichtig -> "*"
  var fehlerText = function (e) { return String((e && e.message) || e || "Strudel-Fehler"); };

  async function auswerten(code) {
    var vorher = repl.state && repl.state.evalError;
    var pattern = await repl.evaluate(code, false);
    var f = repl.state && repl.state.evalError;
    if (!pattern || (f && f !== vorher)) throw new Error(fehlerText(f));
    return pattern;
  }

  window.addEventListener("message", async function (e) {
    if (e.source !== parent) return;
    var m = e.data || {};
    try {
      if (m.typ === "init") {
        sw = await import(m.url);
        // miniAllStrings: false — wie auf strudel.cc sind nur "…" und `…` Mini-Notation.
        repl = await sw.initStrudel({ miniAllStrings: false });
        melde({ typ: "bereit" });
      } else if (m.typ === "spiele") {
        // NICHT auf resume() warten: Safari gibt den Ton im abgeschotteten iframe nur nach einem Klick IN diesem
        // iframe frei und laesst das Versprechen sonst ewig offen (24.11.2026, „Loading" ohne Ende). Den Zustand
        // melden wir stattdessen zurueck; die Seite weicht bei „suspended" auf gerenderten Ton aus.
        var ac = sw.getAudioContext();
        try { ac.resume().catch(function () {}); } catch (x) { /* egal */ }
        if (ac.state !== "running") await new Promise(function (r) { setTimeout(r, 250); });
        if (ac.state !== "running") {
          // Gesperrt: Strudel NICHT starten — seine Uhr haengt an currentTime, die dann stillsteht, und blockiert in
          // WebKit die ganze Seite (gemessen 24.11.2026). Die Seite weicht auf gerenderten Ton aus.
          melde({ typ: "antwort", id: m.id, fehler: null, zustand: ac.state });
          return;
        }
        var p = await auswerten(m.code);
        var cps = repl.scheduler.cps;
        repl.stop();
        // Strudels Uhr plant 0,1 s voraus — um so viel frueher einsetzen, damit Ton und Bild gleich laufen.
        var latenz = repl.scheduler.latency || 0.1;
        await repl.setPattern(p.early((m.ab + latenz) * cps), true);
        melde({ typ: "antwort", id: m.id, fehler: null, zustand: ac.state });
      } else if (m.typ === "knopf") {
        // Safari: Ton nur nach einem Klick IN diesem iframe. Die Seite zeigt den iframe dafuer kurz sichtbar an,
        // hier steht dann ein Knopf; der Klick entsperrt den Audiokontext fuer die ganze Sitzung.
        document.body.innerHTML = "";
        document.body.style.cssText = "margin:0;background:transparent;font-family:system-ui,-apple-system,sans-serif";
        var k = document.createElement("button");
        k.textContent = m.text || "Musik einschalten";
        k.style.cssText = "width:100%;height:100vh;border:0;border-radius:10px;background:#22d3ee;color:#0f172a;" +
          "font-weight:700;font-size:15px;cursor:pointer";
        k.addEventListener("click", function () {
          var ac = sw && sw.getAudioContext();
          var fertig = function () { melde({ typ: "freigegeben", zustand: ac ? ac.state : "?" }); };
          if (ac) ac.resume().then(fertig, fertig); else fertig();
        });
        document.body.appendChild(k);
      } else if (m.typ === "stoppe") {
        if (repl) repl.stop();
      } else if (m.typ === "rendere") {
        var q = await auswerten(m.code);
        var c = repl.scheduler.cps;
        repl.stop();
        // renderPatternAudio legt einen Download an — hier abfangen und an die Seite geben.
        URL.createObjectURL = function (b) { melde({ typ: "wav", id: m.id, wav: b }); return "blob:abgefangen"; };
        URL.revokeObjectURL = function () {};
        HTMLAnchorElement.prototype.click = function () {};
        await sw.renderPatternAudio(q, c, 0, m.sekunden * c, 48000, 128, false, "musik");
      }
    } catch (x) {
      melde({ typ: m.typ === "init" ? "fehler" : "antwort", id: m.id, fehler: fehlerText(x) });
    }
  });
  melde({ typ: "geladen" });
})();
