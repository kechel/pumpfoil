// Summe aller Laeufe (Feld 22/23) — aus der QUELLE geschnitten, nicht abgetippt.
//
//     node tests/laufsumme.test.mjs
//
// WOZU: Feld 22/23 summieren alle erkannten Laeufe INKL. des laufenden. Die Falle ist die
// Fortsetzung: endet ein Lauf kurz und geht ohne echten Stopp weiter, laeuft er ab SEINEM Start
// live weiter — sein Anteil darf dann nicht zusaetzlich in der Summe stehen. Geprueft wird hier,
// dass die Summe weder am Lauf-Ende springt noch bei der Fortsetzung doppelt zaehlt.
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
// Konstanten der Lauf-Erkennung ebenfalls aus der Quelle (Modul-Gueltigkeitsbereich).
const konst = ["RUN_ENTER_MPS", "RUN_ENTER_DWELL", "MAX_FOIL_MPS", "NOSTOP_MPS", "MIN_RUN_MS"].map((n) => {
  const m = new RegExp(`^const ${n} = [^\\n]*$`, "m").exec(quelle);
  if (!m) throw new Error(n + " nicht gefunden");
  return m[0];
}).join("\n");

const teile = ["_updateRun", "_runsSum", "_resetRun"].map(schneide).join(",\n");
const uhr = new Function(`${konst}
  return { state: null, ${teile} };`)();
const RUN_ENTER_DWELL = Number(/const RUN_ENTER_DWELL = (\d+)/.exec(quelle)[1]);
const RUN_EXIT_DWELL = Number(/RUN_EXIT_DWELL = (\d+)/.exec(quelle)[1]);

// Eine Aufnahme mit 1-Hz-Ticks. dist = Kilometerzaehler der Session (Feld 4).
function frisch() {
  uhr.state = { hr: 0, spdMaxClean: 0, dist: 0, lastRunMaxHr: 0 };
  uhr._resetRun();
  return { t: 0 };
}
// n Sekunden mit Geschwindigkeit v fahren; liefert je Tick die Summe [ms, m].
function fahre(z, n, v, verlauf) {
  const s = uhr.state;
  for (let i = 0; i < n; i++) {
    z.t += 1000;
    s.dist += v;
    s.spdMaxClean = v;
    uhr._updateRun(v, v, s.dist, z.t);
    if (verlauf) verlauf.push(uhr._runsSum(z.t));
  }
}

