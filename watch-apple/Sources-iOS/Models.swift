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

// Community-/Spot-Feed liefert eine andere Shape als /api/sessions: session_id, name,
// spot, avatar_url, foiling_km, runs … (siehe server community._brief/_attach_social).
struct CommunityItem: Codable, Identifiable {
    let session_id: Int
    let started_at: String
    let name: String?
    let avatar_url: String?
    let spot: String?
    let caption: String?
    let foiling_km: Double?
    let runs: Int?
    let like_count: Int?
    let liked: Bool?
    var id: Int { session_id }

    var startedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: started_at) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: started_at)
    }
}

// Gesamt-Statistik + persönliche Rekorde (GET /api/sessions/stats).
struct RecordEntry: Codable {
    let session_id: Int?
    let value: Double?
    let started_at: String?
    let run_idx: Int?
}

struct OverallRecords: Codable {
    let distance: RecordEntry?
    let duration: RecordEntry?
    let speed: RecordEntry?
    let runs: RecordEntry?
    let glide: RecordEntry?
}

struct OverallStats: Codable {
    let count: Int?
    let foiling_km: Double?
    let foiling_min: Double?
    let pumps: Int?
    let runs_total: Int?
    let records: OverallRecords?
}

struct SpotsList: Codable { let mine: [String]?; let all: [String]? }

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
    struct Properties: Codable {
        let speeds_mps: [Double]?
        let hr: [Int?]?
        let pump_hz: [Double?]?
    }
    let geometry: Geometry
    let properties: Properties?
}

// Foiling-Lauf: Index-Bereich in track_geojson.coordinates + Lauf-Kennzahlen.
struct Segment: Codable {
    let i_start: Int
    let i_end: Int
    let distance_m: Double?
    let duration_s: Double?
    let avg_speed_mps: Double?
    let max_speed_mps: Double?
    let pumps: Int?
    let pump_idx: [Int]?
    let avg_pump_hz: Double?
    let longest_glide_s: Double?
}

struct Analysis: Codable {
    let total_distance_m: Double?
    let foiling_distance_m: Double?
    let foiling_time_s: Double?
    let max_speed_mps: Double?
    let pump_count: Int?
    let avg_cadence_hz: Double?
    let track_geojson: TrackGeo?
    let segments: [Segment]?
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
    let youtube_url: String?
    let foil: Foil?        // aufgelöstes Foil (Maße) für die Leistungsberechnung
    let analysis: Analysis?

    var startedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: started_at) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: started_at)
    }
}
