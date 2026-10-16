package org.pumpfoil.app

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.view.MotionEvent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.sinh

/*
 * „Heatmap & Routen" auf der Spot-Seite — nach web/src/components/SpotHeatmap.tsx (Jan, 16.10.2026).
 *
 *  - Karte, eingepasst auf die gefahrenen Zellen des letzten Jahres um den Spot (keine Pins).
 *  - Heatmap: „Auf dem Foil" / „Startpunkte" und 1 Jahr (Vorgabe) / 30 Tage / Aus; „Aus" nimmt nur
 *    die Heatmap weg, die Karte bleibt. Beide Wahlen gelten fuer alle Spots weiter.
 *  - Gemerkte Routen als Kaertchen unter der Karte (im Planungsmodus ganz unten ueber der Legende).
 *  - „Route planen": die Planung (RoutenPlanung.kt) unter der Karte.
 *
 * Ohne Zellen am Spot bleibt das Panel ganz weg (wie im Web).
 */

private const val UMKREIS_GRAD = 0.02

/** Zustand des Panels AUSSERHALB der LazyColumn (vom Bildschirm gehalten): scrollt das Panel aus dem
 *  Bild, verwirft die Liste seine Komposition — Planung, gewaehlte Route und Ergebnis bleiben hier. */
class SpotPanelZustand(ctx: android.content.Context, val spotId: Int) {
    val plan = RoutenPlanung(ctx, spotId)
    var planen by mutableStateOf(false)
    var gemerktWahl by mutableStateOf<String?>(null)
    var linkErledigt by mutableStateOf(false)
}
private val GRUEN = Color(0xFF4ADE80)
private val CYAN = Color(0xFF22D3EE)
private val DUNKEL = Color(0xFF0F172A)

