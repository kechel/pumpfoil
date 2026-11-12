// GPS-Luecke am Lauf-Ende / im Lauf (12.11.2026, wie Garmin LaufLuecke.mc und watch/test/laufluecke.test.mjs).
// Uhr unter Wasser = keine Positionen. Im Lauf wird bis 15 s nie unterbrochen; am Ende zaehlt der letzte gute Fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import SL from "../common/lauf.js";
import "../common/luecke.js";   // GPS-Luecke (Watch 3/4; Watch 5 in Seiten.ets)

const M_GRAD = 1 / 111320;
/** plan: [[sekunden, m/s, gps]] — gps=false: keine Position (Tempo bewegt den Fahrer trotzdem weiter). */
function fahrt(plan, mitGpsTempo) {
  const s = new SL.Stand();
  let lat = 47.65, t = 0;
  for (const [n, v, gps] of plan) {
    for (let i = 0; i < n; i++) {
      lat += v * M_GRAD;
      s.tick(t * 1000, 1e12 + t * 1000, gps !== false, lat, 9.18, mitGpsTempo ? v : -1, 120);
      t++;
    }
  }
  return s;
}
const ca = (ms, soll, tol = 2000) => assert.ok(Math.abs(ms - soll) <= tol, `Dauer ${ms} statt ~${soll}`);

for (const tempo of [false, true]) {
  const art = tempo ? "GPS-Tempo" : "Tempo aus Positionen";
  test(`${art}: 1 s und 2 s Luecke mitten im Lauf aendern nichts`, () => {
    const s = fahrt([[5, 0], [30, 4], [1, 4, false], [30, 4], [2, 4, false], [30, 4], [20, 0.3]], tempo);
    assert.equal(s.runCount, 1);
    ca(s.lastRunDurMs, 93000, 3000);
  });
  test(`${art}: Arm unter Wasser 8 s, weitergefahren = EIN Lauf`, () => {
    const s = fahrt([[5, 0], [50, 3.4], [8, 3.4, false], [50, 3.4], [20, 0.3]], tempo);
    assert.equal(s.runCount, 1, "nicht geteilt");
    ca(s.lastRunDurMs, 108000, 3000);
  });
  test(`${art}: Sturz, 36 s ohne GPS, dann treiben = Lauf endet am letzten guten Fix`, () => {
    const s = fahrt([[5, 0], [69, 3.4], [36, 0, false], [40, 0.3]], tempo);
    assert.equal(s.runCount, 1);
    ca(s.lastRunDurMs, 69000);
    assert.ok(Math.abs(s.lastRunDistM - 69 * 3.4) < 30, `Strecke ${s.lastRunDistM}`);
  });
  test(`${art}: 10 s Luecke ab 1 s vor Laufende, danach langsam = Ende vor der Luecke`, () => {
    const s = fahrt([[5, 0], [51, 3.4], [10, 0.5, false], [40, 0.3]], tempo);
    assert.equal(s.runCount, 1);
    ca(s.lastRunDurMs, 51000);
  });
  test(`${art}: 20 s Luecke mitten im Lauf, schnell weiter = zwei Laeufe (wie der Server)`, () => {
    const s = fahrt([[5, 0], [40, 4], [20, 4, false], [40, 4], [20, 0.3]], tempo);
    assert.equal(s.runCount, 2);
    ca(s.lastRunDurMs, 40000, 5000);
  });
}
test("Ohne Luecke unveraendert: Lauf endet nach Ausgleiten", () => {
  const s = fahrt([[5, 0], [40, 4], [20, 0.3]], true);
  assert.equal(s.runCount, 1);
  ca(s.lastRunDurMs, 40000);
});
