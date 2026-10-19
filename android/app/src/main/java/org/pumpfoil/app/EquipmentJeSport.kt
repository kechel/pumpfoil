package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

// Ausruestung je Sportart (19.10.2026, wie web/src/components/EquipmentJeSport.tsx): je Sportart ein
// eigener Standard fuer Foil, Board, Stab und Mast. „—" = kein eigener Wert, es gilt der allgemeine
// Standard (Stern). Der Server setzt ihn beim Anlegen und beim Umstellen der Sportart ein, aber nur
// fuer Felder, die niemand von Hand gewaehlt hat (server/app/equipment_sport.py).
private val FELDER = listOf("foil_id", "board_id", "stab_id", "mast_len_cm")
private val SPORTARTEN = listOf("pumpfoil", "wingfoil", "kitefoil", "parawing", "surf_downwind", "surf_wave",
    "sup_paddle", "wakethief", "towed", "efoil", "foildrive", "foil_scoot")

@Composable
fun EquipmentJeSportKarte(stabs: List<StabBrief>?, boards: List<BoardBrief>, myStabs: List<Int>, myMasts: List<Int>) {
    val scope = rememberCoroutineScope()
    var je by remember { mutableStateOf<Map<String, Map<String, Int>>>(emptyMap()) }
    var myFoils by remember { mutableStateOf<List<Int>>(emptyList()) }
    var foilNamen by remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    var neuOffen by remember { mutableStateOf(false) }

    fun lesen(s: JsonObject) {
        je = (s["equipment_je_sport"] as? JsonObject)?.mapValues { (_, v) ->
            (v as? JsonObject)?.mapNotNull { (k, x) -> x.jsonPrimitive.intOrNull?.let { k to it } }?.toMap() ?: emptyMap()
        } ?: emptyMap()
        myFoils = (s["my_foils"] as? kotlinx.serialization.json.JsonArray)?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
    }
    fun speichern(neu: Map<String, Map<String, Int>>) {
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    putJsonObject("equipment_je_sport") {
                        neu.forEach { (sp, e) -> putJsonObject(sp) { e.forEach { (k, v) -> put(k, v) } } }
                    }
                })
                lesen(Api.settings())
            } catch (_: Exception) {}
        }
    }
    LaunchedEffect(Unit) {
        try { lesen(Api.settings()) } catch (_: Exception) {}
        foilNamen = try { Api.foils().associate { it.id to "${it.brand} ${it.model} ${it.size}".trim() } } catch (_: Exception) { emptyMap() }
    }
    val stabNamen = (stabs ?: emptyList()).associate { it.id to "${it.brand} ${it.model} ${it.size}".trim() }

    Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(I18n.t("setup.perSportTitle"), fontWeight = FontWeight.SemiBold)
            Text(I18n.t("setup.perSportHint"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            je.keys.forEach { sp ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(I18n.t("cls.sport.$sp"), fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    IconButton(onClick = { speichern(je - sp) }) { Icon(Icons.Filled.Close, contentDescription = null) }
                }
                FELDER.forEach { f ->
                    val (titel, opts) = when (f) {
                        "foil_id" -> I18n.t("setup.colFoil") to myFoils.map { it to (foilNamen[it] ?: "#$it") }
                        "board_id" -> I18n.t("setup.colBoard") to boards.map { it.id to it.name }
                        "stab_id" -> I18n.t("setup.colStab") to myStabs.map { it to (stabNamen[it] ?: "#$it") }
                        else -> I18n.t("setup.colMast") to myMasts.map { it to "$it cm" }
                    }
                    Auswahl(titel, je[sp]?.get(f), opts) { wert ->
                        val e = (je[sp] ?: emptyMap()).toMutableMap()
                        if (wert == null) e.remove(f) else e[f] = wert
                        speichern(je + (sp to e))
                    }
                }
            }
            val frei = SPORTARTEN.filter { it !in je.keys }
            if (frei.isNotEmpty()) Box {
                OutlinedButton(onClick = { neuOffen = true }) { Text(I18n.t("setup.perSportAdd") + " …") }
                DropdownMenu(expanded = neuOffen, onDismissRequest = { neuOffen = false }) {
                    frei.forEach { sp ->
                        DropdownMenuItem(text = { Text(I18n.t("cls.sport.$sp")) },
                            onClick = { neuOffen = false; je = je + (sp to emptyMap()) })
                    }
                }
            }
        }
    }
}

@Composable
private fun Auswahl(titel: String, wert: Int?, opts: List<Pair<Int, String>>, onWahl: (Int?) -> Unit) {
    var offen by remember { mutableStateOf(false) }
    val anzeige = opts.firstOrNull { it.first == wert }?.second ?: "— ${I18n.t("setup.perSportGeneral")}"
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(titel, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(0.35f))
        Box(Modifier.weight(0.65f)) {
            OutlinedButton(onClick = { offen = true }, modifier = Modifier.fillMaxWidth()) {
                Text(anzeige, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            DropdownMenu(expanded = offen, onDismissRequest = { offen = false }) {
                DropdownMenuItem(text = { Text("— ${I18n.t("setup.perSportGeneral")}") }, onClick = { offen = false; onWahl(null) })
                opts.forEach { (id, name) ->
                    DropdownMenuItem(text = { Text(name) }, onClick = { offen = false; onWahl(id) })
                }
            }
        }
    }
}
