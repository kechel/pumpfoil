import Foundation

// REST-Client zur Pumpfoil-API (JWT Bearer). Spiegelt web/src/lib/api.ts.
enum Api {
    static let baseURL = "https://pumpfoil.org"

    static var token: String? {
        get { UserDefaults.standard.string(forKey: "authToken") }
        set { UserDefaults.standard.setValue(newValue, forKey: "authToken") }
    }

    // Wird bei abgelaufener/ungültiger Session (401 auf authentifizierten Request) aufgerufen
    // -> die UI schickt zum Login. Von SessionStore gesetzt.
    static var onUnauthorized: (() -> Void)?

    private struct TokenResponse: Decodable { let access_token: String }

    static func login(email: String, password: String) async throws -> String {
        let r: TokenResponse = try await request(
            "/api/auth/login", method: "POST",
            body: ["email": email, "password": password], auth: false)
        return r.access_token
    }

    // Aktuell gewählte UI-Sprache der App -> Profilsprache bei NEUEM Konto.
    private static var uiLang: String { UserDefaults.standard.string(forKey: "appLang") ?? "de" }

    static func register(email: String, password: String, name: String) async throws -> String {
        var body: [String: Any] = ["email": email, "password": password, "language": uiLang]
        if !name.isEmpty { body["display_name"] = name }
        let r: TokenResponse = try await request("/api/auth/register", method: "POST", body: body, auth: false)
        return r.access_token
    }

    static func nativeApple(idToken: String, name: String) async throws -> String {
        var body: [String: Any] = ["id_token": idToken, "language": uiLang]
        if !name.isEmpty { body["name"] = name }
        let r: TokenResponse = try await request("/api/auth/oauth/native/apple", method: "POST", body: body, auth: false)
        return r.access_token
    }

    static func submitFeedback(_ text: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/feedback", method: "POST", body: ["text": text, "url": "ios-app"], auth: true)
    }

    static func forgotPassword(_ email: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/auth/forgot-password", method: "POST", body: ["email": email], auth: false)
    }

    static func getProfile() async throws -> Profile {
        try await request("/api/auth/me", method: "GET", body: nil, auth: true)
    }

    static func updateDisplayName(_ name: String) async throws -> Profile {
        try await request("/api/auth/me", method: "PUT", body: ["display_name": name], auth: true)
    }

