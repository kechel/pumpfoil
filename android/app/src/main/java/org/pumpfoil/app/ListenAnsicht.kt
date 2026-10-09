package org.pumpfoil.app

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Session-Listen als Kacheln oder als EINE ZEILE je Session — wie die PWA seit 30.09.2026
 * (`web/src/lib/kompakteListe.ts`, Feedback #156: „on a laptop i can only fit 3-4 sessions on one
 * screen … an option for a oneline view would be great!").
 *
 * EIN Schalter fuer ALLE Listen (Startseite, Meine/Alle, Spot, Tagesgruppen, Foil-Detail) — wer
 * kompakt will, will es ueberall. Die Zeilen lesen `kompakt` selbst, deshalb stellen sich alle
 * Listen gleichzeitig um, auch die, ueber denen kein Umschalter steht (wie `SessionCard` im Web).
 *
 * Gemerkt je Geraet in SharedPreferences „pumpfoil", wie Theme und Pump-Einheit: eine
 * Ansichts-Wahl dieses Geraets, keine Kontoeinstellung. Schluessel wie der localStorage-Name
 * im Web, damit man ihn wiederfindet.
 */
object ListenAnsicht {
    private const val KEY = "foil_list_compact"
    var kompakt by mutableStateOf(false)
        private set

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    fun load(ctx: Context) { kompakt = prefs(ctx).getBoolean(KEY, false) }
    fun set(ctx: Context, an: Boolean) {
        if (an == kompakt) return
        kompakt = an
        prefs(ctx).edit().putBoolean(KEY, an).apply()
    }

    /** Senkrechter Abstand je Listeneintrag: Zeilen enger (Web: space-y-1.5 statt space-y-3). */
    val abstand: Dp get() = if (kompakt) 3.dp else 5.dp
}

/**
 * Umschalter Kacheln / Zeilen. Zwei Symbole statt eines Wortes (wie `ListenAnsicht.tsx`): passt
 * in jede Werkzeugzeile, ohne umzubrechen; was sie tun, sagt die Beschriftung fuer den
 * Screenreader in der Sprache des Nutzers (`list.cards` / `list.compact`).
 */
@Composable
fun ListenAnsichtUmschalter(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val k = ListenAnsicht.kompakt
    val rand = MaterialTheme.colorScheme.outlineVariant
    Row(
        modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, rand, RoundedCornerShape(12.dp)).padding(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        UmschaltKnopf(aktiv = !k, label = I18n.t("list.cards")) { ListenAnsicht.set(ctx, false) }
        UmschaltKnopf(aktiv = k, label = I18n.t("list.compact"), zeilen = true) { ListenAnsicht.set(ctx, true) }
    }
}

@Composable
private fun UmschaltKnopf(aktiv: Boolean, label: String, zeilen: Boolean = false, onClick: () -> Unit) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val bg = if (aktiv) MaterialTheme.colorScheme.onSurface.copy(alpha = if (dark) 0.16f else 0.10f) else Color.Transparent
    val fg = if (aktiv) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        Modifier.clip(RoundedCornerShape(10.dp)).background(bg).clickable(onClick = onClick)
            .semantics { contentDescription = label; selected = aktiv }
            .padding(horizontal = 8.dp, vertical = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        // Kachel-Symbol: zwei gestapelte Karten (wie KachelnIcon im Web); Zeilen: Liste.
        Icon(if (zeilen) Icons.AutoMirrored.Filled.ViewList else Icons.Filled.ViewAgenda,
            contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
    }
}

// Datum der Zeile: Wochentag + dd.MM.yy — kurz, und in JEDER Zeile gleich breit, damit die Spalten
// untereinander stehen (das Web nimmt „Di., 29. Sept. 26"; die App schreibt Daten ueberall als
// dd.MM., s. TimeFmt.kt). Wochentag in der App-Sprache.
private fun zeilenDatum(d: LocalDate): String {
    val loc = runCatching { Locale.forLanguageTag(I18n.lang) }.getOrDefault(Locale.getDefault())
    return d.format(DateTimeFormatter.ofPattern("EEE dd.MM.yy", loc))
}

internal fun zeilenDatum(iso: String?, tz: String?): String {
    if (iso.isNullOrBlank()) return ""
    val d = try {
        val odt = OffsetDateTime.parse(iso)
        (if (tz != null) runCatching { odt.atZoneSameInstant(ZoneId.of(tz)) }.getOrNull() else null)
            ?.toLocalDate() ?: odt.toLocalDate()
    } catch (_: Exception) {
        runCatching { LocalDate.parse(iso.take(10)) }.getOrNull()
    } ?: return ""
    return zeilenDatum(d)
}

internal fun zeilenDatumTag(ymd: String): String =
    runCatching { zeilenDatum(LocalDate.parse(ymd)) }.getOrDefault(ymd)

/**
 * EINE Session als Zeile — auf dem Handy hoechstens ZWEI Zeilen (Jan, 30.09.2026: „mobile nicht
 * mehr als 2 zeilen max je session, rest halt abschneiden"). Oben Profilbild, Datum, Uhrzeit,
 * Name, Spot; unten Sportart (nur wenn kein Pumpfoilen), die Kennzahlen, Herz und Pfeil. Was nicht
 * passt, wird am Ende abgeschnitten statt umzubrechen. Ohne Bilder, Setup und Geraet — dafuer ist
 * die Kachel da. Lange druecken = Vergleich, wie bei der Kachel.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun SessionZeile(
    sessionId: Int,
    avatarName: String?,
    avatarUrl: String?,
    avatarUserId: Int? = null,
    datum: String,
    uhrzeit: String?,
    name: String?,
    spot: String?,
    sportLabel: String?,
    kennzahlen: List<String>,
    liked: Boolean,
    likeCount: Int,
    modifier: Modifier = Modifier,
    abzeichen: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    val inCompare = CompareStore.refs.collectAsState().value.contains(CompareRef(sessionId))
    Card(
        modifier = modifier.fillMaxWidth().combinedClickable(
            onClick = onClick, onLongClick = { CompareStore.toggle(sessionId) }),
        shape = RoundedCornerShape(12.dp),
        border = if (inCompare) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
            ZeilenKopf(avatarName, avatarUrl, datum, uhrzeit, name, spot, avatarUserId)
            Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    sportLabel?.let { SportMarke(it); Spacer(Modifier.width(6.dp)) }
                    Kennzahlen(kennzahlen, Modifier.weight(1f, fill = false))
                }
                abzeichen?.let { Spacer(Modifier.width(6.dp)); it() }
                LikeToggle(sessionId, liked, likeCount)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/**
 * Tagesgruppe als Zeile (Jan, 30.09.2026: „fehlt noch bei den session-gruppenkarten"). Der Stapel
 * bleibt als Andeutung — ein Blatt dahinter, leicht versetzt —, damit die Gruppe auch als Zeile
 * eine Gruppe bleibt. Aufgeklappt folgen die Sessions, die sich selbst als Zeilen zeichnen.
 */
@Composable
internal fun GruppenZeile(g: CommunityGroup, modifier: Modifier, onOpen: (Int) -> Unit) {
    var open by remember(g.userId, g.date) { mutableStateOf(false) }
    val kennzahlen = buildList {
        add("${g.count} " + I18n.t("unit.sessions"))
        if (g.foilingKm > 0) add("%.1f km".format(g.foilingKm))
        if (g.foilingTimeS > 0) add(zeilenDauer(g.foilingTimeS))
        if (g.pumpCount > 0) add("↕ ${g.pumpCount}")
        g.maxSpeedMps?.let { add("max %.1f km/h".format(it * 3.6)) }
    }
    Box(modifier.fillMaxWidth().padding(top = 3.dp, end = 3.dp)) {
        // Das Blatt dahinter: nur seine Kante oben/rechts ist zu sehen, es schluckt keine Klicks.
        Box(Modifier.matchParentSize().offset(x = 3.dp, y = (-3).dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)))
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Column {
                Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 10.dp, vertical = 6.dp)) {
                    ZeilenKopf(g.name, g.avatarUrl, zeilenDatumTag(g.date), null, g.name, g.spot, g.userId)
                    Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Kennzahlen(kennzahlen, Modifier.weight(1f))
                        Icon(if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                            contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp))
                    }
                }
                if (open) {
                    g.sessions.forEach { c ->
                        CommunityItemRow(c, Modifier.padding(horizontal = 8.dp, vertical = 3.dp)) { onOpen(c.id) }
                    }
                    Spacer(Modifier.size(4.dp))
                }
            }
        }
    }
}

