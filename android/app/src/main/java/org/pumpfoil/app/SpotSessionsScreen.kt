package org.pumpfoil.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.key
import androidx.compose.ui.unit.Dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import kotlinx.coroutines.launch
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

// Sessions eines Spots (Tippen auf einen Pin/Eintrag in den Spots) — reiche Karten wie der Feed.
// Seit dem App-Port (docs/UX-IA.md, Phase 9, 04.11.2026) mit Reitern wie die Spot-Seite im Web: Rekorde · Sessions ·
// Heatmap · Wetter · Beschreibungen. Der Inhalt steckt in `SpotReiterBereich`, den Home › Spots mitbenutzt.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpotSessionsScreen(spot: String, onBack: () -> Unit, onOpen: (Int) -> Unit, onSpotChat: (String) -> Unit = {}, social: Boolean = true,
                       sport0: String = "all", routeId: Int? = null) {
    // Zweite Zeile zum Spot (Gewaesser bzw. Steg/Ortslage) — meldet der Bereich, sobald er die Karte kennt.
    var spotLabel by remember(spot) { mutableStateOf<String?>(null) }
    var laedt by remember { mutableStateOf(false) }
    var neuLaden by remember(spot) { mutableStateOf(0) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("📍 $spot" + (spotLabel?.let { " · $it" } ?: ""), maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back"))
                    }
                },
                actions = {
                    // Spot-Chat (scope "spot:<name>", wie PWA/iOS) — bei Age-Gate (social=false) aus.
                    if (social) IconButton(onClick = { onSpotChat(spot) }) {
                        Icon(Icons.Filled.Forum, contentDescription = I18n.t("nav.chat"), tint = MaterialTheme.colorScheme.primary)
                    }
                    FeedbackKnopf()   // ganz rechts, wie auf den Haupt-Tabs
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = laedt, onRefresh = { neuLaden++ }) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 4.dp)) {
                    SpotReiterBereich(spot, onOpen, sport0 = sport0, routeId = routeId, rand = 12.dp, neuLaden = neuLaden,
                        onLaden = { laedt = it }, onLabel = { spotLabel = it })
                    Spacer(Modifier.height(16.dp))
                }
            }
        }
    }
}

/**
 * Inhalt eines Spots mit seinen Reitern (Web `SpotBereich` in Sessions.tsx): Spot-Seite und Home › Spots zeigen DENSELBEN
 * Inhalt, nur die Kopfzeile ist eine andere (`kopf`, steht UNTER der Reiterzeile wie im Web). Kein LazyColumn, damit er
 * in eine scrollende Seite passt (Home); die Sessions der ersten Seite (hoechstens 50) stehen als einfache Liste darin.
 *
 * `rand` = seitlicher Abstand der Bloecke, die keinen eigenen haben (Spot-Seite 12 dp, auf Home hat die Seite ihn schon).
 */
