import Foundation
import CoreMotion
import CoreLocation
import HealthKit
import Network

// Nimmt GPS (1 Hz) + rohe Beschleunigung (25 Hz) + HR auf, puffert und lädt
// in Chunks gemäß Raw-Ingest-Contract hoch. HKWorkoutSession hält die Sensoren
// im Hintergrund am Leben.
@MainActor
final class Recorder: NSObject, ObservableObject {
    static let accelHz = 25
    static let accelHzLite = 10   // sparsamer Modus für speicherarme Uhren
    static let accelScale: Double = 2048   // int16-Wert 2048 == 1 g
    // Aufzeichnungsmodus: "full" = Accel 25 Hz | "lite" = 10 Hz | "gps" = nur GPS.
    private var recordMode = "full"
    private var accelHzActual = 25

    @Published var isRecording = false
    @Published var starting = false   // Startphase — Start-Button ausblenden
    @Published var pendingCount = 0   // lokal gespeicherte, noch nicht hochgeladene Sessions
    @Published var elapsed: TimeInterval = 0
    @Published var speedKmh: Double = 0
    @Published var speed3sKmh: Double = 0
    // Schlechtes GPS (hAcc > 20 m oder ungueltiger Speed): Live-Anzeige zeigt "--" statt
    // Phantom-Tempo. Nutzer-Video 05.08.: 100 km/h im Stehen am Steg (Cold-Start/Multipath) —
    // betraf Garmin UND Apple Watch. Rohdaten bleiben ungefiltert (Server filtert selbst,
    // hAcc wird mitgesendet); der Gate wirkt nur auf Anzeige + On-Watch-Lauf-Erkennung.
    @Published var gpsPoor: Bool = false
    // Standort-Freigabe verweigert -> startUpdatingLocation liefert schweigend nichts. Ohne
    // Positionen ist der Mitschnitt wertlos (Wear-Feldbefund 05.08.: vier Sessions ueber
    // Stunden mit Accel, 0 GPS-Punkten). Deshalb sichtbar machen statt stumm aufzeichnen.
    @Published var locDenied = false
    // Nur „ungefaehrer" Standort erlaubt: es kommen grobe Fixes ohne brauchbare
    // Geschwindigkeit — fuer Pumpfoil unbrauchbar, aber kein sicheres Scheitern -> nur warnen.
    @Published var locReduced = false
    @Published var avgSpeedKmh: Double = 0
    @Published var maxSpeedKmh: Double = 0
    @Published var distanceM: Double = 0
    @Published var hr: Int = 0
    @Published var avgHr: Int = 0
    @Published var maxHr: Int = 0
    @Published var status = ""
    @Published var uploading = false   // zeigt aktiven Chunk-Upload in der UI an
    @Published var uploadSent = 0      // bestätigte Chunks der laufenden Session (Fortschritt)
    @Published var uploadTotal = 0     // Gesamt-Chunks der laufenden Session
    @Published var uploadError = ""    // letzte Fehlerursache: "" | "offline" | "server"
    @Published var isFoiling = false   // On-Watch-Erkennung (Hysterese) für Auto-Screen-Wechsel
    // Lauf-Metriken (wie Garmin _updateRun): aktueller Lauf live, sonst letzter.
    @Published var runCount = 0
    @Published var runDurationMs = 0
    @Published var runDistanceM: Double = 0
    @Published var runMaxSpeedKmh: Double = 0
    @Published var lastRunDurationMs = 0
    @Published var lastRunDistanceM: Double = 0
    @Published var lastRunAvgSpeedKmh: Double = 0
    @Published var lastRunMaxSpeedKmh: Double = 0
    // Höchstpuls IM letzten Lauf (Feld 21). Der Session-Höchstpuls ist `maxHr` (Feld 9) — je Lauf
    // führt den niemand, also hier selbst mitschreiben, genau wie das Lauf-Höchsttempo.
    @Published var lastRunMaxHr: Int = 0

