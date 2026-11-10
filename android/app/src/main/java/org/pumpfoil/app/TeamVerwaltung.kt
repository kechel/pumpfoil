package org.pumpfoil.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import kotlin.math.roundToInt

/*
 * Team-Verwaltung nativ (04.11.2026, docs/UX-IA.md „App-Port"): bis dahin oeffnete das Zahnrad der Teamseite die
 * Verwaltung im Browser. Vorlage ist das Web:
 *   - Gruenden: web/src/pages/Teams.tsx (Name, Adresse aus dem Namen vorgeschlagen, Pruefung, danach in die Verwaltung)
 *   - Verwaltung/Grunddaten: web/src/pages/TeamEinstellungen.tsx (Reiter Verwalten | Grunddaten)
 *   - Events: web/src/components/TeamEventsVerwalten.tsx (Popup, auch vom Zahnrad der Event-Seite)
 *   - Team-/Eventbild mit Fokuspunkt: web/src/components/TeamBanner.tsx `BannerBearbeiten`
 * Rechte wie im Web: Leitung alles, Moderatoren Mitglieder, Einladungslinks (ohne „neu erzeugen") und Events. Der Server
 * prueft jede Aenderung selbst (server/app/api/teams.py); die App blendet nur aus, was sie nicht darf.
 */

// ------------------------------------------------------------------------- Laender/Herkunft ----
// Wie web/src/lib/laender.ts (ISO 3166-1 alpha-2, dieselbe Liste wie die Flaggen unter /flags) und
// components/TeamHerkunft.tsx KONTINENTE ("k:<kuerzel>", server teams.KONTINENTE).

internal val LAENDER: List<String> = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR " +
    "BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK " +
    "FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO " +
    "JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU " +
    "MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC " +
    "SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA " +
    "VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ")

internal val KONTINENTE = listOf("k:earth", "k:eu", "k:af", "k:as", "k:na", "k:sa", "k:oc")

private fun verwaltungLocale(): Locale = Locale.forLanguageTag(if (I18n.lang == "gsw") "de-CH" else I18n.lang)

/** Landesname in der App-Sprache (wie Intl.DisplayNames im Web). */
internal fun landName(code: String): String =
    runCatching { Locale("", code).getDisplayCountry(verwaltungLocale()) }.getOrNull()?.takeIf { it.isNotBlank() } ?: code

/** Kontinente als eigene Texte (region.*), Laender ueber die Sprache des Systems (Web herkunftName). */
internal fun herkunftName(land: String): String = if (land.startsWith("k:")) I18n.t("region.${land.drop(2)}") else landName(land)

/** Flaggen-Emoji zu einem ISO-Code (null bei „k:…" oder unbekanntem Code). */
internal fun flaggeEmoji(land: String?): String? {
    val c = land?.trim()?.uppercase() ?: return null
    if (c.length != 2 || c !in LAENDER) return null
    return String(Character.toChars(0x1F1E6 + (c[0] - 'A'))) + String(Character.toChars(0x1F1E6 + (c[1] - 'A')))
}

/** Herkunft neben dem Namen (Web TeamHerkunft): Flagge, bei Kontinent/Erde ein Erd-Zeichen mit Kuerzel. */
@Composable
internal fun TeamHerkunftZeichen(land: String?, gross: Boolean = false, kuerzel: Boolean = true) {
    val l = land?.takeIf { it.isNotBlank() } ?: return
    if (!l.startsWith("k:")) {
        flaggeEmoji(l)?.let { Text(it, style = if (gross) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium) }
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        val hell = MaterialTheme.colorScheme.background.luminance() > 0.5f
        val umriss = remember(l, hell) { kontinentBild(l.drop(2), hell) }
        if (umriss != null) {
            androidx.compose.foundation.Image(umriss.asImageBitmap(), contentDescription = herkunftName(l),
                modifier = Modifier.size(if (gross) 24.dp else 18.dp, if (gross) 18.dp else 13.5.dp).clip(RoundedCornerShape(2.dp)))
        } else {
            Icon(Icons.Filled.Public, contentDescription = herkunftName(l), tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(if (gross) 18.dp else 14.dp))
        }
        // Ohne Kuerzel, wo der Name ohnehin dabeisteht (Regionsauswahl der Rangliste, 05.11.2026).
        if (kuerzel) {
            Spacer(Modifier.width(3.dp))
            Text(l.drop(2).uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private val kontinentBilder = mutableMapOf<String, android.graphics.Bitmap>()

/** Kontinent oder Erde als Umriss im Flaggen-Kaestchen wie im Web (TeamHerkunft.tsx), 4:3: dunkel cyan auf slate-900,
 *  hell dunkles Cyan (#0e7490, Akzent des hellen Bildes) auf slate-100. Fuer die Marke neben dem Namen und das Teilen-Bild. */
internal fun kontinentBild(k: String, hell: Boolean = false): android.graphics.Bitmap? {
    val schluessel = if (hell) "$k|hell" else k
    kontinentBilder[schluessel]?.let { return it }
    val d = KONTINENT_PFADE[k] ?: return null
    val m = 4f
    val b = android.graphics.Bitmap.createBitmap((48 * m).toInt(), (36 * m).toInt(), android.graphics.Bitmap.Config.ARGB_8888)
    val g = android.graphics.Canvas(b)
    g.drawColor(if (hell) 0xFFF1F5F9.toInt() else 0xFF0F172A.toInt())   // slate-100 / slate-900
    val pfad = androidx.core.graphics.PathParser.createPathFromPathData(d)
    pfad.transform(android.graphics.Matrix().apply { setScale(m, m) })
    g.drawPath(pfad, android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = if (hell) 0xFF0E7490.toInt() else 0xFF22D3EE.toInt() })   // #0e7490 / brand-400
    kontinentBilder[schluessel] = b
    return b
}

// ----------------------------------------------------------------------------- Bausteine ----

/** Kennzahlen der Team-Bestenlisten in der Reihenfolge des Webs (lib/teamKennzahlen.ts TEAM_KENNZAHLEN). */
private val KENNZAHLEN_BEST = listOf("session_pumps", "distance", "duration", "speed", "glide", "runs", "session_distance", "session_time")
private val KENNZAHLEN_SUMME = listOf("sum_pumps", "sum_runs", "sum_sessions", "sum_distance", "sum_time", "sum_spots")

/** Eine Option der Auswahl: `key` = Wert; `kopf` = Gruppenueberschrift (nicht waehlbar), `trenner` = Linie. */
internal data class Option(val key: String, val label: String, val kopf: Boolean = false, val trenner: Boolean = false)

/** Auswahlfeld wie ein <select> im Web: Knopf mit dem gewaehlten Text, darunter die Liste. */
@Composable
internal fun AuswahlFeld(wert: String, optionen: List<Option>, onWahl: (String) -> Unit, modifier: Modifier = Modifier,
                         leer: String = "—") {
    var offen by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { offen = true }, modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)) {
            Text(optionen.firstOrNull { it.key == wert && !it.kopf && !it.trenner }?.label ?: leer, Modifier.weight(1f),
                maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurface)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = offen, onDismissRequest = { offen = false }, modifier = Modifier.heightIn(max = 420.dp)) {
            optionen.forEach { o ->
                when {
                    o.trenner -> HorizontalDivider()
                    o.kopf -> Text(o.label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
                    else -> DropdownMenuItem(text = {
                        Text(o.label, fontWeight = if (o.key == wert) FontWeight.SemiBold else FontWeight.Normal)
                    }, onClick = { offen = false; onWahl(o.key) })
                }
            }
        }
    }
}

/** Schalter mit Titel und Erklaerung (Web `Schalter`). */
@Composable
private fun VSchalter(an: Boolean, onChange: (Boolean) -> Unit, titel: String, text: String? = null) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!an) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(titel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            text?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Spacer(Modifier.width(8.dp))
        Switch(checked = an, onCheckedChange = onChange)
    }
}

