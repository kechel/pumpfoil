package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.border
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Surfing
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Ab wie vielen FAHRERN ein Foil-Band angeboten wird. Ein „Rekord" aus zwei Fahrern ist keiner,
 * sondern eine persoenliche Bestleistung mit Etikett. Gleiche Schwelle wie in der PWA.
 */
private const val MIN_BAND_FAHRER = 3

/**
 * Beschriftung eines Foil-Bandes — EINE Stelle, damit Auswahl und Bestenlisten-Ueberschrift nie
 * auseinanderlaufen. Reine Zahlenbereiche brauchen keinen Uebersetzungs-Schluessel.
 */
internal fun bandLabel(b: FoilBand): String = when {
    b.art == "alle" -> I18n.t("cr.foilAll")
    b.art == "eigenes" -> I18n.t("cr.foilMine")
    b.art == "ar" -> if (b.von != null) I18n.t("cr.foilHighAspect").replace("{n}", fmtBand(b.von))
                     else I18n.t("cr.foilThick").replace("{n}", fmtBand(b.bis))
    b.von != null && b.bis != null -> "${fmtBand(b.von)}–${fmtBand(b.bis)} cm²"
    b.bis != null -> I18n.t("cr.foilUnder").replace("{n}", fmtBand(b.bis))
    else -> "${fmtBand(b.von)}+ cm²"
}

private fun fmtBand(v: Double?): String =
    if (v == null) "" else if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

/** Bestenlisten in der Reihenfolge des Webs (Home.tsx LEADER_KINDS): zuerst die Laufdauer, dann die Summen, zuletzt der
 *  weiteste Lauf. Bei Wind/Paddeln vorn die ganze Fahrt und keine Pumps/Laeufe, bei Motor keine Pumps. */
private fun leaderArten(sport: String): List<Pair<String, String>> {
    val wind = Sportarten.windArtig(sport)
    val motor = Sportarten.motor(sport)
    return listOf(
        "ride_total" to "rec.sessionTotal", "run_time" to "rec.longestRun", "distance" to "leader.totalDistance",
        "time" to "leader.totalTime", "runs" to "leader.mostRuns", "pumps" to "leader.mostPumps",
        "sessions" to "leader.mostSessions", "spots" to "leader.mostSpots", "run_distance" to "rec.farthestRun",
    ).filter { (id, _) ->
        !((wind && (id == "pumps" || id == "runs")) || (motor && id == "pumps") || (id == "ride_total" && !wind))
    }
}

