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
        _recorder.fetchConfig();  // Web-konfigurierte Ansichten laden (async, mit Cache-Fallback)
        Uploader.syncAll();       // beim Start ausstehende Sessions nachholen (falls WLAN)
        var view = new RecordView(_recorder);
        var delegate = new RecordDelegate(_recorder, view);
        return [view, delegate];
    }

    // Einstellungen (Pairing-Code, Datenfelder, Alarm) wurden geändert.
    function onSettingsChanged() {
        if (_recorder != null) {
            _recorder.reloadConfig();
        }
        WatchUi.requestUpdate();
    }
}
