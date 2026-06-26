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
        "common.noData": r("Noch keine Daten", "No kei Date", "Noch keine Daten", "No data yet", "Aucune donnée", "Nessun dato", "Sin datos"),

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

        "home.hello": r("Hallo", "Hoi", "Servus", "Hi", "Salut", "Ciao", "Hola"),
        "home.foiling": r("Foiling", "Foiling", "Foiling", "Foiling", "Foiling", "Foiling", "Foiling"),
        "home.runs": r("Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Tramos"),
        "home.pumps": r("Pumps", "Pumps", "Pumps", "Pumps", "Pumps", "Pumps", "Pumps"),
        "home.records": r("Rekorde", "Rekord", "Rekorde", "Records", "Records", "Record", "Récords"),
        "home.topSpeed": r("Top-Speed", "Top-Speed", "Top-Speed", "Top speed", "Vitesse max", "Velocità max", "Velocidad máx"),
        "home.farthestRun": r("Weitester Lauf", "Wytischte Lauf", "Weitester Lauf", "Farthest run", "Plus longue distance", "Distanza max", "Distancia máx"),
        "home.longestRun": r("Längster Lauf", "Längschte Lauf", "Längster Lauf", "Longest run", "Plus longue durée", "Durata max", "Duración máx"),
        "home.longestGlide": r("Längster Gleit", "Längschte Gleit", "Längster Gleit", "Longest glide", "Plus long plané", "Planata max", "Planeo máx"),
        "home.mostRuns": r("Meiste Läufe", "Meischti Läuf", "Meiste Läufe", "Most runs", "Plus de runs", "Più run", "Más tramos"),
        "home.latest": r("Letzte Sessions", "Letschti Sessions", "Letzte Sessions", "Latest sessions", "Dernières sessions", "Ultime sessioni", "Últimas sesiones"),

        "sessions.mine": r("Meine", "Myni", "Meine", "Mine", "Les miennes", "Le mie", "Mías"),
        "sessions.all": r("Alle", "Alli", "Alle", "All", "Toutes", "Tutte", "Todas"),
        "sessions.searchSpot": r("Spot suchen", "Spot sueche", "Spot suchen", "Search spot", "Chercher un spot", "Cerca spot", "Buscar spot"),
        "sessions.empty": r("Keine Sessions", "Kei Sessions", "Keine Sessions", "No sessions", "Aucune session", "Nessuna sessione", "Sin sesiones"),

        "verlauf.empty": r("Noch keine Auswertungen", "No kei Uuswertige", "Noch keine Auswertungen", "No analyses yet", "Aucune analyse", "Nessuna analisi", "Sin análisis"),
        "verlauf.total": r("Gesamt", "Gsamt", "Gesamt", "Total", "Total", "Totale", "Total"),
        "verlauf.cumulative": r("Kumuliert", "Kumuliert", "Kumuliert", "Cumulative", "Cumulé", "Cumulato", "Acumulado"),
        "verlauf.daysWord": r("Tage", "Täg", "Tage", "days", "jours", "giorni", "días"),
        "verlauf.daysAbbr": r("T", "T", "T", "d", "j", "g", "d"),
        "verlauf.period": r("Zeitraum", "Ziitruum", "Zeitraum", "Period", "Période", "Periodo", "Periodo"),
        "verlauf.kmFoiling": r("km Foiling", "km Foiling", "km Foiling", "km foiling", "km foiling", "km foiling", "km foiling"),

        "spots.empty": r("Noch keine Spots", "No kei Spots", "Noch keine Spots", "No spots yet", "Aucun spot", "Nessuno spot", "Sin spots"),
        "chat.empty": r("Noch keine Chats", "No kei Chats", "Noch keine Chats", "No chats yet", "Aucun chat", "Nessuna chat", "Sin chats"),
        "chat.placeholder": r("Nachricht", "Nachricht", "Nachricht", "Message", "Message", "Messaggio", "Mensaje"),
        "chat.send": r("Senden", "Schicke", "Senden", "Send", "Envoyer", "Invia", "Enviar"),

        "foils.search": r("Foil suchen", "Foil sueche", "Foil suchen", "Search foil", "Chercher un foil", "Cerca foil", "Buscar foil"),
        "foils.brand": r("Marke", "Marke", "Marke", "Brand", "Marque", "Marca", "Marca"),
        "foils.mine": r("Meine Foils", "Myni Foils", "Meine Foils", "My foils", "Mes foils", "I miei foil", "Mis foils"),
        "foils.all": r("Alle Foils", "Alli Foils", "Alle Foils", "All foils", "Tous les foils", "Tutti i foil", "Todos los foils"),
        "foils.more": r("Weitere", "Wytri", "Weitere", "More", "Autres", "Altri", "Más"),
        "foils.default": r("Standard", "Standard", "Standard", "Default", "Défaut", "Predefinito", "Predet."),

        "foilstats.intro": r("Welche Werte mit welchem Foil gefahren werden (Community).", "Weli Wärt mit welem Foil gfahre wärde (Community).", "Welche Werte mit welchem Foil gefahren werden (Community).", "Which values are ridden with which foil (community).", "Quelles valeurs avec quel foil (communauté).", "Quali valori con quale foil (community).", "Qué valores con qué foil (comunidad)."),
        "foilstats.riders": r("Fahrer", "Fahrer", "Fahrer", "Riders", "Riders", "Rider", "Riders"),
        "foilstats.bestKm": r("best km", "best km", "best km", "best km", "meilleur km", "miglior km", "mejor km"),

        "datafields.intro": r("Bis zu 3 Felder pro Seite. Leere Seiten entfallen auf der Uhr.", "Bis zu 3 Fälder pro Syte. Lääri Syte falle uf de Uhr wäg.", "Bis zu 3 Felder pro Seite. Leere Seiten entfallen auf der Uhr.", "Up to 3 fields per page. Empty pages are skipped on the watch.", "Jusqu'à 3 champs par page. Les pages vides sont ignorées sur la montre.", "Fino a 3 campi per pagina. Le pagine vuote vengono saltate sull'orologio.", "Hasta 3 campos por página. Las páginas vacías se omiten en el reloj."),
        "datafields.page": r("Seite", "Syte", "Seite", "Page", "Page", "Pagina", "Página"),
        "datafields.field": r("Feld", "Fäld", "Feld", "Field", "Champ", "Campo", "Campo"),
        "datafields.removePage": r("Seite entfernen", "Syte entferne", "Seite entfernen", "Remove page", "Supprimer la page", "Rimuovi pagina", "Quitar página"),
        "datafields.addPage": r("Seite hinzufügen", "Syte zuefüege", "Seite hinzufügen", "Add page", "Ajouter une page", "Aggiungi pagina", "Añadir página"),

        "field.0": r("— leer —", "— läär —", "— leer —", "— off —", "— vide —", "— vuoto —", "— vacío —"),
        "field.1": r("Speed (3 s)", "Speed (3 s)", "Speed (3 s)", "Speed (3 s)", "Vitesse (3 s)", "Velocità (3 s)", "Velocidad (3 s)"),
        "field.5": r("Speed (aktuell)", "Speed (aktuell)", "Speed (aktuell)", "Speed (current)", "Vitesse (actuelle)", "Velocità (attuale)", "Velocidad (actual)"),
        "field.6": r("Ø Speed", "Ø Speed", "Ø Speed", "Avg speed", "Vitesse moy.", "Velocità media", "Velocidad med."),
        "field.7": r("Max Speed", "Max Speed", "Max Speed", "Max speed", "Vitesse max", "Velocità max", "Velocidad máx"),
        "field.2": r("Puls", "Puls", "Puls", "Heart rate", "Fréq. cardiaque", "Frequenza card.", "Pulso"),
        "field.8": r("Ø Puls", "Ø Puls", "Ø Puls", "Avg HR", "FC moy.", "FC media", "Pulso med."),
        "field.9": r("Max Puls", "Max Puls", "Max Puls", "Max HR", "FC max", "FC max", "Pulso máx"),
        "field.3": r("Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo"),
        "field.4": r("Distanz", "Distanz", "Distanz", "Distance", "Distance", "Distanza", "Distancia"),
        "field.10": r("Höhe", "Höchi", "Höhe", "Altitude", "Altitude", "Altitudine", "Altitud"),
        "field.13": r("Aufstieg", "Ufstig", "Aufstieg", "Ascent", "Montée", "Salita", "Ascenso"),
        "field.11": r("Temperatur", "Temperatur", "Temperatur", "Temperature", "Température", "Temperatura", "Temperatura"),
        "field.12": r("Uhrzeit", "Uhrziit", "Uhrzeit", "Clock", "Heure", "Ora", "Hora"),
        "field.14": r("Lauf Dauer (live)", "Lauf Duur (live)", "Lauf Dauer (live)", "Run duration (live)", "Durée run (live)", "Durata run (live)", "Duración run (vivo)"),
        "field.15": r("Lauf Strecke (live)", "Lauf Strecki (live)", "Lauf Strecke (live)", "Run distance (live)", "Distance run (live)", "Distanza run (live)", "Distancia run (vivo)"),
        "field.16": r("Letzter Lauf: Dauer", "Letschte Lauf: Duur", "Letzter Lauf: Dauer", "Last run: duration", "Dernier run : durée", "Ultimo run: durata", "Último run: duración"),
        "field.17": r("Letzter Lauf: Strecke", "Letschte Lauf: Strecki", "Letzter Lauf: Strecke", "Last run: distance", "Dernier run : distance", "Ultimo run: distanza", "Último run: distancia"),
        "field.18": r("Letzter Lauf: Ø Speed", "Letschte Lauf: Ø Speed", "Letzter Lauf: Ø Speed", "Last run: avg speed", "Dernier run : vit. moy.", "Ultimo run: vel. media", "Último run: vel. med."),
        "field.19": r("Letzter Lauf: Max Speed", "Letschte Lauf: Max Speed", "Letzter Lauf: Max Speed", "Last run: max speed", "Dernier run : vit. max", "Ultimo run: vel. max", "Último run: vel. máx"),
        "field.20": r("Läufe (Anzahl)", "Läuf (Aazahl)", "Läufe (Anzahl)", "Runs (count)", "Runs (nombre)", "Run (numero)", "Runs (número)"),
    ]
}
