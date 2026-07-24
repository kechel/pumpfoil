using Toybox.WatchUi;

// Aktions-Menü der laufenden Aufnahme: erscheint, wenn man START/ENTER 3 s hält (statt des
// alten „noch länger halten = verwerfen"). Längeres Halten tut nichts mehr. Auswahl per DOWN:
// Speichern / Verwerfen / Pausieren, START bestätigt.
class SessionActionMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({ :title => Strings.s("rec.sessionTitle") });
        addItem(new WatchUi.MenuItem(Strings.s("rec.save"), null, :save, {}));
        addItem(new WatchUi.MenuItem(Strings.s("rec.discard"), null, :discard, {}));
        addItem(new WatchUi.MenuItem(Strings.s("rec.pause"), null, :pause, {}));
    }
}

class SessionActionDelegate extends WatchUi.Menu2InputDelegate {
    hidden var _rec;

    function initialize(rec) {
        Menu2InputDelegate.initialize();
        _rec = rec;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_RIGHT);   // Menü schließen -> zurück zum Aufnahme-Screen
        if (id == :save) {
            _rec.stop();
            // Bei Telefon-Verbindung direkt den Upload-Screen zeigen (wie beim alten Stop-Halten).
            if (Uploader.pendingCount() > 0 && Uploader.phoneConnected()) {
                WatchUi.pushView(new UploadView(_rec), new UploadDelegate(_rec), WatchUi.SLIDE_LEFT);
            }
        } else if (id == :discard) {
            _rec.discard();
        } else if (id == :pause) {
            _rec.pause();
        }
        WatchUi.requestUpdate();
    }
}
