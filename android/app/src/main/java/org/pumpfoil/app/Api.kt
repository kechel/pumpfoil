package org.pumpfoil.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.put
import java.net.HttpURLConnection
import java.net.URL

// REST-Client zur Pumpfoil-API (JWT Bearer). Spiegelt web/src/lib/api.ts.
object Api {
    const val BASE = "https://pumpfoil.org"
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile var token: String? = null
    @Volatile private var appContext: Context? = null
    // Wird bei abgelaufener/ungültiger Session (401 auf authentifizierten Request) aufgerufen
    // -> die UI schickt zum Login. Von MainActivity gesetzt.
    @Volatile var onUnauthorized: (() -> Unit)? = null

    fun load(ctx: Context) {
        appContext = ctx.applicationContext
        token = prefs(ctx).getString("token", null)
    }
    fun saveToken(ctx: Context, t: String) {
        token = t
        prefs(ctx).edit().putString("token", t).apply()
    }
    fun logout(ctx: Context) {
        token = null
        // mintedWearToken mitlöschen: nach Account-Wechsel darf nicht der alte Token
        // an die Uhr geschoben werden (sonst lädt die Uhr ins falsche Konto hoch).
        prefs(ctx).edit().remove("token").remove("mintedWearToken").apply()
    }
    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)

    fun mediaUrl(path: String?): String? =
        if (path.isNullOrEmpty()) null else if (path.startsWith("http")) path else BASE + path

    suspend fun login(email: String, password: String): String = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("email", email); put("password", password) }.toString()
        val resp = http("POST", "/api/auth/login", body, auth = false)
        json.decodeFromString(TokenResp.serializer(), resp).access_token
    }

    suspend fun nativeGoogle(idToken: String): String = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("id_token", idToken); put("language", I18n.lang) }.toString()
        val resp = http("POST", "/api/auth/oauth/native/google", body, auth = false)
        json.decodeFromString(TokenResp.serializer(), resp).access_token
    }

    suspend fun register(email: String, password: String, displayName: String): String = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("email", email); put("password", password); put("language", I18n.lang)
            if (displayName.isNotBlank()) put("display_name", displayName)
        }.toString()
        val resp = http("POST", "/api/auth/register", body, auth = false)
        json.decodeFromString(TokenResp.serializer(), resp).access_token
    }

    // Feedback senden (POST /api/feedback {text, url}).
    suspend fun submitFeedback(text: String): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/feedback", buildJsonObject { put("text", text); put("url", "android-app") }.toString(), auth = true)
    }

    // Passwort-Reset anstoßen (Server verschickt Mail; Antwort ignorieren).
    suspend fun forgotPassword(email: String): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/auth/forgot-password", buildJsonObject { put("email", email) }.toString(), auth = false)
    }

    // Eigenes Passwort ändern (PUT-Alias, da HttpURLConnection kein PATCH kann).
    suspend fun changePassword(current: String, newPw: String): Unit = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("current_password", current); put("new_password", newPw) }.toString()
        http("PUT", "/api/auth/me/password", body, auth = true)
    }

    suspend fun me(): Profile = withContext(Dispatchers.IO) {
        json.decodeFromString(Profile.serializer(), http("GET", "/api/auth/me", null, auth = true))
    }

    // Profil-Sprache setzen (synct zu Web/Uhr über die User-Sprache).
    suspend fun updateLanguage(lang: String): Unit = withContext(Dispatchers.IO) {
        http("PUT", "/api/auth/me", "{\"language\":\"$lang\"}", auth = true)
    }

    // Persönliche Erkennungs-Empfindlichkeit (normal|light|attempts); Server reanalysiert eigene Sessions.
    suspend fun updateFoilSensitivity(v: String): Unit = withContext(Dispatchers.IO) {
        http("PUT", "/api/auth/me", "{\"foil_sensitivity\":\"$v\"}", auth = true)
    }

    suspend fun reanalysisProgress(): ReanalysisProgress = withContext(Dispatchers.IO) {
        json.decodeFromString(ReanalysisProgress.serializer(), http("GET", "/api/auth/me/reanalysis", null, auth = true))
    }

    // Anzeigename ändern (PUT-Alias, da HttpURLConnection kein PATCH kann).
    suspend fun updateDisplayName(name: String): Profile = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("display_name", name) }.toString()
        json.decodeFromString(Profile.serializer(), http("PUT", "/api/auth/me", body, auth = true))
    }

    // DSGVO: Konto + ALLE Daten unwiderruflich löschen (Google-Play-Pflicht).
    suspend fun deleteAccount(): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/auth/me", null, auth = true)
    }

    suspend fun sessions(month: String? = null, filter: String = "pump", accelOnly: Boolean = false): List<SessionSummary> = withContext(Dispatchers.IO) {
        val qs = buildString {
            append("?filter=$filter")
            if (!month.isNullOrBlank()) append("&month=$month")
            if (accelOnly) append("&accel_only=true")
        }
        json.decodeFromString(
            ListSerializer(SessionSummary.serializer()),
            http("GET", "/api/sessions$qs", null, auth = true),
        )
    }

    suspend fun sessionMonths(filter: String = "pump"): List<MonthCount> = withContext(Dispatchers.IO) {
        json.decodeFromString(
            ListSerializer(MonthCount.serializer()),
            http("GET", "/api/sessions/months?filter=$filter", null, auth = true),
        )
    }

    suspend fun session(id: Int): SessionDetail = withContext(Dispatchers.IO) {
        json.decodeFromString(SessionDetail.serializer(), http("GET", "/api/sessions/$id", null, auth = true))
    }

    // Nachbar-Sessions (älter/neuer) für die Vor/Zurück-Navigation im Detail.
    suspend fun sessionNeighbors(id: Int): Neighbors = withContext(Dispatchers.IO) {
        json.decodeFromString(Neighbors.serializer(), http("GET", "/api/sessions/$id/neighbors", null, auth = true))
    }

    suspend fun sessionPhotos(id: Int): List<SessionPhoto> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(SessionPhoto.serializer()), http("GET", "/api/sessions/$id/photos", null, auth = true))
    }

    suspend fun deleteSessionPhoto(id: Int, photoId: Int): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/sessions/$id/photos/$photoId", null, auth = true)
    }

    // Foto-Upload (multipart/form-data, Feldname "file") an den Besitzer-Endpoint.
    suspend fun uploadSessionPhoto(id: Int, bytes: ByteArray, filename: String = "photo.jpg", mime: String = "image/jpeg"): Unit =
        withContext(Dispatchers.IO) {
            val boundary = "----pumpfoil${System.nanoTime()}"
            val conn = (URL(BASE + "/api/sessions/$id/photos").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                token?.let { setRequestProperty("Authorization", "Bearer $it") }
                connectTimeout = 15000; readTimeout = 60000
            }
            conn.outputStream.use { out ->
                out.write(("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\n" +
                    "Content-Type: $mime\r\n\r\n").toByteArray())
                out.write(bytes)
                out.write("\r\n--$boundary--\r\n".toByteArray())
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = conn.errorStream?.bufferedReader()?.readText() ?: ""
                throw RuntimeException("Upload fehlgeschlagen ($code): $err")
            }
        }

    suspend fun uploadAvatar(bytes: ByteArray, filename: String = "avatar.jpg", mime: String = "image/jpeg"): Unit =
        withContext(Dispatchers.IO) {
            val boundary = "----pumpfoil${System.nanoTime()}"
            val conn = (URL(BASE + "/api/auth/me/avatar").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                token?.let { setRequestProperty("Authorization", "Bearer $it") }
                connectTimeout = 15000; readTimeout = 60000
            }
            conn.outputStream.use { out ->
                out.write(("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\n" +
                    "Content-Type: $mime\r\n\r\n").toByteArray())
                out.write(bytes)
                out.write("\r\n--$boundary--\r\n".toByteArray())
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = conn.errorStream?.bufferedReader()?.readText() ?: ""
                throw RuntimeException("Avatar-Upload fehlgeschlagen ($code): $err")
            }
        }

    suspend fun communitySessions(limit: Int = 20, offset: Int = 0, accelOnly: Boolean = true): List<CommunityItem> = withContext(Dispatchers.IO) {
        val qs = "?limit=$limit&offset=$offset" + if (!accelOnly) "&accel_only=false" else ""
        json.decodeFromString(
            ListSerializer(CommunityItem.serializer()),
            http("GET", "/api/community/sessions$qs", null, auth = true),
        )
    }

    suspend fun spotSessions(spot: String, accelOnly: Boolean = true, limit: Int = 50): List<CommunityItem> = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(spot, "UTF-8")
        json.decodeFromString(
            ListSerializer(CommunityItem.serializer()),
            http("GET", "/api/community/spot-sessions?spot=$s&accel_only=$accelOnly&limit=$limit", null, auth = true),
        )
    }

    suspend fun history(): List<HistoryPoint> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(HistoryPoint.serializer()), http("GET", "/api/sessions/history", null, auth = true))
    }

    suspend fun stats(accelOnly: Boolean = true): OverallStats = withContext(Dispatchers.IO) {
        json.decodeFromString(OverallStats.serializer(), http("GET", "/api/sessions/stats?accel_only=$accelOnly", null, auth = true))
    }

    suspend fun deleteSession(id: Int): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/sessions/$id", null, auth = true)
    }

    suspend fun voteSession(id: Int, kind: String): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/community/sessions/$id/vote?kind=$kind", null, auth = true)
    }

    suspend fun setCaption(id: Int, caption: String): Unit = withContext(Dispatchers.IO) {
        http("PUT", "/api/sessions/$id/meta", buildJsonObject { put("caption", caption) }.toString(), auth = true)
    }

    suspend fun setSessionFoil(id: Int, foilId: Int?): Unit = withContext(Dispatchers.IO) {
        val body = buildJsonObject { if (foilId == null) put("foil_id", JsonNull) else put("foil_id", foilId) }
        http("PUT", "/api/sessions/$id/meta", body.toString(), auth = true)
    }

    suspend fun labels(id: Int): List<Label> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(Label.serializer()), http("GET", "/api/sessions/$id/labels", null, auth = true))
    }

    suspend fun addLabel(id: Int, startMs: Long, endMs: Long, label: String): Unit = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("t_start_ms", startMs); put("t_end_ms", endMs); put("label", label) }.toString()
        http("POST", "/api/sessions/$id/labels", body, auth = true)
    }

    suspend fun deleteLabel(id: Int, labelId: Int): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/sessions/$id/labels/$labelId", null, auth = true)
    }

    suspend fun setTrim(id: Int, startMs: Long?, endMs: Long?): Unit = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            if (startMs == null) put("trim_start_ms", JsonNull) else put("trim_start_ms", startMs)
            if (endMs == null) put("trim_end_ms", JsonNull) else put("trim_end_ms", endMs)
        }.toString()
        http("PUT", "/api/sessions/$id/trim", body, auth = true)
    }

    suspend fun spots(accelOnly: Boolean = true): SpotsList = withContext(Dispatchers.IO) {
        json.decodeFromString(SpotsList.serializer(), http("GET", "/api/community/spots?accel_only=$accelOnly", null, auth = true))
    }

    suspend fun communityRecords(accelOnly: Boolean = true): Map<String, PeriodRecords> = withContext(Dispatchers.IO) {
        json.decodeFromString(
            MapSerializer(String.serializer(), PeriodRecords.serializer()),
            http("GET", "/api/community/records?accel_only=$accelOnly", null, auth = true),
        )
    }

    // accelOnly=false wie die PWA (Spots.tsx) — sonst fehlen GPS-only-Spots (z. B. Frankreich).
    suspend fun spotMap(accelOnly: Boolean = false): List<SpotMapItem> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(SpotMapItem.serializer()), http("GET", "/api/community/spot-map?accel_only=$accelOnly", null, auth = true))
    }

    suspend fun chatRooms(): List<ChatRoom> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(ChatRoom.serializer()), http("GET", "/api/chat/rooms", null, auth = true))
    }

    suspend fun leaders(period: String = "all", accelOnly: Boolean = true): Leaders = withContext(Dispatchers.IO) {
        json.decodeFromString(Leaders.serializer(), http("GET", "/api/community/leaders?period=$period&accel_only=$accelOnly", null, auth = true))
    }

    suspend fun latestPhotos(limit: Int = 8): List<MediaItem> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(MediaItem.serializer()), http("GET", "/api/community/latest-photos?limit=$limit", null, auth = true))
    }

    suspend fun topLiked(period: String = "all", limit: Int = 5): List<CommunityItem> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(CommunityItem.serializer()), http("GET", "/api/community/top-liked?period=$period&limit=$limit", null, auth = true))
    }

    suspend fun spotRecords(spot: String, period: String = "all", accelOnly: Boolean = true): PeriodRecords = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(spot, "UTF-8")
        json.decodeFromString(PeriodRecords.serializer(), http("GET", "/api/community/spot-records?spot=$s&period=$period&accel_only=$accelOnly", null, auth = true))
    }

    suspend fun spotWeather(spot: String): SpotWeather = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(spot, "UTF-8")
        json.decodeFromString(SpotWeather.serializer(), http("GET", "/api/community/spot/weather?spot=$s", null, auth = true))
    }

    suspend fun chatLatest(scope: String, limit: Int = 30): List<ChatMsg> = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(scope, "UTF-8")
        json.decodeFromString(ListSerializer(ChatMsg.serializer()), http("GET", "/api/chat?scope=$s&limit=$limit", null, auth = true))
    }

    suspend fun chatPost(scope: String, text: String): ChatMsg = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(scope, "UTF-8")
        val body = buildJsonObject { put("text", text) }.toString()
        json.decodeFromString(ChatMsg.serializer(), http("POST", "/api/chat?scope=$s", body, auth = true))
    }

    // Neue Nachrichten seit `after` (für Live-Polling).
    suspend fun chatSince(scope: String, after: Int): List<ChatMsg> = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(scope, "UTF-8")
        json.decodeFromString(ListSerializer(ChatMsg.serializer()), http("GET", "/api/chat?scope=$s&after=$after", null, auth = true))
    }

    // Fremde Nachricht melden.
    suspend fun chatReport(id: Int): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/chat/$id/report", null, auth = true)
    }

    // Admin: Nachricht aus-/einblenden.
    suspend fun chatHide(id: Int, hidden: Boolean): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/chat/$id/hide", buildJsonObject { put("hidden", hidden) }.toString(), auth = true)
    }

    // Admin: Nutzer für Chats stummschalten (readonly).
    suspend fun chatSetReadonly(userId: Int, readonly: Boolean): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/chat/moderation/readonly", buildJsonObject { put("user_id", userId); put("readonly", readonly) }.toString(), auth = true)
    }

    // Raum abonnieren/abbestellen (Push); gibt den neuen push-Zustand zurück.
    suspend fun chatSubscribe(scope: String, on: Boolean): Boolean = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("scope", scope); put("on", on) }.toString()
        val resp = http("POST", "/api/chat/subscribe", body, auth = true)
        json.parseToJsonElement(resp).jsonObject["push"]?.jsonPrimitive?.booleanOrNull ?: on
    }

    suspend fun chatLeave(scope: String): Unit = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(scope, "UTF-8")
        http("POST", "/api/chat/leave?scope=$s", null, auth = true)
    }

    // Raum-Zustand (push abonniert? verlassen? letzte gelesene id).
    suspend fun chatRoomState(scope: String): ChatState = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(scope, "UTF-8")
        json.decodeFromString(ChatState.serializer(), http("GET", "/api/chat/state?scope=$s", null, auth = true))
    }

    // Lesestand setzen (für Unread auf der Startseite).
    suspend fun chatMarkRead(scope: String, upTo: Int): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/chat/read", buildJsonObject { put("scope", scope); put("up_to", upTo) }.toString(), auth = true)
    }

    // --- 1:1-Direktnachrichten + Blockieren ---
    suspend fun chatDmOpen(userId: Int): DmOpen = withContext(Dispatchers.IO) {
        json.decodeFromString(DmOpen.serializer(), http("GET", "/api/chat/dm?user_id=$userId", null, auth = true))
    }
    suspend fun chatSearchUsers(q: String): List<DmUser> = withContext(Dispatchers.IO) {
        val s = java.net.URLEncoder.encode(q, "UTF-8")
        json.decodeFromString(ListSerializer(DmUser.serializer()), http("GET", "/api/chat/users?q=$s", null, auth = true))
    }
    suspend fun chatAllSpots(): List<SpotChat> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(SpotChat.serializer()), http("GET", "/api/chat/all-spots", null, auth = true))
    }
    suspend fun chatBlock(userId: Int): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/chat/block", buildJsonObject { put("user_id", userId) }.toString(), auth = true)
    }
    suspend fun chatUnblock(userId: Int): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/chat/block/$userId", null, auth = true)
    }
    suspend fun chatBlocks(): List<DmUser> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(DmUser.serializer()), http("GET", "/api/chat/blocks", null, auth = true))
    }

    // Session-Übertragung an einen anderen Nutzer.
    suspend fun transferInitiate(sessionId: Int, toUserId: Int): Transfer = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("session_id", sessionId); put("to_user_id", toUserId) }.toString()
        json.decodeFromString(Transfer.serializer(), http("POST", "/api/transfers", body, auth = true))
    }
    suspend fun transfersIncoming(): List<Transfer> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(Transfer.serializer()), http("GET", "/api/transfers/incoming", null, auth = true))
    }
    suspend fun transferForSession(sessionId: Int): Transfer? = withContext(Dispatchers.IO) {
        val r = http("GET", "/api/transfers/for-session/$sessionId", null, auth = true)
        val obj = json.parseToJsonElement(r).jsonObject
        if (obj["id"] == null) null else json.decodeFromString(Transfer.serializer(), r)
    }
    suspend fun transferAccept(id: Int): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/transfers/$id/accept", null, auth = true)
    }
    suspend fun transferDecline(id: Int): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/transfers/$id/decline", null, auth = true)
    }
    suspend fun transferCancel(id: Int): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/transfers/$id", null, auth = true)
    }
    suspend fun transferFriends(): List<DmUser> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(DmUser.serializer()), http("GET", "/api/transfers/friends", null, auth = true))
    }

    // Öffentlicher News-Banner (DB-gesteuert, kein Auth nötig).
    suspend fun newsBanner(): NewsBanner = withContext(Dispatchers.IO) {
        json.decodeFromString(NewsBanner.serializer(), http("GET", "/api/app/news", null, auth = false))
    }

    // Teilbare Session-Card (server-gerendertes PNG). Params spiegeln web/ShareDialog:
    // color=cyan|speed|hr, stats=komma-Keys, bg=navy, track=0|1, title, shade=light|dark.
    suspend fun shareCard(
        id: Int, color: String, stats: List<String>, track: Boolean, title: String, shade: String,
        bg: String = "navy", highlight: Int = -1,
    ): ByteArray = withContext(Dispatchers.IO) {
        val q = StringBuilder("?color=$color&bg=$bg&track=${if (track) 1 else 0}&shade=$shade")
        if (stats.isNotEmpty()) q.append("&stats=").append(java.net.URLEncoder.encode(stats.joinToString(","), "UTF-8"))
        if (title.isNotBlank()) q.append("&title=").append(java.net.URLEncoder.encode(title.trim(), "UTF-8"))
        if (track && highlight >= 0) q.append("&highlight=$highlight")
        httpBytes("/api/sessions/$id/share.png$q")
    }

    @kotlinx.serialization.Serializable
    data class IntegrationStatus(val available: Boolean = false, val linked: Boolean = false, val last_sync_at: String? = null)

    @kotlinx.serialization.Serializable
    private data class ConnectResp(val authorize_url: String = "")

    @kotlinx.serialization.Serializable
    data class SyncResp(val imported: Int = 0, val skipped: Int = 0, val message: String? = null, val ok: Boolean = true)

    // Fremdkonten (Polar/COROS/Suunto) verknüpfen/importieren. provider = "polar"|"coros"|"suunto".
    suspend fun integrationStatus(provider: String): IntegrationStatus = withContext(Dispatchers.IO) {
        json.decodeFromString(IntegrationStatus.serializer(), http("GET", "/api/integrations/$provider/status", null, auth = true))
    }
    suspend fun integrationAuthorizeUrl(provider: String): String = withContext(Dispatchers.IO) {
        json.decodeFromString(ConnectResp.serializer(), http("GET", "/api/integrations/$provider/connect", null, auth = true)).authorize_url
    }
    suspend fun integrationSync(provider: String): SyncResp = withContext(Dispatchers.IO) {
        json.decodeFromString(SyncResp.serializer(), http("POST", "/api/integrations/$provider/sync", null, auth = true))
    }
    suspend fun integrationUnlink(provider: String): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/integrations/$provider", null, auth = true)
    }

    @kotlinx.serialization.Serializable
    private data class MergeResp(val id: Int)

    // Mehrere eigene Sessions zusammenführen -> neue Session-ID. Server prüft same-spot/on-foil.
    suspend fun mergeSessions(ids: List<Int>): Int = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("session_ids", buildJsonArray { ids.forEach { add(it) } }) }.toString()
        json.decodeFromString(MergeResp.serializer(), http("POST", "/api/sessions/merge", body, auth = true)).id
    }

    // Zusammenführung wieder auflösen.
    suspend fun unmergeSession(id: Int): Unit = withContext(Dispatchers.IO) {
        http("POST", "/api/sessions/$id/unmerge", null, auth = true)
    }

    // Vorschläge für heutige zusammengehörige eigene Sessions.
    suspend fun mergeSuggestions(): List<MergeSuggestion> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(MergeSuggestion.serializer()), http("GET", "/api/sessions/merge-suggestions", null, auth = true))
    }

    @kotlinx.serialization.Serializable
    data class CommunityStats(val foilers: Int = 0, val spots: Int = 0, val sessions: Int = 0, val pumps: Int = 0)

    // Community-Kennzahlen (Willkommens-Banner + Stats-Leiste).
    suspend fun communityStats(): CommunityStats = withContext(Dispatchers.IO) {
        json.decodeFromString(CommunityStats.serializer(), http("GET", "/api/community/stats", null, auth = true))
    }

    @kotlinx.serialization.Serializable
    data class AppLatest(val latest: String = "", val min_supported: String = "", val store_url: String = "")

    // Neueste Store-Version (server-seitig manuell gepflegt) — fuer den In-App-Update-Hinweis.
    suspend fun appLatest(platform: String = "android"): AppLatest = withContext(Dispatchers.IO) {
        json.decodeFromString(AppLatest.serializer(), http("GET", "/api/app/latest?platform=$platform", null, auth = false))
    }

    // Eigene Chat-Nachricht bearbeiten (nur < 1 h). PUT-Alias, da HttpURLConnection kein PATCH kann.
    suspend fun chatEdit(messageId: Int, text: String): Unit = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("text", text) }.toString()
        http("PUT", "/api/chat/$messageId", body, auth = true)
    }

    // Eigene Chat-Nachricht löschen (nur < 1 h).
    suspend fun chatDelete(messageId: Int): Unit = withContext(Dispatchers.IO) {
        http("DELETE", "/api/chat/$messageId", null, auth = true)
    }

    suspend fun foils(): List<Foil> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(Foil.serializer()), http("GET", "/api/foils", null, auth = true))
    }

    suspend fun foilBrands(): List<String> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(String.serializer()), http("GET", "/api/foils/brands", null, auth = true))
    }

    @kotlinx.serialization.Serializable
    data class LikeState(val like_count: Int = 0, val liked: Boolean = false)

    suspend fun toggleLike(id: Int): LikeState = withContext(Dispatchers.IO) {
        json.decodeFromString(LikeState.serializer(), http("POST", "/api/community/sessions/$id/like", null, auth = true))
    }

    suspend fun foilStats(): List<FoilStat> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(FoilStat.serializer()), http("GET", "/api/community/foil-stats", null, auth = true))
    }

    suspend fun watchStats(): List<WatchStat> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(WatchStat.serializer()), http("GET", "/api/community/watch-stats", null, auth = true))
    }

    // Settings sind ein freies Key/Value-Objekt -> als JsonObject zurückgeben, der
    // Aufrufer pickt my_foils / weight_kg heraus.
    suspend fun settings(): JsonObject = withContext(Dispatchers.IO) {
        json.parseToJsonElement(http("GET", "/api/settings", null, auth = true)).jsonObject
    }

    // Teil-Update der Settings (z. B. my_foils, foil_id) -> PUT.
    suspend fun saveSettings(patch: JsonObject): Unit = withContext(Dispatchers.IO) {
        http("PUT", "/api/settings", patch.toString(), auth = true)
    }

    // Gepairte Uhren/Geräte des Kontos (mit record_mode je Uhr).
    suspend fun myDevices(): List<PairedDevice> = withContext(Dispatchers.IO) {
        json.decodeFromString(http("GET", "/api/devices/list", null, auth = true))
    }

    // Aufzeichnungsmodus einer einzelnen Uhr setzen (full|lite|gps).
    suspend fun setDeviceRecordMode(id: Int, mode: String): Unit = withContext(Dispatchers.IO) {
        http("PUT", "/api/devices/$id/record-mode", buildJsonObject { put("record_mode", mode) }.toString(), auth = true)
    }

    // Companion-Pairing: eingeloggte Phone-App mintet ein Device-Token für die Wear-Uhr.
    suspend fun mintDeviceToken(label: String = "Wear OS"): String = withContext(Dispatchers.IO) {
        val l = java.net.URLEncoder.encode(label, "UTF-8")
        json.decodeFromString(MintResp.serializer(),
            http("POST", "/api/devices/mint?label=$l", null, auth = true)).device_token
    }

    // Garmin Reverse-Pairing: der auf der Uhr angezeigte Code wird hier eingelöst.
    suspend fun pairClaim(code: String): Unit = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("code", code.trim().uppercase()); put("label", "Garmin") }.toString()
        http("POST", "/api/devices/pair-claim", body, auth = true)
    }

    // Garmin Forward-Pairing: Code erzeugen -> in die Garmin-Connect-App-Einstellungen eintragen.
    @kotlinx.serialization.Serializable
    data class PairingCode(val code: String, val expires_at: String)
    suspend fun generatePairingCode(): PairingCode = withContext(Dispatchers.IO) {
        json.decodeFromString(PairingCode.serializer(), http("POST", "/api/devices/pairing-code", null, auth = true))
    }

    @kotlinx.serialization.Serializable
    private data class TokenResp(val access_token: String)

    @kotlinx.serialization.Serializable
    private data class MintResp(val device_token: String)

    // Authentifizierter GET, der rohe Bytes zurückgibt (z. B. share.png).
    private fun httpBytes(path: String): ByteArray {
        val conn = (URL(BASE + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"; connectTimeout = 15000; readTimeout = 30000
            token?.let { setRequestProperty("Authorization", "Bearer $it") }
        }
        val code = conn.responseCode
        conn.getHeaderField("X-Refresh-Token")?.takeIf { it.isNotBlank() }?.let { rt ->
            token = rt; appContext?.let { c -> prefs(c).edit().putString("token", rt).apply() }
        }
        if (code !in 200..299) {
            if (code == 401) { appContext?.let { logout(it) }; onUnauthorized?.invoke() }
            throw RuntimeException(if (code == 401) "Sitzung abgelaufen" else "Serverfehler ($code)")
        }
        return conn.inputStream.use { it.readBytes() }
    }

    private fun http(method: String, path: String, body: String?, auth: Boolean): String {
        val conn = (URL(BASE + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 30000
            if (auth) token?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        if (body != null) conn.outputStream.use { it.write(body.toByteArray()) }
        val code = conn.responseCode
        // Sliding-Refresh: bei knapper Restlaufzeit schickt der Server ein frisches Token mit.
        conn.getHeaderField("X-Refresh-Token")?.takeIf { it.isNotBlank() }?.let { rt ->
            token = rt
            appContext?.let { c -> prefs(c).edit().putString("token", rt).apply() }
        }
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.readText() ?: ""
        if (code !in 200..299) {
            // 401 auf einen authentifizierten Request = Session abgelaufen/ungültig -> abmelden + Login.
            // (Bei auth=false, z. B. Login, bleibt 401 = falsche Zugangsdaten.)
            if (code == 401 && auth) {
                appContext?.let { logout(it) }
                onUnauthorized?.invoke()
            }
            throw RuntimeException(
                when {
                    code == 401 && auth -> "Sitzung abgelaufen"
                    code == 401 -> "E-Mail oder Passwort falsch"
                    else -> "Serverfehler ($code)"
                }
            )
        }
        return text
    }
}
