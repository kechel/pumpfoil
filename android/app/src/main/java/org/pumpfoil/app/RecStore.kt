package org.pumpfoil.app

import android.content.Context
import org.json.JSONObject
import java.io.File

// Persistente Ablage der auf dem HANDY aufgezeichneten Sessions (Beta „Record on Phone").
// Aufnahme schreibt IMMER zuerst hierhin (crash-/offline-sicher); Recorder.drain lädt später
// hoch. Layout: filesDir/phone-sessions/<uuid>/{meta.json, chunk-000000.json…, complete.json}.
// Eigenes Verzeichnis (getrennt von evtl. anderen Quellen). 1:1 aus dem Wear-Recorder portiert.
object RecStore {
    private fun root(ctx: Context) = File(ctx.filesDir, "phone-sessions").apply { mkdirs() }
    fun dir(ctx: Context, uuid: String) = File(root(ctx), uuid).apply { mkdirs() }

    fun writeMeta(ctx: Context, uuid: String, meta: JSONObject) =
        File(dir(ctx, uuid), "meta.json").writeText(meta.toString())

    fun writeChunk(ctx: Context, uuid: String, index: Int, chunk: JSONObject) =
        File(dir(ctx, uuid), "chunk-%06d.json".format(index)).writeText(chunk.toString())

    fun writeComplete(ctx: Context, uuid: String, complete: JSONObject) =
        File(dir(ctx, uuid), "complete.json").writeText(complete.toString())

    fun delete(ctx: Context, uuid: String) { dir(ctx, uuid).deleteRecursively() }

    fun completedSessions(ctx: Context): List<File> =
        root(ctx).listFiles()
            ?.filter { it.isDirectory && File(it, "complete.json").exists() }
            ?.sortedBy { File(it, "meta.json").lastModified() } ?: emptyList()

    fun pendingCount(ctx: Context): Int = completedSessions(ctx).size

    fun interruptedSessions(ctx: Context, activeUuid: String?): List<File> =
        root(ctx).listFiles()
            ?.filter {
                it.isDirectory && it.name != activeUuid &&
                    File(it, "meta.json").exists() &&
                    !File(it, "complete.json").exists() &&
                    chunkFiles(it).isNotEmpty()
            }
            ?.sortedBy { File(it, "meta.json").lastModified() } ?: emptyList()

    fun readJson(f: File): JSONObject? = try { JSONObject(f.readText()) } catch (_: Exception) { null }

    fun chunkFiles(dir: File): List<File> =
        dir.listFiles()?.filter { it.name.startsWith("chunk-") }?.sortedBy { it.name } ?: emptyList()

    // Kind eines Chunks (gps/accel) günstig aus dem Datei-Kopf lesen, OHNE die große data-
    // Payload zu parsen (Chunk-JSON beginnt mit {"index":N,"kind":"…"). Der Uploader sortiert
    // damit GPS-first, ohne alle Chunks vorab komplett in den Speicher zu laden.
    fun chunkKind(f: File): String = try {
        val head = f.inputStream().use { ins ->
            val b = ByteArray(64); val n = ins.read(b); if (n <= 0) "" else String(b, 0, n)
        }
        when {
            head.contains("\"kind\":\"gps\"") -> "gps"
            head.contains("\"kind\":\"accel\"") -> "accel"
            else -> ""
        }
    } catch (_: Exception) { "" }
}
