import Foundation
import UIKit

// Team-Verwaltung nativ (App-Port, 04.11.2026): Aufrufe zu server/app/api/teams.py wie web/src/lib/api.ts
// (`teamSlug`, `teamAnlegen`, `teamEinstellen` … `teamLoeschen`, Events anlegen/aendern/loeschen, Bilder). Bisher
// blieb die Verwaltung im Browser (TeamsApi.swift: nur Lesen, Beitreten, Austreten). Die Regeln prueft der Server
// (Leitung: alles; Moderatoren: Mitglieder annehmen/entfernen, Einladungslinks ansehen, Events) — die App zeigt nur an.

/// Adress-Vorschlag bzw. -Pruefung (`GET /api/teams/slug`); `fehler` = Code fuer `team.err.<code>`.
struct TeamSlugAntwort: Decodable {
    let slug: String
    let frei: Bool
    let fehler: String?
}

struct TeamAngelegt: Decodable {
    let slug: String
    let id: Int
}

/// Eine Bestenliste in den Einstellungen (ohne Zeilen) — Server `TafelIn`. Events nutzen dieselbe Form ohne
/// `nur_teamspots` (`EventTafelIn`).
struct TeamTafelEntwurf: Identifiable, Equatable {
    var id = UUID()
    var kennzahl: String = "session_pumps"
    var sportart: String = "pumpfoil"
    var accel_only: Bool = false
    var nur_brett: Bool = false
    var foil_band: String = "all"
    var nur_teamspots: Bool = false

    init(kennzahl: String = "session_pumps") { self.kennzahl = kennzahl }

    init(_ tf: TeamTafel) {
        kennzahl = tf.kennzahl
        sportart = tf.sportart
        accel_only = tf.accel_only ?? false
        nur_brett = tf.nur_brett ?? false
        foil_band = tf.foil_band ?? "all"
        nur_teamspots = tf.nur_teamspots ?? false
    }

    func json(mitTeamspots: Bool) -> [String: Any] {
        var d: [String: Any] = ["kennzahl": kennzahl, "sportart": sportart, "accel_only": accel_only,
                                "nur_brett": nur_brett, "foil_band": foil_band]
        if mitTeamspots { d["nur_teamspots"] = nur_teamspots }
        return d
    }
}

/// Bestenlisten-Kennzahlen fuer die Auswahl, Reihenfolge wie web TEAM_KENNZAHLEN (Bestwerte, dann Summen).
let TEAM_KENNZAHLEN_BEST: [String] = ["session_pumps", "distance", "duration", "speed", "glide", "runs",
                                      "session_distance", "session_time"]
let TEAM_KENNZAHLEN_SUMME: [String] = ["sum_pumps", "sum_runs", "sum_sessions", "sum_distance", "sum_time", "sum_spots"]

extension Api {
    fileprivate static func vPfad(_ slug: String) -> String {
        "/api/teams/" + (slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug)
    }

    private static func vQuery(_ s: String) -> String {
        var erlaubt = CharacterSet.urlQueryAllowed
        erlaubt.remove(charactersIn: "&=+?#")
        return s.addingPercentEncoding(withAllowedCharacters: erlaubt) ?? s
    }

