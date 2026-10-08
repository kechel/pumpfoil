// Kuenstliche Zeit fuer den Ende-zu-Ende-Test, ohne node:test mock.timers: build-all.sh laeuft mit dem
// Node der HarmonyOS-Werkzeuge (v18), dort kann mock.timers weder Date noch `now`. Ersetzt Date.now,
// setTimeout/setInterval/clear* global; tick(ms) laesst die faelligen Rueckrufe in Zeitreihenfolge laufen.
export function kuenstlicheZeit(start) {
  const echt = { now: Date.now, st: globalThis.setTimeout, si: globalThis.setInterval,
    ct: globalThis.clearTimeout, ci: globalThis.clearInterval };
  let jetzt = start, naechsteId = 1;
  const plan = new Map();   // id -> { wann, fn, alle }
  Date.now = () => jetzt;
  globalThis.setTimeout = (fn, ms) => { const id = naechsteId++; plan.set(id, { wann: jetzt + (ms || 0), fn }); return id; };
  globalThis.setInterval = (fn, ms) => { const id = naechsteId++; plan.set(id, { wann: jetzt + ms, fn, alle: ms }); return id; };
  globalThis.clearTimeout = globalThis.clearInterval = (id) => { plan.delete(id); };
  return {
    tick(ms) {
      const ziel = jetzt + ms;
      for (;;) {
        let id = null, e = null;
        for (const [k, v] of plan) if (v.wann <= ziel && (!e || v.wann < e.wann || (v.wann === e.wann && k < id))) { id = k; e = v; }
        if (!e) break;
        jetzt = e.wann;
        if (e.alle) e.wann += e.alle; else plan.delete(id);
        e.fn();
      }
      jetzt = ziel;
    },
    zurueck() {
      Date.now = echt.now; globalThis.setTimeout = echt.st; globalThis.setInterval = echt.si;
      globalThis.clearTimeout = echt.ct; globalThis.clearInterval = echt.ci;
    },
  };
}
