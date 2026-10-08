// ENDE-ZU-ENDE, Teil Uhr (Jan, 08.10.2026: „wir testen vorher was wir koennen"). Der ECHTE
// common/recorder.js laeuft in Node: Systemmodule als Attrappen (test/e2e/mock, per Loader-Hook),
// kuenstliche Zeit, eine Wear Engine, die Nachrichten verliert und doppelt zustellt. Aufgenommen wird
// eine Fahrt mit Pause (150 s, 40 s Pause, 120 s), danach laeuft die Sendeschleife, bis alles drueben ist.
//
// Ergebnis sind zwei Dateien, auf denen die anderen Glieder der Kette aufsetzen:
//   test/fixtures/huawei-e2e-nachrichten.txt  jede Nachricht, die beim Handy ANKAM, in der Reihenfolge
//   test/fixtures/huawei-e2e-dateien.json     die Dateien, wie die Uhr sie schrieb (Sollzustand)
// Handy: android/…/HuaweiBrueckeE2ETest.kt setzt die Nachrichten wieder zu Dateien zusammen.
// Server: server/tests/test_huawei_e2e.py laedt die Dateien wie die Bruecke hoch.
// Aendert sich das Format absichtlich: HUAWEI_E2E_NEU=1 node --test test/e2e-uebertragung.test.mjs
import { test, mock } from "node:test";
import { kuenstlicheZeit } from "./e2e/uhrzeit.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";

register("./e2e/hook.mjs", import.meta.url);
const { uhr } = await import("./e2e/mock/uhr.mjs");
const K = (await import("../common/kern.js")).default;

const T0 = Date.UTC(2026, 9, 8, 10, 0, 0);
const FIX = new URL("./fixtures/", import.meta.url);

/** Wear Engine der Uhr: jede 11. Sendung geht verloren, jede 17. kommt an, meldet aber Fehler. */
function wearEngine(zugestellt, protokoll) {
  let n = 0;
  function P2pClient() {}
  P2pClient.prototype.setPeerPkgName = function (p) { this.pkg = p; };
  P2pClient.prototype.setPeerFingerPrint = function () {};
  P2pClient.prototype.registerReceiver = function () {};
  P2pClient.prototype.send = function (m, cb) {
    n++;
    const text = m.builder.text, pkg = this.pkg;
    const verloren = n % 11 === 0, doppelt = n % 17 === 0;
    if (!verloren && pkg === "org.pumpfoil.app") zugestellt.push(text);
    const code = verloren || doppelt || pkg !== "org.pumpfoil.app" ? 0 : 207;
    protokoll.push(code);
    setTimeout(() => cb.onSendResult({ code }), 30);
  };
  function Builder() {}
  Builder.prototype.setDescription = function (t) { this.text = t; };
  function Message() {}
  return { P2pClient, Message, Builder };
}

