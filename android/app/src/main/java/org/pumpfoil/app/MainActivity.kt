package org.pumpfoil.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Person
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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.load(applicationContext)
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

// Android-typische Bottom-Navigation (Material 3). Weitere Tabs (Community,
// Verlauf, Spots, Chat) folgen in den nächsten Phasen.
@Composable
fun MainScaffold(onLogout: () -> Unit) {
    var tab by remember { mutableStateOf(0) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0, onClick = { tab = 0 },
                    icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                    label = { Text("Sessions") },
                )
                NavigationBarItem(
                    selected = tab == 1, onClick = { tab = 1 },
                    icon = { Icon(Icons.Filled.Person, contentDescription = null) },
                    label = { Text("Profil") },
                )
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            when (tab) {
                0 -> SessionsScreen()
                else -> ProfileScreen(onLogout = onLogout)
            }
        }
    }
}
