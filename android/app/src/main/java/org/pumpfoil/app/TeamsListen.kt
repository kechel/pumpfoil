package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

/*
 * Teams & Events in Listen (01.11.2026, docs/TEAMS.md „Native-Port"): Community-Abschnitt „Laufende & kommende Events"
 * (Web Home.tsx TeamsSection), „Alle Teams" mit Suche (TeamsAlle.tsx), „Alle Events" endlos scrollend (EventsAlle.tsx)
 * und die Teams als kleine Links auf der Startseite (PersonalHome.tsx, neben dem Homespot).
 */

/**
 * Community-Abschnitt „Globale Events" (Web Home.tsx TeamsSection, seit 06.11.2026): der Server liefert hier nur noch
 * globale Events (jeder nimmt teil), Team-Events stehen auf der Teamseite. Darunter „Events deiner Teams" (laufend,
 * kommend, letzte 7 Tage) — nur fuer Mitglieder und nur, wenn es welche gibt.
 */
@Composable
fun CommunityEventsAbschnitt(onOpenEvent: (String, Int) -> Unit, onAlleEvents: () -> Unit, onAlleTeams: () -> Unit) {
    var events by remember { mutableStateOf<List<TeamEventKurz>?>(null) }
    var meine by remember { mutableStateOf<List<TeamEventKurz>>(emptyList()) }
    LaunchedEffect(Unit) { events = try { Api.teamsEventsAktuell() } catch (_: Exception) { emptyList() } }
    LaunchedEffect(Unit) { meine = try { Api.teamsEventsMeine() } catch (_: Exception) { emptyList() } }
    Column(Modifier.padding(horizontal = 12.dp).padding(top = 8.dp)) {
        EventUeberschrift(I18n.t("team.eventsGlobal"))
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onAlleEvents) { Text(I18n.t("team.alleEvents") + " →") }
            TextButton(onClick = onAlleTeams) { Text(I18n.t("team.alle") + " →") }
        }
        val l = events
        if (l != null && l.isEmpty()) {
            Text(I18n.t("team.event.keineGlobalen"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        l?.forEach { e ->
            EventKachel(e, onClick = { onOpenEvent(e.team.slug, e.id) }, modifier = Modifier.padding(bottom = 8.dp))
        }
        if (meine.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            EventUeberschrift(I18n.t("team.eventsMeineTeams"))
            Spacer(Modifier.height(6.dp))
            meine.forEach { e ->
                EventKachel(e, onClick = { onOpenEvent(e.team.slug, e.id) }, modifier = Modifier.padding(bottom = 8.dp))
            }
        }
    }
}

/** Ueberschrift eines Event-Abschnitts mit der Fahne (Web FlagIcon/EventIcon + h3). */
@Composable
internal fun EventUeberschrift(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(EventSymbol, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
    }
}

// ------------------------------------------------------------------------- Event-Hinweise ----
// Wie web/src/components/EventHinweis.tsx (Jan, 06.11.2026): eine Zeile auf Home › Uebersicht fuer globale Events
// (laufend oder in den naechsten 24 h beginnend), je Event wegklickbar (`foil_event_weg`, nur eine Komfort-Erinnerung);
// Abzeichen fuer die Reiter; die Events der eigenen Teams als Kacheln auf Home › Team.

private const val EVENT_WEG = "foil_event_weg"
private const val BALD_MS = 24 * 3600 * 1000L

/** Abzeichen-Daten: laeuft eines, und wie viele beginnen bald (Web useEventAbzeichen / useTeamEventAbzeichen). */
data class EventAbzeichenDaten(val live: Boolean = false, val bald: Int = 0)

/** `meine = false`: globale Events (Community-Reiter), `true`: Events der eigenen Teams (Home-Reiter „Team"). */
@Composable
fun rememberEventAbzeichen(meine: Boolean): EventAbzeichenDaten {
    var d by remember(meine) { mutableStateOf(EventAbzeichenDaten()) }
    LaunchedEffect(meine) {
        runCatching { if (meine) Api.teamsEventsMeine() else Api.teamsEventsAktuell() }.getOrNull()?.let { l ->
            d = EventAbzeichenDaten(l.any { it.status == "laeuft" }, l.count { it.status == "kommend" })
        }
    }
    return d
}

/**
 * Home › Uebersicht: laufendes oder in 24 h beginnendes globales Event als Zeile mit Countdown und Abzeichen rechts.
 * Antippen fuehrt in die Community › Teams & Events (Jan: „dann lernt man direkt wo das immer steht").
 */
@Composable
fun GlobaleEventHinweise(onOeffnen: () -> Unit, modifier: Modifier = Modifier) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
    var weg by remember { mutableStateOf(runCatching { prefs.getString(EVENT_WEG, null).orEmpty().split(",").filter { it.isNotBlank() } }.getOrDefault(emptyList())) }
    var events by remember { mutableStateOf<List<TeamEventKurz>>(emptyList()) }
    LaunchedEffect(Unit) { events = try { Api.teamsEventsAktuell() } catch (_: Exception) { emptyList() } }
    if (events.isEmpty()) return   // ohne Events auch keine Sekunden-Uhr
    val jetzt = rememberJetzt()
    val zeigen = events.filter { e ->
        if ("${e.team.slug}-${e.id}" in weg) false
        else e.status == "laeuft" ||
            (e.status == "kommend" && (isoInstant(e.start)?.toEpochMilli() ?: Long.MAX_VALUE) - jetzt < BALD_MS)
    }
    if (zeigen.isEmpty()) return
    val marke = MaterialTheme.colorScheme.primary
    val akzent = markenAkzent()
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        zeigen.forEach { e ->
            val k = "${e.team.slug}-${e.id}"
            val live = e.status == "laeuft"
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(marke.copy(alpha = 0.10f))
                .border(1.dp, marke.copy(alpha = 0.4f), RoundedCornerShape(16.dp)).clickable(onClick = onOeffnen)
                .padding(start = 14.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(EventSymbol, contentDescription = null, tint = akzent, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(buildAnnotatedString {
                    withStyle(SpanStyle(color = akzent, fontWeight = FontWeight.SemiBold)) { append(e.titel) }
                    withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant)) { append(" · ") }
                    withStyle(SpanStyle(color = akzent, fontWeight = FontWeight.SemiBold)) {
                        append(I18n.t(if (live) "team.event.endetIn" else "team.event.startIn") + " " +
                            countdownText(restSekunden(if (live) e.ende else e.start, jetzt)))
                    }
                    append(" →")
                }, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f).padding(vertical = 6.dp))
                Spacer(Modifier.width(6.dp))
                // Hoechstbreite, damit das Abzeichen umbricht statt dem Titel den Platz zu nehmen (Jan, 06.11.2026).
                Text(I18n.t(if (live) "eventHinweis.live" else "eventHinweis.bald"), style = MaterialTheme.typography.labelMedium,
                    color = if (live) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.widthIn(max = 96.dp).clip(RoundedCornerShape(10.dp))
                        .background(if (live) marke else MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 8.dp, vertical = 2.dp))
                IconButton(onClick = {
                    val neu = (weg + k).takeLast(50)
                    runCatching { prefs.edit().putString(EVENT_WEG, neu.joinToString(",")).apply() }
                    weg = neu
                }) { Icon(Icons.Filled.Close, contentDescription = I18n.t("banner.dismiss"), modifier = Modifier.size(18.dp)) }
            }
        }
    }
}

