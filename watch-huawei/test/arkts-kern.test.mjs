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

test("ArkTS-Kern: Sendeplan.weg und AutoStart wie kern.js", { skip: ohneTsc }, async () => {
  const A = await arkts();
  const pj = new K.Sendeplan(), pt = new A.Sendeplan();
  for (const p of [pj, pt]) {
    p.neu("a"); p.erledigt({ id: "a", art: "m", nr: -1 });
    p.neu("b"); for (let i = 0; i < 5; i++) p.chunk("b");
    p.erledigt({ id: "b", art: "m", nr: -1 }); p.erledigt({ id: "b", art: "c", nr: 0 });
  }
  // ArkTS-Dateinamen ohne „internal://app/" (den Ordner haengt Recorder.ets an), sonst gleich
  assert.deepEqual(pt.weg("b"), pj.weg("b").map((u) => u.substring(u.lastIndexOf("/") + 1)));
  assert.deepEqual(pt.daten(), pj.daten());
  const aj = new K.AutoStart(), at = new A.AutoStart();
  let lat = 52.5, t = 0;
  const schritte = [0, 1, 3, 3, 1, 3, 3, 3, 3, 30, 100];
  for (let i = 0; i < schritte.length; i++) {
    lat += schritte[i] / 111320; t += i === 9 ? 10000 : 1000;
    assert.equal(at.fix(lat, 13.4, t), aj.fix(lat, 13.4, t), `Fix ${i}`);
  }
});

// --- Direkt-Upload (Uhr -> Server ohne Handy, nur ArkTS) ------------------------------------
import { readFileSync } from "node:fs";

test("Direkt-Upload: Meta mit expected_chunks, jeder Chunk genau einmal, GPS zuerst, Pakete <= 30", { skip: ohneTsc }, async () => {
  const A = await arkts();
  // Dieselben Dateien, die der echte Recorder im E2E-Test schrieb (auch Grundlage fuer Bruecke + Server).
  const d = JSON.parse(readFileSync(join(hier, "fixtures/huawei-e2e-dateien.json"), "utf8"));
  const meta = Object.entries(d).find(([k]) => k.startsWith("m_"))[1];
  const chunks = Object.entries(d).filter(([k]) => k.startsWith("c_")).sort().map(([, v]) => v);
  const up = A.direktUpload(meta, chunks, [], 30);
  const m = JSON.parse(up.meta);
  assert.equal(m.expected_chunks, chunks.length);
  assert.equal(m.session_uuid, JSON.parse(meta).session_uuid, "Meta sonst unveraendert");
  const raus = up.pakete.flatMap((p) => JSON.parse(p).chunks);
  assert.ok(up.pakete.every((p) => JSON.parse(p).chunks.length <= 30));
  assert.deepEqual(raus.map((c) => c.index).sort((a, b) => a - b), chunks.map((c) => JSON.parse(c).index).sort((a, b) => a - b));
  const ersterAccel = raus.findIndex((c) => c.kind !== "gps");
  assert.ok(raus.slice(0, ersterAccel).every((c) => c.kind === "gps") && raus.slice(ersterAccel).every((c) => c.kind !== "gps"), "GPS zuerst");
  // Chunk-Texte gehen unveraendert hinein (keine zweite Serialisierung)
  assert.ok(up.pakete.join("").includes(chunks[0]));
  // Abgebrochener Upload: was der Server schon hat, geht nicht noch einmal raus
  const nochmal = A.direktUpload(meta, chunks, [0, 1, 2], 30);
  assert.equal(nochmal.pakete.flatMap((p) => JSON.parse(p).chunks).length, chunks.length - 3);
  assert.equal(JSON.parse(nochmal.meta).expected_chunks, chunks.length, "expected_chunks bleibt die Gesamtzahl");
});

test("Direkt-Upload: nur abgeschlossene, per Wear Engine unberuehrte Sessions sind bereit", { skip: ohneTsc }, async () => {
  const A = await arkts();
  const p = new A.Sendeplan();
  p.neu("laeuft"); p.chunk("laeuft");                      // Aufnahme laeuft noch
  p.neu("halb"); p.chunk("halb"); p.ende("halb");
  p.erledigt({ id: "halb", art: "m", nr: -1 });            // Meta schon beim Handy
  p.neu("fertig"); p.chunk("fertig"); p.chunk("fertig"); p.ende("fertig");
  assert.equal(A.direktBereit(p).id, "fertig");
  const weg = p.weg("fertig");                               // nach dem Upload: alles loeschen
  assert.deepEqual(weg, [A.dateiMeta("fertig"), A.dateiChunk("fertig", 0), A.dateiChunk("fertig", 1), A.dateiEnde("fertig")]);
  assert.equal(A.direktBereit(p), null);
});
