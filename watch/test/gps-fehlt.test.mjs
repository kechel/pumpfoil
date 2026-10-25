// Speicher sparen OHNE brauchbares GPS (Roman, #19003, 25.10.2026): die Uhr hatte vor dem Start kurz einen
// Fix, danach kam kein GPS mehr; Speicher sparen entscheidet am GPS-Tempo, hielt ihn fuer stehend und warf
// ~2 Minuten samt Accel weg — ein Lauf war komplett verloren. Jetzt: GPS schlecht -> alles speichern.
// Monkey C laeuft nicht in Node — der Test stellt _gpsPunkt/onAccel/gpsPoor (SessionRecorder.mc) nach,
// spielt Romans Ablauf durch und prueft, dass die tragenden Zeilen so im Quelltext stehen.
//   node --test watch/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(path.join(hier, '..', 'source', 'SessionRecorder.mc'), 'utf-8');

test('tragende Zeilen stehen im Quelltext', () => {
  assert.match(quelle, /if \(info == null \|\| info\.position == null\) \{ _gpsQuality = 0; return; \}/);
  assert.match(quelle, /_gZ\[12\] = System\.getTimer\(\);/);
  assert.match(quelle, /var p = _gpsQuality < Position\.QUALITY_USABLE \|\| z\[12\] == 0 \|\| t - z\[12\] > 60000;/);
  assert.match(quelle, /if \(!z\[6\] \|\| gpsPoor\(\)\) \{/);
  assert.match(quelle, /if \(z\[6\] && z\[2\] == 0 && z\[5\] == 0 && !gpsPoor\(\)\) \{/);
  assert.match(quelle, /return _hasGpsFix && !\(gpsPoor\(\) && System\.getTimer\(\) - _gZ\[13\] >= 3000\);/);
});

// --- Nachbau (vereinfacht: 1 GPS-Event und 1 Accel-Paket a 25 Samples je Sekunde) ---
function recorder() {
  const r = {
    q: 0, lastPos: 0, sparen: true,
    vorlauf: [], tempi: [], haelt: 0, ein: 0, aus: 0, nach: 0, ring: [],
    gps: [], accelChunks: [], accelBuf: [], accelT0: 0, luecke: false, t: 0,
  };
  r.poor = () => r.q < 3 || r.lastPos === 0 || r.t - r.lastPos > 60000;
  r.flush = () => { if (r.accelBuf.length) { r.accelChunks.push({ t0: r.accelT0, n: r.accelBuf.length }); r.accelBuf = []; } };
  r.add = (pkt) => { if (!r.accelBuf.length) r.accelT0 = pkt.t; r.accelBuf.push(...pkt.s); if (r.accelBuf.length >= 250) r.flush(); };
  r.gpsPunkt = (p) => {
    if (!r.sparen || r.poor()) { r.gps.push(...r.vorlauf, p); r.vorlauf = []; return; }
    r.tempi.push(p.spd); if (r.tempi.length > 3) r.tempi.shift();
    const v3 = [...r.tempi].sort((a, b) => a - b)[Math.floor((r.tempi.length - 1) / 2)];
    r.ein = v3 >= 1.667 ? r.ein + 1 : 0;
    if (r.haelt === 0 && r.ein >= 3) {
      r.haelt = 1; r.aus = 0; r.nach = 0;
      r.gps.push(...r.vorlauf); r.vorlauf = [];
      for (const pkt of r.ring) r.add(pkt); r.ring = [];
    }
    if (r.haelt === 1) {
      r.gps.push(p); r.aus = v3 < 1.389 ? r.aus + 1 : 0;
      if (r.aus >= 3) { r.haelt = 0; r.nach = p.t + 30000; }
    } else if (r.nach > 0 && p.t <= r.nach) {
      r.gps.push(p);
    } else {
      if (r.nach > 0) { r.nach = 0; r.flush(); r.luecke = true; }
      r.vorlauf.push(p); r.vorlauf = r.vorlauf.filter((x) => x.t >= p.t - 33000);
    }
  };
  r.onPosition = (pos) => {           // pos = null: Event ohne Position
    if (!pos) { r.q = 0; return; }
    r.lastPos = r.t; r.q = pos.q;
    r.gpsPunkt({ t: r.t, spd: pos.spd });
  };
  r.onAccel = (pkt) => {
    if (r.sparen && r.haelt === 0 && r.nach === 0 && !r.poor()) {
      if (r.accelBuf.length) { r.flush(); r.luecke = true; }
      r.ring.push(pkt); r.ring = r.ring.filter((x) => x.t >= pkt.t - 33000);
      return;
    }
    for (const x of r.ring) r.add(x); r.ring = [];
    r.add(pkt);
  };
  return r;
}

function spiele(r, sekunden, gpsBei) {
  for (let s = 0; s < sekunden; s++) {
    r.t = s * 1000;
    r.onPosition(gpsBei(s));
    r.onAccel({ t: r.t, s: new Array(25).fill(s) });
  }
  r.flush();
}
const gespeichert = (r, von, bis) =>
  r.accelChunks.filter((c) => c.t0 >= von * 1000 && c.t0 < bis * 1000).reduce((a, c) => a + c.n, 0);

test('Romans Ablauf: Lauf ohne GPS am Anfang bleibt erhalten (Accel + spaetere Punkte)', () => {
  const r = recorder();
  // 0-119 s: kein GPS (Events ohne Position), er faehrt; ab 120 s gutes GPS, steht; 160-210 s faehrt er.
  spiele(r, 300, (s) => (s < 120 ? null : { q: 4, spd: s >= 160 && s < 210 ? 4.0 : 0.3 }));
  assert.equal(gespeichert(r, 0, 120), 120 * 25, 'Accel der GPS-losen ersten 2 Minuten');
  assert.ok(r.gps.some((p) => p.t === 170000), 'Lauf mit GPS gespeichert');
  assert.ok(r.luecke, 'Luecke danach gemeldet (accel_luecken)');
  // kein Chunk ueberspannt die Luecke zwischen GPS-los-Phase und naechstem Abschnitt
  for (const c of r.accelChunks) assert.ok(!(c.t0 < 120000 && c.t0 + c.n * 40 > 127000));
});

test('mit gutem GPS spart es weiter (Stehen wird nicht gespeichert)', () => {
  const r = recorder();
  spiele(r, 600, (s) => ({ q: 4, spd: s >= 300 && s < 360 ? 4.0 : 0.2 }));
  const n = r.accelChunks.reduce((a, c) => a + c.n, 0);
  assert.ok(n < 200 * 25, `nur der Abschnitt mit Vor- und Nachlauf, nicht ${n / 25} s`);
});

test('GPS faellt mitten im Stehen 70 s ganz aus (keine Events) -> nach 60 s wird gespeichert', () => {
  const r = recorder();
  spiele(r, 400, (s) => (s >= 200 && s < 270 ? undefined : { q: 4, spd: 0.2 }));
  // undefined = gar kein Event: onPosition(undefined) setzt nur q=0 — wie ein Event ohne Position;
  // spaetestens nach 60 s ohne Position greift die Frist auch ohne Events.
  assert.ok(gespeichert(r, 200, 270) > 0);
});
