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
    _stopGps() {}, _stopAccel() {}, _accelAbonnieren() {},
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

// ---------------------------------------------------------------------------
// 6) DER FALL, DEN DIESER TEST AM 24.09.2026 DURCHGEWUNKEN HAT.
//
// Oben sind `_startGps`/`_startAccel` Attrappen — deshalb blieb unsichtbar, dass `resume()`
// sie aufrief und damit die laufende Aufnahme loeschte: beide legen eine Aufnahme AN, also
// Datei mit O_TRUNC leeren und Zaehler auf null. Auf dem Server kamen von 20 Minuten Fahrt
// mit zwei Pausen 3 GPS-Punkte und 85 Samples an (Session #9739).
//
// Hier laufen die ECHTEN Funktionen, mit Attrappen nur fuer Datei und Sensor. Der Test haelt
// fest, was die Trennung leisten muss: anlegen darf nur der Aufnahmestart, fortsetzen
// abonniert.
console.log("\n6) Fortsetzen loescht die Aufnahme NICHT");
{
  let truncs = 0, starts = 0;
  globalThis.accelPath = (uuid) => "/acc_" + uuid;
  globalThis.O_RDWR = 2; globalThis.O_CREAT = 64; globalThis.O_TRUNC = 512;
  globalThis.openSync = ({ flag }) => { if (flag & O_TRUNC) truncs++; return 7; };
  globalThis.closeSync = () => {};
  globalThis.FREQ_MODE_HIGH = 1; globalThis.FREQ_MODE_NORMAL = 0;
  globalThis.ACCEL_CHUNK_SAMPLES = 128; globalThis.ACCEL_SCALE = 4096;
  globalThis.STANDARD_GRAVITY_CM_S2 = 980.665;
  globalThis.clampI16 = (v) => v;
  globalThis.Accelerometer = function () {
    return { onChange() {}, offChange() {}, setFreqMode() {}, start() { starts++; }, stop() {},
             getCurrent: () => null };
  };

  const echt = new Function("stubs", `const o = { ${["_aktivMs", "pause", "resume", "_startAccel", "_accelAbonnieren"].map(schneide).join(",\n")},
    ...stubs };
    return o;`)({
      state: null,
      _stopGps() {}, persistActive() {}, applyButton() {}, renderRecording() {}, _teilUpload() {},
      // Anhalten wie auf der Uhr: abmelden, sonst nichts. Das Nachzaehlen aus der Dateigroesse
      // braucht es hier nicht — es gibt keine Datei.
      _stopAccel() { const s = this.state; s.accelSensor = null; s.accelCallback = null; },
    });

  const laufend = () => ({ recording: true, paused: false, startedAtMs: 0, uuid: "u1",
    pausedMs: 0, pauseStartMs: 0, pauseBeiMs: 0, pauseListe: [], _teilUploadLaeuft: false,
    recordMode: "full", accelFile: "/acc_u1", accelSamples: 500, accelBytes: 3000,
    accelChunkT0: [0, 5120, 10240], accelFirstMs: 1, accelLastMs: 2,
    gpsFile: "/gps_u1", gpsCount: 42, gpsBuffer: [], gps: [] });

  // 6a) Der AUFNAHMESTART soll zuruecksetzen — das ist seine Aufgabe.
  echt.state = laufend(); jetzt = 0; truncs = 0; starts = 0;
  echt._startAccel();
  pruefe("_startAccel leert die Datei", truncs === 1, `  (${truncs}x)`);
  pruefe("_startAccel setzt die Zaehler", echt.state.accelSamples === 0 && echt.state.accelBytes === 0);
  pruefe("_startAccel abonniert", starts === 1);

  // 6b) FORTSETZEN darf nur abonnieren.
  const s = echt.state = laufend(); jetzt = 0; truncs = 0; starts = 0;
  jetzt = 600000; echt.pause();
  jetzt = 660000; echt.resume();
  pruefe("keine Datei geleert", truncs === 0, `  (${truncs}x)`);
  pruefe("Samples erhalten", s.accelSamples === 500, `  (ist ${s.accelSamples})`);
  pruefe("Schreibposition erhalten", s.accelBytes === 3000, `  (ist ${s.accelBytes})`);
  pruefe("Block-Zeitpunkte erhalten", s.accelChunkT0.length === 3);
  pruefe("GPS-Punkte erhalten", s.gpsCount === 42, `  (ist ${s.gpsCount})`);
  pruefe("GPS-Datei unveraendert", s.gpsFile === "/gps_u1");
  pruefe("Sensor wieder scharf", starts === 1, `  (${starts}x)`);
  pruefe("aktive Zeit 10 min", echt._aktivMs() === 600000, `  (ist ${echt._aktivMs()})`);
}

Date.now = echtesNow;
console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
