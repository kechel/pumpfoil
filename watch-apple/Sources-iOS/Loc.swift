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

        "profile.foils": r("Foils", "Foils", "Foils", "Foils", "Foils", "Foils", "Foils"),
        "profile.foilsSub": r("Katalog · meine & Standard", "Katalog · myni & Standard", "Katalog · meine & Standard", "Catalog · mine & default", "Catalogue · les miens & défaut", "Catalogo · i miei & predefinito", "Catálogo · míos & predet."),
        "profile.calc": r("Foil-Rechner", "Foil-Rächner", "Foil-Rechner", "Foil calculator", "Calculateur de foil", "Calcolatore foil", "Calculadora de foil"),
        "profile.calcSub": r("Foils vergleichen & Pump-Leistung", "Foils vergliiche & Pump-Leischtig", "Foils vergleichen & Pump-Leistung", "Compare foils & pump power", "Comparer foils & puissance", "Confronta foil & potenza", "Comparar foils & potencia"),
        "profile.stats": r("Foil-Statistik", "Foil-Statistik", "Foil-Statistik", "Foil stats", "Stats de foil", "Statistiche foil", "Estadísticas de foil"),
        "profile.statsSub": r("Community: Werte je Foil", "Community: Wärt pro Foil", "Community: Werte je Foil", "Community: values per foil", "Communauté : valeurs par foil", "Community: valori per foil", "Comunidad: valores por foil"),
        "profile.alarm": r("On-Foil Alarm", "On-Foil Alarm", "On-Foil Alarm", "On-foil alarm", "Alarme on-foil", "Allarme on-foil", "Alarma on-foil"),
        "profile.alarmSub": r("Speed-Grenzen & Muster für die Uhr", "Speed-Gränze & Muschter für d Uhr", "Speed-Grenzen & Muster für die Uhr", "Speed limits & patterns for the watch", "Limites de vitesse & motifs", "Limiti di velocità & schemi", "Límites de velocidad & patrones"),
        "profile.datafields": r("Datenseiten", "Datesyte", "Datenseiten", "Data screens", "Écrans de données", "Schermate dati", "Pantallas de datos"),
        "profile.datafieldsSub": r("Felder je Uhr-Screen konfigurieren", "Fälder pro Uhr-Screen", "Felder je Uhr-Screen konfigurieren", "Configure fields per watch screen", "Champs par écran de montre", "Campi per schermata", "Campos por pantalla"),
        "profile.compare": r("Sessions vergleichen", "Sessions vergliiche", "Sessions vergleichen", "Compare sessions", "Comparer les sessions", "Confronta sessioni", "Comparar sesiones"),
        "profile.compareSub": r("Kennzahlen mehrerer Sessions", "Kennzahle vo mehrere Sessions", "Kennzahlen mehrerer Sessions", "Metrics of multiple sessions", "Mesures de plusieurs sessions", "Metriche di più sessioni", "Métricas de varias sesiones"),
        "profile.logout": r("Abmelden", "Abmälde", "Abmelden", "Sign out", "Se déconnecter", "Esci", "Cerrar sesión"),
        "profile.editName": r("Anzeigename", "Aazeigname", "Anzeigename", "Display name", "Nom affiché", "Nome visualizzato", "Nombre visible"),
        "profile.web": r("pumpfoil.org öffnen", "pumpfoil.org öffne", "pumpfoil.org öffnen", "Open pumpfoil.org", "Ouvrir pumpfoil.org", "Apri pumpfoil.org", "Abrir pumpfoil.org"),

        "settings.title": r("Einstellungen", "Yystellige", "Einstellungen", "Settings", "Réglages", "Impostazioni", "Ajustes"),
        "settings.weight": r("Gewicht", "Gwicht", "Gewicht", "Weight", "Poids", "Peso", "Peso"),
        "settings.homespot": r("Homespot", "Homespot", "Homespot", "Home spot", "Spot principal", "Spot principale", "Spot principal"),
        "settings.auto": r("Automatisch", "Automatisch", "Automatisch", "Automatic", "Automatique", "Automatico", "Automático"),
        "settings.design": r("Design", "Design", "Design", "Theme", "Thème", "Tema", "Tema"),
        "settings.light": r("Hell", "Häll", "Hell", "Light", "Clair", "Chiaro", "Claro"),
        "settings.dark": r("Dunkel", "Dunkel", "Dunkel", "Dark", "Sombre", "Scuro", "Oscuro"),
        "settings.notifications": r("Benachrichtigungen", "Benachrichtigunge", "Benachrichtigungen", "Notifications", "Notifications", "Notifiche", "Notificaciones"),
        "settings.nLikes": r("Likes", "Likes", "Likes", "Likes", "J'aime", "Mi piace", "Me gusta"),
        "settings.nAnalyzed": r("Auswertung fertig", "Uuswertig fertig", "Auswertung fertig", "Analysis ready", "Analyse prête", "Analisi pronta", "Análisis listo"),
        "settings.nRecord": r("Aufnahme/Records", "Ufnahm/Records", "Aufnahme/Records", "Recording/records", "Enreg./records", "Registrazione/record", "Grabación/récords"),
    ]
}
