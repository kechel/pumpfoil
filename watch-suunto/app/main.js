// ERZEUGT von watch-suunto/bau.mjs — nicht von Hand aendern, Quellen in watch-suunto/quelle/.
// ---- watch-huawei/common/lauf.js ----
/*
 * Lauf-Erkennung und Seiten-Konfiguration der Huawei-Uhren (Stand, Konfig) — der Teil der Datenseiten,
 * den der RECORDER braucht. Abgetrennt von seiten.js (Zeichnen) am 08.10.2026: die JerryScript-Engine
 * der Lite-Uhren uebersetzt jedes Buendel in 48 KB Heap; Recorder + Kern + Datenseiten in EINEM
 * Buendel brauchten mehr, der Snapshot scheiterte und die Uhr blieb schwarz. Jetzt liegt der Recorder
 * im app.js-Buendel (mit dieser Datei), Seite und Zeichnen im Seiten-Buendel (seiten.js).
 * Ohne Geraete-APIs, in Node getestet (test/seiten.test.mjs).
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

var meter = function (a, b, c, d) {
  var R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** Hoechstwert saeubern wie der Server: Doppler-Burst -> Median, ueber 32 km/h -> zaehlt nicht. */
var maxKandidat = function (puffer, t, v) {
  puffer.push([t, v]);
  while (puffer.length && t - puffer[0][0] > BURST_WIN_MS) puffer.shift();
  var w = [];
  for (var i = 0; i < puffer.length; i++) w.push(puffer[i][1]);
  w.sort(function (a, b) { return a - b; });
  var med = w.length ? w[w.length >> 1] : 0;
  var x = v;
  if (x > med + BURST_MARGIN_MPS && x > BURST_ABS_MIN_MPS) x = med;
  return x > MAX_FOIL_MPS ? 0 : x;
};

/** Alles, was die Felder zeigen. `tick` einmal je Sekunde waehrend der Aufnahme (nicht in der Pause). */
var Stand = function () { this.neu(); };
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

/**
 * Konfiguration aus /api/devices/config (das Handy schickt nur diese Schluessel, s. HuaweiBruecke).
 * Ohne Konfiguration: dieselben Standardseiten wie der Server sie fuer neue Nutzer liefert.
 */
var Konfig = function (k) {
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
  // Ablauf wie die anderen Uhren (Server devices.py): Stopp/Pause halten oder tippen.
  this.stopMode = k.stopMode === "press" ? "press" : "hold";
  // Fehlt der Schluessel, AUS — wie Zepp/Wear/Apple (der Server schickt ihn immer mit, Standard dort an).
  this.autoStart = k.autoStart === true;
  this.waterLock = k.waterLock === "on" || k.waterLock === "off" ? k.waterLock : "auto";
  // Foils + Alarme (Server devices.py, Felder wie bei Zepp/Garmin/Wear). foils: [{id,label,min,max}],
  // Standard-Foil vorn.
  this.foils = k.foils && k.foils.length ? k.foils : [];
  this.alarmEnabled = k.alarmEnabled === true;
  this.alarmDefault = k.alarmDefault === "fixed" ? "fixed" : "foil";
  this.speedLow = k.speedLow | 0; this.speedHigh = k.speedHigh | 0; this.hrHigh = k.hrHigh | 0;
  this.patHigh = k.alarmPatternHigh || "short2"; this.patLow = k.alarmPatternLow || "long2";
  this.patHr = k.alarmPatternHr || "short1";
  this.repeat = k.alarmRepeat === "continuous" ? "continuous" : "once";
  this.repeatS = Math.max(2, k.alarmRepeatS | 0 || 5);
  this.runDistM = k.runDistM | 0; this.runDistMode = k.runDistMode === "every" ? "every" : "once";
  this.patDist = k.alarmPatternDist || "short1";
  this.runTimeS = k.runTimeS | 0; this.runTimeMode = k.runTimeMode === "every" ? "every" : "once";
  this.patTime = k.alarmPatternTime || "short2";
};
var gueltigeZonen = function (z) {
  if (!z || z.length !== 6) return null;
  for (var i = 0; i < 6; i++) if (typeof z[i] !== "number") return null;
  return z;
};

/**
 * Was der Nutzer AUF DER UHR waehlt (Einstellungsseite wie Zepp-Seite 4/4): Alarm an/aus, Grenzen vom
 * Foil oder fest, welches Foil, eigene Layouts und Touch-Sperre (null = wie das Profil). Vorbelegt aus
 * der Konfiguration (einmal, wie Zepp _foilInit), danach entscheidet die Uhr; wird gespeichert.
 */
var Auswahl = function (d) {
  d = d || {};
  this.gesetzt = d.gesetzt === true;
  this.alarm = d.alarm === true;
  this.quelle = d.quelle === "manual" ? "manual" : "foil";
  this.foilId = typeof d.foilId === "number" ? d.foilId : null;
  this.layouts = typeof d.layouts === "boolean" ? d.layouts : null;
  this.sperre = typeof d.sperre === "boolean" ? d.sperre : null;
  this.start = typeof d.start === "boolean" ? d.start : null;   // Auto-Start: null = wie im Profil
};
/** Erstbelegung aus der Konfiguration; spaeter nur noch: ein verschwundenes Foil durch das erste ersetzen. */
Auswahl.prototype.vorbelegen = function (k) {
  var da = false, i;
  for (i = 0; i < k.foils.length; i++) if (k.foils[i].id === this.foilId) da = true;
  if (!da) this.foilId = k.foils.length ? k.foils[0].id : null;
  if (this.gesetzt) return;
  this.gesetzt = true;
  this.alarm = k.alarmEnabled;
  this.quelle = k.alarmDefault === "foil" && k.foils.length ? "foil" : "manual";
};
Auswahl.prototype.foil = function (k) {
  for (var i = 0; i < k.foils.length; i++) if (k.foils[i].id === this.foilId) return k.foils[i];
  return null;
};
/** Naechstes Foil (Tippen auf die Zeile), im Kreis. */
Auswahl.prototype.naechstesFoil = function (k) {
  var n = k.foils.length, i;
  if (!n) { this.foilId = null; return; }
  for (i = 0; i < n; i++) if (k.foils[i].id === this.foilId) break;
  this.foilId = k.foils[(i + 1) % n].id;
};
/** Auto -> An -> Aus -> Auto (wie das Garmin-Menue / Zepp). */
var dreistufig = function (v) { return v === null ? true : v === true ? false : null; };
Auswahl.prototype.daten = function () {
  return { gesetzt: this.gesetzt, alarm: this.alarm, quelle: this.quelle, foilId: this.foilId,
    layouts: this.layouts, sperre: this.sperre, start: this.start };
};

/**
 * Vibrationsalarm wie Zepp (_checkAlarm, _checkHrAlarm, _checkMarks): Tempo ueber/unter den Grenzen
 * (Foil oder fest; „unter" nur bis 2 km/h darunter, sonst brummt es beim Paddeln), Puls ueber der
 * Grenze, Strecken-/Zeitmarken im Lauf. Liefert die Muster, die jetzt vibrieren sollen.
 */
var Alarm = function () { this.aktiv = false; this.hrAktiv = false; this.letzt = 0; this.lauf = -1; this.distN = 0; this.zeitN = 0; };
Alarm.prototype.pruefe = function (k, a, kmh, hr, s, el, jetzt) {
  var aus = [];
  if (!a.alarm) return aus;
  var lo = k.speedLow, hi = k.speedHigh, f = a.quelle === "foil" ? a.foil(k) : null;
  if (f) { lo = f.min; hi = f.max; }
  var ueber = hi > 0 && kmh > hi, unter = lo > 0 && kmh < lo && kmh >= lo - 2;
  var wieder = k.repeat === "continuous" && jetzt - this.letzt >= k.repeatS * 1000;
  if (ueber || unter) {
    if (!this.aktiv || wieder) { this.aktiv = true; this.letzt = jetzt; aus.push(ueber ? k.patHigh : k.patLow); }
  } else this.aktiv = false;
  if (k.hrHigh > 0 && hr > k.hrHigh) {
    if (!this.hrAktiv || wieder) { this.hrAktiv = true; this.letzt = jetzt; aus.push(k.patHr); }
  } else this.hrAktiv = false;
  if (!s.foiling) return aus;
  if (s.runStartMs !== this.lauf) { this.lauf = s.runStartMs; this.distN = 0; this.zeitN = 0; }
  if (k.runDistM > 0 && (this.distN === 0 || k.runDistMode === "every") &&
      s.dist - s.runStartDist >= (this.distN + 1) * k.runDistM) { this.distN++; aus.push(k.patDist); }
  if (k.runTimeS > 0 && (this.zeitN === 0 || k.runTimeMode === "every") &&
      (el * 1000 - s.runStartMs) / 1000 >= (this.zeitN + 1) * k.runTimeS) { this.zeitN++; aus.push(k.patTime); }
  return aus;
};


