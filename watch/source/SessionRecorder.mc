using Toybox.ActivityRecording;
using Toybox.Position;
using Toybox.Sensor;
using Toybox.SensorLogging;
using Toybox.Activity;
using Toybox.System;
using Toybox.Application.Storage;
using Toybox.Lang;
using Toybox.Time;
using Toybox.Math;
using Toybox.Attention;
using Toybox.Communications;
using Toybox.WatchUi;
using Toybox.PersistedContent;

// Kern der Aufzeichnung: FIT-Session (mit SensorLogger -> synct zu Garmin Connect)
// PLUS eigener Roh-Puffer (GPS 1 Hz + Accel ~25 Hz als int16), der gechunkt und
// persistent in Storage abgelegt wird, bis er vom Server bestätigt ist.
//
// Skelett: Konstanten/Frequenzen unten ggf. on-device anpassen (Max-Sample-Rate,
// Chunkgröße vs. BLE-Limit, Akku).
class SessionRecorder {

    // --- Konstanten ---
    const ACCEL_HZ = 25;
    const ACCEL_HZ_LITE = 10;   // sparsamer Modus für speicherarme Uhren (z. B. Forerunner 55)
    const ACCEL_SCALE = 2048;        // int16 pro 1 g
    const ACCEL_CHUNK_SAMPLES = 750; // 30 s -> ~6 KB base64
    const GPS_CHUNK_SAMPLES = 60;    // 60 s
    const SPEED_AVG_SAMPLES = 3;     // 3-s-Geschwindigkeit

    hidden var _fitSession;
    hidden var _sensorLogger;
    hidden var _recording = false;

    hidden var _sessionUuid;
    hidden var _startedAt;
    hidden var _chunkIndex = 0;      // fortlaufender Chunk-Index (gps & accel getrennt gezählt)
    hidden var _accelChunkIndex = 0;
    hidden var _gpsChunkIndex = 0;

    // Roh-Puffer
    hidden var _accelBuf;            // ByteArray (int16 LE, interleaved x,y,z)
    hidden var _accelCount = 0;
    hidden var _accelOn = false;     // Roh-Accel zur Laufzeit aktiv? (sonst GPS-only)
    hidden var _gpsBuf;              // Array von [t_ms, lat, lon, speed, hr, hacc]

    // Live-Stats
    hidden var _speedRing as Lang.Array<Lang.Float or Null> = new [SPEED_AVG_SAMPLES];
    hidden var _speedRingPos as Lang.Number = 0;
    hidden var _currentHr as Lang.Number or Null = null;
    hidden var _hasGpsFix = false;          // erst Ansichten zeigen, wenn GPS-Fix da ist
    hidden var _syncTickCounter = 0;        // periodischer Live-Sync während der Aufnahme
    const SYNC_INTERVAL_S = 120;            // alle 2 min versuchen (wenn WLAN da)

    // Config (aus Settings)
    // Mehrere konfigurierbare Ansichten (Screens), je bis zu 3 Felder. Während der
    // Aufzeichnung mit UP/DOWN umschaltbar. Leere Screens (alle Felder aus) entfallen.
    var screens = [[Config.FIELD_SPEED3S, Config.FIELD_HR, Config.FIELD_NONE]];
    var colorByValue = false;   // Speed/Puls je nach Wert einfärben
    var autoStart = true;       // Aufnahme automatisch starten, wenn man losfährt (GPS)
    // Aufzeichnungsmodus: "full" = Accel 25 Hz | "lite" = Accel 10 Hz (sparsam) |
    // "gps" = nur GPS (kein Roh-Accel) — für speicherarme Uhren (z. B. Forerunner 55).
    var recordMode = "full";
    hidden var _accelHz = ACCEL_HZ;  // tatsächlich genutzte Rate (für Meta/Server)
    hidden var _idleSpeed = 0.0; // letzte GPS-Geschwindigkeit im Idle (für Auto-Start)
    hidden var _autoStreak = 0;  // aufeinanderfolgende schnelle Idle-Ticks
    hidden var _idleTicks = 0;   // 1-Hz-Ticks auf dem Start-Screen (Auto-Start-Vorlauf)
    var alarmEnabled = false;
    var speedHighKmh = 0;
    var speedLowKmh = 0;
    var alarmPatternHigh = "short2";  // Muster beim Überschreiten der Max-Speed
    var alarmPatternLow = "long2";    // Muster beim Unterschreiten der Min-Speed
    var alarmRepeat = "once";         // "once" = einmalig | "continuous" = dauerhaft
    var alarmDefault = "foil";        // Website-Vorwahl für die Uhr: "foil" = Standard-Foil | "fixed" = feste Werte
    var manualAlarm = false;          // true = Vibrationsalarm auf der Website aktiviert (Master-Schalter)
    var foils = [];                   // [{id,label,min,max}] für Foil-Auswahl beim Start
    var sessionFoilId = null;         // auf der Uhr gewähltes Foil (Server-ID) -> Metadaten + Auto-Schwellen; null = keine
    var activeAlarmLabel = "";        // angezeigter Foil-Name auf dem Start-Screen ("Foil: <name>")
    // Drei unabhängige Achsen: Foil (Metadaten, oben), alarmEnabled (An/Aus), alarmSource (Schwellen-Quelle).
    var alarmSource = "foil";         // "foil" = Schwellen aus gewählter Foil | "manual" = feste Min/Max (speedLow/HighKmh)
    // Off-Foil-Screen (Auto-Umschaltung, wenn gerade nicht gefoilt wird): Default
    // Uhrzeit + letzter Lauf (Distanz/Dauer). Per Website konfigurierbar.
    var offFoilView = [Config.FIELD_CLOCK, Config.FIELD_LAST_RUN_DISTANCE, Config.FIELD_LAST_RUN_DURATION];

    var stopped = false;              // true nach Stopp&Speichern -> Erfolgs-Screen (bis Neustart)
    var storageFull = false;          // true, wenn eine Storage-Schreiboperation scheiterte (Object-Store voll)

