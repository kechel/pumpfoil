/*
 * Datenseiten der Huawei-Uhren: Lauf-Erkennung, Feldwerte, Seiten je Zustand und die freien
 * Layouts aus dem Profil — OHNE Geraete-APIs, in Node getestet (test/seiten.test.mjs).
 *
 * Portiert vom Amazfit-Recorder (watch-zepp/page/index.js), der es von Garmin hat:
 *   Lauf-Automat   _updateRun/_pushSpeed/maxKandidat (Schwellen am Server-Detektor abgestimmt —
 *                  hier NICHTS nachjustieren)
 *   Felder         fieldValue/fieldNumber/_fieldColor (Feld-IDs wie web fw.*)
 *   Seiten-Ring    _setFor/_ring (Zustaende p / on / off, „alle Seiten")
 *   Layouts        _renderLayoutPage (Format [1,bg,[elemente]], docs: Memory watch-layout-wire-format)
 *
 * Der Renderer zeichnet NICHT selbst: er liefert eine Liste von Zeichenbefehlen, die jede Uhr auf
 * ihrer Canvas ausfuehrt (Lite/JS-FA: pages/index, ArkTS: Index.ets). So liegt die Logik einmal vor,
 * und Node kann pruefen, was auf der Uhr erscheinen wuerde.
 *   { k: "r", x, y, w, h, c }            gefuelltes Rechteck
 *   { k: "t", x, y, s, c, a, txt, b }    Text, (x,y) = Anker, a = "l"|"r"|"c", vertikal mittig, b = fett
 *   { k: "l", x1, y1, x2, y2, w, c }     Linie
 *   { k: "a", cx, cy, r, w, a0, a1, c }  Bogen (Grad, 0 = 3 Uhr, im Uhrzeigersinn), Strichbreite w
 *
 * Bewusst ES5 und klein: JerryScript der Lite-Uhren uebersetzt jedes Buendel in 48 KB Heap und kennt
 * keine Regex-Literale (build-all.sh prueft beides per Snapshot). Lauf-Erkennung/Konfig: lauf.js.
 */

// --- Felder ----------------------------------------------------------------------------------
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function mmss(sec) { return Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60)); }
function distVal(m) { return m < 1000 ? String(Math.round(m)) : (m / 1000).toFixed(2); }
function distUnit(m) { return m < 1000 ? "m" : "km"; }

/** Zahl fuer Farbe/Grafik eines Feldes, null = keine. el = aktive Sekunden. */
function feldZahl(s, id, el) {
  var lauf = s.runCount > 0;
  switch (id) {
    case 1: return s.sp3 * 3.6;
    case 5: return s.cur * 3.6;
    case 6: return el > 0 ? s.dist / el * 3.6 : 0;
    case 7: return s.max * 3.6;
    case 18: return lauf ? s.lastRunAvgMps * 3.6 : null;
    case 19: return lauf ? s.lastRunMaxMps * 3.6 : null;
    case 2: return s.hr ? s.hr : null;
    case 8: return s.hrN ? Math.round(s.hrSum / s.hrN) : null;
    case 9: return s.hrMax ? s.hrMax : null;
    case 21: return s.lastRunMaxHr > 0 ? s.lastRunMaxHr : null;
    default: return null;
  }
}

/**
 * [Wert, Beschriftung] eines Feldes. t(key) liefert den Text der Uhr-Sprache (Schluessel wie Zepp:
 * kmh3s, kmhAvg, …). jetzt = Date fuer die Uhrzeit (Feld 12).
 */
