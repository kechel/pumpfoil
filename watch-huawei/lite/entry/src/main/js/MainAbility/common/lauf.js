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
}
function gueltigeZonen(z) {
  if (!z || z.length !== 6) return null;
  for (var i = 0; i < 6; i++) if (typeof z[i] !== "number") return null;
  return z;
}

/**
 * Was der Nutzer AUF DER UHR waehlt (Einstellungsseite wie Zepp-Seite 4/4): Alarm an/aus, Grenzen vom
 * Foil oder fest, welches Foil, eigene Layouts und Touch-Sperre (null = wie das Profil). Vorbelegt aus
 * der Konfiguration (einmal, wie Zepp _foilInit), danach entscheidet die Uhr; wird gespeichert.
 */
function Auswahl(d) {
  d = d || {};
  this.gesetzt = d.gesetzt === true;
  this.alarm = d.alarm === true;
  this.quelle = d.quelle === "manual" ? "manual" : "foil";
  this.foilId = typeof d.foilId === "number" ? d.foilId : null;
  this.layouts = typeof d.layouts === "boolean" ? d.layouts : null;
  this.sperre = typeof d.sperre === "boolean" ? d.sperre : null;
  this.start = typeof d.start === "boolean" ? d.start : null;   // Auto-Start: null = wie im Profil
}
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
function dreistufig(v) { return v === null ? true : v === true ? false : null; }
Auswahl.prototype.daten = function () {
  return { gesetzt: this.gesetzt, alarm: this.alarm, quelle: this.quelle, foilId: this.foilId,
    layouts: this.layouts, sperre: this.sperre, start: this.start };
};

/**
 * Vibrationsalarm wie Zepp (_checkAlarm, _checkHrAlarm, _checkMarks): Tempo ueber/unter den Grenzen
 * (Foil oder fest; „unter" nur bis 2 km/h darunter, sonst brummt es beim Paddeln), Puls ueber der
 * Grenze, Strecken-/Zeitmarken im Lauf. Liefert die Muster, die jetzt vibrieren sollen.
 */
function Alarm() { this.aktiv = false; this.hrAktiv = false; this.letzt = 0; this.lauf = -1; this.distN = 0; this.zeitN = 0; }
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

export default { Stand: Stand, Konfig: Konfig, maxKandidat: maxKandidat, Auswahl: Auswahl, Alarm: Alarm,
  dreistufig: dreistufig };