@OptIn(ExperimentalLayoutApi::class)
@SuppressLint("ClickableViewAccessibility")
@Composable
fun SpotHeatmapPanel(z: SpotPanelZustand, lat: Double, lon: Double, sport: String, routeAusLink: Int? = null) {
    val spotId = z.spotId
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
    var wahl by remember { mutableStateOf(prefs.getString("spot_heatmap", "365d").let { if (it == "30d" || it == "off") it else "365d" }) }
    var art by remember { mutableStateOf(if (prefs.getString("spot_heatmap_art", "foil") == "start") "start" else "foil") }
    var leer by remember(spotId) { mutableStateOf(false) }
    var bereit by remember(spotId) { mutableStateOf(false) }
    var planen by z::planen
    var gemerkt by remember(spotId) { mutableStateOf<List<GemerkteRoute>>(emptyList()) }
    var gemerktWahl by z::gemerktWahl
    var meineStarts by remember(spotId) { mutableStateOf<List<List<Double>>>(emptyList()) }
    var loeschen by remember { mutableStateOf<GemerkteRoute?>(null) }
    var linkErledigt by z::linkErledigt
    val scope = rememberCoroutineScope()
    val plan = z.plan

    suspend fun gemerktLaden() { gemerkt = try { Api.spotRouten(spotId) } catch (_: Exception) { emptyList() } }
    LaunchedEffect(spotId) { gemerktLaden() }
    LaunchedEffect(spotId, sport) { meineStarts = try { Api.spotMeineStarts(spotId, sport) } catch (_: Exception) { emptyList() } }

    // Karte einmal je Spot anlegen
    val karte = remember(spotId) {
        Configuration.getInstance().userAgentValue = ctx.packageName
        MapView(ctx).apply {
            setMultiTouchControls(true)
            controller.setZoom(15.0); controller.setCenter(GeoPoint(lat, lon))
            Schutzgebiete.anhaengen(this)
            // In der scrollenden Seite: Gesten auf der Karte gehoeren der Karte
            setOnTouchListener { v, e ->
                if (e.action == MotionEvent.ACTION_DOWN) v.parent?.requestDisallowInterceptTouchEvent(true)
                false
            }
        }
    }
    val ebene = remember(spotId) { mutableListOf<Overlay>() }
    androidx.compose.runtime.DisposableEffect(karte) { onDispose { karte.onDetach() } }

    // Einpassen auf die Zellen des letzten Jahres um den Spot; ohne Zellen -> Panel weg
    LaunchedEffect(spotId) {
        try {
            val u = UMKREIS_GRAD
            val r = Api.heatmap("365d", 15, lon - u * 1.5, lat - u, lon + u * 1.5, lat + u)
            val z = r.z
            if (z == null || r.cells.isEmpty()) { leer = true; return@LaunchedEffect }
            val n = (1L shl z).toDouble()
            fun lonX(x: Double) = x / n * 360.0 - 180.0
            fun latY(y: Double) = Math.toDegrees(atan(sinh(PI * (1 - 2 * y / n))))
            val xs = r.cells.map { it[0] }; val ys = r.cells.map { it[1] }
            val bb = BoundingBox(latY(ys.min().toDouble()), lonX(xs.max() + 1.0), latY(ys.max() + 1.0), lonX(xs.min().toDouble()))
            kotlinx.coroutines.delay(150)
            karte.post { karte.zoomToBoundingBox(bb, false, 40, 17.0, null) }
            bereit = true
        } catch (_: Exception) { leer = true }
    }

    fun gemerktKlick(r: GemerkteRoute) {
        if (planen && gemerktWahl == r.schluessel) { gemerktWahl = null; planen = false; plan.fremdeEntfernen(); return }
        gemerktWahl = r.schluessel
        val warOffen = planen
        planen = true
        if (warOffen || plan.serverPos != null) {
            if (plan.aufrufen(r)) scope.launch { plan.rechnen() }
        } else {
            plan.aufrufen(r)   // die Startplaetze laedt das Oeffnen und rechnet dann mit `wieder`
        }
    }
    // Aus der Community-Liste verlinkt: die Route einmal aufrufen wie per Klick
    LaunchedEffect(bereit, gemerkt, routeAusLink) {
        if (routeAusLink == null || linkErledigt || !bereit || gemerkt.isEmpty()) return@LaunchedEffect
        linkErledigt = true
        gemerkt.firstOrNull { it.id == routeAusLink }?.let { gemerktKlick(it) }
    }

    // Planung: Startplaetze je Anforderung laden (auch beim Oeffnen)
    LaunchedEffect(planen, plan.minStarts, plan.minFahrer, plan.umkreis, sport) {
        if (planen) plan.ladePositionen(sport) else plan.fremdeEntfernen()
    }
    // Nach einem Umkreis-Wechsel die Karte auf alle Startplaetze einpassen
    LaunchedEffect(plan.serverPos) {
        val p = plan.pos
        if (plan.einpassen && p != null && p.isNotEmpty()) {
            plan.einpassen = false
            val bb = BoundingBox.fromGeoPoints(p.map { GeoPoint(it.lat, it.lon) })
            karte.post { karte.zoomToBoundingBox(bb.increaseByScale(1.2f), false, 40, 16.0, null) }
        }
    }
    // Weicht die Planung von der aufgerufenen gemerkten Route ab, ist es nicht mehr sie
    LaunchedEffect(plan.gewaehlt, plan.einstellungsSchluessel, plan.gerechnetMit, plan.ueberlagert) {
        val g = gemerkt.firstOrNull { it.schluessel == gemerktWahl } ?: return@LaunchedEffect
        if (planen && plan.wieder == null && !plan.istNoch(g)) gemerktWahl = null
    }

    // Karte zeichnen: Route, Startplaetze, eigene Punkte, gemerkte Route ohne Planung
    val dens = ctx.resources.displayMetrics.density
    LaunchedEffect(bereit, planen, plan.serverPos, plan.eigene, plan.gewaehlt, plan.gerechnetMit, plan.einstellungsSchluessel,
                   plan.ueberlagert, plan.start, plan.aus, meineStarts, plan.umkreis, gemerktWahl, gemerkt, plan.setzen) {
        if (!bereit || karte.repository == null) return@LaunchedEffect   // abgebaute Karte nicht anfassen
        karte.overlays.removeAll(ebene); ebene.clear()
        if (planen) {
            val p = plan.pos
            if (p != null) {
                if (plan.umkreis > 0) ebene.add(Polygon(karte).apply {
                    points = Polygon.pointsAsCircle(GeoPoint(lat, lon), plan.umkreis * 1000.0)
                    fillPaint.color = android.graphics.Color.TRANSPARENT
                    outlinePaint.color = CYAN.toArgb(); outlinePaint.strokeWidth = 1.5f * dens
                    outlinePaint.pathEffect = DashPathEffect(floatArrayOf(6 * dens, 6 * dens), 0f)
                    setOnClickListener { _, _, _ -> false }
                })
                val r = plan.gewaehlteRoute
                val linie = r?.punkte?.map { p[it].lat to p[it].lon }
                    ?: plan.ueberlagert?.takeIf { !plan.veraltet }?.punkte?.map { it[0] to it[1] }
                if (linie != null) routeZeichnen(karte, ebene, linie, dens)
                p.forEachIndexed { i, q ->
                    val raus = i in plan.aus
                    val aktiv = !raus && (r?.punkte?.contains(i) ?: true)
                    val farbe = when { !aktiv -> Color(0xFF94A3B8); plan.schonGestartet(meineStarts, q) -> GRUEN; else -> CYAN }
                    ebene.add(Marker(karte).apply {
                        position = GeoPoint(q.lat, q.lon)
                        icon = platzIcon(Routen.platzName(i), farbe, i == plan.start, q.eigen, raus, dens)
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        setInfoWindow(null)
                        setOnMarkerClickListener { _, _ -> if (!raus) plan.start = i; true }
                        if (q.eigen) {
                            isDraggable = true
                            setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
                                override fun onMarkerDrag(m: Marker?) {}
                                override fun onMarkerDragStart(m: Marker?) {}
                                override fun onMarkerDragEnd(m: Marker?) {
                                    m ?: return
                                    plan.eigenenVerschieben(i - plan.nServer, m.position.latitude, m.position.longitude)
                                }
                            })
                        }
                    })
                }
            }
            // Tippen auf die Karte setzt einen eigenen Punkt, solange „+" aktiv ist
            if (plan.setzen) ebene.add(MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(g: GeoPoint?): Boolean { g ?: return false; plan.eigenenSetzen(g.latitude, g.longitude); return true }
                override fun longPressHelper(g: GeoPoint?) = false
            }))
        } else {
            gemerkt.firstOrNull { it.schluessel == gemerktWahl }?.let { g ->
                val pts = g.punkte.map { it[0] to it[1] }
                routeZeichnen(karte, ebene, pts, dens)
                pts.forEachIndexed { i, (a, b) ->
                    if (i > 0 && i == pts.size - 1 && Routen.abstandM(a, b, pts[0].first, pts[0].second) < 1) return@forEachIndexed
                    val mein = meineStarts.any { it.size == 2 && Routen.abstandM(it[0], it[1], a, b) < RoutenPlanung.MEIN_M }
                    ebene.add(Marker(karte).apply {
                        position = GeoPoint(a, b)
                        icon = punktIcon(if (i == 0) Color.White else if (mein) GRUEN else CYAN, if (i == 0) 14 else 10, dens)
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER); setInfoWindow(null)
                        setOnMarkerClickListener { _, _ -> true }
                    })
                }
            }
        }
        karte.overlays.addAll(ebene)
        karte.invalidate()
    }

    if (leer) return
    val heatZeitraum = if (wahl == "off") null else wahl
    HeatmapLaden(karte, if (bereit) heatZeitraum else null, art, sport) { }

    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("spots.heatmapRoutes"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Pille(I18n.t("spots.heatFoil"), art == "foil") { art = "foil"; prefs.edit().putString("spot_heatmap_art", "foil").apply() }
                Pille(I18n.t("spots.heatStart"), art == "start") { art = "start"; prefs.edit().putString("spot_heatmap_art", "start").apply() }
                Pille(I18n.t("period.365d"), wahl == "365d") { wahl = "365d"; prefs.edit().putString("spot_heatmap", "365d").apply() }
                Pille(I18n.t("period.30d"), wahl == "30d") { wahl = "30d"; prefs.edit().putString("spot_heatmap", "30d").apply() }
                Pille(I18n.t("spots.heatOff"), wahl == "off") { wahl = "off"; prefs.edit().putString("spot_heatmap", "off").apply() }
                // Routen planen: hervorgehoben (Jan)
                Pille(I18n.t("routes.plan"), planen, betont = true) { planen = !planen }
            }
            Spacer(Modifier.height(8.dp))
            MapTiles.MitUmschalter(Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(10.dp)), legende = true) { ebeneWahl ->
                // KEIN onRelease -> onDetach: die Karte ist oben gemerkt und wird wiederverwendet; eine
                // abgebaute osmdroid-Karte zeichnet danach nichts Neues mehr. Abgebaut wird sie, wenn
                // das Panel verschwindet (DisposableEffect oben).
                AndroidView(modifier = Modifier.fillMaxSize(), factory = { karte.also { (it.parent as? android.view.ViewGroup)?.removeView(it); MapTiles.anwenden(it, ebeneWahl) } },
                    update = { MapTiles.anwenden(it, ebeneWahl) })
                // „+" fuer eigene Punkte (nur in der Planung), oben rechts
                if (planen) Box(Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.TopEnd) {
                    Surface(shape = RoundedCornerShape(6.dp), color = if (plan.setzen) CYAN else MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                        modifier = Modifier.size(36.dp).clickable { plan.setzen = !plan.setzen }) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("＋", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = if (plan.setzen) DUNKEL else MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
            val leiste: @Composable () -> Unit = {
                if (gemerkt.isNotEmpty()) GemerkteLeiste(gemerkt, gemerktWahl, ::gemerktKlick)
            }
            if (!planen) leiste()
            if (planen) PlanungsBereich(plan, scope, lat, lon, meineStarts, gemerkt, onGemerkt = { scope.launch { gemerktLaden() } },
                onLoeschen = { loeschen = it }, leiste = leiste)
        }
    }

    loeschen?.let { g ->
        AlertDialog(onDismissRequest = { loeschen = null },
            text = { Text(I18n.t("routes.deleteConfirm")) },
            confirmButton = { TextButton(onClick = {
                val id = g.eigeneId
                loeschen = null
                if (id != null) scope.launch {
                    try { Api.spotRouteVergessen(spotId, id); plan.merkStatus = null; gemerktLaden() } catch (_: Exception) {}
                }
            }) { Text(I18n.t("routes.delete")) } },
            dismissButton = { TextButton(onClick = { loeschen = null }) { Text(I18n.t("common.cancel")) } })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GemerkteLeiste(gemerkt: List<GemerkteRoute>, wahl: String?, onKlick: (GemerkteRoute) -> Unit) {
    FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(I18n.t("routes.savedTitle"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.CenterVertically))
        for (r in gemerkt) {
            val (n, maxM) = gemerktKurz(r)
            val an = wahl == r.schluessel
            Pille(buildString {
                if (r.eigeneId != null) append("● ")
                append(I18n.t("routes.savedChip").replace("{n}", "$n").replace("{max}", "$maxM")
                    .replace("{total}", "${r.meter}").replace("{datum}", routenDatum(r.gemerktAm)))
                if (mitEigenen(r)) append(" · ").append(I18n.t("routes.manualTag"))
            }, an, klein = true) { onKlick(r) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanungsBereich(plan: RoutenPlanung, scope: kotlinx.coroutines.CoroutineScope, spotLat: Double, spotLon: Double,
                            meineStarts: List<List<Double>>, gemerkt: List<GemerkteRoute>,
                            onGemerkt: () -> Unit, onLoeschen: (GemerkteRoute) -> Unit, leiste: @Composable () -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.padding(top = 10.dp)) {
        // Anforderungen an Startplaetze
        Kasten(I18n.t("routes.startReq")) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Klein(I18n.t("routes.reliability"))
                RoutenPlanung.ZUVERLAESSIG.forEach { n -> Pille("≥ $n×", plan.minStarts == n, klein = true) { plan.minStarts = n } }
            }
            FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Klein(I18n.t("routes.riders"))
                RoutenPlanung.FAHRER.forEach { n -> Pille("≥ $n", plan.minFahrer == n, klein = true) { plan.minFahrer = n } }
            }
            FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Klein(I18n.t("routes.radius"))
                RoutenPlanung.UMKREIS.forEach { km -> Pille("$km km", plan.umkreis == km, klein = true) { plan.umkreisSetzen(km) } }
            }
        }
        if (plan.setzen) {
            Text(if (plan.eigene.size >= RoutenPlanung.EIGENE_MAX) I18n.t("routes.addPointLimit").replace("{n}", "${RoutenPlanung.EIGENE_MAX}")
                 else I18n.t("routes.addPointHint"),
                Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, CYAN, RoundedCornerShape(8.dp)).padding(8.dp),
                style = MaterialTheme.typography.bodyMedium)
        }
        val pos = plan.pos
        if (pos == null) { Text("…", Modifier.padding(8.dp), color = grau); leiste(); return@Column }
        val richtungen = plan.compassRichtungen()
        Kasten(I18n.t("routes.config")) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Klein(I18n.t("routes.startPoints"))
                pos.forEachIndexed { i, p ->
                    StartplatzPille(plan, i, p, richtungen, plan.schonGestartet(meineStarts, p), spotLat, spotLon)
                    if (i == plan.start && plan.richtungsWahl.isNotEmpty()) {
                        Klein(I18n.t("routes.direction"))
                        (listOf<Int?>(null) + plan.richtungsWahl).forEach { r ->
                            Pille(if (r == null) I18n.t("routes.anyDirection") else Routen.platzName(r), plan.richtung == r, klein = true) {
                                plan.richtung = r
                                plan.gewaehlt = plan.liste(r).firstOrNull()?.schluessel
                            }
                        }
                    }
                }
            }
            if (!plan.rundkurs) FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Klein(I18n.t("routes.target"))
                Pille(I18n.t("routes.anyDirection"), plan.zielAktiv == null, klein = true) { plan.zielPlatz = null }
                pos.indices.filter { it != plan.start && it !in plan.aus }.forEach { i ->
                    Pille(Routen.platzName(i), plan.zielAktiv == i, klein = true) { plan.zielPlatz = i }
                }
            }
            Regler(I18n.t("routes.minDist"), plan.minM, 0, 1000, 10, " m") { plan.minM = minOf(it, plan.maxM) }
            Regler(I18n.t("routes.maxDist"), plan.maxM, 50, if (plan.umkreis > 0) 10000 else 2000, if (plan.umkreis > 0) 50 else 10, " m") { plan.maxM = maxOf(it, plan.minM) }
            if (pos.size >= 2) Regler(I18n.t("routes.count"), minOf(plan.anzahl, pos.size), 2, pos.size, 1, "") { plan.anzahl = it }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Haken(I18n.t("routes.noCrossing"), plan.ohneKreuzung) { plan.ohneKreuzung = it }
                Haken(I18n.t("routes.roundtrip"), plan.rundkurs) { plan.rundkurs = it }
            }
        }
        val veraltet = plan.veraltet
        if (veraltet) {
            Button(onClick = {
                plan.ueberlagert = null
                plan.fremdeEntfernen()
                scope.launch { plan.rechnen() }
            }, modifier = Modifier.padding(top = 8.dp)) { Text(I18n.t("routes.compute")) }
        } else {
            plan.ueberlagert?.let { u ->
                Column(Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, grau.copy(alpha = 0.4f), RoundedCornerShape(8.dp)).padding(8.dp)) {
                    Text(I18n.t("routes.changed"), style = MaterialTheme.typography.bodyMedium)
                    AbschnittChips(u.punkte.map { it[0] to it[1] }, u.punkte.map { k ->
                        plan.naechster(pos, k[0], k[1]).let { if (it >= 0) Routen.platzName(it) else "·" } })
                }
            }
            val routen = plan.routen
            if (routen.isEmpty()) {
                plan.ergebnis?.let { e -> Hinweis(warumText(plan, e, pos.size)) }
            } else {
                RoutenTabelle(plan, routen, pos, gemerkt, scope, onGemerkt, onLoeschen)
            }
            if (plan.ergebnis?.gekuerzt == true) Text(I18n.t("routes.cut"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 6.dp))
        }
        // Gemerkte Routen und Legende unter der Tabelle (Jan)
        leiste()
        val gruen = pos.any { plan.schonGestartet(meineStarts, it) }
        if (gruen || plan.eigene.isNotEmpty()) FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (gruen) Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(12.dp).clip(CircleShape).background(GRUEN)); Spacer(Modifier.width(6.dp))
                Text(I18n.t("routes.myStart"), style = MaterialTheme.typography.bodyMedium, color = grau)
            }
            if (plan.eigene.isNotEmpty()) Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(12.dp).clip(CircleShape).background(CYAN).border(1.5.dp, DUNKEL, CircleShape)); Spacer(Modifier.width(6.dp))
                Text(I18n.t("routes.ownPoint"), style = MaterialTheme.typography.bodyMedium, color = grau)
            }
        }
    }
}

