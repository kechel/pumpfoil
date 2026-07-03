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

    // Öffnet „Foil & Alarm" — drei unabhängige Achsen: Foil (Metadaten), Alarm An/Aus,
    // Schwellen-Quelle (Auto aus Foil / Manuell mit Min/Max auf der Uhr). Nur Auswahl, kein Start.
    hidden function _openFoilMenu() as Void {
        FoilMenuDelegate.show(_rec);
    }

    // Loslassen vor 3 s = Stop abbrechen.
    function onKeyReleased(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER && _rec.stopHoldStartMs != null) {
            var held = System.getTimer() - _rec.stopHoldStartMs;
            _cancelHold();
            if (held >= _rec.STOP_HOLD_MS) { _rec.stop(); _showUploadIfConnected(); }
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
            _showUploadIfConnected();
        }
        WatchUi.requestUpdate();
    }

    // Nach dem Stopp: bei Telefon-Verbindung den Upload-Screen (mit Fortschritt)
    // automatisch öffnen — er startet den Upload selbst (Uploader.syncAll, derselbe
    // robuste Pfad wie der manuelle Upload). Ohne Verbindung bleibt der Erfolgs-Screen
    // (Daten liegen sicher in Storage, Upload später).
    hidden function _showUploadIfConnected() as Void {
        if (Uploader.phoneConnected() && Uploader.pendingCount() > 0) {
            WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
        }
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
        // Auf dem „Gespeichert"-Screen: BACK -> zurück zum Start-Screen, statt die App zu verlassen.
        if (_rec.stopped) { _rec.stopped = false; WatchUi.requestUpdate(); return true; }
        return false;
    }
}

// Foil-Auswahl beim Start: gewähltes Foil setzt den Auto-Alarm, dann Aufnahme starten.
// „Foil & Alarm"-Menü: Foil (Metadaten) + Alarm An/Aus + Schwellen-Quelle (Auto/Manuell)
// mit Min/Max direkt auf der Uhr. Back (ohne Foil-Auswahl) behält die aktuelle Auswahl.
class FoilMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;
    function initialize(recorder) {
        Menu2InputDelegate.initialize();
        _rec = recorder;
    }

    // Menü frisch aufbauen + anzeigen (auch für Rebuild nach Min/Max-Änderung).
    static function show(rec) as Void {
        var menu = new WatchUi.Menu2({:title => "Foil & Alarm"});
        menu.addItem(new WatchUi.MenuItem("Alarm", rec.alarmEnabled ? "An" : "Aus", :alarm, {}));
        menu.addItem(new WatchUi.MenuItem("Schwellen",
            rec.alarmSource.equals("foil") ? "Auto (Foil)" : "Manuell", :source, {}));
        if (rec.alarmSource.equals("manual")) {
            menu.addItem(new WatchUi.MenuItem("Min", rec.speedLowKmh.toString() + " km/h", :min, {}));
            menu.addItem(new WatchUi.MenuItem("Max", rec.speedHighKmh.toString() + " km/h", :max, {}));
        }
        for (var i = 0; i < rec.foils.size(); i++) {
            var f = rec.foils[i];
            var sel = (rec.sessionFoilId == f["id"]) ? "> " : "";
            menu.addItem(new WatchUi.MenuItem(
                sel + f["label"], f["min"].toString() + "–" + f["max"].toString() + " km/h", i, {}));
        }
        menu.addItem(new WatchUi.MenuItem("Keine Foil",
            rec.sessionFoilId == null ? "> nur Metadaten" : "nur Metadaten", :none, {}));
        WatchUi.pushView(menu, new FoilMenuDelegate(rec), WatchUi.SLIDE_UP);
    }

    // Menü ersetzen (nach Layout-Änderung Manuell<->Auto oder Min/Max-Edit).
    hidden function _rebuild() as Void {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        FoilMenuDelegate.show(_rec);
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :alarm) {
            _rec.alarmEnabled = !_rec.alarmEnabled;      // An/Aus, unabhängig von Foil
            item.setSubLabel(_rec.alarmEnabled ? "An" : "Aus");
            WatchUi.requestUpdate();
            return;
        }
        if (id == :source) {
            _rec.alarmSource = _rec.alarmSource.equals("foil") ? "manual" : "foil";
            _rebuild();                                  // Min/Max erscheinen/verschwinden
            return;
        }
        if (id == :min || id == :max) {
            var cur = (id == :min) ? _rec.speedLowKmh : _rec.speedHighKmh;
            var picker = new WatchUi.Picker({
                :title => new WatchUi.Text({:text => (id == :min) ? "Min km/h" : "Max km/h",
                    :locX => WatchUi.LAYOUT_HALIGN_CENTER, :locY => WatchUi.LAYOUT_VALIGN_BOTTOM,
                    :color => Graphics.COLOR_WHITE}),
                :pattern => [new NumFactory(0, 80, 1)], :defaults => [cur]});
            WatchUi.pushView(picker, new MinMaxPickerDelegate(_rec, id == :min), WatchUi.SLIDE_LEFT);
            return;
        }
        if (id instanceof Lang.Number) {
            var f = _rec.foils[id];
            _rec.sessionFoilId = f["id"];                // Foil = Metadaten (+ Auto-Schwellen)
            _rec.activeAlarmLabel = f["label"];
        } else if (id == :none) {
            _rec.sessionFoilId = null;                   // keine Foil
            _rec.activeAlarmLabel = "-";
        }
        // Foil-Auswahl gesetzt -> zurück zum Start-Screen (Alarm-Zustand bleibt).
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        WatchUi.requestUpdate();
    }
}

// Zahlen-Factory für den Min/Max-Picker (0..80 km/h). getValue = angezeigter Wert (Index=Wert bei step 1).
class NumFactory extends WatchUi.PickerFactory {
    hidden var _min, _max, _step;
    function initialize(mn, mx, st) {
        PickerFactory.initialize();
        _min = mn; _max = mx; _step = st;
    }
    function getSize() { return (_max - _min) / _step + 1; }
    function getValue(index) { return _min + index * _step; }
    function getDrawable(index, selected) {
        return new WatchUi.Text({
            :text => getValue(index).toString(),
            :color => Graphics.COLOR_WHITE, :font => Graphics.FONT_NUMBER_MEDIUM,
            :locX => WatchUi.LAYOUT_HALIGN_CENTER, :locY => WatchUi.LAYOUT_VALIGN_CENTER});
    }
}

// Zahlenpicker für die manuellen Min/Max-Schwellen (direkt auf der Uhr).
class MinMaxPickerDelegate extends WatchUi.PickerDelegate {
    hidden var _rec;
    hidden var _isMin;
    function initialize(recorder, isMin) {
        PickerDelegate.initialize();
        _rec = recorder;
        _isMin = isMin;
    }
    function onAccept(values) as Lang.Boolean {
        var v = values[0];
        if (_isMin) { _rec.speedLowKmh = v; } else { _rec.speedHighKmh = v; }
        // Picker schließen, dann das Menü mit aktualisiertem Wert neu aufbauen.
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);   // Picker weg
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);   // altes Menü weg
        FoilMenuDelegate.show(_rec);
        return true;
    }
    function onCancel() as Lang.Boolean {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        return true;
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
            WatchUi.switchToView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else if (id == :verbinden) {
            if (!_rec.isPaired()) { _rec.startPairing(); }
            // Menü ersetzen durch die Pair-Ansicht (zeigt Code + pollt auf Bestätigung).
            WatchUi.switchToView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
        }
    }
}
