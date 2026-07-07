package org.pumpfoil.app

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import com.google.android.play.core.review.ReviewManagerFactory
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Netter Rating-Dialog (nur App): Sterne. >=4 -> echte Play-Store-Bewertung; <=3 -> Feedback
// (wird ganz normal als Feedback gespeichert), kein Store-Rating. Trigger: >=5 gesyncte Sessions,
// nur einmal (siehe HomeScreen).
// onLater = „Später" (14 Tage). onRated = >=4 Sterne, Store-Weiterleitung (nie mehr).
// onFeedback = <=3 Sterne + Text gegeben (nach 14 Tagen wieder, aber nur bei neuen Sessions).
@Composable
fun RatingDialog(onLater: () -> Unit, onRated: () -> Unit, onFeedback: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var stars by remember { mutableStateOf(0) }
    var feedbackMode by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onLater,   // Wegtippen = „Später"
        title = { Text(I18n.t(if (feedbackMode) "rating.feedbackTitle" else "rating.title")) },
        text = {
            if (!feedbackMode) {
                Column {
                    Text(I18n.t("rating.subtitle"))
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                        (1..5).forEach { i ->
                            IconButton(onClick = {
                                stars = i
                                if (i >= 4) { launchInAppReview(ctx); onRated() } else { feedbackMode = true }
                            }) {
                                Icon(
                                    if (i <= stars) Icons.Filled.Star else Icons.Filled.StarBorder,
                                    contentDescription = "$i",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                    }
                }
            } else {
                Column {
                    Text(I18n.t("rating.feedbackHint"))
                    OutlinedTextField(
                        value = text, onValueChange = { text = it },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        placeholder = { Text(I18n.t("feedback.placeholder")) },
                        minLines = 3,
                    )
                }
            }
        },
        confirmButton = {
            if (feedbackMode) {
                TextButton(onClick = {
                    val t = text.trim(); onFeedback()
                    if (t.isNotEmpty()) scope.launch { runCatching { Api.submitFeedback("[★$stars] $t") } }
                }) { Text(I18n.t("rating.send")) }
            }
        },
        dismissButton = { TextButton(onClick = onLater) { Text(I18n.t("rating.later")) } },
    )
}

// Natives In-App-Review-Overlay (bleibt in der App, kein Store-Sprung). Google entscheidet
// system-/kontingentgesteuert, ob es erscheint; klappt es nicht, fallback auf die Store-Seite.
private fun launchInAppReview(ctx: Context) {
    val manager = ReviewManagerFactory.create(ctx)
    manager.requestReviewFlow().addOnCompleteListener { task ->
        val act = ctx.findActivity()
        if (task.isSuccessful && act != null) {
            manager.launchReviewFlow(act, task.result)
        } else {
            openStore(ctx)
        }
    }
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) { if (c is Activity) return c; c = c.baseContext }
    return null
}

private fun openStore(ctx: Context) {
    val pkg = ctx.packageName
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")))
    } catch (_: Exception) {
        try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg"))) } catch (_: Exception) {}
    }
}
