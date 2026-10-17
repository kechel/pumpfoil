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
