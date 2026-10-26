package org.pumpfoil.app

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

// Die eigenen Uhr-Datenseiten LIVE auf dem Handy-Recorder (Jan, 26.10.2026: „vielleicht auch einfach
// die watch-faces verwenden zur anzeige live … als zusatz-anzeige ueber der karte"). Anlass war u897s
// 10K: die App zeigte nur die Gesamtstrecke, sie hielt sie fuer die Foil-Strecke und hoerte zu frueh auf.
//
// Dieselben Seiten wie auf der Uhr (Profil → Uhr-Ansichten): `pages` waehrend eines Laufs,
// `off_foil_pages` sonst (das Handy kennt keine manuelle Pause, `pause_pages` bleibt deshalb aussen
// vor). Mit „auch die anderen Seiten durchblaettern" haengen die Seiten des anderen Zustands hinten an.
// Gezeichnet mit demselben Renderer wie die Galerie (LayoutRender.kt), nur mit Live-Werten.

private sealed interface LiveSeite
private data class KlassikSeite(val felder: List<Int>) : LiveSeite
private data class LayoutSeite(val layout: WatchLayoutBrief) : LiveSeite

/** Ein Seiten-Satz aus den Einstellungen: Liste aus [a,b,c] (3 Felder) oder Zahl (Layout-ID). */
private fun seitenAus(s: JsonObject, key: String, legacy: String?, layouts: Map<Int, WatchLayoutBrief>,
                      mitLayouts: Boolean): List<LiveSeite> {
    val arr = s[key] as? JsonArray
    val roh = arr?.mapNotNull { el ->
        (el as? JsonPrimitive)?.intOrNull?.let { id -> if (mitLayouts) layouts[id]?.let { LayoutSeite(it) } else null }
            ?: (el as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }?.let { KlassikSeite(it.take(3)) }
    }.orEmpty()
    if (roh.isNotEmpty()) return roh
    val alt = (legacy?.let { s[it] } as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }
    return if (alt != null && alt.size >= 3) listOf(KlassikSeite(alt.take(3))) else emptyList()
}

/** Werte je Feld-ID wie die Uhr sie zeigt (Config.mc / RecordView.mc). Puls, Hoehe, Temperatur
 *  kennt der Handy-Recorder nicht -> fehlen (der Renderer zeigt dann „--"). */
