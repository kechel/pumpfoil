/*
 * Zeichenbefehle aus seiten.js auf einer Canvas ausfuehren (Lite/JS-FA). Liegt im app.js-Buendel, nicht
 * in der Seite: die Seite reizt die 48-KB-Grenze der Lite-Uhren aus (08.10.2026, s. build-all.sh).
 */
/**
 * Zeichenbefehle ausfuehren. Lite kennt laut Doku nur die System-Schriftgroessen 30/38 px; Watch 3/4
 * (deviceType wearable) zeichnet die echte Groesse. Lite: fillText setzt die Oberkante auf y (im Simulator
 * gesehen); Watch 3/4: Grundlinie, mittig ueber +0,35 × Groesse (UNGEPRUEFT). Welche Canvas-Aufrufe Lite
 * wirklich kann, steht erst auf Hardware fest.
 */
function malen(c, befehle, lite) {
  for (var i = 0; i < befehle.length; i++) {
    var b = befehle[i];
    try {
      if (b.k === "r") { c.fillStyle = b.c; c.fillRect(b.x, b.y, b.w, b.h); }
      else if (b.k === "t") {
        var px = lite ? (b.s >= 34 ? 38 : 30) : b.s;
        c.fillStyle = b.c; c.font = px + "px";
        c.textAlign = b.a === "l" ? "left" : (b.a === "r" ? "right" : "center");
        // Lite setzt den Text mit der OBERKANTE auf y (Simulator 08.10.2026: alles ~0,85 × Groesse zu
        // tief, Jans Screenshot), Watch 3/4 (volle Canvas) mit der Grundlinie. b.y ist die Mitte.
        // Im Simulator mit Hilfslinien nachgemessen: Ziffern lagen bei -0,5 × Groesse noch ~0,1 × Groesse
        // unter der Soll-Mitte (Platz fuer Unterlaengen im Textfeld) — daher -0,6.
        c.fillText(b.txt, b.x, lite ? b.y - Math.round(px * 0.6) : b.y + Math.round(px * 0.35));
      } else if (b.k === "l") {
        c.strokeStyle = b.c; c.lineWidth = b.w; c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
      } else if (b.k === "a") {
        c.strokeStyle = b.c; c.lineWidth = b.w; c.beginPath();
        c.arc(b.cx, b.cy, b.r, b.a0 * Math.PI / 180, b.a1 * Math.PI / 180); c.stroke();
      }
    } catch (e) { /* ein Befehl, den die Uhr nicht kann, darf die Seite nicht abbrechen */ }
  }
}

export default { malen: malen };
