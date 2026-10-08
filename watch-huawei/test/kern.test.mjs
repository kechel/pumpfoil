// Kern des Huawei-Recorders in Node pruefen: node --test watch-huawei/test/
// Was sich ohne Uhr pruefen laesst, wird hier geprueft (Regel 13.09.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import K from "../common/kern.js";

test("base64 wie Node", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 100, 1500]) {
    const b = Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
    assert.equal(K.b64(b), Buffer.from(b).toString("base64"));
  }
});

test("int16 little-endian rundlauf, Vorzeichen und Kappung", () => {
  const g = 9.80665;
  const roh = [0, g, -g, 2.5 * g, -100 * g, 100 * g];
  const i = roh.map(K.i16);
  assert.deepEqual(i, [0, 2048, -2048, 5120, -32768, 32767]);
  const buf = Buffer.from(K.i16Bytes(i));
  const zurueck = Array.from({ length: i.length }, (_, k) => buf.readInt16LE(k * 2));
  assert.deepEqual(zurueck, i);
});

test("Accel-Block: Groesse, t0, Anzahl, Inhalt dekodierbar", () => {
  const s = new K.Sammler();
  let c = null;
  for (let n = 0; n < K.ACCEL_JE_BLOCK; n++) c = s.accelWert(0, 0, 9.80665, 1000 + n * 20) || c;
  assert.ok(c);
  assert.equal(c.kind, "accel"); assert.equal(c.encoding, "int16-b64");
  assert.equal(c.index, 0); assert.equal(c.t0_ms, 1000); assert.equal(c.count, K.ACCEL_JE_BLOCK);
  const buf = Buffer.from(c.data, "base64");
  assert.equal(buf.length, K.ACCEL_JE_BLOCK * 6);
  assert.equal(buf.readInt16LE(4), 2048);   // z des ersten Werts = 1 g
  // Naechster Block beginnt mit neuem t0 und Index 1
  for (let n = 0; n < K.ACCEL_JE_BLOCK; n++) c = s.accelWert(1, 1, 1, 9000 + n) || null;
  assert.equal(c.index, 1); assert.equal(c.t0_ms, 9000);
});

test("Lange Aufnahme: 2 h ohne Luecken, Indizes fortlaufend, t0 steigend (Lehre 13.09.: Fehler ab Block 2 / ab Block 142)", () => {
  const s = new K.Sammler();
  const chunks = [];
  const ende = 2 * 3600 * 1000;
  let gps = 0;
  for (let t = 0; t < ende; t += 20) {
    const c = s.accelWert(0.1, 0.2, 9.8, t); if (c) chunks.push(c);
    if (t >= gps) { const g = s.gpsFix(47 + t / 1e9, 9, 5, t); if (g) chunks.push(g); gps += 1000; }
  }
  chunks.push(...s.rest());
  const idx = chunks.map((c) => c.index);
  assert.deepEqual(idx, idx.map((_, i) => i), "Indizes lueckenlos");
  const acc = chunks.filter((c) => c.kind === "accel");
  const samples = acc.reduce((n, c) => n + c.count, 0);
  assert.equal(samples, ende / 20, "kein Accel-Wert verloren");
  for (let i = 1; i < acc.length; i++) assert.ok(acc[i].t0_ms > acc[i - 1].t0_ms);
  const g = chunks.filter((c) => c.kind === "gps");
  assert.equal(g.reduce((n, c) => n + c.count, 0), ende / 1000, "kein GPS-Fix verloren");
  assert.ok(acc.length > 142, "ueber die 142-Block-Grenze hinaus geprueft");
});

test("GPS: Format [t, lat, lon, -1, hr, gen], Zeit nie rueckwaerts, Nullpunkt verworfen", () => {
  const s = new K.Sammler();
  s.puls(123);
  assert.equal(s.gpsFix(47.5, 9.1, 4, 1000), null);
  assert.equal(s.gpsFix(47.6, 9.2, 4, 1000), null);   // gleiche Zeit -> verworfen
  assert.equal(s.gpsFix(47.6, 9.2, 4, 500), null);    // rueckwaerts -> verworfen
  assert.equal(s.gpsFix(0, 0, 4, 2000), null);        // Nullpunkt -> verworfen
  const c = s.gpsBlock();
  assert.equal(c.count, 1);
  assert.deepEqual(c.data[0], [1000, 47.5, 9.1, -1, 123, 4]);
});

test("Zeitachse mit Pausen: aktive Zeit, Pausenliste wie Wear/Apple", () => {
  const z = new K.Zeitachse(10000);
  assert.equal(z.jetzt(15000), 5000);
  z.pause(15000);
  assert.equal(z.jetzt(40000), 5000, "steht waehrend der Pause");
  z.weiter(45000);
  assert.equal(z.jetzt(46000), 6000);
  assert.deepEqual(z.pausen, [[5000, 30000]]);
  // Fix-Zeit (Wanduhr) auf die aktive Achse
  assert.equal(z.auf(46000, 46500), 6000);
  assert.equal(z.auf(46000, 46000 + 11 * 60000), -1, "zu alt");
  assert.equal(z.auf(0, 46000), -1);
});