/** Haekchen mit Text in einer Zeile (Filter einer Bestenliste). */
@Composable
private fun Haken(an: Boolean, text: String, onChange: (Boolean) -> Unit, enabled: Boolean = true) {
    Row(Modifier.clip(RoundedCornerShape(8.dp)).clickable(enabled = enabled) { onChange(!an) }.padding(end = 8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = an, onCheckedChange = if (enabled) onChange else null, enabled = enabled)
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

/** Abschnitt der Verwaltung (Web `Card` mit Ueberschrift und Hinweis). */
@Composable
private fun VKarte(titel: String, hinweis: String? = null, titelFarbe: Color = Color.Unspecified, inhalt: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text(titel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = titelFarbe)
            hinweis?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
            } ?: Spacer(Modifier.height(6.dp))
            inhalt()
        }
    }
}

/** Bild aus der Fotoauswahl des Systems holen (keine Berechtigung noetig) → Bytes + MIME-Typ. */
@Composable
private fun rememberBildWahl(onBild: (ByteArray, String) -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val l = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val bytes = withContext(Dispatchers.IO) { runCatching { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() }
            if (bytes != null) onBild(bytes, mime)
        }
    }
    return { l.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

private fun fokusWerte(fokus: String?): Pair<Float, Float> =
    (fokus ?: "50,50").split(",").map { (it.trim().toFloatOrNull() ?: 50f).coerceIn(0f, 100f) }
        .let { if (it.size == 2) it[0] to it[1] else 50f to 50f }

/**
 * Team- bzw. Eventbild bearbeiten (Web TeamBanner.tsx `BannerBearbeiten`): hochladen, Fokuspunkt antippen, Vorschau fuer
 * Handy (2,5:1) und Rechner (4:1), entfernen. `texte` = Schluessel-Praefix (team.banner | team.eventbild).
 */
@Composable
private fun BannerBearbeiten(url: String?, fokusIn: String?, texte: String, hochladen: suspend (ByteArray, String) -> Unit,
                             fokusSetzen: suspend (String) -> Unit, entfernen: suspend () -> Unit, onFehler: (Throwable) -> Unit) {
    val scope = rememberCoroutineScope()
    var fokus by remember(fokusIn) { mutableStateOf(fokusIn ?: "50,50") }
    var busy by remember { mutableStateOf(false) }
    val wahl = rememberBildWahl { b, m ->
        busy = true
        scope.launch { try { hochladen(b, m) } catch (e: Exception) { onFehler(e) }; busy = false }
    }
    val (fx, fy) = fokusWerte(fokus)
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Text(I18n.t("$texte.titel"), style = MaterialTheme.typography.bodyMedium)
        Text(I18n.t("$texte.hinweis"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 6.dp))
        val bild = Api.mediaUrl(url)
        if (bild != null) {
            // Der Satz zum Antippen steht nur, wenn es ein Bild gibt (wie im Web).
            Text(I18n.t("team.banner.fokusHinweis"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 4.dp))
            var groesse by remember { mutableStateOf(IntSize.Zero) }
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).onSizeChanged { groesse = it }
                .pointerInput(Unit) {
                    detectTapGestures { p ->
                        if (size.width <= 0 || size.height <= 0) return@detectTapGestures
                        val x = (p.x / size.width).coerceIn(0f, 1f) * 100
                        val y = (p.y / size.height).coerceIn(0f, 1f) * 100
                        val f = "${x.roundToInt()},${y.roundToInt()}"
                        fokus = f
                        scope.launch { try { fokusSetzen(f) } catch (e: Exception) { onFehler(e) } }
                    }
                }) {
                AsyncImage(model = bild, contentDescription = null, contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth())
                if (groesse.width > 0) {
                    val r = 10.dp
                    Box(Modifier
                        .offset { IntOffset((fx / 100f * groesse.width - r.toPx()).roundToInt(), (fy / 100f * groesse.height - r.toPx()).roundToInt()) }
                        .size(r * 2).clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)).border(2.dp, Color.White, CircleShape))
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(2.5f to "team.banner.handy", 4f to "team.banner.rechner").forEach { (v, k) ->
                    Column(Modifier.weight(1f)) {
                        AsyncImage(model = bild, contentDescription = null, contentScale = ContentScale.Crop,
                            alignment = BiasAlignment(fx / 50f - 1f, fy / 50f - 1f),
                            modifier = Modifier.fillMaxWidth().aspectRatio(v).clip(RoundedCornerShape(6.dp)))
                        Text(I18n.t(k), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !busy, onClick = wahl) { Text(I18n.t("$texte.hochladen")) }
            if (bild != null) OutlinedButton(enabled = !busy, onClick = {
                busy = true
                scope.launch { try { entfernen() } catch (e: Exception) { onFehler(e) }; busy = false }
            }) { Text(I18n.t("$texte.entfernen")) }
        }
    }
}

/** Optionen fuer Sportart und Foil-Band einer Bestenliste (Web: sortiereNachSport + bandLabel). */
private fun sportOptionen(sports: List<String>) = sortiereSports(sports, "pumpfoil").map { Option(it, I18n.t("cls.sport.$it")) }
private fun bandOptionen(bands: List<FoilBand>) =
    bands.filter { it.art != "eigenes" }.map { Option(it.key, bandLabel(it)) }.ifEmpty { listOf(Option("all", I18n.t("team.tafel.alleFoils"))) }

/** Sportarten, Foil-Baender und Spots fuer Bestenlisten und Events (wie Web TeamEinstellungen/TeamEventSeite). */
private class VerwaltungsListen(val sports: List<String>, val bands: List<FoilBand>, val spots: List<Pair<Int, String>>)

private suspend fun verwaltungsListenLaden(): VerwaltungsListen {
    val sports = runCatching { (listOf("pumpfoil") + Api.communitySports().map { it.sport }).distinct() }.getOrDefault(listOf("pumpfoil"))
    val bands = runCatching { Api.foilBands(true) }.getOrDefault(emptyList())
    val spots = runCatching {
        Api.spotMap(false, "all").mapNotNull { s -> s.spotId?.let { it to s.spot } }.distinctBy { it.first }
            .sortedBy { it.second.lowercase() }
    }.getOrDefault(emptyList())
    return VerwaltungsListen(sports, bands, spots)
}

// ------------------------------------------------------------------------------- Gruenden ----

/**
 * „Team gruenden" (Web Teams.tsx): Name, Adresse (pumpfoil.org/teams/…) aus dem Namen vorgeschlagen, solange man sie
 * nicht selbst aendert; eine eigene Adresse wird am Server geprueft. Danach geht es in die Verwaltung (Grunddaten).
 * Steht in Einstellungen › Team unter der Teamsuche und auf Home › Team, solange man in keinem Team ist.
 */
