// GPS-Luecke am Lauf-Ende (12.11.2026): Uhr 1:34 als laengster Lauf, Server 1:09. Der Fahrer stuerzte, die Uhr
// war 36 s unter Wasser; Garmin hielt die letzte Geschwindigkeit, die Lauferkennung zaehlte ~25 s weiter.
// Monkey C laeuft nicht in Node — der Test stellt _updateRun (SessionRecorder.mc) und LaufLuecke.mc nach,
// spielt die Faelle mit synthetischen Verlaeufen durch und prueft, dass die tragenden Zeilen im Quelltext stehen.
//   node --test watch/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));
const rec = readFileSync(path.join(hier, '..', 'source', 'SessionRecorder.mc'), 'utf-8');
const ll = readFileSync(path.join(hier, '..', 'source', 'LaufLuecke.mc'), 'utf-8');

test('tragende Zeilen stehen im Quelltext', () => {
  assert.match(ll, /const LUECKE_MS = 3000;/);
  assert.match(ll, /const TRENN_MS = 15000;/);
  assert.match(ll, /const FAHR_MPS = 2\.5;/);
  assert.match(ll, /if \(bT - aT <= TRENN_MS && aV >= FAHR_MPS\) \{ return null; \}/);
  assert.match(ll, /if \(aT < 0 \|\| gT > bT \+ LUECKE_MS \|\| pT < 0 \|\| pT < start\) \{ return null; \}/);
  assert.match(ll, /pT = gT; pD = gD; pHr = gHr;/);
  assert.match(ll, /if \(laeuft && t - fT > TRENN_MS\) \{ trennen = true; \}/);
  assert.match(rec, /if \(_exitStreak >= RUN_EXIT_DWELL \|\| trennen\) \{/);
  assert.match(rec, /var sn = LaufLuecke\.schnitt\(tMs, _runStartMs\);/);
  assert.match(rec, /LaufLuecke\.fix\(elapsedTimeMs\(\), distanceM\(\), deg\[0\], deg\[1\], spd, info\.accuracy, _runMaxHr, _foiling\);/);
  assert.match(rec, /const RUN_ENTER_MPS = 2\.8;/);
  assert.match(rec, /const RUN_EXIT_MPS = 2\.5;/);
  assert.match(rec, /const RUN_ENTER_DWELL = 4;/);
  assert.match(rec, /const RUN_EXIT_DWELL = 3;/);
});

// --- Nachbau LaufLuecke.mc ---
function laufLuecke() {
  const L = { gT: -1, gD: 0, gHr: 0, fT: -1, fLa: 0, fLo: 0, aT: -1, bT: -1, aV: 0, pT: -1, pD: 0, pHr: 0, trennen: false };
  L.fix = (t, d, la, lo, spd, q, hr, laeuft) => {
    if (q == null || q < 3) return;
    if (L.fT >= 0 && t - L.fT > 3000) {
      const dla = (la - L.fLa) * Math.PI / 180;
      const dlo = (lo - L.fLo) * Math.PI / 180 * Math.cos(((la + L.fLa) / 2) * Math.PI / 180);
      const m = 6371000 * Math.sqrt(dla * dla + dlo * dlo);
      L.aT = L.fT; L.bT = t; L.aV = m / ((t - L.fT) / 1000);
      L.pT = L.gT; L.pD = L.gD; L.pHr = L.gHr;
      if (laeuft && t - L.fT > 15000) L.trennen = true;
    }
    L.fT = t; L.fLa = la; L.fLo = lo;
    if (spd != null && spd >= 2.5) { L.gT = t; L.gD = d; L.gHr = hr; }
  };
  L.schnitt = (jetzt, start) => {
    if (L.fT >= 0 && jetzt - L.fT > 3000) return L.gT >= 0 && L.gT >= start ? [L.gT, L.gD, L.gHr] : null;
    if (L.aT < 0 || L.gT > L.bT + 3000 || L.pT < 0 || L.pT < start) return null;
    if (L.bT - L.aT <= 15000 && L.aV >= 2.5) return null;
    return [L.pT, L.pD, L.pHr];
  };
  return L;
}

// --- Nachbau _updateRun (nur was Dauer/Strecke/Zaehlung bestimmt) ---
function recorder(mitFix = true) {
  const r = {
    L: laufLuecke(), foiling: false, enter: 0, exit: 0, runCount: 0, runEndedMs: -100000, runStart: 0,
    runStartDist: 0, minSeit: 99, fort: false, lastStart: 0, lastStartDist: 0, lastDur: 0, lastDist: 0,
    sumDur: 0, sumDist: 0, laeufe: [],
  };
  r.update = (v3, vInst, dist, t) => {
    if (!r.foiling) {
      r.L.trennen = false;
      if (vInst < r.minSeit) r.minSeit = vInst;
      const gesperrt = t - r.runEndedMs < 25000 && r.minSeit < 1.5;
      if (gesperrt) { r.enter = 0; return; }
      r.enter = v3 >= 2.8 ? r.enter + 1 : 0;
      if (r.enter >= 4) {
        r.foiling = true; r.exit = 0;
        r.fort = r.runCount > 0 && r.minSeit >= 1.5;
        r.minSeit = 99;
        if (r.fort) {
          r.runStart = r.lastStart; r.runStartDist = r.lastStartDist;
          r.sumDur -= r.lastDur; r.sumDist -= r.lastDist; r.laeufe.pop();
        } else { r.runStart = t - 4000; r.runStartDist = dist; }
      }
      return;
    }
    r.exit = v3 < 2.5 ? r.exit + 1 : 0;
    const trennen = mitFix && r.L.trennen;
    r.L.trennen = false;
    if (r.exit >= 3 || trennen) {
      r.foiling = false; r.enter = 0;
      let dur = t - 3000 - r.runStart;
      let dst = dist - r.runStartDist;
      r.minSeit = 99; r.runEndedMs = t;
      const sn = mitFix ? r.L.schnitt(t, r.runStart) : null;
      if (sn) {
        dur = sn[0] - r.runStart; dst = sn[1] - r.runStartDist; r.minSeit = 0;
        if (trennen) r.runEndedMs = t - 25000;
      }
      if (dur < 0) dur = 0;
      if (dst < 0) dst = 0;
      const schnell = dur > 0 && dst / (dur / 1000) >= 2.0;
      if (!r.fort && (dur < 5000 || !schnell)) return;
      r.lastStart = r.runStart; r.lastStartDist = r.runStartDist; r.lastDur = dur; r.lastDist = dst;
      r.sumDur += dur; r.sumDist += dst;
      if (!r.fort) r.runCount++;
      r.fort = false;
      r.laeufe.push({ start: r.runStart / 1000, dauer: Math.round(dur / 1000), m: Math.round(dst) });
    }
  };
  return r;
}

// Spielt einen Verlauf ab. `wahr(s)` = wirkliches Tempo in m/s, `ohneGps(s)` = true -> kein Fix.
// Wie Garmin: in der Luecke bleibt currentSpeed auf dem letzten Wert, bis nach `haelt` s die Qualitaet
// absinkt (gpsPoor -> 0). elapsedDistance schreibt in der Luecke mit dem eingefrorenen Tempo weiter
// (schlimmster Fall — die Korrektur nimmt ihre eigene Strecke vom guten Fix).
function spiele({ sekunden, wahr, ohneGps = () => false, haelt = 20, mitFix = true }) {
  const r = recorder(mitFix);
  let lat = 47.5; let dist = 0; let cur = 0; let seitFix = 0; const ring = [0, 0, 0];
  for (let s = 0; s < sekunden; s++) {
    const t = s * 1000;
    lat += wahr(s) / 111320;
    if (!ohneGps(s)) {
      seitFix = 0; cur = wahr(s);
      r.L.fix(t, dist + cur, lat, 9.0, cur, 4, 0, r.foiling);
    } else {
      seitFix++;
      if (seitFix > haelt) cur = 0;
    }
    dist += cur;
    ring[s % 3] = cur;
    const v3 = [...ring].sort((a, b) => a - b)[1];
    r.update(v3, cur, dist, t);
  }
  return r;
}

const lauf = (von, bis, v = 3.2) => (s) => (s >= von && s < bis ? v : 0.3);

test('Sturz, Uhr 36 s unter Wasser: letzter Lauf endet am letzten Fix, nicht 25 s spaeter', () => {
  const opt = { sekunden: 200, wahr: lauf(20, 89), ohneGps: (s) => s >= 89 && s < 125 };
  const alt = spiele({ ...opt, mitFix: false });
  const neu = spiele(opt);
  assert.equal(alt.laeufe.length, 1);
  assert.ok(alt.laeufe[0].dauer >= 85, `Nachbau zeigt den alten Fehler: ${alt.laeufe[0].dauer} s`);
  assert.equal(neu.laeufe.length, 1);
  const d = neu.laeufe[0].dauer;
  assert.ok(d >= 66 && d <= 70, `wirklich ~69 s gefahren, Uhr zeigt ${d} s`);
  assert.ok(Math.abs(neu.laeufe[0].m - 69 * 3.2) < 20, `Strecke ${neu.laeufe[0].m} m`);
});

test('Luecke laeuft beim Ende noch (Qualitaet abgesunken, noch kein Fix zurueck): auch dann der letzte Fix', () => {
  const r = spiele({ sekunden: 200, wahr: lauf(20, 89), ohneGps: (s) => s >= 89 && s < 180, haelt: 10 });
  assert.equal(r.laeufe.length, 1);
  assert.ok(r.laeufe[0].dauer <= 70, `${r.laeufe[0].dauer} s`);
});

for (const n of [1, 2]) {
  test(`${n} s Luecke mitten im Lauf: nichts aendert sich`, () => {
    const opt = { sekunden: 200, wahr: lauf(20, 120), ohneGps: (s) => s >= 70 && s < 70 + n };
    const alt = spiele({ ...opt, mitFix: false });
    const neu = spiele(opt);
    assert.deepEqual(neu.laeufe, alt.laeufe);
    assert.equal(neu.laeufe.length, 1);
  });
}

test('Arm 8 s unter Wasser beim Pumpen, weitergefahren: ein Lauf in voller Laenge', () => {
  const r = spiele({ sekunden: 200, wahr: lauf(20, 120), ohneGps: (s) => s >= 70 && s < 78 });
  assert.equal(r.laeufe.length, 1);
  assert.ok(Math.abs(r.laeufe[0].dauer - 100) <= 2, `${r.laeufe[0].dauer} s`);
});

test('10 s Luecke ab 1 s vor dem Laufende: endet am letzten Fix (1 s zu frueh statt ~10 s zu spaet)', () => {
  const opt = { sekunden: 200, wahr: lauf(20, 120), ohneGps: (s) => s >= 119 && s < 129 };
  const alt = spiele({ ...opt, mitFix: false });
  const neu = spiele(opt);
  assert.ok(alt.laeufe[0].dauer >= 105, `alt ${alt.laeufe[0].dauer} s`);
  assert.ok(neu.laeufe[0].dauer >= 97 && neu.laeufe[0].dauer <= 100, `neu ${neu.laeufe[0].dauer} s`);
});

test('Luecke am Ende, aber ueber die Luftlinie durchgefahren (danach langsam): alles zaehlt', () => {
  // 10 s ohne Fix bei 3,2 m/s, erster Fix danach mit 2,0 m/s (Ausgleiten)
  const wahr = (s) => (s >= 20 && s < 110 ? 3.2 : s >= 110 && s < 113 ? 2.0 : 0.3);
  const opt = { sekunden: 200, wahr, ohneGps: (s) => s >= 100 && s < 110 };
  const r = spiele(opt);
  assert.equal(r.laeufe.length, 1);
  assert.ok(r.laeufe[0].dauer >= 88, `${r.laeufe[0].dauer} s`);
});

test('20 s Luecke mitten im Lauf, danach schnell weiter: zwei Laeufe wie auf dem Server, keine Fortsetzung', () => {
  const r = spiele({ sekunden: 260, wahr: lauf(20, 180), ohneGps: (s) => s >= 80 && s < 100, haelt: 30 });
  assert.equal(r.laeufe.length, 2, JSON.stringify(r.laeufe));
  assert.ok(Math.abs(r.laeufe[0].dauer - 60) <= 2, `erster ${r.laeufe[0].dauer} s`);
  assert.ok(r.laeufe[1].start >= 95, `zweiter beginnt nach der Luecke: ${r.laeufe[1].start}`);
  assert.equal(r.runCount, 2);
});

test('ohne Luecke: genau wie bisher', () => {
  const opt = { sekunden: 400, wahr: (s) => (s >= 20 && s < 90) || (s >= 150 && s < 260) ? 3.4 : 0.3 };
  assert.deepEqual(spiele(opt).laeufe, spiele({ ...opt, mitFix: false }).laeufe);
  assert.equal(spiele(opt).laeufe.length, 2);
});

test('Ausreisser nach der Luecke (Simulator 12.11.: 3,8 / 0,6 / 2,54 / 0 m/s) verhindert den Schnitt nicht', () => {
  const nach = [3.8, 0.6, 2.54, 0.0, 0.3];
  const wahr = (s) => (s >= 20 && s < 120 ? 3.6 : s >= 130 && s < 135 ? nach[s - 130] : 0.3);
  const r = spiele({ sekunden: 220, wahr, ohneGps: (s) => s >= 120 && s < 130 });
  assert.equal(r.laeufe.length, 1);
  assert.ok(r.laeufe[0].dauer <= 101, `${r.laeufe[0].dauer} s`);
});

test('nach der Luecke wirklich weitergefahren (> 3 s schnell), dann normal ausgeglitten: nichts geschnitten', () => {
  const wahr = (s) => (s >= 20 && s < 125 ? 3.4 : s >= 125 && s < 140 ? 3.4 : 0.3);
  const r = spiele({ sekunden: 220, wahr, ohneGps: (s) => s >= 110 && s < 120 });
  assert.equal(r.laeufe.length, 1);
  assert.ok(r.laeufe[0].dauer >= 115, `${r.laeufe[0].dauer} s`);
});