// ---- watch-huawei/common/seiten.js (Felder, Seiten) ----
var PALETTE = ["#ffffff", "#d0d0d0", "#808080", "#000000", "#ff0000", "#ff5500", "#ffaa00", "#ffff00",
  "#00ff00", "#00aa00", "#00ffff", "#22d3ee", "#0055ff", "#aa00ff", "#ff00aa"];
var ZONEN = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444"];
var AUTO_WERT = "#ffffff", AUTO_LABEL = "#d0d0d0", AUTO_LINIE = "#808080", CYAN = "#22d3ee";
var TINTE_280 = [29, 46, 50, 61, 64, 82, 99, 146, 166];
var pad = function (n) { return n < 10 ? "0" + n : "" + n; };

var mmss = function (sec) { return Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60)); };

var distVal = function (m) { return m < 1000 ? String(Math.round(m)) : (m / 1000).toFixed(2); };

var distUnit = function (m) { return m < 1000 ? "m" : "km"; };

var feldZahl = function (s, id, el) {
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
};

var feld = function (s, id, el, t, jetzt) {
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
};

var klassisch = function (f) { f = f || []; return [0, f[0] | 0, f[1] | 0, f[2] | 0]; };

var satz = function (k, z) {
  var i, out = [];
  if (z === "p") return k.layoutsOn && k.pausePages.length ? k.pausePages : [klassisch(k.pauseView)];
  if (z === "on") {
    if (k.layoutsOn && k.pages.length) return k.pages;
    for (i = 0; i < k.views.length; i++) out.push(klassisch(k.views[i]));
    return out.length ? out : [[0, 1, 0, 0]];
  }
  return k.layoutsOn && k.offFoilPages.length ? k.offFoilPages : [klassisch(k.offFoilView)];
};

var ring = function (k, z) {
  var out = satz(k, z);
  if (z === "off" && k.browseAll) out = out.concat(satz(k, "on"));
  if (z === "p" && k.browseAll) out = out.concat(satz(k, "on"), satz(k, "off"));
  return out.length ? out : [[0, 1, 0, 0]];
};

var farbe = function (i, ersatz) { i = i | 0; return i >= 1 && i <= PALETTE.length ? PALETTE[i - 1] : ersatz; };

var groesse = function (stufe, dw) {
  var i = Math.max(0, Math.min(TINTE_280.length - 1, stufe | 0));
  return Math.max(7, Math.round(dw * TINTE_280[i] / 1.973 / 280));
};

var zone = function (v, g) { var z = 0; for (var i = 1; i < 5; i++) if (v >= g[i]) z = i; return z; };

var istPuls = function (fid) { return fid === 2 || fid === 8 || fid === 9 || fid === 21; };

var wertFarbe = function (k, fid, v) {
  if (v === null || v === undefined) return null;
  if (istPuls(fid)) return v > 0 ? ZONEN[zone(v, k.hrZones)] : null;
  if (fid === 1 || fid === 5 || fid === 6 || fid === 7 || fid === 18 || fid === 19) return ZONEN[zone(v, k.speedZones)];
  return null;
};

var fuellgrad = function (k, fid, v) {
  var g = istPuls(fid) ? k.hrZones : k.speedZones;
  if (v === null || v === undefined || !(g[5] > g[0])) return 0;
  return Math.max(0, Math.min(1, (v - g[0]) / (g[5] - g[0])));
};

var mische = function (c, bg, f) {
  function kan(h, i) { return parseInt(h.substr(1 + 2 * i, 2), 16); }
  var out = "#";
  for (var i = 0; i < 3; i++) {
    var x = Math.round(kan(c, i) * f + kan(bg, i) * (1 - f));
    out += (x < 16 ? "0" : "") + x.toString(16);
  }
  return out;
};

var zeichne = function (e, ctx) {
  return e && e[0] === 1 ? layout(e, ctx) : klassik(e || [0, 1, 0, 0], ctx);
};

var klassik = function (e, c) {
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
};

var layout = function (e, c) {
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
};

var grafik = function (out, x, typ, ax, ay, st, ci, fl, fid, c) {
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
};

var rahmen = function (out, dw, dh, th, start, laenge, col) {
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
};
// ---- quelle/anzeige.js ----
/*
 * Datenseiten wie auf den anderen Uhren: dieselben Zeichenbefehle wie Huawei (seiten.js `zeichne`, in
 * Promille des Displays), auf die Mittel einer SuuntoPlus-Vorlage verteilt (Referenz „Native functions"):
 *   Text   -> ein Element aus einem Vorrat je Schriftklasse; setText + setStyle (left/top/color/visibility)
 *   Rechteck, Linie, Bogen, Seitenpunkte -> gepackt in die Ausgaben g0…g15 (je eine Zahl < 2^53); die
 *          Vorlage abonniert sie ($.subscribe, Beispiel „DynamicIcons") und zeichnet sie auf ihr <canvas>
 *          (quelle/vorlage.js), neu aufgebaut, wenn sich `gv` aendert.
 * Gegenstueck beim Entpacken: quelle/vorlage.js — beide in Node gegeneinander geprueft (test/anzeige.test.mjs).
 */
var ANZ_GRAFIKEN = 16;
// Schriftklassen der Vorlage mit ihrer Hoehe als Anteil der Displaybreite (Referenz „CSS classes for text
// UI version 2", grosses Display 466 px; die sp-*-Klassen passen sich an n/o/q an). Je 3 Elemente.
var ANZ_KLASSEN = [["sp-d-xxl", 155], ["sp-d-xl", 118], ["sp-d-l", 103], ["sp-d-m", 78], ["sp-d-s", 65],
  ["sp-d-xs", 46], ["sp-t-m", 33], ["sp-t-s", 27]];
var ANZ_JE_KLASSE = 3;

/** Schriftklasse fuer eine Textgroesse s (Promille der Displaybreite, aus seiten.js groesse()). */
var anzKlasse = function (s) {
  var best = 0, d = 1e9, i, h;
  for (i = 0; i < ANZ_KLASSEN.length; i++) {
    h = ANZ_KLASSEN[i][1] * 1000 / 466;
    if (Math.abs(h - s) < d) { d = Math.abs(h - s); best = i; }
  }
  return best;
};

/** #rrggbb -> 12 bit (4 je Kanal). */
var anzFarbe = function (c) {
  if (!c || c.charAt(0) !== "#" || c.length < 7) return 0xFFF;
  var r = parseInt(c.substr(1, 2), 16) >> 4, g = parseInt(c.substr(3, 2), 16) >> 4, b = parseInt(c.substr(5, 2), 16) >> 4;
  return (r << 8) | (g << 4) | b;
};

var anzBits = function (v, bits) { var m = Math.pow(2, bits) - 1; v = Math.round(v); return v < 0 ? 0 : v > m ? m : v; };

/**
 * Grafik-Befehl -> Zahl. Typ in den untersten 2 Bit; Koordinaten in Promille / 2 (9 bit = 0…1022).
 *   0 Rechteck: x, y, w, h (je 9) + Farbe 12            = 50 bit
 *   1 Linie:    x1, y1, x2, y2 (je 9) + Breite 3 + Farbe 12 = 53 bit
 *   2 Bogen um die Mitte: r (9), a0+90 (9, Grad), Laenge (9, Grad), Breite 5 (Promille/2), Farbe 12 = 46 bit
 *   3 Seitenpunkte: x, y (je 9), d 6, Anzahl 4, aktiv 4, Farbe 12 = 46 bit
 * Rechnen mit Multiplikation statt Bit-Schieben: JS-Bitoperatoren koennen nur 32 bit.
 */
var anzPacke = function (g) {
  var w = [], typ;
  if (g.k === "r") { typ = 0; w = [[g.x / 2, 9], [g.y / 2, 9], [g.w / 2, 9], [g.h / 2, 9]]; }
  else if (g.k === "l") { typ = 1; w = [[g.x1 / 2, 9], [g.y1 / 2, 9], [g.x2 / 2, 9], [g.y2 / 2, 9], [g.w / 2, 3]]; }
  else if (g.k === "a") { typ = 2; w = [[g.r / 2, 9], [((g.a0 + 90) % 360 + 360) % 360, 9], [g.a1 - g.a0, 9], [g.w / 2, 5]]; }
  else if (g.k === "d") { typ = 3; w = [[g.x / 2, 9], [g.y / 2, 9], [g.d / 2, 6], [g.n, 4], [g.idx, 4]]; }
  else return 0;
  var z = anzFarbe(g.c), f = 4096, i;
  for (i = 0; i < w.length; i++) { z += anzBits(w[i][0], w[i][1]) * f; f *= Math.pow(2, w[i][1]); }
  return z * 4 + typ + 1;     // +1: 0 heisst „kein Befehl"
};

