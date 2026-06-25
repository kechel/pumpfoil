package org.pumpfoil.app

import android.content.Context
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