private fun RoutenPlanung.compassRichtungen(): List<String> = I18n.t("map.compass").split(",").let { if (it.size == 8) it else listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW") }

@Composable
private fun StartplatzPille(plan: RoutenPlanung, i: Int, p: Startposition, richtungen: List<String>, mein: Boolean,
                            spotLat: Double, spotLon: Double) {
    val raus = i in plan.aus
    val istStart = plan.start == i
    // Lage zum Spot selbst (mit Umkreis ist der meistgenutzte Platz oft ein fremder)
    val lage = Routen.lageText(p.lat, p.lon, spotLat, spotLon, richtungen)
    Surface(shape = RoundedCornerShape(50), color = if (istStart) CYAN else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, if (istStart) CYAN else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
        modifier = Modifier.then(if (raus) Modifier.background(Color.Transparent) else Modifier)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 4.dp)) {
            // Haken = wird angefahren; abhaken schliesst aus. Der Start ist immer dabei.
            Box(Modifier.size(32.dp).clickable(enabled = !istStart) {
                plan.aus = if (raus) plan.aus - i else plan.aus + i
            }, contentAlignment = Alignment.Center) { Text(if (raus) "○" else "✓", color = if (istStart) DUNKEL else MaterialTheme.colorScheme.onSurface) }
            Row(Modifier.clickable(enabled = !raus) { plan.start = i }.padding(end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (mein) { Box(Modifier.size(9.dp).clip(CircleShape).background(GRUEN)); Spacer(Modifier.width(5.dp)) }
                Text(Routen.platzName(i), fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    textDecoration = if (raus) TextDecoration.LineThrough else if (p.eigen) TextDecoration.Underline else null,
                    color = if (istStart) DUNKEL else MaterialTheme.colorScheme.onSurface.copy(alpha = if (raus) 0.5f else 1f))
                if (lage.isNotEmpty()) Text(" · $lage", fontSize = 13.sp,
                    color = if (istStart) DUNKEL else MaterialTheme.colorScheme.onSurface.copy(alpha = if (raus) 0.5f else 1f))
            }
            if (p.eigen) Box(Modifier.size(28.dp).clickable { plan.eigenenEntfernen(i - plan.nServer) }, contentAlignment = Alignment.Center) {
                Text("✕", fontSize = 13.sp, color = if (istStart) DUNKEL else MaterialTheme.colorScheme.onSurface)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RoutenTabelle(plan: RoutenPlanung, routen: List<Route>, pos: List<Startposition>, gemerkt: List<GemerkteRoute>,
                          scope: kotlinx.coroutines.CoroutineScope, onGemerkt: () -> Unit, onLoeschen: (GemerkteRoute) -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, grau.copy(alpha = 0.3f), RoundedCornerShape(8.dp))) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Kopf("#", RoutenSpalte.EMPF, plan, Modifier.width(28.dp))
            Text(I18n.t("routes.colRoute"), Modifier.weight(1f), fontSize = 12.sp, color = grau)
            Kopf(I18n.t("routes.colDistance"), RoutenSpalte.METER, plan, Modifier.width(64.dp))
            Kopf(I18n.t("routes.colLegs"), RoutenSpalte.LEGS, plan, Modifier.width(48.dp))
            Kopf(I18n.t("routes.colCrossings"), RoutenSpalte.KREUZ, plan, Modifier.width(48.dp))
            Kopf(I18n.t("routes.colDuplicates"), RoutenSpalte.DOPPELT, plan, Modifier.width(48.dp))
        }
        Column(Modifier.heightIn(max = 300.dp).verticalScroll(rememberScrollState())) {
            routen.forEachIndexed { idx, r ->
                val an = plan.gewaehlt == r.schluessel
                Column(Modifier.fillMaxWidth().background(if (an) CYAN.copy(alpha = 0.12f) else Color.Transparent)
                    .clickable { plan.gewaehlt = if (an) null else r.schluessel; plan.merkStatus = null; plan.ueberlagert = null }) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${idx + 1}", Modifier.width(28.dp), fontSize = 12.sp, color = grau)
                        Text(r.punkte.joinToString(" → ") { Routen.platzName(it) }, Modifier.weight(1f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("${Math.round(r.meter)} m", Modifier.width(64.dp), fontSize = 12.sp, textAlign = TextAlign.End)
                        Text("${r.punkte.size - 1}", Modifier.width(48.dp), fontSize = 12.sp, textAlign = TextAlign.Center)
                        Text("${r.kreuzungen}", Modifier.width(48.dp), fontSize = 12.sp, textAlign = TextAlign.Center)
                        Text("${r.doppelt}", Modifier.width(48.dp), fontSize = 12.sp, textAlign = TextAlign.Center)
                    }
                    if (an) Column(Modifier.padding(start = 34.dp, end = 6.dp, bottom = 8.dp)) {
                        AbschnittChips(r.punkte.map { pos[it].lat to pos[it].lon }, r.punkte.map { Routen.platzName(it) })
                        val meine = gemerkt.firstOrNull { g -> g.eigeneId != null && gleicheRoute(g, r.punkte.map { pos[it] }) }
                        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (meine != null || plan.merkStatus == "ok") {
                                Text(I18n.t("routes.saved"), color = CYAN, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                // Loeschen nur hier, mit Rueckfrage (Jan) — nur der eigene Eintrag
                                if (meine != null) TextButton(onClick = { onLoeschen(meine) }) { Text(I18n.t("routes.delete"), fontSize = 13.sp) }
                            } else {
                                Pille(I18n.t("routes.save"), false, betont = true, klein = true) {
                                    if (plan.merkStatus != "…") scope.launch { if (plan.merken(r)) onGemerkt() }
                                }
                            }
                        }
                        if (plan.merkStatus == "limit") Text(I18n.t("routes.limit"), fontSize = 12.sp, color = grau)
                    }
                }
            }
        }
    }
}