/** Die Seite des Handys in einfach: Teile sammeln, fertige Dateien ablegen (Referenz fuer den Kotlin-Test). */
function handy(nachrichten) {
  const teile = new Map(), dateien = {};
  for (const n of nachrichten) {
    const f = n.split("|");
    const [name, nr, anzahl] = [f[1], +f[2], +f[3]];
    if (!teile.has(name)) teile.set(name, new Array(anzahl));
    const a = teile.get(name);
    a[nr] = f.slice(5).join("|");
    // gezaehlt, nicht a.every(): every ueberspringt leere Stellen und haelt [t0, , ] fuer vollstaendig
    if (a.filter((x) => typeof x === "string").length === anzahl) { dateien[name] = a.join(""); teile.delete(name); }
  }
  return dateien;
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("Ende-zu-Ende Uhr: Fahrt mit Pause, Verluste und Doppelte — alles kommt genau einmal an", async () => {
  const zeit = kuenstlicheZeit(T0);
  const zufall = mock.method(Math, "random", () => 0.4242);
  try {
    const R = (await import("../common/recorder.js")).default;
    const zugestellt = [], codes = [];
    R.init(wearEngine(zugestellt, codes));
    let lat = 52.5, lon = 13.4;
    const laufen = async (ms, aufnahme) => {
      for (let t = 0; t < ms; t += 20) {
        zeit.tick(20);
        const jetzt = Date.now();
        if (aufnahme && uhr.accel) {
          const p = Math.sin((jetzt - T0) / 1000 * 2 * Math.PI);   // Pumpen mit 1 Hz
          uhr.accel.success({ x: 0.3 * p, y: 0.1, z: 9.81 + 2 * p });
        }
        if (jetzt % 1000 === 0) {
          if (aufnahme && uhr.gps) { lat += 4 / 111320; uhr.gps.success({ latitude: lat, longitude: lon, accuracy: 5, time: jetzt }); }
          if (aufnahme && uhr.puls) uhr.puls.success({ heartRate: 120 + ((jetzt / 1000) % 7) });
          R.takt();   // wie die Seite, einmal je Sekunde
        }
        await flush();
      }
    };
    await laufen(5000, false);          // Start, Hallo
    R.start(); await flush();
    assert.equal(R.modus, "laeuft");
    await laufen(150000, true);
    R.pause(); await flush();
    await laufen(40000, true);          // Sensoren sind aus: es darf nichts ankommen
    R.weiter(); await flush();
    await laufen(120000, true);
    R.stopp(); await flush();
    for (let i = 0; i < 2400 && (R.plan.offen() > 0 || R.halloOffen); i++) await laufen(500, false);

    // Uhr: alles drueben, nichts liegen geblieben
    assert.equal(R.plan.offen(), 0, "Sendeplan leer");
    const rest = [...uhr.dateien.keys()].filter((u) => /\/(m|c|e)_/.test(u));
    assert.deepEqual(rest, [], "keine Aufnahme-Datei mehr auf der Uhr");
    assert.ok(codes.includes(0) && codes.includes(207), "Fehler UND Erfolge kamen vor");

    // Sollzustand: die Dateien, wie die Uhr sie schrieb
    const soll = {};
    for (const [uri, text] of uhr.geschrieben) {
      const name = uri.substring(uri.lastIndexOf("/") + 1);
      if (/^(m|c|e)_/.test(name)) soll[name] = text;
    }
    const ist = handy(zugestellt);
    for (const k of Object.keys(ist)) if (k.startsWith("h_")) delete ist[k];
    assert.deepEqual(Object.keys(ist).sort(), Object.keys(soll).sort(), "dieselben Dateien");
    // Inhalt gleich, nicht Text: fuer den Funkweg schreibt kern.teile Nicht-ASCII als \uXXXX.
    for (const k of Object.keys(soll)) assert.deepEqual(JSON.parse(ist[k]), JSON.parse(soll[k]), k);
    assert.ok(zugestellt.length > Object.keys(soll).length, "doppelte Teile kamen an (Wiederholung nach Fehler)");

    // Inhalt: lueckenlose Indizes, Pause im Ende, Mengen plausibel
    const chunks = Object.keys(soll).filter((k) => k.startsWith("c_")).map((k) => JSON.parse(soll[k]));
    const idx = chunks.map((c) => c.index).sort((a, b) => a - b);
    assert.deepEqual(idx, idx.map((_, i) => i), "Indizes 0..n-1 ohne Luecke");
    const ende = JSON.parse(soll[Object.keys(soll).find((k) => k.startsWith("e_"))]);
    assert.equal(ende.total_chunks, chunks.length);
    assert.equal(ende.pauses.length, 1, "eine Pause");
    const accel = chunks.filter((c) => c.kind === "accel").reduce((s, c) => s + c.count, 0);
    const gps = chunks.filter((c) => c.kind === "gps").reduce((s, c) => s + c.count, 0);
    assert.ok(Math.abs(accel - 270 * 50) <= 50, `Accel ${accel} ~ 13500`);
    assert.ok(Math.abs(gps - 270) <= 3, `GPS ${gps} ~ 270`);

    const nachrichten = zugestellt.join("\n") + "\n";
    const dateien = JSON.stringify(soll, Object.keys(soll).sort(), 1) + "\n";
    if (process.env.HUAWEI_E2E_NEU) {
      fs.writeFileSync(new URL("huawei-e2e-nachrichten.txt", FIX), nachrichten);
      fs.writeFileSync(new URL("huawei-e2e-dateien.json", FIX), dateien);
    }
    assert.equal(fs.readFileSync(new URL("huawei-e2e-nachrichten.txt", FIX), "utf8"), nachrichten,
      "Testdaten veraltet — HUAWEI_E2E_NEU=1 node --test test/e2e-uebertragung.test.mjs");
    assert.equal(fs.readFileSync(new URL("huawei-e2e-dateien.json", FIX), "utf8"), dateien);
  } finally {
    zufall.mock.restore();
    zeit.zurueck();
  }
});
