package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/*
 * Freunde (Jan, 15.10.2026), portiert aus der PWA (web/src/pages/Friends.tsx +
 * components/Freundschaft.tsx). Der Dialog sagt WOERTLICH, was Freunde sehen — einen Schalter
 * dafuer gibt es bewusst nicht. Was der Server freigibt, regelt server/app/freunde.py; die App
 * entscheidet nichts, sie zeigt nur den Stand.
 */

/** Gruen fuer „pumpt gerade", wie die PWA (emerald). */
private val GRUEN_HELL = Color(0xFF047857)
private val GRUEN_DUNKEL = Color(0xFF34D399)

@Composable
private fun gruen(): Color =
    if (MaterialTheme.colorScheme.background.luminance() < 0.5f) GRUEN_DUNKEL else GRUEN_HELL

enum class FreundArt { ANFRAGEN, ANNEHMEN, BEENDEN, ZURUECKZIEHEN }

@Composable
fun FreundschaftDialog(art: FreundArt, name: String, busy: Boolean, onJa: () -> Unit,
                       onAblehnen: (() -> Unit)? = null, onClose: () -> Unit) {
    val titel = when (art) {
        FreundArt.ANFRAGEN -> I18n.t("friends.request")
        FreundArt.ANNEHMEN -> I18n.t("friends.incomingFrom").replace("{name}", name)
        FreundArt.BEENDEN -> I18n.t("friends.remove")
        FreundArt.ZURUECKZIEHEN -> I18n.t("friends.withdraw")
    }
    val ja = when (art) {
        FreundArt.ANFRAGEN -> I18n.t("friends.requestConfirm")
        FreundArt.ANNEHMEN -> I18n.t("friends.accept")
        FreundArt.BEENDEN -> I18n.t("friends.remove")
        FreundArt.ZURUECKZIEHEN -> I18n.t("friends.withdraw")
    }
    val rot = art == FreundArt.BEENDEN || art == FreundArt.ZURUECKZIEHEN
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(titel) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                when (art) {
                    FreundArt.ANFRAGEN, FreundArt.ANNEHMEN -> {
                        Text(I18n.t("friends.termsTitle"), fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(bottom = 6.dp))
                        Text(I18n.t("friends.terms"), style = MaterialTheme.typography.bodyMedium)
                    }
                    FreundArt.BEENDEN -> Text(I18n.t("friends.removeConfirm").replace("{name}", name))
                    FreundArt.ZURUECKZIEHEN -> Text(I18n.t("friends.withdrawConfirm").replace("{name}", name))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onJa, enabled = !busy) {
                Text(ja, fontWeight = FontWeight.SemiBold,
                    color = if (rot) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        },
        dismissButton = {
            Row {
                if (onAblehnen != null) {
                    TextButton(onClick = onAblehnen, enabled = !busy) { Text(I18n.t("friends.decline")) }
                }
                TextButton(onClick = onClose) { Text(I18n.t("common.cancel")) }
            }
        },
    )
}

