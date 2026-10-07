/*
 * Geraete-Schicht des Huawei-Recorders: Sensoren, GPS, Dateien, Wear Engine. Fuer beide
 * SDK-Linien gleich — Lite Wearable (GT) und Wearable (Watch 3/4) kennen dieselben
 * @system-Module. Die Logik selbst steckt in kern.js (in Node getestet); hier wird nur
 * verdrahtet. Was eine Seite anzeigen soll, steht in `R.zustand()`.
 *
 * Bekannte Fallen (docs/HUAWEI.md) und was hier dagegen getan wird:
 *  - Wear Engine meldet 206 u. a., wenn die App nicht im Vordergrund ist oder das Handy fehlt
 *    -> Warteschlange mit steigender Wartezeit, Fehler gezaehlt und angezeigt.
 *  - iOS-SDK nimmt nur Nachrichten (<= 1 KB), keine Dateien -> alles in Teilen (kern.teile).
 *  - P2P gleich auf der ersten Seite starten friert die Uhr ein -> erst beim ersten Senden,
 *    fruehestens 3 s nach dem Start.
 *  - 64 KB Heap -> keine Dateiliste, nur der Sendeplan; Bloecke klein; nichts Grosses im Speicher.
 *  - Wird die App mitten in der Aufnahme beendet (Akku, System), ist sie beim naechsten Start
 *    nicht verloren: `laufend.json` sagt, welche Session offen war, und sie wird abgeschlossen.
 */
import sensor from "@system.sensor";
import geolocation from "@system.geolocation";
import file from "@system.file";
import brightness from "@system.brightness";
import device from "@system.device";
import K from "./kern.js";
import S from "./seiten.js";
import C from "./konfig.js";
import { P2pClient, Message, Builder } from "../wearengine/wearengine.js";

var PLAN = "internal://app/plan.json";
var GEGEN = "internal://app/gegenstelle.json";
var LAUF = "internal://app/laufend.json";
var KONFIG = "internal://app/konfig.json";
var HALLO_ALLE_MS = 30 * 60 * 1000;   // Seiten-Konfiguration halbstuendlich neu anfragen

var R = {
  modus: "bereit",            // bereit | laeuft | pause
  id: "",
  achse: null, sammler: null, anzeige: null,
  plan: new K.Sendeplan(),
  gegen: new K.Gegenstelle(C.GEGENSTELLEN, 0),
  schlange: new K.Warteschlange(),
  p2p: null, startWand: 0, modell: "HUAWEI",
  // Diagnose — geht im /complete mit und steht auf der Uhr, nie nur im Log.
  f: { speicher: 0, accel: 0, gps: 0, puls: 0 },
  letzterFehler: "",
  accelLetzt: 0, maxLuecke: 0, gpsLetzt: 0,
  // Datenseiten (seiten.js): Lauf-Stand, Seiten-Konfiguration vom Handy, frischer GPS-Punkt
  stand: new S.Stand(), konfig: new S.Konfig(null), fixNeu: null,
  kTeile: null, halloOffen: false, halloZuletzt: 0
};

function iso(ms) { return new Date(ms).toISOString(); }
function fehler(art, text) { R.f[art]++; R.letzterFehler = text; console.error("Pumpfoil " + text); }

function schreibe(uri, obj, danach) {
  file.writeText({
    uri: uri, text: JSON.stringify(obj),
    success: function () { if (danach) danach(); },
    fail: function (d, code) { fehler("speicher", "Speicher " + code + " " + uri); }
  });
}
function planSichern() { schreibe(PLAN, R.plan.daten()); }
function laufSichern() {
  if (R.modus === "bereit") return;
  schreibe(LAUF, { id: R.id, n: R.sammler.index, start: R.startWand, zuletzt: Date.now(),
    pausen: R.achse.pausen, hr: R.sammler.hrAnzahl });
}

// Jeder vergebene Index zaehlt im Plan — auch wenn das Schreiben scheitert. Sonst wartete der
// Plan ewig auf eine Datei, die nie kommt; eine fehlende Datei ueberspringt `senden` (gezaehlt).
function chunkSchreiben(c) {
  var id = R.id;
  file.writeText({
    uri: K.dateiChunk(id, c.index), text: JSON.stringify(c),
    success: function () { R.plan.chunk(id); planSichern(); },
    fail: function (d, code) {
      fehler("speicher", "Speicher " + code + " Chunk " + c.index);
      R.plan.chunk(id); planSichern();
    }
  });
}

