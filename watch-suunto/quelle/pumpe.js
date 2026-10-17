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
