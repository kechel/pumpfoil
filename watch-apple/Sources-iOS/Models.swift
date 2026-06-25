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
    let analysis: Analysis?

    var startedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: started_at) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: started_at)
    }
}
