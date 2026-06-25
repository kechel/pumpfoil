using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;

// Aufzeichnungs-Ansicht: 1–3 konfigurierbare große Datenfelder.
// Default: Speed (3 s) + Puls. Aktualisiert sich 1×/s via requestUpdate (Timer im Delegate).
class RecordView extends WatchUi.View {

    hidden var _rec;
    var screenIdx = 0;   // aktive Ansicht (mit UP/DOWN umschaltbar)

    function initialize(recorder) {
        View.initialize();
        _rec = recorder;
    }

    function nextScreen() { screenIdx = (screenIdx + 1) % _rec.screens.size(); }
    function prevScreen() { screenIdx = (screenIdx + _rec.screens.size() - 1) % _rec.screens.size(); }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        // Nicht am Aufzeichnen -> klar unterscheidbarer Start- bzw. Erfolgs-Screen
        // (sonst sieht Idle genauso aus wie laufende Aufnahme).
        if (!_rec.isRecording()) {
            if (_rec.stopped) { _drawStopped(dc); } else { _drawIdle(dc); }
            return;
        }

        // Beim Start erst „GPS wird gesucht", dann die Ansichten (sobald Fix da ist).
        if (!_rec.hasGpsFix()) {
            _drawGpsSearch(dc);
            return;
        }

        if (screenIdx >= _rec.screens.size()) { screenIdx = 0; }
        var fields = _rec.screens[screenIdx];
        var active = [];
        for (var i = 0; i < 3; i++) {
            if (fields[i] != Config.FIELD_NONE) { active.add(fields[i]); }
        }

        var h = dc.getHeight();
        var w = dc.getWidth();
        var n = active.size();
        if (n == 0) { n = 1; active = [Config.FIELD_SPEED3S]; }

        for (var i = 0; i < n; i++) {
            var cy = h * (i + 0.5) / n;
            _drawField(dc, active[i], w / 2, cy, n);
        }

