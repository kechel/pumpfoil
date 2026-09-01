package org.pumpfoil.app

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin Config.mc. Anzeigereihenfolge;
// Labels lokalisiert über i18n-Key "field.<id>".
// Höhe (10) / Anstieg (13) / Temperatur (11) ausgelassen: Wear/Apple Watch haben keinen Baro-/
// Temp-Sensor und für einen Wassersport sind sie ~konstant/0 -> würden nur „–" zeigen. (Web
// behält sie für Garmin-Nutzer mit Barometer.)
private val FIELD_IDS = listOf(0, 1, 5, 6, 7, 2, 8, 9, 3, 4, 12, 14, 15, 16, 17, 18, 19, 20)
private fun fieldLabel(id: Int) = I18n.t("field.$id")

// Eine Seite ist ENTWEDER eine klassische 3-Feld-Seite ODER ein eigenes Layout (nur Verweis auf
// dessen ID). Genau so liegt es im Server: ein Eintrag in `pages`/`off_foil_pages`/`pause_pages`
// ist eine Liste (3 Feld-IDs) oder eine Zahl (watch_layouts.id) — siehe settings.py:43-56.
private sealed interface WatchPage
private data class ClassicPage(val fields: List<Int>) : WatchPage
private data class LayoutPage(val layoutId: Int) : WatchPage

/** Liest einen Seiten-Satz; fällt auf die Alt-Schlüssel zurück, wenn der neue fehlt. */
private fun readPages(
    s: kotlinx.serialization.json.JsonObject, key: String, legacyView: String?, legacyLayout: String?,
): List<WatchPage> {
    val arr = s[key]?.jsonArray
    if (arr != null) {
        val out = arr.mapNotNull { el ->
            val prim = (el as? kotlinx.serialization.json.JsonPrimitive)?.intOrNull
            if (prim != null) LayoutPage(prim)
            else (el as? kotlinx.serialization.json.JsonArray)?.let { row ->
                val f = row.map { it.jsonPrimitive.intOrNull ?: 0 }
                ClassicPage(listOf(f.getOrElse(0) { 0 }, f.getOrElse(1) { 0 }, f.getOrElse(2) { 0 }))
            }
        }
        if (out.isNotEmpty()) return out
    }
    legacyLayout?.let { k -> s[k]?.jsonPrimitive?.intOrNull?.let { return listOf(LayoutPage(it)) } }
    legacyView?.let { k ->
        s[k]?.jsonArray?.map { it.jsonPrimitive.intOrNull ?: 0 }?.let { f ->
            if (f.size >= 3) return listOf(ClassicPage(listOf(f[0], f[1], f[2])))
        }
    }
    return emptyList()
}