test("Warteschlange: eine Datei gleichzeitig, steigende Wartezeit, Fehler gezaehlt", () => {
  const w = new K.Warteschlange();
  assert.ok(w.darf(0));
  w.start(); assert.ok(!w.darf(0), "nie zwei gleichzeitig");
  w.fehler(206, 1000); assert.ok(!w.darf(5999)); assert.ok(w.darf(6000));
  w.start(); w.fehler(206, 6000); assert.ok(!w.darf(20999)); assert.ok(w.darf(21000));
  w.start(); w.ok();
  assert.equal(w.fehlerGesamt, 2); assert.equal(w.gesendet, 1); assert.ok(w.darf(21000));
});

test("Sitzungs-ID passt in den Upload-Vertrag", () => {
  const id = K.neueId(1791368314000, 0.123456);
  assert.match(id, /^[A-Za-z0-9_-]{1,80}$/);
});

test("Anzeige-Tempo aus Positionen, Spruenge verworfen", () => {
  const a = new K.Anzeige();
  // 5 m/s nach Norden: 1 s = 5 m = 0.0000449 Grad
  for (let i = 0; i <= 6; i++) a.fix(47 + i * 0.0000449, 9, 5, i * 1000);
  assert.ok(Math.abs(a.tempo - 5) < 0.1, `tempo ${a.tempo}`);
  a.fix(47.01, 9, 5, 7000);   // Sprung > 1 km in 1 s
  assert.ok(Math.abs(a.tempo - 5) < 0.1);
  assert.ok(Math.abs(a.strecke - 30) < 0.5);
});

test("Sendeplan: Meta, Chunks, Ende — Ende erst nach Stopp, Chunks schon unterwegs", () => {
  const p = new K.Sendeplan();
  p.neu("a");
  assert.deepEqual(p.naechste(), { id: "a", art: "m", nr: -1 });
  p.erledigt(p.naechste());
  assert.equal(p.naechste(), null, "laufend, noch kein Chunk");
  p.chunk("a"); p.chunk("a");
  assert.deepEqual(p.naechste(), { id: "a", art: "c", nr: 0 });
  p.erledigt(p.naechste());
  assert.equal(p.offen(), 1);
  p.erledigt({ id: "a", art: "c", nr: 0 });   // doppelte Quittung zaehlt nicht doppelt
  assert.deepEqual(p.naechste(), { id: "a", art: "c", nr: 1 });
  p.erledigt(p.naechste());
  assert.equal(p.naechste(), null);
  p.ende("a");
  assert.deepEqual(p.naechste(), { id: "a", art: "e", nr: -1 });
  assert.equal(K.dateiVon(p.naechste()), K.dateiEnde("a"));
  p.erledigt(p.naechste());
  assert.equal(p.naechste(), null); assert.equal(p.s.length, 0, "erledigte Session raus");
});

test("AutoStart: drei Fixe in Folge ueber 7 km/h starten, Luecke/Sprung/langsam setzt zurueck", () => {
  const a = new K.AutoStart();
  const schritt = (m) => m / 111320;   // Meter nach Norden in Grad
  let lat = 52.5, t = 0;
  const fix = (m, dt = 1000) => { lat += schritt(m); t += dt; return a.fix(lat, 13.4, t); };
  assert.equal(a.fix(lat, 13.4, t), false, "erster Fix: nichts");
  assert.equal(fix(1), false); assert.equal(fix(1), false);            // 3,6 km/h: zu langsam
  assert.equal(fix(3), false); assert.equal(fix(3), false);            // 10,8 km/h: 1, 2
  assert.equal(fix(1), false, "zu langsam: zurueck auf 0");
  assert.equal(fix(3), false); assert.equal(fix(3), false); assert.equal(fix(3), true, "dritter in Folge");
  const b = new K.AutoStart(); lat = 52.5; t = 0; b.fix(lat, 13.4, t);
  const f2 = (m, dt = 1000) => { lat += schritt(m); t += dt; return b.fix(lat, 13.4, t); };
  f2(3); f2(3);
  assert.equal(f2(30, 10000), false, "10 s Luecke setzt zurueck");
  assert.equal(f2(100), false, "100 m/s ist kein Fahrer");
});

