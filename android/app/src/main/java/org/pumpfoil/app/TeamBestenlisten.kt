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
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.graphics.asImageBitmap
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
    var bild by remember { mutableStateOf<TeamBildDaten?>(null) }
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
                    // Das eigene Team hervorgehoben wie im Teilen-Bild (Rahmen in Teamfarbe).
                    val eigenes = z.slug in meine
                    Card(Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(12.dp)).clickable { onOpenTeam(z.slug) },
                        border = if (eigenes) androidx.compose.foundation.BorderStroke(2.dp, f.akzent) else null,
                        colors = if (eigenes) androidx.compose.material3.CardDefaults.cardColors(containerColor = f.leicht) else androidx.compose.material3.CardDefaults.cardColors()) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${i + 1}", Modifier.width(26.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(6.dp))
                            TeamWappen(z.name, z.logoUrl, z.farbe, 40.dp)
                            Spacer(Modifier.width(10.dp))
                            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                Text(z.name, color = f.akzent, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false))
                                Spacer(Modifier.width(6.dp)); TeamHerkunftZeichen(z.land)
                            }
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
                TextButton(onClick = {
                    val titel = I18n.t(VERGLEICH_ARTEN.first { it.first == art }.second)
                    val unter = listOf(I18n.t("team.vergleich.titel"), I18n.t("team.vergleich.top").replace("{n}", top.toString()),
                        I18n.t(VERGLEICH_ZEITRAUM.firstOrNull { it.first == period }?.second ?: "period.all"),
                        java.text.DateFormat.getDateInstance(java.text.DateFormat.SHORT, java.util.Locale.forLanguageTag(I18n.lang))
                            .format(java.util.Date())).joinToString(" · ")
                    val bildZeilen = zeilen.mapIndexed { i, z ->
                        BildZeile(i + 1, z.name, vergleichWert(art, z.wert(art)), z.slug in meine, land = z.land,
                            wappen = true, logoUrl = z.logoUrl, farbe = z.farbe)
                    }
                    bild = TeamBildDaten(titel, unter, bildZeilen, "pumpfoil-teams-$art.png")
                }) {
                    Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(I18n.t("team.bild.titel"))
                }
            }
        }
    }
    bild?.let { TeamBildDialog(it, onClose = { bild = null }) }
}

/** Eine Zeile des Bildes (Web lib/bestenlisteBild.ts BildZeile): Teams mit Wappen, Fahrer ohne (nur Flagge + Name). */
internal class BildZeile(val rang: Int, val name: String, val wert: String, val ich: Boolean, val land: String? = null,
                         val wappen: Boolean = false, val logoUrl: String? = null, val farbe: String? = null)

internal class TeamBildDaten(val titel: String, val unter: String, val zeilen: List<BildZeile>, val datei: String)

// Dieselben Farben wie web/src/lib/bestenlisteBild.ts (DUNKEL/HELL, wie die Session-Karte sharecard.py), je Fassung.
private class BildFarben(val grund: Int, val flaeche: Int, val linie: Int, val akzent: Int, val text: Int, val leise: Int)
private val BILD_DUNKEL = BildFarben(0xFF020617.toInt(), 0xFF0C1426.toInt(), 0xFF1E293B.toInt(), 0xFF22D3EE.toInt(), 0xFFFFFFFF.toInt(), 0xFF94A3B8.toInt())
private val BILD_HELL = BildFarben(0xFFF8FAFC.toInt(), 0xFFE0F2FE.toInt(), 0xFFE2E8F0.toInt(), 0xFF0E7490.toInt(), 0xFF0F172A.toInt(), 0xFF64748B.toInt())

/** Hell/Dunkel des Bildes merkt sich die App (wie der Browser `foil_bild_hell` im Web, nur Komfort). */
private const val BILD_HELL_PREF = "foil_bild_hell"

