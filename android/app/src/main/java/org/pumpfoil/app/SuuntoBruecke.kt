package org.pumpfoil.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.ParcelUuid
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Bruecke fuer die SuuntoPlus-App (watch-suunto/, docs/SUUNTO.md), 17.10.2026.
 *
 * Die Suunto-App hat kein Netz und kaum Speicher. Ist „Rohdaten ans Handy" an, verbindet sie sich als
 * Bluetooth-Central zu diesem Handy: wir sind GATT-Server und werben die Service-UUID. Die Uhr
 * schreibt 20-Byte-Pakete (SuuntoProtokoll), wir legen die Aufnahme als Chunks ab (SuuntoAblage)
 * und quittieren erst, was auf der Platte liegt. Hochgeladen wird laufend, in der Pause mit
 * `/analyze` (Session bleibt „live") und am Ende mit `/complete` — mit einem eigenen Geraete-Token
 * je Uhr, damit die Session unter der Uhr erscheint und nicht unter „Phone".
 *
 * Laeuft als Vordergrund-Dienst (connectedDevice), solange der Empfang eingeschaltet ist; sonst
 * beendet Android den GATT-Server, sobald die App im Hintergrund ist.
 */
object SuuntoBruecke {
    private const val TAG = "SuuntoBruecke"
    private const val PREF_AN = "suunto_an"
    private val ID = Regex("^suunto-[0-9a-f]{1,8}-\\d{1,12}$")

    data class Stand(
        val an: Boolean = false,
        val werben: Boolean = false,
        val verbunden: Boolean = false,
        val uhr: String = "",
        val aufnahme: Boolean = false,
        val empfangenS: Int = 0,
        val verlorenS: Int = 0,
        val offen: Int = 0,
        val laedt: Boolean = false,
        val fehler: String = "",
        val letztesPaketMs: Long = 0L,
    )
    private val _stand = MutableStateFlow(Stand())
    val stand: StateFlow<Stand> = _stand
    private fun setze(f: (Stand) -> Stand) { _stand.value = f(_stand.value) }

    internal val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val hoch = Mutex()
    @Volatile private var uploadJob: Job? = null

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    internal fun wurzel(ctx: Context) = File(ctx.filesDir, "suunto-sessions").apply { mkdirs() }

    fun istAn(ctx: Context) = prefs(ctx).getBoolean(PREF_AN, false)

    /** Beim App-Start: Dienst nur, wenn der Nutzer den Empfang schon eingeschaltet hat. */
    fun start(ctx: Context) {
        val app = ctx.applicationContext
        setze { it.copy(an = istAn(app), offen = offen(app)) }
        if (istAn(app) && rechte(app)) SuuntoDienst.start(app)
        hochladen(app)
    }

    fun benoetigteRechte(): Array<String> =
        if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT)
        else emptyArray()

    fun rechte(ctx: Context) = benoetigteRechte().all {
        ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED
    }

    /** Knopf „Empfang einschalten" — die Rechte fragt die Karte vorher ab. */
    fun einschalten(ctx: Context) {
        val app = ctx.applicationContext
        if (!rechte(app)) { setze { it.copy(fehler = "rechte") }; return }
        prefs(app).edit().putBoolean(PREF_AN, true).apply()
        setze { it.copy(an = true, fehler = "") }
        SuuntoDienst.start(app)
    }

    fun ausschalten(ctx: Context) {
        val app = ctx.applicationContext
        prefs(app).edit().putBoolean(PREF_AN, false).apply()
        setze { it.copy(an = false, werben = false, verbunden = false) }
        app.stopService(Intent(app, SuuntoDienst::class.java))
    }

    internal fun meldeVerbindung(verbunden: Boolean) = setze { it.copy(verbunden = verbunden) }
    internal fun meldeWerben(an: Boolean, fehler: String = "") =
        setze { it.copy(werben = an, fehler = if (fehler.isNotEmpty()) fehler else if (it.fehler == "werben" || it.fehler == "bt") "" else it.fehler) }
    internal fun meldeAufnahme(a: SuuntoAblage) {
        val l = a.aktuell
        setze { it.copy(aufnahme = l != null, letztesPaketMs = System.currentTimeMillis(),
            empfangenS = l?.let { x -> (x.sammler.blockGesichert + 1).toInt() * 25 / x.hz } ?: it.empfangenS,
            verlorenS = l?.let { x -> (x.verloren * 25 / x.hz).toInt() } ?: it.verlorenS) }
    }
    internal fun meldeUhr(name: String) = setze { it.copy(uhr = name) }

    private fun offen(app: Context): Int =
        wurzel(app).listFiles()?.count { it.isDirectory && File(it, "meta.json").exists() } ?: 0

    /** Ein Token je Uhr, einmal gemintet; danach /config?p=suunto, damit der Server die Plattform kennt. */
    internal suspend fun token(app: Context, uhrId: Long, label: String): String? {
        val key = "suunto_token_" + java.lang.Long.toHexString(uhrId)
        prefs(app).getString(key, null)?.let { return it }
        return try {
            val t = Api.mintDeviceToken(label.take(60))
            prefs(app).edit().putString(key, t).apply()
            try { Ingest.get("/api/devices/config?p=suunto&v=100", t) } catch (e: Exception) { Log.w(TAG, "config", e) }
            t
        } catch (e: Exception) { Log.e(TAG, "mint", e); null }
    }

    /** Konfiguration der Uhr (Seiten, Alarme, Sprache) vom Server, gekuerzt und in KONFIG-Paketen. */
    internal suspend fun konfigPakete(app: Context, uhrId: Long, label: String, appVer: Int, stdHash: Long): List<ByteArray>? {
        val t = token(app, uhrId, label) ?: return null
        return try {
            val text = Ingest.get("/api/devices/config-kompakt?p=suunto&std=$stdHash&v=" +
                "%d.%02d".format(appVer / 100, appVer % 100), t)
            SuuntoKonfig.pakete(text.trim())
        } catch (e: Exception) { Log.w(TAG, "konfig", e); null }
    }

    /** Uhr-App ohne Aufnahme verlassen (Funk weg im Startzustand) — wie Garmin/Wear/Apple POST /devices/app-closed. */
    internal fun appGeschlossen(app: Context, uhrId: Long) {
        scope.launch {
            val key = "suunto_token_" + java.lang.Long.toHexString(uhrId)
            val t = prefs(app).getString(key, null) ?: return@launch   // nie gemeldet -> nichts zu schliessen
            try { Ingest.post("/api/devices/app-closed", "{}", t) } catch (e: Exception) { Log.w(TAG, "app-closed", e) }
        }
    }

    /** STATUS fuer die Uhr: bit0 Konto, bit1 online, bit2 laedt hoch, bit3 Handy nimmt selbst auf; offen = wartende Aufnahmen. */
    internal fun statusPaket(app: Context): ByteArray {
        val st = _stand.value
        val f = (if (Api.token != null) 1 else 0) or (if (Ingest.isOnline(app)) 2 else 0) or
            (if (st.laedt || st.offen > 0) 4 else 0) or (if (Recorder.isRecording()) 8 else 0)
        val n = st.offen.coerceIn(0, 0xFFFF)
        return byteArrayOf(0x82.toByte(), f.toByte(), n.toByte(), (n shr 8).toByte())
    }

    /** Erster GPS-Fix der Uhr im Startzustand -> „gerade am Pumpen" (wie alle Uhren, POST /devices/position). */
    internal fun position(app: Context, uhrId: Long, lat: Double, lon: Double) {
        scope.launch {
            val t = token(app, uhrId, "Suunto") ?: return@launch
            try {
                Ingest.post("/api/devices/position", JSONObject().put("lat", lat).put("lon", lon).toString(), t)
            } catch (e: Exception) { Log.w(TAG, "position", e) }
        }
    }

    /** Hochladen, was da ist: laufende Aufnahmen Chunk fuer Chunk, fertige mit /complete. */
    fun hochladen(ctx: Context) {
        val app = ctx.applicationContext
        if (uploadJob?.isActive == true) return
        uploadJob = scope.launch {
            hoch.withLock {
                setze { it.copy(laedt = true) }
                try {
                    if (Ingest.isOnline(app)) for (dir in wurzel(app).listFiles().orEmpty().filter { it.isDirectory }) {
                        try { session(app, dir) } catch (e: IngestException) {
                            Log.e(TAG, "upload ${dir.name}: ${e.status}", e)
                            if (e.status == 401) {
                                val alt = prefs(app).all.keys.filter { it.startsWith("suunto_token_") }
                                prefs(app).edit().apply { alt.forEach { remove(it) } }.apply()
                            }
                            setze { it.copy(fehler = "upload ${e.status}") }
                        } catch (e: Exception) {
                            Log.e(TAG, "upload ${dir.name}", e); setze { it.copy(fehler = "upload") }
                        }
                    }
                } finally { setze { it.copy(laedt = false, offen = offen(app)) } }
            }
        }
    }

    private suspend fun session(app: Context, dir: File) {
        if (!ID.matches(dir.name)) return
        val metaF = File(dir, "meta.json"); if (!metaF.exists()) return
        val meta = JSONObject(metaF.readText())
        if (meta.optString("session_uuid") != dir.name) { dir.deleteRecursively(); return }
        val z = File(dir, "zustand.json").takeIf { it.exists() }?.let { JSONObject(it.readText()) } ?: return
        val completeF = File(dir, "complete.json")
        val fertig = completeF.exists()
        val chunks = dir.listFiles()!!.filter { it.name.startsWith("chunk-") && it.name.endsWith(".json") }
            .sortedBy { it.name }.map { JSONObject(it.readText()) }
        if (!fertig && chunks.isEmpty()) return
        val tok = token(app, z.getLong("uhrId"), meta.optString("device_model", "Suunto")) ?: return
        if (fertig) meta.put("expected_chunks", chunks.size)
        val res = JSONObject(Ingest.post("/api/ingest/session", meta.toString(), tok))
        val da = HashSet<Int>()
        res.optJSONArray("received_chunks")?.let { a -> for (i in 0 until a.length()) da.add(a.getInt(i)) }
        val fehlen = chunks.filter { it.optInt("index", -1) !in da }.sortedBy { if (it.optString("kind") == "gps") 0 else 1 }
        for (paket in fehlen.chunked(30)) {
            val r = JSONObject(Ingest.post("/api/ingest/session/${dir.name}/chunks",
                JSONObject().put("chunks", JSONArray(paket)).toString(), tok))
            val n = r.optJSONArray("received")?.length() ?: 0
            if (n < paket.size) throw IngestException(500, "nur $n von ${paket.size} quittiert")
        }
        if (fertig) {
            Ingest.post("/api/ingest/session/${dir.name}/complete", completeF.readText(), tok)
            dir.deleteRecursively()   // erst NACH /complete
        } else if (z.optLong("pauseSeit", 0) > 0 && !File(dir, "analysiert-${z.optLong("pauseSeit")}").exists()) {
            // In der Pause einmal auswerten lassen: die Session erscheint live mit den Laeufen bis hier.
            Ingest.post("/api/ingest/session/${dir.name}/analyze", "{}", tok)
            File(dir, "analysiert-${z.optLong("pauseSeit")}").writeText("")
        }
    }
}

