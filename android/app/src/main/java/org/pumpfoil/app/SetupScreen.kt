package org.pumpfoil.app

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

// Detailliertes Setup: Stab, Mastlänge, Shim, Boards — je „meine" markieren + einen Standard,
// pro Session überschreibbar (das passiert in der Session-Detailansicht). Spiegelt
// web/src/pages/Setup.tsx, inklusive Grenzen: Mast 30–130 cm, Shim −5…+5°.
// Der Standard wird durch einen Stern markiert (Material-Icon, kein Emoji); nochmal antippen
// hebt ihn auf. Nach jedem Speichern werden die Werte neu gelesen, damit die Anzeige zeigt, was
// der Server wirklich behalten hat (er dedupliziert und begrenzt).

private fun fmtShimValue(v: Double): String {
    val txt = if (v == v.toLong().toDouble()) "${v.toLong()}" else "$v"
    return (if (v > 0) "+$txt" else txt) + "°"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var stabs by remember { mutableStateOf<List<StabBrief>?>(null) }
    var brands by remember { mutableStateOf<List<String>>(emptyList()) }
    var boards by remember { mutableStateOf<List<BoardBrief>>(emptyList()) }
    var myStabs by remember { mutableStateOf<List<Int>>(emptyList()) }
    var stabId by remember { mutableStateOf<Int?>(null) }
    var myMasts by remember { mutableStateOf<List<Int>>(emptyList()) }
    var mastLen by remember { mutableStateOf<Int?>(null) }
    var myShims by remember { mutableStateOf<List<Double>>(emptyList()) }
    var shimDeg by remember { mutableStateOf<Double?>(null) }
    var boardId by remember { mutableStateOf<Int?>(null) }
    var query by remember { mutableStateOf("") }
    var brand by remember { mutableStateOf("") }
    var newMast by remember { mutableStateOf("") }
    var newShim by remember { mutableStateOf("") }
    var nsBrand by remember { mutableStateOf("") }
    var nsModel by remember { mutableStateOf("") }
    var nsSize by remember { mutableStateOf("") }
    var stabErr by remember { mutableStateOf("") }
    var nbName by remember { mutableStateOf("") }
    var nbVol by remember { mutableStateOf("") }
    var nbLen by remember { mutableStateOf("") }
    var delBoardId by remember { mutableStateOf<Int?>(null) }
    var delStabId by remember { mutableStateOf<Int?>(null) }

    fun applySettings(s: kotlinx.serialization.json.JsonObject) {
        myStabs = s["my_stabs"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
        stabId = s["stab_id"]?.jsonPrimitive?.intOrNull
        myMasts = s["my_masts"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
        mastLen = s["mast_len_cm"]?.jsonPrimitive?.intOrNull
        myShims = s["my_shims"]?.jsonArray?.mapNotNull { it.jsonPrimitive.doubleOrNull } ?: emptyList()
        shimDeg = s["shim_deg"]?.jsonPrimitive?.doubleOrNull
        boardId = s["board_id"]?.jsonPrimitive?.intOrNull
    }

    fun save(patch: kotlinx.serialization.json.JsonObject) {
        scope.launch {
            try { Api.saveSettings(patch); applySettings(Api.settings()) } catch (_: Exception) {}
        }
    }

    LaunchedEffect(Unit) {
        stabs = try { Api.stabs() } catch (_: Exception) { emptyList() }
        brands = try { Api.stabBrands() } catch (_: Exception) { emptyList() }
        boards = try { Api.boards() } catch (_: Exception) { emptyList() }
        try { applySettings(Api.settings()) } catch (_: Exception) {}
    }

    delStabId?.let { id ->
        AlertDialog(
            onDismissRequest = { delStabId = null },
            text = { Text(I18n.t("setup.stabDelConfirm")) },
            confirmButton = {
                TextButton(onClick = {
                    delStabId = null
                    scope.launch {
                        try {
                            Api.stabDelete(id)
                            stabs = stabs?.filter { it.id != id }
                            myStabs = myStabs.filter { it != id }
                            if (stabId == id) stabId = null
                        } catch (_: Exception) {}
                    }
                }) { Text(I18n.t("common.deleteLower")) }
            },
            dismissButton = { TextButton(onClick = { delStabId = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
    delBoardId?.let { id ->
        AlertDialog(
            onDismissRequest = { delBoardId = null },
            text = { Text(I18n.t("setup.boardDelConfirm")) },
            confirmButton = {
                TextButton(onClick = {
                    delBoardId = null
                    scope.launch {
                        try {
                            Api.boardDelete(id)
                            boards = boards.filter { it.id != id }
                            if (boardId == id) boardId = null
                        } catch (_: Exception) {}
                    }
                }) { Text(I18n.t("common.deleteLower")) }
            },
            dismissButton = { TextButton(onClick = { delBoardId = null }) { Text(I18n.t("common.cancel")) } },
        )
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("setup.title")) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) }
            },
        )
    }) { pad ->
        val list = stabs
        if (list == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        val filtered = list.filter { s ->
            (brand.isEmpty() || s.brand == brand) &&
                (query.isBlank() || "${s.brand} ${s.model} ${s.size}".lowercase().contains(query.trim().lowercase()))
        }
        val mineList = filtered.filter { it.id in myStabs }.sortedByDescending { it.id == stabId }
        val restList = filtered.filter { it.id !in myStabs }

        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            item {
                Text(I18n.t("setup.hint"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp))
            }

            // --- Stabilizer (Katalog wie bei den Foils) ---
            item { SectionTitle(I18n.t("setup.stabTitle")) }
            item {
                OutlinedTextField(value = query, onValueChange = { query = it },
                    label = { Text(I18n.t("foils.search")) }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                if (brands.isNotEmpty()) {
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = brand.isEmpty(), onClick = { brand = "" },
                            label = { Text(I18n.t("sessions.all")) })
                        brands.forEach { b ->
                            FilterChip(selected = brand == b, onClick = { brand = b }, label = { Text(b) })
                        }
                    }
                }
            }
            if (mineList.isNotEmpty()) {
                item { SubTitle(I18n.t("setup.myStabs")) }
                items(mineList, key = { "ms${it.id}" }) { st ->
                    StabRow(
                        st = st, isMine = true, isDefault = stabId == st.id,
                        onDefault = {
                            save(buildJsonObject {
                                put("my_stabs", buildJsonArray { (if (st.id in myStabs) myStabs else myStabs + st.id).forEach { add(it) } })
                                if (stabId == st.id) put("stab_id", JsonNull) else put("stab_id", st.id)
                            })
                        },
                        onToggleMine = {
                            save(buildJsonObject {
                                put("my_stabs", buildJsonArray { myStabs.filter { it != st.id }.forEach { add(it) } })
                                if (stabId == st.id) put("stab_id", JsonNull)
                            })
                        },
                        onDelete = if (st.isOwn) ({ delStabId = st.id }) else null,
                    )
                }
            }
            item { SubTitle(if (mineList.isEmpty()) I18n.t("foils.catalog") else I18n.t("foils.more")) }
            items(restList, key = { "rs${it.id}" }) { st ->
                StabRow(
                    st = st, isMine = false, isDefault = false,
                    onDefault = {
                        save(buildJsonObject {
                            put("my_stabs", buildJsonArray { (myStabs + st.id).forEach { add(it) } })
                            put("stab_id", st.id)
                        })
                    },
                    onToggleMine = {
                        save(buildJsonObject { put("my_stabs", buildJsonArray { (myStabs + st.id).forEach { add(it) } }) })
                    },
                    onDelete = if (st.isOwn) ({ delStabId = st.id }) else null,
                )
            }
            // Eigenen Stab anlegen, wenn er im Katalog fehlt (privat, nur für dieses Konto).
            item {
                Column(Modifier.padding(vertical = 8.dp)) {
                    Text(I18n.t("setup.stabAddHint"), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(value = nsBrand, onValueChange = { nsBrand = it }, singleLine = true,
                            label = { Text(I18n.t("setup.stabBrandPlaceholder")) }, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = nsModel, onValueChange = { nsModel = it }, singleLine = true,
                            label = { Text(I18n.t("setup.stabModelPlaceholder")) }, modifier = Modifier.weight(1f))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(value = nsSize, onValueChange = { nsSize = it }, singleLine = true,
                            label = { Text(I18n.t("setup.stabSizePlaceholder")) }, modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            val b = nsBrand.trim(); val m = nsModel.trim()
                            if (b.isNotEmpty() && m.isNotEmpty()) {
                                scope.launch {
                                    try {
                                        val created = Api.stabCreate(b, m, nsSize.trim())
                                        stabs = (stabs ?: emptyList()).let { l -> if (l.any { it.id == created.id }) l else l + created }
                                        if (created.brand !in brands) brands = (brands + created.brand).sorted()
                                        nsBrand = ""; nsModel = ""; nsSize = ""; stabErr = ""
                                        save(buildJsonObject {
                                            put("my_stabs", buildJsonArray { (if (created.id in myStabs) myStabs else myStabs + created.id).forEach { add(it) } })
                                        })
                                    } catch (_: Exception) { stabErr = I18n.t("setup.stabAddErr") }
                                }
                            }
                        }) { Text(I18n.t("foils.add")) }
                    }
                    if (stabErr.isNotEmpty()) Text(stabErr, color = MaterialTheme.colorScheme.error)
                }
            }

            // --- Mastlängen (reine Werte, 30–130 cm) ---
            item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
            item { SectionTitle(I18n.t("setup.mastTitle")) }
            item {
                ValueSection(
                    desc = I18n.t("setup.mastDesc"),
                    values = myMasts.map { it to "$it cm" },
                    defaultValue = mastLen,
                    placeholder = I18n.t("setup.mastPlaceholder"),
                    input = newMast, onInput = { newMast = it },
                    onAdd = {
                        val v = newMast.replace(",", ".").toDoubleOrNull()?.let { Math.round(it).toInt() }
                        if (v != null && v in 30..130) {
                            newMast = ""
                            save(buildJsonObject { put("my_masts", buildJsonArray { (myMasts + v).forEach { add(it) } }) })
                        }
                    },
                    onPick = { v ->
                        save(buildJsonObject { if (mastLen == v) put("mast_len_cm", JsonNull) else put("mast_len_cm", v) })
                    },
                    onRemove = { v ->
                        save(buildJsonObject {
                            put("my_masts", buildJsonArray { myMasts.filter { it != v }.forEach { add(it) } })
                            if (mastLen == v) put("mast_len_cm", JsonNull)
                        })
                    },
                )
            }

            // --- Shim (Anstellwinkel, −5…+5°) ---
            item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
            item { SectionTitle(I18n.t("setup.shimTitle")) }
            item {
                ValueSection(
                    desc = I18n.t("setup.shimDesc"),
                    values = myShims.map { it to fmtShimValue(it) },
                    defaultValue = shimDeg,
                    placeholder = I18n.t("setup.shimPlaceholder"),
                    input = newShim, onInput = { newShim = it },
                    onAdd = {
                        val v = newShim.replace(",", ".").toDoubleOrNull()
                        if (v != null && v >= -5.0 && v <= 5.0) {
                            newShim = ""
                            save(buildJsonObject { put("my_shims", buildJsonArray { (myShims + v).forEach { add(it) } }) })
                        }
                    },
                    onPick = { v ->
                        save(buildJsonObject { if (shimDeg == v) put("shim_deg", JsonNull) else put("shim_deg", v) })
                    },
                    onRemove = { v ->
                        save(buildJsonObject {
                            put("my_shims", buildJsonArray { myShims.filter { it != v }.forEach { add(it) } })
                            if (shimDeg == v) put("shim_deg", JsonNull)
                        })
                    },
                )
            }

            // --- Boards (eigene Einträge) ---
            item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
            item { SectionTitle(I18n.t("setup.boardTitle")) }
            item {
                Text(I18n.t("setup.boardDesc"), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (boards.isEmpty()) {
                item {
                    Text(I18n.t("setup.emptyList"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
                }
            }
            items(boards, key = { "b${it.id}" }) { b ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = {
                        save(buildJsonObject { if (boardId == b.id) put("board_id", JsonNull) else put("board_id", b.id) })
                    }) {
                        Icon(
                            if (boardId == b.id) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = I18n.t("setup.setDefault"),
                            tint = if (boardId == b.id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(b.name, fontWeight = if (boardId == b.id) FontWeight.SemiBold else FontWeight.Normal)
                        val specs = listOfNotNull(
                            b.volumeL?.let { "${fmtNum(it)} l" },
                            b.lengthCm?.let { "${fmtNum(it)} cm" },
                        ).joinToString(" · ")
                        Text(specs.ifBlank { I18n.t("setup.noSpecs") }, style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { delBoardId = b.id }) {
                        Icon(Icons.Filled.Delete, contentDescription = I18n.t("common.deleteLower"),
                            tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
            item {
                Column(Modifier.padding(vertical = 8.dp)) {
                    OutlinedTextField(value = nbName, onValueChange = { nbName = it }, singleLine = true,
                        label = { Text(I18n.t("setup.boardNamePlaceholder")) }, modifier = Modifier.fillMaxWidth())
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(value = nbVol, onValueChange = { nbVol = it }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            label = { Text(I18n.t("setup.boardVolPlaceholder")) }, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = nbLen, onValueChange = { nbLen = it }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            label = { Text(I18n.t("setup.boardLenPlaceholder")) }, modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            val n = nbName.trim()
                            if (n.isNotEmpty()) {
                                scope.launch {
                                    try {
                                        val created = Api.boardCreate(
                                            n,
                                            nbVol.trim().replace(",", ".").toDoubleOrNull(),
                                            nbLen.trim().replace(",", ".").toDoubleOrNull(),
                                        )
                                        boards = boards + created
                                        nbName = ""; nbVol = ""; nbLen = ""
                                    } catch (_: Exception) {}
                                }
                            }
                        }) { Text(I18n.t("foils.add")) }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

private fun fmtNum(v: Double): String = if (v == v.toLong().toDouble()) "${v.toLong()}" else "$v"

@Composable
private fun SectionTitle(t: String) {
    Text(t, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
}

@Composable
private fun SubTitle(t: String) {
    Text(t, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 6.dp, bottom = 2.dp))
}

// Eine Katalog-Zeile: Stern = Standard (nochmal antippen hebt auf), Name, dann entweder aus
// „meine" entfernen (×) oder — bei selbst angelegten Bezeichnungen — ganz löschen.
@Composable
private fun StabRow(
    st: StabBrief,
    isMine: Boolean,
    isDefault: Boolean,
    onDefault: () -> Unit,
    onToggleMine: () -> Unit,
    onDelete: (() -> Unit)?,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onDefault) {
            Icon(
                if (isDefault) Icons.Filled.Star else Icons.Filled.StarBorder,
                contentDescription = I18n.t("setup.setDefault"),
                tint = if (isDefault) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text("${st.brand} ${st.model} ${st.size}".trim(), Modifier.weight(1f),
            fontWeight = if (isDefault) FontWeight.SemiBold else FontWeight.Normal)
        if (isMine) {
            IconButton(onClick = onToggleMine) {
                Icon(Icons.Filled.Close, contentDescription = I18n.t("foils.remove"),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
        } else {
            IconButton(onClick = onToggleMine) {
                Icon(Icons.Filled.Add, contentDescription = I18n.t("foils.add"),
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            }
        }
        onDelete?.let {
            IconButton(onClick = it) {
                Icon(Icons.Filled.Delete, contentDescription = I18n.t("common.deleteLower"),
                    tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
            }
        }
    }
}

// Werte-Abschnitt für Mastlängen und Shims: Liste als antippbare Zeilen (Stern = Standard),
// darunter ein Eingabefeld zum Hinzufügen.
@Composable
private fun <V> ValueSection(
    desc: String,
    values: List<Pair<V, String>>,
    defaultValue: V?,
    placeholder: String,
    input: String,
    onInput: (String) -> Unit,
    onAdd: () -> Unit,
    onPick: (V) -> Unit,
    onRemove: (V) -> Unit,
) {
    Column {
        Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (values.isEmpty()) {
            Text(I18n.t("setup.emptyList"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
        }
        values.forEach { (v, lbl) ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onPick(v) }) {
                    Icon(
                        if (v == defaultValue) Icons.Filled.Star else Icons.Filled.StarBorder,
                        contentDescription = I18n.t("setup.setDefault"),
                        tint = if (v == defaultValue) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(lbl, Modifier.weight(1f),
                    fontWeight = if (v == defaultValue) FontWeight.SemiBold else FontWeight.Normal)
                IconButton(onClick = { onRemove(v) }) {
                    Icon(Icons.Filled.Close, contentDescription = I18n.t("foils.remove"),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(value = input, onValueChange = onInput, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                label = { Text(placeholder) }, modifier = Modifier.weight(1f))
            TextButton(onClick = onAdd) { Text(I18n.t("setup.addValue")) }
        }
    }
}
