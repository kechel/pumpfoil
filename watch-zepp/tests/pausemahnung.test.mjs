// Pause-Erinnerung (Jan, 22.10.2026) in Node nachgestellt — aus der QUELLE geschnitten.
//
//     node tests/pausemahnung.test.mjs
//
// Alle 10 min in der Pause: drei lange Stoesse + Sprung auf die Aktionsseite (Seite 0). Nicht vorher,
// nicht doppelt, nach dem Fortsetzen nie mehr, und eine neue Pause zaehlt wieder von vorn.
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
const konst = quelle.match(/const PAUSE_MAHNUNG_MS = (\d+);/);
if (!konst) throw new Error("PAUSE_MAHNUNG_MS fehlt");
globalThis.PAUSE_MAHNUNG_MS = Number(konst[1]);

let jetzt = 0;
Date.now = () => jetzt;
globalThis.canaryWrite = () => {};
globalThis.PHASE_IDLE = 2; globalThis.PHASE_RECORD = 3;

let stoesse = [];
const teile = ["_aktivMs", "pause", "resume", "_pauseMahnen"].map(schneide).join(",\n");
const uhr = new Function("stubs", `const o = { ${teile}, ...stubs }; return o;`)({
  state: null,
  _stopGps() {}, _stopAccel() {}, _accelAbonnieren() {}, persistActive() {}, applyButton() {},
  renderRecording() {}, _teilUpload() {}, _zustandGewechselt() { this.state.page = 2; },
  _cancelStopBack() {}, _vibratePattern(m) { stoesse.push([jetzt, m]); },
});

function frisch() {
  uhr.state = { recording: true, paused: false, startedAtMs: 0, pausedMs: 0, pauseStartMs: 0,
                pauseBeiMs: 0, pauseListe: [], _teilUploadLaeuft: false, page: 2 };
  jetzt = 0; stoesse = [];
  return uhr.state;
}
// die 1-Hz-Schleife: jede Sekunde _pauseMahnen (wie sample() in der Pause)
function sekunden(bis) { while (jetzt < bis) { jetzt += 1000; if (uhr.state.paused) uhr._pauseMahnen(); } }

let fehler = 0;
const pruefe = (n, ok, extra = "") => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${extra}`); };
const MIN = 60000;

console.log("1) 35 min Pause: genau drei Erinnerungen, bei 10, 20 und 30 min, jede mit long3");
{
  const s = frisch();
  jetzt = 5 * MIN; uhr.pause(); s.page = 4;   // jemand blaettert in der Pause
  sekunden(5 * MIN + 35 * MIN);
  pruefe("drei", stoesse.length === 3, "  " + JSON.stringify(stoesse));
  pruefe("Zeitpunkte 15/25/35 min", JSON.stringify(stoesse.map((x) => x[0] / MIN)) === "[15,25,35]");
  pruefe("Muster long3", stoesse.every((x) => x[1] === "long3"));
  pruefe("auf der Aktionsseite (0)", s.page === 0);
}

console.log("\n2) Unter 10 min: nichts");
{
  frisch(); jetzt = 1000; uhr.pause(); sekunden(1000 + 9 * MIN + 59000);
  pruefe("keine Erinnerung", stoesse.length === 0);
}

console.log("\n3) Nach dem Fortsetzen nie mehr; neue Pause zaehlt von vorn");
{
  const s = frisch();
  jetzt = 1000; uhr.pause(); sekunden(12 * MIN);
  pruefe("eine in der ersten Pause", stoesse.length === 1);
  uhr.resume(); sekunden(40 * MIN);
  pruefe("keine waehrend der Aufnahme", stoesse.length === 1);
  uhr.pause(); const p2 = jetzt; sekunden(p2 + 10 * MIN + 1000);
  pruefe("zweite Pause: erste Erinnerung nach 10 min", stoesse.length === 2 && stoesse[1][0] === p2 + 10 * MIN,
         "  " + JSON.stringify(stoesse.map((x) => (x[0] - p2) / 1000)));
}

console.log("\n4) Stopp in der Pause: keine Erinnerung mehr");
{
  const s = frisch();
  jetzt = 1000; uhr.pause(); s.recording = false; sekunden(25 * MIN);
  pruefe("keine", stoesse.length === 0);
}

console.log(fehler ? `\n${fehler} FEHLER` : "\nalles ok");
process.exit(fehler ? 1 : 0);
