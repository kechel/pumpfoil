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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import kotlinx.coroutines.launch
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

// Vibrationsalarm konfigurieren (spiegelt web AlarmEditor). Persistiert via PUT /api/settings;
// die Uhr-Recorder laden das über /api/devices/config.
// Pro Aufruf evaluiert, damit der Sprachwechsel greift.
private fun patterns() = listOf(
    "short1" to I18n.t("alarm.patShort1"), "short2" to I18n.t("alarm.patShort2"),
    "long2" to I18n.t("alarm.patLong2"), "lsl" to I18n.t("alarm.patLsl"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlarmScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }

    var enabled by remember { mutableStateOf(false) }
    var def by remember { mutableStateOf("foil") }
    var high by remember { mutableStateOf("0") }
    var low by remember { mutableStateOf("0") }
    var patHigh by remember { mutableStateOf("short2") }
    var patLow by remember { mutableStateOf("long2") }
    var repeat by remember { mutableStateOf("once") }

    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            enabled = s["alarm_enabled"]?.jsonPrimitive?.booleanOrNull ?: false
            def = s["alarm_default"]?.jsonPrimitive?.contentOrNull ?: "foil"
            high = (s["speed_high"]?.jsonPrimitive?.intOrNull ?: 0).toString()
            low = (s["speed_low"]?.jsonPrimitive?.intOrNull ?: 0).toString()
            patHigh = s["alarm_pattern_high"]?.jsonPrimitive?.contentOrNull ?: "short2"
            patLow = s["alarm_pattern_low"]?.jsonPrimitive?.contentOrNull ?: "long2"
            repeat = s["alarm_repeat"]?.jsonPrimitive?.contentOrNull ?: "once"
        } catch (_: Exception) {}
        loaded = true
    }

    fun mark() { saved = false }
    fun save() {
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    put("alarm_enabled", enabled)
                    put("alarm_default", def)
                    put("speed_high", high.toIntOrNull() ?: 0)
                    put("speed_low", low.toIntOrNull() ?: 0)
                    put("alarm_pattern_high", patHigh)
                    put("alarm_pattern_low", patLow)
                    put("alarm_repeat", repeat)
                })
                saved = true
            } catch (_: Exception) {}
        }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("alarm.title")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
        )
    }) { pad ->
        if (!loaded) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(
                I18n.t("alarm.desc"),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(checked = enabled, onCheckedChange = { enabled = it; mark() })
                Spacer(Modifier.width(10.dp))
                Text(I18n.t("alarm.enable"))
            }
            if (enabled) {
                Spacer(Modifier.height(16.dp))
                // Vorwahl auf der Uhr.
                Text(I18n.t("alarm.defaultSource"), style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(4.dp))
                Dropdown(
                    options = listOf("foil" to I18n.t("alarm.defaultFoil"), "fixed" to I18n.t("alarm.defaultFixed")),
                    selected = def, onSelect = { def = it; mark() },
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    I18n.t("alarm.defaultHelp"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
                // Max-Speed.
                ThresholdCard(
                    title = I18n.t("alarm.overTitle"), fieldLabel = I18n.t("alarm.maxSpeed"),
                    value = high, onValue = { high = it; mark() },
                    pattern = patHigh, onPattern = { patHigh = it; mark() },
                )
                Spacer(Modifier.height(12.dp))
                // Min-Speed.
                ThresholdCard(
                    title = I18n.t("alarm.underTitle"), fieldLabel = I18n.t("alarm.minSpeed"),
                    value = low, onValue = { low = it; mark() },
                    pattern = patLow, onPattern = { patLow = it; mark() },
                )
                Spacer(Modifier.height(12.dp))
                // Auslösen-Modus.
                Text(I18n.t("alarm.mode"), style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(4.dp))
                Dropdown(
                    options = listOf(
                        "once" to I18n.t("alarm.modeOnce"),
                        "continuous" to I18n.t("alarm.modeContinuous"),
                    ),
                    selected = repeat, onSelect = { repeat = it; mark() },
                )
                Spacer(Modifier.height(8.dp))
                Text(I18n.t("alarm.zeroHint"),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(24.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { save() }) { Text(I18n.t("common.save")) }
                if (saved) {
                    Spacer(Modifier.width(12.dp))
                    Text(I18n.t("common.saved"), color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun ThresholdCard(
    title: String, fieldLabel: String,
    value: String, onValue: (String) -> Unit,
    pattern: String, onPattern: (String) -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = value, onValueChange = { onValue(it.filter { c -> c.isDigit() }.take(2)) },
                    label = { Text(fieldLabel) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(96.dp),
                )
                Text("km/h")
                Spacer(Modifier.width(4.dp))
                Dropdown(options = patterns(), selected = pattern, onSelect = onPattern, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Dropdown(
    options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val label = options.firstOrNull { it.first == selected }?.second ?: selected
    Box(modifier) {
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