/** Gleiche Route (richtungsunabhaengig, auf ~11 m wie der Server-Schluessel)? */
private fun gleicheRoute(g: GemerkteRoute, pts: List<Startposition>): Boolean {
    if (g.punkte.size != pts.size) return false
    fun nah(rev: Boolean) = pts.indices.all { k ->
        val q = g.punkte[if (rev) pts.size - 1 - k else k]
        Routen.abstandM(q[0], q[1], pts[k].lat, pts[k].lon) < 12
    }
    return nah(false) || nah(true)
}

@Composable
private fun Kopf(text: String, sp: RoutenSpalte, plan: RoutenPlanung, mod: Modifier) {
    val (nach, ab) = plan.sortierung
    val an = nach == sp
    Text(text + if (an) (if (ab) " ▼" else " ▲") else "", mod.clickable { plan.sortierung = sp to (if (an) !ab else false) },
        fontSize = 10.sp, lineHeight = 12.sp, textAlign = TextAlign.Center, maxLines = 2,
        color = if (an) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AbschnittChips(pts: List<Pair<Double, Double>>, namen: List<String>) {
    if (pts.size < 2) return
    val m = (1 until pts.size).map { Routen.abstandM(pts[it - 1].first, pts[it - 1].second, pts[it].first, pts[it].second) }
    val lo = m.min(); val hi = m.max()
    FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        m.forEachIndexed { k, meter ->
            val farbe = rampColor(if (hi > lo) (meter - lo) / (hi - lo) else 0.5)
            Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.surfaceVariant) {
                Row(Modifier.padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(farbe)); Spacer(Modifier.width(5.dp))
                    Text("${k + 1} · ${namen[k]}→${namen[k + 1]} · ${Math.round(meter)} m", fontSize = 12.sp)
                }
            }
        }
    }
}

