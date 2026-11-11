package org.pumpfoil.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.FilterChip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
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
import androidx.compose.material3.HorizontalDivider
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
 * (mit dem Kleingedruckten), Leitung/Moderatoren bearbeiten das Event ueber das Zahnrad (Popup, TeamVerwaltung.kt).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TeamEventScreen(
    slug: String,
    eventId: Int,
    onBack: () -> Unit,
    onOpenTeam: (String) -> Unit,
    onOpenSession: (Int) -> Unit,
    onPrivacy: () -> Unit = {},
) {
    var team by remember(slug) { mutableStateOf<TeamInfo?>(null) }
    var ev by remember(slug, eventId) { mutableStateOf<TeamEvent?>(null) }
    var fehlt by remember(slug, eventId) { mutableStateOf(false) }
    var neuLaden by remember { mutableIntStateOf(0) }
    var dialog by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<String?>(null) }
    var bearbeiten by remember { mutableStateOf(false) }
    var evLaden by remember { mutableIntStateOf(0) }
    // Eine Bestenliste zur Zeit, per Auswahl wie die Community-Bestenliste (Web 06.11.2026). Bestenliste und Wertungsklasse
    // je Event gemerkt (Web f8927f95, 11.11.2026): zurueck aus einer Session steht dieselbe Auswahl wieder da.
    val merkKey = "$slug/$eventId"
    var wahl by remember(slug, eventId) { mutableIntStateOf(EventAuswahlMerker.wahl[merkKey]?.first ?: 0) }
    // Wertungsklasse (Web a2081ec0, 10.11.2026): "" = alle, sonst w/m/nb; der Server bietet nur Klassen an, die es gibt.
    var klasse by remember(slug, eventId) { mutableStateOf(EventAuswahlMerker.wahl[merkKey]?.second ?: "") }
    LaunchedEffect(merkKey, wahl, klasse) { EventAuswahlMerker.wahl[merkKey] = wahl to klasse }
    var laedt by remember { mutableStateOf(false) }
    var teilBild by remember { mutableStateOf<TeamBildDaten?>(null) }
    // Event-Uebersicht als Bild (Web c0d044a2): Summen + die ersten 3 je Kategorie.
    var uebersicht by remember { mutableStateOf(false) }
    // Globale Events: eigene (aktive) Teams, fuer ihre Zeilen hinter Platz 10 und die Hervorhebung im Bild.
    var meineTeams by remember { mutableStateOf<Set<String>>(emptySet()) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val uri = LocalUriHandler.current

    LaunchedEffect(slug, neuLaden) {
        try { team = Api.team(slug) } catch (_: Exception) { if (team == null) fehlt = true }
    }
    LaunchedEffect(slug, eventId, evLaden, klasse) {
        try { ev = Api.teamEvent(slug, eventId, klasse) } catch (_: Exception) {
            // Nach dem Loeschen im Popup gibt es das Event nicht mehr -> zurueck (Web: zur Teamseite).
            if (evLaden > 0) onBack() else fehlt = true
        }
    }

    LaunchedEffect(ev?.global) {
        if (ev?.global != true) return@LaunchedEffect
        meineTeams = runCatching { Api.teamsMine().filter { it.status == "aktiv" && it.slug != slug }.map { it.slug }.toSet() }
            .getOrDefault(emptySet())
    }

    val t = team
    val e = ev
    val f = teamFarbe(t?.farbe)
    // „Stand 6. Nov., 14:32" in den Listen und im geteilten Bild, solange sich noch etwas aendern kann; danach „Endstand"
    // (Web standFuer, 06.11.2026). Mit Datum — im geteilten Bild muss man sehen, von welchem Tag der Stand ist.
    fun standFuer(tf: TeamTafel?): String? {
        val ev0 = e ?: return null
        if (tf == null) return null
        if (ev0.status == "beendet") return I18n.t("team.event.endstand")
        if (ev0.status == "laeuft" || ev0.status == "auswertung") {
            val i = isoInstant(tf.stand) ?: return null
            val zeit = runCatching {
                android.icu.text.DateFormat.getInstanceForSkeleton("dMMMjjmm", java.util.Locale.forLanguageTag(I18n.lang))
                    .format(java.util.Date(i.toEpochMilli()))
            }.getOrElse { kurzDatum(tf.stand) }
            return I18n.t("team.event.standUm").replace("{zeit}", zeit)
        }
        return null
    }
    // Pille im geteilten Bild, solange das Event nicht final ist („LIVE" bzw. „Auswertung").
    val bildAbzeichen = e?.status?.takeIf { it == "laeuft" || it == "auswertung" }?.let { I18n.t("team.event.status.$it") }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    // Zurueck zum Team: Wappen + Teamname (wie der Link oben auf der Web-Seite). Globale Events gehoeren dem
                    // offiziellen Team, das nirgends als Team auftaucht -> dort kein Link (Web 06.11.2026).
                    if (t != null) Row(verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(enabled = e?.global != true) { onOpenTeam(t.slug) }) {
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
                    // Globale Events sind immer als Gast-Link sichtbar.
                    if (t != null && e != null && (t.bestenlistenOeffentlich || e.global)) {
                        IconButton(onClick = { teilenUrl(ctx, teamWebUrl("/teams/${t.slug}/events/${e.id}"), e.titel) }) {
                            Icon(Icons.Filled.Share, contentDescription = I18n.t("team.teilen"))
                        }
                    }
                    // Zahnrad fuer Leitung/Moderatoren: dasselbe Popup wie in der Verwaltung (nativ seit 04.11.2026).
                    if (t != null && e != null && t.verwalter) {
                        IconButton(onClick = { bearbeiten = true }) {
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
                        if (e.global) Box(Modifier.align(Alignment.CenterVertically)) { GlobalChip() }
                    }
                    Text(
                        eventZeitraum(e.start, e.ende, e.zeitzone) +
                            (if (e.spots.isNotEmpty()) " · " + e.spots.joinToString(", ") { it.name ?: "#${it.id}" } else ""),
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp),
                    )
                    e.beschreibung?.trim()?.takeIf { it.isNotEmpty() }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                    }
                    // Globale Events (Web 06.11.2026): jeder nimmt automatisch teil; darunter der Weg zum Opt-out
                    // (Einstellungen › Privatsphaere, Karte „Globale Events") als Link.
                    if (e.global) {
                        Text(I18n.t("team.event.globalHinweis"), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                        Text(I18n.t("team.event.globalOptOut"), style = MaterialTheme.typography.bodyMedium, color = markenAkzent(),
                            textDecoration = TextDecoration.Underline,
                            modifier = Modifier.padding(top = 2.dp).clip(RoundedCornerShape(4.dp)).clickable(onClick = onPrivacy))
                    }
                    Box(Modifier.padding(vertical = 12.dp).fillMaxWidth().height(2.dp).background(f.akzent))

                    // Angemeldet ohne Mitgliedschaft: Beitreten in Teamfarbe; bei laufender Anfrage nur der Hinweis.
                    // Bei globalen Events gibt es nichts beizutreten.
                    if (!e.global && t.anmeldungenZulassen && t.meinStatus == null) {
                        Column(Modifier.padding(bottom = 12.dp)) {
                            TeamKnopf(I18n.t("team.join.knopf"), f, onClick = { dialog = true })
                            Text(I18n.t("team.join.eventHinweis").replace("{name}", t.name), style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    if (!e.global && t.meinStatus == "angefragt") {
                        Text(I18n.t("team.join.wartet"), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 12.dp))
                    }

                    Text(I18n.t(eventStandKey(e.status)), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp))
                    // Teamwahl globaler Events (Web EventMeinTeam, 10.11.2026): schon vor dem Start, bis 6 h vor dem Ende.
                    val mt = e.meinTeam
                    if (e.global && mt != null && (e.status == "kommend" || e.status == "laeuft")) {
                        EventMeinTeamWahl(slug, e.id, mt) {
                            scope.launch { runCatching { Api.teamEvent(slug, eventId, klasse) }.getOrNull()?.let { ev = it } }
                        }
                    }
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
                            TeamZahlRaster(summen.map { (key, label, fmt) ->
                                val v = e.summen[key] ?: 0.0
                                // Einzahl bei 1 („1 Teilnehmer“, 01.11.2026)
                                fmt(v) to I18n.t(if (v == 1.0 && key == "aktive") "team.event.teilnehmer1" else label)
                            }, f,
                                // Je nach Anzahl ueber die ganze Breite (Web b48a1cac): 1–3 in einer Reihe, 4 als 2 × 2, sonst 3 je Reihe.
                                spalten = when (summen.size) { 1, 2, 3 -> summen.size; 4 -> 2; else -> 3 }, rand = true)
                            Spacer(Modifier.height(12.dp))
                        }
                        // Eine Bestenliste zur Zeit (Auswahl wie in der Community), bei globalen Events darunter ihre
                        // Team-Rangliste. Daneben „Aktualisieren", solange sich noch etwas aendern kann (der Server rechnet
                        // hoechstens alle 2 min neu).
                        val idx = wahl.coerceIn(0, maxOf(0, e.tafeln.size - 1))
                        val neuLadenMoeglich = e.status == "laeuft" || e.status == "auswertung"
                        // Event-Uebersicht als Bild (Web c0d044a2, 07.11.2026), sobald es Bestenlisten oder Summen gibt.
                        val uebersichtMoeglich = e.tafeln.size + e.summenAuswahl.size > 0
                        // Wertungsklasse-Knoepfe (Web 5278f851): ohne Beschriftung in derselben Zeile wie die Auswahl der
                        // Bestenliste; ein Knopf je angebotener Klasse (der Server liefert nur die, die es gibt).
                        val klassenKnoepfe = if (e.klassen.isEmpty()) emptyList() else listOf("") + listOf("w", "m", "nb").filter { it in e.klassen }
                        if (e.tafeln.size > 1 || klassenKnoepfe.isNotEmpty()) {
                            FlowRow(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                if (e.tafeln.size > 1) {
                                    // Mehrere Sportarten (z. B. Pumpfoil und Foil Scoot getrennt): Sportart mit in die Auswahl (Web d6b52f77).
                                    AuswahlFeld(idx.toString(), e.tafeln.mapIndexed { i, tf -> Option(i.toString(), tafelTitel(tf, e)) },
                                        onWahl = { wahl = it.toIntOrNull() ?: 0 },
                                        modifier = Modifier.widthIn(min = 200.dp).weight(1f).align(Alignment.CenterVertically))
                                }
                                klassenKnoepfe.forEach { k ->
                                    FilterChip(
                                        selected = (e.klasse ?: "") == k,
                                        onClick = { if (k != (e.klasse ?: "")) klasse = k },
                                        label = { Text(if (k.isEmpty()) I18n.t("wk.alle") else "${I18n.t("wk.$k")} (${e.klassen[k]})") },
                                        colors = cyanChipColors(),
                                        modifier = Modifier.align(Alignment.CenterVertically),
                                    )
                                }
                            }
                        }
                        if (neuLadenMoeglich || uebersichtMoeglich) {
                            Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (uebersichtMoeglich) {
                                    OutlinedButton(onClick = { uebersicht = true }, contentPadding = PaddingValues(horizontal = 12.dp)) {
                                        Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(I18n.t("team.event.uebersichtTeilen"), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                                Spacer(Modifier.weight(1f))
                                if (neuLadenMoeglich) {
                                    Spacer(Modifier.width(8.dp))
                                    OutlinedButton(enabled = !laedt, onClick = {
                                        laedt = true
                                        scope.launch {
                                            runCatching { Api.teamEvent(slug, eventId, klasse) }.getOrNull()?.let { ev = it }
                                            laedt = false
                                        }
                                    }, contentPadding = PaddingValues(horizontal = 12.dp)) {
                                        if (laedt) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                                        else Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(I18n.t("team.event.neuLaden"))
                                    }
                                }
                            }
                        }
                        e.tafeln.getOrNull(idx)?.let { tf0 ->
                            // Globale Events: Top 10 und die eigene Zeile darunter (wie die Community-Bestenliste).
                            val eig = tf0.eigene?.takeIf { it.rang > 10 }
                            val tf = if (e.global) tf0.copy(zeilen = tf0.zeilen.take(10) + listOfNotNull(eig)) else tf0
                            val standText = standFuer(tf0)
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                // Siegertreppchen ueber der Bestenliste, nur beendete Events (Web EventPodest, 09.11.2026).
                                if (e.status == "beendet") EventPodest(e.id, tf0, e.global, f, onOpenTeam)
                                TeamTafelKarte(tf, f, onOpenSession, ohneFilter = true,
                                    sportZeigen = e.tafeln.map { x -> x.sportart }.distinct().size > 1, standText = standText,
                                    teamsZeigen = e.global, onOpenTeam = onOpenTeam,
                                    onBild = {
                                        val ich = tf0.eigene?.userId
                                        teilBild = TeamBildDaten(t.name,
                                            listOfNotNull(kennzahlLabel(tf0.kennzahl),
                                                tf0.sportart.takeIf { it != "pumpfoil" }?.let { I18n.t("cls.sport.$it") }, e.titel, standText)
                                                .joinToString(" · "),
                                            tf.zeilen.map { z ->
                                                BildZeile(z.rang, z.name ?: z.initialen, kennzahlWert(tf0.kennzahl, z.value),
                                                    ich != null && z.userId == ich, land = z.land)
                                            },
                                            "${t.slug}-event-${e.id}-${tf0.kennzahl}.png", abzeichen = bildAbzeichen,
                                            leer = I18n.t("team.tafel.leer"))
                                    })
                                if (e.global) TeamWertungKarte(tf0, e.teamWertungN ?: 5, f, meineTeams, standText, onOpenTeam,
                                    onBild = {
                                        val n = e.teamWertungN ?: 5
                                        val alle = tf0.teams.orEmpty()
                                        val eigen = alle.drop(10).firstOrNull { it.slug in meineTeams }
                                        teilBild = TeamBildDaten(
                                            "${I18n.t("team.event.teams")} · ${kennzahlLabel(tf0.kennzahl)}" +
                                                (if (tf0.sportart != "pumpfoil") " · ${I18n.t("cls.sport.${tf0.sportart}")}" else ""),
                                            listOfNotNull(e.titel, wertungText(tf0.kennzahl, n), standText).joinToString(" · "),
                                            (alle.take(10) + listOfNotNull(eigen)).map { x ->
                                                BildZeile(x.rang, x.name, kennzahlWert(tf0.kennzahl, x.value), x.slug in meineTeams,
                                                    land = x.land, wappen = true, logoUrl = x.logoUrl, farbe = x.farbe)
                                            },
                                            "${t.slug}-event-${e.id}-teams-${tf0.kennzahl}.png", abzeichen = bildAbzeichen,
                                            leer = I18n.t("team.event.keineTeams"), eigenesTeam = true)
                                    })
                            }
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
                            // Haftungsausschluss (Jan, 01.11.2026): Events und ihre Zusagen sind Sache der Teams — nicht bei
                            // globalen Events (die richtet pumpfoil.org selbst aus).
                            if (!e.global) {
                                HorizontalDivider(Modifier.padding(vertical = 10.dp))
                                Text(I18n.t("team.event.disclaimer"), style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    val evB = ev
    if (bearbeiten && t != null && evB != null) {
        TeamEventBearbeitenDialog(t.slug, t.farbe, evB, onZu = { bearbeiten = false; evLaden++ }, offiziell = t.offiziell)
    }
    teilBild?.let { TeamBildDialog(it, onClose = { teilBild = null }) }
    val evU = ev
    if (uebersicht && t != null && evU != null) {
        // Stand wie im Web: der der ersten Bestenliste.
        EventUebersichtDialog(evU, t, evU.tafeln.firstOrNull()?.let { standFuer(it) }, bildAbzeichen,
            onClose = { uebersicht = false })
    }
}

/** Name einer Event-Bestenliste; hat das Event Bestenlisten verschiedener Sportarten, steht die Sportart dabei (Web tafelTitel). */
private fun tafelTitel(tf: TeamTafel, e: TeamEvent): String =
    if (e.tafeln.map { it.sportart }.distinct().size > 1) "${kennzahlLabel(tf.kennzahl)} · ${I18n.t("cls.sport.${tf.sportart}")}"
    else kennzahlLabel(tf.kennzahl)

/**
 * Team-Rangliste eines globalen Events (Web TeamWertung, 06.11.2026): je Team die Summe der besten N Mitglieder, Top 10
 * und die eigenen Teams weiter hinten. Gleiche Karte und Ueberschrift wie die Fahrer-Liste darueber („einheitlich").
 */
@Composable
private fun TeamWertungKarte(tf: TeamTafel, n: Int, f: TeamFarbe, eigeneSlugs: Set<String>, standText: String?,
                             onOpenTeam: (String) -> Unit, onBild: () -> Unit) {
    val alle = tf.teams.orEmpty()
    val teams = alle.take(10) + alle.drop(10).filter { it.slug in eigeneSlugs }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                // Sportart dahinter, wenn es nicht Pumpfoil ist (Web d6b52f77) — gemischte als „Pumpfoil + Foil Scoot".
                Text("${I18n.t("team.event.teams")} · ${kennzahlLabel(tf.kennzahl)}" +
                    (if (tf.sportart != "pumpfoil") " · ${I18n.t("cls.sport.${tf.sportart}")}" else ""), color = f.akzent,
                    style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (alle.isNotEmpty()) TeilenKnopf(onBild)
            }
            Text(listOfNotNull(wertungText(tf.kennzahl, n), standText).joinToString(" · "), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (teams.isEmpty()) {
                Text(I18n.t("team.event.keineTeams"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            teams.forEachIndexed { i, x ->
                if (i > 0) HorizontalDivider()
                val eigen = x.slug in eigeneSlugs
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { onOpenTeam(x.slug) }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text("${x.rang}", Modifier.width(24.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold,
                        color = if (x.rang <= 3) f.akzent else MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.End)
                    Spacer(Modifier.width(8.dp))
                    TeamWappen(x.name, x.logoUrl, x.farbe, 24.dp)
                    Spacer(Modifier.width(6.dp))
                    // Herkunft wie im Teilen-Bild (Web 0595efde); fester Platz, damit die Namen buendig stehen.
                    Box(Modifier.width(18.dp), contentAlignment = Alignment.Center) { TeamHerkunftZeichen(x.land, kuerzel = false) }
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text(x.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            fontWeight = if (eigen) FontWeight.SemiBold else FontWeight.Normal)
                        if (!x.sportarten.isNullOrEmpty()) Box(Modifier.padding(top = 2.dp)) { SportAbzeichen(x.sportarten) }
                        // Ein mitgezaehltes Mitglied hat eine offene Meldung (08.11.2026).
                        if (x.strittig) StrittigVermerk()
                    }
                    Text("${x.fahrer}/${x.teilnehmer}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(8.dp))
                    Text(kennzahlWert(tf.kennzahl, x.value), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** Globale Events (Web components/EventMeinTeam.tsx, 10.11.2026): wer in mehreren Teams ist, zaehlt nur fuer eines —
 *  vorgewaehlt das primaere, hier fuer dieses Event umstellbar bis 6 h vor dem Ende. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EventMeinTeamWahl(slug: String, evId: Int, mt: EventMeinTeam, onGeaendert: () -> Unit) {
    // Ab zwei eigenen Teams sichtbar — auch wenn nur eines zaehlt (Web ff225d2e, 11.11.2026); die nicht zaehlenden stehen
    // ausgegraut mit Grund dabei, damit niemand die Wahl vergeblich sucht.
    val nicht = mt.nichtZaehlend
    if (mt.auswahl.size + nicht.size < 2) return
    val stern = mt.markiert ?: mt.primaer
    var busy by remember { mutableStateOf(false) }
    // Erklaerung nur beim Tipp auf ein deaktiviertes Team (Web 15f9dea5, Jan 11.11.2026: „die ganzen erklaerungen
    // weglassen … nur einblenden wenn man auf ein deaktiviertes klickt"); die Regeln stehen ohnehin in den Event-Regeln.
    var hinweis by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun waehle(id: Int) {
        if (busy || !mt.aenderbar || id == mt.effektiv) return
        busy = true
        // Das primaere Team waehlen heisst: keine Sonderwahl fuer dieses Event (folgt spaeteren Aenderungen des primaeren).
        scope.launch {
            try { Api.teamEventMeinTeam(slug, evId, if (id == mt.primaer) null else id); onGeaendert() } catch (_: Exception) {}
            busy = false
        }
    }
    Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Column(Modifier.padding(12.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(I18n.t("team.event.meinTeam"), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.CenterVertically).padding(end = 4.dp))
                mt.auswahl.forEach { x ->
                    val an = x.id == mt.effektiv
                    val tf = teamFarbe(x.farbe)
                    Row(
                        Modifier.clip(RoundedCornerShape(50))
                            .then(if (an) Modifier.background(tf.flaeche)
                                  else Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(50)))
                            .clickable(enabled = !busy && !an) {
                                if (mt.aenderbar) waehle(x.id) else hinweis = I18n.t("team.event.meinTeamFest")
                            }
                            .padding(horizontal = 12.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TeamWappen(x.name, x.logoUrl, x.farbe, 16.dp)
                        Spacer(Modifier.width(6.dp))
                        Text(x.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            fontWeight = if (an) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (an) tf.aufFlaeche else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.widthIn(max = 192.dp))
                        if (x.id == stern) {
                            Spacer(Modifier.width(4.dp))
                            Text("★", style = MaterialTheme.typography.labelSmall,
                                color = (if (an) tf.aufFlaeche else MaterialTheme.colorScheme.onSurface).copy(alpha = 0.8f))
                        }
                    }
                }
                // Nicht zaehlende Teams: gestrichelt umrandet, ausgegraut, nicht antippbar.
                nicht.forEach { x ->
                    val grau = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f)
                    Row(
                        Modifier.clip(RoundedCornerShape(50))
                            .drawBehind {
                                val r = size.height / 2
                                drawRoundRect(color = grau, cornerRadius = androidx.compose.ui.geometry.CornerRadius(r, r),
                                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx(),
                                        pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))))
                            }
                            .alpha(0.6f)
                            .clickable { hinweis = I18n.t("team.event.zaehltNicht") }
                            .padding(horizontal = 12.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TeamWappen(x.name, x.logoUrl, x.farbe, 16.dp)
                        Spacer(Modifier.width(6.dp))
                        Text(x.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = grau, modifier = Modifier.widthIn(max = 192.dp))
                        if (x.id == mt.markiert) {
                            Spacer(Modifier.width(4.dp))
                            Text("★", style = MaterialTheme.typography.labelSmall, color = grau)
                        }
                    }
                }
            }
            hinweis?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp))
            }
        }
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
                    Text(I18n.t(if (n == 1L && k == "team.event.tage") "team.event.tag" else k), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** Gewaehlte Bestenliste + Wertungsklasse je Event ("slug/id"), fuer die App-Sitzung (Web: sessionStorage je Tab). */
internal object EventAuswahlMerker {
    val wahl = HashMap<String, Pair<Int, String>>()
}
