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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.max
import kotlin.math.roundToInt

private val SPEEDS = listOf(10.0, 12.0, 14.0, 16.0, 18.0, 20.0)

// Nativer Foil-Rechner (spiegelt web/src/pages/FoilCalculator.tsx) auf Basis von
// FoilPhysics.kt. Mobil-typisch: Parameter-Card, Foil-Auswahlliste, Ergebnis als
// Cards pro Foil (Power-Reihe horizontal scrollbar) statt breiter Tabellen.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoilCalculatorScreen(onBack: () -> Unit = {}) {
    var foils by remember { mutableStateOf<List<Foil>?>(null) }
    var brands by remember { mutableStateOf<List<String>>(emptyList()) }
    var brand by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var error by remember { mutableStateOf<String?>(null) }

    var riderWeight by remember { mutableStateOf(95.0) }
    var equipWeight by remember { mutableStateOf(10.0) }
    var mastDiameter by remember { mutableStateOf(19.0) }
    var mastDepth by remember { mutableStateOf(0.40) }
    var withPump by remember { mutableStateOf(false) }
    var pumpFreq by remember { mutableStateOf(1.0) }
    var heaveAmp by remember { mutableStateOf(12.0) }
    var recoveryLoss by remember { mutableStateOf(35.0) }

    LaunchedEffect(Unit) {
        try {
            foils = Api.foils()
            brands = try { Api.foilBrands() } catch (_: Exception) { emptyList() }
            try {
                val s = Api.settings()
                (s["weight_kg"]?.jsonPrimitive?.doubleOrNull)?.let { if (it > 0) riderWeight = it }
                (s["my_foils"]?.jsonArray)?.let { arr ->
                    selected = arr.mapNotNull { it.jsonPrimitive.contentOrNull?.toIntOrNull() }.toSet()
                }
            } catch (_: Exception) {}
        } catch (e: Exception) { error = e.message; foils = emptyList() }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("profile.calc")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
        )
    }) { pad ->
        val list = foils
        if (list == null) {
            Box(Modifier.padding(pad).fillMaxSize()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            }
            return@Scaffold
        }

        val byId = remember(list) { list.associateBy { it.id } }
        val selFoils = selected.mapNotNull { byId[it] }
        val rider = FoilPhysics.RiderParams(riderWeight, equipWeight)
        val mast = FoilPhysics.MastParams(mastDiameter, mastDepth)
        val pump = if (withPump) FoilPhysics.PumpParams(heaveAmp, pumpFreq, recoveryLoss) else null

        val filtered = list.filter { f ->
            (brand.isEmpty() || f.brand == brand) &&
                (query.isBlank() || "${f.brand} ${f.model} ${f.size}".lowercase().contains(query.trim().lowercase()))
        }

        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            item {
                Text(I18n.t("calc.intro"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            error?.let { e -> item { Text(e, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 4.dp)) } }

            // --- Parameter ---
            item {
                Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(I18n.t("calc.params"), fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            NumField("${I18n.t("settings.weight")} (kg)", riderWeight, Modifier.weight(1f)) { riderWeight = it }
                            NumField(I18n.t("calc.equip"), equipWeight, Modifier.weight(1f)) { equipWeight = it }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(I18n.t("calc.mastDiameter"), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(19.0, 17.0).forEach { d ->
                                FilterChip(selected = mastDiameter == d, onClick = { mastDiameter = d },
                                    label = { Text("${d.roundToInt()} mm") })
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(I18n.t("calc.mastDepth"), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(0.2, 0.3, 0.4, 0.5).forEach { dp ->
                                FilterChip(selected = mastDepth == dp, onClick = { mastDepth = dp },
                                    label = { Text("${(dp * 100).roundToInt()} cm") })
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Switch(checked = withPump, onCheckedChange = { withPump = it })
                            Spacer(Modifier.width(8.dp))
                            Text(I18n.t("calc.withPump"))
                        }
                        if (withPump) {
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                NumField(I18n.t("calc.freq"), pumpFreq, Modifier.weight(1f)) { pumpFreq = it }
                                NumField(I18n.t("calc.heave"), heaveAmp, Modifier.weight(1f)) { heaveAmp = it }
                                NumField(I18n.t("calc.loss"), recoveryLoss, Modifier.weight(1f)) { recoveryLoss = it }
                            }
                        }
                    }
                }
            }

            // --- Foil-Auswahl ---
            item {
                Card(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        OutlinedTextField(value = query, onValueChange = { query = it },
                            label = { Text(I18n.t("foils.search")) }, singleLine = true,
                            modifier = Modifier.fillMaxWidth())
                        if (brands.isNotEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Row(Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(selected = brand.isEmpty(), onClick = { brand = "" },
                                    label = { Text(I18n.t("sessions.all")) })
                                brands.forEach { b ->
                                    FilterChip(selected = brand == b, onClick = { brand = b },
                                        label = { Text(b) })
                                }
                            }
                        }
                    }
                }
            }
            items(filtered, key = { it.id }) { f ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = selected.contains(f.id), onCheckedChange = {
                        selected = if (selected.contains(f.id)) selected - f.id else selected + f.id
                    })
                    Column(Modifier.weight(1f)) {
                        Text("${f.brand} ${f.model} ${f.size}", style = MaterialTheme.typography.bodyMedium)
                        Text("${f.areaCm2.roundToInt()} cm²  ·  AR ${f.aspectRatio?.let { fmt(it, 1) } ?: "–"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            // --- Ergebnisse pro ausgewähltem Foil ---
            if (selFoils.isEmpty()) {
                item {
                    Text(I18n.t("calc.pickHint"),
                        modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth(),
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                item { Spacer(Modifier.height(8.dp)) }
                items(selFoils, key = { "r${it.id}" }) { f ->
                    ResultCard(f, rider, mast, pump)
                }
                item {
                    Text(I18n.t("calc.disclaimer"),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 12.dp))
                }
            }
        }
    }
}

@Composable
private fun ResultCard(
    f: Foil,
    rider: FoilPhysics.RiderParams,
    mast: FoilPhysics.MastParams,
    pump: FoilPhysics.PumpParams?,
) {
    val dims = FoilPhysics.FoilDims(f.spanCm, f.areaCm2, f.thicknessMm)
    val ar = FoilPhysics.calculateAR(f.spanCm, f.areaCm2)
    val chordCm = FoilPhysics.calculateMeanChord(f.areaCm2, ar) * 100
    val tc = FoilPhysics.calculateThicknessRatio(f.thicknessMm, f.areaCm2, ar)
    val clmax = FoilPhysics.calculateCLmax(ar, f.thicknessMm, f.areaCm2, 15.0)
    val stall = FoilPhysics.calculateStallSpeed(f.areaCm2, clmax, rider)
    val minV = max(stall, FoilPhysics.calculateMinViableSpeed(f.areaCm2, clmax, rider))
    val opt = FoilPhysics.calculateOptimalSpeed(stall)

    Card(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text("${f.brand} ${f.model} ${f.size}", fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Metric("AR", fmt(ar, 1))
                Metric(I18n.t("calc.chord"), "${fmt(chordCm, 1)} cm")
                Metric("t/c", "${if (f.thicknessEstimated) "≈" else ""}${fmt(tc * 100, 1)}%")
                Metric("CLmax", fmt(clmax, 2))
                Metric(I18n.t("calc.stall"), "${fmt(stall, 1)}")
                Metric(I18n.t("calc.minViable"), "${fmt(minV, 1)}")
                Metric(I18n.t("calc.optimal"), "${opt.roundToInt()} km/h")
            }
            Spacer(Modifier.height(12.dp))
            Text(I18n.t("calc.powerRow"), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                SPEEDS.forEach { sp ->
                    val w = if (sp + 0.001 < minV) null
                    else FoilPhysics.computeFoilPowerAtSpeed(dims, sp, rider, mast, pump).power.roundToInt()
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${sp.roundToInt()}", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(w?.toString() ?: "–", fontWeight = FontWeight.Medium,
                            color = if (w == null) MaterialTheme.colorScheme.onSurfaceVariant
                            else MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium, fontSize = 15.sp)
    }
}

@Composable
private fun NumField(label: String, value: Double, modifier: Modifier = Modifier, onChange: (Double) -> Unit) {
    var text by remember(value) { mutableStateOf(fmtPlain(value)) }
    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it
            it.replace(',', '.').toDoubleOrNull()?.let(onChange)
        },
        label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}

private fun fmt(v: Double, dec: Int): String = "%.${dec}f".format(v)
private fun fmtPlain(v: Double): String = if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()
