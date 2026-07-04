import Foundation
import CoreMotion
import CoreLocation
import HealthKit

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

    private let store = HKHealthStore()
    private let motion = CMMotionManager()
    private let motionQueue = OperationQueue()
    private let location = CLLocationManager()
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
    private var hrSum = 0
    private var hrCount = 0
    private var maxHRv = 0
    private var spWin: [(t: Double, mps: Double)] = []

    func requestAuth() {
        location.delegate = self
        location.requestWhenInUseAuthorization()
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
        LocalStore.writeMeta(uuid, meta)
        startWorkout()
        startSensors()
        isRecording = true
        isFoiling = false; foilEnterStreak = 0; foilExitStreak = 0; runEndedMs = -100000
        runCount = 0; runStartMs = 0; runStartDist = 0; runMaxMps = 0
        lastRunDurMs = 0; lastRunDistM = 0; lastRunAvgMps = 0; lastRunMaxMps = 0
        runDurationMs = 0; runDistanceM = 0; runMaxSpeedKmh = 0
        lastRunDurationMs = 0; lastRunDistanceM = 0; lastRunAvgSpeedKmh = 0; lastRunMaxSpeedKmh = 0
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
            // Re-Arm-Cooldown: direkt nach Lauf-Ende keinen neuen Lauf zulassen
            // (Zurückschwimmen/Waten/zum-Steg-Laufen erzeugt sonst Phantom-Läufe).
            if tMs - runEndedMs < runReArmCooldownMs {
                foilEnterStreak = 0
            } else {
                foilEnterStreak = speed3sKmh >= foilEnterKmh ? foilEnterStreak + 1 : 0
                if foilEnterStreak >= foilEnterDwellS {
                    isFoiling = true; foilExitStreak = 0
                    // Lauf-Start auf den Dwell-Beginn zurückdatieren (wie Garmin).
                    runStartMs = tMs - runEnterDwellMs; runStartDist = dist; runMaxMps = spMps
                }
            }
        } else {
            if spMps > runMaxMps { runMaxMps = spMps }
            foilExitStreak = speed3sKmh < foilExitKmh ? foilExitStreak + 1 : 0
            if foilExitStreak >= foilExitDwellS {
                isFoiling = false; foilEnterStreak = 0
                let durMs = max(0, tMs - runExitDwellMs - runStartMs)
                lastRunDurMs = durMs
                lastRunDistM = max(0, dist - runStartDist)
                lastRunAvgMps = durMs > 0 ? lastRunDistM / (Double(durMs) / 1000.0) : 0
                lastRunMaxMps = runMaxMps
                runCount += 1
                runEndedMs = tMs   // Re-Arm-Cooldown starten
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
    }

    func stop() async {
        guard isRecording else { return }
        isRecording = false
        isFoiling = false
        tick?.invalidate(); tick = nil
        flushTask?.cancel()
        motion.stopAccelerometerUpdates()
        location.stopUpdatingLocation()
        status = "speichere…"
        await flushAll()
        LocalStore.writeComplete(uuid, ["ended_at": Date().iso8601Z, "total_chunks": chunkIndex])
        status = "gespeichert"
        pendingCount = LocalStore.pendingCount()
        endWorkout()
        await drain()   // sofort hochladen, falls gepairt + online
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
        // Offline -> nicht still scheitern, sondern den Zustand zeigen (UI: „wartet auf Verbindung").
        guard Reachability.shared.isOnline else {
            uploadError = pendingCount > 0 ? "offline" : ""
            return
        }
        uploadError = ""   // online -> optimistisch; bei Fehler unten gesetzt
        for dir in LocalStore.completedSessions() {
            do { try await uploadSession(dir) }
            catch let e as Api.ApiError where e.status == 401 {
                // Token ungültig/abgelaufen -> neu pairen. Weitere Versuche sind sinnlos,
                // daher abbrechen statt mit dem schlechten Token weiterzuhämmern.
                uploadError = "auth"
                break
            } catch {
                // Chunks/Session bleiben lokal -> später erneut. Ursache fürs UI festhalten.
                uploadError = Reachability.shared.isOnline ? "server" : "offline"
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

    private func uploadSession(_ dir: URL) async throws {
        guard let meta = LocalStore.readJSON(dir.appendingPathComponent("meta.json")),
              let sid = meta["session_uuid"] as? String else { return }
        let chunkFiles = LocalStore.chunkFiles(dir)
        // Chunks werden erst nach bestätigtem /complete gelöscht -> kein Datenverlust;
        // bereits empfangene Chunks (received_chunks) werden übersprungen (Resume).
        let res = try await Api.startSession(meta)
        let received = Set(res.received_chunks)
        uploading = true
        status = "lade hoch…"
        uploadError = ""
        uploadTotal = chunkFiles.count
        uploadSent = min(received.count, chunkFiles.count)
        for cf in chunkFiles {
            guard let chunk = LocalStore.readJSON(cf) else { continue }
            let idx = chunk["index"] as? Int ?? -1
            if received.contains(idx) { continue }
            try await Api.uploadChunk(sid, chunk)
            uploadSent = min(uploadSent + 1, chunkFiles.count)
        }
        let comp = LocalStore.readJSON(dir.appendingPathComponent("complete.json"))
        let endedAt = comp?["ended_at"] as? String ?? Date().iso8601Z
        let total = comp?["total_chunks"] as? Int ?? chunkIndex
        try await Api.complete(sid, endedAt: endedAt, totalChunks: total)
        LocalStore.delete(sid)   // erst NACH /complete -> serverseitig sicher vorhanden
    }

    // MARK: - Sensors

    private func startSensors() {
        location.desiredAccuracy = kCLLocationAccuracyBest
        location.distanceFilter = kCLDistanceFilterNone
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
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        Task { @MainActor in
            let t = self.elapsedMs()
            let sp = max(0, loc.speed)
            self.lock.withLock {
                self.gps.append([Double(t), loc.coordinate.latitude, loc.coordinate.longitude,
                                 sp, Double(self.lastHR), loc.horizontalAccuracy])
            }
            // Live-Kennzahlen
            if let p = self.prevLoc { self.distAccum += max(0, loc.distance(from: p)) }
            self.prevLoc = loc
            if sp > self.maxMps { self.maxMps = sp }
            self.spWin.append((Double(t), sp))
            while let f = self.spWin.first, Double(t) - f.t > 3000 { self.spWin.removeFirst() }
            let sp3 = self.spWin.isEmpty ? sp : self.spWin.map { $0.mps }.reduce(0, +) / Double(self.spWin.count)
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