/** Home › Team (Web TeamEventsListe, 06.11.2026): die Events der eigenen Teams als Kacheln — laufend, kommend, letzte 7 Tage. */
@Composable
fun TeamEventsListe(onOpenEvent: (String, Int) -> Unit, modifier: Modifier = Modifier) {
    var events by remember { mutableStateOf<List<TeamEventKurz>>(emptyList()) }
    LaunchedEffect(Unit) { events = try { Api.teamsEventsMeine() } catch (_: Exception) { emptyList() } }
    if (events.isEmpty()) return
    Column(modifier.fillMaxWidth()) {
        EventUeberschrift(I18n.t("team.eventsMeineTeams"))
        Spacer(Modifier.height(6.dp))
        events.forEach { e -> EventKachel(e, onClick = { onOpenEvent(e.team.slug, e.id) }, modifier = Modifier.padding(bottom = 8.dp)) }
    }
}

/** „Alle Teams": freigegebene Teams mit Suche; „Team gruenden" fuehrt zu „Meine Teams" (dort nativ, 04.11.2026). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamsAlleScreen(onBack: () -> Unit, onOpenTeam: (String) -> Unit, onGruenden: () -> Unit = {}) {
    var rows by remember { mutableStateOf<List<TeamListenEintrag>?>(null) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { rows = try { Api.teamsListe() } catch (_: Exception) { emptyList() } }
    Scaffold(topBar = {
        TopAppBar(
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(TeamSymbol, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp)); Text(I18n.t("team.alle"))
                }
            },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) } },
            actions = {
                TextButton(onClick = onGruenden) { Text(I18n.t("team.gruenden")) }
                FeedbackKnopf()
            },
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutlinedTextField(value = q, onValueChange = { q = it }, singleLine = true, label = { Text(I18n.t("team.alleSuche")) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp))
            val alle = rows
            val treffer = alle.orEmpty().filter { passtZu(q, it.name, it.slug, it.beschreibung) }
            when {
                alle == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                alle.isEmpty() -> HinweisText(I18n.t("team.communityLeer"))
                treffer.isEmpty() -> HinweisText(I18n.t("team.alleLeer"))
                else -> LazyColumn(contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(treffer, key = { it.id }) { tm ->
                        val f = teamFarbe(tm.farbe)
                        Card(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOpenTeam(tm.slug) }) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                TeamWappen(tm.name, tm.logoUrl, tm.farbe, 40.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {   // Name + Herkunft (Web TeamHerkunft)
                                        Text(tm.name, color = f.akzent, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false))
                                        Spacer(Modifier.width(6.dp)); TeamHerkunftZeichen(tm.land)
                                    }
                                    Text(
                                        I18n.t(if (tm.mitgliederAnzahl == 1) "team.mitgliederAnzahl1" else "team.mitgliederAnzahl").replace("{n}", tm.mitgliederAnzahl.toString()) +
                                            (if (tm.sportarten.isNotEmpty()) " · " + sportartenText(tm.sportarten) else ""),
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private const val EVENT_SEITE = 20

/** „Alle Events": laufend, kommend, vergangen — endlos scrollend, 20 je Abruf (Web EventsAlle.tsx). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventsAlleScreen(onBack: () -> Unit, onOpenEvent: (String, Int) -> Unit) {
    var events by remember { mutableStateOf<List<TeamEventKurz>?>(null) }
    var mehr by remember { mutableStateOf(true) }
    val liste = rememberLazyListState()
    // Nachladen, sobald die letzten drei Eintraege sichtbar werden (wie der 300-px-Vorlauf im Web).
    val amEnde by remember {
        derivedStateOf {
            val info = liste.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: 0) >= info.totalItemsCount - 3
        }
    }
    LaunchedEffect(Unit) {
        while (mehr) {
            snapshotFlow { amEnde }.first { it }
            val neu = try { Api.teamsEventsAlle(events?.size ?: 0, EVENT_SEITE) }
                      catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            if (neu == null) { mehr = false; if (events == null) events = emptyList(); break }
            if (neu.size < EVENT_SEITE) mehr = false
            val l = events.orEmpty() + neu
            events = l
            if (l.isEmpty()) break
            // Warten, bis die Liste mit den neuen Eintraegen gelegt ist — sonst gaelte das alte Ende noch als sichtbar.
            snapshotFlow { liste.layoutInfo.totalItemsCount }.first { it >= l.size }
        }
    }
    Scaffold(topBar = {
        TopAppBar(
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(EventSymbol, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp)); Text(I18n.t("team.alleEvents"))
                }
            },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) } },
            actions = { FeedbackKnopf() },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val l = events
            when {
                l == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                l.isEmpty() -> HinweisText(I18n.t("team.alleEventsLeer"))
                else -> LazyColumn(state = liste, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(l, key = { "${it.team.slug}-${it.id}" }) { e -> EventKachel(e, onClick = { onOpenEvent(e.team.slug, e.id) }) }
                    if (mehr) item {
                        Box(Modifier.fillMaxWidth().padding(8.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center).size(24.dp)) }
                    }
                }
            }
        }
    }
}

/**
 * „Meine Teams" (Web Teams.tsx, Einstieg ueber das Profil): eigene Teams mit Rolle bzw. „Anfrage laeuft", offene
 * Anfragen als Zahl, darunter „Team gruenden" (nativ seit 04.11.2026, TeamVerwaltung.kt).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeineTeamsScreen(onBack: () -> Unit, onOpenTeam: (String) -> Unit, onAlleTeams: () -> Unit, onTeamGegruendet: (String) -> Unit = {}) {
    var meine by remember { mutableStateOf<List<TeamKurz>?>(null) }
    val uri = LocalUriHandler.current
    LaunchedEffect(Unit) { meine = try { Api.teamsMine() } catch (_: Exception) { emptyList() } }
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("team.meine")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) } },
            actions = { FeedbackKnopf() },
        )
    }) { pad ->
        val l = meine
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when {
                l == null -> item { Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) } }
                l.isEmpty() -> item { HinweisText(I18n.t("team.keineTeams")) }
                else -> items(l, key = { it.id }) { m ->
                    Card(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOpenTeam(m.slug) }) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            TeamWappen(m.name, m.logoUrl, m.farbe, 40.dp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(m.name, color = teamFarbe(m.farbe).akzent, fontWeight = FontWeight.SemiBold,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                    Spacer(Modifier.width(6.dp)); TeamHerkunftZeichen(m.land)
                                }
                                Text(if (m.status == "angefragt") I18n.t("team.join.wartet") else I18n.t("team.rolle.${m.rolle}"),
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (m.sportarten.isNotEmpty()) Text(sportartenText(m.sportarten), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (m.anfragen > 0) {
                                Text(m.anfragen.toString(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 7.dp, vertical = 1.dp))
                            }
                        }
                    }
                }
            }
            item {
                Column(Modifier.padding(top = 8.dp)) {
                    TextButton(onClick = onAlleTeams) { Text(I18n.t("team.alle") + " →") }
                    TeamGruendenKarte(onTeamGegruendet)
                    TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams/regeln")) } }) { Text(I18n.t("team.regeln.link") + " ↗") }
                }
            }
        }
    }
}

@Composable
private fun HinweisText(text: String) {
    Text(text, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/**
 * Teamsuche (Web Teams.tsx `TeamSuche`, 04.11.2026): alle freigegebenen Teams, Treffer erst mit Suchtext, nach Mitgliedern
 * sortiert. Vergleich mit `passtZu` (Suche.kt: klein, ohne Akzente, Bindestriche und Leerzeichen, jedes Wort muss vorkommen).
 * Steht in Einstellungen › Team ueber „Team gruenden" und auf Home › Team, solange man in keinem Team ist.
 */
