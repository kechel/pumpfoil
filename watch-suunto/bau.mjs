// Setzt die SuuntoPlus-App (app/) aus den Quellen zusammen. Aufruf: node bau.mjs
// Quellen: quelle/*.js (Suunto), ../watch-huawei/common/lauf.js + Teile von seiten.js (gleiche
// Lauf-Regeln, Alarme, Felder und Seiten wie alle Uhren), Feld-Texte aus ../watch-zepp/page/index.js.
// app/ liegt im Repo, damit Jan es direkt im SuuntoPlus Editor oeffnet; test/bau.test.mjs prueft,
// dass es zum Quellstand passt.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const W = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(W, "..");
const lies = (p) => fs.readFileSync(path.resolve(W, p), "utf8");

/** Top-level `function X(…) {…}` -> `var X = function (…) {…};` (Firmware-Regel, s. uhr.js). */
export function alsVar(src) {
  const zeilen = src.split("\n"), out = [];
  let offen = false;
  for (const z of zeilen) {
    const m = z.match(/^function ([A-Za-z_$][\w$]*)\s*\((.*)$/);
    if (m) {
      const rest = "var " + m[1] + " = function (" + m[2];
      if (/\}\s*$/.test(z) && !/\{\s*$/.test(z)) { out.push(rest.replace(/\}\s*$/, "};")); continue; }
      out.push(rest); offen = true; continue;
    }
    if (offen && z === "}") { out.push("};"); offen = false; continue; }
    out.push(z);
  }
  return out.join("\n");
}

/** Bestimmte Top-Level-Funktionen aus einer Datei holen (bis zur schliessenden `}` in Spalte 0). */
export function funktionen(src, namen) {
  const zeilen = src.split("\n"), out = [];
  for (const n of namen) {
    const i = zeilen.findIndex((z) => z.startsWith("function " + n + "("));
    if (i < 0) throw new Error("Funktion fehlt: " + n);
    if (/\}\s*$/.test(zeilen[i]) && !/\{\s*$/.test(zeilen[i])) { out.push(zeilen[i]); continue; }
    let j = i;
    while (zeilen[j] !== "}") j++;
    out.push(zeilen.slice(i, j + 1).join("\n"));
  }
  return out.join("\n\n");
}

function ohneExport(src) { return src.replace(/\nexport default[\s\S]*$/, "\n"); }

/** Feld-Texte (Amazfit-Tabelle, 15 Sprachspalten) als ext-Funktion: (sprache) -> {schluessel: text}. */
export function texte() {
  const src = fs.readFileSync(path.join(R, "watch-zepp/page/index.js"), "utf8");
  const tab = {};
  for (const z of src.split("\n")) {
    const m = z.match(/^\s*"((?:f|rec)\.[A-Za-z0-9]+)":\s*(.*?),?\s*$/);
    if (!m || tab[m[1]]) continue;
    try { tab[m[1]] = JSON.parse(m[2].replace(/,\s*$/, "")); } catch { /* mehrzeilig: auslassen */ }
  }
  const nimm = ["f.kmh3s", "f.kmhAvg", "f.kmhMax", "f.bpmAvg", "f.bpmMax", "f.time", "f.dist", "f.clock",
    "f.runActive", "f.runTime", "f.runDist", "f.lastRunTime", "f.lastRunDist", "f.lastRunAvg", "f.lastRunMax",
    "f.runs", "f.lastRunMaxHr", "f.allRunsDist", "f.allRunsTime", "rec.paused"];
  const kurz = {};
  for (const k of nimm) {
    if (!tab[k]) throw new Error("Text fehlt in watch-zepp: " + k);
    kurz[k] = tab[k];
  }
  // Schluessel wie seiten.js feld() sie anfragt (ohne „f."), plus die eigenen mit „f."/„rec."
  return "function (sp) {\n  var T = " + JSON.stringify(kurz) + ";\n" +
    "  var o = {}, k, v;\n  for (k in T) { v = T[k]; v = typeof v === 'string' ? v : (v[sp] || v[3]);\n" +
    "    o[k] = v; if (k.indexOf('f.') === 0) o[k.substring(2)] = v; }\n  return o;\n}\n";
}

