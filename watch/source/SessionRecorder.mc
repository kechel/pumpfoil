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
    var alarmEnabled = false;
    var speedHighKmh = 0;
    var speedLowKmh = 0;
    var alarmPatternHigh = "short2";  // Muster beim Überschreiten der Max-Speed
    var alarmPatternLow = "long2";    // Muster beim Unterschreiten der Min-Speed
    var alarmRepeat = "once";         // "once" = einmalig | "continuous" = dauerhaft

    var stopped = false;              // true nach Stopp&Speichern -> Erfolgs-Screen (bis Neustart)

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
    hidden var _foiling = false;
    hidden var _enterStreak = 0;
    hidden var _exitStreak = 0;
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
        colorByValue = Config.getBool("colorByValue", false);
        alarmEnabled = Config.getBool("alarmEnabled", false);
        speedHighKmh = Config.getNumber("speedHigh", 0);
        speedLowKmh = Config.getNumber("speedLow", 0);
        // Vibrationsmuster/-Modus kommen nur von der Website (Cache); Properties haben sie nicht.
        var ac = Storage.getValue("alarm_config");
        if (ac instanceof Lang.Dictionary) {
            if (ac.hasKey("enabled")) { alarmEnabled = ac["enabled"]; }
            if (ac.hasKey("high")) { speedHighKmh = ac["high"]; }
            if (ac.hasKey("low")) { speedLowKmh = ac["low"]; }
            if (ac.hasKey("ph")) { alarmPatternHigh = ac["ph"]; }
            if (ac.hasKey("pl")) { alarmPatternLow = ac["pl"]; }
            if (ac.hasKey("rep")) { alarmRepeat = ac["rep"]; }
        }
    }

    // --- Reverse-Pairing ---
    function isPaired() {
        var t = Config.getString("deviceToken");
        return t != null && !t.equals("");
    }

    // Holt einen Pairing-Code vom Server (zum Eintippen auf pumpfoil.org).
    function startPairing() {
        if (isPaired()) { return; }
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
    function fetchConfig() {
        var token = Config.getString("deviceToken");
        if (token == null || token.equals("")) { return; }
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/config",
            {},
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "X-Device-Token" => token },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onConfig));
    }

    function onConfig(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        if (responseCode == 200 && data instanceof Lang.Dictionary) {
            if (data.hasKey("views")) { setScreensFromConfig(data["views"]); }
            if (data.hasKey("colorByValue") && data["colorByValue"] != null) {
                colorByValue = data["colorByValue"];
            }
            // Vibrationsalarm von der Website übernehmen + cachen (offline verfügbar).
            if (data.hasKey("alarmEnabled")) {
                alarmEnabled = data["alarmEnabled"];
                if (data.hasKey("speedHigh") && data["speedHigh"] != null) { speedHighKmh = data["speedHigh"]; }
                if (data.hasKey("speedLow") && data["speedLow"] != null) { speedLowKmh = data["speedLow"]; }
                if (data.hasKey("alarmPatternHigh") && data["alarmPatternHigh"] != null) { alarmPatternHigh = data["alarmPatternHigh"]; }
                if (data.hasKey("alarmPatternLow") && data["alarmPatternLow"] != null) { alarmPatternLow = data["alarmPatternLow"]; }
                if (data.hasKey("alarmRepeat") && data["alarmRepeat"] != null) { alarmRepeat = data["alarmRepeat"]; }
                Storage.setValue("alarm_config", {
                    "enabled" => alarmEnabled, "high" => speedHighKmh, "low" => speedLowKmh,
                    "ph" => alarmPatternHigh, "pl" => alarmPatternLow, "rep" => alarmRepeat });
            }
            WatchUi.requestUpdate();
        }
    }

    // Von der Website geladene Ansichten übernehmen + cachen.
    function setScreensFromConfig(views) {
        if (!(views instanceof Lang.Array) || views.size() == 0) { return; }
        Storage.setValue("views_config", views);
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
        _sessionUuid = _genUuid();
        _startedAt = Time.now();
        _accelChunkIndex = 0;
        _gpsChunkIndex = 0;
        _accelBuf = new [0]b;
        _accelCount = 0;
        _gpsBuf = [];
        _hasGpsFix = false;
        _syncTickCounter = 0;
        _registerSession();
        _saveState(false);
        // Lauferkennung zurücksetzen.
        _foiling = false; _enterStreak = 0; _exitStreak = 0; _runCount = 0;
        _runStartMs = 0; _runStartDist = 0.0; _runMaxSpeed = 0.0;
        _lastRunDurMs = 0; _lastRunDistM = 0.0; _lastRunMaxSpeed = 0.0; _lastRunAvgSpeed = 0.0;

        // Roh-Accel ist OPTIONAL: ältere/abweichende Geräte ohne SensorLogging bzw.
        // ohne Roh-Beschleunigungs-Stream zeichnen GPS-only auf (Server -> gps_only).
        _accelOn = false;
        var logger = null;
        if (Toybox has :SensorLogging) {
            try {
                logger = new SensorLogging.SensorLogger({:accelerometer => {:enabled => true}});
            } catch (e) {
                logger = null;
            }
        }
        _sensorLogger = logger;

        // SensorLogger nur mitgeben, wenn vorhanden (sonst normale FIT-Session).
        var sessOpts = { :name => "Pump Foil", :sport => Activity.SPORT_SURFING };
        if (logger != null) { sessOpts[:sensorLogger] = logger; }
        _fitSession = ActivityRecording.createSession(sessOpts);

        // GPS kontinuierlich.
        Position.enableLocationEvents(
            Position.LOCATION_CONTINUOUS, method(:onPosition));

        // Roh-Accel-Stream (falls das Gerät es bietet). period<=4 s. 25 Hz ist für
        // fenix 7 dokumentiert; kann ein Gerät es nicht, bleibt es bei GPS-only.
        if (Sensor has :registerSensorDataListener) {
            try {
                Sensor.registerSensorDataListener(method(:onAccel), {
                    :period => 1,
                    :accelerometer => { :enabled => true, :sampleRate => ACCEL_HZ }
                });
                _accelOn = true;
            } catch (e) {
                _accelOn = false;
            }
        }

        _persistMeta();
        _fitSession.start();
        _recording = true;
    }

    function stop() {
        if (!_recording) { return; }
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
        if (_accelOn) {
            Sensor.unregisterSensorDataListener();
            _flushAccel(true);
        }
        _flushGps(true);
        _fitSession.stop();
        _fitSession.save();
        _fitSession = null;
        _recording = false;
        stopped = true;   // -> Erfolgs-/Upload-Screen
        // Session als abgeschlossen markieren; der SyncManager lädt den Rest hoch
        // und ruft /complete. Bleibt im sessions-Index, bis vollständig bestätigt.
        _saveState(true);
        Uploader.syncAll();
    }

    // --- Persistenter Multi-Session-Zustand (für robusten Sync) ---
    hidden function _registerSession() {
        var arr = Storage.getValue("sessions");
        if (!(arr instanceof Lang.Array)) { arr = []; }
        if (arr.indexOf(_sessionUuid) < 0) {
            arr.add(_sessionUuid);
            Storage.setValue("sessions", arr);
        }
    }

    hidden function _saveState(completed) {
        Storage.setValue("state_" + _sessionUuid, {
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
        // Reverse-Pairing pollt auch im Idle (alle ~3 s), solange ein Code aktiv ist.
        if (!_claimToken.equals("") && !isPaired()) {
            _pairPollCtr++;
            if (_pairPollCtr >= 3) { _pairPollCtr = 0; _pollPairing(); }
        }
        if (!_recording) { return; }
        var act = Activity.getActivityInfo();
        var spd = (act.currentSpeed != null) ? act.currentSpeed : 0.0;
        _currentHr = act.currentHeartRate;
        _speedRing[_speedRingPos] = spd;
        _speedRingPos = (_speedRingPos + 1) % SPEED_AVG_SAMPLES;
        _checkAlarm(speed3s());
        _updateRun(speed3s(), spd, distanceM(), elapsedTimeMs());
        // KEIN Live-Upload während der Aktivität: Garmin meldet sonst „Übertragung
        // während der Aktivität nicht möglich". Chunks landen laufend in Storage
        // (onAccel/onPosition); hochgeladen wird erst nach Stopp bzw. auf der
        // Upload-Seite (Idle).
    }

    // GPS-State-Machine für die Live-Lauferkennung (1-Hz-Tick).
    // Gibt true zurück, wenn gerade ein Lauf zu Ende ging.
    hidden function _updateRun(v3, vInst, dist, tMs) {
        if (!_foiling) {
            _enterStreak = (v3 >= RUN_ENTER_MPS) ? _enterStreak + 1 : 0;
            if (_enterStreak >= RUN_ENTER_DWELL) {
                _foiling = true;
                _exitStreak = 0;
                // Start rückdatieren auf den ersten schnellen Tick.
                _runStartMs = tMs - RUN_ENTER_DWELL * 1000;
                _runStartDist = dist;
                _runMaxSpeed = vInst;
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
    function onPosition(info as Position.Info) as Void {
        if (info == null || info.position == null) { return; }
        // Erst ab brauchbarer Genauigkeit gilt GPS als "da" (Cold-Start abwarten).
        if (info.accuracy != null && info.accuracy >= Position.QUALITY_USABLE) {
            _hasGpsFix = true;
        }
        var deg = info.position.toDegrees();
        var spd = info.speed == null ? 0.0 : info.speed;
        _gpsBuf.add([_elapsedMs(), deg[0], deg[1], spd, _currentHr, info.accuracy]);
        if (_gpsBuf.size() >= GPS_CHUNK_SAMPLES) { _flushGps(false); }
    }

    function hasGpsFix() { return _hasGpsFix; }

    function onAccel(sensorData as Sensor.SensorData) as Void {
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
    }

    // --- Live-Stats ---
    function speed3s() {
        var sum = 0.0; var cnt = 0;
        for (var i = 0; i < SPEED_AVG_SAMPLES; i++) {
            if (_speedRing[i] != null) { sum += _speedRing[i]; cnt++; }
        }
        return cnt == 0 ? 0.0 : sum / cnt;
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
        var kmh = speedMps * 3.6;
        var over = (speedHighKmh > 0 && kmh > speedHighKmh);
        var under = (speedLowKmh > 0 && kmh < speedLowKmh);
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
        Storage.setValue("ca_" + _sessionUuid + "_" + _accelChunkIndex, _accelBuf);
        _accelChunkIndex++;
        _accelBuf = new [0]b;
        _accelCount = 0;
        _saveState(false);
    }

    function _flushGps(force) {
        if (_gpsBuf.size() == 0) { return; }
        if (!force && _gpsBuf.size() < GPS_CHUNK_SAMPLES) { return; }
        Storage.setValue("cg_" + _sessionUuid + "_" + _gpsChunkIndex, _gpsBuf);
        _gpsChunkIndex++;
        _gpsBuf = [];
        _saveState(false);
    }

    function _persistMeta() {
        Storage.setValue("meta_" + _sessionUuid, {
            "session_uuid" => _sessionUuid,
            "started_at" => _startedAt.value(),
            "gps_hz" => 1,
            "accel_hz" => ACCEL_HZ,
            "accel_scale" => ACCEL_SCALE
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