test("Sendeplan: verwerfen nennt nur die ungesendeten Dateien und nimmt die Session heraus", () => {
  const p = new K.Sendeplan();
  p.neu("a"); p.erledigt({ id: "a", art: "m" });
  p.neu("b");
  for (let i = 0; i < 4; i++) p.chunk("b");
  p.erledigt({ id: "b", art: "m" }); p.erledigt({ id: "b", art: "c", nr: 0 }); p.erledigt({ id: "b", art: "c", nr: 1 });
  assert.deepEqual(p.weg("b"), [K.dateiChunk("b", 2), K.dateiChunk("b", 3)]);
  assert.equal(p.finde("b"), null);
  assert.ok(p.finde("a"), "andere Session bleibt");
  p.neu("c"); p.chunk("c");
  assert.deepEqual(p.weg("c"), [K.dateiMeta("c"), K.dateiChunk("c", 0)], "nichts gesendet: Meta + Chunks");
  assert.deepEqual(p.weg("x"), [], "unbekannt: nichts");
});

test("Sendeplan: ueberlebt Neustart (als JSON) und haelt zwei Sessions auseinander", () => {
  const p = new K.Sendeplan();
  p.neu("a"); p.chunk("a"); p.ende("a");
  p.neu("b"); p.chunk("b");
  const q = new K.Sendeplan(JSON.parse(JSON.stringify(p.daten())));
  const reihe = [];
  for (let d = q.naechste(); d; d = q.naechste()) { reihe.push(d.id + d.art + d.nr); q.erledigt(d); }
  assert.deepEqual(reihe, ["am-1", "ac0", "ae-1", "bm-1", "bc0"]);
  assert.equal(q.offen(), 0);
  q.ende("b");
  assert.deepEqual(q.naechste(), { id: "b", art: "e", nr: -1 });
});

test("Sendeplan: Stand fuer den Balken auf der Uhr", () => {
  const p = new K.Sendeplan();
  assert.deepEqual(p.stand(), { fertig: 0, gesamt: 0 });
  p.neu("a"); p.chunk("a"); p.chunk("a"); p.ende("a");
  assert.deepEqual(p.stand(), { fertig: 0, gesamt: 4 });
  p.erledigt(p.naechste()); p.erledigt(p.naechste());
  assert.deepEqual(p.stand(), { fertig: 2, gesamt: 4 });
  assert.equal(p.stand().gesamt - p.stand().fertig, p.offen(), "Stand und offen passen zusammen");
  p.neu("b"); p.chunk("b");
  assert.deepEqual(p.stand(), { fertig: 2, gesamt: 6 });
  p.erledigt(p.naechste()); p.erledigt(p.naechste());
  p.naechste();   // a ist durch und faellt heraus
  assert.deepEqual(p.stand(), { fertig: 0, gesamt: 2 });
});

test("Teile: Rest steht in jedem Teil, mindestens 1", () => {
  assert.equal(K.teile("m_a.json", "{}", 0)[0].split("|")[4], "1");
  assert.equal(K.teile("m_a.json", "{}", 17)[0].split("|")[4], "17");
});

test("Sendeplan: 2 h ohne Handy bleibt klein", () => {
  const p = new K.Sendeplan();
  p.neu("a");
  for (let i = 0; i < 1700; i++) p.chunk("a");
  p.ende("a");
  assert.ok(JSON.stringify(p.daten()).length < 100);
  assert.equal(p.offen(), 1702);
});

test("Projekt-Kopien von common/ sind aktuell (sonst ./sync-common.sh)", async () => {
  const fs = await import("node:fs");
  const url = (p) => new URL(p, import.meta.url);
  for (const proj of ["lite", "wearable"]) {
    const ziel = url(`../${proj}/entry/src/main/js/MainAbility/common/`);
    if (!fs.existsSync(ziel)) continue;
    for (const f of ["kern.js", "recorder.js", "konfig.js", "seiten.js", "lauf.js", "maler.js"]) {
      assert.equal(fs.readFileSync(new URL(f, ziel), "utf8"), fs.readFileSync(url(`../common/${f}`), "utf8"),
        `${proj}/${f} weicht ab — ./sync-common.sh`);
    }
  }
});

test("Watch-3/4-Projekt hat dieselbe Seite und dieselben Texte wie lite (sonst ./sync-common.sh)", async () => {
  const fs = await import("node:fs");
  const url = (p) => new URL(p, import.meta.url);
  const q = "../lite/entry/src/main/js/MainAbility/", z = "../wearable/entry/src/main/js/MainAbility/";
  if (!fs.existsSync(url(z))) return;
  // app.js: Watch 3/4 hat die eigene common/app-wearable.js (mit Direkt-Upload), Lite nicht.
  assert.equal(fs.readFileSync(url(z + "app.js"), "utf8"), fs.readFileSync(url("../common/app-wearable.js"), "utf8"), "app.js");
  assert.equal(fs.readFileSync(url(z + "common/direkt.js"), "utf8"), fs.readFileSync(url("../common/direkt.js"), "utf8"), "direkt.js");
  assert.ok(!fs.existsSync(url(q + "common/direkt.js")), "Lite hat kein Netz: direkt.js gehoert nicht ins Lite-Projekt");
  const dateien = ["pages/index/index.hml", "pages/index/index.css", "pages/index/index.js",
    "pages/auswahl/auswahl.hml", "pages/auswahl/auswahl.css", "pages/auswahl/auswahl.js",
    ...fs.readdirSync(url(q + "i18n/")).map((f) => "i18n/" + f)];
  for (const f of dateien) assert.equal(fs.readFileSync(url(z + f), "utf8"), fs.readFileSync(url(q + f), "utf8"), f);
});

