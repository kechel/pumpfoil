package org.pumpfoil.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/*
 * Event-Seite (01.11.2026, docs/TEAMS.md „Native-Port"), nativ aus web/src/pages/TeamEventSeite.tsx: Bild, Titel und
 * Status, Zeitraum und Beschreibung fett; vor dem Start ein grosser Countdown, waehrenddessen „Endet in"; die gewaehlten
 * Gesamtsummen ueber den Bestenlisten; zuletzt die Box „Event-Regeln". Wer nicht Mitglied ist, kann hier beitreten
 * (mit dem Kleingedruckten), Leitung/Moderatoren bearbeiten das Event im Browser (Zahnrad).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TeamEventScreen(
    slug: String,
    eventId: Int,
    onBack: () -> Unit,
    onOpenTeam: (String) -> Unit,
    onOpenSession: (Int) -> Unit,
) {
    var team by remember(slug) { mutableStateOf<TeamInfo?>(null) }
    var ev by remember(slug, eventId) { mutableStateOf<TeamEvent?>(null) }
    var fehlt by remember(slug, eventId) { mutableStateOf(false) }
    var neuLaden by remember { mutableIntStateOf(0) }
    var dialog by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val uri = LocalUriHandler.current

    LaunchedEffect(slug, neuLaden) {
        try { team = Api.team(slug) } catch (_: Exception) { if (team == null) fehlt = true }
    }
    LaunchedEffect(slug, eventId) {
        try { ev = Api.teamEvent(slug, eventId) } catch (_: Exception) { fehlt = true }
    }

    val t = team
    val e = ev
    val f = teamFarbe(t?.farbe)
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    // Zurueck zum Team: Wappen + Teamname (wie der Link oben auf der Web-Seite).
                    if (t != null) Row(verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { onOpenTeam(t.slug) }) {
                        TeamWappen(t.name, t.logoUrl, t.farbe, 24.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(t.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) }
                },
                actions = {
                    // Teilen nur bei oeffentlichen Bestenlisten — dort sehen auch Gaeste das Event (wie Web EventTeilen).
                    if (t != null && e != null && t.bestenlistenOeffentlich) {
                        IconButton(onClick = { teilenUrl(ctx, teamWebUrl("/teams/${t.slug}/events/${e.id}"), e.titel) }) {
                            Icon(Icons.Filled.Share, contentDescription = I18n.t("team.teilen"))
                        }
                    }
                    if (t != null && e != null && t.verwalter) {
                        IconButton(onClick = { runCatching { uri.openUri(teamWebUrl("/teams/${t.slug}/events/${e.id}")) } }) {
                            Icon(Icons.Filled.Settings, contentDescription = I18n.t("team.event.bearbeiten"))
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
                t == null || e == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                    meldung?.let {
                        Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                            Text(it, Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    // Eigenes Eventbild, sonst das Teambild (wenn `teambild_zeigen`).
                    val bild = e.bannerUrl?.let { it to e.bannerFokus }
                        ?: if (e.teambildZeigen) t.bannerUrl?.let { it to t.bannerFokus } else null
                    bild?.let { (u, fk) -> TeamBanner(u, fk, Modifier.padding(bottom = 12.dp)) }

                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(e.titel, color = f.akzent, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                            modifier = Modifier.align(Alignment.CenterVertically))
                        Box(Modifier.align(Alignment.CenterVertically)) { EventStatusChip(e.status, f) }
                    }
                    Text(
                        eventZeitraum(e.start, e.ende, e.zeitzone) +
                            (if (e.spots.isNotEmpty()) " · " + e.spots.joinToString(", ") { it.name ?: "#${it.id}" } else ""),
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp),
                    )
                    e.beschreibung?.trim()?.takeIf { it.isNotEmpty() }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                    }
                    Box(Modifier.padding(vertical = 12.dp).fillMaxWidth().height(2.dp).background(f.akzent))

                    // Angemeldet ohne Mitgliedschaft: Beitreten in Teamfarbe; bei laufender Anfrage nur der Hinweis.
                    if (t.anmeldungenZulassen && t.meinStatus == null) {
                        Column(Modifier.padding(bottom = 12.dp)) {
                            TeamKnopf(I18n.t("team.join.knopf"), f, onClick = { dialog = true })
                            Text(I18n.t("team.join.eventHinweis").replace("{name}", t.name), style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    if (t.meinStatus == "angefragt") {
                        Text(I18n.t("team.join.wartet"), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 12.dp))
                    }

                    Text(I18n.t(eventStandKey(e.status)), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp))
                    if (e.status == "kommend") {
                        EventCountdown(e, f)
                    } else {
                        if (e.status == "laeuft") {
                            Card(Modifier.fillMaxWidth().padding(bottom = 12.dp), border = BorderStroke(2.dp, f.akzent)) {
                                Column(Modifier.fillMaxWidth().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(I18n.t("team.event.endetIn").uppercase(), style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(Modifier.height(6.dp))
                                    EventUhr(e.ende, f, klein = true)
                                }
                            }
                        }
                        val summen = EVENT_SUMMEN.filter { it.first in e.summenAuswahl }
                        if (summen.isNotEmpty()) {
                            Text(I18n.t("team.event.teamGesamt").uppercase(), style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 6.dp))
                            TeamZahlRaster(summen.map { (key, label, fmt) -> fmt(e.summen[key] ?: 0.0) to I18n.t(label) }, f,
                                spalten = 2, rand = true)
                            Spacer(Modifier.height(12.dp))
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            e.tafeln.forEach { TeamTafelKarte(it, f, onOpenSession, ohneFilter = true) }
                        }
                    }

                    // Event-Regeln: zuerst was gemessen wird, „nur Uhr/App/Konto", die Upload-Frist (Auswertung), dann die
                    // allgemeinen Regeln (Web, 01.11.2026).
                    Card(Modifier.fillMaxWidth().padding(top = 16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.padding(14.dp)) {
                            Text(I18n.t("team.event.regelnTitel"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(6.dp))
                            val punkte = buildList {
                                eventGemessen(e).takeIf { it.isNotEmpty() }?.let { add("${I18n.t("team.event.gemessen")}: $it") }
                                if (e.ohneDateien) add(I18n.t("team.event.ohneDateienKurz"))
                                if (e.status == "auswertung") add(I18n.t("team.event.auswertungHinweis")
                                    .replace("{bis}", eventZeit(e.einfrierenAm, e.zeitzone)))
                                addAll(I18n.t("team.regeln.events.text").split("\n").filter { it.isNotBlank() })
                            }
                            punkte.forEach { p ->
                                Row(Modifier.padding(vertical = 2.dp)) {
                                    Text("•", Modifier.width(14.dp), style = MaterialTheme.typography.bodyMedium)
                                    Text(p, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }

    if (dialog && t != null) {
        TeamBeitrittDialog(t.name, t.oeffentlich, !t.automatischAkzeptieren, busy, t.farbe,
            onJa = {
                busy = true
                scope.launch {
                    try {
                        val r = Api.teamBeitreten(t.slug)
                        meldung = I18n.t(if (r.status == "aktiv") "team.join.erfolg" else "team.join.angefragt")
                        neuLaden++
                    } catch (ex: Exception) { meldung = teamFehlerText(ex) }
                    dialog = false
                    busy = false
                }
            },
            onNein = { dialog = false })
    }
}

/** Vor dem Start: grosser Countdown, darunter das genaue Zeitfenster und bis wann Uploads zaehlen. */
@Composable
private fun EventCountdown(e: TeamEvent, f: TeamFarbe) {
    val (von, bis) = eventZeitraumGenau(e.start, e.ende, e.zeitzone)
    Card(Modifier.fillMaxWidth(), border = BorderStroke(2.dp, f.akzent)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(I18n.t("team.event.startIn").uppercase(), style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            EventUhr(e.start, f, klein = false)
            Spacer(Modifier.height(14.dp))
            Text(von, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text("–", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(bis, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            Text(I18n.t("team.event.uploadsBis").replace("{bis}", eventZeit(e.einfrierenAm, e.zeitzone)),
                style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            Text(I18n.t("team.event.nochNichts"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

/** Tage / Std. / Min. / Sek. bis `ziel`, sekundengenau (Web Uhr). `klein` fuer „Endet in" waehrend des Events. */
@Composable
private fun EventUhr(ziel: String, f: TeamFarbe, klein: Boolean) {
    val rest = restSekunden(ziel, rememberJetzt())
    val teile = listOf(rest / 86400 to "team.event.tage", rest / 3600 % 24 to "team.event.stunden",
        rest / 60 % 60 to "team.event.minuten", rest % 60 to "team.event.sekunden")
    Row(horizontalArrangement = Arrangement.spacedBy(if (klein) 6.dp else 8.dp)) {
        teile.forEach { (n, k) ->
            Card(Modifier.widthIn(min = if (klein) 56.dp else 68.dp)) {
                Column(Modifier.padding(horizontal = 8.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(n.toString().padStart(if (k == "team.event.tage") 1 else 2, '0'), color = f.akzent, fontWeight = FontWeight.Bold,
                        style = if (klein) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineMedium)
                    Text(I18n.t(k), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