// Obere Zeile: Profilbild · Datum · Uhrzeit · Name · Spot. Name vor Spot; der Name bekommt bis zu
// 40 % der Breite, gekuerzt wird zuerst der Spot (wie im Web).
@Composable
private fun ZeilenKopf(avatarName: String?, avatarUrl: String?, datum: String, uhrzeit: String?, name: String?, spot: String?, userId: Int? = null) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val nameMax = maxWidth * 0.4f
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarCircle(name = avatarName, avatarUrl = avatarUrl, size = 20.dp, userId = userId)
            Spacer(Modifier.width(6.dp))
            Text(datum, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                maxLines = 1, softWrap = false)
            uhrzeit?.let {
                Spacer(Modifier.width(6.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, softWrap = false)
            }
            name?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.width(6.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = nameMax))
            }
            spot?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Filled.LocationOn, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            }
        }
    }
}

// Kennzahlen in EINER Zeile, am Ende abgeschnitten (nicht umgebrochen, nicht scrollbar).
@Composable
private fun Kennzahlen(teile: List<String>, modifier: Modifier = Modifier) {
    if (teile.isEmpty()) return
    Text(teile.joinToString("   "), style = MaterialTheme.typography.bodySmall,
        maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

// Sportart-Kennzeichen in Bernstein wie in der Kachel (Pill AMBER in SessionsScreen.kt).
@Composable
private fun SportMarke(text: String) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    Surface(color = Color(0xFFF59E0B).copy(alpha = 0.15f), shape = RoundedCornerShape(4.dp)) {
        Text(text, Modifier.padding(horizontal = 5.dp, vertical = 1.dp), style = MaterialTheme.typography.labelSmall,
            color = if (dark) AmberOnDark else AmberOnLight, maxLines = 1, softWrap = false)
    }
}

// Foil-Zeit der Gruppe als m:ss — dasselbe Format wie die Gruppenkachel (fmtDur in SessionsScreen.kt).
private fun zeilenDauer(s: Double): String = fmtLaufDauer(s)
