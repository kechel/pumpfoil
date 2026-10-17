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
var tx, positionGemeldet, zuletzt, pumpHist;

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

var anzeigen = function (el, lokalS) {
  if (!zeigeSeite) return;
  if (!laeuft) {
    setText("#t", "PUMPFOIL");
    setText("#v1", zuletzt.rdy >= 100 ? "GPS ✓" : "GPS " + Math.round(zuletzt.rdy) + "%");
    setText("#l1", "");
    setText("#v2", sync ? (fu.zustand === 5 ? "✓" : "…") : "–"); setText("#l2", "Handy");
    setText("#v3", "" + (APP_VER / 100).toFixed(2)); setText("#l3", "Version");
    setText("#s", "");
    return;
  }
  var r = ring(kf, zustandKurz()), n = r.length;
  if (seite >= n) seite = 0;
  var s = r[seite], jetzt = new Jetzt(lokalS), i, f;
  if (s[0] !== 0) s = [0, 1, 20, 14];   // freie Layouts: erst auf echter Uhr (docs/SUUNTO.md)
  for (i = 1; i <= 3; i++) {
    f = s[i] ? feld(st, s[i], el / 1000, t, jetzt) : ["", ""];
    if (s[i] === 10) f = [zuletzt.alt === null ? "–" : "" + Math.round(zuletzt.alt), "m"];
    if (s[i] === 13) f = [zuletzt.asc === null ? "–" : "" + Math.round(zuletzt.asc), "m ↑"];
    setText("#v" + i, f[0]); setText("#l" + i, f[1]);
  }
  setText("#t", pause ? t("rec.paused") : st.foiling ? t("f.runActive") + " " + (st.runCount + 1)
    : (n > 1 ? (seite + 1) + "/" + n : ""));
  var h = !sync ? "" : fu.zustand !== 5 ? "Handy …" : fu.rueckstandS() > 5 ? "Handy " + fu.rueckstandS() + " s" : "Handy ✓";
  setText("#s", h);
};

// --- Firmware-Rueckrufe ------------------------------------------------------------------
var bleHandler = function (ch, e, d) { fu.ereignisBle(ch, e, d); };

function onLoad(input, output) {
  output.con = 1;                     // „Suche"-Fenster sofort schliessen: die App laeuft auch ohne Handy
  laeuft = 0; pause = 0; seite = 0; zeigeSeite = 0; letzteAccZeit = null; versatz = 0; versatzNeu = 1;
  tAkt = 0; utcStart = 0; einheit = -1; faktor = 1; positionGemeldet = 0; startSeite = 1;
  sync = wahr(einstellung("handy", "true"));
  hz = einstellung("hz", "0") === "1" ? 50 : 25;
  sprache = einstellung("sprache", "en");
  kf = new Konfig(null);
  try { var k = localStorage.getObject("konfig"); if (k) kf = new Konfig(k); } catch (e) { kf = new Konfig(null); }
  aw = new Auswahl(null);
  try { var a = localStorage.getObject("auswahl"); if (a) aw = new Auswahl(a); } catch (e) { aw = new Auswahl(null); }
  aw.vorbelegen(kf);
  st = new Stand(); al = new Alarm(); pu = new Pumpe(50);
  fu = new Funk(SLOTS_ACC, SLOTS_GPS);
  fu.hz = hz; fu.appVer = APP_VER;
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
  output.pf_foil = 0; output.pf_pumps = 0; output.pf_kad = 0; output.pf_int = 0; output.pf_peak = 0;
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
    output.pf_pumps = sekPumps;
    output.pf_kad = pu.kadenz();
    var m = sekN ? sekSum / sekN : 0;
    output.pf_int = sekN ? Math.round(1000 * Math.sqrt(Math.max(0, sekSumQ / sekN - m * m))) : 0;
    output.pf_peak = Math.round(1000 * sekPeak);
    sekPumps = 0; sekSum = 0; sekSumQ = 0; sekN = 0; sekPeak = 0;
  }
  output.pumps = pumpsLauf; output.laeufe = st.runCount;
  fu.takt(sync, bleHandler);
  anzeigen(tAkt, lokalS);
}

function getUserInterface(input, output) {
  zeigeSeite = 1;
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
