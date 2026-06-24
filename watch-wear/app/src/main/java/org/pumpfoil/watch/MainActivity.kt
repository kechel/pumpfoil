package org.pumpfoil.watch

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val perms = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.load(applicationContext)
        requestPerms()
        setContent { AppUi() }
    }

    private fun requestPerms() {
        val p = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACTIVITY_RECOGNITION,
        )
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
        perms.launch(p.toTypedArray())
    }

    @Composable
    private fun AppUi() {
        var paired by remember { mutableStateOf(Api.deviceToken != null) }
        MaterialTheme {
            if (paired) RecordScreen() else PairScreen { paired = true }
        }
    }

    @Composable
    private fun PairScreen(onPaired: () -> Unit) {
        val scope = rememberCoroutineScope()
        var code by remember { mutableStateOf("") }
        var error by remember { mutableStateOf("") }
        var busy by remember { mutableStateOf(false) }
        Column(
            Modifier.fillMaxSize().padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Uhr verbinden", style = MaterialTheme.typography.title3)
            Text("Pairing-Code aus der Web-App (Account)",
                style = MaterialTheme.typography.caption2)
            Spacer(Modifier.height(6.dp))
            BasicTextField(
                value = code,
                onValueChange = { code = it.uppercase() },
                singleLine = true,
                textStyle = TextStyle(color = Color.White, textAlign = TextAlign.Center),
                cursorBrush = SolidColor(Color.White),
                modifier = Modifier.fillMaxWidth()
                    .background(Color(0xFF1E293B), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
            Spacer(Modifier.height(6.dp))
            Button(enabled = !busy && code.length >= 4, onClick = {
                busy = true; error = ""
                scope.launch {
                    try { Api.saveToken(applicationContext, Api.pair(code.trim(), "Wear OS")); onPaired() }
                    catch (e: Exception) { error = e.message ?: "Fehler" }
                    busy = false
                }
            }) { Text(if (busy) "…" else "Verbinden") }
            if (error.isNotEmpty()) Text(error, style = MaterialTheme.typography.caption2)
        }
    }

    @Composable
    private fun RecordScreen() {
        val s by Recorder.state.collectAsState()
        Column(
            Modifier.fillMaxSize().padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(String.format("%d:%02d", s.elapsedSec / 60, s.elapsedSec % 60),
                style = MaterialTheme.typography.title2)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(String.format("%.1f km/h", s.speedKmh), style = MaterialTheme.typography.caption1)
                Text(if (s.hr > 0) "${s.hr} bpm" else "– bpm", style = MaterialTheme.typography.caption1)
            }
            Spacer(Modifier.height(8.dp))
            Button(onClick = {
                if (s.recording) RecorderService.stop(applicationContext)
                else RecorderService.start(applicationContext)
            }) { Text(if (s.recording) "Stop" else "Start") }
            if (s.status.isNotEmpty())
                Text(s.status, style = MaterialTheme.typography.caption2)
        }
    }
}