private fun warumText(plan: RoutenPlanung, e: RoutenErgebnis, n: Int): String {
    val r = plan.richtung
    if (r != null && e.routen.isNotEmpty()) return I18n.t("routes.whyDirection").replace("{name}", Routen.platzName(r))
    return when (val g = plan.grund) {
        is Routen.Grund.Nachbar -> if (g.naechsterM == null) I18n.t("routes.whyNoOther")
            else I18n.t("routes.whyNeighbour").replace("{m}", "${g.naechsterM}").replace("{min}", "${plan.minM}").replace("{max}", "${plan.maxM}")
        is Routen.Grund.ZuWenig -> I18n.t("routes.whyTooFew").replace("{n}", "${g.verfuegbar}").replace("{soll}", "${minOf(plan.anzahl, n)}")
        Routen.Grund.Rundkurs -> I18n.t("routes.whyRoundtrip")
        Routen.Grund.Kreuzung -> I18n.t("routes.whyCrossing")
        is Routen.Grund.Punkte -> I18n.t("routes.whyPoints").replace("{n}", "${g.hoechstens}")
        Routen.Grund.Ziel -> I18n.t("routes.whyTarget")
        else -> I18n.t("routes.none").replace("{n}", "$n")
    }
}

// --- kleine Bausteine ------------------------------------------------------------------------------
@Composable
internal fun Pille(text: String, aktiv: Boolean, betont: Boolean = false, klein: Boolean = false, onClick: () -> Unit) {
    val hinter = when { aktiv -> CYAN; betont -> CYAN.copy(alpha = 0.15f); else -> MaterialTheme.colorScheme.surfaceVariant }
    val rand = if (aktiv || betont) CYAN else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)
    Surface(shape = RoundedCornerShape(50), color = hinter, border = BorderStroke(1.dp, rand), modifier = Modifier.clickable(onClick = onClick)) {
        Text(text, Modifier.padding(horizontal = if (klein) 10.dp else 12.dp, vertical = if (klein) 5.dp else 6.dp),
            fontSize = if (klein) 13.sp else 14.sp, fontWeight = if (aktiv || betont) FontWeight.SemiBold else FontWeight.Normal,
            color = if (aktiv) DUNKEL else MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun Klein(text: String) {
    Text(text, Modifier.padding(top = 6.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Kasten(titel: String, inhalt: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 10.dp)
        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), RoundedCornerShape(12.dp)).padding(10.dp)) {
        Text(titel, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
        Spacer(Modifier.height(4.dp))
        inhalt()
    }
}

@Composable
private fun Regler(label: String, wert: Int, von: Int, bis: Int, schritt: Int, einheit: String, setz: (Int) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Text("$label: $wert$einheit", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // ohne `steps` (die zeichnen eine Punktreihe), gerundet wird beim Ziehen
        Slider(value = wert.coerceIn(von, bis).toFloat(), onValueChange = { setz((Math.round((it - von) / schritt) * schritt + von).coerceIn(von, bis)) },
            valueRange = von.toFloat()..maxOf(bis, von + 1).toFloat())
    }
}

@Composable
private fun Haken(text: String, an: Boolean, setz: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { setz(!an) }) {
        Checkbox(checked = an, onCheckedChange = setz)
        Text(text, fontSize = 14.sp)
    }
}

@Composable
private fun Hinweis(text: String) {
    Text(text, Modifier.fillMaxWidth().padding(top = 8.dp)
        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), RoundedCornerShape(8.dp)).padding(8.dp),
        style = MaterialTheme.typography.bodyMedium)
}

