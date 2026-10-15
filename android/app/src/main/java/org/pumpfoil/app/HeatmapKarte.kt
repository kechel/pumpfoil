package org.pumpfoil.app

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Point
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Overlay
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.sinh

/*
 * Heatmap der Spot-Karte (Jan, 15.10.2026; PWA Spots.tsx, Server app/heatmap.py): wie viele
 * Sessions an einer Stelle gefahren sind, nur die Laeufe, fuer alle gleich, einmal taeglich
 * vorgerechnet. Die Zellen sind Kacheln der Webkarte (x, y auf Stufe z) — dasselbe Raster, in dem
 * osmdroid zeichnet, also exakt deckungsgleich.
 */

@Serializable
data class HeatAntwort(
    val z: Int? = null,
    val cells: List<List<Int>> = emptyList(),
    val max: Int = 1,
    val stand: String? = null,
    val sessions: Int = 0,
)

/** Zeichnet die Zellen als Rechtecke UNTER den Spot-Pins (wird als erstes Overlay eingefuegt). */
class HeatOverlay : Overlay() {
    @Volatile var daten: HeatAntwort? = null
    private val paint = Paint().apply { style = Paint.Style.FILL; isAntiAlias = false }
    private val a = Point()
    private val b = Point()

    override fun draw(c: Canvas, mv: MapView, shadow: Boolean) {
        if (shadow) return
        val d = daten ?: return
        val z = d.z ?: return
        val n = (1L shl z).toDouble()
        val proj = mv.projection
        val skala = ln(1.0 + d.max)
        for (zelle in d.cells) {
            if (zelle.size < 3) continue
            val (x, y, anzahl) = zelle
            val t = min(1.0, ln(1.0 + anzahl) / skala)
            proj.toPixels(GeoPoint(lat(y.toDouble(), n), lon(x.toDouble(), n)), a)
            proj.toPixels(GeoPoint(lat(y + 1.0, n), lon(x + 1.0, n)), b)
            paint.color = heatFarbe(t)
            paint.alpha = ((0.35 + 0.45 * t) * 255).toInt()
            c.drawRect(a.x.toFloat(), a.y.toFloat(), maxOf(b.x, a.x + 1).toFloat(), maxOf(b.y, a.y + 1).toFloat(), paint)
        }
    }

    private fun lon(x: Double, n: Double) = x / n * 360.0 - 180.0
    private fun lat(y: Double, n: Double) = Math.toDegrees(atan(sinh(PI * (1 - 2 * y / n))))
}

/** Blau -> Cyan -> Gelb -> Rot, wie in der PWA (heatFarbe in Spots.tsx). */
fun heatFarbe(t: Double): Int {
    val stops = arrayOf(intArrayOf(59, 130, 246), intArrayOf(34, 211, 238), intArrayOf(250, 204, 21), intArrayOf(239, 68, 68))
    val x = t * (stops.size - 1)
    val i = min(stops.size - 2, x.toInt())
    val f = x - i
    fun k(j: Int) = (stops[i][j] + (stops[i + 1][j] - stops[i][j]) * f).toInt()
    return android.graphics.Color.rgb(k(0), k(1), k(2))
}

/**
 * Haelt das Heatmap-Overlay der Karte aktuell: holt die Zellen fuer den Ausschnitt bei jedem
 * Verschieben/Zoomen (entprellt), entfernt das Overlay, wenn `zeitraum` null ist.
 */
@androidx.compose.runtime.Composable
fun HeatmapLaden(karte: MapView, zeitraum: String?, onSessions: (Int?) -> Unit) {
    val overlay = androidx.compose.runtime.remember { HeatOverlay() }
    val aktuell = androidx.compose.runtime.rememberUpdatedState(zeitraum)
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    fun laden() {
        val p = aktuell.value ?: return
        val bb = karte.boundingBox
        scope.launch {
            try {
                val r = Api.heatmap(p, karte.zoomLevelDouble.toInt(), bb.lonWest, bb.latSouth, bb.lonEast, bb.latNorth)
                if (aktuell.value != p) return@launch
                overlay.daten = r
                onSessions(r.sessions)
                karte.invalidate()
            } catch (_: Exception) {}
        }
    }
    androidx.compose.runtime.LaunchedEffect(karte) {
        karte.addMapListener(org.osmdroid.events.DelayedMapListener(object : org.osmdroid.events.MapListener {
            override fun onScroll(e: org.osmdroid.events.ScrollEvent?): Boolean { laden(); return false }
            override fun onZoom(e: org.osmdroid.events.ZoomEvent?): Boolean { laden(); return false }
        }, 300))
    }
    androidx.compose.runtime.LaunchedEffect(zeitraum) {
        if (zeitraum == null) {
            karte.overlays.remove(overlay); overlay.daten = null; onSessions(null); karte.invalidate()
        } else {
            if (overlay !in karte.overlays) karte.overlays.add(0, overlay)
            // Die Karte hat beim ersten Oeffnen evtl. noch keine Groesse -> kurz warten.
            kotlinx.coroutines.delay(100)
            laden()
        }
    }
}