// Sprachen der Einstellung (Suunto-App) -> Spalte der Amazfit-Tabelle
export const SPRACHEN = [["English", 3], ["Deutsch", 0], ["Schwiizerdütsch", 1], ["Österreichisch", 2],
  ["Français", 4], ["Italiano", 5], ["Español", 6], ["Português", 7], ["Bahasa Indonesia", 8], ["Русский", 9],
  ["Nederlands", 10], ["Suomi", 11], ["Čeština", 12], ["日本語", 13], ["中文", 14]];

export function mainJs() {
  const lauf = alsVar(ohneExport(fs.readFileSync(path.join(R, "watch-huawei/common/lauf.js"), "utf8")));
  const seiten = alsVar(funktionen(fs.readFileSync(path.join(R, "watch-huawei/common/seiten.js"), "utf8"),
    ["pad", "mmss", "distVal", "distUnit", "feldZahl", "feld", "klassisch", "satz", "ring"]));
  const kopf = "// ERZEUGT von watch-suunto/bau.mjs — nicht von Hand aendern, Quellen in watch-suunto/quelle/.\n";
  return kopf + [
    "// ---- watch-huawei/common/lauf.js ----", lauf,
    "// ---- watch-huawei/common/seiten.js (Felder, Seiten) ----", seiten,
    "// ---- quelle/pumpe.js ----", alsVar(lies("quelle/pumpe.js")),
    "// ---- quelle/funk.js ----", alsVar(lies("quelle/funk.js")),
    "// ---- quelle/uhr.js ----",
    lies("quelle/uhr.js").replace("sprache = einstellung(\"sprache\", \"en\");",
      "sprache = [" + SPRACHEN.map((s) => s[1]).join(",") + "][+einstellung(\"sprache\", \"0\") | 0];\n  if (typeof sprache !== \"number\") sprache = 3;"),
  ].join("\n");
}

export function manifest() {
  const quelle = (name, source) => ({ name, source, type: "subscribe" });
  return {
    name: "Pumpfoil",
    version: "1.00",
    author: "pumpfoil.org",
    description: "Runs, pumps and cadence on the watch; raw data to the Pumpfoil phone app",
    type: "device",
    usage: "workout",
    modificationTime: 1792195200,
    in: [
      quelle("tmr", "Activity/ActivityTimer"),
      quelle("sp", "Activity/Current/Speed"),
      quelle("hr", "Activity/Move/-1/HeartRate/Current"),
      quelle("pos", "Fusion/Location/GeoCoordinates"),
      quelle("rdy", "Fusion/Location/Readiness"),
      quelle("acc", "Fusion/Zapp/Accelerometer"),
      quelle("utc", "Dev/Time"),
      quelle("lt", "Dev/Time/LocalTime/Min"),
      quelle("alt", "Fusion/Altitude"),
      quelle("asc", "Fusion/Altitude/Ascent"),
    ],
    out: [
      { name: "con" },
      { name: "pf_foil", log: true, shownName: "Pumpfoil run", format: "Count_Threedigits" },
      { name: "pf_p1", log: true, shownName: "Pump marker", format: "Count_Fivedigits" },
      { name: "pf_p2", log: true, shownName: "Pump marker 2", format: "Count_Fivedigits" },
      { name: "pf_int", log: true, shownName: "Motion [mg]", format: "Count_Fourdigits" },
      { name: "pf_peak", log: true, shownName: "Peak [mg]", format: "Count_Fourdigits" },
      { name: "pumps", format: "Count_Fourdigits" },
      { name: "laeufe", format: "Count_Threedigits" },
    ],
    template: [{ name: "d.html" }],
    settings: [
      { shownName: "Raw data to phone app", path: "handy", type: "boolean" },
      { shownName: "Raw data rate", path: "hz", type: "enum", values: ["25 Hz", "50 Hz"] },
      { shownName: "Language", path: "sprache", type: "enum", values: SPRACHEN.map((s) => s[0]) },
    ],
  };
}

export function dataJson() { return { handy: "true", hz: "0", sprache: "0" }; }

export function dateien() {
  return {
    "manifest.json": JSON.stringify(manifest(), null, 2) + "\n",
    "main.js": mainJs(),
    "ext1.js": texte(),
    "d.html": lies("vorlagen/d.html"),
    "data.json": JSON.stringify(dataJson(), null, 2) + "\n",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ziel = path.join(W, "app");
  fs.mkdirSync(ziel, { recursive: true });
  for (const [n, inhalt] of Object.entries(dateien())) fs.writeFileSync(path.join(ziel, n), inhalt);
  console.log("app/ geschrieben:", Object.keys(dateien()).join(", "));
}
