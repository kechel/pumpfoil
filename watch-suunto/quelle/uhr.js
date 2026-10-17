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
var sekPumps, sekX, sekY, sekZ, sekXX, sekYY, sekZZ, sekN, sekPeak, sekStaerke, blockWerte, blockT, halbe, startSeite;
var tx, positionGemeldet, zuletzt, pumpHist, pumpNr, kfRoh = null, anz;

/*
 * Log-Kanaele (docs/SUUNTO.md „Die Log-Kanaele"): hoechstens 5, je eine float32-Zahl pro Sekunde, gespeichert
 * nur bei Aenderung. Darum mehrere Werte je Kanal als Dezimalstellen, immer <= 999.999 (exakt in float32,
 * passt in Count_Sixdigits). Der NAME traegt die Version: aendert sich die Bedeutung, bekommt der Kanal einen
 * neuen Namen (pf_e1 -> pf_e2) — der Server liest, was eine Uhr schickt, aeltere Uhren stoeren nicht.
 *
 * pf_e1 = L Z AA BB  (Jans Idee, 17.10.2026)
 *   L  Lauf: 0 zwischen den Laeufen, sonst (Laufnummer mod 9) + 1 — auch direkt aufeinanderfolgende
 *      Laeufe bleiben unterscheidbar
 *   Z  Zahl aller Pumps mod 10 — aendert sich bei jedem Pump, sonst wuerden zwei Sekunden mit gleichem
 *      Versatz als „keine Aenderung" nicht geloggt; der Server sieht daran auch verlorene Pumps
 *   AA neuester Pump dieser Sekunde, BB der davor: 01–99 = 0,01–0,99 s vor dem Datenpunkt, 00 = keiner.
 *      Die Uhr erkennt einen Pump erst bis ~1 s spaeter, darum ist jeder Marker um genau 1 s verzoegert
 *      (Pump-Zeit = Datenpunkt − 1 s − Versatz). Zeitpunkt = echtes Signal-Maximum (median 0,04 s am Server).
 */
var pumpMarker = function () {
  var jetzt = pu.schrittNr / 10, neu = [], i;
  while (pu.zeiten.length && pu.zeiten[0] <= jetzt - 1) {
    neu.push(pu.zeiten.shift());
    var st1 = pu.staerken.shift();
    if (st1 > sekStaerke) sekStaerke = st1;
  }
  var vers = function (t) { return Math.min(99, Math.max(1, Math.round((jetzt - t - 1) * 100))); };
  pumpNr += neu.length;
  i = neu.length;
  return (pumpNr % 10) * 10000 + (i ? vers(neu[i - 1]) * 100 : 0) + (i >= 2 ? vers(neu[i - 2]) : 0);
};

/** pf_b1 = XX YY ZZ: Bewegungsstaerke je Achse der Uhr (Streuung in der Sekunde), je 2·√mg (mg = W²/4):
 *  10 = 25 mg, 20 = 100 mg, 99 = 2,45 g — ruhiges Gleiten und kraeftiges Pumpen in einem Kanal, ~10 % genau. */
var kanalB = function () {
  var c = function (s, q) { var m = s / sekN; return Math.min(99, Math.round(2 * Math.sqrt(1000 * Math.sqrt(Math.max(0, q / sekN - m * m))))); };
  return c(sekX, sekXX) * 10000 + c(sekY, sekYY) * 100 + c(sekZ, sekZZ);
};

/** pf_l1 = NNN RRR: Armhaltung aus der mittleren Schwerkraft der Sekunde — Neigung + 90 (0–180°),
 *  Drehung um die Laengsachse (0–359°). Achsen wie die Uhr sie liefert (am Server deuten). */
var kanalL = function () {
  var x = sekX / sekN, y = sekY / sekN, z = sekZ / sekN, g = 180 / Math.PI;
  var n = Math.round(Math.atan2(-x, Math.sqrt(y * y + z * z)) * g) + 90, r = Math.round(Math.atan2(y, z) * g);
  return Math.min(180, Math.max(0, n)) * 1000 + ((r % 360) + 360) % 360;
};

// Debug-Fassung (app-debug/, bau.mjs setzt DEBUG = 1): Ablauf ins Systemlog des Editors/der Uhr.
var DEBUG = 0;
var dbgLetzt = "";
var dbg = function (m) { if (DEBUG) { dbgLetzt = m; systemEvent("pf: " + m); } };

var sekNull = function () { sekPumps = 0; sekX = 0; sekY = 0; sekZ = 0; sekXX = 0; sekYY = 0; sekZZ = 0; sekN = 0; sekPeak = 0; sekStaerke = 0; };

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
var t = function (k, d) { return (tx && tx[k]) || d || k; };
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
    sekX += x; sekY += y; sekZ += z; sekXX += x * x; sekYY += y * y; sekZZ += z * z; sekN++;
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

/** Startbildschirm als Zeichenbefehle — erscheint nur, falls die Firmware die App-Seite doch vor dem Start zeigt
 *  (laut Referenz nicht; im Simulator nicht, 17.10.). Update-Hinweis deshalb auch in anzeigen(). */