test("Sprachdateien: alle Schluessel in allen Sprachen", async () => {
  const fs = await import("node:fs");
  const d = new URL("../lite/entry/src/main/js/MainAbility/i18n/", import.meta.url);
  const alle = fs.readdirSync(d).map((f) => [f, Object.keys(JSON.parse(fs.readFileSync(new URL(f, d), "utf8")).strings).sort()]);
  for (const [f, k] of alle) assert.deepEqual(k, alle[0][1], f);
});

test("Teile: jede Nachricht < 1 KB, ASCII, zusammengesetzt wieder gueltiges JSON", () => {
  const s = new K.Sammler();
  let c = null;
  for (let n = 0; n < K.ACCEL_JE_BLOCK; n++) c = s.accelWert(Math.sin(n) * 20, n % 7, 9.8, n * 20) || c;
  const meta = { session_uuid: "hw-x", device_model: "HUAWEI WATCH GT 5 · HarmonyOS", started_at: "2026-10-07T12:00:00Z" };
  for (const obj of [c, meta]) {
    const text = JSON.stringify(obj);
    const t = K.teile("c_hw-x_000000.json", text, 42);
    for (const m of t) {
      assert.ok(Buffer.byteLength(m, "utf8") < 1000, `Teil ${Buffer.byteLength(m)} Byte`);
      assert.match(m, /^[\x20-\x7e]*$/, "nur ASCII");
    }
    // so setzt das Handy zusammen
    const teile = t.map((m) => m.split("|")).map((f) => ({ i: +f[2], n: +f[3], rest: +f[4], inhalt: f.slice(5).join("|") }));
    assert.ok(teile.every((x) => x.n === t.length));
    assert.ok(teile.every((x) => x.rest === 42));
    const ganz = teile.sort((a, b) => a.i - b.i).map((x) => x.inhalt).join("");
    assert.deepEqual(JSON.parse(ganz), obj);
  }
});

test("Teile: Inhalt mit | geht nicht kaputt", () => {
  const t = K.teile("m_a.json", JSON.stringify({ x: "a|b|c" }), 3, 5);
  const ganz = t.map((m) => m.split("|").slice(5).join("|")).join("");
  assert.deepEqual(JSON.parse(ganz), { x: "a|b|c" });
});

test("Gegenstelle: bleibt beim Treffer, wechselt nach 3 Fehlern", () => {
  const g = new K.Gegenstelle(["org.pumpfoil.app", "org.pumpfoil.coolwatch"], 0);
  assert.equal(g.fehler(), false); assert.equal(g.fehler(), false);
  g.ok(); assert.equal(g.fehler(), false); assert.equal(g.fehler(), false);
  assert.equal(g.fehler(), true); assert.equal(g.jetzt(), "org.pumpfoil.coolwatch");
  assert.equal(new K.Gegenstelle(["a", "b"], 1).jetzt(), "b");
  assert.equal(new K.Gegenstelle(["a", "b"], 7).jetzt(), "a");
});

test("Versionsnummer ueberall gleich (common/konfig.js, Konfig.ets, lite/wearable config.json, arkts app.json5)", () => {
  const lies = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const js = lies("common/konfig.js").match(/APP_VERSION = "([^"]+)"/)[1];
  const ets = lies("arkts/entry/src/main/ets/common/Konfig.ets").match(/APP_VERSION: string = '([^']+)'/)[1];
  const app = lies("arkts/AppScope/app.json5");
  assert.equal(ets, js);
  assert.equal(app.match(/"versionName": "([^"]+)"/)[1], js);
  const code = (v) => { const [a, b, c] = v.split(".").map(Number); return a * 1000000 + b * 1000 + c; };
  assert.equal(Number(app.match(/"versionCode": (\d+)/)[1]), code(js), "versionCode passt zu versionName");
  for (const p of ["lite", "wearable"]) {
    const v = JSON.parse(lies(p + "/entry/src/main/config.json")).app.version;
    assert.equal(v.name, js, p);
    assert.equal(v.code, code(js), p + " code");
  }
});
