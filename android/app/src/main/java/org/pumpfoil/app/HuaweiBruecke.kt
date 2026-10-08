package org.pumpfoil.app

import android.app.Activity
import android.content.Context
import android.util.Log
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.auth.AuthCallback
import com.huawei.wearengine.auth.Permission
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.p2p.Message
import com.huawei.wearengine.p2p.Receiver
import com.huawei.wearengine.p2p.SendCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Bruecke fuer HUAWEI-Uhren (07.10.2026, watch-huawei/, docs/HUAWEI.md).
 *
 * Die Uhren haben fuer Fremd-Apps kein eigenes Netz. Die Uhren-App schreibt ihre Aufnahme als
 * Dateien im normalen Upload-Format (docs/ingest-contract.md) und schickt sie per Wear Engine
 * hierher; wir legen sie ab und laden sie mit einem EIGENEN Geraete-Token je Uhr hoch — so
 * erscheint die Session unter der Uhr, nicht unter „Phone".
 *
 * Dateien von der Uhr (watch-huawei/common/kern.js):
 *   m_<id>.json      Session-Meta     -> meta.json
 *   c_<id>_<n>.json  ein Chunk        -> chunk-<n>.json
 *   e_<id>.json      Abschluss        -> complete.json (kommt als letztes)
 * Eigene Ablage (filesDir/huawei-sessions/), NICHT die des Handy-Recorders: der schliesst
 * „unterbrochene" Sessions selbst ab — eine Uhr mitten in der Uebertragung waere das auch.
 *
 * Bekannte Grenzen (Wear-Engine-FAQ): ohne Huawei Health auf dem Handy geht nichts; der
 * Empfaenger lebt nur, solange unsere App laeuft — die Uhr versucht es mit steigender
 * Wartezeit erneut und sagt dem Fahrer „Pumpfoil am Handy oeffnen".
 */
object HuaweiBruecke {
    private const val TAG = "HuaweiBruecke"
    private const val PREF_AN = "huawei_an"
    private const val HEALTH = "com.huawei.health"
    private const val MAX_DATEI = 5L * 1024 * 1024
    private val ID = Regex("^[A-Za-z0-9_-]{1,80}$")
    private val CHUNK = Regex("^c_([A-Za-z0-9_-]{1,80})_(\\d{1,6})\\.json$")
    private val META = Regex("^m_([A-Za-z0-9_-]{1,80})\\.json$")
    private val ENDE = Regex("^e_([A-Za-z0-9_-]{1,80})\\.json$")

    data class Stand(
        val konfiguriert: Boolean = false,
        val healthDa: Boolean = false,
        val verbunden: Boolean = false,
        val uhren: List<String> = emptyList(),
        val empfangen: Int = 0,
        val offen: Int = 0,
        val laedt: Boolean = false,
        val fehler: String = "",
        // Fortschritt Uhr -> Handy (in Dateien, je ~5 s Aufnahme) und Handy -> Server (in Chunks).
        // Beide laufen unabhaengig, auch gleichzeitig.
        val empfFertig: Int = 0,
        val empfGesamt: Int = 0,
        val empfAnteil: Float = 0f,
        val empfLetzteMs: Long = 0L,
        val hochFertig: Int = 0,
        val hochGesamt: Int = 0,
    )
    private val _stand = MutableStateFlow(Stand())
    val stand: StateFlow<Stand> = _stand

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val ablage = Mutex()
    private val empfang = Empfang()
    private var empfaenger: Receiver? = null
    @Volatile private var geraete: List<Device> = emptyList()
    /** Die Uhr meldet sich mit diesem Dateinamen (watch-huawei/common/recorder.js `senden`). */
    internal const val HALLO = "h_hallo.json"
    /** Die Antwort: Seiten-Konfiguration fuer die Uhr, in Teilen wie die Uhr-Dateien. */
    internal const val KONFIG = "k_konfig.json"
    /** Nur diese Schluessel braucht die Uhr fuer ihre Datenseiten (common/seiten.js `Konfig`). */
    private val KONFIG_SCHLUESSEL = listOf("views", "offFoilView", "pauseView", "pages", "offFoilPages",
        "pausePages", "browseAll", "layoutsOn", "colorByValue", "hrZones", "speedZones")
    @Volatile private var hochladen = false

