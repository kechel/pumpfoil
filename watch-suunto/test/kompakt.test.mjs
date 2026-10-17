// Kompakte Konfiguration: die Uhr liest, was der Server schreibt (gleiche Testvektoren wie
// server/tests/test_kompakt_config.py), und speichert nur, was in ihren kleinen Speicher passt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Uhr } from "./firmware.mjs";
import { WURZEL } from "./lade.mjs";
import { kompaktVon } from "./kompakt-hilfe.mjs";

const faelle = JSON.parse(fs.readFileSync(path.join(WURZEL, "test/fixtures/kompakt.json"), "utf8"));

for (const f of faelle) {
  test("Server-Testvektor lesen: " + f.name, () => {
    const uhr = new Uhr({ einstellungen: { handy: "false" } });
    assert.deepEqual(JSON.parse(JSON.stringify(uhr.ctx.kompaktLesen(f.kompakt))), f.uhr);
  });
}

const LAYOUT = [1, 4, [[1, 500, 300, 7, 0, 4, 1], [2, 500, 420, 1, 0, 0, 1], [1, 300, 700, 4, 0, 0, 20],
  [1, 700, 700, 4, 11, 0, 14], [4, 150, 500, 2, 3, 0, 850, 500], [9, 500, 560, 2, 9, 0, 2, 600]]];

test("zu gross fuer den Speicher: erst Pause, dann zwischen den Laeufen, dann Foils, dann klassisch", () => {
  const uhr = new Uhr({ einstellungen: { handy: "false", uhrId: "123456789" } });
  uhr.ruf("onLoad");
  const viele = (n) => Array.from({ length: n }, () => LAYOUT);
  const voll = kompaktVon({ pages: viele(6), offFoilPages: viele(6), pausePages: viele(6),
    foils: [{ id: 1, label: "Gong", min: 10, max: 22 }], speedHigh: 25 });
  assert.ok(voll.length > 2000, "Testfall wirklich zu gross: " + voll.length);
  const gespeichert = uhr.ctx.kompaktSpeichern(voll);
  const k = JSON.parse(gespeichert);
  assert.ok(!k.Q, "Pause-Seiten zuerst weg");
  assert.ok(Array.isArray(k.P) && k.P[0].startsWith("1,"), "die Seiten auf dem Foil bleiben als Layout");
  if (k.F) assert.ok(k.f, "solange Zwischen-Seiten bleiben, sind die Foils noch da");
  assert.equal(k.sh, 25, "Alarm bleibt");
  const belegt = uhr.ctx.speicherBelegt();
  assert.ok(gespeichert.length + belegt <= uhr.ctx.SPEICHER_MAX - uhr.ctx.SPEICHER_RESERVE, "im Budget");
  assert.equal(uhr.speicher.get("k"), gespeichert);
});

test("noch groesser: freie Layouts werden klassische Seiten (erste drei Werte von oben)", () => {
  const uhr = new Uhr({ einstellungen: { handy: "false" } });
  uhr.ruf("onLoad");
  const riesig = kompaktVon({ pages: Array.from({ length: 30 }, () => LAYOUT) });
  const k = JSON.parse(uhr.ctx.kompaktSpeichern(riesig));
  assert.equal(k.P[0], "0,1,k,e", "Tempo, Laeufe, Laufzeit");
});

test("Speichern scheitert (Speicher voll / Firmware-Fehler): kein Absturz, Anzeige behaelt die Konfiguration", () => {
  const uhr = new Uhr({ einstellungen: { handy: "false" } });
  uhr.ruf("onLoad");
  uhr.ctx.localStorage.setItem = () => { throw new Error("voll"); };
  assert.equal(uhr.ctx.kompaktSpeichern(kompaktVon({ speedHigh: 30 })), null);
  uhr.ctx.konfigAnwenden(kompaktVon({ views: [[2, 3, 4]], speedHigh: 30 }));
  assert.deepEqual(JSON.parse(JSON.stringify(uhr.ctx.kf.views)), [[2, 3, 4]]);
});
