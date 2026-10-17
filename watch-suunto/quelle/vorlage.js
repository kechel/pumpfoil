// Skript der Datenseiten-Vorlage (laeuft in der VORLAGE, nicht in main.js): entpackt die Grafik-Befehle
// g0…g12 (quelle/anzeige.js anzPacke) und zeichnet sie auf das <canvas> der Seite. bau.mjs setzt diese
// Datei in das onLoad-Attribut von d.html — darum KEINE doppelten Anfuehrungszeichen hier (Test prueft das).
var G = [];
for (var gi = 0; gi < 13; gi++) G.push(0);   // = ANZ_GRAFIKEN (quelle/anzeige.js, Test prueft)

function hexFarbe(c12) {
  var h = '0123456789abcdef';
  return '#' + h.charAt((c12 >> 8) & 15) + h.charAt((c12 >> 4) & 15) + h.charAt(c12 & 15);
}

function dunkler(c12) {
  // Seiten-Punkte ausser dem aktiven: 35 % der Farbe auf schwarz (wie seiten.js mische)
  var r = Math.round(((c12 >> 8) & 15) * 0.35), g = Math.round(((c12 >> 4) & 15) * 0.35), b = Math.round((c12 & 15) * 0.35);
  return (r << 8) | (g << 4) | b;
}

function entpacke(v) {
  if (!v) return null;
  var n = v - 1, typ = n % 4, z = Math.floor(n / 4);
  var c = z % 4096;
  z = Math.floor(z / 4096);
  var felder = typ === 0 ? [9, 9, 9, 9] : typ === 1 ? [9, 9, 9, 9, 3] : typ === 2 ? [9, 9, 9, 5] : [9, 9, 6, 4, 4];
  var w = [], i, m;
  for (i = 0; i < felder.length; i++) {
    m = Math.pow(2, felder[i]);
    w.push(z % m);
    z = Math.floor(z / m);
  }
  return { typ: typ, c: c, w: w };
}

function zeichneSeite(ctx) {
  var sx = ctx.width / 500, sy = ctx.height / 500, i, b, k;   // Werte sind Promille / 2
  for (i = 0; i < G.length; i++) {
    b = entpacke(G[i]);
    if (!b) continue;
    if (b.typ === 0) {
      ctx.fillStyle = hexFarbe(b.c);
      ctx.fillRect(b.w[0] * sx, b.w[1] * sy, Math.max(1, b.w[2] * sx), Math.max(1, b.w[3] * sy));
    } else if (b.typ === 1) {
      ctx.strokeStyle = hexFarbe(b.c);
      ctx.lineWidth = Math.max(1, b.w[4] * sx);
      ctx.beginPath(); ctx.moveTo(b.w[0] * sx, b.w[1] * sy); ctx.lineTo(b.w[2] * sx, b.w[3] * sy); ctx.stroke();
    } else if (b.typ === 2) {
      var a0 = (b.w[1] - 90) * Math.PI / 180, a1 = a0 + b.w[2] * Math.PI / 180;
      ctx.strokeStyle = hexFarbe(b.c);
      ctx.lineWidth = Math.max(1, b.w[3] * sx);
      ctx.beginPath(); ctx.arc(ctx.width / 2, ctx.height / 2, b.w[0] * sx, a0, a1); ctx.stroke();
    } else {
      var d = b.w[2] * sx;
      for (k = 0; k < b.w[3]; k++) {
        ctx.fillStyle = hexFarbe(k === b.w[4] ? b.c : dunkler(b.c));
        ctx.fillRect(b.w[0] * sx + k * 2 * d - d / 2, b.w[1] * sy - d / 2, Math.max(1, d), Math.max(1, d));
      }
    }
  }
}
