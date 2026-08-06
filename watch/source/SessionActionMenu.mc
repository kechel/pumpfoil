using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
using Toybox.Lang;

// Aktions-Menü der laufenden Aufnahme (Garmin): erscheint nach 3 s ENTER-Halten. Längeres Halten
// tut nichts. DOWN blättert: 1×=Speichern, 2×=Pausieren, 3×=Verwerfen; START bestätigt; BACK bricht
// ab (Aufnahme läuft weiter). OHNE Eingabe wird nach 5 s automatisch GESPEICHERT (sichere Vorauswahl).
// (:full) -> im Lite-Build (96-KB-Uhren) ausgeschlossen; dort Halten-3s = direkt Speichern.
(:full)
class SessionActionView extends WatchUi.View {
    hidden var _sel = -1;        // -1 = nichts gewählt (Default = erster Eintrag); 0=Save 1=Pause 2=Discard
    hidden var _remaining = 5;   // Sekunden bis Auto-Speichern
    // Beschriftungen als Schlüssel, damit dieselbe Ansicht auch das PAUSEN-Menü zeichnet
    // (Fortsetzen / Abbrechen / Ende & speichern). Default = das Stop-Menü wie bisher.
    hidden var _keys = ["rec.save", "rec.pause", "rec.discard"];
    hidden var _countdown = true;   // Pausen-Menü: KEIN Auto-Ablauf (s. PauseActionDelegate)

    function setKeys(k) { _keys = k; }
    function setCountdown(c) { _countdown = c; }
    function count() { return _keys.size(); }

    function sel() { return _sel; }
    function setSel(s) { _sel = s; }
    function setRemaining(r) { _remaining = r; }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var labels = new [_keys.size()];
        for (var i = 0; i < _keys.size(); i++) { labels[i] = Strings.s(_keys[i]); }
        var ys = [0.30, 0.50, 0.70];
        for (var i = 0; i < labels.size(); i++) {
            var hot = (i == _sel);
            // Nicht gewählt = WEISS, nicht grau: das Menü kommt am Wasser bei Sonne, und DK_GRAY
            // ist auf einem MIP-Display im Sonnenlicht nicht lesbar (Jan im Feld). Die Auswahl
            // hebt sich weiter über Cyan + größeren Font ab.
            dc.setColor(hot ? Config.BRAND_CYAN : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * ys[i], hot ? Graphics.FONT_MEDIUM : Graphics.FONT_TINY,
                labels[i], Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        // Auto-Speichern-Countdown unten — ebenfalls weiß (gleicher Sonnenlicht-Grund), bleibt
        // durch FONT_XTINY trotzdem klar zweitrangig. Im PAUSEN-Menü gibt es ihn nicht: dort
        // läuft nichts von selbst ab (man sitzt womöglich minutenlang im Wasser).
        if (_countdown) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.88, Graphics.FONT_XTINY,
                Strings.s("rec.save") + " " + _remaining.toString() + " s",
                Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.10, Graphics.FONT_XTINY, Strings.s("rec.paused"),
                Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

// Pausen-Menü: START in der Pause beendete die Pause bisher SOFORT. Jetzt kommt derselbe Screen
// wie beim Beenden — Fortsetzen / Abbrechen / Ende & speichern (Jans Wunsch 06.08.). Warum das
// besser ist: aus der Pause heraus wollte man bisher entweder weiterfahren ODER Schluss machen,
// und für Letzteres musste man erst fortsetzen und dann 3 s halten. Vorwahl ist „Fortsetzen",
// damit die alte Bewegung (START, START) weiter zum Weiterfahren führt.
// KEIN Auto-Ablauf: in der Pause sitzt man womöglich lange im Wasser, da darf nichts von selbst
// passieren. BACK und „Abbrechen" tun dasselbe: zurück in die Pause.
(:full)
class PauseActionDelegate extends WatchUi.BehaviorDelegate {
    hidden var _rec;
    hidden var _view;
    hidden var _done = false;

    function initialize(rec, view) {
        BehaviorDelegate.initialize();
        _rec = rec;
        _view = view;
    }

    function onNextPage() as Lang.Boolean { _move(1); return true; }       // DOWN
    function onPreviousPage() as Lang.Boolean { _move(-1); return true; }  // UP

    hidden function _move(d) as Void {
        var s = _view.sel() + d;
        if (s < 0) { s = 0; }
        if (s > _view.count() - 1) { s = _view.count() - 1; }
        _view.setSel(s);
        WatchUi.requestUpdate();
    }

    function onKeyPressed(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            // Ohne Auswahl passiert NICHTS (Jan 06.08.): der Screen soll eine bewusste
            // Entscheidung erzwingen, zweimal START darf die Pause nicht beenden. Anders als
            // im Stop-Menü gibt es hier also keine sichere Vorauswahl — in der Pause ist
            // „aus Versehen weiterfahren" schlimmer als „nichts passiert".
            var s = _view.sel();
            if (s < 0) { return true; }
            _perform(s);
            return true;
        }
        return false;
    }

    function onBack() as Lang.Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);   // abbrechen -> Pause läuft weiter
        return true;
    }

    hidden function _perform(sel) as Void {
        if (_done) { return; }
        _done = true;
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        if (sel == 0) {
            _rec.resume();
        } else if (sel == 2) {
            _rec.stop();
            if (Uploader.pendingCount() > 0 && Uploader.phoneConnected()) {
                WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
            }
        }
        // sel == 1 (Abbrechen): nichts tun, die Pause bleibt.
        WatchUi.requestUpdate();
    }
}

(:full)
class SessionActionDelegate extends WatchUi.BehaviorDelegate {
    hidden var _rec;
    hidden var _view;
    hidden var _timer;
    hidden var _left = 5;
    hidden var _done = false;

    function initialize(rec, view) {
        BehaviorDelegate.initialize();
        _rec = rec;
        _view = view;
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function onTick() as Void {
        _left--;
        if (_left <= 0) { _perform(0); return; }   // 5 s ohne Eingabe -> Speichern
        _view.setRemaining(_left);
        WatchUi.requestUpdate();
    }

    function onNextPage() as Lang.Boolean { _move(1); return true; }       // DOWN
    function onPreviousPage() as Lang.Boolean { _move(-1); return true; }  // UP

    hidden function _move(d) as Void {
        var s = _view.sel() + d;
        if (s < 0) { s = 0; }
        if (s > 2) { s = 2; }
        _view.setSel(s);
        _left = 5; _view.setRemaining(_left);   // Auto-Timer neu starten, solange man wählt
        WatchUi.requestUpdate();
    }

    function onKeyPressed(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            var s = _view.sel();
            _perform(s < 0 ? 0 : s);   // nichts gewählt -> Speichern
            return true;
        }
        return false;
    }

    function onBack() as Lang.Boolean {
        _stopTimer();
        WatchUi.popView(WatchUi.SLIDE_RIGHT);   // abbrechen -> Aufnahme läuft weiter
        return true;
    }

    hidden function _stopTimer() as Void {
        if (_timer != null) { _timer.stop(); _timer = null; }
    }

    hidden function _perform(sel) as Void {
        if (_done) { return; }
        _done = true;
        _stopTimer();
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        if (sel == 0) {
            _rec.stop();
            if (Uploader.pendingCount() > 0 && Uploader.phoneConnected()) {
                WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
            }
        } else if (sel == 1) {
            _rec.pause();
        } else {
            _rec.discard();
        }
        WatchUi.requestUpdate();
    }
}
