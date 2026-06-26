package org.pumpfoil.app

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// Lokalisierung nach der im Profil gewählten Sprache (NICHT der Geräte-Locale, da wir nur
// genau diese 7 Locales pflegen). Fallback: de. Erweiterbar — Strings je Screen ergänzen.
// Wording, wo möglich, identisch mit web/src/i18n/locales/*.
object I18n {
    val LANGS = listOf("de", "gsw", "de-AT", "en", "fr", "it", "es")
    var lang by mutableStateOf("de")
        private set

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    fun load(ctx: Context) { lang = prefs(ctx).getString("lang", "de") ?: "de" }
    fun set(ctx: Context, l: String) {
        val v = if (l in LANGS) l else "de"
        lang = v
        prefs(ctx).edit().putString("lang", v).apply()
    }

    fun t(key: String): String {
        val row = S[key] ?: return key
        return row[lang] ?: row["de"] ?: row["en"] ?: key
    }
}

private fun row(de: String, gsw: String, deAT: String, en: String, fr: String, it: String, es: String) =
    mapOf("de" to de, "gsw" to gsw, "de-AT" to deAT, "en" to en, "fr" to fr, "it" to it, "es" to es)

// Kuratiertes Start-Set: Navigation, häufige Aktionen, Haupttitel.
private val S: Map<String, Map<String, String>> = mapOf(
    "nav.home" to row("Home", "Home", "Home", "Home", "Accueil", "Home", "Inicio"),
    "nav.community" to row("Community", "Community", "Community", "Community", "Communauté", "Community", "Comunidad"),
    "nav.sessions" to row("Sessions", "Sessions", "Sessions", "Sessions", "Sessions", "Sessioni", "Sesiones"),
    "nav.history" to row("Verlauf", "Verlauf", "Verlauf", "History", "Historique", "Storico", "Historial"),
    "nav.spots" to row("Spots", "Spots", "Spots", "Spots", "Spots", "Spots", "Spots"),
    "nav.chat" to row("Chat", "Chat", "Chat", "Chat", "Chat", "Chat", "Chat"),
    "nav.profile" to row("Profil", "Profil", "Profil", "Profile", "Profil", "Profilo", "Perfil"),
    "common.save" to row("Speichern", "Speichere", "Speichern", "Save", "Enregistrer", "Salva", "Guardar"),
    "common.cancel" to row("Abbrechen", "Abbräche", "Abbrechen", "Cancel", "Annuler", "Annulla", "Cancelar"),
    "common.delete" to row("Löschen", "Lösche", "Löschen", "Delete", "Supprimer", "Elimina", "Eliminar"),
    "common.saved" to row("Gespeichert", "Gspycheret", "Gespeichert", "Saved", "Enregistré", "Salvato", "Guardado"),
)
