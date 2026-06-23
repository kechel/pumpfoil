using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Background;
using Toybox.Time;

// App-Einstieg. Hält den SessionRecorder und reicht ihn an die View/Delegate.
//
// HINWEIS: Skelett für M1/M2. Auf echter Fenix mit dem Connect IQ SDK bauen
// (monkeyc / VS-Code-Extension) und on-device validieren — insbesondere
// Speicher/RAM bei 25 Hz, reale Max-Sample-Rate und Akku (siehe Plan-Risiken).
(:background)
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

    // Background-Service: optionaler, automatischer Upload-Versuch (>=5 min Takt).
    // Primärer Upload-Weg bleibt der manuelle Button in der App (bei WLAN).
    function getServiceDelegate() {
        return [new UploadServiceDelegate()];
    }
}
