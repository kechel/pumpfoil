package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Surfing
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
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
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(onLogout: () -> Unit, onFoilCalc: () -> Unit = {}, onFoils: () -> Unit = {}, onFoilStats: () -> Unit = {}) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<Profile?>(null) }
    var editing by remember { mutableStateOf(false) }
    var draftName by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        profile = try { Api.me() } catch (e: Exception) { null }
    }

    if (editing) {
        AlertDialog(
            onDismissRequest = { editing = false },
            title = { Text("Anzeigename") },
            text = {
                OutlinedTextField(value = draftName, onValueChange = { draftName = it }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = {
                    val n = draftName.trim()
                    editing = false
                    if (n.isNotEmpty()) scope.launch {
                        try { profile = Api.updateDisplayName(n) } catch (_: Exception) {}
                    }
                }) { Text("Speichern") }
            },
            dismissButton = { TextButton(onClick = { editing = false }) { Text("Abbrechen") } },
        )
    }
    Scaffold(topBar = { TopAppBar(title = { Text("Profil") }, actions = { SyncIndicator() }) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val avatar = Api.mediaUrl(profile?.avatarUrl)
                if (avatar != null) {
                    AsyncImage(
                        model = avatar,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(56.dp).clip(CircleShape),
                    )
                } else {
                    Icon(
                        Icons.Filled.AccountCircle, contentDescription = null,
                        modifier = Modifier.size(56.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(profile?.displayName ?: "—", style = MaterialTheme.typography.titleLarge)
                    profile?.email?.let {
                        Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = { draftName = profile?.displayName ?: ""; editing = true }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Anzeigename ändern")
                }
            }
            Spacer(Modifier.height(24.dp))
            ListItem(
                modifier = Modifier.clickable { onFoils() },
                headlineContent = { Text("Foils") },
                supportingContent = { Text("Katalog · meine & Standard wählen") },
                leadingContent = { Icon(Icons.Filled.Surfing, contentDescription = null) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onFoilCalc() },
                headlineContent = { Text("Foil-Rechner") },
                supportingContent = { Text("Foils vergleichen & Pump-Leistung") },
                leadingContent = { Icon(Icons.Filled.Calculate, contentDescription = null) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onFoilStats() },
                headlineContent = { Text("Foil-Statistik") },
                supportingContent = { Text("Community: Werte je Foil") },
                leadingContent = { Icon(Icons.Filled.QueryStats, contentDescription = null) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { Api.logout(ctx); onLogout() },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            ) {
                Text("Abmelden")
            }
        }
    }
}
