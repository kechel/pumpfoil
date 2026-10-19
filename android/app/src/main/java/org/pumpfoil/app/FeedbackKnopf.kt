package org.pumpfoil.app

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavBackStackEntry

// Feedback-Knopf oben rechts in der Kopfleiste JEDER Seite (Jan, 19.10.2026: „ziel war es doch das
// der auf jeder seite zu sehen ist und wir die url mitbekommen wo es ein feedback zu gab" und „ich
// fand das im header oben rechts doch gut, aber halt auf allen seiten").
//
// Bis 1.1.43 stand der Briefumschlag nur auf Home, cyan auf der cyanen Kopfleiste (praktisch
// unsichtbar), und schickte immer nur „android-app". Jetzt: in PumpfoilTopBar (alle Haupt-Tabs) und
// in jeder TopAppBar der Unterseiten; ohne eigenes tint, also Navy auf Cyan bzw. die normale
// Symbolfarbe. Die Seite kommt ueber LocalFeedbackUrl aus MainActivity.

/** Aktuelle Seite fuer `feedback.url` — gesetzt in MainActivity aus dem Navigations-Eintrag. */
val LocalFeedbackUrl = compositionLocalOf { "android-app" }

/** Die Seite als Adresse: wo es sie im Web gibt, deren Pfad (der Admin-Link fuehrt dann direkt
 *  hin), sonst `android:<route>`. */
fun feedbackUrl(entry: NavBackStackEntry?): String {
    val route = entry?.destination?.route ?: return "android-app"
    val args = entry.arguments
    return when {
        route.startsWith("session/") -> "/sessions/" + (args?.getInt("id") ?: 0)
        route.startsWith("foiler/") -> "/foiler/" + (args?.getInt("id") ?: 0)
        route.startsWith("spot/") -> "/sessions?spot=" + android.net.Uri.encode(args?.getString("name") ?: "")
        route == "sessions" -> "/sessions"
        route == "community" -> "/community"
        route == "changelog" -> "/changelog"
        else -> "android:" + route.substringBefore('/').substringBefore('?')
    }
}

@Composable
fun FeedbackKnopf() {
    var offen by remember { mutableStateOf(false) }
    val url = LocalFeedbackUrl.current
    IconButton(onClick = { offen = true }) {
        Icon(Icons.Outlined.MailOutline, contentDescription = I18n.t("feedback.title"))
    }
    if (offen) FeedbackDialog(onDismiss = { offen = false }, url = url)
}
