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

struct SpotMapItem: Codable, Identifiable {
    let spot: String
    let lat: Double
    let lon: Double
    let sessions: Int
    var id: String { spot }
}

struct HistoryPoint: Codable, Identifiable {
    let session_id: Int
    let started_at: String
    let foiling_km: Double
    let runs: Int
    let pumps: Int
    let speed: Double            // beste Lauf-Geschwindigkeit (m/s)
    let avg_pump_hz: Double?
    var id: Int { session_id }
}

struct ChatRoom: Codable, Identifiable {
    let scope: String
    let label: String
    let unread: Int
    let last_text: String
    var id: String { scope }
}

struct ChatMsg: Codable, Identifiable {
    let id: Int
    let user_id: Int
    let name: String?
    let avatar_url: String?
    let text: String
    let created_at: String?
    let mine: Bool
    let hidden: Bool
}

struct Foil: Codable, Identifiable {
    let id: Int
    let brand: String
    let model: String
    let size: String
    let span_cm: Double
    let area_cm2: Double
    let thickness_mm: Double
    let thickness_estimated: Bool?
    let aspect_ratio: Double?
}

struct SessionPhoto: Codable, Identifiable {
    let id: Int
    let url: String
}

struct FoilStat: Codable, Identifiable {
    let foil_id: Int
    let brand: String
    let model: String
    let size: String
    let aspect_ratio: Double?
    let sessions: Int
    let users: Int
    let avg_speed_kmh: Double?
    let meters_per_pump: Double?
    let best_distance_m: Double?
    let avg_pump_hz: Double?
    var id: Int { foil_id }
}

// GeoJSON-Feature des Tracks: LineString-Koordinaten [lon,lat] + 3-s-Speed je Punkt.
struct TrackGeo: Codable {
    struct Geometry: Codable { let coordinates: [[Double]] }
    struct Properties: Codable { let speeds_mps: [Double]? }
    let geometry: Geometry
    let properties: Properties?
}

struct Analysis: Codable {
    let total_distance_m: Double?
    let foiling_distance_m: Double?
    let foiling_time_s: Double?
    let max_speed_mps: Double?
    let pump_count: Int?
    let avg_cadence_hz: Double?
    let track_geojson: TrackGeo?
}

struct SessionDetail: Codable, Identifiable {
    let id: Int
    let sport: String
    let started_at: String
    let ended_at: String?
    let status: String
    let place_name: String?
    let caption: String?
    let owner_name: String?
    let like_count: Int?
    let liked: Bool?
    let owned: Bool?
    let analysis: Analysis?

    var startedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: started_at) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: started_at)
    }
}