/**
 * Flagge eines Landes (ISO-Code) als Bitmap fuer das Bild. Das Web zeichnet die SVGs aus /flags (flag-icons); Android kann
 * SVG ohne Zusatzbibliothek nicht dekodieren — deshalb hier die Flaggen-Emoji des Systems (Noto Color Emoji), auf ihre
 * sichtbare Flaeche zugeschnitten. Kennt die Schrift die Flagge nicht (zwei Buchstaben statt Flagge), bleibt der Platz leer
 * wie im Web bei einer nicht ladbaren Flagge. „k:…" (Kontinent, Erde) wird zum Umriss (kontinentBild).
 */
private fun flaggeBild(land: String?): android.graphics.Bitmap? {
    land?.trim()?.lowercase()?.takeIf { it.startsWith("k:") }?.let { return kontinentBild(it.drop(2)) }
    val c = land?.trim()?.uppercase() ?: return null
    if (c.length != 2 || !c.all { it in 'A'..'Z' }) return null
    val emoji = String(Character.toChars(0x1F1E6 + (c[0] - 'A'))) + String(Character.toChars(0x1F1E6 + (c[1] - 'A')))
    val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { textSize = 160f }
    if (!p.hasGlyph(emoji)) return null
    val roh = android.graphics.Bitmap.createBitmap(320, 260, android.graphics.Bitmap.Config.ARGB_8888)
    android.graphics.Canvas(roh).drawText(emoji, 40f, 190f, p)
    // Sichtbare Flaeche suchen (Alpha > 128), damit Rand und Schatten des Emoji nicht mitkommen.
    var l = roh.width; var o = roh.height; var r = -1; var u = -1
    val px = IntArray(roh.width * roh.height)
    roh.getPixels(px, 0, roh.width, 0, 0, roh.width, roh.height)
    for (y in 0 until roh.height) for (x in 0 until roh.width) {
        if ((px[y * roh.width + x] ushr 24) > 128) { if (x < l) l = x; if (x > r) r = x; if (y < o) o = y; if (y > u) u = y }
    }
    if (r <= l || u <= o) return null
    return android.graphics.Bitmap.createBitmap(roh, l, o, r - l + 1, u - o + 1)
}

/**
 * Team-Bestenliste als Bild (Web lib/bestenlisteBild.ts `zeichneBestenliste`, 1080 × 1080), dunkle oder helle Fassung:
 * Titel, Unterzeile, bis zu zehn Zeilen mit Rang, Wappen (Logo, sonst Initialen auf der Teamfarbe), Flagge 4:3 mit feinem
 * Rand (Platz bleibt auch ohne Flagge frei, damit die Namen buendig stehen), Name und Wert; das eigene Team hinterlegt,
 * liegt es hinter Platz 10, steht es mit „⋮" darunter. Unten links das Motto, rechts unser Schriftzug (zur Fassung passend).
 */
