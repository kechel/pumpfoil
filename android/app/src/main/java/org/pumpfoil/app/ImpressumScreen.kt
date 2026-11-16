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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
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
                actions = { FeedbackKnopf() },
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

            // Abschnitte und Reihenfolge wie web pages/Impressum.tsx (Stand 16.11.2026); Texte aus I18nEvents.kt (gen-i18n-android-teams.py).
            Section("imp.publicTitle", null, listOf("imp.public1", "imp.public2", "imp.public3", "imp.public4"), null)
            Section("imp.communityTitle", "imp.communityIntro", (1..8).map { "imp.community$it" }, "imp.communityNote")
            Section("imp.friendsTitle", null, listOf("imp.friends1", "imp.friends2", "imp.friends3"), null)
            Section("imp.teamsTitle", null, (1..5).map { "imp.teams$it" }, null)
            Section("imp.ownerTitle", null, (1..6).map { "imp.owner$it" }, null)
            Section("imp.operatorTitle", null, listOf("imp.operator1", "imp.operator2", "imp.operator3"), null)
            Section("imp.hostTitle", null, listOf("imp.host1", "imp.host2"), null)
            Section("imp.googleTitle", "imp.googleIntro", listOf("imp.google1", "imp.google2", "imp.google3", "imp.google4"), "imp.googleNote")
            Section("imp.appleTitle", "imp.appleIntro", listOf("imp.apple1", "imp.apple2", "imp.apple3"), null)
            Section("imp.fbTitle", "imp.fbIntro", listOf("imp.fb1", "imp.fb2", "imp.fb3", "imp.fb4", "imp.fb5"), "imp.fbNote")
            Section("imp.connTitle", "imp.connIntro", listOf("imp.conn1", "imp.conn2", "imp.conn3"), null)
            Section("imp.mcpTitle", null, listOf("imp.mcp1", "imp.mcp2", "imp.mcp3"), null)
            Section("imp.garminTitle", "imp.garminIntro", listOf("imp.garmin1", "imp.garmin2", "imp.garmin2b", "imp.garmin3", "imp.garmin4", "imp.garmin5"), null)
            Section("imp.huaweiTitle", "imp.huaweiIntro", listOf("imp.huawei1", "imp.huawei2", "imp.huawei3", "imp.huawei4"), null)
            Section("imp.ghTitle", "imp.ghIntro", listOf("imp.gh1", "imp.gh2", "imp.gh3", "imp.gh4"), null)
            Section("imp.werteTitle", "imp.werteText", emptyList(), null)
            Section("imp.aiTitle", "imp.aiIntro", listOf("imp.ai1", "imp.ai2", "imp.ai3", "imp.ai4"), "imp.aiNote")
            Section("imp.mapTitle", null, listOf("imp.map1", "imp.map2", "imp.mapApple", "imp.mapSpots"), null)
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
    RichTextView(text, MaterialTheme.typography.bodyMedium, MaterialTheme.colorScheme.onSurfaceVariant)
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
            RichTextView(I18n.t(k), MaterialTheme.typography.bodyMedium, MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    noteKey?.let { Spacer(Modifier.height(4.dp)); RichTextView(I18n.t(it), MaterialTheme.typography.bodySmall, MaterialTheme.colorScheme.onSurfaceVariant) }
}
