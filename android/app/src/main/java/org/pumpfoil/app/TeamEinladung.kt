package org.pumpfoil.app

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/*
 * Einladungslink eines Teams (04.11.2026), nativ aus web/src/pages/TeamEinladung.tsx: /teams/<slug>/join-<token> bzw.
 * /apply-<token>. Zeigt Wappen + Name und den Beitritts-Dialog mit dem Kleingedruckten; join -> direkt Mitglied,
 * apply -> angefragt. Wer schon Mitglied ist, landet gleich auf der Teamseite.
 *
 * Ankommen kann so ein Link nur, wenn Android ihn der App gibt. Das braucht einen Intent-Filter fuer
 * https://pumpfoil.org/teams/… (App Links mit autoVerify + /.well-known/assetlinks.json am Server) — beides fehlt
 * noch. Bis dahin ist der Weg hier fertig: `TeamEinladungLink.verarbeite` erkennt den Link (MainActivity ruft es fuer
 * jeden eingehenden Intent auf), MainScaffold oeffnet die Seite. Ohne Anmeldung wartet der Link, bis das Konto da ist
 * (wie der localStorage-Merker im Web).
 */

/** Weg- und Wartestelle fuer einen eingehenden Einladungslink: "<slug>/<join|apply>-<token>" oder null. */
object TeamEinladungLink {
    val offen = MutableStateFlow<String?>(null)

    private val TEIL = Regex("^(join|apply)-([A-Za-z0-9_-]{6,64})$")

    /** Token aus dem letzten Pfadteil (Web einladungAusPfad); null = kein Einladungslink. */
    fun token(teil: String?): String? = TEIL.find(teil ?: "")?.groupValues?.get(2)

    fun verarbeite(uri: Uri?) {
        if (uri == null || (uri.scheme != "https" && uri.scheme != "http")) return
        val host = uri.host ?: return
        if (host != "pumpfoil.org" && host != "www.pumpfoil.org") return
        val s = uri.pathSegments
        if (s.size != 3 || s[0] != "teams" || token(s[2]) == null) return
        offen.value = "${s[1]}/${s[2]}"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamEinladungScreen(slug: String, teil: String, onBack: () -> Unit, onOpenTeam: (String) -> Unit) {
    val token = TeamEinladungLink.token(teil)
    var info by remember(teil) { mutableStateOf<TeamEinladungInfo?>(null) }
    var fehlt by remember(teil) { mutableStateOf(token == null) }
    var busy by remember { mutableStateOf(false) }
    var fehler by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(slug, teil) {
        if (token == null) return@LaunchedEffect
        try {
            val d = Api.teamEinladungAnsehen(token)
            if (d.meinStatus == "aktiv") onOpenTeam(d.slug) else info = d
        } catch (_: Exception) { fehlt = true }
    }

    val d = info
    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) }
                },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when {
                fehlt -> Text(I18n.t("team.einladungUngueltig"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                d == null -> Text(I18n.t("common.loading"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> {
                    val f = teamFarbe(d.farbe)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TeamWappen(d.name, d.logoUrl, d.farbe, 56.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(d.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = f.akzent)
                    }
                    if (d.meinStatus == "angefragt" && d.art == "apply") {
                        Text(I18n.t("team.join.wartet"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    fehler?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }

    if (d != null && token != null && !(d.meinStatus == "angefragt" && d.art == "apply")) {
        TeamBeitrittDialog(d.name, d.oeffentlich, d.art == "apply", busy, d.farbe,
            onJa = {
                busy = true
                scope.launch {
                    try { onOpenTeam(Api.teamEinladungAnnehmen(token).slug) }
                    catch (e: Exception) { fehler = teamFehlerText(e) }
                    busy = false
                }
            },
            onNein = onBack)   // „Abbrechen" verlaesst die Seite (Web: zur Startseite)
    }
}
