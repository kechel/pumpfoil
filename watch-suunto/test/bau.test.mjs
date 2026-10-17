// app/ muss zum Quellstand passen (nach jeder Aenderung: node bau.mjs) und darf nur ES5 enthalten.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { WURZEL } from "./lade.mjs";
import { dateien, manifest, GRAFIKEN } from "../bau.mjs";

test("app/ und app-debug/ sind aktuell, nur app-debug/ protokolliert", () => {
  for (const [dir, debug] of [["app", false], ["app-debug", true]]) {
    for (const [n, inhalt] of Object.entries(dateien(debug))) {
      const da = fs.readFileSync(path.join(WURZEL, dir, n), "utf8");
      assert.equal(da, inhalt, `${dir}/${n} veraltet — node bau.mjs`);
    }
  }
  assert.ok(fs.readFileSync(path.join(WURZEL, "app/main.js"), "utf8").includes("var DEBUG = 0;"));
  assert.ok(!fs.readFileSync(path.join(WURZEL, "app/d.html"), "utf8").includes("systemEvent"));
});

test("Manifest haelt die Grenzen der Referenz ein", () => {
  const m = manifest();
  assert.ok(m.in.length <= 10, "hoechstens 10 Eingaenge");
  assert.ok(m.out.length <= 25, "hoechstens 25 Ausgaenge");
  assert.ok(m.out.filter((o) => o.log).length <= 5, "hoechstens 5 Log-Kanaele");
  assert.ok(m.version.length <= 4);
  assert.ok(Buffer.byteLength(m.description) <= 100);
  assert.equal(m.out[0].name, "con", "BLE-App braucht out 'con'");
});

test("main.js: nur ES5, keine eigenen globalen function-Deklarationen", () => {
  const src = fs.readFileSync(path.join(WURZEL, "app/main.js"), "utf8");
  assert.ok(!/^\s*(let|const)\s/m.test(src), "let/const");
  assert.ok(!/=>/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "Pfeilfunktion");
  const erlaubt = new Set(["onLoad", "evaluate", "onExerciseStart", "onExercisePause", "onExerciseContinue",
    "onExerciseEnd", "onEvent", "onLap", "onAccelerometer", "getUserInterface", "getSummaryOutputs"]);
  for (const m of src.matchAll(/^function ([\w$]+)/gm)) assert.ok(erlaubt.has(m[1]), "globale function " + m[1]);
});

test("Vorlage d.html: Skript ist gueltiges ES5, Abos auf alle Grafik-Ausgaben, Elemente fuer alle Klassen", () => {
  const html = fs.readFileSync(path.join(WURZEL, "app/d.html"), "utf8");
  const onLoad = html.match(/onLoad="([^"]*)"/)[1];
  assert.doesNotThrow(() => new Function(onLoad + "\nreturn zeichneSeite;"));
  for (let i = 0; i < GRAFIKEN; i++) assert.ok(html.includes(`Output/g${i}'`), "Abo g" + i);
  assert.ok(html.includes("Output/gv'"));
  assert.equal((html.match(/id="k\d[lcr]_\d"/g) || []).length, 40 + 11 + 11, "Vorrat wie anzeige.js ANZ_JE");
  assert.ok(!/pushButton name="up"/.test(html), "obere Taste bleibt Start/Pause/Stopp der Firmware");
  assert.ok(!html.includes("%e"), "kein calc(… %e) — der Simulator verwirft es");
  const m = manifest();
  for (let i = 0; i < GRAFIKEN; i++) assert.ok(m.out.some((o) => o.name === "g" + i));
  assert.ok(m.out.length <= 20, "Editor: hoechstens 20 Ausgaben, sind " + m.out.length);
  assert.ok(fs.readFileSync(path.join(WURZEL, "quelle/vorlage.js"), "utf8").includes("gi < " + GRAFIKEN), "vorlage.js G-Laenge = ANZ_GRAFIKEN");
});

// Der Pruefer des SuuntoPlus Editors selbst (nicht im Repo; auf der VM unter ~/suuntoplus-editor, s. docs/SUUNTO.md).
// Fing am 17.10. erst bei Jan: „Too many output resources" und „Nested function 'kan' is not allowed".
const PRUEFER = path.join(process.env.HOME || "", "suuntoplus-editor/entpackt/extension/node_modules/@suunto-internal/suuntoplus-tools/lib/index.js");
test("SuuntoPlus-Pruefer nimmt app/ und app-debug/ an (main.js + Projekt)", { skip: !fs.existsSync(PRUEFER) && "Editor nicht installiert" }, async () => {
  const tools = createRequire(import.meta.url)(PRUEFER);
  for (const dir of ["app", "app-debug"]) {
    const fehler = [];
    const ok = await tools.javascript.validateFile(path.join(WURZEL, dir, "main.js"), () => {}, (l, c, n, m) => fehler.push(`${l}:${c} ${m}`));
    assert.deepEqual(fehler, [], dir);
    assert.ok(ok, dir);
    assert.ok(await tools.validateProject(path.join(WURZEL, dir)), dir);
  }
});
