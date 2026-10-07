package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Setup einer Session KOMPAKT (Jan, 07.10.2026): „die ganzen Einstellungs-Moeglichkeiten (Foil, Stab,
// Gewicht, Shim …) nehmen viel zu viel Platz ein — kleine Anzeige der aktuellen Werte und ein kleiner
// Edit-Knopf daneben, im Popup gemeinsam aendern und speichern." Vorher standen Foil und vier
// Setup-Dropdowns einzeln in der Knopfzeile. Jetzt EINE Textzeile fuer alle (auch fuer Fremde, die
// vorher gar nichts sahen), der Stift nur beim Besitzer. Gleiches Muster wie iOS (SetupBearbeiten.swift).

internal fun setupTeile(s: SessionDetail): List<String> = buildList {
    s.foil?.let { add("${it.brand} ${it.model} ${it.size}".trim()) }
    val su = s.setup
    su?.stab?.let { add("${it.brand} ${it.model} ${it.size}".trim()) }
    su?.mastLenCm?.let { add("$it cm") }
    su?.shimDeg?.let { add(shimText(it)) }
    su?.board?.let { add(it.name) }
    su?.weightKg?.let { add("$it kg") }
}

/** 0 bleibt „0°", positive Werte mit Vorzeichen, Dezimale nur wenn noetig. */
internal fun shimText(v: Double): String {
    val zahl = if (v == Math.rint(v)) v.toInt().toString() else "%.1f".format(v)
    return (if (v > 0) "+" else "") + zahl + "°"
}

@Composable
internal fun SetupZeile(s: SessionDetail, kannBearbeiten: Boolean, onEdit: () -> Unit) {
    val teile = setupTeile(s)
    if (teile.isEmpty() && !kannBearbeiten) return
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            if (teile.isEmpty()) I18n.t("setup.editTitle") else teile.joinToString(" · "),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        if (kannBearbeiten) {
            IconButton(onClick = onEdit, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Filled.Edit, contentDescription = I18n.t("setup.editTitle"),
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/** Ein Auswahlfeld: Ueberschrift, aktueller Wert, Liste. `null` = Standard aus dem Profil. */
@Composable
private fun <T> Auswahl(titel: String, wert: T?, optionen: List<Pair<T?, String>>, onWahl: (T?) -> Unit) {
    var offen by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Text(titel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { offen = true }, modifier = Modifier.fillMaxWidth()) {
                Text(optionen.firstOrNull { it.first == wert }?.second ?: optionen.first().second,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = offen, onDismissRequest = { offen = false }) {
                optionen.forEachIndexed { i, (k, label) ->
                    // Trennlinie zwischen „meine" und dem restlichen Katalog (Marker: Label leer).
                    if (label.isEmpty()) { if (i > 0) HorizontalDivider(); return@forEachIndexed }
                    DropdownMenuItem(text = { Text(label) }, onClick = { onWahl(k); offen = false })
                }
            }
        }
    }
}

@Composable
internal fun SetupBearbeitenDialog(
    s: SessionDetail,
    foils: List<Foil>, meineFoils: Set<Int>,
    stabs: List<StabBrief>, meineStabs: Set<Int>,
    masten: List<Int>, shims: List<Double>, boards: List<BoardBrief>,
    caption: String, onCaption: (String) -> Unit,
    onDismiss: () -> Unit, onGespeichert: suspend () -> Unit,
) {
    val su = s.setup
    // Vorbelegt NUR, was fuer DIESE Session ausdruecklich gesetzt ist; Geerbtes = Standard (null).
    val startFoil = s.foil?.id
    val startStab = su?.stab?.takeIf { !it.isDefault }?.id
    val startMast = su?.mastLenCm?.takeIf { !su.mastIsDefault }
    val startShim = su?.shimDeg?.takeIf { !su.shimIsDefault }
    val startBoard = su?.board?.takeIf { !it.isDefault }?.id
    val startGewicht = su?.weightKg?.takeIf { !su.weightIsDefault }?.toString() ?: ""
    var foilId by remember { mutableStateOf(startFoil) }
    var stabId by remember { mutableStateOf(startStab) }
    var mast by remember { mutableStateOf(startMast) }
    var shim by remember { mutableStateOf(startShim) }
    var boardId by remember { mutableStateOf(startBoard) }
    var gewicht by remember { mutableStateOf(startGewicht) }
    var bildtext by remember { mutableStateOf(caption) }
    var busy by remember { mutableStateOf(false) }
    var fehler by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val inherit = I18n.t("setup.inherit")

    fun speichern() {
        val g = gewicht.trim()
        val kg = g.toIntOrNull()
        if (g.isNotEmpty() && (kg == null || kg !in 20..300)) { fehler = "20–300 kg"; return }
        val body = buildJsonObject {
            if (foilId != startFoil) foilId?.let { put("foil_id", it) } ?: put("foil_id", JsonNull)
            if (stabId != startStab) stabId?.let { put("stab_id", it) } ?: put("stab_id", JsonNull)
            if (mast != startMast) mast?.let { put("mast_len_cm", it) } ?: put("mast_len_cm", JsonNull)
            if (shim != startShim) shim?.let { put("shim_deg", it) } ?: put("shim_deg", JsonNull)
            if (boardId != startBoard) boardId?.let { put("board_id", it) } ?: put("board_id", JsonNull)
            if (g != startGewicht) kg?.let { put("rider_weight_kg", it) } ?: put("rider_weight_kg", JsonNull)
            if (bildtext.trim() != caption.trim()) put("caption", bildtext.trim())
        }
        busy = true
        scope.launch {
            try { Api.setSessionMeta(s.id, body); onCaption(bildtext.trim()); onGespeichert(); onDismiss() }
            catch (e: Exception) { fehler = e.message ?: "Error" }
            finally { busy = false }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(I18n.t("setup.editTitle")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // Bildtext (vorher eigener Knopf + Dialog), max. 30 Zeichen wie bisher; leer = keiner.
                OutlinedTextField(
                    value = bildtext, onValueChange = { if (it.length <= 30) bildtext = it },
                    label = { Text(I18n.t("sd.caption")) }, singleLine = true,
                    supportingText = { Text("${bildtext.length}/30") }, modifier = Modifier.fillMaxWidth(),
                )
                // Das gewaehlte Foil/den gewaehlten Stab mit in die eigene Gruppe (sonst steht er nur
                // tief im Katalog) — dieselbe Regel wie bisher im Dropdown.
                val fSchnell = foils.filter { it.id in meineFoils || it.id == foilId }
                val fRest = foils.filter { f -> fSchnell.none { it.id == f.id } }
                Auswahl(I18n.t("sd.foilOfSession"), foilId,
                    listOf<Pair<Int?, String>>(null to I18n.t("foil.useDefault")) +
                        fSchnell.map { it.id to "${it.brand} ${it.model} ${it.size}" } +
                        (if (fRest.isNotEmpty()) listOf<Pair<Int?, String>>(-1 to "") else emptyList()) +
                        fRest.map { it.id to "${it.brand} ${it.model} ${it.size}" }) { foilId = it }
                if (stabs.isNotEmpty()) {
                    val sSchnell = stabs.filter { it.id in meineStabs || it.id == stabId }
                    val sRest = stabs.filter { st -> sSchnell.none { it.id == st.id } }
                    Auswahl(I18n.t("setup.stabTitle"), stabId,
                        listOf<Pair<Int?, String>>(null to inherit) +
                            sSchnell.map { it.id to "${it.brand} ${it.model} ${it.size}".trim() } +
                            (if (sRest.isNotEmpty()) listOf<Pair<Int?, String>>(-1 to "") else emptyList()) +
                            sRest.map { it.id to "${it.brand} ${it.model} ${it.size}".trim() }) { stabId = it }
                }
                val mastWahl = (masten + listOfNotNull(mast)).distinct()
                if (mastWahl.isNotEmpty()) {
                    Auswahl(I18n.t("setup.mastTitle"), mast,
                        listOf<Pair<Int?, String>>(null to inherit) + mastWahl.map { it to "$it cm" }) { mast = it }
                }
                val shimWahl = (shims + listOfNotNull(shim)).distinct()
                if (shimWahl.isNotEmpty()) {
                    Auswahl(I18n.t("setup.shimTitle"), shim,
                        listOf<Pair<Double?, String>>(null to inherit) + shimWahl.map { it to shimText(it) }) { shim = it }
                }
                if (boards.isNotEmpty()) {
                    Auswahl(I18n.t("setup.boardTitle"), boardId,
                        listOf<Pair<Int?, String>>(null to inherit) + boards.map { it.id to it.name }) { boardId = it }
                }
                OutlinedTextField(
                    value = gewicht, onValueChange = { v -> gewicht = v.filter { it.isDigit() }.take(3) },
                    label = { Text(I18n.t("setup.weightTitle")) },
                    placeholder = { Text(su?.weightKg?.takeIf { su.weightIsDefault }?.toString() ?: "—") },
                    suffix = { Text("kg") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                fehler?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { TextButton(onClick = { speichern() }, enabled = !busy) { Text(I18n.t("common.save")) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(I18n.t("common.cancel")) } },
    )
}