/**
 * Seiten-Punkte als EIN Befehl (statt bis zu 12 Rechtecken wie in seiten.js) — ersetzt dort `punkte`
 * (bau.mjs nimmt diese Fassung statt der aus seiten.js). Gleiche Geometrie, die Vorlage malt sie aus.
 */
var punkte = function (out, ax, ay, fl, c, col, bg) {
  var n = Math.max(1, Math.min(12, c.anzahl | 0));
  if (n <= 1) return;
  var d = Math.max(3, Math.round(c.dw * 0.022)), total = (n - 1) * d * 2;
  var x0 = (fl & 1) ? ax + d / 2 : (fl & 2) ? ax - total - d / 2 : ax - total / 2;
  out.push({ k: "d", x: x0, y: ay, d: d, n: n, idx: c.idx, c: col });
};

/** Zustand der Anzeige (was schon gesetzt ist — setStyle/setText nur bei Aenderung). */
var Anzeige = function () { this.el = {}; this.gv = 0; this.g = []; };

Anzeige.prototype.zeigen = function (befehle, output) {
  var graf = [], frei = [], i, k, id, e, b;
  for (k = 0; k < ANZ_KLASSEN.length; k++) frei.push(0);
  var benutzt = {};
  for (i = 0; i < befehle.length; i++) {
    b = befehle[i];
    if (b.k !== "t") { if (graf.length < ANZ_GRAFIKEN) graf.push(anzPacke(b)); continue; }
    if (!b.txt) continue;
    k = anzKlasse(b.s);
    // Klasse voll -> naechstkleinere mit freiem Platz
    while (k < ANZ_KLASSEN.length && frei[k] >= ANZ_JE_KLASSE) k++;
    if (k >= ANZ_KLASSEN.length) continue;
    id = "#k" + k + "_" + frei[k]++;
    benutzt[id] = 1;
    this.text(id, b);
  }
  // uebrige Elemente verstecken
  for (k = 0; k < ANZ_KLASSEN.length; k++) {
    for (i = 0; i < ANZ_JE_KLASSE; i++) {
      id = "#k" + k + "_" + i;
      if (!benutzt[id]) this.stil(id, "visibility", "hidden");
    }
  }
  var neu = false;
  for (i = 0; i < ANZ_GRAFIKEN; i++) {
    var v = i < graf.length ? graf[i] : 0;
    if (this.g[i] !== v) { this.g[i] = v; output["g" + i] = v; neu = true; }
  }
  if (neu) { this.gv = (this.gv + 1) % 1000000; output.gv = this.gv; }
};

Anzeige.prototype.text = function (id, b) {
  var e = this.el[id] || (this.el[id] = {});
  if (e.txt !== b.txt) { e.txt = b.txt; setText(id, b.txt); }
  var ax = b.x / 10, ay = b.y / 10;
  var links = b.a === "l" ? ax + "%" : b.a === "r" ? "calc(" + ax + "% - 100%e)" : "calc(" + ax + "% - 50%e)";
  this.stil(id, "left", links);
  this.stil(id, "top", "calc(" + ay + "% - 50%e)");
  this.stil(id, "color", b.c || "#ffffff");
  this.stil(id, "visibility", "visible");
};

Anzeige.prototype.stil = function (id, p, v) {
  var e = this.el[id] || (this.el[id] = {});
  if (e[p] === v) return;
  e[p] = v;
  setStyle(id, p, v);
};

// ---- quelle/pumpe.js ----
/*
 * Pump-Zaehler auf der Uhr — Streaming-Fassung von server/app/ml/pumps.py:find_pumps_cadence.
 *
 * Server (offline, ganzer Lauf): Schwerkraft je Achse per Tiefpass 0,25 Hz, dynamische Beschleunigung
 * auf die Schwerkraft projiziert (vertical_against_gravity), Bandpass 0,3–3 Hz, in rhythmischen
 * Abschnitten (RMS >= 0,008 g ueber 4 s, mindestens 1 s lang) je lokaler Pump-Periode ein Peak.
 * Die Zahl der Peaks ist damit im Kern „Dauer der rhythmischen Abschnitte x lokale Kadenz".
 *
 * Hier (kausal, je Wert): dieselbe Kette mit IIR-Filtern, Kadenz per DFT (Hann) auf 10 Hz
 * ueber 4 s im Band 0,8–2 Hz, alle 0,5 s neu geschaetzt; eine Phase laeuft mit der Kadenz mit und
 * jeder volle Umlauf ist ein Pump. Ein Abschnitt zaehlt erst nach 1 s — dann wird diese erste
 * Sekunde nachgezaehlt, wie beim Server.
 *
 * ES5 fuer Duktape (SuuntoPlus): nur Float32Array, kein Date. In Node gegen den Server-Zaehler
 * geprueft (test/pumpe.test.mjs).
 */
var PUMPE_GATE_G = 0.008, PUMPE_WIN_S = 4, PUMPE_DEZ_HZ = 10, PUMPE_MIN_S = 1;
var PUMPE_BIN_MIN = 4, PUMPE_BIN_MAX = 8;          // Bin k = k/4 Hz -> 1,0 … 2,0 Hz (Band 0,8–2)

var pumpeBiquad = function (typ, fs, fc) {
  // RBJ-Biquad, Q = 1/sqrt(2) (Butterworth 2. Ordnung)
  var w = 2 * Math.PI * fc / fs, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.7071067811865476);
  var b0, b1, b2, a0 = 1 + al;
  if (typ === 0) { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
};
var pumpeFilter = function (f, x) {
  var y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
};

var Pumpe = function (fs) {
  this.fs = fs;
  this.alpha = 1 - Math.exp(-2 * Math.PI * 0.25 / fs);   // Schwerkraft-Tiefpass 0,25 Hz
  this.gx = 0; this.gy = 0; this.gz = 1; this.n = 0;
  this.hp = pumpeBiquad(1, fs, 0.3); this.lp = pumpeBiquad(0, fs, 3.0);
  this.dez = Math.max(1, Math.round(fs / PUMPE_DEZ_HZ));
  this.dzSum = 0; this.dzN = 0;
  this.ring = new Float32Array(PUMPE_WIN_S * PUMPE_DEZ_HZ); this.rPos = 0; this.rVoll = 0;
  this.schritt = 0;                // 10-Hz-Schritte seit der letzten Kadenz-Schaetzung
  this.f = 0;                      // aktuelle Kadenz (Hz), 0 = kein Rhythmus
  this.rhythmS = 0;                // Dauer des laufenden rhythmischen Abschnitts (s)
  this.phase = 0;
  this.gesamt = 0;
  this.schrittNr = 0;              // 10-Hz-Schritte seit dem Start (Zeitachse der Pumps: schrittNr / 10 s)
  this.zeiten = [];                // erkannte Pumps (s), aufsteigend, vom Aufrufer abzuholen
  this.letzteZeit = -1;
};

/** Ein Wert (in g). Gibt die Zahl der in diesem Schritt gezaehlten Pumps zurueck (meist 0). */
Pumpe.prototype.wert = function (ax, ay, az) {
  var a = this.alpha;
  if (this.n === 0) { this.gx = ax; this.gy = ay; this.gz = az; }
  else { this.gx += a * (ax - this.gx); this.gy += a * (ay - this.gy); this.gz += a * (az - this.gz); }
  this.n++;
  var gn = Math.sqrt(this.gx * this.gx + this.gy * this.gy + this.gz * this.gz) || 1;
  var v = ((ax - this.gx) * this.gx + (ay - this.gy) * this.gy + (az - this.gz) * this.gz) / gn;
  v = pumpeFilter(this.lp, pumpeFilter(this.hp, v));
  this.dzSum += v; this.dzN++;
  var neu = 0;
  if (this.dzN >= this.dez) {
    this.ring[this.rPos] = this.dzSum / this.dzN; this.rPos = (this.rPos + 1) % this.ring.length;
    if (this.rVoll < this.ring.length) this.rVoll++;
    this.dzSum = 0; this.dzN = 0;
    this.schrittNr++;
    if (++this.schritt >= PUMPE_DEZ_HZ / 2) { this.schritt = 0; this.schaetzen(); }
    if (this.f > 0) {
      var dt = 1 / PUMPE_DEZ_HZ;
      var vorher = this.rhythmS;
      this.rhythmS += dt;
      this.phase += this.f * dt;
      if (vorher < PUMPE_MIN_S && this.rhythmS >= PUMPE_MIN_S) {
        neu = Math.floor(this.phase); this.phase -= neu;      // erste Sekunde nachzaehlen
      } else if (this.rhythmS >= PUMPE_MIN_S && this.phase >= 1) {
        neu = Math.floor(this.phase); this.phase -= neu;
      }
    } else { this.rhythmS = 0; this.phase = 0; }
    if (neu > 0) this.zeitenSetzen(neu);
  }
  this.gesamt += neu;
  return neu;
};

