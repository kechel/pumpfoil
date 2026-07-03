using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Attention;

// Aufzeichnungs-Ansicht: 1–3 konfigurierbare große Datenfelder.
// Default: Speed (3 s) + Puls. Aktualisiert sich 1×/s via requestUpdate (Timer im Delegate).
class RecordView extends WatchUi.View {

    hidden var _rec;
    var screenIdx = 0;   // aktive Seite (Datenansichten 0..n-1, n = Übersicht)
    hidden var _prevFoiling = false;
    hidden var _prevRecording = false;
    hidden var _lastDataIdx = 0;          // zuletzt gezeigte Datenansicht (Rücksprungziel)
    hidden var _summaryShownAtMs = null;  // Zeitpunkt des Auto-Wechsels zur Übersicht (für 60-s-Rücksprung)

    function initialize(recorder) {
        View.initialize();
        _rec = recorder;
    }

    // Seitenzahl inkl. Übersichts-Seite (Index = screens.size()).
    hidden function _pageCount() { return _rec.screens.size() + 1; }

    // UP/DOWN: manuelles Blättern bricht den Auto-Rücksprung ab (Nutzer hat Kontrolle).
    function nextScreen() { screenIdx = (screenIdx + 1) % _pageCount(); _summaryShownAtMs = null; }
    function prevScreen() { screenIdx = (screenIdx + _pageCount() - 1) % _pageCount(); _summaryShownAtMs = null; }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        // Aufnahme-Start erkennen -> Seiten-State zurücksetzen (damit man vor der Fahrt
        // die gewählte Ansicht sieht, nicht die Übersicht vom letzten Mal).
        var recording = _rec.isRecording();
        if (recording && !_prevRecording) {
            screenIdx = 0; _prevFoiling = false; _summaryShownAtMs = null; _lastDataIdx = 0;
        }
        _prevRecording = recording;

        // Nicht am Aufzeichnen -> klar unterscheidbarer Start- bzw. Erfolgs-Screen.
        if (!recording) {
            if (_rec.stopped) { _drawStopped(dc); } else { _drawIdle(dc); }
            return;
        }

        // Beim Start erst „GPS wird gesucht", dann die Ansichten (sobald Fix da ist).
        if (!_rec.hasGpsFix()) {
            _drawGpsSearch(dc);
            return;
        }

        var summaryIdx = _rec.screens.size();
        if (screenIdx > summaryIdx) { screenIdx = 0; }

        // Auto-Umschaltung NUR auf der Flanke: Lauf beendet (foil->off) -> einmalig zur
        // Übersicht (+ kurze Vibration als Bestätigung); Lauf gestartet (off->foil) ->
        // zurück zur letzten Datenansicht. Dazwischen blättert der Nutzer frei.
        var foil = _rec.isFoiling();
        if (foil != _prevFoiling) {
            if (!foil) {
                screenIdx = summaryIdx;
                _summaryShownAtMs = System.getTimer();
                _vibeSwitch();
            } else {
                if (screenIdx == summaryIdx) { screenIdx = _lastDataIdx; }
                _summaryShownAtMs = null;
            }
            _prevFoiling = foil;
        }
        // Nach 60 s auf der Übersicht ohne Wischen -> automatisch zurück zur letzten Ansicht.
        if (_summaryShownAtMs != null && screenIdx == summaryIdx) {
            if (System.getTimer() - _summaryShownAtMs >= 60000) {
                screenIdx = _lastDataIdx; _summaryShownAtMs = null;
            }
        }
        if (screenIdx < summaryIdx) { _lastDataIdx = screenIdx; }

        var summary = (screenIdx == summaryIdx);
        var fields = summary ? _rec.offFoilView : _rec.screens[screenIdx];
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

