// Setzt die SuuntoPlus-App (app/) aus den Quellen zusammen. Aufruf: node bau.mjs
// Quellen: quelle/*.js (Suunto), ../watch-huawei/common/lauf.js + Teile von seiten.js (gleiche
// Lauf-Regeln, Alarme, Felder und Seiten wie alle Uhren), Feld-Texte aus ../watch-zepp/page/index.js.
// app/ liegt im Repo, damit Jan es direkt im SuuntoPlus Editor oeffnet; test/bau.test.mjs prueft,
// dass es zum Quellstand passt.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const W = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(W, "..");
const lies = (p) => fs.readFileSync(path.resolve(W, p), "utf8");
// Grafik-Ausgaben g0…g(n-1): die Zahl steht EINMAL in quelle/anzeige.js. Der Editor erlaubt hoechstens
// 20 Ausgaben (Fehler beim Bauen, 17.10.; die Referenz sagt noch 25): con + 5 Log-Kanaele + 13 + gv.
export const GRAFIKEN = Number(/var ANZ_GRAFIKEN = (\d+);/.exec(lies("quelle/anzeige.js"))[1]);

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

/** Top-Level-`var NAME = …;` (bis zur Zeile, die mit `;` endet). */
export function variablen(src, namen) {
  const zeilen = src.split("\n"), out = [];
  for (const n of namen) {
    const i = zeilen.findIndex((z) => z.startsWith("var " + n + " ") || z.startsWith("var " + n + "="));
    if (i < 0) throw new Error("Variable fehlt: " + n);
    let j = i;
    while (!/;\s*(\/\/.*)?$/.test(zeilen[j])) j++;
    out.push(zeilen.slice(i, j + 1).join("\n"));
  }
  return out.join("\n");
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
  // eigene Texte der Suunto-App (Spalten wie SPRACHEN: de, gsw, de-AT, en, fr, it, es, pt, id, ru, nl, fi, cs, ja, zh)
  kurz["h.phone"] = ["Handy", "Handy", "Handy", "Phone", "Tél.", "Telefono", "Móvil", "Telemóvel", "HP", "Телефон",
    "Telefoon", "Puhelin", "Telefon", "スマホ", "手机"];
  // Schluessel wie seiten.js feld() sie anfragt (ohne „f."), plus die eigenen mit „f."/„rec."
  return "function (sp) {\n  var T = " + JSON.stringify(kurz) + ";\n" +
    "  var o = {}, k, v;\n  for (k in T) { v = T[k]; v = typeof v === 'string' ? v : (v[sp] || v[3]);\n" +
    "    o[k] = v; if (k.indexOf('f.') === 0) o[k.substring(2)] = v; }\n  o.paused = o['rec.paused'];\n  return o;\n}\n";
}

/** Standard-Layouts des Servers (server/app/data/standard_layouts.json) fest in der App — der Speicher
 *  der Uhr (~2 KB) fasst sie nicht; das Handy schickt dann nur „std" (s. SuuntoKonfig). Pruefsumme wie
 *  server/app/standard_layouts.py `pruefsumme`: erste 4 Bytes SHA-256 der Datei. */
export function standard() {
  const roh = fs.readFileSync(path.join(R, "server/app/data/standard_layouts.json"));
  const d = JSON.parse(roh.toString("utf8"));
  const form = (k) => (d[k] || []).map((l) => [1, (l.bg_color | 0), l.elements || []]);
  const seiten = { pages: form("on_foil"), offFoilPages: form("off_foil"), pausePages: form("pause") };
  return { hash: crypto.createHash("sha256").update(roh).digest().readUInt32BE(0),
    ext: "function () {\n  return " + JSON.stringify(seiten) + ";\n}\n" };
}

// Sprachen der Einstellung (Suunto-App) -> Spalte der Amazfit-Tabelle
export const SPRACHEN = [["English", 3], ["Deutsch", 0], ["Schwiizerdütsch", 1], ["Österreichisch", 2],
  ["Français", 4], ["Italiano", 5], ["Español", 6], ["Português", 7], ["Bahasa Indonesia", 8], ["Русский", 9],
  ["Nederlands", 10], ["Suomi", 11], ["Čeština", 12], ["日本語", 13], ["中文", 14]];