        // Seiten-Indikator (Punkte), wenn mehrere Screens konfiguriert sind.
        if (_rec.screens.size() > 1) {
            for (var i = 0; i < _rec.screens.size(); i++) {
                dc.setColor(i == screenIdx ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(w / 2 + (i - (_rec.screens.size() - 1) / 2.0) * 12, h * 0.92, 3);
            }
        }

        // Status oben: roter Punkt + „REC" = aufzeichnend.
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w / 2 - 24, h * 0.085, 5);
        dc.drawText(w / 2 - 12, h * 0.085, Graphics.FONT_XTINY, "REC",
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        // Stop-Halten: roter Ring füllt sich von oben im Uhrzeigersinn (3 s).
        var sp = _rec.stopHoldProgress();
        if (sp > 0.0) {
            dc.setPenWidth(12);
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            var r = (w < h ? w : h) / 2 - 8;
            var endDeg = 90.0 - 360.0 * sp;  // 90°=oben; im Uhrzeigersinn fallend
            dc.drawArc(w / 2, h / 2, r, Graphics.ARC_CLOCKWISE, 90, endDeg);
            dc.setPenWidth(1);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.30, Graphics.FONT_TINY, "Stoppen…",
                Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    // Idle: bereit zum Aufnehmen. Zeigt App-Name, Version (Build-Check) + Start-Hinweis.
    hidden function _drawIdle(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.30, Graphics.FONT_MEDIUM, "Pump Foil", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.30 + 30, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.60, Graphics.FONT_SMALL, "START zum Aufnehmen", Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Nach Stopp&Speichern: klare Erfolgsmeldung (nicht mit Aufnahme verwechselbar).
    hidden function _drawStopped(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.28, Graphics.FONT_MEDIUM, "Gespeichert", Graphics.TEXT_JUSTIFY_CENTER);
        // grünes Häkchen
        dc.setPenWidth(4);
        dc.drawLine(w / 2 - 14, h * 0.46, w / 2 - 4, h * 0.50);
        dc.drawLine(w / 2 - 4, h * 0.50, w / 2 + 16, h * 0.42);
        dc.setPenWidth(1);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "Upload bei WLAN/Telefon", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.72, Graphics.FONT_XTINY, "START = neue Aufnahme", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.85, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Startbildschirm: GPS-Suche, bis ein brauchbarer Fix vorliegt.
    hidden function _drawGpsSearch(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "GPS wird gesucht",
            Graphics.TEXT_JUSTIFY_CENTER);
        // animierte Punkte (1 Hz Update)
        var dots = "";
        var k = (System.getTimer() / 500) % 4;
        for (var i = 0; i < k; i++) { dots += "."; }
        dc.drawText(w / 2, h * 0.40 + 34, Graphics.FONT_SMALL, dots,
            Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, "bitte freien Himmel",
            Graphics.TEXT_JUSTIFY_CENTER);
        // Aufnahme läuft bereits (roter Punkt oben).
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w / 2, h * 0.10, 6);
    }

    hidden function _drawField(dc, type, cx, cy, n) {
        var value;
        var label;
        var color = Graphics.COLOR_WHITE;
        if (type == Config.FIELD_SPEED3S) {
            var kmh = _rec.speed3s() * 3.6;
            value = kmh.format("%.1f");
            label = "km/h (3s)";
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_HR) {
            var hr = _rec.currentHr();
            value = hr == null ? "--" : hr.toString();
            label = "bpm";
            if (_rec.colorByValue && hr != null) { color = _hrColor(hr); }
        } else if (type == Config.FIELD_TIMER) {
            value = _fmtTime(_rec.elapsedTimeMs());
            label = "Zeit";
        } else if (type == Config.FIELD_DISTANCE) {
            value = (_rec.distanceM() / 1000.0).format("%.2f");
            label = "km";
        } else if (type == Config.FIELD_SPEED) {
            var kmh = _rec.currentSpeed() * 3.6;
            value = kmh.format("%.1f"); label = "km/h";
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_AVG_SPEED) {
            var kmh = _rec.avgSpeed() * 3.6;
            value = kmh.format("%.1f"); label = "km/h Ø";
        } else if (type == Config.FIELD_MAX_SPEED) {
            var kmh = _rec.maxSpeed() * 3.6;
            value = kmh.format("%.1f"); label = "km/h max";
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_AVG_HR) {
            var v = _rec.avgHr();
            value = v == null ? "--" : v.toString(); label = "bpm Ø";
        } else if (type == Config.FIELD_MAX_HR) {
            var v = _rec.maxHr();
            value = v == null ? "--" : v.toString(); label = "bpm max";
        } else if (type == Config.FIELD_ALTITUDE) {
            var v = _rec.altitudeM();
            value = v == null ? "--" : v.format("%.0f"); label = "m Höhe";
        } else if (type == Config.FIELD_ASCENT) {
            var v = _rec.ascentM();
            value = v == null ? "--" : v.format("%.0f"); label = "m ↑";
        } else if (type == Config.FIELD_TEMPERATURE) {
            var v = _rec.temperatureC();
            value = v == null ? "--" : v.format("%.0f"); label = "°C";
        } else if (type == Config.FIELD_CLOCK) {
            var c = System.getClockTime();
            value = c.hour.format("%02d") + ":" + c.min.format("%02d"); label = "Uhr";
        } else if (type == Config.FIELD_RUN_DURATION) {
            value = _fmtTime(_rec.runDurationMs());
            label = _rec.isFoiling() ? "Lauf läuft" : "Lauf";
            if (_rec.isFoiling()) { color = Graphics.COLOR_GREEN; }
        } else if (type == Config.FIELD_RUN_DISTANCE) {
            value = (_rec.runDistanceM() / 1000.0).format("%.2f");
            label = _rec.isFoiling() ? "km Lauf läuft" : "km Lauf";
            if (_rec.isFoiling()) { color = Graphics.COLOR_GREEN; }
        } else if (type == Config.FIELD_LAST_RUN_DURATION) {
            value = _fmtTime(_rec.lastRunDurationMs()); label = "letzter Lauf";
        } else if (type == Config.FIELD_LAST_RUN_DISTANCE) {
            value = (_rec.lastRunDistanceM() / 1000.0).format("%.2f"); label = "km letzter";
        } else if (type == Config.FIELD_LAST_RUN_AVG_SPEED) {
            value = (_rec.lastRunAvgSpeed() * 3.6).format("%.1f"); label = "km/h Ø letzt.";
        } else if (type == Config.FIELD_LAST_RUN_MAX_SPEED) {
            value = (_rec.lastRunMaxSpeed() * 3.6).format("%.1f"); label = "km/h max letzt.";
        } else if (type == Config.FIELD_RUN_COUNT) {
            value = _rec.runCount().toString(); label = "Läufe";
        } else {
            value = "--"; label = "";
        }

        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var font = (n >= 3) ? Graphics.FONT_NUMBER_MEDIUM : Graphics.FONT_NUMBER_HOT;
        dc.drawText(cx, cy, font, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 28, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Wert-abhängige Farben (Buckets, gut ablesbar auf der Uhr).
    hidden function _speedColor(kmh) {
        if (kmh < 12) { return Graphics.COLOR_BLUE; }
        if (kmh < 16) { return Graphics.COLOR_GREEN; }
        if (kmh < 20) { return Graphics.COLOR_YELLOW; }
        return Graphics.COLOR_RED;
    }
    hidden function _hrColor(hr) {
        if (hr < 120) { return Graphics.COLOR_GREEN; }
        if (hr < 150) { return Graphics.COLOR_YELLOW; }
        if (hr < 170) { return Graphics.COLOR_ORANGE; }
        return Graphics.COLOR_RED;
    }

    // Dauer als M:SS, ab einer Stunde als H:MM:SS (Sekunden immer dabei).
    hidden function _fmtTime(ms) {
        var s = ms / 1000;
        var h = s / 3600;
        var m = (s / 60) % 60;
        var sec = s % 60;
        if (h > 0) {
            return h.format("%d") + ":" + m.format("%02d") + ":" + sec.format("%02d");
        }
        return m.format("%d") + ":" + sec.format("%02d");
    }
}
