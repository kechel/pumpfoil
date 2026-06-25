import Foundation

// Spiegelt die API-Schemas (snake_case wie vom Server geliefert).
struct Profile: Codable {
    let email: String
    let display_name: String?
    let avatar_url: String?
    let is_admin: Bool?
    let language: String?
}

struct SessionSummary: Codable, Identifiable {
    let id: Int
    let sport: String
    let started_at: String
    let ended_at: String?
    let status: String
    let place_name: String?
    let caption: String?
    let owner_name: String?
    let owner_avatar_url: String?
    let thumb_url: String?
    let like_count: Int?
    let foil_id: Int?

    // ISO-8601-Startzeit als Date (für native Formatierung).
    var startedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: started_at) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: started_at)
    }
}
