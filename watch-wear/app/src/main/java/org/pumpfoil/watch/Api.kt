package org.pumpfoil.watch

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Server-Anbindung: Pairing + Raw-Ingest-Contract (docs/ingest-contract.md).
object Api {
    @Volatile var baseUrl = "https://pumpfoil.org"
    @Volatile var deviceToken: String? = null

    fun load(ctx: Context) {
        val p = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
        deviceToken = p.getString("deviceToken", null)
        baseUrl = p.getString("baseUrl", baseUrl) ?: baseUrl
    }

    fun saveToken(ctx: Context, token: String) {
        deviceToken = token
        ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .edit().putString("deviceToken", token).apply()
    }

    suspend fun pair(code: String, label: String): String = withContext(Dispatchers.IO) {
        val body = JSONObject().put("code", code).put("label", label)
        val res = post("/api/devices/pair", body, auth = false)
        res.getString("device_token")
    }

    // Reverse-Pairing: die Uhr erzeugt einen Code, der Nutzer trägt ihn auf der
    // Web-App ein (Code an der Uhr tippen wäre umständlich). Rückgabe: code + claim_token.
    suspend fun pairInit(): Pair<String, String> = withContext(Dispatchers.IO) {
        val res = post("/api/devices/pair-init", JSONObject(), auth = false)
        res.getString("code") to res.getString("claim_token")
    }

    // Pollt, ob der Code in der Web-App eingelöst wurde -> dann kommt das Device-Token (sonst null).
    suspend fun pairPoll(claimToken: String): String? = withContext(Dispatchers.IO) {
        val res = get("/api/devices/pair-poll?claim_token=$claimToken")
        if (res.isNull("device_token")) null else res.optString("device_token", "").ifEmpty { null }
    }

    // Besteht überhaupt eine Internetverbindung? Sonst Sync überspringen.
    // Bewusst NUR NET_CAPABILITY_INTERNET prüfen, nicht VALIDATED: Emulatoren (und manche
    // echten Netze) bestehen die Captive-Portal-Probe nicht und würden sonst fälschlich
    // als offline gelten. Bei echtem Offline ist activeNetwork null -> false.
    fun isOnline(ctx: Context): Boolean {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    // version: gemeldete App-Version (für den Update-Hinweis im Web), p=wear als Plattform.
    suspend fun deviceConfig(version: String = ""): JSONObject = withContext(Dispatchers.IO) {
        val q = if (version.isNotEmpty())
            "?v=" + java.net.URLEncoder.encode(version, "UTF-8") + "&p=wear" else "?p=wear"
        get("/api/devices/config$q")
    }

    // Letzte erfolgreiche Config cachen — damit die Uhr offline mit den zuletzt
    // bekannten Einstellungen sofort startklar ist.
    fun cacheConfig(ctx: Context, json: JSONObject) {
        ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .edit().putString("configCache", json.toString()).apply()
    }
    fun cachedConfig(ctx: Context): JSONObject? {
        val s = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .getString("configCache", null) ?: return null
        return try { JSONObject(s) } catch (_: Exception) { null }
    }

    suspend fun startSession(body: JSONObject) = withContext(Dispatchers.IO) {
        post("/api/ingest/session", body)
    }

    suspend fun uploadChunk(uuid: String, body: JSONObject) = withContext(Dispatchers.IO) {
        post("/api/ingest/session/$uuid/chunk", body)
    }

    suspend fun complete(uuid: String, endedAt: String, totalChunks: Int) = withContext(Dispatchers.IO) {
        post("/api/ingest/session/$uuid/complete",
            JSONObject().put("ended_at", endedAt).put("total_chunks", totalChunks))
    }

    private fun get(path: String): JSONObject {
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            deviceToken?.let { setRequestProperty("X-Device-Token", it) }
            connectTimeout = 15000; readTimeout = 30000
        }
        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.readText() ?: ""
        if (code !in 200..299) throw RuntimeException("HTTP $code: $text")
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    private fun post(path: String, body: JSONObject, auth: Boolean = true): JSONObject {
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            if (auth) deviceToken?.let { setRequestProperty("X-Device-Token", it) }
            connectTimeout = 15000; readTimeout = 30000
        }
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.readText() ?: ""
        if (code !in 200..299) throw RuntimeException("HTTP $code: $text")
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }
}