@Composable
fun SpotReiterBereich(spot: String, onOpen: (Int) -> Unit, sport0: String = "all", routeId: Int? = null,
                      rand: Dp = 0.dp, kopf: (@Composable () -> Unit)? = null, neuLaden: Int = 0,
                      onLaden: (Boolean) -> Unit = {}, onLabel: (String?) -> Unit = {}) {
    // Sportart-Filter (27.09.2026, wie `/sessions?spot=…&sport=…` in der PWA): kommt von der
    // Spot-Karte mit, damit Etikett (Zahl am Marker) und Klickziel dieselbe Menge meinen; hier
    // wieder umstellbar, „Alle Sportarten" bleibt immer waehlbar. Default „all".
    var sport by remember(spot, sport0) { mutableStateOf(sport0.ifBlank { "all" }) }
    // Sportarten DIESES Spots fuer die Filter-Knoepfe (28.10.2026, s. SpotSportKnoepfe).
    var spotSports by remember(spot) { mutableStateOf<List<String>>(emptyList()) }
    LaunchedEffect(spot) { spotSports = try { Api.communitySports(spot).map { it.sport } } catch (_: Exception) { emptyList() } }
    var items by remember(spot) { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Automatik „Spot ohne eine einzige Session mit Beschleunigungsdaten": statt einer leeren Liste
    // einmal mit accel_only=false nachfragen und dann alle zeigen. Beide Werte hängen an `spot` ->
    // beim Spot-Wechsel/Verlassen ist das wieder weg (NICHT gemerkt), es gilt wieder der Default.
    var showAll by remember(spot) { mutableStateOf(false) }
    var autoTried by remember(spot) { mutableStateOf(false) }
    // Spot-Beschreibungen haengen an der spot_id, hierher kommt aber nur der NAME (die Navigation
    // ist namensbasiert). Einmal die Karte holen und zuordnen; ohne Spot-Zeile (Altbestand) bleibt
    // es null und der Abschnitt entfaellt.
    var spotId by remember(spot) { mutableStateOf<Int?>(null) }
    var weather by remember(spot) { mutableStateOf<SpotWeather?>(null) }
    var wetterGeladen by remember(spot) { mutableStateOf(false) }
    // Lage des Spots fuer „Heatmap & Routen" (SpotHeatmapPanel)
    var spotOrt by remember(spot) { mutableStateOf<Pair<Double, Double>?>(null) }
    // Bis die Karte da ist, steht noch nicht fest, ob es Heatmap und Beschreibungen gibt — so lange bleibt ein gemerkter
    // Reiter (etwa beim Spotwechsel auf Home) stehen, statt auf „Rekorde" zurueckzufallen.
    var karteGeladen by remember(spot) { mutableStateOf(false) }
    // Sportart von Rekorden und Heatmap = der Filter, „Alle" zaehlt alle Sportarten am Spot zusammen (Web 1eec9e07).
    val rekordSport = rekordSportFuer(sport, spotSports)
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val heatZustand = remember(spotId) { spotId?.let { SpotPanelZustand(ctx, it) } }
    LaunchedEffect(spot) {
        weather = try { Api.spotWeather(spot) } catch (_: Exception) { null }
        wetterGeladen = true
        try {
            val m = Api.spotMap(accelOnly = false).firstOrNull { it.spot == spot }
            spotId = m?.spotId
            spotOrt = m?.let { it.lat to it.lon }?.takeIf { it.first != 0.0 || it.second != 0.0 }
            onLabel(m?.water?.takeIf { it.isNotBlank() && !it.equals(spot, ignoreCase = true) })
        } catch (_: Exception) { /* offline -> Titel ohne Zusatz */ }
        karteGeladen = true
    }

    // Spot-Liste seitenweise (Seite = 50 wie der Server-Standard), weitere per Knopf (s. unten). Neu laden holt so viele,
    // wie schon da sind.
    val spotSeite = 50
    var spotHatMehr by remember(spot) { mutableStateOf(true) }
    var spotMehrLaedt by remember(spot) { mutableStateOf(false) }
    val spotScope = androidx.compose.runtime.rememberCoroutineScope()
    var spotNurAccel by remember(spot) { mutableStateOf(false) }   // Filter der geladenen Seiten (Folgeseiten genauso)
    suspend fun mehrSpot() {
        spotMehrLaedt = true
        try {
            val r = Api.spotSessions(spot, accelOnly = spotNurAccel, sport = sport, limit = spotSeite, offset = items.size)
            val da = items.map { it.id }.toSet()
            items = items + r.filter { it.id !in da }; spotHatMehr = r.size >= spotSeite
        } catch (_: Exception) {}
        spotMehrLaedt = false
    }

    suspend fun load() {
        loading = true; onLaden(true)
        try {
            // Default wie die PWA (useAccelDefault): seit 31.08. IMMER „alle", auch wenn der
            // Nutzer selbst Accel-Läufe hat — s. AccelDefault.kt.
            val only = if (showAll) false else AccelDefault.preferred()
            // Ohne `sport` galt der Endpunkt-Default „pumpfoil" — die Liste zeigte damit weniger,
            // als die Spot-Karte (sport=all) zaehlte. Jetzt immer die gewaehlte Sportart.
            val n = maxOf(spotSeite, items.size)
            var rows = Api.spotSessions(spot, accelOnly = only, sport = sport, limit = n)
            var nurAccel = only
            // Frueher griff das NUR bei einer komplett leeren Liste, und genau daran ist am 29.08. ein
            // Nutzer haengen geblieben: die Spot-Karte sagte „Meerkerk · 14“, nach dem Klick standen dort
            // seine eigenen drei. Die anderen elf sind ohne verwertbare Beschleunigungsdaten aufgenommen
            // (detection = gps_only) — die Karte zaehlt mit accel_only=false, die Liste filterte mit true.
            // Die Liste war also nicht leer, nur kuerzer als das Etikett versprach; auf 0 zu pruefen reicht
            // nicht. Verglichen wird jetzt die erste Seite gegen „alle“.
            if (only && !autoTried) {
                autoTried = true
                val all = Api.spotSessions(spot, accelOnly = false, sport = sport, limit = n)
                if (all.size > rows.size) { showAll = true; rows = all; nurAccel = false }
            }
            items = rows; spotHatMehr = rows.size >= n; spotNurAccel = nurAccel
            // „Älter/neuer" im Detail soll an DIESEM Spot bleiben, über alle Fahrer — mit
            // demselben Accel-Filter, den diese Liste gerade zeigt (Jan, 17.09.2026).
            NachbarFilter.merken(NachbarFilter(scope = "all", spot = spot, sport = sport,
                                               accelOnly = only && !showAll))
            error = null
        } catch (e: Exception) { error = e.message }
        loading = false; onLaden(false)
    }
    // Sportart-Wechsel: die alte Liste sofort weg, nicht erst, wenn die neue da ist.
    LaunchedEffect(spot, sport) { items = emptyList(); load() }
    // Ziehen zum Aktualisieren auf der Spot-Seite (zaehlt dort hoch).
    LaunchedEffect(neuLaden) { if (neuLaden > 0) load() }

    // Reiter wie im Web (Rekorde · Sessions · Heatmap · Wetter · Beschreibungen). Heatmap und Beschreibungen haengen an
    // der spot_id — ohne Spot-Zeile (Altbestand) fehlen sie, wie im Web bei einem Spot ohne Nummer.
    val echt = spotId != null
    val reiter = listOfNotNull(
        ReiterDef("rekorde", I18n.t("side.records")),
        ReiterDef("sessions", I18n.t("sessions.title")),
        if (echt && spotOrt != null) ReiterDef("heatmap", I18n.t("spots.heatmap")) else null,
        ReiterDef("wetter", I18n.t("tab.weather")),
        if (echt) ReiterDef("beschreibungen", I18n.t("tab.descriptions")) else null,
    )
    var tab by rememberReiter("spot", if (karteGeladen) reiter.map { it.id }
                                      else listOf("rekorde", "sessions", "heatmap", "wetter", "beschreibungen"), "rekorde")
    // Gemerkte Route aus der Liste der Routen: direkt die Heatmap mit dieser Route oeffnen.
    var routeErledigt by remember(spot) { mutableStateOf(false) }
    LaunchedEffect(routeId, spotId, spotOrt) {
        if (routeId != null && !routeErledigt && spotId != null && spotOrt != null) { tab = "heatmap"; routeErledigt = true }
    }

    Column(Modifier.fillMaxWidth()) {
        Reiterleiste(reiter, tab, { tab = it })
        kopf?.invoke()
        Spacer(Modifier.height(4.dp))
        // Sportart-Knoepfe = Filter fuer Rekorde, Sessions und Heatmap (Jan, 28.10.2026); bei Wetter und
        // Beschreibungen haetten sie keine Wirkung und fallen weg.
        if (tab in setOf("rekorde", "sessions", "heatmap")) {
            SpotSportKnoepfe(spotSports, sport, { sport = it }, Modifier.fillMaxWidth().padding(horizontal = rand, vertical = 4.dp))
        }
        when (tab) {
            "rekorde" -> {
                val rs = rekordSport
                if (rs != null) SpotRecordsSection(spot, accelOnly = false, sport = rs, onOpen = onOpen)
                else Text(I18n.t("records.empty"), Modifier.padding(horizontal = rand, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            "sessions" -> {
                // Rechts der Umschalter Kacheln / Zeilen (ListenAnsicht.kt) — eine Werkzeugzeile wie im Web.
                Row(Modifier.fillMaxWidth().padding(horizontal = rand, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.weight(1f))
                    ListenAnsichtUmschalter()
                }
                error?.let { e -> Text(e, Modifier.padding(horizontal = rand, vertical = 8.dp), color = MaterialTheme.colorScheme.error) }
                if (loading && items.isEmpty()) {
                    Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                } else if (items.isEmpty() && error == null) {
                    Text(I18n.t("sessions.empty"), Modifier.padding(horizontal = rand, vertical = 8.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items.forEach { c ->
                    CommunityItemRow(c, Modifier.padding(horizontal = rand, vertical = ListenAnsicht.abstand)) { onOpen(c.id) }
                }
                // Mehr als die erste Seite (06.11.2026, vorher war nach 50 Schluss). Knopf statt automatisch: die Liste steckt
                // in einer normal scrollenden Seite, ein Listenende waere sofort „sichtbar" und alles kaeme auf einmal.
                if (items.size >= spotSeite && spotHatMehr) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = { spotScope.launch { mehrSpot() } }, enabled = !spotMehrLaedt,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = rand, vertical = 8.dp),
                    ) { Text(I18n.t("sessions.loadMore")) }
                }
            }
            "heatmap" -> {
                val sid0 = spotId; val ort = spotOrt
                if (sid0 != null && ort != null) key("heatmap-$sid0") {
                    // Sportart wie der Rekord-Kasten (Jan, 28.10.2026); ohne Rekorde „alle".
                    SpotHeatmapPanel(heatZustand ?: SpotPanelZustand(ctx, sid0), ort.first, ort.second,
                                     rekordSport ?: "all", routeId)
                }
            }
            "wetter" -> {
                val sw = weather
                if (sw != null) Box(Modifier.padding(horizontal = rand, vertical = 4.dp)) { WeatherCard(sw, titelKey = "spot.weatherTitle") }
                else if (!wetterGeladen) Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                else Text("—", Modifier.padding(horizontal = rand, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                // Windfenster unter dem Wetter (wie Web Sessions.tsx Reiter „Wetter"), nur mit Spot-Nummer.
                spotId?.let { sid -> Box(Modifier.padding(horizontal = rand, vertical = 4.dp)) { SpotWindfensterKarte(sid) } }
            }
            "beschreibungen" -> spotId?.let { sid ->
                SpotNotesSection(sid)
                // „Anderen Namen vorschlagen" — nur wer hier selbst gefahren ist.
                SpotNamensVorschlag(sid, spot)
            }
        }
    }
}

/** GET /api/community/spot/{id}/windfenster (server community, Stand-Buch: windfenster). */
@kotlinx.serialization.Serializable
data class SpotWindfenster(
    val sessions: Int = 0,
    val fahrer: Int = 0,
    @kotlinx.serialization.SerialName("kmh_p25") val kmhP25: Double? = null,
    @kotlinx.serialization.SerialName("kmh_p75") val kmhP75: Double? = null,
    val sektoren: List<WindSektor> = emptyList(),
)

@kotlinx.serialization.Serializable
data class WindSektor(val richtung: Double = 0.0, val sessions: Int = 0, val kmh: Double? = null)

/**
 * Windfenster des Spots (Web components/SpotWindfenster.tsx): aus welcher Richtung der Wind bei den Wing-/Kite-/
 * Parawing-Sessions hier kam. 8 Sektoren, Laenge = Zahl der Sessions, Norden oben, der Keil zeigt in die Richtung, AUS
 * der der Wind kommt. Erst ab drei Sessions mit Winddaten — darunter waere es Zufall.
 */
@Composable
private fun SpotWindfensterKarte(spotId: Int) {
    var d by remember(spotId) { mutableStateOf<SpotWindfenster?>(null) }
    LaunchedEffect(spotId) { d = try { Api.spotWindfenster(spotId) } catch (_: Exception) { null } }
    val w = d ?: return
    if (w.sessions < 3) return
    val max = maxOf(w.sektoren.maxOfOrNull { it.sessions } ?: 1, 1)
    val linie = MaterialTheme.colorScheme.outlineVariant
    val akzent = MaterialTheme.colorScheme.primary
    val leise = MaterialTheme.colorScheme.onSurfaceVariant
    androidx.compose.material3.Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(112.dp)) {
                androidx.compose.foundation.Canvas(Modifier.size(112.dp)) {
                    val u = size.minDimension / 100f
                    val m = androidx.compose.ui.geometry.Offset(50 * u, 50 * u)
                    val r0 = 46f
                    drawCircle(linie, radius = r0 * u, center = m, style = androidx.compose.ui.graphics.drawscope.Stroke(0.8f * u))
                    drawCircle(linie.copy(alpha = 0.6f), radius = r0 / 2 * u, center = m, style = androidx.compose.ui.graphics.drawscope.Stroke(0.6f * u))
                    w.sektoren.filter { it.sessions > 0 }.forEach { s ->
                        val r = (6 + (r0 - 6) * s.sessions / max.toFloat()) * u
                        // Bogen von richtung-20 bis richtung+20 Grad, Norden oben (Canvas: 0 Grad = Osten).
                        val start = (s.richtung - 20 - 90).toFloat()
                        val rect = androidx.compose.ui.geometry.Rect(m.x - r, m.y - r, m.x + r, m.y + r)
                        drawArc(akzent.copy(alpha = 0.7f), start, 40f, useCenter = true, topLeft = rect.topLeft, size = rect.size)
                        drawArc(akzent, start, 40f, useCenter = true, topLeft = rect.topLeft, size = rect.size,
                            style = androidx.compose.ui.graphics.drawscope.Stroke(0.6f * u))
                    }
                }
                Text("N", style = MaterialTheme.typography.labelSmall, color = leise, modifier = Modifier.align(Alignment.TopCenter))
            }
            androidx.compose.foundation.layout.Spacer(Modifier.size(14.dp))
            Column(Modifier.weight(1f)) {
                Text(I18n.t("spot.windTitle"), fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                if (w.kmhP25 != null && w.kmhP75 != null) {
                    Text(I18n.t("spot.windText").replace("{n}", w.sessions.toString())
                            .replace("{a}", Math.round(w.kmhP25).toString()).replace("{b}", Math.round(w.kmhP75).toString()),
                        style = MaterialTheme.typography.bodyMedium)
                }
                Text(I18n.t("spot.windNote"), style = MaterialTheme.typography.bodySmall, color = leise, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}
