using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
using Toybox.Lang;

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
            WatchUi.pushView(new PairView(_rec), new PairDelegate(_rec), WatchUi.SLIDE_LEFT);
        } else if (id == :upload) {
            WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
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
        if (_startCount > 0 && Uploader.phoneConnected()) { Uploader.syncAll(); }
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
        dc.setColor(connected ? Graphics.COLOR_GREEN : Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w / 2 - 52, h * 0.16, 5);
        dc.drawText(w / 2 - 42, h * 0.16, Graphics.FONT_XTINY,
            connected ? Strings.s("up.connected") : Strings.s("up.noPhone"),
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        if (_startCount == 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.45, Graphics.FONT_MEDIUM, Strings.s("up.nothing"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, Strings.s("up.allDone"), Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        if (busy) {
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.running"), Graphics.TEXT_JUSTIFY_CENTER);
            _drawBar(dc, w, h);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.78, Graphics.FONT_XTINY, pending + " " + Strings.s("up.open"), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (pending > 0) {
            // Nicht busy, aber noch offen -> warum? Klartext statt scheinbarem Hängen.
            var err = Uploader.lastError();
            if (err == :auth) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.38, Graphics.FONT_MEDIUM, Strings.s("up.notLinked"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                // Direkte Aktion: START/Tap erzeugt hier den Pairing-Code (PairView).
                // Fallback bleibt der MENU-Weg.
                dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, Strings.s("up.pairAction"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.58 + 20, Graphics.FONT_XTINY, Strings.s("up.linkHint"), Graphics.TEXT_JUSTIFY_CENTER);
            } else if (!connected || err == :offline) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.waitConn"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, pending + " " + Strings.s("up.open") + " — " + Strings.s("up.willResume"), Graphics.TEXT_JUSTIFY_CENTER);
            } else if (err == :server) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.serverErr"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, Strings.s("up.later"), Graphics.TEXT_JUSTIFY_CENTER);
            } else {
                dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("up.waiting"), Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, pending + " " + Strings.s("up.open"), Graphics.TEXT_JUSTIFY_CENTER);
            }
        } else {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
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
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(barX, barY, barW, barH);
        if (total > 0) {
            var frac = sent.toFloat() / total;
            if (frac > 1.0) { frac = 1.0; }
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
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

    function initialize(rec) {
        BehaviorDelegate.initialize();
        _rec = rec;
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    // 1×/s: Verbindung zurück + noch offen + nicht beschäftigt -> Upload fortsetzen.
    // So nimmt der Sync nach einem Verbindungsabbruch von selbst wieder auf.
    function onTick() as Void {
        if (!Uploader.isBusy() && Uploader.pendingCount() > 0 && Uploader.phoneConnected()) {
            Uploader.syncAll();
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
