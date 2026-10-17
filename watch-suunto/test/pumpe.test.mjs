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
