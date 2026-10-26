// Reihenfolge der Tanz-Auswahl (Tanz._reihe/blaettern, Jan 26.10.2026: „gestern musste ich da zig mal
// weiterscrollen"): gezeigter Tanz, heute bestaetigte (zuletzt zuerst), Top 3, Rest alphabetisch, „Kein Tanz".
// Monkey C laeuft nicht in Node — der Test stellt die Reihe nach und prueft die tragenden Zeilen im Quelltext.
//   node --test watch-dance/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(path.join(hier, '..', 'source', 'Tanz.mc'), 'utf-8');
const liste = (name) => JSON.parse(quelle.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))[1]);
const KEYS = liste('KEYS'), NAMEN = liste('NAMEN'), ALPHA = liste('ALPHA');

test('tragende Zeilen stehen im Quelltext', () => {
  assert.match(quelle, /if \(gezeigt != null\) \{ var g = KEYS\.indexOf\(gezeigt\); if \(g >= 0\) \{ r\.add\(g\); \} \}/);
  assert.match(quelle, /for \(var i = 0; i < _heute\.size\(\); i\+\+\) \{ if \(r\.indexOf\(_heute\[i\]\) < 0\) \{ r\.add\(_heute\[i\]\); \} \}/);
  assert.match(quelle, /if \(ki >= 0\) \{ _heute\.remove\(ki\); _heute = \[ki\]\.addAll\(_heute\); \}/);
  assert.match(quelle, /if \(_offen \|\| _jetzt - a\[1\] < 120000\) \{ erkannt = a\[2\]; \}/);
});

test('ALPHA ist alphabetisch nach NAMEN', () => {
  const soll = [...KEYS.keys()].sort((a, b) => NAMEN[a].localeCompare(NAMEN[b], 'de'));
  assert.deepEqual(ALPHA, soll);
});

function reihe(gezeigt, heute, top) {
  const r = [];
  const dazu = (i) => { if (!r.includes(i)) r.push(i); };
  if (gezeigt != null && KEYS.includes(gezeigt)) dazu(KEYS.indexOf(gezeigt));
  heute.forEach(dazu); top.forEach(dazu); ALPHA.forEach(dazu);
  r.push(KEYS.length);
  return r;
}
const k = (s) => KEYS.indexOf(s);

test('RUNTER fuehrt vom erkannten Tanz zuerst zu den heute getanzten', () => {
  const heute = [k('discofox'), k('boogie')];          // zuletzt Disco-Fox, davor Boogie
  const r = reihe('jive', heute, [k('jive'), k('quickstep'), k('samba')]);
  assert.deepEqual(r.slice(0, 5), [k('jive'), k('discofox'), k('boogie'), k('quickstep'), k('samba')]);
  assert.equal(r.length, KEYS.length + 1);            // jeder Tanz genau einmal + „Kein Tanz"
  assert.equal(new Set(r).size, r.length);
  assert.equal(r[r.length - 1], KEYS.length);          // HOCH vom erkannten = „Kein Tanz"
});

test('ohne erkannten Tanz beginnt RUNTER beim zuletzt bestaetigten', () => {
  const r = reihe(null, [k('bachata')], []);
  assert.equal(r[0], k('bachata'));
});
