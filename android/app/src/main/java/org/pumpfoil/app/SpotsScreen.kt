package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberUpdatedState
import org.osmdroid.config.Configuration
import org.osmdroid.events.DelayedMapListener
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpotsScreen(onOpenSpot: (String) -> Unit = {}, onOpenSession: (Int) -> Unit = {}) {
    var items by remember { mutableStateOf<List<SpotMapItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        try { items = Api.spotMap().sortedByDescending { it.sessions }; error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    // EINE Karte fuer die Lebensdauer der Seite — bewusst HIER und nicht in `SpotsMap`.
    //
    // Grund (Jan, 02.09.): „Crash wenn ich hochscrolle und oben ankomme". Es war kein Absturz,
    // sondern ein ANR — im Log „Input dispatching timed out, waited 5000ms" bei 98 % Hauptthread.
    // Ursache: die Karte war ein Eintrag der LazyColumn, wurde beim Rausscrollen verworfen und
    // beim Zurueckscrollen NEU GEBAUT. Eine osmdroid-MapView legt dabei ihren Kachel-Cache samt
    // SQLite-Datei an, und das auf dem Hauptthread — bei jedem Rein-Scrollen erneut.
    //
    // `remember` MUSS hier oben stehen: im Listeneintrag wuerde es mit dem Eintrag vergessen,
    // und wir waeren wieder beim Neubauen.
    val ctx = LocalContext.current
    val karte = remember {
        Configuration.getInstance().userAgentValue = ctx.packageName
        MapView(ctx).apply {
            setMultiTouchControls(true)
            controller.setZoom(5.0)
        }
    }
    DisposableEffect(karte) { onDispose { karte.onDetach() } }

    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.spots")) }) { pad ->
        val scope = rememberCoroutineScope()
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { load() } }) {
            if (loading && items.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                    if (items.isNotEmpty()) {
                        item { SpotsMap(karte, items, onOpenSpot, Modifier.fillMaxWidth().height(260.dp)) }
                        // Spot-Vergleich direkt unter der Karte — dieselbe Stelle wie in der PWA.
                        item { SpotCompareSection(onOpenSession = onOpenSession, onOpenSpot = onOpenSpot) }
                    }
                    if (items.isEmpty() && !loading && error == null) {
                        item { Text(I18n.t("spots.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    items(items) { s ->
                        ListItem(
                            modifier = Modifier.clickable { onOpenSpot(s.spot) },
                            headlineContent = { Text(s.spot) },
                            supportingContent = { Text("${s.sessions} ${I18n.t("nav.sessions")}") },
                            leadingContent = {
                                Icon(Icons.Filled.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            },
                        )
                        HorizontalDivider()
                    }
                }
            }
            }
        }
    }
}

// Kleiner Marken-Cyan-Punkt (#22d3ee, Navy-Rand) als Marker-Icon — wie die circleMarker der PWA.
private fun cyanDot(ctx: android.content.Context): android.graphics.drawable.Drawable {
    val size = (ctx.resources.displayMetrics.density * 14).toInt().coerceAtLeast(20)
    val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    val cx = size / 2f; val r = size / 2f - ctx.resources.displayMetrics.density * 1.5f
    val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF22D3EE.toInt() }
    val stroke = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0F172A.toInt(); style = android.graphics.Paint.Style.STROKE; strokeWidth = ctx.resources.displayMetrics.density * 1.5f
    }
    c.drawCircle(cx, cx, r, fill); c.drawCircle(cx, cx, r, stroke)
    return android.graphics.drawable.BitmapDrawable(ctx.resources, bmp)
}

// Buendel-Pin: Anzahl der SPOTS im Kreis. Groesser als der Einzelpunkt und mit Zahl darin —
// dadurch sofort als "hier liegen mehrere" erkennbar (wie das divIcon der PWA).
private fun cyanBundle(ctx: android.content.Context, anzahl: Int): android.graphics.drawable.Drawable {
    val d = ctx.resources.displayMetrics.density
    val size = (d * 26).toInt().coerceAtLeast(34)
    val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    val cx = size / 2f; val r = size / 2f - d * 1.5f
    val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF22D3EE.toInt() }
    val stroke = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0F172A.toInt(); style = android.graphics.Paint.Style.STROKE; strokeWidth = d * 2f
    }
    val text = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0F172A.toInt(); textAlign = android.graphics.Paint.Align.CENTER
        textSize = d * 12f; isFakeBoldText = true
    }
    c.drawCircle(cx, cx, r, fill); c.drawCircle(cx, cx, r, stroke)
    // Grundlinie so setzen, dass die Zahl senkrecht mittig sitzt.
    c.drawText(anzahl.toString(), cx, cx - (text.descent() + text.ascent()) / 2f, text)
    return android.graphics.drawable.BitmapDrawable(ctx.resources, bmp)
}

