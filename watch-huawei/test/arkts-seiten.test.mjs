// Datenseiten ArkTS (arkts/…/Seiten.ets) gegen JS (common/seiten.js): gleiche Fahrt, gleicher Stand,
// BYTEGLEICHE Zeichenbefehle. Wie arkts-kern.test.mjs: tsc aus web/node_modules uebersetzt die .ets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, copyFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import J0 from "../common/seiten.js";
import JL from "../common/lauf.js";
const J = { ...J0, ...JL };   // Stand/Konfig liegen seit 08.10. in lauf.js

const hier = dirname(fileURLToPath(import.meta.url));
const TSC = join(hier, "../../web/node_modules/.bin/tsc");
const QUELLE = join(hier, "../arkts/entry/src/main/ets/common/Seiten.ets");
const ohneTsc = !existsSync(TSC) && "tsc fehlt (cd web && npm ci)";

async function arkts() {
  const dir = mkdtempSync(join(tmpdir(), "pf-seiten-"));
  copyFileSync(QUELLE, join(dir, "Seiten.ts"));
  execFileSync(TSC, ["--strict", "--target", "ES2020", "--module", "ES2020", "--outDir", dir, join(dir, "Seiten.ts")]);
  renameSync(join(dir, "Seiten.js"), join(dir, "Seiten.mjs"));
  return import(pathToFileURL(join(dir, "Seiten.mjs")).href);
}

/** Unruhige Fahrt: Stillstand, Laeufe, Doppler-Spruenge, Funkloecher, Puls an/aus. */
function fahren(S, mitTempo) {
  const s = new S.Stand();
  let lat = 47.66, lon = 9.35, wechsel = [];
  for (let i = 0; i < 900; i++) {
    const phase = Math.floor(i / 60) % 3;
    let v = phase === 1 ? 4 + Math.sin(i / 5) : (phase === 2 ? 1.8 : 0.3);
    if (i % 97 === 0) v = 25;                 // Ausreisser
    const fix = i % 41 !== 0;                 // Funkloch
    lon += v / (111320 * Math.cos(lat * Math.PI / 180));
    if (s.tick(i * 1000, 1e12 + i * 1000, fix, lat, lon, mitTempo ? v : -1, i % 13 ? 110 + (i % 30) : 0)) wechsel.push(i);
  }
  return { s, wechsel };
}

test("Seiten.ets uebersetzt strikt; Lauf-Stand nach 15 min unruhiger Fahrt gleich", { skip: ohneTsc }, async () => {
  const A = await arkts();
  for (const mitTempo of [false, true]) {
    const a = fahren(J, mitTempo), b = fahren(A, mitTempo);
    assert.ok(a.s.runCount >= 3, `Laeufe ${a.s.runCount}`);
    assert.deepEqual(b.wechsel, a.wechsel);
    assert.equal(JSON.stringify(b.s), JSON.stringify(a.s));
  }
});

test("Seiten.ets: Felder, Ring und Zeichenbefehle bytegleich", { skip: ohneTsc }, async () => {
  const A = await arkts();
  const sj = fahren(J, false).s, sa = fahren(A, false).s;
  const jetzt = new Date(2026, 9, 7, 14, 3);
  const t = (k) => "<" + k + ">";
  for (let id = 0; id <= 24; id++) {
    assert.deepEqual(A.feld(sa, id, 899, t, jetzt), J.feld(sj, id, 899, t, jetzt), `Feld ${id}`);
    assert.equal(A.feldZahl(sa, id, 899), J.feldZahl(sj, id, 899), `Zahl ${id}`);
  }
  const lay = [1, 4, [
    [1, 500, 300, 6, 0, 4, 1], [2, 500, 420, 1, 0, 1, 7], [3, 120, 600, 2, 5, 2, "Läufe|x"],
    [4, 100, 500, 2, 3, 0, 900, 500], [5, 500, 80, 1, 0, 0], [6, 500, 920, 1, 12, 0],
    [7, 500, 150, 2, 0, 0], [8, 0, 1000, 2, 0, 1, 2], [9, 500, 700, 1, 9, 0, 18, 600],
    [1, 300, 800, 3, 0, 4, 9], [2], null,
  ]];
  const roh = { views: [[1, 2, 0], [3, 4, 20]], offFoilView: [12, 17, 16], pauseView: [12, 20, 2],
    pages: [lay], offFoilPages: [[0, 14, 15, 0]], pausePages: [], browseAll: true, layoutsOn: true,
    colorByValue: true, hrZones: [90, 110, 130, 150, 170, 190], speedZones: [6, 10, 14, 18, 22, 26] };
  for (const daten of [roh, { ...roh, layoutsOn: false, browseAll: false }, null]) {
    const kj = new J.Konfig(daten), ka = new A.Konfig(daten);
    for (const z of ["on", "off", "p"]) {
      const rj = J.ring(kj, z), ra = A.ring(ka, z);
      assert.deepEqual(ra, rj, `Ring ${z}`);
      rj.forEach((seite, idx) => {
        for (const pausiert of [false, true]) {
          const cj = { dw: 466, dh: 466, s: sj, el: 899, t, jetzt, k: kj, idx, anzahl: rj.length, pausiert };
          const ca = { ...cj, s: sa, k: ka };
          assert.equal(JSON.stringify(A.zeichne(seite, ca)), JSON.stringify(J.zeichne(seite, cj)), `Seite ${z}/${idx}`);
        }
      });
    }
  }
});