/** Knopf fuer die Foiler-Seite: zeigt den Stand und oeffnet den passenden Dialog. */
@Composable
fun FreundschaftKnopf(userId: Int, name: String, status: String?, onChange: (String?) -> Unit,
                      modifier: Modifier = Modifier) {
    var dialog by remember { mutableStateOf<FreundArt?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun fertig(call: suspend () -> String?) {
        busy = true
        scope.launch {
            try { val s = call(); dialog = null; onChange(s) } catch (_: Exception) {}
            busy = false
        }
    }
    val art = when (status) {
        "freund" -> FreundArt.BEENDEN
        "angefragt" -> FreundArt.ZURUECKZIEHEN
        "eingehend" -> FreundArt.ANNEHMEN
        else -> FreundArt.ANFRAGEN
    }
    val label = when (status) {
        "freund" -> I18n.t("friends.isFriend")
        "angefragt" -> I18n.t("friends.requested")
        "eingehend" -> I18n.t("friends.accept")
        else -> I18n.t("friends.request")
    }
    if (status == null || status == "eingehend") {
        Button(onClick = { dialog = art }, modifier = modifier) { Text(label) }
    } else {
        OutlinedButton(onClick = { dialog = art }, modifier = modifier) { Text(label) }
    }
    dialog?.let { d ->
        FreundschaftDialog(d, name, busy, onClose = { dialog = null },
            onJa = {
                fertig {
                    when (d) {
                        FreundArt.ANFRAGEN -> Api.friendRequest(userId)
                        FreundArt.ANNEHMEN -> Api.friendAccept(userId)
                        else -> Api.friendRemove(userId)
                    }
                }
            },
            onAblehnen = if (d == FreundArt.ANNEHMEN) ({ fertig { Api.friendDecline(userId) } }) else null)
    }
}

/**
 * Freunde verwalten: wer gerade pumpt, Anfragen an mich, meine Freunde, meine offenen Anfragen.
 * Angefragt wird auf der Foiler-Seite des anderen, nicht hier.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FreundeScreen(onBack: () -> Unit, onOpenFoiler: (Int) -> Unit, onOpenSpot: (String) -> Unit) {
    var d by remember { mutableStateOf<FreundeListe?>(null) }
    var offen by remember { mutableStateOf<Triple<FreundArt, Int, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var tick by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(tick) { d = try { Api.friends() } catch (_: Exception) { FreundeListe() } }

    fun ausfuehren(call: suspend () -> String?) {
        busy = true
        scope.launch {
            try { call(); offen = null; tick++ } catch (_: Exception) {}
            busy = false
        }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("friends.title")) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back"))
                }
            },
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
               verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(I18n.t("friends.termsTitle"), fontWeight = FontWeight.SemiBold)
                    Text(I18n.t("friends.terms"), style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 4.dp))
                    Text(I18n.t("friends.howTo"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                }
            }
            val l = d
            if (l == null) {
                CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                return@Column
            }
            if (l.aktiv.isNotEmpty()) {
                Abschnitt(I18n.t("friends.pumpingNowTitle")) {
                    l.aktiv.forEach { f ->
                        FreundZeile(f, onOpenFoiler, unter = {
                            val g = gruen()
                            if (f.spot != null) {
                                Row(verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.clickable { onOpenSpot(f.spot) }) {
                                    Icon(Icons.Filled.Place, contentDescription = null, tint = g, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(3.dp))
                                    Text(f.spot, color = g, style = MaterialTheme.typography.bodyMedium)
                                }
                            } else {
                                Text(I18n.t("friends.pumpingNow"), color = g, style = MaterialTheme.typography.bodyMedium)
                            }
                        })
                    }
                }
            }
            if (l.eingehend.isNotEmpty()) {
                Abschnitt(I18n.t("friends.incoming")) {
                    l.eingehend.forEach { f ->
                        FreundZeile(f, onOpenFoiler, unterText = f.am?.let { langDatum(it) }) {
                            Button(onClick = { offen = Triple(FreundArt.ANNEHMEN, f.userId, f.name ?: "—") }) {
                                Text(I18n.t("friends.accept"))
                            }
                        }
                    }
                }
            }
            Abschnitt(I18n.t("friends.list") + if (l.freunde.isNotEmpty()) " (${l.freunde.size})" else "") {
                if (l.freunde.isEmpty()) {
                    Text(I18n.t("friends.none"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                l.freunde.forEach { f ->
                    FreundZeile(f, onOpenFoiler,
                        unterText = f.seit?.let { I18n.t("friends.since").replace("{date}", langDatum(it)) }) {
                        OutlinedButton(onClick = { offen = Triple(FreundArt.BEENDEN, f.userId, f.name ?: "—") }) {
                            Text(I18n.t("friends.remove"), maxLines = 1)
                        }
                    }
                }
            }
            if (l.ausgehend.isNotEmpty()) {
                Abschnitt(I18n.t("friends.outgoing")) {
                    l.ausgehend.forEach { f ->
                        FreundZeile(f, onOpenFoiler, unterText = f.am?.let { langDatum(it) }) {
                            OutlinedButton(onClick = { offen = Triple(FreundArt.ZURUECKZIEHEN, f.userId, f.name ?: "—") }) {
                                Text(I18n.t("friends.withdraw"), maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
    }
    offen?.let { (art, id, name) ->
        FreundschaftDialog(art, name, busy, onClose = { offen = null },
            onJa = { ausfuehren { if (art == FreundArt.ANNEHMEN) Api.friendAccept(id) else Api.friendRemove(id) } },
            onAblehnen = if (art == FreundArt.ANNEHMEN) ({ ausfuehren { Api.friendDecline(id) } }) else null)
    }
}

@Composable
private fun Abschnitt(titel: String, inhalt: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(titel, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
            inhalt()
        }
    }
}

@Composable
private fun FreundZeile(f: FreundKurz, onOpenFoiler: (Int) -> Unit, unterText: String? = null,
                        unter: (@Composable () -> Unit)? = null, aktion: (@Composable () -> Unit)? = null) {
    Column {
        HorizontalDivider(Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            AvatarCircle(name = f.name, avatarUrl = f.avatarUrl, size = 36.dp, userId = f.userId, link = false)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f).clickable { onOpenFoiler(f.userId) }) {
                Text(f.name ?: "—", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                when {
                    unter != null -> unter()
                    unterText != null -> Text(unterText, style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (aktion != null) {
                Spacer(Modifier.width(8.dp))
                aktion()
            }
        }
    }
}

/** Kleines „neu"-Abzeichen, wie `NewBadge` in der PWA (emerald, Grossbuchstaben). */
@Composable
fun NeuBadge() {
    val g = gruen()
    androidx.compose.material3.Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
        color = g.copy(alpha = 0.15f)) {
        Text(I18n.t("badge.new").uppercase(), color = g, fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp))
    }
}

