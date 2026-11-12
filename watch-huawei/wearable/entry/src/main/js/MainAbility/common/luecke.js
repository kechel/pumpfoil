/*
 * GPS-Luecke am Lauf-Ende / im Lauf (12.11.2026, wie Garmin watch/source/LaufLuecke.mc und Apple/Wear/Android).
 * Uhr unter Wasser (Sturz, Arm) = keine Positionen. Regel, angeglichen an den Server (gps.py GAP_SPLIT_S = 15):
 *   - Luecke = > 3 s ohne Fix. Im Lauf haelt sie bis 15 s das Tempo (lauf.js median) — nie mittendrin unterbrechen.
 *   - Lauf-Ende mit noch laufender Luecke: Ende am letzten guten Fix (>= 2,5 m/s): Dauer, Strecke, Max-Puls von dort.
 *   - War die geschlossene Luecke das Letzte im Lauf und nicht durchgefahren (Luftlinie < 2,5 m/s oder > 15 s):
 *     Ende am guten Fix davor.
 *   - Luecke > 15 s im Lauf: Lauf endet rueckwirkend dort; geht es schnell weiter, beginnt ein neuer (keine Sperre).
 * Eigene Datei, weil die Lite-Uhren (GT/Fit/D) app.js in 48 KB Heap uebersetzen: mit diesem Code scheiterte der
 * Snapshot (12.11.: Heap-Spitze 39960 statt 38896). Lite laedt sie nicht (wie die Garmin-LITE-Stufe), Watch 3/4
 * (app-wearable.js) schon; die Watch 5 hat dieselbe Logik in arkts/…/Seiten.ets (test/arkts-seiten.test.mjs).
 */
import L from "./lauf.js";

var P = L.Stand.prototype, neu0 = P.neu;
function meter(a, b, c, d) {
  var R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// lT letzter Fix, gT/gD/gHr letzter guter (>= 2,5 m/s), aT/bT/aV letzte geschlossene Luecke (Beginn, Ende, Tempo
// ueber die Luftlinie), pT/pD/pHr guter Fix davor, trenn = Luecke > 15 s im Lauf geschlossen.
P.neu = function () {
  neu0.call(this);
  this.lT = -1; this.lLa = 0; this.lLo = 0; this.gT = -1; this.gD = 0; this.gHr = 0;
  this.aT = -1; this.bT = -1; this.aV = 0; this.pT = -1; this.pD = 0; this.pHr = 0; this.trenn = false;
};
/** Je Fix waehrend der Aufnahme (nach der Strecke). */
P.luecke = function (t, la, lo, v, hr) {
  var s = this, d = t - s.lT;
  if (s.lT >= 0 && d > 3000) {
    s.aT = s.lT; s.bT = t; s.aV = meter(s.lLa, s.lLo, la, lo) / (d / 1000);
    s.pT = s.gT; s.pD = s.gD; s.pHr = s.gHr;
    if (s.foiling && d > 15000) s.trenn = true;
  }
  s.lT = t; s.lLa = la; s.lLo = lo;
  if (v >= 2.5) { s.gT = t; s.gD = s.dist; s.gHr = Math.max(s.runMaxHr, hr); }
};
/** null = nichts zu korrigieren, sonst [Zeit, Strecke, Max-Puls] des letzten guten Fixes. */
P.schnitt = function (t, start) {
  var s = this;
  if (s.lT >= 0 && t - s.lT > 3000) return s.gT >= 0 && s.gT >= start ? [s.gT, s.gD, s.gHr] : null;
  if (s.aT < 0 || s.gT > s.bT + 3000 || s.pT < 0 || s.pT < start) return null;
  if (s.bT - s.aT <= 15000 && s.aV >= 2.5) return null;   // ueber die Luecke durchgefahren
  return [s.pT, s.pD, s.pHr];
};
/** Beim Lauf-Ende (lauf.js): null oder [Dauer, Strecke] ab Laufbeginn bis zum letzten guten Fix. */
P.ende = function (t, trenn) {
  var s = this, sn = s.schnitt(t, s.runStartMs);
  if (!sn) return null;
  if (sn[2] > 0) s.runMaxHr = sn[2];
  s.minSpeedSeitEnde = 0;                          // keine Fortsetzung ueber die Luecke
  // Getrennt oder Luecke laeuft noch: keine Sperre — kommt GPS zurueck und er pumpt, beginnt sofort ein neuer Lauf.
  if (trenn || t - s.lT > 3000) s.runEndedMs = t - 25000;
  return [sn[0] - s.runStartMs, sn[1] - s.runStartDist];
};

export default { an: true };
