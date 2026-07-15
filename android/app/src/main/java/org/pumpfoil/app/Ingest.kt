package org.pumpfoil.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class IngestException(val status: Int, msg: String) : Exception(msg)

// Ingest-Client für den Handy-Recorder. Das Handy ist per JWT eingeloggt, der Ingest braucht
// aber ein Device-Token -> wir minten uns eins (Label "Phone", via Api.mintDeviceToken) und
// laden GPS/Accel-Chunks über den Raw-Ingest-Contract hoch (X-Device-Token). Getrennt von der
// JWT-Api, damit sich beides nicht vermischt.
object Ingest {
    @Volatile var deviceToken: String? = null
    private const val PREF = "phone_device_token"
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)

    fun load(ctx: Context) { deviceToken = prefs(ctx).getString(PREF, null) }
    fun clearToken(ctx: Context) { deviceToken = null; prefs(ctx).edit().remove(PREF).apply() }
    private fun saveToken(ctx: Context, t: String) {
        deviceToken = t; prefs(ctx).edit().putString(PREF, t).apply()
    }

    // Sicherstellen, dass ein Phone-Device-Token existiert (mintet per JWT, falls nötig).
    suspend fun ensureToken(ctx: Context): String? {
        deviceToken?.let { return it }
        load(ctx)
        deviceToken?.let { return it }
        return try { saveToken(ctx, Api.mintDeviceToken("Phone")); deviceToken } catch (_: Exception) { null }
    }

    fun isOnline(ctx: Context): Boolean {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val n = cm.activeNetwork ?: return false
        val c = cm.getNetworkCapabilities(n) ?: return false
        return c.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    suspend fun startSession(meta: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        JSONObject(post("/api/ingest/session", meta.toString()))
    }
    suspend fun uploadChunk(uuid: String, chunk: JSONObject): Unit = withContext(Dispatchers.IO) {
        post("/api/ingest/session/$uuid/chunk", chunk.toString()); Unit
    }
    suspend fun complete(uuid: String, endedAt: String, totalChunks: Int): Unit = withContext(Dispatchers.IO) {
        post("/api/ingest/session/$uuid/complete",
            JSONObject().put("ended_at", endedAt).put("total_chunks", totalChunks).toString()); Unit
    }

    private fun post(path: String, body: String): String {
        val c = URL(Api.BASE + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15000; c.readTimeout = 30000
            c.setRequestProperty("Content-Type", "application/json")
            deviceToken?.let { c.setRequestProperty("X-Device-Token", it) }
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            if (code !in 200..299) {
                val err = (c.errorStream ?: c.inputStream)?.bufferedReader()?.use { it.readText() } ?: ""
                throw IngestException(code, err)
            }
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }
}
