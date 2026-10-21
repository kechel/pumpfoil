using Toybox.Activity;
using Toybox.ActivityMonitor;
using Toybox.Application.Storage;
using Toybox.Lang;
using Toybox.Math;
using Toybox.Position;
using Toybox.Sensor;

// DANCE (Jan, 21.10.2026): „Kompass und Schrittzaehler und GPS, aber ohne warten, einfach brauchen wir
// eigentlich nur einen Fix alle 30 Minuten oder so … der Kadenz-Zaehler der Uhr ist sicher eine gute /
// alternative Datenquelle die wir abgleichen koennen". NUR Tanz-App, nie nach watch/.
//
// 1) Je Sensorpaket (~1 s) eine Zeile fuer den Kanal „hr":
//      [t_ms, puls|null, kurs_grad|null, kadenz|null, schritte|null]
//    kurs  = Kompass (Sensor.Info.heading, ersatzweise Activity.Info.currentHeading), 0..359
//    kadenz = Activity.Info.currentCadence (Schritte/min laut Uhr)
//    schritte = ActivityMonitor.Info.steps (Tageszaehler; Differenzen zaehlen, nicht der Wert)
//    Bis 0.5 hatte die Zeile nur [t_ms, puls] und kam nur, wenn ein Puls da war.
// 2) GPS-Fix ohne Warten: beim Start und danach alle 30 min EIN Einzel-Fix (LOCATION_ONE_SHOT). Der
//    Start wartet nie darauf; findet die Uhr nach 5 min nichts, wird die Suche abgebrochen und in 30 min
//    neu versucht. Fixe gehen NICHT in den GPS-Kanal (keine Karte, kein Spot, Sessions sind oeffentlich),
//    sondern eigen in Storage "to_<uuid>" als [[t_ms, lat, lon, genauigkeit], ...] und im /complete als
//    „tanz_orte" (Server: app/tanz.py, nur fuer den Besitzer).
module TanzSensoren {
    const FIX_ALLE_MS = 1800000;     // 30 min
    const FIX_SUCHE_MS = 300000;     // nach 5 min ohne Fix aufgeben

    var _uuid = null;
    var _orte = [];
    var _naechsterFix = 0;
    var _sucheSeit = -1;             // -1 = sucht gerade nicht
    var _jetzt = 0;
    var _empf = null;

    function start(uuid) {
        _uuid = uuid;
        _orte = [];
        _naechsterFix = 0;           // gleich beim ersten Paket
        _sucheSeit = -1;
        _jetzt = 0;
        if (_empf == null) { _empf = new TanzFixEmpfaenger(); }
    }

    // Aus SessionRecorder.onAccel je Paket. Liefert die Zeile fuer den hr-Kanal.
    function zeile(t) {
        _jetzt = t;
        var puls = null; var kurs = null; var kad = null; var schritte = null;
        try {
            var a = Activity.getActivityInfo();
            if (a != null) {
                puls = a.currentHeartRate;
                kad = a.currentCadence;
                if (a.currentHeading != null) { kurs = a.currentHeading; }
            }
        } catch (e) {}
        try {
            var s = Sensor.getInfo();
            if (s != null && (s has :heading) && s.heading != null) { kurs = s.heading; }
        } catch (e) {}
        if (kurs != null) {
            var g = (kurs * 180.0 / Math.PI).toNumber() % 360;
            kurs = g < 0 ? g + 360 : g;
        }
        try {
            var m = ActivityMonitor.getInfo();
            if (m != null) { schritte = m.steps; }
        } catch (e) {}
        _fixPlanen(t);
        return [t, puls, kurs, kad, schritte];
    }

    function _fixPlanen(t) {
        if (_uuid == null) { return; }
        if (_sucheSeit >= 0) {
            if (t - _sucheSeit > FIX_SUCHE_MS) { _aus(); _naechsterFix = t + FIX_ALLE_MS; }
            return;
        }
        if (t < _naechsterFix) { return; }
        try {
            Position.enableLocationEvents(Position.LOCATION_ONE_SHOT, _empf.method(:onFix));
            _sucheSeit = t;
        } catch (e) {
            _naechsterFix = t + FIX_ALLE_MS;
        }
    }

    function fix(info) {
        if (_uuid == null || _sucheSeit < 0) { return; }
        if (info == null || info.position == null
                || (info.accuracy != null && info.accuracy < Position.QUALITY_POOR)) {
            // nur „zuletzt bekannt“/nichts: der Einzel-Fix ist damit verbraucht -> neu anfordern
            try { Position.enableLocationEvents(Position.LOCATION_ONE_SHOT, _empf.method(:onFix)); } catch (e) {}
            return;
        }
        var p = info.position.toDegrees();
        _orte.add([_jetzt, p[0].toFloat(), p[1].toFloat(), info.accuracy]);
        try { Storage.setValue("to_" + _uuid, _orte); } catch (e) {}
        _naechsterFix = _sucheSeit + FIX_ALLE_MS;
        _aus();
    }

    function _aus() {
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, _empf.method(:onFix)); } catch (e) {}
        _sucheSeit = -1;
    }

    // Pause/Stopp: laufende Suche beenden (die naechste kommt nach der Pause beim naechsten Paket).
    function halt() {
        if (_sucheSeit >= 0) { _aus(); _naechsterFix = 0; }
    }
}

// Position braucht einen Methoden-Empfaenger; das Modul selbst taugt dafuer nicht verlaesslich.
class TanzFixEmpfaenger {
    function initialize() {}
    function onFix(info as Position.Info) as Void { TanzSensoren.fix(info); }
}
