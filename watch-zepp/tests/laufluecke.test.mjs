// GPS-Luecke am Lauf-Ende / im Lauf (12.11.2026, wie Garmin watch/test/laufluecke.test.mjs) — aus der QUELLE geschnitten.
//
//     node tests/laufluecke.test.mjs
//
// Uhr unter Wasser = keine Positionen. Im Lauf wird bis 15 s nie unterbrochen; am Ende zaehlt der letzte gute Fix.
// Nachgebaut ist nur der Teil des 1-Hz-Takts, der die Lauferkennung fuettert (Tempo aus Positionen, Strecke,
// _luecke, _pushSpeed, _updateRun) — wie in page/index.js.
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
const konst = ["RUN_ENTER_MPS", "RUN_ENTER_DWELL", "MAX_FOIL_MPS", "NOSTOP_MPS", "MIN_RUN_MS", "SPEED_WIN_S", "LUECKE_MS"]
  .map((n) => { const m = new RegExp(`^const ${n} = [^\\n]*$`, "m").exec(quelle); if (!m) throw new Error(n); return m[0]; })
  .join("\n");
const fn = (n) => { const m = new RegExp(`^function ${n}\\([\\s\\S]*?\\n\\}`, "m").exec(quelle); if (!m) throw new Error(n); return m[0]; };
const teile = ["_updateRun", "_resetRun", "_pushSpeed", "_luecke", "_schnitt"].map(schneide).join(",\n");
const uhr = new Function(`${konst}\n${fn("distM")}\n return { state: null, ${teile} };`)();
const distM = new Function(`${fn("distM")}\n return distM;`)();

const M_GRAD = 1 / 111320;
/** plan: [[sekunden, m/s, gps]] — gps=false: keine Position (der Fahrer bewegt sich trotzdem weiter). */
function fahrt(plan) {
  uhr.state = { hr: 120, spdMaxClean: 0, spdMaxGlatt: 0, dist: 0, lastRunMaxHr: 0, foiling: false };
  uhr._resetRun();
  const s = uhr.state;
  let lat = 47.65, t = 0, p = null, prev = null;
  for (const [n, v, gps] of plan) {
    for (let i = 0; i < n; i++) {
      t++; lat += v * M_GRAD;
      const fix = gps !== false, el = t * 1000;
      let speed = 0;
      if (fix) {
        if (p) speed = distM(p[0], p[1], lat, 9.18) / ((el - p[2]) / 1000);
        p = [lat, 9.18, el];
      } else if (!s.foiling) p = null;
      s.cur = fix ? speed : 0;
      if (fix) {
        if (prev) s.dist += distM(prev[0], prev[1], lat, 9.18);
        prev = [lat, 9.18];
        s.spdMaxGlatt = speed;
        uhr._luecke(el, lat, 9.18, speed, 120);
      }
      uhr._pushSpeed(s.cur, el, fix);
      uhr._updateRun(s.sp3, s.cur, s.dist, el);
    }
  }
  return s;
}

let fehler = 0;
const pruefe = (n, ok, extra = "") => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${extra}`); };
const ca = (ms, soll, tol) => Math.abs(ms - soll) <= tol;

let s = fahrt([[5, 0], [30, 4], [1, 4, false], [30, 4], [2, 4, false], [30, 4], [20, 0.3]]);
pruefe("1 s und 2 s Luecke mitten im Lauf: ein Lauf", s.runCount === 1 && ca(s.lastRunDurMs, 93000, 3000), ` (${s.runCount}, ${s.lastRunDurMs} ms)`);
s = fahrt([[5, 0], [50, 3.4], [8, 3.4, false], [50, 3.4], [20, 0.3]]);
pruefe("Arm unter Wasser 8 s, weitergefahren: EIN Lauf", s.runCount === 1 && ca(s.lastRunDurMs, 108000, 3000), ` (${s.runCount}, ${s.lastRunDurMs} ms)`);
s = fahrt([[5, 0], [69, 3.4], [36, 0, false], [40, 0.3]]);
pruefe("Sturz, 36 s ohne GPS: Ende am letzten guten Fix", s.runCount === 1 && ca(s.lastRunDurMs, 69000, 2000) && Math.abs(s.lastRunDistM - 69 * 3.4) < 30,
  ` (${s.lastRunDurMs} ms, ${Math.round(s.lastRunDistM)} m)`);
s = fahrt([[5, 0], [51, 3.4], [10, 0.5, false], [40, 0.3]]);
pruefe("10 s Luecke ab 1 s vor Laufende: Ende vor der Luecke", s.runCount === 1 && ca(s.lastRunDurMs, 51000, 2000), ` (${s.lastRunDurMs} ms)`);
s = fahrt([[5, 0], [40, 4], [20, 4, false], [40, 4], [20, 0.3]]);
pruefe("20 s Luecke, schnell weiter: zwei Laeufe wie der Server", s.runCount === 2 && ca(s.lastRunDurMs, 40000, 5000), ` (${s.runCount}, ${s.lastRunDurMs} ms)`);
s = fahrt([[5, 0], [40, 4], [20, 0.3]]);
pruefe("ohne Luecke unveraendert", s.runCount === 1 && ca(s.lastRunDurMs, 40000, 2000), ` (${s.lastRunDurMs} ms)`);

console.log(fehler ? `\n${fehler} FEHLER` : "\nalles gruen");
process.exit(fehler ? 1 : 0);
