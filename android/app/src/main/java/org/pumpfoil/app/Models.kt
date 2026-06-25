package org.pumpfoil.app

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
    @SerialName("like_count") val likeCount: Int = 0,
)

@Serializable
data class Analysis(
    @SerialName("total_distance_m") val totalDistanceM: Double? = null,
    @SerialName("foiling_distance_m") val foilingDistanceM: Double? = null,
    @SerialName("foiling_time_s") val foilingTimeS: Double? = null,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("pump_count") val pumpCount: Int? = null,
    @SerialName("avg_cadence_hz") val avgCadenceHz: Double? = null,
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
    val analysis: Analysis? = null,
)
