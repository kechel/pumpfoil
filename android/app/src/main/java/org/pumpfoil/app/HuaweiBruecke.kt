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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
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
    )
    private val _stand = MutableStateFlow(Stand())
    val stand: StateFlow<Stand> = _stand

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val ablage = Mutex()
    private var empfaenger: Receiver? = null
    @Volatile private var hochladen = false

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
            p2p.setPeerFingerPrint(BuildConfig.HUAWEI_WATCH_FP)
            val r = empfaenger ?: Receiver { msg -> nachricht(app, msg) }.also { empfaenger = it }
            HiWear.getDeviceClient(app).bondedDevices
                .addOnSuccessListener { liste: List<Device>? ->
                    val uhren = liste.orEmpty()
                    for (d in uhren) {
                        p2p.registerReceiver(d, r).addOnFailureListener { e ->
                            Log.e(TAG, "registerReceiver ${d.name}", e)
                            setze { it.copy(fehler = "empfang: ${e.message ?: ""}".take(120)) }
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

    private fun nachricht(app: Context, msg: Message) {
        if (msg.type != Message.MESSAGE_TYPE_FILE) return
        val f = msg.file ?: return
        scope.launch {
            val fertig = try { ablegen(app, f.name, f) } catch (e: Exception) {
                Log.e(TAG, "ablegen ${f.name}", e)
                setze { it.copy(fehler = "datei: ${f.name}".take(120)) }
                false
            }
            setze { it.copy(empfangen = it.empfangen + 1, offen = offen(app)) }
            if (fertig) hochladen(app)
        }
    }

    /**
     * Eine Datei der Uhr ablegen. Rein nach Namen und Inhalt geprueft — nichts von der Uhr darf
     * ausserhalb des eigenen Ordners schreiben. true = eine Session ist vollstaendig.
     */
    internal suspend fun ablegen(app: Context, name: String, f: File): Boolean = ablage.withLock {
        if (f.length() <= 0 || f.length() > MAX_DATEI) return false
        val text = f.readText()
        JSONObject(text)   // muss gueltiges JSON sein, sonst Exception
        val (id, ziel) = zielName(name) ?: return false
        val dir = File(wurzel(app), id).apply { mkdirs() }
        File(dir, ziel).writeText(text)
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
            setze { it.copy(laedt = true) }
            try {
                val dirs = wurzel(app).listFiles()?.filter {
                    it.isDirectory && ID.matches(it.name) &&
                        File(it, "meta.json").exists() && File(it, "complete.json").exists()
                }.orEmpty()
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

    private suspend fun session(app: Context, dir: File) {
        val meta = JSONObject(File(dir, "meta.json").readText())
        val id = meta.optString("session_uuid")
        if (id != dir.name) { dir.deleteRecursively(); return }   // passt nicht zusammen -> nie hochladen
        val tok = token(app, meta.optString("device_model", "HUAWEI").ifBlank { "HUAWEI" }) ?: return
        val chunks = dir.listFiles()?.filter { it.name.startsWith("chunk-") }?.sortedBy { it.name }.orEmpty()
        meta.put("expected_chunks", chunks.size)
        val res = JSONObject(Ingest.post("/api/ingest/session", meta.toString(), tok))
        val da = HashSet<Int>()
        res.optJSONArray("received_chunks")?.let { a -> for (i in 0 until a.length()) da.add(a.getInt(i)) }
        // GPS zuerst (wie der Handy-Recorder): bricht der Upload ab, ist die Spur schon vollstaendig.
        val offen = chunks.map { JSONObject(it.readText()) }.filter { it.optInt("index", -1) !in da }
            .sortedBy { if (it.optString("kind") == "gps") 0 else 1 }
        for (paket in offen.chunked(30)) {
            val body = JSONObject().put("chunks", JSONArray(paket)).toString()
            val r = JSONObject(Ingest.post("/api/ingest/session/$id/chunks", body, tok))
            val ok = r.optJSONArray("received")
            val n = ok?.length() ?: 0
            if (n < paket.size) throw IngestException(500, "nur $n von ${paket.size} quittiert")
        }
        val comp = JSONObject(File(dir, "complete.json").readText())
        Ingest.post("/api/ingest/session/$id/complete", comp.toString(), tok)
        dir.deleteRecursively()   // erst NACH /complete
    }
}
