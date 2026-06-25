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
    val sport: String,
    @SerialName("started_at") val startedAt: String,
    @SerialName("ended_at") val endedAt: String? = null,
    val status: String,
    @SerialName("place_name") val placeName: String? = null,
    val caption: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
)
