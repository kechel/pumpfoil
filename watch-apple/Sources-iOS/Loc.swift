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
    ]
}
