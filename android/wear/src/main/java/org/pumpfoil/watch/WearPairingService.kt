package org.pumpfoil.watch

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

// Empfängt das Device-Token von der Phone-App über den Wearable Data Layer und
// speichert es -> Wear-idiomatisches Pairing ohne Code-Tippen. Die eingeloggte
// Phone-App mintet das Token und legt es als DataItem unter "/pairing" ab.
// Reverse-Pairing (Code an der Uhr erzeugen) bleibt als Fallback bestehen.
class WearPairingService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (e in events) {
            if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == "/pairing") {
                val token = DataMapItem.fromDataItem(e.dataItem).dataMap.getString("device_token")
                if (!token.isNullOrEmpty()) {
                    Api.load(applicationContext)
                    if (Api.deviceToken == null) {   // vorhandenes (Reverse-)Token nicht überschreiben
                        Api.saveToken(applicationContext, token)
                    }
                }
            }
        }
    }
}
