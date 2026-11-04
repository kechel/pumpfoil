package org.pumpfoil.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.Locale

/*
 * Nationalitaet (Web components/LandWahl.tsx, 02./03.11.2026): freiwillig, als Flagge in den Bestenlisten. Auswahl mit
 * „nicht angeben" oben, Laendernamen in der App-Sprache; Liste und Flaggen wie bei der Team-Herkunft (TeamVerwaltung.kt
 * LAENDER, flaggeEmoji). Im Profil (Einstellungen › Ich) und im Einrichtungs-Assistenten unter der Sprache.
 */

/** Kleine Flagge nach dem Profilbild in Bestenlisten (Web Flagge): ohne Land bleibt der Platz leer, damit die Namen
 *  buendig stehen. Emoji statt SVG wie bei der Team-Herkunft (TeamBestenlisten.kt flaggeBild erklaert, warum). */
@Composable
fun LandFlagge(land: String?) {
    androidx.compose.foundation.layout.Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) {
        flaggeEmoji(land)?.let { Text(it, style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.semantics { contentDescription = landName(land!!.uppercase()) }) }
    }
}

/** Auswahlfeld + Flagge daneben. */
@Composable
fun LandWahl(land: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val opt = remember(I18n.lang) {
        val loc = Locale.forLanguageTag(if (I18n.lang == "gsw") "de-CH" else I18n.lang)
        listOf(Option("", I18n.t("profile.landNone"))) +
            LAENDER.map { Option(it, landName(it)) }.sortedWith(compareBy(java.text.Collator.getInstance(loc)) { it.label })
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        AuswahlFeld(land, opt, onWahl = onChange, modifier = Modifier.weight(1f), leer = I18n.t("profile.landNone"))
        Spacer(Modifier.width(10.dp))
        TeamHerkunftZeichen(land, gross = true)
    }
}

/** Profil-Karte: laedt `land` aus den Einstellungen und speichert jede Wahl sofort (wie Web saveLand). */
@Composable
fun LandKarteProfil(onSaved: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var land by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { land = try { Api.settings()["land"]?.jsonPrimitive?.contentOrNull ?: "" } catch (_: Exception) { "" } }
    val l = land ?: return
    Card(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("profile.land"), style = MaterialTheme.typography.titleMedium)
            Text(I18n.t("profile.landHint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            LandWahl(l, onChange = { v ->
                land = v
                scope.launch { try { Api.saveSettings(buildJsonObject { put("land", v) }); onSaved() } catch (_: Exception) {} }
            })
        }
    }
}

private val LAND_JE_SPRACHE = mapOf(
    "de" to "DE", "gsw" to "CH", "de-AT" to "AT", "en" to "GB", "fr" to "FR", "it" to "IT", "es" to "ES", "fi" to "FI",
    "nl" to "NL", "cs" to "CZ", "pl" to "PL", "pt" to "BR", "pt-PT" to "PT", "ja" to "JP", "zh" to "CN", "ru" to "RU",
    "id" to "ID", "nb" to "NO",
)

/** Land zur Sprache (Web landZurSprache): die Region des Systems, wenn sie zur gewaehlten Sprache passt (en-US -> US),
 *  sonst das Hauptland der Sprache. */
fun landZurSprache(lang: String): String {
    val basis = lang.substringBefore('-')
    runCatching {
        val sys = Locale.getDefault()
        val region = sys.country.uppercase()
        val sprache = if (sys.language == "nn" || sys.language == "no") "nb" else sys.language
        if (sprache == basis && region.length == 2 && region in LAENDER &&
            (!lang.contains('-') || region == LAND_JE_SPRACHE[lang])) return region
    }
    return LAND_JE_SPRACHE[lang] ?: ""
}

/**
 * Karte fuer den Assistenten (Web LandKarte): direkt unter der Sprache. Wurde die Nationalitaet noch nie gesetzt
 * (`land_gewaehlt`), wird die zur Sprache vorgeschlagen und gespeichert; jeder Sprachwechsel hier setzt sie neu.
 * „Nicht angeben" bleibt waehlbar und haelt, bis die Sprache hier wieder gewechselt wird.
 */
@Composable
fun LandKarteAssistent(lang: String) {
    val scope = rememberCoroutineScope()
    var land by remember { mutableStateOf<String?>(null) }
    var letzteSprache by remember { mutableStateOf<String?>(null) }
    fun speichern(v: String) {
        land = v
        scope.launch { runCatching { Api.saveSettings(buildJsonObject { put("land", v) }) } }
    }
    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            letzteSprache = lang
            val gesetzt = s["land"]?.jsonPrimitive?.contentOrNull ?: ""
            if (s["land_gewaehlt"]?.jsonPrimitive?.booleanOrNull == true || gesetzt.isNotEmpty()) land = gesetzt
            else speichern(landZurSprache(lang))
        } catch (_: Exception) { land = "" }
    }
    LaunchedEffect(lang) {
        val vorher = letzteSprache ?: return@LaunchedEffect
        if (vorher == lang) return@LaunchedEffect
        letzteSprache = lang
        speichern(landZurSprache(lang))
    }
    val l = land ?: return
    Column(Modifier.padding(top = 8.dp)) {
        Text(I18n.t("profile.land"), fontWeight = FontWeight.Bold)
        Text(I18n.t("profile.landHint"), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
        LandWahl(l, onChange = { speichern(it) })
    }
}
