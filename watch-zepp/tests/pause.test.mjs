// Pausen-Zeitachse in Node nachgestellt — aus der QUELLE geschnitten, nicht abgetippt.
//
//     node tests/pause.test.mjs
//
// WOZU: der Server erwartet in den Zeitstempeln AKTIVE Zeit und rechnet die Pausendauer fuer
// `ended_at` selbst wieder dazu (server/app/api/ingest.py: „der GPS-Zeitstempel ist AKTIVE Zeit,
// die Pausen fehlen darin"). Rutscht hier die Wanduhr hinein, klafft ein Loch in der Accel-Achse
// und die gemessene Rate wird ueber die Pause hinweg gerechnet — dasselbe Artefakt, das am
// 23.09.2026 ein zugeklappter Laptop erzeugt hat (2 Hz statt 12).
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const start = quelle.indexOf(`    ${name}() {`);
  if (start < 0) throw new Error(name + " nicht gefunden");
  let tiefe = 0;
  for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(name + " nicht abgeschlossen");
}

let jetzt = 0;
const echtesNow = Date.now;
Date.now = () => jetzt;

const teile = ["_aktivMs", "pause", "resume"].map(schneide).join(",\n");
const uhr = new Function("stubs", `const o = { ${teile},
  ...stubs };
  return o;`)({
    state: null,
    _stopGps() {}, _stopAccel() {}, _startGps() {}, _startAccel() {},
    persistActive() {}, applyButton() {}, renderRecording() {}, _teilUpload() {},
  });
// canaryWrite/PHASE_* sind im Modul-Gueltigkeitsbereich — hier als globale Attrappen.
globalThis.canaryWrite = () => {};
globalThis.PHASE_IDLE = 2; globalThis.PHASE_RECORD = 3;

function frisch() {
  uhr.state = { recording: true, paused: false, startedAtMs: 0,
                pausedMs: 0, pauseStartMs: 0, pauseBeiMs: 0, pauseListe: [],
                _teilUploadLaeuft: false };
  jetzt = 0;
  return uhr.state;
}

let fehler = 0;
const pruefe = (n, ok, extra = "") => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${extra}`); };

console.log("1) Ohne Pause ist aktive Zeit gleich Wanduhr");
{
  frisch(); jetzt = 30000;
  pruefe("30 s", uhr._aktivMs() === 30000);
}

console.log("\n2) In der Pause steht die Uhr");
{
  const s = frisch();
  jetzt = 10000; uhr.pause();
  pruefe("beim Anhalten 10 s", uhr._aktivMs() === 10000);
  jetzt = 70000;
  pruefe("nach einer Minute Pause immer noch 10 s", uhr._aktivMs() === 10000,
         `  (ist ${uhr._aktivMs()})`);
  pruefe("Fenster erst beim Fortsetzen", s.pauseListe.length === 0);
}

console.log("\n3) Nach dem Fortsetzen laeuft sie ohne die Pause weiter");
{
  const s = frisch();
  jetzt = 10000; uhr.pause();
  jetzt = 70000; uhr.resume();
  pruefe("direkt danach 10 s", uhr._aktivMs() === 10000);
  jetzt = 75000;
  pruefe("fuenf Sekunden spaeter 15 s", uhr._aktivMs() === 15000, `  (ist ${uhr._aktivMs()})`);
  pruefe("ein Fenster [10000, 60000]",
         JSON.stringify(s.pauseListe) === "[[10000,60000]]", "  " + JSON.stringify(s.pauseListe));
  pruefe("Wanduhr = aktiv + Pause", 75000 === uhr._aktivMs() + s.pausedMs);
}

console.log("\n4) Zwei Pausen addieren sich");
{
  const s = frisch();
  jetzt = 10000; uhr.pause(); jetzt = 40000; uhr.resume();   // 30 s Pause bei 10 s
  jetzt = 60000; uhr.pause(); jetzt = 70000; uhr.resume();   // 10 s Pause bei 30 s
  pruefe("aktive Zeit 30 s", uhr._aktivMs() === 30000, `  (ist ${uhr._aktivMs()})`);
  pruefe("zwei Fenster", JSON.stringify(s.pauseListe) === "[[10000,30000],[30000,10000]]",
         "  " + JSON.stringify(s.pauseListe));
  pruefe("Summe 40 s", s.pausedMs === 40000);
}

console.log("\n5) Doppeltes Pausieren/Fortsetzen aendert nichts");
{
  const s = frisch();
  jetzt = 10000; uhr.pause(); uhr.pause();
  jetzt = 40000; uhr.resume(); uhr.resume();
  pruefe("genau ein Fenster", s.pauseListe.length === 1, "  " + JSON.stringify(s.pauseListe));
  pruefe("Pausensumme einmal gezaehlt", s.pausedMs === 30000);
}

Date.now = echtesNow;
console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
