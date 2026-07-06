package org.pumpfoil.app

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()   // Marken-Splash (Logo auf Navy) vor dem ersten Frame
        super.onCreate(savedInstanceState)
        Api.load(applicationContext)
        ThemeState.load(applicationContext)
        I18n.load(applicationContext)
        WatchSync.pushPairing(applicationContext)   // eingeloggt -> Wear-Uhr (Data Layer) verknüpfen
        setContent { PumpfoilTheme { App() } }
    }
}

// Auth-Gate: eingeloggt -> Tab-Navigation, sonst Login.
@Composable
fun App() {
    var token by remember { mutableStateOf(Api.token) }
    // Abgelaufene Session (401 auf authentifizierten Request): Api hat schon abgemeldet,
    // hier nur die UI zum Login zurückschicken (auf dem Main-Thread).
    androidx.compose.runtime.DisposableEffect(Unit) {
        Api.onUnauthorized = {
            android.os.Handler(android.os.Looper.getMainLooper()).post { token = null }
        }
        onDispose { Api.onUnauthorized = null }
    }
    if (token == null) {
        LoginScreen(onLoggedIn = { token = Api.token })
    } else {
        MainScaffold(onLogout = { token = null })
    }
}

private val TOP_LEVEL = setOf("home", "community", "sessions", "verlauf", "spots", "chat", "profile")

@Composable
fun MainScaffold(onLogout: () -> Unit) {
    val nav = rememberNavController()
    val backEntry by nav.currentBackStackEntryAsState()
    val route = backEntry?.destination?.route
    val ctx = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.runtime.LaunchedEffect(Unit) {
        try { Api.me().language?.let { I18n.set(ctx, it) } } catch (_: Exception) {}
    }

    val compareIds by CompareStore.ids.collectAsState()
    Scaffold(
        bottomBar = {
            if (route in TOP_LEVEL) {
                PumpfoilBottomBar(route) { nav.switchTab(it) }
            }
        },
        // Schwebender Vergleichs-Button (wie Web-CompareBar): sichtbar, sobald per Long-Press
        // Sessions markiert sind. Nicht auf dem Compare-Screen selbst.
        floatingActionButton = {
            if (compareIds.isNotEmpty() && route in TOP_LEVEL) {
                ExtendedFloatingActionButton(
                    onClick = { nav.navigate("compare") },
                    icon = { Icon(Icons.AutoMirrored.Filled.CompareArrows, contentDescription = null) },
                    text = { Text(I18n.t("compare.bar").replace("{n}", compareIds.size.toString())) },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                )
            }
        },
    ) { pad ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(pad)) {
            composable("home") { HomeScreen(onOpen = { id -> nav.navigate("session/$id") }, onOpenChat = { nav.switchTab("chat") }, onOpenSessions = { nav.switchTab("sessions") }, onOpenCommunity = { nav.switchTab("community") }) }
            composable("sessions") { SessionsScreen(onOpen = { id -> nav.navigate("session/$id") }, onCompare = { nav.navigate("compare") }) }
            composable("community") { CommunityScreen(onOpen = { id -> nav.navigate("session/$id") }, onFoilStats = { nav.navigate("foilstats") }) }
            composable("verlauf") { VerlaufScreen(onOpen = { id -> nav.navigate("session/$id") }) }
            composable("spots") { SpotsScreen(onOpenSpot = { nav.navigate("spot/${Uri.encode(it)}") }) }
            composable(
                "spot/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                SpotSessionsScreen(
                    spot = entry.arguments?.getString("name").orEmpty(),
                    onBack = { nav.popBackStack() },
                    onOpen = { id -> nav.navigate("session/$id") },
                )
            }
            composable("chat") { ChatScreen() }
            composable("profile") {
                ProfileScreen(
                    onLogout = onLogout,
                    onFoilCalc = { nav.navigate("foilcalc") },
                    onFoils = { nav.navigate("foils") },
                    onFoilStats = { nav.navigate("foilstats") },
                    onAlarm = { nav.navigate("alarm") },
                    onDataFields = { nav.navigate("datafields") },
                    onSettings = { nav.navigate("settings") },
                    onCompare = { nav.navigate("compare") },
                    onGarminPair = { nav.navigate("garminpair") },
                    onAccounts = { nav.navigate("accounts") },
                    onImprint = { nav.navigate("impressum") },
                )
            }
            composable("foilcalc") { FoilCalculatorScreen(onBack = { nav.popBackStack() }) }
            composable("foils") { FoilsScreen(onBack = { nav.popBackStack() }) }
            composable("foilstats") { FoilStatsScreen(onBack = { nav.popBackStack() }) }
            composable("alarm") { AlarmScreen(onBack = { nav.popBackStack() }) }
            composable("settings") { SettingsScreen(onBack = { nav.popBackStack() }) }
            composable("datafields") { DataFieldsScreen(onBack = { nav.popBackStack() }) }
            composable("compare") { CompareScreen(onBack = { nav.popBackStack() }, onOpen = { id -> nav.navigate("session/$id") }) }
            composable("garminpair") { GarminPairScreen(onBack = { nav.popBackStack() }) }
            composable("accounts") { LinkedAccountsScreen(onBack = { nav.popBackStack() }) }
            composable("impressum") { ImpressumScreen(onBack = { nav.popBackStack() }) }
            composable(
                "session/{id}",
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { entry ->
                SessionDetailScreen(
                    id = entry.arguments?.getInt("id") ?: 0,
                    onBack = { nav.popBackStack() },
                    onLabel = { sid -> nav.navigate("labeling/$sid") },
                    onOpenSession = { sid -> nav.navigate("session/$sid") },
                )
            }
            composable(
                "labeling/{id}",
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { entry ->
                LabelingScreen(id = entry.arguments?.getInt("id") ?: 0, onBack = { nav.popBackStack() })
            }
        }
    }
}

// Tab-Wechsel mit Zustands-Erhalt (Standard-Compose-Navigationsmuster).
private fun NavController.switchTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

// Eigene Bottom-Nav: Markierung umschließt Icon UND Label, enger Icon<->Label-Abstand.
@Composable
private fun PumpfoilBottomBar(route: String?, onSelect: (String) -> Unit) {
    data class Tab(val route: String, val label: String, val icon: ImageVector)
    val tabs = listOf(
        Tab("home", I18n.t("nav.home"), Icons.Filled.Home),
        Tab("community", "Foilers", Icons.Filled.Groups),
        Tab("sessions", I18n.t("nav.sessions"), Icons.AutoMirrored.Filled.List),
        Tab("verlauf", I18n.t("nav.history"), Icons.Filled.ShowChart),
        Tab("spots", I18n.t("nav.spots"), Icons.Filled.Place),
        Tab("chat", I18n.t("nav.chat"), Icons.Filled.Forum),
        Tab("profile", I18n.t("nav.profile"), Icons.Filled.Person),
    )
    Surface(tonalElevation = 3.dp, color = MaterialTheme.colorScheme.surface) {
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 4.dp, vertical = 6.dp),
        ) {
            tabs.forEach { t ->
                val sel = route == t.route
                val c = if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                Column(
                    Modifier.weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .clickable { onSelect(t.route) }
                        .then(if (sel) Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)) else Modifier)
                        .padding(vertical = 5.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(t.icon, contentDescription = null, tint = c, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(1.dp))
                    Text(t.label, color = c, maxLines = 1, softWrap = false, fontSize = 10.sp)
                }
            }
        }
    }
}
