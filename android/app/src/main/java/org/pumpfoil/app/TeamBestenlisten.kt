package org.pumpfoil.app

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.io.File

/** GET /api/teams/liste/vergleich (server teams.vergleich): je Team die Summe der besten `top` Fahrer je Kennzahl. */
@Serializable
data class TeamVergleich(val period: String = "", val top: Int = 5, val teams: List<TeamVergleichZeile> = emptyList())

@Serializable
data class TeamVergleichZeile(
    val slug: String = "",
    val name: String = "",
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
    val land: String? = null,
    val mitglieder: Int = 0,
    val aktive: Int = 0,
    val pumps: Double = 0.0,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("time_s") val timeS: Double = 0.0,
    val sessions: Double = 0.0,
    val runs: Double = 0.0,
    @SerialName("pumps_fahrer") val pumpsFahrer: Int = 0,
    @SerialName("distance_m_fahrer") val distanceMFahrer: Int = 0,
    @SerialName("time_s_fahrer") val timeSFahrer: Int = 0,
    @SerialName("sessions_fahrer") val sessionsFahrer: Int = 0,
    @SerialName("runs_fahrer") val runsFahrer: Int = 0,
) {
    fun wert(art: String): Double = when (art) { "distance_m" -> distanceM; "time_s" -> timeS; "sessions" -> sessions; "runs" -> runs; else -> pumps }
    fun fahrer(art: String): Int = when (art) {
        "distance_m" -> distanceMFahrer; "time_s" -> timeSFahrer; "sessions" -> sessionsFahrer; "runs" -> runsFahrer; else -> pumpsFahrer
    }
}

// Kennzahlen in der Reihenfolge des Webs (Home.tsx VERGLEICH_ARTEN).
private val VERGLEICH_ARTEN = listOf(
    "pumps" to "team.stat.pumps", "distance_m" to "team.stat.strecke", "time_s" to "team.stat.zeit",
    "sessions" to "team.stat.sessions", "runs" to "team.stat.laeufe",
)
private val VERGLEICH_ZEITRAUM = listOf("today" to "period.today", "yesterday" to "period.yesterday", "10d" to "period.10d", "30d" to "period.30d",
                                        "365d" to "period.365d", "all" to "period.all")

private fun vergleichWert(art: String, v: Double): String = when (art) {
    "distance_m" -> if (v < 1000) "${v.toInt()} m" else if (v < 100000) "%.1f km".format(v / 1000) else "%.0f km".format(v / 1000)
    "time_s" -> if (v < 3600) "${Math.round(v / 60)} min" else "%.1f h".format(v / 3600)
    else -> ganzZahl(v)
}

/**
 * Team-Bestenlisten (Web Home.tsx `TeamBestenlisten`, Jan 03.11.2026: „leaderboards, aber eben nicht mit einzelpersonen
 * sondern mit teams"): je Kennzahl die Summe der besten 3/5/10 Fahrer eines Teams, damit ein grosses Team nicht allein
 * durch seine Groesse gewinnt. Gerechnet am Server fuer alle Teams gleich, hier nur sortiert. Ganz oben unter
 * Community › Teams & Events; teilen als Bild mit Wappen je Zeile und dem eigenen Team hervorgehoben.
 */
