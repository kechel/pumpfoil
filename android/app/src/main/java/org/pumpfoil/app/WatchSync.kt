package org.pumpfoil.app

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

// Sync-Status für den Indikator oben rechts (wie Garmin Connect).
// - `connected`: ist eine Wear-OS-Uhr gekoppelt?
// - `syncing`:   läuft gerade ein Sync (Spinner)?
// - `tick`:      erhöht sich nach jedem Sync -> Screens laden neu.
//
// Hinweis: Der echte Uhr->iPhone/Phone-Datentransfer (Data Layer) braucht gleiche
// App-ID/Signatur von Phone- und Wear-App; das kommt in einer späteren Phase.
// Aktuell: Verbindungsanzeige + Server-Refresh + best-effort Anstoß an die Uhr.
object WatchSync {
    val syncing = MutableStateFlow(false)
    val connected = MutableStateFlow(false)
    val tick = MutableStateFlow(0)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Companion-Pairing (Wear-idiomatisch): die eingeloggte Phone-App mintet ein
    // Device-Token und schiebt es per Wearable Data Layer auf die Uhr -> kein
    // Code-Tippen. Voraussetzung (jetzt erfüllt): gleiche applicationId Phone+Wear.
    // Token wird gecacht, damit nicht bei jedem Start neu gemintet wird.
    fun pushPairing(ctx: Context) {
        if (Api.token == null) return
        val app = ctx.applicationContext
        scope.launch(Dispatchers.IO) {
            try {
                val prefs = app.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
                var token = prefs.getString("mintedWearToken", null)
                if (token == null) {
                    token = Api.mintDeviceToken()
                    prefs.edit().putString("mintedWearToken", token).apply()
                }
                val req = PutDataMapRequest.create("/pairing").apply {
                    dataMap.putString("device_token", token)
                    dataMap.putLong("ts", System.currentTimeMillis())
                }
                Wearable.getDataClient(app).putDataItem(req.asPutDataRequest().setUrgent()).await()
            } catch (_: Exception) { /* keine Uhr / offline -> später erneut */ }
        }
    }

    fun refreshConnection(ctx: Context) {
        val app = ctx.applicationContext
        scope.launch {
            connected.value = try {
                Wearable.getNodeClient(app).connectedNodes.await().isNotEmpty()
            } catch (_: Exception) { false }
        }
    }

    fun sync(ctx: Context) {
        if (syncing.value) return
        val app = ctx.applicationContext
        scope.launch {
            syncing.value = true
            try {
                val nodes = try { Wearable.getNodeClient(app).connectedNodes.await() } catch (_: Exception) { emptyList() }
                connected.value = nodes.isNotEmpty()
                for (n in nodes) {
                    try {
                        Wearable.getMessageClient(app)
                            .sendMessage(n.id, "/pumpfoil/sync", ByteArray(0)).await()
                    } catch (_: Exception) { /* Uhr hat (noch) keinen Listener */ }
                }
                delay(400) // Indikator kurz sichtbar
            } finally {
                tick.value += 1
                syncing.value = false
            }
        }
    }
}
