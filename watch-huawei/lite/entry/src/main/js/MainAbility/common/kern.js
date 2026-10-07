/*
 * Pumpfoil-Recorder fuer HUAWEI-Uhren — der reine Kern, OHNE Geraete-APIs.
 *
 * Gilt fuer beide SDK-Linien (Lite Wearable = Watch GT/Fit/D2, Wearable = Watch 3/4): beide
 * sind JavaScript, beide reden ueber denselben Wear-Engine-P2pClient mit dem Handy. Alles, was
 * hier steht, laeuft auch in Node (test/kern.test.mjs) — Binaerformat, Chunks, Pausen-Zeitachse
 * und die Uebertragungs-Warteschlange werden dort geprueft, weil die Uhr selbst sich kaum
 * debuggen laesst (docs/HUAWEI.md: Simulator zeigt kein Sensorverhalten).
 *
 * Bewusst ES5 (var, function): Lite Wearables laufen auf JerryScript, ES6 nur eingeschraenkt.
 * Bewusst KLEIN: dort gibt es 64 KB Heap, und ein JS-Bundle ueber ~48 KB scheitert beim
 * Installieren (docs/HUAWEI.md „Typische Fallen").
 *
 * Der Uhr fehlen zwei Dinge, die andere Plattformen haben (docs/HUAWEI.md):
 *  - Sensorwerte tragen KEINEN Zeitstempel -> t0 eines Blocks = Ankunft des ersten Werts; der
 *    Server misst die echte Rate aus den Bloecken (metrics_json.accel_hz_measured).
 *  - GPS liefert KEINE Geschwindigkeit -> speed = -1 („unbekannt"), der Server rechnet sie aus
 *    den Positionen, wie bei anderen Uhren ohne Doppler.
 * Deshalb wird auf der Uhr auch NICHT ausgeduennt: kaemen die Werte bei dunklem Display
 * gebuendelt an, wuerde ein Ausduennen nach Ankunftszeit fast alles verwerfen. Lieber alles
 * schicken und den Server die Rate messen lassen.
 */

var ACCEL_SCALE = 2048;          // 2048 = 1 g (docs/ingest-contract.md)
var G = 9.80665;
var ACCEL_JE_BLOCK = 250;        // ~5 s bei 50 Hz: 1500 Byte roh, 2000 Zeichen base64
var GPS_JE_BLOCK = 30;           // ~30 s bei 1 Hz
var MAX_FIX_ALTER_MS = 10 * 60 * 1000;

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 eines Byte-Arrays (Zahlen 0-255). JerryScript hat kein btoa. */
function b64(bytes) {
  var out = "";
  var i = 0;
  var n = bytes.length;
  for (; i + 2 < n; i += 3) {
    var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64.charAt((v >> 18) & 63) + B64.charAt((v >> 12) & 63) +
      B64.charAt((v >> 6) & 63) + B64.charAt(v & 63);
  }
  if (i < n) {
    var rest = n - i;
    var w = (bytes[i] << 16) | (rest > 1 ? bytes[i + 1] << 8 : 0);
    out += B64.charAt((w >> 18) & 63) + B64.charAt((w >> 12) & 63) +
      (rest > 1 ? B64.charAt((w >> 6) & 63) : "=") + "=";
  }
  return out;
}

/** m/s^2 -> int16 in 1/2048 g, gekappt. */
function i16(ms2) {
  var v = Math.round(ms2 / G * ACCEL_SCALE);
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v;
}

/** int16-Werte (x,y,z,x,y,z,...) -> Little-Endian-Bytes. */
function i16Bytes(werte) {
  var b = [];
  for (var i = 0; i < werte.length; i++) {
    var v = werte[i] & 0xffff;
    b.push(v & 0xff, (v >> 8) & 0xff);
  }
  return b;
}

/**
 * Zeitachse der Aufnahme mit Pausen. Alle Zeiten auf der Achse sind „aktive" ms seit Start —
 * Pausen zaehlen nicht mit, genau wie bei Wear OS und Apple Watch (`pauses` im /complete:
 * [Position auf der aktiven Achse, Dauer]).
 */