    // Foil-Erkennung wie Garmin: rein ab ~10 km/h (4 s anhaltend), raus unter ~9 km/h (3 s).
    private let foilEnterKmh = 10.0
    private let foilExitKmh = 9.0
    private let foilEnterDwellS = 4   // s anhaltend -> foilend (träge: Waten/Steg-Gang = kein Phantom-Lauf)
    private let foilExitDwellS = 3    // s anhaltend langsam -> Lauf-Ende
    private var foilEnterStreak = 0
    private var foilExitStreak = 0
    // Nach Lauf-Ende Sperre, bevor ein neuer Lauf starten darf (wie Garmin RUN_REARM_COOLDOWN).
    private let runReArmCooldownMs = 25000
    private var runEndedMs = -100000
    // Lauf-Tracking (intern)
    private let runEnterDwellMs = 4000
    private let runExitDwellMs = 3000
    private var runStartMs = 0
    private var runStartDist = 0.0
    private var runMaxMps = 0.0
    private var lastRunDurMs = 0
    private var lastRunDistM = 0.0
    private var lastRunAvgMps = 0.0
    private var lastRunMaxMps = 0.0
    private var runMaxHr = 0
    private var lastRunMaxHrV = 0

    private let store = HKHealthStore()
    private let motion = CMMotionManager()
    private let motionQueue = OperationQueue()
    private let location = CLLocationManager()
    /// Standschwelle fuer die LIVE-Distanz. Ohne sie summiert jeder GPS-Fix seinen Abstand zum
    /// Vorgaenger auf — auch wenn die Uhr am Steg liegt und nur der Empfang zittert. Gemessen an
    /// 400 echten Sessions (26.08.): die ungefilterte Punkt-zu-Punkt-Summe liegt bis zu 53 % ueber
    /// der ausgewerteten Distanz. Betroffen war nur die ANZEIGE (und die daraus abgeleitete
    /// Lauf-Distanz) — die Rohdaten gehen unveraendert zum Server, der rechnet selbst.
    /// Entschieden wird auf `loc.speed` (Doppler), nicht auf dem Abstand: der ist unabhaengig vom
    /// Positions-Zittern. `speed < 0` heisst „unbekannt" -> Rueckfall auf eine Mindest-Verschiebung.
    private static let standMps: Double = 0.5        // darunter gilt: wir stehen (1,8 km/h)
    private static let standSchrittM: Double = 1.5   // Rueckfall ohne Doppler

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private var uuid = ""
    private var startedAt = Date()
    private var chunkIndex = 0
    private var draining = false
    private var flushTask: Task<Void, Never>?
    private var tick: Timer?

    // Puffer (durch lock geschützt — Sensor-Callbacks laufen off-main).
    private let lock = NSLock()
    private var accel: [Int16] = []
    private var accelT0ms = 0
    private var gps: [[Double]] = []
    private var lastHR = 0
    // Live-Kennzahlen
    private var prevLoc: CLLocation?
    private var distAccum = 0.0
    private var maxMps = 0.0
    /// Max-Speed saeubern — dieselben zwei Regeln wie der Server (analysis/gps.py):
    /// 1) BURST: mehr als 5 m/s ueber dem 15-s-Median UND absolut ueber 28 km/h -> es gilt der
    ///    Median (mehrsekuendiger Doppler-Burst). 2) DECKEL: ueber 32 km/h ist es kein Pumpfoil
    /// mehr (Glitch/Boot) und zaehlt nicht. An 119 echten Sessions gemessen (26.08.): der
    /// Uhr-Maxwert lag im Mittel 9,4 km/h ueber dem ausgewerteten, schlimmster Fall 164 km/h;
    /// mit den Regeln +3,1 bzw. +17,4. Die Anzeige des Momentanwerts bleibt unangetastet.
    private var burstRing = [Double](repeating: -1, count: 15)
    private var burstPos = 0
    /// Gesaeuberter Wert des LAUFENDEN Fixes: maxKandidat() darf pro Fix nur EINMAL laufen, sonst
    /// stehen zwei Eintraege im 15-s-Ring und das Fenster ist nur halb so lang.
    private var spdMaxClean = 0.0
    private var minSpeedSeitEnde = 99.0     // kleinster Speed seit dem letzten Lauf-Ende
    private var lastRunStartMs = 0          // Start des zuletzt beendeten Laufs (fuer Fortsetzungen)
    private var lastRunStartDist = 0.0
    private let maxPlausibleMps = 32.0 / 3.6   // darueber ist es kein Pumpfoil
    private let minRunMs = 5000             // kuerzer = kein Lauf (Server: MIN_SEGMENT_S)
    private let minRunAvgMps = 2.0          // langsamer = kein Lauf (Server: MOVE_FLOOR_MPS)
    private var runIstFortsetzung = false   // setzt den vorigen Lauf fort -> nicht neu zaehlen

