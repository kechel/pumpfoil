using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Time;

// App-Einstieg. Hält den SessionRecorder und reicht ihn an die View/Delegate.
//
// Kein Background-Service: Upload läuft im Vordergrund (App-Start + während der
// Aufnahme). Der frühere (:background)-Service löste beim Phone-Settings-Sync
// vermutlich einen OOM/Reboot aus und war ohne registerForTemporalEvent ohnehin
// inaktiv.
class FoilApp extends Application.AppBase {

    hidden var _recorder;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
    }

    function onStop(state) {
    }

    // Haupt-View beim Start.
    function getInitialView() {
        _recorder = new SessionRecorder();
        _recorder.startGps();         // GPS sofort vorwärmen (nicht-blockierend) -> schneller Start
        _recorder.claimPairingCode(); // ggf. im Settings-Feld eingetragenen Code einlösen
        _recorder.fetchConfig();  // Web-konfigurierte Ansichten laden (async, mit Cache-Fallback)
        Uploader.syncAll();       // beim Start ausstehende Sessions nachholen (falls WLAN)
        var view = new RecordView(_recorder);
        var delegate = new RecordDelegate(_recorder, view);
        return [view, delegate];
    }

    // On-Device-Settings: vom Vorab-Menü an der Aktivitäten-Auswahl geöffnet
    // ("Pump Foil markieren -> MENU halten -> Pump Foil Einstellungen") — OHNE die
    // Aufnahme zu starten. Hier liegen Verbinden + Upload/Sync (während der
    // laufenden Aktivität ist Upload nicht möglich).
    function getSettingsView() {
        if (_recorder == null) {
            _recorder = new SessionRecorder();
            _recorder.fetchConfig();
        }
        return [ new SettingsMenu(_recorder), new SettingsMenuDelegate(_recorder) ];
    }

    // Einstellungen (Pairing-Code, Datenfelder, Alarm) wurden geändert.
    function onSettingsChanged() {
        if (_recorder != null) {
            _recorder.reloadConfig();
            _recorder.claimPairingCode();  // neu eingetragenen Pairing-Code einlösen
        }
        WatchUi.requestUpdate();
    }
}