function Zeitachse(startMs) {
  this.startMs = startMs;
  this.pausiertMs = 0;      // Summe aller abgeschlossenen Pausen
  this.pauseSeit = 0;       // > 0 = gerade pausiert, Wanduhr bei Pausenbeginn
  this.pausen = [];
}
Zeitachse.prototype.jetzt = function (wandMs) {
  var bis = this.pauseSeit > 0 ? this.pauseSeit : wandMs;
  return bis - this.startMs - this.pausiertMs;
};
Zeitachse.prototype.pause = function (wandMs) {
  if (this.pauseSeit > 0) return;
  this.pauseSeit = wandMs;
};
Zeitachse.prototype.weiter = function (wandMs) {
  if (this.pauseSeit === 0) return;
  var dauer = wandMs - this.pauseSeit;
  var bei = this.pauseSeit - this.startMs - this.pausiertMs;
  if (dauer > 0) { this.pausen.push([bei, dauer]); this.pausiertMs += dauer; }
  this.pauseSeit = 0;
};
/** Eine Wanduhr-Zeit (z. B. Zeit eines GPS-Fixes) auf die aktive Achse; -1 = unbrauchbar. */
Zeitachse.prototype.auf = function (wandMs, jetztWandMs) {
  if (!(wandMs > 0) || Math.abs(jetztWandMs - wandMs) > MAX_FIX_ALTER_MS) return -1;
  var t = wandMs - this.startMs - this.pausiertMs;
  return t >= 0 ? t : -1;
};

/**
 * Sammelt Bloecke und gibt fertige Chunks im Upload-Format zurueck. EINE Indexfolge fuer alle
 * Arten (gps/accel), wie bei den anderen Recordern.
 */
function Sammler() {
  this.index = 0;
  this.accel = []; this.accelT0 = -1;
  this.gps = []; this.gpsT0 = -1; this.letzteGpsT = -1;
  this.hr = 0; this.hrAnzahl = 0;
  this.accelAnzahl = 0; this.gpsAnzahl = 0;
}
/** Ein Beschleunigungswert in m/s^2; t = aktive ms. Liefert einen Chunk, wenn der Block voll ist. */
Sammler.prototype.accelWert = function (x, y, z, t) {
  if (this.accelT0 < 0) this.accelT0 = t;
  this.accel.push(i16(x), i16(y), i16(z));
  this.accelAnzahl++;
  return this.accel.length >= ACCEL_JE_BLOCK * 3 ? this.accelBlock() : null;
};
Sammler.prototype.accelBlock = function () {
  if (this.accel.length === 0) return null;
  var c = {
    index: this.index++, kind: "accel", encoding: "int16-b64",
    t0_ms: Math.max(0, Math.round(this.accelT0)), count: this.accel.length / 3,
    data: b64(i16Bytes(this.accel))
  };
  this.accel = []; this.accelT0 = -1;
  return c;
};
Sammler.prototype.puls = function (bpm) {
  if (bpm > 0 && bpm < 255) { this.hr = Math.round(bpm); this.hrAnzahl++; }
};
/**
 * Ein GPS-Fix. t = aktive ms (aus der Fix-Zeit, sonst Ankunft). Speed -1 = unbekannt (die Lite-
 * API liefert keine). Zeit nie rueckwaerts: ein Fix, der nicht nach dem letzten liegt, wird
 * verworfen, sonst baut der Server eine Strecke mit 0 s Dauer.
 */
Sammler.prototype.gpsFix = function (lat, lon, genauigkeit, t) {
  if (!(t >= 0) || t <= this.letzteGpsT) return null;
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) return null;
  this.letzteGpsT = t;
  if (this.gpsT0 < 0) this.gpsT0 = t;
  this.gps.push([Math.round(t), lat, lon, -1, this.hr, genauigkeit > 0 ? genauigkeit : -1]);
  this.gpsAnzahl++;
  return this.gps.length >= GPS_JE_BLOCK ? this.gpsBlock() : null;
};
Sammler.prototype.gpsBlock = function () {
  if (this.gps.length === 0) return null;
  var c = {
    index: this.index++, kind: "gps", encoding: "json",
    t0_ms: Math.round(this.gpsT0), count: this.gps.length, data: this.gps
  };
  this.gps = []; this.gpsT0 = -1;
  return c;
};
/** Alles, was noch im Puffer liegt (beim Stopp und vor einer Pause). */
Sammler.prototype.rest = function () {
  var r = [];
  var a = this.accelBlock(); if (a) r.push(a);
  var g = this.gpsBlock(); if (g) r.push(g);
  return r;
};

