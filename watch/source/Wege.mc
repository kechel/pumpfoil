using Toybox.Application.Storage;
using Toybox.Lang;

// Zwei Datenwege, getrennt vom Server schaltbar (Jan, 05.11.2026). Die Regel steht ganz auf dem Server
// (devices._datenwege), die Uhr befolgt nur die Schalter aus GET /api/devices/config:
//   rohAuf   — unsere Roh-Bloecke (ca_/cg_/meta_/state_/sa_/sg_, Index „sessions") im Object Store -> direkter Upload.
//              Aus = nichts davon wird geschrieben; die Aufnahme laeuft trotzdem (FIT-Datei -> Garmin Connect).
//   fitAccel — der SensorLogger schreibt die Beschleunigung in die FIT-Datei. Fehlt der Schalter (alter Server, nie
//              gekoppelt), gilt die bisherige Regel: nur auf Uhren mit genug Speicher.
//   gc       — Garmin Connect ist verknuepft (nur zur Information, z. B. fuer spaetere Hinweise).
// Eigenes Modul statt neuer Felder in SessionRecorder: dort steht der 128-KB-Build an der Grenze von 253 Membern.
module Wege {
    var _roh = null;   // Cache, weil `istRohSchluessel` bei jedem Schreibzugriff gefragt wird
    var _laeuft = false;   // waehrend einer Aufnahme bleibt `rohAuf` fest (s. beiStart)

    function merken(data) {
        var schluessel = ["gc", "rohAuf", "fitAccel"];
        for (var i = 0; i < schluessel.size(); i++) {
            var k = schluessel[i];
            if (data.hasKey(k) && data[k] instanceof Lang.Boolean) {
                try { Storage.setValue("w_" + k, data[k]); } catch (e) { }
            }
        }
        if (!_laeuft) { _roh = null; }   // neuer Wert gilt ab der naechsten Aufnahme
    }

    // `rohAuf` fuer die ganze Aufnahme festhalten: ein Konfigurationsabruf mitten in der Fahrt darf den Weg nicht
    // umschalten — sonst halbe Sessions (an -> aus) oder Bloecke ohne Session im Flash (aus -> an).
    function beiStart() { _roh = null; rohAuf(); _laeuft = true; }
    function beiStop() { _laeuft = false; _roh = null; }

    // Beim Entkoppeln: Schalter des alten Kontos vergessen (sonst puffert eine ungekoppelte Uhr nie wieder).
    function vergessen() {
        var schluessel = ["w_gc", "w_rohAuf", "w_fitAccel"];
        for (var i = 0; i < schluessel.size(); i++) { try { Storage.deleteValue(schluessel[i]); } catch (e) { } }
        if (!_laeuft) { _roh = null; }
    }

    function rohAuf() {
        if (_roh == null) {
            var v = Storage.getValue("w_rohAuf");
            _roh = !(v instanceof Lang.Boolean) || v;
        }
        return _roh;
    }

    function fitAccel(standard) {
        var v = Storage.getValue("w_fitAccel");
        return (v instanceof Lang.Boolean) ? v : standard;
    }

    // Gehoert dieser Schluessel zum eigenen Roh-Weg? Nur dann blockt `rohAuf = false` den Schreibzugriff —
    // Einstellungen, Canary und Absturzmeldungen werden weiter gespeichert.
    function istRohSchluessel(key) {
        if (!(key instanceof Lang.String)) { return false; }
        if (key.equals("sessions")) { return true; }
        var p = key.substring(0, 3);
        return p != null && (p.equals("ca_") || p.equals("cg_") || p.equals("sa_") || p.equals("sg_")
            || key.find("meta_") == 0 || key.find("state_") == 0);
    }
}