export function mainJs(debug = false) {
  const lauf = alsVar(ohneExport(fs.readFileSync(path.join(R, "watch-huawei/common/lauf.js"), "utf8")));
  const seitenSrc = fs.readFileSync(path.join(R, "watch-huawei/common/seiten.js"), "utf8");
  // Zeichner wie auf den Huawei-Uhren; `punkte` kommt aus quelle/anzeige.js (ein Befehl statt 12 Rechtecke)
  const seiten = variablen(seitenSrc, ["PALETTE", "ZONEN", "AUTO_WERT", "TINTE_280"]) + "\n" +
    alsVar(funktionen(seitenSrc, ["pad", "mmss", "distVal", "distUnit", "feldZahl", "feld", "klassisch", "satz", "ring",
      "farbe", "groesse", "zone", "istPuls", "wertFarbe", "fuellgrad", "mische", "zeichne", "klassik", "layout",
      "grafik", "rahmen"]));
  const kopf = "// ERZEUGT von watch-suunto/bau.mjs — nicht von Hand aendern, Quellen in watch-suunto/quelle/.\n";
  return kopf + [
    "// ---- watch-huawei/common/lauf.js ----", lauf,
    "// ---- watch-huawei/common/seiten.js (Felder, Seiten) ----", seiten,
    "// ---- quelle/kompakt.js ----", alsVar(lies("quelle/kompakt.js")),
    "// ---- quelle/anzeige.js ----", alsVar(lies("quelle/anzeige.js")),
    "// ---- quelle/pumpe.js ----", alsVar(lies("quelle/pumpe.js")),
    "// ---- quelle/funk.js ----", alsVar(lies("quelle/funk.js")),
    "// ---- quelle/uhr.js ----",
    "var STD_HASH = " + standard().hash + ";   // server/app/data/standard_layouts.json, s. bau.mjs standard()",
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
      // Bedeutung + Versionierung: quelle/uhr.js vor pumpMarker, docs/SUUNTO.md „Die Log-Kanaele".
      // Hoechstens 5 Kanaele: einer ist frei fuer spaeter.
      { name: "pf_e1", log: true, shownName: "Runs and pumps", format: "Count_Sixdigits" },
      { name: "pf_b1", log: true, shownName: "Motion per axis", format: "Count_Sixdigits" },
      { name: "pf_s1", log: true, shownName: "Peak and pump strength", format: "Count_Sixdigits" },
      { name: "pf_l1", log: true, shownName: "Arm position", format: "Count_Sixdigits" },
      // Grafik-Befehle der Datenseite (quelle/anzeige.js) + Zaehler, auf den die Vorlage neu zeichnet
      ...Array.from({ length: GRAFIKEN }, (_, i) => ({ name: "g" + i })),
      { name: "gv" },
    ],
    template: [{ name: "d.html" }],
    settings: [
      { shownName: "Raw data to phone app", path: "handy", type: "boolean" },
      { shownName: "Raw data rate", path: "hz", type: "enum", values: ["25 Hz", "50 Hz"] },
      { shownName: "Language", path: "sprache", type: "enum", values: SPRACHEN.map((s) => s[0]) },
    ],
  };
}

