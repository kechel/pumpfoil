package org.pumpfoil.app

import android.net.Uri
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material.icons.filled.Waves
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/*
 * Oeffentliche Profilseite EINES Nutzers, nativ portiert aus der PWA (web/src/pages/Foiler.tsx,
 * Jan 01.10.2026: „direkt auf android & iOS nachziehen"). Bis dahin oeffnete die App die Seite nur
 * im Browser (PrivatsphaereKarten.kt).
 *
 * Welche Bloecke erscheinen, entscheidet der SERVER anhand der Schalter des Nutzers
 * (`zeigt`, community.foiler_profil). Diese Seite prueft nichts nachtraeglich: fehlt ein Feld,
 * wird es nicht gezeigt — zwei Wahrheiten darueber, was oeffentlich ist, waeren eine zu viel.
 *
 * Bewusst NICHT portiert: das Medien-Karussell samt Vollbild-Galerie (eigener Galerie- und
 * Video-Weg waere ein Bildschirm fuer sich; die Fotos stehen in den Sessions).
 *
 * Die letzten FUENF Sessions: keine Sessionliste je Nutzer (Entscheidung 04.09.2026), genau fuenf
 * auf dieser Seite sind erlaubt (Jan, 08.09.2026). Die Grenze zieht der Server.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FoilerScreen(
    userId: Int,
    onBack: () -> Unit,
    onOpenSession: (Int) -> Unit,
    onOpenSpot: (String) -> Unit,
    onChat: (Int) -> Unit,
    onSettings: () -> Unit,
    social: Boolean = true,
) {
    var d by remember(userId) { mutableStateOf<FoilerProfil?>(null) }
    var fehler by remember(userId) { mutableStateOf(false) }
    LaunchedEffect(userId) {
        try { d = Api.foilerProfil(userId) } catch (_: Exception) { fehler = true }
    }
    val p = d
    // Profilbilder auf DIESER Seite fuehren nicht noch einmal hierher (Web: pathname !== ziel).
    val aussen = LocalOpenFoiler.current
    val ohneSelbst: ((Int) -> Unit)? = aussen?.let { o -> { id: Int -> if (id != userId) o(id) } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(p?.name ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back"))
                    }
                },
                actions = {
                    // Nachricht schreiben, oben rechts — wie der Spot-Chat-Knopf in der Spot-Ansicht
                    // (Web b89044e2). Nicht auf der eigenen Seite, und nicht unter 13 (Age-Gate,
                    // wie jeder Chat-Einstieg in der App).
                    if (p != null && !p.ich && social) {
                        TextButton(onClick = { onChat(p.id) }) {
                            Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(I18n.t("foiler.chat"))
                        }
                    }
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                fehler -> Text(I18n.t("foiler.notFound"), Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                p == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> CompositionLocalProvider(LocalOpenFoiler provides ohneSelbst) {
                    FoilerInhalt(p, onOpenSession, onOpenSpot, onSettings)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FoilerInhalt(
    d: FoilerProfil,
    onOpenSession: (Int) -> Unit,
    onOpenSpot: (String) -> Unit,
    onSettings: () -> Unit,
) {
    val uri = LocalUriHandler.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // Nur der Besitzer sieht diesen Hinweis — sonst waere „ist abgeschaltet" selbst eine
        // Auskunft ueber ein fremdes Konto. Der Server liefert `aus` deshalb auch nur ihm.
        if (d.ich && d.aus) {
            Card(Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable { onSettings() }) {
                Column(Modifier.padding(12.dp)) {
                    Text(I18n.t("foiler.offHint"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.tertiary)
                    Text(I18n.t("nav.profile") + " →", style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 4.dp))
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarCircle(name = d.name, avatarUrl = d.avatarUrl, size = 56.dp, userId = d.id)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(d.name ?: "—", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                d.seit?.let { s ->
                    Text(I18n.t("foiler.since").replace("{date}", langDatum(s)),
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        // Angaben: Label links, Wert rechts. Die Label-Spalte ist so breit wie das laengste Label
        // (Web: grid max-content) — hier ueber eine feste Mindestbreite angenaehert.
        val angaben = buildList<Triple<ImageVector, String, @Composable () -> Unit>> {
            d.homespot?.takeIf { it.isNotBlank() }?.let { hs ->
                add(Triple(Icons.Filled.Place, I18n.t("foiler.homespot")) {
                    // Der Homespot fuehrt zum Spot. Die App navigiert Spots ueber den Namen.
                    Text(hs, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable { onOpenSpot(hs) })
                })
            }
            if (d.uhren.isNotEmpty()) add(Triple(Icons.Filled.Watch, I18n.t("foiler.watch")) {
                Text(d.uhren.joinToString(" · "), fontWeight = FontWeight.SemiBold)
            })
            if (d.foils.isNotEmpty()) add(Triple(Icons.Filled.Waves, I18n.t("foiler.foil")) {
                Text(d.foils.joinToString(" · ") { "${it.brand} ${it.model} ${it.size}".trim() }, fontWeight = FontWeight.SemiBold)
            })
            d.kanal?.takeIf { it.isNotBlank() }?.let { k ->
                add(Triple(Icons.Filled.PlayArrow, "YouTube") {
                    // Angezeigt wird der Kanal-Name (@handle), nicht die ganze URL.
                    Text(kanalName(k), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable { runCatching { uri.openUri(k) } })
                })
            }
        }
        if (angaben.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            angaben.forEach { (icon, label, wert) ->
                Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                    Row(Modifier.width(120.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("$label:", style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Box(Modifier.weight(1f)) { wert() }
                }
            }
        }

        // Persoenliche Rekorde + Summen — dieselben Kacheln und Formeln wie im Web, damit dieselbe
        // Zahl nicht mit zwei Schreibweisen dasteht. Jede Kachel fuehrt in ihre Session.
        val s = d.rekorde
        if (d.zeigt.records && s != null) {
            Ueberschrift(I18n.t("foiler.records"))
            val r = s.records
            val kacheln = buildList {
                fun rek(label: String, e: RecordEntry?, fmt: (Double) -> String) =
                    add(Kachel(label, e?.value?.takeIf { it > 0 }?.let(fmt) ?: "–",
                        e?.takeIf { it.value > 0 }?.startedAt?.let { shortDate(it, e.tz) },
                        e?.takeIf { it.value > 0 }?.sessionId))
                rek(I18n.t("rec.farthestRun"), r?.distance) { "${it.roundToInt()} m" }
                rek(I18n.t("rec.longestRun"), r?.duration) { minSek(it) }
                rek(I18n.t("rec.topSpeed"), r?.speed) { "%.1f km/h".format(it * 3.6) }
                rek(I18n.t("rec.longestGlide"), r?.glide) { "%.1f s".format(it) }
                rek(I18n.t("rec.mostRuns"), r?.runs) { "${it.roundToInt()}" }
                add(Kachel(I18n.t("side.sessions"), "${s.count}"))
                add(Kachel(I18n.t("stat.runs"), "${s.runsTotal}"))
                add(Kachel(I18n.t("side.foiling"), "%.1f km".format(s.foilingKm)))
                add(Kachel(I18n.t("side.foilingTime"), dauerMin(s.foilingMin)))
                add(Kachel(I18n.t("side.pumps"), zahl(s.pumps)))
            }
            kacheln.chunked(3).forEach { reihe ->
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    reihe.forEach { k -> KachelView(k, Modifier.weight(1f), onOpenSession) }
                    repeat(3 - reihe.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }

        // Rekorde, die er AKTUELL haelt (12 Monate): community-weit getrennt nach Basis (mit
        // Bewegungssensor / nur GPS — so vergleicht jede Zeile Gleiches mit Gleichem) und je Spot.
        if (d.zeigt.titles && (d.titel.isNotEmpty() || d.spotTitel.isNotEmpty())) {
            Ueberschrift(I18n.t("foiler.titles"))
            listOf("accel" to "side.onlyAccel", "gps" to "foiler.basisGps").forEach { (basis, key) ->
                val liste = d.titel.filter { it.basis == basis }
                if (liste.isNotEmpty()) TitelZeile(Icons.Filled.Groups, I18n.t(key), null) {
                    liste.forEach { t -> TitelChip(t, gefuellt = true, onOpenSession) }
                }
            }
            // Nach Spot gebuendelt; die Reihenfolge kommt schon sortiert vom Server.
            d.spotTitel.groupBy { it.spot ?: "—" }.forEach { (spot, liste) ->
                TitelZeile(Icons.Filled.Place, spot, onSpot = { if (spot != "—") onOpenSpot(spot) }) {
                    // Ist er dort der einzige Fahrer, haelt er zwangslaeufig jeden Rekord — dann sagt
                    // EIN Hinweis mehr als zehn Titel ohne Gegner (Jan).
                    if (liste.first().allein) {
                        Chip(I18n.t("foiler.onlyFoiler"), gefuellt = false, onClick = null)
                    } else liste.forEach { t -> TitelChip(t, gefuellt = false, onOpenSession) }
                }
            }
        }

        // Spots, zu denen er eine Beschreibung geschrieben hat — der Link fuehrt an den Spot.
        if (d.zeigt.spots && d.spotNotizen.isNotEmpty()) {
            Ueberschrift(I18n.t("foiler.spotNotes"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                d.spotNotizen.forEach { n ->
                    Chip(n.name + (n.areaName?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                        gefuellt = false, onClick = { onOpenSpot(n.name) })
                }
            }
        }

        // Die letzten fuenf — dieselbe Karte wie in der eigenen Sessionliste. Die Antwort traegt
        // keine Besitzer-Felder; Name und Bild kommen vom Profil (wie im Web).
        if (d.zeigt.sessions && d.sessions.isNotEmpty()) {
            Ueberschrift(I18n.t("foiler.lastSessions"))
            d.sessions.forEach { ss ->
                SessionRow(ss.copy(ownerName = d.name, ownerAvatarUrl = d.avatarUrl),
                    Modifier.padding(bottom = if (ListenAnsicht.kompakt) 6.dp else 10.dp),
                    avatarUserId = d.id) { onOpenSession(ss.id) }
            }
        }
    }
}

private data class Kachel(val label: String, val wert: String, val datum: String? = null, val sid: Int? = null)

@Composable
private fun KachelView(k: Kachel, modifier: Modifier, onOpenSession: (Int) -> Unit) {
    Card(modifier.then(if (k.sid != null) Modifier.clickable { onOpenSession(k.sid) } else Modifier)) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
            Text(k.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(k.wert, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary, maxLines = 1)
            k.datum?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Ueberschrift(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 18.dp, bottom = 8.dp))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TitelZeile(icon: ImageVector, label: String, onSpot: (() -> Unit)?, chips: @Composable () -> Unit) {
    Column(Modifier.padding(bottom = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically,
            modifier = if (onSpot != null) Modifier.clickable { onSpot() } else Modifier) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                color = if (onSpot != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        }
        FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)) { chips() }
    }
}

@Composable
private fun TitelChip(t: FoilerTitel, gefuellt: Boolean, onOpenSession: (Int) -> Unit) {
    val (labelKey, fmt) = titelFormat(t.metric)
    // „Meiste Carves >180°" ist eine Summe ueber den Zeitraum und haengt an keiner Session
    // (s. _carve_record) -> kein Link, sonst zeigt er irgendwohin.
    Chip("${I18n.t(labelKey)} ${fmt(t.value)}", gefuellt, onClick = t.sessionId?.let { sid -> { onOpenSession(sid) } })
}

// Gefuellt = community-weiter Rekord (die Auszeichnung), umrandet = Spot-Rekord. Wie im Web.
@Composable
private fun Chip(text: String, gefuellt: Boolean, onClick: (() -> Unit)?) {
    Surface(
        shape = RoundedCornerShape(50),
        color = if (gefuellt) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface,
        border = if (gefuellt) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = if (onClick != null) Modifier.clickable { onClick() } else Modifier,
    ) {
        Text(text, style = MaterialTheme.typography.bodySmall,
            color = if (gefuellt) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

// Label und Format einer Rekord-Kennzahl — dieselbe Liste wie REC_ITEMS (web Home.tsx) bzw. die
// Community-Kacheln (CommunityScreen.recItems).
private fun titelFormat(metric: String): Pair<String, (Double) -> String> = when (metric) {
    "distance" -> "rec.farthestRun" to { v -> fmtDist(v) }
    "duration" -> "rec.longestRun" to { v -> minSek(v) }
    "speed" -> "rec.topSpeed" to { v -> "%.1f km/h".format(v * 3.6) }
    "glide" -> "rec.longestGlide" to { v -> "%.1f s".format(v) }
    "runs" -> "rec.mostRuns" to { v -> "${v.roundToInt()}" }
    "session_distance" -> "rec.sessionDistance" to { v -> "%.1f km".format(v / 1000.0) }
    "session_time" -> "rec.sessionTime" to { v -> "${(v / 60).roundToInt()} min" }
    "session_pumps" -> "rec.sessionPumps" to { v -> "${v.roundToInt()}" }
    "max_hr" -> "rec.maxHr" to { v -> "${v.roundToInt()} bpm" }
    "early_bird" -> "rec.earlyBird" to { v -> uhrzeit(v) }
    // Ende nach Mitternacht kommt als >24 h (z. B. 27:04) -> mod 24 h anzeigen (03:04).
    "night_owl" -> "rec.nightOwl" to { v -> uhrzeit(v % 86400) }
    "carves180" -> "rec.carves180" to { v -> "${v.roundToInt()}" }
    else -> metric to { v -> "%.1f".format(v) }
}

// m:ss wie im Web (floor Minuten, gerundete Sekunden).
private fun minSek(v: Double): String = "%d:%02d".format((v / 60).toInt(), (v % 60).roundToInt())

private fun uhrzeit(s: Double): String { val t = s.toInt(); return "%02d:%02d".format(t / 3600, (t % 3600) / 60) }

// Dieselbe Formel wie auf der eigenen Startseite (PersonalHome.fmtDur im Web).
private fun dauerMin(min: Double): String {
    val h = (min / 60).toInt()
    val m = (min % 60).roundToInt()
    return if (h > 0) "$h h $m min" else "$m min"
}

private fun zahl(n: Int): String =
    java.text.NumberFormat.getIntegerInstance(java.util.Locale.forLanguageTag(I18n.lang)).format(n)

// „Dabei seit 3. Mai 2026" in der PROFILSPRACHE, nicht in der des Geraets (Web, Jan 08.09.2026).
private fun langDatum(iso: String): String = try {
    java.time.LocalDate.parse(iso.take(10)).format(
        java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.LONG)
            .withLocale(java.util.Locale.forLanguageTag(I18n.lang)))
} catch (_: Exception) { iso }

// Anzeigename eines Kanal-Links: „@handle" wenn vorhanden, sonst der letzte Pfadteil bzw. Host.
private fun kanalName(url: String): String = try {
    val u = Uri.parse(url)
    u.pathSegments.lastOrNull()?.takeIf { it.isNotBlank() } ?: (u.host ?: url)
} catch (_: Exception) { url }