private fun zeichneTeamBild(d: TeamBildDaten, hell: Boolean, logos: Map<String, android.graphics.Bitmap>,
                            flaggen: Map<String, android.graphics.Bitmap>, marke: android.graphics.Bitmap?): android.graphics.Bitmap {
    val F = if (hell) BILD_HELL else BILD_DUNKEL
    val zeilen = d.zeilen.take(10)
    val eigene = d.zeilen.drop(10).firstOrNull { it.ich }
    val B = 1080f; val X = 90f
    val b = android.graphics.Bitmap.createBitmap(1080, 1080, android.graphics.Bitmap.Config.ARGB_8888)
    val g = android.graphics.Canvas(b)
    g.drawColor(F.grund)
    val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG or android.graphics.Paint.FILTER_BITMAP_FLAG)
    fun schrift(px: Float, fett: Boolean) { p.textSize = px; p.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, if (fett) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL) }
    fun kuerzen(t: String, max: Float): String {
        if (p.measureText(t) <= max) return t
        var s = t
        while (s.length > 1 && p.measureText("$s…") > max) s = s.dropLast(1)
        return "$s…"
    }
    p.color = F.akzent; p.textAlign = android.graphics.Paint.Align.LEFT
    schrift(58f, true); g.drawText(kuerzen(d.titel, B - 2 * X), X, 118f, p)
    schrift(30f, true); g.drawText(kuerzen(d.unter, B - 2 * X), X, 156f, p)

    val oben = 215f; val unten = B - 150f
    val n = maxOf(zeilen.size, 1) + (if (eigene != null && zeilen.isNotEmpty()) 1.4f else 0f)
    val zh = minOf(110f, kotlin.math.floor((unten - oben) / n))
    val gross = Math.round(zh * 0.5f).toFloat()
    fun mitteText(y: Float) = y - (p.descent() + p.ascent()) / 2f
    fun zeile(z: BildZeile, y: Float, hinterlegt: Boolean) {
        val mitte = y + zh / 2
        if (hinterlegt) { p.color = F.flaeche; g.drawRoundRect(X - 24, y + 4, B - X + 24, y + zh - 4, 16f, 16f, p) }
        p.color = if (z.rang <= 3) F.akzent else F.leise
        schrift(gross, true); p.textAlign = android.graphics.Paint.Align.RIGHT
        g.drawText(z.rang.toString(), X + 50, mitteText(mitte), p)
        p.color = F.akzent; g.drawText(z.wert, B - X, mitteText(mitte), p)
        val wb = p.measureText(z.wert)
        var nx = X + 74
        if (z.wappen) {
        val ws = Math.round(gross * 1.25f).toFloat(); val wy = mitte - ws / 2
        val rect = android.graphics.RectF(nx, wy, nx + ws, wy + ws)
        val logo = Api.mediaUrl(z.logoUrl)?.let { logos[it] }
        g.save()
        g.clipPath(android.graphics.Path().apply { addRoundRect(rect, 10f, 10f, android.graphics.Path.Direction.CW) })
        if (logo != null) {
            val k = minOf(ws / logo.width, ws / logo.height); val bw = logo.width * k; val bh = logo.height * k
            g.drawBitmap(logo, null, android.graphics.RectF(nx + (ws - bw) / 2, wy + (ws - bh) / 2, nx + (ws + bw) / 2, wy + (ws + bh) / 2), p)
        } else {
            val f = if (hell) teamFarbeHell(z.farbe) else teamFarbeDunkel(z.farbe)
            p.color = f.flaeche.toArgb(); g.drawRect(rect, p)
            p.color = f.aufFlaeche.toArgb(); schrift(Math.round(ws * 0.38f).toFloat(), true); p.textAlign = android.graphics.Paint.Align.CENTER
            g.drawText(teamInitialen(z.name), nx + ws / 2, mitteText(mitte), p)
        }
        g.restore()
        nx += ws + 16
        }
        // Flagge 4:3 vor dem Namen, mit feinem Rand (weisse Flaggen verschwaenden sonst auf hellem Grund).
        val fh = Math.round(gross * 0.8f).toFloat(); val fw = Math.round(fh * 4 / 3).toFloat()
        // Kontinent/Erde je nach Hell/Dunkel des Bildes (die vorab geladenen Flaggen kennen nur die dunkle Fassung).
        val kont = z.land?.trim()?.lowercase()?.takeIf { it.startsWith("k:") }?.let { kontinentBild(it.drop(2), hell) }
        (kont ?: z.land?.let { flaggen[it.uppercase()] })?.let { fl ->
            val ziel = android.graphics.RectF(nx, mitte - fh / 2, nx + fw, mitte + fh / 2)
            // Auf 4:3 zuschneiden (cover), falls das Emoji ein anderes Seitenverhaeltnis hat.
            val k = maxOf(fw / fl.width, fh / fl.height)
            val sw = fw / k; val sh = fh / k
            val sx = ((fl.width - sw) / 2).toInt(); val sy = ((fl.height - sh) / 2).toInt()
            g.drawBitmap(fl, android.graphics.Rect(sx, sy, sx + sw.toInt(), sy + sh.toInt()), ziel, p)
            p.style = android.graphics.Paint.Style.STROKE; p.strokeWidth = 2f; p.color = F.linie
            g.drawRect(ziel, p)
            p.style = android.graphics.Paint.Style.FILL
        }
        nx += fw + 16
        schrift(Math.round(gross * 0.92f).toFloat(), z.rang == 1 || hinterlegt)
        p.textAlign = android.graphics.Paint.Align.LEFT; p.color = F.text
        g.drawText(kuerzen(z.name, B - X - wb - 30 - nx), nx, mitteText(mitte), p)
    }
    zeilen.forEachIndexed { i, z ->
        if (i > 0) { p.color = F.linie; g.drawRect(X, oben + i * zh, B - X, oben + i * zh + 2, p) }
        zeile(z, oben + i * zh, z.ich)
    }
    if (eigene != null && zeilen.isNotEmpty()) {
        val ye = oben + zeilen.size * zh + Math.round(zh * 0.4f)
        p.color = F.leise; schrift(gross, true); p.textAlign = android.graphics.Paint.Align.CENTER
        g.drawText("⋮", X + 30, mitteText(ye - Math.round(zh * 0.2f)), p)
        zeile(eigene, ye, true)
    }
    // Fuss wie bei der Session-Karte: Schriftzug unten rechts (Hoehe 54, 90 vom Rand), Motto links.
    if (marke != null) {
        val lh = 54f; val lw = marke.width * lh / marke.height
        g.drawBitmap(marke, null, android.graphics.RectF(B - X - lw, B - X, B - X, B - X + lh), p)
    } else {
        p.color = F.akzent; schrift(34f, true); p.textAlign = android.graphics.Paint.Align.RIGHT
        g.drawText("pumpfoil.org", B - X, B - X + 38, p)
    }
    p.color = F.leise; schrift(26f, false); p.textAlign = android.graphics.Paint.Align.LEFT
    g.drawText("Have fun, keep pumping!", X, B - X + 38, p)
    return b
}

