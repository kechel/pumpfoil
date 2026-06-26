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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Pro Aufruf evaluiert, damit der Sprachwechsel greift.
private fun labelTypes() = listOf("pump" to I18n.t("lab.pump"), "glide" to I18n.t("lab.glide"), "not_foiling" to I18n.t("lab.notFoiling"))
private fun labelText(id: String) = labelTypes().firstOrNull { it.first == id }?.second ?: id
private fun mmssL(sec: Float): String = "%d:%02d".format((sec / 60).toInt(), (sec % 60).toInt())

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabelingScreen(id: Int, onBack: () -> Unit) {
    var durSec by remember { mutableStateOf(0f) }
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var type by remember { mutableStateOf("pump") }
    var start by remember { mutableStateOf(0f) }
    var end by remember { mutableStateOf(0f) }
    val scope = rememberCoroutineScope()

    suspend fun reload() { labels = try { Api.labels(id) } catch (_: Exception) { emptyList() } }
    LaunchedEffect(Unit) {
        val s = try { Api.session(id) } catch (_: Exception) { null }
        val a = epochMsL(s?.startedAt); val b = epochMsL(s?.endedAt)
        durSec = if (a != null && b != null && b > a) ((b - a) / 1000).toFloat() else 0f
        end = durSec
        reload()
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("lab.title")) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        if (loading) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(I18n.t("lab.introShort"),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))

            if (labels.isNotEmpty()) {
                Text(I18n.t("lab.existing"), style = MaterialTheme.typography.titleMedium)
                labels.forEach { l ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${labelText(l.label)}  ${mmssL(l.tStartMs / 1000f)}–${mmssL(l.tEndMs / 1000f)}", Modifier.weight(1f))
                        IconButton(onClick = { scope.launch { try { Api.deleteLabel(id, l.id); reload() } catch (_: Exception) {} } }) {
                            Icon(Icons.Filled.Delete, contentDescription = I18n.t("common.delete"))
                        }
                    }
                    HorizontalDivider()
                }
                Spacer(Modifier.height(16.dp))
            }

            Text(I18n.t("lab.add"), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                labelTypes().forEach { (id2, label) ->
                    FilterChip(selected = type == id2, onClick = { type = id2 }, label = { Text(label) })
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("${I18n.t("common.start")}: ${mmssL(start)}")
            Slider(value = start, onValueChange = { start = it.coerceIn(0f, (end - 1).coerceAtLeast(0f)) }, valueRange = 0f..durSec.coerceAtLeast(1f))
            Text("${I18n.t("common.end")}: ${mmssL(end)}")
            Slider(value = end, onValueChange = { end = it.coerceIn(start + 1, durSec.coerceAtLeast(1f)) }, valueRange = 0f..durSec.coerceAtLeast(1f))
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { scope.launch { try { Api.addLabel(id, (start * 1000).toLong(), (end * 1000).toLong(), type); reload() } catch (_: Exception) {} } },
                enabled = end > start,
            ) { Text(I18n.t("lab.add")) }
        }
    }
}

private fun epochMsL(iso: String?): Long? = iso?.let {
    try { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() } catch (_: Exception) { null }
}
