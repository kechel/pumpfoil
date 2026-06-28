package org.pumpfoil.app

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }

    var weight by remember { mutableStateOf("0") }
    var homespot by remember { mutableStateOf("") }
    var spots by remember { mutableStateOf<List<String>>(emptyList()) }
    var nLike by remember { mutableStateOf(true) }
    var nAnalyzed by remember { mutableStateOf(true) }
    var nRecord by remember { mutableStateOf(true) }
    var theme by remember { mutableStateOf(ThemeState.mode) }
    var lang by remember { mutableStateOf(I18n.lang) }

    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            weight = (s["weight_kg"]?.jsonPrimitive?.intOrNull ?: 0).toString()
            homespot = s["homespot"]?.jsonPrimitive?.contentOrNull ?: ""
            (s["notify_prefs"] as? kotlinx.serialization.json.JsonObject)?.let { np ->
                nLike = np["like"]?.jsonPrimitive?.booleanOrNull ?: true
                nAnalyzed = np["analyzed"]?.jsonPrimitive?.booleanOrNull ?: true
                nRecord = np["record"]?.jsonPrimitive?.booleanOrNull ?: true
            }
        } catch (_: Exception) {}
        spots = try { Api.spots().all } catch (_: Exception) { emptyList() }
        loaded = true
    }

    fun save() {
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    put("weight_kg", weight.toIntOrNull() ?: 0)
                    put("homespot", homespot)
                    put("notify_prefs", buildJsonObject {
                        put("like", nLike); put("analyzed", nAnalyzed); put("record", nRecord)
                    })
                })
                saved = true
            } catch (_: Exception) {}
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("settings.title")) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        if (!loaded) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            // Gewicht.
            Text("${I18n.t("settings.weight")} (kg)", style = MaterialTheme.typography.labelLarge)
            OutlinedTextField(
                value = weight, onValueChange = { weight = it.filter { c -> c.isDigit() }.take(3); saved = false },
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(120.dp),
            )
            Spacer(Modifier.height(16.dp))

            // Homespot.
            Text(I18n.t("settings.homespot"), style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Dropdown(
                options = listOf("" to I18n.t("settings.auto")) + spots.map { it to it },
                selected = homespot, onSelect = { homespot = it; saved = false },
            )
            Spacer(Modifier.height(16.dp))

            // Theme (lokal, sofort wirksam).
            Text(I18n.t("settings.design"), style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Dropdown(
                options = listOf("auto" to I18n.t("settings.auto"), "light" to I18n.t("settings.light"), "dark" to I18n.t("settings.dark")),
                selected = theme, onSelect = { theme = it; ThemeState.set(ctx, it) },
            )
            Spacer(Modifier.height(16.dp))

            // Sprache (sofort lokal + ans Profil, synct zu Web/Uhr).
            Text(I18n.t("settings.language"), style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Dropdown(
                options = I18n.LANGS.map { it to (LANG_NAMES[it] ?: it) },
                selected = lang,
                onSelect = { l -> lang = l; I18n.set(ctx, l); scope.launch { try { Api.updateLanguage(l) } catch (_: Exception) {} } },
            )
            Spacer(Modifier.height(16.dp))

            // Push-Benachrichtigungen.
            Text(I18n.t("settings.notifications"), style = MaterialTheme.typography.labelLarge)
            ToggleRow(I18n.t("settings.nLikes"), nLike) { nLike = it; saved = false }
            ToggleRow(I18n.t("settings.nAnalyzed"), nAnalyzed) { nAnalyzed = it; saved = false }
            ToggleRow(I18n.t("settings.nRecord"), nRecord) { nRecord = it; saved = false }

            Spacer(Modifier.height(24.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { save() }) { Text(I18n.t("common.save")) }
                if (saved) { Spacer(Modifier.width(12.dp)); Text(I18n.t("common.saved"), color = MaterialTheme.colorScheme.primary) }
            }
        }
    }
}

// Sprachnamen in der jeweiligen Sprache (Reihenfolge = I18n.LANGS).
private val LANG_NAMES = mapOf(
    "de" to "Deutsch", "gsw" to "Schwiizerdütsch", "de-AT" to "Österreichisch",
    "en" to "English", "fr" to "Français", "it" to "Italiano", "es" to "Español",
)

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun Dropdown(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = options.firstOrNull { it.first == selected }?.second ?: selected.ifBlank { "—" }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text(label, Modifier.weight(1f), maxLines = 1)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (id, lbl) ->
                DropdownMenuItem(text = { Text(lbl) }, onClick = { onSelect(id); open = false })
            }
        }
    }
}
