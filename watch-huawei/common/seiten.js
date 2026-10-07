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
 * Bewusst ES5 und klein: Lite-Uhren haben 64 KB Heap und ~48 KB je Seite (build-all.sh prueft).
 */

// --- Lauf-Erkennung (wortgleich Zepp/Garmin) ---------------------------------------------------
var RUN_ENTER_MPS = 2.8, RUN_EXIT_MPS = 2.5;
var RUN_ENTER_DWELL = 4, RUN_EXIT_DWELL = 3, RUN_REARM_COOLDOWN_MS = 25000;
var SPEED_WIN_S = 3;
var BURST_WIN_MS = 15000, BURST_MARGIN_MPS = 5.0;
var MAX_FOIL_MPS = 32 / 3.6, BURST_ABS_MIN_MPS = 28 / 3.6;
var NOSTOP_MPS = 1.5;
var MIN_RUN_MS = 5000, MIN_RUN_AVG_MPS = 2.0;
var MAX_SPRUNG_MPS = 30;          // Positionssprung, kein Fahrer (Zepp MAX_PLAUSIBLE_MPS)

function meter(a, b, c, d) {
  var R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Hoechstwert saeubern wie der Server: Doppler-Burst -> Median, ueber 32 km/h -> zaehlt nicht. */
function maxKandidat(puffer, t, v) {
  puffer.push([t, v]);
  while (puffer.length && t - puffer[0][0] > BURST_WIN_MS) puffer.shift();
  var w = [];
  for (var i = 0; i < puffer.length; i++) w.push(puffer[i][1]);
  w.sort(function (a, b) { return a - b; });
  var med = w.length ? w[w.length >> 1] : 0;
  var x = v;
  if (x > med + BURST_MARGIN_MPS && x > BURST_ABS_MIN_MPS) x = med;
  return x > MAX_FOIL_MPS ? 0 : x;
}

/** Alles, was die Felder zeigen. `tick` einmal je Sekunde waehrend der Aufnahme (nicht in der Pause). */
function Stand() { this.neu(); }
Stand.prototype.neu = function () {
  this.spWin = []; this.sp3 = 0; this.cur = 0; this.dist = 0; this.max = 0;
  this.prev = null; this.vorher = null; this.burst = []; this.spdMaxClean = 0;
  this.hr = 0; this.hrSum = 0; this.hrN = 0; this.hrMax = 0;
  this.foiling = false; this.enterStreak = 0; this.exitStreak = 0; this.runEndedMs = -100000;
  this.runStartMs = 0; this.runStartDist = 0; this.runMaxMps = 0; this.runMaxHr = 0; this.runCount = 0;
  this.minSpeedSeitEnde = 99; this.runIstFortsetzung = false;
  this.lastRunStartMs = 0; this.lastRunStartDist = 0; this.lastRunDurMs = 0; this.lastRunDistM = 0;
  this.lastRunAvgMps = 0; this.lastRunMaxMps = 0; this.lastRunMaxHr = 0;
  this.runsSumDurMs = 0; this.runsSumDistM = 0;
};
/**
 * Ein Takt. el = aktive ms, jetzt = Wanduhr-ms, fix = frischer GPS-Punkt (lat/lon), speed = m/s vom
 * GPS oder -1 (dann aus den Positionen, wie Zepp), hr = Puls oder 0. true = Lauf begonnen/beendet.
 */
Stand.prototype.tick = function (el, jetzt, fix, lat, lon, speed, hr) {
  var v = 0, sprung = false;
  if (fix) {
    var p = this.vorher;
    if (speed >= 0) v = speed;
    else if (p) {
      var dt = (jetzt - p[2]) / 1000;
      if (dt > 0) v = meter(p[0], p[1], lat, lon) / dt;
    }
    this.vorher = [lat, lon, jetzt];
  } else {
    this.vorher = null;
  }
  if (v < 0 || v > MAX_SPRUNG_MPS) { v = 0; sprung = true; }
  if (hr > 0) { this.hr = hr; this.hrSum += hr; this.hrN++; if (hr > this.hrMax) this.hrMax = hr; }
  else this.hr = 0;
  this.cur = fix ? v : 0;
  if (fix) {
    if (this.prev && !sprung) this.dist += meter(this.prev[0], this.prev[1], lat, lon);
    this.prev = [lat, lon];
    this.spdMaxClean = maxKandidat(this.burst, jetzt, v);
    if (this.spdMaxClean > this.max) this.max = this.spdMaxClean;
  }
  this.median(this.cur, el, fix);
  var vorher = this.foiling;
  this.lauf(this.sp3, this.cur, this.dist, el);
  return vorher !== this.foiling;
};
Stand.prototype.median = function (mps, t, fix) {
  if (fix) this.spWin.push([t, mps]);
  while (this.spWin.length && t - this.spWin[0][0] > SPEED_WIN_S * 1000) this.spWin.shift();
  var v = [];
  for (var i = 0; i < this.spWin.length; i++) v.push(this.spWin[i][1]);
  if (!v.length) { this.sp3 = 0; return; }
  v.sort(function (a, b) { return a - b; });
  var h = v.length >> 1;
  this.sp3 = (v.length % 2) ? v[h] : (v[h - 1] + v[h]) / 2;
};
/** Zustands-Automat, 1:1 Zepp _updateRun (= Garmin SessionRecorder._updateRun). */
Stand.prototype.lauf = function (v3, vInst, dist, t) {
  var s = this;
  if (!s.foiling) {
    if (vInst < s.minSpeedSeitEnde) s.minSpeedSeitEnde = vInst;
    var gesperrt = (t - s.runEndedMs < RUN_REARM_COOLDOWN_MS) && s.minSpeedSeitEnde < NOSTOP_MPS;
    if (gesperrt) { s.enterStreak = 0; return; }
    s.enterStreak = (v3 >= RUN_ENTER_MPS) ? s.enterStreak + 1 : 0;
    if (s.enterStreak < RUN_ENTER_DWELL) return;
    s.foiling = true; s.exitStreak = 0;
    s.runIstFortsetzung = s.runCount > 0 && s.minSpeedSeitEnde >= NOSTOP_MPS;
    if (s.runIstFortsetzung) {
      var luecke = t - s.lastRunStartMs, strecke = dist - s.lastRunStartDist;
      if (luecke <= 0 || strecke < 0 || strecke / (luecke / 1000) > MAX_FOIL_MPS) s.runIstFortsetzung = false;
    }
    s.minSpeedSeitEnde = 99;
    if (s.runIstFortsetzung) {
      s.runStartMs = s.lastRunStartMs; s.runStartDist = s.lastRunStartDist;
      if (s.lastRunMaxMps > s.runMaxMps) s.runMaxMps = s.lastRunMaxMps;
      if (s.lastRunMaxHr > s.runMaxHr) s.runMaxHr = s.lastRunMaxHr;
      s.runsSumDurMs = Math.max(0, s.runsSumDurMs - s.lastRunDurMs);
      s.runsSumDistM = Math.max(0, s.runsSumDistM - s.lastRunDistM);
    } else {
      s.runStartMs = t - RUN_ENTER_DWELL * 1000; s.runStartDist = dist;
      s.runMaxMps = s.spdMaxClean; s.runMaxHr = s.hr > 0 ? s.hr : 0;
    }
    return;
  }
  if (s.spdMaxClean > s.runMaxMps) s.runMaxMps = s.spdMaxClean;
  if (s.hr > s.runMaxHr) s.runMaxHr = s.hr;
  s.exitStreak = (v3 < RUN_EXIT_MPS) ? s.exitStreak + 1 : 0;
  if (s.exitStreak < RUN_EXIT_DWELL) return;
  s.foiling = false; s.enterStreak = 0;
  var durMs = Math.max(0, t - RUN_EXIT_DWELL * 1000 - s.runStartMs);
  var distM = Math.max(0, dist - s.runStartDist);
  s.minSpeedSeitEnde = 99; s.runEndedMs = t;
  var schnell = durMs > 0 && (distM / (durMs / 1000)) >= MIN_RUN_AVG_MPS;
  if (!s.runIstFortsetzung && (durMs < MIN_RUN_MS || !schnell)) {
    s.runMaxHr = 0; s.runIstFortsetzung = false; return;
  }
  s.lastRunStartMs = s.runStartMs; s.lastRunStartDist = s.runStartDist;
  s.lastRunDurMs = durMs; s.lastRunDistM = distM;
  s.lastRunAvgMps = durMs > 0 ? distM / (durMs / 1000) : 0;
  s.lastRunMaxMps = s.runMaxMps; s.lastRunMaxHr = s.runMaxHr; s.runMaxHr = 0;
  s.runsSumDurMs += durMs; s.runsSumDistM += distM;
  if (!s.runIstFortsetzung) s.runCount++;
  s.runIstFortsetzung = false;
};

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
/**
 * Konfiguration aus /api/devices/config (das Handy schickt nur diese Schluessel, s. HuaweiBruecke).
 * Ohne Konfiguration: dieselben Standardseiten wie der Server sie fuer neue Nutzer liefert.
 */
function Konfig(k) {
  k = k || {};
  this.views = k.views || [[1, 2, 0]];
  this.offFoilView = k.offFoilView || [12, 17, 16];
  this.pauseView = k.pauseView || [12, 20, 2];
  this.pages = k.pages || [];
  this.offFoilPages = k.offFoilPages || [];
  this.pausePages = k.pausePages || [];
  this.browseAll = k.browseAll !== false;
  this.layoutsOn = k.layoutsOn !== false;
  this.colorByValue = !!k.colorByValue;
  this.hrZones = gueltigeZonen(k.hrZones) || [95, 114, 133, 152, 171, 190];
  this.speedZones = gueltigeZonen(k.speedZones) || [8, 12, 16, 20, 24, 28];
}
function gueltigeZonen(z) {
  if (!z || z.length !== 6) return null;
  for (var i = 0; i < 6; i++) if (typeof z[i] !== "number") return null;
  return z;
}
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
  if (typ === 8) {
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

export default {
  Stand: Stand, Konfig: Konfig, feld: feld, feldZahl: feldZahl, ring: ring, zeichne: zeichne,
  groesse: groesse, maxKandidat: maxKandidat
};
