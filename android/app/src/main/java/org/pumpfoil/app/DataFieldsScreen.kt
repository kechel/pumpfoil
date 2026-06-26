package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin Config.mc.
private val FIELD_OPTIONS = listOf(
    0 to "— leer —", 1 to "Speed (3 s)", 5 to "Speed (aktuell)", 6 to "Ø Speed", 7 to "Max Speed",
    2 to "Puls", 8 to "Ø Puls", 9 to "Max Puls", 3 to "Zeit", 4 to "Distanz", 10 to "Höhe",
    13 to "Aufstieg", 11 to "Temperatur", 12 to "Uhrzeit", 14 to "Lauf Dauer (live)",
    15 to "Lauf Strecke (live)", 16 to "Letzter Lauf: Dauer", 17 to "Letzter Lauf: Strecke",
    18 to "Letzter Lauf: Ø Speed", 19 to "Letzter Lauf: Max Speed", 20 to "Läufe (Anzahl)",
)
private fun fieldLabel(id: Int) = FIELD_OPTIONS.firstOrNull { it.first == id }?.second ?: "—"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataFieldsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var views by remember { mutableStateOf<List<List<Int>>>(listOf(listOf(1, 2, 0))) }

    LaunchedEffect(Unit) {
        try {
            val v = Api.settings()["views"]?.jsonArray?.map { row ->
                row.jsonArray.map { it.jsonPrimitive.intOrNull ?: 0 }.let { f ->
                    listOf(f.getOrElse(0) { 0 }, f.getOrElse(1) { 0 }, f.getOrElse(2) { 0 })
                }
            }
            if (!v.isNullOrEmpty()) views = v
        } catch (_: Exception) {}
        loaded = true
    }

    fun setField(viewIdx: Int, slot: Int, id: Int) {
        views = views.mapIndexed { i, v -> if (i == viewIdx) v.toMutableList().also { it[slot] = id } else v }
        saved = false
    }

    fun save() {
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    put("views", buildJsonArray {
                        views.forEach { v -> add(buildJsonArray { v.forEach { add(it) } }) }
                    })
                })
                saved = true
            } catch (_: Exception) {}
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Datenseiten") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        if (!loaded) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text("Bis zu 3 Felder pro Seite. Leere Seiten entfallen auf der Uhr.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            views.forEachIndexed { vi, v ->
                Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Seite ${vi + 1}", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                            if (views.size > 1) {
                                IconButton(onClick = { views = views.filterIndexed { i, _ -> i != vi }; saved = false }) {
                                    Icon(Icons.Filled.Delete, contentDescription = "Seite entfernen")
                                }
                            }
                        }
                        (0..2).forEach { slot ->
                            FieldDropdown(v.getOrElse(slot) { 0 }) { setField(vi, slot, it) }
                            Spacer(Modifier.height(6.dp))
                        }
                    }
                }
            }
            if (views.size < 8) {
                OutlinedButton(onClick = { views = views + listOf(listOf(0, 0, 0)); saved = false }) {
                    Text("Seite hinzufügen")
                }
            }
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { save() }) { Text("Speichern") }
                if (saved) { Spacer(Modifier.width(12.dp)); Text("Gespeichert", color = MaterialTheme.colorScheme.primary) }
            }
        }
    }
}

@Composable
private fun FieldDropdown(selected: Int, onSelect: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text(fieldLabel(selected), Modifier.weight(1f), maxLines = 1)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            FIELD_OPTIONS.forEach { (id, label) ->
                DropdownMenuItem(text = { Text(label) }, onClick = { onSelect(id); open = false })
            }
        }
    }
}