/**
 * Zeitpunkte der eben gezaehlten Pumps: wie der Server das ECHTE Maximum je Pump-Periode — vom
 * neuesten Schritt aus je eine Periode zurueck, Parabel durch die Nachbarn, abzueglich der
 * Verzoegerung der Filter bei der aktuellen Kadenz. Hoechstens alle 0,45 s ein Pump (Server
 * MIN_PEAK_DISTANCE_S).
 */
Pumpe.prototype.zeitenSetzen = function (neu) {
  var L = this.ring.length, T = Math.max(3, Math.round(PUMPE_DEZ_HZ / (this.f || 1.5)));
  var spaet = this.verzoegerungS(this.f || 1.5), neue = [], j, k;
  for (j = 0; j < neu; j++) {
    var ende = this.schrittNr - 1 - j * T, best = -1e9, bestS = ende;
    for (k = 0; k < T && ende - k > this.schrittNr - L; k++) {
      var v = this.ring[((this.rPos - 1 - (this.schrittNr - 1 - (ende - k))) % L + L) % L];
      if (v > best) { best = v; bestS = ende - k; }
    }
    var t = bestS, a = this.wertBei(bestS - 1), c = this.wertBei(bestS + 1), d = a - 2 * best + c;
    if (a !== null && c !== null && d < 0) t += 0.5 * (a - c) / d;
    neue.unshift(t / PUMPE_DEZ_HZ - spaet);
  }
  for (j = 0; j < neue.length; j++) {
    var z = neue[j];
    if (this.letzteZeit >= 0 && z < this.letzteZeit + 0.45) z = this.letzteZeit + 0.45;
    this.zeiten.push(z); this.letzteZeit = z;
  }
};

/** Wert des 10-Hz-Rings bei Schritt s (null, wenn nicht mehr/noch nicht da). */
Pumpe.prototype.wertBei = function (s) {
  var L = this.ring.length;
  if (s > this.schrittNr - 1 || s <= this.schrittNr - 1 - L) return null;
  return this.ring[((this.rPos - 1 - (this.schrittNr - 1 - s)) % L + L) % L];
};

/** Phasenverzoegerung (s) der Kette Schwerkraft-Abzug + Hochpass 0,3 + Tiefpass 3 Hz + Mittelung bei f. */
Pumpe.prototype.verzoegerungS = function (f) {
  var w = 2 * Math.PI * f / this.fs, re = Math.cos(w), im = -Math.sin(w), re2 = Math.cos(2 * w), im2 = -Math.sin(2 * w);
  var ph = function (q) {
    var nr = q.b0 + q.b1 * re + q.b2 * re2, ni = q.b1 * im + q.b2 * im2;
    var dr = 1 + q.a1 * re + q.a2 * re2, di = q.a1 * im + q.a2 * im2;
    return Math.atan2(ni, nr) - Math.atan2(di, dr);
  };
  // 1 - Tiefpass(1. Ordnung): (1 - z^-1)(1-α)... als H = (1-α)(1 - z^-1)/(1 - (1-α) z^-1)
  var al = this.alpha, nr = (1 - al) * (1 - re), ni = -(1 - al) * im, dr = 1 - (1 - al) * re, di = -(1 - al) * im;
  var p = Math.atan2(ni, nr) - Math.atan2(di, dr) + ph(this.hp) + ph(this.lp);
  while (p > Math.PI) p -= 2 * Math.PI;
  while (p < -Math.PI) p += 2 * Math.PI;
  // Ring-Schritt s mittelt die Rohwerte s*dez … s*dez+dez-1: Mitte liegt (dez-1)/2 Werte nach s/10
  return -p / w / this.fs - (this.dez - 1) / 2 / this.fs;
};

Pumpe.prototype.schaetzen = function () {
  var n = this.rVoll, L = this.ring.length;
  if (n < L) { this.f = 0; return; }
  var s = 0, i, k, x = this.puffer || (this.puffer = new Float32Array(L));
  for (i = 0; i < L; i++) { x[i] = this.ring[(this.rPos + i) % L]; s += x[i] * x[i]; }
  if (Math.sqrt(s / L) < PUMPE_GATE_G) { this.f = 0; return; }
  // Wie der Server (_dom_pump_freq): Hann-Fenster ueber 4 s, staerkster DFT-Bin im Band 0,8–2 Hz.
  // 4 s -> Bins im Abstand 0,25 Hz (1,0 / 1,25 / … / 2,0) — dieselbe Rasterung wie dort.
  var best = 0, bestK = 0, w = this.hann || (this.hann = pumpeHann(L));
  for (k = PUMPE_BIN_MIN; k <= PUMPE_BIN_MAX; k++) {
    var re = 0, im = 0, c = 2 * Math.PI * k / L;
    for (i = 0; i < L; i++) { var y = x[i] * w[i]; re += y * Math.cos(c * i); im -= y * Math.sin(c * i); }
    var p = re * re + im * im;
    if (p > best) { best = p; bestK = k; }
  }
  this.f = bestK ? bestK * PUMPE_DEZ_HZ / L : 0;
};

var pumpeHann = function (L) {
  var w = new Float32Array(L), i;
  for (i = 0; i < L; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1));
  return w;
};

/** Kadenz in Pumps je Minute (0 ohne Rhythmus). */
Pumpe.prototype.kadenz = function () { return this.rhythmS >= PUMPE_MIN_S ? Math.round(this.f * 60) : 0; };

// ---- quelle/funk.js ----
/*
 * Funk zur Handy-App (Protokoll v1, docs/SUUNTO.md „Funkprotokoll"). Die Uhr ist BLE-Central und
 * schreibt 20-Byte-Pakete an unsere Handy-App (GATT-Server); die Handy-App quittiert per Notify.
 *
 * Was hier liegt, braucht von der Firmware nur `appConn` (connect/regUuid/writeChar/enaCharNotf) und
 * den Ereignis-Rueckruf; alles andere ist reines Rechnen und wird in Node gegen einen nachgebauten
 * Empfaenger geprueft (test/funk.test.mjs), auch ueber viele Abbrueche.
 *
 * Puffer: Accel-Bloecke (je hoechstens 25 Werte) und GPS-Sekunden liegen in festen Ringen. Ein Eintrag
 * bleibt, bis das Handy ihn quittiert hat; nach einem Abbruch geht es ab Quittung+1 weiter. Laeuft ein
 * Ring ueber, ist der aelteste Eintrag weg — das Handy sieht die Luecke an der Blocknummer.
 */
var FUNK_VER = 1;
var FUNK_SLOT = 8 + 25 * 6;        // Block: nr u16, t_ms u32, n u8, frei u8, 25 x (x,y,z) int16
var FUNK_GPS = 19;                 // GPS-Paket ohne Typbyte: sek, lat, lon, speed, hr, acc, alt, nr, frei
var FUNK_TIMEOUT_S = 4;            // Schreibvorgang ohne Antwort -> als verloren werten

// UUIDs little-endian (Service 0022c44b-105d-4fba-842c-f2c3c143eb6b, Schreiben …44c, Notify …44d)
var funkUuid = function (letztes) {
  return [0x6b, 0xeb, 0x43, 0xc1, 0xc3, 0xf2, 0x2c, 0x84, 0xba, 0x4f, 0x5d, 0x10, letztes, 0xc4, 0x22, 0x00];
};

var Funk = function (slots, gpsSlots) {
  this.slots = slots; this.gpsSlots = gpsSlots;
  this.acc = new Uint8Array(slots * FUNK_SLOT);
  this.gps = new Uint8Array(gpsSlots * FUNK_GPS);
  this.neu();
  this.zustand = 0;               // 0 aus, 1 verbindet, 2 registriert Schreiben, 3 registriert Notify,
                                  // 4 Notify einschalten, 5 bereit
  this.verbindung = -1; this.registriert = 0;
  this.inFlug = 0; this.flugS = 0; this.fehler = 0;
  this.handy = 0; this.offen = 0; // aus STATUS
  this.uhrId = 0; this.hz = 25; this.einheit = 0; this.display = 113; this.appVer = 0;
  this.stdHash = 0;               // Pruefsumme der mitgebrachten Standard-Layouts (HALLO)
  this.position = null;           // [lat, lon] e7, einmal je App-Start
  this.pakete = 0;                // gesendet (Statistik)
};

