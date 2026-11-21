using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Time;
using Toybox.Position;
using Toybox.Sensor;

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

    // Zugriff auf den Recorder von aussen (Uploader zieht nach einem fertigen Upload das Profil
    // nach, s. Uploader._profilNachziehen). Bewusst hier statt einer Modul-Variablen: die App
    // haelt den Recorder ohnehin, ein zweiter Verweis waere eine zweite Wahrheit.
    function recorder() {
        return _recorder;
    }

    function onStart(state) {
    }

    // Regulaeres Ende. Genau hier wird der Lauf-Canary geloescht — bleibt er liegen, ist die App
    // vorher gestorben und meldet das beim naechsten Start (s. SessionRecorder._runCanaryRead).
    // Abgesichert, damit ein Fehler im Aufraeumen nicht selbst zum Absturz wird.
    function onStop(state) {
        Mem.sichern();
        try { if (_recorder != null) { _recorder.runClear(); } } catch (e) {}
        // GPS und Beschleunigungs-Listener beim Beenden SELBST abschalten, wie Garmins eigene Beispiele (PositionSample,
        // RecordSample: LOCATION_DISABLE in onStop; PitchCounter: unregisterSensorDataListener). Bis 1.0.104 blieb das der
        // Firmware ueberlassen — auf dem Startbildschirm laeuft GPS (auch nach dem Speichern), in der hoechsten
        // GNSS-Stufe. Anlass: eine Instinct 3 friert ~5 min nach jeder Session ein und startet neu, waehrend unsere App
        // schon sauber beendet ist (21.11.2026, docs/TODO.md). Eigene Funktion hier statt im SessionRecorder (253-Member-
        // Grenze des 128-KB-Builds).
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, null); } catch (e) {}
        try { if (Sensor has :unregisterSensorDataListener) { Sensor.unregisterSensorDataListener(); } } catch (e) {}
        // App ohne laufende Aufnahme verlassen -> dem Server sagen, damit die Website nicht eine
        // Stunde lang „nimmt vermutlich auf" zeigt (Jan, 14.10.2026). Best effort: ob Connect IQ
        // die Anfrage beim Beenden noch rausschickt, ist nur auf echter Uhr pruefbar.
        try { if (_recorder != null && !_recorder.isRecording()) { PhoneRec.meldeAppZu(); } } catch (e) {}
    }

    // Haupt-View beim Start.
    function getInitialView() {
        _recorder = new SessionRecorder();
        // Jeder Startup-Schritt einzeln abgesichert: ein Fehler (z. B. Netz/Position)
        // darf den App-Start nie crashen — die View muss immer hochkommen.
        try { _recorder.startGps(); } catch (e) {}          // GPS vorwärmen -> schneller Start
        try { _recorder.claimPairingCode(); } catch (e) {}  // ggf. eingetragenen Code einlösen
        try { _recorder.fetchConfig(); } catch (e) {}       // Web-Config laden (mit Cache-Fallback)
        try { Uploader.syncAll(); } catch (e) {}            // ausstehende Sessions nachholen
        var view = new RecordView(_recorder);
        var delegate = new RecordDelegate(_recorder, view);
        return [view, delegate];
    }

    // On-Device-Settings: vom Vorab-Menü an der Aktivitäten-Auswahl geöffnet
    // ("Pumpfoil markieren -> MENU halten -> Pumpfoil Einstellungen") — OHNE die
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