internal fun liveWerte(st: Recorder.State, sek: Long, gpsWeg: Boolean): Map<Int, String> {
    fun dist(m: Double) = if (m < 1000) m.toInt().toString() else "%.2f".format(m / 1000)
    fun zeit(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }
    fun kmh(v: Double) = "%.1f".format(v)
    val uhr = java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT).format(java.util.Date())
    return buildMap {
        if (!gpsWeg) { put(1, kmh(st.speed3sKmh)); put(5, kmh(st.speedKmh)) }
        put(6, kmh(st.avgSpeedKmh)); put(7, kmh(st.maxSpeedKmh))
        put(3, zeit(sek * 1000)); put(4, dist(st.distanceM)); put(12, uhr)
        put(14, zeit(st.runDurationMs)); put(15, dist(st.runDistanceM))
        put(16, zeit(st.lastRunDurationMs)); put(17, dist(st.lastRunDistanceM))
        put(18, kmh(st.lastRunAvgSpeedKmh)); put(19, kmh(st.lastRunMaxSpeedKmh))
        put(20, st.runCount.toString())
        put(22, dist(st.allRunsDistanceM)); put(23, zeit(st.allRunsDurationMs))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun LiveUhrSeiten(st: Recorder.State, werte: Map<Int, String>) {
    var foilSeiten by remember { mutableStateOf<List<LiveSeite>>(listOf(KlassikSeite(listOf(1, 2, 0)))) }
    var sonstSeiten by remember { mutableStateOf<List<LiveSeite>>(listOf(KlassikSeite(listOf(12, 17, 16)))) }
    var alleBlaettern by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            LayoutScales.aus(s)
            val mitLayouts = s["layouts_enabled"]?.jsonPrimitive?.booleanOrNull ?: true
            val layouts = if (mitLayouts) try { Api.watchLayouts().associateBy { it.id } } catch (_: Exception) { emptyMap() } else emptyMap()
            seitenAus(s, "pages", "views", layouts, mitLayouts).let { if (it.isNotEmpty()) foilSeiten = it }
            seitenAus(s, "off_foil_pages", "off_foil_view", layouts, mitLayouts).let { if (it.isNotEmpty()) sonstSeiten = it }
            alleBlaettern = s["browse_all_pages"]?.jsonPrimitive?.booleanOrNull ?: true
        } catch (_: Exception) {}   // offline: Standardseiten
    }
    val eigene = if (st.isFoiling) foilSeiten else sonstSeiten
    val andere = if (st.isFoiling) sonstSeiten else foilSeiten
    val seiten = if (alleBlaettern) eigene + andere else eigene
    val pager = rememberPagerState { seiten.size }
    // Zustandswechsel (Lauf beginnt/endet) -> zur ersten Seite des neuen Zustands, wie die Uhr.
    LaunchedEffect(st.isFoiling) { if (pager.currentPage != 0) pager.scrollToPage(0) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        HorizontalPager(pager, Modifier.fillMaxWidth().height(200.dp)) { i ->
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                when (val sei = seiten[i]) {
                    is LayoutSeite -> WatchLayoutPreview(
                        elements = sei.layout.elements, bgColor = sei.layout.bg_color, shape = sei.layout.shape,
                        w = sei.layout.authored_w ?: 240, h = sei.layout.authored_h ?: 240,
                        px = 196.dp, pageCount = seiten.size, pageIndex = i, werte = werte)
                    is KlassikSeite -> KlassikAnzeige(sei.felder, werte)
                }
            }
        }
        if (seiten.size > 1) {
            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(seiten.size) { d ->
                    Box(Modifier.size(7.dp).clip(CircleShape).background(
                        MaterialTheme.colorScheme.primary.copy(alpha = if (d == pager.currentPage) 1f else 0.3f)))
                }
            }
        }
    }
}

/** Klassische 3-Feld-Seite: Wert gross, Feldname klein darueber — schwarz wie auf der Uhr. */
@Composable
private fun KlassikAnzeige(felder: List<Int>, werte: Map<Int, String>) {
    Column(
        Modifier.size(196.dp).clip(CircleShape).background(Color.Black).padding(vertical = 22.dp),
        verticalArrangement = Arrangement.SpaceEvenly, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        felder.filter { it != 0 }.forEach { f ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(I18n.t("field.$f"), color = Color(0xFFD0D0D0), fontSize = 10.sp, maxLines = 1)
                Text(werte[f] ?: "--", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/** Die fertigen Laeufe dieser Aufnahme zum Durchblaettern (neuester zuerst angezeigt). */
@Composable
internal fun LaeufeKarte(laeufe: List<Recorder.LiveLauf>) {
    var idx by remember { mutableIntStateOf(-1) }        // -1 = immer der neueste
    var bekannt by remember { mutableIntStateOf(0) }
    if (laeufe.size != bekannt) { if (idx == bekannt - 1) idx = -1; bekannt = laeufe.size }
    val i = if (idx < 0 || idx >= laeufe.size) laeufe.size - 1 else idx
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            if (laeufe.isEmpty()) {
                Text(I18n.t("rec.noRunYet"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
            } else {
                val l = laeufe[i]
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { idx = (i - 1).coerceAtLeast(0) }, enabled = i > 0) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null)
                    }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(I18n.t("rec.runOf").replace("{n}", "${i + 1}").replace("{m}", "${laeufe.size}"),
                            style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        val km = if (l.distM >= 1000) "%.2f km".format(l.distM / 1000) else "${l.distM.toInt()} m"
                        val s = l.durMs / 1000
                        Text("$km · %d:%02d".format(s / 60, s % 60), style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold)
                        Text("Ø %.1f · max %.1f km/h".format(l.avgKmh, l.maxKmh),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { idx = if (i + 1 >= laeufe.size - 1) -1 else i + 1 }, enabled = i < laeufe.size - 1) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
                    }
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(I18n.t("rec.liveHint"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}
