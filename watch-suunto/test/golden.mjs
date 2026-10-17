// Erzeugt Testvektoren fuer die Handy-Seiten (Android: app/src/test/resources/suunto/pakete.json):
// alle Pakete, die die echte app/main.js in einer kurzen Aufnahme (mit Abbruch und Pause) sendet,
// in Empfangsreihenfolge, und was daraus rekonstruiert werden muss. Aufruf: node test/golden.mjs
import fs from "node:fs";
import path from "node:path";
import { Uhr } from "./firmware.mjs";
import { WURZEL } from "./lade.mjs";

const G = 9.80665;
const uhr = new Uhr({ einstellungen: { handy: "true", hz: "0", uhrId: "305419896" } });   // feste Uhr-ID: Testvektoren reproduzierbar
const pakete = [];
const orig = uhr.empf.paket.bind(uhr.empf);
uhr.empf.paket = (p) => { pakete.push(Array.from(p)); orig(p); };
uhr.ruf("onLoad");
let t = 0, utc = 1792200000;
for (let i = 0; i < 3; i++) { uhr.bis(t += 1000); uhr.ruf("evaluate", { rdy: 100, pos: { latitude: 471234567, longitude: 91234567 }, utc }); }
uhr.ruf("onExerciseStart", { utc });
let aktiv = 0;
for (let s = 0; s < 90; s++) {
  if (s === 40) { uhr.ruf("onExercisePause"); for (let k = 0; k < 5; k++) { uhr.bis(t += 1000); uhr.ruf("evaluate", { utc }); } uhr.ruf("onExerciseContinue"); }
  uhr.handy(!(s >= 20 && s < 32));
  for (let h = 0; h < 2; h++) {
    const x = [], y = [], z = [];
    for (let k = 0; k < 25; k++) { const ph = (aktiv + h * 500 + k * 20) / 1000; x.push(0.1 * G + Math.sin(ph * 9)); y.push(0.2 * G * Math.cos(ph * 3)); z.push(0.98 * G + 0.3 * Math.sin(ph * 8.8)); }
    uhr.bis(t += 500);
    uhr.ruf("onAccelerometer", { acc: { time: 5000 + aktiv + h * 500, x, y, z } });
  }
  aktiv += 1000;
  uhr.ruf("evaluate", { tmr: aktiv, sp: s > 10 && s < 60 ? 4 : 0.5, hr: 2.0, pos: { latitude: 471234567 + s * 30, longitude: 91234567 }, rdy: 100, utc: utc + s, lt: utc, alt: 412 });
}
uhr.handy(true);
uhr.ruf("onExercisePause");
for (let k = 0; k < 10; k++) { uhr.bis(t += 1000); uhr.ruf("evaluate", { utc }); }
uhr.ruf("onExerciseEnd");
uhr.bis(t += 2000);
const e = uhr.empf;
const aus = {
  hinweis: "erzeugt von watch-suunto/test/golden.mjs — nicht von Hand aendern",
  pakete,
  erwartet: {
    hallo: e.hallo,
    position: e.position,
    bloecke: e.accelBloecke(),
    gps: [...e.gps.values()].sort((a, b) => a.nr - b.nr),
    ereignisse: [...e.ereignisse.values()].map(({ nr, art, t, sek }) => ({ nr, art, t, sek })),
    quittung: e.quittung(),
  },
};
const ziel = path.resolve(WURZEL, "../android/app/src/test/resources/suunto/pakete.json");
fs.writeFileSync(ziel, JSON.stringify(aus));
console.log(ziel, pakete.length, "Pakete,", aus.erwartet.bloecke.length, "Bloecke,", aus.erwartet.gps.length, "GPS");