function feld(s, id, el, t, jetzt) {
  var runDurMs = s.foiling ? Math.max(0, el * 1000 - s.runStartMs) : s.lastRunDurMs;
  var runDistM = s.foiling ? Math.max(0, s.dist - s.runStartDist) : s.lastRunDistM;
  var lauf = s.runCount > 0, z;
  switch (id) {
    case 1: return [(s.sp3 * 3.6).toFixed(1), t("kmh3s")];
    case 5: return [(s.cur * 3.6).toFixed(1), "km/h"];
    case 6: return [feldZahl(s, 6, el).toFixed(1), t("kmhAvg")];
    case 7: return [(s.max * 3.6).toFixed(1), t("kmhMax")];
    case 2: return [s.hr ? "" + s.hr : "–", "bpm"];
    case 8: return [s.hrN ? "" + Math.round(s.hrSum / s.hrN) : "–", t("bpmAvg")];
    case 9: return [s.hrMax ? "" + s.hrMax : "–", t("bpmMax")];
    case 3: return [mmss(el), t("time")];
    case 4: return [distVal(s.dist), distUnit(s.dist) + " " + t("dist")];
    case 12: return [pad(jetzt.getHours()) + ":" + pad(jetzt.getMinutes()), t("clock")];
    case 14: return [mmss(runDurMs / 1000), s.foiling ? t("runActive") : t("runTime")];
    case 15: return [distVal(runDistM), distUnit(runDistM) + " " + t("runDist")];
    case 16: return [lauf ? mmss(s.lastRunDurMs / 1000) : "–", t("lastRunTime")];
    case 17: return [lauf ? distVal(s.lastRunDistM) : "–", distUnit(s.lastRunDistM) + " " + t("lastRunDist")];
    case 18: return [lauf ? (s.lastRunAvgMps * 3.6).toFixed(1) : "–", t("lastRunAvg")];
    case 19: return [lauf ? (s.lastRunMaxMps * 3.6).toFixed(1) : "–", t("lastRunMax")];
    case 20: return ["" + s.runCount, t("runs")];
    case 21: return [s.lastRunMaxHr > 0 ? "" + s.lastRunMaxHr : "–", t("lastRunMaxHr")];
    case 22:
      z = s.runsSumDistM + (s.foiling ? Math.max(0, s.dist - s.runStartDist) : 0);
      return [lauf || s.foiling ? distVal(z) : "–", distUnit(z) + " " + t("allRunsDist")];
    case 23:
      z = s.runsSumDurMs + (s.foiling ? Math.max(0, el * 1000 - s.runStartMs) : 0);
      return [lauf || s.foiling ? mmss(z / 1000) : "–", t("allRunsTime")];
    default: return ["–", ""];
  }
}

// --- Seiten je Zustand -----------------------------------------------------------------------
function klassisch(f) { f = f || []; return [0, f[0] | 0, f[1] | 0, f[2] | 0]; }
/** z = "p" (Pause) | "on" (auf dem Foil) | "off" (zwischen den Laeufen). */
function satz(k, z) {
  var i, out = [];
  if (z === "p") return k.layoutsOn && k.pausePages.length ? k.pausePages : [klassisch(k.pauseView)];
  if (z === "on") {
    if (k.layoutsOn && k.pages.length) return k.pages;
    for (i = 0; i < k.views.length; i++) out.push(klassisch(k.views[i]));
    return out.length ? out : [[0, 1, 0, 0]];
  }
  return k.layoutsOn && k.offFoilPages.length ? k.offFoilPages : [klassisch(k.offFoilView)];
}
/** Seiten-Ring wie Zepp _ring: im Off-Foil haengen die On-Foil-Seiten an, in der Pause beide. */
function ring(k, z) {
  var out = satz(k, z);
  if (z === "off" && k.browseAll) out = out.concat(satz(k, "on"));
  if (z === "p" && k.browseAll) out = out.concat(satz(k, "on"), satz(k, "off"));
  return out.length ? out : [[0, 1, 0, 0]];
}

// --- Farben & Groessen (wie Zepp/Garmin/Vorschau) --------------------------------------------
var PALETTE = ["#ffffff", "#d0d0d0", "#808080", "#000000", "#ff0000", "#ff5500", "#ffaa00", "#ffff00",
  "#00ff00", "#00aa00", "#00ffff", "#22d3ee", "#0055ff", "#aa00ff", "#ff00aa"];
var ZONEN = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444"];
var AUTO_WERT = "#ffffff", AUTO_LABEL = "#d0d0d0", AUTO_LINIE = "#808080", CYAN = "#22d3ee";
// Gemessene Tintenbreite von „18.5" je Groessenstufe bei 280 px (web/src/lib/watchLayout.ts) —
// NICHT schaetzen (Memory watch-layout-wire-format).
var TINTE_280 = [29, 46, 50, 61, 64, 82, 99, 146, 166];