// --- Karte: Route und Marker ---------------------------------------------------------------------------
/** Jeder Abschnitt in der Farbe seiner Laenge (rot = laengster) unter dunkler Kontur, mittig die Nummer. */
private fun routeZeichnen(karte: MapView, ebene: MutableList<Overlay>, linie: List<Pair<Double, Double>>, dens: Float) {
    if (linie.size < 2) return
    val m = (1 until linie.size).map { Routen.abstandM(linie[it - 1].first, linie[it - 1].second, linie[it].first, linie[it].second) }
    val lo = m.min(); val hi = m.max()
    for (k in 1 until linie.size) {
        val a = GeoPoint(linie[k - 1].first, linie[k - 1].second); val b = GeoPoint(linie[k].first, linie[k].second)
        ebene.add(Polyline(karte).apply { setPoints(listOf(a, b)); outlinePaint.color = DUNKEL.toArgb(); outlinePaint.strokeWidth = 7f * dens; setOnClickListener { _, _, _ -> false } })
        ebene.add(Polyline(karte).apply {
            setPoints(listOf(a, b))
            outlinePaint.color = rampColor(if (hi > lo) (m[k - 1] - lo) / (hi - lo) else 0.5).toArgb()
            outlinePaint.strokeWidth = 4f * dens
            setOnClickListener { _, _, _ -> false }
        })
    }
    for (k in 1 until linie.size) {
        val mitte = GeoPoint((linie[k - 1].first + linie[k].first) / 2, (linie[k - 1].second + linie[k].second) / 2)
        ebene.add(Marker(karte).apply {
            position = mitte; icon = nummerIcon("$k", dens)
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER); setInfoWindow(null)
            setOnMarkerClickListener { _, _ -> true }
        })
    }
}

