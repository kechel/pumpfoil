package org.pumpfoil.app

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Flag
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

/*
 * Teams & Events in Listen (01.11.2026, docs/TEAMS.md „Native-Port"): Community-Abschnitt „Laufende & kommende Events"
 * (Web Home.tsx TeamsSection), „Alle Teams" mit Suche (TeamsAlle.tsx), „Alle Events" endlos scrollend (EventsAlle.tsx)
 * und die Teams als kleine Links auf der Startseite (PersonalHome.tsx, neben dem Homespot).
 */

/** Community-Abschnitt: laufende und in den naechsten Tagen beginnende Events, Links zu „Alle Events"/„Alle Teams". */
@Composable
fun CommunityEventsAbschnitt(onOpenEvent: (String, Int) -> Unit, onAlleEvents: () -> Unit, onAlleTeams: () -> Unit) {
    var events by remember { mutableStateOf<List<TeamEventKurz>?>(null) }
    LaunchedEffect(Unit) { events = try { Api.teamsEventsAktuell() } catch (_: Exception) { emptyList() } }
    Column(Modifier.padding(horizontal = 12.dp).padding(top = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(6.dp))
            Text(I18n.t("team.eventsAktuell"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onAlleEvents) { Text(I18n.t("team.alleEvents") + " →") }
            TextButton(onClick = onAlleTeams) { Text(I18n.t("team.alle") + " →") }
        }
        val l = events
        if (l != null && l.isEmpty()) {
            Text(I18n.t("team.event.keineAktuellen"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        l?.forEach { e ->
            EventKachel(e, onClick = { onOpenEvent(e.team.slug, e.id) }, modifier = Modifier.padding(bottom = 8.dp))
        }
    }
}

/** „Alle Teams": freigegebene Teams mit Suche; „Team gruenden" fuehrt ins Web. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamsAlleScreen(onBack: () -> Unit, onOpenTeam: (String) -> Unit) {
    var rows by remember { mutableStateOf<List<TeamListenEintrag>?>(null) }
    var q by remember { mutableStateOf("") }
    val uri = LocalUriHandler.current
    LaunchedEffect(Unit) { rows = try { Api.teamsListe() } catch (_: Exception) { emptyList() } }
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("team.alle")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) } },
            actions = {
                TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams")) } }) { Text(I18n.t("team.gruenden") + " ↗") }
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
                                    Text(tm.name, color = f.akzent, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        I18n.t("team.mitgliederAnzahl").replace("{n}", tm.mitgliederAnzahl.toString()) +
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
            title = { Text(I18n.t("team.alleEvents")) },
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
 * Anfragen als Zahl. Gruenden bleibt im Web (Adresse, Freigabe, Einstellungen) — der Knopf oeffnet es im Browser.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeineTeamsScreen(onBack: () -> Unit, onOpenTeam: (String) -> Unit, onAlleTeams: () -> Unit) {
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
                                Text(m.name, color = teamFarbe(m.farbe).akzent, fontWeight = FontWeight.SemiBold,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                    TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams")) } }) { Text(I18n.t("team.gruenden") + " ↗") }
                    Text(I18n.t("team.gruendenHinweis"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp))
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
 * Eigene Teams als kleine Links auf der Startseite (Web PersonalHome, neben dem Homespot): Wappen, Name in Teamfarbe,
 * offene Anfragen (nur Leitung/Moderatoren > 0) als Zahl daneben. Der Link fuehrt immer auf die Teamseite.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MeineTeamsLinks(teams: List<TeamKurz>, onOpenTeam: (String) -> Unit, modifier: Modifier = Modifier) {
    if (teams.isEmpty()) return
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        teams.forEach { tm ->
            val f = teamFarbe(tm.farbe)
            Row(verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { onOpenTeam(tm.slug) }.padding(vertical = 4.dp, horizontal = 2.dp)) {
                TeamWappen(tm.name, tm.logoUrl, tm.farbe, 18.dp)
                Spacer(Modifier.width(4.dp))
                Text(tm.name, color = f.akzent, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 160.dp))
                if (tm.anfragen > 0) {
                    Spacer(Modifier.width(4.dp))
                    Text(tm.anfragen.toString(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 6.dp))
                }
            }
        }
    }
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
                            Text(x.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(I18n.t("team.mitgliederAnzahl").replace("{n}", x.mitgliederAnzahl.toString()) +
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
 * laeuft", darunter die Teamsuche und erst dann „Team gruenden" (bleibt im Web). Ohne LazyColumn, die Seite scrollt.
 */
@Composable
fun MeineTeamsInhalt(onOpenTeam: (String) -> Unit, onAlleTeams: () -> Unit) {
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
                            Text(m.name, color = teamFarbe(m.farbe).akzent, fontWeight = FontWeight.SemiBold,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        TextButton(onClick = onAlleTeams) { Text(I18n.t("team.alle") + " →") }
        TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams")) } }) { Text(I18n.t("team.gruenden") + " ↗") }
        Text(I18n.t("team.gruendenHinweis"), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp))
        TextButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams/regeln")) } }) { Text(I18n.t("team.regeln.link") + " ↗") }
    }
}
