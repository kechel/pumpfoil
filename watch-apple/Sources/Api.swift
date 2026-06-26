import Foundation
import Network

// Erreichbarkeit: meldet, ob überhaupt eine Netzverbindung besteht, damit wir
// den Sync überspringen können statt in einen Timeout zu laufen.
final class Reachability {
    static let shared = Reachability()
    private let monitor = NWPathMonitor()
    private(set) var isOnline = true
    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            self?.isOnline = (path.status == .satisfied)
        }
        monitor.start(queue: DispatchQueue(label: "org.pumpfoil.net"))
    }
}

// Server-Anbindung: Pairing + Raw-Ingest-Contract (docs/ingest-contract.md).
enum Api {
    // Default Produktion; für lokale Tests in den Einstellungen überschreibbar.
    static var baseURL: String {
        UserDefaults.standard.string(forKey: "baseURL") ?? "https://pumpfoil.org"
    }
    static var deviceToken: String? {
        get { UserDefaults.standard.string(forKey: "deviceToken") }
        set { UserDefaults.standard.setValue(newValue, forKey: "deviceToken") }
    }

    struct PairResponse: Decodable { let device_token: String; let user_id: Int }
    struct StartResponse: Decodable { let session_id: Int; let received_chunks: [Int] }
    struct Ack: Decodable {}   // ignoriert Felder wie {"ok":true,...}

    // Reverse-Pairing: die Uhr erzeugt einen Code, der Nutzer trägt ihn auf der
    // Web-App ein (Code an der Uhr tippen wäre umständlich).
    struct PairInitResponse: Decodable { let code: String; let claim_token: String }
    struct PairPollResponse: Decodable { let device_token: String? }

    static func pairInit() async throws -> PairInitResponse {
        try await post("/api/devices/pair-init", [:], auth: false)
    }

    // Pollt, ob der Code in der Web-App eingelöst wurde -> dann kommt das Device-Token.
    static func pairPoll(claimToken: String) async throws -> PairPollResponse {
        guard let url = URL(string: baseURL + "/api/devices/pair-poll?claim_token=" + claimToken)
        else { throw err("Bad URL") }
        var req = URLRequest(url: url)
        req.timeoutInterval = 10
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw err("HTTP \(code)") }
        return try JSONDecoder().decode(PairPollResponse.self, from: data)
    }

    struct FoilOpt: Codable, Identifiable, Equatable {
        let id: Int
        let label: String
        let min: Int
        let max: Int
    }

    struct DeviceConfig: Codable {
        let views: [[Int]]
        let colorByValue: Bool
        let alarmEnabled: Bool
        let speedHigh: Int
        let speedLow: Int
        let alarmPatternHigh: String?   // Vibrationsmuster Max-Alarm (optional/abwärtskompatibel)
        let alarmPatternLow: String?    // Vibrationsmuster Min-Alarm
        let alarmRepeat: String?        // "once" | "continuous"
        let alarmDefault: String?       // Uhr-Vorwahl: "foil" | "fixed"
        let foils: [FoilOpt]?   // Auto-Alarm je Foil (optional/abwärtskompatibel zum Cache)
        let offFoilView: [Int]? // Screen für off-foil (Auto-Umschaltung)
        let language: String?   // Profil-Sprache (de/gsw/de-AT/en/fr/it/es) für On-Device-Texte
    }

    // Letzte erfolgreich geladene Config — damit die Uhr offline mit den zuletzt
    // bekannten Einstellungen sofort startklar ist.
    static func cachedConfig() -> DeviceConfig? {
        guard let d = UserDefaults.standard.data(forKey: "deviceConfigCache") else { return nil }
        return try? JSONDecoder().decode(DeviceConfig.self, from: d)
    }
    static func cacheConfig(_ c: DeviceConfig) {
        if let d = try? JSONEncoder().encode(c) {
            UserDefaults.standard.set(d, forKey: "deviceConfigCache")
        }
    }

    static func deviceConfig() async throws -> DeviceConfig {
        // Version + Plattform melden -> Update-Hinweis im Web.
        let v = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? ""
        let q = v.isEmpty ? "?p=apple"
            : "?v=\(v.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? v)&p=apple"
        guard let url = URL(string: baseURL + "/api/devices/config" + q) else { throw err("Bad URL") }
        var req = URLRequest(url: url)
        req.timeoutInterval = 10   // nicht ewig warten — der Nutzer kann „Jetzt nicht" tippen
        if let t = deviceToken { req.setValue(t, forHTTPHeaderField: "X-Device-Token") }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw err("HTTP \(code)") }
        let c = try JSONDecoder().decode(DeviceConfig.self, from: data)
        cacheConfig(c)
        return c
    }

    static func startSession(_ body: [String: Any]) async throws -> StartResponse {
        try await post("/api/ingest/session", body)
    }

    static func uploadChunk(_ uuid: String, _ body: [String: Any]) async throws {
        let _: Ack = try await post("/api/ingest/session/\(uuid)/chunk", body)
    }

    static func complete(_ uuid: String, endedAt: String, totalChunks: Int) async throws {
        let _: Ack = try await post("/api/ingest/session/\(uuid)/complete",
                                    ["ended_at": endedAt, "total_chunks": totalChunks])
    }

    private static func post<T: Decodable>(_ path: String, _ body: [String: Any], auth: Bool = true) async throws -> T {
        guard let url = URL(string: baseURL + path) else { throw err("Bad URL") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let t = deviceToken { req.setValue(t, forHTTPHeaderField: "X-Device-Token") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else {
            throw err("HTTP \(code): \(String(data: data, encoding: .utf8) ?? "")")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func err(_ msg: String) -> NSError {
        NSError(domain: "Pumpfoil", code: 0, userInfo: [NSLocalizedDescriptionKey: msg])
    }
}

// ISO-8601 mit "Z" (UTC) — passt zum Server-Contract.
extension Date {
    var iso8601Z: String {
        let f = ISO8601DateFormatter()
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: self)
    }
}