/** Datenseiten-Vorlage: <canvas> fuer Grafik + je Schriftklasse 3 Text-Elemente (quelle/anzeige.js). */
export function vorlage(debug = false) {
  const skript = lies("quelle/vorlage.js").replace(/^\s*\/\/.*$/gm, "").trim();
  if (skript.includes('"')) throw new Error("quelle/vorlage.js darf keine doppelten Anfuehrungszeichen enthalten");
  const klassen = ["sp-d-xxl", "sp-d-xl", "sp-d-l", "sp-d-m", "sp-d-s", "sp-d-xs", "sp-t-m", "sp-t-s", "sp-t-l", "sp-b-l"];   // = anzeige.js ANZ_KLASSEN
  const abos = Array.from({ length: GRAFIKEN }, (_, i) =>
    `A.push($.subscribe('Zapp/{zapp_index}/Output/g${i}', function(v) { G[${i}] = v || 0; }));`).join("\n    ");
  // je Schriftklasse und Ausrichtung ein Vorrat (quelle/anzeige.js ANZ_JE): 100 % breit, fest ausgerichtet
  const je = JSON.parse(/var ANZ_JE = (\{[^}]*\});/.exec(lies("quelle/anzeige.js"))[1].replace(/(\w): /g, '"$1": '));
  const ausr = { c: "center", l: "left", r: "right" };
  const texte = klassen.flatMap((k, ki) => Object.keys(je).flatMap((a) => Array.from({ length: je[a][ki] }, (_, i) =>
    `    <div id="k${ki}${a}_${i}" class="${k}${k.startsWith("sp-d") ? " f-num" : ""}" style="top:0;left:0;width:100%;text-align:${ausr[a]};visibility:hidden;">-</div>`))).join("\n");
  return `<!-- ERZEUGT von watch-suunto/bau.mjs. Datenseite wie auf den anderen Uhren: Grafik auf dem canvas,
     Texte aus dem Vorrat je Schriftklasse, gesetzt von main.js (quelle/anzeige.js). -->
<uiView
  onLoad="
    ${skript.split("\n").join("\n    ")}
    var A = [];
  "
  onActivate="
    ${abos}
    A.push($.subscribe('Zapp/{zapp_index}/Output/gv', function(v) { control('#cv', 'REFRESH'); }));
  "
  onDeactivate="
    for (var i = 0; i < A.length; i++) { $.unsubscribe(A[i]); }
    A = [];
  ">
  <div id="suuntoplus">
    <object id="cv" type="canvas" build="ctx => zeichneSeite(ctx)" style="position:absolute;left:0;top:0;width:100%;height:100%;" />
${texte}
  </div>
  <userInput>
    <!-- nur die untere Taste blaettert (wie Suuntos Beispiel MultiView); die obere bleibt Start/Pause/Stopp.
         17.10.: mit „up" belegt liess sich die Aufnahme im Simulator nicht mehr anhalten. -->
${debug ? `    <!-- DEBUG: jeden Tastendruck ins Systemlog (targetData: 0 lang-Start, 3 lang, 4 kurz …) -->
    <pushButton name="down" onButtonEvent="systemEvent('pf: Taste down ' + targetData)" onClick="$.put('/Zapp/{zapp_index}/Event', 2, null, 'int32');" />
${["up", "next", "upleft", "downleft"].map((b) => `    <pushButton name="${b}" onButtonEvent="systemEvent('pf: Taste ${b} ' + targetData)" />`).join("\n")}` :
`    <pushButton name="down" onClick="$.put('/Zapp/{zapp_index}/Event', 2, null, 'int32');" />`}
  </userInput>
</uiView>
`;
}

export function dataJson() { return { handy: "true", hz: "0", sprache: "0" }; }

/** debug = true: app-debug/ — Ablauf und jede Taste ins Systemlog, Name „Pumpfoil Debug". */
export function dateien(debug = false) {
  const m = manifest();
  if (debug) m.name = "Pumpfoil Debug";
  const js = mainJs();
  if (debug && !js.includes("var DEBUG = 0;")) throw new Error("DEBUG-Schalter fehlt in main.js");
  return {
    "manifest.json": JSON.stringify(m, null, 2) + "\n",
    "main.js": debug ? js.replace("var DEBUG = 0;", "var DEBUG = 1;") : js,
    "ext1.js": texte(),
    "ext2.js": standard().ext,
    "d.html": vorlage(debug),
    "data.json": JSON.stringify(dataJson(), null, 2) + "\n",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [dir, debug] of [["app", false], ["app-debug", true]]) {
    const ziel = path.join(W, dir);
    fs.mkdirSync(ziel, { recursive: true });
    for (const [n, inhalt] of Object.entries(dateien(debug))) fs.writeFileSync(path.join(ziel, n), inhalt);
    console.log(dir + "/ geschrieben:", Object.keys(dateien(debug)).join(", "));
  }
}
