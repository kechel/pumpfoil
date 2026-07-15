import Foundation

// Persistente Ablage der auf dem iPhone aufgezeichneten Sessions (Beta „Record on Phone").
// Layout: Documents/phone-sessions/<uuid>/{meta.json, chunk-000000.json…, complete.json}.
// Spiegelt RecStore (Android). Immer zuerst lokal schreiben (crash-/offline-sicher).
enum Store {
    private static var root: URL {
        let u = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("phone-sessions")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
    static func dir(_ uuid: String) -> URL {
        let u = root.appendingPathComponent(uuid)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
    private static func write(_ url: URL, _ obj: [String: Any]) {
        if let d = try? JSONSerialization.data(withJSONObject: obj) { try? d.write(to: url) }
    }
    static func writeMeta(_ uuid: String, _ m: [String: Any]) { write(dir(uuid).appendingPathComponent("meta.json"), m) }
    static func writeChunk(_ uuid: String, _ i: Int, _ c: [String: Any]) {
        write(dir(uuid).appendingPathComponent(String(format: "chunk-%06d.json", i)), c)
    }
    static func writeComplete(_ uuid: String, _ c: [String: Any]) { write(dir(uuid).appendingPathComponent("complete.json"), c) }
    static func delete(_ uuid: String) { try? FileManager.default.removeItem(at: dir(uuid)) }

    static func readJson(_ url: URL) -> [String: Any]? {
        guard let d = try? Data(contentsOf: url) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }
    private static func subdirs() -> [URL] {
        (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    }
    private static func exists(_ dir: URL, _ name: String) -> Bool {
        FileManager.default.fileExists(atPath: dir.appendingPathComponent(name).path)
    }
    static func chunkFiles(_ dir: URL) -> [URL] {
        ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.lastPathComponent.hasPrefix("chunk-") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
    static func completedSessions() -> [URL] {
        subdirs().filter { exists($0, "complete.json") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
    static func pendingCount() -> Int { completedSessions().count }

    // Abgebrochene Aufnahmen (meta + Chunks, aber kein complete.json) finalisieren.
    static func recoverInterrupted(active: String?) {
        for d in subdirs() {
            let name = d.lastPathComponent
            if name == active { continue }
            if exists(d, "meta.json") && !exists(d, "complete.json") && !chunkFiles(d).isEmpty {
                let n = chunkFiles(d).count
                let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
                f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"; f.timeZone = TimeZone(identifier: "UTC")
                writeComplete(name, ["ended_at": f.string(from: Date()), "total_chunks": n])
            }
        }
    }
}

// Ingest-Client fürs iPhone: mintet ein „Phone"-Device-Token (Api.mintDeviceToken, JWT) und lädt
// GPS/Accel-Chunks über den Raw-Ingest-Contract hoch (X-Device-Token). Getrennt von der JWT-Api.
enum PhoneIngest {
    struct IngestError: Error { let status: Int }
    private static let KEY = "phone_device_token"

    static var deviceToken: String? {
        get { UserDefaults.standard.string(forKey: KEY) }
        set { UserDefaults.standard.set(newValue, forKey: KEY) }
    }
    static func clearToken() { UserDefaults.standard.removeObject(forKey: KEY) }

    static func ensureToken() async -> String? {
        if let t = deviceToken { return t }
        if let t = try? await Api.mintDeviceToken(label: "Phone") { deviceToken = t; return t }
        return nil
    }

    static func startSession(_ meta: [String: Any]) async throws -> [String: Any] {
        try await post("/api/ingest/session", meta)
    }
    static func uploadChunk(_ uuid: String, _ chunk: [String: Any]) async throws {
        _ = try await post("/api/ingest/session/\(uuid)/chunk", chunk)
    }
    static func complete(_ uuid: String, endedAt: String, totalChunks: Int) async throws {
        _ = try await post("/api/ingest/session/\(uuid)/complete", ["ended_at": endedAt, "total_chunks": totalChunks])
    }

    @discardableResult
    private static func post(_ path: String, _ body: [String: Any]) async throws -> [String: Any] {
        guard let url = URL(string: Api.baseURL + path) else { throw IngestError(status: -1) }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = deviceToken { req.setValue(t, forHTTPHeaderField: "X-Device-Token") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if !(200...299).contains(code) { throw IngestError(status: code) }
        return ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
    }
}