/** Neue Aufnahme: Zaehler und Ringe zuruecksetzen. */
Funk.prototype.neu = function () {
  this.block = 0;                 // naechste Blocknummer
  this.blockQ = -1;               // quittiert bis einschliesslich
  this.blockS = 0;                // naechster zu sendender Block
  this.teil = 0;                  // Teil des Blocks, der als naechstes geht
  this.sek = 0; this.sekQ = -1; this.sekS = 0;
  this.verloren = 0;              // Accel-Bloecke, die der Ring aufgeben musste (Handy zu lange weg)
  this.ereig = []; this.ereigNr = 0; this.ereigQ = -1;
  this.sitzung = 0; this.laeuft = 0; this.pause = 0;
  this.halloFaellig = 1;
};

// --- Puffer fuellen -------------------------------------------------------------------------

/** Accel-Block ablegen: werte = flaches Array int16 (x,y,z,…), hoechstens 25 Werte. */
Funk.prototype.accel = function (tMs, werte) {
  var n = Math.min(25, Math.floor(werte.length / 3));
  var o = (this.block % this.slots) * FUNK_SLOT, a = this.acc, i, v;
  a[o] = this.block & 255; a[o + 1] = (this.block >> 8) & 255;
  a[o + 2] = tMs & 255; a[o + 3] = (tMs >> 8) & 255; a[o + 4] = (tMs >> 16) & 255; a[o + 5] = (tMs >>> 24) & 255;
  a[o + 6] = n; a[o + 7] = 0;
  for (i = 0; i < n * 3; i++) {
    v = werte[i] | 0;
    if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
    a[o + 8 + 2 * i] = v & 255; a[o + 9 + 2 * i] = (v >> 8) & 255;
  }
  this.block++;
  // Ring voll: den aeltesten aufgeben (nicht quittiert, aber ueberschrieben)
  if (this.block - 1 - this.blockQ > this.slots) { this.blockQ = this.block - 1 - this.slots; this.verloren++; }
  if (this.blockS <= this.blockQ) { this.blockS = this.blockQ + 1; this.teil = 0; }
};

/** GPS-Sekunde ablegen. lat/lon in Grad·1e7, speed m/s (<0 unbekannt), hr bpm (0 keiner). */
Funk.prototype.gpsSek = function (sek, lat, lon, speed, hr, acc, alt) {
  var o = (this.sek % this.gpsSlots) * FUNK_GPS, g = this.gps;
  var sp = speed < 0 ? 0xFFFF : Math.min(0xFFFE, Math.round(speed * 100));
  sek = sek & 0xFFFF;
  g[o] = sek & 255; g[o + 1] = sek >> 8;
  funkI32(g, o + 2, lat); funkI32(g, o + 6, lon);
  g[o + 10] = sp & 255; g[o + 11] = sp >> 8;
  g[o + 12] = Math.max(0, Math.min(255, hr | 0));
  g[o + 13] = acc < 0 ? 255 : Math.min(254, acc | 0);
  alt = Math.max(-32768, Math.min(32767, Math.round(alt || 0)));
  g[o + 14] = alt & 255; g[o + 15] = (alt >> 8) & 255;
  g[o + 16] = this.sek & 255; g[o + 17] = (this.sek >> 8) & 255;   // laufende Nummer (Quittung)
  g[o + 18] = 0;
  this.sek++;
  if (this.sek - 1 - this.sekQ > this.gpsSlots) this.sekQ = this.sek - 1 - this.gpsSlots;
  if (this.sekS <= this.sekQ) this.sekS = this.sekQ + 1;
};

/** Ereignis: 1 Start, 2 Pause, 3 Weiter, 4 Ende, 5 Verwerfen. */
Funk.prototype.ereignis = function (art, tMs, sek) {
  this.ereig.push([this.ereigNr & 255, art, tMs, sek]);
  this.ereigNr++;
  if (this.ereig.length > 16) this.ereig.shift();
  if (art === 1) { this.laeuft = 1; this.pause = 0; }
  if (art === 2) this.pause = 1;
  if (art === 3) this.pause = 0;
  if (art >= 4) { this.laeuft = 0; this.pause = 0; }
  this.halloFaellig = 1;
};

var funkI32 = function (b, o, v) {
  v = v | 0;
  b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >>> 24) & 255;
};

// --- Naechstes Paket ------------------------------------------------------------------------

/** Das naechste zu sendende Paket (Array von Bytes) oder null. Reihenfolge: Hallo, Ereignisse,
 *  Position, GPS, Accel. */
Funk.prototype.naechstes = function () {
  var p, i;
  if (this.halloFaellig) {
    this.halloFaellig = 0;
    p = [1, FUNK_VER, this.hz, this.display, this.appVer & 255, (this.appVer >> 8) & 255, 0, 0, 0, 0, 0, 0, 0, 0,
      (this.laeuft ? 1 : 0) | (this.pause ? 2 : 0), this.einheit, 0, 0, 0, 0];
    funkI32(p, 6, this.uhrId); funkI32(p, 10, this.sitzung); funkI32(p, 16, this.stdHash);
    return p;
  }
  for (i = 0; i < this.ereig.length; i++) {
    var e = this.ereig[i];
    if (funkNach(e[0], this.ereigQ)) {
      p = [5, e[0], e[1], 0, 0, 0, 0, e[3] & 255, (e[3] >> 8) & 255];
      funkI32(p, 3, e[2]);
      return p;
    }
  }
  if (this.position) {
    p = [6, 0, 0, 0, 0, 0, 0, 0, 0];
    funkI32(p, 1, this.position[0]); funkI32(p, 5, this.position[1]);
    this.position = null;
    return p;
  }
  if (this.sekS < this.sek) {
    var o = (this.sekS % this.gpsSlots) * FUNK_GPS;
    p = [4];
    for (i = 0; i < FUNK_GPS; i++) p.push(this.gps[o + i]);
    this.sekS++;
    return p;
  }
  if (this.blockS < this.block) {
    var b = this.blockS, s = (b % this.slots) * FUNK_SLOT, a = this.acc, n = a[s + 6], laenge = n * 6;
    var von, bis;
    if (this.teil === 0) {
      p = [2, a[s], a[s + 1], a[s + 2], a[s + 3], a[s + 4], a[s + 5], n];
      von = 0; bis = Math.min(laenge, 12);
    } else {
      p = [3 | (this.teil << 4), a[s]];
      von = 12 + (this.teil - 1) * 18; bis = Math.min(laenge, von + 18);
    }
    for (i = von; i < bis; i++) p.push(a[s + 8 + i]);
    if (bis >= laenge) { this.blockS++; this.teil = 0; } else this.teil++;
    return p;
  }
  return null;
};

/** Ereignisnummer (u8, umlaufend) liegt nach der Quittung q? */
var funkNach = function (nr, q) {
  if (q < 0) return true;
  var d = (nr - q) & 255;
  return d > 0 && d < 128;
};

// --- Vom Handy -----------------------------------------------------------------------------

/** QUITTUNG [0x81, block u16, sek u16, ereignis u8, flags] — flags bit0 block, bit1 sek, bit2 ereignis
 *  gueltig. STATUS [0x82, flags, offen u16]. */
Funk.prototype.empfang = function (d) {
  if (!d || !d.length) return;
  if (d[0] === 0x81 && d.length >= 7) {
    var f = d[6];
    if (f & 1) {
      var b = funkVoll(d[1] | (d[2] << 8), this.block);
      if (b > this.blockQ) this.blockQ = b;
      if (this.blockS <= this.blockQ) { this.blockS = this.blockQ + 1; this.teil = 0; }
    }
    if (f & 2) {
      var s = funkVoll(d[3] | (d[4] << 8), this.sek);
      if (s > this.sekQ) this.sekQ = s;
      if (this.sekS <= this.sekQ) this.sekS = this.sekQ + 1;
    }
    if ((f & 4) && funkNach(d[5], this.ereigQ)) this.ereigQ = d[5];
  } else if (d[0] === 0x82 && d.length >= 4) {
    this.handy = d[1]; this.offen = d[2] | (d[3] << 8);
  } else if (d[0] === 0x83 && d.length >= 5) {
    this.konfigTeil(d);
  }
};

/** KONFIG [0x83, nr u16, anzahl u16, bis zu 15 Zeichen ASCII-JSON] — Datenseiten (auch freie Layouts),
 *  Alarme, Sprache aus dem Profil, vom Handy einmal je Verbindung. Fertig -> this.konfig, this.konfigNeu = 1. */
Funk.prototype.konfigTeil = function (d) {
  var nr = d[1] | (d[2] << 8), n = d[3] | (d[4] << 8), i, s = "";
  for (i = 5; i < d.length; i++) s += String.fromCharCode(d[i]);
  // Reihenfolge egal; ein Teil mit ANDEREM Inhalt an schon belegter Stelle = neue Sendung
  if (!this.kTeile || this.kAnzahl !== n || (this.kTeile[nr] !== undefined && this.kTeile[nr] !== s)) {
    this.kTeile = []; this.kAnzahl = n; this.kDa = 0;
  }
  if (nr >= n || this.kTeile[nr] !== undefined) return;
  this.kTeile[nr] = s; this.kDa++;
  if (this.kDa === n) { this.konfig = this.kTeile.join(""); this.konfigNeu = 1; this.kTeile = null; }
};