function farbe(i, ersatz) { i = i | 0; return i >= 1 && i <= PALETTE.length ? PALETTE[i - 1] : ersatz; }
function groesse(stufe, dw) {
  var i = Math.max(0, Math.min(TINTE_280.length - 1, stufe | 0));
  return Math.max(7, Math.round(dw * TINTE_280[i] / 1.973 / 280));
}
function zone(v, g) { var z = 0; for (var i = 1; i < 5; i++) if (v >= g[i]) z = i; return z; }
function istPuls(fid) { return fid === 2 || fid === 8 || fid === 9 || fid === 21; }
function wertFarbe(k, fid, v) {
  if (v === null || v === undefined) return null;
  if (istPuls(fid)) return v > 0 ? ZONEN[zone(v, k.hrZones)] : null;
  if (fid === 1 || fid === 5 || fid === 6 || fid === 7 || fid === 18 || fid === 19) return ZONEN[zone(v, k.speedZones)];
  return null;
}
function fuellgrad(k, fid, v) {
  var g = istPuls(fid) ? k.hrZones : k.speedZones;
  if (v === null || v === undefined || !(g[5] > g[0])) return 0;
  return Math.max(0, Math.min(1, (v - g[0]) / (g[5] - g[0])));
}
function mische(c, bg, f) {
  function kan(h, i) { return parseInt(h.substr(1 + 2 * i, 2), 16); }
  var out = "#";
  for (var i = 0; i < 3; i++) {
    var x = Math.round(kan(c, i) * f + kan(bg, i) * (1 - f));
    out += (x < 16 ? "0" : "") + x.toString(16);
  }
  return out;
}

// --- Zeichnen ----------------------------------------------------------------------------------
/**
 * Zeichenbefehle fuer eine Seite. ctx: { dw, dh, s (Stand), el (aktive s), t (Texte), jetzt (Date),
 * k (Konfig), idx, anzahl, pausiert }.
 */
function zeichne(e, ctx) {
  return e && e[0] === 1 ? layout(e, ctx) : klassik(e || [0, 1, 0, 0], ctx);
}

/** Klassische Seite [0,a,b,c]: drei Felder untereinander, Wert gross, Beschriftung klein. */
function klassik(e, c) {
  var dw = c.dw, dh = c.dh, out = [{ k: "r", x: 0, y: 0, w: dw, h: dh, c: "#000000" }];
  var ids = [], i;
  for (i = 1; i < 4; i++) if ((e[i] | 0) > 0) ids.push(e[i] | 0);
  if (!ids.length) ids = [1];
  var zeile = dh * 0.78 / ids.length, y0 = dh * 0.12;
  for (i = 0; i < ids.length; i++) {
    var f = feld(c.s, ids[i], c.el, c.t, c.jetzt), y = y0 + zeile * i;
    var col = c.k.colorByValue ? (wertFarbe(c.k, ids[i], feldZahl(c.s, ids[i], c.el)) || AUTO_WERT) : AUTO_WERT;
    out.push({ k: "t", x: dw / 2, y: Math.round(y + zeile * 0.42), s: groesse(ids.length === 1 ? 8 : 6, dw), c: col, a: "c", txt: f[0], b: true });
    out.push({ k: "t", x: dw / 2, y: Math.round(y + zeile * 0.82), s: groesse(1, dw), c: AUTO_LABEL, a: "c", txt: f[1], b: false });
  }
  if (c.pausiert) out.push({ k: "t", x: dw / 2, y: Math.round(dh * 0.07), s: groesse(2, dw), c: CYAN, a: "c", txt: c.t("paused"), b: true });
  punkte(out, dw / 2, dh * 0.94, 0, c, AUTO_LABEL, "#000000");
  return out;
}

/** Seiten-Punkte (Element typ 6 bzw. unten mittig auf klassischen Seiten). */
function punkte(out, ax, ay, fl, c, col, bg) {
  var n = Math.max(1, Math.min(12, c.anzahl | 0));
  if (n <= 1) return;
  var d = Math.max(3, Math.round(c.dw * 0.022)), stp = d * 2, total = (n - 1) * stp;
  var x0 = (fl & 1) ? ax + d / 2 : (fl & 2) ? ax - total - d / 2 : ax - total / 2;
  for (var i = 0; i < n; i++) {
    out.push({ k: "r", x: Math.round(x0 + i * stp - d / 2), y: Math.round(ay - d / 2), w: d, h: d,
      c: i === c.idx ? col : mische(col, bg, 0.35) });
  }
}

