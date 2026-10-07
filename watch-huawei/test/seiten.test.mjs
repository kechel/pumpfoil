// Datenseiten (common/seiten.js): Lauf-Erkennung, Felder, Seiten-Ring, Zeichenbefehle.
import { test } from "node:test";
import assert from "node:assert/strict";
import S from "../common/seiten.js";

const t = (k) => k;   // Texte: Schluessel selbst
const ostwaerts = (lat, lon, m) => [lat, lon + m / (111320 * Math.cos(lat * Math.PI / 180))];

/** Fahrt: Sekunde fuer Sekunde [m/s], Positionen daraus, liefert den Stand. */
function fahrt(tempi, mitGpsTempo) {
  const s = new S.Stand();
  let lat = 52.5, lon = 13.4, wechsel = 0;
  tempi.forEach((v, i) => {
    [lat, lon] = ostwaerts(lat, lon, v);
    if (s.tick(i * 1000, 1e12 + i * 1000, true, lat, lon, mitGpsTempo ? v : -1, 120)) wechsel++;
  });
  return { s, wechsel };
}
const reihe = (n, v) => Array(n).fill(v);

test("Lauf: 20 s mit 4 m/s nach Stillstand = ein Lauf, Dauer auf den ersten schnellen Tick zurueckdatiert", () => {
  const { s, wechsel } = fahrt([...reihe(5, 0), ...reihe(20, 4), ...reihe(10, 0)]);
  assert.equal(wechsel, 2, "rein und raus");
  assert.equal(s.runCount, 1);
  assert.equal(s.foiling, false);
  assert.ok(Math.abs(s.lastRunDurMs - 20000) <= 2000, `Dauer ${s.lastRunDurMs}`);
  // Strecke zaehlt wie bei Zepp/Garmin erst ab der Erkennung (nach 4 s), nicht zurueckdatiert.
  assert.ok(s.lastRunDistM > 50 && s.lastRunDistM < 70, `Strecke ${s.lastRunDistM}`);
});

test("Lauf: zu kurz zaehlt nicht, ohne Stopp dazwischen bleibt es EIN Lauf", () => {
  assert.equal(fahrt([...reihe(3, 0), ...reihe(6, 4), ...reihe(10, 0)]).s.runCount, 0, "kurz");
  // 15 s schnell, 5 s langsam (2 m/s, kein echter Stopp), 15 s schnell -> derselbe Lauf
  const { s } = fahrt([...reihe(3, 0), ...reihe(15, 4), ...reihe(5, 2), ...reihe(15, 4), ...reihe(10, 0)]);
  assert.equal(s.runCount, 1);
  assert.ok(s.lastRunDurMs > 30000, `fortgesetzt ${s.lastRunDurMs}`);
});

test("Lauf: GPS-Tempo (ArkTS) und Tempo aus Positionen (Lite) ergeben dasselbe", () => {
  const tempi = [...reihe(5, 0), ...reihe(20, 4.5), ...reihe(10, 0)];
  const a = fahrt(tempi, false).s, b = fahrt(tempi, true).s;
  assert.equal(a.runCount, b.runCount);
  assert.ok(Math.abs(a.lastRunDurMs - b.lastRunDurMs) <= 1000);
});

test("Hoechstwert: Doppler-Ausreisser ueber 32 km/h zaehlt nicht", () => {
  const { s } = fahrt([...reihe(10, 4), 12, ...reihe(10, 4)], true);
  assert.ok(s.max * 3.6 < 16, `max ${s.max * 3.6}`);
});

test("Felder: Werte und Einheiten wie Zepp", () => {
  const { s } = fahrt([...reihe(5, 0), ...reihe(20, 4), ...reihe(10, 0)]);
  const jetzt = new Date(2026, 9, 7, 9, 5);
  assert.deepEqual(S.feld(s, 20, 35, t, jetzt), ["1", "runs"]);
  assert.deepEqual(S.feld(s, 12, 35, t, jetzt), ["09:05", "clock"]);
  assert.equal(S.feld(s, 3, 65, t, jetzt)[0], "1:05");
  assert.equal(S.feld(s, 17, 35, t, jetzt)[1], "m lastRunDist");
  assert.equal(S.feld(s, 99, 35, t, jetzt)[0], "–");
  const leer = new S.Stand();
  assert.equal(S.feld(leer, 16, 0, t, jetzt)[0], "–", "kein Lauf -> Strich");
});

