// Lauf-Waechter der Zepp-App in Node nachgestellt (CLAUDE.md: „reine Funktionen der Uhren-Apps
// in Node nachstellen"). Die Funktionen werden AUS DER QUELLE geschnitten, nicht abgetippt —
// eine Kopie wuerde mit der naechsten Aenderung auseinanderlaufen und genau dann gruen bleiben,
// wenn sie es nicht mehr darf.
//
//     node tests/canary.test.mjs
//
// Geprueft wird der Ablauf, an dem der alte Waechter am 23.09.2026 im Emulator gescheitert ist:
// Absturz in der Aufnahme, Meldung scheitert (Handy weg), App stirbt erneut — und die Auskunft
// muss trotzdem die AUFNAHME nennen, nicht den Leerlauf des gescheiterten Versuchs.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const start = quelle.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} nicht gefunden`);
  let tiefe = 0, i = quelle.indexOf("{", start);
  for (let j = i; j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(`${name} nicht abgeschlossen`);
}

const flash = new Map();
const store = {
  getItem: (k, d) => (flash.has(k) ? flash.get(k) : d),
  setItem: (k, v) => flash.set(k, String(v)),
};
let memJetzt = { peak: 1288, total: 3072 };
const memRead = () => memJetzt;

const quellcode = ["canaryWrite", "canaryClear", "crashUebernehmen", "crashOffen", "crashGemeldet"]
  .map(schneide).join("\n");
const fabrik = new Function("store", "memRead",
  `${quellcode}\nreturn { canaryWrite, canaryClear, crashUebernehmen, crashOffen, crashGemeldet };`);
const W = fabrik(store, memRead);

const [BOOT, IDLE, RECORD, UPLOAD] = [1, 2, 3, 4];
let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${name}${ok ? "" : `\n         ist  ${JSON.stringify(ist)}\n         soll ${JSON.stringify(soll)}`}`);
};

// Einen App-Lauf nachspielen. `ende`: "sauber" | "absturz". `melden`: kam CONFIG durch?
function lauf({ phasen, ende, melden }) {
  const offen = W.crashUebernehmen();      // build()
  W.canaryWrite(BOOT);
  for (const p of phasen) W.canaryWrite(p);
  if (melden && offen.phase) W.crashGemeldet();
  if (ende === "sauber") W.canaryClear();  // onDestroy
  return offen;
}

console.log("1) Sauberer Betrieb meldet nichts");
flash.clear();
lauf({ phasen: [IDLE], ende: "sauber", melden: true });
pruefe("zweiter Start", lauf({ phasen: [IDLE], ende: "sauber", melden: true }).phase, 0);
pruefe("dritter Start nach Aufnahme+Upload",
  lauf({ phasen: [IDLE, RECORD, UPLOAD, IDLE], ende: "sauber", melden: true }).phase, 0);

console.log("\n2) Absturz in der Aufnahme, Meldung kommt durch");
flash.clear();
lauf({ phasen: [IDLE, RECORD], ende: "absturz", melden: true });
pruefe("gemeldete Phase", lauf({ phasen: [IDLE], ende: "sauber", melden: true }).phase, RECORD);
pruefe("danach nichts offen", W.crashOffen().phase, 0);

console.log("\n3) DER FALL VOM 23.09.: Meldung scheitert, App stirbt erneut");
flash.clear();
lauf({ phasen: [IDLE, RECORD], ende: "absturz", melden: true });      // Kill in der Aufnahme
lauf({ phasen: [IDLE], ende: "absturz", melden: false });             // Bridge weg -> stirbt wieder
const spaet = lauf({ phasen: [IDLE], ende: "sauber", melden: true }); // jetzt geht es raus
pruefe("meldet AUFNAHME, nicht Leerlauf", spaet.phase, RECORD);
pruefe("Speicherstand vom Absturz dabei", spaet.mem, { peak: 1288, total: 3072 });
pruefe("nach dem Melden geraeumt", W.crashOffen().phase, 0);

console.log("\n4) Sauberes Beenden raeumt einen offenen Absturz NICHT weg");
flash.clear();
lauf({ phasen: [IDLE, UPLOAD], ende: "absturz", melden: true });
lauf({ phasen: [IDLE], ende: "sauber", melden: false });   // Nutzer geht raus, bevor es rausging
pruefe("ueberlebt das saubere Ende", lauf({ phasen: [IDLE], ende: "sauber", melden: true }).phase, UPLOAD);

console.log("\n5) Speicherstand ist der vom ABSTURZ, nicht der aktuelle");
flash.clear();
memJetzt = { peak: 2900, total: 3072 };                    // knapp am Limit
lauf({ phasen: [IDLE, UPLOAD], ende: "absturz", melden: true });
memJetzt = { peak: 900, total: 3072 };                     // danach entspannt
pruefe("Spitze von damals", lauf({ phasen: [IDLE], ende: "sauber", melden: true }).mem,
  { peak: 2900, total: 3072 });
memJetzt = { peak: 1288, total: 3072 };

console.log("\n6) Uhr ohne getPerformance: Phase kommt trotzdem");
flash.clear();
const ohne = fabrik(store, () => null);
ohne.crashUebernehmen(); ohne.canaryWrite(BOOT); ohne.canaryWrite(IDLE); ohne.canaryWrite(RECORD);
const o = ohne.crashUebernehmen();
pruefe("Phase da", o.phase, RECORD);
pruefe("Speicher null statt Absturz", o.mem, null);

console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
