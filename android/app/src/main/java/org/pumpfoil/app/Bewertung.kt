package org.pumpfoil.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

// „Rate this analysis" (Jan, 22.10.2026) — wie web/src/components/SessionBewertung.tsx: Kachel unter den Zahlen,
// NUR auf eigenen Sessions; Antworten liegen an der Session (server/app/api/bewertung.py), sichtbar nur fuer den
// Besitzer und im Admin-Tab „Bewertungen". Alle Fragen optional; nochmal tippen waehlt ab.

private val LAEUFE = listOf("alle", "fehlen", "zuviele", "zerstueckelt")
private val PUMPS = listOf("wenig", "passt", "viel", "weiss_nicht")
private val PROBLEME = listOf("abbruch", "pause", "gps", "upload", "akku", "bedienung", "sonstiges")

/** Antworten als einfache Felder (statt JsonObject), damit der Dialog sie bequem aendern kann. */
internal data class Antworten(
    val sterne: Int? = null, val laeufe: String? = null, val laeufeEcht: Int? = null,
    val pumps: String? = null, val tempoOk: Boolean? = null, val probleme: Boolean? = null,
    val problemeArt: List<String> = emptyList(),
)

internal fun ausJson(o: JsonObject?): Antworten {
    if (o == null) return Antworten()
    fun s(k: String) = (o[k] as? JsonPrimitive)?.contentOrNull
    fun i(k: String) = (o[k] as? JsonPrimitive)?.intOrNull
    fun b(k: String) = (o[k] as? JsonPrimitive)?.booleanOrNull
    return Antworten(i("sterne"), s("laeufe"), i("laeufe_echt"), s("pumps"), b("tempo_ok"), b("probleme"),
        (o["probleme_art"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList())
}

internal fun zuJson(a: Antworten): JsonObject = buildJsonObject {
    a.sterne?.let { put("sterne", it) }
    a.laeufe?.let { put("laeufe", it) }
    a.laeufeEcht?.let { put("laeufe_echt", it) }
    a.pumps?.let { put("pumps", it) }
    a.tempoOk?.let { put("tempo_ok", it) }
    a.probleme?.let { put("probleme", it) }
    if (a.probleme == true && a.problemeArt.isNotEmpty()) put("probleme_art", buildJsonArray { a.problemeArt.forEach { add(JsonPrimitive(it)) } })
}

@Composable
fun BewertungKachel(sessionId: Int, modifier: Modifier = Modifier) {
    var geladen by remember(sessionId) { mutableStateOf(false) }
    var hat by remember(sessionId) { mutableStateOf(false) }
    var antworten by remember(sessionId) { mutableStateOf(Antworten()) }
    var kommentar by remember(sessionId) { mutableStateOf("") }
    var laeufeJetzt by remember(sessionId) { mutableStateOf<Int?>(null) }
    // Unsere Rueckfrage („Back to rider" im Admin-Tab), bis neu bewertet wird — wie im Web.
    var rueckfrage by remember(sessionId) { mutableStateOf<String?>(null) }
    var offen by remember { mutableStateOf(false) }
    LaunchedEffect(sessionId) {
        try {
            val r = Api.bewertung(sessionId)
            laeufeJetzt = (r["laeufe_jetzt"] as? JsonPrimitive)?.intOrNull
            val b = r["bewertung"] as? JsonObject
            hat = b != null
            antworten = ausJson(b?.get("antworten")?.jsonObject)
            kommentar = (b?.get("kommentar") as? JsonPrimitive)?.contentOrNull ?: ""
            rueckfrage = ((b?.get("rueckfrage") as? JsonObject)?.get("text") as? JsonPrimitive)?.contentOrNull
        } catch (_: Exception) {}
        geladen = true
    }
    if (!geladen) return
    Card(modifier.clickable { offen = true },
        border = if (rueckfrage != null) BorderStroke(1.dp, Color(0xFFF59E0B)) else null) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val st = antworten.sterne
                when {
                    hat && st != null -> (1..5).forEach { n ->
                        Icon(if (n <= st) Icons.Filled.Star else Icons.Outlined.StarOutline, null,
                            tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                    }
                    hat -> Icon(Icons.Filled.Check, null, tint = MaterialTheme.colorScheme.primary)
                    else -> Icon(Icons.Outlined.StarOutline, null, tint = MaterialTheme.colorScheme.primary)
                }
            }
            Text(I18n.t(if (rueckfrage != null) "rate.recheckTile" else if (hat) "rate.rated" else "rate.tile"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (offen) BewertungDialog(sessionId, antworten, kommentar, laeufeJetzt, rueckfrage,
        onDismiss = { offen = false },
        onSaved = { a, k -> antworten = a; kommentar = k; hat = true; rueckfrage = null; offen = false })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BewertungDialog(
    sessionId: Int, alt: Antworten, altKommentar: String, laeufeJetzt: Int?, rueckfrage: String?,
    onDismiss: () -> Unit, onSaved: (Antworten, String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var a by remember { mutableStateOf(alt) }
    // Leer starten, unsere Zahl nur als Hinweis (22.10.2026, wie Web): was drinsteht, wird gespeichert.
    var echt by remember { mutableStateOf(alt.laeufeEcht?.toString() ?: "") }
    var kommentar by remember { mutableStateOf(altKommentar) }
    var busy by remember { mutableStateOf(false) }
    var fehler by remember { mutableStateOf(false) }

    @Composable
    fun Titel(key: String) {
        Spacer(Modifier.height(10.dp))
        Text(I18n.t(key), style = MaterialTheme.typography.labelLarge)
    }

    @Composable
    fun Chip(an: Boolean, label: String, onClick: () -> Unit) =
        FilterChip(selected = an, onClick = onClick, label = { Text(label) })

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(I18n.t("rate.title")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(I18n.t("rate.intro"), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (rueckfrage != null) {
                    Spacer(Modifier.height(8.dp))
                    Column(Modifier.border(1.dp, Color(0xFFF59E0B), RoundedCornerShape(8.dp)).padding(8.dp)) {
                        Text(I18n.t("rate.recheck"), style = MaterialTheme.typography.labelLarge, color = Color(0xFFF59E0B))
                        Text(rueckfrage, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Titel("rate.stars")
                Row {
                    (1..5).forEach { n ->
                        IconButton(onClick = { a = a.copy(sterne = if (a.sterne == n) null else n) }, modifier = Modifier.size(40.dp)) {
                            Icon(if ((a.sterne ?: 0) >= n) Icons.Filled.Star else Icons.Outlined.StarOutline, "$n",
                                tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                Titel("rate.runs")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    LAEUFE.forEach { k -> Chip(a.laeufe == k, I18n.t("rate.runs.$k")) { a = a.copy(laeufe = if (a.laeufe == k) null else k) } }
                }
                Titel("rate.runsReal")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(value = echt, onValueChange = { v -> echt = v.filter { it.isDigit() }.take(3) },
                        placeholder = { laeufeJetzt?.let { Text(it.toString()) } },
                        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.width(96.dp))
                    laeufeJetzt?.let {
                        Spacer(Modifier.width(8.dp))
                        Text(I18n.t("rate.runsRealHint").replace("{n}", it.toString()), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Titel("rate.pumps")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PUMPS.forEach { k -> Chip(a.pumps == k, I18n.t("rate.pumps.$k")) { a = a.copy(pumps = if (a.pumps == k) null else k) } }
                }
                Titel("rate.speedOk")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip(a.tempoOk == true, I18n.t("rate.yes")) { a = a.copy(tempoOk = if (a.tempoOk == true) null else true) }
                    Chip(a.tempoOk == false, I18n.t("rate.no")) { a = a.copy(tempoOk = if (a.tempoOk == false) null else false) }
                }
                Titel("rate.problems")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip(a.probleme == false, I18n.t("rate.no")) { a = a.copy(probleme = if (a.probleme == false) null else false) }
                    Chip(a.probleme == true, I18n.t("rate.yes")) { a = a.copy(probleme = if (a.probleme == true) null else true) }
                }
                if (a.probleme == true) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PROBLEME.forEach { k ->
                            val an = k in a.problemeArt
                            Chip(an, I18n.t("rate.prob.$k")) {
                                a = a.copy(problemeArt = if (an) a.problemeArt - k else a.problemeArt + k)
                            }
                        }
                    }
                }
                Titel("rate.comment")
                OutlinedTextField(value = kommentar, onValueChange = { kommentar = it.take(2000) },
                    placeholder = { Text(I18n.t("rate.commentPh")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                if (fehler) {
                    Spacer(Modifier.height(6.dp))
                    Text(I18n.t("rate.error"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                val n = echt.toIntOrNull()
                val senden = a.copy(laeufeEcht = n,
                    problemeArt = if (a.probleme == true) a.problemeArt else emptyList())
                busy = true; fehler = false
                scope.launch {
                    try {
                        Api.bewertungSpeichern(sessionId, zuJson(senden), kommentar.trim())
                        onSaved(senden, kommentar.trim())
                    } catch (_: Exception) {
                        fehler = true
                    } finally { busy = false }
                }
            }) { Text(I18n.t("rate.send")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(I18n.t("rate.cancel")) } },
    )
}
