package org.pumpfoil.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// Impressum + Datenschutzhinweis in der App. Gleiche Reihenfolge/Inhalte wie web /impressum.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImpressumScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("imp.title")) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("common.back")) }
                },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            // Vollständige Betreiberangaben stehen auf der Website (env-basiert, nicht in der App).
            Text("pumpfoil.org/impressum", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))

            H2(I18n.t("imp.whoSees"))
            Body(I18n.t("imp.intro"))
            Spacer(Modifier.height(12.dp))

            Section("imp.publicTitle", null, listOf("imp.public1", "imp.public2"), null)
            Section("imp.communityTitle", "imp.communityIntro", listOf("imp.community1", "imp.community2", "imp.community3", "imp.community4"), "imp.communityNote")
            Section("imp.ownerTitle", null, listOf("imp.owner1", "imp.owner2", "imp.owner3", "imp.owner4"), null)
            Section("imp.operatorTitle", null, listOf("imp.operator1", "imp.operator2"), null)
            Section("imp.googleTitle", "imp.googleIntro", listOf("imp.google1", "imp.google2", "imp.google3", "imp.google4"), "imp.googleNote")
            Section("imp.appleTitle", "imp.appleIntro", listOf("imp.apple1", "imp.apple2", "imp.apple3"), null)
            Section("imp.connTitle", "imp.connIntro", listOf("imp.conn1", "imp.conn2", "imp.conn3"), null)
            Section("imp.ytTitle", null, listOf("imp.yt1", "imp.yt2"), "imp.ytNote")

            Spacer(Modifier.height(16.dp))
            H2(I18n.t("imp.privacyTitle"))
            Body(I18n.t("imp.privacyText"))
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun H2(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun Body(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Section(titleKey: String, introKey: String?, bulletKeys: List<String>, noteKey: String?) {
    Spacer(Modifier.height(14.dp))
    Text(I18n.t(titleKey), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
    Spacer(Modifier.height(4.dp))
    introKey?.let { Body(I18n.t(it)); Spacer(Modifier.height(4.dp)) }
    bulletKeys.forEach { k ->
        Row(Modifier.padding(vertical = 1.dp)) {
            Text("•  ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(I18n.t(k), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    noteKey?.let { Spacer(Modifier.height(4.dp)); Text(I18n.t(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}
