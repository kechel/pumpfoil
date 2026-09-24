// Seitenordnung waehrend der Aufnahme — aus der QUELLE geschnitten, nicht abgetippt.
//
//     node tests/seiten.test.mjs
//
// WOZU: seit dem 24.09. liegen VIER Sonderseiten um den Datenring herum (Verwerfen, Stopp,
// …Ring…, Stopp, Verwerfen). Die Arithmetik steckte vorher an zehn Stellen verstreut; hier wird
// geprueft, dass die Helfer sie an einer Stelle richtig machen — vor allem, dass auf Seite 0
// NICHT das Stoppen liegt und der Ring bei 2 beginnt.
import { readFileSync } from "node:fs";
const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
const ERSTE = Number(/const ERSTE_DATENSEITE = (\d+);/.exec(quelle)[1]);
function schneide(name) {
  const m = new RegExp(`    ${name}\\(([^)]*)\\) \\{ (.*?) \\},`).exec(quelle);
  if (!m) throw new Error(name + " nicht gefunden");
  return new Function(m[1], m[2]);
}
const roh = {};
for (const n of ["_letzteSeite", "_istVerwerfen", "_istStopp", "_ringIndex"]) {
  const m = new RegExp(`    ${n}\\(([^)]*)\\) \\{ ([^\\n]*?) \\},`).exec(quelle);
  if (!m) throw new Error(n + " nicht gefunden");
  roh[n] = m;
}
function uhr(ringLen) {
  const o = { _ringLen: () => ringLen };
  for (const [n, m] of Object.entries(roh)) {
    o[n] = new Function("self", m[1], "return (function(){ " + m[2].replace(/this\./g, "self.") + " }).call(self);").bind(null, o);
  }
  return o;
}
let fehler = 0;
const pruefe = (n, ok) => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}`); };

for (const n of [1, 3, 5]) {
  const u = uhr(n);
  const last = u._letzteSeite();
  console.log(`\nRing mit ${n} Datenseite(n) -> Seiten 0..${last}`);
  pruefe("letzte Seite = Ring + 3", last === n + 3);
  pruefe("0 ist VERWERFEN", u._istVerwerfen(0) && !u._istStopp(0));
  pruefe("1 ist STOPP", u._istStopp(1) && !u._istVerwerfen(1));
  pruefe("letzte ist VERWERFEN", u._istVerwerfen(last) && !u._istStopp(last));
  pruefe("vorletzte ist STOPP", u._istStopp(last - 1) && !u._istVerwerfen(last - 1));
  pruefe(`erste Datenseite ist ${ERSTE}`, !u._istVerwerfen(ERSTE) && !u._istStopp(ERSTE)
         && u._ringIndex(ERSTE) === 0);
  pruefe("letzte Datenseite trifft das Ringende", u._ringIndex(last - 2) === n - 1);
  const ring = [];
  for (let p = 0; p <= last; p++) if (u._ringIndex(p) >= 0) ring.push(u._ringIndex(p));
  pruefe("jeder Ringeintrag genau einmal erreichbar",
         ring.length === n && ring.every((v, i) => v === i));
  pruefe("Sonderseiten liefern -1", u._ringIndex(0) === -1 && u._ringIndex(1) === -1
         && u._ringIndex(last) === -1 && u._ringIndex(last - 1) === -1);
}
console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
