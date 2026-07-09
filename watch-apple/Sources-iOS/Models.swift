import Foundation

// Spiegelt die API-Schemas (snake_case wie vom Server geliefert).
struct Profile: Codable {
    let email: String
    let display_name: String?
    let avatar_url: String?
    let is_admin: Bool?
    let language: String?
    let foil_sensitivity: String?
}

// Fortschritt der Reanalyse nach Empfindlichkeits-Wechsel (GET /api/auth/me/reanalysis).
struct ReanalysisProgress: Codable {
    let running: Bool
    let done: Int
    let total: Int
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
    let photo_count: Int?
    let liked: Bool?
    let track_preview: String?
    let foil: FoilBrief?       // aufgelöstes Foil (Marke/Modell/Größe) für die Anzeige
    let analysis: Analysis?    // slim: Kennzahlen für die Listenkarte
    let device_label: String?  // Aufzeichnungs-Uhr (Kurzform) für das Badge

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
    let max_speed_mps: Double?
    let track_preview: String?
    let thumb_url: String?
    let like_count: Int?
    let liked: Bool?
    let device_label: String?  // Aufzeichnungs-Uhr (Kurzform) für das Badge
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

// Community-Rekorde (GET /api/community/records): {period -> {distance/duration/speed/glide/runs}}.
struct CommunityRecordEntry: Codable {
    let session_id: Int?
    let value: Double?
    let name: String?
    let avatar_url: String?
    let spot: String?
    let started_at: String?
    let run_idx: Int?
}

struct PeriodRecords: Codable {
    let distance: CommunityRecordEntry?
    let duration: CommunityRecordEntry?
    let speed: CommunityRecordEntry?
    let glide: CommunityRecordEntry?
    let runs: CommunityRecordEntry?
}

struct SpotMapItem: Codable, Identifiable {
    let spot: String
    let spot_id: Int?   // additiv (neue Clients); Nav bleibt namensbasiert
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
    let distance: Double?        // bester Lauf: Distanz (m)
    let duration: Double?        // bester Lauf: Dauer (s)
    let glide: Double?           // längster Gleit (s)
    let avg_speed: Double?       // Ø-Speed der Session (m/s)
    let avg_pump_hz: Double?
    var id: Int { session_id }
}

// Spot-Wetter (GET /api/community/spot/weather) — aktuell + Tagesvorschau (Wind in Knoten).
struct MonthCount: Codable, Identifiable { let month: String; let count: Int; var id: String { month } }

struct SpotWeather: Codable { let weather: WeatherBlock? }
struct WeatherBlock: Codable {
    let current: WxCurrent?
    let days: [WxDay]?
}
struct WxCurrent: Codable { let temp: Double?; let wind: Double?; let dir: Double?; let code: Int? }
struct WxDay: Codable {
    let date: String?; let code: Int?; let tmax: Double?; let tmin: Double?
    let wind_max: Double?; let dir: Double?
}

// Bestenliste (GET /api/community/leaders) — je Metrik eine Rangliste.
struct LeaderEntry: Codable, Identifiable {
    let name: String?; let avatar_url: String?
    let sessions: Int?; let runs: Int?; let spots: Int?; let pumps: Int?
    var id: String { (name ?? "") + (avatar_url ?? "") }
}
struct Leaders: Codable {
    let sessions: [LeaderEntry]?; let runs: [LeaderEntry]?; let spots: [LeaderEntry]?; let pumps: [LeaderEntry]?
}

// Neueste Medien (GET /api/community/latest-photos) — Fotos + YouTube je Session.
struct MediaItem: Codable, Identifiable {
    let kind: String?
    let url: String?
    let youtube_url: String?
    let session_id: Int
    let name: String?
    let avatar_url: String?
    let spot: String?
    let caption: String?
    var id: String { (kind ?? "") + "\(session_id)" + (url ?? youtube_url ?? "") }
}

struct ChatRoom: Codable, Identifiable {
    let scope: String
    let label: String
    let unread: Int
    let last_text: String
    var kind: String? = nil          // spot | dm | session
    var push: Bool? = nil            // abonniert (Push) → Glocke
    var other: DmOther? = nil        // nur bei dm
    var id: String { scope }
}

struct DmOther: Codable {
    let id: Int
    let name: String?
    let avatar_url: String?
}

struct DmUser: Codable, Identifiable {
    let id: Int
    let display_name: String?
    let avatar_url: String?
}

struct TransferSessionBrief: Codable {
    let id: Int
    let place: String?
    let water: String?
    let started_at: String?
    let sport: String
    let foiling_time_s: Double?
}

// Session-Übertragung an einen anderen Nutzer (role: sender|recipient in for-session).
struct Transfer: Codable, Identifiable {
    let id: Int
    let status: String
    let created_at: String?
    let other: DmUser?
    let session: TransferSessionBrief?
    var role: String? = nil
}

// Ein Spot-Chat aus /api/chat/all-spots (zum Stöbern; jeder darf reinschauen).
struct SpotChat: Codable, Identifiable {
    let scope: String
    let label: String
    let messages: Int
    var id: String { scope }
}

struct DmOpen: Codable, Identifiable {
    let scope: String
    let other: DmOther
    let blocked: Bool
    var id: String { scope }
}

struct NewsBanner: Codable {
    let version: Int
    let enabled: Bool
    let texts: [String: String]
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

struct SessionLabel: Codable, Identifiable {
    let id: Int
    let t_start_ms: Int
    let t_end_ms: Int
    let label: String   // pump | glide | not_foiling
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

// Uhren-Statistik (GET /api/community/watch-stats) — Community-Aggregat je Uhr-Modell.
struct WatchStat: Codable, Identifiable {
    let watch: String
    let sessions: Int
    let users: Int
    let foiling_km: Double?
    let avg_speed_kmh: Double?
    let best_distance_m: Double?
    let best_speed_kmh: Double?
    let avg_pump_hz: Double?
    var id: String { watch }
}

// GeoJSON-Feature des Tracks: LineString-Koordinaten [lon,lat] + 3-s-Speed je Punkt.
struct TrackGeo: Codable {
    struct Geometry: Codable { let coordinates: [[Double]] }
    struct Properties: Codable {
        let speeds_mps: [Double]?
        let speeds: [String: [Double]]?   // Glättungsfenster {"1","3","5"}
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
    let metrics: Metrics?
    let track_geojson: TrackGeo?
    let segments: [Segment]?
}

// Session-weite Kennzahlen (metrics_json) — Basis für den Stats-Block in der Liste.
// Numerische Felder bewusst Double? (toleriert Int/Float aus dem JSON, kein Decode-Bruch).
struct Metrics: Codable {
    let num_segments: Int?
    let avg_speed_mps: Double?
    let max_speed_mps: Double?
    let avg_pump_hz: Double?
    let avg_hr: Double?
    let max_hr: Double?
    let farthest_segment_m: Double?
    let longest_segment_s: Double?
}

// Kompakte Foil-Info (Server liefert ein dict mit u.a. brand/model/size) — alles optional,
// damit das Decoding der Liste nicht an fehlenden Foil-Maßen scheitert.
struct FoilBrief: Codable {
    let brand: String?
    let model: String?
    let size: String?
}

// Mini-Track-Vorschau (normalisierte Polylinien) wie web TrackPreview: {"w","h","lines":[[[x,y],...],...]}.
struct TrackPreviewData: Codable {
    let w: Double
    let h: Double
    let lines: [[[Double]]]
    static func parse(_ s: String) -> TrackPreviewData? {
        guard let d = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(TrackPreviewData.self, from: d)
    }
}

struct MergeSuggestion: Codable, Identifiable {
    let ids: [Int]
    let count: Int
    let place: String?
    let date: String
    var id: String { ids.map(String.init).joined(separator: "-") }
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
    let place_water: String?   // Gewässer als Zusatz-Label
    let spot_id: Int?          // additiv; Nav bleibt namensbasiert
    let foil: Foil?        // aufgelöstes Foil (Maße) für die Leistungsberechnung
    let analysis: Analysis?
    let merged_count: Int?   // >0 -> aus mehreren Sessions zusammengeführt
    let device_label: String?  // Aufzeichnungs-Uhr (Kurzform) für das Badge

    var startedDate: Date? { Self.parseDate(started_at) }
    var endedDate: Date? { ended_at.flatMap(Self.parseDate) }

    static func parseDate(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}
