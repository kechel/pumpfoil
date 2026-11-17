using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
using Toybox.Lang;
using Toybox.System;

// On-Device-Settings (AppBase.getSettingsView): erscheint im Vorab-Menü an der
// Aktivitäten-Auswahl ("Pumpfoil markieren -> MENU halten -> Pumpfoil
// Einstellungen") — also OHNE die Aufnahme zu starten. Genau hier gehören
// Verbinden + Upload hin, da während der laufenden Aktivität kein Upload geht.
class SettingsMenu extends WatchUi.Menu2 {
    function initialize(rec) {
        Menu2.initialize({ :title => "Pumpfoil" });
        addItem(new WatchUi.MenuItem(
            rec.isPaired() ? Strings.s("menu.connected") : Strings.s("menu.connect"),
            rec.isPaired() ? Strings.s("menu.linked") : Strings.s("menu.genCode"),
            :verbinden, {}));
        addItem(new WatchUi.MenuItem(
            Strings.s("menu.upload"), Strings.s("menu.uploadSub"), :upload, {}));
        LoeschAbfrage.eintrag(self);
    }
}

// „Lokale Aufnahmen loeschen" (Jan, 17.11.2026) — fuer alle, die ohne Handy fahren und ihre FIT-Dateien per USB
// hochladen oder ueber Garmin Connect bekommen; sonst fuellen unsere Puffer den Speicher (s. Uploader.discardAll).
// Nur sichtbar, wenn etwas wartet; immer mit Rueckfrage. NICHT im LITE-Build (96-KB-Uhren, Spitze 89/92 KB):
// dort kostete es ~1,9 KB; leere Fassung darunter.
(:full)
module LoeschAbfrage {
    function eintrag(menu) as Void {
        var n = Uploader.pendingCount();
        if (n == 0) { return; }
        menu.addItem(new WatchUi.MenuItem(Strings.s("menu.discard"), n + " " + Strings.s("up.open"), :loeschen, {}));
    }
    function frage(item) as Void {
        var v = new LoeschView();
        WatchUi.pushView(v, new LoeschDelegate(item, v), WatchUi.SLIDE_LEFT);
    }
}

(:lite)
module LoeschAbfrage {
    function eintrag(menu) as Void { }
    function frage(item) as Void { }
}

