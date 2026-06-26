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

    "login.email" to row("E-Mail", "E-Mail", "E-Mail", "Email", "E-mail", "Email", "Correo"),
    "login.password" to row("Passwort", "Passwort", "Passwort", "Password", "Mot de passe", "Password", "Contraseña"),
    "login.passwordReg" to row("Passwort (min. 8 Zeichen)", "Passwort (min. 8 Zeiche)", "Passwort (min. 8 Zeichen)", "Password (min. 8 chars)", "Mot de passe (8+ car.)", "Password (min. 8)", "Contraseña (mín. 8)"),
    "login.name" to row("Anzeigename (optional)", "Aazeigname (optional)", "Anzeigename (optional)", "Display name (optional)", "Nom affiché (optionnel)", "Nome visualizzato (opz.)", "Nombre visible (opcional)"),
    "login.create" to row("Konto erstellen", "Konto erstelle", "Konto erstellen", "Create account", "Créer un compte", "Crea account", "Crear cuenta"),
    "login.signin" to row("Anmelden", "Aamelde", "Anmelden", "Sign in", "Se connecter", "Accedi", "Iniciar sesión"),
    "login.toRegister" to row("Noch kein Konto? Registrieren", "No kes Konto? Registriere", "Noch kein Konto? Registrieren", "No account? Register", "Pas de compte ? S'inscrire", "Nessun account? Registrati", "¿Sin cuenta? Regístrate"),
    "login.toLogin" to row("Schon ein Konto? Anmelden", "Scho es Konto? Aamelde", "Schon ein Konto? Anmelden", "Have an account? Sign in", "Déjà un compte ? Se connecter", "Hai un account? Accedi", "¿Ya tienes cuenta? Inicia sesión"),
    "login.or" to row("oder", "oder", "oder", "or", "ou", "o", "o"),
    "login.google" to row("Mit Google anmelden", "Mit Google aamelde", "Mit Google anmelden", "Sign in with Google", "Se connecter avec Google", "Accedi con Google", "Iniciar sesión con Google"),
)