/** Sitzungs-ID: nur [A-Za-z0-9_-], eindeutig genug fuer einen Nutzer. */
function neueId(wandMs, zufall) {
  return "hw-" + wandMs.toString(36) + "-" + Math.floor(zufall * 1e9).toString(36);
}

/**
 * Dateinamen auf der Uhr. Das Handy sortiert nach ihnen: Meta zuerst, dann die Chunks, das
 * Ende ZULETZT — nur so ist beim Eintreffen von „e" sicher alles andere schon da.
 *   m_<id>.json    Session-Meta (POST /api/ingest/session)
 *   c_<id>_<n>.json  ein Chunk
 *   e_<id>.json    Abschluss (POST .../complete)
 */
var PRAEFIX = "internal://app/";
function dateiMeta(id) { return PRAEFIX + "m_" + id + ".json"; }
function dateiChunk(id, n) { return PRAEFIX + "c_" + id + "_" + ("00000" + n).slice(-6) + ".json"; }
function dateiEnde(id) { return PRAEFIX + "e_" + id + ".json"; }

/** Reihenfolge fuer die Uebertragung: m vor c vor e, je Session; innerhalb c nach Nummer. */
function sendeReihenfolge(namen) {
  function rang(n) {
    var b = n.substring(n.lastIndexOf("/") + 1);
    var art = b.charAt(0) === "m" ? 0 : (b.charAt(0) === "c" ? 1 : (b.charAt(0) === "e" ? 2 : 9));
    return [art, b];
  }
  return namen.filter(function (n) { return rang(n)[0] < 9; }).sort(function (a, b) {
    var ra = rang(a), rb = rang(b);
    if (ra[0] !== rb[0]) return ra[0] - rb[0];
    return ra[1] < rb[1] ? -1 : (ra[1] > rb[1] ? 1 : 0);
  });
}

/**
 * Warteschlange fuer die Uebertragung zum Handy. Wear Engine schickt EINE Datei gleichzeitig
 * (das SDK lehnt eine zweite ab) und meldet 206, wenn etwas nicht geht — u. a. wenn die
 * Uhr-App nicht im Vordergrund ist oder das Handy fehlt (Wear-Engine-FAQ). Fehler werden
 * GEZAEHLT und angezeigt, nie verschluckt (Regel vom 13.09.: „Fehler nie nur einmal melden").
 * Wartezeit nach Fehlern steigt 5 s, 15 s, 30 s, dann 60 s.
 */
function Warteschlange() {
  this.laeuft = false;
  this.fehlerFolge = 0;
  this.fehlerGesamt = 0;
  this.gesendet = 0;
  this.letzterCode = 0;
  this.naechsterVersuch = 0;
}
Warteschlange.prototype.darf = function (jetzt) { return !this.laeuft && jetzt >= this.naechsterVersuch; };
Warteschlange.prototype.start = function () { this.laeuft = true; };
Warteschlange.prototype.ok = function () {
  this.laeuft = false; this.fehlerFolge = 0; this.gesendet++; this.naechsterVersuch = 0;
};
Warteschlange.prototype.fehler = function (code, jetzt) {
  this.laeuft = false; this.fehlerFolge++; this.fehlerGesamt++; this.letzterCode = code || 0;
  var w = [5000, 15000, 30000, 60000];
  this.naechsterVersuch = jetzt + w[Math.min(this.fehlerFolge - 1, w.length - 1)];
};

/**
 * Sendeplan: WAS als Naechstes zum Handy geht, ohne die Dateien aufzulisten. Eine Liste ueber
 * alle Dateien kostet bei 2 h ohne Handy ~1700 Eintraege — mehr, als die 64 KB Heap einer GT
 * hergeben. Der Plan haelt je Session nur Zaehler und wird als kleine Datei mitgeschrieben.
 * Reihenfolge je Session: Meta, Chunks 0..n-1, Ende — und das Ende erst, wenn die Aufnahme
 * vorbei ist. Chunks einer laufenden Aufnahme gehen schon unterwegs raus.
 */
