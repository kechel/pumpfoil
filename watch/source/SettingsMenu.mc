using Toybox.WatchUi;
using Toybox.Graphics;
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
            Uploader.syncAll();
            WatchUi.pushView(new InfoView("Upload gestartet", "läuft im Hintergrund"),
                new InfoDelegate(), WatchUi.SLIDE_LEFT);
        }
    }
}

// Kurze Bestätigung (Back kehrt zurück).
class InfoView extends WatchUi.View {
    hidden var _title;
    hidden var _sub;

    function initialize(title, sub) {
        View.initialize();
        _title = title;
        _sub = sub;
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.38, Graphics.FONT_MEDIUM, _title, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.56, Graphics.FONT_XTINY, _sub, Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class InfoDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }
}
