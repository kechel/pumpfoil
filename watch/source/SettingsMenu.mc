using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
using Toybox.Lang;

// On-Device-Settings (AppBase.getSettingsView): erscheint im Vorab-Menü an der
// Aktivitäten-Auswahl ("Pump Foil markieren -> MENU halten -> Pump Foil
// Einstellungen") — also OHNE die Aufnahme zu starten. Genau hier gehören
// Verbinden + Upload hin, da während der laufenden Aktivität kein Upload geht.
class SettingsMenu extends WatchUi.Menu2 {
    function initialize(rec) {
        Menu2.initialize({ :title => "Pump Foil" });
        addItem(new WatchUi.MenuItem(
            rec.isPaired() ? "Verbunden" : "Verbinden",
            rec.isPaired() ? "Konto verknüpft" : "Pairing-Code erzeugen",
            :verbinden, {}));
        addItem(new WatchUi.MenuItem(
            "Upload / Sync", "ausstehende Sessions", :upload, {}));
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
            WatchUi.pushView(new UploadView(), new UploadDelegate(), WatchUi.SLIDE_LEFT);
        }
    }
}

// Upload-Ansicht mit Live-Status: Telefon-Verbindung oben, darunter Fortschritt
// (Chunk-Balken + offene Sessions). Bricht die Verbindung ab, sieht man es sofort;
// kommt sie zurück, setzt der Delegate den Upload automatisch fort.
class UploadView extends WatchUi.View {
    hidden var _startCount;

    function initialize() {
        View.initialize();
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
            connected ? "Telefon verbunden" : "Kein Telefon",
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        if (_startCount == 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.45, Graphics.FONT_MEDIUM, "Nichts offen", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "alles hochgeladen", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        if (busy) {
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "Upload läuft…", Graphics.TEXT_JUSTIFY_CENTER);
            _drawBar(dc, w, h);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.78, Graphics.FONT_XTINY, pending + " offen", Graphics.TEXT_JUSTIFY_CENTER);
        } else if (pending > 0) {
            // Nicht busy, aber noch offen -> warum? Klartext statt scheinbarem Hängen.
            var err = Uploader.lastError();
            if (err == :auth) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "Nicht verbunden", Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "Konto verbinden (MENU)", Graphics.TEXT_JUSTIFY_CENTER);
            } else if (!connected || err == :offline) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "Wartet auf Verbindung", Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, pending + " offen — wird fortgesetzt", Graphics.TEXT_JUSTIFY_CENTER);
            } else if (err == :server) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "Server-Fehler", Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "später erneut", Graphics.TEXT_JUSTIFY_CENTER);
            } else {
                dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "Warte…", Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, pending + " offen", Graphics.TEXT_JUSTIFY_CENTER);
            }
        } else {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.42, Graphics.FONT_MEDIUM, "Fertig", Graphics.TEXT_JUSTIFY_CENTER);
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
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(barX, barY, barW * frac, barH);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, barY + barH + 12, Graphics.FONT_XTINY,
                sent + "/" + total, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

class UploadDelegate extends WatchUi.BehaviorDelegate {
    hidden var _timer;

    function initialize() {
        BehaviorDelegate.initialize();
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

    function onBack() as Lang.Boolean {
        if (_timer != null) { _timer.stop(); }
        return false;
    }
}