test("Seiten-Ring: Saetze je Zustand, alle Seiten haengt an, Layouts nur wenn eingeschaltet", () => {
  const lay = [1, 4, [[1, 500, 500, 6, 0, 0, 1]]];
  const k = new S.Konfig({ views: [[1, 2, 0], [3, 4, 0]], offFoilView: [12, 17, 16], pauseView: [12, 20, 2],
    pages: [lay], offFoilPages: [], pausePages: [], browseAll: true, layoutsOn: true });
  assert.deepEqual(S.ring(k, "on"), [lay]);
  assert.deepEqual(S.ring(k, "off"), [[0, 12, 17, 16], lay]);
  assert.equal(S.ring(k, "p").length, 3);
  const aus = new S.Konfig({ views: [[1, 2, 0], [3, 4, 0]], pages: [lay], layoutsOn: false, browseAll: false });
  assert.deepEqual(S.ring(aus, "on"), [[0, 1, 2, 0], [0, 3, 4, 0]]);
  assert.deepEqual(S.ring(new S.Konfig(null), "on"), [[0, 1, 2, 0]], "ohne Konfiguration: Standard");
});

test("Zeichnen: Layout randlos, Linien hinter Text, Werte gefaerbt, Pausiert nur in der Pause", () => {
  const { s } = fahrt([...reihe(5, 0), ...reihe(8, 5)], true);
  const k = new S.Konfig({});
  const e = [1, 4, [
    [1, 500, 400, 6, 0, 4, 1],        // Wert Feld 1, nach Wert gefaerbt
    [2, 500, 600, 1, 0, 0, 1],        // Label Feld 1
    [4, 100, 500, 2, 3, 0, 900, 500], // Linie
    [7, 500, 100, 2, 0, 0],           // Pausiert
    [6, 500, 920, 1, 0, 0],           // Seiten-Punkte
  ]];
  const ctx = { dw: 466, dh: 466, s, el: 13, t, jetzt: new Date(), k, idx: 1, anzahl: 3, pausiert: false };
  const z = S.zeichne(e, ctx);
  assert.deepEqual(z[0], { k: "r", x: 0, y: 0, w: 466, h: 466, c: "#000000" });
  assert.equal(z[1].k, "l", "Linie direkt nach dem Hintergrund");
  const texte = z.filter((x) => x.k === "t");
  assert.equal(texte.length, 2, "Pausiert fehlt ausserhalb der Pause");
  assert.equal(texte[0].txt, (s.sp3 * 3.6).toFixed(1));
  assert.equal(texte[0].c, "#eab308", "18 km/h = Zone 3 der Standardzonen 8/12/16/20/24/28 (gelb)");
  assert.equal(texte[0].b, true);
  assert.equal(z.filter((x) => x.k === "r").length, 1 + 3, "Hintergrund + drei Punkte");
  const p = S.zeichne(e, { ...ctx, pausiert: true }).filter((x) => x.k === "t");
  assert.ok(p.some((x) => x.txt === "paused"));
});

test("Zeichnen: klassische Seite, Rand-Grafik und Groessenstufen wie gemessen", () => {
  const s = new S.Stand();
  const ctx = { dw: 280, dh: 280, s, el: 0, t, jetzt: new Date(), k: new S.Konfig({}), idx: 0, anzahl: 1, pausiert: false };
  const z = S.zeichne([0, 1, 2, 0], ctx);
  assert.equal(z.filter((x) => x.k === "t").length, 4, "zwei Felder je Wert + Label");
  assert.equal(S.groesse(6, 280), Math.round(99 / 1.973));
  const g = S.zeichne([1, 4, [[8, 0, 1000, 2, 0, 0, 1]]], ctx);
  assert.equal(g.filter((x) => x.k === "a").length, 1, "Tempo 0 -> nur leere Spur");
});
