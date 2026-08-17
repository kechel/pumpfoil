import Foundation

// Spiegelt die API-Schemas (snake_case wie vom Server geliefert).
struct Profile: Codable {
    let email: String
    let display_name: String?
    let avatar_url: String?
    let is_admin: Bool?
    let language: String?
    let foil_sensitivity: String?
    let pump_unit: String?      // hz|ppm — Anzeige-Einheit der Pump-Kadenz (nur Darstellung, PumpUnit.swift)
    let social_allowed: Bool?   // false = unter 13, Social-Features (UGC/Feed/Chat) gesperrt
    let beta: Bool?             // Beta-Konto (BETA_USER_IDS) -> experimentelle Features sichtbar
    // Offene Sportart-Zuordnungen (Server: auth.py:_needs_classification) — Hinweis auf der
    // Startseite; bei genau einer Session verlinkt die ID direkt dorthin.
    let needs_classification: Int?
    let needs_classification_id: Int?
}

// Fortschritt der Reanalyse nach Empfindlichkeits-Wechsel (GET /api/auth/me/reanalysis).
struct ReanalysisProgress: Codable {
    let running: Bool
    let done: Int
    let total: Int
}

// Gepairte Uhr/Gerät (GET /api/devices/list). record_mode je Uhr getrennt.
struct PairedDevice: Codable, Identifiable {
    let id: Int
    let label: String?
    let last_seen_at: String?
    let revoked_at: String?
    let app_version: String?
    let platform: String?
    let model: String?
    let model_id: String?
    let update_available: Bool?
    let latest_version: String?
    let record_mode: String?   // full | lite | gps
    // GNSS-Stufe je Uhr (best|l1|two|gps) — NUR Garmin, ab Uhr 1.0.77. nil = keine eigene
    // Wahl, die Uhr faehrt die Voreinstellung "best" (alle Systeme, bestes Band).
    let gnss_mode: String?
    let low_accel: Bool?       // FR55 & Co. → bei "full" autom. "lite"
}

// Eigene Session im Zwischenzustand (recording/live) — Live-Upload-Karte (Home + Sessions).
// upload_total ist nil, bis die Clients expected_chunks senden -> UI zeigt dann unbestimmt.
struct InProgressSession: Decodable, Identifiable {
    let id: Int
    let session_uuid: String
    let started_at: String
    let tz: String?
    let status: String
    let device_label: String?
    let upload_received: Int
    let upload_total: Int?
    let gps_received: Int
    let accel_received: Int
    let has_gps: Bool
    let last_received_at: String?
}

struct SessionSummary: Codable, Identifiable {
    let id: Int
    let sport: String
    let started_at: String
    let ended_at: String?
    let status: String
    let data_version: Int?   // „zuletzt geändert" (epoch) — Cache-Schlüssel fürs Detail
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
    let youtube_url: String?   // verlinktes Video → Vorschau-Thumb
    let transfer_to: String?   // offene Übertragung → Badge
    // Sportart-Klassifikation durch Menschen (docs/sport-classification.md) — NICHT `sport`,
    // das ist der Aktivitätstyp aus der Aufnahmedatei.
    let sport_class: String?
    let data_quality: String?
    let needs_classification: Bool?
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
    // Restliches Setup (Stab/Mastlänge/Board) — der Server löst es für die Liste im Batch auf
    // (sessions.py). Je Teil optional; fehlt eines, zeigt die Karte den Chip gar nicht.
    let setup: SessionSetup?

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
    let ended_at: String?
    let name: String?
    let avatar_url: String?
    let spot: String?
    let caption: String?
    let foiling_km: Double?
    let runs: Int?
    let max_speed_mps: Double?
    let track_preview: String?
    let thumb_url: String?
    let youtube_url: String?   // verlinktes Video → Vorschau-Thumb
    let like_count: Int?
    let liked: Bool?
    let device_label: String?  // Aufzeichnungs-Uhr (Kurzform) für das Badge
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
    // Menschliche Sportart-Klassifikation (docs/sport-classification.md): null/"pumpfoil" =
    // Pumpfoilen, sonst kennzeichnet die Karte es — die allgemeine Liste zeigt alle Sportarten.
    let sport_class: String?
    // Restliches Setup (Stab/Mastlänge/Board), vom Server im Batch aufgelöst (community.py).
    let setup: SessionSetup?
    // Aufgelöstes Foil (Marke/Modell/Größe) — der Brief liefert es seit je, die App zeigte es in
    // den Community-Zeilen bisher nicht (die PWA-Karte tut es).
    let foil: FoilBrief?
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
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
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
    // Sportart, auf die sich diese Antwort bezieht, plus die Auswahlliste (haeufigste zuerst).
    // Der Server liefert beides in EINEM Aufruf, damit die Startseite nicht zweimal fragen muss;
    // Voreinstellung ist die Sportart mit den meisten Sessions (Jan, 17.08.).
    let sport: String?
    let sports: [SportCount]?
}