    /// JSON-Aufruf mit beliebigem Rumpf (auch Listen: Tafeln, Spots) — `request` nimmt nur Woerterbuecher.
    /// Fehler als `ApiError.http(code, body)`, damit `teamFehlerCode` den Code lesen kann.
    static func teamJson<T: Decodable>(_ pfad: String, method: String, json: Any?) async throws -> T {
        guard let url = URL(string: baseURL + pfad) else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 20
        req.setValue(clientId, forHTTPHeaderField: "X-Pumpfoil-Client")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: data, encoding: .utf8) ?? "") }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Bild hochladen (multipart, Feldname "file") wie `uploadAvatar`; Antwort als JSON.
    static func teamBildHoch<T: Decodable>(_ pfad: String, data: Data, filename: String, mime: String) async throws -> T {
        guard let url = URL(string: baseURL + pfad) else { throw ApiError.badURL }
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
        req.setValue(clientId, forHTTPHeaderField: "X-Pumpfoil-Client")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (respData, resp) = try await URLSession.shared.upload(for: req, from: body)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: respData, encoding: .utf8) ?? "") }
        return try JSONDecoder().decode(T.self, from: respData)
    }

    private struct TeamOk: Decodable { let ok: Bool? }

    // MARK: Gruenden

    /// Vorschlag aus dem Namen (`name`) oder Pruefung einer selbst gewaehlten Adresse (`slug`).
    static func teamSlug(name: String? = nil, slug: String? = nil, teamId: Int? = nil) async throws -> TeamSlugAntwort {
        var q: [String] = []
        if let name, !name.isEmpty { q.append("name=" + vQuery(name)) }
        if let slug, !slug.isEmpty { q.append("slug=" + vQuery(slug)) }
        if let teamId { q.append("team_id=\(teamId)") }
        return try await teamJson("/api/teams/slug?" + q.joined(separator: "&"), method: "GET", json: nil)
    }

    static func teamAnlegen(name: String, slug: String?) async throws -> TeamAngelegt {
        let s: Any = (slug?.isEmpty == false) ? slug! as Any : NSNull() as Any
        return try await teamJson("/api/teams", method: "POST", json: ["name": name, "slug": s])
    }

    // MARK: Einstellungen

    /// Teil-Aenderung (`PUT /api/teams/{slug}`): nur die Felder im Woerterbuch.
    static func teamEinstellen(_ slug: String, _ felder: [String: Any]) async throws -> TeamInfo {
        try await teamJson(vPfad(slug), method: "PUT", json: felder)
    }

    struct TeamLogoAntwort: Decodable { let logo_url: String }
    struct TeamBannerAntwort: Decodable { let banner_url: String?; let banner_fokus: String? }
    struct TeamFreigabeAntwort: Decodable { let freigabe: String }

    static func teamLogo(_ slug: String, bild: TeamUploadBild) async throws -> TeamLogoAntwort {
        try await teamBildHoch(vPfad(slug) + "/logo", data: bild.data, filename: bild.dateiname, mime: bild.mime)
    }

    static func teamBanner(_ slug: String, bild: TeamUploadBild) async throws -> TeamBannerAntwort {
        try await teamBildHoch(vPfad(slug) + "/banner", data: bild.data, filename: bild.dateiname, mime: bild.mime)
    }

    static func teamBannerEntfernen(_ slug: String) async throws {
        let _: TeamBannerAntwort = try await teamJson(vPfad(slug) + "/banner", method: "DELETE", json: nil)
    }

    static func teamFreigabe(_ slug: String) async throws -> TeamFreigabeAntwort {
        try await teamJson(vPfad(slug) + "/freigabe", method: "POST", json: nil)
    }

    static func teamTafelnSetzen(_ slug: String, _ tafeln: [TeamTafelEntwurf]) async throws {
        struct A: Decodable { let tafeln: [TeamTafel]? }
        let _: A = try await teamJson(vPfad(slug) + "/tafeln", method: "PUT", json: tafeln.map { $0.json(mitTeamspots: true) })
    }

    static func teamSpotsSetzen(_ slug: String, _ ids: [Int]) async throws {
        struct A: Decodable { let spots: [Int]? }
        let _: A = try await teamJson(vPfad(slug) + "/spots", method: "PUT", json: ids)
    }

    static func teamLoeschen(_ slug: String, name: String) async throws {
        let _: TeamOk = try await teamJson(vPfad(slug) + "/loeschen", method: "POST", json: ["name": name])
    }

    // MARK: Mitglieder und Einladungen

    /// Beide Einladungs-Tokens (`join`, `apply`).
    static func teamEinladungen(_ slug: String) async throws -> [String: String] {
        try await teamJson(vPfad(slug) + "/einladungen", method: "GET", json: nil)
    }

    static func teamEinladungNeu(_ slug: String, art: String) async throws -> [String: String] {
        try await teamJson(vPfad(slug) + "/einladungen/" + art + "/neu", method: "POST", json: nil)
    }

    static func teamAnnehmen(_ slug: String, uid: Int) async throws {
        let _: TeamOk = try await teamJson(vPfad(slug) + "/mitglieder/\(uid)/annehmen", method: "POST", json: nil)
    }

    /// Entfernen bzw. Anfrage ablehnen.
    static func teamEntfernen(_ slug: String, uid: Int) async throws {
        let _: TeamOk = try await teamJson(vPfad(slug) + "/mitglieder/\(uid)", method: "DELETE", json: nil)
    }

    static func teamRolle(_ slug: String, uid: Int, rolle: String) async throws {
        let _: TeamOk = try await teamJson(vPfad(slug) + "/mitglieder/\(uid)/rolle", method: "PUT", json: ["rolle": rolle])
    }

    // MARK: Events

    static func teamEventAnlegen(_ slug: String, _ body: [String: Any]) async throws -> TeamEvent {
        try await teamJson(vPfad(slug) + "/events", method: "POST", json: body)
    }

    static func teamEventAendern(_ slug: String, id: Int, _ body: [String: Any]) async throws -> TeamEvent {
        try await teamJson(vPfad(slug) + "/events/\(id)", method: "PUT", json: body)
    }

    static func teamEventLoeschen(_ slug: String, id: Int) async throws {
        let _: TeamOk = try await teamJson(vPfad(slug) + "/events/\(id)", method: "DELETE", json: nil)
    }

    static func teamEventBanner(_ slug: String, id: Int, bild: TeamUploadBild) async throws -> TeamBannerAntwort {
        try await teamBildHoch(vPfad(slug) + "/events/\(id)/banner", data: bild.data, filename: bild.dateiname, mime: bild.mime)
    }

    static func teamEventBannerFokus(_ slug: String, id: Int, fokus: String) async throws -> TeamBannerAntwort {
        try await teamJson(vPfad(slug) + "/events/\(id)/banner", method: "PUT", json: ["fokus": fokus])
    }

    static func teamEventBannerEntfernen(_ slug: String, id: Int) async throws {
        let _: TeamBannerAntwort = try await teamJson(vPfad(slug) + "/events/\(id)/banner", method: "DELETE", json: nil)
    }

    // MARK: Auswahllisten (Sportarten, Foil-Baender, Spots) wie web TeamEinstellungen

    /// Foil-Baender einer Sportart (web `api.foilBands(true, "pumpfoil")`).
    static func teamFoilBands(sport: String = "pumpfoil") async throws -> [FoilBand] {
        try await request("/api/community/foil-bands?accel_only=true&sport=" + vQuery(sport), method: "GET", body: nil, auth: true)
    }
}

