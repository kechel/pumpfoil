// Datenseiten: was main.js setzt (Texte per setText/setStyle, Grafik gepackt in g0…g15) und was die
// Vorlage daraus zeichnet (quelle/vorlage.js auf einem nachgebauten canvas) — gegen die Zeichenbefehle
// von seiten.js, die auch die Huawei-Uhren zeichnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { Uhr } from "./firmware.mjs";
import { WURZEL } from "./lade.mjs";
import { kompaktVon } from "./kompakt-hilfe.mjs";

function vorlage() {
  const ctx = vm.createContext({ Math });
  vm.runInContext(fs.readFileSync(path.join(WURZEL, "quelle/vorlage.js"), "utf8"), ctx);
  return ctx;
}

function leinwand() {
  const ops = [];
  const c = { width: 466, height: 466, ops };
  for (const f of ["fillRect", "beginPath", "moveTo", "lineTo", "stroke", "arc"]) c[f] = (...a) => ops.push([f, ...a]);
  return c;
}

// freies Layout wie aus dem Web-Editor: Wert gross oben (Tempo, nach Zone gefaerbt), Label, Linie,
// Rand-Bogen (Tempo), Balken (Puls), REC, Seitenpunkte, zwei kleine Werte unten
const LAYOUT = [1, 4, [
  [1, 500, 300, 7, 0, 4, 1], [2, 500, 420, 1, 0, 0, 1], [4, 150, 500, 2, 3, 0, 850, 500],
  [8, 750, 500, 2, 0, 1, 1], [9, 500, 560, 2, 9, 0, 2, 600], [5, 150, 120, 1, 0, 1], [6, 500, 920, 1, 0, 0],
  [1, 300, 700, 4, 0, 0, 20], [1, 700, 700, 4, 11, 0, 14]]];

function aufnahme(konfig) {
  const uhr = new Uhr({ einstellungen: { handy: "false" } });
  uhr.speicher.set("k", kompaktVon(konfig));
  uhr.ruf("onLoad"); uhr.ruf("getUserInterface"); uhr.ruf("onExerciseStart", { utc: 1 });
  for (let s = 1; s <= 12; s++) uhr.ruf("evaluate", { tmr: s * 1000, sp: s > 3 ? 4.5 : 0.5, hr: 2.5, utc: s, lt: 36000 + s,
    pos: { latitude: 470000000 + s * 400, longitude: 90000000 } });
  return uhr;
}

test("freies Layout: Texte an ihrer Position, in ihrer Farbe; Grafik auf dem canvas", () => {
  const uhr = aufnahme({ layoutsOn: true, pages: [LAYOUT], speedZones: [8, 12, 16, 20, 24, 28], browseAll: false });
  const t = uhr.sichtbar();
  const tempo = t.find((x) => x.top === "calc(30% - 50%e)" && x.left === "calc(50% - 50%e)");
  assert.ok(tempo, JSON.stringify(t));
  assert.match(tempo.txt, /^\d+\.\d$/);
  assert.equal(tempo.color, "#eab308", "16,2 km/h -> Zone 3 von 5 (gelb), wie seiten.js wertFarbe");
  assert.ok(t.some((x) => x.txt === "0" && x.left === "calc(30% - 50%e)" && x.top === "calc(70% - 50%e)"), "Laeufe unten links (erster Lauf laeuft noch)");
  assert.ok(t.some((x) => x.left === "calc(70% - 50%e)" && x.color === "#00ffff"), "Laufzeit in Palettenfarbe 11 (seiten.js PALETTE[10])");
  assert.ok(t.some((x) => x.txt === "REC"), "REC");
  // Grafik: entpacken und zeichnen wie die Vorlage
  const V = vorlage(), c = leinwand();
  for (let i = 0; i < 16; i++) V.G[i] = uhr.output["g" + i] || 0;
  V.zeichneSeite(c);
  const arten = c.ops.map((o) => o[0]);
  assert.ok(arten.includes("arc"), "Rand-Bogen");
  assert.ok(arten.includes("lineTo"), "Linie");
  assert.ok(c.ops.filter((o) => o[0] === "fillRect").length >= 3, "Hintergrund, Balken, REC-Punkt");
  // Hintergrund in Palettenfarbe 4 (#000000) ueber das ganze Display
  const bg = c.ops.find((o) => o[0] === "fillRect");
  assert.deepEqual(bg.slice(1, 5).map(Math.round), [0, 0, 466, 466]);
  assert.ok(uhr.output.gv > 0, "Zaehler fuer das Neuzeichnen");
});

test("klassische Seite: drei Felder untereinander wie auf den anderen Uhren, Seitenpunkte als ein Befehl", () => {
  const uhr = aufnahme({ views: [[1, 20, 14], [2, 3, 4]], browseAll: false });
  const t = uhr.sichtbar();
  assert.equal(t.filter((x) => x.left === "calc(50% - 50%e)").length, 6, JSON.stringify(t));
  const V = vorlage(), c = leinwand();
  for (let i = 0; i < 16; i++) V.G[i] = uhr.output["g" + i] || 0;
  V.zeichneSeite(c);
  // 2 Seiten -> 2 Punkte (aktiv + gedimmt)
  assert.equal(c.ops.filter((o) => o[0] === "fillRect").length, 1 + 2);
});

test("Packen und Entpacken: jeder Befehl kommt mit Werten auf ~2 Promille an", () => {
  const uhr = new Uhr({ einstellungen: { handy: "false" } });
  const V = vorlage();
  const faelle = [
    [{ k: "r", x: 120, y: 340, w: 600, h: 18, c: "#22c55e" }, [0, [60, 170, 300, 9]]],
    [{ k: "l", x1: 150, y1: 500, x2: 850, y2: 500, w: 4, c: "#808080" }, [1, [75, 250, 425, 250, 2]]],
    [{ k: "a", cx: 500, cy: 500, r: 480, w: 36, a0: 180, a1: 270, c: "#22d3ee" }, [2, [240, 270, 90, 18]]],
    [{ k: "d", x: 478, y: 940, d: 22, n: 3, idx: 1, c: "#d0d0d0" }, [3, [239, 470, 11, 3, 1]]],
  ];
  for (const [b, [typ, w]] of faelle) {
    const e = V.entpacke(uhr.ctx.anzPacke(b));
    assert.equal(e.typ, typ);
    assert.deepEqual(Array.from(e.w), w, JSON.stringify(b));
    assert.ok(Number.isSafeInteger(uhr.ctx.anzPacke(b)));
  }
  // groesster Linien-Befehl bleibt eine sichere Ganzzahl
  assert.ok(Number.isSafeInteger(uhr.ctx.anzPacke({ k: "l", x1: 1022, y1: 1022, x2: 1022, y2: 1022, w: 14, c: "#ffffff" })));
});