    /** HUAWEI_WATCH_FP, durch Komma getrennt (app/build.gradle.kts). */
    internal fun fingerabdruecke(roh: String = BuildConfig.HUAWEI_WATCH_FP): List<String> =
        roh.split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct()

    /** Kennungen aus AppGallery Connect eingetragen? (app/build.gradle.kts) */
    fun konfiguriert(): Boolean = !BuildConfig.HUAWEI_WATCH_FP.contains("EINTRAGEN")

    fun healthInstalliert(ctx: Context): Boolean = try {
        ctx.packageManager.getPackageInfo(HEALTH, 0); true
    } catch (_: Exception) { false }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    private fun wurzel(ctx: Context) = File(ctx.filesDir, "huawei-sessions").apply { mkdirs() }

    private fun setze(f: (Stand) -> Stand) { _stand.value = f(_stand.value) }

    /** Beim App-Start: nur wenn der Nutzer die Uhr schon einmal verbunden hat (kein Dialog). */
    fun start(ctx: Context) {
        val app = ctx.applicationContext
        setze { it.copy(konfiguriert = konfiguriert(), healthDa = healthInstalliert(app), offen = offen(app)) }
        teileAufraeumen(app)
        if (prefs(app).getBoolean(PREF_AN, false)) empfangen(app)
        hochladen(app)
    }