    private func maxKandidat(_ v: Double) -> Double {
        burstRing[burstPos] = v
        burstPos = (burstPos + 1) % burstRing.count
        let vals = burstRing.filter { $0 >= 0 }.sorted()
        let med = vals.isEmpty ? 0 : vals[vals.count / 2]
        var w = v
        if w > med + 5.0, w > 28.0 / 3.6 { w = med }
        return w > 32.0 / 3.6 ? 0 : w
    }
    private var hrSum = 0
    private var hrCount = 0
    private var maxHRv = 0
    private var spWin: [(t: Double, mps: Double)] = []

    // Status der Standort-Freigabe in die UI spiegeln (siehe locDenied/locReduced).
    private func refreshLocAuth() {
        let st = location.authorizationStatus
        locDenied = (st == .denied || st == .restricted)
        locReduced = (st == .authorizedWhenInUse || st == .authorizedAlways)
            && location.accuracyAuthorization == .reducedAccuracy
    }

    func requestAuth() {
        location.delegate = self
        location.requestWhenInUseAuthorization()
        refreshLocAuth()
        let share: Set = [HKObjectType.workoutType()]
        let read: Set = [HKQuantityType(.heartRate)]
        store.requestAuthorization(toShare: share, read: read) { _, _ in }
    }

    private func elapsedMs() -> Int { Int(Date().timeIntervalSince(startedAt) * 1000) }

    // MARK: - Start / Stop

