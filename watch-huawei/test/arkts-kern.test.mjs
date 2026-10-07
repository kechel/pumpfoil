// ArkTS-Kern (arkts/…/Kern.ets) gegen den JS-Kern (common/kern.js): gleiche Eingaben, BYTEGLEICHE
// Ausgaben. Handy und Server unterscheiden die drei Huawei-Linien nicht — weicht ein Kern ab,
// bricht genau eine Linie, ohne dass es auf den anderen auffaellt.
//
// Kern.ets ist im strengen ArkTS-Umfang geschrieben und damit gueltiges TypeScript; tsc aus
// web/node_modules uebersetzt es nach JS. Ohne tsc wird der Test uebersprungen (nicht still: er
// meldet sich als skipped).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, copyFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import K from "../common/kern.js";

const hier = dirname(fileURLToPath(import.meta.url));
const TSC = join(hier, "../../web/node_modules/.bin/tsc");
const QUELLE = join(hier, "../arkts/entry/src/main/ets/common/Kern.ets");

async function arkts() {
  const dir = mkdtempSync(join(tmpdir(), "pf-arkts-"));
  copyFileSync(QUELLE, join(dir, "Kern.ts"));
  execFileSync(TSC, ["--strict", "--target", "ES2020", "--module", "ES2020", "--outDir", dir, join(dir, "Kern.ts")]);
  renameSync(join(dir, "Kern.js"), join(dir, "Kern.mjs"));
  return import(pathToFileURL(join(dir, "Kern.mjs")).href);
}

const ohneTsc = !existsSync(TSC) && "tsc fehlt (cd web && npm ci)";

test("ArkTS-Kern uebersetzt strikt und liefert dieselben Chunks wie kern.js", { skip: ohneTsc }, async () => {
  const A = await arkts();
  const js = new K.Sammler(), ts = new A.Sammler();
  const ausJs = [], ausTs = [];
  let t = 0;
  for (let n = 0; n < 1300; n++) {
    t += 20;
    const x = Math.sin(n / 7) * 25, y = Math.cos(n / 3) * 40, z = 9.8 + (n % 11) - 5;
    const a = js.accelWert(x, y, z, t), b = ts.accelWert(x, y, z, t);
    if (a) ausJs.push(a);
    if (b) ausTs.push(b);
    if (n % 50 === 0) {
      js.puls(80 + n % 40); ts.puls(80 + n % 40);
      const lat = 52.5 + n * 1e-5, lon = 13.4 + n * 2e-5;
      const g1 = js.gpsFix(lat, lon, 5, t), g2 = ts.gpsFix(lat, lon, 5, t, -1);
      if (g1) ausJs.push(g1);
      if (g2) ausTs.push(g2);
    }
  }
  ausJs.push(...js.rest()); ausTs.push(...ts.rest());
  assert.ok(ausJs.length >= 6);
  assert.equal(JSON.stringify(ausTs), JSON.stringify(ausJs));
});

test("ArkTS-Kern: GPS-Tempo geht mit, gerundet auf cm/s", { skip: ohneTsc }, async () => {
  const A = await arkts();
  const s = new A.Sammler();
  s.gpsFix(52.5, 13.4, 4, 1000, 3.14159);
  s.gpsFix(52.5001, 13.4, 4, 2000, -1);
  const c = s.gpsBlock();
  assert.equal(c.data[0][3], 3.14);
  assert.equal(c.data[1][3], -1);
});

test("ArkTS-Kern: Zeitachse, Sendeplan, Teile und Gegenstelle wie kern.js", { skip: ohneTsc }, async () => {
  const A = await arkts();
  // Zeitachse
  for (const [Z, w] of [[K.Zeitachse, "js"], [A.Zeitachse, "ts"]]) {
    const z = new Z(1000);
    z.pause(5000); z.weiter(8000); z.pause(9000); z.weiter(9500);
    assert.deepEqual([z.jetzt(10000), z.pausen, z.auf(9800, 10000), z.auf(1, 10000)],
      [5500, [[4000, 3000], [5000, 500]], 5300, -1], w);
  }
  // Sendeplan: gleiche Reihenfolge und gleicher Stand ueber einen Ablauf mit zwei Sessions
  const reihe = (P) => {
    const p = new P();
    const r = [];
    p.neu("a"); p.chunk("a"); p.chunk("a");
    r.push(JSON.stringify(p.stand()));
    for (let d = p.naechste(); d; d = p.naechste()) { r.push(d.id + d.art + d.nr); p.erledigt(d); }
    p.ende("a"); p.neu("b"); p.chunk("b");
    for (let d = p.naechste(); d; d = p.naechste()) { r.push(d.id + d.art + d.nr + p.offen()); p.erledigt(d); }
    r.push(JSON.stringify(p.daten()), JSON.stringify(p.stand()));
    const q = new P(JSON.parse(JSON.stringify(p.daten())));
    q.ende("b"); r.push(JSON.stringify(q.naechste()));
    return r;
  };
  assert.deepEqual(reihe(A.Sendeplan), reihe(K.Sendeplan));
  // Teile: gleicher Text inkl. Nicht-ASCII und |
  const text = JSON.stringify({ device_model: "HUAWEI WATCH 5 · HarmonyOS", x: "a|b", y: "ä€😀".repeat(200) });
  assert.deepEqual(A.teile("m_hw-x.json", text, 7), K.teile("m_hw-x.json", text, 7));
  assert.deepEqual(A.teile("m_a.json", "{}", 0, 5), K.teile("m_a.json", "{}", 0, 5));
  // Dateinamen: ohne Ordner, sonst gleich
  assert.equal("internal://app/" + A.dateiChunk("hw-x", 42), K.dateiChunk("hw-x", 42));
  assert.equal("internal://app/" + A.dateiVon({ id: "hw-x", art: "e", nr: -1 }), K.dateiEnde("hw-x"));
  assert.equal(A.neueId(1791374454000, 0.5), K.neueId(1791374454000, 0.5));
  // Gegenstelle + Warteschlange
  const gj = new K.Gegenstelle([["a", "1"], ["b", "2"]], 0), gt = new A.Gegenstelle([["a", "1"], ["b", "2"]], 0);
  const lauf = (g) => [g.fehler(), g.fehler(), g.fehler(), g.jetzt()];
  assert.deepEqual(lauf(gt), lauf(gj));
  const wj = new K.Warteschlange(), wt = new A.Warteschlange();
  for (const w of [wj, wt]) { w.start(); w.fehler(206, 1000); w.fehler(206, 2000); }
  assert.deepEqual([wt.naechsterVersuch, wt.fehlerGesamt, wt.letzterCode], [wj.naechsterVersuch, wj.fehlerGesamt, wj.letzterCode]);
});