    /** Knopf „HUAWEI-Uhr verbinden": Huawei fragt den Nutzer (Health-Dialog), dann empfangen. */
    fun verbinden(activity: Activity) {
        val app = activity.applicationContext
        setze { it.copy(konfiguriert = konfiguriert(), healthDa = healthInstalliert(app), fehler = "") }
        if (!konfiguriert()) { setze { it.copy(fehler = "config") }; return }
        if (!healthInstalliert(app)) { setze { it.copy(fehler = "health") }; return }
        try {
            HiWear.getAuthClient(activity).requestPermission(object : AuthCallback {
                override fun onOk(permissions: Array<out Permission>?) {
                    prefs(app).edit().putBoolean(PREF_AN, true).apply()
                    empfangen(app)
                }
                override fun onCancel() { setze { it.copy(fehler = "abgelehnt") } }
            }, Permission.DEVICE_MANAGER).addOnFailureListener { e ->
                Log.e(TAG, "Berechtigung", e)
                setze { it.copy(fehler = "auth: ${e.message ?: e.javaClass.simpleName}".take(120)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "verbinden", e)
            setze { it.copy(fehler = "auth: ${e.message ?: e.javaClass.simpleName}".take(120)) }
        }
    }

    fun trennen(ctx: Context) {
        prefs(ctx).edit().putBoolean(PREF_AN, false).apply()
        try { empfaenger?.let { HiWear.getP2pClient(ctx).unregisterReceiver(it) } } catch (_: Exception) {}
        empfaenger = null
        setze { it.copy(verbunden = false, uhren = emptyList()) }
    }

    /** Empfaenger fuer jede gekoppelte Uhr anmelden. */
    private fun empfangen(app: Context) {
        if (!konfiguriert()) { setze { it.copy(fehler = "config") }; return }
        try {
            val p2p = HiWear.getP2pClient(app)
            p2p.setPeerPkgName(BuildConfig.HUAWEI_WATCH_PKG)
            val r = empfaenger ?: Receiver { msg -> nachricht(app, msg) }.also { empfaenger = it }
            HiWear.getDeviceClient(app).bondedDevices
                .addOnSuccessListener { liste: List<Device>? ->
                    val uhren = liste.orEmpty()
                    geraete = uhren
                    // Je Fingerabdruck einmal anmelden (Lite/JS-FA und ArkTS koennen verschieden
                    // signiert sein). UNGEPRUEFT, ob das SDK den Fingerabdruck bei registerReceiver
                    // uebernimmt — bei EINEM Eintrag aendert sich gegenueber vorher nichts.
                    for (fp in fingerabdruecke()) {
                        p2p.setPeerFingerPrint(fp)
                        for (d in uhren) {
                            p2p.registerReceiver(d, r).addOnFailureListener { e ->
                                Log.e(TAG, "registerReceiver ${d.name}", e)
                                setze { it.copy(fehler = "empfang: ${e.message ?: ""}".take(120)) }
                            }
                        }
                    }
                    setze { it.copy(verbunden = true, uhren = uhren.map { d -> d.name ?: "?" },
                        fehler = if (uhren.isEmpty()) "keine-uhr" else "") }
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "bondedDevices", e)
                    setze { it.copy(fehler = "geraete: ${e.message ?: ""}".take(120)) }
                }
        } catch (e: Exception) {
            Log.e(TAG, "empfangen", e)
            setze { it.copy(fehler = "empfang: ${e.message ?: e.javaClass.simpleName}".take(120)) }
        }
    }

    /**
     * Die Uhr schickt NACHRICHTEN in Teilen (watch-huawei/common/kern.js `teile`): das iOS-SDK
     * von Wear Engine kann keine Dateien, und so ist es fuer beide Handys derselbe Weg. Eine
     * Datei (Wear-Engine-Dateiversand) wird trotzdem angenommen.
     */
    private fun nachricht(app: Context, msg: Message) {
        scope.launch {
            val fertig = try {
                when (msg.type) {
                    Message.MESSAGE_TYPE_DATA -> teilAnnehmen(app, String(msg.data ?: return@launch, Charsets.UTF_8))
                    Message.MESSAGE_TYPE_FILE -> msg.file?.let { f ->
                        if (f.length() in 1..MAX_DATEI) ablegen(app, f.name, f.readText()) else false
                    } ?: false
                    else -> false
                }
            } catch (e: Exception) {
                Log.e(TAG, "nachricht", e)
                setze { it.copy(fehler = "datei: ${e.message ?: ""}".take(120)) }
                false
            }
            setze { it.copy(empfangen = it.empfangen + 1, offen = offen(app)) }
            if (fertig) hochladen(app)
        }
    }

    /** Ein Teil `PF1|<datei>|<nr>|<anzahl>|<rest>|<inhalt>` (rest: s. watch-huawei/common/kern.js `teile`). */
    internal data class Teil(val datei: String, val nr: Int, val anzahl: Int, val rest: Int, val inhalt: String)

    /** Nur das erwartete Format, nur bekannte Dateinamen, vernuenftige Groessen — sonst null. */
    internal fun teilLesen(text: String): Teil? {
        if (!text.startsWith("PF1|")) return null
        val f = text.split('|', limit = 6)
        if (f.size < 6) return null
        val nr = f[2].toIntOrNull() ?: return null
        val n = f[3].toIntOrNull() ?: return null
        val rest = f[4].toIntOrNull() ?: return null
        if (n !in 1..20000 || nr !in 0 until n || rest !in 1..1_000_000 || f[5].length > 1000) return null
        if (zielName(f[1]) == null && f[1] != HALLO) return null
        return Teil(f[1], nr, n, rest, f[5])
    }

    /**
     * Fortschritt Uhr -> Handy aus dem `rest` der Teile. Eine „Ladung" beginnt, wenn nach einer
     * leeren Uhr wieder etwas kommt, und endet, wenn die letzte Datei (rest 1) vollstaendig ist.
     * Waehrend einer Aufnahme kommen die Chunks einzeln; dann zeigt der Balken kurz 0/1 -> 1/1.
     */
    internal class Empfang {
        var fertig = 0; private set
        var rest = 0; private set
        private var teilAnteil = 0.0
        var letzteMs = 0L; private set
        val gesamt: Int get() = fertig + rest
        fun teil(nr: Int, anzahl: Int, restUhr: Int, dateiFertig: Boolean, jetzt: Long) {
            if (rest == 0) fertig = 0   // neue Ladung
            letzteMs = jetzt
            if (dateiFertig) { fertig++; rest = restUhr - 1; teilAnteil = 0.0 }
            else { rest = restUhr; teilAnteil = (nr + 1).toDouble() / anzahl }
        }
        fun anteil(): Float = if (gesamt == 0) 0f else ((fertig + teilAnteil) / gesamt).toFloat().coerceIn(0f, 1f)
    }

    private suspend fun teilAnnehmen(app: Context, text: String): Boolean {
        val t = teilLesen(text) ?: return false
        val ganz: String? = ablage.withLock { teilSpeichern(File(app.filesDir, "huawei-teile"), t) }
        if (t.datei == HALLO) {   // kein Aufnahme-Teil: zaehlt nicht im Balken, wird beantwortet
            if (ganz != null) hallo(app, ganz)
            return false
        }
        synchronized(empfang) {
            empfang.teil(t.nr, t.anzahl, t.rest, ganz != null, System.currentTimeMillis())
            setze { it.copy(empfFertig = empfang.fertig, empfGesamt = empfang.gesamt,
                empfAnteil = empfang.anteil(), empfLetzteMs = empfang.letzteMs) }
        }
        return ganz != null && ablegen(app, t.datei, ganz)
    }

    /**
     * Die Uhr hat sich gemeldet (Modell + Version): mit IHREM Token (dasselbe wie fuer ihre Uploads,
     * Label = Modell) die Konfiguration holen und die Datenseiten zurueckschicken. Nebenbei landet so
     * die App-Version der Uhr am Server (`/devices/config?v=`), wie bei den anderen Uhren.
     */
    /**
     * Einen Teil ablegen; sind alle Teile der Datei da, die ganze Datei zurueck (und die Teile weg).
     * Doppelt geschickte Teile ueberschreiben nur. Ohne Context, damit der Ende-zu-Ende-Test
     * (HuaweiBrueckeE2ETest) genau diesen Code mit einem Testordner faehrt.
     */
    internal fun teilSpeichern(basis: File, t: Teil): String? {
        val dir = File(basis.apply { mkdirs() }, t.datei).apply { mkdirs() }
        File(dir, t.nr.toString()).writeText(t.inhalt)   // doppelt geschickt -> ueberschreibt nur
        if ((dir.listFiles()?.size ?: 0) < t.anzahl) return null
        return (0 until t.anzahl).joinToString("") { File(dir, it.toString()).readText() }
            .also { dir.deleteRecursively() }
    }

    private suspend fun hallo(app: Context, text: String) {
        try {
            val h = JSONObject(text)
            val label = h.optString("device_model", "HUAWEI").ifBlank { "HUAWEI" }
            val tok = token(app, label) ?: return
            val v = java.net.URLEncoder.encode(h.optString("app_version", ""), "UTF-8")
            val c = URL(Api.BASE + "/api/devices/config?p=huawei&v=" + v).openConnection() as HttpURLConnection
            val roh = try {
                c.connectTimeout = 15000; c.readTimeout = 30000
                c.setRequestProperty("X-Device-Token", tok)
                if (c.responseCode !in 200..299) { setze { it.copy(fehler = "konfig ${c.responseCode}") }; return }
                c.inputStream.bufferedReader().use { it.readText() }
            } finally { c.disconnect() }
            konfigSenden(app, konfigTeile(konfigFuerUhr(roh)))
        } catch (e: Exception) {
            Log.e(TAG, "hallo", e)
            setze { it.copy(fehler = "konfig: ${e.message ?: e.javaClass.simpleName}".take(120)) }
        }
    }

    /** Nur die Schluessel der Datenseiten — der volle Config-Block waere ein Vielfaches an Teilen. */
    internal fun konfigFuerUhr(roh: String): String {
        val voll = JSONObject(roh)
        val aus = JSONObject()
        for (k in KONFIG_SCHLUESSEL) if (voll.has(k)) aus.put(k, voll.get(k))
        return aus.toString()
    }

    /** Wie watch-huawei/common/kern.js `teile`: Nicht-ASCII als \uXXXX, <= 800 Zeichen je Teil. */
    internal fun konfigTeile(text: String, max: Int = 800): List<String> {
        val t = buildString { for (ch in text) if (ch.code < 128) append(ch) else append("\\u%04x".format(ch.code)) }
        val n = maxOf(1, (t.length + max - 1) / max)
        return (0 until n).map { i -> "PF1|$KONFIG|$i|$n|1|" + t.substring(i * max, minOf(t.length, (i + 1) * max)) }
    }

    /** Teile nacheinander an die Uhr; ein Fehlschlag bricht ab (die Uhr fragt halbstuendlich neu). */
    private suspend fun konfigSenden(app: Context, teile: List<String>) {
        val uhr = geraete.firstOrNull { it.isConnected } ?: return
        val p2p = HiWear.getP2pClient(app)
        p2p.setPeerPkgName(BuildConfig.HUAWEI_WATCH_PKG)
        p2p.setPeerFingerPrint(fingerabdruecke().firstOrNull() ?: return)
        for (teil in teile) {
            val msg = Message.Builder().setPayload(teil.toByteArray(Charsets.US_ASCII)).build()
            val code = withTimeoutOrNull(30_000) {
                suspendCancellableCoroutine<Int> { weiter ->
                    p2p.send(uhr, msg, object : SendCallback {
                        override fun onSendResult(resultCode: Int) { if (weiter.isActive) weiter.resume(resultCode) }
                        override fun onSendProgress(progress: Long) {}
                    }).addOnFailureListener { if (weiter.isActive) weiter.resume(-1) }
                }
            }
            if (code != 207) {
                setze { it.copy(fehler = "konfig senden ${code ?: "timeout"}") }
                return
            }
        }
    }

    /**
     * Reste unvollstaendiger Dateien wegraeumen. Geht die Quittung eines LETZTEN Teils verloren,
     * schickt die Uhr ihn noch einmal — die Datei ist dann laengst zusammengesetzt, und der
     * einzelne Teil bliebe sonst fuer immer liegen. Eine Woche Ruhe reicht als Beleg.
     */
    private fun teileAufraeumen(app: Context) {
        val grenze = System.currentTimeMillis() - 7L * 24 * 3600 * 1000
        File(app.filesDir, "huawei-teile").listFiles()?.forEach { d ->
            if (d.isDirectory && d.lastModified() < grenze) d.deleteRecursively()
        }
    }

    /**
     * Eine Datei der Uhr ablegen. Rein nach Namen und Inhalt geprueft — nichts von der Uhr darf
     * ausserhalb des eigenen Ordners schreiben. true = eine Session ist vollstaendig.
     */
    internal suspend fun ablegen(app: Context, name: String, text: String): Boolean =
        ablage.withLock { ablegenIn(wurzel(app), name, text) }

    /** Wie [ablegen], ohne Context (Ende-zu-Ende-Test). */
    internal fun ablegenIn(wurzel: File, name: String, text: String): Boolean {
        if (text.isEmpty() || text.length > MAX_DATEI) return false
        JSONObject(text)   // muss gueltiges JSON sein, sonst Exception
        val (id, ziel) = zielName(name) ?: return false
        File(File(wurzel, id).apply { mkdirs() }, ziel).writeText(text)
        return ziel == "complete.json"
    }

    /** Dateiname der Uhr -> (Session-ID, Name in der Ablage), sonst null. */
    internal fun zielName(name: String): Pair<String, String>? {
        val basis = name.substringAfterLast('/')
        META.matchEntire(basis)?.let { return it.groupValues[1] to "meta.json" }
        ENDE.matchEntire(basis)?.let { return it.groupValues[1] to "complete.json" }
        CHUNK.matchEntire(basis)?.let {
            return it.groupValues[1] to "chunk-%06d.json".format(it.groupValues[2].toInt())
        }
        return null
    }

    private fun offen(app: Context): Int =
        wurzel(app).listFiles()?.count { it.isDirectory && File(it, "complete.json").exists() } ?: 0

    /** Ein Token je Uhr (Label = Modell), einmal gemintet und gemerkt. */
    private suspend fun token(app: Context, label: String): String? {
        val key = "huawei_token_" + label.hashCode()
        prefs(app).getString(key, null)?.let { return it }
        return try {
            Api.mintDeviceToken(label.take(60)).also { prefs(app).edit().putString(key, it).apply() }
        } catch (e: Exception) { Log.e(TAG, "mint", e); null }
    }

    /** Vollstaendige Sessions hochladen (Sammel-Upload, 30 Chunks je Anfrage). */
    fun hochladen(ctx: Context) {
        val app = ctx.applicationContext
        if (hochladen) return
        hochladen = true
        scope.launch {
            try {
                val dirs = wurzel(app).listFiles()?.filter {
                    it.isDirectory && ID.matches(it.name) &&
                        File(it, "meta.json").exists() && File(it, "complete.json").exists()
                }.orEmpty()
                val gesamt = dirs.sumOf { d -> d.listFiles()?.count { it.name.startsWith("chunk-") } ?: 0 }
                setze { it.copy(laedt = dirs.isNotEmpty(), hochFertig = 0, hochGesamt = gesamt,
                    fehler = if (it.fehler.startsWith("upload")) "" else it.fehler) }
                for (dir in dirs) {
                    try { session(app, dir) } catch (e: IngestException) {
                        Log.e(TAG, "upload ${dir.name}: ${e.status}", e)
                        if (e.status == 401) {   // Token serverseitig ungueltig -> beim naechsten Mal neu minten
                            val alt = prefs(app).all.keys.filter { it.startsWith("huawei_token_") }
                            prefs(app).edit().apply { alt.forEach { remove(it) } }.apply()
                        }
                        setze { it.copy(fehler = "upload ${e.status}") }
                    } catch (e: Exception) {
                        Log.e(TAG, "upload ${dir.name}", e)
                        setze { it.copy(fehler = "upload") }
                    }
                }
            } finally {
                hochladen = false
                setze { it.copy(laedt = false, offen = offen(app)) }
            }
        }
    }

    /** Was eine abgelegte Session hochladen wuerde: Meta (mit expected_chunks), Chunks, Ende. */
    internal data class Upload(val meta: JSONObject, val chunks: List<JSONObject>, val complete: JSONObject)

    internal fun uploadVon(dir: File): Upload {
        val meta = JSONObject(File(dir, "meta.json").readText())
        val chunks = dir.listFiles()?.filter { it.name.startsWith("chunk-") }?.sortedBy { it.name }.orEmpty()
            .map { JSONObject(it.readText()) }
        meta.put("expected_chunks", chunks.size)
        return Upload(meta, chunks, JSONObject(File(dir, "complete.json").readText()))
    }

    /** Reihenfolge der Chunk-Uploads: GPS zuerst (wie der Handy-Recorder) — bricht der Upload ab, ist die Spur schon vollstaendig. */
    internal fun uploadReihenfolge(chunks: List<JSONObject>, schonDa: Set<Int>): List<JSONObject> =
        chunks.filter { it.optInt("index", -1) !in schonDa }.sortedBy { if (it.optString("kind") == "gps") 0 else 1 }

    private suspend fun session(app: Context, dir: File) {
        val up = uploadVon(dir)
        val meta = up.meta
        val id = meta.optString("session_uuid")
        if (id != dir.name) { dir.deleteRecursively(); return }   // passt nicht zusammen -> nie hochladen
        val tok = token(app, meta.optString("device_model", "HUAWEI").ifBlank { "HUAWEI" }) ?: return
        val chunks = up.chunks
        val res = JSONObject(Ingest.post("/api/ingest/session", meta.toString(), tok))
        val da = HashSet<Int>()
        res.optJSONArray("received_chunks")?.let { a -> for (i in 0 until a.length()) da.add(a.getInt(i)) }
        val offen = uploadReihenfolge(chunks, da)
        // Was der Server schon hat (abgebrochener Upload), zaehlt gleich als erledigt.
        setze { it.copy(hochFertig = it.hochFertig + (chunks.size - offen.size)) }
        for (paket in offen.chunked(30)) {
            val body = JSONObject().put("chunks", JSONArray(paket)).toString()
            val r = JSONObject(Ingest.post("/api/ingest/session/$id/chunks", body, tok))
            val ok = r.optJSONArray("received")
            val n = ok?.length() ?: 0
            if (n < paket.size) throw IngestException(500, "nur $n von ${paket.size} quittiert")
            setze { it.copy(hochFertig = it.hochFertig + paket.size) }
        }
        Ingest.post("/api/ingest/session/$id/complete", up.complete.toString(), tok)
        dir.deleteRecursively()   // erst NACH /complete
    }
}
