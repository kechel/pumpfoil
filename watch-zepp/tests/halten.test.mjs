// 2-s-Halten fuer Stopp und Pause in Node nachgestellt — aus der QUELLE geschnitten, nicht abgetippt.
//
//     node tests/halten.test.mjs
//
// WOZU: Pause und Stopp loesen seit 30.09.2026 erst nach 2 s Halten aus (nasse Aermel blaetterten
// die Seiten weiter und pausierten per Tipp mitten im Lauf). Die Falle, die dieser Test festhaelt:
// `renderRecording` ruft `_buildAktionBtns` und `hideButton` bei JEDEM GPS-Takt (1 s). Baut das die
// Halte-Flaeche jedes Mal neu oder bricht es den Timer ab, kommt ein 2-s-Halten nie ans Ziel — im
// Simulator mit einem kurzen Klick sieht man davon nichts.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const start = quelle.indexOf(`    ${name}(`);
  if (start < 0) throw new Error(name + " nicht gefunden");
  let tiefe = 0;
  for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(name + " nicht abgeschlossen");
}

// --- Attrappen: Zepp-UI und Uhr ---------------------------------------------------------------
let jetzt = 0;
const wecker = [];   // {zeit, fn, id}
let naechsteId = 1;
globalThis.setTimeout = (fn, ms) => { const id = naechsteId++; wecker.push({ zeit: jetzt + ms, fn, id }); return id; };
globalThis.clearTimeout = (id) => { const i = wecker.findIndex((x) => x.id === id); if (i >= 0) wecker.splice(i, 1); };
function vergehen(ms) {
  const ziel = jetzt + ms;
  for (;;) {
    wecker.sort((a, b) => a.zeit - b.zeit);
    if (!wecker.length || wecker[0].zeit > ziel) break;
    const w = wecker.shift(); jetzt = w.zeit; w.fn();
  }
  jetzt = ziel;
}
let widgets = [];
globalThis.hmUI = {
  widget: { BUTTON: "BUTTON", CANVAS: "CANVAS", TEXT: "TEXT" },
  event: { CLICK_DOWN: "down", CLICK_UP: "up" },
  prop: { TEXT: "text" },
  align: { CENTER_H: 0, CENTER_V: 0 }, text_style: { ELLIPSIS: 0 },
  createWidget(typ, opt) {
    const w = { typ, opt, text: opt.text, weg: false, handler: {},
      addEventListener(ev, fn) { this.handler[ev] = fn; },
      setProperty(_p, v) { this.text = v; } };
    widgets.push(w); return w;
  },
  deleteWidget(w) { w.weg = true; },
};
globalThis.DW = 480; globalThis.DH = 480;
globalThis.px = (v) => v;
globalThis.t = (k) => ({ "rec.pause": "Pause", "rec.resume": "Weiter", "rec.discard": "Verwerfen",
                         "rec.stopHold": "Halten", "btn.stop": "STOP" })[k] || k;
globalThis.BUTTON = { x: 100, y: 366, w: 280, h: 70 };

const teile = ["_buildAktionBtns", "_clearAktionBtns", "_halteFlaeche", "_haltAbbrechen",
               "setButton", "hideButton", "setHaltButton"].map(schneide).join(",\n");
let gepaust = 0, gestoppt = 0, vibriert = 0;
function neueSeite(stopMode = "hold") {
  widgets = []; gepaust = 0; gestoppt = 0; vibriert = 0;
  const o = new Function("stubs", `const o = { ${teile}, ...stubs }; return o;`)({
    state: { w: {}, recording: true, paused: false, verwerfenArmed: false, stopMode, upStatus: "",
             haltTimer: null, haltKnopf: null, haltRuheText: "" },
    pause() { gepaust++; this.state.paused = true; this._buildAktionBtns(); },
    resume() { this.state.paused = false; this._buildAktionBtns(); },
    stop() { gestoppt++; },
    _verwerfenHinweis() {},
    _vibratePattern() { vibriert++; },
  });
  return o;
}
const flaeche = () => widgets.filter((w) => w.typ === "CANVAS" && !w.weg).at(-1);
const pauseKnopf = () => widgets.filter((w) => w.typ === "BUTTON" && !w.weg)[0];

