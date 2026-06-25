package org.pumpfoil.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Groups
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
        super.onCreate(savedInstanceState)
        Api.load(applicationContext)
        WatchSync.pushPairing(applicationContext)   // eingeloggt -> Wear-Uhr (Data Layer) verknüpfen
        setContent { PumpfoilTheme { App() } }
    }
}

// Auth-Gate: eingeloggt -> Tab-Navigation, sonst Login.
@Composable
fun App() {
    var token by remember { mutableStateOf(Api.token) }
    if (token == null) {
        LoginScreen(onLoggedIn = { token = Api.token })
    } else {
        MainScaffold(onLogout = { token = null })
    }
}

private val TOP_LEVEL = setOf("community", "sessions", "verlauf", "spots", "chat", "profile")

@Composable
fun MainScaffold(onLogout: () -> Unit) {
    val nav = rememberNavController()
    val backEntry by nav.currentBackStackEntryAsState()
    val route = backEntry?.destination?.route

    Scaffold(
        bottomBar = {
            if (route in TOP_LEVEL) {
                NavigationBar {
                    NavigationBarItem(
                        selected = route == "community", onClick = { nav.switchTab("community") },
                        icon = { Icon(Icons.Filled.Groups, contentDescription = null) },
                        label = { Text("Community") }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "sessions", onClick = { nav.switchTab("sessions") },
                        icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                        label = { Text("Sessions") }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "verlauf", onClick = { nav.switchTab("verlauf") },
                        icon = { Icon(Icons.Filled.ShowChart, contentDescription = null) },
                        label = { Text("Verlauf") }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "spots", onClick = { nav.switchTab("spots") },
                        icon = { Icon(Icons.Filled.Place, contentDescription = null) },
                        label = { Text("Spots") }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "chat", onClick = { nav.switchTab("chat") },
                        icon = { Icon(Icons.Filled.Forum, contentDescription = null) },
                        label = { Text("Chat") }, alwaysShowLabel = false,
                    )
                    NavigationBarItem(
                        selected = route == "profile", onClick = { nav.switchTab("profile") },
                        icon = { Icon(Icons.Filled.Person, contentDescription = null) },
                        label = { Text("Profil") }, alwaysShowLabel = false,
                    )
                }
            }
        },
    ) { pad ->
        NavHost(nav, startDestination = "sessions", modifier = Modifier.padding(pad)) {
            composable("sessions") { SessionsScreen(onOpen = { id -> nav.navigate("session/$id") }) }
            composable("community") { CommunityScreen(onOpen = { id -> nav.navigate("session/$id") }) }
            composable("verlauf") { VerlaufScreen(onOpen = { id -> nav.navigate("session/$id") }) }
            composable("spots") { SpotsScreen() }
            composable("chat") { ChatScreen() }
            composable("profile") {
                ProfileScreen(
                    onLogout = onLogout,
                    onFoilCalc = { nav.navigate("foilcalc") },
                    onFoils = { nav.navigate("foils") },
                    onFoilStats = { nav.navigate("foilstats") },
                )
            }
            composable("foilcalc") { FoilCalculatorScreen() }
            composable("foils") { FoilsScreen() }
            composable("foilstats") { FoilStatsScreen(onBack = { nav.popBackStack() }) }
            composable(
                "session/{id}",
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { entry ->
                SessionDetailScreen(
                    id = entry.arguments?.getInt("id") ?: 0,
                    onBack = { nav.popBackStack() },
                )
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