/** u16 aus der Quittung -> voller Zaehler: der groesste Wert < bis, der auf diese u16 endet (-1: keiner). */
var funkVoll = function (u, bis) {
  var v = (bis - 1) - (((bis - 1) - u) & 0xFFFF);
  return v < 0 ? -1 : v;
};

// --- Verbindung (Firmware-Rueckrufe) -------------------------------------------------------

/** Einmal je Sekunde aus evaluate. an = Einstellung „Rohdaten ans Handy". */
Funk.prototype.takt = function (an, handler) {
  if (!an) return;
  if (this.zustand === 0) {
    this.zustand = 1;
    this.verbindung = appConn.connect(enabledZappId, handler,
      [7].concat(funkUuid(0x4b)), [6].concat(funkUuid(0x4b)));
  } else if (this.zustand === 2) {
    this.zustand = 9;
    appConn.regUuid(this.verbindung, 1, funkUuid(0x4b), funkUuid(0x4c));
  } else if (this.zustand === 3) {
    this.zustand = 9;
    appConn.regUuid(this.verbindung, 0, funkUuid(0x4b), funkUuid(0x4d));
  } else if (this.zustand === 4) {
    this.zustand = 9;
    appConn.enaCharNotf(this.verbindung, 0);
  } else if (this.zustand === 5) {
    if (this.inFlug && ++this.flugS > FUNK_TIMEOUT_S) { this.inFlug = 0; this.zurueck(); }
    if (!this.inFlug) this.senden();
  }
};

/** Ereignis-Rueckruf der Firmware (characteristicId, eventId, data). */
Funk.prototype.ereignisBle = function (ch, e, d) {
  if (e === 100) {                 // verbunden (auch nach automatischem Wiederverbinden)
    this.zustand = this.registriert ? 4 : 2;
  } else if (e === 107) {          // UUID registriert
    if (ch === 1) this.zustand = 3; else { this.registriert = 1; this.zustand = 4; }
  } else if (e === 109) {          // Notify an -> los, mit Hallo und ab der letzten Quittung
    this.zustand = 5; this.inFlug = 0; this.halloFaellig = 1; this.zurueck(); this.senden();
  } else if (e === 101 || e === 112 || e === 108 || e === 110) {
    this.zustand = e === 101 ? 8 : 0;   // 101: Firmware verbindet selbst neu; sonst neu anfangen
    this.inFlug = 0; this.handy = 0;
  } else if (e === 104) {
    this.inFlug = 0; this.fehler = 0; this.senden();
  } else if (e === 105) {
    this.inFlug = 0; this.zurueck();
    if (++this.fehler < 50) this.senden();
  } else if (e === 106) {
    this.empfang(d);
  }
};

/** Ungesicherte Pakete nochmal: ab Quittung+1 (ein Teilblock beginnt von vorn). */
Funk.prototype.zurueck = function () {
  this.blockS = this.blockQ + 1; this.teil = 0;
  this.sekS = this.sekQ + 1;
  this.halloFaellig = 1;
};

Funk.prototype.senden = function () {
  if (this.zustand !== 5 || this.inFlug) return;
  var p = this.naechstes();
  if (!p) return;
  this.inFlug = 1; this.flugS = 0; this.pakete++;
  appConn.writeChar(this.verbindung, 1, p);
};

/** Verlorene Rohdaten in Sekunden (Ring uebergelaufen). */
Funk.prototype.verlorenS = function () { return Math.round(this.verloren * 25 / this.hz); };

/** STATUS-Flags vom Handy: bit0 Konto, bit1 Server erreichbar, bit2 laedt hoch, bit3 Handy nimmt selbst auf. */
Funk.prototype.handyNimmtAuf = function () { return this.zustand === 5 && (this.handy & 8) !== 0; };
Funk.prototype.handyOffline = function () { return this.zustand === 5 && (this.handy & 1) !== 0 && (this.handy & 2) === 0; };

/** Rueckstand in Sekunden (fuer die Anzeige): unquittierte Accel-Bloecke. */
Funk.prototype.rueckstandS = function () {
  return Math.round((this.block - 1 - this.blockQ) * 25 / this.hz);
};

// ---- quelle/uhr.js ----
var STD_HASH = 2159656918;   // server/app/data/standard_layouts.json, s. bau.mjs standard()
/*
 * Pumpfoil fuer Suunto (SuuntoPlus-Sport-App) — Ablauf, Datenseiten, Log-Kanaele, Funk zum Handy.
 * Bau: watch-suunto/bau.mjs setzt main.js aus lauf.js (watch-huawei/common), Teilen von seiten.js,
 * pumpe.js, funk.js und dieser Datei zusammen. Plan und offene Fragen: docs/SUUNTO.md.
 *
 * Firmware-Regeln (SuuntoPlus-Referenz): globale `function`-Deklarationen sind fuer die Firmware
 * reserviert — eigene Funktionen nur als `var f = function`. Die Rueckrufe unten (onLoad, evaluate, …)
 * sind genau die, die die Firmware erwartet. Kein Date, ES5.
 */
var APP_VER = 100;                 // 1.00 (manifest "version" hoechstens 4 Zeichen)
var SLOTS_ACC = 80, SLOTS_GPS = 150;

var st, kf, aw, al, pu, fu;        // Stand, Konfig, Auswahl, Alarm, Pumpe, Funk
var laeuft, pause, seite, zeigeSeite, letzteAccZeit, versatz, versatzNeu, tAkt, utcStart;
var einheit, faktor, sync, hz, sprache, lauefe, pumpsLauf, pumpsGesamt, bestLaufMs, foilAlt;
var sekPumps, sekSum, sekSumQ, sekN, sekPeak, blockWerte, blockT, halbe, startSeite;
var tx, positionGemeldet, zuletzt, pumpHist, pumpNr, kfRoh = null, anz;

/**
 * Pump-Marker fuer die Log-Kanaele (Jans Idee, 17.10.2026): je Pump „laufende Nummer + Versatz".
 * Der Wert 1234.37 heisst: Pump Nr. 1234 lag 1,37 s vor diesem Datenpunkt — die Uhr erkennt einen
 * Pump erst bis zu ~1 s spaeter (Periode + Filter), darum ist jeder Marker um genau 1 s verzoegert
 * und der Bruchteil liegt immer in [0, 1). Die Nummer aendert sich bei jedem Pump, damit speichert
 * die Uhr den Wert sicher (sie loggt nur Aenderungen) und der Server sieht fehlende Nummern.
 * pf_p1 = neuester Pump der Sekunde, pf_p2 = der davor (bis 2 Hz); ein dritter faellt weg, seine
 * Nummer fehlt dann. Zeitpunkt = echtes Signal-Maximum, auf Jans Laeufen median 0,04 s am Server.
 */
var pumpMarker = function (output) {
  var jetzt = pu.schrittNr / 10, neu = [];
  while (pu.zeiten.length && pu.zeiten[0] <= jetzt - 1) neu.push(pu.zeiten.shift());
  if (!neu.length) return;
  var wert = function (nr, t) { return nr + Math.min(0.999, Math.max(0, Math.round((jetzt - t - 1) * 1000) / 1000)); };
  pumpNr += neu.length;
  output.pf_p1 = wert(pumpNr, neu[neu.length - 1]);
  if (neu.length >= 2) output.pf_p2 = wert(pumpNr - 1, neu[neu.length - 2]);
};

var summeLetzte = function (n) {
  var z = 0, i;
  for (i = Math.max(0, pumpHist.length - n); i < pumpHist.length; i++) z += pumpHist[i];
  return z;
};

// --- Hilfen -------------------------------------------------------------------------------
var zahl = function (v, ersatz) { return typeof v === "number" && v === v ? v : ersatz; };
var einstellung = function (k, ersatz) {
  var v = null;
  try { v = localStorage.getItem(k); } catch (e) { v = null; }
  return v === null || v === undefined || v === "" ? ersatz : v;
};
var wahr = function (v) { return v === true || v === "true" || v === "1" || v === 1; };

// Texte: Feld-Beschriftungen aus derselben Tabelle wie Amazfit (watch-zepp), in ext1.js, damit sie
// nur beim Sprachwechsel Speicher belegen.
var t = function (k) { return (tx && tx[k]) || k; };
var textLaden = function () {
  tx = undefined;
  tx = evalFile("{file_path}/ext1.js")(sprache);
};