/**
 * Unter dem Gruss auf der Startseite: welche meiner Freunde gerade wo pumpen (Jan, 15.10.2026:
 * „wenn es mehr als 3 sind dann nur noch x Friends currently pumping und bei klick dann darunter
 * oeffnen"). Nichts da -> nichts gezeigt. Alle zwei Minuten neu, wie die Spot-Karte. Wer zaehlt
 * und welcher Spot, entscheidet der Server (app/freunde.py).
 */
@Composable
fun FreundePumpenZeile(onOpenSpot: (String) -> Unit) {
    var aktiv by remember { mutableStateOf<List<FreundKurz>>(emptyList()) }
    var offen by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            aktiv = try { Api.friendsActive() } catch (_: Exception) { aktiv }
            kotlinx.coroutines.delay(120_000)
        }
    }
    if (aktiv.isEmpty()) return
    val g = gruen()
    val oeffneFoiler = LocalOpenFoiler.current

    @Composable
    fun Eintrag(f: FreundKurz) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(f.name ?: "—", color = g, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.clickable { oeffneFoiler?.invoke(f.userId) })
            f.spot?.let { sp ->
                Text(" @ ", color = g, style = MaterialTheme.typography.bodyMedium)
                Text(sp, color = g, style = MaterialTheme.typography.bodyMedium, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.clickable { onOpenSpot(sp) })
            }
        }
    }

    @Composable
    fun PunktGruen() {
        androidx.compose.foundation.layout.Box(Modifier.size(8.dp)
            .background(g, androidx.compose.foundation.shape.CircleShape))
    }

    Column(Modifier.fillMaxWidth().padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (aktiv.size <= 3) {
            aktiv.forEach { f ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PunktGruen(); Spacer(Modifier.width(6.dp)); Eintrag(f)
                }
            }
        } else {
            androidx.compose.material3.Surface(onClick = { offen = !offen },
                shape = androidx.compose.foundation.shape.RoundedCornerShape(50), color = g.copy(alpha = 0.12f)) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    PunktGruen(); Spacer(Modifier.width(6.dp))
                    Text(I18n.t("friends.nPumping").replace("{n}", aktiv.size.toString()), color = g,
                        fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                    Text(if (offen) "  ▴" else "  ▾", color = g)
                }
            }
            if (offen) {
                androidx.compose.material3.Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
                    color = g.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        aktiv.forEach { f -> Eintrag(f) }
                    }
                }
            }
        }
    }
}
