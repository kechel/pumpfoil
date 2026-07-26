using Toybox.WatchUi;
using Toybox.Timer;
using Toybox.System;
using Toybox.Lang;
using Toybox.Attention;

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

    // Loslassen:
    //   < 3 s  -> nichts (Schutz gegen versehentliches Stoppen); PAUSIERT + kurzer Druck = Fortsetzen
    //   ≥ 3 s  -> das Aktions-Menü ist beim Halten (onHoldTick) schon aufgegangen -> hier nichts mehr
    function onKeyReleased(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER && _rec.stopHoldStartMs != null) {
            var held = System.getTimer() - _rec.stopHoldStartMs;
            _cancelHold();
            if (held < _rec.STOP_HOLD_MS && _rec.isPaused()) { _rec.resume(); }
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    // Während des Haltens: Ring animieren; bei 3 s Menü öffnen (Speichern/Verwerfen/Pausieren).
    // Längeres Halten tut NICHTS mehr (kein versehentliches Verwerfen).
    // (:full) — volle App: Aktions-Menü. Lite (96-KB-Uhren) nutzt die schlanke Variante unten.
    (:full)
    function onHoldTick() as Void {
        if (_rec.stopHoldStartMs == null) { return; }
        var held = System.getTimer() - _rec.stopHoldStartMs;
        if (held >= _rec.STOP_HOLD_MS) {
            _cancelHold();
            if (Toybox has :Attention && Attention has :vibrate) {
                try { Attention.vibrate([new Attention.VibeProfile(75, 200)]); } catch (e) {}
            }
            var av = new SessionActionView();
            WatchUi.pushView(av, new SessionActionDelegate(_rec, av), WatchUi.SLIDE_LEFT);
            WatchUi.requestUpdate();
            return;
        }
        WatchUi.requestUpdate();
    }

    // (:lite) — 96-KB-Uhren: kein Aktions-Menü (spart Code+Heap). 3 s Halten = direkt
    // stoppen+speichern; danach ggf. Upload-Screen (wie das „Speichern" im vollen Menü).
    (:lite)
    function onHoldTick() as Void {
        if (_rec.stopHoldStartMs == null) { return; }
        var held = System.getTimer() - _rec.stopHoldStartMs;
        if (held >= _rec.STOP_HOLD_MS) {
            _cancelHold();
            if (Toybox has :Attention && Attention has :vibrate) {
                try { Attention.vibrate([new Attention.VibeProfile(75, 200)]); } catch (e) {}
            }
            _rec.stop();
            _showUploadIfConnected();
            WatchUi.requestUpdate();
            return;
        }
        WatchUi.requestUpdate();
    }

    // Nach dem Stopp: bei Telefon-Verbindung den Upload-Screen (mit Fortschritt)
    // automatisch öffnen — er startet den Upload selbst (Uploader.syncAll, derselbe
    // robuste Pfad wie der manuelle Upload). Ohne Verbindung bleibt der Erfolgs-Screen
    // (Daten liegen sicher in Storage, Upload später).
    hidden function _showUploadIfConnected() as Void {
        if (Uploader.pendingCount() <= 0) { return; }
        if (Uploader.phoneConnected()) {
            // Verbindungs-Fall -> nur der Upload-Screen ("Upload fertig"). Kein „Gespeichert"
            // darunter (stopped=false), sonst kämen beide. BACK vom Upload-Screen -> Start.
            _rec.stopped = false;
            WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else {
            // Ohne Verbindung bleibt der Erfolgs-Screen, aber der Watchdog läuft im Hintergrund
            // weiter -> verbindet sich das Telefon, solange die App offen ist, geht es von selbst raus.
            Uploader.watch().arm();
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
        // Noch nicht verknüpft + nichts zu konfigurieren (keine Foils/Alarm ohne CONFIG):
        // DOWN öffnet stattdessen das Pairing, statt ins Leere zu laufen.
        if (!_rec.isPaired()) {
            _rec.startPairing();
            WatchUi.pushView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
            return true;
        }
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
        var menu = new WatchUi.Menu2({:title => Strings.s("menu.settings")});
        menu.addItem(new WatchUi.MenuItem(
            _rec.isPaired() ? Strings.s("menu.connected") : Strings.s("menu.connect"),
            _rec.isPaired() ? Strings.s("menu.linked") : Strings.s("menu.genCode"),
            :verbinden, {}));
        menu.addItem(new WatchUi.MenuItem(
            Strings.s("menu.upload"), Strings.s("menu.uploadSub"), :upload, {}));
        menu.addItem(new WatchUi.MenuItem(
            Strings.s("menu.autostart"), _rec.autoStartOn() ? Strings.s("common.on") : Strings.s("common.off"), :autostart, {}));
        _addLayoutItem(menu);
        WatchUi.pushView(menu, new MenuDelegate(_rec), WatchUi.SLIDE_UP);
        return true;
    }

    // Not-Aus für die dynamischen Layouts — Stufe 1 des Sicherheitsnetzes. MUSS ohne Handy und
    // ohne Server erreichbar sein: rein lokaler Storage-Schalter. Zeigt der Punkt „Aus", fährt
    // die Uhr die alte statische Logik, auch wenn der Server Layouts liefert.
    (:full) hidden function _layoutState() as Lang.String {
        // Nicht „An" behaupten, wenn faktisch statisch gefahren wird: nach einem Absturz sperrt die
        // Selbstheilung diese Sitzung (Jan hatte genau das — Schalter „An", Layouts trotzdem weg).
        // Auswählen hebt die Sperre bewusst wieder auf.
        if (_rec.layoutCrash) { return Strings.s("lay.fallback"); }
        // „Automatisch" zeigt zusätzlich, was daraus gerade folgt — sonst rät man, was der Server
        // geliefert hat (und genau das war nicht nachprüfbar).
        if (_rec.layoutsAuto()) {
            return Strings.s("common.auto") + " ("
                + (_rec.layoutsWanted() ? Strings.s("common.on") : Strings.s("common.off")) + ")";
        }
        return Strings.s(_rec.layoutsWanted() ? "common.on" : "common.off");
    }
    (:full) hidden function _addLayoutItem(menu) as Void {
        menu.addItem(new WatchUi.MenuItem(
            Strings.s("menu.layouts"), _layoutState(), :layouts, {}));
    }
    (:lite) hidden function _addLayoutItem(menu) as Void { }

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

    // Menü frisch aufbauen + anzeigen (auch für Rebuild nach Min/Max-Änderung). focusId (:source/
    // :min/:max/null) hält den Fokus nach einem Rebuild an der Stelle, statt oben zu landen.
    static function show(rec) as Void { showFocused(rec, null); }
    static function showFocused(rec, focusId) as Void {
        var menu = new WatchUi.Menu2({:title => Strings.s("fm.title")});
        var idx = 0;
        var focusIdx = -1;
        menu.addItem(new WatchUi.MenuItem(Strings.s("fm.alarm"), rec.alarmEnabled ? Strings.s("common.on") : Strings.s("common.off"), :alarm, {})); idx++;
        if (focusId == :source) { focusIdx = idx; }
        menu.addItem(new WatchUi.MenuItem(Strings.s("fm.thresholds"),
            rec.alarmSource.equals("foil") ? Strings.s("fm.autoFoil") : Strings.s("fm.manual"), :source, {})); idx++;
        if (rec.alarmSource.equals("manual")) {
            if (focusId == :min) { focusIdx = idx; }
            menu.addItem(new WatchUi.MenuItem(Strings.s("fm.min"), rec.speedLowKmh.toString() + " km/h", :min, {})); idx++;
            if (focusId == :max) { focusIdx = idx; }
            menu.addItem(new WatchUi.MenuItem(Strings.s("fm.max"), rec.speedHighKmh.toString() + " km/h", :max, {})); idx++;
        }
        for (var i = 0; i < rec.foils.size(); i++) {
            var f = rec.foils[i];
            var sel = (rec.sessionFoilId == f["id"]) ? "> " : "";
            menu.addItem(new WatchUi.MenuItem(
                sel + f["label"], f["min"].toString() + "–" + f["max"].toString() + " km/h", i, {})); idx++;
        }
        menu.addItem(new WatchUi.MenuItem(Strings.s("fm.noFoil"),
            (rec.sessionFoilId == null ? "> " : "") + Strings.s("fm.metaOnly"), :none, {}));
        if (focusIdx >= 0 && menu has :setFocus) { menu.setFocus(focusIdx); }
        WatchUi.pushView(menu, new FoilMenuDelegate(rec), WatchUi.SLIDE_UP);
    }

    // Menü ersetzen (nach Layout-Änderung Manuell<->Auto oder Min/Max-Edit); Fokus optional halten.
    hidden function _rebuild() as Void { _rebuildFocused(:source); }
    hidden function _rebuildFocused(focusId) as Void {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        FoilMenuDelegate.showFocused(_rec, focusId);
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :alarm) {
            _rec.alarmEnabled = !_rec.alarmEnabled;      // An/Aus, unabhängig von Foil
            item.setSubLabel(_rec.alarmEnabled ? Strings.s("common.on") : Strings.s("common.off"));
            WatchUi.requestUpdate();
            return;
        }
        if (id == :source) {
            _rec.alarmSource = _rec.alarmSource.equals("foil") ? "manual" : "foil";
            _rebuild();                                  // Min/Max erscheinen/verschwinden
            return;
        }
        if (id == :min || id == :max) {
            var isMin = (id == :min);
            var cur = isMin ? _rec.speedLowKmh : _rec.speedHighKmh;
            var view = new MinMaxView(isMin ? Strings.s("fm.minKmh") : Strings.s("fm.maxKmh"), cur, 0, 80);
            WatchUi.pushView(view, new MinMaxDelegate(_rec, isMin, view), WatchUi.SLIDE_LEFT);
            return;
        }
        if (id instanceof Lang.Number) {
            var f = _rec.foils[id];
            _rec.sessionFoilId = f["id"];                // Foil = Metadaten (+ Auto-Schwellen)
            _rec.activeAlarmLabel = f["label"];
            _rec.markFoilChosen();                       // eigene Wahl -> Default nie mehr überschreiben
        } else if (id == :none) {
            _rec.sessionFoilId = null;                   // keine Foil
            _rec.activeAlarmLabel = "-";
            _rec.markFoilChosen();
        }
        // Foil-Auswahl gesetzt -> zurück zum Start-Screen (Alarm-Zustand bleibt).
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        WatchUi.requestUpdate();
    }
}

// Eigene Min/Max-Ansicht statt WatchUi.Picker: fest schwarzer Hintergrund + weiße Schrift,
// damit sie in JEDEM Uhr-Theme (hell/dunkel) lesbar ist. UP/DOWN ändert den Wert, START/ENTER
// bestätigt, BACK bricht ab (Bereich 0..80 km/h).
class MinMaxView extends WatchUi.View {
    hidden var _title, _val, _min, _max;
    function initialize(title, val, mn, mx) {
        View.initialize();
        _title = title; _val = val; _min = mn; _max = mx;
    }
    function value() { return _val; }
    function inc() { if (_val < _max) { _val++; WatchUi.requestUpdate(); } }
    function dec() { if (_val > _min) { _val--; WatchUi.requestUpdate(); } }
    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.20, Graphics.FONT_MEDIUM, _title, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.44, Graphics.FONT_NUMBER_MEDIUM, _val.toString(),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.74, Graphics.FONT_XTINY, "UP/DOWN  START: OK", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

// Delegate für die Min/Max-Ansicht: UP/DOWN = +/-, START/ENTER = übernehmen, BACK = abbrechen.
class MinMaxDelegate extends WatchUi.BehaviorDelegate {
    hidden var _rec, _isMin, _view;
    function initialize(recorder, isMin, view) {
        BehaviorDelegate.initialize();
        _rec = recorder; _isMin = isMin; _view = view;
    }
    function onNextPage() { _view.dec(); return true; }      // DOWN
    function onPreviousPage() { _view.inc(); return true; }  // UP
    function onSelect() { _accept(); return true; }          // START/ENTER
    function onBack() { WatchUi.popView(WatchUi.SLIDE_IMMEDIATE); return true; }
    hidden function _accept() as Void {
        var v = _view.value();
        if (_isMin) { _rec.speedLowKmh = v; } else { _rec.speedHighKmh = v; }
        // Ansicht schließen, altes Menü weg, Menü neu aufbauen — Fokus bleibt auf dem Eintrag.
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);   // Min/Max-Ansicht weg
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);   // altes Menü weg
        FoilMenuDelegate.showFocused(_rec, _isMin ? :min : :max);
    }
}

class MenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;
    function initialize(recorder) {
        Menu2InputDelegate.initialize();
        _rec = recorder;
    }
    (:full) hidden function _layoutState() as Lang.String {
        if (_rec.layoutCrash) { return Strings.s("lay.fallback"); }
        if (_rec.layoutsAuto()) {
            return Strings.s("common.auto") + " ("
                + (_rec.layoutsWanted() ? Strings.s("common.on") : Strings.s("common.off")) + ")";
        }
        return Strings.s(_rec.layoutsWanted() ? "common.on" : "common.off");
    }
    (:full) hidden function _toggleLayouts(item) as Void {
        _rec.toggleLayouts();
        item.setSubLabel(_layoutState());
        WatchUi.requestUpdate();
    }
    (:lite) hidden function _toggleLayouts(item) as Void { }
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :upload) {
            // Upload-Ansicht mit Live-Status (startet den Sync selbst).
            WatchUi.switchToView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else if (id == :verbinden) {
            if (!_rec.isPaired()) { _rec.startPairing(); }
            // Menü ersetzen durch die Pair-Ansicht (zeigt Code + pollt auf Bestätigung).
            WatchUi.switchToView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else if (id == :autostart) {
            // Auto-Start auf der Uhr umschalten; Menüpunkt sofort aktualisieren.
            _rec.toggleAutoStart();
            item.setSubLabel(_rec.autoStartOn() ? Strings.s("common.on") : Strings.s("common.off"));
            WatchUi.requestUpdate();
        } else if (id == :layouts) {
            _toggleLayouts(item);
        }
    }
}
