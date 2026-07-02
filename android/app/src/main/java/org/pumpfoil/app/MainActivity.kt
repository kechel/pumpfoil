package org.pumpfoil.app

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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

    Scaffold(
        bottomBar = {
            if (route in TOP_LEVEL) {
                NavigationBar {
                    NavigationBarItem(
                        selected = route == "home", onClick = { nav.switchTab("home") },
                        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                        label = { Text(I18n.t("nav.home")) }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "community", onClick = { nav.switchTab("community") },
                        icon = { Icon(Icons.Filled.Groups, contentDescription = null) },
                        label = { Text(I18n.t("nav.community")) }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "sessions", onClick = { nav.switchTab("sessions") },
                        icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                        label = { Text(I18n.t("nav.sessions")) }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "verlauf", onClick = { nav.switchTab("verlauf") },
                        icon = { Icon(Icons.Filled.ShowChart, contentDescription = null) },
                        label = { Text(I18n.t("nav.history")) }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "spots", onClick = { nav.switchTab("spots") },
                        icon = { Icon(Icons.Filled.Place, contentDescription = null) },
                        label = { Text(I18n.t("nav.spots")) }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "chat", onClick = { nav.switchTab("chat") },
                        icon = { Icon(Icons.Filled.Forum, contentDescription = null) },
                        label = { Text(I18n.t("nav.chat")) }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "profile", onClick = { nav.switchTab("profile") },
                        icon = { Icon(Icons.Filled.Person, contentDescription = null) },
                        label = { Text(I18n.t("nav.profile")) }, alwaysShowLabel = false,
                    )
                }
            }
        },
    ) { pad ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(pad)) {
            composable("home") { HomeScreen(onOpen = { id -> nav.navigate("session/$id") }, onOpenChat = { nav.switchTab("chat") }) }
            composable("sessions") { SessionsScreen(onOpen = { id -> nav.navigate("session/$id") }) }
            composable("community") { CommunityScreen(onOpen = { id -> nav.navigate("session/$id") }, onRecords = { nav.navigate("records") }) }
            composable("records") { CommunityRecordsScreen(onBack = { nav.popBackStack() }, onOpen = { id -> nav.navigate("session/$id") }) }
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
                )
            }
            composable("foilcalc") { FoilCalculatorScreen(onBack = { nav.popBackStack() }) }
            composable("foils") { FoilsScreen(onBack = { nav.popBackStack() }) }
            composable("foilstats") { FoilStatsScreen(onBack = { nav.popBackStack() }) }
            composable("alarm") { AlarmScreen(onBack = { nav.popBackStack() }) }
            composable("settings") { SettingsScreen(onBack = { nav.popBackStack() }) }
            composable("datafields") { DataFieldsScreen(onBack = { nav.popBackStack() }) }
            composable("compare") { CompareScreen(onBack = { nav.popBackStack() }) }
            composable("garminpair") { GarminPairScreen(onBack = { nav.popBackStack() }) }
            composable(
                "session/{id}",
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { entry ->
                SessionDetailScreen(
                    id = entry.arguments?.getInt("id") ?: 0,
                    onBack = { nav.popBackStack() },
                    onLabel = { sid -> nav.navigate("labeling/$sid") },
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