    // Aufnahme startet rein lokal: KEIN Netz nötig (kein Pairing, kein Online).
    // Rohdaten werden persistent in den LocalStore geschrieben; der Upload passiert
    // später per drain(), sobald die Uhr gepairt + online ist.
    func start(foilId: Int? = nil) async {
        guard !isRecording else { return }
        uuid = UUID().uuidString
        startedAt = Date()
        chunkIndex = 0
        accel.removeAll(); gps.removeAll(); spWin.removeAll()
        prevLoc = nil; distAccum = 0; maxMps = 0; hrSum = 0; hrCount = 0; maxHRv = 0; lastHR = 0
        // Aufzeichnungsmodus aus der (gecachten) Config — pro Konto, offline-tauglich.
        recordMode = UserDefaults.standard.string(forKey: "recordMode") ?? "full"
        accelHzActual = recordMode == "lite" ? Self.accelHzLite : Self.accelHz
        var meta: [String: Any] = [
            "session_uuid": uuid,
            "started_at": startedAt.iso8601Z,
            "sport": "pumpfoil",
            "gps_hz": 1,
            "accel_hz": accelHzActual,
            "accel_scale": Int(Self.accelScale),
        ]
        if let foilId { meta["foil_id"] = foilId }   // für diese Session gewähltes Foil (Server-Override)
        // Version, mit der aufgenommen wurde (wandert mit der Session, auch wenn der Upload
        // erst nach einem App-Update passiert). Leerer Wert würde die Server-Validierung
        // verletzen -> nur setzen, wenn das Bundle sie liefert.
        if !Api.appVersion.isEmpty { meta["app_version"] = Api.appVersion }
        LocalStore.writeMeta(uuid, meta)
        startWorkout()
        startSensors()
        isRecording = true
        isFoiling = false; foilEnterStreak = 0; foilExitStreak = 0; runEndedMs = -100000
        runCount = 0; runStartMs = 0; runStartDist = 0; runMaxMps = 0; runMaxHr = 0; lastRunMaxHrV = 0
        lastRunDurMs = 0; lastRunDistM = 0; lastRunAvgMps = 0; lastRunMaxMps = 0
        lastRunStartMs = 0; lastRunStartDist = 0; minSpeedSeitEnde = 99.0; runIstFortsetzung = false
        runDurationMs = 0; runDistanceM = 0; runMaxSpeedKmh = 0
        lastRunDurationMs = 0; lastRunDistanceM = 0; lastRunAvgSpeedKmh = 0; lastRunMaxSpeedKmh = 0; lastRunMaxHr = 0
        status = WLoc.t("rec.recording", UserDefaults.standard.string(forKey: "appLang") ?? "de")
        tick = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.elapsed = Date().timeIntervalSince(self.startedAt)
                self.updateFoiling()
            }
        }
        flushTask = Task { await self.flushLoop() }
    }

    // Foil-Erkennung (Hysterese auf der 3-s-Geschwindigkeit) für den Auto-Screen-Wechsel.
    private func updateFoiling() {
        let tMs = elapsedMs()
        let dist = distAccum
        let spMps = speedKmh / 3.6
        if !isFoiling {
            // Minimum IMMER mitfuehren — auch waehrend des Cooldowns; genau dort zeigt sich ein
            // echter Stopp (absinken/stehen).
            if spMps < minSpeedSeitEnde { minSpeedSeitEnde = spMps }
            // Re-Arm-Cooldown gegen Phantom-Laeufe (Zurueckschwimmen/Waten), aber NUR nach einem
            // echten Stopp — ohne Stopp ist es die Fortsetzung desselben Laufs.
            let gesperrt = tMs - runEndedMs < runReArmCooldownMs && minSpeedSeitEnde < 1.5
            if gesperrt {
                foilEnterStreak = 0
            } else {
                foilEnterStreak = speed3sKmh >= foilEnterKmh ? foilEnterStreak + 1 : 0
                if foilEnterStreak >= foilEnterDwellS {
                    isFoiling = true; foilExitStreak = 0
                    // Kein echter Stopp seit dem letzten Lauf-Ende -> derselbe Lauf. Der Server
                    // fuehrt beide zusammen (_merge_no_stop, ohne Zeitfenster).
                    runIstFortsetzung = runCount > 0 && minSpeedSeitEnde >= 1.5
                    // Sprung im Kilometerzaehler (GPS-Glitch) ist keine Fortsetzung — sonst erbt
                    // der Lauf die ganze Luecke. Grenze wie beim Max-Speed: 32 km/h.
                    if runIstFortsetzung {
                        let luecke = Double(tMs - lastRunStartMs)
                        let strecke = dist - lastRunStartDist
                        if luecke <= 0 || strecke < 0 || strecke / (luecke / 1000.0) > maxPlausibleMps {
                            runIstFortsetzung = false
                        }
                    }
                    minSpeedSeitEnde = 99.0
                    if runIstFortsetzung {
                        // Denselben Lauf weiterfuehren -> Dauer/Distanz zeigen den GANZEN Lauf.
                        runStartMs = lastRunStartMs; runStartDist = lastRunStartDist
                        if lastRunMaxMps > runMaxMps { runMaxMps = lastRunMaxMps }
                        if lastRunMaxHrV > runMaxHr { runMaxHr = lastRunMaxHrV }
                    } else {
                        // Lauf-Start auf den Dwell-Beginn zurückdatieren (wie Garmin).
                        runStartMs = tMs - runEnterDwellMs; runStartDist = dist; runMaxMps = spdMaxClean; runMaxHr = hr > 0 ? hr : 0
                    }
                }
            }
        } else {
            if spdMaxClean > runMaxMps { runMaxMps = spdMaxClean }
            if hr > runMaxHr { runMaxHr = hr }
            foilExitStreak = speed3sKmh < foilExitKmh ? foilExitStreak + 1 : 0
            if foilExitStreak >= foilExitDwellS {
                isFoiling = false; foilEnterStreak = 0
                let durMs = max(0, tMs - runExitDwellMs - runStartMs)
                let distM = max(0, dist - runStartDist)
                minSpeedSeitEnde = 99.0
                runEndedMs = tMs   // Re-Arm-Cooldown starten
                // Zu kurz/zu langsam = kein Lauf (dieselbe Regel wie am Server).
                let schnellGenug = durMs > 0 && distM / (Double(durMs) / 1000.0) >= minRunAvgMps
                let verwerfen = !runIstFortsetzung && (durMs < minRunMs || !schnellGenug)
                if verwerfen {
                    runMaxHr = 0
                } else {
                    lastRunStartMs = runStartMs
                    lastRunStartDist = runStartDist
                    lastRunDurMs = durMs
                    lastRunDistM = distM
                    lastRunAvgMps = durMs > 0 ? lastRunDistM / (Double(durMs) / 1000.0) : 0
                    lastRunMaxMps = runMaxMps
                    lastRunMaxHrV = runMaxHr
                    runMaxHr = 0
                    if !runIstFortsetzung { runCount += 1 }
                }
                runIstFortsetzung = false
            }
        }
        // Publizierte Lauf-Felder: aktueller Lauf live, sonst letzter.
        runDurationMs = isFoiling ? max(0, tMs - runStartMs) : lastRunDurMs
        runDistanceM = isFoiling ? max(0, dist - runStartDist) : lastRunDistM
        runMaxSpeedKmh = (isFoiling ? runMaxMps : lastRunMaxMps) * 3.6
        lastRunDurationMs = lastRunDurMs
        lastRunDistanceM = lastRunDistM
        lastRunAvgSpeedKmh = lastRunAvgMps * 3.6
        lastRunMaxSpeedKmh = lastRunMaxMps * 3.6
        lastRunMaxHr = lastRunMaxHrV
    }

    func stop() async {
        guard isRecording else { return }
        isRecording = false
        isFoiling = false
        tick?.invalidate(); tick = nil
        flushTask?.cancel()
        motion.stopAccelerometerUpdates()
        location.stopUpdatingLocation()
        status = WLoc.t("rec.saving", UserDefaults.standard.string(forKey: "appLang") ?? "de")
        await flushAll()
        LocalStore.writeComplete(uuid, ["ended_at": Date().iso8601Z, "total_chunks": chunkIndex])
        status = WLoc.t("rec.saved", UserDefaults.standard.string(forKey: "appLang") ?? "de")
        pendingCount = LocalStore.pendingCount()
        endWorkout()
        await drain()   // sofort hochladen, falls gepairt + online
    }

    /// Aufnahme VERWERFEN: beenden + lokal löschen — KEIN complete, KEIN Upload. Ganzer Session-
    /// Ordner weg (kein meta.json) -> wird auch nicht als „interrupted" später hochgeladen.
    func discard() {
        guard isRecording else { return }
        isRecording = false
        isFoiling = false
        tick?.invalidate(); tick = nil
        flushTask?.cancel()
        motion.stopAccelerometerUpdates()
        location.stopUpdatingLocation()
        LocalStore.delete(uuid)
        status = ""
        pendingCount = LocalStore.pendingCount()
        endWorkout()
    }

    func refreshPending() { pendingCount = LocalStore.pendingCount() }

    /// Lädt fertig aufgezeichnete Sessions hoch, sobald gepairt + online.
    func drain() async {
        guard !draining, Api.deviceToken != nil else { return }
        draining = true
        defer {
            draining = false; uploading = false
            pendingCount = LocalStore.pendingCount()
            uploadSent = 0; uploadTotal = 0
            // Erfolgreich fertig -> stehengebliebenes „lade hoch…"-Label aufräumen.
            if uploadError.isEmpty && pendingCount == 0 { status = "" }
        }
        // Gestrandete Aufnahmen (Crash/Kill vor Stop) finalisieren -> kein Datenverlust.
        // Läuft auch offline (rein lokal); danach zählen sie als „fertig" zum Upload.
        recoverInterrupted()
        pendingCount = LocalStore.pendingCount()
        if pendingCount == 0 { uploadError = ""; return }
        // WICHTIG (watchOS): NWPathMonitor meldet auf der Apple Watch häufig fälschlich
        // .unsatisfied, obwohl die Uhr übers gekoppelte iPhone sehr wohl online ist (der
        // Companion-Proxy-Pfad zählt nicht als „satisfied"). Früher gate hier auf
        // Reachability.isOnline -> Upload lief NIE, UI hing auf „wartet auf Verbindung"
        // (Nutzer-Report: gepairt, Token da, „Jetzt hochladen" tut nichts). Deshalb NICHT
        // vorab gaten, sondern den Upload versuchen; echtes Offline ergibt sich aus dem
        // tatsächlichen Netzfehler (isOfflineError) und wird dann sauber angezeigt.
        uploadError = ""   // optimistisch; bei Fehler unten gesetzt
        for dir in LocalStore.completedSessions() {
            do { try await uploadSession(dir) }
            catch let e as Api.ApiError where e.status == 401 {
                // Token ungültig/abgelaufen -> neu pairen. Weitere Versuche sind sinnlos,
                // daher abbrechen statt mit dem schlechten Token weiterzuhämmern.
                uploadError = "auth"
                break
            } catch {
                // Chunks/Session bleiben lokal -> später erneut. Ursache fürs UI festhalten:
                // echter Netzfehler -> „offline", sonst „server".
                uploadError = Self.isOfflineError(error) ? "offline" : "server"
            }
        }
    }

    // Abgebrochene Aufnahmen (kein complete.json) finalisieren: synthetisches complete.json
    // mit der Anzahl persistierter Chunks -> Session wird normal hochgeladen statt zu stranden.
    // Die gerade laufende Aufnahme bleibt ausgenommen.
    private func recoverInterrupted() {
        let active = isRecording ? uuid : nil
        for dir in LocalStore.interruptedSessions(activeUuid: active) {
            let n = LocalStore.chunkFiles(dir).count
            if n == 0 { continue }
            LocalStore.writeComplete(dir.lastPathComponent, ["ended_at": Date().iso8601Z, "total_chunks": n])
        }
    }

    // Echter Offline-Fehler (kein Internet / Host nicht erreichbar / Timeout) -> UI „offline".
    // Alles andere (HTTP-Fehler, Parsing …) -> „server". Ersetzt das unzuverlässige
    // Vorab-Gaten per NWPathMonitor (s. drain()).
    private static func isOfflineError(_ error: Error) -> Bool {
        guard let u = error as? URLError else { return false }
        switch u.code {
        case .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost,
             .networkConnectionLost, .timedOut, .dataNotAllowed, .internationalRoamingOff,
             .dnsLookupFailed, .resourceUnavailable:
            return true
        default:
            return false
        }
    }

    // Langlebiger Netz-Monitor (vom Framework aktuell gehalten) -> currentPath synchron lesbar.
    private static let netMonitor: NWPathMonitor = {
        let m = NWPathMonitor(); m.start(queue: DispatchQueue(label: "pf.net")); return m
    }()
    // Wie viele Chunks parallel? Über eigenes Netz der Uhr (WLAN/LTE) aggressiv (6),
    // über die Bluetooth-Proxy-Verbindung zum iPhone sanft (2).
    private func uploadPool() -> Int {
        let p = Self.netMonitor.currentPath
        let fast = p.usesInterfaceType(.wifi) || p.usesInterfaceType(.cellular) || p.usesInterfaceType(.wiredEthernet)
        return fast ? 6 : 2
    }

    private func uploadSession(_ dir: URL) async throws {
        guard let meta = LocalStore.readJSON(dir.appendingPathComponent("meta.json")),
              let sid = meta["session_uuid"] as? String else { return }
        // GPS-first: GPS-Chunks zuerst in den Pool (kind aus dem Dateinamen, billig). Bei
        // abgebrochenem Upload ist so die GPS-Spur zuerst vollständig -> Session als gps_only
        // analysierbar statt hängend. Parität zu Server/Web. Reihenfolge je Gruppe bleibt erhalten.
        let _cf = LocalStore.chunkFiles(dir)
        let chunkFiles = _cf.filter { LocalStore.chunkKind($0) == "gps" } + _cf.filter { LocalStore.chunkKind($0) != "gps" }
        // Chunks werden erst nach bestätigtem /complete gelöscht -> kein Datenverlust;
        // bereits empfangene Chunks (received_chunks) werden übersprungen (Resume).
        // expected_chunks: der Server macht daraus `upload_total` (sessions.py:199) und alle
        // Oberflaechen zeigen dann „x von y" statt eines unbestimmten Balkens. Hier ist die Zahl
        // exakt bekannt — die Aufnahme ist fertig, die Chunks liegen im Verzeichnis. Waehrend
        // einer LAUFENDEN Aufnahme darf sie NICHT gesendet werden (zu klein -> Fortschritt
        // laeuft ueber sein eigenes Ziel hinaus).
        var startMeta = meta
        startMeta["expected_chunks"] = chunkFiles.count
        let res = try await Api.startSession(startMeta)
        let received = Set(res.received_chunks)
        uploading = true
        status = WLoc.t("rec.uploading", UserDefaults.standard.string(forKey: "appLang") ?? "de")
        uploadError = ""
        uploadTotal = chunkFiles.count
        uploadSent = min(received.count, chunkFiles.count)
        // Chunks PARALLEL hochladen (Server nimmt sie in beliebiger Reihenfolge, je Index eigene
        // Datei/Zeile -> kollisionsfrei). Pool adaptiv: über eigenes WLAN/LTE der Uhr aggressiv,
        // über den Bluetooth-Proxy zum iPhone sanft. Jeder Task liest seine Datei selbst (nur
        // Sendable-Werte werden gefangen: URL, Set, String).
        let pool = uploadPool()
        var it = chunkFiles.makeIterator()
        try await withThrowingTaskGroup(of: Void.self) { group in
            func addNext() -> Bool {
                guard let cf = it.next() else { return false }
                group.addTask {
                    guard let chunk = LocalStore.readJSON(cf) else { return }
                    let idx = chunk["index"] as? Int ?? -1
                    if received.contains(idx) { return }
                    try await Api.uploadChunk(sid, chunk)
                }
                return true
            }
            var running = 0
            for _ in 0..<pool { if addNext() { running += 1 } }
            while running > 0 {
                try await group.next()
                running -= 1
                uploadSent = min(uploadSent + 1, chunkFiles.count)
                if addNext() { running += 1 }
            }
        }
        let comp = LocalStore.readJSON(dir.appendingPathComponent("complete.json"))
        let endedAt = comp?["ended_at"] as? String ?? Date().iso8601Z
        let total = comp?["total_chunks"] as? Int ?? chunkIndex
        try await Api.complete(sid, endedAt: endedAt, totalChunks: total)
        LocalStore.delete(sid)   // erst NACH /complete -> serverseitig sicher vorhanden
    }

    // MARK: - Sensors

    private func startSensors() {
        // Hoechste Stufe, die CoreLocation anbietet — eine Stufe ueber kCLLocationAccuracyBest:
        // BestForNavigation zieht zusaetzliche Sensordaten hinzu und haelt den Fix zaeher.
        // Grund (13.08.): "mir fehlen Laeufe" ist fast immer fehlende Position, nicht die
        // Erkennung — im Bestand haben 25 % der aufgezeichneten Zeit keine. Kostet Akku, das ist
        // bewusst in Kauf genommen (Jan: beste GPS-Erkennung auf jeder Uhr, die sie bietet).
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.distanceFilter = kCLDistanceFilterNone
        // Sagt CoreLocation, wie es filtern soll: Wassersport ist Fitness, nicht Autofahrt
        // (ohne das nimmt es .other an und glaettet Bewegungsmuster falsch).
        location.activityType = .fitness
        // allowsBackgroundLocationUpdates NICHT setzen: ohne "location"-Background-Mode
        // führt das zum Crash (CLClientIsBackgroundable-Assertion). Im Hintergrund hält
        // die HKWorkoutSession die App + Standortupdates am Leben.
        location.startUpdatingLocation()

        // Modus "gps": kein Roh-Accel (minimaler Speicher); sonst Rate je Modus (full=25, lite=10).
        if recordMode != "gps", motion.isAccelerometerAvailable {
            motion.accelerometerUpdateInterval = 1.0 / Double(accelHzActual)
            motion.startAccelerometerUpdates(to: motionQueue) { [weak self] data, _ in
                guard let self, let a = data?.acceleration else { return }
                self.lock.withLock {
                    if self.accel.isEmpty { self.accelT0ms = self.elapsedMs() }
                    self.accel.append(Self.clampInt16(a.x * Self.accelScale))
                    self.accel.append(Self.clampInt16(a.y * Self.accelScale))
                    self.accel.append(Self.clampInt16(a.z * Self.accelScale))
                }
            }
        }
    }

    private static func clampInt16(_ v: Double) -> Int16 {
        Int16(max(-32768, min(32767, v.rounded())))
    }

    private func startWorkout() {
        let cfg = HKWorkoutConfiguration()
        cfg.activityType = .other
        cfg.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: cfg)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: cfg)
            s.delegate = self
            b.delegate = self
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            session = s; builder = b
        } catch {
            status = WLoc.t("rec.workoutFail", UserDefaults.standard.string(forKey: "appLang") ?? "de") + error.localizedDescription
        }
    }

    private func endWorkout() {
        session?.end()
        // Async-API statt Completion-Handler -> keine Sendable-/Main-Actor-Warnungen.
        Task { @MainActor [weak self] in
            guard let b = self?.builder else { return }
            _ = try? await b.endCollection(at: Date())
            _ = try? await b.finishWorkout()
        }
    }

    // MARK: - Flush / Upload

    private func flushLoop() async {
        while isRecording && !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 10_000_000_000) // 10 s
            await flushAll()
        }
    }

    // Chunks werden persistent lokal abgelegt (kein Netz). Upload via drain().
    private func flushAll() async {
        flushAccel()
        flushGps()
    }

    private func flushAccel() {
        let (buf, t0): ([Int16], Int) = lock.withLock {
            let b = accel, t = accelT0ms
            accel.removeAll()
            return (b, t)
        }
        guard !buf.isEmpty else { return }
        let data = buf.withUnsafeBufferPointer { Data(buffer: $0) } // little-endian int16
        LocalStore.writeChunk(uuid, chunkIndex, [
            "index": chunkIndex, "kind": "accel", "encoding": "int16-b64",
            "t0_ms": t0, "count": buf.count / 3, "data": data.base64EncodedString(),
        ])
        chunkIndex += 1
    }

    private func flushGps() {
        let buf: [[Double]] = lock.withLock {
            let b = gps
            gps.removeAll()
            return b
        }
        guard !buf.isEmpty else { return }
        LocalStore.writeChunk(uuid, chunkIndex, [
            "index": chunkIndex, "kind": "gps", "encoding": "json",
            "t0_ms": Int(buf.first?[0] ?? 0), "count": buf.count, "data": buf,
        ])
        chunkIndex += 1
    }
}

