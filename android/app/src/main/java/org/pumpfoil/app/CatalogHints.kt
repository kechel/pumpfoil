package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// Kennzeichen an Katalog-Einträgen, deren Zahlen NICHT vom Hersteller abgeschrieben sind
// („Dicke geschätzt", „Maße abgeleitet") — plus der Hinweis unter Katalog-Listen, dass fehlende
// Einträge nachgetragen werden können. Beides spiegelt die PWA (Foils.tsx / MissingHint.tsx).

// amber-500/orange-500 als Hintergrund wie in der PWA; Vordergrund je Farbmodus lesbar.
private val Amber500 = Color(0xFFF59E0B)
private val Orange500 = Color(0xFFF97316)
private val OrangeOnLight = Color(0xFF9A3412)   // orange-800
private val OrangeOnDark = Color(0xFFFED7AA)    // orange-200

// Kleines Abzeichen mit Erklärung. In der PWA steckt die Erklärung im title-Tooltip; auf dem
// Handy gibt es kein Hover, deshalb öffnet ein Tipp den Text als Dialog (normale Schriftgröße).
// specs = true -> orange („Maße abgeleitet", betrifft die ganze Leistungsrechnung),
// sonst amber („Dicke geschätzt", harmloser). Genau die Farbtrennung der PWA.
@Composable
fun EstimateBadge(label: String, hint: String, specs: Boolean = false) {
    // NICHT isSystemInDarkTheme(): ThemeState kann Hell/Dunkel erzwingen (Theme.kt:57-60).
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val fg = if (specs) (if (dark) OrangeOnDark else OrangeOnLight) else (if (dark) AmberOnDark else AmberOnLight)
    val bg = (if (specs) Orange500 else Amber500).copy(alpha = 0.15f)
    var open by remember { mutableStateOf(false) }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = { Text(hint, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = { TextButton(onClick = { open = false }) { Text("OK") } },
        )
    }
    Text(label, style = MaterialTheme.typography.labelSmall, color = fg,
        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(bg)
            .clickable { open = true }
            .padding(horizontal = 5.dp, vertical = 1.dp))
}

// „Fehlt etwas im Katalog?" — öffnet das Feedback mit vorbelegtem Text. Steht unter Katalog-Listen,
// die naturgemäß unvollständig sind (Foils, Stabs): die Hersteller-Landschaft ändert sich jährlich.
// Grund (wie in der PWA): Nutzer mussten anschreiben, weil ihre Marke fehlte und die Liste nirgends
// sagte, dass man sie nachtragen lassen kann — eine Sackgasse genau an der auffälligen Stelle.
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MissingHint(what: String) {
    var open by remember { mutableStateOf(false) }
    if (open) FeedbackDialog(onDismiss = { open = false }, prefill = what)
    // FlowRow, damit Frage und Knopf auf schmalen Geräten umbrechen statt abgeschnitten zu werden.
    FlowRow(
        Modifier.padding(top = 12.dp, bottom = 4.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        // Bewusst normale Schriftgröße (bodyMedium): Hinweise nie kleiner als der übrige Text.
        Text(what, style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.CenterVertically))
        TextButton(onClick = { open = true }, contentPadding = PaddingValues(horizontal = 8.dp)) {
            Icon(Icons.Outlined.MailOutline, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text(I18n.t("foils.missingCta"), style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold)
        }
    }
}