// Weltpixel der Web-Mercator-Projektion bei einer Zoomstufe — dieselbe Rechnung, die Leaflets
// `map.project()` im Web macht (osmdroid: 256er-Kacheln, 1 Weltpixel = 1 Bildschirmpixel).
private fun weltPixel(lat: Double, lon: Double, zoom: Double): DoubleArray {
    val n = 256.0 * Math.pow(2.0, zoom)
    val s = Math.sin(Math.toRadians(lat)).coerceIn(-0.9999, 0.9999)
    return doubleArrayOf(
        (lon + 180.0) / 360.0 * n,
        (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
    )
}

// Spots buendeln, solange sie sich bei dieser Zoomstufe ueberdecken — dieselbe Regel wie im Web
// (web/src/pages/Spots.tsx, 20.08.) und in iOS (SpotsView.swift): die sessionstaerksten Spots
// zuerst als Anker, alles innerhalb von `naehe` Pixeln kommt dazu. Deterministisch.
//
// Anlass ist eine Nutzermeldung: bei Europa-Zoom ueberdecken sich die Punkte, und der Tipp landete
// im zuletzt gezeichneten Nachbarn — teils 40 km entfernt. Ein Buendel zeigt stattdessen, DASS da
// mehrere liegen, und zoomt beim Tippen hinein.
fun buendelSpots(items: List<SpotMapItem>, zoom: Double, naehe: Double): List<List<SpotMapItem>> {
    if (items.isEmpty()) return emptyList()
    val px = items.map { weltPixel(it.lat, it.lon, zoom) }
    val reihe = items.indices.sortedByDescending { items[it].sessions }
    val belegt = BooleanArray(items.size)
    val out = ArrayList<List<SpotMapItem>>()
    for (i in reihe) {
        if (belegt[i]) continue
        belegt[i] = true
        val gruppe = ArrayList<SpotMapItem>().apply { add(items[i]) }
        for (j in reihe) {
            if (belegt[j]) continue
            val dx = px[i][0] - px[j][0]; val dy = px[i][1] - px[j][1]
            if (dx * dx + dy * dy < naehe * naehe) { gruppe.add(items[j]); belegt[j] = true }
        }
        out.add(gruppe)
    }
    return out
}

// FLOSS-Karte (OpenStreetMap via osmdroid) mit gebuendelten Pins, eingebettet per AndroidView
// in Compose. Kein API-Key noetig.
@Composable
private fun SpotsMap(
    karte: MapView,
    items: List<SpotMapItem>,
    onOpenSpot: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Damit der Zoom-Listener (einmalig gesetzt) immer die aktuellen Daten sieht.
    val daten = rememberUpdatedState(items)
    val oeffne = rememberUpdatedState(onOpenSpot)
    // Der Listener haengt an der KARTE, nicht am Listeneintrag — deshalb nur einmal setzen.
    LaunchedEffect(karte) {
        karte.addMapListener(DelayedMapListener(object : MapListener {
            override fun onScroll(e: ScrollEvent?): Boolean = false
            override fun onZoom(e: ZoomEvent?): Boolean {
                zeichnePins(karte, daten.value, oeffne.value); return true
            }
        }, 150))
    }
    MapTiles.MitUmschalter(modifier) { ebene ->
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            // Gibt die EINE Karte zurueck, statt eine neue zu bauen. Beim Zurueckscrollen haengt
            // sie noch am alten Eltern-Container — erst abmelden, dann wieder einhaengen.
            // KEIN `onRelease = onDetach` hier: die Karte soll das Rausscrollen ueberleben.
            // Aufgeraeumt wird beim Verlassen der Seite (DisposableEffect in SpotsScreen).
            factory = {
                (karte.parent as? android.view.ViewGroup)?.removeView(karte)
                karte
            },
            update = { map ->
                MapTiles.anwenden(map, ebene)
                // Merker am View: `update` laeuft bei jeder Recomposition, und Pins neu bauen
                // heisst eine Bitmap je Buendel plus neues Einpassen.
                val stand = "${'$'}{items.size}:${'$'}{items.firstOrNull()?.spot}"
                if (map.tag != stand) {
                    map.tag = stand
                    zeichnePins(map, items, onOpenSpot)
                    val pts = items.map { GeoPoint(it.lat, it.lon) }
                    if (pts.size == 1) {
                        map.controller.setZoom(11.0)
                        map.controller.setCenter(pts[0])
                    } else if (pts.size > 1) {
                        val bb = BoundingBox.fromGeoPoints(pts)
                        map.post { map.zoomToBoundingBox(bb.increaseByScale(1.3f), false, 48) }
                    }
                }
            },
        )
    }
}

// Overlays neu setzen: ein Pin je Buendel. Einzelner Spot -> zu seinen Sessions; mehrere ->
// hineinzoomen, damit der Nutzer selbst waehlt.
private fun zeichnePins(map: MapView, items: List<SpotMapItem>, onOpenSpot: (String) -> Unit) {
    map.overlays.clear()
    val d = map.context.resources.displayMetrics.density
    val gruppen = buendelSpots(items, map.zoomLevelDouble, (d * 24).toDouble())
    val punkt = cyanDot(map.context)
    for (g in gruppen) {
        val mitte = BoundingBox.fromGeoPoints(g.map { GeoPoint(it.lat, it.lon) })
        map.overlays.add(Marker(map).apply {
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            if (g.size == 1) {
                val s = g[0]
                position = GeoPoint(s.lat, s.lon)
                title = "${s.spot} (${s.sessions})"
                icon = punkt
                setOnMarkerClickListener { _, _ -> onOpenSpot(s.spot); true }
            } else {
                position = GeoPoint(mitte.centerLatitude, mitte.centerLongitude)
                title = g.take(6).joinToString("\n") { "${it.spot} (${it.sessions})" } +
                    if (g.size > 6) "\n… +${g.size - 6}" else ""
                icon = cyanBundle(map.context, g.size)
                setOnMarkerClickListener { _, _ ->
                    map.zoomToBoundingBox(mitte.increaseByScale(1.6f), true, 48)
                    true
                }
            }
        })
    }
    map.invalidate()
}