private val PERIODS = listOf("today" to "period.today", "yesterday" to "period.yesterday", "10d" to "period.10d", "30d" to "period.30d", "365d" to "period.365d", "all" to "period.all")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityScreen(onOpen: (Int) -> Unit, onFoilStats: () -> Unit = {}, onWatchStats: () -> Unit = {}, onLayouts: () -> Unit = {},
                    onOpenRoute: (String, Int) -> Unit = { _, _ -> },
                    onOpenEvent: (String, Int) -> Unit = { _, _ -> }, onAlleEvents: () -> Unit = {}, onAlleTeams: () -> Unit = {},
                    onOpenTeam: (String) -> Unit = {}, onProfilLand: () -> Unit = {}) {
    // Reiter wie im Web (Home.tsx CommunitySection, docs/UX-IA.md App-Port Phase 8, 04.11.2026): Rekorde & Bestenliste ·
    // Medien · Teams & Events. Spots und Routen stehen jetzt unter der Hauptnavigation „Spots" (Reiter Liste / Routen).
    // Abzeichen am Reiter „Teams & Events" (Web 06.11.2026): LIVE, solange ein globales Event laeuft, sonst die Zahl
    // der bald beginnenden.
    val evAbz = rememberEventAbzeichen(meine = false)
    val reiter = listOf(ReiterDef("bestenliste", I18n.t("tab.rankings")), ReiterDef("medien", I18n.t("tab.media")),
                        ReiterDef("teams", I18n.t("land.teamsTitle"),
                            badge = if (evAbz.live || evAbz.bald > 0) ({ EventAbzeichen(evAbz.live, evAbz.bald) }) else null))
    var tab by rememberReiter("community", reiter.map { it.id }, "bestenliste")
    var records by remember { mutableStateOf<Map<String, PeriodRecords>?>(null) }
    var leaders by remember { mutableStateOf<Leaders?>(null) }
    var media by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var meldeMedium by remember { mutableStateOf<MediaItem?>(null) }
    var topLiked by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var topKommentiert by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var cstats by remember { mutableStateOf<Api.CommunityStats?>(null) }
    // Uhr-Layouts aus der Community (wie im Web: die fuenf meistgenutzten, Link zur Galerie)
    var layouts by remember { mutableStateOf<List<WatchLayoutBrief>>(emptyList()) }
    LaunchedEffect(Unit) { layouts = try { Api.communityLayouts().take(5) } catch (_: Exception) { emptyList() } }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Filter der Rangliste merkt sich die App (Web 05.11.2026, Jan: „ja browser soll sich alle merken bitte"), den
    // Zeitraum bewusst nicht (sonst greift die Heute/10-Tage-Automatik nie mehr). Schluessel wie im Web.
    val ctxPrefs = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { ctxPrefs.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
    fun merken(k: String, v: String) = prefs.edit().putString(k, v).apply()
    val genauGemerkt = remember { prefs.getString("foil_komm_genau", null) }
    var period by remember { mutableStateOf("10d") }
    // Ohne eigene Wahl „Heute", sobald heute alle 10 Plaetze der Bestenliste besetzt sind (Web Home.tsx autoPeriod,
    // 02.11.2026), sonst 10 Tage. Wer selbst einen Zeitraum antippt, behaelt ihn.
    var periodGewaehlt by remember { mutableStateOf(false) }
    var accelWahl by remember { mutableStateOf(genauGemerkt != "alle") }
    // Ansicht „Freunde" (Jan, 15.10.2026): die ganze Seite nur ueber mich + meine Freunde — alles,
    // was accel/alle aendert, filtert dann auf Freunde. Die Statistikzeile oben bleibt global.
    // Ein reiner Filter, er gibt nichts frei (server app/freunde.py). Freunde zaehlen wie „alle".
    var freunde by remember { mutableStateOf(genauGemerkt == "freunde") }
    // Sportart wie im Web (19.10.2026): Rekorde und Bestenliste je Sportart; Standard Pumpfoil.
    var sportart by remember { mutableStateOf(prefs.getString("foil_komm_sport", null) ?: "pumpfoil") }
    var sportListe by remember { mutableStateOf<List<String>>(listOf("pumpfoil")) }
    LaunchedEffect(Unit) {
        sportListe = try { sortiereSports(Api.communitySports().map { it.sport }.filter { it.isNotEmpty() }).ifEmpty { listOf("pumpfoil") } }
                     catch (_: Exception) { listOf("pumpfoil") }
    }
    val accelOnly = accelWahl && !freunde
    // Foil-Band („vergleichbare Foils") fuer Rekorde UND Bestenlisten — NICHT fuer Spots und
    // „Am besten bewertet" (Jans Vorgabe): dort geht es nicht um Vergleichbarkeit der Ausruestung.
    // Die Baender samt Session-/Fahrerzahl kommen vom Server, damit hier keine Grenzen fest
    // verdrahtet sind (s. FOIL_BANDS in server/app/api/community.py).
    var bands by remember { mutableStateOf<List<FoilBand>>(emptyList()) }
    var bandKey by remember { mutableStateOf(prefs.getString("foil_komm_band", null) ?: "all") }
    val band = bands.firstOrNull { it.key == bandKey }
    // Standard wie im Web: die laengste Laufdauer (weltweit DIE Kennzahl, Web LEADER_KINDS).
    var lbMetric by remember { mutableStateOf(prefs.getString("foil_leader_wahl", null) ?: "run_time") }
    // Region nach Nationalitaet (Web 05.11.2026, server app/regionen.py), gemerkt wie im Web (foil_komm_region).
    var region by remember { mutableStateOf(prefs.getString("foil_komm_region", null) ?: "all") }
    var regionen by remember { mutableStateOf<Api.Regionen?>(null) }
    // Ausgeblendete Kennzahl gewaehlt (z. B. Pumps, dann Wingfoil)? -> auf die erste sichtbare (Web arten[0]).
    LaunchedEffect(sportart) {
        val sichtbar = leaderArten(sportart)
        if (sichtbar.none { it.first == lbMetric }) lbMetric = sichtbar.first().first
    }
    LaunchedEffect(sportart) {
        if (periodGewaehlt) return@LaunchedEffect
        val heute = try { Api.leaders("today", accelOnly, "all", false, sport = sportart) } catch (_: Exception) { null }
        if (!periodGewaehlt && heute != null && heute.sessions.size >= 10) period = "today"
    }
    val scope = rememberCoroutineScope()
    // Der Social-Feed haelt seinen Zustand eine Schicht hoeher als seine Sektion: der Player ist
    // eine Vollbild-Ebene und wuerde als Teil eines LazyColumn-Eintrags abgeschnitten
    // (s. SocialFeedZustand in SocialFeed.kt).
    val feed = rememberSocialFeed()

    // Basis (accel-abhängig): Rekorde je Zeitraum, Stats, Medien.
    suspend fun loadBase() {
        loading = true
        try {
            records = Api.communityRecords(accelOnly, bandKey, sport = sportart, freunde = freunde, region = region); error = null
            cstats = try { Api.communityStats() } catch (_: Exception) { cstats }
            media = try { Api.latestPhotos(limit = 30, freunde = freunde) } catch (_: Exception) { emptyList() }
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(accelOnly, bandKey, freunde, sportart, region) { loadBase() }
    LaunchedEffect(accelOnly, freunde) {
        bands = try { Api.foilBands(accelOnly, freunde) } catch (_: Exception) { emptyList() }
        // Zurueck auf „Alle Foils", wenn das gewaehlte Band durch den Wechsel zu duenn wurde —
        // sonst stuende man vor leeren Rekorden.
        if (bands.none { it.key == bandKey && (it.art == "alle" || it.fahrer >= MIN_BAND_FAHRER) }) {
            bandKey = "all"
        }
    }
    // „Neueste Medien" bei jedem Betreten auffrischen (gelöschte Fotos sofort weg, wie PWA/iOS).
    // Im NavHost ist LocalLifecycleOwner der NavBackStackEntry -> ON_RESUME feuert beim Tab-Wechsel.
    val mediaOwner = LocalLifecycleOwner.current
    DisposableEffect(mediaOwner) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME) scope.launch { media = try { Api.latestPhotos(limit = 30, freunde = freunde) } catch (_: Exception) { media } }
        }
        mediaOwner.lifecycle.addObserver(obs)
        onDispose { mediaOwner.lifecycle.removeObserver(obs) }
    }
    meldeMedium?.let { m ->
        val art = if (m.kind == "video") "video" else "photo"
        val mid = if (art == "video") m.videoId else m.photoId
        AlertDialog(
            onDismissRequest = { meldeMedium = null },
            text = { Text(I18n.t("media.reportConfirm")) },
            confirmButton = {
                TextButton(onClick = {
                    meldeMedium = null
                    if (mid != null) scope.launch {
                        val weg = try { Api.reportMedia(art, mid) } catch (_: Exception) { false }
                        if (weg) media = media.filterNot { it.kind == m.kind && (if (art == "video") it.videoId else it.photoId) == mid }
                    }
                }) { Text(I18n.t("media.report")) }
            },
            dismissButton = { TextButton(onClick = { meldeMedium = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
    // Zeitraum- + accel-abhängig: Bestenliste, Best bewertet.
    // Die Auswahl rechnet der Server immer ueber Allzeit (05.11.2026) — ein Zeitraumwechsel laedt sie nicht neu.
    LaunchedEffect(sportart) { regionen = try { Api.communityRegionen("all", sportart) } catch (_: Exception) { regionen } }
    LaunchedEffect(period, accelOnly, bandKey, freunde, sportart, region) {
        leaders = try { Api.leaders(period, accelOnly, bandKey, freunde, sport = sportart, region = region) } catch (_: Exception) { leaders }
        topLiked = try { Api.topLiked(period, freunde = freunde) } catch (_: Exception) { topLiked }
        topKommentiert = try { Api.topCommented(period, freunde = freunde) } catch (_: Exception) { topKommentiert }
    }

    Scaffold(
        topBar = {
            PumpfoilTopBar(I18n.t("nav.community")) {
                IconButton(onClick = onFoilStats) {
                    Icon(Icons.Filled.Surfing, contentDescription = I18n.t("foilStats.title"))
                }
                IconButton(onClick = onWatchStats) {
                    Icon(Icons.Filled.Watch, contentDescription = I18n.t("watchStats.title"))
                }
                SyncIndicator()
            }
        },
    ) { pad ->
      Box(Modifier.fillMaxSize()) {
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { loadBase() } }) {
                if (loading && records == null) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp)) {
                        error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }

                        // Dauerhafte Community-Stats-Leiste (Foiler/Spots/Sessions/Pumps).
                        cstats?.let { cs ->
                            item {
                                Card(
                                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                                ) {
                                    Text(bannerStatsAnnotated(cs), Modifier.padding(horizontal = 14.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }

                        item { Reiterleiste(reiter, tab, { tab = it }, Modifier.padding(bottom = 4.dp)) }

                        // Rangliste nach Oleks Entwurf (Web Home.tsx, 05.11.2026): oben EINE Zeile fuer alles (Zeitraum, Sportart),
                        // darunter die Bestenliste der Mitglieder mit ihren eigenen Auswahlfeldern (Kennzahl, accel/alle/Freunde,
                        // Foil), dann die der Teams (Kennzahl, Beste N), zuletzt die Rekord-Kacheln. Auf dem Handy untereinander
                        // wie das Web schmal. Im Reiter Medien nur der Zeitraum (Best bewertet / Meist kommentiert).
                        if (tab != "teams") item {
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                PERIODS.forEach { (id, key) ->
                                    FilterChip(selected = period == id, onClick = { period = id; periodGewaehlt = true }, label = { Text(I18n.t(key)) }, colors = cyanChipColors())
                                }
                            }
                        }
                        // Sportart: gilt fuer beide Bestenlisten und die Kacheln (Jan: „es soll halt jeweils immer nur die gleiche
                        // sportart verglichen werden"). Die gewaehlte und Pumpfoil stehen immer zur Wahl.
                        val sportWahl = (sportListe + listOf("pumpfoil", sportart)).distinct()
                        // Region: Global, Kontinente und Laender mit genug Fahrern/Teams; die gewaehlte steht immer zur Wahl.
                        // Global, Kontinente (fest vom Server), das eigene Land (immer), dann die uebrigen Laender alphabetisch nach
                        // dem Namen in der App-Sprache (Jan, 05.11.2026).
                        val ichLand = regionen?.ich?.takeIf { it.isNotBlank() }
                        val regionWahl = (listOf("all") + regionen?.regionen.orEmpty().map { it.key } + region + listOfNotNull(ichLand)).distinct().let { l ->
                            val koll = java.text.Collator.getInstance(java.util.Locale.forLanguageTag(if (I18n.lang == "gsw") "de-CH" else I18n.lang))
                            l.filter { it == "all" || it.startsWith("k:") } + listOfNotNull(ichLand) +
                                l.filter { it != "all" && !it.startsWith("k:") && it != ichLand }.sortedWith { a, b -> koll.compare(landName(a), landName(b)) }
                        }
                        fun regionName(k: String) = when {
                            k == "all" -> I18n.t("region.global")
                            k.startsWith("k:") -> I18n.t("region.${k.removePrefix("k:")}")
                            else -> landName(k)
                        }
                        if (tab == "bestenliste" && (sportWahl.size > 1 || regionWahl.size > 1)) item {
                            Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                if (regionWahl.size > 1) RegionDropdown(regionWahl, region, ::regionName,
                                    { region = it; merken("foil_komm_region", it) }, Modifier.weight(1f))
                                if (sportWahl.size > 1) Dropdown(sportWahl.map { it to I18n.t("cls.sport.$it") }, sportart,
                                    { sportart = it; merken("foil_komm_sport", it) }, Modifier.weight(1f))
                            }
                            // Grundlage der Region, und wer keine Nationalitaet hat, warum er fehlt (Tippen -> Einstellung).
                            if (region != "all") {
                                Text(I18n.t("region.basis"), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp))
                                if (regionen != null && regionen?.ich == null) {
                                    Text(I18n.t("region.ohneLand") + " " + I18n.t("profile.land") + " →", style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.tertiary,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp).clickable { onProfilLand() })
                                }
                            }
                        }

                        if (tab == "bestenliste") item {
                            SectionHeader("${I18n.t("home.leaderboards")} – ${I18n.t("team.mitglieder")}")
                            Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Dropdown(leaderArten(sportart).map { (id, k) -> id to I18n.t(k) }, lbMetric,
                                        { lbMetric = it; merken("foil_leader_wahl", it) }, Modifier.weight(1f))
                                    // accel/alle/Freunde als Auswahlfeld (vorher Knopfgruppe AccelSeg), wie im Web.
                                    Dropdown(listOf("accel" to I18n.t("side.onlyAccel").replaceFirstChar { it.uppercase() },
                                                    "alle" to I18n.t("side.all").replaceFirstChar { it.uppercase() },
                                                    "freunde" to I18n.t("friends.title")),
                                        if (freunde) "freunde" else if (accelWahl) "accel" else "alle",
                                        { v -> merken("foil_komm_genau", v); if (v == "freunde") freunde = true else { freunde = false; accelWahl = v == "accel" } },
                                        Modifier.weight(1f))
                                }
                                // Foil-Band. Reihenfolge vom Server (Nuetzlichstes oben); die Sessionzahl steht dabei, weil jede
                                // Auswahl ausser „Alle Foils" den Topf verkleinert.
                                val sichtbar = bands.filter { it.art == "alle" || it.fahrer >= MIN_BAND_FAHRER }
                                if (sichtbar.size > 1) {
                                    Dropdown(sichtbar.map { b -> b.key to (bandLabel(b) + if (b.art == "alle") "" else " (${b.sessions})") },
                                        bandKey, { bandKey = it; merken("foil_komm_band", it) }, Modifier.fillMaxWidth())
                                }
                            }
                            leaders?.let { lb ->
                                BestenlistenBlock(lb, sportart, lbMetric, { lbMetric = it }, onOpen, kennzahlKnoepfe = false,
                                    unterzeile = listOfNotNull(I18n.t("cls.sport.$sportart"),
                                        I18n.t(PERIODS.firstOrNull { it.first == period }?.second ?: "period.all"),
                                        band?.takeIf { it.art != "alle" }?.let { bandLabel(it) }))
                            }
                        }
                        // Team-Bestenlisten: seit 05.11.2026 hier statt im Reiter Teams & Events (Oleks Entwurf).
                        if (tab == "bestenliste") item {
                            TeamBestenlisten(period, sportart, "${I18n.t("home.leaderboards")} – ${I18n.t("team.community")}", onOpenTeam,
                                Modifier.padding(horizontal = 12.dp, vertical = 8.dp), region = region)
                        }
                        // Rekord-Kacheln (mit Nutzer/Spot), klickbar -> Session; das gewaehlte Band gehoert in die Ueberschrift.
                        if (tab == "bestenliste") item {
                            SectionHeader(I18n.t("side.records") + (band?.takeIf { it.art != "alle" }?.let { " · ${bandLabel(it)}" } ?: ""))
                            RecordGrid(records?.get(period), showSpot = true, onOpen = onOpen, modifier = Modifier.padding(horizontal = 12.dp), sport = sportart)
                            QuellenZeile(records?.get(period)?.quellen, Modifier.padding(horizontal = 12.dp))
                        }

                        // Neueste Medien (Fotos + YouTube), Tippen -> Session.
                        if (tab == "medien" && media.isNotEmpty()) {
                            item {
                                SectionHeader(I18n.t("community.latestMedia"))
                                LazyRow(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(media.size) { idx ->
                                        val m = media[idx]
                                        val thumb = if (m.kind == "video") ytId(m.youtubeUrl)?.let { "${Api.BASE}/api/public/video-thumb/$it" }
                                                    else Api.mediaUrl(m.url)
                                        val mid = if (m.kind == "video") m.videoId else m.photoId
                                        Box {
                                            AsyncImage(
                                                model = thumb, contentDescription = m.caption,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier.size(width = 150.dp, height = 100.dp)
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .clickable { onOpen(m.sessionId) },
                                            )
                                            // Medium melden (12.11.2026, Web Home.tsx): Fahne oben rechts, mit Rueckfrage
                                            if (mid != null) {
                                                IconButton(onClick = { meldeMedium = m }, modifier = Modifier.align(Alignment.TopEnd).size(32.dp)) {
                                                    Icon(Icons.Filled.Flag, contentDescription = I18n.t("media.report"), tint = Color.White,
                                                        modifier = Modifier.size(18.dp).background(Color.Black.copy(alpha = 0.45f), CircleShape).padding(2.dp))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Best bewertet (meiste Likes).
                        if (tab == "medien" && topLiked.isNotEmpty()) {
                            item { SectionHeader("${I18n.t("community.topRated")} · ${I18n.t(PERIODS.firstOrNull { it.first == period }?.second ?: "period.all")}") }
                            items(topLiked) { c -> CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = ListenAnsicht.abstand)) { onOpen(c.id) } }
                        }
                        // Meist kommentiert (Web Home.tsx), derselbe Zeitraum.
                        if (tab == "medien" && topKommentiert.isNotEmpty()) {
                            item { SectionHeader("${I18n.t("home.topCommented")} · ${I18n.t(PERIODS.firstOrNull { it.first == period }?.second ?: "period.all")}") }
                            items(topKommentiert, key = { "k${it.id}" }) { c -> CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = ListenAnsicht.abstand)) { onOpen(c.id) } }
                        }

                        // Community-Social-Feed unter „Best bewertet", ueber den Uhr-Layouts (Web Home.tsx, Reiter Medien).
                        // Laedt sich selbst; ist nichts freigegeben oder der Nutzer unter 13, zeichnet er gar nichts.
                        if (tab == "medien") item { SocialFeedSection(feed, Modifier.padding(top = 8.dp)) }

                        // Teams & Events (Web TeamsSection): ganz oben die Team-Bestenlisten (Jan, 03.11.2026), dann laufende &
                        // kommende Events, die aktivsten Teams. Keine Teamliste hier, die hat ihre eigene Seite.
                        if (tab == "teams") {
                            item { CommunityEventsAbschnitt(onOpenEvent, onAlleEvents, onAlleTeams) }
                            item { AktivsteTeams(onOpenTeam, Modifier.padding(horizontal = 12.dp, vertical = 12.dp)) }
                        }

                        // Uhr-Layouts der Community — im Web unter „Best bewertet" (Home.tsx LayoutTeaser),
                        // in den Apps fehlte der Abschnitt; die Galerie war nur ueber Profil -> Datenfelder zu finden.
                        if (tab == "medien" && layouts.isNotEmpty()) {
                            item {
                                Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(I18n.t("home.layouts"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                    TextButton(onClick = onLayouts) { Text(I18n.t("home.layoutsAll") + " →") }
                                }
                                Text(I18n.t("home.layoutsHint"), style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp))
                                androidx.compose.foundation.lazy.LazyRow(
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    items(layouts.size) { i ->
                                        val l = layouts[i]
                                        Card(Modifier.width(170.dp).clickable { onLayouts() }) {
                                            Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                                WatchLayoutPreview(elements = l.elements, bgColor = l.bg_color, shape = l.shape,
                                                    w = l.authored_w ?: 240, h = l.authored_h ?: 240, px = 130.dp)
                                                Spacer(Modifier.height(6.dp))
                                                Text(l.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                                Text(I18n.t("lay.byAuthor").replace("{name}", l.author ?: "?"), style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                                Text(I18n.t("lay.cat.${l.category}"), style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                                val n = l.used_by ?: 0
                                                if (n > 0) Text(I18n.t(if (n == 1) "lay.usedBy1" else "lay.usedBy").replace("{n}", n.toString()),
                                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Spots (Suche + Rekorde je Spot) und die gemerkten Routen stehen seit dem Port unter Spots › Liste
                        // bzw. Spots › Routen (wie im Web, 02.11.2026).
                    }
                }
            }
        }
        // Vollbild-Player des Social-Feeds: ZULETZT gezeichnet, also UEBER dem Seiteninhalt —
        // und im Hauptfenster, nicht in einem Dialogfenster.
        //
        // Der Player oeffnet ein eigenes Fenster (s. SocialPlayerOverlay) und deckt damit
        // Kopfleiste UND untere Navigation ab — hier braucht es keinen Rand mehr.
        SocialPlayerOverlay(feed)
      }
    }
}

// Ausgewählter Chip in Marken-Cyan (statt M3-Lavendel), wie die PWA-Pills.
@Composable
internal fun cyanChipColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = MaterialTheme.colorScheme.primary,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
)

// Accel/alle-Umschalter (zwei Segmente, wie PWA + Home).
@Composable
internal fun AccelSeg(accelOnly: Boolean, brett: Boolean = false, onBrett: (() -> Unit)? = null,
                      freunde: Boolean = false, onFreunde: (() -> Unit)? = null,
                      onChange: (Boolean) -> Unit) {
    @Composable
    fun seg(active: Boolean, label: String, onClick: () -> Unit) {
        Surface(
            onClick = onClick, shape = MaterialTheme.shapes.small,
            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1, softWrap = false,
                color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        // Kurz „accel" in allen Sprachen (Jan, 13.10.2026): mit POB passt die Zeile so auch auf
        // schmalen Displays.
        seg(accelOnly && !brett && !freunde, "accel") { onChange(true) }
        Spacer(Modifier.width(4.dp))
        seg(!accelOnly && !brett && !freunde, I18n.t("side.all")) { onChange(false) }
        // Dritte Taste „Freunde" auf der Community-Seite (15.10.2026, wie AccelToggle.tsx).
        if (onFreunde != null) {
            Spacer(Modifier.width(4.dp))
            seg(freunde, I18n.t("friends.title")) { onFreunde() }
        }
        // Dritte Taste „POB" = phone on board, nur Aufnahmen mit placement = board (wie die PWA seit
        // 08.10.2026; Beschriftung in allen Sprachen „POB", Jan 13.10.2026).
        if (onBrett != null) {
            Spacer(Modifier.width(4.dp))
            seg(brett, "POB") { onBrett() }
        }
    }
}

/** Regionsauswahl mit Flagge bzw. Kontinent-Umriss vor dem Namen (Jan, 05.11.2026), Global mit dem Erd-Umriss. */
@Composable
private fun RegionDropdown(keys: List<String>, selected: String, name: (String) -> String, onSelect: (String) -> Unit,
                           modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    val zeichen: @Composable (String) -> Unit = { k -> TeamHerkunftZeichen(if (k == "all") "k:earth" else k, kuerzel = false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            zeichen(selected); Spacer(Modifier.width(6.dp))
            Text(name(selected), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            keys.forEach { k ->
                DropdownMenuItem(leadingIcon = { zeichen(k) }, text = { Text(name(k)) }, onClick = { onSelect(k); open = false })
            }
        }
    }
}

@Composable
internal fun SectionHeader(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 14.dp, bottom = 6.dp))
}

// Community-Rekorde-Grid (2 Spalten): Wert (cyan) + Label + Nutzer(Avatar+Name) + Datum · Spot.
/** Eine Rekord-Kachel. `ohneSession` = der Rekord gehoert einem NUTZER, nicht einer Session
 *  (bisher nur „Meiste Carves >180°"): dann gibt es keine Session zum Verlinken und weder Datum
 *  noch Spot — nur Wert und Person. Ohne dieses Kennzeichen fiele die Kachel durch die
 *  `sessionId != null`-Pruefung und stuende dauerhaft auf „–". */
private data class RecItem(val label: String, val value: String, val e: CommunityRecordEntry,
                           val ohneSession: Boolean = false)

// Sekunden-seit-Mitternacht (Spot-Ortszeit) -> "HH:MM"; Night Owl kann >24 h liefern (über
// Mitternacht) -> mod 24 h.
private fun hhmmOfDay(v: Double): String {
    val s = (v.toLong() % 86400 + 86400) % 86400
    return "%02d:%02d".format(s / 3600, (s % 3600) / 60)
}
// NICHT mehr `private`: dieselbe Darstellung braucht die Spot-Ansicht (Jan, 07.09.2026 — dort
// fehlten die Rekorde ganz). Die Navigation kommt ueber `onOpen`, das Raster haengt also an
// nichts aus diesem Bildschirm; die Helfer darunter (RecItem, fmtDurC, hhmmOfDay) bleiben
// dateiprivat, weil nur dieses Raster sie braucht.
@Composable
fun RecordGrid(r: PeriodRecords?, showSpot: Boolean, onOpen: (Int) -> Unit, modifier: Modifier = Modifier,
               sport: String? = null, nurSport: Boolean = false, nurBelegt: Boolean = false) {
    // Rekord-Arten je Sportart wie im Web (19.10.2026): Wind ohne Gleit-/Pump-/Laufzahl-/Carve-
    // Rekorde und mit der laengsten Fahrt zuerst; Motor ohne Gleit-/Pump-Rekorde. Sonst wie bisher.
    val wind = Sportarten.windArtig(sport)
    val motor = Sportarten.motor(sport)
    val ohne = when {
        wind -> setOf("rec.longestGlide", "rec.sessionPumps", "rec.mostRuns", "rec.carves180")
        motor -> setOf("rec.longestGlide", "rec.sessionPumps")
        else -> emptySet()
    }
    val alle = buildList {
        if (wind) r?.sessionTotal?.let { add(RecItem(I18n.t("rec.sessionTotal"), "%.1f km".format(it.value / 1000.0), it)) }
        r?.distance?.let { add(RecItem(I18n.t("rec.farthestRun"), fmtDist(it.value), it)) }
        r?.duration?.let { add(RecItem(I18n.t("rec.longestRun"), fmtDurC(it.value), it)) }
        r?.speed?.let { add(RecItem(I18n.t("rec.topSpeed"), "%.1f km/h".format(it.value * 3.6), it)) }
        r?.glide?.let { add(RecItem(I18n.t("rec.longestGlide"), "%.1f s".format(it.value), it)) }
        r?.runs?.let { add(RecItem(I18n.t("rec.mostRuns"), it.value.roundToInt().toString(), it)) }
        r?.sessionDistance?.let { add(RecItem(I18n.t("rec.sessionDistance"), "%.1f km".format(it.value / 1000.0), it)) }
        r?.sessionTime?.let { add(RecItem(I18n.t("rec.sessionTime"), "${(it.value / 60).roundToInt()} min", it)) }
        r?.sessionPumps?.let { add(RecItem(I18n.t("rec.sessionPumps"), it.value.roundToInt().toString(), it)) }
        r?.maxHr?.let { add(RecItem(I18n.t("rec.maxHr"), "${it.value.roundToInt()} bpm", it)) }
        r?.earlyBird?.let { add(RecItem(I18n.t("rec.earlyBird"), hhmmOfDay(it.value), it)) }
        r?.nightOwl?.let { add(RecItem(I18n.t("rec.nightOwl"), hhmmOfDay(it.value), it)) }
        r?.carves180?.let {
            add(RecItem(I18n.t("rec.carves180"), it.value.roundToInt().toString(), it,
                        ohneSession = true))
        }
    }
    val ohneTexte = ohne.map { I18n.t(it) }.toSet()
    // Rekorde je Sportart (20.10.2026) ans Ende; `nurSport` = nur diese (eigene Zeile je Sportart).
    val zusatz = sportRecItems(r, sport)
    val items0 = if (nurSport) zusatz else alle.filter { it.label !in ohneTexte } + zusatz
    // `nurBelegt` (Spot-Ansicht, Jan 28.10.2026): nur Kacheln mit Rekord, keine Reihen aus „–".
    // Hat das Zeitfenster gar keinen Rekord, bleiben die „–"-Kacheln (statt einer leeren Flaeche).
    val belegt = if (nurBelegt && r != null) items0.filter { it.e.value > 0.0 && (it.e.sessionId != null || it.ohneSession) } else emptyList()
    val items = belegt.ifEmpty { items0 }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { ri ->
                    // Wert vorhanden? Fuer die nutzerbezogenen Rekorde reicht der WERT — sie
                    // haben keine Session (s. RecItem.ohneSession).
                    val has = ri.e.value > 0.0 && (ri.e.sessionId != null || ri.ohneSession)
                    // Verlinken nur, wenn es wirklich eine Session gibt.
                    val klickbar = has && ri.e.sessionId != null
                    Card(
                        Modifier.weight(1f).then(if (klickbar) Modifier.clickable { onOpen(ri.e.sessionId!!) } else Modifier),
                    ) {
                      // Box nur als Rahmen: die Vorschau liegt HINTER dem Text (Web 1be44c9e, 09.11.2026: Deckkraft 0,2)
                      // und beeinflusst die Höhe nicht — ohne Track bleibt alles gleich.
                      Box(Modifier.fillMaxWidth()) {
                        // Farbe kommt aus colorScheme.primary (TrackPreviewCanvas) -> beide Farbmodi.
                        if (has) ri.e.trackPreview?.takeIf { it.isNotBlank() }?.let { tp ->
                            TrackPreviewCanvas(tp, Modifier.align(Alignment.CenterEnd)
                                .padding(end = 6.dp).size(width = 56.dp, height = 40.dp).alpha(0.2f))
                        }
                        Column(Modifier.padding(10.dp)) {
                            Text(if (has) ri.value else "–", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                            Text(ri.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                            if (has) {
                                ri.e.name?.takeIf { it.isNotBlank() }?.let { nm ->
                                    Spacer(Modifier.height(2.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Api.mediaUrl(ri.e.avatarUrl)?.let { av ->
                                            // Tipp aufs Bild -> Profil; auf den Rest der Kachel -> Session.
                                            ProfilbildRahmen(ri.e.userId, 18.dp) {
                                                AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                                                    modifier = Modifier.size(18.dp).clip(CircleShape))
                                            }
                                            Spacer(Modifier.width(4.dp))
                                        }
                                        Text(nm, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary,
                                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                                val date = shortDate(ri.e.startedAt, ri.e.tz)
                                val sub = listOfNotNull(date, if (showSpot) ri.e.spot else null).joinToString(" · ")
                                if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                      }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        if (items.all { it.e.value <= 0.0 }) {
            Text(I18n.t("records.empty"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun ytId(url: String?): String? {
    if (url.isNullOrBlank()) return null
    return Regex("""(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})""").find(url)?.groupValues?.get(1)
}
private fun fmtDurC(s: Double): String = fmtLaufDauer(s)

// Rekord-Arten je Sportart: der Rekord-SATZ kommt aus der Server-Liste (Feld `rekorde`, Sportarten.kt), welche Kacheln
// zu einem Satz gehoeren, steht hier (wie PWA). Ozeanwelle hat keinen Server-Satz, aber eigene Kacheln.
private val REK_SAETZE: Map<String, List<String>> = mapOf(
    "wind" to listOf("jibe_quote", "tack_quote", "vmg_best", "upwind_m", "jibes_foil", "ride_longest", "ride_farthest"),
    "wind_ohne_foil" to listOf("vmg_best", "upwind_m", "ride_longest", "ride_farthest"),
    "sup" to listOf("paddle_success", "paddle_quote", "paddle_foil_longest"),
    "paddel" to listOf("ride_longest", "ride_farthest"),
    "wake" to listOf("wake_longest", "wake_time"),
    "downwind" to listOf("dw_ab", "dw_ab_speed"),
)
private fun sportRek(sport: String?): List<String> = when {
    sport == "surf_wave" -> listOf("waves", "wave_longest")
    else -> Sportarten.eintrag(sport)?.rekorde?.let { REK_SAETZE[it] } ?: emptyList()
}

/** Rekorde je Sportart (20.10.2026, wie PWA SPORT_REC): Label, Format, Eintrag. */
private fun sportRecItems(r: PeriodRecords?, sport: String?): List<RecItem> {
    if (r == null) return emptyList()
    val km = { v: Double -> "%.1f km".format(v / 1000.0) }
    val pct = { v: Double -> "${(v * 100).roundToInt()} %" }
    val n = { v: Double -> v.roundToInt().toString() }
    val kmh = { v: Double -> "%.1f km/h".format(v) }
    val dur = { v: Double -> fmtDurC(v) }
    val def: Map<String, Triple<String, (Double) -> String, CommunityRecordEntry?>> = mapOf(
        "jibe_quote" to Triple("rec.jibeQuote", pct, r.jibeQuote), "tack_quote" to Triple("rec.tackQuote", pct, r.tackQuote),
        "vmg_best" to Triple("rec.vmgBest", kmh, r.vmgBest), "upwind_m" to Triple("rec.upwind", km, r.upwindM),
        "jibes_foil" to Triple("rec.jibesFoil", n, r.jibesFoil), "ride_longest" to Triple("rec.rideLongest", dur, r.rideLongest),
        "ride_farthest" to Triple("rec.rideFarthest", km, r.rideFarthest),
        "paddle_success" to Triple("rec.paddleSuccess", n, r.paddleSuccess), "paddle_quote" to Triple("rec.paddleQuote", pct, r.paddleQuote),
        "paddle_foil_longest" to Triple("rec.paddleFoilLongest", dur, r.paddleFoilLongest),
        "wake_longest" to Triple("rec.wakeLongest", dur, r.wakeLongest), "wake_time" to Triple("rec.wakeTime", dur, r.wakeTime),
        "dw_ab" to Triple("rec.dwAb", km, r.dwAb), "dw_ab_speed" to Triple("rec.dwAbSpeed", kmh, r.dwAbSpeed),
        "waves" to Triple("rec.waves", n, r.waves), "wave_longest" to Triple("rec.waveLongest", dur, r.waveLongest),
    )
    return sportRek(sport).mapNotNull { k ->
        val (label, fmt, e) = def[k] ?: return@mapNotNull null
        // Quoten mit Anzahl („100 % von 146", 20.10.2026)
        val text = fmt(e?.value ?: 0.0).let { w -> e?.anzahl?.let { I18n.t("rec.ofN").replace("{p}", w).replace("{n}", "$it") } ?: w }
        RecItem(I18n.t(label), text, e ?: CommunityRecordEntry())
    }
}

/** Eigene Bestwerte je Sportart, eine abgesetzte Zeile je Sportart (Home + Foiler-Seite, 20.10.2026). */
@Composable
fun SportRekordeZeilen(zeilen: List<SportRekordeZeile>, titel: String, onOpen: (Int) -> Unit) {
    if (zeilen.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(titel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        zeilen.forEach { z ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(color = Color(0xFFF59E0B).copy(alpha = 0.18f), shape = RoundedCornerShape(4.dp)) {
                        Text(I18n.t("cls.sport.${z.sport}"), Modifier.padding(horizontal = 8.dp, vertical = 2.dp), color = Color(0xFFD97706))
                    }
                    val m = z.rekorde
                    val pr = PeriodRecords(jibeQuote = m["jibe_quote"], tackQuote = m["tack_quote"], vmgBest = m["vmg_best"],
                        upwindM = m["upwind_m"], jibesFoil = m["jibes_foil"], rideLongest = m["ride_longest"], rideFarthest = m["ride_farthest"],
                        paddleSuccess = m["paddle_success"], paddleQuote = m["paddle_quote"], paddleFoilLongest = m["paddle_foil_longest"],
                        wakeLongest = m["wake_longest"], wakeTime = m["wake_time"], dwAb = m["dw_ab"], dwAbSpeed = m["dw_ab_speed"],
                        waves = m["waves"], waveLongest = m["wave_longest"])
                    RecordGrid(pr, showSpot = true, onOpen = onOpen, sport = z.sport, nurSport = true)
                }
            }
        }
    }
}
// Kurzdatum dd.MM.yy jetzt zentral in TimeFmt.shortDate (Spot-Ortszeit via tz).

/**
 * Alle gemerkten Routen aller Spots (wie RoutenSection in web/src/pages/Home.tsx): dieselben
 * Kaertchen wie unter der Spot-Karte, dazu der Spotname, filterbar nach Gesamtlaenge. Ein Tipp
 * oeffnet den Spot und ruft die Route dort in der Planung auf. Nur Datum, nie wer.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun RoutenAbschnitt(onOpenRoute: (String, Int) -> Unit) {
    var routen by remember { mutableStateOf<List<GemerkteRoute>?>(null) }
    var minKm by remember { mutableStateOf(0f) }
    var maxKm by remember { mutableStateOf(ROUTEN_KM_MAX) }
    LaunchedEffect(Unit) { routen = try { Api.alleRouten() } catch (_: Exception) { emptyList() } }
    val alle = routen ?: return
    if (alle.isEmpty()) return     // noch keine gemerkt -> kein leerer Abschnitt
    // „max" am Anschlag = ohne Grenze
    val passend = alle.filter { it.meter >= minKm * 1000 && (maxKm >= ROUTEN_KM_MAX || it.meter <= maxKm * 1000) }
    Column(Modifier.padding(top = 8.dp)) {
        SectionHeader(I18n.t("home.routes"))
        @Composable fun regler(label: String, wert: Float, setz: (Float) -> Unit) {
            Column(Modifier.padding(horizontal = 12.dp)) {
                Text("$label: " + if (wert >= ROUTEN_KM_MAX) I18n.t("home.routesNoLimit") else "${wert.toInt()} km",
                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                androidx.compose.material3.Slider(value = wert, onValueChange = { setz(Math.round(it).toFloat()) }, valueRange = 0f..ROUTEN_KM_MAX)
            }
        }
        regler(I18n.t("home.routesMin"), minKm) { minKm = minOf(it, maxKm) }
        regler(I18n.t("home.routesMax"), maxKm) { maxKm = maxOf(it, minKm) }
        if (passend.isEmpty()) {
            Text(I18n.t("home.routesNone"), Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else androidx.compose.foundation.layout.FlowRow(Modifier.padding(horizontal = 12.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp)) {
            for (r in passend) {
                val (n, maxM) = gemerktKurz(r)
                Pille(buildString {
                    if (r.eigeneId != null) append("● ")
                    append("📍 ").append(r.spotName ?: "").append(" · ")
                    append(I18n.t("routes.savedChip").replace("{n}", "$n").replace("{max}", "$maxM")
                        .replace("{total}", "${r.meter}").replace("{datum}", routenDatum(r.gemerktAm)))
                    if (mitEigenen(r)) append(" · ").append(I18n.t("routes.manualTag"))
                }, false, klein = true) { r.id?.let { id -> r.spotName?.let { onOpenRoute(it, id) } } }
            }
        }
    }
}

private const val ROUTEN_KM_MAX = 50f

/** Zeit auf dem Foil wie im Web: h:mm, unter einer Stunde m:ss. */
private fun leaderDauer(s: Double): String {
    val t = s.toLong(); val h = t / 3600; val m = (t % 3600) / 60
    return if (h > 0) "%d:%02d".format(h, m) else "%d:%02d".format(m, t % 60)
}

/**
 * Bestenlisten (Web Home.tsx `Leaderboards`): Kennzahl als Chips, darunter die ersten 10 mit Flagge, die eigene Stelle
 * unter Platz 10, und „Als Bild teilen" (TeamBildDialog; den Link-Knopf gibt es seit 05.11.2026 nicht mehr). Gebraucht in der
 * Community und auf der Spot-Seite (Web 0fc2eba8). `unterzeile` = Sportart, Zeitraum … fuers Bild (Datum kommt dazu).
 */
@Composable
internal fun BestenlistenBlock(lb: Leaders, sportart: String, lbMetric: String, onMetric: (String) -> Unit, onOpen: (Int) -> Unit,
                               unterzeile: List<String>, kennzahlKnoepfe: Boolean = true) {
    var lbBild by remember { mutableStateOf<TeamBildDaten?>(null) }
    Column(Modifier.fillMaxWidth()) {
        // Ohne Knoepfe (Community-Rangliste seit 05.11.2026): die Kennzahl waehlt ein Auswahlfeld darueber.
        if (kennzahlKnoepfe) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            leaderArten(sportart).forEach { (id, key) ->
                FilterChip(selected = lbMetric == id, onClick = { onMetric(id) }, label = { Text(I18n.t(key)) }, colors = cyanChipColors())
            }
        }
        val list = when (lbMetric) { "runs" -> lb.runs; "pumps" -> lb.pumps; "spots" -> lb.spots
            "distance" -> lb.distance; "time" -> lb.time; "run_distance" -> lb.runDistance
            "run_time" -> lb.runTime; "ride_total" -> lb.rideTotal; else -> lb.sessions }
        fun leaderWert(e: LeaderEntry): String = when (lbMetric) { "runs" -> "${e.runs}"; "pumps" -> "${e.pumps}"; "spots" -> "${e.spots}"
            "distance" -> String.format(java.util.Locale.ROOT, "%.1f", e.distanceM / 1000)
            "ride_total" -> String.format(java.util.Locale.ROOT, "%.1f", e.rideTotalM / 1000)
            "time" -> leaderDauer(e.timeS)
            "run_distance" -> String.format(java.util.Locale.ROOT, "%.2f", e.runDistanceM / 1000)
            "run_time" -> leaderDauer(e.runTimeS); else -> "${e.sessions}" }
        fun leaderEinheit(e: LeaderEntry): String = when (lbMetric) { "runs" -> I18n.t("unit.runs"); "pumps" -> I18n.t("unit.pumps")
            "spots" -> I18n.t("unit.spots"); "distance", "run_distance", "ride_total" -> "km"
            "time" -> if (e.timeS >= 3600) "h" else "min"; "run_time" -> if (e.runTimeS >= 3600) "h" else "min"
            else -> I18n.t("unit.sessions") }
        Card(Modifier.fillMaxWidth().padding(12.dp)) {
            Column(Modifier.padding(8.dp)) {
                val zeile: @Composable (LeaderEntry, Int, Boolean) -> Unit = { e, platz, ich ->
                    val v = leaderWert(e)
                    val unit = leaderEinheit(e)
                    // Einzellauf-Listen: Tippen oeffnet die Session (01.11.2026, wie das Web)
                    val sid = e.sessionId
                    Row(Modifier.fillMaxWidth().then(if (sid != null) Modifier.clickable { onOpen(sid) } else Modifier)
                        .then(if (ich) Modifier.border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.6f), RoundedCornerShape(8.dp)).padding(horizontal = 4.dp) else Modifier)
                        .padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Feste Spalten (05.11.2026, Jan: „ausrichtung noch fixen"): Platz, Profilbild (ohne Bild die
                        // Initiale wie im Web), Flagge — sonst rueckten Namen mit Bild um dessen Breite nach rechts.
                        // 34 dp: dreistellige Plaetze der eigenen Zeile (07.11.2026) wurden abgeschnitten.
                        Text("$platz", Modifier.width(34.dp), style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary, maxLines = 1, softWrap = false)
                        AvatarCircle(e.name, e.avatarUrl, 28.dp, userId = e.userId)
                        Spacer(Modifier.width(8.dp))
                        LandFlagge(e.land)   // nach dem Profilbild, Platz bleibt auch ohne Land (Web Flagge)
                        Spacer(Modifier.width(6.dp))
                        Text(e.name ?: "—", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(v, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(4.dp))
                        Text(unit, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                // Alle 10 wie im Web: die eigene Zeile darunter (Olek, 01.11.2026) gibt der Server nur,
                // wenn man nicht unter den ersten 10 steht — bei take(5) fehlten sonst die Plaetze 6 bis 10.
                list.take(10).forEachIndexed { i, e -> zeile(e, i + 1, false) }
                lb.me[lbMetric]?.let { ich ->
                    ich.rank?.let { r ->
                        Text("⋮", Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        zeile(ich, r, true)
                    }
                }
                if (list.isEmpty()) Text(I18n.t("records.empty"), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        QuellenZeile(lb.quellen, Modifier.padding(horizontal = 12.dp).padding(bottom = 4.dp))
        // Teilen: als Bild (Web BestenlisteBildDialog, derselbe Dialog wie bei den Team-Bestenlisten) und als Link.
        if (list.isNotEmpty()) Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val ctxTeilen = androidx.compose.ui.platform.LocalContext.current
            TextButton(onClick = {
                val art = leaderArten(sportart).firstOrNull { it.first == lbMetric }?.second ?: "leader.mostSessions"
                val unter = (unterzeile + java.text.DateFormat.getDateInstance(java.text.DateFormat.SHORT,
                    java.util.Locale.forLanguageTag(I18n.lang)).format(java.util.Date())).joinToString(" · ")
                val zeilen = list.take(10).mapIndexed { i, e -> BildZeile(i + 1, e.name ?: "—", "${leaderWert(e)} ${leaderEinheit(e)}", false, land = e.land) } +
                    listOfNotNull(lb.me[lbMetric]?.let { ich -> ich.rank?.let { r ->
                        BildZeile(r, ich.name ?: "—", "${leaderWert(ich)} ${leaderEinheit(ich)}", true, land = ich.land) } })
                lbBild = TeamBildDaten(I18n.t(art), unter, zeilen, "pumpfoil-$lbMetric.png")
            }) {
                Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(I18n.t("team.bild.titel"))
            }
        }
    }
    lbBild?.let { TeamBildDialog(it, onClose = { lbBild = null }) }
}
