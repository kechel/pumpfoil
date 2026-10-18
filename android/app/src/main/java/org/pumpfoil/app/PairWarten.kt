package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Nach dem Einloesen eines Uhren-Codes: erst „verbunden" melden, wenn die UHR das Token abgeholt hat
 * (GET /api/devices/pair-confirmed/{id}) — Port von web/src/components/PairWarten.tsx (Jan, 14.10.2026).
 * Anlass: eine schon verbundene Garmin-Uhr fragte beim Neu-Verbinden nie nach dem Token (bis 1.0.92),
 * die App zeigte Erfolg, die Uhr lud weiter ins alte Konto. Pollt alle 2 s, solange der Code gilt
 * (15 min); nach 30 s kommt der Hinweis, was man an der Uhr tun kann.
 */
@Composable
fun PairWarten(deviceId: Int, onConfirmed: () -> Unit = {}) {
    var ok by remember(deviceId) { mutableStateOf(false) }
    var langsam by remember(deviceId) { mutableStateOf(false) }
    LaunchedEffect(deviceId) {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < 15 * 60_000) {
            delay(2000)
            if (System.currentTimeMillis() - start > 30_000) langsam = true
            if (try { Api.pairConfirmed(deviceId) } catch (_: Exception) { false }) {
                ok = true
                onConfirmed()
                return@LaunchedEffect
            }
        }
    }
    if (ok) {
        Text(I18n.t("account.claimOk"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
            Text(I18n.t("account.claimWaiting"), style = MaterialTheme.typography.bodyMedium)
        }
        if (langsam) Text(I18n.t("account.claimSlow"), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.tertiary)
    }
}