        // Seiten-Indikator (Punkte): Datenansichten + Übersicht (letzter Punkt).
        if (_pageCount() > 1) {
            for (var i = 0; i < _pageCount(); i++) {
                dc.setColor(i == screenIdx ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(w / 2 + (i - (_pageCount() - 1) / 2.0) * 12, h * 0.92, 3);
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
            dc.drawText(w / 2, h * 0.30, Graphics.FONT_TINY, Strings.s("rec.stopping"),
                Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    // Idle: nur der Start-Screen. Verbinden + Upload liegen — wie bei nativen
    // Garmin-Aktivitäten ("Laufen Einstellungen") — hinter MENU (Mitte-links halten),
    // erreichbar VOR dem Start der Aufnahme. Während der Aktivität ist Upload eh nicht
    // möglich, deshalb hat der laufende Screen keine Unterseiten mehr.
    hidden function _drawIdle(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        _drawStartPage(dc, w, h);
    }

    hidden function _drawStartPage(dc, w, h) {
        var titleY = h * 0.20;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, titleY, Graphics.FONT_MEDIUM, "Pumpfoil", Graphics.TEXT_JUSTIFY_CENTER);
        // Version anhand der echten Titel-Font-Höhe darunter -> kein Überlappen (geräteunabhängig).
        var titleH = dc.getFontHeight(Graphics.FONT_MEDIUM);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, titleY + titleH + 2, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
        // GPS-Status (vorgewärmt seit App-Start) — so weiß man, wann man loslegen kann.
        if (_rec.hasGpsFix()) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            var gtxt = Strings.s("gps.ready");
            // Auto-Start: während des Vorlaufs Countdown „Auto-Start Ns", danach nur „Auto-Start" (scharf).
            if (_rec.autoStartOn()) {
                gtxt += " · " + Strings.s("auto.short");
                if (!_rec.autoArmed()) { gtxt += " " + _rec.autoLead() + "s"; }
            }
            dc.drawText(w / 2, h * 0.44, Graphics.FONT_XTINY, gtxt, Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.44, Graphics.FONT_XTINY, Strings.s("gps.searching"), Graphics.TEXT_JUSTIFY_CENTER);
        }
        // Object-Store voll (Aufnahme konnte nicht starten/sichern) -> klarer Hinweis statt Crash.
        if (_rec.storageFull) {
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.50, Graphics.FONT_XTINY, Strings.s("err.storageFull"), Graphics.TEXT_JUSTIFY_CENTER);
        }
        // Gewählte Foil (per DOWN einstellbar). Glocke daneben, wenn der Alarm an ist.
        if (_rec.foils.size() >= 1 || _rec.manualAlarm) {
            var lbl = _rec.activeAlarmLabel.equals("") ? "-" : _rec.activeAlarmLabel;
            var txt = Strings.s("foil.prefix") + lbl;
            var ty = h * 0.555;
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, ty, Graphics.FONT_XTINY, txt, Graphics.TEXT_JUSTIFY_CENTER);
            if (_rec.alarmEnabled) {
                var tw = dc.getTextWidthInPixels(txt, Graphics.FONT_XTINY);
                var bh = dc.getFontHeight(Graphics.FONT_XTINY);
                _drawBell(dc, (w / 2) + (tw / 2) + 9, ty + (bh / 2));
            }
        }
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.65, Graphics.FONT_SMALL, Strings.s("start.rec"), Graphics.TEXT_JUSTIFY_CENTER);
        // Dezente Hinweise: Foil-Auswahl per DOWN, Einstellungen (Verbinden/Upload) hinter MENU.
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        if (_rec.foils.size() >= 1 || _rec.manualAlarm) {
            dc.drawText(w / 2, h * 0.79, Graphics.FONT_XTINY, Strings.s("start.chooseAlarm"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.88, Graphics.FONT_XTINY, Strings.s("start.menu"), Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.drawText(w / 2, h * 0.84, Graphics.FONT_XTINY, Strings.s("start.menu"), Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    // Nach Stopp&Speichern: klare Erfolgsmeldung (nicht mit Aufnahme verwechselbar).
    hidden function _drawStopped(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.28, Graphics.FONT_MEDIUM, Strings.s("saved.title"), Graphics.TEXT_JUSTIFY_CENTER);
        // grünes Häkchen
        dc.setPenWidth(4);
        dc.drawLine(w / 2 - 14, h * 0.46, w / 2 - 4, h * 0.50);
        dc.drawLine(w / 2 - 4, h * 0.50, w / 2 + 16, h * 0.42);
        dc.setPenWidth(1);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, Strings.s("saved.upload"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.72, Graphics.FONT_XTINY, Strings.s("saved.newRec"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.85, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Startbildschirm: GPS-Suche, bis ein brauchbarer Fix vorliegt.
    hidden function _drawGpsSearch(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("gps.searchBig"),
            Graphics.TEXT_JUSTIFY_CENTER);
        // animierte Punkte (1 Hz Update)
        var dots = "";
        var k = (System.getTimer() / 500) % 4;
        for (var i = 0; i < k; i++) { dots += "."; }
        dc.drawText(w / 2, h * 0.40 + 34, Graphics.FONT_SMALL, dots,
            Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, Strings.s("gps.sky"),
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
            label = Strings.s("f.kmh3s");
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_HR) {
            var hr = _rec.currentHr();
            value = hr == null ? "--" : hr.toString();
            label = Strings.s("f.bpm");
            if (_rec.colorByValue && hr != null) { color = _hrColor(hr); }
        } else if (type == Config.FIELD_TIMER) {
            value = _fmtTime(_rec.elapsedTimeMs());
            label = Strings.s("f.time");
        } else if (type == Config.FIELD_DISTANCE) {
            value = _distVal(_rec.distanceM());
            label = _distUnit(_rec.distanceM());
        } else if (type == Config.FIELD_SPEED) {
            var kmh = _rec.currentSpeed() * 3.6;
            value = kmh.format("%.1f"); label = Strings.s("f.kmh");
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_AVG_SPEED) {
            var kmh = _rec.avgSpeed() * 3.6;
            value = kmh.format("%.1f"); label = Strings.s("f.kmhAvg");
        } else if (type == Config.FIELD_MAX_SPEED) {
            var kmh = _rec.maxSpeed() * 3.6;
            value = kmh.format("%.1f"); label = Strings.s("f.kmhMax");
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_AVG_HR) {
            var v = _rec.avgHr();
            value = v == null ? "--" : v.toString(); label = Strings.s("f.bpmAvg");
        } else if (type == Config.FIELD_MAX_HR) {
            var v = _rec.maxHr();
            value = v == null ? "--" : v.toString(); label = Strings.s("f.bpmMax");
        } else if (type == Config.FIELD_ALTITUDE) {
            var v = _rec.altitudeM();
            value = v == null ? "--" : v.format("%.0f"); label = Strings.s("f.mAlt");
        } else if (type == Config.FIELD_ASCENT) {
            var v = _rec.ascentM();
            value = v == null ? "--" : v.format("%.0f"); label = Strings.s("f.mAsc");
        } else if (type == Config.FIELD_TEMPERATURE) {
            var v = _rec.temperatureC();
            value = v == null ? "--" : v.format("%.0f"); label = Strings.s("f.degC");
        } else if (type == Config.FIELD_CLOCK) {
            var c = System.getClockTime();
            value = c.hour.format("%02d") + ":" + c.min.format("%02d"); label = Strings.s("f.clock");
        } else if (type == Config.FIELD_RUN_DURATION) {
            value = _fmtTime(_rec.runDurationMs());
            label = _rec.isFoiling() ? Strings.s("f.runActive") : Strings.s("f.run");
            if (_rec.isFoiling()) { color = Graphics.COLOR_GREEN; }
        } else if (type == Config.FIELD_RUN_DISTANCE) {
            value = _distVal(_rec.runDistanceM());
            label = _distUnit(_rec.runDistanceM()) + " " + (_rec.isFoiling() ? Strings.s("f.runActive") : Strings.s("f.run"));
            if (_rec.isFoiling()) { color = Graphics.COLOR_GREEN; }
        } else if (type == Config.FIELD_LAST_RUN_DURATION) {
            value = _fmtTime(_rec.lastRunDurationMs()); label = Strings.s("f.lastRun");
        } else if (type == Config.FIELD_LAST_RUN_DISTANCE) {
            value = _distVal(_rec.lastRunDistanceM()); label = _distUnit(_rec.lastRunDistanceM()) + " " + Strings.s("f.last");
        } else if (type == Config.FIELD_LAST_RUN_AVG_SPEED) {
            value = (_rec.lastRunAvgSpeed() * 3.6).format("%.1f"); label = Strings.s("f.kmhAvgLast");
        } else if (type == Config.FIELD_LAST_RUN_MAX_SPEED) {
            value = (_rec.lastRunMaxSpeed() * 3.6).format("%.1f"); label = Strings.s("f.kmhMaxLast");
        } else if (type == Config.FIELD_RUN_COUNT) {
            value = _rec.runCount().toString(); label = Strings.s("f.runs");
        } else {
            value = "--"; label = "";
        }

        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var font = (n >= 3) ? Graphics.FONT_NUMBER_MEDIUM : Graphics.FONT_NUMBER_HOT;
        dc.drawText(cx, cy, font, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 28, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Kleine Glocke (~12 px), gezeichnet neben der Foil-Zeile, wenn der Alarm an ist.
    hidden function _drawBell(dc, cx, cy) {
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(cx - 1, cy - 6, 2, 2);                                   // Griff oben
        dc.fillCircle(cx, cy - 3, 3);                                             // Kuppel
        dc.fillPolygon([[cx - 5, cy + 3], [cx + 5, cy + 3], [cx + 3, cy - 2], [cx - 3, cy - 2]]); // Körper
        dc.fillRectangle(cx - 6, cy + 3, 12, 1);                                  // Rand unten
        dc.fillCircle(cx, cy + 6, 1);                                             // Klöppel
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
    // Kurze Vibration beim Auto-Wechsel zur Übersicht (= Bestätigung „Lauf beendet").
    hidden function _vibeSwitch() {
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(50, 200)]);
        }
    }

    // Distanz: < 1000 m als ganze Meter, ab 1000 m als km (2 Nachkommastellen).
    hidden function _distVal(m) {
        return m < 1000 ? m.toNumber().toString() : (m / 1000.0).format("%.2f");
    }
    hidden function _distUnit(m) {
        return m < 1000 ? "m" : "km";
    }

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
