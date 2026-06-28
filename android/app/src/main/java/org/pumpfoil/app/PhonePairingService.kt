package org.pumpfoil.app

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

// Empfängt die „needToken"-Anfrage der Uhr (z. B. nach 401 = Token serverseitig ungültig)
// und schiebt ein frisch gemintetes Device-Token per Data Layer zurück (Companion-Pairing).
class PhonePairingService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == "/pumpfoil/need-token") {
            Api.load(applicationContext)                 // Auth-Token aus den Prefs
            WatchSync.pushPairing(applicationContext, force = true)
        }
    }
}
