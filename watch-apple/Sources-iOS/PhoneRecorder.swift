import Foundation
import CoreLocation
import CoreMotion

// „Record on Phone" (Beta): das iPhone selbst als Recorder. GPS (CoreLocation, 1 Hz) + Accel
// (CoreMotion, ~50 Hz, bereits in g) laufen im Hintergrund (Background-Location hält die App am
// Leben, Screen aus / in der Tasche). Rohdaten werden lokal gepuffert (crash-/offline-sicher) und
// über den Raw-Ingest-Contract mit einem geminteten „Phone"-Device-Token hochgeladen. Puffer-/Lauf-/
// Upload-Logik spiegelt den Android-Recorder (Recorder.kt).
@MainActor
final class PhoneRecorder: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = PhoneRecorder()

    // --- veröffentlichter Zustand (UI) ---
    @Published var recording = false
    @Published var elapsedSec = 0
    @Published var speedKmh = 0.0
    @Published var speed3sKmh = 0.0
    @Published var avgSpeedKmh = 0.0
    @Published var maxSpeedKmh = 0.0
    @Published var distanceM = 0.0
    @Published var gpsFix = false
    @Published var isFoiling = false
    @Published var track: [[Double]] = []   // [lat, lon] fürs Live-Track-Canvas
    @Published var runCount = 0
    @Published var runDurationMs = 0
    @Published var lastRunDurationMs = 0
    @Published var lastRunDistanceM = 0.0
    @Published var status = ""
    @Published var uploading = false
    @Published var uploadError = ""
    @Published var pendingCount = 0
    // Start-Screen (idle): Live-GPS-Status + Autostart (wie die Uhr).
    @Published var gpsReady = false
    @Published var autoStart = (UserDefaults.standard.object(forKey: "phone_autostart") as? Bool ?? true) {
        didSet { UserDefaults.standard.set(autoStart, forKey: "phone_autostart"); idleLead = 0; idleStreak = 0 }
    }

    var sessionFoilId: Int?
    private var idleMonitoring = false
    private var idleLead = 0, idleStreak = 0   // Autostart: Vorlauf-Ticks + Speed-Streak

    private let ACCEL_HZ = 50.0
    private let ACCEL_SCALE = 2048.0

    private let loc = CLLocationManager()
    private let motion = CMMotionManager()
    private let motionQ = OperationQueue()
    private let lock = NSLock()

    // Puffer (unter lock)
    private var accelBuf: [Int16] = []
    private var accelT0Ms = 0
    private var gpsBuf: [[Double]] = []

    // Live-Kennzahlen
    private var uuid = ""
    private var startMs: Double = 0
    private var chunkIndex = 0
    /// Standschwelle fuer die LIVE-Distanz. Ohne sie summiert jeder GPS-Fix seinen Abstand zum
    /// Vorgaenger auf — auch wenn die Uhr am Steg liegt und nur der Empfang zittert. Gemessen an
    /// 400 echten Sessions (26.08.): die ungefilterte Punkt-zu-Punkt-Summe liegt bis zu 53 % ueber
    /// der ausgewerteten Distanz. Betroffen war nur die ANZEIGE (und die daraus abgeleitete
    /// Lauf-Distanz) — die Rohdaten gehen unveraendert zum Server, der rechnet selbst.
    /// Entschieden wird auf `loc.speed` (Doppler), nicht auf dem Abstand: der ist unabhaengig vom
    /// Positions-Zittern. `speed < 0` heisst „unbekannt" -> Rueckfall auf eine Mindest-Verschiebung.
    private static let standMps: Double = 0.5        // darunter gilt: wir stehen (1,8 km/h)
    private static let standSchrittM: Double = 1.5   // Rueckfall ohne Doppler

    private var prevLat = Double.nan
    private var prevLon = Double.nan
    private var distM = 0.0
    private var maxMps = 0.0
    private var spWin: [[Double]] = []   // [tMs, mps] für 3-s-Fenster
    private var flushTimer: Timer?

    // Lauf-Erkennung (wie Garmin/Wear)
    private let RUN_ENTER_DWELL = 4, RUN_EXIT_DWELL = 3
    private let RUN_REARM_COOLDOWN_MS = 25000.0
    private var runEndedMs = -100000.0
    private var foilEnter = 0, foilExit = 0, foiling = false
    private var runStartMs = 0.0, runStartDist = 0.0, runMaxMps = 0.0
    private var runCnt = 0
    /// Max-Speed saeubern — dieselben zwei Regeln wie der Server (analysis/gps.py): BURST (mehr als
    /// 5 m/s ueber dem 15-s-Median UND absolut ueber 28 km/h -> Median) und DECKEL (ueber 32 km/h
    /// ist es kein Pumpfoil mehr). An 119 echten Sessions gemessen: Maxwert im Mittel 9,4 km/h zu
    /// hoch, schlimmster Fall 164; mit den Regeln +3,1 bzw. +17,4.
    private var burstRing = [Double](repeating: -1, count: 15)
    private var burstPos = 0
    /// maxKandidat() pro Fix nur EINMAL — sonst halbiert sich das 15-s-Fenster.
    private var spdMaxClean = 0.0
    private var minSpeedSeitEnde = 99.0
    private var lastRunStartMs = 0.0, lastRunStartDist = 0.0   // Start des zuletzt beendeten Laufs
    private let MAX_PLAUSIBLE_MPS = 32.0 / 3.6   // darueber ist es kein Pumpfoil
    private let MIN_RUN_MS = 5000.0        // kuerzer = kein Lauf (Server: MIN_SEGMENT_S)
    private let MIN_RUN_AVG_MPS = 2.0      // langsamer = kein Lauf (Server: MOVE_FLOOR_MPS)
    private var runIstFortsetzung = false

    private func maxKandidat(_ v: Double) -> Double {
        burstRing[burstPos] = v
        burstPos = (burstPos + 1) % burstRing.count
        let vals = burstRing.filter { $0 >= 0 }.sorted()
        let med = vals.isEmpty ? 0 : vals[vals.count / 2]
        var w = v
        if w > med + 5.0, w > 28.0 / 3.6 { w = med }
        return w > 32.0 / 3.6 ? 0 : w
    }
    private var lastRunDurMs = 0.0, lastRunDistM = 0.0, lastRunMaxMps = 0.0

    override init() {
        super.init()
        loc.delegate = self
        // Hoechste Stufe von CoreLocation (s. Recorder.swift, 13.08.): fehlende Position ist der
        // Hauptgrund fuer "mir fehlen Laeufe". Akku ist bewusst kein Kriterium.
        loc.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        loc.activityType = .fitness
        loc.allowsBackgroundLocationUpdates = true
        loc.pausesLocationUpdatesAutomatically = false
        motionQ.maxConcurrentOperationCount = 1
    }

    // MARK: Start / Stop

    func start() {
        guard !recording else { return }
        idleMonitoring = false   // Idle-Monitor übergibt an die Aufnahme
        uuid = UUID().uuidString
        startMs = Date().timeIntervalSince1970 * 1000
        chunkIndex = 0
        lock.lock(); accelBuf.removeAll(); gpsBuf.removeAll(); spWin.removeAll(); lock.unlock()
        prevLat = .nan; prevLon = .nan; distM = 0; maxMps = 0
        foiling = false; foilEnter = 0; foilExit = 0; runEndedMs = -100000
        runCnt = 0; runStartMs = 0; runStartDist = 0; runMaxMps = 0
        lastRunDurMs = 0; lastRunDistM = 0; lastRunMaxMps = 0
        lastRunStartMs = 0; lastRunStartDist = 0; minSpeedSeitEnde = 99.0; runIstFortsetzung = false
        var meta: [String: Any] = [
            "session_uuid": uuid, "started_at": Self.nowIso(), "sport": "pumpfoil",
            "gps_hz": 1, "accel_hz": Int(ACCEL_HZ), "accel_scale": Int(ACCEL_SCALE),
            "placement": "phone",
            "device_model": Self.deviceModel(),
        ]
        if let f = sessionFoilId { meta["foil_id"] = f }
        // Version, mit der aufgenommen wurde (bleibt an der Session, auch wenn der Upload erst
        // nach einem App-Update läuft). Leerer Wert würde die Server-Validierung verletzen.
        if !Api.appVersion.isEmpty { meta["app_version"] = Api.appVersion }
        Store.writeMeta(uuid, meta)
        recording = true; status = "Aufnahme läuft"; pendingCount = Store.pendingCount()
        elapsedSec = 0; speedKmh = 0; distanceM = 0; runCount = 0; isFoiling = false; track = []

        loc.requestWhenInUseAuthorization()   // + Background-Mode „location" => Hintergrund-Track (blauer Balken)
        loc.startUpdatingLocation()
        if motion.isAccelerometerAvailable {
            motion.accelerometerUpdateInterval = 1.0 / ACCEL_HZ
            motion.startAccelerometerUpdates(to: motionQ) { [weak self] data, _ in
                guard let self, let a = data?.acceleration else { return }
                self.addAccel(a.x, a.y, a.z)
            }
        }
        flushTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.flushAll() }
        }
    }

    func stop() {
        guard recording else { return }
        recording = false
        loc.stopUpdatingLocation()
        motion.stopAccelerometerUpdates()
        flushTimer?.invalidate(); flushTimer = nil
        status = "speichere…"
        flushAll()
        Store.writeComplete(uuid, ["ended_at": Self.nowIso(), "total_chunks": chunkIndex])
        status = "gespeichert"; pendingCount = Store.pendingCount()
        Task { await drain() }
    }

    func refreshPending() { pendingCount = Store.pendingCount() }

    // MARK: Idle-Monitor (Start-Screen) — GPS beziehen für „GPS bereit" + Autostart, ohne Aufnahme.
    func startIdleMonitor() {
        guard !recording else { return }
        idleMonitoring = true; idleLead = 0; idleStreak = 0
        loc.requestWhenInUseAuthorization()
        loc.startUpdatingLocation()
    }
    func stopIdleMonitor() {
        idleMonitoring = false
        if !recording { loc.stopUpdatingLocation(); gpsReady = false }
    }

    private func elapsedMs() -> Int { Int(Date().timeIntervalSince1970 * 1000 - startMs) }
    private static func nowIso() -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"; f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: Date())
    }
    // Aufnahme-Gerät: "iPhone15,2 · iOS 17.5" (Fehlersuche). Modell-Identifier via uname,
    // OS-Version über ProcessInfo (kein UIKit nötig).
    private static func deviceModel() -> String {
        var sys = utsname(); uname(&sys)
        let machine = withUnsafeBytes(of: &sys.machine) { raw -> String in
            let ptr = raw.bindMemory(to: CChar.self).baseAddress!
            return String(cString: ptr)
        }
        let v = ProcessInfo.processInfo.operatingSystemVersion
        let model = machine.isEmpty ? "iPhone" : machine
        return String("\(model) · iOS \(v.majorVersion).\(v.minorVersion)".prefix(80))
    }
    private func toI16(_ v: Double) -> Int16 { Int16(max(-32768, min(32767, (v).rounded()))) }

    // MARK: Sensor-Eingang

    // CoreMotion liefert Beschleunigung bereits in g -> direkt * SCALE (kein /G wie Android).
    nonisolated func addAccel(_ x: Double, _ y: Double, _ z: Double) {
        Task { @MainActor in
            guard self.recording else { return }
            self.lock.lock()
            if self.accelBuf.isEmpty { self.accelT0Ms = self.elapsedMs() }
            self.accelBuf.append(self.toI16(x * self.ACCEL_SCALE))
            self.accelBuf.append(self.toI16(y * self.ACCEL_SCALE))
            self.accelBuf.append(self.toI16(z * self.ACCEL_SCALE))
            self.lock.unlock()
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        // Idle (Start-Screen): nur GPS-Status + Autostart-Logik, keine Aufnahme.
        if !recording {
            guard idleMonitoring, let l = locs.last else { return }
            gpsReady = l.horizontalAccuracy >= 0 && l.horizontalAccuracy <= 25
            let sp = max(0, l.speed)   // m/s
            if autoStart && gpsReady {
                if idleLead < 10 { idleLead += 1; idleStreak = 0 }        // 10 s Vorlauf
                else if sp >= 2.8 { idleStreak += 1; if idleStreak >= 4 { start() } }  // 2,8 m/s, 4 s
                else { idleStreak = 0 }
            } else { idleStreak = 0 }
            return
        }
        guard let l = locs.last else { return }
        let tMs = elapsedMs()
        let sp = max(0, l.speed)   // m/s (-1 = ungültig -> 0)
        lock.lock()
        gpsBuf.append([Double(tMs), l.coordinate.latitude, l.coordinate.longitude, sp, 0, l.horizontalAccuracy])
        // Distanz nur, wenn wir uns wirklich bewegen (s. standMps). Der Handy-Recorder hat kein
        // eigenes Qualitaets-Gate fuer die Anzeige, deshalb steht die Genauigkeitsgrenze hier —
        // mit demselben Wert (20 m) wie auf Uhr und Server.
        if !prevLat.isNaN {
            let schritt = Self.haversine(prevLat, prevLon, l.coordinate.latitude, l.coordinate.longitude)
            let bewegt = l.speed >= 0 ? l.speed > Self.standMps : schritt >= Self.standSchrittM
            if l.horizontalAccuracy <= 20, bewegt { distM += schritt }
        }
        prevLat = l.coordinate.latitude; prevLon = l.coordinate.longitude
        spdMaxClean = maxKandidat(sp)
        if spdMaxClean > maxMps { maxMps = spdMaxClean }
        spWin.append([Double(tMs), sp])
        while let f = spWin.first, Double(tMs) - f[0] > 3000 { spWin.removeFirst() }
        lock.unlock()
        let sec = max(1.0, Double(tMs) / 1000.0)
        // MEDIAN statt Mittel — wie Garmin, Zepp und der Server (_running_median).
        let sortiert = spWin.map { $0[1] }.sorted()
        let sp3 = sortiert.isEmpty ? sp : sortiert[sortiert.count / 2]
        let nowFoiling = updateFoilingRun(sp3 * 3.6, Double(tMs), distM, sp)
        gpsFix = true
        speedKmh = sp * 3.6; speed3sKmh = sp3 * 3.6; maxSpeedKmh = maxMps * 3.6
        distanceM = distM; avgSpeedKmh = distM / sec * 3.6; elapsedSec = tMs / 1000
        isFoiling = nowFoiling; runCount = runCnt
        runDurationMs = Int(nowFoiling ? max(0, Double(tMs) - runStartMs) : lastRunDurMs)
        lastRunDurationMs = Int(lastRunDurMs); lastRunDistanceM = lastRunDistM
        // Track fürs Canvas; bei >3000 Punkten jeden zweiten verwerfen (Form bleibt).
        track.append([l.coordinate.latitude, l.coordinate.longitude])
        if track.count > 3000 { track = track.enumerated().filter { $0.offset % 2 == 0 }.map { $0.element } }
    }

    private func updateFoilingRun(_ sp3Kmh: Double, _ tMs: Double, _ dist: Double, _ spMps: Double) -> Bool {
        if !foiling {
            // Minimum IMMER mitfuehren (auch im Cooldown) — dort zeigt sich ein echter Stopp.
            if spMps < minSpeedSeitEnde { minSpeedSeitEnde = spMps }
            // Cooldown nur nach echtem Stopp; sonst Fortsetzung desselben Laufs.
            let gesperrt = tMs - runEndedMs < RUN_REARM_COOLDOWN_MS && minSpeedSeitEnde < 1.5
            if gesperrt { foilEnter = 0 }
            else {
                foilEnter = sp3Kmh >= 10 ? foilEnter + 1 : 0
                if foilEnter >= RUN_ENTER_DWELL {
                    foiling = true; foilExit = 0
                    // Kein echter Stopp seit dem letzten Lauf-Ende -> derselbe Lauf.
                    runIstFortsetzung = runCnt > 0 && minSpeedSeitEnde >= 1.5
                    // Sprung im Kilometerzaehler ist keine Fortsetzung (s. Apple-Watch-Recorder).
                    if runIstFortsetzung {
                        let luecke = tMs - lastRunStartMs
                        let strecke = dist - lastRunStartDist
                        if luecke <= 0 || strecke < 0 || strecke / (luecke / 1000.0) > MAX_PLAUSIBLE_MPS {
                            runIstFortsetzung = false
                        }
                    }
                    minSpeedSeitEnde = 99.0
                    if runIstFortsetzung {
                        runStartMs = lastRunStartMs; runStartDist = lastRunStartDist
                        if lastRunMaxMps > runMaxMps { runMaxMps = lastRunMaxMps }
                    } else {
                        runStartMs = tMs - Double(RUN_ENTER_DWELL) * 1000; runStartDist = dist; runMaxMps = spdMaxClean
                    }
                }
            }
        } else {
            if spdMaxClean > runMaxMps { runMaxMps = spdMaxClean }
            foilExit = sp3Kmh < 9 ? foilExit + 1 : 0
            if foilExit >= RUN_EXIT_DWELL {
                foiling = false; foilEnter = 0
                let durMs = max(0, tMs - Double(RUN_EXIT_DWELL) * 1000 - runStartMs)
                let distM = max(0, dist - runStartDist)
                minSpeedSeitEnde = 99.0
                runEndedMs = tMs
                // Zu kurz/zu langsam = kein Lauf (dieselbe Regel wie am Server).
                let schnellGenug = durMs > 0 && distM / (durMs / 1000.0) >= MIN_RUN_AVG_MPS
                if runIstFortsetzung || (durMs >= MIN_RUN_MS && schnellGenug) {
                    lastRunStartMs = runStartMs; lastRunStartDist = runStartDist
                    lastRunDurMs = durMs
                    lastRunDistM = distM; lastRunMaxMps = runMaxMps
                    if !runIstFortsetzung { runCnt += 1 }
                }
                runIstFortsetzung = false
            }
        }
        return foiling
    }

    private static func haversine(_ la1: Double, _ lo1: Double, _ la2: Double, _ lo2: Double) -> Double {
        let r = 6371000.0, p1 = la1 * .pi / 180, p2 = la2 * .pi / 180
        let dp = (la2 - la1) * .pi / 180, dl = (lo2 - lo1) * .pi / 180
        let a = sin(dp/2) * sin(dp/2) + cos(p1) * cos(p2) * sin(dl/2) * sin(dl/2)
        return 2 * r * asin(min(1, sqrt(a)))
    }

    // MARK: Flush (lokal persistieren)

    private func flushAll() { flushAccel(); flushGps() }

    private func flushAccel() {
        lock.lock()
        if accelBuf.isEmpty { lock.unlock(); return }
        let buf = accelBuf; let t0 = accelT0Ms; accelBuf.removeAll()
        lock.unlock()
        var data = Data(capacity: buf.count * 2)
        for s in buf { var le = s.littleEndian; withUnsafeBytes(of: &le) { data.append(contentsOf: $0) } }
        Store.writeChunk(uuid, chunkIndex, [
            "index": chunkIndex, "kind": "accel", "encoding": "int16-b64",
            "t0_ms": t0, "count": buf.count / 3, "data": data.base64EncodedString(),
        ])
        chunkIndex += 1
    }

    private func flushGps() {
        lock.lock()
        if gpsBuf.isEmpty { lock.unlock(); return }
        let buf = gpsBuf; gpsBuf.removeAll()
        lock.unlock()
        Store.writeChunk(uuid, chunkIndex, [
            "index": chunkIndex, "kind": "gps", "encoding": "json",
            "t0_ms": Int(buf.first![0]), "count": buf.count, "data": buf,
        ])
        chunkIndex += 1
    }

    // MARK: Upload

    func drain() async {
        Store.recoverInterrupted(active: recording ? uuid : nil)
        pendingCount = Store.pendingCount()
        guard pendingCount > 0 else { return }
        guard let _ = await PhoneIngest.ensureToken() else { uploadError = "offline"; return }
        await PhoneIngest.reportVersion()   // Version/Plattform am Device-Token melden (einmal pro Lauf)
        uploadError = ""
        for dir in Store.completedSessions() {
            do { try await uploadSession(dir) }
            catch let e as PhoneIngest.IngestError where e.status == 401 {
                PhoneIngest.clearToken(); uploadError = "auth"; break
            }
            catch { uploadError = "server" }
        }
        uploading = false; status = ""; pendingCount = Store.pendingCount()
    }

    private func uploadSession(_ dir: URL) async throws {
        guard let meta = Store.readJson(dir.appendingPathComponent("meta.json")),
              let sid = meta["session_uuid"] as? String else { return }
        // expected_chunks -> `upload_total` (sessions.py:199): „x von y" statt unbestimmtem
        // Balken. Die Chunk-Dateien liegen bereits vollstaendig im Verzeichnis, die Zahl ist also
        // exakt; waehrend einer laufenden Aufnahme duerfte sie nicht gesendet werden.
        var startMeta = meta
        startMeta["expected_chunks"] = Store.chunkFiles(dir).count
        let res = try await PhoneIngest.startSession(startMeta)
        let received = Set((res["received_chunks"] as? [Int]) ?? [])
        uploading = true; status = "lade hoch…"
        // Handy hat echtes Netz -> Chunks PARALLEL hochladen (Pool 6). Server nimmt sie in
        // beliebiger Reihenfolge (je Index eigene Datei/Zeile) -> kollisionsfrei. Jeder Task
        // liest seine Datei selbst (nur Sendable-Werte gefangen: URL, Set, String).
        // GPS-first: GPS-Chunks zuerst in den Pool (kind aus dem Dateinamen). Bei abgebrochenem
        // Upload ist die GPS-Spur zuerst vollständig -> Session als gps_only analysierbar statt
        // hängend. Parität zu Server/Web; Reihenfolge je Gruppe bleibt erhalten.
        let _cf = Store.chunkFiles(dir)
        var it = (_cf.filter { Store.chunkKind($0) == "gps" } + _cf.filter { Store.chunkKind($0) != "gps" }).makeIterator()
        try await withThrowingTaskGroup(of: Void.self) { group in
            func addNext() -> Bool {
                guard let cf = it.next() else { return false }
                group.addTask {
                    guard let chunk = Store.readJson(cf) else { return }
                    if let idx = chunk["index"] as? Int, received.contains(idx) { return }
                    try await PhoneIngest.uploadChunk(sid, chunk)
                }
                return true
            }
            var running = 0
            for _ in 0..<6 { if addNext() { running += 1 } }
            while running > 0 {
                try await group.next()
                running -= 1
                if addNext() { running += 1 }
            }
        }
        let comp = Store.readJson(dir.appendingPathComponent("complete.json"))
        try await PhoneIngest.complete(sid, endedAt: (comp?["ended_at"] as? String) ?? Self.nowIso(),
                                       totalChunks: (comp?["total_chunks"] as? Int) ?? chunkIndex)
        Store.delete(sid)
    }
}
