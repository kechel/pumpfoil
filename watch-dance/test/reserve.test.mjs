// Reserve fuer GPS + Puls, bevor die Garmin-Uhr waehrend der Aufnahme Accel abschaltet
// (SessionRecorder._gpsPunkt, Jan 13.10.2026: „ja gerne auch 2h Reserve"). Monkey C laeuft nicht in
// Node — der Test rechnet die Formel fuer die gemessenen Puffer der Flotte (docs/WATCH-STORAGE.md)
// nach und prueft, dass genau diese Formel noch im Quelltext steht.
//   node --test watch/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(path.join(hier, '..', 'source', 'SessionRecorder.mc'), 'utf-8');

// Chunk-Geometrie wie Uploader.kbProGpsChunk / SessionRecorder._gpsChunkTarget:
// Uhren mit <= 128 KB RAM: 30 Punkte je GPS-Chunk, ~2 KB; sonst 120 Punkte, ~5 KB.
function reserveKb(budgetKb, kleineUhr) {
  const nutz = budgetKb * 0.9;
  let res = 7200.0 / (kleineUhr ? 30 : 120) * (kleineUhr ? 2 : 5);
  if (res > nutz / 2) res = nutz / 2;
  if (res < 100) res = 100;
  return res;
}

test('Formel steht so im Quelltext', () => {
  assert.match(quelle, /var nutz = storageBudgetKb \* 0\.9;/);
  assert.match(quelle, /var res = 7200\.0 \/ _gpsChunkTarget\(\) \* Uploader\.kbProGpsChunk\(\);/);
  assert.match(quelle, /if \(res > nutz \/ 2\) \{ res = nutz \/ 2; \}/);
  assert.match(quelle, /if \(res < 100\) \{ res = 100; \}/);
  assert.match(quelle, /nutz - Uploader\.pendingKbCached\(\) < res/);
});

test('kleine Uhren bleiben bei 100 KB', () => {
  assert.equal(reserveKb(158, true), 100);   // FR55, Instinct 2
  assert.equal(reserveKb(167, true), 100);   // Instinct 2S
  assert.equal(reserveKb(200, false), 100);  // Sammelwert fuer ungemeldete Modelle
});

test('groessere Uhren halten mehr zurueck, hoechstens die Haelfte', () => {
  assert.equal(Math.round(reserveKb(241, true)), 108);  // FR 935
  assert.equal(Math.round(reserveKb(431, true)), 194);  // Venu Sq
  assert.equal(reserveKb(2000, false), 300);            // grosser Puffer: volle 2 h GPS (7200 Punkte)
  assert.equal(reserveKb(2000, true), 480);
});

test('Accel bleibt bis zur Reserve an: nie mehr als der halbe Puffer gesperrt', () => {
  for (const b of [158, 167, 180, 241, 431, 1000, 5000]) {
    for (const k of [true, false]) {
      const r = reserveKb(b, k);
      assert.ok(r <= Math.max(100, b * 0.9 / 2) + 1e-9, `${b} ${k}: ${r}`);
    }
  }
});
