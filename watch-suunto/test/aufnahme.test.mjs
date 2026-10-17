// Ganze Aufnahmen durch die echte app/main.js in der nachgebauten Firmware: Lauf-Erkennung, Pumps,
// Log-Kanaele, Anzeige und vor allem der Funk zum Handy — auch ueber viele und lange Abbrueche.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { WURZEL } from "./lade.mjs";
import { Uhr } from "./firmware.mjs";

const G = 9.80665;
const laeufe = JSON.parse(fs.readFileSync(path.join(WURZEL, "test/fixtures/laeufe-jan.json"), "utf8"));

/** 50-Hz-Beschleunigung (m/s²) eines Fixture-Laufs, nur der eigentliche Lauf. */
function laufAccel(l) {
  const b = Buffer.from(l.b64, "base64");
  const a = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
  const n = a.length / 3, w = [];
  for (let i = l.vor; i < n - l.nach - 1; i++) {
    const p = [a[3 * i], a[3 * i + 1], a[3 * i + 2]].map((v) => (v / l.scale) * G);
    const q = [a[3 * i + 3], a[3 * i + 4], a[3 * i + 5]].map((v) => (v / l.scale) * G);
    w.push(p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
  }
  return w;
}

/**
 * Drehbuch: je Lauf 30 s ruhig, dann der Lauf mit 4 m/s, dazwischen eine Pause von 40 s.
 * Liefert je Sekunde {sp, lat, lon} und je 20 ms einen Beschleunigungswert.
 */
function drehbuch(nLaeufe) {
  const sek = [], acc = [];
  let lat = 47.0, ruhig = () => [0.1 * G, 0.05 * G, 0.99 * G];
  const still = (s, v) => {
    for (let i = 0; i < s; i++) {
      sek.push({ sp: v, lat, lon: 9.0 }); lat += v / 111000;
      for (let k = 0; k < 50; k++) acc.push(ruhig().map((x, j) => x + 0.02 * Math.sin(k + j + i)));
    }
  };
  const genutzt = [];
  for (let r = 0; r < nLaeufe; r++) {
    const l = laeufe[r % laeufe.length];
    still(30, 0.4);
    const w = laufAccel(l), s = Math.floor(w.length / 50);
    for (let i = 0; i < s; i++) { sek.push({ sp: 4.2, lat, lon: 9.0 }); lat += 4.2 / 111000; }
    for (let i = 0; i < s * 50; i++) acc.push(w[i]);
    genutzt.push({ l, s });
  }
  still(30, 0.3);
  return { sek, acc, genutzt };
}

/** Spielt das Drehbuch ab. stoerung(sekunde) -> true = Handy in dieser Sekunde weg. */
function abspielen(db, { stoerung = () => false, ueberEvaluate = false, einstellungen = {}, pauseBei = -1 } = {}) {
  const uhr = new Uhr({ einstellungen: { handy: "true", hz: "0", ...einstellungen } });
  uhr.ruf("onLoad");
  let utc = 1792200000, t = 0;
  // Startbildschirm: GPS da -> Positionsmeldung
  for (let i = 0; i < 5; i++) {
    uhr.bis(t += 1000);
    uhr.ruf("evaluate", { rdy: 100, pos: { latitude: 470000000, longitude: 90000000 }, utc: utc + i, lt: utc + 7200 });
  }
  uhr.ruf("getUserInterface");
  uhr.ruf("onExerciseStart", { utc });
  let aktiv = 0, accIdx = 0, pausiert = false;
  const log = {}, zuletzt = {};
  for (let s = 0; s < db.sek.length; s++) {
    if (s === pauseBei) {
      uhr.ruf("onExercisePause"); pausiert = true;
      for (let k = 0; k < 40; k++) { uhr.bis(t += 1000); uhr.ruf("evaluate", { utc: utc + s, lt: utc + 7200 }); }
      uhr.ruf("onExerciseContinue"); pausiert = false;
    }
    uhr.handy(!stoerung(s));
    const batch = [];
    for (let h = 0; h < 2; h++) {
      const x = [], y = [], z = [];
      for (let k = 0; k < 25 && accIdx < db.acc.length; k++, accIdx++) {
        x.push(db.acc[accIdx][0]); y.push(db.acc[accIdx][1]); z.push(db.acc[accIdx][2]);
      }
      batch.push({ time: 100000 + aktiv + h * 500, x, y, z });
      uhr.bis(t += 500);
      if (!ueberEvaluate) uhr.ruf("onAccelerometer", { acc: batch[h] });
    }
    aktiv += 1000;
    const g = db.sek[s];
    const inp = { tmr: aktiv, sp: g.sp, hr: 2.2, pos: { latitude: Math.round(g.lat * 1e7), longitude: Math.round(g.lon * 1e7) },
      rdy: 100, utc: utc + 5 + s, lt: utc + 7200 + s, alt: 400, asc: 3 };
    if (ueberEvaluate) {
      const b = batch[0];
      inp.acc = { time: b.time, x: b.x.concat(batch[1].x), y: b.y.concat(batch[1].y), z: b.z.concat(batch[1].z) };
    }
    uhr.ruf("evaluate", inp);
    // Log wie die Uhr: nur geaenderte Werte landen im Workout
    for (const k of ["pf_foil", "pf_p1", "pf_p2", "pf_int", "pf_peak"]) {
      const v = uhr.output[k];
      if (v !== zuletzt[k]) { (log[k] = log[k] || []).push([s, v]); zuletzt[k] = v; }
    }
  }
  // Ende wie auf der Uhr: erst Pause, dann ein paar Sekunden Menue, dann Ende
  uhr.handy(true);
  uhr.ruf("onExercisePause");
  for (let k = 0; k < 15; k++) { uhr.bis(t += 1000); uhr.ruf("evaluate", { utc: utc + 9999, lt: utc }); }
  uhr.ruf("onExerciseEnd");
  uhr.bis(t += 2000);
  const zusammenfassung = uhr.ruf("getSummaryOutputs");
  return { uhr, zusammenfassung, pausiert, log };
}

/** Was die Uhr bei 25 Hz senden muesste: Paare gemittelt, int16 mit 2048 = 1 g. */
function erwartet25(acc) {
  const out = [];
  for (let i = 0; i + 1 < acc.length; i += 2) {
    for (let j = 0; j < 3; j++) out.push(Math.round(((acc[i][j] + acc[i + 1][j]) / 2 / G) * 2048));
  }
  return out;
}

test("ohne Stoerung: jeder Beschleunigungswert kommt an, Laeufe und Pumps stimmen", () => {
  const db = drehbuch(4);
  const { uhr, zusammenfassung } = abspielen(db);
  const e = uhr.empf;
  assert.equal(e.hallo.einheit, 0, "Einheit m/s² erkannt");
  assert.equal(e.hallo.hz, 25);
  assert.ok(e.position, "Positionsmeldung kam an");
  assert.ok(Math.abs(e.position[0] - 47) < 1e-6);
  const werte = e.accelBloecke().flatMap((b) => b.werte);
  const soll = erwartet25(db.acc);
  assert.equal(werte.length, soll.length, "Anzahl Werte");
  let max = 0;
  for (let i = 0; i < soll.length; i++) max = Math.max(max, Math.abs(werte[i] - soll[i]));
  assert.ok(max <= 1, "Werte gleich (Rundung), max Abweichung " + max);
  // Zeitachse: Bloecke 1 s lang, luecken- und versatzfrei
  const b = e.accelBloecke();
  for (let i = 1; i < b.length; i++) assert.equal(b[i].t - b[i - 1].t, 1000, "Block " + i);
  assert.equal(e.gps.size, db.sek.length, "GPS je Sekunde");
  const arten = [...e.ereignisse.values()].map((x) => x.art);
  assert.deepEqual(arten, [1, 2, 4], "Start, Pause, Ende");
  // Laeufe (Uhr) und Pumps
  const laeufeUhr = zusammenfassung.find((z) => z.id === "l").value;
  assert.equal(laeufeUhr, 4);
  const pumps = zusammenfassung.find((z) => z.id === "p").value;
  const ref = db.genutzt.reduce((s, g) => s + g.l.ref, 0);
  console.log(`Pumps Uhr ${pumps}, Server ${ref}`);
  assert.ok(Math.abs(pumps - ref) <= 0.12 * ref, `Pumps ${pumps} vs Server ${ref}`);
  assert.ok(uhr.vibration.length >= 8, "Vibration bei Laufbeginn und -ende");
  assert.match(uhr.texte["#s"], /Handy/);
});

test("Werte ueber evaluate statt onAccelerometer (Forum) — gleiches Ergebnis", () => {
  const db = drehbuch(2);
  const { uhr } = abspielen(db, { ueberEvaluate: true });
  assert.equal(uhr.empf.accelBloecke().flatMap((b) => b.werte).length, erwartet25(db.acc).length);
});

test("viele kurze Abbrueche (bis 40 s): nichts geht verloren", () => {
  const db = drehbuch(5);
  // alle 90 s eine Funkpause von 10–40 s
  const stoerung = (s) => s % 90 >= 50 && s % 90 < 50 + (10 + (s / 90 | 0) * 7 % 31);
  const { uhr } = abspielen(db, { stoerung });
  const werte = uhr.empf.accelBloecke().flatMap((b) => b.werte);
  assert.equal(werte.length, erwartet25(db.acc).length);
  assert.equal(uhr.empf.gps.size, db.sek.length);
});

test("langer Ausfall (Handy 3 min weg): Luecke wird sauber gemeldet, danach laeuft es weiter", () => {
  const db = drehbuch(6);
  const { uhr } = abspielen(db, { stoerung: (s) => s >= 60 && s < 240 });
  const b = uhr.empf.accelBloecke();
  const soll = erwartet25(db.acc).length / 75;
  assert.ok(b.length < soll && b.length > soll - 180, `Bloecke ${b.length} von ${soll}`);
  // jede Luecke ist an der Blocknummer UND an der Zeit erkennbar (kein Versatz danach)
  for (let i = 1; i < b.length; i++) assert.equal(b[i].t - b[i - 1].t, (b[i].nr - b[i - 1].nr) * 1000);
  assert.equal(b[b.length - 1].nr, soll - 1, "der letzte Block kam an");
});

test("mit Pause mitten in der Aufnahme: Zeitachse bleibt aktiv-zeitbasiert", () => {
  const db = drehbuch(3);
  const { uhr } = abspielen(db, { pauseBei: 100 });
  const b = uhr.empf.accelBloecke();
  for (let i = 1; i < b.length; i++) assert.equal(b[i].t - b[i - 1].t, 1000, "Block " + i);
  const arten = [...uhr.empf.ereignisse.values()].map((x) => x.art);
  assert.deepEqual(arten, [1, 2, 3, 2, 4]);
});

test("Handy-Sync aus: kein Funk, Log-Kanaele trotzdem", () => {
  const db = drehbuch(2);
  const { uhr } = abspielen(db, { einstellungen: { handy: "false" } });
  assert.equal(uhr.writes, 0);
  assert.ok(uhr.output.pf_int >= 0);
});

test("50 Hz: Bloecke mit 25 Werten je halbe Sekunde", () => {
  const db = drehbuch(1);
  const { uhr } = abspielen(db, { einstellungen: { hz: "1" } });
  const b = uhr.empf.accelBloecke();
  assert.equal(uhr.empf.hallo.hz, 50);
  assert.equal(b[1].t - b[0].t, 500);
  assert.equal(b.flatMap((x) => x.werte).length, (db.acc.length) * 3);
});

test("Pump-Marker im Workout-Log: jeder Pump einmal, mit Zeitpunkt", () => {
  const db = drehbuch(3);
  const { log, zusammenfassung } = abspielen(db);
  // Server-Sicht: aus den geloggten Werten (Nummer + Versatz) die Pumps zurueckrechnen
  const pumps = new Map();
  for (const k of ["pf_p1", "pf_p2"]) for (const [s, v] of log[k] || []) {
    if (!v) continue;
    const nr = Math.floor(v + 1e-9), versatz = v - nr;
    pumps.set(nr, s + 1 - (1 + versatz));      // Datenpunkt s liegt bei aktiver Sekunde s+1
  }
  const nrs = [...pumps.keys()].sort((a, b) => a - b);
  assert.ok(nrs.length > 0);
  assert.equal(nrs[0], 1, "Nummern beginnen bei 1");
  const fehlend = nrs[nrs.length - 1] - nrs.length;
  assert.ok(fehlend <= 2, "hoechstens vereinzelt ein dritter Pump je Sekunde verloren: " + fehlend);
  // Pumps in den Laeufen (Server-Zeitpunkte, ins Drehbuch umgerechnet) finden sich im Log wieder
  let start = 0, treffer = 0, gesamt = 0;
  for (const g of db.genutzt) {
    start += 30;
    for (const t of g.l.server_zeiten_s) {
      const tl = start + (t - g.l.vor / 25);
      if (tl < start || tl > start + g.s) continue;
      gesamt++;
      let m = 1e9; for (const u of pumps.values()) m = Math.min(m, Math.abs(u - tl));
      if (m < 0.25) treffer++;
    }
    start += g.s;
  }
  console.log(`Pump-Marker: ${nrs.length} im Log, ${treffer}/${gesamt} Server-Pumps innerhalb 0,25 s`);
  assert.ok(treffer / gesamt > 0.8, `${treffer}/${gesamt}`);
});

test("Konfiguration vom Handy: Seiten, Alarm und Sprache gelten sofort und bleiben gespeichert", () => {
  const uhr = new Uhr({ einstellungen: { handy: "true" } });
  uhr.ruf("onLoad");
  let t = 0;
  for (let i = 0; i < 4; i++) { uhr.bis(t += 1000); uhr.ruf("evaluate", { utc: 1, lt: 0 }); }
  const k = JSON.stringify({ views: [[20, 1, 2]], offFoilView: [12, 17, 16], alarmEnabled: true, speedHigh: 25, spr: 0 });
  const teile = [];
  for (let i = 0; i < k.length; i += 17) teile.push(k.slice(i, i + 17));
  // in falscher Reihenfolge und mit einer Wiederholung
  const reihe = teile.map((s, i) => [i, s]).reverse();
  reihe.push(reihe[0]);
  for (const [i, s] of reihe) uhr.handler(0, 106, [0x83, i, teile.length, ...Buffer.from(s, "ascii")]);
  uhr.bis(t += 1000); uhr.ruf("evaluate", { utc: 1, lt: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(uhr.ctx.kf.views)), [[20, 1, 2]]);
  assert.equal(uhr.ctx.aw.alarm, true);
  assert.equal(uhr.ctx.sprache, 0);
  assert.equal(uhr.ctx.t("f.runs"), "Läufe");
  assert.ok(uhr.speicher.get("konfig"), "gespeichert");
  // neuer App-Start ohne Handy: gespeicherte Konfiguration gilt
  const zwei = new Uhr({ einstellungen: { handy: "false" } });
  zwei.speicher.set("konfig", uhr.speicher.get("konfig"));
  zwei.ruf("onLoad");
  assert.deepEqual(JSON.parse(JSON.stringify(zwei.ctx.kf.views)), [[20, 1, 2]]);
  assert.equal(zwei.ctx.sprache, 0);
});
