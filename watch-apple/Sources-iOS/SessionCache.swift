import Foundation

// Lokaler Disk-Cache fürs Session-Detail (die schwere Payload: Track/Segmente/Accel).
// Schlüssel = Session-ID; gültig, solange data_version (server-seitiges „zuletzt geändert")
// übereinstimmt. So lädt die App ein altes Detail nur nach, wenn es sich wirklich geändert hat.
// Automatische Eviction: Einträge, die >90 Tage nicht genutzt wurden (mtime), werden verworfen.
enum SessionCache {
    private static let ttlDays = 90.0

    private static let dir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("session-detail", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private static func file(_ id: Int) -> URL { dir.appendingPathComponent("\(id).json") }

    // `schema`: Stand des App-Datenmodells. Aendert sich SessionDetail (neues Feld wie das Gewicht je
    // Session, 07.10.2026), gelten alte Eintraege nicht mehr — sie wurden OHNE das Feld gespeichert und
    // wuerden es sonst verschweigen, bis sich die Session selbst aendert.
    private struct Entry: Codable { let version: Int; let detail: SessionDetail; let schema: Int? }
    private static let schema = 3   // 3: Metrics.model_skipped (07.10.2026)

    // Cache-Treffer nur, wenn version == erwarteter data_version (aus der Liste). Aktualisiert
    // die mtime (LRU) und gibt das gecachte Detail zurück; sonst nil (-> laden).
    static func load(id: Int, expectedVersion: Int?) -> SessionDetail? {
        guard let expectedVersion,
              let raw = try? Data(contentsOf: file(id)),
              let entry = try? JSONDecoder().decode(Entry.self, from: raw),
              entry.version == expectedVersion, entry.schema == schema else { return nil }
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file(id).path)
        return entry.detail
    }

    static func store(_ detail: SessionDetail) {
        guard let version = detail.data_version else { return }
        let entry = Entry(version: version, detail: detail, schema: schema)
        if let data = try? JSONEncoder().encode(entry) {
            try? data.write(to: file(detail.id), options: .atomic)
        }
    }

    // Beim App-Start: alte Einträge (>90 Tage ungenutzt) löschen.
    static func evictOld() {
        let cutoff = Date().addingTimeInterval(-ttlDays * 86_400)
        let keys: Set<URLResourceKey> = [.contentModificationDateKey]
        let files = (try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: Array(keys))) ?? []
        for f in files {
            let m = (try? f.resourceValues(forKeys: keys))?.contentModificationDate
            if let m, m < cutoff { try? FileManager.default.removeItem(at: f) }
        }
    }
}
