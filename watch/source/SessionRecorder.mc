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
    // Phasen des Lauf-Canary (s. _runCanaryRead). Bewusst grob: sie sollen sagen, WO gesucht
    // werden muss. Die Zahlen gehen so an den Server und stehen dort in `crash_phase`.
    const PHASE_BOOT = 1;      // App-Start: Config/Layout/Sync — die gefaehrlichste Phase
    const PHASE_IDLE = 2;      // Start-Screen steht, nichts laeuft
    const PHASE_RECORD = 3;    // Aufnahme
    const PHASE_UPLOAD = 4;    // Upload im Vordergrund

    const ACCEL_HZ = 25;
    const ACCEL_HZ_LITE = 10;   // sparsamer Modus für speicherarme Uhren (z. B. Forerunner 55)
    const ACCEL_SCALE = 2048;        // int16 pro 1 g
    // Größere Chunks = weniger BLE-Round-Trips = schnellerer Upload (Garmin lädt sequenziell
    // über die Handy-Bridge). 60 s Accel -> ~12 KB base64/Chunk. TEST: falls makeWebRequest die
    // größere Payload auf echten Uhren zuverlässig schluckt, hier bleiben; sonst zurück auf 750.
    // Bestehende Retries/Reconnect (3/10/30 s) fangen BT-Aussetzer weiterhin ab.
    const ACCEL_CHUNK_SAMPLES = 1500; // 60 s -> ~12 KB base64
    const GPS_CHUNK_SAMPLES = 120;    // 120 s (klein, halbiert die GPS-Round-Trips)
    const SPEED_AVG_SAMPLES = 3;     // 3-s-Geschwindigkeit

    hidden var _fitSession;
    hidden var _sensorLogger;
    hidden var _recording = false;
    hidden var _paused = false;            // Aufnahme pausiert (Sensoren aus, FIT-Timer angehalten)
    hidden var _pausedMs = 0;              // aufsummierte Pausendauer -> _elapsedMs bleibt lückenlos
    hidden var _pauseStartedMs = 0;        // System.getTimer() beim Pausenbeginn

    hidden var _sessionUuid;
    hidden var _startedAt;
    hidden var _chunkIndex = 0;      // fortlaufender Chunk-Index (gps & accel getrennt gezählt)
    hidden var _burstRing = new [15];   // BURST_WIN; Rohwerte der letzten 15 s (Max-Saeuberung)
    hidden var _burstPos = 0;
    // Der gesaeuberte Wert des LAUFENDEN Ticks. Wichtig: _maxKandidat() darf pro Tick nur EINMAL
    // laufen — jeder Aufruf schiebt in den 15-s-Ring, zwei Aufrufe halbieren also das Fenster.
    hidden var _spdMaxClean = 0.0;
    hidden var _minSpeedSeitEnde = 99.0;   // kleinster Speed seit dem letzten Lauf-Ende
    hidden var _runIstFortsetzung = false; // laufender Lauf setzt den vorigen fort -> nicht zaehlen
    hidden var _accelChunkIndex = 0;
    // Startzeit je Accel-Chunk (Index -> ms seit Session-Start, gleiche Basis wie GPS-t_ms).
    // Grundlage der EXAKTEN Accel-Zeitachse am Server (timebase.py, "exact_chunks") — bisher
    // musste er die Rate schaetzen, bei abweichender Realrate driftete die Achse um Minuten
    // (#1328: 6 min bei 5,7 % Abweichung). EIN Woerterbuch im state_-Dict, KEIN Extra-Key je
    // Chunk (Object-Store auf 96-KB-Uhren ist knapp). Deckel s. _flushAccel.
    hidden var _accelT0 = {};
    hidden var _accelBufT0 = null;   // ms-Zeit des ERSTEN Samples im aktuellen Puffer
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
    // Live-GPS-Qualitaet (Position.QUALITY_*). Nutzer-Video 05.08.: Uhr zeigt 100,1 km/h (3s)
    // im STEHEN am Steg — Cold-Start-/Multipath-Doppler. Unter QUALITY_USABLE gelten Speeds
    // als unglaubwuerdig: Anzeige "--", Lauf-Erkennung/Alarm bekommen 0. Die ROHDATEN bleiben
    // ungefiltert (der Server hat eigene, gemessene Glitch-Filter — hAcc wird ja mitgesendet).
    hidden var _gpsQuality = 0;
    hidden var _gnssStufe = -1;             // aktive GNSS-Stufe (s. enableGps)
    hidden var _gnssBei = 0;                // Timer-ms beim Einschalten einer Stufe
    hidden var _gnssOk = false;             // schon ein Positions-Event bekommen?
    hidden var _maxSpdSeen = 0.0;           // eigener Max ueber die GEGATETEN Werte — Garmins
                                            // act.maxSpeed behielte den 100er-Glitch die ganze Session
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
    // GNSS-Stufe (best|l1|two|gps), vom Server je Uhr gesetzt — s. enableGps. Voreinstellung
    // "best" = Verhalten seit 1.0.75; die Abstufungen darunter sparen Akku.
    var gnssMode = "best";
    // Aktivitätstyp der FIT-Session (Garmin-Connect-Kategorie): "surfing" = Surfen |
    // "openwater" = Freiwasserschwimmen. Von der Website konfigurierbar (via /config).
    var activityType = "surfing";
    // Update-Hinweis: Server meldet die neueste im IQ-Store freigegebene Version.
    var updateAvailable = false;     // neuere App-Version im Store verfügbar (aus /config)
    var updateHintUntilMs = 0;       // System.getTimer()-Zeit, bis der Hinweis eingeblendet wird
    hidden var _accelHz = ACCEL_HZ;  // tatsächlich genutzte Rate (für Meta/Server)
    hidden var _lowMem = null;       // Speicherarme Uhr (~96 KB)? null=noch nicht geprüft
    hidden var _accelTgt = null;     // Accel-Chunk-Zielgröße (kleiner auf ≤128-KB-Uhren)
    hidden var _idleSpeed = 0.0; // letzte GPS-Geschwindigkeit im Idle (für Auto-Start)
    hidden var _autoStreak = 0;  // aufeinanderfolgende schnelle Idle-Ticks
    hidden var _idleTicks = 0;   // 1-Hz-Ticks auf dem Start-Screen (Auto-Start-Vorlauf)
    // Web-Presets (Alarm An/Aus, Schwellen, Auto-Start) nur beim ERSTEN Config des App-Laufs in
    // die Live-Werte übernehmen; danach behält die Uhr die on-watch gemachten Änderungen (bis
    // App-Neustart). Der Cache wird immer mit dem Web-Wert aktualisiert -> Neustart = Preset.
    hidden var _presetsApplied = false;
    hidden var _foilChosen = false;   // Nutzer hat on-watch selbst eine Foil gewählt -> Default nie mehr setzen
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
    // Lauf-Ende-Ansicht: kurz nach Lauf-Ende eingeblendet — Uhrzeit + letzter Lauf
    // (Distanz/Dauer). Per Website konfigurierbar.
    var offFoilView = [Config.FIELD_CLOCK, Config.FIELD_LAST_RUN_DISTANCE, Config.FIELD_LAST_RUN_DURATION];
    // Pausen-Ansicht: Standard, solange nicht on-foil (nach der kurzen Lauf-Ende-Ansicht).
    // Uhrzeit + Läufe der aktuellen Session + Puls. REC-Symbol bleibt dabei sichtbar.
    var pauseView = [Config.FIELD_CLOCK, Config.FIELD_RUN_COUNT, Config.FIELD_HR];
    // Wert-Skalen der Layout-Grafiken (nur (:layouts)-Builds nutzen sie). Puls-Zonen kommen aus
    // dem PROFIL, nicht aus UserProfile.getHeartRateZones(): Wear OS und watchOS haben keine
    // Zonen-API, die Zahl muesste also ohnehin vom Server kommen — dann soll sie auf ALLEN
    // Plattformen aus derselben Quelle stammen, sonst faerbt dieselbe Grafik je Uhr anders.
    // NOTNAGEL fuer den allerersten Start ohne Config-Sync. Er folgt dem Profil-Vorschlag des
    // Servers ABSICHTLICH NICHT: sonst braeuchte jede Aenderung an einer Voreinstellung ein
    // Uhr-Release. Sobald /config einmal kam, gilt ohnehin die Zahl aus dem Profil.
    var hrZones = [95, 114, 133, 152, 171, 190];
    var speedScale = [8, 25];

    // --- Dynamische Layouts (frei gestaltete Seiten, s. docs/setup-and-watch-layouts.md) ---
    // layoutsOn kommt vom Server (Gating: Gerät >= 512 KB, Modell unauffällig, Nutzer nicht
    // abgeschaltet) — aber nur als Voreinstellung; der On-Watch-Schalter sticht sie. pages ist die
    // Seitenliste: Eintrag = [0,a,b,c] (klassische 3-Feld-Seite) oder [1,bg,[elemente]].
    // Alles in EINEM Storage-Key (`layouts_config`), damit der Object Store nicht zerfasert.
    var layoutsOn = false;
    var pages = [];
    // F3: je Zustand ein SATZ Seiten (nicht mehr einer). offFoilPages gilt, solange die Aufnahme
    // läuft und gerade kein Lauf ist (inkl. Dümpeln); pausePages nur bei MANUELL pausierter
    // Aufnahme. Leer = die Uhr nimmt ihre klassische Einzel-Ansicht (offFoilView/pauseView).
    var offFoilPages = [];
    var pausePages = [];
    // Darf man in off_foil/pause auch durch die übrigen Seiten blättern? Server-Default AN, damit
    // niemand Seiten verliert, die er heute erreicht (Einwand Jan).
    var browseAll = true;
    // Dreizustand des On-Watch-Schalters (Storage „layouts_pref"): null = nie angefasst -> es gilt
    // `serverDefault`; true/false = Wille des Nutzers und sticht den Server.
    var layoutsPref = null;
    var serverDefault = false;        // Voreinstellung aus /config (`layoutsOn`)
    // Canary (Selbstheilung): beim Aufnahme-Start setzen, beim sauberen Ende löschen. Liegt das
    // Flag beim App-Start noch da, ist die letzte Aufnahme mit dynamischem Layout NICHT sauber
    // beendet worden -> diese Sitzung fährt statisch, der Start-Screen sagt es kurz, und der
    // nächste Config-Abruf meldet es dem Server (der zählt je Modell und schaltet es dort ab).
    var layoutCrash = false;          // letzte Session ist abgestürzt -> jetzt statisch
    var canaryPending = false;        // dem Server noch zu melden (?canary=1)
    var layoutHintUntilMs = 0;        // Start-Screen-Hinweis bis zu dieser Timer-Zeit
    // ZWEITE Marke, für den APP-START. Der Canary oben wird erst beim Aufnahme-Start scharf
    // gemacht — stirbt die App schon beim Start (Layout aus dem Cache anwenden oder erstes Bild
    // zeichnen), konnte sich das nie melden: die Uhr kam nie dazu, etwas zu setzen, und der
    // Server lieferte unbeirrt dasselbe Layout weiter. Für den Nutzer heißt das „IQ!" beim
    // Öffnen, und Löschen samt Neuinstallation hilft nicht, weil die Konfiguration vom Server
    // kommt. Diese Marke liegt vom Anwenden bis zum ersten fertigen Bild.
    var bootCanaryOpen = false;

    var stopped = false;              // true nach Stopp&Speichern -> Erfolgs-Screen
    // Wann der Erfolgs-Screen erschienen ist. Er blieb bisher stehen, bis der Nutzer BACK drueckte
    // oder eine neue Aufnahme startete — auf einer Uhr, die man beim Rausgehen aus dem Wasser
    // wegsteckt, ist das der falsche Endzustand. Nach STOPPED_AUTO_BACK_MS geht die App von
    // selbst auf den Start-Screen zurueck (dort stehen GPS-Status, wartende Uploads, Menue).
    var stoppedAtMs = 0;
    const STOPPED_AUTO_BACK_MS = 10000;
    var storageFull = false;          // true, wenn eine Storage-Schreiboperation scheiterte (Object-Store voll)
    // Verworfene ROHDATEN-Chunks dieser Aufnahme. Bis 1.0.75 passierte das STUMM: bei vollem
    // Store wirft _flushGps/_flushAccel den Puffer weg, damit der Speicher nicht ueberlaeuft —
    // der Nutzer sah davon nichts und hatte hinterher eine Session mit einem einzigen Lauf
    // (belegt 13.08. bei zwei Instinct-2-Nutzern: 54-min-Session, ein Chunk mit 74 s uebrig).
    // Jetzt sichtbar im Aufnahme-Screen, damit man noch reagieren kann.
    var storageDropped = 0;
    // Dem Server noch zu melden: Store war voll, bei diesem gepufferten Volumen. Wird beim
    // App-Start aus dem Storage gelesen (der Fehlschlag passiert NACH dem Config-Abruf, also erst
    // beim naechsten Start meldbar) und erst nach bestaetigter Antwort geloescht.
    var storageFullPending = false;
    var storageFullKb = 0;
    // Lauf-Canary (s. _runCanaryRead): in welcher Phase der letzte Lauf gestorben ist, und ob
    // das dem Server noch zu melden ist. Phasen bewusst grob — sie sollen sagen, WO man suchen
    // muss, nicht was genau passiert ist.
    var crashPending = false;
    var crashPhase = 0;
    hidden var _runPhase = 0;
    hidden var _sfNoted = false;      // in diesem App-Lauf schon gemeldet (Bremse, s. _noteStorageFull)

    // --- Reverse-Pairing (Uhr zeigt Code -> auf pumpfoil.org eingeben) ---
    var pairCode = "";                // auf der Uhr angezeigter Code
    var pairStatus = "";              // Status-Text auf dem Verbinden-Screen
    var pairing = false;              // Re-Pair-Versuch läuft -> PairView zeigt Status/Fehler (auch wenn noch gepairt)
    hidden var _claimToken = "";
    hidden var _pairPollCtr = 0;

    // --- On-Watch-Lauferkennung (Live-Näherung, GPS-Speed) ---
    // Bewusst simpel: Hysterese + Dwell auf dem 3-s-Speed. Der Server bleibt mit
    // Accel-ML die Wahrheit für die Auswertung; das hier dient dem Live-Feedback.
    const RUN_ENTER_MPS = 2.8;   // ~10 km/h: Lauf-Start
    const RUN_EXIT_MPS = 2.5;    // ~9 km/h: darunter -> Lauf-Ende (Hysterese)
    const RUN_ENTER_DWELL = 4;   // s anhaltend -> foilend (bewusst träge: Waten/Steg-Gang
                                 // soll keinen Phantom-Lauf samt Datenansicht auslösen)
    const RUN_EXIT_DWELL = 3;    // s anhaltend langsam -> Lauf-Ende
    // Nach einem Lauf-Ende Sperre, bevor ein neuer Lauf starten darf. Fängt das
    // Zurückschwimmen/Waten/zum-Steg-Laufen direkt nach dem Absteigen ab (GPS-Speed-Spikes
    // der nassen Uhr sollen keinen Phantom-Lauf samt Übersichts-Screen auslösen).
    const RUN_REARM_COOLDOWN_MS = 25000;
    // Auto-Start: auf dem Start-Screen die GPS-Geschwindigkeit überwachen und die
    // Aufnahme automatisch starten, sobald man losfährt (~10 km/h, 4 s anhaltend).
    // Max-Speed saeubern — dieselben zwei Regeln wie der Server (analysis/gps.py):
    //   1) BURST: liegt ein Wert mehr als BURST_MARGIN ueber dem 15-s-Median UND absolut ueber
    //      BURST_ABS (28 km/h), ist es ein mehrsekuendiger Doppler-Burst -> Median statt Wert.
    //   2) DECKEL: ueber MAX_PLAUSIBLE (32 km/h) ist es kein Pumpfoil mehr (Glitch/Boot) -> gar
    //      nicht als Hoechstwert zaehlen.
    // Warum das noetig ist: an 119 echten Sessions gemessen (26.08.) lag der Uhr-Maxwert im Mittel
    // 9,4 km/h ueber dem ausgewerteten, im schlimmsten Fall 164 km/h (Session 2830 zeigte 103 km/h
    // bei ausgewerteten 15). Mit den zwei Regeln: Mittel +3,1 km/h, schlimmster Fall +17,4.
    // Kosten: 15 Zahlen und ein Median ohne Sortieren — laeuft auch auf den 96-KB-Uhren.
    const BURST_WIN = 15;                  // 1 Tick = 1 s -> 15-s-Fenster wie beim Server
    const BURST_MARGIN_MPS = 5.0;
    const BURST_ABS_MIN_MPS = 7.78;        // 28 km/h
    const MAX_PLAUSIBLE_MPS = 8.89;        // 32 km/h (RUN_MAX_PLAUSIBLE_KMH)
    // Ein neuer Lauf zaehlt nur, wenn es dazwischen einen ECHTEN Stopp gab (Speed unter
    // NOSTOP_MPS). Der Server fuehrt Laeufe ohne Stopp zusammen (_merge_no_stop, ohne
    // Zeitfenster) — ohne diese Regel zaehlt die Uhr Bruchstuecke einzeln.
    const NOSTOP_MPS = 1.5;
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
    // Hoechstpuls IM LAUF (Feld 21). Der Session-Hoechstpuls (Feld 9) kommt von Activity.Info —
    // je Lauf fuehrt den niemand, also selbst mitschreiben, genau wie beim Lauf-Hoechsttempo.
    hidden var _runMaxHr = 0;
    hidden var _lastRunMaxHr = 0;
    hidden var _lastRunAvgSpeed = 0.0;

    // Stop erfordert Halten (gegen versehentliches Beenden beim Foilen) — seit 2026-07-27 ZWEI
    // Sekunden statt drei (Jan): seit es das Menue Speichern/Pausieren/Verwerfen gibt, beendet das
    // Halten die Aufnahme nicht mehr selbst, sondern oeffnet nur die Auswahl. Ein Fehlgriff ist damit
    // harmlos, und 3 s fuehlten sich am Wasser unnoetig lang an. Dieselbe Aenderung ist fuer Wear OS,
    // Apple Watch und den Handy-Recorder vorgemerkt (docs/TODO.md).
    const STOP_HOLD_MS = 2000;      // Phase 1: halten bis hier -> Menue (Lite: direkt speichern)
    // Phase 2 (weiter halten = verwerfen) stammt aus der Zeit VOR dem Menue und hat keinen Aufrufer
    // mehr (discardHoldProgress). Bleibt vorerst stehen; beim naechsten Aufraeumen kann beides weg.
    const DISCARD_HOLD_MS = 6000;
    var stopHoldStartMs as Lang.Number or Null = null;

    // Fortschritt 0..1 des Stop-Haltens Phase 1 (Ring 1, 0..3 s). >=1.0 = „Speichern scharf".
    function stopHoldProgress() as Lang.Float {
        if (stopHoldStartMs == null) { return 0.0; }
        var e = System.getTimer() - stopHoldStartMs;
        var p = e.toFloat() / STOP_HOLD_MS;
        return p > 1.0 ? 1.0 : p;
    }

    // Fortschritt 0..1 des Verwerfen-Haltens Phase 2 (Ring 2, 3..6 s). 0 solange < 3 s.
    function discardHoldProgress() as Lang.Float {
        if (stopHoldStartMs == null) { return 0.0; }
        var e = System.getTimer() - stopHoldStartMs;
        if (e <= STOP_HOLD_MS) { return 0.0; }
        var p = (e - STOP_HOLD_MS).toFloat() / (DISCARD_HOLD_MS - STOP_HOLD_MS);
        return p > 1.0 ? 1.0 : p;
    }

    function initialize() {
        reloadConfig();
        _accelBuf = new [0]b;
        _gpsBuf = [];
        _runCanaryRead();
        runMark(PHASE_BOOT);
    }

    // --- Lauf-Canary: JEDER Absturz meldet sich, nicht nur der mit dynamischem Layout -------
    //
    // Anlass (16.08.): einem Nutzer ist die Forerunner 55 mit „IQ!" abgestuerzt. Bei uns kam
    // davon NICHTS an — `layout_canary_count` und `storage_full_count` stehen bei seiner Uhr auf
    // 0, und zwar bei ALLEN zwoelf FR55 im Bestand. Die beiden bestehenden Marken decken nur
    // zwei enge Faelle ab (Layout anwenden, Layout waehrend der Aufnahme) und sind ausserdem
    // `(:full)` — im Lite-Build der speicherarmen Uhren, also genau dort, wo Abstuerze am
    // wahrscheinlichsten sind, gab es gar keine.
    //
    // Diese Marke liegt vom App-Start bis zum sauberen Ende und traegt die PHASE mit. Kommt die
    // App reguler durch `onStop`, wird sie geloescht; stirbt sie vorher, liegt sie beim naechsten
    // Start noch da und geht mit dem naechsten /config-Abruf raus. Geschrieben wird nur beim
    // PHASENWECHSEL — vier Storage-Writes pro Lauf, nicht einer pro Frame.
    //
    // Bewusst NUR Diagnose: anders als der Layout-Canary schaltet das nichts ab. Ein Geraet, das
    // `onStop` nicht zuverlaessig ruft, wuerde sonst seine eigenen Funktionen abklemmen.
    hidden function _runCanaryRead() {
        var rc = Storage.getValue("run_canary");
        if (rc instanceof Lang.Number && rc > 0) {
            crashPending = true;
            crashPhase = rc;
            try { Storage.deleteValue("run_canary"); } catch (e) { }
        }
    }

    function runMark(phase) {
        if (_runPhase == phase) { return; }   // nur bei Wechsel schreiben
        _runPhase = phase;
        _store("run_canary", phase);
    }

    // Sauberes Ende — aus FoilApp.onStop. Danach ist der Lauf als geglueckt verbucht.
    function runClear() {
        _runPhase = 0;
        try { Storage.deleteValue("run_canary"); } catch (e) { }
    }

    function reloadConfig() {
        // Profil-Sprache (vom Server gecacht) anwenden — auch offline verfügbar.
        Strings.setLang(Storage.getValue("lang"));
        // Offene Speicher-Meldung? Der Fehlschlag passiert NACH dem Config-Abruf (syncAll laeuft
        // erst danach), also ist er immer erst beim naechsten Start meldbar. Der Hinweis im
        // Start-Screen kommt hier gleich mit, damit der Nutzer den Grund sieht und nicht nur
        // „hängt".
        var sfkb = Storage.getValue("storage_full_kb");
        if (sfkb instanceof Lang.Number && sfkb >= 0) {
            storageFullPending = true;
            storageFullKb = sfkb;
            storageFull = true;
        }
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
        var gm = Storage.getValue("gnss_mode");
        gnssMode = (gm instanceof Lang.String) ? gm : "best";
        var at = Storage.getValue("activity_type");
        activityType = (at != null) ? at : "surfing";
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
        // Gecachte Pausen-Ansicht (Dümpeln zwischen den Läufen). Fehlt der Cache, bleibt der
        // hartcodierte Default — genau wie bei Uhren, die noch nie einen Config-Sync hatten.
        var pv = Storage.getValue("pause_config");
        if (pv instanceof Lang.Array && pv.size() == 3) { pauseView = pv; }
        // Gecachte Wert-Skalen (Puls-Zonen + Geschwindigkeitsspanne) — offline verfuegbar.
        _scalesFromCache();
        // Dynamische Layouts aus dem Cache (offline verfügbar) + On-Watch-Not-Aus.
        _layoutsFromCache();
        initAlarmSelection();   // Default-Foil/Website (offline aus Cache)
    }

    // Gecachtes/geliefertes Layout-Paket übernehmen. Defensiv: alles, was nicht wie erwartet
    // aussieht, wird verworfen -> die Uhr fährt statisch weiter statt zu crashen.
    // (:layouts): die sparsamen Stufen (LITE 96 KB + ENG 128 KB) bekommen vom Server ohnehin keine
    // Layouts (Gating >= 512 KB), also braucht ihr Build weder Parser noch Umschalter — jedes Byte
    // zaehlt dort. Genau daran war die 128-KB-Klasse erstickt (docs/TODO.md, 17.08.).
    (:layouts) hidden function _applyLayouts(lay) {
        var on = (lay instanceof Lang.Dictionary && lay.hasKey("on") && lay["on"] == true);
        var pg = (lay instanceof Lang.Dictionary && lay.hasKey("pages")) ? lay["pages"] : null;
        pages = (pg instanceof Lang.Array) ? pg : [];
        // Seiten-SÄTZE (F3). Ein Cache aus 1.0.66 kennt nur die Einzel-Einträge „off"/„pause" —
        // daraus wird hier eine Liste mit einem Element, damit ein App-Update ohne frisches
        // /config nicht plötzlich ohne Off-Foil-/Pausen-Screen dasteht.
        offFoilPages = _pageSet(lay, "offPages", "off");
        pausePages = _pageSet(lay, "pausePages", "pause");
        browseAll = !(lay instanceof Lang.Dictionary && lay.hasKey("browseAll")
                      && lay["browseAll"] == false);
        // WER ENTSCHEIDET: der Schalter auf der Uhr, sobald ihn jemand angefasst hat. Der
        // Server-Wert ist nur die VOREINSTELLUNG für den Fall, dass das noch nie passiert ist
        // (Jan: „egal was der server sagt, an der uhr will ich es umstellen koennen, nur bei
        // app-start soll es auf den wert des servers einmal vorinitialisiert werden").
        // layoutCrash bleibt davon unberührt: es sperrt nur die Sitzung nach einem Absturz
        // (Selbstheilung) und wird durch bewusstes Einschalten sofort aufgehoben.
        serverDefault = on;
        var want = (layoutsPref == null) ? on : (layoutsPref == true);
        layoutsOn = (want && !layoutCrash && pages.size() > 0);
    }

    // Einen Seiten-Satz aus dem Paket lesen: erst der F3-Schlüssel (Liste), sonst der alte
    // Einzel-Eintrag als Liste mit einem Element. Alles, was nicht wie erwartet aussieht, wird
    // verworfen — lieber statisch weiterfahren als crashen.
    (:layouts) hidden function _pageSet(lay, key, legacyKey) {
        if (!(lay instanceof Lang.Dictionary)) { return []; }
        if (lay.hasKey(key) && lay[key] instanceof Lang.Array && lay[key].size() > 0) {
            var out = [];
            var src = lay[key];
            for (var i = 0; i < src.size(); i++) {
                if (src[i] instanceof Lang.Array && src[i].size() > 0) { out.add(src[i]); }
            }
            return out;
        }
        if (lay.hasKey(legacyKey) && lay[legacyKey] instanceof Lang.Array) { return [lay[legacyKey]]; }
        return [];
    }

    // Layout-Paket aus dem Server-Config ziehen und in EINEN Storage-Key cachen. Liefert der
    // Server layoutsOn=false (oder den Key gar nicht), fällt die Uhr auf die statische Logik
    // zurück — ohne App-Update.
    (:layouts) hidden function _layoutsFromConfig(data) {
        if (!data.hasKey("layoutsOn")) { return; }
        var lay = {
            "on" => (data["layoutsOn"] == true),
            "pages" => (data.hasKey("pages") ? data["pages"] : []),
            "off" => (data.hasKey("offFoil") ? data["offFoil"] : null),
            "pause" => (data.hasKey("pause") ? data["pause"] : null),
            // F3-Sätze; ältere Server liefern sie nicht -> dann bleibt es bei „off"/„pause".
            "offPages" => (data.hasKey("offFoilPages") ? data["offFoilPages"] : null),
            "pausePages" => (data.hasKey("pausePages") ? data["pausePages"] : null),
            "browseAll" => !(data.hasKey("browseAll") && data["browseAll"] == false)};
        _applyLayouts(lay);
        _store("layouts_config", lay);
    }

    (:layouts) hidden function _layoutsFromCache() {
        // Dreizustand: null = nie angefasst (dann gilt der Server-Wert), true/false = Wille des
        // Nutzers. Altbestand aus 1.0.66 (`layouts_off` = reiner Not-Aus) einmal übernehmen.
        layoutsPref = Storage.getValue("layouts_pref");
        if (layoutsPref == null && Storage.getValue("layouts_off") == true) { layoutsPref = false; }
        // Canary noch gesetzt? Dann ist die letzte Aufnahme abgestürzt. NICHT dauerhaft
        // abschalten (das entscheidet der Server je Modell) — nur diese Sitzung statisch fahren,
        // Hinweis zeigen und die Meldung fürs nächste /config vormerken. Flag danach löschen,
        // damit ein einzelner Absturz nicht ewig nachhallt.
        // Beide Marken prüfen: die Aufnahme-Marke (letzte Fahrt) UND die Start-Marke (letzter
        // App-Start). Bei der Start-Marke ist das Anwenden selbst der Verdächtige, deshalb wird
        // das Layout diesmal gar nicht erst angewendet — sonst stürzt die App genauso wieder ab.
        var recCrash = (Storage.getValue("layout_canary") == true);
        var bootCrash = (Storage.getValue("layout_boot_canary") == true);
        if (recCrash || bootCrash) {
            layoutCrash = true;
            canaryPending = true;
            layoutHintUntilMs = System.getTimer() + 6000;
            if (recCrash) { _store("layout_canary", false); }
            if (bootCrash) { _store("layout_boot_canary", false); }
        }
        var lc = Storage.getValue("layouts_config");
        if (lc instanceof Lang.Dictionary && !layoutCrash) {
            // Ab hier gilt der Start als „offen": bleibt die Marke liegen, war es ein Absturz.
            bootCanaryOpen = true;
            _store("layout_boot_canary", true);
            _applyLayouts(lc);
        }
    }

    // Start als geglückt verbuchen — gerufen, sobald das erste Bild nachweislich stand
    // (RecordView.onUpdate ein zweites Mal). Ein Storage-Write pro App-Start, nicht pro Frame.
    (:layouts) function bootCanaryClear() {
        if (bootCanaryOpen) {
            bootCanaryOpen = false;
            if (Storage.getValue("layout_boot_canary") == true) { _store("layout_boot_canary", false); }
        }
    }
    (:nolayouts) function bootCanaryClear() { }

    (:nolayouts) hidden function _layoutsFromConfig(data) { }
    (:nolayouts) hidden function _layoutsFromCache() { }

    // Canary scharf machen — NUR wenn diese Aufnahme wirklich mit dynamischem Layout läuft.
    // Ein Storage-Write pro Session-Start, nicht pro Frame.
    (:layouts) hidden function _armCanary() {
        if (layoutsOn) { _store("layout_canary", true); }
    }
    (:layouts) hidden function _clearCanary() {
        if (Storage.getValue("layout_canary") == true) { _store("layout_canary", false); }
    }
    (:nolayouts) hidden function _armCanary() { }
    (:nolayouts) hidden function _clearCanary() { }

    // Lite-Build: keine Layouts, also nichts zu übernehmen (Felder bleiben auf ihren Defaults).
    (:nolayouts) hidden function _applyLayouts(lay) { layoutsOn = false; }

    // Wert-Skalen der Layout-Grafiken (Puls-Zonen + Geschwindigkeitsspanne). NUR die Builds mit
    // Renderer brauchen sie: die 96-KB- (LITE) und die 128-KB-Klasse (ENG) zeichnen keine Layouts,
    // dort waeren Parsen UND der Storage-Eintrag verschwendeter Platz — und Platz ist genau das,
    // was diesen Uhren fehlt (1.0.64 crashte dort unter Dauerlast).
    (:layouts) hidden function _applyScales(data) {
        if (data.hasKey("hrZones") && data["hrZones"] instanceof Lang.Array
                && data["hrZones"].size() == 6) {
            hrZones = data["hrZones"];
            _store("hrzones_config", hrZones);
        }
        if (data.hasKey("speedScale") && data["speedScale"] instanceof Lang.Array
                && data["speedScale"].size() == 2) {
            speedScale = data["speedScale"];
            _store("speedscale_config", speedScale);
        }
    }

    (:nolayouts) hidden function _applyScales(data) { }

    (:layouts) hidden function _scalesFromCache() {
        var hz = Storage.getValue("hrzones_config");
        if (hz instanceof Lang.Array && hz.size() == 6) { hrZones = hz; }
        var ss = Storage.getValue("speedscale_config");
        if (ss instanceof Lang.Array && ss.size() == 2) { speedScale = ss; }
    }

    (:nolayouts) hidden function _scalesFromCache() { }
    (:nolayouts) hidden function _pageSet(lay, key, legacyKey) { return []; }

    // On-Watch-Not-Aus umschalten (Menüpunkt). Wirkt sofort und überlebt den Neustart.
    //
    // Einschalten heißt „ich will es JETZT wieder probieren" (ausdrücklich Jan: „selbst dann darf
    // ein user das gerne aktivieren und testen"). Also hebt es beides auf, was sonst noch sperrt:
    //   * `layoutCrash` (Selbstheilung nach Absturz) gilt nur bis zum nächsten Start — eine
    //     bewusste Nutzer-Entscheidung sticht das sofort. `canaryPending` bleibt: der Server soll
    //     den Absturz trotzdem erfahren, das ist Statistik und keine Sperre.
    //   * Ein `layoutsOn:false` im Cache, das aus einem früheren Start stammt (z. B. das Flag war
    //     serverseitig noch gesetzt und ist inzwischen zurückgesetzt) — dafür frisch nachfragen.
    //     Während einer laufenden Aufnahme blockt Garmin das Netz; dann greift weiter der Cache.
    // Der Schalter hat DREI Zustände, weil es drei Wünsche gibt: „an", „aus" und „entscheide du"
    // (= Voreinstellung vom Server übernehmen). Der dritte war vorher nur der interne Anfangswert
    // und damit nicht wieder erreichbar — Jan zu Recht: „ob die initialisierung vom server geklappt
    // hat beim ersten aufruf … kann ich ja nie wieder testen oder?".
    // Reihenfolge: Automatisch -> An -> Aus -> Automatisch.
    (:layouts) function toggleLayouts() {
        if (layoutsPref == null) {
            layoutsPref = true;
        } else if (layoutsPref == true) {
            layoutsPref = false;
        } else {
            layoutsPref = null;
        }
        _store("layouts_pref", layoutsPref);
        if (layoutsPref == true) {
            layoutCrash = false;          // bewusste Entscheidung sticht die Selbstheilung
            layoutHintUntilMs = 0;
        }
        var lc = Storage.getValue("layouts_config");
        if (lc instanceof Lang.Dictionary) { _applyLayouts(lc); } else { layoutsOn = false; }
        if (layoutsPref == true) {
            try { fetchConfig(); } catch (e) {}   // ggf. frische Seiten holen (im Rennen blockt Garmin das Netz)
        }
    }
    // Was der Menüpunkt anzeigen soll: der wirksame Wunsch, nicht das Ergebnis.
    (:layouts) function layoutsWanted() {
        return (layoutsPref == null) ? serverDefault : (layoutsPref == true);
    }
    // null = „Automatisch" (Server entscheidet), sonst die feste Wahl des Nutzers.
    (:layouts) function layoutsAuto() { return layoutsPref == null; }
    // Nur ein AUSDRÜCKLICHES „an" auf der Uhr fordert Layouts an (nicht „Automatisch"): sonst
    // bekäme jede knappe Uhr das Paket, obwohl niemand danach gefragt hat.
    (:layouts) hidden function _layoutsRequested() { return layoutsPref == true; }
    (:nolayouts) hidden function _layoutsRequested() { return false; }

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
        pairing = true;
        pairCode = "";
        _claimToken = "";
        _pairPollCtr = 0;
        // Ohne Telefon-/Netz-Verbindung kann kein Code erzeugt werden -> sofort klar melden
        // (sonst „passiert nichts": makeWebRequest liefert nur still einen negativen Code).
        if (!System.getDeviceSettings().phoneConnected) {
            pairStatus = Strings.s("pair.noConn");
            return;
        }
        pairStatus = Strings.s("pair.fetching");
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
            pairStatus = "pumpfoil.org";
        } else {
            pairStatus = Strings.s("common.error") + " (" + responseCode + ")";
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
            pairing = false;
            pairStatus = Strings.s("pair.done");
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
            pairStatus = Strings.s("pair.done");
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
            // Steht eine Canary-Meldung aus (letzte Aufnahme mit dynamischem Layout ist
            // abgestürzt), geht sie hier mit: der Server zählt sie je Uhrenmodell und schaltet
            // Layouts dort ab, sobald zwei verschiedene Uhren desselben Modells gemeldet haben.
            var params = { "v" => Config.VERSION, "p" => "garmin", "pn" => pn };
            if (canaryPending) { params["canary"] = "1"; }
            // Voller Object Store: mit dem gepufferten VOLUMEN melden. Der Server lernt daraus,
            // wieviel eine Uhr dieses Modells wirklich puffern kann — eine Warnschwelle nach
            // Anzahl waere unbrauchbar (20 Sessions à 2 min = 0,7 MB, 3 à 5 h = 10 MB), und
            // Connect IQ verrät den freien Store nicht.
            if (storageFullPending) {
                params["sf"] = "1";
                params["kb"] = storageFullKb.toString();
            }
            // Der letzte Lauf ist nicht sauber zu Ende gekommen -> mit der PHASE melden
            // (s. _runCanaryRead). Reine Diagnose, der Server schaltet daraufhin nichts ab.
            if (crashPending) { params["crash"] = crashPhase.toString(); }
            // Hat der Nutzer eigene Layouts am Handgelenk EINGESCHALTET, das mitsagen: bei knappen
            // Uhren (128-KB-Klasse, z. B. fēnix 5) liefert der Server sie nur auf Anfrage aus.
            // Ohne das zeigte die fēnix 5 trotz Umschalten nichts — das Paket kam nie an.
            if (_layoutsRequested()) { params["lay"] = "1"; }
            Communications.makeWebRequest(
                Config.baseUrl() + "/api/devices/config",
                params,   // Version+Plattform+PartNo (+ Canary-Meldung)
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
                if (!_presetsApplied) { autoStart = data["autoStart"]; }   // live nur beim 1. Config
                _store("auto_start", data["autoStart"]);                    // Cache = Web-Preset (Neustart)
            }
            if (data.hasKey("gnssMode") && data["gnssMode"] instanceof Lang.String) {
                var gmNeu = data["gnssMode"];
                if (!gmNeu.equals(gnssMode)) {
                    gnssMode = gmNeu;
                    _store("gnss_mode", gnssMode);
                    // Sofort wirksam machen: GPS laeuft seit App-Start: neu anfordern, sonst
                    // greift die Aenderung erst beim naechsten Start.
                    try { enableGps(); } catch (eg) { }
                }
            }
            if (data.hasKey("recordMode") && data["recordMode"] != null) {
                recordMode = data["recordMode"];
                _store("record_mode", recordMode);
            }
            if (data.hasKey("activityType") && data["activityType"] != null) {
                activityType = data["activityType"];
                _store("activity_type", activityType);
            }
            // Vibrationsalarm von der Website übernehmen + cachen (offline verfügbar).
            // Live-Werte (Alarm An/Aus, Schwellen) nur beim ERSTEN Config übernehmen — danach behält
            // die Uhr die on-watch gemachten Änderungen (bis App-Neustart). Cache immer = Web-Wert.
            if (data.hasKey("alarmEnabled")) {
                manualAlarm = data["alarmEnabled"];   // Web-Master (steuert nur den initAlarmSelection-Default)
                var webHigh = (data.hasKey("speedHigh") && data["speedHigh"] != null) ? data["speedHigh"] : speedHighKmh;
                var webLow = (data.hasKey("speedLow") && data["speedLow"] != null) ? data["speedLow"] : speedLowKmh;
                if (!_presetsApplied) {
                    alarmEnabled = data["alarmEnabled"];
                    speedHighKmh = webHigh;
                    speedLowKmh = webLow;
                    if (data.hasKey("alarmPatternHigh") && data["alarmPatternHigh"] != null) { alarmPatternHigh = data["alarmPatternHigh"]; }
                    if (data.hasKey("alarmPatternLow") && data["alarmPatternLow"] != null) { alarmPatternLow = data["alarmPatternLow"]; }
                    if (data.hasKey("alarmRepeat") && data["alarmRepeat"] != null) { alarmRepeat = data["alarmRepeat"]; }
                }
                if (data.hasKey("alarmDefault") && data["alarmDefault"] != null) { alarmDefault = data["alarmDefault"]; }
                _store("alarm_config", {
                    "enabled" => data["alarmEnabled"], "high" => webHigh, "low" => webLow,
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
            // Pausen-Ansicht (zwischen den Läufen) übernehmen + cachen. Fehlt der Key (alter
            // Server), bleibt der bisherige Wert — also der hartcodierte Default.
            if (data.hasKey("pauseView") && data["pauseView"] instanceof Lang.Array
                    && data["pauseView"].size() > 0) {
                pauseView = _normView(data["pauseView"]);
                _store("pause_config", pauseView);
            }
            // Wert-Skalen der Layout-Grafiken (nur (:layouts)-Builds; in LITE/ENG ein No-Op).
            _applyScales(data);
            // Dynamische Layouts (nur (:layouts)-Builds; in LITE/ENG ist das ein No-Op).
            _layoutsFromConfig(data);
            // Canary-Meldung ist beim Server angekommen (wir sind im Erfolgspfad) -> erledigt.
            canaryPending = false;
            crashPending = false;
            // Dasselbe fuer die Speicher-Meldung. deleteValue braucht keinen Platz, geht also
            // auch bei vollem Store; trotzdem in try, damit ein Fehlschlag nichts beendet.
            if (storageFullPending) {
                storageFullPending = false;
                try { Storage.deleteValue("storage_full_kb"); } catch (e3) { }
            }
            // Update-Hinweis: neuere im IQ-Store freigegebene Version als unsere? -> kurz einblenden.
            if (data.hasKey("latestVersion") && data["latestVersion"] != null) {
                if (_versionNewer(data["latestVersion"], Config.VERSION)) {
                    updateAvailable = true;
                    updateHintUntilMs = System.getTimer() + 5000;   // ~5 s einblenden
                }
            }
            initAlarmSelection();   // Default-Foil/Website vorauswählen (Start-Screen)
            _presetsApplied = true; // ab jetzt behalten on-watch-Änderungen Vorrang (bis App-Neustart)
            WatchUi.requestUpdate();
          } catch (e) {
            // Teil-Config evtl. übernommen; Rest ignorieren — kein Crash.
          }
        }
    }

    // Versionsvergleich "x.y.z": true, wenn a NEUER als b ist. Null-/Format-sicher.
    hidden function _versionNewer(a, b) as Lang.Boolean {
        if (!(a instanceof Lang.String) || !(b instanceof Lang.String)) { return false; }
        var pa = _parseVer(a);
        var pb = _parseVer(b);
        for (var i = 0; i < 3; i++) {
            if (pa[i] != pb[i]) { return pa[i] > pb[i]; }
        }
        return false;
    }

    hidden function _parseVer(s as Lang.String) as Lang.Array {
        var parts = [0, 0, 0];
        var seg = 0;
        var cur = 0;
        for (var i = 0; i < s.length(); i++) {
            var ch = s.substring(i, i + 1);
            if (ch.equals(".")) {
                if (seg < 2) { parts[seg] = cur; seg++; cur = 0; }
            } else {
                var d = ch.toNumber();
                if (d != null) { cur = cur * 10 + d; }
            }
        }
        parts[seg] = cur;
        return parts;
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
        // Default (Foil/Alarm) nur bis zum ersten erfolgreichen CONFIG setzen — so wird nach dem
        // Pairing der Default-Foil noch gesetzt (auch wenn beim ungepairten Start mangels Foils "-"
        // stand), aber eine eigene on-watch-Auswahl (_foilChosen) NIE überschrieben.
        if (_presetsApplied || _foilChosen) { return; }
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

    // Nutzer hat on-watch selbst eine Foil (oder „keine") gewählt -> Default nie mehr überschreiben.
    function markFoilChosen() { _foilChosen = true; }

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
        _paused = false; _pausedMs = 0; _pauseStartedMs = 0;
        _sessionUuid = _genUuid();
        _startedAt = Time.now();
        _accelChunkIndex = 0;
        storageDropped = 0;
        _maxSpdSeen = 0.0;
        _accelT0 = {};
        _accelBufT0 = null;
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
        _armCanary();
        runMark(PHASE_RECORD);
        // Lauferkennung zurücksetzen.
        _foiling = false; _enterStreak = 0; _exitStreak = 0; _runCount = 0;
        _runEndedMs = -100000;
        _runStartMs = 0; _runStartDist = 0.0; _runMaxSpeed = 0.0;
        _lastRunDurMs = 0; _lastRunDistM = 0.0; _lastRunMaxSpeed = 0.0; _lastRunAvgSpeed = 0.0;
        _runMaxHr = 0; _lastRunMaxHr = 0;

        // Roh-Accel ist OPTIONAL: ältere/abweichende Geräte ohne SensorLogging bzw.
        // ohne Roh-Beschleunigungs-Stream zeichnen GPS-only auf (Server -> gps_only).
        // Im "gps"-Modus (speicherarme Uhren) bewusst KEIN Accel -> minimaler Speicher.
        _accelOn = false;
        var gpsOnly = recordMode.equals("gps") || _isLowMem();
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
        // Aktivitätstyp wählbar:
        //  - "pumpfoil": generic + Freiwasser-SubSport + Name "Pumpfoil" -> Garmin Connect zeigt
        //    "Pumpfoil" als Aktivitätstyp (wie FoilMotion), behält aber die Wasser-Kategorie.
        //  - "openwater": Freiwasserschwimmen.
        //  - sonst: Surfen.
        // WICHTIG: Sport-/SubSport-Konstanten per `has` PRÜFEN, bevor wir sie referenzieren —
        // alte Geräte (z. B. fēnix 5) kennen SPORT_GENERIC/SUB_SPORT_OPEN_WATER u. U. nicht;
        // ein direkter Zugriff wirft "Symbol Not Found" schon BEIM AUFBAU des Literals (nicht per
        // try/catch fangbar). Fehlt ein Symbol -> Feld weglassen (createSession nimmt Default).
        // So generisch für ALLE Geräte, ohne Pro-Gerät-Sportartenliste.
        var sessOpts = { :name => "Pumpfoil" };
        var owSub = (Activity has :SUB_SPORT_OPEN_WATER) ? Activity.SUB_SPORT_OPEN_WATER : null;
        if (activityType.equals("pumpfoil")) {
            // SPORT_GENERIC == 0 (FIT-Standard); fehlt das Symbol, den Zahlenwert nehmen.
            sessOpts[:sport] = (Activity has :SPORT_GENERIC) ? Activity.SPORT_GENERIC : 0;
            if (owSub != null) { sessOpts[:subSport] = owSub; }
        } else if (activityType.equals("openwater")) {
            if (Activity has :SPORT_SWIMMING) { sessOpts[:sport] = Activity.SPORT_SWIMMING; }
            if (owSub != null) { sessOpts[:subSport] = owSub; }
        } else {
            if (Activity has :SPORT_SURFING) { sessOpts[:sport] = Activity.SPORT_SURFING; }
        }
        if (logger != null) { sessOpts[:sensorLogger] = logger; }
        _fitSession = null;
        try {
            _fitSession = ActivityRecording.createSession(sessOpts);
        } catch (e) {
            _fitSession = null;
        }

        // GPS kontinuierlich.
        enableGps();

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
        // Die auf der Uhr gewählte Foil BLEIBT über Sessions hinweg erhalten (Meta ist schon
        // persistiert). Erst ein kompletter App-Neustart setzt via initAlarmSelection wieder den
        // Default — kein Reset pro Session (sonst fiele die nächste Session ungewollt auf Default).
        if (_fitSession != null) {
            try { _fitSession.start(); } catch (e) { _fitSession = null; }
        }
        _recording = true;
        Uploader.setRecording(true);   // Auto-Retry pausieren: kein Sync während der Aufnahme
        Uploader.setActiveSession(_sessionUuid);   // diese eine Session bleibt beim Sync draussen
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
        _clearCanary();                 // sauber beendet -> kein Absturz-Verdacht
        Uploader.setRecording(false);   // Aufnahme vorbei -> Auto-Retry wieder erlaubt
        Uploader.setActiveSession(null);
        stopped = true;   // -> Erfolgs-/Upload-Screen
        stoppedAtMs = System.getTimer();
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

    // Aufnahme VERWERFEN (Phase-2-Halten, 6 s): stoppen OHNE zu speichern/hochladen und
    // alle bereits geschriebenen Rohdaten der laufenden Session löschen. Kein Erfolgs-Screen.
    function discard() {
        if (!_recording) { return; }
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition)); } catch (e) {}
        if (_accelOn) { try { Sensor.unregisterSensorDataListener(); } catch (e) {} }
        _recording = false;
        _clearCanary();                 // bewusst verworfen ist auch „sauber beendet"
        Uploader.setRecording(false);
        Uploader.setActiveSession(null);
        _purgeCurrent();
        // FIT verwerfen statt speichern (fällt bei fehlendem discard auf save+ignorieren zurück).
        if (_fitSession != null) {
            try {
                if (_fitSession has :discard) { _fitSession.discard(); } else { _fitSession.stop(); _fitSession.save(); }
            } catch (e) {}
            _fitSession = null;
        }
        stopped = false;   // kein „Gespeichert"-Screen -> zurück zum Start-Screen
    }

    function isPaused() { return _paused; }

    // Aufnahme PAUSIEREN: Sensoren aus + FIT-Timer anhalten, Session/Puffer offen lassen.
    // Bereits gepufferte Rohdaten werden geflusht; die Zeitbasis läuft über _pausedMs lückenlos
    // weiter (kein Loch im Accel-Stream). Fortsetzen mit resume().
    function pause() {
        if (!_recording || _paused) { return; }
        _paused = true;
        _pauseStartedMs = System.getTimer();
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition)); } catch (e) {}
        if (_accelOn) {
            try { Sensor.unregisterSensorDataListener(); } catch (e) {}
            _flushAccel(true);
        }
        _flushGps(true);
        if (_fitSession != null) { try { _fitSession.stop(); } catch (e) {} }
        _saveState(false);
        // PAUSE = Gelegenheit zum Hochladen. Der FIT-Timer ist gestoppt, aus Garmins Sicht laeuft
        // keine Aktivitaet mehr — die Uebertragung ist hier also moeglicherweise erlaubt (waehrend
        // der Aufnahme lehnt die Uhr sie ab). Wenn nicht, scheitert der Versuch still und der
        // Backoff greift; nichts geht kaputt.
        // WARUM das wichtig ist (13.08., zwei Instinct-2-Nutzer): der Uhr-Speicher ist bei ~158 KB
        // voll. Liegt eine alte Session noch drauf, verwirft _flushGps die Puffer der NEUEN und der
        // Nutzer verliert die Session bis auf den letzten Chunk. Wer am Steg pausiert, verschafft
        // sich damit selbst Platz. Die LAUFENDE Session bleibt ausgeschlossen (setActiveSession).
        Uploader.setRecording(false);
        try {
            Uploader.watch().reset();
            Uploader.syncAll();
        } catch (e) { }
    }

    // Aufnahme FORTSETZEN: Pausendauer aufaddieren (Stream bleibt lückenlos), Sensoren + FIT-Timer
    // wieder scharf.
    function resume() {
        if (!_recording || !_paused) { return; }
        _pausedMs += System.getTimer() - _pauseStartedMs;
        _paused = false;
        Uploader.setRecording(true);   // Aufnahme laeuft wieder -> kein Sync (s. pause())
        enableGps();
        if (_accelOn) {
            try {
                Sensor.registerSensorDataListener(method(:onAccel), {
                    :period => 1,
                    :accelerometer => { :enabled => true, :sampleRate => _accelHz }
                });
            } catch (e) { _accelOn = false; }
        }
        if (_fitSession != null) { try { _fitSession.start(); } catch (e) {} }
    }

    // Alle Storage-Keys der LAUFENDEN Session löschen + aus dem sessions-Index nehmen.
    hidden function _purgeCurrent() as Void {
        if (_sessionUuid == null) { return; }
        for (var i = 0; i <= _accelChunkIndex; i++) { Storage.deleteValue("ca_" + _sessionUuid + "_" + i); }
        for (var i = 0; i <= _gpsChunkIndex; i++) { Storage.deleteValue("cg_" + _sessionUuid + "_" + i); }
        Storage.deleteValue("state_" + _sessionUuid);
        Storage.deleteValue("meta_" + _sessionUuid);
        Storage.deleteValue("sa_" + _sessionUuid);
        Storage.deleteValue("sg_" + _sessionUuid);
        var arr = Storage.getValue("sessions");
        if (arr instanceof Lang.Array) {
            var j = arr.indexOf(_sessionUuid);
            if (j >= 0) { arr.remove(_sessionUuid); _store("sessions", arr); }
        }
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
            _noteStorageFull();
            return false;
        }
    }

    // Speicher ist voll — das dem Server melden, obwohl wir gerade nicht schreiben koennen.
    //
    // Der Knackpunkt: der ERSTE Schreibzugriff beim Start ist die Boot-Marke selbst
    // (`layout_boot_canary`). Ist der Store voll, scheitert schon die, und eine Diagnose-Notiz
    // liesse sich genauso wenig ablegen — die Meldung waere nie zustande gekommen. Deshalb zwei
    // Wege, in dieser Reihenfolge:
    //   1. PLATZ SCHAFFEN und notieren. `layouts_config` ist ein reiner Cache und kommt beim
    //      naechsten Config-Abruf wieder — den opfern wir fuer die Diagnose. Danach passt die
    //      kleine Zahl fast sicher.
    //   2. SOFORT senden, wenn das Telefon dran ist. Ohne Verbindung bleibt es bei 1, und die
    //      Meldung geht beim naechsten Start mit dem Config-Abruf raus (sie bleibt dank
    //      `storage_full_kb` liegen, bis der Server sie bestaetigt hat).
    hidden function _noteStorageFull() {
        var kb = 0;
        try { kb = Uploader.pendingKb(); } catch (e) { }
        storageFullKb = kb;
        storageFullPending = true;
        // NUR EINMAL pro App-Start melden. Ist der Store wirklich voll, scheitert JEDER Write —
        // beim Aufnehmen im Sekundentakt. Ohne diese Bremse schickt die Uhr pro Fehlschlag einen
        // Config-Abruf; im Test mit fuenf erzwungenen Fehlschlaegen kamen prompt fuenf Meldungen
        // beim Server an. Gezaehlt werden soll das Ereignis „Store war voll", nicht jeder Write.
        if (_sfNoted) { return; }
        _sfNoted = true;
        try { Storage.setValue("storage_full_kb", kb); } catch (e) {
            try { Storage.deleteValue("layouts_config"); } catch (e2) { }
            try { Storage.setValue("storage_full_kb", kb); } catch (e3) { }
        }
        // Sofortversuch nur, wenn eine Verbindung besteht und keine Aufnahme laeuft (Garmin
        // blockt das Netz waehrend der Aktivitaet ohnehin).
        try {
            if (!isRecording() && System.getDeviceSettings().phoneConnected) { fetchConfig(); }
        } catch (e) { }
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
            "accel_t0" => _accelT0,
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
            _gnssWachhund();
            // Reverse-Pairing pollt auch im Idle (alle ~3 s), solange ein Code aktiv ist.
            if (!_claimToken.equals("") && !isPaired()) {
                _pairPollCtr++;
                if (_pairPollCtr >= 3) { _pairPollCtr = 0; _pollPairing(); }
            }
            if (!_recording) { _maybeAutoStart(); return; }
            if (_paused) { return; }   // pausiert: keine Lauf-Erkennung/Alarm, nur Anzeige
            var act = Activity.getActivityInfo();
            if (act == null) { return; }
            var spd = _saneSpeed(act.currentSpeed);
            if (gpsPoor()) { spd = 0.0; }   // s. _gpsQuality: kein Vertrauen -> keine Phantom-Laeufe
            _spdMaxClean = _maxKandidat(spd);
            if (_spdMaxClean > _maxSpdSeen) { _maxSpdSeen = _spdMaxClean; }
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

    // Kurzlabel des Aufzeichnungsmodus für den Start-Screen (zeigt, ob die Config geladen wurde):
    // "25 Hz" (full) | "10 Hz" (lite/sparsam) | "GPS" (nur GPS, ohne Hz-Zahl).
    function recordRateLabel() {
        if (recordMode.equals("gps") || _isLowMem()) { return "GPS"; }
        var hz = recordMode.equals("lite") ? ACCEL_HZ_LITE : ACCEL_HZ;
        return hz.format("%d") + " Hz";
    }

    // Speicherarme Uhr? watchApp-Budget ~96 KB (z. B. Instinct 2): der Roh-Accel-Stream +
    // FIT-Accel-Puffer sprengen beim Session-Start das Budget ("IQ!"-OOM) -> auf solchen
    // Geräten GPS-only erzwingen (Server wertet als gps_only, kein Pump — wie FR55).
    // Einmal geprüft + gecacht. Schwelle knapp über 96 KB (98304).
    hidden function _isLowMem() {
        if (_lowMem == null) {
            _lowMem = false;
            try {
                var st = System.getSystemStats();
                if (st != null && (st has :totalMemory) && st.totalMemory != null
                        && st.totalMemory <= 100000) {
                    _lowMem = true;
                }
            } catch (e) {
                _lowMem = false;
            }
        }
        return _lowMem;
    }

    // Accel-Chunk-Zielgröße. Auf speicherknappen Uhren (≤128 KB, z. B. fenix5/6, fr55/245/645/935)
    // kleiner: senkt den RAM-Peak beim Aufnehmen (_accelBuf) UND beim Upload (base64+JSON+HTTP je
    // Chunk) → keine OOM-Crashes über lange Sessions / große Uploads (Feld-Feedback, fenix 5).
    // Große Uhren behalten 1500 (volle Payload, weniger Round-Trips). Einmal geprüft + gecacht.
    hidden function _accelChunkTarget() {
        if (_accelTgt == null) {
            _accelTgt = ACCEL_CHUNK_SAMPLES;   // Default 1500
            try {
                var st = System.getSystemStats();
                if (st != null && (st has :totalMemory) && st.totalMemory != null
                        && st.totalMemory <= 131072) {
                    _accelTgt = 750;           // ~6 KB base64 statt ~12 KB
                }
            } catch (e) {
            }
        }
        return _accelTgt;
    }

    // Für den Start-Screen: ist Auto-Start aktiv (zum Einblenden des Hinweises)?
    function autoStartOn() { return autoStart; }
    // Auto-Start scharf (Vorlauf-Countdown durch)?
    function autoArmed() { return _hasGpsFix && _idleTicks >= AUTO_START_LEAD; }
    // Verbleibende Vorlauf-Sekunden für die Countdown-Anzeige (0 = scharf).
    function autoLead() { var r = AUTO_START_LEAD - _idleTicks; return (r < 0) ? 0 : r; }
    // Auto-Start auf der Uhr umschalten (Einstellungs-Menü) + persistieren.
    // On-Watch-Toggle nur live (kein _store) -> bleibt bis App-Neustart, dann wieder Web-Preset (Cache).
    function toggleAutoStart() { autoStart = !autoStart; _idleTicks = 0; }
    // Vorlauf-Countdown zurücksetzen — beim (Wieder-)Betreten des Start-Screens aufrufen
    // (z.B. Rückkehr aus dem Menü), damit die 10 s neu laufen.
    function resetAutoLead() { _idleTicks = 0; }

    // GPS-State-Machine für die Live-Lauferkennung (1-Hz-Tick).
    // Gibt true zurück, wenn gerade ein Lauf zu Ende ging.
    hidden function _updateRun(v3, vInst, dist, tMs) {
        if (!_foiling) {
            // Re-Arm-Cooldown: direkt nach einem Lauf-Ende keinen neuen Lauf zulassen
            // (Zurückschwimmen erzeugt sonst über Speed-Spikes einen Phantom-Lauf).
            if (tMs - _runEndedMs < RUN_REARM_COOLDOWN_MS) {
                _enterStreak = 0;
            } else {
                if (vInst < _minSpeedSeitEnde) { _minSpeedSeitEnde = vInst; }
                _enterStreak = (v3 >= RUN_ENTER_MPS) ? _enterStreak + 1 : 0;
                if (_enterStreak >= RUN_ENTER_DWELL) {
                    _foiling = true;
                    _exitStreak = 0;
                    // Gab es seit dem letzten Lauf-Ende KEINEN echten Stopp, ist das derselbe
                    // Lauf — der Server fuehrt ihn zusammen, also zaehlt die Uhr ihn nicht neu.
                    _runIstFortsetzung = (_runCount > 0 && _minSpeedSeitEnde >= NOSTOP_MPS);
                    _minSpeedSeitEnde = 99.0;
                    // Start rückdatieren auf den ersten schnellen Tick.
                    _runStartMs = tMs - RUN_ENTER_DWELL * 1000;
                    _runStartDist = dist;
                    _runMaxSpeed = _spdMaxClean;
                    _runMaxHr = (_currentHr != null && _currentHr > 0) ? _currentHr : 0;
                }
            }
        } else {
            // Lauf-Maximum aus demselben gesaeuberten Wert wie das Session-Maximum (schon in
            // diesem Tick berechnet, s. _spdMaxClean).
            if (_spdMaxClean > _runMaxSpeed) { _runMaxSpeed = _spdMaxClean; }
            if (_currentHr != null && _currentHr > _runMaxHr) { _runMaxHr = _currentHr; }
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
                _lastRunMaxHr = _runMaxHr;
                _runMaxHr = 0;
                _lastRunAvgSpeed = (durMs > 0) ? _lastRunDistM / (durMs / 1000.0) : 0.0;
                if (!_runIstFortsetzung) { _runCount++; }
                _runIstFortsetzung = false;
                _minSpeedSeitEnde = 99.0;
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
    function lastRunMaxHr() { return _lastRunMaxHr; }

    // --- Sensor-Callbacks --- (nur Roh-Datenerfassung für die spätere Auswertung)
    // GPS schon beim App-Start vorwärmen (nicht-blockierend) -> beim Drücken von
    // START ist der Fix meist schon da. Im Idle wird NICHT gepuffert (s. onPosition).
    function startGps() as Void {
        enableGps();
    }

    // Beste vom Gerät unterstützte GNSS-Stufe anfordern.
    //
    // WARUM: ohne die Option `:configuration` nimmt Connect IQ laut SDK `CONSTELLATION_GPS` —
    // also GPS ALLEIN, single-band, obwohl fast jede aktuelle Uhr alle Systeme und teils zwei
    // Bänder kann. Belegt am 13.08. an zwei unabhängigen Nutzermeldungen "mir fehlen Läufe":
    // die Läufe fehlten nicht wegen der Erkennung, sondern weil keine Position da war. Im ganzen
    // Bestand haben 271 von 1090 aufgezeichneten Stunden (25 %) keine Position; Garmin liegt im
    // Median bei 79 % Abdeckung, eine Apple Watch am selben Handgelenk bei 93 %. In einer
    // 64-min-Session fehlten 16 min in 17 Aussetzern (12–216 s) — jeder eingerahmt von
    // Qualität "brauchbar" statt "gut", während der Accel lückenlos weiterlief. Genau das
    // Bild, das zu wenig sichtbaren Satelliten erzeugt: Handgelenk im Wasser, Körper dazwischen.
    //
    // Reihenfolge = beste Abdeckung zuerst. SAT_IQ steht bewusst NICHT in der Liste: das ist
    // Garmins automatisch umschaltender Sparmodus, nicht eine feste Stufe.
    //
    // AKKU (Jan, 16.08.): alle Systeme gleichzeitig kosten spürbar mehr Strom. Am 13.08. galt
    // noch "auf jeden Fall die best mögliche GPS-Erkennung" — das bleibt der Standard, ist aber
    // jetzt JE UHR einstellbar wie die Aufzeichnungsrate, weil die Abwägung vom Gerät und vom
    // Fahrer abhängt (eine Instinct mit 20 h Laufzeit ist etwas anderes als eine fēnix 8).
    // `gnssMode` kommt aus /config:
    //   best = ganze Kette (Voreinstellung, Verhalten seit 1.0.75)
    //   l1   = ohne das zweite Frequenzband L5 — der größte Einzelposten beim Verbrauch
    //   two  = GPS + EIN weiteres System
    //   gps  = GPS allein (SDK-Standard, sparsamste Stufe)
    // Die Kette bleibt in jedem Fall erhalten: lehnt das Gerät die gewünschte Stufe ab, geht es
    // nach unten weiter bis zum überall gültigen Standardaufruf. Eingestellt wird also ein
    // OBERES LIMIT, keine Garantie.
    //
    // Rückfallkette, weil wir bis minApiLevel 2.4.0 bauen: das Options-Wörterbuch gibt es erst
    // ab CIQ 3.2.0, `:configuration` erst ab 3.3.6, und eine nicht unterstützte Kombination
    // wirft InvalidValueException. Am Ende steht immer der alte, überall gültige Aufruf.
    function enableGps() as Void {
        if (Position has :hasConfigurationSupport && !gnssMode.equals("gps")) {
            var alleSysteme = gnssMode.equals("best") || gnssMode.equals("l1");
            var stufen = [];
            if (gnssMode.equals("best") && (Position has :CONFIGURATION_GPS_GLONASS_GALILEO_BEIDOU_L1_L5)) {
                stufen.add(Position.CONFIGURATION_GPS_GLONASS_GALILEO_BEIDOU_L1_L5);
            }
            if (alleSysteme && (Position has :CONFIGURATION_GPS_GLONASS_GALILEO_BEIDOU_L1)) {
                stufen.add(Position.CONFIGURATION_GPS_GLONASS_GALILEO_BEIDOU_L1);
            }
            if (Position has :CONFIGURATION_GPS_GALILEO) { stufen.add(Position.CONFIGURATION_GPS_GALILEO); }
            if (Position has :CONFIGURATION_GPS_GLONASS) { stufen.add(Position.CONFIGURATION_GPS_GLONASS); }
            if (Position has :CONFIGURATION_GPS_BEIDOU) { stufen.add(Position.CONFIGURATION_GPS_BEIDOU); }
            for (var i = 0; i < stufen.size(); i++) {
                try {
                    if (!Position.hasConfigurationSupport(stufen[i])) { continue; }
                    Position.enableLocationEvents(
                        { :acquisitionType => Position.LOCATION_CONTINUOUS, :configuration => stufen[i] },
                        method(:onPosition));
                    _gnssStufe = i + 1;
                    _gnssBei = System.getTimer();
                    return;
                } catch (e) {
                    // Stufe vom Gerät abgelehnt -> nächste probieren.
                }
            }
        } else if ((Position has :CONSTELLATION_GLONASS) && !gnssMode.equals("gps")) {
            // Ältere Uhren ohne hasConfigurationSupport: wenigstens ein zweites System dazu.
            try {
                Position.enableLocationEvents(
                    { :acquisitionType => Position.LOCATION_CONTINUOUS,
                      :constellations => [Position.CONSTELLATION_GPS, Position.CONSTELLATION_GLONASS] },
                    method(:onPosition));
                _gnssStufe = 90;
                _gnssBei = System.getTimer();
                return;
            } catch (e) {
                // Kombination nicht unterstützt -> unten der Standardweg.
            }
        }
        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        _gnssStufe = 0;
    }

    // Welche Stufe tatsächlich aktiv wurde (0 = Geräte-Standard/GPS allein). Nur zur Diagnose
    // im Simulator/Feldtest — die Wirkung messen wir serverseitig an der GPS-Abdeckung.
    function gnssStufe() { return _gnssStufe; }

    // Sicherheitsnetz: nimmt ein Gerät eine Konfiguration ENTGEGEN, liefert danach aber keine
    // Positions-Events (kein Fehler, nur Stille), stünde der Nutzer ohne GPS da — schlimmer als
    // der alte Zustand. Kommt binnen 2 min nach dem Einschalten kein einziges Event, fallen wir
    // auf den überall funktionierenden Standardaufruf zurück. 2 min sind bewusst großzügig: ein
    // echter Cold-Start darf so lange dauern, ohne dass wir ihn für einen Defekt halten.
    hidden function _gnssWachhund() as Void {
        if (_gnssStufe <= 0 || _gnssOk || _gnssBei == 0) { return; }
        var seit = System.getTimer() - _gnssBei;
        if (seit < 0) { _gnssBei = System.getTimer(); return; }   // Timer-Überlauf
        if (seit < 120000) { return; }
        try {
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        } catch (e) {}
        _gnssStufe = 0;
        _gnssBei = 0;
    }

    function onPosition(info as Position.Info) as Void {
        // Abgesichert: ein fehlerhafter Positions-Callback darf die Aufnahme nicht beenden.
        try {
            _gnssOk = true;          // Events kommen an -> Wachhund entwarnen
            if (info == null || info.position == null) { return; }
            // Erst ab brauchbarer Genauigkeit gilt GPS als "da" (Cold-Start abwarten).
            if (info.accuracy != null && info.accuracy >= Position.QUALITY_USABLE) {
                _hasGpsFix = true;
            }
            _gpsQuality = info.accuracy == null ? 0 : info.accuracy;
            // Aktuelle GPS-Geschwindigkeit immer merken (auch im Idle) -> Auto-Start.
            _idleSpeed = info.speed == null ? 0.0 : info.speed;
            // Im Idle nur den Fix vorwärmen/anzeigen, aber nichts in die Session puffern.
            // Pausiert: ebenfalls nichts puffern (Sicherung; LocationEvents sind eh aus).
            if (!_recording || _paused) { return; }
            var deg = info.position.toDegrees();
            var spd = info.speed == null ? 0.0 : info.speed;
            _gpsBuf.add([_elapsedMs(), deg[0], deg[1], spd, _currentHr, info.accuracy]);
            if (_gpsBuf.size() >= GPS_CHUNK_SAMPLES) { _flushGps(false); }
        } catch (e) {
            // Einzelnen Punkt verwerfen, Aufnahme läuft weiter.
        }
    }

    function hasGpsFix() { return _hasGpsFix; }

    // Fuer die Warnung im Start-Screen: auf speicherarmen Uhren (~96 KB, z. B. Instinct 2)
    // reicht schon EINE wartende Session, um die naechste Aufnahme zu beschaedigen.
    function isLowMemWatch() { return _isLowMem(); }

    function onAccel(sensorData as Sensor.SensorData) as Void {
        // Abgesichert: ein fehlerhaftes Accel-Paket darf die Aufnahme nicht beenden.
        try {
            if (_paused) { return; }   // pausiert: keine Rohdaten sammeln (Sicherung; Listener ist eh ab)
            if (sensorData == null || sensorData.accelerometerData == null) { return; }
            var a = sensorData.accelerometerData;
            var n = a.x.size();
            if (_accelCount == 0 && n > 0) { _accelBufT0 = _elapsedMs(); }
            for (var i = 0; i < n; i++) {
                _appendI16(a.x[i]);
                _appendI16(a.y[i]);
                _appendI16(a.z[i]);
                _accelCount++;
            }
            if (_accelCount >= _accelChunkTarget()) { _flushAccel(false); }
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

    // Speed-Sanity: null/negativ/absurd -> 0. Der Simulator liefert bei FIT-Wiedergabe
    // gelegentlich Müllwerte (z. B. 9.6e8 m/s), die die Anzeige sprengen. Kein Wassersport
    // erreicht > 100 m/s (360 km/h) -> alles darüber ist Unsinn und wird verworfen.
    // Median der 15 gepufferten Werte OHNE Sortieren: der Wert, der genauso viele kleinere wie
    // groessere ueber sich hat. 15x15 Vergleiche pro Sekunde sind nichts, sparen aber den
    // Scratch-Array (auf den kleinen Uhren zaehlt jede Allokation).
    hidden function _burstMedian() {
        var n = 0;
        for (var i = 0; i < BURST_WIN; i++) { if (_burstRing[i] != null) { n++; } }
        if (n == 0) { return 0.0; }
        var ziel = n / 2;
        for (var i = 0; i < BURST_WIN; i++) {
            var v = _burstRing[i];
            if (v == null) { continue; }
            var kleiner = 0;
            var gleich = 0;
            for (var j = 0; j < BURST_WIN; j++) {
                var w = _burstRing[j];
                if (w == null) { continue; }
                if (w < v) { kleiner++; } else if (w == v) { gleich++; }
            }
            if (kleiner <= ziel && ziel < kleiner + gleich) { return v; }
        }
        return 0.0;
    }

    // Wert fuer den HOECHSTWERT saeubern (s. Konstanten oben). Die Anzeige des Momentanwerts
    // bleibt unangetastet — dort ist ein Ausreisser eine Sekunde lang zu sehen und wieder weg,
    // im Maximum bliebe er die ganze Session stehen.
    hidden function _maxKandidat(v) {
        _burstRing[_burstPos] = v;
        _burstPos = (_burstPos + 1) % BURST_WIN;
        var med = _burstMedian();
        if (v > med + BURST_MARGIN_MPS && v > BURST_ABS_MIN_MPS) { v = med; }
        if (v > MAX_PLAUSIBLE_MPS) { return 0.0; }
        return v;
    }

    hidden function _saneSpeed(v) {
        if (v == null || v < 0.0 || v > 100.0) { return 0.0; }
        return v;
    }

    // Weitere Live-Felder aus Activity.Info (alle null-sicher + Speed-Sanity).
    function gpsPoor() {
        return _gpsQuality < Position.QUALITY_USABLE;
    }
    function currentSpeed() {
        if (gpsPoor()) { return 0.0; }
        var act = Activity.getActivityInfo();
        return _saneSpeed(act != null ? act.currentSpeed : null);
    }
    function avgSpeed() {
        var act = Activity.getActivityInfo();
        return _saneSpeed(act != null ? act.averageSpeed : null);
    }
    function maxSpeed() {
        // Eigener Hoechstwert ueber die qualitaets-gegateten Ticks — act.maxSpeed wuerde einen
        // einzigen Cold-Start-Glitch (100 km/h am Steg) die ganze Session lang anzeigen.
        return _maxSpdSeen;
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
        if (!force && _accelCount < _accelChunkTarget()) { return; }
        if (!_store("ca_" + _sessionUuid + "_" + _accelChunkIndex, _accelBuf)) {
            // Object-Store voll: diesen Chunk VERWERFEN statt den Puffer unbegrenzt wachsen
            // zu lassen. Sonst hängt onAccel weiter dran -> RAM läuft voll (Crash-Gefahr auf
            // speicherschwachen Uhren wie FR55) UND jeder weitere Flush scheitert dauerhaft.
            // Die Roh-Accel steckt ohnehin im FIT (SensorLogging); klappt Storage später
            // wieder frei (nach Sync), läuft die Aufnahme normal weiter.
            _accelBuf = new [0]b;
            _accelCount = 0;
            storageDropped++;
            return;
        }
        // Startzeit des Chunks festhalten. Deckel 600 Eintraege (~10 h bei 60-s-Chunks):
        // laeuft eine Session laenger, fehlen den spaeten Chunks die Zeiten und der Server
        // faellt fuer sie auf die gemessene Rate zurueck — besser als ein wachsendes Dict,
        // das auf 96-KB-Uhren den Object-Store sprengt.
        if (_accelBufT0 != null && _accelT0.size() < 600) {
            _accelT0[_accelChunkIndex] = _accelBufT0;
        }
        _accelBufT0 = null;
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
            storageDropped++;
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
        // Pausendauer abziehen -> GPS/Accel-Zeitbasis bleibt lückenlos (Server sieht keine Lücke).
        return (Time.now().value() - _startedAt.value()) * 1000 - _pausedMs;
    }

    // Einfache UUID aus Zeit + Zufall (für Idempotenz/Resume ausreichend).
    function _genUuid() {
        var t = Time.now().value();
        var r = Math.rand();
        return t.toString() + "-" + r.toString();
    }
}