function sensorenAn() {
  sensor.subscribeAccelerometer({
    interval: "game",
    success: function (r) {
      var jetzt = Date.now();
      if (R.accelLetzt > 0 && jetzt - R.accelLetzt > R.maxLuecke) R.maxLuecke = jetzt - R.accelLetzt;
      R.accelLetzt = jetzt;
      var c = R.sammler.accelWert(r.x, r.y, r.z, R.achse.jetzt(jetzt));
      if (c) { chunkSchreiben(c); laufSichern(); }
    },
    fail: function (d, code) { fehler("accel", "Accel " + code); }
  });
  sensor.subscribeHeartRate({
    success: function (r) { R.sammler.puls(r.heartRate); },
    fail: function (d, code) { fehler("puls", "Puls " + code); }
  });
  geolocation.subscribe({
    coordType: "wgs84",
    success: function (g) {
      var jetzt = Date.now();
      var t = R.achse.auf(g.time, jetzt);
      if (t < 0) t = R.achse.jetzt(jetzt);
      R.gpsLetzt = jetzt;
      R.fixNeu = [g.latitude, g.longitude];
      R.anzeige.fix(g.latitude, g.longitude, g.accuracy, t);
      var c = R.sammler.gpsFix(g.latitude, g.longitude, g.accuracy, t);
      if (c) chunkSchreiben(c);
    },
    fail: function (d, code) { fehler("gps", "GPS " + code); }
  });
}
function sensorenAus() {
  try { sensor.unsubscribeAccelerometer(); } catch (e) { /* war nicht an */ }
  try { sensor.unsubscribeHeartRate(); } catch (e) { /* war nicht an */ }
  try { geolocation.unsubscribe(); } catch (e) { /* war nicht an */ }
}
function bildschirmAn(an) {
  // Verhindert nur den Inaktivitaets-Timeout, nicht Handgelenk senken (Lite-Doku) — aber das
  // ist alles, was eine Lite-App hat; ob die Aufnahme dunkel weiterlaeuft, zeigt die Diagnose.
  brightness.setKeepScreenOn({ keepScreenOn: an });
}

function restSchreiben() {
  var r = R.sammler.rest();
  for (var i = 0; i < r.length; i++) chunkSchreiben(r[i]);
}

R.start = function () {
  if (R.modus !== "bereit") return;
  var jetzt = Date.now();
  R.id = K.neueId(jetzt, Math.random());
  R.startWand = jetzt;
  R.achse = new K.Zeitachse(jetzt);
  R.sammler = new K.Sammler();
  R.anzeige = new K.Anzeige();
  R.maxLuecke = 0; R.accelLetzt = 0;
  R.f = { speicher: 0, accel: 0, gps: 0, puls: 0 }; R.letzterFehler = "";
  R.stand.neu(); R.fixNeu = null;
  R.plan.neu(R.id);
  schreibe(K.dateiMeta(R.id), {
    session_uuid: R.id, started_at: iso(jetzt), sport: "pumpfoil",
    gps_hz: 1, accel_hz: 50, accel_scale: 2048,
    device_model: R.modell, app_version: C.APP_VERSION
  }, planSichern);
  R.modus = "laeuft";
  laufSichern();
  bildschirmAn(true);
  sensorenAn();
};

R.pause = function () {
  if (R.modus !== "laeuft") return;
  sensorenAus();
  restSchreiben();
  R.achse.pause(Date.now());
  R.modus = "pause";
  R.accelLetzt = 0;
  laufSichern();
};

R.weiter = function () {
  if (R.modus !== "pause") return;
  R.achse.weiter(Date.now());
  R.modus = "laeuft";
  laufSichern();
  sensorenAn();
};

function abschliessen(id, n, endeWand, pausen, hr, extra) {
  var e = { ended_at: iso(endeWand), total_chunks: n, hr_samples: hr,
    hr_source: hr > 0 ? "active" : "none", messweg: { gps: "lite", accel: "lite" } };
  if (pausen && pausen.length > 0) e.pauses = pausen;
  if (extra) e.messweg.accel = extra;
  schreibe(K.dateiEnde(id), e, function () {
    R.plan.ende(id); planSichern();
    file.delete({ uri: LAUF });
  });
}

R.stopp = function () {
  if (R.modus === "bereit") return;
  var jetzt = Date.now();
  if (R.modus === "laeuft") { sensorenAus(); restSchreiben(); }
  else R.achse.weiter(jetzt);   // Stopp aus der Pause: die Pause endet hier
  R.modus = "bereit";
  bildschirmAn(false);
  abschliessen(R.id, R.sammler.index, jetzt, R.achse.pausen, R.sammler.hrAnzahl);
};