function Sendeplan(daten) {
  this.s = (daten && daten.s) || [];
}
Sendeplan.prototype.neu = function (id) {
  this.s.push({ id: id, n: 0, g: 0, m: 0, e: 0, eg: 0 });
};
Sendeplan.prototype.finde = function (id) {
  for (var i = 0; i < this.s.length; i++) if (this.s[i].id === id) return this.s[i];
  return null;
};
/** Ein Chunk ist geschrieben (Datei liegt auf der Uhr). */
Sendeplan.prototype.chunk = function (id) { var x = this.finde(id); if (x) x.n++; };
/** Die Ende-Datei ist geschrieben. */
Sendeplan.prototype.ende = function (id) { var x = this.finde(id); if (x) x.e = 1; };
/** Naechste Datei oder null: {id, art: "m"|"c"|"e", nr}. Erledigte Sessions fallen heraus. */
Sendeplan.prototype.naechste = function () {
  while (this.s.length > 0) {
    var x = this.s[0];
    if (!x.m) return { id: x.id, art: "m", nr: -1 };
    if (x.g < x.n) return { id: x.id, art: "c", nr: x.g };
    if (x.e && !x.eg) return { id: x.id, art: "e", nr: -1 };
    if (x.e && x.eg) { this.s.shift(); continue; }
    // Laufende Aufnahme ohne neuen Chunk: die naechste Session darf NICHT vorziehen, sonst kaeme
    // deren Ende vor den restlichen Chunks dieser an — es gibt aber nur eine laufende.
    for (var i = 1; i < this.s.length; i++) {
      var y = this.s[i];
      if (!y.m) return { id: y.id, art: "m", nr: -1 };
      if (y.g < y.n) return { id: y.id, art: "c", nr: y.g };
      if (y.e && !y.eg) return { id: y.id, art: "e", nr: -1 };
    }
    return null;
  }
  return null;
};
/** Die Datei aus `naechste()` ist beim Handy angekommen. */
Sendeplan.prototype.erledigt = function (d) {
  var x = this.finde(d.id);
  if (!x) return;
  if (d.art === "m") x.m = 1;
  else if (d.art === "c" && d.nr === x.g) x.g++;
  else if (d.art === "e") x.eg = 1;
};
/** Wie viele Dateien noch zum Handy muessen. */
Sendeplan.prototype.offen = function () {
  var n = 0;
  for (var i = 0; i < this.s.length; i++) {
    var x = this.s[i];
    n += (x.m ? 0 : 1) + (x.n - x.g) + (x.e && !x.eg ? 1 : 0);
  }
  return n;
};
/**
 * Fortschritt fuer die Anzeige auf der Uhr: {fertig, gesamt} ueber alle Sessions im Plan.
 * Erledigte Sessions fallen aus dem Plan (naechste), damit zaehlt der Balken je „Ladung" neu.
 * Waehrend einer Aufnahme waechst `gesamt` mit jedem Chunk mit.
 */
Sendeplan.prototype.stand = function () {
  var f = 0, g = 0;
  for (var i = 0; i < this.s.length; i++) {
    var x = this.s[i];
    g += 1 + x.n + (x.e ? 1 : 0);
    f += (x.m ? 1 : 0) + x.g + (x.eg ? 1 : 0);
  }
  return { fertig: f, gesamt: g };
};
Sendeplan.prototype.daten = function () { return { s: this.s }; };
function dateiVon(d) {
  return d.art === "m" ? dateiMeta(d.id) : (d.art === "e" ? dateiEnde(d.id) : dateiChunk(d.id, d.nr));
}

/**
 * Uebertragung als NACHRICHTEN statt Dateien: das iOS-SDK von Wear Engine kann laut Huawei
 * („App-to-App Message Communications", iOS) nur Nachrichten, keine Dateien — und eine Nachricht
 * hoechstens 1 KB. Damit es EIN Weg fuer Android und iOS ist, geht jede Datei in Teilen:
 *   PF1|<dateiname>|<teil>|<anzahl>|<rest>|<inhalt>
 * Das Handy setzt die Teile wieder zusammen. <rest> = Dateien, die beim Lesen dieser Datei noch
 * zum Handy mussten, sie selbst eingeschlossen (Sendeplan.offen) — daraus zeigt das Handy einen
 * echten Fortschrittsbalken statt nur „empfaengt". Alles ASCII (Nicht-ASCII als \uXXXX — in unseren
 * JSON-Texten steht so etwas nur in Zeichenketten, dort ist das gueltiges JSON), damit die
 * Laenge in Zeichen gleich der in Bytes ist.
 */
