package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

/*
 * Teamseite (01.11.2026, docs/TEAMS.md „Native-Port"), nativ aus web/src/pages/Team.tsx. Mitglieder sehen Bestenlisten,
 * Teamsummen, Logbuch und Events; Angemeldete ohne Mitgliedschaft den freigegebenen Auftritt und — wenn zugelassen —
 * „Beitreten". Was wer sehen darf, entscheidet der Server (`darf_bestenlisten`, `darf_mitglieder`, `chat_scope`).
 * Leitung und Moderatoren bekommen das Zahnrad zur Verwaltung (auch der Knopf „N neue Anfragen"); die ist seit
 * 04.11.2026 nativ (TeamVerwaltung.kt), vorher oeffnete sie im Browser.
 */

internal val TEAM_ZEITRAEUME = listOf("today" to "period.today", "yesterday" to "period.yesterday", "10d" to "period.10d", "30d" to "period.30d",
    "365d" to "period.365d", "all" to "period.all")

/** Zeitraum-Chip in Teamfarbe (gewaehlt: Flaeche + passende Schrift). */
@Composable
internal fun teamChipFarben(f: TeamFarbe) = FilterChipDefaults.filterChipColors(
    selectedContainerColor = f.flaeche, selectedLabelColor = f.aufFlaeche,
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TeamScreen(
    slug: String,
    onBack: () -> Unit,
    onOpenEvent: (String, Int) -> Unit,
    onOpenSession: (Int) -> Unit,
    onChat: (scope: String, label: String) -> Unit,
    onVerwalten: (String) -> Unit = {},
    social: Boolean = true,
) {
    var kopf by remember(slug) { mutableStateOf<TeamInfo?>(null) }
    var fehlt by remember(slug) { mutableStateOf(false) }
    var neuLaden by remember(slug) { mutableIntStateOf(0) }
    var period by remember(slug) { mutableStateOf("30d") }
    var tafeln by remember(slug) { mutableStateOf<List<TeamTafel>?>(null) }
    var stat by remember(slug) { mutableStateOf<TeamStatistik?>(null) }
    var logbuch by remember(slug) { mutableStateOf<List<TeamLogbuchEintrag>?>(null) }
    var events by remember(slug) { mutableStateOf<List<TeamEvent>?>(null) }
    var mitglieder by remember(slug) { mutableStateOf<List<TeamMitglied>?>(null) }
    var dialog by remember { mutableStateOf(false) }
    var austretenFrage by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var meldung by remember(slug) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val uri = LocalUriHandler.current

    LaunchedEffect(slug, neuLaden) {
        try {
            val d = Api.team(slug)
            kopf = d
            mitglieder = if (d.darfMitglieder) try { Api.teamMitglieder(slug) } catch (_: Exception) { null } else null
        } catch (_: Exception) {
            // Erstes Laden, oder nach dem Austreten aus einem nicht oeffentlichen Team: dann ist es nicht mehr sichtbar.
            if (kopf == null || neuLaden > 0) { kopf = null; fehlt = true }
        }
    }
    // Primaeres Team im Kopf (Web e91a9cc8, 11.11.2026): Stand aus „Meine Teams" (primaer/waehlbar kommen von dort).
    var meine by remember(slug) { mutableStateOf<List<TeamKurz>?>(null) }
    LaunchedEffect(slug, neuLaden) { meine = try { Api.teamsMine() } catch (_: Exception) { null } }
    val darf = kopf?.darfBestenlisten == true
    LaunchedEffect(slug, period, darf) {
        if (!darf) { tafeln = null; stat = null; return@LaunchedEffect }
        tafeln = try { Api.teamBestenlisten(slug, period) } catch (_: Exception) { emptyList() }
        stat = try { Api.teamStatistik(slug, period) } catch (_: Exception) { null }
    }
    LaunchedEffect(slug, darf) {
        if (!darf) { logbuch = null; events = null; return@LaunchedEffect }
        logbuch = try { Api.teamLogbuch(slug) } catch (_: Exception) { null }
        events = try { Api.teamEvents(slug) } catch (_: Exception) { null }
    }

    val k = kopf
    val f = teamFarbe(k?.farbe)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(k?.name ?: I18n.t("team.meine"), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) }
                },
                actions = {
                    // Teamadresse teilen: Mitglieder immer, Fremde nur bei oeffentlichen Bestenlisten (wie Web TeamAdresse).
                    if (k != null && (k.meinStatus == "aktiv" || k.bestenlistenOeffentlich)) {
                        IconButton(onClick = { teilenUrl(ctx, teamWebUrl("/teams/${k.slug}"), k.name) }) {
                            Icon(Icons.Filled.Share, contentDescription = I18n.t("team.teilen"))
                        }
                    }
                    // Zahnrad -> Verwaltung, nativ seit 04.11.2026 (TeamVerwaltung.kt).
                    if (k != null && k.verwalter) {
                        IconButton(onClick = { onVerwalten(k.slug) }) {
                            Icon(Icons.Filled.Settings, contentDescription = I18n.t("team.tab.verwalten"))
                        }
                    }
                    FeedbackKnopf()
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                fehlt -> Text(I18n.t("team.nichtGefunden"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                k == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                    k.bannerUrl?.let { TeamBanner(it, k.bannerFokus, Modifier.padding(bottom = 12.dp)) }

                    // Kopf: Wappen links, Name, darunter Mitglieder · oeffentlich · Sportarten, Beschreibung.
                    Row(verticalAlignment = Alignment.Top) {
                        TeamWappen(k.name, k.logoUrl, k.farbe, 64.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {   // Name + Herkunft (Web TeamHerkunft)
                                Text(k.name, color = f.akzent, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f, fill = false))
                                Spacer(Modifier.width(8.dp)); TeamHerkunftZeichen(k.land, gross = true)
                            }
                            Text(
                                listOfNotNull(
                                    I18n.t(if (k.mitgliederAnzahl == 1) "team.mitgliederAnzahl1" else "team.mitgliederAnzahl").replace("{n}", k.mitgliederAnzahl.toString()),
                                    if (k.bestenlistenOeffentlich) I18n.t("team.oeffentlichBadge") else null,
                                    k.sportarten.takeIf { it.isNotEmpty() }?.let { sportartenText(it) },
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            val ich = meine?.firstOrNull { it.slug == k.slug }
                            if (ich != null && k.meinStatus == "aktiv") {
                                PrimaerTeamMarke(ich, meine.orEmpty().count { it.primaerWaehlbar } > 1, Modifier.padding(top = 6.dp)) {
                                    scope.launch { try { Api.teamPrimaer(k.slug); meine = Api.teamsMine() } catch (_: Exception) {} }
                                }
                            }
                        }
                    }
                    k.beschreibung?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                    }
                    if (k.anfragenOffen > 0 || (k.chatScope != null && social)) {
                        FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            // Offene Anfragen (nur Leitung/Moderatoren) -> Verwaltung.
                            if (k.anfragenOffen > 0) {
                                TeamKnopf(
                                    I18n.t(if (k.anfragenOffen == 1) "team.anfragenEins" else "team.anfragenViele")
                                        .replace("{n}", k.anfragenOffen.toString()),
                                    f, onClick = { onVerwalten(k.slug) })
                            }
                            // Team-Chat: vorhandener Chatraum nach Scope (nur aktive Mitglieder, nicht unter 13).
                            val cs = k.chatScope
                            if (cs != null && social) {
                                OutlinedButton(onClick = { onChat(cs, I18n.t("team.chatTitel").replace("{name}", k.name)) }) {
                                    Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null, tint = f.akzent, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(I18n.t("team.chat"))
                                }
                            }
                        }
                    }
                    Box(Modifier.padding(top = 12.dp).fillMaxWidth().height(2.dp).background(f.akzent))

                    // Reiter direkt unter dem Kopf wie im Web (Team.tsx, Jan 02.11.2026): Rekorde | Events | Logbuch | Mitglieder |
                    // Teilen | Regeln. Mitglieder nur, wenn man sie sehen darf, Teilen nur fuer aktive Mitglieder.
                    val teamReiter = listOfNotNull(
                        ReiterDef("rekorde", I18n.t("side.records")),
                        ReiterDef("events", I18n.t("tab.events")),
                        ReiterDef("logbuch", I18n.t("tab.logbook")),
                        if (mitglieder != null) ReiterDef("mitglieder", I18n.t("team.mitglieder")) else null,
                        if (k.meinStatus == "aktiv") ReiterDef("teilen", I18n.t("team.teilen")) else null,
                        ReiterDef("regeln", I18n.t("tab.rules")),
                    )
                    var tteil by rememberReiter("team", teamReiter.map { it.id }, "rekorde")
                    Reiterleiste(teamReiter, tteil, { tteil = it }, modifier = Modifier.padding(bottom = 12.dp))

                    if (tteil == "regeln") TeamRegelnInhalt()

                    meldung?.let {
                        Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                            Text(it, Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }

                    if (k.meinStatus == null && k.anmeldungenZulassen) {
                        Box(Modifier.padding(bottom = 12.dp)) { TeamKnopf(I18n.t("team.join.knopf"), f, onClick = { dialog = true }) }
                    }
                    if (k.meinStatus == "angefragt") {
                        Row(Modifier.padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(I18n.t("team.join.wartet"), style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = { austretenFrage = true }) { Text(I18n.t("team.zurueckziehen")) }
                        }
                    }

                    // Oben: laufende, kommende und bis eine Woche nach dem Ende auch beendete Events; aeltere darunter mit
                    // derselben Kachel (Jan, 01.11.2026). Reihenfolge oben: laeuft, kommend (naechstes zuerst), dann vorbei.
                    val (oben, unten) = remember(events) { eventsAufteilen(events.orEmpty()) }
                    if (tteil == "events") {
                        if (oben.isEmpty() && unten.isEmpty()) Text(I18n.t("team.event.keineAktuellen"),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        oben.forEach { e ->
                            EventKachel(e, k.farbe, onClick = { onOpenEvent(k.slug, e.id) }, Modifier.padding(bottom = 10.dp))
                        }
                        if (unten.isNotEmpty()) {
                            Text(I18n.t("team.event.vergangen"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
                            unten.forEach { e ->
                                EventKachel(e, k.farbe, onClick = { onOpenEvent(k.slug, e.id) }, Modifier.padding(bottom = 10.dp))
                            }
                        }
                    }

                    if (tteil == "rekorde" && k.darfBestenlisten) {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            TEAM_ZEITRAEUME.forEach { (id, key) ->
                                FilterChip(selected = period == id, onClick = { period = id }, label = { Text(I18n.t(key)) },
                                    colors = teamChipFarben(f))
                            }
                        }
                        stat?.let { s ->
                            Spacer(Modifier.height(6.dp))
                            TeamZahlRaster(listOf(
                                ganzZahl(s.pumps) to I18n.t("team.stat.pumps"),
                                kennzahlWert("sum_distance", s.distanceM) to I18n.t("team.stat.strecke"),
                                kennzahlWert("sum_time", s.timeS) to I18n.t("team.stat.zeit"),
                                ganzZahl(s.sessions) to I18n.t("team.stat.sessions"),
                                ganzZahl(s.runs) to I18n.t("team.stat.laeufe"),
                                "${s.aktive} / ${s.mitglieder}" to I18n.t("team.stat.aktiv"),
                            ), f, spalten = 3)
                        }
                        Spacer(Modifier.height(10.dp))
                        val tl = tafeln
                        when {
                            tl == null -> CircularProgressIndicator(Modifier.padding(8.dp))
                            tl.isEmpty() -> Text(I18n.t("team.keineTafeln"), style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                val sportZeigen = tl.map { it.sportart }.distinct().size > 1
                                tl.forEach { TeamTafelKarte(it, f, onOpenSession, sportZeigen = sportZeigen) }
                            }
                        }
                    }
                    if (tteil != "events" && tteil != "regeln" && !k.darfBestenlisten && k.meinStatus != "angefragt") {
                        Text(I18n.t("team.nurFuerMitglieder"), style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    if (tteil == "mitglieder") mitglieder?.takeIf { it.isNotEmpty() }?.let { ml -> MitgliederKarte(ml, f) }

                    if (tteil == "logbuch" && k.darfBestenlisten) logbuch?.let { LogbuchKarte(it, onOpenSession) }

                    if (tteil == "teilen" && k.meinStatus == "aktiv") TeamAdresseKarte(k, f)

                    if (k.meinStatus == "aktiv" && k.meineRolle != "leiter") {
                        TextButton(onClick = { austretenFrage = true }, modifier = Modifier.padding(top = 12.dp)) {
                            Text(I18n.t("team.austreten"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    // „Auch nur GPS" einmal unten statt an jeder Bestenliste (Jan, 01.11.2026).
                    if (tteil == "rekorde") tafeln?.takeIf { l -> l.any { !it.accelOnly } }?.let { l ->
                        Text(I18n.t(if (l.all { !it.accelOnly }) "team.tafel.gpsAlle" else "team.tafel.gpsEinige"),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 16.dp))
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }

    val kd = kopf
    if (dialog && kd != null) {
        TeamBeitrittDialog(kd.name, kd.oeffentlich, !kd.automatischAkzeptieren, busy, kd.farbe,
            onJa = {
                busy = true
                scope.launch {
                    try {
                        val r = Api.teamBeitreten(kd.slug)
                        meldung = I18n.t(if (r.status == "aktiv") "team.join.erfolg" else "team.join.angefragt")
                        dialog = false
                        neuLaden++
                    } catch (e: Exception) { meldung = teamFehlerText(e); dialog = false }
                    busy = false
                }
            },
            onNein = { dialog = false })
    }
    if (austretenFrage && kd != null) {
        AlertDialog(
            onDismissRequest = { austretenFrage = false },
            text = {
                Text(if (kd.meinStatus == "angefragt") I18n.t("team.zurueckziehenFrage")
                     else I18n.t("team.austretenFrage").replace("{name}", kd.name), style = MaterialTheme.typography.bodyLarge)
            },
            confirmButton = {
                TextButton(onClick = {
                    austretenFrage = false
                    scope.launch {
                        try { Api.teamAustreten(kd.slug); meldung = null; neuLaden++ }
                        catch (e: Exception) { meldung = teamFehlerText(e) }
                    }
                }) { Text(I18n.t(if (kd.meinStatus == "angefragt") "team.zurueckziehen" else "team.austreten")) }
            },
            dismissButton = { TextButton(onClick = { austretenFrage = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
}

/** Events der Teamseite aufteilen: oben laufend/kommend/bis 7 Tage vorbei, unten aeltere (zuletzt beendete zuerst). */
private fun eventsAufteilen(events: List<TeamEvent>): Pair<List<TeamEvent>, List<TeamEvent>> {
    val rang = mapOf("laeuft" to 0, "kommend" to 1, "auswertung" to 2, "beendet" to 3)
    val grenze = System.currentTimeMillis() - 7L * 24 * 3600 * 1000
    val (oben, unten) = events.partition { it.status != "beendet" || (isoInstant(it.ende)?.toEpochMilli() ?: 0L) > grenze }
    val obenSortiert = oben.sortedWith(compareBy<TeamEvent> { rang[it.status] ?: 9 }.thenComparator { a, b ->
        if (a.status == "kommend") a.start.compareTo(b.start) else b.ende.compareTo(a.ende)
    })
    return obenSortiert to unten.sortedByDescending { it.ende }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MitgliederKarte(ml: List<TeamMitglied>, f: TeamFarbe) {
    val oeffne = LocalOpenFoiler.current
    Card(Modifier.fillMaxWidth().padding(top = 16.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("team.mitglieder"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ml.forEach { m ->
                    Row(verticalAlignment = Alignment.CenterVertically,
                        modifier = if (oeffne != null) Modifier.clickable { oeffne(m.userId) } else Modifier) {
                        val av = Api.mediaUrl(m.avatarUrl)
                        if (av != null) AsyncImage(model = av, contentDescription = null,
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                            modifier = Modifier.size(28.dp).clip(CircleShape))
                        else Box(Modifier.size(28.dp).clip(CircleShape).background(f.leicht), contentAlignment = Alignment.Center) {
                            Text(teamInitialen(m.name), style = MaterialTheme.typography.labelMedium)
                        }
                        Spacer(Modifier.width(6.dp))
                        Text(m.name, style = MaterialTheme.typography.bodyMedium)
                        if (m.rolle != "mitglied") {
                            Spacer(Modifier.width(4.dp))
                            Text(I18n.t("team.rolle.${m.rolle}"), style = MaterialTheme.typography.labelMedium, color = f.akzent)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LogbuchKarte(eintraege: List<TeamLogbuchEintrag>, onOpenSession: (Int) -> Unit) {
    Card(Modifier.fillMaxWidth().padding(top = 16.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("team.logbuch"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(I18n.t("team.logbuchHinweis"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            if (eintraege.isEmpty()) Text(I18n.t("team.logbuchLeer"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            eintraege.forEachIndexed { i, e ->
                if (i > 0) HorizontalDivider()
                val was = kennzahlLabel(e.kennzahl)
                val text = (if (e.vorherWert == null) I18n.t("team.logbuch.start") else I18n.t("team.logbuch.gebrochen"))
                    .replace("{name}", e.name ?: "—").replace("{was}", was).replace("{wert}", kennzahlWert(e.kennzahl, e.wert))
                    .replace("{vorher}", e.vorherName ?: "—")
                    .replace("{vorherWert}", e.vorherWert?.let { kennzahlWert(e.kennzahl, it) } ?: "")
                val sid = e.sessionId
                Row(Modifier.fillMaxWidth().then(if (sid != null) Modifier.clickable { onOpenSession(sid) } else Modifier)
                    .padding(vertical = 8.dp)) {
                    Text(kurzDatum(e.gefahrenAm ?: e.erfasstAm), Modifier.width(84.dp), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

/** Team-Regeln nativ (Web pages/TeamRegeln.tsx, eingebettet als Reiter „Regeln"): Einleitung, dann je Abschnitt Titel + Punkte
 *  (die Punkte stehen in EINEM Text je Abschnitt, getrennt durch Zeilenumbrueche). */
private val REGEL_ABSCHNITTE = listOf("was", "rollen", "beitreten", "oeffentlich", "bestenlisten", "statistik", "logbuch",
    "events", "global", "chat", "loeschen", "konto", "haftung")   // „global" wie Web TeamRegeln (9ed3e55c)

@Composable
private fun TeamRegelnInhalt() {
    Text(I18n.t("team.regeln.intro"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 12.dp))
    REGEL_ABSCHNITTE.forEach { a ->
        Card(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
            Column(Modifier.padding(12.dp)) {
                Text(I18n.t("team.regeln.$a.titel"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(bottom = 6.dp))
                I18n.t("team.regeln.$a.text").split("\n").filter { it.isNotBlank() }.forEach { z ->
                    Row(Modifier.padding(bottom = 4.dp)) {
                        Text("•", Modifier.width(14.dp), style = MaterialTheme.typography.bodyMedium)
                        Text(z, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

/** Volle Teamadresse zum Teilen (Web TeamAdresse): Adresse, Kopieren, Teilen, darunter was Gaeste dort gerade sehen. */
@Composable
private fun TeamAdresseKarte(k: TeamInfo, f: TeamFarbe) {
    val ctx = LocalContext.current
    val url = teamWebUrl("/teams/${k.slug}")
    var kopiert by remember { mutableStateOf(false) }
    val zustand = if (k.bestenlistenOeffentlich) "oeffentlich" else if (k.oeffentlich) "wartet" else "intern"
    LaunchedEffect(kopiert) { if (kopiert) { kotlinx.coroutines.delay(2000); kopiert = false } }
    Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("team.adresseTeilen.titel"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            androidx.compose.foundation.text.selection.SelectionContainer {
                Text(url, style = MaterialTheme.typography.bodyMedium, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TeamKnopf(I18n.t(if (kopiert) "team.kopiert" else "team.kopieren"), f, onClick = {
                    val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText(k.name, url))
                    kopiert = true
                })
                OutlinedButton(onClick = { teilenUrl(ctx, url, k.name) }) { Text(I18n.t("team.teilen")) }
            }
            Text(I18n.t("team.adresseTeilen.$zustand"), style = MaterialTheme.typography.bodyMedium,
                color = if (zustand == "oeffentlich") MaterialTheme.colorScheme.onSurfaceVariant else androidx.compose.ui.graphics.Color(0xFFD97706),
                modifier = Modifier.padding(top = 8.dp))
        }
    }
}