// MARK: - Location

extension Recorder: CLLocationManagerDelegate {
    // Freigabe nachtraeglich erteilt oder entzogen (Einstellungen) -> Hinweis mitziehen.
    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in self.refreshLocAuth() }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        Task { @MainActor in
            let t = self.elapsedMs()
            let spRaw = max(0, loc.speed)
            self.lock.withLock {
                self.gps.append([Double(t), loc.coordinate.latitude, loc.coordinate.longitude,
                                 spRaw, Double(self.lastHR), loc.horizontalAccuracy])
            }
            // Qualitaets-Gate fuer alles LIVE (Anzeige, Max, Lauf-Erkennung): unbrauchbare
            // Position (hAcc > 20 m) oder ungueltiger Speed (loc.speed < 0) -> 0 + "--".
            let poor = loc.horizontalAccuracy > 20 || loc.speed < 0
            self.gpsPoor = poor
            let sp = poor ? 0 : spRaw
            // Live-Kennzahlen
            // Distanz nur, wenn wir uns wirklich bewegen (s. standMps).
            if let p = self.prevLoc {
                let schritt = max(0, loc.distance(from: p))
                let bewegt = loc.speed >= 0 ? loc.speed > Self.standMps : schritt >= Self.standSchrittM
                if !poor && bewegt { self.distAccum += schritt }
            }
            self.prevLoc = loc
            self.spdMaxClean = self.maxKandidat(sp)
            if self.spdMaxClean > self.maxMps { self.maxMps = self.spdMaxClean }
            self.spWin.append((Double(t), sp))
            while let f = self.spWin.first, Double(t) - f.t > 3000 { self.spWin.removeFirst() }
            // MEDIAN statt Mittel — wie Garmin (speed3sMed), Zepp und der Server
            // (SMOOTH_WINDOW_S + _running_median): ein einzelner Ausreisser haelt den Mittelwert
            // drei Sekunden oben und kann einen Phantom-Lauf starten.
            let sortiert = self.spWin.map { $0.mps }.sorted()
            let sp3 = sortiert.isEmpty ? sp : sortiert[sortiert.count / 2]
            let sec = max(1.0, Double(t) / 1000.0)
            self.speedKmh = sp * 3.6
            self.speed3sKmh = sp3 * 3.6
            self.maxSpeedKmh = self.maxMps * 3.6
            self.distanceM = self.distAccum
            self.avgSpeedKmh = self.distAccum / sec * 3.6
        }
    }
}

// MARK: - Workout / HR

extension Recorder: HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutSession(_ ws: HKWorkoutSession, didChangeTo to: HKWorkoutSessionState,
                                    from: HKWorkoutSessionState, date: Date) {}
    nonisolated func workoutSession(_ ws: HKWorkoutSession, didFailWithError error: Error) {}
    nonisolated func workoutBuilderDidCollectEvent(_ b: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ b: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        guard let qt = HKQuantityType.quantityType(forIdentifier: .heartRate),
              types.contains(qt),
              let stats = b.statistics(for: qt),
              let q = stats.mostRecentQuantity() else { return }
        let bpm = Int(q.doubleValue(for: HKUnit.count().unitDivided(by: .minute())))
        Task { @MainActor in
            self.lastHR = bpm
            self.hr = bpm
            if bpm > 0 {
                self.hrSum += bpm; self.hrCount += 1
                if bpm > self.maxHRv { self.maxHRv = bpm }
                self.avgHr = self.hrSum / self.hrCount
                self.maxHr = self.maxHRv
            }
        }
    }
}
