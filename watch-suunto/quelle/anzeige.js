/*
 * Datenseiten wie auf den anderen Uhren: dieselben Zeichenbefehle wie Huawei (seiten.js `zeichne`, in
 * Promille des Displays), auf die Mittel einer SuuntoPlus-Vorlage verteilt (Referenz „Native functions"):
 *   Text   -> ein Element aus einem Vorrat je Schriftklasse UND Ausrichtung (l/c/r); setText + setStyle
 *          (left/top/color/visibility). Die Elemente sind 100 % breit und fest ausgerichtet (text-align in
 *          der Vorlage), left/top in reinen Prozent — KEIN calc(… %e): der Simulator setzt setStyle als
 *          Browser-CSS und verwirft %e (17.10., Texte klebten oben links), Suuntos eigene Vorlagen setzen
 *          per setStyle auch nur einfache Werte ('13%', '-50px').
 *   Rechteck, Linie, Bogen, Seitenpunkte -> gepackt in die Ausgaben g0…g12 (je eine Zahl < 2^53); die
 *          Vorlage abonniert sie ($.subscribe, Beispiel „DynamicIcons") und zeichnet sie auf ihr <canvas>
 *          (quelle/vorlage.js), neu aufgebaut, wenn sich `gv` aendert.
 * Gegenstueck beim Entpacken: quelle/vorlage.js — beide in Node gegeneinander geprueft (test/anzeige.test.mjs).
 */
var ANZ_GRAFIKEN = 13;          // mehr Ausgaben erlaubt der Editor nicht (bau.mjs); Seiten brauchen bisher <= 8
// Schriftklassen der Vorlage mit ihrer Hoehe als Anteil der Displaybreite (Referenz „CSS classes for text
// UI version 2", grosses Display 466 px; die sp-*-Klassen passen sich an n/o/q an). Je 3 Elemente.
var ANZ_KLASSEN = [["sp-d-xxl", 155], ["sp-d-xl", 118], ["sp-d-l", 103], ["sp-d-m", 78], ["sp-d-s", 65],
  ["sp-d-xs", 46], ["sp-t-m", 33], ["sp-t-s", 27]];
var ANZ_AUSR = ["c", "l", "r"];
var ANZ_JE = { c: 3, l: 2, r: 2 };   // Elemente je Schriftklasse und Ausrichtung (bau.mjs baut sie in die Vorlage)

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
  var graf = [], frei = {}, i, k, id, b, a, ai;
  for (ai = 0; ai < ANZ_AUSR.length; ai++) { frei[ANZ_AUSR[ai]] = []; for (k = 0; k < ANZ_KLASSEN.length; k++) frei[ANZ_AUSR[ai]].push(0); }
  var benutzt = {};
  for (i = 0; i < befehle.length; i++) {
    b = befehle[i];
    if (b.k !== "t") { if (graf.length < ANZ_GRAFIKEN) graf.push(anzPacke(b)); continue; }
    if (!b.txt) continue;
    a = b.a === "l" || b.a === "r" ? b.a : "c";
    k = anzKlasse(b.s);
    // Klasse voll -> naechstkleinere mit freiem Platz; ganz voll -> mittig (falsch ausgerichtet statt weg)
    while (k < ANZ_KLASSEN.length && frei[a][k] >= ANZ_JE[a]) k++;
    if (k >= ANZ_KLASSEN.length && a !== "c") { a = "c"; k = anzKlasse(b.s); while (k < ANZ_KLASSEN.length && frei.c[k] >= ANZ_JE.c) k++; }
    if (k >= ANZ_KLASSEN.length) continue;
    id = "#k" + k + a + "_" + frei[a][k]++;
    benutzt[id] = 1;
    this.text(id, b, k, a);
  }
  // uebrige Elemente verstecken
  for (ai = 0; ai < ANZ_AUSR.length; ai++) {
    a = ANZ_AUSR[ai];
    for (k = 0; k < ANZ_KLASSEN.length; k++) {
      for (i = 0; i < ANZ_JE[a]; i++) {
        id = "#k" + k + a + "_" + i;
        if (!benutzt[id]) this.stil(id, "visibility", "hidden");
      }
    }
  }
  var neu = false;
  for (i = 0; i < ANZ_GRAFIKEN; i++) {
    var v = i < graf.length ? graf[i] : 0;
    if (this.g[i] !== v) { this.g[i] = v; output["g" + i] = v; neu = true; }
  }
  if (neu) { this.gv = (this.gv + 1) % 1000000; output.gv = this.gv; }
};

/** Prozentwert, auf 0,1 gerundet, als CSS-Text. */
var ANZ_MITTE = 0.8;
var anzProz = function (v) { return Math.round(v * 10) / 10 + "%"; };

Anzeige.prototype.text = function (id, b, k, a) {
  var e = this.el[id] || (this.el[id] = {});
  if (e.txt !== b.txt) { e.txt = b.txt; setText(id, b.txt); }
  var ax = b.x / 10, ay = b.y / 10, h = ANZ_KLASSEN[k][1] * 100 / 466;
  this.stil(id, "left", anzProz(a === "l" ? ax : a === "r" ? ax - 100 : ax - 50));
  // Schriftmitte liegt ~0,8 Klassenhoehen unter der Oberkante des Elements (Zeilenhoehe > Ziffernhoehe),
  // gemessen im Simulator 17.10. an sp-d-m und sp-t-m (beide 0,8) — auf der Uhr nachpruefen
  this.stil(id, "top", anzProz(ay - h * ANZ_MITTE));
  this.stil(id, "color", b.c || "#ffffff");
  this.stil(id, "visibility", "visible");
};

Anzeige.prototype.stil = function (id, p, v) {
  var e = this.el[id] || (this.el[id] = {});
  if (e[p] === v) return;
  e[p] = v;
  setStyle(id, p, v);
};
