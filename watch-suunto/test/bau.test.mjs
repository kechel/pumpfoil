// app/ muss zum Quellstand passen (nach jeder Aenderung: node bau.mjs) und darf nur ES5 enthalten.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { WURZEL } from "./lade.mjs";
import { dateien, manifest } from "../bau.mjs";

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