    // DSGVO: eigenes Konto + ALLE Daten unwiderruflich löschen (App-Store-Pflicht 5.1.1(v)).
    static func deleteAccount() async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/auth/me", method: "DELETE", body: nil, auth: true)
    }

    static func sessions(month: String? = nil, filter: String = "pump", accelOnly: Bool = false) async throws -> [SessionSummary] {
        var qs = "?filter=\(filter)"
        if let month, !month.isEmpty { qs += "&month=\(month)" }
        if accelOnly { qs += "&accel_only=true" }
        return try await request("/api/sessions\(qs)", method: "GET", body: nil, auth: true)
    }

    static func sessionMonths(filter: String = "pump") async throws -> [MonthCount] {
        try await request("/api/sessions/months?filter=\(filter)", method: "GET", body: nil, auth: true)
    }

    // Nachbar-Sessions (älter/neuer) für die Vor/Zurück-Navigation im Detail.
    struct Neighbors: Decodable { let older: Int?; let newer: Int? }
    static func sessionNeighbors(_ id: Int) async throws -> Neighbors {
        try await request("/api/sessions/\(id)/neighbors", method: "GET", body: nil, auth: true)
    }

    // Eigenes Passwort ändern (PUT-Alias; funktioniert auch für iOS).
    static func changePassword(current: String, newPw: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/auth/me/password", method: "PUT",
                                      body: ["current_password": current, "new_password": newPw], auth: true)
    }

    static func session(_ id: Int) async throws -> SessionDetail {
        try await request("/api/sessions/\(id)", method: "GET", body: nil, auth: true)
    }

    static func sessionPhotos(_ id: Int) async throws -> [SessionPhoto] {
        try await request("/api/sessions/\(id)/photos", method: "GET", body: nil, auth: true)
    }

    static func deleteSessionPhoto(_ sessionId: Int, photoId: Int) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(sessionId)/photos/\(photoId)") else { throw ApiError.badURL }
        var req = URLRequest(url: url); req.httpMethod = "DELETE"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
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

    // Garmin Reverse-Pairing: der auf der Uhr angezeigte Code wird hier eingelöst.
    struct ClaimResponse: Decodable { let ok: Bool }
    static func pairClaim(code: String) async throws {
        let _: ClaimResponse = try await request(
            "/api/devices/pair-claim", method: "POST",
            body: ["code": code.trimmingCharacters(in: .whitespaces).uppercased(), "label": "Garmin"], auth: true)
    }

    // Garmin Forward-Pairing: Code erzeugen -> in Garmin-Connect-App eintragen.
    struct PairingCodeResponse: Decodable { let code: String; let expires_at: String }
    static func generatePairingCode() async throws -> PairingCodeResponse {
        try await request("/api/devices/pairing-code", method: "POST", body: nil, auth: true)
    }

    static func communitySessions(limit: Int = 30, offset: Int = 0, accelOnly: Bool = true) async throws -> [CommunityItem] {
        let qs = "?limit=\(limit)&offset=\(offset)" + (accelOnly ? "" : "&accel_only=false")
        return try await request("/api/community/sessions\(qs)", method: "GET", body: nil, auth: true)
    }

    static func spotSessions(_ spot: String, accelOnly: Bool = true, limit: Int = 50) async throws -> [CommunityItem] {
        let s = spot.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? spot
        return try await request("/api/community/spot-sessions?spot=\(s)&accel_only=\(accelOnly)&limit=\(limit)", method: "GET", body: nil, auth: true)
    }

    static func stats(accelOnly: Bool = true) async throws -> OverallStats {
        try await request("/api/sessions/stats?accel_only=\(accelOnly)", method: "GET", body: nil, auth: true)
    }

    static func spots(accelOnly: Bool = true) async throws -> SpotsList {
        try await request("/api/community/spots?accel_only=\(accelOnly)", method: "GET", body: nil, auth: true)
    }

    static func communityRecords(accelOnly: Bool = true) async throws -> [String: PeriodRecords] {
        try await request("/api/community/records?accel_only=\(accelOnly)", method: "GET", body: nil, auth: true)
    }

    static func updateLanguage(_ lang: String) async throws -> Profile {
        try await request("/api/auth/me", method: "PUT", body: ["language": lang], auth: true)
    }

    static func updateFoilSensitivity(_ v: String) async throws -> Profile {
        try await request("/api/auth/me", method: "PUT", body: ["foil_sensitivity": v], auth: true)
    }

    // Ergebnis der Declared Age Range API ans Profil melden (sperrt Social für unter 13).
    static func setAgeRange(socialAllowed: Bool, ageBracket: String) async throws -> Profile {
        try await request("/api/auth/me/age-range", method: "PUT",
                          body: ["social_allowed": socialAllowed, "age_bracket": ageBracket], auth: true)
    }

    static func reanalysisProgress() async throws -> ReanalysisProgress {
        try await request("/api/auth/me/reanalysis", method: "GET", body: nil, auth: true)
    }

    static func leaders(period: String = "all", accelOnly: Bool = true) async throws -> Leaders {
        try await request("/api/community/leaders?period=\(period)&accel_only=\(accelOnly)", method: "GET", body: nil, auth: true)
    }

    static func latestPhotos(limit: Int = 8) async throws -> [MediaItem] {
        try await request("/api/community/latest-photos?limit=\(limit)", method: "GET", body: nil, auth: true)
    }

    static func topLiked(period: String = "all", limit: Int = 5) async throws -> [CommunityItem] {
        try await request("/api/community/top-liked?period=\(period)&limit=\(limit)", method: "GET", body: nil, auth: true)
    }

    static func spotRecords(_ spot: String, period: String = "all", accelOnly: Bool = true) async throws -> PeriodRecords {
        let s = spot.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? spot
        return try await request("/api/community/spot-records?spot=\(s)&period=\(period)&accel_only=\(accelOnly)", method: "GET", body: nil, auth: true)
    }

    static func spotWeather(_ spot: String) async throws -> SpotWeather {
        let s = spot.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? spot
        return try await request("/api/community/spot/weather?spot=\(s)", method: "GET", body: nil, auth: true)
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

    // foilId nil -> Standard-Foil (foil_id: null), sonst konkretes Foil.
    static func setSessionFoil(_ id: Int, foilId: Int?) async throws {
        guard let url = URL(string: baseURL + "/api/sessions/\(id)/meta") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let foilValue: Any = foilId.map { $0 as Any } ?? NSNull()   // nil -> JSON null (Standard-Foil)
        req.httpBody = try JSONSerialization.data(withJSONObject: ["foil_id": foilValue])
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

    static func mySpots() async throws -> [SpotCount] {
        try await request("/api/sessions/my-spots", method: "GET", body: nil, auth: true)
    }

    static func spotTracks(_ spot: String) async throws -> [SpotTrack] {
        let s = spot.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? spot
        return try await request("/api/sessions/spot-tracks?spot=\(s)", method: "GET", body: nil, auth: true)
    }

    // accelOnly=false wie die PWA — sonst fehlen GPS-only-Spots (z. B. Frankreich).
    static func spotMap(accelOnly: Bool = false) async throws -> [SpotMapItem] {
        try await request("/api/community/spot-map?accel_only=\(accelOnly)", method: "GET", body: nil, auth: true)
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

    // Neue Nachrichten seit `after` (Live-Polling).
    static func chatSince(scope: String, after: Int) async throws -> [ChatMsg] {
        let s = scope.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? scope
        return try await request("/api/chat?scope=\(s)&after=\(after)", method: "GET", body: nil, auth: true)
    }

    struct ChatState: Decodable { let push: Bool; let left: Bool?; let last_read_id: Int? }
    static func chatRoomState(scope: String) async throws -> ChatState {
        let s = scope.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? scope
        return try await request("/api/chat/state?scope=\(s)", method: "GET", body: nil, auth: true)
    }
    @discardableResult static func chatSubscribe(scope: String, on: Bool) async throws -> Bool {
        struct R: Decodable { let push: Bool? }
        let r: R = try await request("/api/chat/subscribe", method: "POST", body: ["scope": scope, "on": on], auth: true)
        return r.push ?? on
    }
    static func chatLeave(scope: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let s = scope.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? scope
        let _: Ok = try await request("/api/chat/leave?scope=\(s)", method: "POST", body: nil, auth: true)
    }
    static func chatReport(_ id: Int) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/chat/\(id)/report", method: "POST", body: nil, auth: true)
    }
    static func chatHide(_ id: Int, hidden: Bool) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/chat/\(id)/hide", method: "POST", body: ["hidden": hidden], auth: true)
    }
    static func chatSetReadonly(userId: Int, readonly: Bool) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/chat/moderation/readonly", method: "POST", body: ["user_id": userId, "readonly": readonly], auth: true)
    }
    static func chatMarkRead(scope: String, upTo: Int) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/chat/read", method: "POST", body: ["scope": scope, "up_to": upTo], auth: true)
    }

    // --- 1:1-Direktnachrichten + Blockieren ---
    static func chatDmOpen(userId: Int) async throws -> DmOpen {
        try await request("/api/chat/dm?user_id=\(userId)", method: "GET", body: nil, auth: true)
    }
    static func chatSearchUsers(_ q: String) async throws -> [DmUser] {
        let s = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        return try await request("/api/chat/users?q=\(s)", method: "GET", body: nil, auth: true)
    }
    static func chatAllSpots() async throws -> [SpotChat] {
        try await request("/api/chat/all-spots", method: "GET", body: nil, auth: true)
    }

    // Session-Übertragung an einen anderen Nutzer.
    static func transferInitiate(sessionId: Int, toUserId: Int) async throws -> Transfer {
        try await request("/api/transfers", method: "POST",
                          body: ["session_id": sessionId, "to_user_id": toUserId], auth: true)
    }
    static func transfersIncoming() async throws -> [Transfer] {
        try await request("/api/transfers/incoming", method: "GET", body: nil, auth: true)
    }
    static func transferForSession(_ sessionId: Int) async throws -> Transfer? {
        // Server liefert {} wenn keine → Decode schlägt fehl → nil.
        try? await request("/api/transfers/for-session/\(sessionId)", method: "GET", body: nil, auth: true)
    }
    static func transferAccept(_ id: Int) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/transfers/\(id)/accept", method: "POST", body: nil, auth: true)
    }
    static func transferDecline(_ id: Int) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/transfers/\(id)/decline", method: "POST", body: nil, auth: true)
    }
    static func transferCancel(_ id: Int) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/transfers/\(id)", method: "DELETE", body: nil, auth: true)
    }
    static func transferFriends() async throws -> [DmUser] {
        try await request("/api/transfers/friends", method: "GET", body: nil, auth: true)
    }
    static func chatBlock(userId: Int) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/chat/block", method: "POST", body: ["user_id": userId], auth: true)
    }
    static func chatUnblock(userId: Int) async throws {
        guard let url = URL(string: baseURL + "/api/chat/block/\(userId)") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
    }
    static func chatBlocks() async throws -> [DmUser] {
        try await request("/api/chat/blocks", method: "GET", body: nil, auth: true)
    }

    // Öffentlicher News-Banner (DB-gesteuert, kein Auth nötig).
    static func newsBanner() async throws -> NewsBanner {
        try await request("/api/app/news", method: "GET", body: nil, auth: false)
    }

    // Teilbare Session-Card (server-gerendertes PNG). Params spiegeln web/ShareDialog.
    static func shareCard(_ id: Int, color: String, stats: [String], track: Bool, title: String, shade: String, bg: String = "navy", highlight: Int = -1) async throws -> Data {
        guard var comps = URLComponents(string: baseURL + "/api/sessions/\(id)/share.png") else { throw ApiError.badURL }
        var q = [
            URLQueryItem(name: "color", value: color),
            URLQueryItem(name: "bg", value: bg),
            URLQueryItem(name: "track", value: track ? "1" : "0"),
            URLQueryItem(name: "shade", value: shade),
        ]
        if !stats.isEmpty { q.append(URLQueryItem(name: "stats", value: stats.joined(separator: ","))) }
        let tt = title.trimmingCharacters(in: .whitespaces)
        if !tt.isEmpty { q.append(URLQueryItem(name: "title", value: tt)) }
        if track && highlight >= 0 { q.append(URLQueryItem(name: "highlight", value: String(highlight))) }
        comps.queryItems = q
        guard let url = comps.url else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, "") }
        return data
    }

    struct IntegrationStatus: Decodable { let available: Bool; let linked: Bool; let last_sync_at: String? }
    private struct ConnectResp: Decodable { let authorize_url: String }

    // Fremdkonten (Polar/COROS/Suunto). provider = "polar"|"coros"|"suunto".
    static func integrationStatus(_ provider: String) async throws -> IntegrationStatus {
        try await request("/api/integrations/\(provider)/status", method: "GET", body: nil, auth: true)
    }
    static func integrationAuthorizeURL(_ provider: String) async throws -> String {
        let r: ConnectResp = try await request("/api/integrations/\(provider)/connect", method: "GET", body: nil, auth: true)
        return r.authorize_url
    }
    struct SyncResp: Decodable { let imported: Int?; let skipped: Int?; let message: String? }
    static func integrationSync(_ provider: String) async throws -> SyncResp {
        try await request("/api/integrations/\(provider)/sync", method: "POST", body: nil, auth: true)
    }
    static func integrationUnlink(_ provider: String) async throws {
        guard let url = URL(string: baseURL + "/api/integrations/\(provider)") else { throw ApiError.badURL }
        var req = URLRequest(url: url); req.httpMethod = "DELETE"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
    }

    struct MergeResp: Decodable { let id: Int }

    // Mehrere eigene Sessions zusammenführen -> neue Session-ID. Server prüft same-spot/on-foil.
    static func mergeSessions(_ ids: [Int]) async throws -> Int {
        let r: MergeResp = try await request("/api/sessions/merge", method: "POST", body: ["session_ids": ids], auth: true)
        return r.id
    }

    // Zusammenführung wieder auflösen.
    static func unmergeSession(_ id: Int) async throws {
        struct Ok: Decodable { let ids: [Int]? }
        let _: Ok = try await request("/api/sessions/\(id)/unmerge", method: "POST", body: nil, auth: true)
    }

    // Vorschläge für heutige zusammengehörige eigene Sessions.
    static func mergeSuggestions() async throws -> [MergeSuggestion] {
        try await request("/api/sessions/merge-suggestions", method: "GET", body: nil, auth: true)
    }

    struct CommunityStats: Decodable { let foilers: Int; let spots: Int; let sessions: Int; let pumps: Int }

    // Community-Kennzahlen (Willkommens-Banner + Stats-Leiste).
    static func communityStats() async throws -> CommunityStats {
        try await request("/api/community/stats", method: "GET", body: nil, auth: true)
    }

    struct AppLatest: Decodable { let latest: String; let min_supported: String; let store_url: String }

    // Neueste Store-Version (server-seitig manuell gepflegt) — fuer den In-App-Update-Hinweis.
    static func appLatest(platform: String = "ios") async throws -> AppLatest {
        try await request("/api/app/latest?platform=\(platform)", method: "GET", body: nil, auth: false)
    }

    // Eigene Chat-Nachricht bearbeiten (nur < 1 h).
    static func chatEdit(_ messageId: Int, text: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("/api/chat/\(messageId)", method: "PATCH", body: ["text": text], auth: true)
    }

    // Eigene Chat-Nachricht löschen (nur < 1 h).
    static func chatDelete(_ messageId: Int) async throws {
        guard let url = URL(string: baseURL + "/api/chat/\(messageId)") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? -1) else { throw ApiError.http(-1, "") }
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

    static func watchStats() async throws -> [WatchStat] {
        try await request("/api/community/watch-stats", method: "GET", body: nil, auth: true)
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

    // Gepairte Uhren/Geräte (mit record_mode je Uhr).
    static func myDevices() async throws -> [PairedDevice] {
        try await request("/api/devices/list", method: "GET", body: nil, auth: true)
    }
    struct RecordModeResp: Decodable { let record_mode: String? }
    static func setDeviceRecordMode(_ id: Int, mode: String) async throws {
        let _: RecordModeResp = try await request("/api/devices/\(id)/record-mode", method: "PUT", body: ["record_mode": mode], auth: true)
    }

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
        let http = resp as? HTTPURLResponse
        // Sliding-Refresh: bei knapper Restlaufzeit schickt der Server ein frisches Token mit.
        if let rt = http?.value(forHTTPHeaderField: "X-Refresh-Token"), !rt.isEmpty { token = rt }
        let code = http?.statusCode ?? -1
        guard (200..<300).contains(code) else {
            // 401 auf einen authentifizierten Request = Session abgelaufen/ungültig -> abmelden + Login.
            if code == 401 && auth {
                token = nil
                let cb = onUnauthorized
                Task { @MainActor in cb?() }
            }
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
