package org.pumpfoil.app

import androidx.compose.material.icons.outlined.Shield
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.osmdroid.events.DelayedMapListener
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.FolderOverlay
import org.osmdroid.views.overlay.Polygon

/*
 * Schutzgebiete auf JEDER Karte der App — wie `schutzgebiete()` in web/src/lib/mapTiles.ts (Jan,
 * 16.10.2026): Naturschutzgebiete (rot), FFH/Natura 2000 (orange gestrichelt) und eingetragene
 * Bade-/Fahrverbote (dunkelrot) aus OpenStreetMap. Der Server holt und speichert sie
 * (app/schutzgebiete.py); die App fragt nur /api/community/schutzgebiete — kein fremder Dienst.
 *
 *  - Erst ab Zoom 11, nachgeladen beim Verschieben; meldet der Server „unvollstaendig" (Overpass
 *    langsam), fragt die Karte bis zu sechsmal nach. Die Karte haengt nie davon ab.
 *  - Immer an; der Schild-Knopf blendet alle aus (nicht gespeichert). KEIN Fenster beim Antippen
 *    (Jan, 16.10.2026: „die Markierung reicht voellig") — ein Tipp geht an die Karte durch.
 *  - Legende unten links mit den gezeichneten Arten — nur Spot-Uebersicht und Spot-Panel
 *    (`MitUmschalter(legende = true)`), nicht in Session-, Vergleichs- und Aufnahme-Karten.
 *
 * Einbau: `Schutzgebiete.anhaengen(map)` im `factory` der Karte; Knopf und Legende legt
 * `MapTiles.MitUmschalter` selbst darueber.
 */
object Schutzgebiete {
    private const val AB_ZOOM = 11.0
    /** Alle an / aus (Schild-Knopf), gilt fuer alle Karten, bis die App neu startet. */
    var an by mutableStateOf(true)
    /** Arten, die auf der zuletzt geladenen Karte gezeichnet sind — fuer die Legende. */
    var gezeichnet by mutableStateOf<Set<String>>(emptySet())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun farbe(art: String): Color = when (art) {
        "ffh" -> Color(0xFFF59E0B)
        "verbot" -> Color(0xFFB91C1C)
        else -> Color(0xFFDC2626)
    }

    private val ebenen = mutableListOf<java.lang.ref.WeakReference<Ebene>>()
    private val jeKarte = java.util.WeakHashMap<MapView, Ebene>()
    /** Haengt die Schutzgebiete an die Karte. Wiederholbar: Karten, die beim Neuzeichnen alle
     *  Ebenen loeschen (`overlays.clear()`), rufen es danach erneut auf — dann kommt nur die schon
     *  geladene Ebene zurueck, nichts wird neu geholt. */
    fun anhaengen(map: MapView): Ebene {
        jeKarte[map]?.let { it.einhaengen(); return it }
        return Ebene(map).also {
            jeKarte[map] = it
            it.start()
            ebenen.removeAll { r -> r.get() == null }
            ebenen.add(java.lang.ref.WeakReference(it))
        }
    }

    class Ebene(private val map: MapView) {
        private val ordner = FolderOverlay()
        private val da = HashSet<String>()
        private val arten = HashSet<String>()
        private var job: Job? = null
        private var versuche = 0
        @Volatile private var tot = false

        internal fun start() {
            gezeichnet = emptySet()
            map.overlays.add(0, ordner)
            map.addMapListener(DelayedMapListener(object : MapListener {
                override fun onScroll(e: ScrollEvent?): Boolean { versuche = 0; laden(); return false }
                override fun onZoom(e: ZoomEvent?): Boolean { versuche = 0; laden(); return false }
            }, 400))
            scope.launch { delay(300); laden() }
        }

        internal fun einhaengen() { if (ordner !in map.overlays) map.overlays.add(0, ordner) }

        fun sichtbarSetzen(sichtbar: Boolean) {
            ordner.isEnabled = sichtbar
            map.invalidate()
        }