let fehler = 0;
function pruefe(name, ok, info = "") {
  console.log((ok ? "ok   " : "FEHL ") + name + (info ? "  — " + info : ""));
  if (!ok) fehler++;
}

// 1. Kurz tippen loest NICHT aus, die Beschriftung kommt zurueck.
{
  const p = neueSeite(); p._buildAktionBtns();
  pruefe("Pause-Knopf traegt den Halte-Hinweis", pauseKnopf().text === "Pause · 2 s", pauseKnopf().text);
  flaeche().handler.down(); vergehen(300);
  pruefe("waehrend des Haltens steht „Halten …\"", pauseKnopf().text === "Halten …", pauseKnopf().text);
  flaeche().handler.up(); vergehen(3000);
  pruefe("kurzer Tipp pausiert nicht", gepaust === 0);
  pruefe("Beschriftung nach dem Loslassen zurueck", pauseKnopf().text === "Pause · 2 s", pauseKnopf().text);
}
// 2. 2 s halten pausiert genau einmal, mit Vibration.
{
  const p = neueSeite(); p._buildAktionBtns();
  flaeche().handler.down(); vergehen(1990);
  pruefe("vor 2 s noch keine Pause", gepaust === 0);
  vergehen(20);
  pruefe("nach 2 s pausiert", gepaust === 1);
  pruefe("Vibration beim Ausloesen", vibriert === 1);
  pruefe("danach traegt der Knopf „Weiter\"", pauseKnopf().text === "Weiter · 2 s", pauseKnopf().text);
}
// 3. DIE FALLE: jede Sekunde ein Render-Takt (`_buildAktionBtns` + `hideButton`) waehrend des Haltens.
{
  const p = neueSeite(); p._buildAktionBtns();
  flaeche().handler.down();
  for (let i = 0; i < 3; i++) { vergehen(700); p.hideButton(); p._buildAktionBtns(); }
  pruefe("Render-Takt bricht das Halten nicht ab", gepaust === 1, "gepaust=" + gepaust);
  pruefe("Knoepfe nicht bei jedem Takt neu gebaut",
         widgets.filter((w) => w.typ === "CANVAS").length === 2,   // vor + nach der Pause
         widgets.filter((w) => w.typ === "CANVAS").length + " Flaechen angelegt");
}
// 4. Zustandswechsel (Verwerfen scharf) baut neu — und bricht dabei ein laufendes Halten ab.
{
  const p = neueSeite(); p._buildAktionBtns();
  const vorher = flaeche();
  p.state.verwerfenArmed = true; p._buildAktionBtns();
  pruefe("geaenderter Zustand baut neu", flaeche() !== vorher && vorher.weg);
}
// 5. Profil-Modus „ein Druck statt halten": keine Flaeche, der Tipp-Knopf selbst pausiert.
{
  const p = neueSeite("press"); p._buildAktionBtns();
  pruefe("press-Modus: keine Halte-Flaeche", !flaeche());
  pauseKnopf().opt.click_func();
  pruefe("press-Modus: ein Tipp pausiert", gepaust === 1);
}
// 6. Stopp-Knopf: Halten stoppt, Loslassen vorher nicht; hideButton raeumt beides weg.
{
  const p = neueSeite(); p.setHaltButton("STOP", 0, 0, 0, () => p.stop());
  const knopf = p.state.w.btn, f = p.state.w.btnHalt;
  pruefe("Stopp traegt den Halte-Hinweis", knopf.text === "STOP · 2 s", knopf.text);
  f.handler.down(); vergehen(1500); f.handler.up(); vergehen(2000);
  pruefe("Stopp: 1,5 s halten stoppt nicht", gestoppt === 0);
  f.handler.down(); vergehen(2000);
  pruefe("Stopp: 2 s halten stoppt", gestoppt === 1);
  p.hideButton();
  pruefe("hideButton raeumt Knopf und Flaeche ab", knopf.weg && f.weg && !p.state.w.btnHalt);
}

if (fehler) { console.log(`\n${fehler} FEHLER`); process.exit(1); }
console.log("\nalle Halte-Pruefungen gruen");
