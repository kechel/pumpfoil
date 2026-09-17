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
//            meta.json        {session_uuid, started_at, sport, gps_hz, accel_hz, accel_scale, app_version}
//            chunk-000000.json  {index, kind, encoding, t0_ms, count, data}
//            ...
//            complete.json    {ended_at, total_chunks}   (erst beim Stop -> "fertig aufgezeichnet")
object LocalStore {
    private fun root(ctx: Context) = File(ctx.filesDir, "sessions").apply { mkdirs() }

    // Eigene Layouts auf der Uhr: null = automatisch (Server-Voreinstellung), true = an, false = aus.
    // Dreistufig wie bei Garmin (SessionRecorder.layouts_pref): der Nutzer soll am Handgelenk
    // umstellen koennen, ohne dass der Server ihn ueberstimmt.
    private const val PREF_LAYOUTS = "layouts_pref"
    fun layoutsPref(ctx: Context): Boolean? {
        val p = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
        if (!p.contains(PREF_LAYOUTS)) return null
        return p.getBoolean(PREF_LAYOUTS, true)
    }
    fun setLayoutsPref(ctx: Context, v: Boolean?) {
        val e = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE).edit()
        if (v == null) e.remove(PREF_LAYOUTS) else e.putBoolean(PREF_LAYOUTS, v)
        e.apply()
    }
    // --- Lauf-Marke: hat die letzte Aufnahme sauber geendet? ---------------------------------
    //
    // Gegenstueck zum `run_canary` der Garmin-App (dort seit 1.0.77). Gesetzt beim Start einer
    // Aufnahme, geloescht beim sauberen Ende. Liegt sie beim naechsten App-Start noch da, ist die
    // App waehrend einer Aufnahme gestorben — und das erfahren wir sonst NIE.
    //
    // Anlass (u171, 17.09.2026): seine Session #8705 lief laut Zeitstempel 30,5 Minuten, GPS UND
    // Accel enden aber beide auf Sekunde 1619 von 1831. Die App war 3 Minuten 32 vorher weg, er
    // ist ahnungslos weitergefahren, und bei uns kam davon nichts an. Seine Worte: „Nach dem Run
    // schaue ich auf die Uhr und stelle fest, dass die Pumpfoil- und Workout-App neu gestartet
    // hatten und der Run verloren war."
    //
    // REIN DIAGNOSTISCH: daran haengt keine Abschaltung. Eine Uhr, die ihren Vordergrund-Dienst
    // regelmaessig abgeraeumt bekommt (bei manchen Herstellern der Normalfall), soll sich davon
    // nicht selbst Funktionen abklemmen.
    private const val PREF_LAUF_MARKE = "lauf_marke"
    fun setzeLaufMarke(ctx: Context) {
        ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .edit().putBoolean(PREF_LAUF_MARKE, true).apply()
    }
    fun loescheLaufMarke(ctx: Context) {
        ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .edit().remove(PREF_LAUF_MARKE).apply()
    }
    /** Lag die Marke noch? Der Aufruf LOESCHT sie — gemeldet werden soll das EREIGNIS, einmal. */
    fun holeUndLoescheLaufMarke(ctx: Context): Boolean {
        val p = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
        if (!p.getBoolean(PREF_LAUF_MARKE, false)) return false
        p.edit().remove(PREF_LAUF_MARKE).apply()
        return true
    }

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

    // Abgebrochene Aufnahmen: meta + Chunks vorhanden, aber KEIN complete.json (App-Crash/
    // -Kill vor dem Stopp). Würden sonst nie hochgeladen -> Datenverlust. Die aktive
    // Aufnahme (activeUuid) wird ausgenommen.
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
