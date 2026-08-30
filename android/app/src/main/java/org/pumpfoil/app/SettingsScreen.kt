package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
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
    // Puls-Zonen: sechs steigende Grenzen (Z1-unten … Z5-oben). Der Server liefert nie leer —
    // ohne eigene Einstellung kommt ein Vorschlag aus dem hoechsten je gemessenen Puls.
    var zonen by remember { mutableStateOf(listOf(95, 114, 133, 152, 171, 190)) }
    var zonenVorschlag by remember { mutableStateOf(true) }
    var homespot by remember { mutableStateOf("") }
    var activityType by remember { mutableStateOf("surfing") }
    var hasGarmin by remember { mutableStateOf(false) }   // Aktivitätstyp nur bei verknüpfter Garmin-Uhr
    var spots by remember { mutableStateOf<List<String>>(emptyList()) }
    val snackHost = remember { SnackbarHostState() }
    fun flashSaved() { scope.launch { snackHost.showSnackbar(I18n.t("common.saved")) } }
    var nLike by remember { mutableStateOf(true) }
    var nAnalyzed by remember { mutableStateOf(true) }
    var nRecord by remember { mutableStateOf(true) }
    var nChat by remember { mutableStateOf(true) }
    var theme by remember { mutableStateOf(ThemeState.mode) }
    var lang by remember { mutableStateOf(I18n.lang) }
    var pwCur by remember { mutableStateOf("") }
    var pwNew by remember { mutableStateOf("") }
    var pwMsg by remember { mutableStateOf<Pair<Boolean, String>?>(null) }   // (ok, text)
    var pwBusy by remember { mutableStateOf(false) }
    var spZonen by remember { mutableStateOf(listOf(8, 12, 16, 20, 24, 28)) }
    var spZonenVorschlag by remember { mutableStateOf(true) }
    var sensitivity by remember { mutableStateOf("normal") }
    var pumpUnit by remember { mutableStateOf(PumpUnit.unit) }
    var reanalysis by remember { mutableStateOf<ReanalysisProgress?>(null) }

    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            weight = (s["weight_kg"]?.jsonPrimitive?.intOrNull ?: 0).toString()
            homespot = s["homespot"]?.jsonPrimitive?.contentOrNull ?: ""
            activityType = s["activity_type"]?.jsonPrimitive?.contentOrNull ?: "surfing"
            (s["hr_zones"] as? kotlinx.serialization.json.JsonArray)
                ?.mapNotNull { it.jsonPrimitive.intOrNull }
                ?.takeIf { it.size == 6 }?.let { zonen = it }
            zonenVorschlag = s["hr_zones_suggested"]?.jsonPrimitive?.booleanOrNull ?: false
            (s["speed_zones"] as? kotlinx.serialization.json.JsonArray)
                ?.mapNotNull { it.jsonPrimitive.intOrNull }
                ?.takeIf { it.size == 6 }?.let { spZonen = it }
            spZonenVorschlag = s["speed_zones_suggested"]?.jsonPrimitive?.booleanOrNull ?: false
            // Dieselben Zahlen fuer die Layout-Vorschauen UND fuer die Wert-Farbe auf der Uhr.
            LayoutScales.aus(s)
            (s["notify_prefs"] as? kotlinx.serialization.json.JsonObject)?.let { np ->
                nLike = np["like"]?.jsonPrimitive?.booleanOrNull ?: true
                nAnalyzed = np["analyzed"]?.jsonPrimitive?.booleanOrNull ?: true
                nRecord = np["record"]?.jsonPrimitive?.booleanOrNull ?: true
                nChat = np["chat"]?.jsonPrimitive?.booleanOrNull ?: true
            }
        } catch (_: Exception) {}
        try {
            val p = Api.me()
            sensitivity = p.foilSensitivity ?: "normal"
            pumpUnit = p.pumpUnit ?: "hz"
            PumpUnit.set(ctx, pumpUnit)
        } catch (_: Exception) {}
        hasGarmin = try { Api.myDevices().any { it.platform == "garmin" && it.revokedAt == null } } catch (_: Exception) { false }
        spots = try { Api.spots().all } catch (_: Exception) { emptyList() }
        loaded = true
    }

    fun save() {
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    put("weight_kg", weight.toIntOrNull() ?: 0)
                    put("hr_zones", kotlinx.serialization.json.buildJsonArray {
                        zonen.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
                    })
                    put("speed_zones", kotlinx.serialization.json.buildJsonArray {
                        spZonen.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
                    })
                    put("homespot", homespot)
                    put("notify_prefs", buildJsonObject {
                        // "chat" MUSS mit: notify_prefs wird als Ganzes ersetzt, ein Speichern
                        // von hier hat die im Web gesetzte Chat-Einstellung also still geloescht.
                        put("like", nLike); put("analyzed", nAnalyzed); put("record", nRecord)
                        put("chat", nChat)
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

            // Zonen — EIN Block, zweimal benutzt: Puls und Geschwindigkeit funktionieren
            // identisch (sechs Grenzen = fuenf Zonen). Sie sind die einzige Quelle fuer alle
            // Plattformen (nur Garmin und Zepp koennen Zonen selbst lesen, Wear OS und watchOS
            // haben keine API dafuer) und faerben BEIDES: die Zahl auf der Uhr und die
            // Wert-Grafiken. Doku: docs/COLOR-ZONES.md.
            ZonenBlock(
                praefix = "hrz", einheit = "bpm", min = 60, max = 240,
                werte = zonen, vorschlag = zonenVorschlag,
                onChange = { w, i -> zonen = zonenRepariert(w, i, 60, 240); zonenVorschlag = false; saved = false },
                onReset = {
                    scope.launch {
                        try {
                            Api.saveSettings(buildJsonObject { put("hr_zones", kotlinx.serialization.json.JsonNull) })
                            // saveSettings gibt nichts zurueck -> den neuen Vorschlag frisch holen.
                            val r = Api.settings()
                            (r["hr_zones"] as? kotlinx.serialization.json.JsonArray)
                                ?.mapNotNull { it.jsonPrimitive.intOrNull }
                                ?.takeIf { it.size == 6 }?.let { zonen = it }
                            zonenVorschlag = true
                            flashSaved()
                        } catch (_: Exception) {}
                    }
                },
            )
            Spacer(Modifier.height(16.dp))
            ZonenBlock(
                praefix = "spz", einheit = "km/h", min = 1, max = 80,
                werte = spZonen, vorschlag = spZonenVorschlag,
                onChange = { w, i -> spZonen = zonenRepariert(w, i, 1, 80); spZonenVorschlag = false; saved = false },
                onReset = {
                    scope.launch {
                        try {
                            Api.saveSettings(buildJsonObject { put("speed_zones", kotlinx.serialization.json.JsonNull) })
                            val r = Api.settings()
                            (r["speed_zones"] as? kotlinx.serialization.json.JsonArray)
                                ?.mapNotNull { it.jsonPrimitive.intOrNull }
                                ?.takeIf { it.size == 6 }?.let { spZonen = it }
                            spZonenVorschlag = true
                            flashSaved()
                        } catch (_: Exception) {}
                    }
                },
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

            // Aktivitätstyp der Garmin-Aufnahme (Surfen | Open Water). Nur bei verknüpfter Garmin-Uhr.
            if (hasGarmin) {
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
            }

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

            // Pump-Kadenz als Hz oder als Pumps pro Minute (reine Anzeige, wirkt sofort überall).
            Text(I18n.t("pumpunit.label"), style = MaterialTheme.typography.labelLarge)
            Text(I18n.t("pumpunit.hint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))
            Dropdown(
                options = listOf(
                    "hz" to I18n.t("pumpunit.hz"),
                    "ppm" to I18n.t("pumpunit.ppm"),
                ),
                selected = pumpUnit,
                onSelect = onSelect@{ v ->
                    if (v == pumpUnit) return@onSelect
                    pumpUnit = v
                    PumpUnit.set(ctx, v)   // lokal sofort, danach ans Profil (synct zu Web/anderen Geräten)
                    scope.launch { try { Api.updatePumpUnit(v) } catch (_: Exception) {} }
                },
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
            ToggleRow(I18n.t("settings.nChat"), nChat) { nChat = it; saved = false }
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
            SocialKanalBlock()

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
    "fi" to "Suomi", "nl" to "Nederlands", "cs" to "Čeština",
    "pt" to "Português", "ja" to "日本語", "zh" to "中文", "ru" to "Русский", "id" to "Bahasa Indonesia",
    // nb fehlte hier seit dem Norwegisch-Rollout — der Picker haette den rohen Code "nb" gezeigt.
    "nb" to "Norsk", "pl" to "Polski",
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


/** Zonen-Farben Z1…Z5 (Spiegel von ZONE_COLORS in LayoutRender.kt / watchLayout.ts). */
private val ZONEN_FARBEN = listOf(
    androidx.compose.ui.graphics.Color(0xFF3B82F6), androidx.compose.ui.graphics.Color(0xFF22C55E),
    androidx.compose.ui.graphics.Color(0xFFEAB308), androidx.compose.ui.graphics.Color(0xFFF97316),
    androidx.compose.ui.graphics.Color(0xFFEF4444),
)

/** Grenzen muessen streng steigen. Statt eine Eingabe abzulehnen (und den Nutzer raetseln zu
 *  lassen) die Nachbarn mitschieben — so bleibt jede Zone mindestens 1 bpm breit. Spiegel von
 *  `repariert` in web/src/components/HrZones.tsx. */
// Grenzen muessen streng steigen. Statt eine Eingabe abzulehnen (und den Nutzer raetseln zu
// lassen) die Nachbarn mitschieben — so bleibt jede Zone mindestens 1 breit. Spiegel von
// ZonesCard.tsx und SettingsView.swift.
private fun zonenRepariert(w: List<Int>, i: Int, min: Int, max: Int): List<Int> {
    val out = w.map { it.coerceIn(min, max) }.toMutableList()
    for (k in i + 1 until out.size) out[k] = maxOf(out[k], out[k - 1] + 1)
    for (k in i - 1 downTo 0) out[k] = minOf(out[k], out[k + 1] - 1)
    return out.map { it.coerceIn(min, max) }
}

// Ein Zonen-Block (fuenf Zeilen + Rueckfall-Hinweis/Zuruecksetzen). `praefix` waehlt die
// i18n-Schluessel ("hrz" oder "spz"), damit Puls und Geschwindigkeit dieselbe Oberflaeche haben.
@Composable
private fun ZonenBlock(
    praefix: String, einheit: String, min: Int, max: Int,
    werte: List<Int>, vorschlag: Boolean,
    onChange: (List<Int>, Int) -> Unit, onReset: () -> Unit,
) {
    val stellen = if (max >= 100) 3 else 2
    Text(I18n.t("$praefix.title"), style = MaterialTheme.typography.labelLarge)
    Text(I18n.t("$praefix.hint"), style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))
    ZONEN_FARBEN.forEachIndexed { i, farbe ->
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(farbe))
            Spacer(Modifier.width(8.dp))
            Text(I18n.t("$praefix.z${i + 1}"), Modifier.width(120.dp),
                style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = werte[i].toString(),
                onValueChange = { v ->
                    val n = v.filter { c -> c.isDigit() }.take(stellen).toIntOrNull() ?: 0
                    onChange(werte.toMutableList().also { it[i] = n }, i)
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(96.dp),
            )
            Text(" – ", style = MaterialTheme.typography.bodyMedium)
            if (i < 4) {
                Text("${werte[i + 1]}", style = MaterialTheme.typography.bodyMedium)
            } else {
                OutlinedTextField(
                    value = werte[5].toString(),
                    onValueChange = { v ->
                        val n = v.filter { c -> c.isDigit() }.take(stellen).toIntOrNull() ?: 0
                        onChange(werte.toMutableList().also { it[5] = n }, 5)
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(96.dp),
                )
            }
            Spacer(Modifier.width(6.dp))
            Text(einheit, style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (vorschlag) {
        Text(I18n.t("$praefix.isSuggestion").replace("{max}", "${werte[5]}"),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp))
    } else {
        OutlinedButton(onClick = onReset, modifier = Modifier.padding(top = 4.dp)) {
            Text(I18n.t("$praefix.reset"))
        }
    }
}


/**
 * Eigener YouTube-Kanal fuer den Community-Feed.
 *
 * Speichert sich SELBST (eigener Endpunkt `/api/social/mine`), nicht ueber den
 * „Speichern"-Knopf der Seite — sonst wuerde eine Kanal-Aenderung stumm mitgehen, wenn jemand
 * nur seine Sprache umstellt.
 *
 * Ein eingetragener Kanal landet immer erst als „wartet auf Freigabe"; ein bereits
 * freigegebener bleibt bis dahin live.
 */
@Composable
private fun SocialKanalBlock() {
    val scope = rememberCoroutineScope()
    var stand by remember { mutableStateOf<SocialChannelState?>(null) }
    var url by remember { mutableStateOf("") }
    var fehler by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { stand = try { Api.socialMine() } catch (_: Exception) { null } }

    Text(I18n.t("social.channelTitle"), style = MaterialTheme.typography.titleMedium)
    Text(I18n.t("social.channelHint"), style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))

    stand?.let { st ->
        val (text, farbe) = when {
            st.blocked -> I18n.t("social.stateBlocked") to MaterialTheme.colorScheme.error
            st.status == "approved" && st.url != null ->
                "✓ ${I18n.t("social.stateApproved")}: ${st.url}" to MaterialTheme.colorScheme.primary
            st.status == "pending" ->
                "${I18n.t("social.statePending")}: ${st.pendingUrl ?: ""}" to MaterialTheme.colorScheme.tertiary
            st.status == "rejected" && st.rejectedReason != null ->
                "${I18n.t("social.stateRejected")}: ${st.rejectedReason}" to MaterialTheme.colorScheme.error
            else -> "" to MaterialTheme.colorScheme.onSurfaceVariant
        }
        if (text.isNotEmpty()) {
            Text(text, style = MaterialTheme.typography.bodyMedium, color = farbe,
                 modifier = Modifier.padding(top = 6.dp))
        }
    }

    OutlinedTextField(
        value = url, onValueChange = { url = it },
        placeholder = { Text("https://www.youtube.com/@deinkanal") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
    )
    if (fehler.isNotEmpty()) {
        Text(fehler, style = MaterialTheme.typography.bodyMedium,
             color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp))
    }
    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Button(
            enabled = !busy && url.isNotBlank(),
            onClick = {
                busy = true; fehler = ""
                scope.launch {
                    try { stand = Api.socialSetChannel(url.trim()); url = "" }
                    catch (_: Exception) { fehler = I18n.t("social.badUrl") }
                    busy = false
                }
            },
        ) { Text(I18n.t(if (stand?.url != null) "social.submitChange" else "social.submit")) }
        if (stand?.url != null) {
            Spacer(Modifier.width(8.dp))
            OutlinedButton(onClick = {
                scope.launch { stand = try { Api.socialRemoveChannel() } catch (_: Exception) { stand } }
            }) { Text(I18n.t("social.remove")) }
        }
    }
}
