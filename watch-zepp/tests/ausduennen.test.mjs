// Accel ausduennen (24.11.2026) — aus der QUELLE geschnitten, wie geoneustart.test.mjs.
//
//     node tests/ausduennen.test.mjs
//
// Active 2 / Balance liefern bei FREQ_MODE_HIGH ~100 Hz. Die ersten 500 ms messen die Rohrate; ueber 40 Hz wird je
// round(hz/25) Proben gemittelt. Bei ~25 Hz bleibt jede Probe. Blockstarts (accelChunkT0) und die gemeldete Rate
// (_accelHz) muessen danach stimmen.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const m = new RegExp(`\\n    ${name}\\([^)]*\\) \\{`).exec(quelle);
  if (!m) throw new Error(name + " nicht gefunden");
  const start = m.index + 1;
  let tiefe = 0;
  for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(name + " nicht abgeschlossen");
}
const konst = ["ACCEL_MESS_MS = [^\\n]*", "ACCEL_CHUNK_SAMPLES = [^\\n]*", "GPS_HZ = [^\\n]*"]
  .map((n) => { const m = new RegExp(`^const ${n}$`, "m").exec(quelle); if (!m) throw new Error(n); return m[0]; })
  .join("\n");
const teile = ["_accelRoh", "_accelMittel", "_accelHz"].map(schneide).join(",\n");
const clamp = "const clampI16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));";
const neu = () => new Function(`${konst}\n${clamp}\n return { state: null, flushes: 0,
  _flushAccelBuffer() { this.flushes++; this.state.accelBuffer = []; }, ${teile} };`)();

let fehler = 0;
const pruefe = (ok, text) => { if (!ok) { fehler++; console.log("FEHLER:", text); } else console.log("ok:", text); };
const leer = () => ({ accelBuffer: [], accelSamples: 0, accelFirstMs: 0, accelLastMs: 0, accelChunkT0: [],
  accelTeiler: 0, accelVorlauf: null, accelSx: 0, accelSy: 0, accelSz: 0, accelSn: 0 });

function fahre(hz, sekunden, z = 980.665) {
  const uhr = neu(); uhr.state = leer();
  const t0 = 5_000_000, dt = 1000 / hz;
  for (let i = 0; i < hz * sekunden; i++) {
    const t = Math.round(t0 + i * dt);
    uhr._accelRoh(0, 0, z, t, t - t0);
  }
  return uhr;
}

// 1) 100 Hz -> Teiler 4, ~25 Hz
let u = fahre(100, 60);
pruefe(u.state.accelTeiler === 4, "100 Hz -> Teiler 4 (" + u.state.accelTeiler + ")");
pruefe(u.state.accelSamples === 1500, "60 s -> 1500 gespeicherte Proben (" + u.state.accelSamples + ")");
pruefe(Math.abs(u._accelHz() - 25) <= 1, "gemeldete Rate ~25 Hz (" + u._accelHz() + ")");
pruefe(u.state.accelChunkT0.length === Math.ceil(1500 / 128), "ein Blockstart je 128 Proben");
pruefe(u.state.accelChunkT0[0] === 0 && Math.abs(u.state.accelChunkT0[1] - 128 * 40) <= 2,
  "Blockstarts in aktiver Zeit: 0 und ~5120 ms (" + u.state.accelChunkT0.slice(0, 2) + ")");
pruefe(u.state.accelFirstMs === 5_000_000, "erste Zeit = erste Rohprobe (Vorlauf nicht verschoben)");

// 2) 25 Hz -> unveraendert
u = fahre(25, 60);
pruefe(u.state.accelTeiler === 1 && u.state.accelSamples === 1500, "25 Hz -> Teiler 1, jede Probe bleibt");
pruefe(Math.abs(u._accelHz() - 25) <= 1, "25 Hz gemeldet");

// 3) 50 Hz -> Teiler 2
u = fahre(50, 10);
pruefe(u.state.accelTeiler === 2 && Math.abs(u._accelHz() - 25) <= 1, "50 Hz -> Teiler 2, ~25 Hz");

// 4) Mittelwert: 1 g bleibt 1 g (2048 Zaehler), wechselnde Werte werden gemittelt
u = fahre(100, 5);
const gesamt = u.state.accelBuffer.length ? u.state.accelBuffer : null;
pruefe(gesamt && gesamt[2] === 2048, "1 g -> 2048 nach Mitteln (" + (gesamt && gesamt[2]) + ")");
const w = neu(); w.state = leer(); w.state.accelTeiler = 4;
[0, 980.665, 0, 980.665].forEach((z, i) => w._accelRoh(0, 0, z, 1000 + i * 10, i * 10));
pruefe(w.state.accelBuffer[2] === 1024, "Mittel aus 0/1/0/1 g = 0,5 g (" + w.state.accelBuffer[2] + ")");

// 5) Vorlauf: vor 500 ms nichts gespeichert, danach alles nachgeholt
const v = neu(); v.state = leer();
for (let i = 0; i < 40; i++) v._accelRoh(0, 0, 980.665, 1000 + i * 10, i * 10);
pruefe(v.state.accelSamples === 0 && v.state.accelTeiler === 0, "innerhalb 400 ms: noch messen, nichts gespeichert");
for (let i = 40; i < 60; i++) v._accelRoh(0, 0, 980.665, 1000 + i * 10, i * 10);
pruefe(v.state.accelTeiler === 4 && v.state.accelSamples === 15, "nach 500 ms: Vorlauf nachgeholt (" + v.state.accelSamples + ")");

console.log(fehler ? `\n${fehler} FEHLER` : "\nalles ok");
process.exit(fehler ? 1 : 0);