/**
 * Dialog „Als Bild teilen" (Web components/BestenlisteBildDialog.tsx): Vorschau, Hell/Dunkel (wie beim Teilen einer
 * Session), Teilen ueber das System-Teilen-Blatt und Speichern in die Galerie (wie ShareDialog.doSave).
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun TeamBildDialog(d: TeamBildDaten, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
    var hell by remember { mutableStateOf(runCatching { prefs.getBoolean(BILD_HELL_PREF, false) }.getOrDefault(false)) }
    var logos by remember { mutableStateOf<Map<String, android.graphics.Bitmap>?>(null) }
    var flaggen by remember { mutableStateOf<Map<String, android.graphics.Bitmap>>(emptyMap()) }
    var bmp by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var busy by remember { mutableStateOf(false) }
    // Logos (Coil, Software-Bitmap — auf eine Hardware-Bitmap kann der Canvas nicht zeichnen) und Flaggen einmal laden;
    // ein nicht ladbares Logo faellt auf die Initialen zurueck, eine fehlende Flagge laesst nur sie weg.
    LaunchedEffect(d) {
        val loader = coil.ImageLoader(ctx)
        val m = mutableMapOf<String, android.graphics.Bitmap>()
        d.zeilen.mapNotNull { Api.mediaUrl(it.logoUrl) }.distinct().forEach { url ->
            runCatching {
                val r = loader.execute(coil.request.ImageRequest.Builder(ctx).data(url).allowHardware(false).build())
                ((r as? coil.request.SuccessResult)?.drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap?.let { m[url] = it }
            }
        }
        flaggen = withContext(Dispatchers.Default) {
            d.zeilen.mapNotNull { it.land?.uppercase() }.distinct().mapNotNull { c -> flaggeBild(c)?.let { c to it } }.toMap()
        }
        logos = m
    }
    LaunchedEffect(hell, logos) {
        val l = logos ?: return@LaunchedEffect
        bmp = withContext(Dispatchers.Default) {
            val marke = runCatching {
                android.graphics.BitmapFactory.decodeResource(ctx.resources, if (hell) R.drawable.wordmark_h_light else R.drawable.wordmark_h_dark)
            }.getOrNull()
            zeichneTeamBild(d, hell, l, flaggen, marke)
        }
    }
    fun meldung(t: String) = android.widget.Toast.makeText(ctx, t, android.widget.Toast.LENGTH_SHORT).show()
    // Android 8/9: Datei-Speichern-Dialog statt MediaStore-Pfad (wie ShareDialog).
    val alteSpeichern = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.CreateDocument("image/png"),
    ) { uri ->
        val b = bmp
        if (uri != null && b != null) {
            val ok = runCatching { ctx.contentResolver.openOutputStream(uri)!!.use { b.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }.isSuccess
            meldung(if (ok) I18n.t("share.saved") else I18n.t("profile.error"))
        }
    }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onClose,
        title = { Text(I18n.t("team.bild.titel")) },
        text = {
            Column {
                val b = bmp
                if (b != null) {
                    androidx.compose.foundation.Image(b.asImageBitmap(), contentDescription = null,
                        modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)))
                } else {
                    Box(Modifier.fillMaxWidth().aspectRatio(1f), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                }
                Spacer(Modifier.height(10.dp))
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    listOf(false, true).forEachIndexed { i, h ->
                        SegmentedButton(selected = hell == h, onClick = {
                            hell = h
                            runCatching { prefs.edit().putBoolean(BILD_HELL_PREF, h).apply() }
                        }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(I18n.t(if (h) "theme.light" else "theme.dark")) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.Button(enabled = b != null && !busy, modifier = Modifier.weight(1f), onClick = {
                        val bb = bmp ?: return@Button
                        busy = true
                        scope.launch {
                            try {
                                val uri = withContext(Dispatchers.IO) {
                                    val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
                                    val f = File(dir, d.datei)
                                    f.outputStream().use { bb.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                                    FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
                                }
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "image/png"
                                    putExtra(Intent.EXTRA_STREAM, uri)
                                    putExtra(Intent.EXTRA_TEXT, "pumpfoil.org")
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                ctx.startActivity(Intent.createChooser(send, I18n.t("team.bild.titel")))
                            } catch (_: Exception) { meldung(I18n.t("share.errImage")) }
                            busy = false
                        }
                    }) {
                        Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(I18n.t("team.teilen"))
                    }
                    androidx.compose.material3.OutlinedButton(enabled = b != null && !busy, modifier = Modifier.weight(1f), onClick = {
                        val bb = bmp ?: return@OutlinedButton
                        if (android.os.Build.VERSION.SDK_INT < 29) { alteSpeichern.launch(d.datei); return@OutlinedButton }
                        busy = true
                        scope.launch {
                            val ok = runCatching {
                                withContext(Dispatchers.IO) {
                                    val werte = android.content.ContentValues().apply {
                                        put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, d.datei.removeSuffix(".png") + "-${System.currentTimeMillis() / 1000}.png")
                                        put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png")
                                        put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/Pumpfoil")
                                    }
                                    val uri = ctx.contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, werte) ?: error("kein Ziel")
                                    ctx.contentResolver.openOutputStream(uri)!!.use { bb.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                                }
                            }.isSuccess
                            busy = false
                            meldung(if (ok) I18n.t("share.saved") else I18n.t("profile.error"))
                        }
                    }) { Text(I18n.t("team.bild.speichern")) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onClose) { Text(I18n.t("common.cancel")) } },
    )
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(tm.name, color = f.akzent, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false))
                            Spacer(Modifier.width(6.dp)); TeamHerkunftZeichen(tm.land)
                        }
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
