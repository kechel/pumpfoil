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
