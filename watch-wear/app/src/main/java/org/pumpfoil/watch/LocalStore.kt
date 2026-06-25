package org.pumpfoil.watch

import android.content.Context
import org.json.JSONObject
import java.io.File

// Persistente Ablage aufgezeichneter Sessions auf der Uhr. Die Aufnahme schreibt
// IMMER zuerst hierhin (crash- und offline-sicher); ein Uploader (Recorder.drain)
// lädt später hoch, sobald die Uhr gepairt + online ist. So kann man auch ohne
// Pairing aufnehmen und die Sessions nachträglich synchronisieren.
//
// Layout:  filesDir/sessions/<uuid>/
//            meta.json        {session_uuid, started_at, sport, gps_hz, accel_hz, accel_scale}
//            chunk-000000.json  {index, kind, encoding, t0_ms, count, data}
//            ...
//            complete.json    {ended_at, total_chunks}   (erst beim Stop -> "fertig aufgezeichnet")
object LocalStore {
    private fun root(ctx: Context) = File(ctx.filesDir, "sessions").apply { mkdirs() }
    fun dir(ctx: Context, uuid: String) = File(root(ctx), uuid).apply { mkdirs() }

    fun writeMeta(ctx: Context, uuid: String, meta: JSONObject) =
        File(dir(ctx, uuid), "meta.json").writeText(meta.toString())

    fun writeChunk(ctx: Context, uuid: String, index: Int, chunk: JSONObject) =
        File(dir(ctx, uuid), "chunk-%06d.json".format(index)).writeText(chunk.toString())

    fun writeComplete(ctx: Context, uuid: String, complete: JSONObject) =
        File(dir(ctx, uuid), "complete.json").writeText(complete.toString())

    fun delete(ctx: Context, uuid: String) { dir(ctx, uuid).deleteRecursively() }

    // Vollständig aufgezeichnete Sessions (haben complete.json), älteste zuerst.
    fun completedSessions(ctx: Context): List<File> =
        root(ctx).listFiles()
            ?.filter { it.isDirectory && File(it, "complete.json").exists() }
            ?.sortedBy { File(it, "meta.json").lastModified() } ?: emptyList()

    fun pendingCount(ctx: Context): Int = completedSessions(ctx).size

    fun readJson(f: File): JSONObject? = try { JSONObject(f.readText()) } catch (_: Exception) { null }

    fun chunkFiles(dir: File): List<File> =
        dir.listFiles()?.filter { it.name.startsWith("chunk-") }?.sortedBy { it.name } ?: emptyList()
}