private fun pagesJson(pages: List<WatchPage>) = buildJsonArray {
    pages.forEach { pg ->
        when (pg) {
            is ClassicPage -> add(buildJsonArray { pg.fields.forEach { add(it) } })
            is LayoutPage -> add(pg.layoutId)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataFieldsScreen(onBack: () -> Unit, onGallery: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var onFoil by remember { mutableStateOf<List<WatchPage>>(listOf(ClassicPage(listOf(1, 2, 0)))) }
    var offFoil by remember { mutableStateOf<List<WatchPage>>(listOf(ClassicPage(listOf(12, 17, 16)))) }
    var pause by remember { mutableStateOf<List<WatchPage>>(listOf(ClassicPage(listOf(12, 20, 2)))) }
    var browseAll by remember { mutableStateOf(true) }
    var layoutsEnabled by remember { mutableStateOf(true) }
    // Die zwei Schalter, die der App bis 17.08. fehlten (PARITY-AUDIT). Beide gehoeren der
    // UHR, nicht der Auswertung: `colorByValue` faerbt Werte auf dem Uhr-Screen nach Hoehe,
    // `auto_start` startet die Aufnahme, sobald GPS Bewegung sieht.
    // NICHT verwechseln mit `phone_autostart` in RecordScreen.kt — das ist der Handy-Recorder.
    var colorByValue by remember { mutableStateOf(false) }
    var autoStartWatch by remember { mutableStateOf(true) }
    // Halten oder Druecken fuer die Uhr-Aktionen (Beenden/Verwerfen) — gilt fuer ALLE eigenen
    // Uhren, kein Geraete-Override: das ist eine Bediengewohnheit, keine Geraete-Eigenschaft.
    var stopMode by remember { mutableStateOf("hold") }
    var layouts by remember { mutableStateOf<List<WatchLayoutBrief>>(emptyList()) }

    LaunchedEffect(Unit) {
        try {
            val s = Api.settings()
            // `pages` ist der maßgebliche Satz (3-Feld-Seiten und Layouts gemischt); `views` ist
            // nur die abgeleitete Alt-Liste für Uhren-Apps ohne Layout-Unterstützung.
            readPages(s, "pages", "views", null).let { if (it.isNotEmpty()) onFoil = it }
            readPages(s, "off_foil_pages", "off_foil_view", "off_foil_layout_id").let { if (it.isNotEmpty()) offFoil = it }
            readPages(s, "pause_pages", "pause_view", "pause_layout_id").let { if (it.isNotEmpty()) pause = it }
            browseAll = s["browse_all_pages"]?.jsonPrimitive?.booleanOrNull ?: true
            layoutsEnabled = s["layouts_enabled"]?.jsonPrimitive?.booleanOrNull ?: true
            colorByValue = s["colorByValue"]?.jsonPrimitive?.booleanOrNull ?: false
            autoStartWatch = s["auto_start"]?.jsonPrimitive?.booleanOrNull ?: true
            stopMode = if (s["stop_mode"]?.jsonPrimitive?.contentOrNull == "press") "press" else "hold"
            // Skalen der Wert-Grafiken (Puls-Zonen + Geschwindigkeitsspanne) aus dem Profil —
            // ohne sie zeichnete die Vorschau geratene Zonenfarben.
            LayoutScales.aus(s)
        } catch (_: Exception) {}
        layouts = try { Api.watchLayouts() } catch (_: Exception) { emptyList() }
        loaded = true
    }

    fun save() {
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    // pages schreiben, NICHT views: views laesst der Server unabhaengig stehen, eine
                    // reine views-Speicherung wuerde die gemischte Reihenfolge (mit Layouts) auf
                    // neuen Uhren unveraendert lassen und damit wirkungslos bleiben.
                    put("pages", pagesJson(onFoil))
                    put("off_foil_pages", pagesJson(offFoil))
                    put("pause_pages", pagesJson(pause))
                    put("browse_all_pages", browseAll)
                    put("layouts_enabled", layoutsEnabled)
                    put("colorByValue", colorByValue)
                    put("auto_start", autoStartWatch)
                    put("stop_mode", stopMode)
                })
                saved = true
            } catch (_: Exception) {}
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("profile.datafields")) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
            )
        },
    ) { pad ->
        if (!loaded) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(I18n.t("datafields.intro"),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // Eigene Screens lassen sich hier EINFUEGEN und ansehen, aber nicht bauen. Entscheidung
            // Jan (17.08.): der Editor ist bewusst Web-only ("das macht man eh nur am pc"), also
            // sagen wir hier klar, wo er ist, statt den Nutzer suchen zu lassen.
            Spacer(Modifier.height(8.dp))
            Text(I18n.t("datafields.editorInBrowser"),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            // Einstieg in die Community-Galerie — ANSEHEN und KOPIEREN geht nativ, nur Gestalten
            // nicht. In der PWA steht der Link an derselben Stelle (ViewsEditor).
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onGallery) { Text(I18n.t("lay.toCommunity")) }
            Spacer(Modifier.height(12.dp))

            PageSetEditor(
                title = null, pages = onFoil, layouts = layouts, max = 8,
                onChange = { onFoil = it; saved = false },
            )
            Spacer(Modifier.height(16.dp))
            SectionCard(I18n.t("account.offFoilTitle"), I18n.t("account.offFoilDesc")) {
                PageSetEditor(
                    title = null, pages = offFoil, layouts = layouts, max = 8,
                    onChange = { offFoil = it; saved = false },
                )
            }
            Spacer(Modifier.height(12.dp))
            SectionCard(I18n.t("account.pauseTitle"), I18n.t("account.pauseDesc")) {
                PageSetEditor(
                    title = null, pages = pause, layouts = layouts, max = 8,
                    onChange = { pause = it; saved = false },
                )
            }

            Spacer(Modifier.height(16.dp))
            // Reihenfolge wie in der PWA (Account.tsx), damit man sich zwischen Web und App
            // nicht umorientieren muss.
            SwitchRow(I18n.t("account.colorByValue"), "", colorByValue) {
                colorByValue = it; saved = false
            }
            SwitchRow(I18n.t("account.autoStart"), "", autoStartWatch) {
                autoStartWatch = it; saved = false
            }
            // Beenden/Verwerfen auf der Uhr: zwei gleichrangige Wege -> Auswahl statt Schalter.
            Spacer(Modifier.height(8.dp))
            Text(I18n.t("account.stopMode"), style = MaterialTheme.typography.titleSmall)
            listOf("hold" to "account.stopModeHold", "press" to "account.stopModePress").forEach { (wert, key) ->
                Row(verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { stopMode = wert; saved = false }) {
                    RadioButton(selected = stopMode == wert, onClick = { stopMode = wert; saved = false })
                    Text(I18n.t(key), style = MaterialTheme.typography.bodyMedium)
                }
            }
            Text(I18n.t("account.stopModeHint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 12.dp, bottom = 8.dp))

            SwitchRow(I18n.t("account.browseAll"), I18n.t("account.browseAllHint"), browseAll) {
                browseAll = it; saved = false
            }
            SwitchRow(I18n.t("account.layoutsEnabled"), I18n.t("account.layoutsEnabledHint"), layoutsEnabled) {
                layoutsEnabled = it; saved = false
            }

            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { save() }) { Text(I18n.t("common.save")) }
                if (saved) { Spacer(Modifier.width(12.dp)); Text(I18n.t("common.saved"), color = MaterialTheme.colorScheme.primary) }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SectionCard(title: String, desc: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(desc, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
            content()
        }
    }
}

@Composable
private fun SwitchRow(title: String, hint: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            // Hinweis in normaler Lesegroesse (bodySmall), nicht kleiner -- Warnungen und
            // Erklaerungen duerfen nicht winzig sein.
            // Leere Hinweise NICHT zeichnen: sonst reserviert die Zeile Platz fuer nichts und die
            // Schalterliste bekommt ungleiche Abstaende (zwei der Schalter haben bewusst keinen
            // Erklaertext, weil die PWA dort auch keinen hat).
            if (hint.isNotEmpty()) {
                Text(hint, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

// Editor fuer EINEN Seiten-Satz. Klassische Seiten sind hier bearbeitbar; Layout-Seiten koennen
// hinzugefuegt, entfernt und verschoben werden, gestaltet werden sie aber nur in der PWA.
@Composable
private fun PageSetEditor(
    title: String?,
    pages: List<WatchPage>,
    layouts: List<WatchLayoutBrief>,
    max: Int,
    onChange: (List<WatchPage>) -> Unit,
) {
    var waehlen by remember { mutableStateOf(false) }   // Vorschau-Auswahl offen?
    Column {
        title?.let { Text(it, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold) }
        pages.forEachIndexed { idx, pg ->
            Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${I18n.t("datafields.page")} ${idx + 1}", Modifier.weight(1f),
                            style = MaterialTheme.typography.labelLarge)
                        if (idx > 0) {
                            IconButton(onClick = {
                                onChange(pages.toMutableList().also { it.add(idx - 1, it.removeAt(idx)) })
                            }) { Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null) }
                        }
                        if (idx < pages.size - 1) {
                            IconButton(onClick = {
                                onChange(pages.toMutableList().also { it.add(idx + 1, it.removeAt(idx)) })
                            }) { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null) }
                        }
                        if (pages.size > 1) {
                            IconButton(onClick = { onChange(pages.filterIndexed { i, _ -> i != idx }) }) {
                                Icon(Icons.Filled.Delete, contentDescription = I18n.t("datafields.removePage"))
                            }
                        }
                    }
                    when (pg) {
                        is ClassicPage -> (0..2).forEach { slot ->
                            FieldDropdown(pg.fields.getOrElse(slot) { 0 }) { id ->
                                onChange(pages.mapIndexed { i, p ->
                                    if (i == idx && p is ClassicPage) ClassicPage(p.fields.toMutableList().also { it[slot] = id }) else p
                                })
                            }
                            Spacer(Modifier.height(6.dp))
                        }
                        is LayoutPage -> {
                            // Bild UND Name: erkannt wird am Bild, benannt zur Sicherheit (Jan,
                            // 17.08.). Fehlt das Layout (geloescht/fremd), bleibt nur der Hinweis.
                            val l = layouts.firstOrNull { it.id == pg.layoutId }
                            if (l != null) {
                                Row(verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    WatchLayoutPreview(
                                        elements = l.elements, bgColor = l.bg_color, shape = l.shape,
                                        w = l.authored_w ?: 240, h = l.authored_h ?: 240, px = 110.dp,
                                        pageCount = pages.size, pageIndex = idx)
                                    Text(l.name, style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.primary)
                                }
                            } else {
                                Text(I18n.t("account.layoutMissing"),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (pages.size < max) {
                OutlinedButton(onClick = { onChange(pages + ClassicPage(listOf(0, 0, 0))) }) {
                    Text(I18n.t("datafields.addPage"))
                }
            }
            if (pages.size < max && layouts.isNotEmpty()) {
                OutlinedButton(onClick = { waehlen = true }) {
                    Text(I18n.t("account.addLayoutPage"), maxLines = 1)
                }
            }
        }
        // Auswahl per VORSCHAU statt per Name (Jan, 17.08.). Vorher war das ein DropdownMenu, das
        // nur `l.name` zeigte — und der hilft nicht, wenn eine Community-Kopie den Originalnamen
        // behaelt und mehrere Kopien gleich heissen. Dieselbe Aenderung wie in der PWA (`c21159d`).
        if (waehlen && layouts.isNotEmpty() && pages.size < max) {
            AlertDialog(
                onDismissRequest = { waehlen = false },
                title = { Text(I18n.t("account.pickLayoutTitle")) },
                text = {
                    // Bewusst als Dialog (anders als in der PWA, wo es aufklappt): auf dem Handy ist
                    // ein Bogen Bildschirm knapp, und der Dialog laesst sich wegwischen.
                    Column(Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        layouts.forEach { l ->
                            Row(Modifier.fillMaxWidth().clickable {
                                waehlen = false; onChange(pages + LayoutPage(l.id))
                            }, verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                WatchLayoutPreview(
                                    elements = l.elements, bgColor = l.bg_color, shape = l.shape,
                                    w = l.authored_w ?: 240, h = l.authored_h ?: 240, px = 96.dp,
                                    pageCount = pages.size + 1, pageIndex = pages.size)
                                Text(l.name, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { waehlen = false }) { Text(I18n.t("common.cancel")) }
                },
            )
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
            FIELD_IDS.forEach { id ->
                DropdownMenuItem(text = { Text(fieldLabel(id)) }, onClick = { onSelect(id); open = false })
            }
        }
    }
}