var startBefehle = function () {
  var gps = zuletzt.rdy >= 100 ? "GPS ✓" : "GPS " + Math.round(zuletzt.rdy) + "%";
  var handy = t("h.phone", "Phone") + (!sync ? " –" : fu.zustand === 5 ? " ✓" : " …");
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
  var z = handyZeile(), handyOk = z === t("h.phone", "Phone") + " ✓";
  // Den Startbildschirm sieht man auf Suunto nie: der App-Bildschirm kommt erst nach dem Start
  // (Referenz, Ablauf: onExerciseStart -> getUserInterface). Darum der Update-Hinweis hier, 15 s lang.
  if (laeuft && tAkt < 15000 && neuereVersion() && (!z || handyOk)) { z = "Update " + kfRoh.latestVersion; handyOk = false; }
  if (z && !handyOk || (!laeuft && fu.handyNimmtAuf())) {
    // oben statt unten: unten sitzen die Seitenpunkte (94 %), und der runde Rand schneidet ab (Simulator 17.10.)
    befehle.push({ k: "t", x: 500, y: DEBUG ? 135 : 75, s: groesse(0, 1000), c: "#22d3ee", a: "c", txt: z || t("h.phone", "Phone") + " REC!", b: false });
  }
  if (DEBUG) {   // Zustand direkt auf dem Display: lauf/pause/foil, Seite, letztes Ereignis
    befehle.push({ k: "t", x: 500, y: 75, s: groesse(0, 1000), c: "#ffcc00", a: "c", b: false,
      txt: "L" + laeuft + " P" + pause + " F" + (st.foiling ? 1 : 0) + " S" + seite + " " + dbgLetzt });
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
  try { k = kompaktLesen(text); } catch (e) { return; }
  if (!k || typeof k !== "object") return;
  kf = new Konfig(mitStandard(k)); kfRoh = k;
  // Die Suunto hat keine eigene Einstellungsseite fuer Alarm/Foil: das Profil gilt immer.
  aw.gesetzt = false;
  aw.vorbelegen(kf);
  if (typeof k.spr === "number" && k.spr >= 0 && k.spr <= 14 && k.spr !== sprache) { sprache = k.spr; textLaden(); }
  kompaktSpeichern(text);     // gekuerzt, wenn der Speicher nicht reicht (quelle/kompakt.js)
};

/** Gespeicherte Konfiguration (kompakter Text) oder null. */
var konfigGespeichert = function () {
  var t = null;
  try { t = localStorage.getItem(KOMPAKT_KEY); } catch (e) { t = null; }
  if (!t) return null;
  try { return kompaktLesen(t); } catch (e2) { return null; }
};

// Hoehe und Anstieg (Felder 10/13) kennt seiten.js nicht (Wear/Apple zeigen „–"), die Suunto schon.
var feldSeiten = feld;
feld = function (s, id, el, tt, jetzt) {
  if (id === 10) return [zuletzt.alt === null ? "–" : "" + Math.round(zuletzt.alt), "m"];
  if (id === 13) return [zuletzt.asc === null ? "–" : "" + Math.round(zuletzt.asc), "m ↑"];
  return feldSeiten(s, id, el, tt, jetzt);
};

/**
 * Stille Runde (Suunto-Lap-Typ 23: keine Rundenanzeige, keine Vibration) an Anfang und Ende jedes Laufs:
 * die Suunto-App zeigt Laeufe und Pausen dazwischen als Runden, die FIT-Datei hat die Laufgrenzen —
 * ohne einen der 5 Log-Kanaele. Grenzen liegen um die Erkennungs-Verzoegerung spaeter (Start ~4 s,
 * Ende ~3 s; der Server rechnet sie aus pf_e1 (Stelle L) zurueck). Nur, wo die Uhr Typ 23 kennt (Compile-Token).
 */
var STILLE_RUNDE = "{{ HAS_SILENT_LAP }}" === "1";
var runde = function () { dbg("Runde, Lauf " + (st.foiling ? "an" : "aus")); if (STILLE_RUNDE) $.put("/Activity/Trigger", 23); };

/** Statuszeile unten: Funk, Rueckstand, Verlust, Upload — Fehler nie stumm (Regel 13.09.). */
var handyZeile = function () {
  if (!sync) return "";
  var v = fu.verlorenS(), z;
  var h = t("h.phone", "Phone");
  if (fu.zustand !== 5) z = h + " …";
  else if (fu.handyNimmtAuf()) z = h + " REC!";       // das Handy nimmt selbst auf -> doppelt
  else if (fu.rueckstandS() > 5) z = h + " " + fu.rueckstandS() + " s";
  else z = fu.handyOffline() ? h + " offline" : (fu.handy & 4) && fu.offen ? h + " ✓ ↑" + fu.offen : h + " ✓";
  return v > 0 ? z + " · −" + v + " s" : z;
};

// --- Firmware-Rueckrufe ------------------------------------------------------------------
var bleHandler = function (ch, e, d) { fu.ereignisBle(ch, e, d); };

function onLoad(input, output) {
  dbg("onLoad");
  output.con = 1;                     // „Suche"-Fenster sofort schliessen: die App laeuft auch ohne Handy
  laeuft = 0; pause = 0; seite = 0; zeigeSeite = 0; letzteAccZeit = null; versatz = 0; versatzNeu = 1;
  tAkt = 0; utcStart = 0; einheit = -1; faktor = 1; positionGemeldet = 0; startSeite = 1;
  sync = wahr(einstellung("handy", "true"));
  hz = einstellung("hz", "0") === "1" ? 50 : 25;
  sprache = einstellung("sprache", "en");
  var gk = konfigGespeichert();
  if (gk && typeof gk.spr === "number") sprache = gk.spr;
  kf = new Konfig(null);
  kfRoh = null;
  if (gk) { kf = new Konfig(mitStandard(gk)); kfRoh = gk; }
  aw = new Auswahl(null);      // ohne Einstellungsseite auf der Uhr: immer aus dem Profil, nicht gespeichert
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
  sekNull(); blockWerte = []; blockT = 0; halbe = null;
  textLaden();
  anz = new Anzeige();
  output.pf_e1 = 0; output.pf_b1 = 0; output.pf_s1 = 0; output.pf_l1 = 0; pumpNr = 0;
}

function onAccelerometer(input, output) { nimmAccel(input); }

function onExerciseStart(input, output) {
  dbg("onExerciseStart");
  laeuft = 1; pause = 0; versatzNeu = 1; tAkt = 0;
  st.neu(); al = new Alarm(); pu = new Pumpe(50);
  pumpsLauf = 0; pumpsGesamt = 0; bestLaufMs = 0; foilAlt = false; blockWerte = []; halbe = null; pumpHist = [];
  fu.neu();
  utcStart = zahl(input.utc, 0);
  fu.sitzung = utcStart;
  fu.ereignis(1, 0, 0);
}

function onExercisePause(input, output) {
  dbg("onExercisePause");
  if (!laeuft || pause) return;
  pause = 1; seite = 0;
  if (blockWerte.length) { fu.accel(blockT, blockWerte); blockWerte = []; }
  halbe = null;
  fu.ereignis(2, tAkt, Math.round(tAkt / 1000));
}

function onExerciseContinue(input, output) {
  dbg("onExerciseContinue");
  if (!laeuft || !pause) return;
  pause = 0; seite = 0; versatzNeu = 1;
  fu.ereignis(3, tAkt, Math.round(tAkt / 1000));
}

function onExerciseEnd(input, output) {
  dbg("onExerciseEnd");
  if (!laeuft) return;
  if (blockWerte.length) { fu.accel(blockT, blockWerte); blockWerte = []; }
  fu.ereignis(4, tAkt, Math.round(tAkt / 1000));
  laeuft = 0;
  fu.senden();                        // gleich los: nach diesem Rueckruf entlaedt die Firmware die App
}

function onEvent(input, output, id) {
  // Untere Taste (2) = naechste Seite, im Kreis. 1 (vorige) belegt die Vorlage nicht: die obere Taste
  // ist auf Suunto Start/Pause/Stopp und muss der Firmware bleiben.
  var n = laeuft ? ring(kf, zustandKurz()).length : 1;
  if (id === 1) seite = (seite + n - 1) % n;
  if (id === 2) seite = (seite + 1) % n;
  dbg("onEvent " + id + " -> Seite " + seite + "/" + n);
}

function onLap(input, output) { dbg("onLap"); }

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
      runde();
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
    output.pf_e1 = (st.foiling ? st.runCount % 9 + 1 : 0) * 100000 + pumpMarker();
    if (sekN) {
      output.pf_b1 = kanalB();
      output.pf_l1 = kanalL();
      // pf_s1 = PPP SSS: staerkster Ausschlag |a|−1 g (10 mg) und staerkster Pump der Sekunde (mg)
      output.pf_s1 = Math.min(999, Math.round(100 * sekPeak)) * 1000 + Math.min(999, Math.round(1000 * sekStaerke));
    }
    sekNull();
  }
  fu.takt(sync, bleHandler);
  if (fu.konfigNeu) { fu.konfigNeu = 0; konfigAnwenden(fu.konfig); fu.konfig = null; }
  anzeigen(tAkt, lokalS, output);
}

function getUserInterface(input, output) {
  dbg("getUserInterface");
  zeigeSeite = 1;
  anz = new Anzeige();          // Vorlage frisch geladen: alles neu setzen
  return { template: "d" };
}

function getSummaryOutputs(input, output) {
  dbg("getSummaryOutputs");
  zeigeSeite = 0;
  return [
    { id: "l", name: t("f.runs"), format: "Count_Threedigits", value: st.runCount },
    { id: "p", name: "Pumps", format: "Count_Fivedigits", value: pumpsGesamt },
    { id: "b", name: t("f.lastRunTime"), format: "Duration_Fourdigits", value: Math.round(Math.max(bestLaufMs, st.lastRunDurMs) / 1000) }
  ];
}
