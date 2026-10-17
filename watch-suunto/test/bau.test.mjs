// app/ muss zum Quellstand passen (nach jeder Aenderung: node bau.mjs) und darf nur ES5 enthalten.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { WURZEL } from "./lade.mjs";
import { dateien, manifest, GRAFIKEN } from "../bau.mjs";

test("app/ ist aktuell", () => {
  for (const [n, inhalt] of Object.entries(dateien())) {
    const da = fs.readFileSync(path.join(WURZEL, "app", n), "utf8");
    assert.equal(da, inhalt, `app/${n} veraltet — node bau.mjs`);
  }
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
    "onExerciseEnd", "onEvent", "onAccelerometer", "getUserInterface", "getSummaryOutputs"]);
  for (const m of src.matchAll(/^function ([\w$]+)/gm)) assert.ok(erlaubt.has(m[1]), "globale function " + m[1]);
});

test("Vorlage d.html: Skript ist gueltiges ES5, Abos auf alle Grafik-Ausgaben, Elemente fuer alle Klassen", () => {
  const html = fs.readFileSync(path.join(WURZEL, "app/d.html"), "utf8");
  const onLoad = html.match(/onLoad="([^"]*)"/)[1];
  assert.doesNotThrow(() => new Function(onLoad + "\nreturn zeichneSeite;"));
  for (let i = 0; i < GRAFIKEN; i++) assert.ok(html.includes(`Output/g${i}'`), "Abo g" + i);
  assert.ok(html.includes("Output/gv'"));
  assert.equal((html.match(/id="k\d[lcr]_\d"/g) || []).length, 8 * (3 + 2 + 2), "je Klasse 3 mittig, 2 links, 2 rechts (anzeige.js ANZ_JE)");
  assert.ok(!html.includes("%e"), "kein calc(… %e) — der Simulator verwirft es");
  const m = manifest();
  for (let i = 0; i < GRAFIKEN; i++) assert.ok(m.out.some((o) => o.name === "g" + i));
  assert.ok(m.out.length <= 20, "Editor: hoechstens 20 Ausgaben, sind " + m.out.length);
  assert.ok(fs.readFileSync(path.join(WURZEL, "quelle/vorlage.js"), "utf8").includes("gi < " + GRAFIKEN), "vorlage.js G-Laenge = ANZ_GRAFIKEN");
});

// Der Pruefer des SuuntoPlus Editors selbst (nicht im Repo; auf der VM unter ~/suuntoplus-editor, s. docs/SUUNTO.md).
// Fing am 17.10. erst bei Jan: „Too many output resources" und „Nested function 'kan' is not allowed".
const PRUEFER = path.join(process.env.HOME || "", "suuntoplus-editor/entpackt/extension/node_modules/@suunto-internal/suuntoplus-tools/lib/index.js");
test("SuuntoPlus-Pruefer nimmt app/ an (main.js + Projekt)", { skip: !fs.existsSync(PRUEFER) && "Editor nicht installiert" }, async () => {
  const tools = createRequire(import.meta.url)(PRUEFER);
  const fehler = [];
  const ok = await tools.javascript.validateFile(path.join(WURZEL, "app/main.js"), () => {}, (l, c, n, m) => fehler.push(`${l}:${c} ${m}`));
  assert.deepEqual(fehler, []);
  assert.ok(ok);
  assert.ok(await tools.validateProject(path.join(WURZEL, "app")));
});