/** Bild fuer die Seite. */
R.zustand = function () {
  var t = R.achse ? R.achse.jetzt(Date.now()) : 0;
  return {
    modus: R.modus, ms: t,
    kmh: R.anzeige ? R.anzeige.tempo * 3.6 : 0,
    m: R.anzeige ? R.anzeige.strecke : 0,
    puls: R.sammler ? R.sammler.hr : 0,
    gpsOk: R.gpsLetzt > 0 && Date.now() - R.gpsLetzt < 5000,
    offen: R.plan.offen(), plan: R.plan.stand(),
    sendeFehler: R.schlange.fehlerGesamt, sendeCode: R.schlange.letzterCode,
    fehler: R.f.speicher + R.f.accel + R.f.gps, letzterFehler: R.letzterFehler
  };
};

// --- Uebertragung zum Handy -------------------------------------------------------------
//
// Als NACHRICHTEN in Teilen (kern.teile), nicht als Dateien: das iOS-SDK von Wear Engine nimmt
// keine Dateien an, und so ist es fuer Android und iOS derselbe Weg. Eine Datei wird gelesen,
// in Teile < 1 KB zerlegt, Teil fuer Teil geschickt; erst wenn alle quittiert sind, gilt sie
// als erledigt und wird geloescht. Scheitert ein Teil, geht es nach der Wartezeit mit genau
// diesem Teil weiter (das Handy nimmt doppelte Teile ohne Schaden an).

var wache = 0;
var offenDatei = null;    // { d, uri, teile, nr }

function p2p() {
  if (!R.p2p) {
    var g = R.gegen.jetzt();
    R.p2p = new P2pClient();
    R.p2p.setPeerPkgName(g[0]);
    R.p2p.setPeerFingerPrint(g[1]);
    // Rueckweg Handy -> Uhr: die Seiten-Konfiguration (Antwort auf das Hallo), in Teilen wie hin.
    R.p2p.registerReceiver({
      onSuccess: function () {},
      onFailure: function () { fehler("speicher", "Empfang Handy"); },
      onReceiveMessage: function (m) { if (typeof m === "string") konfigTeil(m); }
    });
  }
  return R.p2p;
}

/** Ein Teil `PF1|k_konfig.json|nr|anzahl|rest|inhalt` vom Handy; vollstaendig -> speichern + anwenden. */
function konfigTeil(text) {
  var f = text.split("|");
  if (f.length < 6 || f[0] !== "PF1" || f[1] !== "k_konfig.json") return;
  var nr = parseInt(f[2], 10), n = parseInt(f[3], 10);
  if (!(n >= 1 && n <= 200 && nr >= 0 && nr < n)) return;
  if (!R.kTeile || R.kTeile.length !== n) R.kTeile = new Array(n);
  R.kTeile[nr] = f.slice(5).join("|");
  for (var i = 0; i < n; i++) if (typeof R.kTeile[i] !== "string") return;
  var ganz = R.kTeile.join("");
  R.kTeile = null;
  try { R.konfig = new S.Konfig(JSON.parse(ganz)); } catch (e) { fehler("speicher", "Konfig kaputt"); return; }
  file.writeText({ uri: KONFIG, text: ganz, fail: function (d, code) { fehler("speicher", "Speicher " + code + " Konfig"); } });
}

function senden() {
  if (!R.schlange.darf(Date.now())) return;
  if (offenDatei) { teilSenden(); return; }
  if (Date.now() - R.halloZuletzt > HALLO_ALLE_MS) R.halloOffen = true;
  if (R.halloOffen) {
    // Hallo zuerst: Modell + Version -> das Handy antwortet mit der Seiten-Konfiguration vom Server.
    offenDatei = { hallo: true, teile: K.teile("h_hallo.json",
      JSON.stringify({ device_model: R.modell, app_version: C.APP_VERSION }), 1), nr: 0 };
    teilSenden();
    return;
  }
  var d = R.plan.naechste();
  if (!d) return;
  var uri = K.dateiVon(d);
  R.schlange.start();
  file.readText({
    uri: uri,
    success: function (r) {
      var name = uri.substring(uri.lastIndexOf("/") + 1);
      offenDatei = { d: d, uri: uri, teile: K.teile(name, r.text, R.plan.offen()), nr: 0 };
      R.schlange.laeuft = false;
      teilSenden();
    },
    fail: function () {
      // Datei fehlt (Schreiben scheiterte, App mitten im Schreiben beendet): ueberspringen,
      // gezaehlt — nie ewig darauf warten.
      fehler("speicher", "fehlt " + uri);
      R.plan.erledigt(d); planSichern();
      R.schlange.ok();
    }
  });
}

