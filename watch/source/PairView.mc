using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Lang;

// Pair-Ansicht: aus dem Einstellungs-Menü ("Verbinden") geöffnet. Zeigt den von der
// Uhr erzeugten Code; der Nutzer trägt ihn auf pumpfoil.org (Account) ein. Das Pollen
// auf Bestätigung läuft über den 1-Hz-Tick der darunterliegenden RecordView
// (rec.tick() pollt pair-poll und holt das Device-Token).
class PairView extends WatchUi.View {
    hidden var _rec;

    function initialize(rec) {
        View.initialize();
        _rec = rec;
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();

        if (_rec.isPaired()) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.34, Graphics.FONT_MEDIUM, "Verbunden", Graphics.TEXT_JUSTIFY_CENTER);
            // grünes Häkchen
            dc.setPenWidth(4);
            dc.drawLine(w / 2 - 14, h * 0.54, w / 2 - 4, h * 0.58);
            dc.drawLine(w / 2 - 4, h * 0.58, w / 2 + 16, h * 0.50);
            dc.setPenWidth(1);
        } else if (!_rec.pairCode.equals("")) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.18, Graphics.FONT_XTINY, "Code:", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.40, Graphics.FONT_NUMBER_MEDIUM, _rec.pairCode, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "auf pumpfoil.org", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.62 + 22, Graphics.FONT_XTINY, "eingeben", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            // startPairing() wurde beim Öffnen schon ausgelöst -> Code wird gerade erzeugt.
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.36, Graphics.FONT_MEDIUM, "Verbinden", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var msg = _rec.pairStatus.equals("") ? "Code wird erzeugt…" : _rec.pairStatus;
            dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, msg, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

class PairDelegate extends WatchUi.BehaviorDelegate {
    hidden var _rec;

    function initialize(rec) {
        BehaviorDelegate.initialize();
        _rec = rec;
    }

    // ENTER -> (erneut) Pairing-Code anfordern, falls noch nicht verbunden.
    function onKeyPressed(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            if (!_rec.isPaired()) { _rec.startPairing(); }
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    // Back -> zurück zum Start-Screen.
    function onBack() as Lang.Boolean {
        return false;
    }
}
