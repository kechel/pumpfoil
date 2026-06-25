import Foundation

// REST-Client zur Pumpfoil-API (JWT Bearer). Spiegelt web/src/lib/api.ts.
enum Api {
    static let baseURL = "https://pumpfoil.org"

    static var token: String? {
        get { UserDefaults.standard.string(forKey: "authToken") }
        set { UserDefaults.standard.setValue(newValue, forKey: "authToken") }
    }

    private struct TokenResponse: Decodable { let access_token: String }

    static func login(email: String, password: String) async throws -> String {
        let r: TokenResponse = try await request(
            "/api/auth/login", method: "POST",
            body: ["email": email, "password": password], auth: false)
        return r.access_token
    }

    static func getProfile() async throws -> Profile {
        try await request("/api/auth/me", method: "GET", body: nil, auth: true)
    }

    static func sessions() async throws -> [SessionSummary] {
        try await request("/api/sessions", method: "GET", body: nil, auth: true)
    }

    static func session(_ id: Int) async throws -> SessionDetail {
        try await request("/api/sessions/\(id)", method: "GET", body: nil, auth: true)
    }

    struct MintResponse: Decodable { let device_token: String; let user_id: Int }

    // Companion-Pairing: eingeloggte iPhone-App mintet ein Device-Token für die Uhr.
    static func mintDeviceToken(label: String = "Apple Watch") async throws -> String {
        let l = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? label
        let r: MintResponse = try await request("/api/devices/mint?label=\(l)", method: "POST", body: nil, auth: true)
        return r.device_token
    }

    static func communitySessions(limit: Int = 30, offset: Int = 0) async throws -> [SessionSummary] {
        try await request("/api/community/sessions?limit=\(limit)&offset=\(offset)", method: "GET", body: nil, auth: true)
    }

    static func history() async throws -> [HistoryPoint] {
        try await request("/api/sessions/history", method: "GET", body: nil, auth: true)
    }

    static func spotMap() async throws -> [SpotMapItem] {
        try await request("/api/community/spot-map", method: "GET", body: nil, auth: true)
    }

    static func chatRooms() async throws -> [ChatRoom] {
        try await request("/api/chat/rooms", method: "GET", body: nil, auth: true)
    }

    static func chatLatest(scope: String, limit: Int = 30) async throws -> [ChatMsg] {
        let s = scope.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? scope
        return try await request("/api/chat?scope=\(s)&limit=\(limit)", method: "GET", body: nil, auth: true)
    }

    static func chatPost(scope: String, text: String) async throws -> ChatMsg {
        let s = scope.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? scope
        return try await request("/api/chat?scope=\(s)", method: "POST", body: ["text": text], auth: true)
    }

    static func foils() async throws -> [Foil] {
        try await request("/api/foils", method: "GET", body: nil, auth: true)
    }

    static func foilBrands() async throws -> [String] {
        try await request("/api/foils/brands", method: "GET", body: nil, auth: true)
    }

    // Settings sind freies Key/Value -> als Dictionary; der Aufrufer pickt weight_kg / my_foils.
    static func settings() async throws -> [String: Any] {
        guard let url = URL(string: baseURL + "/api/settings") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.timeoutInterval = 20
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, "") }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    // Absolute URL zu einem /media-Pfad (Avatare, Thumbnails).
    static func mediaURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        return URL(string: path.hasPrefix("http") ? path : baseURL + path)
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    private static func request<T: Decodable>(
        _ path: String, method: String, body: [String: Any]?, auth: Bool
    ) async throws -> T {
        guard let url = URL(string: baseURL + path) else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 20
        if auth, let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else {
            throw ApiError.http(code, String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode(T.self, from: data)
    }
}

enum ApiError: LocalizedError {
    case badURL
    case http(Int, String)
    var errorDescription: String? {
        switch self {
        case .badURL: return "Ungültige URL"
        case .http(let code, _):
            return code == 401 ? "E-Mail oder Passwort falsch" : "Serverfehler (\(code))"
        }
    }
}
