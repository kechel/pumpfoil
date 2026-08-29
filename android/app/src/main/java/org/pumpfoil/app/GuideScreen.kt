package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

// Anleitung fuer die Uhr — bisher gab es die NUR in der Web-App (Tab "Anleitung", 98
// guide.*-Schluessel); die nativen Apps hatten davon keinen einzigen. Dieser Bildschirm bringt
// die beiden Teile, an denen Nutzer wirklich haengenbleiben:
//   1. der Weg auf die Garmin (die Uhr-App kommt aus dem Connect IQ Store, nicht aus dem Store
//      des Handys) — genau daran ist am 27.08. ein Nutzer gescheitert,
//   2. "wann laedt die Uhr eigentlich hoch?" — die haeufigste Supportfrage: Session fehlt,
//      liegt aber noch auf der Uhr und geht beim naechsten App-Start raus.
// Die Texte sind dieselben wie im Web (aus den Web-Locales uebernommen), damit ein Satz nicht an
// zwei Stellen unterschiedlich lautet.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuideScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("guide.howto")) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                }
            },
        )
    }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)
        ) {
            Abschnitt(I18n.t("guide.garminSub")) {
                Absatz(I18n.t("guide.g.storeLead"))
                OutlinedButton(onClick = {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(CONNECT_IQ_URL)))
                }) { Text(I18n.t("guide.g.storeCta")) }
                Spacer(Modifier.height(12.dp))
                Schritt(I18n.t("guide.g.s2Title"), I18n.t("guide.g.s2"))
                Schritt(I18n.t("guide.g.s3Title"), I18n.t("guide.g.s3"))
                Schritt(I18n.t("guide.g.s5Title"), I18n.t("guide.g.s5"))
                Schritt(I18n.t("guide.g.s6Title"), I18n.t("guide.g.s6"))
            }

            Spacer(Modifier.height(16.dp))

            Abschnitt(I18n.t("guide.pair.title")) {
                Absatz(I18n.t("guide.pair.intro"))
                Schritt(I18n.t("guide.pair.autoTitle"), I18n.t("guide.pair.auto"))
                Schritt(I18n.t("guide.pair.codeTitle"), I18n.t("guide.pair.code"))
                Schritt(I18n.t("guide.pair.relinkTitle"), I18n.t("guide.pair.relink"))
                Absatz(I18n.t("guide.pair.note"))
            }

            Spacer(Modifier.height(16.dp))

            Abschnitt(I18n.t("guide.sync.title")) {
                Schritt(I18n.t("guide.sync.nowTitle"), I18n.t("guide.sync.now"))
                Schritt(I18n.t("guide.sync.retryTitle"), I18n.t("guide.sync.retry"))
                Schritt(I18n.t("guide.sync.laterTitle"), I18n.t("guide.sync.later"))
                Absatz(I18n.t("guide.sync.note"))
            }
        }
    }
}

@Composable
private fun Abschnitt(titel: String, inhalt: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(titel, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            inhalt()
        }
    }
}

@Composable
private fun Schritt(titel: String, text: String) {
    Text(titel, style = MaterialTheme.typography.labelLarge)
    Text(text, style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun Absatz(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(10.dp))
}
