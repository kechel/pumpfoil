using Toybox.WatchUi;
using Toybox.Timer;
using Toybox.System;
using Toybox.Lang;

// Steuerung:
//   START/STOP (KEY_ENTER): kurzer Druck startet; im laufenden Betrieb muss man
//   3 s HALTEN, um zu stoppen+speichern (Ring-Indikator in der View). So kein
//   versehentliches Beenden beim Foilen.
//   Menü-Taste: Upload. 1-Hz-Tick aktualisiert Live-Werte.
class RecordDelegate extends WatchUi.BehaviorDelegate {

    hidden var _rec;
    hidden var _view;
    hidden var _timer;
    hidden var _holdTimer as Timer.Timer or Null = null;

    function initialize(recorder, view) {
        BehaviorDelegate.initialize();
        _rec = recorder;
        _view = view;
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function onTick() as Void {
        _rec.tick();
        WatchUi.requestUpdate();
    }

    // Tastendruck: START kurz = starten; START gedrückt halten (im Betrieb) = Stop-Halten.
    function onKeyPressed(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            if (_rec.isRecording()) {
                _rec.stopHoldStartMs = System.getTimer();
                if (_holdTimer == null) { _holdTimer = new Timer.Timer(); }
                _holdTimer.start(method(:onHoldTick), 50, true);
            } else {
                // START startet direkt mit dem auf dem Start-Screen gewählten Foil/Alarm
                // (Auswahl vorher per DOWN-Taste, s. onNextPage).
                _rec.start();
                WatchUi.requestUpdate();
            }
            return true;
        }
        return false;  // andere Tasten -> normale Behaviors (Menü/Back)
    }

    // Öffnet die Foil-/Alarm-Auswahl (Website-Alarm, Foils, Ohne) — setzt die Auswahl
    // für die nächste Aufnahme, ohne zu starten.
    hidden function _openFoilMenu() as Void {
        var menu = new WatchUi.Menu2({:title => "Foil / Alarm"});
        if (_rec.manualAlarm) {
            menu.addItem(new WatchUi.MenuItem(
                "Website",
                _rec.speedLowKmh.toString() + "–" + _rec.speedHighKmh.toString() + " km/h",
                :website, {}));
        }
        for (var i = 0; i < _rec.foils.size(); i++) {
            var f = _rec.foils[i];
            menu.addItem(new WatchUi.MenuItem(
                f["label"],
                f["min"].toString() + "–" + f["max"].toString() + " km/h",
                i, {}));
        }
        menu.addItem(new WatchUi.MenuItem("Ohne Alarm", "kein Alarm", :none, {}));
        WatchUi.pushView(menu, new FoilMenuDelegate(_rec), WatchUi.SLIDE_UP);
    }

    // Loslassen vor 3 s = Stop abbrechen.
    function onKeyReleased(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER && _rec.stopHoldStartMs != null) {
            var held = System.getTimer() - _rec.stopHoldStartMs;
            _cancelHold();
            if (held >= _rec.STOP_HOLD_MS) { _rec.stop(); }
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    // Während des Haltens: Ring animieren; bei 3 s automatisch stoppen.
    function onHoldTick() as Void {
        if (_rec.stopHoldStartMs != null && _rec.stopHoldProgress() >= 1.0) {
            _cancelHold();
            _rec.stop();
        }
        WatchUi.requestUpdate();
    }

    hidden function _cancelHold() as Void {
        _rec.stopHoldStartMs = null;
        if (_holdTimer != null) { _holdTimer.stop(); }
    }

    // UP/DOWN -> während Aufnahme zwischen den Datenansichten. Im Idle öffnet DOWN die
    // Foil-/Alarm-Auswahl (wenn Foils/Website-Alarm vorhanden) -> Vorauswahl VOR dem Start.
    function onNextPage() as Lang.Boolean {
        if (_rec.isRecording()) { _view.nextScreen(); WatchUi.requestUpdate(); return true; }
        if (_rec.manualAlarm || _rec.foils.size() >= 1) { _openFoilMenu(); return true; }
        return false;
    }
    function onPreviousPage() as Lang.Boolean {
        if (_rec.isRecording()) { _view.prevScreen(); WatchUi.requestUpdate(); return true; }
        return false;
    }

    // MENU (Mitte-links halten) -> App-Einstellungen, wie "Laufen Einstellungen" bei
    // nativen Aktivitäten. Nur im Idle (vor dem Start): Verbinden + Upload/Sync.
    // Während der Aufnahme ist beides nicht möglich -> Menü unterdrücken.
    function onMenu() as Lang.Boolean {
        if (_rec.isRecording()) { return true; }
        var menu = new WatchUi.Menu2({:title => "Einstellungen"});
        menu.addItem(new WatchUi.MenuItem(
            _rec.isPaired() ? "Verbunden" : "Verbinden",
            _rec.isPaired() ? "Konto verknüpft" : "Pairing-Code erzeugen",
            :verbinden, {}));
        menu.addItem(new WatchUi.MenuItem(
            "Upload / Sync", "ausstehende Sessions", :upload, {}));
        WatchUi.pushView(menu, new MenuDelegate(_rec), WatchUi.SLIDE_UP);
        return true;
    }

    // Back während Aufzeichnung ignorieren (versehentliches Beenden vermeiden).
    function onBack() as Lang.Boolean {
        if (_rec.isRecording()) { return true; }
        return false;
    }
}

// Foil-Auswahl beim Start: gewähltes Foil setzt den Auto-Alarm, dann Aufnahme starten.
// Back (ohne Auswahl) bricht ab und startet nicht.
class FoilMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;
    function initialize(recorder) {
        Menu2InputDelegate.initialize();
        _rec = recorder;
    }
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id instanceof Lang.Number) {
            var f = _rec.foils[id];
            _rec.applyFoilAlarm(f["min"], f["max"]);     // Foil-Auto-Alarm
            _rec.activeAlarmLabel = f["label"];
        } else if (id == :website) {
            _rec.alarmEnabled = true;                    // Website-Werte (bereits geladen)
            _rec.activeAlarmLabel = "Website";
        } else if (id == :none) {
            _rec.alarmEnabled = false;                   // kein Alarm für diese Session
            _rec.activeAlarmLabel = "Ohne";
        }
        // Nur Auswahl setzen, NICHT starten -> zurück zum Start-Screen.
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        WatchUi.requestUpdate();
    }
}

class MenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;
    function initialize(recorder) {
        Menu2InputDelegate.initialize();
        _rec = recorder;
    }
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :upload) {
            // Upload-Ansicht mit Live-Status (startet den Sync selbst).
            WatchUi.switchToView(new UploadView(), new UploadDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :verbinden) {
            if (!_rec.isPaired()) { _rec.startPairing(); }
            // Menü ersetzen durch die Pair-Ansicht (zeigt Code + pollt auf Bestätigung).
            WatchUi.switchToView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
        }
    }
}