        private fun laden() {
            if (tot || map.repository == null || map.zoomLevelDouble < AB_ZOOM || map.width == 0) return
            val bb = map.boundingBox
            job?.cancel()
            job = scope.launch {
                val r = try { Api.schutzgebiete(bb.lonWest, bb.latSouth, bb.lonEast, bb.latNorth) } catch (_: Exception) { return@launch }
                // Karte inzwischen abgebaut (Liste weitergescrollt, Bildschirm verlassen): nichts mehr
                // anfassen — osmdroid stuerzt sonst beim Anlegen einer Flaeche ab (Repository null).
                if (tot || map.repository == null) return@launch
                val dens = map.context.resources.displayMetrics.density
                for (f in r.flaechen) {
                    if (da.contains(f.id)) continue
                    val c = farbe(f.art)
                    // je Aussenring eine Flaeche (Natura-2000-Gebiete bestehen oft aus mehreren Teilen)
                    for (ring in f.aussen) {
                        if (ring.size < 3) continue
                        // ohne MapView anlegen: Polygon(map) holt sich ein Info-Fenster aus dem
                        // Repository der Karte und stuerzt ab, wenn die Karte gerade abgebaut wurde
                        val flaeche = Polygon().apply {
                            infoWindow = null
                            id = f.id
                            points = ring.map { GeoPoint(it[0], it[1]) }
                            holes = f.innen.map { r2 -> r2.map { GeoPoint(it[0], it[1]) } }
                            outlinePaint.color = c.toArgb()
                            outlinePaint.strokeWidth = (if (f.art == "verbot") 3f else if (f.art == "ffh") 1.5f else 2f) * dens
                            if (f.art == "ffh") outlinePaint.pathEffect = android.graphics.DashPathEffect(floatArrayOf(6 * dens, 4 * dens), 0f)
                            fillPaint.color = c.copy(alpha = if (f.art == "verbot") 0.25f else if (f.art == "ffh") 0.05f else 0.1f).toArgb()
                            // Tipp nicht verbrauchen: an die Karte durchreichen (Routen-Punkte setzen)
                            setOnClickListener { _, _, _ -> false }
                        }
                        // FolderOverlay verliert beim Abbau der Karte (onDetach) seine Liste, ohne es
                        // nach aussen zu zeigen -> NullPointerException. Dann ist diese Karte weg.
                        try { ordner.add(flaeche) } catch (_: NullPointerException) { tot = true; return@launch }
                    }
                    da.add(f.id)
                    arten.add(f.art)
                }
                gezeichnet = arten.toSet()
                ordner.isEnabled = an
                map.invalidate()
                if (r.unvollstaendig && versuche < 6) { versuche++; delay(6000); if (map.repository != null) laden() }
            }
        }
    }

    /** Schild-Knopf (alle ein/aus) — unter dem Ebenen-Umschalter oben links. */
    @Composable
    fun Knopf(modifier: Modifier = Modifier) {
        val name = I18n.t("map.protectedToggle")
        androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Outlined.Shield, contentDescription = name,
            tint = if (an) Color(0xFFDC2626) else Color(0xFF94A3B8),
            modifier = modifier.padding(start = 8.dp).clip(RoundedCornerShape(6.dp))
                .background(androidx.compose.material3.MaterialTheme.colorScheme.surface.copy(alpha = 0.92f))
                .clickable(onClickLabel = name) {
                    an = !an
                    ebenen.forEach { it.get()?.sichtbarSetzen(an) }
                }
                .padding(6.dp).size(20.dp))
    }

    /** Legende unten links: nur die gezeichneten Arten. */
    @Composable
    fun Legende(modifier: Modifier = Modifier) {
        if (!an || gezeichnet.isEmpty()) return
        Column(modifier.padding(8.dp).clip(RoundedCornerShape(6.dp)).background(Color.White.copy(alpha = 0.88f))
            .padding(horizontal = 7.dp, vertical = 4.dp)) {
            for (a in listOf("nsg", "ffh", "verbot")) if (a in gezeichnet) Row(verticalAlignment = Alignment.CenterVertically) {
                val c = farbe(a)
                Canvas(Modifier.size(width = 22.dp, height = 8.dp)) {
                    drawLine(c, Offset(0f, size.height / 2), Offset(size.width, size.height / 2),
                        strokeWidth = (if (a == "verbot") 3f else 2f) * density,
                        pathEffect = if (a == "ffh") PathEffect.dashPathEffect(floatArrayOf(6 * density, 4 * density)) else null)
                }
                Spacer(Modifier.width(6.dp))
                Text(I18n.t(when (a) { "ffh" -> "map.ffh"; "verbot" -> "map.prohibited"; else -> "map.nsg" }),
                    fontSize = 11.sp, color = Color(0xFF0F172A))
            }
        }
    }
}
