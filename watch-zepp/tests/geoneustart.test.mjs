// GPS-Neustart nach Funkstille (15.11.2026) — aus der QUELLE geschnitten, wie laufluecke.test.mjs.
//
//     node tests/geoneustart.test.mjs
//
// Die App startete den GPS-Sensor nur einmal. Jetzt: 20 s ohne Fix in der Aufnahme -> stop/start, danach fruehestens
// wieder nach 30 s. Gezaehlt werden Neustarts, Sekunden ohne Fix und die laengste Funkstille (messweg).
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
const konst = ["GEO_NEUSTART_NACH_MS", "GEO_NEUSTART_ABSTAND_MS"]
  .map((n) => { const m = new RegExp(`^const ${n} = [^\\n]*$`, "m").exec(quelle); if (!m) throw new Error(n); return m[0]; })
  .join("\n");
const teile = ["_geoWache", "_geoNeustart", "_geoModus", "_geoMessweg"].map(schneide).join(",\n");
const uhr = new Function(`${konst}\n return { state: null, ${teile} };`)();

let fehler = 0;
const pruefe = (ok, text) => { if (!ok) { fehler++; console.log("FEHLER:", text); } else console.log("ok:", text); };

function sensor({ modus = 2, wirft = false } = {}) {
  const log = [];
  return {
    log,
    start() { log.push("start"); if (wirft) throw new Error("kaputt"); },
    stop() { log.push("stop"); },
    onChange() { log.push("on"); },
    offChange() { log.push("off"); },
    getSetting() { return { mode: modus }; },
  };
}

// plan: Liste von true/false je Sekunde (Fix ja/nein)
function fahrt(plan, geo) {
  const t0 = 1_000_000;
  uhr.state = { geo, geoCallback: () => {}, startedAtMs: t0, geoFixMs: t0, geoNeustartMs: 0,
                geoNeustarts: 0, geoAusS: 0, geoAusMaxS: 0, geoAusLauf: 0 };
  uhr.state.geoModusStart = uhr._geoModus();
  plan.forEach((fix, i) => uhr._geoWache(fix, t0 + (i + 1) * 1000));
  return uhr._geoMessweg();
}

// 1) Durchgehend Fix: kein Neustart
let geo = sensor();
let mw = fahrt(Array(120).fill(true), geo);
pruefe(mw.gps_neustart === 0 && geo.log.length === 0, "durchgehend Fix -> kein Neustart");
pruefe(mw.gps_aus_s === 0 && mw.gps_modus === 2, "keine Sekunde ohne Fix, Modus gelesen");

// 2) 19 s Funkstille: noch kein Neustart
geo = sensor();
mw = fahrt([...Array(10).fill(true), ...Array(19).fill(false), ...Array(10).fill(true)], geo);
pruefe(mw.gps_neustart === 0, "19 s ohne Fix -> noch kein Neustart");
pruefe(mw.gps_aus_s === 19 && mw.gps_aus_max_s === 19, "19 s gezaehlt");

// 3) 100 s Funkstille: Neustart bei 20 s, dann alle 30 s (20, 50, 80) -> 3
geo = sensor();
mw = fahrt([...Array(10).fill(true), ...Array(100).fill(false), ...Array(10).fill(true)], geo);
pruefe(mw.gps_neustart === 3, `100 s ohne Fix -> 3 Neustarts (ist ${mw.gps_neustart})`);
pruefe(geo.log.slice(0, 4).join(",") === "off,stop,start,on", "Reihenfolge: abmelden, stop, start, anmelden");
pruefe(mw.gps_aus_s === 100 && mw.gps_aus_max_s === 100, "100 s gezaehlt, laengste Stille 100 s");

// 4) Zwei Stillen: die laengste zaehlt als Maximum, die Summe beider als Zeit ohne Fix
geo = sensor();
mw = fahrt([...Array(5).fill(true), ...Array(25).fill(false), ...Array(5).fill(true), ...Array(40).fill(false), true], geo);
pruefe(mw.gps_aus_s === 65 && mw.gps_aus_max_s === 40, "Summe 65 s, laengste 40 s");
pruefe(mw.gps_neustart === 2, `je Stille ein Neustart (ist ${mw.gps_neustart})`);

// 5) Sensor wirft beim Start: Aufnahme laeuft weiter, Neustart wird trotzdem gezaehlt
geo = sensor({ wirft: true });
let ok = true;
try { mw = fahrt(Array(40).fill(false), geo); } catch (e) { ok = false; }
pruefe(ok && mw.gps_neustart === 1, "Fehler beim Neustart kostet die Aufnahme nicht");

// 6) Ortungsmodus nicht lesbar -> -1
geo = sensor(); geo.getSetting = () => { throw new Error("alt"); };
mw = fahrt([true], geo);
pruefe(mw.gps_modus === -1, "Modus nicht lesbar -> -1");

console.log(fehler ? `\n${fehler} Fehler` : "\nalle ok");
process.exit(fehler ? 1 : 0);
