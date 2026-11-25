package org.pumpfoil.app

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Filter-Knopf fuer die Sessionlisten (Web SessionFilter.tsx, 18.11.2026; Nutzerwunsch 17.11.: „all runs with brand
 * XXX wing YYY"). Erste Einstellung: genau ein Foil — Suche ueber Marke/Modell/Groesse, Marken-Auswahl, eigene Foils
 * oben, darunter alle Foils, mit denen in der Community gefahren wird (nach Anzahl Sessions).
 * Sortierung (Web 18a2299b1, Nutzerwunsch 24.11.2026) nur in Meine — die anderen Listen sind nach Tagen gruppiert,
 * und nach Bestwerten sortiert waeren sie eine Rangliste. Nur wenn `onSort` gesetzt ist, zeigt der Dialog sie.
 */
val SESSION_SORTS = listOf("neu", "alt", "lauf_m", "lauf_s", "foil_m", "foil_s", "tempo")

private val Cyan = Color(0xFF22D3EE)   // Markenfarbe (brand-design)

@Composable
fun SessionFilterKnopf(foil: Int?, modifier: Modifier = Modifier, sort: String = "neu", onSort: ((String) -> Unit)? = null,
                       onFoil: (Int?) -> Unit) {
    var offen by remember { mutableStateOf(false) }
    var foils by remember { mutableStateOf<List<FoilStat>?>(null) }
    var meine by remember { mutableStateOf<List<Int>>(emptyList()) }
    LaunchedEffect(offen, foil) {
        if ((!offen && foil == null) || foils != null) return@LaunchedEffect
        foils = try { Api.foilStats(mitScoot = true).map { it.copy(sessions = it.sessions + (it.scoot?.sessions ?: 0)) }.sortedByDescending { it.sessions } } catch (_: Exception) { emptyList() }
        meine = try {
            (Api.settings()["my_foils"] as? kotlinx.serialization.json.JsonArray)?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
        } catch (_: Exception) { emptyList() }
    }
    val sortiert = onSort != null && sort != "neu"
    val an = foil != null || sortiert
    val rand = if (an) Cyan else MaterialTheme.colorScheme.outlineVariant
    val aktiv = foils?.firstOrNull { it.foilId == foil }
    val titel = listOf(
        if (foil != null && aktiv != null)
            "${I18n.t("sfilter.title")}: ${foilLabel(aktiv.brand, aktiv.model, aktiv.size, aktiv.aspectRatio)}" else I18n.t("sfilter.title"),
        if (sortiert) "${I18n.t("sfilter.sort")}: ${I18n.t("sfilter.sort.$sort")}" else "",
    ).filter { it.isNotEmpty() }.joinToString(" · ")
    Box(modifier) {
        Box(
            Modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, rand, RoundedCornerShape(12.dp))
                .then(if (an) Modifier.background(Cyan.copy(alpha = 0.15f)) else Modifier)
                .clickable { offen = true }.padding(horizontal = 8.dp, vertical = 6.dp),
        ) {
            Icon(Icons.Filled.FilterAlt, contentDescription = titel, modifier = Modifier.size(18.dp),
                tint = if (an) Cyan else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (an) Box(Modifier.align(Alignment.TopEnd).size(8.dp).clip(CircleShape).background(Cyan))
    }
    if (offen) FilterDialog(foil, foils, meine, sort, onSort?.let { f -> { k: String -> f(k); offen = false } },
        onClose = { offen = false }) { onFoil(it); offen = false }
}

@Composable
private fun FilterDialog(foil: Int?, foils: List<FoilStat>?, meine: List<Int>, sort: String, onSort: ((String) -> Unit)?,
                         onClose: () -> Unit, onWahl: (Int?) -> Unit) {
    var suche by remember { mutableStateOf("") }
    var marke by remember { mutableStateOf("") }
    var markenOffen by remember { mutableStateOf(false) }
    var sortOffen by remember { mutableStateOf(false) }
    val marken = remember(foils) { foils.orEmpty().map { it.brand.trim() }.filter { it.isNotEmpty() }.distinct().sortedBy { it.lowercase() } }
    val woerter = suche.lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val treffer = foils.orEmpty().filter { f ->
        (marke.isEmpty() || f.brand.trim() == marke) &&
            "${f.brand} ${f.model} ${f.size}".lowercase().let { t -> woerter.all { t.contains(it) } }
    }
    val eigene = treffer.filter { it.foilId in meine }
    val andere = treffer.filter { it.foilId !in meine }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("${I18n.t("sfilter.title")} · ${I18n.t("sfilter.foil")}") },
        text = {
            Column {
                // Sortierung oben, abgesetzt vom Foil-Filter (Web: Auswahlfeld mit Trennlinie darunter)
                if (onSort != null) {
                    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(I18n.t("sfilter.sort"), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Box {
                            OutlinedButton(onClick = { sortOffen = true }) {
                                Text(I18n.t("sfilter.sort.$sort"), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            DropdownMenu(expanded = sortOffen, onDismissRequest = { sortOffen = false }) {
                                SESSION_SORTS.forEach { k ->
                                    DropdownMenuItem(text = { Text(I18n.t("sfilter.sort.$k"),
                                        fontWeight = if (k == sort) FontWeight.SemiBold else FontWeight.Normal) },
                                        onClick = { sortOffen = false; onSort(k) })
                                }
                            }
                        }
                    }
                    androidx.compose.material3.HorizontalDivider(Modifier.padding(bottom = 8.dp))
                }
                OutlinedTextField(value = suche, onValueChange = { suche = it }, singleLine = true,
                    placeholder = { Text(I18n.t("sfilter.search")) }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.padding(top = 6.dp))
                Box {
                    OutlinedButton(onClick = { markenOffen = true }) {
                        Text(if (marke.isEmpty()) I18n.t("sfilter.allBrands") else marke, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    DropdownMenu(expanded = markenOffen, onDismissRequest = { markenOffen = false }) {
                        DropdownMenuItem(text = { Text(I18n.t("sfilter.allBrands")) }, onClick = { marke = ""; markenOffen = false })
                        marken.forEach { m -> DropdownMenuItem(text = { Text(m) }, onClick = { marke = m; markenOffen = false }) }
                    }
                }
                Spacer(Modifier.padding(top = 6.dp))
                if (foils == null) {
                    Text("…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    LazyColumn(Modifier.heightIn(max = 320.dp)) {
                        if (suche.isEmpty() && marke.isEmpty()) item {
                            Zeile(I18n.t("sfilter.allFoils"), null, foil == null) { onWahl(null) }
                        }
                        if (eigene.isNotEmpty()) item { Kopf(I18n.t("sfilter.myFoils")) }
                        items(eigene, key = { "e${it.foilId}" }) { f ->
                            Zeile(foilLabel(f.brand, f.model, f.size, f.aspectRatio), null, f.foilId == foil) { onWahl(f.foilId) }
                        }
                        if (andere.isNotEmpty()) item { Kopf(I18n.t("sfilter.otherFoils")) }
                        items(andere, key = { "a${it.foilId}" }) { f ->
                            Zeile(foilLabel(f.brand, f.model, f.size, f.aspectRatio), f.sessions, f.foilId == foil) { onWahl(f.foilId) }
                        }
                        if (treffer.isEmpty()) item { Text(I18n.t("sfilter.noHits"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text(I18n.t("common.close")) } },
        dismissButton = if (foil != null) ({ TextButton(onClick = { onWahl(null) }) { Text(I18n.t("sfilter.reset")) } }) else null,
    )
}

@Composable
private fun Kopf(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 2.dp))
}

@Composable
private fun Zeile(text: String, zahl: Int?, aktiv: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .then(if (aktiv) Modifier.background(Cyan.copy(alpha = 0.2f)) else Modifier)
            .clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
            fontWeight = if (aktiv) FontWeight.SemiBold else FontWeight.Normal)
        if (zahl != null) {
            Spacer(Modifier.width(8.dp))
            Text("$zahl", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