// Eigene Rueckfrage statt WatchUi.Confirmation (Jan, 17.11.2026): wie das Aufnahme-Menue mit UP/DOWN waehlen, Auswahl
// cyan, START bestaetigt. „Abbrechen" ist vorgewaehlt; „Loeschen" will START 2 s GEHALTEN (roter Ring wie beim Stoppen),
// Loslassen vorher bricht ab. Die System-Rueckfrage schnitt den Text ab und war per Taste kaum zu bedienen.
(:full)
class LoeschView extends WatchUi.View {
    hidden var _sel = 0;          // 0 = Abbrechen, 1 = Loeschen
    hidden var _halt = 0.0;       // 0..1 Fortschritt des Haltens
    function initialize() { View.initialize(); }
    function sel() { return _sel; }
    function setSel(s) { _sel = s; }
    function setHalt(p) { _halt = p; }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        if (_halt > 0) {
            dc.setPenWidth(12);
            dc.setColor(FARBE_ROT, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(w / 2, h / 2, (w < h ? w : h) / 2 - 8, Graphics.ARC_CLOCKWISE, 90, 90.0 - 360.0 * _halt);
            dc.setPenWidth(1);
        }
        // Frage oben, bei Bedarf zweizeilig (am Leerzeichen nahe der Mitte getrennt).
        var f = Graphics.FONT_XTINY;
        var t = Strings.s("del.ask");
        var fh = dc.getFontHeight(f);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        if (dc.getTextWidthInPixels(t, f) <= w * 0.68) {
            dc.drawText(w / 2, h * 0.24, f, t, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            var ch = t.toCharArray();
            var mitte = ch.size() / 2;
            var cut = -1;
            for (var d = 0; d <= mitte && cut < 0; d++) {
                if (mitte + d < ch.size() && ch[mitte + d] == ' ') { cut = mitte + d; }
                else if (ch[mitte - d] == ' ') { cut = mitte - d; }
            }
            if (cut < 0) { cut = mitte; }
            dc.drawText(w / 2, h * 0.24 - fh / 2, f, t.substring(0, cut), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(w / 2, h * 0.24 + fh / 2, f, t.substring(cut + 1, t.length()), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        var keys = ["rec.cancel", "rec.discardHold"];
        var ys = [0.52, 0.72];
        for (var i = 0; i < 2; i++) {
            var hot = (i == _sel);
            dc.setColor(hot ? FARBE_CYAN : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * ys[i], hot ? Graphics.FONT_MEDIUM : Graphics.FONT_TINY,
                Strings.s(keys[i]), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}

(:full)
class LoeschDelegate extends WatchUi.BehaviorDelegate {
    hidden var _item;
    hidden var _view;
    hidden var _timer = null;
    hidden var _start = null;
    hidden var _done = false;
    const HALTEN_MS = 2000;

    function initialize(item, view) {
        BehaviorDelegate.initialize();
        _item = item;
        _view = view;
    }

    function onNextPage() as Lang.Boolean { _wahl(1); return true; }       // DOWN
    function onPreviousPage() as Lang.Boolean { _wahl(0); return true; }   // UP
    hidden function _wahl(s) as Void {
        if (_start != null) { return; }
        _view.setSel(s);
        WatchUi.requestUpdate();
    }

    function onKeyPressed(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() != WatchUi.KEY_ENTER) { return false; }
        if (_view.sel() == 0) { _zu(); return true; }
        _start = System.getTimer();
        if (_timer == null) { _timer = new Timer.Timer(); }
        _timer.start(method(:onTick), 50, true);
        return true;
    }

    function onKeyReleased(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() != WatchUi.KEY_ENTER || _start == null) { return false; }
        _abbrechen();   // vor Ablauf losgelassen -> nichts loeschen
        return true;
    }

    function onTick() as Void {
        if (_start == null) { return; }
        var p = (System.getTimer() - _start).toFloat() / HALTEN_MS;
        if (p >= 1.0) {
            _abbrechen();
            if (_done) { return; }
            _done = true;
            Uploader.discardAll();
            _item.setSubLabel(Strings.s("del.done"));
            _zu();
            return;
        }
        _view.setHalt(p);
        WatchUi.requestUpdate();
    }

    function onBack() as Lang.Boolean { _zu(); return true; }

    hidden function _abbrechen() as Void {
        if (_timer != null) { _timer.stop(); }
        _start = null;
        _view.setHalt(0.0);
        WatchUi.requestUpdate();
    }

    hidden function _zu() as Void {
        if (_timer != null) { _timer.stop(); _timer = null; }
        _start = null;
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

class SettingsMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;

    function initialize(rec) {
        Menu2InputDelegate.initialize();
        _rec = rec;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :verbinden) {
            if (!_rec.isPaired()) { _rec.startPairing(); }
            else { _rec.pairing = false; }   // gepairt geöffnet -> Verbunden-Screen (kein stale Pair-Status)
            WatchUi.pushView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else if (id == :upload) {
            WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else if (id == :loeschen) {
            LoeschAbfrage.frage(item);
        }
    }
}

// Upload-Ansicht mit Live-Status: Telefon-Verbindung oben, darunter Fortschritt
// (Chunk-Balken + offene Sessions). Bricht die Verbindung ab, sieht man es sofort;
// kommt sie zurück, setzt der Delegate den Upload automatisch fort.
class UploadView extends WatchUi.View {
    hidden var _startCount;
    hidden var _rec;

    function initialize(rec) {
        View.initialize();
        _rec = rec;
        _startCount = Uploader.pendingCount();
        Uploader.watch().reset();   // manuell geöffnet -> Auto-Retry-Backoff von vorn
        if (_startCount > 0) {
            if (Uploader.phoneConnected()) { Uploader.syncAll(); }   // sofort versuchen -> Watchdog plant den Rest
            else { Uploader.watch().arm(); }                         // offline: Watchdog scharf (Reconnect/Backoff)
        }
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var pending = Uploader.pendingCount();
        var busy = Uploader.isBusy();
        var connected = Uploader.phoneConnected();

        // Verbindungsstatus oben — die Kernfrage „habe ich überhaupt Verbindung?".
        dc.setColor(connected ? FARBE_GRUEN : FARBE_ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w / 2 - 52, h * 0.16, 5);
        dc.drawText(w / 2 - 42, h * 0.16, Graphics.FONT_XTINY,
            connected ? Strings.s("up.connected") : Strings.s("up.noPhone"),
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        if (_startCount == 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.45, Graphics.FONT_MEDIUM, Strings.s("up.nothing"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(FARBE_DUNKEL, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, Strings.s("up.allDone"), Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        if (busy) {
            dc.setColor(FARBE_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.running"), Graphics.TEXT_JUSTIFY_CENTER);
            _drawBar(dc, w, h);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.78, Graphics.FONT_XTINY, pending + " " + Strings.s("up.open"), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (pending > 0) {
            // Nicht busy, aber noch offen -> warum? Klartext statt scheinbarem Hängen.
            var err = Uploader.lastError();
            if (err == :auth) {
                dc.setColor(FARBE_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.38, Graphics.FONT_MEDIUM, Strings.s("up.notLinked"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                // Direkte Aktion: START/Tap erzeugt hier den Pairing-Code (PairView).
                // Fallback bleibt der MENU-Weg.
                dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, Strings.s("up.pairAction"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(FARBE_DUNKEL, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.58 + 20, Graphics.FONT_XTINY, Strings.s("up.linkHint"), Graphics.TEXT_JUSTIFY_CENTER);
            } else if (!connected) {
                // Wirklich kein Telefon -> auf Verbindung warten (Retry bringt ohne Telefon nichts).
                dc.setColor(FARBE_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.waitConn"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, pending + " " + Strings.s("up.open") + " — " + Strings.s("up.willResume"), Graphics.TEXT_JUSTIFY_CENTER);
            } else if (err == :offline || err == :server) {
                // Telefon verbunden, aber Server/Netz nicht erreichbar -> Countdown zum nächsten Versuch.
                var eta = Uploader.retryEtaSecs();
                dc.setColor(FARBE_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.serverUnreach"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                var sub = (eta >= 0) ? (Strings.s("up.retryIn") + " " + eta + " s") : Strings.s("up.later");
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, sub, Graphics.TEXT_JUSTIFY_CENTER);
            } else {
                dc.setColor(FARBE_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.waiting"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, pending + " " + Strings.s("up.open"), Graphics.TEXT_JUSTIFY_CENTER);
            }
        } else {
            dc.setColor(FARBE_GRUEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.42, Graphics.FONT_MEDIUM, Strings.s("up.done"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.setPenWidth(4);
            dc.drawLine(w / 2 - 14, h * 0.62, w / 2 - 4, h * 0.66);
            dc.drawLine(w / 2 - 4, h * 0.66, w / 2 + 16, h * 0.58);
            dc.setPenWidth(1);
        }
    }

    // Chunk-Fortschrittsbalken der aktuellen Session.
    hidden function _drawBar(dc, w, h) {
        var total = Uploader.progressTotal();
        var sent = Uploader.progressSent();
        var barW = w * 0.6;
        var barX = w / 2 - barW / 2;
        var barY = h * 0.58;
        var barH = 10;
        dc.setColor(FARBE_DUNKEL, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(barX, barY, barW, barH);
        if (total > 0) {
            var frac = sent.toFloat() / total;
            if (frac > 1.0) { frac = 1.0; }
            dc.setColor(FARBE_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(barX, barY, barW * frac, barH);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, barY + barH + 12, Graphics.FONT_XTINY,
                sent + "/" + total, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

class UploadDelegate extends WatchUi.BehaviorDelegate {
    hidden var _timer;
    hidden var _rec;
    hidden var _doneTicks;

    function initialize(rec) {
        BehaviorDelegate.initialize();
        _rec = rec;
        _doneTicks = 0;
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    // 1×/s nur noch für die Anzeige: die Wiederholungen steuert jetzt der Uploader-Watchdog
    // (Backoff 3/10/30 s + Reconnect), damit der Screen einen sauberen Countdown zeigen kann,
    // statt jede Sekunde blind neu zu syncen.
    function onTick() as Void {
        var busy = Uploader.isBusy();
        var pending = Uploader.pendingCount();
        var err = Uploader.lastError();
        // Läuft ein sichtbarer Countdown (Telefon da, Server/Netz nicht erreichbar, Versuch geplant)?
        // Dann Screen halten, damit der Nutzer „Neuer Versuch in N s" mitläuft.
        var counting = Uploader.phoneConnected() && (err == :offline || err == :server)
                       && pending > 0 && Uploader.retryEtaSecs() >= 0;
        // ~3 s nachdem nichts mehr aktiv passiert automatisch zurück zum Start-Screen — egal ob
        // „Upload fertig", „Nicht verbunden" oder offline. Der Auto-Start läuft NUR dort; sonst
        // bleibt man auf dem Screen hängen und Losfahren startet keine neue Session.
        // Der Watchdog synct im Hintergrund weiter, auch nachdem dieser Screen zu ist.
        if (!busy && !counting) {
            _doneTicks += 1;
            if (_doneTicks >= 3) {
                if (_timer != null) { _timer.stop(); }
                WatchUi.popView(WatchUi.SLIDE_RIGHT);
                return;
            }
        } else {
            _doneTicks = 0;
        }
        WatchUi.requestUpdate();
    }

    // START/Tap: ist die Uhr nicht verbunden, direkt den Pairing-Code-Screen öffnen
    // (statt nur auf MENU zu verweisen — MENU greift hier im gepushten Upload-Screen nicht).
    function onSelect() as Lang.Boolean {
        if (_rec != null && !_rec.isPaired()) {
            if (_timer != null) { _timer.stop(); }
            _rec.startPairing();
            WatchUi.pushView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
            return true;
        }
        return false;
    }

    function onBack() as Lang.Boolean {
        if (_timer != null) { _timer.stop(); }
        return false;
    }
}