// Uhrzeit ohne Date: Feld 12 braucht nur getHours/getMinutes
var Jetzt = function (lokalS) { this.s = lokalS; };
Jetzt.prototype.getHours = function () { return Math.floor(this.s / 3600) % 24; };
Jetzt.prototype.getMinutes = function () { return Math.floor(this.s / 60) % 60; };

// --- Beschleunigung ----------------------------------------------------------------------
/** Einheit aus dem Betrag im ersten Block: ~9,8 m/s², ~1 g oder ~1000 mg (docs/SUUNTO.md). */
var einheitErkennen = function (a) {
  var s = 0, n = Math.min(a.x.length, a.y.length, a.z.length), i;
  for (i = 0; i < n; i++) s += Math.sqrt(a.x[i] * a.x[i] + a.y[i] * a.y[i] + a.z[i] * a.z[i]);
  var m = n ? s / n : 0;
  if (m > 300) { einheit = 2; faktor = 1 / 1000; }
  else if (m > 4) { einheit = 0; faktor = 1 / 9.80665; }
  else if (m > 0.3) { einheit = 1; faktor = 1; }
  fu.einheit = einheit;
};

/** Ein Beschleunigungs-Aufruf (onAccelerometer ODER evaluate — laut Forum kommen die Werte auf
 *  echten Uhren beim evaluate). Doppelte Lieferung erkennt die Zeit des ersten Werts. */
var nimmAccel = function (input) {
  var a = input ? input.acc : null;
  if (!a || !a.x || !a.x.length) return;
  if (a.time === letzteAccZeit) return;
  letzteAccZeit = a.time;
  if (einheit < 0) einheitErkennen(a);
  if (einheit < 0 || !laeuft || pause) return;
  var n = Math.min(a.x.length, a.y.length, a.z.length), i, x, y, z, b, schritt = 1000 / 50;
  if (versatzNeu) { versatz = a.time - tAkt; versatzNeu = 0; }
  var t0 = a.time - versatz;
  for (i = 0; i < n; i++) {
    x = a.x[i] * faktor; y = a.y[i] * faktor; z = a.z[i] * faktor;
    var p = pu.wert(x, y, z);
    sekPumps += p;
    b = Math.sqrt(x * x + y * y + z * z);
    sekSum += b; sekSumQ += b * b; sekN++;
    if (Math.abs(b - 1) > sekPeak) sekPeak = Math.abs(b - 1);
    if (!sync) continue;
    var ts = t0 + i * schritt;
    if (hz === 25) {                     // 50 -> 25 Hz: Paare mitteln (gegen Aliasing)
      if (!halbe) { halbe = [x, y, z, ts]; continue; }
      x = (x + halbe[0]) / 2; y = (y + halbe[1]) / 2; z = (z + halbe[2]) / 2; ts = halbe[3]; halbe = null;
    }
    if (!blockWerte.length) blockT = Math.max(0, Math.round(ts));
    blockWerte.push(Math.round(x * 2048), Math.round(y * 2048), Math.round(z * 2048));
    if (blockWerte.length >= 75) { fu.accel(blockT, blockWerte); blockWerte = []; }
  }
};

// --- Datenseiten -------------------------------------------------------------------------
var zustandKurz = function () { return pause ? "p" : st.foiling ? "on" : "off"; };

/** Startbildschirm (vor dem Start der Aufnahme) als Zeichenbefehle wie eine Datenseite. */
var startBefehle = function () {
  var gps = zuletzt.rdy >= 100 ? "GPS ✓" : "GPS " + Math.round(zuletzt.rdy) + "%";
  var handy = !sync ? "Handy –" : fu.zustand === 5 ? "Handy ✓" : "Handy …";
  var w = "#ffffff", g = "#d0d0d0";
  return [
    { k: "r", x: 0, y: 0, w: 1000, h: 1000, c: "#000000" },
    { k: "t", x: 500, y: 150, s: groesse(1, 1000), c: "#22d3ee", a: "c", txt: "PUMPFOIL", b: true },
    { k: "t", x: 500, y: 380, s: groesse(6, 1000), c: w, a: "c", txt: gps, b: true },
    { k: "t", x: 500, y: 590, s: groesse(4, 1000), c: w, a: "c", txt: handy, b: true },
    { k: "t", x: 500, y: 760, s: groesse(1, 1000), c: g, a: "c",
      txt: neuereVersion() ? "Update " + kfRoh.latestVersion : "Version " + (APP_VER / 100).toFixed(2), b: false }
  ];
};

/**
 * Datenseiten wie auf den anderen Uhren: seiten.js `zeichne` liefert klassische Seiten und freie Layouts
 * aus dem Profil als Befehle (Promille), quelle/anzeige.js verteilt sie auf Vorlage und canvas.
 */
var anzeigen = function (el, lokalS, output) {
  if (!zeigeSeite) return;
  var befehle;
  if (!laeuft) befehle = startBefehle();
  else {
    var r = ring(kf, zustandKurz()), n = r.length;
    if (seite >= n) seite = 0;
    befehle = zeichne(r[seite], { dw: 1000, dh: 1000, s: st, el: el / 1000, t: t, jetzt: new Jetzt(lokalS), k: kf,
      idx: seite, anzahl: n, pausiert: !!pause, rund: true });
  }
  var z = handyZeile();
  if (z && z !== "Handy ✓" || (!laeuft && fu.handyNimmtAuf())) {
    befehle.push({ k: "t", x: 500, y: 960, s: groesse(0, 1000), c: "#22d3ee", a: "c", txt: z || "Handy nimmt auf!", b: false });
  }
  anz.zeigen(befehle, output);
};

/**
 * Konfiguration vom Handy (aus /api/devices/config, gekuerzt auf das, was die Uhr nutzt — s.
 * SuuntoKonfig in SuuntoProtokoll.kt/.swift). Gespeichert, damit sie auch ohne Handy gilt. Passt sie
 * nicht in den kleinen Speicher (data.json), wird sie ohne die freien Layouts gespeichert — die gelten
 * dann bis zum Neustart der App, danach die klassischen Seiten, bis das Handy sie wieder schickt.
 */
var neuereVersion = function () {
  var v = kfRoh && kfRoh.latestVersion ? parseFloat(kfRoh.latestVersion) : 0;
  return v > 0 && Math.round(v * 100) > APP_VER;
};

/** „std" statt Seiten -> die mitgebrachten Standard-Layouts (ext2.js, im Flash, nicht im Speicher). */
var mitStandard = function (k) {
  var aus = {}, s, std = null, i, schl = ["pages", "offFoilPages", "pausePages"];
  for (s in k) aus[s] = k[s];
  for (i = 0; i < schl.length; i++) {
    if (aus[schl[i]] === "std") {
      if (!std) std = evalFile("{file_path}/ext2.js")();
      aus[schl[i]] = std[schl[i]];
    }
  }
  return aus;
};

var konfigAnwenden = function (text) {
  var k;
  try { k = JSON.parse(text); } catch (e) { return; }
  if (!k || typeof k !== "object") return;
  kf = new Konfig(mitStandard(k)); kfRoh = k;
  // Die Suunto hat keine eigene Einstellungsseite fuer Alarm/Foil: das Profil gilt immer.
  aw.gesetzt = false;
  aw.vorbelegen(kf);
  if (typeof k.spr === "number" && k.spr >= 0 && k.spr <= 14 && k.spr !== sprache) { sprache = k.spr; textLaden(); }
  if (!speichern("konfig", k)) {
    var kurz = {}, s;
    for (s in k) if (s !== "pages" && s !== "offFoilPages" && s !== "pausePages") kurz[s] = k[s];
    speichern("konfig", kurz);
  }
  speichern("auswahl", aw.daten());
};

var speichern = function (key, obj) {
  try { localStorage.setObject(key, obj); return true; } catch (e) { return false; }
};

// Hoehe und Anstieg (Felder 10/13) kennt seiten.js nicht (Wear/Apple zeigen „–"), die Suunto schon.
var feldSeiten = feld;
feld = function (s, id, el, tt, jetzt) {
  if (id === 10) return [zuletzt.alt === null ? "–" : "" + Math.round(zuletzt.alt), "m"];
  if (id === 13) return [zuletzt.asc === null ? "–" : "" + Math.round(zuletzt.asc), "m ↑"];
  return feldSeiten(s, id, el, tt, jetzt);
};

/** Statuszeile unten: Funk, Rueckstand, Verlust, Upload — Fehler nie stumm (Regel 13.09.). */
var handyZeile = function () {
  if (!sync) return "";
  var v = fu.verlorenS(), z;
  if (fu.zustand !== 5) z = "Handy …";
  else if (fu.handyNimmtAuf()) z = "Handy nimmt auf!";
  else if (fu.rueckstandS() > 5) z = "Handy " + fu.rueckstandS() + " s";
  else z = fu.handyOffline() ? "Handy offline" : (fu.handy & 4) && fu.offen ? "Handy ✓ ↑" + fu.offen : "Handy ✓";
  return v > 0 ? z + " · −" + v + " s" : z;
};

