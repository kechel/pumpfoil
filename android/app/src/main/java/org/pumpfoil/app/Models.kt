package org.pumpfoil.app

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// Spiegelt die API-Schemas (snake_case JSON -> camelCase via @SerialName).
@Serializable
data class Profile(
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("is_admin") val isAdmin: Boolean = false,
    val language: String? = null,
)

@Serializable
data class SessionSummary(
    val id: Int,
    val sport: String = "",
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    val status: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val caption: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("owner_avatar_url") val ownerAvatarUrl: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
)

// Community-/Spot-Feed liefert eine andere Shape als /api/sessions: session_id, name,
// spot, avatar_url, foiling_km, runs … (siehe server community._brief/_attach_social).
@Serializable
data class CommunityItem(
    @SerialName("session_id") val id: Int,
    @SerialName("started_at") val startedAt: String = "",
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    val caption: String? = null,
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val runs: Int = 0,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
)

@Serializable
data class Analysis(
    @SerialName("total_distance_m") val totalDistanceM: Double? = null,
    @SerialName("foiling_distance_m") val foilingDistanceM: Double? = null,
    @SerialName("foiling_time_s") val foilingTimeS: Double? = null,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("pump_count") val pumpCount: Int? = null,
    @SerialName("avg_cadence_hz") val avgCadenceHz: Double? = null,
    @SerialName("track_geojson") val trackGeojson: JsonElement? = null,
    // Foiling-Läufe (Index-Bereiche in track_geojson.coordinates) — nur diese werden gezeichnet.
    val segments: List<Segment> = emptyList(),
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
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

// Gesamt-Statistik + persönliche Rekorde (GET /api/sessions/stats).
@Serializable
data class RecordEntry(
    @SerialName("session_id") val sessionId: Int? = null,
    val value: Double = 0.0,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("run_idx") val runIdx: Int? = null,
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

// Community-Rekorde (GET /api/community/records): {period -> {distance/duration/speed/glide/runs}}.
@Serializable
data class CommunityRecordEntry(
    @SerialName("session_id") val sessionId: Int? = null,
    val value: Double = 0.0,
    val name: String? = null,
    val spot: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
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
data class SessionDetail(
    val id: Int,
    val sport: String = "",
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    val status: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val caption: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    val owned: Boolean = false,
    @SerialName("youtube_url") val youtubeUrl: String? = null,
    val foil: Foil? = null,        // aufgelöstes Foil (Maße) für die Leistungsberechnung
    val analysis: Analysis? = null,
)