/** Freies Layout [1, bg, [[typ,x,y,size,color,flags,extra…], …]], Koordinaten in Promille. */
function layout(e, c) {
  var dw = c.dw, dh = c.dh, els = e[2] || [], bg = farbe(e[1] | 0, "#000000");
  var out = [{ k: "r", x: 0, y: 0, w: dw, h: dh, c: bg }], vorne = [], hatPause = false, i;
  for (i = 0; i < els.length; i++) {
    var x = els[i];
    if (!x || x.length < 6) continue;
    var typ = x[0] | 0, ax = Math.round(dw * (x[1] | 0) / 1000), ay = Math.round(dh * (x[2] | 0) / 1000);
    var st = x[3] | 0, ci = x[4] | 0, fl = x[5] | 0, fid = x.length > 6 ? (x[6] | 0) : 0;
    var a = (fl & 1) ? "l" : ((fl & 2) ? "r" : "c");
    if (typ === 4) {          // Linie — liegt hinter dem Text
      out.push({ k: "l", x1: ax, y1: ay,
        x2: Math.round(dw * (x.length > 6 ? (x[6] | 0) : (x[1] | 0)) / 1000),
        y2: Math.round(dh * (x.length > 7 ? (x[7] | 0) : (x[2] | 0)) / 1000),
        w: st < 1 ? 1 : st, c: farbe(ci, AUTO_LINIE) });
    } else if (typ === 8 || typ === 9) {   // Wert-Grafik: Rand-Bogen bzw. Balken, hinter dem Text
      grafik(out, x, typ, ax, ay, st, ci, fl, fid, c);
    } else if (typ === 5) {   // REC: Punkt + Text
      if (c.pausiert) continue;
      var d = Math.max(4, Math.round(dw * 0.03)), fs = Math.max(7, Math.round(dw * 0.055));
      var gap = Math.round(d / 2), tw = Math.round(fs * 0.62 * 3), tot = d + gap + tw;
      var lx = a === "l" ? ax : (a === "r" ? ax - tot : ax - Math.round(tot / 2)), rc = farbe(ci, "#ff0000");
      vorne.push({ k: "r", x: lx, y: ay - Math.round(d / 2), w: d, h: d, c: rc });
      vorne.push({ k: "t", x: lx + d + gap, y: ay, s: fs, c: rc, a: "l", txt: "REC", b: false });
    } else if (typ === 6) {
      punkte(vorne, ax, ay, fl, c, farbe(ci, AUTO_LABEL), bg);
    } else if (typ === 7) {   // „Pausiert" — nur, wenn wirklich pausiert
      hatPause = true;
      if (c.pausiert) vorne.push({ k: "t", x: ax, y: ay, s: groesse(st, dw), c: farbe(ci, CYAN), a: a, txt: c.t("paused"), b: true });
    } else if (typ === 1 || typ === 2 || typ === 3) {
      var txt = typ === 1 ? feld(c.s, fid, c.el, c.t, c.jetzt)[0]
        : typ === 2 ? feld(c.s, fid, c.el, c.t, c.jetzt)[1]
        : (x.length > 6 && x[6] !== null && x[6] !== undefined ? "" + x[6] : "");
      if (!txt) continue;
      var col = farbe(ci, typ === 1 ? AUTO_WERT : AUTO_LABEL);
      if (typ === 1 && (fl & 4)) col = wertFarbe(c.k, fid, feldZahl(c.s, fid, c.el)) || col;
      vorne.push({ k: "t", x: ax, y: ay, s: groesse(st, dw), c: col, a: a, txt: txt, b: typ === 1 });
    }
  }
  if (c.pausiert && !hatPause) {
    vorne.push({ k: "t", x: Math.round(dw / 2), y: Math.round(dh * 0.07), s: groesse(2, dw), c: CYAN, a: "c", txt: c.t("paused"), b: true });
  }
  return out.concat(vorne);
}