private fun platzIcon(text: String, farbe: Color, istStart: Boolean, eigen: Boolean, raus: Boolean, dens: Float): BitmapDrawable {
    val s = (26 * dens).toInt()
    val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val r = s / 2f
    val rand = (if (istStart) 3f else 2f) * dens
    c.drawCircle(r, r, r - rand / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = farbe.toArgb(); alpha = if (raus) 150 else 255 })
    c.drawCircle(r, r, r - rand / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = rand
        color = if (istStart) android.graphics.Color.WHITE else DUNKEL.toArgb()
        if (eigen && !istStart) pathEffect = DashPathEffect(floatArrayOf(3 * dens, 2.5f * dens), 0f)
    })
    val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = DUNKEL.toArgb(); textSize = (if (text.length > 1) 10 else 12) * dens; isFakeBoldText = true; textAlign = Paint.Align.CENTER
        isStrikeThruText = raus
    }
    c.drawText(text, r, r - (tp.descent() + tp.ascent()) / 2, tp)
    return BitmapDrawable(null, bmp)
}

private fun nummerIcon(text: String, dens: Float): BitmapDrawable {
    val s = (18 * dens).toInt()
    val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val r = s / 2f
    c.drawCircle(r, r, r - dens, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE })
    c.drawCircle(r, r, r - dens, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dens; color = DUNKEL.toArgb() })
    val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = DUNKEL.toArgb(); textSize = 10 * dens; isFakeBoldText = true; textAlign = Paint.Align.CENTER }
    c.drawText(text, r, r - (tp.descent() + tp.ascent()) / 2, tp)
    return BitmapDrawable(null, bmp)
}

private fun punktIcon(farbe: Color, groesseDp: Int, dens: Float): BitmapDrawable {
    val s = (groesseDp * dens).toInt()
    val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val r = s / 2f
    c.drawCircle(r, r, r - dens, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = farbe.toArgb() })
    c.drawCircle(r, r, r - dens, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2 * dens; color = DUNKEL.toArgb() })
    return BitmapDrawable(null, bmp)
}
