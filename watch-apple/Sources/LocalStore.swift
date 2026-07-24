import Foundation

// Persistente Ablage aufgezeichneter Sessions auf der Uhr. Die Aufnahme schreibt
// IMMER zuerst hierhin (crash- und offline-sicher); ein Uploader (Recorder.drain)
// lädt später hoch, sobald die Uhr gepairt + online ist. So kann man auch ohne
// Pairing aufnehmen und die Sessions nachträglich synchronisieren.
//
// Layout:  <AppSupport>/sessions/<uuid>/
//            meta.json        {session_uuid, started_at, sport, gps_hz, accel_hz, accel_scale}
//            chunk-000000.json  {index, kind, encoding, t0_ms, count, data}
//            ...
//            complete.json    {ended_at, total_chunks}   (erst beim Stop -> "fertig aufgezeichnet")
enum LocalStore {
    static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("sessions", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func dir(_ uuid: String) -> URL {
        let d = root.appendingPathComponent(uuid, isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func writeJSON(_ obj: [String: Any], to url: URL) {
        if let data = try? JSONSerialization.data(withJSONObject: obj) { try? data.write(to: url) }
    }
    static func readJSON(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }

    static func writeMeta(_ uuid: String, _ meta: [String: Any]) {
        writeJSON(meta, to: dir(uuid).appendingPathComponent("meta.json"))
    }
    static func writeChunk(_ uuid: String, _ index: Int, _ chunk: [String: Any]) {
        // Kind in den Dateinamen (chunk-<index>-<kind>.json): Swifts JSONSerialization garantiert
        // KEINE Schlüsselreihenfolge, daher lässt sich das kind NICHT aus dem Datei-Kopf lesen.
        // Über den Namen sortiert der Uploader GPS-first billig (ohne die Payload zu lesen).
        let kind = (chunk["kind"] as? String) ?? "x"
        writeJSON(chunk, to: dir(uuid).appendingPathComponent(String(format: "chunk-%06d-%@.json", index, kind)))
    }

    // Kind eines Chunks aus dem Dateinamen (chunk-<index>-<kind>.json). Alt-Format ohne Suffix
    // (chunk-<index>.json) -> "" (wird als nicht-gps einsortiert = ursprüngliche Reihenfolge).
    static func chunkKind(_ url: URL) -> String {
        let n = url.lastPathComponent
        if n.contains("-gps.") { return "gps" }
        if n.contains("-accel.") { return "accel" }
        return ""
    }
    static func writeComplete(_ uuid: String, _ c: [String: Any]) {
        writeJSON(c, to: dir(uuid).appendingPathComponent("complete.json"))
    }
    static func delete(_ uuid: String) { try? FileManager.default.removeItem(at: dir(uuid)) }

    // Vollständig aufgezeichnete Sessions (haben complete.json), älteste zuerst.
    static func completedSessions() -> [URL] {
        let fm = FileManager.default
        let dirs = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        func mtime(_ u: URL) -> Date {
            (try? u.appendingPathComponent("meta.json")
                .resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
        }
        return dirs
            .filter { fm.fileExists(atPath: $0.appendingPathComponent("complete.json").path) }
            .sorted { mtime($0) < mtime($1) }
    }
    static func pendingCount() -> Int { completedSessions().count }

    // Abgebrochene Aufnahmen: meta + Chunks vorhanden, aber KEIN complete.json (App-Crash/
    // -Kill vor dem Stopp). Würden sonst nie hochgeladen -> Datenverlust. Die aktive
    // Aufnahme (activeUuid) wird ausgenommen.
    static func interruptedSessions(activeUuid: String?) -> [URL] {
        let fm = FileManager.default
        let dirs = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return dirs.filter {
            $0.lastPathComponent != activeUuid &&
                fm.fileExists(atPath: $0.appendingPathComponent("meta.json").path) &&
                !fm.fileExists(atPath: $0.appendingPathComponent("complete.json").path) &&
                !chunkFiles($0).isEmpty
        }
    }

    static func chunkFiles(_ dir: URL) -> [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.lastPathComponent.hasPrefix("chunk-") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
}