/** Rand-Grafik (typ 8, auf runden Uhren als Bogen) und Balken (typ 9), je mit leerer Spur. */
function grafik(out, x, typ, ax, ay, st, ci, fl, fid, c) {
  var dw = c.dw, dh = c.dh;
  var th = Math.max(2, Math.round(dw * 0.018 * Math.max(1, Math.min(4, st))));
  var v = feldZahl(c.s, fid, c.el), f = fuellgrad(c.k, fid, v);
  var grund = (fl & 1) && v !== null ? ZONEN[zone(v, istPuls(fid) ? c.k.hrZones : c.k.speedZones)] : farbe(ci, CYAN);
  var leer = mische(grund, "#000000", 0.3);
  if (typ === 8 && c.rund === false) {   // eckige Uhr: Rahmensegment wie Zepp layRandPolys (08.10.2026)
    var lg = Math.max(0, Math.min(1000, x[2] | 0));
    rahmen(out, dw, dh, th, x[1] | 0, lg, leer);
    if (f > 0) rahmen(out, dw, dh, th, x[1] | 0, lg * f, grund);
  } else if (typ === 8) {
    var laenge = Math.max(0, Math.min(1000, x[2] | 0)), r = Math.min(dw, dh) / 2 - th / 2 - 1;
    var a0 = -90 + ((x[1] | 0) % 1000) * 0.36;
    out.push({ k: "a", cx: dw / 2, cy: dh / 2, r: r, w: th, a0: a0, a1: a0 + laenge * 0.36, c: leer });
    if (f > 0) out.push({ k: "a", cx: dw / 2, cy: dh / 2, r: r, w: th, a0: a0, a1: a0 + laenge * 0.36 * f, c: grund });
  } else {
    var bw = Math.round(dw * Math.max(50, Math.min(1000, x.length > 7 ? (x[7] | 0) : 400)) / 1000);
    var bx = ax - Math.round(bw / 2), by = ay - Math.round(th / 2);
    out.push({ k: "r", x: bx, y: by, w: bw, h: th, c: leer });
    if (f > 0) out.push({ k: "r", x: bx, y: by, w: Math.max(th, Math.round(bw * f)), h: th, c: grund });
  }
}

/**
 * Rand-Grafik auf eckigen Uhren: den Rahmen ab oberer Mitte im Uhrzeigersinn abgehen, je Seite den
 * ueberdeckten Abschnitt als Rechteck (rechtwinklige Ecken wie auf Zepp/Garmin). start/laenge in 1/1000
 * des Umfangs, Strich th mittig auf einer Linie th/2+1 vom Rand.
 */
function rahmen(out, dw, dh, th, start, laenge, col) {
  var e = th / 2 + 1, bw = dw - 2 * e, bh = dh - 2 * e, u = 2 * (bw + bh);
  var len = [bw / 2, bh, bw, bh, bw / 2];
  var d0 = ((start % 1000) + 1000) % 1000 / 1000 * u, d1 = d0 + Math.max(0, Math.min(1000, laenge)) / 1000 * u;
  for (var runde = 0; runde < 2; runde++) {
    var pos = runde * u;
    for (var i = 0; i < 5; i++) {
      var a = Math.max(d0, pos) - pos, b = Math.min(d1, pos + len[i]) - pos, l = Math.max(1, b - a), h = th / 2;
      if (b > a) {
        var q = i === 0 ? [e + bw / 2 + a, e - h, l, th] : i === 1 ? [dw - e - h, e + a, th, l]
          : i === 2 ? [dw - e - b, dh - e - h, l, th] : i === 3 ? [e - h, dh - e - b, th, l] : [e + a, e - h, l, th];
        out.push({ k: "r", x: Math.round(q[0]), y: Math.round(q[1]), w: Math.round(q[2]), h: Math.round(q[3]), c: col });
      }
      pos += len[i];
    }
  }
}

// Stand und Konfig liegen in lauf.js (eigenes Buendel mit dem Recorder, s. dort).
export default { feld: feld, feldZahl: feldZahl, ring: ring, zeichne: zeichne, groesse: groesse };
