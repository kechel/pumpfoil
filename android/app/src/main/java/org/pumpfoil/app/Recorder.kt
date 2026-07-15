package org.pumpfoil.app

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

// Handy-Recorder (Beta „Record on Phone"): puffert GPS (1 Hz) + Accel (~50 Hz), lädt in Chunks
// gemäß Raw-Ingest-Contract hoch. Android-Sensorik liefert RecorderService. Portiert aus dem
// Wear-Recorder (Wear OS = Android) — Puffer-/Lauf-/Upload-Logik identisch, ohne HR-Sensor.
object Recorder {
    const val ACCEL_HZ = 50          // Handys können hoch; >=15 Hz nötig für Pumps
    const val ACCEL_SCALE = 2048.0   // int16 2048 == 1 g
    private const val G = 9.80665

    @Volatile var accelHzActual = ACCEL_HZ

    data class State(
        val recording: Boolean = false,
        val elapsedSec: Long = 0,
        val speedKmh: Double = 0.0,
        val speed3sKmh: Double = 0.0,
        val avgSpeedKmh: Double = 0.0,
        val maxSpeedKmh: Double = 0.0,
        val distanceM: Double = 0.0,
        val gpsFix: Boolean = false,
        val status: String = "",
        val uploading: Boolean = false,
        val uploadSent: Int = 0,
        val uploadTotal: Int = 0,
        val uploadError: String = "",
        val pendingCount: Int = 0,
        val isFoiling: Boolean = false,
        val runCount: Int = 0,
        val runDurationMs: Long = 0,
        val runDistanceM: Double = 0.0,
        val runMaxSpeedKmh: Double = 0.0,
        val lastRunDurationMs: Long = 0,
        val lastRunDistanceM: Double = 0.0,
        val lastRunAvgSpeedKmh: Double = 0.0,
        val lastRunMaxSpeedKmh: Double = 0.0,
    )

    // Foil-/Lauf-Erkennung wie Garmin/Wear: rein ab ~10 km/h (4 s Dwell), raus unter ~9 km/h (3 s).
    private const val RUN_ENTER_DWELL = 4
    private const val RUN_EXIT_DWELL = 3
    private const val RUN_REARM_COOLDOWN_MS = 25000L
    private var runEndedMs = -100000L
    private var foilEnterStreak = 0
    private var foilExitStreak = 0
    private var foiling = false
    private var runStartMs = 0L
    private var runStartDist = 0.0
    private var runMaxMps = 0.0
    private var runCount = 0
    private var lastRunDurMs = 0L
    private var lastRunDistM = 0.0
    private var lastRunAvgMps = 0.0
    private var lastRunMaxMps = 0.0

    private fun updateFoilingRun(sp3Kmh: Double, tMs: Long, dist: Double, spMps: Double): Boolean {
        if (!foiling) {
            if (tMs - runEndedMs < RUN_REARM_COOLDOWN_MS) {
                foilEnterStreak = 0
            } else {
                foilEnterStreak = if (sp3Kmh >= 10.0) foilEnterStreak + 1 else 0
                if (foilEnterStreak >= RUN_ENTER_DWELL) {
                    foiling = true; foilExitStreak = 0
                    runStartMs = tMs - RUN_ENTER_DWELL * 1000L
                    runStartDist = dist
                    runMaxMps = spMps
                }
            }
        } else {
            if (spMps > runMaxMps) runMaxMps = spMps
            foilExitStreak = if (sp3Kmh < 9.0) foilExitStreak + 1 else 0
            if (foilExitStreak >= RUN_EXIT_DWELL) {
                foiling = false; foilEnterStreak = 0
                val durMs = (tMs - RUN_EXIT_DWELL * 1000L - runStartMs).coerceAtLeast(0)
                lastRunDurMs = durMs
                lastRunDistM = (dist - runStartDist).coerceAtLeast(0.0)
                lastRunAvgMps = if (durMs > 0) lastRunDistM / (durMs / 1000.0) else 0.0
                lastRunMaxMps = runMaxMps
                runCount++
                runEndedMs = tMs
            }
        }
        return foiling
    }

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    private val accel = ArrayList<Short>(16384)
    private var accelT0 = 0
    private val gps = ArrayList<DoubleArray>(256)
    private var prevLat = Double.NaN
    private var prevLon = Double.NaN
    private var distM = 0.0
    private var maxMps = 0.0
    private val spWin = ArrayList<DoubleArray>(8)

    private var uuid = ""
    private var startMs = 0L
    private var chunkIndex = 0
    private var running = false
    private var appCtx: Context? = null
    private var draining = false

    // Für die Session gewählte Foil (Metadaten) — auf dem Handy vor dem Start einstellbar.
    @Volatile var sessionFoilId: Int? = null

