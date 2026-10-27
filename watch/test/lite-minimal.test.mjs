// Minimal-Recorder fuer die 96-KB-Uhren (Lite-Build, Jan 27.10.2026): nur GPS, feste Seiten, keine
// Spot-Meldung, schlanke Config (`min=1`). Monkey C laeuft nicht in Node — der Test prueft, dass die
// tragenden Stellen so im Quelltext stehen, und stellt das GPS-only-Speichersparen der Lite-Fassung
// (`(:lite) hidden function _gpsPunkt`) nach: ueber eine lange Aufnahme mit Laeufen, Stehen und
// GPS-Ausfall darf kein Punkt eines Laufs fehlen.
//   node --test watch/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (f) => readFileSync(path.join(hier, '..', 'source', f), 'utf-8');
const rec = lies('SessionRecorder.mc');

// Rumpf einer annotierten Funktion (Klammern zaehlen).
function rumpf(src, kopf) {
  const i = src.indexOf(kopf);
  assert.ok(i >= 0, `fehlt: ${kopf}`);
  let k = src.indexOf('{', i), tiefe = 0;
  for (let j = k; j < src.length; j++) {
    if (src[j] === '{') tiefe++;
    if (src[j] === '}' && --tiefe === 0) return src.slice(i, j + 1);
  }
  throw new Error('kein Ende');
}

test('Lite-Fassungen stehen im Quelltext', () => {
  const pos = rumpf(rec, '(:lite) function onPosition(');
  assert.doesNotMatch(pos, /meldePosition/);
  assert.match(pos, /if \(info == null \|\| info\.position == null\) \{ _gpsQuality = 0; return; \}/);
  assert.match(rumpf(rec, '(:lite) function fetchConfig('), /"min" => "1"/);
  assert.match(rec, /\(:lite\) function gpsPoor\(\) \{ return _gpsQuality < Position\.QUALITY_USABLE; \}/);
  assert.match(rec, /\(:lite\) function hasGpsFix\(\) \{ return _hasGpsFix; \}/);
  const st = rumpf(rec, '(:lite) function start(');
  assert.doesNotMatch(st, /SensorLogg|registerSensorDataListener/);
  assert.match(rumpf(rec, '(:lite) hidden function _gpsPunkt('), /if \(!z\[6\] \|\| gpsPoor\(\)\) \{/);
  const pr = lies('PhoneRec.mc');
  assert.match(pr, /\(:lite\) function meldeAppZu\(\) as Void \{\}/);
  assert.match(rumpf(lies('RecordView.mc'), '(:lite) hidden function _ring('), /FIELD_SPEED3S, Config\.FIELD_RUN_DISTANCE/);
});

// --- Nachbau von (:lite) _gpsPunkt (gleiche Indizes wie _gZ) ---
function liteRecorder(sparen) {
  const z = [[], [], 0, 0, 0, 0, sparen];
  const r = { z, q: 4, gespeichert: [] };
  const add = (p) => r.gespeichert.push(p);
  r.poor = () => r.q < 2;   // QUALITY_USABLE = 2 (Position.QUALITY_*: 0..4)
  r.punkt = (p, spd) => {
    if (!z[6] || r.poor()) { for (const v of z[0]) add(v); z[0] = []; add(p); return; }
    let v = z[1]; v.push(spd);
    if (v.length > 3) { v = v.slice(1); z[1] = v; }
    const a = v[0], b = v.length > 1 ? v[1] : a, c = v.length > 2 ? v[2] : b;
    const v3 = (a > b) ? ((b > c) ? b : ((a > c) ? c : a)) : ((a > c) ? a : ((b > c) ? c : b));
    z[3] = (v3 >= 1.667) ? z[3] + 1 : 0;
    if (z[2] === 0 && z[3] >= 3) { z[2] = 1; z[4] = 0; z[5] = 0; for (const x of z[0]) add(x); z[0] = []; }
    if (z[2] === 1) {
      add(p);
      z[4] = (v3 < 1.389) ? z[4] + 1 : 0;
      if (z[4] >= 3) { z[2] = 0; z[5] = p.t + 30000; }
    } else if (z[5] > 0 && p.t <= z[5]) {
      add(p);
    } else {
      z[5] = 0;
      const vl = z[0]; vl.push(p);
      let weg = 0;
      while (weg < vl.length - 1 && (vl[weg].t < p.t - 33000 || vl.length - weg > 40)) weg++;
      if (weg > 0) z[0] = vl.slice(weg);
    }
  };
  r.stop = () => { for (const v of z[0]) add(v); z[0] = []; };
  return r;
}

// 90 min: 20 Laeufe (60-150 s, 4-5 m/s), dazwischen Stehen/Schwimmen (0-0,8 m/s, 2-4 min), mitten in
// einem Lauf 100 s ohne brauchbares GPS (Tempo dann 0), dazu einzelne Tempo-Ausreisser im Stehen.
function aufnahme() {
  const pts = [];
  let t = 0, seed = 7;
  const zufall = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const lauf = [];
  pts.push(...Array.from({ length: 180 }, () => ({ t: (t += 1000), spd: 0.3 * zufall(), q: 4 })));
  for (let n = 0; n < 20; n++) {
    const dauer = n === 7 ? 150 : 60 + Math.floor(zufall() * 90);
    const von = t + 1000;
    for (let s = 0; s < dauer; s++) {
      const ausfall = n === 7 && s >= 20 && s < 120;   // laenger als Nach- plus Vorlauf
      pts.push({ t: (t += 1000), spd: ausfall ? 0 : 4 + zufall(), q: ausfall ? 1 : 4 });
    }
    lauf.push([von, t]);
    const pause = 120 + Math.floor(zufall() * 120);
    for (let s = 0; s < pause; s++) {
      const spitze = s === 60;   // einzelner Doppler-Ausreisser
      pts.push({ t: (t += 1000), spd: spitze ? 6 : 0.8 * zufall(), q: 4 });
    }
  }
  return { pts, lauf };
}

test('Speicher sparen (Lite): jeder Lauf komplett, 30 s davor und danach, Stehen gekuerzt', () => {
  const { pts, lauf } = aufnahme();
  const r = liteRecorder(true);
  for (const p of pts) { r.q = p.q; r.punkt(p, p.spd); }
  r.stop();
  const hat = new Set(r.gespeichert.map((p) => p.t));
  assert.equal(hat.size, r.gespeichert.length, 'kein Punkt doppelt');
  for (const [von, bis] of lauf) {
    for (const p of pts) {
      if (p.t >= von - 30000 && p.t <= bis + 30000) assert.ok(hat.has(p.t), `Punkt ${p.t} (Lauf ${von}-${bis}) fehlt`);
    }
  }
  // zeitlich sortiert (der Server erwartet aufsteigende t_ms je Session)
  for (let i = 1; i < r.gespeichert.length; i++) assert.ok(r.gespeichert[i].t > r.gespeichert[i - 1].t);
  const anteil = r.gespeichert.length / pts.length;
  assert.ok(anteil < 0.75, `spart zu wenig: ${(anteil * 100).toFixed(0)} %`);
});

test('ohne Speicher sparen: jeder Punkt', () => {
  const { pts } = aufnahme();
  const r = liteRecorder(false);
  for (const p of pts) { r.q = p.q; r.punkt(p, p.spd); }
  r.stop();
  assert.equal(r.gespeichert.length, pts.length);
});
