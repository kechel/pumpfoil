package org.pumpfoil.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
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

    @kotlinx.serialization.Serializable
    private data class TokenResp(val access_token: String)

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