    private fun nowIso(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
    private fun elapsedMs() = (System.currentTimeMillis() - startMs).toInt()

    fun isRecording() = running

    fun start(ctx: Context) {
        if (running) return
        appCtx = ctx.applicationContext
        Ingest.load(ctx)
        accelHzActual = ACCEL_HZ
        uuid = UUID.randomUUID().toString()
        startMs = System.currentTimeMillis()
        chunkIndex = 0
        synchronized(lock) { accel.clear(); gps.clear(); spWin.clear() }
        prevLat = Double.NaN; prevLon = Double.NaN
        distM = 0.0; maxMps = 0.0
        val meta = JSONObject()
            .put("session_uuid", uuid)
            .put("started_at", nowIso())
            .put("sport", "pumpfoil")
            .put("gps_hz", 1)
            .put("accel_hz", accelHzActual)
            .put("accel_scale", ACCEL_SCALE.toInt())
            .put("placement", "phone")          // für spätere Handy-spezifische Analyse (Hüfte/Tasche)
        sessionFoilId?.let { meta.put("foil_id", it) }
        RecStore.writeMeta(ctx, uuid, meta)
        running = true
        foiling = false; foilEnterStreak = 0; foilExitStreak = 0; runEndedMs = -100000L
        runCount = 0; runStartMs = 0; runStartDist = 0.0; runMaxMps = 0.0
        lastRunDurMs = 0; lastRunDistM = 0.0; lastRunAvgMps = 0.0; lastRunMaxMps = 0.0
        _state.value = State(recording = true, status = "Aufnahme läuft",
            pendingCount = RecStore.pendingCount(ctx))
        scope.launch { flushLoop() }
    }

    fun stop() {
        if (!running) return
        running = false
        val ctx = appCtx ?: return
        scope.launch {
            _state.value = _state.value.copy(recording = false, status = "speichere…")
            flushAll()
            RecStore.writeComplete(ctx, uuid, JSONObject()
                .put("ended_at", nowIso()).put("total_chunks", chunkIndex))
            _state.value = _state.value.copy(
                status = "gespeichert", pendingCount = RecStore.pendingCount(ctx))
            drain(ctx)
        }
    }

    fun refreshPending(ctx: Context) {
        appCtx = ctx.applicationContext
        _state.value = _state.value.copy(pendingCount = RecStore.pendingCount(ctx))
    }

    /** Lädt fertig aufgezeichnete Sessions hoch (mintet bei Bedarf ein Phone-Device-Token). */
    fun drain(ctx: Context) {
        if (draining) return
        draining = true
        scope.launch {
            var failed = false
            try {
                recoverInterrupted(ctx)
                val pend = RecStore.pendingCount(ctx)
                _state.value = _state.value.copy(pendingCount = pend)
                if (pend == 0) return@launch
                if (!Ingest.isOnline(ctx)) {
                    _state.value = _state.value.copy(uploadError = "offline", uploading = false)
                    return@launch
                }
                if (Ingest.ensureToken(ctx) == null) {   // Mint fehlgeschlagen (offline/Login weg)
                    _state.value = _state.value.copy(uploadError = "offline", uploading = false)
                    return@launch
                }
                _state.value = _state.value.copy(uploadError = "")
                for (dir in RecStore.completedSessions(ctx)) {
                    try { uploadSession(ctx, dir) }
                    catch (e: IngestException) {
                        failed = true
                        if (e.status == 401) {
                            // Token serverseitig ungültig -> verwerfen, beim nächsten drain neu minten.
                            Ingest.clearToken(ctx)
                            _state.value = _state.value.copy(uploadError = "auth")
                            break
                        }
                        _state.value = _state.value.copy(
                            uploadError = if (Ingest.isOnline(ctx)) "server" else "offline")
                    }
                    catch (e: Exception) {
                        failed = true
                        _state.value = _state.value.copy(
                            uploadError = if (Ingest.isOnline(ctx)) "server" else "offline")
                    }
                }
            } finally {
                draining = false
                _state.value = _state.value.copy(
                    uploading = false, status = "",
                    pendingCount = RecStore.pendingCount(ctx),
                    uploadSent = 0, uploadTotal = 0,
                    uploadError = if (!failed) "" else _state.value.uploadError)
            }
        }
    }

    private fun recoverInterrupted(ctx: Context) {
        val active = if (running) uuid else null
        for (dir in RecStore.interruptedSessions(ctx, active)) {
            val n = RecStore.chunkFiles(dir).size
            if (n == 0) continue
            RecStore.writeComplete(ctx, dir.name, JSONObject()
                .put("ended_at", nowIso()).put("total_chunks", n))
        }
    }

    private suspend fun uploadSession(ctx: Context, dir: java.io.File) {
        val meta = RecStore.readJson(java.io.File(dir, "meta.json")) ?: return
        val sid = meta.getString("session_uuid")
        val chunkFiles = RecStore.chunkFiles(dir)
        val res = Ingest.startSession(meta)
        val received = HashSet<Int>()
        res.optJSONArray("received_chunks")?.let { a ->
            for (i in 0 until a.length()) received.add(a.getInt(i))
        }
        _state.value = _state.value.copy(
            uploading = true, status = "lade hoch…", uploadError = "",
            uploadTotal = chunkFiles.size, uploadSent = received.size.coerceAtMost(chunkFiles.size))
        for (cf in chunkFiles) {
            val chunk = RecStore.readJson(cf) ?: continue
            if (chunk.optInt("index", -1) in received) continue
            Ingest.uploadChunk(sid, chunk)
            _state.value = _state.value.copy(uploadSent = (_state.value.uploadSent + 1).coerceAtMost(chunkFiles.size))
        }
        val comp = RecStore.readJson(java.io.File(dir, "complete.json"))
        Ingest.complete(sid, comp?.optString("ended_at") ?: nowIso(), comp?.optInt("total_chunks") ?: chunkIndex)
        RecStore.delete(ctx, sid)
    }

    // --- Sensor-Eingang (vom Service) ---

    fun addAccel(x: Float, y: Float, z: Float) {
        if (!running) return
        synchronized(lock) {
            if (accel.isEmpty()) accelT0 = elapsedMs()
            accel.add(toI16(x / G * ACCEL_SCALE))
            accel.add(toI16(y / G * ACCEL_SCALE))
            accel.add(toI16(z / G * ACCEL_SCALE))
        }
    }

    fun addGps(lat: Double, lon: Double, speedMps: Double, accuracyM: Double) {
        if (!running) return
        val tMs = elapsedMs()
        val sp = maxOf(0.0, speedMps)
        synchronized(lock) {
            gps.add(doubleArrayOf(tMs.toDouble(), lat, lon, sp, 0.0, accuracyM))
            if (!prevLat.isNaN()) distM += haversine(prevLat, prevLon, lat, lon)
            prevLat = lat; prevLon = lon
            if (sp > maxMps) maxMps = sp
            spWin.add(doubleArrayOf(tMs.toDouble(), sp))
            while (spWin.isNotEmpty() && tMs - spWin[0][0] > 3000) spWin.removeAt(0)
        }
        val sec = (tMs / 1000.0).coerceAtLeast(1.0)
        val sp3 = if (spWin.isEmpty()) sp else spWin.sumOf { it[1] } / spWin.size
        val nowFoiling = updateFoilingRun(sp3 * 3.6, tMs.toLong(), distM, sp)
        val runDur = if (nowFoiling) (tMs.toLong() - runStartMs).coerceAtLeast(0) else lastRunDurMs
        val runDist = if (nowFoiling) (distM - runStartDist).coerceAtLeast(0.0) else lastRunDistM
        val runMax = if (nowFoiling) runMaxMps else lastRunMaxMps
        _state.value = _state.value.copy(
            speedKmh = sp * 3.6,
            speed3sKmh = sp3 * 3.6,
            maxSpeedKmh = maxMps * 3.6,
            distanceM = distM,
            avgSpeedKmh = distM / sec * 3.6,
            elapsedSec = (tMs / 1000).toLong(),
            gpsFix = true,
            isFoiling = nowFoiling,
            runCount = runCount,
            runDurationMs = runDur,
            runDistanceM = runDist,
            runMaxSpeedKmh = runMax * 3.6,
            lastRunDurationMs = lastRunDurMs,
            lastRunDistanceM = lastRunDistM,
            lastRunAvgSpeedKmh = lastRunAvgMps * 3.6,
            lastRunMaxSpeedKmh = lastRunMaxMps * 3.6,
        )
    }

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val p1 = Math.toRadians(lat1); val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1); val dl = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2)
        return 2 * r * Math.asin(Math.min(1.0, Math.sqrt(a)))
    }

    private fun toI16(v: Double): Short =
        maxOf(-32768.0, minOf(32767.0, Math.round(v).toDouble())).toInt().toShort()

    // --- Flush / Upload ---

    private suspend fun flushLoop() {
        while (running) { delay(10_000); flushAll() }
    }
    private fun flushAll() { flushAccel(); flushGps() }

    private fun flushAccel() {
        val ctx = appCtx ?: return
        val buf: ShortArray; val t0: Int
        synchronized(lock) {
            if (accel.isEmpty()) return
            buf = ShortArray(accel.size) { accel[it] }; t0 = accelT0
            accel.clear()
        }
        val bb = ByteBuffer.allocate(buf.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (s in buf) bb.putShort(s)
        val b64 = Base64.encodeToString(bb.array(), Base64.NO_WRAP)
        RecStore.writeChunk(ctx, uuid, chunkIndex, JSONObject()
            .put("index", chunkIndex).put("kind", "accel").put("encoding", "int16-b64")
            .put("t0_ms", t0).put("count", buf.size / 3).put("data", b64))
        chunkIndex++
    }

    private fun flushGps() {
        val ctx = appCtx ?: return
        val buf: List<DoubleArray>
        synchronized(lock) {
            if (gps.isEmpty()) return
            buf = ArrayList(gps); gps.clear()
        }
        val arr = JSONArray()
        for (s in buf) { val a = JSONArray(); for (v in s) a.put(v); arr.put(a) }
        RecStore.writeChunk(ctx, uuid, chunkIndex, JSONObject()
            .put("index", chunkIndex).put("kind", "gps").put("encoding", "json")
            .put("t0_ms", buf.first()[0].toInt()).put("count", buf.size).put("data", arr))
        chunkIndex++
    }
}
