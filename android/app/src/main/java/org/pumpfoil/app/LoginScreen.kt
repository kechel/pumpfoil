package org.pumpfoil.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private val LANG_LABEL = mapOf(
    "de" to "Deutsch", "gsw" to "Schwiizerdütsch", "de-AT" to "Österreichisch",
    "en" to "English", "fr" to "Français", "it" to "Italiano", "es" to "Español",
    "fi" to "Suomi", "nl" to "Nederlands", "cs" to "Čeština",
    "pt" to "Português", "ja" to "日本語", "zh" to "中文", "ru" to "Русский", "id" to "Bahasa Indonesia",
)

// Gebrandeter Login: Hintergrundbild + Scrim + Card. Reihenfolge wie die PWA:
// Wortmarke · Untertitel · E-Mail · Passwort · [Name] · Fehler · Anmelden ·
// Passwort vergessen · Umschalten · oder · Google · Sprache · Impressum.
@Composable
fun LoginScreen(onLoggedIn: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var resetMsg by remember { mutableStateOf<String?>(null) }
    var showImprint by remember { mutableStateOf(false) }
    var langMenu by remember { mutableStateOf(false) }
    var lang by remember { mutableStateOf(I18n.lang) }

    if (showImprint) { ImpressumScreen(onBack = { showImprint = false }); return }

    Box(Modifier.fillMaxSize()) {
        Image(
            painterResource(R.drawable.login_bg), contentDescription = null,
            modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop,
        )
        Box(Modifier.fillMaxSize().background(Color(0xCC020617)))   // Scrim für Lesbarkeit

        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Card(Modifier.fillMaxWidth().widthIn(max = 420.dp)) {
                Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Image(
                        painterResource(R.drawable.wordmark_stacked), contentDescription = "Pumpfoil.org",
                        modifier = Modifier.height(72.dp), contentScale = ContentScale.Fit,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        I18n.t(if (register) "login.createAccount" else "login.welcomeBack"),
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(16.dp))

                    OutlinedTextField(
                        value = email, onValueChange = { email = it },
                        label = { Text(I18n.t("login.email")) }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = password, onValueChange = { password = it },
                        label = { Text(I18n.t(if (register) "login.passwordReg" else "login.password")) }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (register) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = name, onValueChange = { name = it },
                            label = { Text(I18n.t("login.displayName")) }, singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    resetMsg?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }

                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = {
                            busy = true; error = null; resetMsg = null
                            scope.launch {
                                try {
                                    val t = if (register) Api.register(email.trim(), password, name.trim())
                                            else Api.login(email.trim(), password)
                                    Api.saveToken(ctx, t)
                                    WatchSync.pushPairing(ctx)
                                    onLoggedIn()
                                } catch (e: Exception) { error = e.message }
                                busy = false
                            }
                        },
                        enabled = !busy && email.isNotBlank() && password.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else Text(I18n.t(if (register) "login.create" else "login.signin"))
                    }

                    if (!register) {
                        TextButton(onClick = {
                            error = null; resetMsg = null
                            if (email.isBlank()) error = I18n.t("login.enterEmail")
                            else { scope.launch { try { Api.forgotPassword(email.trim()) } catch (_: Exception) {} }; resetMsg = I18n.t("login.resetSent") }
                        }) { Text(I18n.t("login.forgot"), style = MaterialTheme.typography.bodySmall) }
                    }

                    TextButton(onClick = { register = !register; error = null; resetMsg = null }) {
                        Text(I18n.t(if (register) "login.toLogin" else "login.toRegister"))
                    }

                    Spacer(Modifier.height(4.dp))
                    Text(I18n.t("login.or"), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = {
                            busy = true; error = null
                            scope.launch {
                                try {
                                    val idToken = GoogleAuth.idToken(ctx)
                                    Api.saveToken(ctx, Api.nativeGoogle(idToken)); WatchSync.pushPairing(ctx); onLoggedIn()
                                } catch (e: Exception) { error = e.message }
                                busy = false
                            }
                        },
                        enabled = !busy, modifier = Modifier.fillMaxWidth(),
                    ) { Text(I18n.t("login.google")) }

                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box {
                            TextButton(onClick = { langMenu = true }) {
                                Icon(Icons.Filled.Language, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(LANG_LABEL[lang] ?: "Deutsch", style = MaterialTheme.typography.bodySmall)
                            }
                            DropdownMenu(expanded = langMenu, onDismissRequest = { langMenu = false }) {
                                I18n.LANGS.forEach { l ->
                                    DropdownMenuItem(text = { Text(LANG_LABEL[l] ?: l) }, onClick = {
                                        I18n.set(ctx, l); lang = l; langMenu = false
                                    })
                                }
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = { showImprint = true }) {
                            Text(I18n.t("nav.imprint"), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