let fehler = 0;
const pruefe = (n, ok, extra = "") => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${extra}`); };
// Von Tick zu Tick darf die Summe nur um die Rueckdatierung springen, wie Feld 14/15 auch: beim
// Lauf-Start kommen die RUN_ENTER_DWELL Anlaufsekunden auf einmal dazu, beim Lauf-Ende fallen die
// Auslaufsekunden weg (Ende auf den ersten langsamen Tick). Bei einer Fortsetzung kommt
// zusaetzlich die Luecke des Einbruchs dazu (der Lauf umspannt sie, wie Feld 14/16). Ein doppelt
// gezaehlter Lauf waere ein Sprung um den GANZEN Lauf und faellt hier auf.
const glatt = (v, vMax, vLangsam, lueckeS = 0) => v.every((x, i) => {
  if (i === 0) return true;
  const dt = x[0] - v[i - 1][0], dm = x[1] - v[i - 1][1];
  return dt <= (RUN_ENTER_DWELL + lueckeS) * 1000 + 1e-9 && dm <= (RUN_ENTER_DWELL + lueckeS) * vMax + 1e-9
    && dt >= -RUN_EXIT_DWELL * 1000 - 1e-9 && dm >= -RUN_EXIT_DWELL * vLangsam - 1e-9;
});

console.log("1) Zwei getrennte Laeufe mit echtem Stopp");
{
  const z = frisch(), s = uhr.state;
  fahre(z, 10, 0.5);                 // Steg/Wasser: kein Lauf
  pruefe("vor dem ersten Lauf 0", uhr._runsSum(z.t)[0] === 0 && uhr._runsSum(z.t)[1] === 0);
  fahre(z, 30, 5);                   // Lauf 1
  fahre(z, 60, 0.3);                 // echter Stopp, zurueck schwimmen
  const nach1 = uhr._runsSum(z.t);
  pruefe("ein Lauf gezaehlt", s.runCount === 1);
  pruefe("Summe = letzter Lauf", nach1[0] === s.lastRunDurMs && nach1[1] === s.lastRunDistM,
    ` (${nach1[0]} ms / ${nach1[1]} m)`);
  fahre(z, 20, 6);                   // Lauf 2
  fahre(z, 60, 0.3);
  const nach2 = uhr._runsSum(z.t);
  pruefe("zwei Laeufe gezaehlt", s.runCount === 2);
  pruefe("Summe = Lauf 1 + Lauf 2", nach2[0] === nach1[0] + s.lastRunDurMs && nach2[1] === nach1[1] + s.lastRunDistM,
    ` (${nach2[0]} ms / ${nach2[1]} m)`);
  pruefe("Schwimmen/Steg zaehlt nicht", nach2[1] < s.dist, ` (Summe ${nach2[1]} m < Feld 4 ${s.dist} m)`);
}

console.log("\n2) Summe waechst im Lauf und springt am Lauf-Ende nicht");
{
  const z = frisch();
  const v = [];
  fahre(z, 30, 5, v);
  const imLauf = uhr._runsSum(z.t);
  pruefe("waechst waehrend des Laufs", imLauf[0] > 0 && imLauf[1] > 0);
  fahre(z, 30, 0.3, v);
  pruefe("kein Sprung ueber das Ende", glatt(v, 5, 0.3));
  const ende = uhr._runsSum(z.t);
  pruefe("Endwert = abgeschlossener Lauf", ende[0] === uhr.state.lastRunDurMs);
}

console.log("\n3) Fortsetzung nach kurzem Einbruch: kein doppelter Anteil");
{
  const z = frisch(), s = uhr.state;
  const v = [];
  fahre(z, 30, 5, v);
  fahre(z, RUN_EXIT_DWELL + 2, 2.0, v);  // Einbruch unter die Ausstiegsgrenze, aber kein Stopp
  pruefe("Lauf vorlaeufig beendet", !s.foiling && s.runCount === 1);
  const vorher = uhr._runsSum(z.t);
  fahre(z, 30, 5, v);                     // weiter, ohne Stopp -> Fortsetzung
  pruefe("als Fortsetzung erkannt", s.foiling && s.runCount === 1);
  const live = uhr._runsSum(z.t);
  // Live = der GANZE Lauf ab seinem ersten Start, nicht alter Anteil + ganzer Lauf.
  pruefe("live nicht doppelt", live[0] === z.t - s.runStartMs && live[1] === s.dist - s.runStartDist,
    ` (${live[0]} ms, vorher ${vorher[0]} ms)`);
  fahre(z, 60, 0.3, v);
  const ende = uhr._runsSum(z.t);
  pruefe("ein Lauf, Summe = dieser Lauf", s.runCount === 1 && ende[0] === s.lastRunDurMs && ende[1] === s.lastRunDistM,
    ` (${ende[0]} ms / ${ende[1]} m)`);
  pruefe("kein Sprung ueber Ende + Fortsetzung", glatt(v, 5, 2.0, RUN_EXIT_DWELL + 2));
}

console.log("\n4) Fortsetzung nach einem frueheren Lauf: nur der fortgesetzte wird zurueckgenommen");
{
  const z = frisch(), s = uhr.state;
  fahre(z, 30, 5); fahre(z, 60, 0.3);   // Lauf 1, echter Stopp
  const l1 = uhr._runsSum(z.t);
  fahre(z, 25, 6); fahre(z, RUN_EXIT_DWELL + 2, 2.0); fahre(z, 25, 6); fahre(z, 60, 0.3);
  const ende = uhr._runsSum(z.t);
  pruefe("zwei Laeufe", s.runCount === 2);
  pruefe("Summe = Lauf 1 + ganzer Lauf 2", ende[0] === l1[0] + s.lastRunDurMs && ende[1] === l1[1] + s.lastRunDistM,
    ` (${ende[0]} ms / ${ende[1]} m)`);
}

console.log("\n5) Verworfener Fehlstart zaehlt nicht");
{
  const z = frisch(), s = uhr.state;
  fahre(z, RUN_ENTER_DWELL, 3.2);       // gerade so erkannt ...
  pruefe("kurz als Lauf live", s.foiling);
  fahre(z, 30, 0.3);                    // ... und sofort wieder im Wasser
  const r = uhr._runsSum(z.t);
  pruefe("verworfen, Summe 0", s.runCount === 0 && r[0] === 0 && r[1] === 0);
}

console.log("\n6) Neue Aufnahme setzt zurueck");
{
  frisch();
  const z = { t: 0 };
  fahre(z, 30, 5); fahre(z, 60, 0.3);
  uhr._resetRun();
  const r = uhr._runsSum(z.t);
  pruefe("nach _resetRun 0", r[0] === 0 && r[1] === 0);
}

console.log(fehler ? `\n${fehler} FEHLER` : "\nalles gruen");
process.exit(fehler ? 1 : 0);
