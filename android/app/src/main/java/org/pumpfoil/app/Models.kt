package org.pumpfoil.app

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// Gepairte Uhr/Gerät (GET /api/devices/list). record_mode je Uhr getrennt.
@Serializable
data class PairedDevice(
    val id: Int,
    val label: String? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("revoked_at") val revokedAt: String? = null,
    @SerialName("app_version") val appVersion: String? = null,
    val platform: String? = null,
    val model: String? = null,
    @SerialName("model_id") val modelId: String? = null,
    @SerialName("update_available") val updateAvailable: Boolean = false,
    @SerialName("latest_version") val latestVersion: String? = null,
    @SerialName("record_mode") val recordMode: String = "full",   // full | lite | gps
    @SerialName("low_accel") val lowAccel: Boolean = false,        // FR55 & Co. -> Voll autom. Sparsam
)

// Spiegelt die API-Schemas (snake_case JSON -> camelCase via @SerialName).
@Serializable
data class Profile(
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("is_admin") val isAdmin: Boolean = false,
    val language: String? = null,
    @SerialName("foil_sensitivity") val foilSensitivity: String? = null,
    @SerialName("social_allowed") val socialAllowed: Boolean? = null,
    val beta: Boolean = false,
)

@Serializable
data class ReanalysisProgress(
    val running: Boolean = false,
    val done: Int = 0,
    val total: Int = 0,
)

// Verlauf: „Entwicklung am Spot" — Spots des Nutzers + Bulk-Tracks je Spot.
@Serializable
data class SpotCount(val spot: String, val count: Int)

@Serializable
data class SpotTrack(
    @SerialName("session_id") val sessionId: Int,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val track: List<List<Double?>> = emptyList(),   // [[lat, lon, speed_mps?]]
)

@Serializable
data class SessionSummary(
    val id: Int,
    val sport: String = "",
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("data_version") val dataVersion: Long? = null,   // Cache-Schlüssel fürs Detail
    val status: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    val caption: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("owner_avatar_url") val ownerAvatarUrl: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    @SerialName("thumb_url") val thumbUrl: String? = null,
    @SerialName("photo_count") val photoCount: Int = 0,
    @SerialName("youtube_url") val youtubeUrl: String? = null,      // verlinktes Video → Vorschau-Thumb
    @SerialName("track_preview") val trackPreview: String? = null,
    val foil: FoilBrief? = null,          // aufgelöstes Foil (Marke/Modell/Größe) für die Anzeige
    @SerialName("device_label") val deviceLabel: String? = null,   // Uhr-Bezeichnung der Aufnahme
    @SerialName("transfer_to") val transferTo: String? = null,      // offene Übertragung → Badge
    val analysis: Analysis? = null,        // slim: Kennzahlen für die Listenkarte
)

// Kompakte Foil-Info für Listen/Karten (Server liefert ein dict mit u.a. brand/model/size).
@Serializable
data class FoilBrief(
    val brand: String = "",
    val model: String = "",
    val size: String = "",
)

// Mini-Track-Vorschau (normalisierte Polylinien aus der Analyse), wie web TrackPreview:
// {"w","h","lines":[[[x,y],...],...]}.
@Serializable
data class TrackPreview(
    val w: Double = 100.0,
    val h: Double = 100.0,
    val lines: List<List<List<Double>>> = emptyList(),
)

// Community-/Spot-Feed liefert eine andere Shape als /api/sessions: session_id, name,
// spot, avatar_url, foiling_km, runs … (siehe server community._brief/_attach_social).
@Serializable
data class CommunityItem(
    @SerialName("session_id") val id: Int,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    val caption: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val runs: Int = 0,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("track_preview") val trackPreview: String? = null,
    @SerialName("thumb_url") val thumbUrl: String? = null,
    @SerialName("youtube_url") val youtubeUrl: String? = null,      // verlinktes Video → Vorschau-Thumb
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    @SerialName("device_label") val deviceLabel: String? = null,   // Uhr-Bezeichnung der Aufnahme
)

@Serializable
data class Analysis(
    @SerialName("total_distance_m") val totalDistanceM: Double? = null,
    @SerialName("foiling_distance_m") val foilingDistanceM: Double? = null,
    @SerialName("foiling_time_s") val foilingTimeS: Double? = null,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("pump_count") val pumpCount: Int? = null,
    @SerialName("avg_cadence_hz") val avgCadenceHz: Double? = null,
    val metrics: Metrics? = null,
    @SerialName("track_geojson") val trackGeojson: JsonElement? = null,
    // Foiling-Läufe (Index-Bereiche in track_geojson.coordinates) — nur diese werden gezeichnet.
    // Nullable: die schlanke Listen-Analyse liefert "segments": null (nicht nur fehlend).
    val segments: List<Segment>? = null,
)

