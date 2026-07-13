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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
    var activityType by remember { mutableStateOf("surfing") }
    var spots by remember { mutableStateOf<List<String>>(emptyList()) }
    val snackHost = remember { SnackbarHostState() }
    fun flashSaved() { scope.launch { snackHost.showSnackbar(I18n.t("common.saved")) } }
    var nLike by remember { mutableStateOf(true) }
    var nAnalyzed by remember { mutableStateOf(true) }
    var nRecord by remember { mutableStateOf(true) }
    var theme by remember { mutableStateOf(ThemeState.mode) }
    var lang by remember { mutableStateOf(I18n.lang) }
    var pwCur by remember { mutableStateOf("") }
    var pwNew by remember { mutableStateOf("") }
    var pwMsg by remember { mutableStateOf<Pair<Boolean, String>?>(null) }   // (ok, text)
    var pwBusy by remember { mutableStateOf(false) }
    var sensitivity by remember { mutableStateOf("normal") }
    var reanalysis by remember { mutableStateOf<ReanalysisProgress?>(null) }

    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            weight = (s["weight_kg"]?.jsonPrimitive?.intOrNull ?: 0).toString()
            homespot = s["homespot"]?.jsonPrimitive?.contentOrNull ?: ""
            activityType = s["activity_type"]?.jsonPrimitive?.contentOrNull ?: "surfing"
            (s["notify_prefs"] as? kotlinx.serialization.json.JsonObject)?.let { np ->
                nLike = np["like"]?.jsonPrimitive?.booleanOrNull ?: true
                nAnalyzed = np["analyzed"]?.jsonPrimitive?.booleanOrNull ?: true
                nRecord = np["record"]?.jsonPrimitive?.booleanOrNull ?: true
            }
        } catch (_: Exception) {}
        try { sensitivity = Api.me().foilSensitivity ?: "normal" } catch (_: Exception) {}
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
                flashSaved()
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
        snackbarHost = { SnackbarHost(snackHost) },
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

            // Aktivitätstyp der Garmin-Aufnahme (Surfen | Open Water). Auto-Save + Bestätigung.
            Text(I18n.t("account.activityType"), style = MaterialTheme.typography.labelLarge)
            Text(I18n.t("account.activityTypeHint"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))
            Dropdown(
                options = listOf(
                    "surfing" to I18n.t("account.activitySurfing"),
                    "openwater" to I18n.t("account.activityOpenWater"),
                ),
                selected = activityType,
                onSelect = onSelect@{ v ->
                    if (v == activityType) return@onSelect
                    activityType = v
                    scope.launch {
                        try { Api.saveSettings(buildJsonObject { put("activity_type", v) }); flashSaved() } catch (_: Exception) {}
                    }
                },
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

            // Persönliche Erkennungs-Empfindlichkeit (nur eigene Ansicht; Server reanalysiert eigene Sessions).
            Text(I18n.t("foilsens.label"), style = MaterialTheme.typography.labelLarge)
            Text(I18n.t("foilsens.hint"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))
            Dropdown(
                options = listOf(
                    "normal" to I18n.t("foilsens.normal"),
                    "light" to I18n.t("foilsens.light"),
                    "attempts" to I18n.t("foilsens.attempts"),
                ),
                selected = sensitivity,
                onSelect = onSelect@{ v ->
                    if (v == sensitivity) return@onSelect
                    sensitivity = v
                    scope.launch {
                        try { Api.updateFoilSensitivity(v) } catch (_: Exception) {}
                        if (v == "normal") { reanalysis = null; return@launch }
                        reanalysis = ReanalysisProgress(running = true, done = 0, total = 0)
                        // Fortschritt pollen bis fertig (gecachte Stufen sind sofort durch).
                        repeat(120) {
                            kotlinx.coroutines.delay(1000)
                            val p = try { Api.reanalysisProgress() } catch (_: Exception) { null }
                            reanalysis = p
                            if (p == null || !p.running) return@launch
                        }
                    }
                },
            )
            reanalysis?.takeIf { it.running }?.let { p ->
                Text("${p.done}/${if (p.total > 0) p.total else "…"} · ${I18n.t("foilsens.reanalyzing")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                if (p.total > 0) {
                    LinearProgressIndicator(progress = { p.done.toFloat() / p.total },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
            Spacer(Modifier.height(16.dp))

            // Push-Benachrichtigungen.
            Text(I18n.t("settings.notifications"), style = MaterialTheme.typography.labelLarge)
            ToggleRow(I18n.t("settings.nLikes"), nLike) { nLike = it; saved = false }
            ToggleRow(I18n.t("settings.nAnalyzed"), nAnalyzed) { nAnalyzed = it; saved = false }
            ToggleRow(I18n.t("settings.nRecord"), nRecord) { nRecord = it; saved = false }
            Spacer(Modifier.height(20.dp))

            // Passwort ändern (wie PWA-Settings).
            Text(I18n.t("profile.changePw"), style = MaterialTheme.typography.labelLarge)
            Text(I18n.t("profile.changePwHint"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))
            OutlinedTextField(
                value = pwCur, onValueChange = { pwCur = it; pwMsg = null },
                singleLine = true, label = { Text(I18n.t("profile.curPw")) },
                visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = pwNew, onValueChange = { pwNew = it; pwMsg = null },
                singleLine = true, label = { Text(I18n.t("profile.newPw")) },
                visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    pwMsg = null
                    if (pwNew.length < 8) { pwMsg = false to I18n.t("profile.pwMin"); return@Button }
                    pwBusy = true
                    scope.launch {
                        try {
                            Api.changePassword(pwCur, pwNew)
                            pwMsg = true to I18n.t("profile.pwChanged"); pwCur = ""; pwNew = ""
                        } catch (e: Exception) {
                            pwMsg = false to (if ((e.message ?: "").contains("400")) I18n.t("profile.pwWrong") else I18n.t("profile.error"))
                        }
                        pwBusy = false
                    }
                },
                enabled = !pwBusy && pwCur.isNotBlank() && pwNew.isNotBlank(),
            ) { Text(I18n.t("profile.changePw")) }
            pwMsg?.let { (ok, text) ->
                Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp),
                    color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            }

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
    "fi" to "Suomi",
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
