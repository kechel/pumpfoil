// Pump-Zaehler der Uhr gegen den Server-Zaehler (find_pumps_cadence) auf echten Laeufen.
// Fixture: Jans eigene Garmin-Laeufe (nur Beschleunigung, 25 Hz), mit 10 s Vor-/Nachlauf;
// `ref` = Server-Zaehler auf demselben Ausschnitt, `server_pumps` = Wert aus der Analyse.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { kontext, WURZEL } from "./lade.mjs";

const laeufe = JSON.parse(fs.readFileSync(path.join(WURZEL, "test/fixtures/laeufe-jan.json"), "utf8"));

function werte(l) {
  const b = Buffer.from(l.b64, "base64");
  const a = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
  const n = a.length / 3, out = [];
  for (let i = 0; i < n; i++) out.push([a[3 * i] / l.scale, a[3 * i + 1] / l.scale, a[3 * i + 2] / l.scale]);
  return out;
}

// linear auf 50 Hz hochrechnen (so liefert die Suunto)
function auf50(w) {
  const out = [];
  for (let i = 0; i < w.length - 1; i++) {
    out.push(w[i]);
    out.push([(w[i][0] + w[i + 1][0]) / 2, (w[i][1] + w[i + 1][1]) / 2, (w[i][2] + w[i + 1][2]) / 2]);
  }
  out.push(w[w.length - 1]);
  return out;
}

function zaehle(w, fs, vor, nach) {
  const ctx = kontext(["quelle/pumpe.js"]);
  const p = new ctx.Pumpe(fs);
  let n = 0;
  for (let i = 0; i < w.length; i++) {
    const k = p.wert(w[i][0], w[i][1], w[i][2]);
    if (i >= vor && i < w.length - nach) n += k;
  }
  return n;
}

for (const fs of [25, 50]) {
  test(`Pumps je Lauf bei ${fs} Hz nah am Server-Zaehler`, () => {
    let summeUhr = 0, summeRef = 0;
    const zeilen = [];
    for (const l of laeufe) {
      const w = fs === 50 ? auf50(werte(l)) : werte(l);
      const f = fs / 25;
      const uhr = zaehle(w, fs, l.vor * f, l.nach * f);
      summeUhr += uhr; summeRef += l.ref;
      const gut = Math.abs(uhr - l.ref) <= Math.max(4, 0.15 * l.ref);
      zeilen.push(`${gut ? "  " : "!!"} ${l.s}/${l.lauf}: Uhr ${uhr} Server ${l.ref}`);
    }
    console.log(zeilen.join("\n"), `\nSumme Uhr ${summeUhr} Server ${summeRef}`);
    assert.ok(!zeilen.some((z) => z.startsWith("!!")), "Abweichung je Lauf zu gross");
    assert.ok(Math.abs(summeUhr - summeRef) <= 0.05 * summeRef, `Summe ${summeUhr} vs ${summeRef}`);
  });
}

test("Pump-Zeitpunkte nah an den Peaks des Servers (50 Hz)", () => {
  const fehler = [];
  for (const l of laeufe) {
    const w = auf50(werte(l));
    const ctx = kontext(["quelle/pumpe.js"]);
    const p = new ctx.Pumpe(50);
    for (const x of w) p.wert(x[0], x[1], x[2]);
    const uhr = Array.from(p.zeiten);
    for (const t of l.server_zeiten_s) {
      let m = 1e9;
      for (const u of uhr) if (Math.abs(u - t) < Math.abs(m)) m = u - t;
      fehler.push(m);
    }
  }
  const abs = fehler.map(Math.abs).sort((a, b) => a - b);
  const median = abs[abs.length >> 1], p90 = abs[Math.floor(abs.length * 0.9)];
  const mittel = fehler.reduce((a, b) => a + b, 0) / fehler.length;
  console.log(`Pump-Zeitpunkte: median ${median.toFixed(3)} s, p90 ${p90.toFixed(3)} s, Versatz ${mittel.toFixed(3)} s`);
  assert.ok(median < 0.08, "median " + median);
  assert.ok(p90 < 0.3, "p90 " + p90);
  assert.ok(Math.abs(mittel) < 0.05, "systematischer Versatz " + mittel);
});
