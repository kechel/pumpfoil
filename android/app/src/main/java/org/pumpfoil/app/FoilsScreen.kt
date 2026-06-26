package org.pumpfoil.app

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.math.roundToInt

// Foil-Katalog (spiegelt web/Foils): durchsuchen, „meine" merken (Haken), eines als
// Standard (Stern). Persistiert via PUT /api/settings (my_foils, foil_id).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoilsScreen(onBack: () -> Unit = {}) {
    var foils by remember { mutableStateOf<List<Foil>?>(null) }
    var brands by remember { mutableStateOf<List<String>>(emptyList()) }
    var brand by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var mine by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var def by remember { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            foils = Api.foils()
            brands = try { Api.foilBrands() } catch (_: Exception) { emptyList() }
            val s = Api.settings()
            mine = (s["my_foils"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()).toSet()
            def = s["foil_id"]?.jsonPrimitive?.intOrNull
        } catch (_: Exception) { foils = emptyList() }
    }

    fun persist(newMine: Set<Int>, newDef: Int?) {
        mine = newMine; def = newDef
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    put("my_foils", buildJsonArray { newMine.sorted().forEach { add(it) } })
                    if (newDef == null) put("foil_id", JsonNull) else put("foil_id", newDef)
                })
            } catch (_: Exception) {}
        }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("profile.foils")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
        )
    }) { pad ->
        val list = foils
        if (list == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        val filtered = list.filter { f ->
            (brand.isEmpty() || f.brand == brand) &&
                (query.isBlank() || "${f.brand} ${f.model} ${f.size}".lowercase().contains(query.trim().lowercase()))
        }
        val mineList = filtered.filter { mine.contains(it.id) }.sortedByDescending { it.id == def }
        val restList = filtered.filter { !mine.contains(it.id) }

        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            item {
                OutlinedTextField(value = query, onValueChange = { query = it },
                    label = { Text(I18n.t("foils.search")) }, singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                if (brands.isNotEmpty()) {
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = brand.isEmpty(), onClick = { brand = "" }, label = { Text(I18n.t("sessions.all")) })
                        brands.forEach { b -> FilterChip(selected = brand == b, onClick = { brand = b }, label = { Text(b) }) }
                    }
                }
            }
            if (mineList.isNotEmpty()) {
                item { sectionHeader(I18n.t("foils.mine")) }
                items(mineList, key = { "m${it.id}" }) { f ->
                    foilRow(f, isMine = true, isDefault = f.id == def,
                        onToggleMine = { persist(mine - f.id, if (def == f.id) null else def) },
                        onSetDefault = { persist(if (mine.contains(f.id)) mine else mine + f.id, if (def == f.id) null else f.id) })
                }
            }
            item { sectionHeader(if (mineList.isEmpty()) I18n.t("foils.all") else I18n.t("foils.more")) }
            items(restList, key = { "r${it.id}" }) { f ->
                foilRow(f, isMine = false, isDefault = false,
                    onToggleMine = { persist(mine + f.id, def) },
                    onSetDefault = { persist(mine + f.id, f.id) })
            }
        }
    }
}

@Composable
private fun sectionHeader(text: String) {
    Text(text, style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
}

@Composable
private fun foilRow(
    f: Foil, isMine: Boolean, isDefault: Boolean,
    onToggleMine: () -> Unit, onSetDefault: () -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("${f.brand} ${f.model} ${f.size}", style = MaterialTheme.typography.bodyMedium)
            Text("${f.areaCm2.roundToInt()} cm²  ·  AR ${f.aspectRatio?.let { "%.1f".format(it) } ?: "–"}",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onSetDefault) {
            Icon(if (isDefault) Icons.Filled.Star else Icons.Filled.StarBorder,
                contentDescription = I18n.t("foils.default"),
                tint = if (isDefault) Color(0xFFF59E0B) else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onToggleMine) {
            Icon(if (isMine) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                contentDescription = I18n.t("sessions.mine"),
                tint = if (isMine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
