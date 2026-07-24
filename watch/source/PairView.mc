using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
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

        // Reihenfolge: ein gerade erzeugter (Neu-)Code hat Vorrang vor der
        // Verbunden-Anzeige — so kann ein bestehendes Pairing per ENTER überschrieben
        // werden und der neue Code wird sofort sichtbar.
        if (!_rec.pairCode.equals("")) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.18, Graphics.FONT_XTINY, "Code:", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            // WICHTIG: alphanumerische Font — der Code enthält Buchstaben (FONT_NUMBER_*
            // zeigt nur Ziffern und würde die Buchstaben verschlucken).
            dc.drawText(w / 2, h * 0.40, Graphics.FONT_LARGE, _rec.pairCode, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "pumpfoil.org", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.62 + 22, Graphics.FONT_XTINY, Strings.s("pair.enterThere"), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (_rec.pairing) {
            // Re-Pair-Versuch läuft (oder ist gescheitert): Status/Fehler zeigen — auch wenn noch
            // ein gültiges Pairing besteht. Sonst „passiert nichts" bei ENTER ohne Verbindung.
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.36, Graphics.FONT_MEDIUM, Strings.s("menu.connect"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var pmsg = _rec.pairStatus.equals("") ? Strings.s("pair.fetching") : _rec.pairStatus;
            dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, pmsg, Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.74, Graphics.FONT_XTINY, Strings.s("pair.repairHint"), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (_rec.isPaired()) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.30, Graphics.FONT_MEDIUM, Strings.s("menu.connected"), Graphics.TEXT_JUSTIFY_CENTER);
            // grünes Häkchen
            dc.setPenWidth(4);
            dc.drawLine(w / 2 - 14, h * 0.50, w / 2 - 4, h * 0.54);
            dc.drawLine(w / 2 - 4, h * 0.54, w / 2 + 16, h * 0.46);
            dc.setPenWidth(1);
            // Bestehendes Pairing jederzeit überschreibbar.
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.74, Graphics.FONT_XTINY, Strings.s("pair.repairHint"), Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            // startPairing() wurde beim Öffnen schon ausgelöst -> Code wird gerade erzeugt.
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.36, Graphics.FONT_MEDIUM, Strings.s("menu.connect"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var msg = _rec.pairStatus.equals("") ? Strings.s("pair.generating") : _rec.pairStatus;
            dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, msg, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

class PairDelegate extends WatchUi.BehaviorDelegate {
    hidden var _rec;
    hidden var _timer;

    function initialize(rec) {
        BehaviorDelegate.initialize();
        _rec = rec;
        // Eigener 1-Hz-Tick: treibt das Pairing-Polling (rec.tick()) auch dann, wenn
        // diese View aus dem On-Device-Settings-Kontext geöffnet wurde (kein
        // RecordDelegate-Timer aktiv).
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function onTick() as Void {
        _rec.tick();
        WatchUi.requestUpdate();
    }

    // ENTER -> (erneut) Pairing-Code anfordern, falls noch nicht verbunden.
    function onKeyPressed(evt as WatchUi.KeyEvent) as Lang.Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            // Immer (neu) koppeln — auch ein bestehendes Pairing lässt sich so überschreiben.
            _rec.startPairing();
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    // Back -> Timer stoppen, zurück.
    function onBack() as Lang.Boolean {
        if (_timer != null) { _timer.stop(); }
        return false;
    }
}
