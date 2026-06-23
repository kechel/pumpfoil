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
                _rec.start();
                WatchUi.requestUpdate();
            }
            return true;
        }
        return false;  // andere Tasten -> normale Behaviors (Menü/Back)
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

    // UP/DOWN -> zwischen konfigurierten Ansichten umschalten.
    function onNextPage() as Lang.Boolean {
        _view.nextScreen();
        WatchUi.requestUpdate();
        return true;
    }
    function onPreviousPage() as Lang.Boolean {
        _view.prevScreen();
        WatchUi.requestUpdate();
        return true;
    }

    // Menü -> Upload anstoßen (manuell, am besten bei WLAN).
    function onMenu() as Lang.Boolean {
        var menu = new WatchUi.Menu2({:title => "Foil"});
        menu.addItem(new WatchUi.MenuItem(
            WatchUi.loadResource(Rez.Strings.Upload), null, :upload, {}));
        WatchUi.pushView(menu, new MenuDelegate(_rec), WatchUi.SLIDE_UP);
        return true;
    }

    // Back während Aufzeichnung ignorieren (versehentliches Beenden vermeiden).
    function onBack() as Lang.Boolean {
        if (_rec.isRecording()) { return true; }
        return false;
    }
}

class MenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;
    function initialize(recorder) {
        Menu2InputDelegate.initialize();
        _rec = recorder;
    }
    function onSelect(item as WatchUi.MenuItem) as Void {
        if (item.getId() == :upload) {
            Uploader.syncAll();   // alle ausstehenden Sessions hochladen (ohne neue Aktivität)
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