/// Ein Spot zur Auswahl (Teamspots, Event-Spots).
struct TeamSpotWahl: Identifiable, Hashable {
    let id: Int
    let name: String
}

/// Auswahllisten fuer Bestenlisten und Spots, einmal geladen (Einstellungen und Event-Editor).
struct TeamAuswahl {
    var sports: [String] = ["pumpfoil"]
    var bands: [FoilBand] = []
    var spots: [TeamSpotWahl] = []

    static func laden(_ lang: String) async -> TeamAuswahl {
        var a = TeamAuswahl()
        async let s: [CommunitySport]? = try? Api.communitySports()
        async let b: [FoilBand]? = try? Api.teamFoilBands()
        async let m: [SpotMapItem]? = try? Api.spotMap(accelOnly: false, sport: "all")
        var ids: [String] = ["pumpfoil"]
        for x in (await s) ?? [] where !ids.contains(x.sport) { ids.append(x.sport) }
        a.sports = sortiereSports(ids, lang: lang)
        a.bands = ((await b) ?? []).filter { $0.art != "eigenes" }
        var gesehen = Set<Int>()
        var sp: [TeamSpotWahl] = []
        for x in (await m) ?? [] {
            guard let id = x.spot_id, gesehen.insert(id).inserted else { continue }
            sp.append(TeamSpotWahl(id: id, name: x.spot))
        }
        a.spots = sp.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        return a
    }

    func spotName(_ id: Int) -> String { spots.first { $0.id == id }?.name ?? "#\(id)" }
}

/// Beschriftung eines Foil-Bandes (web Home.tsx `bandLabel`).
func teamBandLabel(_ b: FoilBand, _ lang: String) -> String {
    func z(_ v: Double?) -> String {
        guard let v else { return "" }
        return v == v.rounded() ? String(Int(v)) : String(v)
    }
    switch b.art {
    case "alle": return Loc.t("cr.foilAll", lang)
    case "eigenes": return Loc.t("cr.foilMine", lang)
    case "ar":
        return b.von != nil
            ? Loc.t("cr.foilHighAspect", lang).replacingOccurrences(of: "{n}", with: z(b.von))
            : Loc.t("cr.foilThick", lang).replacingOccurrences(of: "{n}", with: z(b.bis))
    default:
        if b.von != nil && b.bis != nil { return "\(z(b.von))–\(z(b.bis)) cm²" }
        if b.bis != nil { return Loc.t("cr.foilUnder", lang).replacingOccurrences(of: "{n}", with: z(b.bis)) }
        return "\(z(b.von))+ cm²"
    }
}

/// Ein Bild fuer den Upload: Logo als PNG (Durchsichtigkeit bleibt, der Server speichert mit `transparenz`), Team- und
/// Eventbild als JPEG. Immer neu kodiert — aus der Fotomediathek kommt sonst oft HEIC, das der Server nicht liest.
struct TeamUploadBild {
    let data: Data
    let dateiname: String
    let mime: String

    static func aus(_ roh: Data, logo: Bool) -> TeamUploadBild? {
        guard let img = UIImage(data: roh) else { return nil }
        let maxKante: CGFloat = logo ? 1024 : 2400
        let pxW: CGFloat = img.size.width * img.scale
        let pxH: CGFloat = img.size.height * img.scale
        let k: CGFloat = min(1, maxKante / max(pxW, pxH, 1))
        let ziel = CGSize(width: (pxW * k).rounded(), height: (pxH * k).rounded())
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = !logo
        let neu = UIGraphicsImageRenderer(size: ziel, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: ziel)) }
        if logo, let png = neu.pngData() { return TeamUploadBild(data: png, dateiname: "logo.png", mime: "image/png") }
        guard let jpg = neu.jpegData(compressionQuality: 0.88) else { return nil }
        return TeamUploadBild(data: jpg, dateiname: "bild.jpg", mime: "image/jpeg")
    }
}