function teilSenden() {
  var o = offenDatei;
  if (!o || !R.schlange.darf(Date.now())) return;
  var b = new Builder();
  b.setDescription(o.teile[o.nr]);
  var m = new Message();
  m.builder = b;
  R.schlange.start();
  var fertig = false;
  // Kommt nie eine Antwort (Verbindung weg mitten im Senden), haengt die Schlange nicht fest.
  clearTimeout(wache);
  wache = setTimeout(function () { if (!fertig) { fertig = true; fehlschlag(-1); } }, 60000);
  p2p().send(m, {
    onSuccess: function () {},
    onFailure: function () {},
    onSendProgress: function () {},
    onSendResult: function (r) {
      if (fertig) return;
      fertig = true;
      clearTimeout(wache);
      if (r && r.code === 207) {
        R.gegen.ok();
        R.schlange.laeuft = false;
        o.nr++;
        if (o.nr >= o.teile.length) {
          if (o.hallo) { R.halloOffen = false; R.halloZuletzt = Date.now(); }
          else { R.plan.erledigt(o.d); planSichern(); file.delete({ uri: o.uri }); }
          offenDatei = null;
          R.schlange.ok();
        } else {
          teilSenden();   // gleich weiter, solange es laeuft
        }
      } else {
        fehlschlag(r ? r.code : 0);
      }
    }
  });
}

function fehlschlag(code) {
  R.schlange.fehler(code, Date.now());
  if (R.gegen.fehler()) {
    // Andere Handy-App versuchen (Android <-> iOS); gemerkt wird, was zuletzt angenommen hat.
    R.p2p = null;
    schreibe(GEGEN, { i: R.gegen.i });
  }
}

/** Einmal beim App-Start: Modell, Sendeplan laden, abgebrochene Aufnahme abschliessen. */
R.init = function () {
  device.getInfo({
    success: function (i) {
      R.modell = ("HUAWEI " + (i.model || i.product || "")).replace(/\s+$/, "") + " · HarmonyOS";
    }
  });
  file.readText({
    uri: GEGEN,
    success: function (d) {
      try { R.gegen = new K.Gegenstelle(C.GEGENSTELLEN, JSON.parse(d.text).i); } catch (e) { /* Standard */ }
    }
  });
  file.readText({
    uri: KONFIG,
    success: function (d) { try { R.konfig = new S.Konfig(JSON.parse(d.text)); } catch (e) { /* Standard */ } }
  });
  file.readText({
    uri: PLAN,
    success: function (d) { try { R.plan = new K.Sendeplan(JSON.parse(d.text)); } catch (e) { /* neu */ } },
    complete: function () {
      file.readText({
        uri: LAUF,
        success: function (d) {
          var l;
          try { l = JSON.parse(d.text); } catch (e) { return; }
          if (!l || !l.id || R.modus !== "bereit") return;
          if (!R.plan.finde(l.id)) R.plan.neu(l.id);
          var x = R.plan.finde(l.id);
          if (l.n > x.n) x.n = l.n;
          abschliessen(l.id, x.n, l.zuletzt || Date.now(), l.pausen, l.hr || 0, "lite-abgebrochen");
        }
      });
    }
  });
  setTimeout(function () { setInterval(senden, 3000); }, 3000);
};

/**
 * Einmal je Sekunde von der Seite: Lauf-Stand nachziehen (nur waehrend der Aufnahme, nicht in der
 * Pause — wie Zepp). true = Lauf begonnen oder beendet (die Seite springt dann auf die erste Datenseite).
 */
R.takt = function () {
  if (R.modus !== "laeuft") return false;
  var jetzt = Date.now(), f = R.fixNeu;
  R.fixNeu = null;
  return R.stand.tick(R.achse.jetzt(jetzt), jetzt, !!f, f ? f[0] : 0, f ? f[1] : 0, -1, R.sammler.hr);
};

/** Was die Datenseiten zum Zeichnen brauchen. */
R.seitenKontext = function () {
  return { s: R.stand, k: R.konfig, el: R.modus === "bereit" ? 0 : R.achse.jetzt(Date.now()) / 1000,
    pausiert: R.modus === "pause", zustand: R.modus === "pause" ? "p" : (R.stand.foiling ? "on" : "off") };
};

R.ende = function () { sensorenAus(); bildschirmAn(false); };

export default R;
