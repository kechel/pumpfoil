import Foundation

// Lokalisierung nach Profil-Sprache (in UserDefaults "appLang", gesetzt nach Login).
// NICHT Geräte-Locale. Fallback de. Wording wie web/src/i18n/locales/*.
enum Loc {
    static let langs = ["de", "gsw", "de-AT", "en", "fr", "it", "es"]

    static func t(_ key: String, _ lang: String) -> String {
        guard let row = table[key] else { return key }
        return row[lang] ?? row["de"] ?? row["en"] ?? key
    }

    private static func r(_ de: String, _ gsw: String, _ deAT: String, _ en: String, _ fr: String, _ it: String, _ es: String) -> [String: String] {
        ["de": de, "gsw": gsw, "de-AT": deAT, "en": en, "fr": fr, "it": it, "es": es]
    }

    private static let table: [String: [String: String]] = [
        "nav.home": r("Home", "Home", "Home", "Home", "Accueil", "Home", "Inicio"),
        "nav.community": r("Community", "Community", "Community", "Community", "Communauté", "Community", "Comunidad"),
        "nav.sessions": r("Sessions", "Sessions", "Sessions", "Sessions", "Sessions", "Sessioni", "Sesiones"),
        "nav.history": r("Verlauf", "Verlauf", "Verlauf", "History", "Historique", "Storico", "Historial"),
        "nav.spots": r("Spots", "Spots", "Spots", "Spots", "Spots", "Spots", "Spots"),
        "nav.chat": r("Chat", "Chat", "Chat", "Chat", "Chat", "Chat", "Chat"),
        "nav.profile": r("Profil", "Profil", "Profil", "Profile", "Profil", "Profilo", "Perfil"),
        "common.save": r("Speichern", "Speichere", "Speichern", "Save", "Enregistrer", "Salva", "Guardar"),
        "common.cancel": r("Abbrechen", "Abbräche", "Abbrechen", "Cancel", "Annuler", "Annulla", "Cancelar"),
        "common.delete": r("Löschen", "Lösche", "Löschen", "Delete", "Supprimer", "Elimina", "Eliminar"),
        "common.saved": r("Gespeichert", "Gspycheret", "Gespeichert", "Saved", "Enregistré", "Salvato", "Guardado"),

        "login.email": r("E-Mail", "E-Mail", "E-Mail", "Email", "E-mail", "Email", "Correo"),
        "login.password": r("Passwort", "Passwort", "Passwort", "Password", "Mot de passe", "Password", "Contraseña"),
        "login.passwordReg": r("Passwort (min. 8 Zeichen)", "Passwort (min. 8 Zeiche)", "Passwort (min. 8 Zeichen)", "Password (min. 8 chars)", "Mot de passe (8+ car.)", "Password (min. 8)", "Contraseña (mín. 8)"),
        "login.name": r("Anzeigename (optional)", "Aazeigname (optional)", "Anzeigename (optional)", "Display name (optional)", "Nom affiché (optionnel)", "Nome visualizzato (opz.)", "Nombre visible (opcional)"),
        "login.create": r("Konto erstellen", "Konto erstelle", "Konto erstellen", "Create account", "Créer un compte", "Crea account", "Crear cuenta"),
        "login.signin": r("Anmelden", "Aamelde", "Anmelden", "Sign in", "Se connecter", "Accedi", "Iniciar sesión"),
        "login.toRegister": r("Noch kein Konto? Registrieren", "No kes Konto? Registriere", "Noch kein Konto? Registrieren", "No account? Register", "Pas de compte ? S'inscrire", "Nessun account? Registrati", "¿Sin cuenta? Regístrate"),
        "login.toLogin": r("Schon ein Konto? Anmelden", "Scho es Konto? Aamelde", "Schon ein Konto? Anmelden", "Have an account? Sign in", "Déjà un compte ? Se connecter", "Hai un account? Accedi", "¿Ya tienes cuenta? Inicia sesión"),
        "login.or": r("oder", "oder", "oder", "or", "ou", "o", "o"),
        "login.google": r("Mit Google anmelden", "Mit Google aamelde", "Mit Google anmelden", "Sign in with Google", "Se connecter avec Google", "Accedi con Google", "Iniciar sesión con Google"),
    ]
}