var TEIL_MAX = 800;
function ascii(s) {
  return s.replace(/[\u0080-\uffff]/g, function (c) {
    return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
  });
}
function teile(name, text, rest, max) {
  var t = ascii(text), m = max || TEIL_MAX, z = Math.max(1, rest || 1);
  var n = Math.max(1, Math.ceil(t.length / m)), r = [];
  for (var i = 0; i < n; i++) {
    r.push("PF1|" + name + "|" + i + "|" + n + "|" + z + "|" + t.substring(i * m, (i + 1) * m));
  }
  return r;
}

/**
 * Gegenstelle: an welche Handy-App die Uhr schickt. Android (org.pumpfoil.app) und iOS
 * (org.pumpfoil.coolwatch) haben verschiedene Kennungen, und die Uhr weiss nicht, mit welchem
 * Handy sie gekoppelt ist. Wer zuletzt angenommen hat, bleibt; nach 3 Fehlschlaegen in Folge
 * wird gewechselt.
 */
function Gegenstelle(liste, aktiv) {
  this.liste = liste;
  this.i = aktiv > 0 && aktiv < liste.length ? aktiv : 0;
  this.folge = 0;
}
Gegenstelle.prototype.jetzt = function () { return this.liste[this.i]; };
Gegenstelle.prototype.ok = function () { this.folge = 0; };
/** true = gewechselt (der Aufrufer muss die Verbindung neu einstellen). */
Gegenstelle.prototype.fehler = function () {
  this.folge++;
  if (this.folge >= 3 && this.liste.length > 1) {
    this.i = (this.i + 1) % this.liste.length; this.folge = 0; return true;
  }
  return false;
};

/** Strecke zwischen zwei Punkten in m (fuer die Anzeige; der Server rechnet selbst). */
function meter(lat1, lon1, lat2, lon2) {
  var r = 6371000, k = Math.PI / 180;
  var dLat = (lat2 - lat1) * k, dLon = (lon2 - lon1) * k;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * k) * Math.cos(lat2 * k) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Anzeige-Tempo aus Positionen (die Uhr liefert keins): Strecke der letzten ~5 s geteilt durch
 * die Zeit. Spruenge ueber 15 m/s (54 km/h) und Fixe mit Genauigkeit > 30 m zaehlen nicht.
 */
function Anzeige() { this.pkt = []; this.strecke = 0; this.tempo = 0; }
Anzeige.prototype.fix = function (lat, lon, gen, t) {
  if (gen > 30) return;
  var p = this.pkt;
  if (p.length > 0) {
    var l = p[p.length - 1];
    var d = meter(l[0], l[1], lat, lon), dt = (t - l[2]) / 1000;
    if (dt <= 0 || d / dt > 15) return;
    this.strecke += d;
  }
  p.push([lat, lon, t]);
  while (p.length > 1 && t - p[0][2] > 5000) p.shift();
  if (p.length > 1) {
    var s = 0;
    for (var i = 1; i < p.length; i++) s += meter(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
    var dt2 = (p[p.length - 1][2] - p[0][2]) / 1000;
    this.tempo = dt2 > 0 ? s / dt2 : 0;
  }
};

export default {
  ACCEL_JE_BLOCK: ACCEL_JE_BLOCK, GPS_JE_BLOCK: GPS_JE_BLOCK,
  b64: b64, i16: i16, i16Bytes: i16Bytes,
  Zeitachse: Zeitachse, Sammler: Sammler, Warteschlange: Warteschlange, Anzeige: Anzeige,
  Sendeplan: Sendeplan, dateiVon: dateiVon, teile: teile, ascii: ascii, Gegenstelle: Gegenstelle,
  TEIL_MAX: TEIL_MAX,
  neueId: neueId, dateiMeta: dateiMeta, dateiChunk: dateiChunk, dateiEnde: dateiEnde,
  sendeReihenfolge: sendeReihenfolge, meter: meter
};