@Composable
fun TeamSuche(onOpenTeam: (String) -> Unit, modifier: Modifier = Modifier) {
    var q by remember { mutableStateOf("") }
    var alle by remember { mutableStateOf<List<TeamListenEintrag>?>(null) }
    LaunchedEffect(Unit) { alle = try { Api.teamsListe() } catch (_: Exception) { emptyList() } }
    val treffer = if (q.isBlank()) emptyList()
                  else alle.orEmpty().filter { passtZu(q, it.name, it.slug) }.sortedByDescending { it.mitgliederAnzahl }
    Card(modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("team.finden"), fontWeight = FontWeight.SemiBold)
            OutlinedTextField(value = q, onValueChange = { q = it }, singleLine = true,
                placeholder = { Text(I18n.t("team.findenPlatzhalter")) },
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
            if (q.isNotBlank() && alle != null) {
                if (treffer.isEmpty()) Text(I18n.t("gear.noHits"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                treffer.forEach { x ->
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp).clip(RoundedCornerShape(10.dp)).clickable { onOpenTeam(x.slug) }
                            .padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        TeamWappen(x.name, x.logoUrl, x.farbe, 36.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(x.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false))
                                Spacer(Modifier.width(6.dp)); TeamHerkunftZeichen(x.land)
                            }
                            Text(I18n.t(if (x.mitgliederAnzahl == 1) "team.mitgliederAnzahl1" else "team.mitgliederAnzahl").replace("{n}", x.mitgliederAnzahl.toString()) +
                                    (if (x.sportarten.isNotEmpty()) " · " + sportartenText(x.sportarten) else ""),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/**
 * Einstellungen › Team (Web Settings.tsx, Reiter „Team" = Teams.tsx eingebettet): eigene Teams mit Rolle bzw. „Anfrage
 * laeuft", darunter die Teamsuche und erst dann „Team gruenden" (nativ). Ohne LazyColumn, die Seite scrollt.
 */
@Composable
fun MeineTeamsInhalt(onOpenTeam: (String) -> Unit, onAlleTeams: () -> Unit, onTeamGegruendet: (String) -> Unit = {}) {
    var meine by remember { mutableStateOf<List<TeamKurz>?>(null) }
    val uri = LocalUriHandler.current
    LaunchedEffect(Unit) { meine = try { Api.teamsMine() } catch (_: Exception) { emptyList() } }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val l = meine
        when {
            l == null -> Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            l.isEmpty() -> Text(I18n.t("team.keineTeams"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> l.forEach { m ->
                Card(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOpenTeam(m.slug) }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        TeamWappen(m.name, m.logoUrl, m.farbe, 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(m.name, color = teamFarbe(m.farbe).akzent, fontWeight = FontWeight.SemiBold,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                Spacer(Modifier.width(6.dp)); TeamHerkunftZeichen(m.land)
                            }
                            Text(if (m.status == "angefragt") I18n.t("team.join.wartet") else I18n.t("team.rolle.${m.rolle}"),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (m.anfragen > 0) {
                            Text(m.anfragen.toString(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 7.dp, vertical = 1.dp))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        TeamSuche(onOpenTeam)
        // Gruenden nativ unter der Teamsuche (Web Teams.tsx, 04.11.2026); danach in die Verwaltung (Grunddaten).
        TeamGruendenKarte(onTeamGegruendet)
        TextButton(onClick = onAlleTeams) { Text(I18n.t("team.alle") + " →") }
        TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams/regeln")) } }) { Text(I18n.t("team.regeln.link") + " ↗") }
    }
}