/** Vordergrund-Dienst: GATT-Server + Werbung, solange der Suunto-Empfang an ist. */
class SuuntoDienst : Service() {
    private val takt = Executors.newSingleThreadExecutor()
    private var server: BluetoothGattServer? = null
    private var notify: BluetoothGattCharacteristic? = null
    private var geraet: BluetoothDevice? = null
    private var notifyAn = false
    private lateinit var ablage: SuuntoAblage
    private var letzteQuittung = 0L
    private var offeneQuittung: ByteArray? = null
    // Notify nacheinander: Android verlangt onNotificationSent vor dem naechsten Paket.
    private val warteschlange = ArrayDeque<ByteArray>()
    private var sendetNotify = false
    private var konfigFuer = -1L          // Uhr, die in dieser Verbindung die Konfiguration bekommen hat
    private var halloUhr = 0L; private var halloOhneAufnahme = false
    private var schleife: Job? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= 34) startForeground(3, benachrichtigung(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        else startForeground(3, benachrichtigung())
        if (server == null) {
            ablage = SuuntoAblage(SuuntoBruecke.wurzel(this))
            starten()
            schleife = SuuntoBruecke.scope.launch {
                var n = 0
                while (isActive) {
                    delay(1000)
                    val status = if (n % 5 == 0) SuuntoBruecke.statusPaket(this@SuuntoDienst) else null
                    takt.execute {
                        if (status != null && geraet != null && notifyAn) {
                            warteschlange.removeAll { it.isNotEmpty() && it[0] == 0x82.toByte() }
                            warteschlange.addLast(status); notifyWeiter()
                        }
                        quittungSenden(true); if (ablage.pruefen()) SuuntoBruecke.hochladen(this@SuuntoDienst)
                    }
                    if (++n % 20 == 0) SuuntoBruecke.hochladen(this@SuuntoDienst)   // laufend hochladen
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        schleife?.cancel()
        stoppen()
        takt.shutdown()
        super.onDestroy()
    }

    private val cccd = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    @SuppressLint("MissingPermission")
    private fun starten() {
        if (!SuuntoBruecke.rechte(this)) { SuuntoBruecke.meldeWerben(false, "rechte"); return }
        val bm = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val ad = bm.adapter
        if (ad == null || !ad.isEnabled) { SuuntoBruecke.meldeWerben(false, "bt"); return }
        val s = bm.openGattServer(this, rueckruf) ?: run { SuuntoBruecke.meldeWerben(false, "gatt"); return }
        val dienst = BluetoothGattService(SuuntoProtokoll.SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val schreiben = BluetoothGattCharacteristic(SuuntoProtokoll.SCHREIBEN,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE)
        val n = BluetoothGattCharacteristic(SuuntoProtokoll.NOTIFY,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ)
        n.addDescriptor(BluetoothGattDescriptor(cccd,
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE))
        dienst.addCharacteristic(schreiben); dienst.addCharacteristic(n)
        s.addService(dienst)
        server = s; notify = n
        val adv = ad.bluetoothLeAdvertiser ?: run { SuuntoBruecke.meldeWerben(false, "werben"); return }
        adv.startAdvertising(
            AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH).setConnectable(true).build(),
            // Die Uhr sucht die 128-bit-Service-UUID in der Werbung (searchParam 6/7), kein Name noetig.
            AdvertiseData.Builder().addServiceUuid(ParcelUuid(SuuntoProtokoll.SERVICE)).setIncludeDeviceName(false).build(),
            werbung)
    }

    @SuppressLint("MissingPermission")
    private fun stoppen() {
        try {
            val bm = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
            bm.adapter?.bluetoothLeAdvertiser?.stopAdvertising(werbung)
        } catch (e: Exception) { Log.w("SuuntoDienst", "stop", e) }
        try { server?.close() } catch (e: Exception) { Log.w("SuuntoDienst", "close", e) }
        server = null
        SuuntoBruecke.meldeWerben(false); SuuntoBruecke.meldeVerbindung(false)
    }

    private val werbung = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) { SuuntoBruecke.meldeWerben(true) }
        override fun onStartFailure(errorCode: Int) { SuuntoBruecke.meldeWerben(false, "werben $errorCode") }
    }

    private val rueckruf = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            takt.execute {
                if (newState == BluetoothProfile.STATE_CONNECTED) { geraet = device; SuuntoBruecke.meldeVerbindung(true) }
                else if (device == geraet) {
                    geraet = null; notifyAn = false; SuuntoBruecke.meldeVerbindung(false)
                    warteschlange.clear(); sendetNotify = false; konfigFuer = -1L
                    // Funk weg, waehrend die Uhr im Startzustand war: App verlassen, ohne aufzunehmen
                    if (halloOhneAufnahme && ablage.aktuell == null) SuuntoBruecke.appGeschlossen(this@SuuntoDienst, halloUhr)
                    halloOhneAufnahme = false
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicWriteRequest(device: BluetoothDevice, requestId: Int, c: BluetoothGattCharacteristic,
                                                  preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?) {
            // Erst ablegen, dann antworten: die Uhr schickt das naechste Paket erst nach WRITE_DONE.
            val v = value ?: ByteArray(0)
            takt.execute {
                if (c.uuid == SuuntoProtokoll.SCHREIBEN) verarbeiten(v)
                if (responseNeeded) server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onDescriptorWriteRequest(device: BluetoothDevice, requestId: Int, d: BluetoothGattDescriptor,
                                              preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?) {
            takt.execute {
                if (d.uuid == cccd) notifyAn = value != null && value.isNotEmpty() && (value[0].toInt() and 1) != 0
                if (responseNeeded) server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                if (notifyAn) quittungSenden(true)
            }
        }

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            takt.execute { sendetNotify = false; notifyWeiter() }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, c: BluetoothGattCharacteristic) {
            server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, offeneQuittung ?: ByteArray(0))
        }
    }

    /** Auf dem takt-Thread. */
    private fun verarbeiten(p: ByteArray) {
        val a = try { ablage.paket(p) } catch (e: Exception) { Log.e("SuuntoDienst", "paket", e); return }
        if ((p[0].toInt() and 15) == 1) {
            val h = SuuntoEmpfang().also { it.paket(p) }.hallo
            if (h != null) {
                halloUhr = h.uhrId; halloOhneAufnahme = h.sitzung == 0L
                SuuntoBruecke.meldeUhr(SuuntoAblage.modell(h.display).substringBefore(" ·"))
                if (konfigFuer != h.uhrId) {
                    konfigFuer = h.uhrId
                    SuuntoBruecke.scope.launch {
                        val k = SuuntoBruecke.konfigPakete(this@SuuntoDienst, h.uhrId, SuuntoAblage.modell(h.display), h.appVer, h.stdHash)
                        if (k == null) takt.execute { konfigFuer = -1L }   // naechstes HALLO versucht es erneut
                        else takt.execute { warteschlange.addAll(k); notifyWeiter() }
                    }
                }
            }
        }
        a.position?.let { SuuntoBruecke.position(this, a.uhrId, it.first, it.second) }
        if (a.quittung != null) offeneQuittung = a.quittung
        SuuntoBruecke.meldeAufnahme(ablage)
        if (a.geaendert) SuuntoBruecke.hochladen(this)
        quittungSenden(false)
    }

    /** Quittung hoechstens alle 250 ms (oder sofort, wenn `jetzt`) — als juengste in der Warteschlange. */
    private fun quittungSenden(jetzt: Boolean) {
        val q = offeneQuittung ?: return
        if (geraet == null || !notifyAn) return
        val t = System.currentTimeMillis()
        if (!jetzt && t - letzteQuittung < 250) return
        letzteQuittung = t
        warteschlange.removeAll { it.isNotEmpty() && it[0] == 0x81.toByte() }   // nur die neueste zaehlt
        warteschlange.addFirst(q)
        notifyWeiter()
    }

    @SuppressLint("MissingPermission")
    private fun notifyWeiter() {
        if (sendetNotify) return
        val d = geraet ?: return
        val n = notify ?: return
        val s = server ?: return
        if (!notifyAn) return
        val p = warteschlange.removeFirstOrNull() ?: return
        sendetNotify = true
        val ok = if (Build.VERSION.SDK_INT >= 33) s.notifyCharacteristicChanged(d, n, false, p) == BluetoothGatt.GATT_SUCCESS
        else { @Suppress("DEPRECATION") n.value = p; @Suppress("DEPRECATION") s.notifyCharacteristicChanged(d, n, false) }
        if (!ok) { sendetNotify = false; if (p[0] != 0x81.toByte()) warteschlange.addFirst(p) }
    }

    private fun benachrichtigung(): Notification {
        val ch = "suunto"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(ch, I18n.t("suunto.title"), NotificationManager.IMPORTANCE_LOW))
        val zurueck = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, ch)
            .setContentTitle("Pumpfoil")
            .setContentText(I18n.t("suunto.notif"))
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(zurueck)
            .build()
    }

    companion object {
        fun start(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, SuuntoDienst::class.java))
    }
}