// --- Firmware-Rueckrufe ------------------------------------------------------------------
var bleHandler = function (ch, e, d) { fu.ereignisBle(ch, e, d); };

function onLoad(input, output) {
  output.con = 1;                     // „Suche"-Fenster sofort schliessen: die App laeuft auch ohne Handy
  laeuft = 0; pause = 0; seite = 0; zeigeSeite = 0; letzteAccZeit = null; versatz = 0; versatzNeu = 1;
  tAkt = 0; utcStart = 0; einheit = -1; faktor = 1; positionGemeldet = 0; startSeite = 1;
  sync = wahr(einstellung("handy", "true"));
  hz = einstellung("hz", "0") === "1" ? 50 : 25;
  sprache = [3,0,1,2,4,5,6,7,8,9,10,11,12,13,14][+einstellung("sprache", "0") | 0];
  if (typeof sprache !== "number") sprache = 3;
  try { var gk = localStorage.getObject("konfig"); if (gk && typeof gk.spr === "number") sprache = gk.spr; } catch (e) { sprache = sprache; }
  kf = new Konfig(null);
  kfRoh = null;
  try { var k = localStorage.getObject("konfig"); if (k) { kf = new Konfig(mitStandard(k)); kfRoh = k; } } catch (e) { kf = new Konfig(null); }
  aw = new Auswahl(null);
  try { var a = localStorage.getObject("auswahl"); if (a) aw = new Auswahl(a); } catch (e) { aw = new Auswahl(null); }
  aw.vorbelegen(kf);
  st = new Stand(); al = new Alarm(); pu = new Pumpe(50);
  fu = new Funk(SLOTS_ACC, SLOTS_GPS);
  fu.hz = hz; fu.appVer = APP_VER; fu.stdHash = STD_HASH;
  var id = zahl(+einstellung("uhrId", "0"), 0);
  if (!id) {
    id = Math.floor(Math.random() * 4294967295) >>> 0 || 1;
    try { localStorage.setItem("uhrId", "" + id); } catch (e) { id = id; }
  }
  fu.uhrId = id;
  zuletzt = { rdy: 0, alt: null, asc: null };
  lauefe = 0; pumpHist = []; pumpsLauf = 0; pumpsGesamt = 0; bestLaufMs = 0; foilAlt = false;
  sekPumps = 0; sekSum = 0; sekSumQ = 0; sekN = 0; sekPeak = 0; blockWerte = []; blockT = 0; halbe = null;
  textLaden();
  anz = new Anzeige();
  output.pf_foil = 0; output.pf_p1 = 0; output.pf_p2 = 0; output.pf_int = 0; output.pf_peak = 0; pumpNr = 0;
}

function onAccelerometer(input, output) { nimmAccel(input); }

function onExerciseStart(input, output) {
  laeuft = 1; pause = 0; versatzNeu = 1; tAkt = 0;
  st.neu(); al = new Alarm(); pu = new Pumpe(50);
  pumpsLauf = 0; pumpsGesamt = 0; bestLaufMs = 0; foilAlt = false; blockWerte = []; halbe = null; pumpHist = [];
  fu.neu();
  utcStart = zahl(input.utc, 0);
  fu.sitzung = utcStart;
  fu.ereignis(1, 0, 0);
}

function onExercisePause(input, output) {
  if (!laeuft || pause) return;
  pause = 1; seite = 0;
  if (blockWerte.length) { fu.accel(blockT, blockWerte); blockWerte = []; }
  halbe = null;
  fu.ereignis(2, tAkt, Math.round(tAkt / 1000));
}

function onExerciseContinue(input, output) {
  if (!laeuft || !pause) return;
  pause = 0; seite = 0; versatzNeu = 1;
  fu.ereignis(3, tAkt, Math.round(tAkt / 1000));
}

function onExerciseEnd(input, output) {
  if (!laeuft) return;
  if (blockWerte.length) { fu.accel(blockT, blockWerte); blockWerte = []; }
  fu.ereignis(4, tAkt, Math.round(tAkt / 1000));
  laeuft = 0;
  fu.senden();                        // gleich los: nach diesem Rueckruf entlaedt die Firmware die App
}

function onEvent(input, output, id) {
  // Tasten auf der App-Seite: 1 = hoch (vorige Seite), 2 = runter (naechste Seite)
  var n = laeuft ? ring(kf, zustandKurz()).length : 1;
  if (id === 1) seite = (seite + n - 1) % n;
  if (id === 2) seite = (seite + 1) % n;
}

function evaluate(input, output) {
  nimmAccel(input);
  if (typeof input.rdy === "number") zuletzt.rdy = input.rdy;
  zuletzt.alt = typeof input.alt === "number" ? input.alt : zuletzt.alt;
  zuletzt.asc = typeof input.asc === "number" ? input.asc : zuletzt.asc;
  var pos = input.pos, fix = !!(pos && (pos.latitude || pos.longitude));
  var lat = fix ? pos.latitude / 1e7 : 0, lon = fix ? pos.longitude / 1e7 : 0;
  if (fix && !positionGemeldet && !laeuft) { positionGemeldet = 1; fu.position = [pos.latitude, pos.longitude]; }
  var lokalS = zahl(input.lt, 0);
  if (laeuft && !pause) {
    tAkt = zahl(input.tmr, tAkt + 1000);
    var hrBpm = Math.round(zahl(input.hr, 0) * 60);
    var sp = zahl(input.sp, -1);
    var vorher = st.runCount;
    var wechsel = st.tick(tAkt, zahl(input.utc, 0) * 1000, fix, lat, lon, sp, hrBpm);
    // Pumps je Lauf wie der Server: der Lauf beginnt 4 s vor der Erkennung und endet 3 s davor
    // (RUN_ENTER_DWELL/RUN_EXIT_DWELL) — also die letzten Sekunden nach- bzw. abziehen.
    pumpHist.push(sekPumps); if (pumpHist.length > 6) pumpHist.shift();
    if (wechsel && st.foiling) pumpsLauf = st.runIstFortsetzung ? pumpsLauf + summeLetzte(RUN_ENTER_DWELL) : summeLetzte(RUN_ENTER_DWELL);
    else if (st.foiling) pumpsLauf += sekPumps;
    if (wechsel) {
      seite = 0;
      if (st.foiling) playIndication("Confirm");
      else {
        playIndication("Info");
        pumpsLauf = Math.max(0, pumpsLauf - summeLetzte(RUN_EXIT_DWELL - 1));
        if (st.runCount > vorher) pumpsGesamt += pumpsLauf;
        if (st.lastRunDurMs > bestLaufMs && st.runCount > 0) bestLaufMs = st.lastRunDurMs;
      }
    }
    var muster = al.pruefe(kf, aw, st.sp3 * 3.6, hrBpm, st, tAkt / 1000, zahl(input.utc, 0) * 1000);
    for (var i = 0; i < muster.length; i++) playIndication(muster[i] === "long2" || muster[i] === "lsl" ? "StopTimer" : "Interval");
    var sek = Math.round(tAkt / 1000);
    if (sync) fu.gpsSek(sek, fix ? pos.latitude : 0, fix ? pos.longitude : 0, sp, hrBpm, -1, zuletzt.alt);
    // Log-Kanaele (einmal je Sekunde ins Workout, docs/SUUNTO.md)
    output.pf_foil = st.foiling ? st.runCount + 1 : 0;
    pumpMarker(output);
    var m = sekN ? sekSum / sekN : 0;
    output.pf_int = sekN ? Math.round(1000 * Math.sqrt(Math.max(0, sekSumQ / sekN - m * m))) : 0;
    output.pf_peak = Math.round(1000 * sekPeak);
    sekPumps = 0; sekSum = 0; sekSumQ = 0; sekN = 0; sekPeak = 0;
  }
  fu.takt(sync, bleHandler);
  if (fu.konfigNeu) { fu.konfigNeu = 0; konfigAnwenden(fu.konfig); fu.konfig = null; }
  anzeigen(tAkt, lokalS, output);
}

function getUserInterface(input, output) {
  zeigeSeite = 1;
  anz = new Anzeige();          // Vorlage frisch geladen: alles neu setzen
  return { template: "d" };
}

function getSummaryOutputs(input, output) {
  zeigeSeite = 0;
  return [
    { id: "l", name: t("f.runs"), format: "Count_Threedigits", value: st.runCount },
    { id: "p", name: "Pumps", format: "Count_Fivedigits", value: pumpsGesamt },
    { id: "b", name: t("f.lastRunTime"), format: "Duration_Fourdigits", value: Math.round(Math.max(bestLaufMs, st.lastRunDurMs) / 1000) }
  ];
}