    // --- Reverse-Pairing (Uhr zeigt Code -> auf pumpfoil.org eingeben) ---
    var pairCode = "";                // auf der Uhr angezeigter Code
    var pairStatus = "";              // Status-Text auf dem Verbinden-Screen
    hidden var _claimToken = "";
    hidden var _pairPollCtr = 0;

    // --- On-Watch-Lauferkennung (Live-Näherung, GPS-Speed) ---
    // Bewusst simpel: Hysterese + Dwell auf dem 3-s-Speed. Der Server bleibt mit
    // Accel-ML die Wahrheit für die Auswertung; das hier dient dem Live-Feedback.
    const RUN_ENTER_MPS = 2.8;   // ~10 km/h: Lauf-Start
    const RUN_EXIT_MPS = 2.5;    // ~9 km/h: darunter -> Lauf-Ende (Hysterese)
    const RUN_ENTER_DWELL = 3;   // s anhaltend -> foilend
    const RUN_EXIT_DWELL = 3;    // s anhaltend langsam -> Lauf-Ende
    // Nach einem Lauf-Ende kurze Sperre, bevor ein neuer Lauf starten darf. Fängt das
    // Zurückschwimmen direkt nach dem Absteigen ab (GPS-Speed-Spikes der nassen Uhr
    // sollen keinen Phantom-Lauf samt Übersichts-Screen auslösen).
    const RUN_REARM_COOLDOWN_MS = 15000;
    // Auto-Start: auf dem Start-Screen die GPS-Geschwindigkeit überwachen und die
    // Aufnahme automatisch starten, sobald man losfährt (~10 km/h, 4 s anhaltend).
    const AUTO_START_MPS = 2.8;
    const AUTO_START_DWELL = 4;
    const AUTO_START_LEAD = 10;   // s Vorlauf ab Betreten des Start-Screens, bis Auto-Start scharf
    hidden var _foiling = false;
    hidden var _enterStreak = 0;
    hidden var _exitStreak = 0;
    hidden var _runEndedMs = -100000;   // tMs des letzten Lauf-Endes (für Re-Arm-Cooldown)
    hidden var _runStartMs = 0;
    hidden var _runStartDist = 0.0;
    hidden var _runMaxSpeed = 0.0;
    hidden var _runCount = 0;
    hidden var _lastRunDurMs = 0;
    hidden var _lastRunDistM = 0.0;
    hidden var _lastRunMaxSpeed = 0.0;
    hidden var _lastRunAvgSpeed = 0.0;

    // Stop erfordert 3 s Halten (gegen versehentliches Beenden beim Foilen).
    const STOP_HOLD_MS = 3000;
    var stopHoldStartMs as Lang.Number or Null = null;

    // Fortschritt 0..1 des Stop-Haltens (für den Ring-Indikator in der View).
    function stopHoldProgress() as Lang.Float {
        if (stopHoldStartMs == null) { return 0.0; }
        var e = System.getTimer() - stopHoldStartMs;
        var p = e.toFloat() / STOP_HOLD_MS;
        return p > 1.0 ? 1.0 : p;
    }

    function initialize() {
        reloadConfig();
        _accelBuf = new [0]b;
        _gpsBuf = [];
    }

    function reloadConfig() {
        // Profil-Sprache (vom Server gecacht) anwenden — auch offline verfügbar.
        Strings.setLang(Storage.getValue("lang"));
        // Bevorzugt die zuletzt von der Website geladene Konfiguration (Cache),
        // sonst die nativen Garmin-App-Settings (Offline-Fallback).
        var cached = Storage.getValue("views_config");
        if (cached instanceof Lang.Array && cached.size() > 0) {
            screens = _buildScreens(cached);
        } else {
            screens = _buildScreens([
                [Config.getNumber("field1", Config.FIELD_SPEED3S),
                 Config.getNumber("field2", Config.FIELD_HR),
                 Config.getNumber("field3", Config.FIELD_NONE)],
                [Config.getNumber("field4", Config.FIELD_NONE),
                 Config.getNumber("field5", Config.FIELD_NONE),
                 Config.getNumber("field6", Config.FIELD_NONE)]]);
        }
        // Bevorzugt der von der Website gecachte Wert (Storage), sonst native Property (Fallback).
        var cbv = Storage.getValue("colorByValue");
        colorByValue = (cbv != null) ? cbv : Config.getBool("colorByValue", false);
        // Auto-Start aus dem (vom Server gecachten) Storage; Default an. Bewusst NICHT
        // über Application.Properties (undeklarierte Keys werfen -> Crash-Klasse).
        var asv = Storage.getValue("auto_start");
        autoStart = (asv == null) ? true : asv;
        var rm = Storage.getValue("record_mode");
        recordMode = (rm != null) ? rm : "full";
        alarmEnabled = Config.getBool("alarmEnabled", false);
        speedHighKmh = Config.getNumber("speedHigh", 0);
        speedLowKmh = Config.getNumber("speedLow", 0);
        // Vibrationsmuster/-Modus kommen nur von der Website (Cache); Properties haben sie nicht.
        var ac = Storage.getValue("alarm_config");
        if (ac instanceof Lang.Dictionary) {
            if (ac.hasKey("enabled")) { alarmEnabled = ac["enabled"]; manualAlarm = ac["enabled"]; }
            if (ac.hasKey("high")) { speedHighKmh = ac["high"]; }
            if (ac.hasKey("low")) { speedLowKmh = ac["low"]; }
            if (ac.hasKey("ph")) { alarmPatternHigh = ac["ph"]; }
            if (ac.hasKey("pl")) { alarmPatternLow = ac["pl"]; }
            if (ac.hasKey("rep")) { alarmRepeat = ac["rep"]; }
            if (ac.hasKey("def")) { alarmDefault = ac["def"]; }
        }
        // Gecachte Foil-Liste (Auto-Alarm je Foil) offline verfügbar machen.
        var fc = Storage.getValue("foils_config");
        if (fc instanceof Lang.Array) { foils = fc; }
        // Gecachter Off-Foil-Screen.
        var of = Storage.getValue("offfoil_config");
        if (of instanceof Lang.Array && of.size() == 3) { offFoilView = of; }
        initAlarmSelection();   // Default-Foil/Website (offline aus Cache)
    }

