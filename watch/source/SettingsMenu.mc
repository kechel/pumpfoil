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

// Upload-Ansicht mit Live-Status: zeigt offene Sessions, startet den Sync und
// aktualisiert, bis fertig. So sieht der Nutzer, dass (und was) passiert.
class UploadView extends WatchUi.View {
    hidden var _startCount;

    function initialize() {
        View.initialize();
        _startCount = Uploader.pendingCount();
        if (_startCount > 0) { Uploader.syncAll(); }
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var pending = Uploader.pendingCount();
        var busy = Uploader.isBusy();

        if (_startCount == 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, "Nichts offen", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, "alles hochgeladen", Graphics.TEXT_JUSTIFY_CENTER);
        } else if (busy || pending > 0) {
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.36, Graphics.FONT_MEDIUM, "Upload läuft…", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.56, Graphics.FONT_SMALL, pending + " offen", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.36, Graphics.FONT_MEDIUM, "Fertig", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setPenWidth(4);
            dc.drawLine(w / 2 - 14, h * 0.56, w / 2 - 4, h * 0.60);
            dc.drawLine(w / 2 - 4, h * 0.60, w / 2 + 16, h * 0.52);
            dc.setPenWidth(1);
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

    function onTick() as Void {
        WatchUi.requestUpdate();
    }

    function onBack() as Lang.Boolean {
        if (_timer != null) { _timer.stop(); }
        return false;
    }
}
