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
    static let accelScale: Double = 2048   // int16-Wert 2048 == 1 g

    @Published var isRecording = false
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

    private let store = HKHealthStore()
    private let motion = CMMotionManager()
    private let motionQueue = OperationQueue()
    private let location = CLLocationManager()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private var uuid = ""
    private var startedAt = Date()
    private var chunkIndex = 0
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

    func start() async {
        guard !isRecording else { return }
        uuid = UUID().uuidString
        startedAt = Date()
        chunkIndex = 0
        accel.removeAll(); gps.removeAll(); spWin.removeAll()
        prevLoc = nil; distAccum = 0; maxMps = 0; hrSum = 0; hrCount = 0; maxHRv = 0; lastHR = 0
        status = "starte…"
        do {
            _ = try await Api.startSession([
                "session_uuid": uuid,
                "started_at": startedAt.iso8601Z,
                "sport": "pumpfoil",
                "gps_hz": 1,
                "accel_hz": Self.accelHz,
                "accel_scale": Int(Self.accelScale),
            ])
        } catch {
            status = "Start fehlgeschlagen: \(error.localizedDescription)"
            return
        }
        startWorkout()
        startSensors()
        isRecording = true
        status = "Aufnahme läuft"
        tick = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.elapsed = Date().timeIntervalSince(self.startedAt) }
        }
        flushTask = Task { await self.flushLoop() }
    }

    func stop() async {
        guard isRecording else { return }
        isRecording = false
        tick?.invalidate(); tick = nil
        flushTask?.cancel()
        motion.stopAccelerometerUpdates()
        location.stopUpdatingLocation()
        status = "lade Rest hoch…"
        await flushAll()
        do {
            try await Api.complete(uuid, endedAt: Date().iso8601Z, totalChunks: chunkIndex)
            status = "fertig & hochgeladen"
        } catch {
            status = "Abschluss fehlgeschlagen: \(error.localizedDescription)"
        }
        endWorkout()
    }

    // MARK: - Sensors

    private func startSensors() {
        location.desiredAccuracy = kCLLocationAccuracyBest
        location.distanceFilter = kCLDistanceFilterNone
        // allowsBackgroundLocationUpdates NICHT setzen: ohne "location"-Background-Mode
        // führt das zum Crash (CLClientIsBackgroundable-Assertion). Im Hintergrund hält
        // die HKWorkoutSession die App + Standortupdates am Leben.
        location.startUpdatingLocation()

        if motion.isAccelerometerAvailable {
            motion.accelerometerUpdateInterval = 1.0 / Double(Self.accelHz)
            motion.startAccelerometerUpdates(to: motionQueue) { [weak self] data, _ in
                guard let self, let a = data?.acceleration else { return }
                self.lock.lock()
                if self.accel.isEmpty { self.accelT0ms = self.elapsedMs() }
                self.accel.append(Self.clampInt16(a.x * Self.accelScale))
                self.accel.append(Self.clampInt16(a.y * Self.accelScale))
                self.accel.append(Self.clampInt16(a.z * Self.accelScale))
                self.lock.unlock()
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
            status = "Workout-Start fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    private func endWorkout() {
        session?.end()
        builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
            self?.builder?.finishWorkout { _, _ in }
        }
    }

    // MARK: - Flush / Upload

    private func flushLoop() async {
        while isRecording && !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 10_000_000_000) // 10 s
            await flushAll()
        }
    }

    private func flushAll() async {
        await flushAccel()
        await flushGps()
    }

    private func flushAccel() async {
        lock.lock()
        let buf = accel; let t0 = accelT0ms
        accel.removeAll()
        lock.unlock()
        guard !buf.isEmpty else { return }
        let data = buf.withUnsafeBufferPointer { Data(buffer: $0) } // little-endian int16
        let body: [String: Any] = [
            "index": chunkIndex, "kind": "accel", "encoding": "int16-b64",
            "t0_ms": t0, "count": buf.count / 3, "data": data.base64EncodedString(),
        ]
        do { try await Api.uploadChunk(uuid, body); chunkIndex += 1 }
        catch { lock.lock(); accel.insert(contentsOf: buf, at: 0); lock.unlock() } // retry später
    }

    private func flushGps() async {
        lock.lock()
        let buf = gps
        gps.removeAll()
        lock.unlock()
        guard !buf.isEmpty else { return }
        let body: [String: Any] = [
            "index": chunkIndex, "kind": "gps", "encoding": "json",
            "t0_ms": Int(buf.first?[0] ?? 0), "count": buf.count, "data": buf,
        ]
        do { try await Api.uploadChunk(uuid, body); chunkIndex += 1 }
        catch { lock.lock(); gps.insert(contentsOf: buf, at: 0); lock.unlock() }
    }
}

// MARK: - Location

extension Recorder: CLLocationManagerDelegate {
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        Task { @MainActor in
            let t = self.elapsedMs()
            let sp = max(0, loc.speed)
            self.lock.lock()
            self.gps.append([Double(t), loc.coordinate.latitude, loc.coordinate.longitude,
                             sp, Double(self.lastHR), loc.horizontalAccuracy])
            self.lock.unlock()
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