    // View auf genau 3 Felder normalisieren (fehlende -> FIELD_NONE).
    hidden function _normView(v) {
        return [
            v.size() > 0 ? v[0] : Config.FIELD_NONE,
            v.size() > 1 ? v[1] : Config.FIELD_NONE,
            v.size() > 2 ? v[2] : Config.FIELD_NONE];
    }

    // --- Reverse-Pairing ---
    function isPaired() {
        var t = Config.getString("deviceToken");
        return t != null && !t.equals("");
    }

    // Pairing lokal aufheben: der Server hat den Device-Token eindeutig verworfen
    // (HTTP 401 trotz erreichbarem Server -> Verknüpfung auf pumpfoil.org gelöscht/
    // widerrufen). Danach gilt die Uhr als nicht verbunden und kann neu gekoppelt
    // werden. Gepufferte Sessions bleiben erhalten und gehen nach erneutem Pairing raus.
    function unpair() {
        Config.setString("deviceToken", "");
        pairCode = "";
        pairStatus = "";
        _claimToken = "";
        _pairPollCtr = 0;
    }

    // Holt einen Pairing-Code vom Server (zum Eintippen auf pumpfoil.org). Bewusst OHNE
    // isPaired-Guard: ein bestehendes Pairing soll jederzeit überschreibbar sein. Der alte
    // Token bleibt aktiv, bis ein neues Pairing tatsächlich durchläuft (onPairPoll) — back-out
    // ohne Eingabe lässt die bestehende Verknüpfung also unangetastet.
    function startPairing() {
        pairCode = "";
        _claimToken = "";
        _pairPollCtr = 0;
        pairStatus = "hole Code…";
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/pair-init",
            {},
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onPairInit));
    }

    function onPairInit(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        if (responseCode == 200 && data instanceof Lang.Dictionary && data.hasKey("code")) {
            pairCode = data["code"];
            _claimToken = data["claim_token"];
            pairStatus = "auf pumpfoil.org eingeben";
        } else {
            pairStatus = "Fehler (" + responseCode + ")";
        }
    }

    // Pollt, ob der Code auf der Website eingelöst wurde (vom 1-Hz-Tick alle 3 s).
    hidden function _pollPairing() {
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/pair-poll",
            { "claim_token" => _claimToken },
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onPairPoll));
    }

    function onPairPoll(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        if (responseCode == 200 && data instanceof Lang.Dictionary
                && data["device_token"] != null) {
            Config.setString("deviceToken", data["device_token"]);
            _claimToken = "";
            pairCode = "";
            pairStatus = "Verbunden!";
            fetchConfig();      // Website-Einstellungen jetzt laden
            Uploader.syncAll(); // ggf. vor dem Pairing aufgenommene Sessions nachschicken
        }
    }

    // Forward-Pairing: Code aus dem App-Settings-Feld (Garmin Connect am Handy /
    // on-device) einlösen -> Device-Token holen. Wird beim App-Start und nach
    // jeder Settings-Änderung versucht.
    function claimPairingCode() {
        if (isPaired()) { return; }
        var code = Config.getString("pairingCode");
        if (code == null || code.equals("")) { return; }
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/pair",
            { "code" => code, "label" => "Garmin" },
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onPairClaim));
    }

    function onPairClaim(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        if (responseCode == 200 && data instanceof Lang.Dictionary && data["device_token"] != null) {
            Config.setString("deviceToken", data["device_token"]);
            pairStatus = "Verbunden!";
            fetchConfig();
            Uploader.syncAll();
        }
    }

    // Beim App-Start die auf der Website konfigurierten Ansichten laden (falls online).
    // Komplett abgesichert: ein Fehler hier (z. B. makeWebRequest) darf den App-Start
    // nicht crashen — die Aufnahme funktioniert auch ohne frische Config (Cache/Default).
    function fetchConfig() {
        try {
            var token = Config.getString("deviceToken");
            if (token == null || token.equals("")) { return; }
            // Geräte-Part-Number melden -> Server kann später das Modell zuordnen
            // (für den Update-Hinweis/Download). Null-sicher.
            var pn = "";
            var ds = System.getDeviceSettings();
            if (ds != null && ds.partNumber != null) { pn = ds.partNumber; }
            Communications.makeWebRequest(
                Config.baseUrl() + "/api/devices/config",
                { "v" => Config.VERSION, "p" => "garmin", "pn" => pn },   // Version+Plattform+PartNo melden
                {
                    :method => Communications.HTTP_REQUEST_METHOD_GET,
                    :headers => { "X-Device-Token" => token },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onConfig));
        } catch (e) {
            // Offline/Fehler -> mit gecachter/Default-Config weiterarbeiten.
        }
    }

    function onConfig(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        if (responseCode == 401) {
            // Server erreichbar, hat den Device-Token aber eindeutig verworfen (Verknüpfung
            // auf pumpfoil.org gelöscht/widerrufen) -> Pairing lokal zurücksetzen, damit die
            // Uhr neu gekoppelt werden kann (statt fälschlich „Verbunden" zu zeigen).
            unpair();
            WatchUi.requestUpdate();
            return;
        }
        if (responseCode == 200 && data instanceof Lang.Dictionary) {
          // Komplette Verarbeitung abgesichert: eine unerwartete/kaputte Server-Antwort
          // darf die App nicht crashen (die Aufnahme-Fähigkeit hängt nicht hieran).
          try {
            // Profil-Sprache übernehmen + cachen (für Offline-Anzeige).
            if (data.hasKey("language") && data["language"] != null) {
                _store("lang", data["language"]);
                Strings.setLang(data["language"]);
            }
            if (data.hasKey("views")) { setScreensFromConfig(data["views"]); }
            if (data.hasKey("colorByValue") && data["colorByValue"] != null) {
                colorByValue = data["colorByValue"];
                _store("colorByValue", colorByValue);  // cachen -> ueberlebt reloadConfig/Neustart
            }
            if (data.hasKey("autoStart") && data["autoStart"] != null) {
                autoStart = data["autoStart"];
                _store("auto_start", autoStart);
            }
            if (data.hasKey("recordMode") && data["recordMode"] != null) {
                recordMode = data["recordMode"];
                _store("record_mode", recordMode);
            }
            // Vibrationsalarm von der Website übernehmen + cachen (offline verfügbar).
            if (data.hasKey("alarmEnabled")) {
                alarmEnabled = data["alarmEnabled"];
                manualAlarm = data["alarmEnabled"];   // Website-Alarm hat Vorrang vor Foil-Auto
                if (data.hasKey("speedHigh") && data["speedHigh"] != null) { speedHighKmh = data["speedHigh"]; }
                if (data.hasKey("speedLow") && data["speedLow"] != null) { speedLowKmh = data["speedLow"]; }
                if (data.hasKey("alarmPatternHigh") && data["alarmPatternHigh"] != null) { alarmPatternHigh = data["alarmPatternHigh"]; }
                if (data.hasKey("alarmPatternLow") && data["alarmPatternLow"] != null) { alarmPatternLow = data["alarmPatternLow"]; }
                if (data.hasKey("alarmRepeat") && data["alarmRepeat"] != null) { alarmRepeat = data["alarmRepeat"]; }
                if (data.hasKey("alarmDefault") && data["alarmDefault"] != null) { alarmDefault = data["alarmDefault"]; }
                _store("alarm_config", {
                    "enabled" => alarmEnabled, "high" => speedHighKmh, "low" => speedLowKmh,
                    "ph" => alarmPatternHigh, "pl" => alarmPatternLow, "rep" => alarmRepeat,
                    "def" => alarmDefault });
            }
            // Foil-Liste (Auto-Alarm je Foil) übernehmen + cachen.
            if (data.hasKey("foils") && data["foils"] instanceof Lang.Array) {
                foils = data["foils"];
                _store("foils_config", foils);
            }
            // Off-Foil-Screen (Auto-Umschaltung) übernehmen + cachen.
            if (data.hasKey("offFoilView") && data["offFoilView"] instanceof Lang.Array
                    && data["offFoilView"].size() > 0) {
                offFoilView = _normView(data["offFoilView"]);
                _store("offfoil_config", offFoilView);
            }
            initAlarmSelection();   // Default-Foil/Website vorauswählen (Start-Screen)
            WatchUi.requestUpdate();
          } catch (e) {
            // Teil-Config evtl. übernommen; Rest ignorieren — kein Crash.
          }
        }
    }

    // Auto-Alarm eines gewählten Foils für die Session setzen (min/max in km/h).
    // alarmRepeat bleibt unangetastet (Website-Default; auf der Uhr pro Session umstellbar).
    // Manuelle Schwellen setzen (Alarm-Quelle "manual"). Ändert alarmEnabled NICHT (entkoppelt).
    function setManualThresholds(lo, hi) {
        speedLowKmh = lo;
        speedHighKmh = hi;
    }

    // Effektive Alarm-Schwellen: bei "foil" aus der gewählten Foil, sonst die manuellen Werte.
    // Rückgabe [lo, hi]. Fällt auf die manuellen/Website-Werte zurück, wenn keine Foil passt.
    function effThresholds() {
        if (alarmSource.equals("foil") && sessionFoilId != null) {
            for (var i = 0; i < foils.size(); i++) {
                if (foils[i]["id"] == sessionFoilId) {
                    return [foils[i]["min"], foils[i]["max"]];
                }
            }
        }
        return [speedLowKmh, speedHighKmh];
    }

    // Default-Auswahl für den Start-Screen setzen (nur wenn noch nichts gewählt).
    // Master-Schalter ist der Website-Alarm (manualAlarm):
    //   aus            -> Default "Alarm: aus" (Foils bleiben im DOWN-Menü wählbar)
    //   an + "foil"    -> Standard-Foil (erstes der Liste) als Auto-Alarm
    //   an + "fixed"   -> feste Website-Werte
    function initAlarmSelection() {
        if (!activeAlarmLabel.equals("")) { return; }     // schon initialisiert -> Uhr-Auswahl behalten (bis App-Ende)
        alarmEnabled = manualAlarm;                        // Web-Master = Alarm-Default an/aus
        if (alarmDefault.equals("foil") && foils.size() >= 1) {
            sessionFoilId = foils[0]["id"];                // Standard-Foil vorwählen (Metadaten)
            activeAlarmLabel = foils[0]["label"];
            alarmSource = "foil";                          // Schwellen aus der Foil
        } else {
            sessionFoilId = null;
            activeAlarmLabel = "-";
            alarmSource = "manual";                        // feste Web-Werte (speedLow/HighKmh)
        }
    }

    // Von der Website geladene Ansichten übernehmen + cachen.
    function setScreensFromConfig(views) {
        if (!(views instanceof Lang.Array) || views.size() == 0) { return; }
        _store("views_config", views);
        screens = _buildScreens(views);
    }

    // views: Array von Ansichten (je Array von Feld-IDs). Leere Ansichten entfallen.
    hidden function _buildScreens(views) {
        var sc = [];
        for (var i = 0; i < views.size(); i++) {
            var v = views[i];
            if (!(v instanceof Lang.Array)) { continue; }
            var f = [
                v.size() > 0 ? v[0] : Config.FIELD_NONE,
                v.size() > 1 ? v[1] : Config.FIELD_NONE,
                v.size() > 2 ? v[2] : Config.FIELD_NONE];
            if (f[0] != Config.FIELD_NONE || f[1] != Config.FIELD_NONE || f[2] != Config.FIELD_NONE) {
                sc.add(f);
            }
        }
        if (sc.size() == 0) { sc.add([Config.FIELD_SPEED3S, Config.FIELD_HR, Config.FIELD_NONE]); }
        return sc;
    }

    function isRecording() { return _recording; }
    function sessionUuid() { return _sessionUuid; }

    // --- Start / Stop ---
    function start() {
        if (_recording) { return; }
        stopped = false;
        storageFull = false;
        _sessionUuid = _genUuid();
        _startedAt = Time.now();
        _accelChunkIndex = 0;
        _gpsChunkIndex = 0;
        _accelBuf = new [0]b;
        _accelCount = 0;
        _gpsBuf = [];
        // _hasGpsFix NICHT zurücksetzen: GPS läuft seit App-Start vorgewärmt weiter,
        // der Fix bleibt gültig -> kein erneutes "GPS suchen".
        _syncTickCounter = 0;
        _registerSession();
        _saveState(false);
        // Object-Store voll? -> gar nicht erst starten (kein Crash), UI zeigt Hinweis.
        if (storageFull) { return; }
        // Lauferkennung zurücksetzen.
        _foiling = false; _enterStreak = 0; _exitStreak = 0; _runCount = 0;
        _runEndedMs = -100000;
        _runStartMs = 0; _runStartDist = 0.0; _runMaxSpeed = 0.0;
        _lastRunDurMs = 0; _lastRunDistM = 0.0; _lastRunMaxSpeed = 0.0; _lastRunAvgSpeed = 0.0;

        // Roh-Accel ist OPTIONAL: ältere/abweichende Geräte ohne SensorLogging bzw.
        // ohne Roh-Beschleunigungs-Stream zeichnen GPS-only auf (Server -> gps_only).
        // Im "gps"-Modus (speicherarme Uhren) bewusst KEIN Accel -> minimaler Speicher.
        _accelOn = false;
        var gpsOnly = recordMode.equals("gps");
        _accelHz = recordMode.equals("lite") ? ACCEL_HZ_LITE : ACCEL_HZ;
        var logger = null;
        if (!gpsOnly && Toybox has :SensorLogging) {
            try {
                logger = new SensorLogging.SensorLogger({:accelerometer => {:enabled => true}});
            } catch (e) {
                logger = null;
            }
        }
        _sensorLogger = logger;

        // SensorLogger nur mitgeben, wenn vorhanden (sonst normale FIT-Session).
        // FIT-Session ist für Garmin Connect + Live-Stats; schlägt sie fehl, zeichnen
        // wir trotzdem unsere Rohdaten-Chunks (GPS/Accel) auf — Priorität: nichts verlieren.
        var sessOpts = { :name => "Pumpfoil", :sport => Activity.SPORT_SURFING };
        if (logger != null) { sessOpts[:sensorLogger] = logger; }
        _fitSession = null;
        try {
            _fitSession = ActivityRecording.createSession(sessOpts);
        } catch (e) {
            _fitSession = null;
        }

        // GPS kontinuierlich.
        Position.enableLocationEvents(
            Position.LOCATION_CONTINUOUS, method(:onPosition));

        // Roh-Accel-Stream (falls das Gerät es bietet + nicht GPS-only). period<=4 s.
        // Rate je Modus (full=25, lite=10). Kann ein Gerät es nicht, bleibt es GPS-only.
        if (!gpsOnly && Sensor has :registerSensorDataListener) {
            try {
                Sensor.registerSensorDataListener(method(:onAccel), {
                    :period => 1,
                    :accelerometer => { :enabled => true, :sampleRate => _accelHz }
                });
                _accelOn = true;
            } catch (e) {
                _accelOn = false;
            }
        }

        _persistMeta();
        // Foil-Auswahl gilt nur für diese (gerade gestartete) Session; im Storage-Meta steht
        // sie schon -> live zurücksetzen, damit die nächste Session wieder den Default nutzt.
        sessionFoilId = null;
        if (_fitSession != null) {
            try { _fitSession.start(); } catch (e) { _fitSession = null; }
        }
        _recording = true;
    }

    function stop() {
        if (!_recording) { return; }
        // Reihenfolge so, dass die Rohdaten SICHER geschrieben werden, bevor irgendeine
        // FIT-Operation fehlschlagen könnte — kein Crash darf die letzten Chunks kosten.
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition)); } catch (e) {}
        if (_accelOn) {
            try { Sensor.unregisterSensorDataListener(); } catch (e) {}
            _flushAccel(true);
        }
        _flushGps(true);
        _recording = false;
        stopped = true;   // -> Erfolgs-/Upload-Screen
        // Session als abgeschlossen markieren und SICHER in Storage persistieren.
        // Bleibt im sessions-Index, bis vollständig hochgeladen+bestätigt.
        _saveState(true);
        // FIT-Session zuletzt schließen — schlägt das fehl, sind unsere Chunks längst sicher.
        if (_fitSession != null) {
            try { _fitSession.stop(); _fitSession.save(); } catch (e) {}
            _fitSession = null;
        }
        // BEWUSST KEIN Upload direkt beim Stopp: ein makeWebRequest im Stopp-Moment
        // könnte fehlschlagen/abstürzen -> Risiko für die gerade aufgenommene Session.
        // Daten liegen sicher in Storage; hochgeladen wird erst beim nächsten App-Start
        // bzw. manuell über Einstellungen -> Upload/Sync.
    }

    // --- Persistenter Multi-Session-Zustand (für robusten Sync) ---
    // Storage-Schreibzugriff mit Schutz: ist der App-Object-Store voll, wirft setValue
    // eine Exception -> wir fangen sie ab (kein „IQ!"-Crash), merken storageFull und melden
    // es der UI. So gehen schlimmstenfalls die jüngsten Sekunden verloren statt der App.
    hidden function _store(key, value) {
        try {
            Storage.setValue(key, value);
            return true;
        } catch (e) {
            storageFull = true;
            return false;
        }
    }

    hidden function _registerSession() {
        var arr = Storage.getValue("sessions");
        if (!(arr instanceof Lang.Array)) { arr = []; }
        if (arr.indexOf(_sessionUuid) < 0) {
            arr.add(_sessionUuid);
            _store("sessions", arr);
        }
    }

    hidden function _saveState(completed) {
        _store("state_" + _sessionUuid, {
            "uuid" => _sessionUuid,
            "started_at" => _startedAt.value(),
            "accel_chunks" => _accelChunkIndex,
            "gps_chunks" => _gpsChunkIndex,
            "completed" => completed
        });
    }

    // 1-Hz-Tick (vom Delegate): Live-Anzeige aus Activity.Info speisen. Das ist die
    // zuverlässige Quelle (auch bei FIT-Wiedergabe im Simulator), unabhängig davon, ob
    // Positions-Callbacks feuern.
    function tick() as Void {
        // Komplett abgesichert: ein Fehler im 1-Hz-Tick darf weder die laufende
        // Aufnahme noch die App beenden (Aufzeichnung läuft im Hintergrund weiter).
        try {
            // Reverse-Pairing pollt auch im Idle (alle ~3 s), solange ein Code aktiv ist.
            if (!_claimToken.equals("") && !isPaired()) {
                _pairPollCtr++;
                if (_pairPollCtr >= 3) { _pairPollCtr = 0; _pollPairing(); }
            }
            if (!_recording) { _maybeAutoStart(); return; }
            var act = Activity.getActivityInfo();
            if (act == null) { return; }
            var spd = (act.currentSpeed != null) ? act.currentSpeed : 0.0;
            _currentHr = act.currentHeartRate;
            _speedRing[_speedRingPos] = spd;
            _speedRingPos = (_speedRingPos + 1) % SPEED_AVG_SAMPLES;
            _checkAlarm(speed3s());
            _updateRun(speed3sMed(), spd, distanceM(), elapsedTimeMs());
            // KEIN Live-Upload während der Aktivität: Garmin meldet sonst „Übertragung
            // während der Aktivität nicht möglich". Chunks landen laufend in Storage
            // (onAccel/onPosition); hochgeladen wird erst nach Stopp bzw. auf der
            // Upload-Seite (Idle).
        } catch (e) {
            // Live-Anzeige/Alarm-Fehler ignorieren — die Rohdaten-Erfassung in den
            // Sensor-Callbacks läuft unabhängig davon weiter.
        }
    }

    // Auto-Start: im Idle bei anhaltender Fahrt-Geschwindigkeit die Aufnahme starten.
    // Nicht direkt nach einem Stopp (stopped) und nur mit GPS-Fix; kurze Vibration als
    // Bestätigung, damit man weiß, dass jetzt aufgezeichnet wird.
    hidden function _maybeAutoStart() as Void {
        if (!autoStart || stopped || !_hasGpsFix) { _autoStreak = 0; _idleTicks = 0; return; }
        // Vorlauf: erst nach AUTO_START_LEAD s auf dem Start-Screen scharf schalten (Zeit, um
        // z.B. ins Einstellungs-Menü zu wechseln). Zähler wird bei Aufnahme/Stopp/GPS-Verlust
        // zurückgesetzt -> startet nach Session-Ende erneut.
        if (_idleTicks < AUTO_START_LEAD) { _idleTicks++; _autoStreak = 0; return; }
        if (_idleSpeed >= AUTO_START_MPS) {
            _autoStreak++;
            if (_autoStreak >= AUTO_START_DWELL) {
                _autoStreak = 0;
                if (Attention has :vibrate) {
                    Attention.vibrate([new Attention.VibeProfile(75, 200), new Attention.VibeProfile(0, 100), new Attention.VibeProfile(75, 200)]);
                }
                start();
            }
        } else {
            _autoStreak = 0;
        }
    }

    // Für den Start-Screen: ist Auto-Start aktiv (zum Einblenden des Hinweises)?
    function autoStartOn() { return autoStart; }
    // Auto-Start scharf (Vorlauf-Countdown durch)?
    function autoArmed() { return _hasGpsFix && _idleTicks >= AUTO_START_LEAD; }
    // Verbleibende Vorlauf-Sekunden für die Countdown-Anzeige (0 = scharf).
    function autoLead() { var r = AUTO_START_LEAD - _idleTicks; return (r < 0) ? 0 : r; }
    // Auto-Start auf der Uhr umschalten (Einstellungs-Menü) + persistieren.
    function toggleAutoStart() { autoStart = !autoStart; _idleTicks = 0; _store("auto_start", autoStart); }

    // GPS-State-Machine für die Live-Lauferkennung (1-Hz-Tick).
    // Gibt true zurück, wenn gerade ein Lauf zu Ende ging.
    hidden function _updateRun(v3, vInst, dist, tMs) {
        if (!_foiling) {
            // Re-Arm-Cooldown: direkt nach einem Lauf-Ende keinen neuen Lauf zulassen
            // (Zurückschwimmen erzeugt sonst über Speed-Spikes einen Phantom-Lauf).
            if (tMs - _runEndedMs < RUN_REARM_COOLDOWN_MS) {
                _enterStreak = 0;
            } else {
                _enterStreak = (v3 >= RUN_ENTER_MPS) ? _enterStreak + 1 : 0;
                if (_enterStreak >= RUN_ENTER_DWELL) {
                    _foiling = true;
                    _exitStreak = 0;
                    // Start rückdatieren auf den ersten schnellen Tick.
                    _runStartMs = tMs - RUN_ENTER_DWELL * 1000;
                    _runStartDist = dist;
                    _runMaxSpeed = vInst;
                }
            }
        } else {
            if (vInst > _runMaxSpeed) { _runMaxSpeed = vInst; }
            _exitStreak = (v3 < RUN_EXIT_MPS) ? _exitStreak + 1 : 0;
            if (_exitStreak >= RUN_EXIT_DWELL) {
                _foiling = false;
                _enterStreak = 0;
                // Ende rückdatieren auf den ersten langsamen Tick.
                var durMs = tMs - RUN_EXIT_DWELL * 1000 - _runStartMs;
                if (durMs < 0) { durMs = 0; }
                _lastRunDurMs = durMs;
                _lastRunDistM = dist - _runStartDist;
                if (_lastRunDistM < 0.0) { _lastRunDistM = 0.0; }
                _lastRunMaxSpeed = _runMaxSpeed;
                _lastRunAvgSpeed = (durMs > 0) ? _lastRunDistM / (durMs / 1000.0) : 0.0;
                _runCount++;
                _runEndedMs = tMs;   // Re-Arm-Cooldown starten
                return true;   // Lauf gerade beendet -> Live-Sync anstoßen
            }
        }
        return false;
    }

    // --- Lauf-Getter (für die View-Felder) ---
    function isFoiling() { return _foiling; }
    function runCount() { return _runCount; }
    // Aktueller Lauf (live), sonst der letzte abgeschlossene.
    function runDurationMs() {
        return _foiling ? (elapsedTimeMs() - _runStartMs) : _lastRunDurMs;
    }
    function runDistanceM() {
        return _foiling ? (distanceM() - _runStartDist) : _lastRunDistM;
    }
    function lastRunDurationMs() { return _lastRunDurMs; }
    function lastRunDistanceM() { return _lastRunDistM; }
    function lastRunAvgSpeed() { return _lastRunAvgSpeed; }
    function lastRunMaxSpeed() { return _lastRunMaxSpeed; }

    // --- Sensor-Callbacks --- (nur Roh-Datenerfassung für die spätere Auswertung)
    // GPS schon beim App-Start vorwärmen (nicht-blockierend) -> beim Drücken von
    // START ist der Fix meist schon da. Im Idle wird NICHT gepuffert (s. onPosition).
    function startGps() as Void {
        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
    }

    function onPosition(info as Position.Info) as Void {
        // Abgesichert: ein fehlerhafter Positions-Callback darf die Aufnahme nicht beenden.
        try {
            if (info == null || info.position == null) { return; }
            // Erst ab brauchbarer Genauigkeit gilt GPS als "da" (Cold-Start abwarten).
            if (info.accuracy != null && info.accuracy >= Position.QUALITY_USABLE) {
                _hasGpsFix = true;
            }
            // Aktuelle GPS-Geschwindigkeit immer merken (auch im Idle) -> Auto-Start.
            _idleSpeed = info.speed == null ? 0.0 : info.speed;
            // Im Idle nur den Fix vorwärmen/anzeigen, aber nichts in die Session puffern.
            if (!_recording) { return; }
            var deg = info.position.toDegrees();
            var spd = info.speed == null ? 0.0 : info.speed;
            _gpsBuf.add([_elapsedMs(), deg[0], deg[1], spd, _currentHr, info.accuracy]);
            if (_gpsBuf.size() >= GPS_CHUNK_SAMPLES) { _flushGps(false); }
        } catch (e) {
            // Einzelnen Punkt verwerfen, Aufnahme läuft weiter.
        }
    }

    function hasGpsFix() { return _hasGpsFix; }

    function onAccel(sensorData as Sensor.SensorData) as Void {
        // Abgesichert: ein fehlerhaftes Accel-Paket darf die Aufnahme nicht beenden.
        try {
            if (sensorData == null || sensorData.accelerometerData == null) { return; }
            var a = sensorData.accelerometerData;
            var n = a.x.size();
            for (var i = 0; i < n; i++) {
                _appendI16(a.x[i]);
                _appendI16(a.y[i]);
                _appendI16(a.z[i]);
                _accelCount++;
            }
            if (_accelCount >= ACCEL_CHUNK_SAMPLES) { _flushAccel(false); }
        } catch (e) {
            // Dieses Paket verwerfen, Aufnahme läuft weiter.
        }
    }

    // --- Live-Stats ---
    function speed3s() {
        var sum = 0.0; var cnt = 0;
        for (var i = 0; i < SPEED_AVG_SAMPLES; i++) {
            if (_speedRing[i] != null) { sum += _speedRing[i]; cnt++; }
        }
        return cnt == 0 ? 0.0 : sum / cnt;
    }

    // Median der bis zu 3 Speed-Samples — für die Lauferkennung. Ein einzelner GPS-
    // Spike (nasse Uhr beim Schwimmen) bleibt sonst 3 Ticks im Mittelwert hängen und
    // hält ihn über die Enter-Schwelle (Ring == Dwell). Der Median wirft ihn raus.
    // Anzeige/Alarm nutzen weiter speed3s() (Mittelwert) -> unverändert.
    function speed3sMed() {
        var vals = [];
        for (var i = 0; i < SPEED_AVG_SAMPLES; i++) {
            if (_speedRing[i] != null) { vals.add(_speedRing[i]); }
        }
        var n = vals.size();
        if (n == 0) { return 0.0; }
        // Insertion-Sort (max. 3 Elemente).
        for (var i = 1; i < n; i++) {
            var key = vals[i]; var j = i - 1;
            while (j >= 0 && vals[j] > key) { vals[j + 1] = vals[j]; j--; }
            vals[j + 1] = key;
        }
        // Untere Mitte: n=3 -> Index 1 (echter Median); n=2 -> Index 0 (konservativ).
        return vals[(n - 1) / 2];
    }

    function currentHr() { return _currentHr; }

    function distanceM() {
        var act = Activity.getActivityInfo();
        return (act != null && act.elapsedDistance != null) ? act.elapsedDistance : 0.0;
    }

    function elapsedTimeMs() {
        var act = Activity.getActivityInfo();
        return (act != null && act.timerTime != null) ? act.timerTime : 0;
    }

    // Weitere Live-Felder aus Activity.Info (alle null-sicher).
    function currentSpeed() {
        var act = Activity.getActivityInfo();
        return (act != null && act.currentSpeed != null) ? act.currentSpeed : 0.0;
    }
    function avgSpeed() {
        var act = Activity.getActivityInfo();
        return (act != null && act.averageSpeed != null) ? act.averageSpeed : 0.0;
    }
    function maxSpeed() {
        var act = Activity.getActivityInfo();
        return (act != null && act.maxSpeed != null) ? act.maxSpeed : 0.0;
    }
    function avgHr() {
        var act = Activity.getActivityInfo();
        return (act != null) ? act.averageHeartRate : null;
    }
    function maxHr() {
        var act = Activity.getActivityInfo();
        return (act != null) ? act.maxHeartRate : null;
    }
    function altitudeM() {
        var act = Activity.getActivityInfo();
        return (act != null && act.altitude != null) ? act.altitude : null;
    }
    function ascentM() {
        var act = Activity.getActivityInfo();
        return (act != null && act.totalAscent != null) ? act.totalAscent : null;
    }
    function temperatureC() {
        // Activity.Info hat kein temperature-Feld; ohne dedizierten Sensor null.
        return null;
    }

    // --- Vibrationsalarm ---
    hidden var _alarmActive = false;   // aktuell über/unter Schwelle?
    hidden var _alarmTick = 0;         // s seit letztem Vibrieren (für "continuous")
    const ALARM_REPEAT_S = 3;          // dauerhaft: alle 3 s erneut
    const LOW_ALARM_WINDOW_KMH = 2.0;  // Min-Alarm nur im Fenster [min-2, min)

    // Muster-ID -> Folge von VibeProfiles (Vibration mit Pausen via Intensität 0).
    hidden function _vibe(pattern) {
        if (!(Toybox has :Attention)) { return; }
        var A = Toybox.Attention;
        var seq;
        if (pattern.equals("short1")) {
            seq = [new A.VibeProfile(75, 200)];
        } else if (pattern.equals("long2")) {
            seq = [new A.VibeProfile(75, 500), new A.VibeProfile(0, 150), new A.VibeProfile(75, 500)];
        } else if (pattern.equals("lsl")) {
            seq = [new A.VibeProfile(75, 500), new A.VibeProfile(0, 120),
                   new A.VibeProfile(75, 150), new A.VibeProfile(0, 120), new A.VibeProfile(75, 500)];
        } else { // "short2" (Default)
            seq = [new A.VibeProfile(75, 150), new A.VibeProfile(0, 120), new A.VibeProfile(75, 150)];
        }
        A.vibrate(seq);
    }

    function _checkAlarm(speedMps) {
        if (!alarmEnabled) { return; }
        var eff = effThresholds();
        var effLow = eff[0];
        var effHigh = eff[1];
        var kmh = speedMps * 3.6;
        var over = (effHigh > 0 && kmh > effHigh);
        // Min-Alarm nur in einem schmalen Fenster knapp UNTER min ([min-2, min)).
        // So warnt es genau beim Abfallen unter min (wahrscheinlich noch am Foilen),
        // aber nicht dauerhaft beim Stehen/Gehen weit darunter (kein On-Foil-Status).
        var under = (effLow > 0 && kmh < effLow && kmh >= effLow - LOW_ALARM_WINDOW_KMH);
        var trip = over || under;
        if (trip && !_alarmActive) {
            _alarmActive = true;
            _alarmTick = 0;
            _vibe(over ? alarmPatternHigh : alarmPatternLow);
        } else if (trip && alarmRepeat.equals("continuous")) {
            _alarmTick++;
            if (_alarmTick >= ALARM_REPEAT_S) {
                _alarmTick = 0;
                _vibe(over ? alarmPatternHigh : alarmPatternLow);
            }
        } else if (!trip) {
            _alarmActive = false;
            _alarmTick = 0;
        }
    }

    // --- Puffer -> Storage ---
    function _appendI16(value) {
        var v = (value).toNumber();
        if (v > 32767) { v = 32767; } if (v < -32768) { v = -32768; }
        if (v < 0) { v += 65536; }
        _accelBuf.add(v & 0xFF);
        _accelBuf.add((v >> 8) & 0xFF);
    }

    function _flushAccel(force) {
        if (_accelCount == 0) { return; }
        if (!force && _accelCount < ACCEL_CHUNK_SAMPLES) { return; }
        if (!_store("ca_" + _sessionUuid + "_" + _accelChunkIndex, _accelBuf)) {
            // Object-Store voll: diesen Chunk VERWERFEN statt den Puffer unbegrenzt wachsen
            // zu lassen. Sonst hängt onAccel weiter dran -> RAM läuft voll (Crash-Gefahr auf
            // speicherschwachen Uhren wie FR55) UND jeder weitere Flush scheitert dauerhaft.
            // Die Roh-Accel steckt ohnehin im FIT (SensorLogging); klappt Storage später
            // wieder frei (nach Sync), läuft die Aufnahme normal weiter.
            _accelBuf = new [0]b;
            _accelCount = 0;
            return;
        }
        _accelChunkIndex++;
        _accelBuf = new [0]b;
        _accelCount = 0;
        _saveState(false);
    }

    function _flushGps(force) {
        if (_gpsBuf.size() == 0) { return; }
        if (!force && _gpsBuf.size() < GPS_CHUNK_SAMPLES) { return; }
        if (!_store("cg_" + _sessionUuid + "_" + _gpsChunkIndex, _gpsBuf)) {
            _gpsBuf = [];   // Store voll: Chunk verwerfen (kein unbegrenztes Wachsen), s. _flushAccel
            return;
        }
        _gpsChunkIndex++;
        _gpsBuf = [];
        _saveState(false);
    }

    function _persistMeta() {
        _store("meta_" + _sessionUuid, {
            "session_uuid" => _sessionUuid,
            "started_at" => _startedAt.value(),
            "gps_hz" => 1,
            "accel_hz" => _accelHz,
            "accel_scale" => ACCEL_SCALE,
            "foil_id" => sessionFoilId
        });
    }

    function _elapsedMs() {
        return (Time.now().value() - _startedAt.value()) * 1000;
    }

    // Einfache UUID aus Zeit + Zufall (für Idempotenz/Resume ausreichend).
    function _genUuid() {
        var t = Time.now().value();
        var r = Math.rand();
        return t.toString() + "-" + r.toString();
    }
}
