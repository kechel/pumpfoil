package org.pumpfoil.watch

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

// Gemeinsame Aufnahme-Logik (Singleton): puffert GPS (1 Hz) + Accel (25 Hz) + HR,
// lädt in Chunks gemäß Raw-Ingest-Contract. Die Android-Sensorik liefert RecorderService.
object Recorder {
    const val ACCEL_HZ = 25
    const val ACCEL_SCALE = 2048.0   // int16 2048 == 1 g
    private const val G = 9.80665

    data class State(
        val recording: Boolean = false,
        val elapsedSec: Long = 0,
        val speedKmh: Double = 0.0,
        val hr: Int = 0,
        val status: String = "",
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    private val accel = ArrayList<Short>(8192)
    private var accelT0 = 0
    private val gps = ArrayList<DoubleArray>(256)
    private var lastHr = 0

    private var uuid = ""
    private var startMs = 0L
    private var chunkIndex = 0
    private var running = false

    private fun nowIso(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
    private fun elapsedMs() = (System.currentTimeMillis() - startMs).toInt()

    fun start(ctx: Context) {
        if (running) return
        Api.load(ctx)
        uuid = UUID.randomUUID().toString()
        startMs = System.currentTimeMillis()
        chunkIndex = 0
        synchronized(lock) { accel.clear(); gps.clear() }
        _state.value = State(recording = false, status = "starte…")
        scope.launch {
            try {
                Api.startSession(JSONObject()
                    .put("session_uuid", uuid)
                    .put("started_at", nowIso())
                    .put("sport", "pumpfoil")
                    .put("gps_hz", 1)
                    .put("accel_hz", ACCEL_HZ)
                    .put("accel_scale", ACCEL_SCALE.toInt()))
                running = true
                _state.value = _state.value.copy(recording = true, status = "Aufnahme läuft")
                flushLoop()
            } catch (e: Exception) {
                _state.value = _state.value.copy(status = "Start fehlgeschlagen: ${e.message}")
            }
        }
    }

    fun stop() {
        if (!running) return
        running = false
        scope.launch {
            _state.value = _state.value.copy(recording = false, status = "lade Rest hoch…")
            flushAll()
            try {
                Api.complete(uuid, nowIso(), chunkIndex)
                _state.value = _state.value.copy(status = "fertig & hochgeladen")
            } catch (e: Exception) {
                _state.value = _state.value.copy(status = "Abschluss fehlgeschlagen: ${e.message}")
            }
        }
    }

    // --- Sensor-Eingang (vom Service aufgerufen) ---

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
        val t = elapsedMs().toDouble()
        synchronized(lock) {
            gps.add(doubleArrayOf(t, lat, lon, maxOf(0.0, speedMps), lastHr.toDouble(), accuracyM))
        }
        _state.value = _state.value.copy(speedKmh = maxOf(0.0, speedMps) * 3.6,
            elapsedSec = (elapsedMs() / 1000).toLong())
    }
    fun setHr(bpm: Int) {
        lastHr = bpm
        if (running) _state.value = _state.value.copy(hr = bpm)
    }

    private fun toI16(v: Double): Short =
        maxOf(-32768.0, minOf(32767.0, Math.round(v).toDouble())).toInt().toShort()

    // --- Flush / Upload ---

    private suspend fun flushLoop() {
        while (running) {
            delay(10_000)
            flushAll()
        }
    }
    private suspend fun flushAll() { flushAccel(); flushGps() }

    private suspend fun flushAccel() {
        val buf: ShortArray; val t0: Int
        synchronized(lock) {
            if (accel.isEmpty()) return
            buf = ShortArray(accel.size) { accel[it] }; t0 = accelT0
            accel.clear()
        }
        val bb = ByteBuffer.allocate(buf.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (s in buf) bb.putShort(s)
        val b64 = Base64.encodeToString(bb.array(), Base64.NO_WRAP)
        try {
            Api.uploadChunk(uuid, JSONObject()
                .put("index", chunkIndex).put("kind", "accel").put("encoding", "int16-b64")
                .put("t0_ms", t0).put("count", buf.size / 3).put("data", b64))
            chunkIndex++
        } catch (e: Exception) {
            synchronized(lock) { val old = ArrayList<Short>(buf.size); for (s in buf) old.add(s); old.addAll(accel); accel.clear(); accel.addAll(old) }
        }
    }

    private suspend fun flushGps() {
        val buf: List<DoubleArray>
        synchronized(lock) {
            if (gps.isEmpty()) return
            buf = ArrayList(gps); gps.clear()
        }
        val arr = JSONArray()
        for (s in buf) { val a = JSONArray(); for (v in s) a.put(v); arr.put(a) }
        try {
            Api.uploadChunk(uuid, JSONObject()
                .put("index", chunkIndex).put("kind", "gps").put("encoding", "json")
                .put("t0_ms", buf.first()[0].toInt()).put("count", buf.size).put("data", arr))
            chunkIndex++
        } catch (e: Exception) {
            synchronized(lock) { val merged = ArrayList(buf); merged.addAll(gps); gps.clear(); gps.addAll(merged) }
        }
    }
}
