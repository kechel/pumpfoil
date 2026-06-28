package org.pumpfoil.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.google.android.gms.wearable.CapabilityClient
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
    val watchPaired = MutableStateFlow(false)     // ist überhaupt eine Wear-Uhr gekoppelt?
    val watchInstalled = MutableStateFlow(false)  // ist UNSERE Wear-App auf der Uhr installiert?

    // Von der Wear-App via res/values/wear.xml (android_wear_capabilities) beworben.
    private const val WEAR_CAP = "pumpfoil_wear_app"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Companion-Pairing (Wear-idiomatisch): die eingeloggte Phone-App mintet ein
    // Device-Token und schiebt es per Wearable Data Layer auf die Uhr -> kein
    // Code-Tippen. Voraussetzung (jetzt erfüllt): gleiche applicationId Phone+Wear.
    // Token wird gecacht, damit nicht bei jedem Start neu gemintet wird.
    // force=true: neu minten (Recovery, wenn das bisherige Token serverseitig ungültig ist).
    // Der Cache wird bei jedem Mint aktualisiert -> spätere proaktive Pushes tragen das GÜLTIGE.
    fun pushPairing(ctx: Context, force: Boolean = false) {
        if (Api.token == null) return
        val app = ctx.applicationContext
        scope.launch(Dispatchers.IO) {
            try {
                val prefs = app.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
                var token = if (force) null else prefs.getString("mintedWearToken", null)
                if (token == null) {
                    token = try { Api.mintDeviceToken() }
                            catch (_: Exception) { prefs.getString("mintedWearToken", null) }
                        ?: return@launch
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
            val paired = try {
                Wearable.getNodeClient(app).connectedNodes.await().isNotEmpty()
            } catch (_: Exception) { false }
            watchPaired.value = paired
            connected.value = paired
            // Ist unsere Wear-App auf einer (gekoppelten) Uhr installiert? -> Capability.
            watchInstalled.value = try {
                Wearable.getCapabilityClient(app)
                    .getCapability(WEAR_CAP, CapabilityClient.FILTER_ALL).await()
                    .nodes.isNotEmpty()
            } catch (_: Exception) { false }
            if (paired) pushPairing(app)
        }
    }

    // Öffnet den Play Store DIREKT auf der Uhr bei unserer App (Installieren/Aktualisieren).
    // Wear-OS-idiomatisch: man kann die Uhr-App nicht vom Phone aus „pushen", aber den
    // Store-Eintrag auf der Uhr aufrufen (RemoteActivityHelper).
    fun installOnWatch(ctx: Context) {
        val app = ctx.applicationContext
        scope.launch {
            try {
                val intent = Intent(Intent.ACTION_VIEW)
                    .addCategory(Intent.CATEGORY_BROWSABLE)
                    .setData(Uri.parse("market://details?id=org.pumpfoil.app"))
                val nodes = Wearable.getNodeClient(app).connectedNodes.await()
                val helper = RemoteActivityHelper(app)
                for (n in nodes) {
                    try { helper.startRemoteActivity(intent, n.id) } catch (_: Exception) {}
                }
            } catch (_: Exception) { /* keine Uhr / offline */ }
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
