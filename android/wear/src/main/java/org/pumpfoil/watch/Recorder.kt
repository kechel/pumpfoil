package org.pumpfoil.watch

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.util.concurrent.atomic.AtomicInteger
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
    const val ACCEL_HZ_LITE = 10     // sparsamer Modus für speicherarme Uhren
    const val ACCEL_SCALE = 2048.0   // int16 2048 == 1 g
    private const val G = 9.80665

    // Aufzeichnungsmodus: "full" = Accel 25 Hz | "lite" = 10 Hz | "gps" = nur GPS.
    // Aus der Config (pro Konto) gesetzt; RecorderService liest accelHzActual/recordMode.
    @Volatile var recordMode = "full"
    @Volatile var accelHzActual = ACCEL_HZ

    data class State(
        val recording: Boolean = false,
        val starting: Boolean = false,    // Startphase (GPS/Session) — Start-Button ausblenden
        val elapsedSec: Long = 0,
        val speedKmh: Double = 0.0,       // aktuell
        // Schlechtes GPS (hAcc > 20 m): Anzeige zeigt "--" statt Phantom-Tempo (Nutzer-Video
        // 05.08.: 100 km/h im Stehen am Steg). Rohdaten bleiben ungefiltert (Server filtert,
        // hAcc geht mit); der Gate wirkt nur auf Live-Anzeige + On-Watch-Lauf-Erkennung.
        val gpsPoor: Boolean = false,
        // Standort-Berechtigung fehlt -> der Service bekommt GAR KEINE Fixes. Feldbefund
        // 05.08.: vier Sessions ueber Stunden mit 1000+ Accel-Chunks und 0 GPS-Punkten, weil
        // die SecurityException still verschluckt wurde. Jetzt sichtbar statt stumm.
        val gpsDenied: Boolean = false,
        val gpsFixes: Int = 0,            // Anzahl empfangener Positionen (0 = kein Signal)
        val speed3sKmh: Double = 0.0,     // 3-s-Mittel
        val avgSpeedKmh: Double = 0.0,    // Distanz/Zeit
        val maxSpeedKmh: Double = 0.0,
        val distanceM: Double = 0.0,
        val hr: Int = 0,
        val avgHr: Int = 0,
        val maxHr: Int = 0,
        // Wie viele Puls-Werte ueberhaupt angekommen sind. 0 nach einer ganzen Aufnahme heisst:
        // der Sensor hat nie geliefert (Feldbefund u171, Xiaomi Watch 2 Pro: 11 Sessions, 0 Puls,
        // Berechtigung erteilt). Ohne diesen Zaehler scheitert der Puls STILL — s. RecorderService.
        val hrSamples: Int = 0,
        val status: String = "",
        val uploading: Boolean = false,   // aktiver Chunk-Upload (für UI-Indikator)
        val uploadSent: Int = 0,          // bestätigte Chunks der laufenden Session (Fortschritt)
        val uploadTotal: Int = 0,         // Gesamt-Chunks der laufenden Session
        val uploadError: String = "",     // letzte Fehlerursache: "" | "offline" | "server"
        val pendingCount: Int = 0,        // lokal gespeicherte, noch nicht hochgeladene Sessions
        val isFoiling: Boolean = false,   // On-Watch-Erkennung (Hysterese) für Auto-Screen-Wechsel
        // Lauf-Metriken (wie Garmin _updateRun): aktueller Lauf live, sonst letzter.
        val runCount: Int = 0,
        val runDurationMs: Long = 0,      // aktueller Lauf (foilend) bzw. letzter Lauf
        val runDistanceM: Double = 0.0,
        val runMaxSpeedKmh: Double = 0.0, // Max im aktuellen Lauf
        val lastRunDurationMs: Long = 0,
        val lastRunDistanceM: Double = 0.0,
        val lastRunAvgSpeedKmh: Double = 0.0,
        val lastRunMaxSpeedKmh: Double = 0.0,
        // Hoechstpuls IM letzten Lauf (Feld 21). Der Session-Hoechstpuls ist maxHr (Feld 9) —
        // je Lauf fuehrt den niemand, also hier selbst mitschreiben wie das Lauf-Hoechsttempo.
        val lastRunMaxHr: Int = 0,
    )

    // Foil-/Lauf-Erkennung wie Garmin: rein ab ~10 km/h (4 s Dwell), raus unter ~9 km/h (3 s).
    private const val RUN_ENTER_DWELL = 4   // träge: Waten/Steg-Gang soll keinen Phantom-Lauf auslösen
    private const val RUN_EXIT_DWELL = 3
    // Nach Lauf-Ende Sperre, bevor ein neuer Lauf starten darf (Zurückschwimmen/Waten).
    private const val RUN_REARM_COOLDOWN_MS = 25000L
    private var runEndedMs = -100000L
    private var foilEnterStreak = 0
    private var foilExitStreak = 0
    private var foiling = false
    // Lauf-Metriken
    private var runStartMs = 0L
    private var runStartDist = 0.0
    private var runMaxMps = 0.0
    private var runCount = 0
    // Max-Speed saeubern — dieselben zwei Regeln wie der Server (analysis/gps.py):
    //   1) BURST: mehr als BURST_MARGIN ueber dem 15-s-Median UND absolut ueber 28 km/h
    //      -> mehrsekuendiger Doppler-Burst, es gilt der Median.
    //   2) DECKEL: ueber 32 km/h ist es kein Pumpfoil mehr (Glitch/Boot) -> zaehlt nicht.
    // Gemessen an 119 echten Sessions (26.08.): der Uhr-Maxwert lag im Mittel 9,4 km/h ueber dem
    // ausgewerteten, schlimmster Fall 164 km/h. Mit den Regeln: Mittel +3,1, schlimmster +17,4.
    // Die ANZEIGE des Momentanwerts bleibt unangetastet — dort ist ein Ausreisser nach einer
    // Sekunde wieder weg, im Maximum bliebe er die ganze Session stehen.
    private val burstRing = DoubleArray(15) { -1.0 }
    private var burstPos = 0
    // Gesaeuberter Wert des LAUFENDEN Fixes: maxKandidat() darf pro Fix nur EINMAL laufen, sonst
    // stehen zwei Eintraege im 15-s-Ring und das Fenster ist nur halb so lang.
    private var spdMaxClean = 0.0
    private var minSpeedSeitEnde = 99.0     // kleinster Speed seit dem letzten Lauf-Ende
    private var runIstFortsetzung = false   // setzt den vorigen Lauf fort -> nicht neu zaehlen
    private var lastRunDurMs = 0L
    private var lastRunDistM = 0.0
    private var lastRunAvgMps = 0.0
    private var lastRunMaxMps = 0.0
    private var runMaxHr = 0
    private var lastRunMaxHr = 0

    /** Wert fuer den HOECHSTWERT saeubern (s. burstRing). */
    private fun maxKandidat(v: Double): Double {
        burstRing[burstPos] = v
        burstPos = (burstPos + 1) % burstRing.size
        val vals = burstRing.filter { it >= 0.0 }.sorted()
        val med = if (vals.isEmpty()) 0.0 else vals[vals.size / 2]
        var w = v
        if (w > med + 5.0 && w > 28.0 / 3.6) w = med
        return if (w > 32.0 / 3.6) 0.0 else w
    }

    // Lauf-Erkennung mit Hysterese; pflegt bei Flanken die Lauf-Metriken (tMs/dist/sp in SI).
    private fun updateFoilingRun(sp3Kmh: Double, tMs: Long, dist: Double, spMps: Double): Boolean {
        if (!foiling) {
            // Re-Arm-Cooldown: direkt nach Lauf-Ende keinen neuen Lauf zulassen.
            if (tMs - runEndedMs < RUN_REARM_COOLDOWN_MS) {
                foilEnterStreak = 0
            } else {
                if (spMps < minSpeedSeitEnde) minSpeedSeitEnde = spMps
                foilEnterStreak = if (sp3Kmh >= 10.0) foilEnterStreak + 1 else 0
                if (foilEnterStreak >= RUN_ENTER_DWELL) {
                    foiling = true; foilExitStreak = 0
                    // Kein echter Stopp seit dem letzten Lauf-Ende -> derselbe Lauf. Der Server
                    // fuehrt die beiden zusammen (_merge_no_stop, ohne Zeitfenster), also zaehlt
                    // die Uhr sie auch als einen.
                    runIstFortsetzung = runCount > 0 && minSpeedSeitEnde >= 1.5
                    minSpeedSeitEnde = 99.0
                    // Lauf-Start auf den Dwell-Beginn zurückdatieren (wie Garmin).
                    runStartMs = tMs - RUN_ENTER_DWELL * 1000L
                    runStartDist = dist
                    runMaxMps = spdMaxClean
                    runMaxHr = if (lastHr > 0) lastHr else 0
                }
            }
        } else {
            if (spdMaxClean > runMaxMps) runMaxMps = spdMaxClean
            if (lastHr > runMaxHr) runMaxHr = lastHr
            foilExitStreak = if (sp3Kmh < 9.0) foilExitStreak + 1 else 0
            if (foilExitStreak >= RUN_EXIT_DWELL) {
                foiling = false; foilEnterStreak = 0
                // Lauf-Ende auf den Dwell-Beginn zurückdatieren; Kennzahlen festhalten.
                val durMs = (tMs - RUN_EXIT_DWELL * 1000L - runStartMs).coerceAtLeast(0)
                lastRunDurMs = durMs
                lastRunDistM = (dist - runStartDist).coerceAtLeast(0.0)
                lastRunAvgMps = if (durMs > 0) lastRunDistM / (durMs / 1000.0) else 0.0
                lastRunMaxMps = runMaxMps
                lastRunMaxHr = runMaxHr
                runMaxHr = 0
                if (!runIstFortsetzung) runCount++
                runIstFortsetzung = false
                minSpeedSeitEnde = 99.0
                runEndedMs = tMs   // Re-Arm-Cooldown starten
            }
        }
        return foiling
    }

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    private val accel = ArrayList<Short>(8192)
    private var accelT0 = 0
    private val gps = ArrayList<DoubleArray>(256)
    private var lastHr = 0
    // Live-Kennzahlen
    private var prevLat = Double.NaN
    private var prevLon = Double.NaN
    private var distM = 0.0
    private var maxMps = 0.0
    private var hrSum = 0L
    private var hrCount = 0
    private var maxHrV = 0
    private val spWin = ArrayList<DoubleArray>(8)  // [t_ms, mps] für 3-s-Fenster

    private var uuid = ""
    private var startMs = 0L
    private var chunkIndex = 0
    private var running = false
    private var appCtx: Context? = null
    private var draining = false

    private fun nowIso(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
    private fun elapsedMs() = (System.currentTimeMillis() - startMs).toInt()

    // Aufnahme startet rein lokal: KEIN Netz nötig (kein Pairing, kein Online).
    // Rohdaten werden persistent in den LocalStore geschrieben; der Upload passiert
    // später per drain(), sobald die Uhr gepairt + online ist.
    var sessionFoilId: Int? = null   // auf der Uhr gewählte Foil (Metadaten) -> foil_id im Meta

    fun start(ctx: Context) {
        if (running) return
        appCtx = ctx.applicationContext
        Api.load(ctx)
        // Aufzeichnungsmodus aus den gecachten Einstellungen (pro Konto), offline-tauglich.
        recordMode = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .getString("record_mode", "full") ?: "full"
        accelHzActual = if (recordMode == "lite") ACCEL_HZ_LITE else ACCEL_HZ
        uuid = UUID.randomUUID().toString()
        startMs = System.currentTimeMillis()
        chunkIndex = 0
        synchronized(lock) { accel.clear(); gps.clear(); spWin.clear() }
        prevLat = Double.NaN; prevLon = Double.NaN
        distM = 0.0; maxMps = 0.0; hrSum = 0; hrCount = 0; maxHrV = 0; lastHr = 0
        val meta = JSONObject()
            .put("session_uuid", uuid)
            .put("started_at", nowIso())
            .put("sport", "pumpfoil")
            .put("gps_hz", 1)
            .put("accel_hz", accelHzActual)
            .put("accel_scale", ACCEL_SCALE.toInt())
        // Eigene App-Version zur Session (Server: sessions.app_version). Zum Aufnahmezeitpunkt in
        // meta.json festgeschrieben -> ein spät hochgeladener Alt-Mitschnitt behält die Version, mit
        // der er aufgenommen wurde (der Fallback über DeviceToken.app_version wäre dann schon weiter).
        // Leerer Wert würde die Server-Prüfung verletzen -> weglassen.
        appVersion(ctx).takeIf { it.isNotBlank() }?.let { meta.put("app_version", it) }
        sessionFoilId?.let { meta.put("foil_id", it) }   // gewählte Foil (Metadaten), unabhängig vom Alarm
        LocalStore.writeMeta(ctx, uuid, meta)
        running = true
        foiling = false; foilEnterStreak = 0; foilExitStreak = 0; runEndedMs = -100000L
        runCount = 0; runStartMs = 0; runStartDist = 0.0; runMaxMps = 0.0
        lastRunDurMs = 0; lastRunDistM = 0.0; lastRunAvgMps = 0.0; lastRunMaxMps = 0.0
        runMaxHr = 0; lastRunMaxHr = 0
        _state.value = State(recording = true, status = I18n.t("rec.recording"),
            pendingCount = LocalStore.pendingCount(ctx))
        scope.launch { flushLoop() }
    }

    fun stop() {
        if (!running) return
        running = false
        val ctx = appCtx ?: return
        scope.launch {
            _state.value = _state.value.copy(recording = false, status = I18n.t("rec.saving"))
            flushAll()
            LocalStore.writeComplete(ctx, uuid, JSONObject()
                .put("ended_at", nowIso()).put("total_chunks", chunkIndex))
            _state.value = _state.value.copy(
                status = I18n.t("saved.title"), pendingCount = LocalStore.pendingCount(ctx))
            drain(ctx)   // sofort hochladen, falls gepairt + online
        }
    }

    /** Aufnahme VERWERFEN: beenden und lokal löschen — KEIN complete, KEIN Upload. Ganzer
     *  Session-Ordner weg (kein meta.json) -> wird auch nicht als „interrupted" später hochgeladen. */
    fun discard() {
        if (!running) return
        running = false   // stoppt flushLoop + Sensor-Ingestion
        val ctx = appCtx ?: return
        val sid = uuid
        scope.launch {
            LocalStore.delete(ctx, sid)
            _state.value = _state.value.copy(
                recording = false, status = "", pendingCount = LocalStore.pendingCount(ctx))
        }
    }

    fun refreshPending(ctx: Context) {
        appCtx = ctx.applicationContext
        _state.value = _state.value.copy(pendingCount = LocalStore.pendingCount(ctx))
    }

    /** Nur für Screenshots/Debug: setzt einen aktiven Aufnahme-Zustand mit festen Werten,
     *  ohne echte Sensoren/GPS (siehe DemoReceiver + scripts/wear-demo.sh). */
    fun demo(speedKmh: Double, hr: Int) {
        running = false   // echte Sensor-/GPS-Callbacks ignorieren, sonst überschreiben sie die Demo-Werte
        _state.value = _state.value.copy(
            recording = true, starting = false, status = "",
            speedKmh = speedKmh, speed3sKmh = speedKmh, maxSpeedKmh = speedKmh + 1.2, avgSpeedKmh = speedKmh - 0.8,
            distanceM = 1234.0, elapsedSec = 312, isFoiling = true, runCount = 3,
            runDurationMs = 84_000, runDistanceM = 420.0, runMaxSpeedKmh = speedKmh + 1.2,
            lastRunDurationMs = 96_000, lastRunDistanceM = 480.0,
            lastRunAvgSpeedKmh = speedKmh - 0.5, lastRunMaxSpeedKmh = speedKmh + 0.9,
            hr = hr, maxHr = hr + 6, avgHr = hr - 4, hrSamples = 1,
        )
    }

    /** Lädt fertig aufgezeichnete Sessions hoch, sobald gepairt + online. */
    fun drain(ctx: Context) {
        if (draining) return
        if (Api.deviceToken == null) return
        draining = true
        scope.launch {
            var failed = false
            try {
                // Gestrandete Aufnahmen (Crash/Kill vor Stop) finalisieren -> kein Datenverlust.
                // Läuft auch offline (rein lokal); danach zählen sie als „fertig" zum Upload.
                recoverInterrupted(ctx)
                val pend = LocalStore.pendingCount(ctx)
                _state.value = _state.value.copy(pendingCount = pend)
                if (!Api.isOnline(ctx)) {
                    if (pend > 0) _state.value = _state.value.copy(uploadError = "offline", uploading = false)
                    return@launch
                }
                _state.value = _state.value.copy(uploadError = "")
                for (dir in LocalStore.completedSessions(ctx)) {
                    try { uploadSession(ctx, dir) }
                    catch (e: ApiException) {
                        failed = true
                        if (e.status == 401) {
                            // Token serverseitig ungültig -> frisches vom Phone anfordern (Companion).
                            // Weiteres Hämmern mit dem schlechten Token ist sinnlos -> abbrechen.
                            _state.value = _state.value.copy(uploadError = "auth")
                            WearLink.requestToken(ctx)
                            break
                        }
                        _state.value = _state.value.copy(
                            uploadError = if (Api.isOnline(ctx)) "server" else "offline")
                    }
                    catch (e: Exception) {
                        // Chunks/Session bleiben lokal -> später erneut. Ursache fürs UI festhalten.
                        failed = true
                        _state.value = _state.value.copy(
                            uploadError = if (Api.isOnline(ctx)) "server" else "offline")
                    }
                }
            } finally {
                draining = false
                _state.value = _state.value.copy(
                    uploading = false,
                    status = "",   // „lade hoch…" wieder entfernen (blieb sonst hängen)
                    pendingCount = LocalStore.pendingCount(ctx),
                    uploadSent = 0, uploadTotal = 0,
                    uploadError = if (!failed) "" else _state.value.uploadError)
            }
        }
    }

    // Abgebrochene Aufnahmen (kein complete.json) finalisieren: synthetisches complete.json
    // mit der Anzahl persistierter Chunks -> Session wird normal hochgeladen statt zu stranden.
    // Die gerade laufende Aufnahme bleibt ausgenommen.
    private fun recoverInterrupted(ctx: Context) {
        val active = if (running) uuid else null
        for (dir in LocalStore.interruptedSessions(ctx, active)) {
            val n = LocalStore.chunkFiles(dir).size
            if (n == 0) { continue }
            LocalStore.writeComplete(ctx, dir.name, JSONObject()
                .put("ended_at", nowIso()).put("total_chunks", n))
        }
    }

    // Wie viele Chunks parallel? Über eigenes Netz der Uhr (WLAN/LTE/Ethernet) aggressiv (6),
    // über die Bluetooth-Proxy-Verbindung zum Telefon sanft (2). Fehlerfrei defensiv -> 2.
    private fun uploadPool(ctx: Context): Int {
        return try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            val fast = caps != null && (
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET))
            if (fast) 6 else 2
        } catch (_: Throwable) { 2 }
    }

    private suspend fun uploadSession(ctx: Context, dir: java.io.File) {
        val meta = LocalStore.readJson(java.io.File(dir, "meta.json")) ?: return
        val sid = meta.getString("session_uuid")
        // GPS-first: GPS-Chunks zuerst in den Pool einreihen (stabil -> Index-Reihenfolge bleibt
        // je Gruppe erhalten). Bei abgebrochenem Upload ist damit die GPS-Spur zuerst vollständig
        // -> Session server-seitig als gps_only analysierbar statt hängend. Parität zu Server/Web.
        val chunkFiles = LocalStore.chunkFiles(dir).sortedBy { if (LocalStore.chunkKind(it) == "gps") 0 else 1 }
        // Chunks werden erst nach bestätigtem /complete gelöscht -> kein Datenverlust;
        // bereits empfangene Chunks (received_chunks) werden übersprungen (Resume).
        // expected_chunks: der Server macht daraus `upload_total` (sessions.py:199) und alle
        // Oberflaechen zeigen dann "x von y" statt eines unbestimmten Balkens. Hier ist die Zahl
        // exakt bekannt — die Aufnahme ist fertig, die Chunks liegen auf der Platte. Waehrend
        // einer LAUFENDEN Aufnahme darf sie NICHT gesendet werden: sie waere zu klein, und der
        // Fortschritt liefe ueber sein eigenes Ziel hinaus.
        meta.put("expected_chunks", chunkFiles.size)
        val res = Api.startSession(meta)
        val received = HashSet<Int>()
        res.optJSONArray("received_chunks")?.let { a ->
            for (i in 0 until a.length()) received.add(a.getInt(i))
        }
        _state.value = _state.value.copy(
            uploading = true, status = I18n.t("saved.uploading"), uploadError = "",
            uploadTotal = chunkFiles.size, uploadSent = received.size.coerceAtMost(chunkFiles.size))
        // Chunks PARALLEL hochladen (Server nimmt sie in beliebiger Reihenfolge, je Index eigene
        // Datei/Zeile -> kollisionsfrei). Pool adaptiv: über eigenes WLAN/LTE der Uhr aggressiv,
        // über die Bluetooth-Bridge zum Telefon sanft. JSON erst im Permit lesen (Speicher bremsen).
        val sent = AtomicInteger(received.size.coerceAtMost(chunkFiles.size))
        val sem = Semaphore(uploadPool(ctx))
        coroutineScope {
            chunkFiles.map { cf ->
                async(Dispatchers.IO) {
                    sem.withPermit {
                        val chunk = LocalStore.readJson(cf) ?: return@withPermit
                        if (chunk.optInt("index", -1) in received) return@withPermit
                        Api.uploadChunk(sid, chunk)
                        _state.value = _state.value.copy(uploadSent = sent.incrementAndGet().coerceAtMost(chunkFiles.size))
                    }
                }
            }.awaitAll()
        }
        val comp = LocalStore.readJson(java.io.File(dir, "complete.json"))
        Api.complete(sid, comp?.optString("ended_at") ?: nowIso(), comp?.optInt("total_chunks") ?: chunkIndex)
        LocalStore.delete(ctx, sid)   // erst NACH /complete -> serverseitig sicher vorhanden
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
    // Vom RecorderService gesetzt, wenn requestLocationUpdates an der fehlenden Berechtigung
    // scheitert (SecurityException). Ohne Positionen ist der Mitschnitt fuer die Auswertung
    // wertlos -> die UI sagt es, statt stumm Accel zu sammeln.
    fun setGpsDenied(v: Boolean) {
        _state.value = _state.value.copy(gpsDenied = v)
    }

    // Standschwelle fuer die LIVE-Distanz. Ohne sie summiert jeder GPS-Fix seinen Abstand zum
    // Vorgaenger auf — auch wenn die Uhr am Steg liegt und nur der Empfang zittert. Gemessen an
    // 400 echten Sessions (26.08.): die ungefilterte Punkt-zu-Punkt-Summe liegt bis zu 53 %
    // ueber der ausgewerteten Distanz. Betroffen war nur die ANZEIGE (und die Lauf-Distanz, die
    // sich daraus ergibt) — die Rohdaten gehen unveraendert zum Server, der rechnet selbst.
    // Entschieden wird auf dem DOPPLER-Wert, nicht auf dem Abstand: er ist unabhaengig vom
    // Positions-Zittern. Nur wenn das Geraet keine Geschwindigkeit liefert (negativ = unbekannt),
    // faellt es auf eine Mindest-Verschiebung zurueck. Idee aus @elmanu13s Zepp-PR, dort ueber ein
    // 5-s-Netto-Fenster geloest, weil Zepp weder Genauigkeit noch Doppler liefert.
    private const val STAND_MPS = 0.5       // darunter gilt: wir stehen (1,8 km/h)
    private const val STAND_SCHRITT_M = 1.5 // Rueckfall ohne Doppler: Mindest-Verschiebung je Fix

    fun addGps(lat: Double, lon: Double, speedMps: Double, accuracyM: Double) {
        if (!running) return
        val tMs = elapsedMs()
        val spRaw = maxOf(0.0, speedMps)
        // Qualitaets-Gate fuer alles Live (Anzeige, Max, Lauf-Erkennung): hAcc > 20 m -> 0.
        val poor = accuracyM > 20.0
        val sp = if (poor) 0.0 else spRaw
        synchronized(lock) {
            gps.add(doubleArrayOf(tMs.toDouble(), lat, lon, spRaw, lastHr.toDouble(), accuracyM))
            // Distanz aufsummieren (Haversine zwischen Punkten) — aber nur, wenn wir uns
            // wirklich bewegen (s. STAND_MPS).
            if (!prevLat.isNaN()) {
                val schritt = haversine(prevLat, prevLon, lat, lon)
                val bewegt = if (speedMps >= 0.0) spRaw > STAND_MPS else schritt >= STAND_SCHRITT_M
                if (!poor && bewegt) distM += schritt
            }
            prevLat = lat; prevLon = lon
            spdMaxClean = maxKandidat(sp)
            if (spdMaxClean > maxMps) maxMps = spdMaxClean
            // 3-s-Fenster pflegen.
            spWin.add(doubleArrayOf(tMs.toDouble(), sp))
            while (spWin.isNotEmpty() && tMs - spWin[0][0] > 3000) spWin.removeAt(0)
        }
        val sec = (tMs / 1000.0).coerceAtLeast(1.0)
        // MEDIAN statt Mittel — wie Garmin (speed3sMed), Zepp und der Server
        // (SMOOTH_WINDOW_S + _running_median). Ein einzelner Ausreisser haelt den Mittelwert
        // drei Sekunden lang oben und kann so einen Phantom-Lauf starten.
        val sp3 = if (spWin.isEmpty()) sp else spWin.map { it[1] }.sorted()[spWin.size / 2]
        val nowFoiling = updateFoilingRun(sp3 * 3.6, tMs.toLong(), distM, sp)
        // aktueller Lauf live (solange foilend), sonst letzter Lauf
        val runDur = if (nowFoiling) (tMs.toLong() - runStartMs).coerceAtLeast(0) else lastRunDurMs
        val runDist = if (nowFoiling) (distM - runStartDist).coerceAtLeast(0.0) else lastRunDistM
        val runMax = if (nowFoiling) runMaxMps else lastRunMaxMps
        _state.value = _state.value.copy(
            gpsPoor = poor,
            gpsFixes = _state.value.gpsFixes + 1,
            speedKmh = sp * 3.6,
            speed3sKmh = sp3 * 3.6,
            maxSpeedKmh = maxMps * 3.6,
            distanceM = distM,
            avgSpeedKmh = distM / sec * 3.6,
            elapsedSec = (tMs / 1000).toLong(),
            isFoiling = nowFoiling,
            runCount = runCount,
            runDurationMs = runDur,
            runDistanceM = runDist,
            runMaxSpeedKmh = runMax * 3.6,
            lastRunDurationMs = lastRunDurMs,
            lastRunDistanceM = lastRunDistM,
            lastRunAvgSpeedKmh = lastRunAvgMps * 3.6,
            lastRunMaxSpeedKmh = lastRunMaxMps * 3.6,
            lastRunMaxHr = lastRunMaxHr,
        )
    }
    fun setHr(bpm: Int) {
        lastHr = bpm
        if (bpm > 0) { hrSum += bpm; hrCount++; if (bpm > maxHrV) maxHrV = bpm }
        if (running) _state.value = _state.value.copy(
            hr = bpm, maxHr = maxHrV, avgHr = if (hrCount > 0) (hrSum / hrCount).toInt() else 0,
            hrSamples = hrCount)
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
        while (running) {
            delay(10_000)
            flushAll()
        }
    }
    // Chunks werden persistent lokal abgelegt (kein Netz). Upload via drain().
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
        LocalStore.writeChunk(ctx, uuid, chunkIndex, JSONObject()
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
        LocalStore.writeChunk(ctx, uuid, chunkIndex, JSONObject()
            .put("index", chunkIndex).put("kind", "gps").put("encoding", "json")
            .put("t0_ms", buf.first()[0].toInt()).put("count", buf.size).put("data", arr))
        chunkIndex++
    }
}
