package org.pumpfoil.app

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

// Lokaler Disk-Cache fürs Session-Detail (schwere Payload: Track/Segmente/Accel).
// Schlüssel = Session-ID; gültig, solange data_version (server „zuletzt geändert") passt.
// Eviction: Einträge, die >90 Tage nicht genutzt wurden (lastModified), werden verworfen.
object SessionCache {
    private const val TTL_MS = 90L * 24 * 3600 * 1000
    private val json = Json { ignoreUnknownKeys = true }
    @Volatile private var dir: File? = null

    // Beim App-Start aufrufen: Cache-Verzeichnis setzen + alte Einträge räumen.
    fun init(ctx: Context) {
        val d = File(ctx.cacheDir, "session-detail").apply { mkdirs() }
        dir = d
        val cutoff = System.currentTimeMillis() - TTL_MS
        d.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
    }

    // `schema`: Stand des App-Datenmodells. Aendert sich SessionDetail (neues Feld wie das Gewicht
    // je Session, 07.10.2026), gelten alte Eintraege nicht mehr — sie wurden OHNE das Feld
    // gespeichert und wuerden es sonst so lange verschweigen, bis sich die Session aendert.
    // `etag`: zum billigen Nachfragen beim Server (304, s. Api.sessionPruefen).
    @Serializable private data class Entry(val version: Long, val detail: SessionDetail,
                                           val schema: Int = 0, val etag: String? = null)
    private const val SCHEMA = 3   // 3: Metrics.modelSkipped (07.10.2026)

    // Cache-Treffer nur, wenn version == erwarteter data_version (aus der Liste); aktualisiert
    // die mtime (LRU) und gibt das Detail zurück, sonst null (-> laden).
    fun load(id: Int, expectedVersion: Long?): SessionDetail? {
        val d = dir ?: return null
        if (expectedVersion == null) return null
        val f = File(d, "$id.json")
        if (!f.exists()) return null
        return try {
            val e = json.decodeFromString(Entry.serializer(), f.readText())
            if (e.version != expectedVersion || e.schema != SCHEMA) null
            else { f.setLastModified(System.currentTimeMillis()); e.detail }
        } catch (_: Exception) { null }
    }

    fun store(detail: SessionDetail, etag: String? = null) {
        val d = dir ?: return
        val v = detail.dataVersion ?: return
        try {
            File(d, "${detail.id}.json").writeText(json.encodeToString(Entry.serializer(), Entry(v, detail, SCHEMA, etag)))
        } catch (_: Exception) {}
    }

    /** ETag des gespeicherten Eintrags (fuer das Nachfragen), sonst null. */
    fun etag(id: Int): String? {
        val f = File(dir ?: return null, "$id.json")
        if (!f.exists()) return null
        return try { json.decodeFromString(Entry.serializer(), f.readText()).etag } catch (_: Exception) { null }
    }
}
