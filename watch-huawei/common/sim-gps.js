/*
 * GPS-Attrappe fuer den Simulator (Jan, 08.10.2026: „wie bekommen wir simulations bewegung / gps mit
 * rein?"). Mit `./sim.sh an` liest recorder.js diese Datei statt `@system.geolocation`: jede Sekunde ein
 * Fix entlang einer Pumpfoil-Fahrt — 30 s Lauf mit ~18 km/h, 20 s zurueck mit ~3 km/h, immer wieder. So
 * laufen Tempo, Lauf-Erkennung, Laufzaehler und Farben nach Wert auf den Datenseiten wie draussen.
 * NIE fuer eine Uhr: sync-common.sh / ./sim.sh aus stellt den echten Import wieder her.
 */
var uhr = 0;
var lat = 52.5, lon = 13.4, t = 0;
function tempoKmh(s) {
  var p = s % 50;
  if (p < 30) return 17 + 2 * Math.sin(s / 3);   // Lauf
  return 3;                                     // zurueck zum Steg
}
export default {
  subscribe: function (o) {
    clearInterval(uhr);
    t = 0;
    uhr = setInterval(function () {
      t++;
      var v = tempoKmh(t) / 3.6;                   // m/s, eine Sekunde lang nach Nordost
      lat += v * 0.7071 / 111320;
      lon += v * 0.7071 / (111320 * Math.cos(lat * Math.PI / 180));
      if (o.success) o.success({ latitude: lat, longitude: lon, accuracy: 4, time: Date.now() });
    }, 1000);
    console.info("Pumpfoil SIM: GPS-Fahrt laeuft");
  },
  unsubscribe: function () { clearInterval(uhr); uhr = 0; }
};