// Session-weite Kennzahlen (metrics_json) — Basis für den Stats-Block in der Liste.
@Serializable
data class Metrics(
    @SerialName("num_segments") val numSegments: Int? = null,
    @SerialName("avg_speed_mps") val avgSpeedMps: Double? = null,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
    @SerialName("avg_hr") val avgHr: Int? = null,
    @SerialName("max_hr") val maxHr: Int? = null,
    @SerialName("farthest_segment_m") val farthestSegmentM: Double? = null,
    @SerialName("longest_segment_s") val longestSegmentS: Double? = null,
)

@Serializable
data class Segment(
    @SerialName("i_start") val iStart: Int = 0,
    @SerialName("i_end") val iEnd: Int = 0,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("duration_s") val durationS: Double = 0.0,
    @SerialName("avg_speed_mps") val avgSpeedMps: Double = 0.0,
    @SerialName("max_speed_mps") val maxSpeedMps: Double = 0.0,
    val pumps: Int = 0,
    @SerialName("pump_idx") val pumpIdx: List<Int> = emptyList(),
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
    @SerialName("longest_glide_s") val longestGlideS: Double = 0.0,
)

@Serializable
data class HistoryPoint(
    @SerialName("session_id") val sessionId: Int,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val runs: Int = 0,
    val pumps: Int = 0,
    val speed: Double = 0.0,            // beste Lauf-Geschwindigkeit (m/s)
    val distance: Double = 0.0,         // bester Lauf: Distanz (m)
    val duration: Double = 0.0,         // bester Lauf: Dauer (s)
    val glide: Double = 0.0,            // längster Gleit (s)
    @SerialName("avg_speed") val avgSpeed: Double? = null,   // Ø-Speed der Session (m/s)
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

// Bestenliste (GET /api/community/leaders) — je Metrik eine Rangliste.
@Serializable
data class LeaderEntry(
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val sessions: Int = 0, val runs: Int = 0, val spots: Int = 0, val pumps: Int = 0,
)

@Serializable
data class Leaders(
    val sessions: List<LeaderEntry> = emptyList(),
    val runs: List<LeaderEntry> = emptyList(),
    val spots: List<LeaderEntry> = emptyList(),
    val pumps: List<LeaderEntry> = emptyList(),
)

// Neueste Medien (GET /api/community/latest-photos) — Fotos + YouTube je Session.
@Serializable
data class MediaItem(
    val kind: String = "photo",
    val url: String? = null,
    @SerialName("youtube_url") val youtubeUrl: String? = null,
    @SerialName("session_id") val sessionId: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    val caption: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
)

// Spot-Wetter (GET /api/community/spot/weather) — aktuell + Tagesvorschau (Wind in Knoten).
@Serializable
data class SpotWeather(val weather: WeatherBlock? = null)

@Serializable
data class WeatherBlock(
    val current: WxCurrent? = null,
    val days: List<WxDay> = emptyList(),
)

@Serializable
data class WxCurrent(
    val temp: Double? = null, val wind: Double? = null, val dir: Double? = null, val code: Int? = null,
)

@Serializable
data class WxDay(
    val date: String = "", val code: Int? = null, val tmax: Double? = null, val tmin: Double? = null,
    @SerialName("wind_max") val windMax: Double? = null, val dir: Double? = null,
)

// Gesamt-Statistik + persönliche Rekorde (GET /api/sessions/stats).
@Serializable
data class RecordEntry(
    @SerialName("session_id") val sessionId: Int? = null,
    val value: Double = 0.0,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("run_idx") val runIdx: Int? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
)

@Serializable
data class OverallRecords(
    val distance: RecordEntry? = null,
    val duration: RecordEntry? = null,
    val speed: RecordEntry? = null,
    val runs: RecordEntry? = null,
    val glide: RecordEntry? = null,
)

@Serializable
data class OverallStats(
    val count: Int = 0,
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    @SerialName("foiling_min") val foilingMin: Double = 0.0,
    val pumps: Int = 0,
    @SerialName("runs_total") val runsTotal: Int = 0,
    val records: OverallRecords? = null,
)

@Serializable
data class SpotsList(val mine: List<String> = emptyList(), val all: List<String> = emptyList())

// Monats-Facetten für den Sessions-Monatsfilter (GET /api/sessions/months).
@Serializable
data class MonthCount(val month: String = "", val count: Int = 0)

// Nachbar-Sessions (GET /api/sessions/{id}/neighbors) für Vor/Zurück im Detail.
@Serializable
data class Neighbors(val older: Int? = null, val newer: Int? = null)

// Chat-Raum-Zustand (GET /api/chat/state).
@Serializable
data class ChatState(
    val push: Boolean = false,
    val left: Boolean = false,
    @SerialName("last_read_id") val lastReadId: Int = 0,
)

// Community-Rekorde (GET /api/community/records): {period -> {distance/duration/speed/glide/runs}}.
@Serializable
data class CommunityRecordEntry(
    @SerialName("session_id") val sessionId: Int? = null,
    val value: Double = 0.0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("run_idx") val runIdx: Int? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
)

@Serializable
data class PeriodRecords(
    val distance: CommunityRecordEntry? = null,
    val duration: CommunityRecordEntry? = null,
    val speed: CommunityRecordEntry? = null,
    val glide: CommunityRecordEntry? = null,
    val runs: CommunityRecordEntry? = null,
)

@Serializable
data class SpotMapItem(
    val spot: String,
    @SerialName("spot_id") val spotId: Int? = null,   // additiv (neue Clients); Nav bleibt namensbasiert
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val sessions: Int = 0,
)

@Serializable
data class ChatMsg(
    val id: Int,
    @SerialName("user_id") val userId: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val text: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    val mine: Boolean = false,
    val hidden: Boolean = false,
)

@Serializable
data class ChatRoom(
    val scope: String,
    val label: String = "",
    val unread: Int = 0,
    @SerialName("last_text") val lastText: String = "",
    val kind: String = "",           // spot | dm | session
    val push: Boolean = false,       // abonniert (Push) → Glocke
    val other: DmOther? = null,      // nur bei dm
)

@Serializable
data class DmOther(
    val id: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

// Ein Spot-Chat aus /api/chat/all-spots (zum Stöbern; jeder darf reinschauen).
@Serializable
data class SpotChat(
    val scope: String,
    val label: String = "",
    val messages: Int = 0,
)

@Serializable
data class DmUser(
    val id: Int,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
data class TransferSessionBrief(
    val id: Int,
    val place: String? = null,
    val water: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    val sport: String = "",
    @SerialName("foiling_time_s") val foilingTimeS: Double? = null,
)

// Session-Übertragung an einen anderen Nutzer (role: sender|recipient in for-session).
@Serializable
data class Transfer(
    val id: Int,
    val status: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    val other: DmUser? = null,
    val session: TransferSessionBrief? = null,
    val role: String? = null,
)

@Serializable
data class DmOpen(
    val scope: String,
    val other: DmOther = DmOther(),
    val blocked: Boolean = false,
)

@Serializable
data class NewsBanner(
    val version: Int = 0,
    val enabled: Boolean = false,
    val texts: Map<String, String> = emptyMap(),
)

@Serializable
data class Foil(
    val id: Int,
    val brand: String = "",
    val model: String = "",
    val size: String = "",
    @SerialName("span_cm") val spanCm: Double = 0.0,
    @SerialName("area_cm2") val areaCm2: Double = 0.0,
    @SerialName("thickness_mm") val thicknessMm: Double = 0.0,
    @SerialName("thickness_estimated") val thicknessEstimated: Boolean = false,
    @SerialName("aspect_ratio") val aspectRatio: Double? = null,
)

@Serializable
data class SessionPhoto(val id: Int, val url: String = "")

@Serializable
data class SessionVideo(val id: Int, @SerialName("youtube_url") val youtubeUrl: String = "")

@Serializable
data class Label(
    val id: Int,
    @SerialName("t_start_ms") val tStartMs: Long = 0,
    @SerialName("t_end_ms") val tEndMs: Long = 0,
    val label: String = "",   // pump | glide | not_foiling
)

@Serializable
data class FoilStat(
    @SerialName("foil_id") val foilId: Int,
    val brand: String = "",
    val model: String = "",
    val size: String = "",
    @SerialName("aspect_ratio") val aspectRatio: Double? = null,
    val sessions: Int = 0,
    val users: Int = 0,
    @SerialName("avg_speed_kmh") val avgSpeedKmh: Double? = null,
    @SerialName("meters_per_pump") val metersPerPump: Double? = null,
    @SerialName("best_distance_m") val bestDistanceM: Double? = null,
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

@Serializable
data class WatchStat(
    val watch: String = "",
    val sessions: Int = 0,
    val users: Int = 0,
    @SerialName("foiling_km") val foilingKm: Double? = null,
    @SerialName("avg_speed_kmh") val avgSpeedKmh: Double? = null,
    @SerialName("best_distance_m") val bestDistanceM: Double? = null,
    @SerialName("best_speed_kmh") val bestSpeedKmh: Double? = null,
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

@Serializable
data class SessionDetail(
    val id: Int,
    val sport: String = "",
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("data_version") val dataVersion: Long? = null,   // Cache-Schlüssel
    val status: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    val caption: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("owner_avatar_url") val ownerAvatarUrl: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    val owned: Boolean = false,
    @SerialName("youtube_url") val youtubeUrl: String? = null,
    @SerialName("place_water") val placeWater: String? = null,   // Gewässer als Zusatz-Label
    @SerialName("spot_id") val spotId: Int? = null,               // additiv; Nav bleibt namensbasiert
    val foil: Foil? = null,        // aufgelöstes Foil (Maße) für die Leistungsberechnung
    val analysis: Analysis? = null,
    @SerialName("merged_count") val mergedCount: Int = 0,   // >0 -> aus N Sessions zusammengeführt
    @SerialName("device_label") val deviceLabel: String? = null,   // Uhr-Bezeichnung der Aufnahme
)

@Serializable
data class MergeSuggestion(
    val ids: List<Int> = emptyList(),
    val count: Int = 0,
    val place: String? = null,
    val date: String = "",
    val tz: String? = null,               // IANA-Zeitzone des Spots (Gruppen-Ebene)
)