@Composable
fun TeamGruendenKarte(onGegruendet: (String) -> Unit, modifier: Modifier = Modifier) {
    var name by remember { mutableStateOf("") }
    var slug by remember { mutableStateOf("") }
    var slugAnders by remember { mutableStateOf(false) }
    var slugFehler by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var fehler by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    // Adress-Vorschlag aus dem Namen (entprellt wie im Web, 300 ms).
    LaunchedEffect(name, slugAnders) {
        if (slugAnders || name.trim().length < 3) return@LaunchedEffect
        kotlinx.coroutines.delay(300)
        runCatching { Api.teamSlug(name = name) }.getOrNull()?.let { slug = it.slug; slugFehler = null }
    }
    LaunchedEffect(slug, slugAnders) {
        if (!slugAnders || slug.isEmpty()) return@LaunchedEffect
        kotlinx.coroutines.delay(300)
        runCatching { Api.teamSlug(slug = slug) }.getOrNull()?.let { slugFehler = it.fehler }
    }
    Card(modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("team.gruenden"), fontWeight = FontWeight.SemiBold)
            Text(I18n.t("team.gruendenHinweis"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
            OutlinedTextField(value = name, onValueChange = { name = it.take(60) }, singleLine = true,
                label = { Text(I18n.t("team.name")) }, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(value = slug, singleLine = true, label = { Text(I18n.t("team.adresse")) },
                prefix = { Text("pumpfoil.org/teams/", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                onValueChange = { v -> slugAnders = true; slug = v.lowercase().filter { it in 'a'..'z' || it in '0'..'9' || it == '-' }.take(40) },
                modifier = Modifier.fillMaxWidth())
            Text(slugFehler?.let { I18n.t("team.err.$it") } ?: I18n.t("team.adresseHinweis"), style = MaterialTheme.typography.bodySmall,
                color = if (slugFehler != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
            fehler?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(bottom = 8.dp)) }
            Button(enabled = !busy && name.trim().length >= 3 && slugFehler == null, onClick = {
                busy = true; fehler = null
                scope.launch {
                    try { onGegruendet(Api.teamAnlegen(name.trim(), slug.ifBlank { null })) }
                    catch (e: Exception) { fehler = teamFehlerText(e) }
                    busy = false
                }
            }) { Text(I18n.t("team.gruendenKnopf")) }
        }
    }
}

// ----------------------------------------------------------------------------- Verwaltung ----

/**
 * Verwaltung eines Teams (Web TeamEinstellungen.tsx). Zwei Ansichten: „Verwalten" fuer Leitung und Moderatoren
 * (Anfragen, Mitglieder, Events, Einladungslinks) und „Grunddaten" nur fuer die Leitung (Freigabe, Auftritt mit Logo und
 * Teambild, Beitritt, Sichtbarkeit, Bestenlisten, Teamspots, Loeschen).
 *
 * `onFertig(neuerSlug)`: zurueck; `neuerSlug` != null, wenn die Adresse geaendert wurde (dann stimmt die alte Teamseite
 * nicht mehr). `onGeloescht`: Team geloescht.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TeamVerwaltungScreen(slug: String, grund: Boolean, onFertig: (String?) -> Unit, onGeloescht: () -> Unit) {
    var akt by remember(slug) { mutableStateOf(slug) }
    var team by remember(slug) { mutableStateOf<TeamInfo?>(null) }
    var fehlt by remember(slug) { mutableStateOf(false) }
    var tab by remember(slug) { mutableStateOf(if (grund) "einstellungen" else "verwalten") }
    var name by remember(slug) { mutableStateOf("") }
    var neuSlug by remember(slug) { mutableStateOf("") }
    var beschreibung by remember(slug) { mutableStateOf("") }
    var links by remember(slug) { mutableStateOf<Map<String, String>?>(null) }
    var mitglieder by remember(slug) { mutableStateOf<TeamMitgliederVoll?>(null) }
    var tafeln by remember(slug) { mutableStateOf<List<TeamTafel>>(emptyList()) }
    var listen by remember { mutableStateOf(VerwaltungsListen(listOf("pumpfoil"), emptyList(), emptyList())) }
    var spotWahl by remember { mutableStateOf("") }
    var loeschName by remember { mutableStateOf("") }
    var frage by remember { mutableStateOf<Frage?>(null) }
    var neuLaden by remember { mutableIntStateOf(0) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val uri = LocalUriHandler.current

    fun melden(t: String) { scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(t) } }
    fun fehlerZeigen(e: Throwable) = melden(teamFehlerText(e))
    fun gespeichert() = melden(I18n.t("team.gespeichert"))
    fun zurueck() = onFertig(if (akt != slug) akt else null)
    androidx.activity.compose.BackHandler { zurueck() }

    LaunchedEffect(akt, neuLaden) {
        try {
            val d = Api.team(akt)
            if (!d.verwalter) { zurueck(); return@LaunchedEffect }
            if (d.meineRolle != "leiter") tab = "verwalten"
            team = d; name = d.name; neuSlug = d.slug; beschreibung = d.beschreibung ?: ""
        } catch (_: Exception) { if (team == null) fehlt = true }
    }
    LaunchedEffect(akt) {
        mitglieder = runCatching { Api.teamMitgliederVerwalten(akt) }.getOrNull() ?: mitglieder
        links = runCatching { Api.teamEinladungen(akt) }.getOrNull() ?: links
    }
    val leiter = team?.meineRolle == "leiter"
    LaunchedEffect(leiter, team != null) {
        if (team == null) return@LaunchedEffect
        if (leiter) tafeln = runCatching { Api.teamBestenlisten(akt, "30d").map { it.copy(zeilen = emptyList()) } }.getOrDefault(tafeln)
        listen = verwaltungsListenLaden()
    }
    fun mitgliederLaden() { scope.launch { mitglieder = runCatching { Api.teamMitgliederVerwalten(akt) }.getOrNull() ?: mitglieder } }
    fun einstellen(body: JsonObject) {
        scope.launch {
            try {
                val d = Api.teamEinstellen(akt, body)
                team = d; akt = d.slug; neuSlug = d.slug
                gespeichert()
            } catch (e: Exception) { fehlerZeigen(e) }
        }
    }

    val t = team
    val f = teamFarbe(t?.farbe)
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (t == null) "" else if (leiter) t.name else I18n.t(if (tab == "einstellungen") "team.tab.grunddaten" else "team.tab.verwalten"),
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                navigationIcon = {
                    IconButton(onClick = { zurueck() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) }
                },
                actions = { FeedbackKnopf() },
            )
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            when {
                fehlt -> Text(I18n.t("team.nichtGefunden"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                t == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                else -> {
                    // Dieselben Reiter wie im Web (nur die Leitung hat beide).
                    if (leiter) Reiterleiste(listOf(ReiterDef("verwalten", I18n.t("team.tab.verwalten")),
                        ReiterDef("einstellungen", I18n.t("team.tab.grunddaten"))), tab, { tab = it })
                    Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(16.dp)) {
                        if (tab == "verwalten") {
                            mitglieder?.let { ml ->
                                VKarte(I18n.t("team.mitglieder")) {
                                    if (ml.anfragen.isNotEmpty()) {
                                        Text(I18n.t("team.anfragen"), style = MaterialTheme.typography.labelLarge,
                                            modifier = Modifier.padding(bottom = 4.dp))
                                        ml.anfragen.forEachIndexed { i, m ->
                                            if (i > 0) HorizontalDivider()
                                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                                AvatarCircle(m.name, m.avatarUrl, 32.dp, m.userId)
                                                Spacer(Modifier.width(10.dp))
                                                Column(Modifier.weight(1f)) {
                                                    Text(m.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                    m.profil?.let { AnfrageProfil(it) }
                                                }
                                            }
                                            Row(Modifier.padding(start = 42.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                TeamKnopf(I18n.t("team.annehmen"), f, onClick = {
                                                    scope.launch { try { Api.teamAnnehmen(akt, m.userId); mitgliederLaden(); neuLaden++ } catch (e: Exception) { fehlerZeigen(e) } }
                                                })
                                                OutlinedButton(onClick = {
                                                    scope.launch { try { Api.teamEntfernen(akt, m.userId); mitgliederLaden(); neuLaden++ } catch (e: Exception) { fehlerZeigen(e) } }
                                                }) { Text(I18n.t("team.ablehnen")) }
                                            }
                                        }
                                        Spacer(Modifier.height(10.dp))
                                    }
                                    ml.mitglieder.forEachIndexed { i, m ->
                                        if (i > 0) HorizontalDivider()
                                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                            AvatarCircle(m.name, m.avatarUrl, 32.dp, m.userId)
                                            Spacer(Modifier.width(10.dp))
                                            Text(m.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            if (leiter && m.rolle != "leiter") {
                                                AuswahlFeld(m.rolle, listOf(
                                                    Option("mitglied", I18n.t("team.rolle.mitglied")),
                                                    Option("moderator", I18n.t("team.rolle.moderator")),
                                                    Option("leiter", I18n.t("team.rolleUebergeben")),
                                                ), onWahl = { r ->
                                                    if (r == m.rolle) return@AuswahlFeld
                                                    val tun = {
                                                        scope.launch {
                                                            try { Api.teamRolle(akt, m.userId, r); mitgliederLaden(); if (r == "leiter") neuLaden++ }
                                                            catch (e: Exception) { fehlerZeigen(e) }
                                                        }
                                                        Unit
                                                    }
                                                    if (r == "leiter") frage = Frage(I18n.t("team.uebergebenFrage").replace("{name}", m.name), I18n.t("team.rolleUebergeben"), tun) else tun()
                                                }, modifier = Modifier.width(150.dp))
                                            } else {
                                                Text(I18n.t("team.rolle.${m.rolle}"), style = MaterialTheme.typography.labelMedium, color = f.akzent)
                                            }
                                            if (m.rolle != "leiter" && (leiter || m.rolle == "mitglied")) {
                                                IconButton(onClick = {
                                                    frage = Frage(I18n.t("team.entfernenFrage").replace("{name}", m.name), I18n.t("team.entfernen")) {
                                                        scope.launch { try { Api.teamEntfernen(akt, m.userId); mitgliederLaden() } catch (e: Exception) { fehlerZeigen(e) } }
                                                    }
                                                }) { Icon(Icons.Filled.Delete, contentDescription = I18n.t("team.entfernen")) }
                                            }
                                        }
                                    }
                                }
                            }

                            TeamEventsVerwaltenKarte(akt, t.farbe, listen, onMeldung = { melden(it) }, offiziell = t.offiziell)

                            links?.let { l ->
                                VKarte(I18n.t("team.links"), I18n.t("team.linksHinweis")) {
                                    listOf("join", "apply").forEachIndexed { i, art ->
                                        if (i > 0) HorizontalDivider(Modifier.padding(vertical = 8.dp))
                                        val url = teamWebUrl("/teams/${t.slug}/$art-${l[art] ?: ""}")
                                        Text(I18n.t("team.link.$art"), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                        Text(I18n.t("team.link.${art}Text"), style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text(url, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall,
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.surfaceVariant).padding(8.dp))
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            OutlinedButton(onClick = {
                                                val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                                cm.setPrimaryClip(android.content.ClipData.newPlainText(t.name, url))
                                                melden(I18n.t("team.kopiert"))
                                            }) { Text(I18n.t("team.kopieren")) }
                                            OutlinedButton(onClick = { teilenUrl(ctx, url, t.name) }) { Text(I18n.t("team.teilen")) }
                                            if (leiter) OutlinedButton(onClick = {
                                                frage = Frage(I18n.t("team.linkNeuFrage"), I18n.t("team.linkNeu")) {
                                                    scope.launch {
                                                        try { val r = Api.teamEinladungNeu(akt, art); links = (links ?: emptyMap()) + r }
                                                        catch (e: Exception) { fehlerZeigen(e) }
                                                    }
                                                }
                                            }) { Text(I18n.t("team.linkNeu")) }
                                        }
                                    }
                                }
                            }
                        }

                        if (tab == "einstellungen" && leiter) {
                            VKarte(I18n.t("team.freigabe.titel")) {
                                Text(I18n.t("team.freigabe.text.${t.freigabe ?: "keine"}"), style = MaterialTheme.typography.bodyMedium)
                                if (t.freigabe == "abgelehnt" && !t.freigabeNotiz.isNullOrBlank()) {
                                    Text(t.freigabeNotiz, style = MaterialTheme.typography.bodyMedium, color = Color(0xFFD97706),
                                        modifier = Modifier.padding(top = 6.dp))
                                }
                                if (t.freigabe == "frei" && t.auftrittGeaendert) Text(I18n.t("team.freigabe.geaendert"),
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 6.dp))
                                if (t.freigabe == null || t.freigabe == "keine" || t.freigabe == "abgelehnt") {
                                    Spacer(Modifier.height(8.dp))
                                    TeamKnopf(I18n.t("team.freigabe.beantragen"), f, onClick = {
                                        scope.launch { try { Api.teamFreigabe(akt); neuLaden++ } catch (e: Exception) { fehlerZeigen(e) } }
                                    })
                                }
                            }

                            VKarte(I18n.t("team.auftritt"), I18n.t("team.auftrittHinweis")) {
                                // Herkunft gilt sofort, ohne Freigabe (feste Liste) — deshalb ganz oben, nicht ueber „Speichern".
                                Text(I18n.t("team.herkunft"), style = MaterialTheme.typography.bodyMedium)
                                Row(Modifier.padding(top = 4.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    val opt = remember(I18n.lang) {
                                        listOf(Option("", I18n.t("profile.landNone"))) + KONTINENTE.map { Option(it, herkunftName(it)) } +
                                            Option("-", "", trenner = true) +
                                            LAENDER.map { Option(it, landName(it)) }.sortedWith(compareBy(java.text.Collator.getInstance(verwaltungLocale())) { it.label })
                                    }
                                    AuswahlFeld(t.land ?: "", opt, onWahl = { einstellen(buildJsonObject { put("land", it) }) },
                                        modifier = Modifier.weight(1f), leer = I18n.t("profile.landNone"))
                                    Spacer(Modifier.width(10.dp))
                                    TeamHerkunftZeichen(t.land, gross = true)
                                }
                                val logoWahl = rememberBildWahl { b, m ->
                                    scope.launch { try { Api.teamLogo(akt, b, m); neuLaden++; gespeichert() } catch (e: Exception) { fehlerZeigen(e) } }
                                }
                                Row(Modifier.padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    TeamWappen(t.name, t.logoUrl, t.farbe, 64.dp)
                                    Spacer(Modifier.width(12.dp))
                                    OutlinedButton(onClick = logoWahl) { Text(I18n.t("team.logoHochladen")) }
                                }
                                BannerBearbeiten(t.bannerUrl, t.bannerFokus, "team.banner",
                                    hochladen = { b, m -> Api.teamBanner(akt, b, m); neuLaden++; gespeichert() },
                                    fokusSetzen = { fk -> Api.teamEinstellen(akt, buildJsonObject { put("banner_fokus", fk) }); neuLaden++ },
                                    entfernen = { Api.teamBannerEntfernen(akt); neuLaden++; gespeichert() },
                                    onFehler = { fehlerZeigen(it) })
                                OutlinedTextField(value = name, onValueChange = { name = it.take(60) }, singleLine = true,
                                    label = { Text(I18n.t("team.name")) }, modifier = Modifier.fillMaxWidth())
                                Spacer(Modifier.height(6.dp))
                                OutlinedTextField(value = neuSlug, singleLine = true, label = { Text(I18n.t("team.adresse")) },
                                    prefix = { Text("pumpfoil.org/teams/", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                                    onValueChange = { v -> neuSlug = v.lowercase().filter { it in 'a'..'z' || it in '0'..'9' || it == '-' }.take(40) },
                                    modifier = Modifier.fillMaxWidth())
                                Text(teamWebUrl("/teams/${t.slug}"), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(top = 4.dp))
                                Text(I18n.t("team.adresseAendernHinweis") + " " + I18n.t("team.adresseTeilen." +
                                        if (t.bestenlistenOeffentlich) "oeffentlich" else if (t.oeffentlich) "wartet" else "intern"),
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
                                OutlinedTextField(value = beschreibung, onValueChange = { beschreibung = it.take(1000) }, minLines = 3,
                                    label = { Text(I18n.t("team.beschreibung")) }, modifier = Modifier.fillMaxWidth())
                                Text(I18n.t("team.farbe"), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp, bottom = 4.dp))
                                // Je Farbton eine Spalte: oben hell, Mitte, unten dunkel (wie im Web); schmal: seitlich wischen.
                                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(4.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TEAM_FARB_SCHLUESSEL.chunked(3).forEach { spalte ->
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            spalte.forEach { fk ->
                                                val tf = teamFarbe(fk)
                                                val an = (t.farbe ?: "cyan") == fk
                                                Box(Modifier.size(32.dp).clip(CircleShape).background(tf.flaeche)
                                                    .then(if (an) Modifier.border(BorderStroke(3.dp, MaterialTheme.colorScheme.onBackground), CircleShape) else Modifier)
                                                    .clickable { einstellen(buildJsonObject { put("farbe", fk) }) })
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                TeamKnopf(I18n.t("common.save"), f, onClick = {
                                    einstellen(buildJsonObject { put("name", name); put("slug", neuSlug); put("beschreibung", beschreibung) })
                                })
                            }

                            VKarte(I18n.t("team.beitritt")) {
                                VSchalter(t.anmeldungenZulassen, { einstellen(buildJsonObject { put("anmeldungen_zulassen", it) }) },
                                    I18n.t("team.anmeldungenZulassen"), I18n.t("team.anmeldungenZulassenText"))
                                VSchalter(t.automatischAkzeptieren, { einstellen(buildJsonObject { put("automatisch_akzeptieren", it) }) },
                                    I18n.t("team.automatischAkzeptieren"), I18n.t("team.automatischAkzeptierenText"))
                            }

                            VKarte(I18n.t("team.sichtbarkeit")) {
                                VSchalter(t.oeffentlich, { einstellen(buildJsonObject { put("oeffentlich", it) }) },
                                    I18n.t("team.oeffentlich"), I18n.t("team.oeffentlichText"))
                                if (t.oeffentlich && t.frei == null) Text(I18n.t("team.oeffentlichErstNachFreigabe"),
                                    style = MaterialTheme.typography.bodyMedium, color = Color(0xFFD97706), modifier = Modifier.padding(bottom = 6.dp))
                                Text(I18n.t("team.mitgliederSichtbar"), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
                                AuswahlFeld(t.mitgliederSichtbar, listOf(Option("mitglieder", I18n.t("team.sichtbar.mitglieder")),
                                    Option("angemeldete", I18n.t("team.sichtbar.angemeldete"))),
                                    onWahl = { einstellen(buildJsonObject { put("mitglieder_sichtbar", it) }) })
                            }

                            VKarte(I18n.t("team.bestenlisten"), I18n.t("team.bestenlistenHinweis")) {
                                val kennzahlOpt = listOf(Option("#b", I18n.t("team.k.best"), kopf = true)) +
                                    KENNZAHLEN_BEST.map { Option(it, kennzahlLabel(it)) } +
                                    Option("#s", I18n.t("team.k.summe"), kopf = true) + KENNZAHLEN_SUMME.map { Option(it, kennzahlLabel(it)) }
                                tafeln.forEachIndexed { i, tf ->
                                    fun aendern(neu: TeamTafel) { tafeln = tafeln.mapIndexed { j, x -> if (j == i) neu else x } }
                                    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(12.dp))
                                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)).padding(8.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            AuswahlFeld(tf.kennzahl, kennzahlOpt, { aendern(tf.copy(kennzahl = it)) }, Modifier.weight(1f))
                                            IconButton(onClick = {
                                                if (i > 0) tafeln = tafeln.toMutableList().also { l -> val x = l[i]; l[i] = l[i - 1]; l[i - 1] = x }
                                            }) { Text("↑") }
                                            IconButton(onClick = {
                                                if (i < tafeln.size - 1) tafeln = tafeln.toMutableList().also { l -> val x = l[i]; l[i] = l[i + 1]; l[i + 1] = x }
                                            }) { Text("↓") }
                                            IconButton(onClick = { tafeln = tafeln.filterIndexed { j, _ -> j != i } }) {
                                                Icon(Icons.Filled.Delete, contentDescription = I18n.t("common.delete"))
                                            }
                                        }
                                        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            AuswahlFeld(tf.sportart, sportOptionen(listen.sports), { aendern(tf.copy(sportart = it)) }, Modifier.weight(1f))
                                            AuswahlFeld(tf.foilBand, bandOptionen(listen.bands), { aendern(tf.copy(foilBand = it)) }, Modifier.weight(1f))
                                        }
                                        FlowRow {
                                            Haken(tf.accelOnly, I18n.t("team.tafel.nurBewegung"), { aendern(tf.copy(accelOnly = it)) })
                                            Haken(tf.nurBrett, I18n.t("team.tafel.nurBrett"), { aendern(tf.copy(nurBrett = it)) })
                                            Haken(tf.nurTeamspots, I18n.t("team.tafel.nurTeamspots"), { aendern(tf.copy(nurTeamspots = it)) })
                                        }
                                    }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(enabled = tafeln.size < 20, onClick = { tafeln = tafeln + TeamTafel(kennzahl = "session_pumps") }) {
                                        Text("+ " + I18n.t("team.tafel.neu"))
                                    }
                                    TeamKnopf(I18n.t("common.save"), f, onClick = {
                                        scope.launch {
                                            try { tafeln = Api.teamTafelnSetzen(akt, tafeln).map { it.copy(zeilen = emptyList()) }; gespeichert() }
                                            catch (e: Exception) { fehlerZeigen(e) }
                                        }
                                    })
                                }
                            }

                            VKarte(I18n.t("team.spots"), I18n.t("team.spotsHinweis")) {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    t.spots.forEach { s ->
                                        Row(Modifier.clip(RoundedCornerShape(50)).background(f.leicht).padding(start = 12.dp, end = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically) {
                                            Text(s.name ?: "#${s.id}", style = MaterialTheme.typography.bodyMedium)
                                            IconButton(onClick = {
                                                scope.launch {
                                                    try { Api.teamSpotsSetzen(akt, t.spots.filter { it.id != s.id }.map { it.id }); neuLaden++ }
                                                    catch (e: Exception) { fehlerZeigen(e) }
                                                }
                                            }, modifier = Modifier.size(32.dp)) { Icon(Icons.Filled.Close, I18n.t("common.delete"), Modifier.size(16.dp)) }
                                        }
                                    }
                                    if (t.spots.isEmpty()) Text("—", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    AuswahlFeld(spotWahl, listen.spots.filter { (id, _) -> t.spots.none { it.id == id } }.map { (id, n) -> Option(id.toString(), n) },
                                        { spotWahl = it }, Modifier.weight(1f), leer = I18n.t("team.spotWaehlen"))
                                    Spacer(Modifier.width(8.dp))
                                    OutlinedButton(enabled = spotWahl.isNotEmpty(), onClick = {
                                        scope.launch {
                                            try { Api.teamSpotsSetzen(akt, t.spots.map { it.id } + spotWahl.toInt()); spotWahl = ""; neuLaden++ }
                                            catch (e: Exception) { fehlerZeigen(e) }
                                        }
                                    }) { Text("+ " + I18n.t("team.spotHinzu")) }
                                }
                            }

                            VKarte(I18n.t("team.loeschen"), titelFarbe = MaterialTheme.colorScheme.error) {
                                Text(I18n.t("team.loeschenText").replace("{name}", t.name), style = MaterialTheme.typography.bodyMedium)
                                OutlinedTextField(value = loeschName, onValueChange = { loeschName = it }, singleLine = true,
                                    placeholder = { Text(t.name) }, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
                                Button(enabled = loeschName.trim().lowercase() == t.name.lowercase(),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                                    onClick = {
                                        scope.launch { try { Api.teamLoeschen(akt, loeschName); onGeloescht() } catch (e: Exception) { fehlerZeigen(e) } }
                                    }) { Text(I18n.t("team.loeschenKnopf")) }
                            }
                        }

                        TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams/regeln")) } }) {
                            Text(I18n.t("team.regeln.link") + " ↗")
                        }
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }

    frage?.let { fr ->
        AlertDialog(
            onDismissRequest = { frage = null },
            text = { Text(fr.text, style = MaterialTheme.typography.bodyLarge) },
            confirmButton = { TextButton(onClick = { frage = null; fr.tun() }) { Text(fr.knopf) } },
            dismissButton = { TextButton(onClick = { frage = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
}

/** Rueckfrage vor einer Aktion (statt window.confirm im Web): Text, Beschriftung des Knopfs, Aktion. */
private class Frage(val text: String, val knopf: String, val tun: () -> Unit)

/** Wo und was jemand bisher gefahren ist, beim Pruefen einer Anfrage (Web `AnfrageProfil`). */
@Composable
private fun AnfrageProfil(p: TeamAnfrageProfil) {
    val st = MaterialTheme.typography.bodySmall
    val farbe = MaterialTheme.colorScheme.onSurfaceVariant
    if (p.sessions == 0) { Text(I18n.t("team.anfrage.keine"), style = st, color = farbe); return }
    Text(I18n.t("team.anfrage.sessions").replace("{n}", p.sessions.toString()) + " · " +
            p.sportarten.joinToString(", ") { "${I18n.t("cls.sport.${it.sport}")} ${it.n}" }, style = st, color = farbe)
    if (p.spots.isNotEmpty()) Text(I18n.t("team.anfrage.spots") + ": " + p.spots.joinToString(", ") { "${it.name} (${it.n})" }, style = st, color = farbe)
}

// --------------------------------------------------------------------------------- Events ----
// Wie web/src/components/TeamEventsVerwalten.tsx + lib/teamEvents.ts (Vorlagen, Zeitfenster). Zeiten gelten in der
// Zeitzone des Handys; die wird mitgespeichert, damit „Samstag 0 Uhr" fuer alle derselbe Zeitpunkt bleibt.

private data class EventEntwurf(
    val id: Int? = null,
    val eingefroren: Boolean = false,
    val bannerUrl: String? = null,
    val bannerFokus: String? = null,
    val ohneDateien: Boolean = false,
    val teambildZeigen: Boolean = true,
    val summen: List<String> = emptyList(),
    val summenSportart: String = "pumpfoil",
    val summenAccelOnly: Boolean = false,
    val titel: String = "",
    val beschreibung: String = "",
    val start: LocalDateTime,
    val ende: LocalDateTime,
    val tafeln: List<TeamTafel>,
    val spotIds: List<Int> = emptyList(),
    val vorlage: String? = null,
    // Globales Event (06.11.2026, nur im offiziellen Team) und Teamwertung: beste N, 0 = alle (null = Server-Standard 5).
    val globalEvent: Boolean = false,
    val teamWertungN: Int? = null,
)

/** Naechster Samstag 00:00 bis Montag 00:00 (heute Samstag: der naechste) bzw. dieser Monat (Web wochenende/monat). */
private fun wochenende(): Pair<LocalDateTime, LocalDateTime> {
    val sa = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.SATURDAY)).atStartOfDay()
    return sa to sa.plusDays(2)
}
private fun monat(): Pair<LocalDateTime, LocalDateTime> {
    val a = LocalDate.now().withDayOfMonth(1).atStartOfDay()
    return a to a.plusMonths(1)
}

private class EventVorlage(val key: String, val kennzahl: String, val zeit: () -> Pair<LocalDateTime, LocalDateTime>) {
    val titelKey get() = "team.vorlage.$key"
}
private val EVENT_VORLAGEN = listOf(
    EventVorlage("wochenende_pumps", "sum_pumps", ::wochenende),
    EventVorlage("wochenende_laeufe", "sum_runs", ::wochenende),
    EventVorlage("laengster_lauf", "duration", ::wochenende),
    EventVorlage("weitester_lauf", "distance", ::wochenende),
    EventVorlage("top_speed", "speed", ::wochenende),
    EventVorlage("session_pumps", "session_pumps", ::wochenende),
    EventVorlage("monat_strecke", "sum_distance", ::monat),
)

private fun neueEventTafel() = TeamTafel(kennzahl = "session_pumps")

private fun leererEntwurf(): EventEntwurf {
    val (a, b) = wochenende()
    return EventEntwurf(start = a, ende = b, tafeln = listOf(neueEventTafel()))
}

private fun lokal(iso: String): LocalDateTime =
    isoInstant(iso)?.atZone(ZoneId.systemDefault())?.toLocalDateTime() ?: LocalDateTime.now().withSecond(0).withNano(0)

private fun entwurfAus(ev: TeamEvent) = EventEntwurf(
    id = ev.id, eingefroren = ev.status == "beendet", bannerUrl = ev.bannerUrl, bannerFokus = ev.bannerFokus,
    ohneDateien = ev.ohneDateien, teambildZeigen = ev.teambildZeigen, summen = ev.summenAuswahl, summenSportart = ev.summenSportart,
    summenAccelOnly = ev.summenAccelOnly, titel = ev.titel, beschreibung = ev.beschreibung ?: "", start = lokal(ev.start), ende = lokal(ev.ende),
    // Gemischte Bestenlisten (Pumpfoil + Foil Scoot) leitet der Server selbst ab — nicht als eigene Tafel speichern (wie Web).
    spotIds = ev.spotIds, vorlage = ev.vorlage, tafeln = ev.tafeln.filter { '+' !in it.sportart }.map { it.copy(zeilen = emptyList(), id = null,
        nurTeamspots = false, teams = null, eigene = null, stand = null) },
    globalEvent = ev.global, teamWertungN = ev.teamWertungN ?: 5,
)

private fun eventKoerper(e: EventEntwurf, offiziell: Boolean): JsonObject = buildJsonObject {
    val zone = ZoneId.systemDefault()
    put("titel", e.titel.trim())
    if (e.beschreibung.isBlank()) put("beschreibung", JsonNull) else put("beschreibung", e.beschreibung.trim())
    put("start", e.start.atZone(zone).toInstant().toString())
    put("ende", e.ende.atZone(zone).toInstant().toString())
    put("zeitzone", zone.id)
    put("tafeln", buildJsonArray {
        e.tafeln.forEach { t ->
            add(buildJsonObject {
                put("kennzahl", t.kennzahl); put("sportart", t.sportart); put("accel_only", t.accelOnly)
                put("nur_brett", t.nurBrett); put("foil_band", t.foilBand)
            })
        }
    })
    put("spot_ids", buildJsonArray { e.spotIds.forEach { add(it) } })
    if (e.vorlage == null) put("vorlage", JsonNull) else put("vorlage", e.vorlage)
    put("ohne_dateien", e.ohneDateien)
    put("teambild_zeigen", e.teambildZeigen)
    put("summen", buildJsonArray { e.summen.forEach { add(it) } })
    put("summen_sportart", e.summenSportart)
    put("summen_accel_only", e.summenAccelOnly)
    // Wie Web TeamEventsVerwalten: der Haken zaehlt nur im offiziellen Team (der Server prueft es ebenfalls).
    put("global_event", offiziell && e.globalEvent)
    if (e.teamWertungN == null) put("team_wertung_n", JsonNull) else put("team_wertung_n", e.teamWertungN)
}

/** Events eines Teams in der Verwaltung: Liste mit Stand und Zeitfenster, „Bearbeiten" und „Neues Event" (Popup). */
@Composable
private fun TeamEventsVerwaltenKarte(slug: String, farbe: String?, listen: VerwaltungsListen, onMeldung: (String) -> Unit,
                                     offiziell: Boolean = false) {
    var liste by remember(slug) { mutableStateOf<List<TeamEvent>>(emptyList()) }
    var neuLaden by remember { mutableIntStateOf(0) }
    var entwurf by remember { mutableStateOf<EventEntwurf?>(null) }
    LaunchedEffect(slug, neuLaden) { liste = runCatching { Api.teamEvents(slug) }.getOrDefault(liste) }
    val f = teamFarbe(farbe)
    VKarte(I18n.t("team.events")) {
        liste.forEachIndexed { i, ev ->
            if (i > 0) HorizontalDivider()
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(ev.titel, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(I18n.t("team.event.status.${ev.status}") + " · " + eventZeitraum(ev.start, ev.ende, ev.zeitzone),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                // Loeschen nur im Popup (wie im Web); eingefrorene Events oeffnen es nur noch zum Loeschen.
                OutlinedButton(onClick = { entwurf = entwurfAus(ev) }) { Text(I18n.t("team.event.bearbeiten")) }
            }
        }
        Spacer(Modifier.height(8.dp))
        TeamKnopf("+ " + I18n.t("team.event.neu"), f, onClick = { entwurf = leererEntwurf() })
    }
    entwurf?.let { e ->
        TeamEventDialog(slug, farbe, e, listen, offiziell,
            onZu = { entwurf = null },
            onGeaendert = { neuLaden++ },
            onMeldung = onMeldung)
    }
}

/**
 * Zahnrad der Event-Seite (Web TeamEventSeite: dasselbe Popup wie in der Verwaltung). Laedt Sportarten, Foil-Baender und
 * Spots selbst; `onZu` nach Schliessen, Speichern oder Loeschen (die Seite laedt das Event dann neu).
 */
@Composable
fun TeamEventBearbeitenDialog(slug: String, farbe: String?, ev: TeamEvent, onZu: () -> Unit, offiziell: Boolean = false) {
    var listen by remember { mutableStateOf<VerwaltungsListen?>(null) }
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { listen = verwaltungsListenLaden() }
    val l = listen ?: return
    TeamEventDialog(slug, farbe, entwurfAus(ev), l, offiziell, onZu = onZu, onGeaendert = {},
        onMeldung = { android.widget.Toast.makeText(ctx, it, android.widget.Toast.LENGTH_SHORT).show() })
}

/** Datum + Uhrzeit waehlen (statt <input type="datetime-local">): erst der Kalender, dann die Uhr des Systems. */
@Composable
private fun DatumZeitFeld(label: String, wert: LocalDateTime, onWert: (LocalDateTime) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val fmt = remember(I18n.lang) { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(verwaltungLocale()) }
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(modifier = Modifier.fillMaxWidth(), onClick = {
            android.app.DatePickerDialog(ctx, { _, y, m, d ->
                android.app.TimePickerDialog(ctx, { _, h, min -> onWert(LocalDateTime.of(y, m + 1, d, h, min)) },
                    wert.hour, wert.minute, android.text.format.DateFormat.is24HourFormat(ctx)).show()
            }, wert.year, wert.monthValue - 1, wert.dayOfMonth).show()
        }) { Text(runCatching { wert.format(fmt) }.getOrDefault(wert.toString()), maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
}

/**
 * Event anlegen/aendern (Web TeamEventsVerwalten-Popup). Ein Tippen daneben schliesst NICHT — sonst waeren halb
 * eingegebene Events weg; zu geht es nur ueber Speichern oder Abbrechen. Fehler beim Speichern stehen im Popup.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TeamEventDialog(slug: String, farbe: String?, start: EventEntwurf, listen: VerwaltungsListen, offiziell: Boolean,
                            onZu: () -> Unit, onGeaendert: () -> Unit, onMeldung: (String) -> Unit) {
    var e by remember(start.id) { mutableStateOf(start) }
    var fehler by remember { mutableStateOf<String?>(null) }
    var spotWahl by remember { mutableStateOf("") }
    var loeschFrage by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val f = teamFarbe(farbe)
    val sportOpt = sportOptionen(listen.sports)
    val bandOpt = bandOptionen(listen.bands)
    fun spotName(id: Int) = listen.spots.firstOrNull { it.first == id }?.second ?: "#$id"

    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)) {
        Card(Modifier.fillMaxWidth(0.94f).heightIn(max = 760.dp)) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                Text(if (e.id != null) "${I18n.t("team.event.bearbeiten")}: ${e.titel}" else I18n.t("team.event.neu"),
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
                if (e.eingefroren) {
                    Text(e.titel, fontWeight = FontWeight.Medium)
                    Text(I18n.t("team.err.event_eingefroren"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 12.dp))
                } else {
                    if (e.id == null) {
                        Text(I18n.t("team.event.vorlage"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AuswahlFeld(e.vorlage ?: "", listOf(Option("", I18n.t("team.event.ohneVorlage"))) +
                                EVENT_VORLAGEN.map { Option(it.key, I18n.t(it.titelKey)) },
                            onWahl = { k ->
                                val v = EVENT_VORLAGEN.firstOrNull { it.key == k } ?: return@AuswahlFeld
                                val (a, b) = v.zeit()
                                e = e.copy(vorlage = v.key, titel = I18n.t(v.titelKey), tafeln = listOf(TeamTafel(kennzahl = v.kennzahl)), start = a, ende = b)
                            }, modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp))
                    }
                    // Eventbild erst bei einem gespeicherten Event — der Upload braucht dessen id.
                    e.id?.let { id ->
                        BannerBearbeiten(e.bannerUrl, e.bannerFokus, "team.eventbild",
                            hochladen = { b, m ->
                                val (u, fk) = Api.teamEventBanner(slug, id, b, m)
                                e = e.copy(bannerUrl = u, bannerFokus = fk); onGeaendert()
                            },
                            fokusSetzen = { fk -> Api.teamEventBannerFokus(slug, id, fk); e = e.copy(bannerFokus = fk); onGeaendert() },
                            entfernen = { Api.teamEventBannerEntfernen(slug, id); e = e.copy(bannerUrl = null); onGeaendert() },
                            onFehler = { fehler = teamFehlerText(it) })
                    }
                    // Ohne eigenes Eventbild: Teambild zeigen (Standard an).
                    if (e.bannerUrl == null) Haken(e.teambildZeigen, I18n.t("team.event.teambildZeigen"), { e = e.copy(teambildZeigen = it) })
                    // Globales Event (Web 06.11.2026): nur im offiziellen Team. Jeder mit passenden Sessions nimmt teil,
                    // dazu eine Team-Rangliste aus den besten N Mitgliedern jedes Teams.
                    if (offiziell) {
                        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
                            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.30f), RoundedCornerShape(12.dp)).padding(8.dp)) {
                            Haken(e.globalEvent, I18n.t("team.event.globalHaken"), { e = e.copy(globalEvent = it) })
                            if (e.globalEvent) {
                                Text(I18n.t("team.event.wertung"), style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(top = 4.dp))
                                AuswahlFeld((e.teamWertungN ?: 5).toString(),
                                    listOf(3, 5, 10).map { Option(it.toString(), I18n.t("team.event.wertungBeste").replace("{n}", it.toString())) } +
                                        Option("0", I18n.t("team.event.wertungAlle")),
                                    onWahl = { e = e.copy(teamWertungN = it.toIntOrNull() ?: 5) }, modifier = Modifier.fillMaxWidth())
                            }
                        }
                    }
                    OutlinedTextField(value = e.titel, onValueChange = { e = e.copy(titel = it.take(80)) }, singleLine = true,
                        label = { Text(I18n.t("team.event.titel")) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                    Row(Modifier.padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DatumZeitFeld(I18n.t("team.event.start"), e.start, { e = e.copy(start = it) }, Modifier.weight(1f))
                        DatumZeitFeld(I18n.t("team.event.ende"), e.ende, { e = e.copy(ende = it) }, Modifier.weight(1f))
                    }
                    OutlinedTextField(value = e.beschreibung, onValueChange = { e = e.copy(beschreibung = it.take(1000)) }, minLines = 2,
                        label = { Text(I18n.t("team.beschreibung")) }, modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp))

                    Text(I18n.t("team.bestenlisten"), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    e.tafeln.forEachIndexed { i, tf ->
                        fun aendern(neu: TeamTafel) { e = e.copy(tafeln = e.tafeln.mapIndexed { j, x -> if (j == i) neu else x }) }
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(12.dp))
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)).padding(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                // Events messen auch die fliegenden Sprints (Web EVENT_KENNZAHLEN), die festen Team-Bestenlisten nicht.
                                AuswahlFeld(tf.kennzahl, (KENNZAHLEN_BEST + KENNZAHLEN_SUMME + KENNZAHLEN_SPRINT).map { Option(it, kennzahlLabel(it)) },
                                    { aendern(tf.copy(kennzahl = it)) }, Modifier.weight(1f))
                                // Auch die letzte darf weg, wenn Gesamtsummen gewaehlt sind (Event nur mit Summen).
                                if (e.tafeln.size > 1 || e.summen.isNotEmpty()) IconButton(onClick = {
                                    e = e.copy(tafeln = e.tafeln.filterIndexed { j, _ -> j != i })
                                }) { Icon(Icons.Filled.Delete, contentDescription = I18n.t("common.delete")) }
                            }
                            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                AuswahlFeld(tf.sportart, sportOpt, { aendern(tf.copy(sportart = it)) }, Modifier.weight(1f))
                                AuswahlFeld(tf.foilBand, bandOpt, { aendern(tf.copy(foilBand = it)) }, Modifier.weight(1f))
                            }
                            FlowRow {
                                Haken(tf.accelOnly, I18n.t("team.tafel.nurBewegung"), { aendern(tf.copy(accelOnly = it)) })
                                Haken(tf.nurBrett, I18n.t("team.tafel.nurBrett"), { aendern(tf.copy(nurBrett = it)) })
                            }
                        }
                    }
                    if (e.tafeln.size < 10) OutlinedButton(onClick = { e = e.copy(tafeln = e.tafeln + neueEventTafel()) },
                        modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)) { Text("+ " + I18n.t("team.tafel.neu")) }

                    // Gesamtsummen ueber alle Teilnehmer, einzeln anklickbar.
                    Text(I18n.t("team.event.summen"), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    Text(I18n.t("team.event.summenHinweis"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FlowRow(Modifier.padding(bottom = 6.dp)) {
                        EVENT_SUMMEN.forEach { (k, lk, _) ->
                            val an = k in e.summen
                            Haken(an, I18n.t(lk), { neu -> e = e.copy(summen = if (neu) e.summen + k else e.summen - k) },
                                enabled = !(e.tafeln.isEmpty() && e.summen.size == 1 && an))
                        }
                    }
                    if (e.tafeln.isEmpty()) {
                        // Ohne Bestenliste fehlen Sportart und Bewegungsdaten fuer die Summen — darum hier einstellbar.
                        Row(Modifier.padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            AuswahlFeld(e.summenSportart, sportOpt, { e = e.copy(summenSportart = it) }, Modifier.weight(1f))
                            Haken(e.summenAccelOnly, I18n.t("team.tafel.nurBewegung"), { e = e.copy(summenAccelOnly = it) })
                        }
                    }

                    Text(I18n.t("team.event.spots"), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    FlowRow(Modifier.padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        e.spotIds.forEach { id ->
                            Row(Modifier.clip(RoundedCornerShape(50)).background(f.leicht).padding(start = 12.dp, end = 4.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                Text(spotName(id), style = MaterialTheme.typography.bodyMedium)
                                IconButton(onClick = { e = e.copy(spotIds = e.spotIds - id) }, modifier = Modifier.size(32.dp)) {
                                    Icon(Icons.Filled.Close, I18n.t("common.delete"), Modifier.size(16.dp))
                                }
                            }
                        }
                        if (e.spotIds.isEmpty()) Text(I18n.t("team.event.alleSpots"), style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(Modifier.padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        AuswahlFeld(spotWahl, listen.spots.filter { it.first !in e.spotIds }.map { (id, n) -> Option(id.toString(), n) },
                            { spotWahl = it }, Modifier.weight(1f), leer = I18n.t("team.spotWaehlen"))
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(enabled = spotWahl.isNotEmpty(), onClick = {
                            e = e.copy(spotIds = e.spotIds + spotWahl.toInt()); spotWahl = ""
                        }) { Text("+ " + I18n.t("team.spotHinzu")) }
                    }
                    Haken(e.ohneDateien, I18n.t("team.event.ohneDateien"), { e = e.copy(ohneDateien = it) })
                }
                fehler?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.1f)).padding(10.dp))
                }
                FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!e.eingefroren) TeamKnopf(I18n.t(if (e.id != null) "common.save" else "team.event.anlegen"), f,
                        enabled = !busy && e.titel.trim().length >= 2 && (e.tafeln.isNotEmpty() || e.summen.isNotEmpty()),
                        onClick = {
                            busy = true; fehler = null
                            scope.launch {
                                try {
                                    val id = e.id
                                    if (id != null) Api.teamEventAendern(slug, id, eventKoerper(e, offiziell)) else Api.teamEventAnlegen(slug, eventKoerper(e, offiziell))
                                    onGeaendert(); onMeldung(I18n.t("team.gespeichert")); onZu()
                                } catch (x: Exception) { fehler = teamFehlerText(x) }
                                busy = false
                            }
                        })
                    OutlinedButton(onClick = onZu) { Text(I18n.t("common.cancel")) }
                    if (e.id != null && !e.eingefroren) TextButton(onClick = { loeschFrage = true }) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(I18n.t("common.delete"), color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
    if (loeschFrage) {
        AlertDialog(
            onDismissRequest = { loeschFrage = false },
            text = { Text(I18n.t("team.event.loeschenFrage").replace("{titel}", e.titel), style = MaterialTheme.typography.bodyLarge) },
            confirmButton = {
                TextButton(onClick = {
                    loeschFrage = false
                    val id = e.id ?: return@TextButton
                    scope.launch {
                        try { Api.teamEventLoeschen(slug, id); onGeaendert(); onZu() }
                        catch (x: Exception) { fehler = teamFehlerText(x) }
                    }
                }) { Text(I18n.t("common.delete"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { loeschFrage = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
}
