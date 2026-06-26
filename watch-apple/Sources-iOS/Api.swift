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

    static func register(email: String, password: String, name: String) async throws -> String {
        var body: [String: Any] = ["email": email, "password": password]
        if !name.isEmpty { body["display_name"] = name }
        let r: TokenResponse = try await request("/api/auth/register", method: "POST", body: body, auth: false)
        return r.access_token
    }

    static func nativeApple(idToken: String, name: String) async throws -> String {
        var body: [String: Any] = ["id_token": idToken]
        if !name.isEmpty { body["name"] = name }
        let r: TokenResponse = try await request("/api/auth/oauth/native/apple", method: "POST", body: body, auth: false)
        return r.access_token
    }

    static func getProfile() async throws -> Profile {
        try await request("/api/auth/me", method: "GET", body: nil, auth: true)
    }

    static func updateDisplayName(_ name: String) async throws -> Profile {
        try await request("/api/auth/me", method: "PUT", body: ["display_name": name], auth: true)
    }

    static func sessions() async throws -> [SessionSummary] {
        try await request("/api/sessions", method: "GET", body: nil, auth: true)
    }

    static func session(_ id: Int) async throws -> SessionDetail {
        try await request("/api/sessions/\(id)", method: "GET", body: nil, auth: true)
    }

    static func sessionPhotos(_ id: Int) async throws -> [SessionPhoto] {
        try await request("/api/sessions/\(id)/photos", method: "GET", body: nil, auth: true)
    }

    // Foto-Upload (multipart/form-data, Feldname "file") an den Besitzer-Endpoint.
    static func uploadAvatar(data: Data, filename: String = "avatar.jpg", mime: String = "image/jpeg") async throws {
        guard let url = URL(string: baseURL + "/api/auth/me/avatar") else { throw ApiError.badURL }
        let boundary = "----pumpfoil\(Int(Date().timeIntervalSince1970 * 1000))"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 60
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (respData, resp) = try await URLSession.shared.upload(for: req, from: body)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: respData, encoding: .utf8) ?? "") }
    }

    static func uploadSessionPhoto(_ id: Int, data: Data, filename: String = "photo.jpg", mime: String = "image/jpeg") async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)/photos") else { throw ApiError.badURL }
        let boundary = "----pumpfoil\(Int(Date().timeIntervalSince1970 * 1000))"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 60
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (respData, resp) = try await URLSession.shared.upload(for: req, from: body)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: respData, encoding: .utf8) ?? "") }
    }

    struct MintResponse: Decodable { let device_token: String; let user_id: Int }

    // Companion-Pairing: eingeloggte iPhone-App mintet ein Device-Token für die Uhr.
    static func mintDeviceToken(label: String = "Apple Watch") async throws -> String {
        let l = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? label
        let r: MintResponse = try await request("/api/devices/mint?label=\(l)", method: "POST", body: nil, auth: true)
        return r.device_token
    }

    static func communitySessions(limit: Int = 30, offset: Int = 0) async throws -> [CommunityItem] {
        try await request("/api/community/sessions?limit=\(limit)&offset=\(offset)", method: "GET", body: nil, auth: true)
    }

    static func spotSessions(_ spot: String, limit: Int = 50) async throws -> [CommunityItem] {
        let s = spot.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? spot
        return try await request("/api/community/spot-sessions?spot=\(s)&limit=\(limit)", method: "GET", body: nil, auth: true)
    }

    static func stats() async throws -> OverallStats {
        try await request("/api/sessions/stats?accel_only=true", method: "GET", body: nil, auth: true)
    }

    static func spots() async throws -> SpotsList {
        try await request("/api/community/spots", method: "GET", body: nil, auth: true)
    }

    static func communityRecords() async throws -> [String: PeriodRecords] {
        try await request("/api/community/records", method: "GET", body: nil, auth: true)
    }

    static func deleteSession(_ id: Int) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, "") }
    }

    static func vote(_ id: Int, kind: String) async throws {
        guard let url = URL(string: baseURL + "/api/community/sessions/\(id)/vote?kind=\(kind)") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
    }

    static func labels(_ id: Int) async throws -> [SessionLabel] {
        try await request("/api/sessions/\(id)/labels", method: "GET", body: nil, auth: true)
    }

    static func addLabel(_ id: Int, startMs: Int, endMs: Int, label: String) async throws {
        let _: SessionLabel = try await request("/api/sessions/\(id)/labels", method: "POST",
            body: ["t_start_ms": startMs, "t_end_ms": endMs, "label": label], auth: true)
    }

    static func deleteLabel(_ id: Int, labelId: Int) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)/labels/\(labelId)") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
    }

    static func setTrim(_ id: Int, startMs: Int?, endMs: Int?) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)/trim") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["trim_start_ms": startMs ?? NSNull(), "trim_end_ms": endMs ?? NSNull()]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
    }

    static func setSessionFoil(_ id: Int, foilId: Int) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)/meta") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["foil_id": foilId])
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
    }

    static func setCaption(_ id: Int, caption: String) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)/meta") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["caption": caption])
        let (_, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, "") }
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

    static func foilStats() async throws -> [FoilStat] {
        try await request("/api/community/foil-stats", method: "GET", body: nil, auth: true)
    }

    struct LikeState: Decodable { let like_count: Int; let liked: Bool }

    static func toggleLike(_ id: Int) async throws -> LikeState {
        try await request("/api/community/sessions/\(id)/like", method: "POST", body: nil, auth: true)
    }

    // Teil-Update der Settings (my_foils, foil_id) -> PUT, Antwort ignoriert.
    static func saveSettings(_ patch: [String: Any]) async throws {
        guard let url = URL(string: baseURL + "/api/settings") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.timeoutInterval = 20
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: patch)
        let (_, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, "") }
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
