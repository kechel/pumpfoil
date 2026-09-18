package org.pumpfoil.app

/**
 * Zuletzt angeschauter Ausschnitt der Spots-Karte.
 *
 * Ohne das setzte die Karte bei jedem Aufbau den Ausschnitt auf ALLE Spots zurueck
 * (`zoomToBoundingBox`) — wer hineinzoomte, zu einem Spot ging und zurueckkam, stand wieder auf
 * der Europakarte (Jan, 18.09.2026: „merkt sich auch nicht wenn ich rauszoome und dann woanders
 * hingehe und zurueck auf spots gehe, eigentlich sollte sich das lokal den ausschnitt merken").
 *
 * NUR IM SPEICHER, nicht in den Einstellungen — dieselbe Entscheidung wie in der PWA, die dafuer
 * bewusst `sessionStorage` und nicht `localStorage` nimmt (`web/src/pages/Spots.tsx`): der
 * Ausschnitt soll das Hin- und Herwechseln ueberleben, aber nicht ewig. Beim naechsten kalten
 * Start ist die Uebersicht ueber alle Spots wieder die richtige Ansicht.
 */
object SpotsKarte {
    @Volatile private var lat: Double? = null
    @Volatile private var lon: Double = 0.0
    @Volatile private var zoom: Double = 5.0

    /** Liegt ein gemerkter Ausschnitt vor? Dann NICHT auf alle Spots einpassen. */
    val vorhanden: Boolean get() = lat != null

    fun merken(lat: Double, lon: Double, zoom: Double) {
        // Unfertige Kartenzustaende nicht merken: osmdroid meldet waehrend des Aufbaus (0,0).
        if (!lat.isFinite() || !lon.isFinite() || !zoom.isFinite()) return
        if (lat == 0.0 && lon == 0.0) return
        this.lat = lat; this.lon = lon; this.zoom = zoom
    }

    /** Gemerkten Ausschnitt oder null. */
    fun holen(): Triple<Double, Double, Double>? = lat?.let { Triple(it, lon, zoom) }
}
