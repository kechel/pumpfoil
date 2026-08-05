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
                    val cur = Api.deviceToken
                    // Companion-Pairing ist eine BEQUEMLICHKEIT, keine Autorität: ein geschobenes
                    // Token wird nur uebernommen, wenn die Uhr keines hat oder selbst eines
                    // angefordert hat (401-Recovery, s. WearLink). Frueher gewann der Push immer —
                    // damit ueberschrieb das (gecachte, evtl. alte) Phone-Token ein frisches
                    // Code-Pairing Sekunden spaeter wieder (Feldbefund 05.08.: zwei Pairings
                    // um 14:00 und 14:15 lebten je 3 Sekunden, danach lief alles ueber das alte
                    // Token vom 12.07.) -> „Neu verbinden"/Konto wechseln wirkte wirkungslos.
                    val darfUeberschreiben = cur == null || WearLink.wantsToken(applicationContext)
                    if (darfUeberschreiben && cur != token) {
                        Api.saveToken(applicationContext, token)
                        WearLink.clearWantToken(applicationContext)
                        Recorder.drain(applicationContext)
                    }
                }
            }
        }
    }
}
