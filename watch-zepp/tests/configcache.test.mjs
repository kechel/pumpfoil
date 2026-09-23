// Profil-Zwischenspeicher der Zepp-App in Node nachgestellt — aus der QUELLE geschnitten.
//
//     node tests/configcache.test.mjs
//
// WOFUER: ohne ihn standen nach jedem App-Start die Standard-Bildschirme da, bis ein CONFIG
// durchkam — am Wasser also fast immer (Jan, 23.09.2026). Geprueft wird das, was hier Logik ist:
// was gesichert wird, was bewusst NICHT, und dass der Rueckweg denselben Stand ergibt.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const start = quelle.indexOf(`    ${name}(r) {`) >= 0
    ? quelle.indexOf(`    ${name}(r) {`) : quelle.indexOf(`    ${name}() {`);
  if (start < 0) throw new Error(`${name} nicht gefunden`);
  let tiefe = 0;
  for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(`${name} nicht abgeschlossen`);
}
const MAX = Number(/const CONFIG_CACHE_MAX = (\d+);/.exec(quelle)[1]);

const flash = new Map();
const store = {
  getItem: (k, d) => (flash.has(k) ? flash.get(k) : d),
  setItem: (k, v) => flash.set(k, String(v)),
};
// Die beiden Methoden in ein Objekt giessen; `_configAnwenden` wird ersetzt, es haengt an der
// ganzen Oberflaeche und ist hier nicht der Pruefgegenstand.
const src = `return { ${schneide("_configSichern")}, ${schneide("_configLaden")},
  _configAnwenden(r) { this.zuletzt = r; } };`;
const uhr = new Function("store", "CONFIG_CACHE_MAX", src.replace(/^    /gm, ""))(store, MAX);

let fehler = 0;
const pruefe = (n, ok) => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}`); };

console.log("1) Leere Ablage: nichts anzuwenden");
flash.clear();
pruefe("_configLaden meldet false", uhr._configLaden() === false);

console.log("\n2) Rundlauf: was reingeht, kommt wieder raus");
{
  const cfg = { pages: [[0, 1, 2, 3], [1, 0, [["t", 10, 20]]]], views: [4, 5],
                foils: [{ id: 7, label: "Manta XL", min: 12, max: 22 }],
                hrZones: [0, 1, 2, 3, 4, 5], speedZones: [0, 4, 8, 12, 16, 20],
                language: "de", recordMode: "lite", autoStart: true };
  uhr._configSichern(cfg);
  uhr.zuletzt = null;
  pruefe("geladen", uhr._configLaden() === true);
  pruefe("Seiten identisch", JSON.stringify(uhr.zuletzt.pages) === JSON.stringify(cfg.pages));
  pruefe("Foils identisch", JSON.stringify(uhr.zuletzt.foils) === JSON.stringify(cfg.foils));
  pruefe("Zonen identisch", JSON.stringify(uhr.zuletzt.speedZones) === JSON.stringify(cfg.speedZones));
}

console.log("\n3) Zwei Felder gelten NUR fuer den Augenblick");
{
  flash.clear();
  uhr._configSichern({ pages: [[0, 1, 2, 3]], revoked: true, latestVersion: "1.0.99" });
  uhr._configLaden();
  pruefe("revoked nicht gesichert", uhr.zuletzt.revoked === undefined);
  pruefe("latestVersion nicht gesichert", uhr.zuletzt.latestVersion === undefined);
  pruefe("der Rest schon", Array.isArray(uhr.zuletzt.pages));
}

console.log("\n4) Zu gross wird gar nicht erst abgelegt");
{
  flash.clear();
  uhr._configSichern({ pages: [[0, 1, 2, 3]] });
  const klein = flash.get("cfg");
  uhr._configSichern({ fuellung: "x".repeat(MAX + 100) });
  pruefe("der alte Stand bleibt stehen", flash.get("cfg") === klein);
}

console.log("\n5) Kaputter Inhalt reisst nichts mit");
{
  flash.clear(); flash.set("cfg", "{kein json");
  pruefe("meldet false statt zu werfen", uhr._configLaden() === false);
  flash.set("cfg", "42");
  pruefe("Zahl ist kein Profil", uhr._configLaden() === false);
}

console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