// Eine Sportart des Nutzers mit Session-Zahl (Auswahlfeld der eigenen Rekorde).
struct SportCount: Codable, Identifiable {
    let sport: String
    let sessions: Int
    var id: String { sport }
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
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
    // Mini-Track-Vorschau der Rekord-Session (dieselbe Form wie in den Session-Karten).
    // Fehlt bei Sessions ohne Vorschau in der Analyse -> dann wird nichts gezeichnet.
    let track_preview: String?
}

struct PeriodRecords: Codable {
    let distance: CommunityRecordEntry?
    let duration: CommunityRecordEntry?
    let speed: CommunityRecordEntry?
    let glide: CommunityRecordEntry?
    let runs: CommunityRecordEntry?
    // Fun-Rekorde (Session-bezogen), additiv seit 2026-07-18.
    let session_distance: CommunityRecordEntry?
    let session_time: CommunityRecordEntry?
    let session_pumps: CommunityRecordEntry?
    let max_hr: CommunityRecordEntry?
    let early_bird: CommunityRecordEntry?   // Wert = s seit Mitternacht (Spot-Ortszeit)
    let night_owl: CommunityRecordEntry?    // >24h möglich -> mod 24h anzeigen
    // EINZIGER Rekord, der einem NUTZER gehoert statt einer Session: Summe der Carves > 180°
    // im Zeitraum. `session_id` ist deshalb nil — die Kachel darf nicht verlinken und zeigt
    // weder Datum noch Spot (server/app/api/community.py:_carve_record).
    let carves180: CommunityRecordEntry?
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

// Verlauf: „Entwicklung am Spot" — Spots des Nutzers + Bulk-Tracks je Spot.
struct SpotCount: Codable, Identifiable { let spot: String; let count: Int; var id: String { spot } }

struct SpotTrack: Codable, Identifiable {
    let session_id: Int
    let started_at: String?
    let foiling_km: Double
    let track: [[Double?]]        // [[lat, lon, speed_mps?]]
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
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
    var id: String {
        // Schrittweise und explizit typisiert: die Kombination aus ??-Kette, "+"-Verkettung und
        // Interpolation in EINEM Ausdruck ist der Fall, an dem der Swift-Solver exponentiell wird.
        let k: String = kind ?? ""
        let sid: String = String(session_id)
        let u: String = url ?? youtube_url ?? ""
        return k + sid + u
    }
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
    // Daumen-hoch je Nachricht (Server: chat.py:_msg_out + POST /api/chat/{id}/like).
    let like_count: Int?
    let liked: Bool?
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
    // Fläche/Spannweite sind ABGELEITET, nicht vom Hersteller abgeschrieben (Katalog-Kennzeichen).
    // Wiegt schwerer als die geschätzte Dicke: an beiden hängt die ganze Leistungsrechnung.
    let specs_estimated: Bool?
    let aspect_ratio: Double?
}

struct SessionPhoto: Codable, Identifiable {
    let id: Int
    let url: String
}

// Mehrere YouTube-Videos pro Session (wie Fotos); sessions.youtube_url = nur noch erstes Video.
struct SessionVideo: Codable, Identifiable {
    let id: Int
    let youtube_url: String
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

// Tages-Gruppe (ein Nutzer, ein Tag) aus /api/community/sessions-grouped. count==1 -> normale
// Karte; count>=2 -> Akkordeon. Stats = Tages-Summen (Speed = Maximum).
struct CommunityGroup: Codable, Identifiable {
    let user_id: Int
    let name: String?
    let avatar_url: String?
    let date: String
    let spot: String?
    let tz: String?
    let count: Int
    let foiling_km: Double
    let foiling_time_s: Double
    let pump_count: Int
    let max_speed_mps: Double?
    let track_previews: [String]?
    let sessions: [CommunityItem]
    var id: String { "\(user_id)-\(date)" }
}

// Home-Stats (persönlich): Start-Erfolgsquote + Carve-Anzahl je Zeitfenster.
struct StartSuccess: Codable {
    let threshold_m: Int
    let windows: [String: SSWindow]
}
struct SSWindow: Codable { let total: Int; let success: Int; let failed: Int; let rate: Int? }
struct CarveStats: Codable { let windows: [String: CarveWin] }
struct CarveWin: Codable { let s: Int; let m: Int; let l: Int }

// Carve-Erkennung (GET /api/sessions/:id/carves) — nur Anzeige, nicht in Rekorde/Stats.
struct CarveData: Codable {
    var g: [Double] = []                 // Kurvenlage-g je Track-Punkt (grobe Färbung)
    var carves: [Carve] = []
    var arcs: [[[Double]]] = []          // je Carve eine 25-Hz-Polylinie: Punkte [lat,lon,g]
    var counts: CarveCounts = CarveCounts()
}
struct Carve: Codable { var peak_g: Double = 0; var rot: Double = 0; var dir: String = ""; var bucket: String = "" }
struct CarveCounts: Codable { var s: Int = 0; var m: Int = 0; var l: Int = 0 }

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
    // Fremdkraft-Vorschläge der Erkennung v2 (Server: detect_v2._fremdkraft_laeufe) — abgetrennte
    // Läufe mit Boot/Auto/Motor-Verdacht. Optional, damit alte Antworten weiter dekodieren.
    let fremdkraft_laeufe: [PoweredRun]?
}

// Ein Fremdkraft-Vorschlag (analysis.metrics["fremdkraft_laeufe"]): langer Lauf ohne Puls-Antwort.
// Das Server-Feld `grund` (deutscher Admin-Klartext) wird bewusst NICHT dekodiert — der
// Anzeigetext wird lokalisiert aus den Messwerten gebaut (v2.sepWhy*), genau wie in der PWA.
struct PoweredRun: Codable {
    let t_start_ms: Int?
    let t_end_ms: Int?
    let dauer_s: Double?
    let kmh: Double?
    let puls_antwort_bpm: Double?
}

// Begründung der automatischen Sportart-Erkennung (Server: sessions._sport_auto, nur Besitzer und
// nur solange sport_source == "auto" gilt). `grund` ist deutscher Admin-Klartext und wird deshalb
// gar nicht erst dekodiert — der Warum-Text entsteht IN DER APP aus den Merkmalen (cls.autoWhy*).
struct SportAuto: Codable {
    let hinweis: String?           // auto.motor | auto.unklar
    let merkmale: SportAutoMerkmale?
}

struct SportAutoMerkmale: Codable {
    let laengster_lauf_s: Double?
    let tempo_median_kmh: Double?
    let spitze_kmh: Double?
    let puls_antwort_bpm: Double?
    let laeufe: Int?
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
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
    var id: String { ids.map(String.init).joined(separator: "-") }
}

struct SessionDetail: Codable, Identifiable {
    let id: Int
    let sport: String
    let setup: SessionSetup?   // Stab/Mast/Shim/Board (geerbt oder je Session gesetzt)
    // Sportart-Klassifikation; appeal_text gesetzt = Widerspruch läuft (docs/sport-classification.md).
    let sport_class: String?
    let data_quality: String?
    let needs_classification: Bool?
    let appeal_text: String?
    // Woher die Klassifikation stammt: default | auto | owner | admin. "auto" = die Maschine hat
    // geurteilt — dann erklärt sport_auto warum (nur Besitzer, nur solange das Urteil gilt).
    let sport_source: String?
    let sport_auto: SportAuto?
    // Anzahl menschlicher „nicht Pumpfoil"-Meldungen (nur Besitzer; Melder bleiben anonym).
    // 0 + sport_auto = reines Maschinen-Urteil -> Widerspruch unnötig (einfach Sportart wählen).
    let flag_count: Int?
    let started_at: String
    let ended_at: String?
    let status: String
    let data_version: Int?   // „zuletzt geändert" (epoch) — Cache-Schlüssel
    let place_name: String?
    let caption: String?
    let owner_name: String?
    let owner_avatar_url: String?
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
    let tz: String?            // IANA-Zeitzone des Spots — Uhrzeiten in Ortszeit anzeigen
    // Aussortierte Zeitfenster [[start_ms, end_ms], …] (ms ab Session-Start, gleiche Basis wie
    // trim_*). Optional, damit ältere Server-Antworten ohne das Feld weiter dekodieren.
    let excluded_ranges: [[Int]]?
    // Zurückgeholte Fremdkraft-Läufe („zählt doch"), Zeitfenster in Session-ms. Die noch offenen
    // VORSCHLÄGE stehen in analysis.metrics.fremdkraft_laeufe.
    let fremdkraft_keep: [[Int]]?
    // Aktueller Zuschnitt (ms ab Session-Start), null = kein Zuschnitt. Nötig, damit die Regler im
    // Zuschnitt-Blatt den gespeicherten Bereich zeigen statt immer 0…Dauer — sonst schlägt
    // "Bereich aussortieren" ungezogen die GANZE Session vor.
    let trim_start_ms: Int?
    let trim_end_ms: Int?

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

// Antwort von POST /api/chat/{id}/like.
struct ChatLikeResult: Codable {
    let liked: Bool
    let like_count: Int
}

// Restliches Setup einer Session (Server: sessions.py:_resolve_setup). Jedes Teil hat ein
// `*_is_default`: true = vom Nutzer-Standard geerbt, false = fuer DIESE Session gesetzt.
struct StabBrief: Codable, Identifiable {
    let id: Int
    let brand: String
    let model: String
    let size: String
    let is_default: Bool?
    let is_own: Bool?
    // Maße, sofern gepflegt (null = Katalog/Hersteller liefert keine). Es wird nichts damit
    // gerechnet — reine Anzeige unter dem Namen, wie web/src/pages/Setup.tsx.
    let span_cm: Double?
    let area_cm2: Double?
    let specs_estimated: Bool?
}

struct BoardBrief: Codable, Identifiable {
    let id: Int
    let name: String
    let volume_l: Double?
    let length_cm: Double?
    let is_default: Bool?
}

struct SessionSetup: Codable {
    let stab: StabBrief?
    let mast_len_cm: Int?
    let mast_is_default: Bool?
    let shim_deg: Double?
    let shim_is_default: Bool?
    let board: BoardBrief?
}

// Kopf eines eigenen Uhr-Layouts (layouts.py:_out) — gestaltet wird nur in der PWA.
struct WatchLayoutBrief: Codable, Identifiable {
    let id: Int
    let name: String
    let category: String?
    // Zeichendaten fuer WatchLayoutPreview (LayoutRender.swift). GESTALTET wird nur in der PWA
    // (Entscheidung Jan 2026-08-17), ANGEZEIGT auch hier — man soll einen Screen an seinem BILD
    // wiedererkennen, nicht am Namen: eine Community-Kopie behaelt den Originalnamen, mehrere
    // Kopien heissen dann gleich. Der Server liefert das alles schon (layouts.py:_out).
    // `elements` ist eine Liste gemischter Werte (Zahlen, bei Freitext ein String) -> AnyCodable.
    let elements: [[LayoutValue]]?
    let bg_color: Int?
    let shape: String?
    // Auflösung, FUER DIE das Layout gebaut wurde — Seitenverhaeltnis der Vorschau.
    let authored_w: Int?
    let authored_h: Int?
    // Nur in der Community-Galerie gefuellt (GET /api/layouts/community): wer es gebaut hat, wie oft
    // es kopiert wurde und von wie vielen Nutzern es WIRKLICH auf der Uhr liegt. `used_by` ist die
    // ehrlichere Zahl — eine bloss gespeicherte Kopie zaehlt dort nicht mit.
    let author: String?
    let copies: Int?
    let used_by: Int?
    let has_freetext: Bool?
    let published: Bool?
}

// Ein Element-Feld ist entweder eine Zahl oder (bei Freitext) ein String. Swifts Codable braucht
// dafuer einen eigenen Typ; JSONSerialization-Umwege waeren fehleranfaelliger.
enum LayoutValue: Codable {
    case zahl(Double)
    case text(String)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { self = .zahl(d); return }
        if let s = try? c.decode(String.self) { self = .text(s); return }
        self = .zahl(0)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .zahl(let d): try c.encode(d)
        case .text(let s): try c.encode(s)
        }
    }

    var alsZahl: Double { if case .zahl(let d) = self { return d }; return 0 }
    var alsInt: Int { Int(alsZahl) }
    var alsText: String { if case .text(let s) = self { return s }; return "" }
}


// Wert-basiertes Navigationsziel fuer Session-Details. Closure-basierte NavigationLinks in
// Lazy-Containern (LazyVGrid der Rekord-Kacheln) koennen in SwiftUI DOPPELT pushen — dann liegt
// dieselbe Session zweimal auf dem Stapel, "Aelter" tauscht nur die oberste aus und der
// Zurueck-Button "geht eine Session zurueck" (Jans Befund 01.08., nur aus Rekorden
// reproduzierbar, Listen-Zeilen waren nie betroffen). Wert-Navigation dedupliziert Pushes.
struct SessionDest: Hashable {
    let id: Int
    var dataVersion: Int? = nil
}
