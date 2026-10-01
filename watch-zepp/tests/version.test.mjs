// APP_VERSION in page/index.js MUSS version.name in app.json sein.
//
//     node tests/version.test.mjs
//
// WOZU: die Uhr zeigt und meldet APP_VERSION (Startbildschirm „v…", CONFIG an den Server, damit
// app_version der Sessions). Zweimal wurde beim Bump nur app.json geaendert — 1.0.4 und 1.0.13
// (01.10.2026, erst in Jans Testsession #12510 aufgefallen, die „1.0.12" meldete).
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
const m = quelle.match(/^const APP_VERSION = "([^"]+)";/m);
if (!m) { console.log("FEHL APP_VERSION nicht gefunden"); process.exit(1); }
const soll = app.app.version.name;
if (m[1] !== soll) {
  console.log(`FEHL APP_VERSION ${m[1]} ≠ app.json ${soll} — beim Bump BEIDE Stellen aendern`);
  process.exit(1);
}
console.log(`ok   APP_VERSION ${m[1]} = app.json`);
