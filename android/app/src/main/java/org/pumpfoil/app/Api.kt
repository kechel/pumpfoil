package org.pumpfoil.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.net.HttpURLConnection
import java.net.URL

// REST-Client zur Pumpfoil-API (JWT Bearer). Spiegelt web/src/lib/api.ts.
object Api {
    const val BASE = "https://pumpfoil.org"
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile var token: String? = null

    fun load(ctx: Context) {
        token = prefs(ctx).getString("token", null)
    }
    fun saveToken(ctx: Context, t: String) {
        token = t
        prefs(ctx).edit().putString("token", t).apply()
    }
    fun logout(ctx: Context) {
        token = null
        prefs(ctx).edit().remove("token").apply()
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

    suspend fun me(): Profile = withContext(Dispatchers.IO) {
        json.decodeFromString(Profile.serializer(), http("GET", "/api/auth/me", null, auth = true))
    }

    suspend fun sessions(): List<SessionSummary> = withContext(Dispatchers.IO) {
        json.decodeFromString(
            ListSerializer(SessionSummary.serializer()),
            http("GET", "/api/sessions", null, auth = true),
        )
    }

    suspend fun session(id: Int): SessionDetail = withContext(Dispatchers.IO) {
        json.decodeFromString(SessionDetail.serializer(), http("GET", "/api/sessions/$id", null, auth = true))
    }

    suspend fun communitySessions(limit: Int = 20, offset: Int = 0): List<SessionSummary> = withContext(Dispatchers.IO) {
        json.decodeFromString(
            ListSerializer(SessionSummary.serializer()),
            http("GET", "/api/community/sessions?limit=$limit&offset=$offset", null, auth = true),
        )
    }

    suspend fun history(): List<HistoryPoint> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(HistoryPoint.serializer()), http("GET", "/api/sessions/history", null, auth = true))
    }

    suspend fun spotMap(): List<SpotMapItem> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(SpotMapItem.serializer()), http("GET", "/api/community/spot-map", null, auth = true))
    }

    suspend fun chatRooms(): List<ChatRoom> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(ChatRoom.serializer()), http("GET", "/api/chat/rooms", null, auth = true))
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

    suspend fun foils(): List<Foil> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(Foil.serializer()), http("GET", "/api/foils", null, auth = true))
    }

    suspend fun foilBrands(): List<String> = withContext(Dispatchers.IO) {
        json.decodeFromString(ListSerializer(String.serializer()), http("GET", "/api/foils/brands", null, auth = true))
    }

    // Settings sind ein freies Key/Value-Objekt -> als JsonObject zurückgeben, der
    // Aufrufer pickt my_foils / weight_kg heraus.
    suspend fun settings(): JsonObject = withContext(Dispatchers.IO) {
        json.parseToJsonElement(http("GET", "/api/settings", null, auth = true)).jsonObject
    }

    // Companion-Pairing: eingeloggte Phone-App mintet ein Device-Token für die Wear-Uhr.
    suspend fun mintDeviceToken(label: String = "Wear OS"): String = withContext(Dispatchers.IO) {
        val l = java.net.URLEncoder.encode(label, "UTF-8")
        json.decodeFromString(MintResp.serializer(),
            http("POST", "/api/devices/mint?label=$l", null, auth = true)).device_token
    }

    @kotlinx.serialization.Serializable
    private data class TokenResp(val access_token: String)

    @kotlinx.serialization.Serializable
    private data class MintResp(val device_token: String)

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
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.readText() ?: ""
        if (code !in 200..299) {
            throw RuntimeException(if (code == 401) "E-Mail oder Passwort falsch" else "Serverfehler ($code)")
        }
        return text
    }
}
