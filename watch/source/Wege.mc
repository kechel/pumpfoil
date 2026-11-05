using Toybox.Application.Storage;
using Toybox.Lang;

// Datenwege, getrennt vom Server schaltbar (Jan, 05.11.2026). Die Regel steht ganz auf dem Server
// (devices._datenwege), die Uhr befolgt nur die Schalter aus GET /api/devices/config:
//   rohGps   — unsere GPS-Bloecke (cg_) im Object Store -> direkter Upload.
//   rohAccel — unsere Beschleunigungs-Bloecke (ca_).
//              Aus = diese Bloecke werden nicht geschrieben. Die Aufnahme laeuft trotzdem (FIT-Datei -> Garmin Connect),
//              und die Session-Meta (Sportart, Foil, Start, Ende) geht IMMER zu uns, damit der Server die FIT von Garmin
//              spaeter dieser Session zuordnen kann.
//   fitAccel — der SensorLogger schreibt die Beschleunigung in die FIT-Datei. Fehlt der Schalter (alter Server, nie
//              gekoppelt), gilt die bisherige Regel: nur auf Uhren mit genug Speicher.
//   gc       — Garmin Connect ist verknuepft: nur dann startet eine Aufnahme auch bei vollem Puffer. Ohne Verknuepfung
//              schickt der Server keinen dieser Schalter, und alles bleibt beim alten Verhalten.
// Eigenes Modul statt neuer Felder in SessionRecorder: dort steht der 128-KB-Build an der Grenze von 253 Membern.
module Wege {
    var _gps = null;       // Cache, weil `blockiert` bei jedem Schreibzugriff gefragt wird
    var _accel = null;
    var _laeuft = false;   // waehrend einer Aufnahme bleiben die Roh-Schalter fest (s. beiStart)
    var _letzterPunkt = null;   // Session-ms des zuletzt behaltenen GPS-Punkts (duenne Spur)
    const DUENN_MS = 600000;    // GPS aus: ein Punkt alle 10 min (Jan, 05.11.2026) — Ort und Spot ohne Puffer-Last

    function merken(data) {
        // Kein `gc` in der Antwort = keine Garmin-Verknuepfung (mehr): getrennt oder Teilen in Garmin Connect aus. Dann
        // alles vergessen und zurueck zum alten Verhalten — sonst blieben „GPS nur alle 10 min" & Co. stehen, obwohl die
        // FIT gar nicht mehr zu uns kommt.
        if (!data.hasKey("gc")) { vergessen(); return; }
        var schluessel = ["gc", "rohGps", "rohAccel", "fitAccel"];
        for (var i = 0; i < schluessel.size(); i++) {
            var k = schluessel[i];
            if (data.hasKey(k) && data[k] instanceof Lang.Boolean) {
                try { Storage.setValue("w_" + k, data[k]); } catch (e) { }
            }
        }
        if (!_laeuft) { _gps = null; _accel = null; }   // neuer Wert gilt ab der naechsten Aufnahme
    }

    // Beim Entkoppeln: Schalter des alten Kontos vergessen (sonst puffert eine ungekoppelte Uhr nie wieder).
    function vergessen() {
        var schluessel = ["w_gc", "w_rohGps", "w_rohAccel", "w_fitAccel"];
        for (var i = 0; i < schluessel.size(); i++) { try { Storage.deleteValue(schluessel[i]); } catch (e) { } }
        if (!_laeuft) { _gps = null; _accel = null; }
    }

    // Roh-Schalter fuer die ganze Aufnahme festhalten: ein Konfigurationsabruf mitten in der Fahrt darf den Weg nicht
    // umschalten — sonst halbe Spuren oder Bloecke ohne Session im Flash.
    function beiStart() {
        _gps = null; _accel = null; _letzterPunkt = null;
        _an("w_rohGps", false); _an("w_rohAccel", true); _laeuft = true;
    }
    function beiStop() { _laeuft = false; _gps = null; _accel = null; }

    function _an(key, accel) {
        if (accel) {
            if (_accel == null) { var v = Storage.getValue(key); _accel = !(v instanceof Lang.Boolean) || v; }
            return _accel;
        }
        if (_gps == null) { var v = Storage.getValue(key); _gps = !(v instanceof Lang.Boolean) || v; }
        return _gps;
    }

    // GPS-Bloecke aus: statt gar nichts eine duenne Spur (erster Punkt, dann alle 10 min), damit die Session Ort, Spot
    // und Zeitraum hat, bis die FIT von Garmin kommt. An: jeder Punkt.
    function gpsBehalten(p) {
        if (_an("w_rohGps", false)) { return true; }
        if (!(p instanceof Lang.Array) || p.size() == 0 || !(p[0] instanceof Lang.Number)) { return false; }
        if (_letzterPunkt == null || p[0] - _letzterPunkt >= DUENN_MS) { _letzterPunkt = p[0]; return true; }
        return false;
    }

    // In die Session-Meta (geht als /ingest/session an den Server): eigene Bloecke absichtlich weggelassen/ausgeduennt.
    function meta(m) {
        if (!_an("w_rohGps", false) || !_an("w_rohAccel", true)) { m["duenn"] = true; }
    }

    function gc() { return Storage.getValue("w_gc") == true; }

    function fitAccel(standard) {
        var v = Storage.getValue("w_fitAccel");
        return (v instanceof Lang.Boolean) ? v : standard;
    }

    // Soll dieser Schreibzugriff unterbleiben? Nur Accel-Bloecke (GPS wird stattdessen ausgeduennt, s. gpsBehalten) —
    // Meta, Zustand, Index, Einstellungen, Canary und Absturzmeldungen werden immer gespeichert.
    function blockiert(key) {
        if (!(key instanceof Lang.String) || key.length() < 3) { return false; }
        var p = key.substring(0, 3);
        if (p.equals("ca_")) { return !_an("w_rohAccel", true); }
        return false;
    }
}