@Composable
fun TeamBestenlisten(onOpenTeam: (String) -> Unit, modifier: Modifier = Modifier) {
    var period by remember { mutableStateOf("30d") }
    var top by remember { mutableStateOf(5) }
    var art by remember { mutableStateOf("pumps") }
    var d by remember { mutableStateOf<TeamVergleich?>(null) }
    // Eigene (aktive) Teams fuer die Hervorhebung im Bild.
    var meine by remember { mutableStateOf<Set<String>>(emptySet()) }
    var bildLaeuft by remember { mutableStateOf(false) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { meine = try { Api.teamsMine().filter { it.status == "aktiv" }.map { it.slug }.toSet() } catch (_: Exception) { emptySet() } }
    LaunchedEffect(period, top) { d = try { Api.teamsVergleich(period, top) } catch (_: Exception) { d } }
    val zeilen = d?.teams.orEmpty().filter { it.wert(art) > 0 }
        .sortedWith(compareByDescending<TeamVergleichZeile> { it.wert(art) }.thenBy { it.name.lowercase() })

    Column(modifier.fillMaxWidth()) {
        Text(I18n.t("team.vergleich.titel"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(I18n.t("team.vergleich.hinweis").replace("{n}", top.toString()), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 4.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VERGLEICH_ZEITRAUM.forEach { (k, lk) ->
                FilterChip(selected = period == k, onClick = { period = k }, label = { Text(I18n.t(lk)) }, colors = cyanChipColors())
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(3, 5, 10).forEach { n ->
                FilterChip(selected = top == n, onClick = { top = n },
                    label = { Text(I18n.t("team.vergleich.top").replace("{n}", n.toString())) }, colors = cyanChipColors())
            }
        }
        // Kennzahl als zweite Reiterzeile (wie die Bestenliste der Fahrer).
        Reiterleiste(VERGLEICH_ARTEN.map { (k, lk) -> ReiterDef(k, I18n.t(lk)) }, art, { art = it }, stufe = 2,
            modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        when {
            d == null -> Text(I18n.t("common.loading"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            zeilen.isEmpty() -> Text(I18n.t("team.vergleich.leer"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> {
                zeilen.forEachIndexed { i, z ->
                    val f = teamFarbe(z.farbe)
                    Card(Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(12.dp)).clickable { onOpenTeam(z.slug) }) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${i + 1}", Modifier.width(26.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(6.dp))
                            TeamWappen(z.name, z.logoUrl, z.farbe, 40.dp)
                            Spacer(Modifier.width(10.dp))
                            Text(z.name, color = f.akzent, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            Column(horizontalAlignment = Alignment.End) {
                                Text(vergleichWert(art, z.wert(art)), color = f.akzent, fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.titleSmall)
                                Text(I18n.t("team.vergleich.ausFahrern").replace("{n}", z.fahrer(art).toString()),
                                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                TextButton(enabled = !bildLaeuft, onClick = {
                    bildLaeuft = true
                    val titel = I18n.t(VERGLEICH_ARTEN.first { it.first == art }.second)
                    val unter = listOf(I18n.t("team.vergleich.titel"), I18n.t("team.vergleich.top").replace("{n}", top.toString()),
                        I18n.t(VERGLEICH_ZEITRAUM.firstOrNull { it.first == period }?.second ?: "period.all"),
                        java.text.DateFormat.getDateInstance(java.text.DateFormat.SHORT, java.util.Locale.forLanguageTag(I18n.lang))
                            .format(java.util.Date())).joinToString(" · ")
                    val bildZeilen = zeilen.mapIndexed { i, z -> BildZeile(i + 1, z, vergleichWert(art, z.wert(art)), z.slug in meine) }
                    scope.launch {
                        try { teamBildTeilen(ctx, titel, unter, bildZeilen, "pumpfoil-teams-$art.png") } catch (_: Exception) {}
                        bildLaeuft = false
                    }
                }) {
                    Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(I18n.t("team.bild.titel"))
                }
            }
        }
    }
}

private class BildZeile(val rang: Int, val z: TeamVergleichZeile, val wert: String, val ich: Boolean)

/**
 * Team-Bestenliste als Bild (Web lib/bestenlisteBild.ts, dunkle Fassung, 1080 × 1080): Titel, Unterzeile, bis zu zehn
 * Zeilen mit Rang, Wappen (Logo, sonst Initialen auf der Teamfarbe), Name und Wert; das eigene Team hinterlegt, liegt es
 * hinter Platz 10, steht es mit „⋮" darunter. Geteilt ueber das System-Teilen-Blatt wie das Session-Bild (ShareDialog).
 */
private suspend fun teamBildTeilen(ctx: android.content.Context, titel: String, unter: String, alle: List<BildZeile>, datei: String) {
    val zeilen = alle.take(10)
    val eigene = alle.drop(10).firstOrNull { it.ich }
    // Logos vorher laden (Coil, Software-Bitmap — auf eine Hardware-Bitmap kann der Canvas nicht zeichnen).
    val loader = coil.ImageLoader(ctx)
    val logos = mutableMapOf<String, android.graphics.Bitmap>()
    (zeilen + listOfNotNull(eigene)).mapNotNull { Api.mediaUrl(it.z.logoUrl) }.distinct().forEach { url ->
        val r = loader.execute(coil.request.ImageRequest.Builder(ctx).data(url).allowHardware(false).build())
        ((r as? coil.request.SuccessResult)?.drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap?.let { logos[url] = it }
    }
    val bmp = withContext(Dispatchers.Default) {
        val B = 1080f; val X = 90f
        val b = android.graphics.Bitmap.createBitmap(1080, 1080, android.graphics.Bitmap.Config.ARGB_8888)
        val g = android.graphics.Canvas(b)
        val grund = 0xFF020617.toInt(); val flaeche = 0xFF0C1426.toInt(); val linie = 0xFF1E293B.toInt()
        val akzent = 0xFF22D3EE.toInt(); val text = 0xFFFFFFFF.toInt(); val leise = 0xFF94A3B8.toInt()
        g.drawColor(grund)
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        fun schrift(px: Float, fett: Boolean) { p.textSize = px; p.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, if (fett) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL) }
        fun kuerzen(t: String, max: Float): String {
            if (p.measureText(t) <= max) return t
            var s = t
            while (s.length > 1 && p.measureText("$s…") > max) s = s.dropLast(1)
            return "$s…"
        }
        p.color = akzent; p.textAlign = android.graphics.Paint.Align.LEFT
        schrift(58f, true); g.drawText(kuerzen(titel, B - 2 * X), X, 118f, p)
        schrift(30f, true); g.drawText(kuerzen(unter, B - 2 * X), X, 156f, p)

        val oben = 215f; val unten = B - 150f
        val n = maxOf(zeilen.size, 1) + (if (eigene != null && zeilen.isNotEmpty()) 1.4f else 0f)
        val zh = minOf(110f, kotlin.math.floor((unten - oben) / n))
        val gross = Math.round(zh * 0.5f).toFloat()
        fun mitteText(y: Float) = y - (p.descent() + p.ascent()) / 2f
        fun zeile(z: BildZeile, y: Float, hinterlegt: Boolean) {
            val mitte = y + zh / 2
            if (hinterlegt) { p.color = flaeche; g.drawRoundRect(X - 24, y + 4, B - X + 24, y + zh - 4, 16f, 16f, p) }
            p.color = if (z.rang <= 3) akzent else leise
            schrift(gross, true); p.textAlign = android.graphics.Paint.Align.RIGHT
            g.drawText(z.rang.toString(), X + 50, mitteText(mitte), p)
            p.color = akzent; g.drawText(z.wert, B - X, mitteText(mitte), p)
            val wb = p.measureText(z.wert)
            var nx = X + 74
            val ws = Math.round(gross * 1.25f).toFloat(); val wy = mitte - ws / 2
            val rect = android.graphics.RectF(nx, wy, nx + ws, wy + ws)
            val logo = Api.mediaUrl(z.z.logoUrl)?.let { logos[it] }
            g.save()
            g.clipPath(android.graphics.Path().apply { addRoundRect(rect, 10f, 10f, android.graphics.Path.Direction.CW) })
            if (logo != null) {
                val k = minOf(ws / logo.width, ws / logo.height); val bw = logo.width * k; val bh = logo.height * k
                g.drawBitmap(logo, null, android.graphics.RectF(nx + (ws - bw) / 2, wy + (ws - bh) / 2, nx + (ws + bw) / 2, wy + (ws + bh) / 2), p)
            } else {
                val f = teamFarbeDunkel(z.z.farbe)
                p.color = f.flaeche.toArgb(); g.drawRect(rect, p)
                p.color = f.aufFlaeche.toArgb(); schrift(Math.round(ws * 0.38f).toFloat(), true); p.textAlign = android.graphics.Paint.Align.CENTER
                g.drawText(teamInitialen(z.z.name), nx + ws / 2, mitteText(mitte), p)
            }
            g.restore()
            nx += ws + 16
            schrift(Math.round(gross * 0.92f).toFloat(), z.rang == 1 || hinterlegt)
            p.textAlign = android.graphics.Paint.Align.LEFT; p.color = text
            g.drawText(kuerzen(z.z.name, B - X - wb - 30 - nx), nx, mitteText(mitte), p)
        }
        zeilen.forEachIndexed { i, z ->
            if (i > 0) { p.color = linie; g.drawRect(X, oben + i * zh, B - X, oben + i * zh + 2, p) }
            zeile(z, oben + i * zh, z.ich)
        }
        if (eigene != null && zeilen.isNotEmpty()) {
            val ye = oben + zeilen.size * zh + Math.round(zh * 0.4f)
            p.color = leise; schrift(gross, true); p.textAlign = android.graphics.Paint.Align.CENTER
            g.drawText("⋮", X + 30, mitteText(ye - Math.round(zh * 0.2f)), p)
            zeile(eigene, ye, true)
        }
        p.color = leise; schrift(26f, false); p.textAlign = android.graphics.Paint.Align.LEFT
        g.drawText("Have fun, keep pumping!", X, B - X + 38, p)
        p.color = akzent; schrift(34f, true); p.textAlign = android.graphics.Paint.Align.RIGHT
        g.drawText("pumpfoil.org", B - X, B - X + 38, p)
        b
    }
    val uri = withContext(Dispatchers.IO) {
        val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
        val f = File(dir, datei)
        f.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, "pumpfoil.org")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    ctx.startActivity(Intent.createChooser(send, I18n.t("team.bild.titel")))
}

/** Die 10 aktivsten Teams (Web Home.tsx `AktivsteTeams`): Sessions der Mitglieder in den letzten 30 Tagen. */
@Composable
fun AktivsteTeams(onOpenTeam: (String) -> Unit, modifier: Modifier = Modifier) {
    var teams by remember { mutableStateOf<List<TeamListenEintrag>?>(null) }
    LaunchedEffect(Unit) { teams = try { Api.teamsListe() } catch (_: Exception) { emptyList() } }
    val top = teams.orEmpty().filter { it.sessions30d > 0 }.sortedByDescending { it.sessions30d }.take(10)
    if (top.isEmpty()) return
    Column(modifier.fillMaxWidth()) {
        Text(I18n.t("team.aktivste"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 6.dp))
        top.forEach { tm ->
            val f = teamFarbe(tm.farbe)
            Card(Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(12.dp)).clickable { onOpenTeam(tm.slug) }) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    TeamWappen(tm.name, tm.logoUrl, tm.farbe, 40.dp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(tm.name, color = f.akzent, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(I18n.t("team.mitgliederAnzahl").replace("{n}", tm.mitgliederAnzahl.toString()) +
                                (if (tm.sportarten.isNotEmpty()) " · " + sportartenText(tm.sportarten) else ""),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text("${tm.sessions30d} ${I18n.t("unit.sessions")}", style = MaterialTheme.typography.labelMedium,
                        color = f.akzent, modifier = Modifier.background(f.leicht, RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 2.dp))
                }
            }
        }
    }
}
