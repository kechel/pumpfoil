package org.pumpfoil.watch

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// Fordert bei der Phone-App ein frisches Device-Token an (z. B. nach 401 = Token
// serverseitig ungültig). Die Phone-App mintet neu und legt es als /pairing-DataItem
// ab; WearPairingService übernimmt es. Debounced, damit ein 401-Loop kein Mint-Spam auslöst.
object WearLink {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var lastRequest = 0L

    fun requestToken(ctx: Context) {
        val now = System.currentTimeMillis()
        if (now - lastRequest < 30_000) return
        lastRequest = now
        val app = ctx.applicationContext
        scope.launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes)
                for (n in nodes) {
                    Tasks.await(Wearable.getMessageClient(app)
                        .sendMessage(n.id, "/pumpfoil/need-token", ByteArray(0)))
                }
            } catch (_: Exception) { /* keine Phone erreichbar -> Phone pusht später proaktiv */ }
        }
    }
}
