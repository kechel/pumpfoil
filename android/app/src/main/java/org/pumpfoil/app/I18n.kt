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
    "common.noData" to row("Noch keine Daten", "No kei Date", "Noch keine Daten", "No data yet", "Aucune donnée", "Nessun dato", "Sin datos"),

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

    "profile.foils" to row("Foils", "Foils", "Foils", "Foils", "Foils", "Foils", "Foils"),
    "profile.foilsSub" to row("Katalog · meine & Standard", "Katalog · myni & Standard", "Katalog · meine & Standard", "Catalog · mine & default", "Catalogue · les miens & défaut", "Catalogo · i miei & predefinito", "Catálogo · míos & predet."),
    "profile.calc" to row("Foil-Rechner", "Foil-Rächner", "Foil-Rechner", "Foil calculator", "Calculateur de foil", "Calcolatore foil", "Calculadora de foil"),
    "profile.calcSub" to row("Foils vergleichen & Pump-Leistung", "Foils vergliiche & Pump-Leischtig", "Foils vergleichen & Pump-Leistung", "Compare foils & pump power", "Comparer foils & puissance", "Confronta foil & potenza", "Comparar foils & potencia"),
    "profile.stats" to row("Foil-Statistik", "Foil-Statistik", "Foil-Statistik", "Foil stats", "Stats de foil", "Statistiche foil", "Estadísticas de foil"),
    "profile.statsSub" to row("Community: Werte je Foil", "Community: Wärt pro Foil", "Community: Werte je Foil", "Community: values per foil", "Communauté : valeurs par foil", "Community: valori per foil", "Comunidad: valores por foil"),
    "profile.alarm" to row("On-Foil Alarm", "On-Foil Alarm", "On-Foil Alarm", "On-foil alarm", "Alarme on-foil", "Allarme on-foil", "Alarma on-foil"),
    "profile.alarmSub" to row("Speed-Grenzen & Muster für die Uhr", "Speed-Gränze & Muschter für d Uhr", "Speed-Grenzen & Muster für die Uhr", "Speed limits & patterns for the watch", "Limites de vitesse & motifs", "Limiti di velocità & schemi", "Límites de velocidad & patrones"),
    "profile.datafields" to row("Datenseiten", "Datesyte", "Datenseiten", "Data screens", "Écrans de données", "Schermate dati", "Pantallas de datos"),
    "profile.datafieldsSub" to row("Felder je Uhr-Screen konfigurieren", "Fälder pro Uhr-Screen", "Felder je Uhr-Screen konfigurieren", "Configure fields per watch screen", "Champs par écran de montre", "Campi per schermata", "Campos por pantalla"),
    "profile.compare" to row("Sessions vergleichen", "Sessions vergliiche", "Sessions vergleichen", "Compare sessions", "Comparer les sessions", "Confronta sessioni", "Comparar sesiones"),
    "profile.compareSub" to row("Kennzahlen mehrerer Sessions", "Kennzahle vo mehrere Sessions", "Kennzahlen mehrerer Sessions", "Metrics of multiple sessions", "Mesures de plusieurs sessions", "Metriche di più sessioni", "Métricas de varias sesiones"),
    "profile.logout" to row("Abmelden", "Abmälde", "Abmelden", "Sign out", "Se déconnecter", "Esci", "Cerrar sesión"),
    "profile.editName" to row("Anzeigename", "Aazeigname", "Anzeigename", "Display name", "Nom affiché", "Nome visualizzato", "Nombre visible"),
    "profile.web" to row("pumpfoil.org öffnen", "pumpfoil.org öffne", "pumpfoil.org öffnen", "Open pumpfoil.org", "Ouvrir pumpfoil.org", "Apri pumpfoil.org", "Abrir pumpfoil.org"),

    "settings.title" to row("Einstellungen", "Yystellige", "Einstellungen", "Settings", "Réglages", "Impostazioni", "Ajustes"),
    "settings.weight" to row("Gewicht", "Gwicht", "Gewicht", "Weight", "Poids", "Peso", "Peso"),
    "settings.homespot" to row("Homespot", "Homespot", "Homespot", "Home spot", "Spot principal", "Spot principale", "Spot principal"),
    "settings.auto" to row("Automatisch", "Automatisch", "Automatisch", "Automatic", "Automatique", "Automatico", "Automático"),
    "settings.design" to row("Design", "Design", "Design", "Theme", "Thème", "Tema", "Tema"),
    "settings.light" to row("Hell", "Häll", "Hell", "Light", "Clair", "Chiaro", "Claro"),
    "settings.dark" to row("Dunkel", "Dunkel", "Dunkel", "Dark", "Sombre", "Scuro", "Oscuro"),
    "settings.notifications" to row("Benachrichtigungen", "Benachrichtigunge", "Benachrichtigungen", "Notifications", "Notifications", "Notifiche", "Notificaciones"),
    "settings.nLikes" to row("Likes", "Likes", "Likes", "Likes", "J'aime", "Mi piace", "Me gusta"),
    "settings.nAnalyzed" to row("Auswertung fertig", "Uuswertig fertig", "Auswertung fertig", "Analysis ready", "Analyse prête", "Analisi pronta", "Análisis listo"),
    "settings.nRecord" to row("Aufnahme/Records", "Ufnahm/Records", "Aufnahme/Records", "Recording/records", "Enreg./records", "Registrazione/record", "Grabación/récords"),

    "home.hello" to row("Hallo", "Hoi", "Servus", "Hi", "Salut", "Ciao", "Hola"),
    "home.foiling" to row("Foiling", "Foiling", "Foiling", "Foiling", "Foiling", "Foiling", "Foiling"),
    "home.runs" to row("Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Tramos"),
    "home.pumps" to row("Pumps", "Pumps", "Pumps", "Pumps", "Pumps", "Pumps", "Pumps"),
    "home.records" to row("Rekorde", "Rekord", "Rekorde", "Records", "Records", "Record", "Récords"),
    "home.topSpeed" to row("Top-Speed", "Top-Speed", "Top-Speed", "Top speed", "Vitesse max", "Velocità max", "Velocidad máx"),
    "home.farthestRun" to row("Weitester Lauf", "Wytischte Lauf", "Weitester Lauf", "Farthest run", "Plus longue distance", "Distanza max", "Distancia máx"),
    "home.longestRun" to row("Längster Lauf", "Längschte Lauf", "Längster Lauf", "Longest run", "Plus longue durée", "Durata max", "Duración máx"),
    "home.longestGlide" to row("Längster Gleit", "Längschte Gleit", "Längster Gleit", "Longest glide", "Plus long plané", "Planata max", "Planeo máx"),
    "home.mostRuns" to row("Meiste Läufe", "Meischti Läuf", "Meiste Läufe", "Most runs", "Plus de runs", "Più run", "Más tramos"),
    "home.latest" to row("Letzte Sessions", "Letschti Sessions", "Letzte Sessions", "Latest sessions", "Dernières sessions", "Ultime sessioni", "Últimas sesiones"),

    "sessions.mine" to row("Meine", "Myni", "Meine", "Mine", "Les miennes", "Le mie", "Mías"),
    "sessions.all" to row("Alle", "Alli", "Alle", "All", "Toutes", "Tutte", "Todas"),
    "sessions.searchSpot" to row("Spot suchen", "Spot sueche", "Spot suchen", "Search spot", "Chercher un spot", "Cerca spot", "Buscar spot"),
    "sessions.empty" to row("Keine Sessions", "Kei Sessions", "Keine Sessions", "No sessions", "Aucune session", "Nessuna sessione", "Sin sesiones"),

    "verlauf.empty" to row("Noch keine Auswertungen", "No kei Uuswertige", "Noch keine Auswertungen", "No analyses yet", "Aucune analyse", "Nessuna analisi", "Sin análisis"),
    "verlauf.total" to row("Gesamt", "Gsamt", "Gesamt", "Total", "Total", "Totale", "Total"),
    "verlauf.cumulative" to row("Kumuliert", "Kumuliert", "Kumuliert", "Cumulative", "Cumulé", "Cumulato", "Acumulado"),
    "verlauf.daysWord" to row("Tage", "Täg", "Tage", "days", "jours", "giorni", "días"),
    "verlauf.daysAbbr" to row("T", "T", "T", "d", "j", "g", "d"),
    "verlauf.period" to row("Zeitraum", "Ziitruum", "Zeitraum", "Period", "Période", "Periodo", "Periodo"),
    "verlauf.kmFoiling" to row("km Foiling", "km Foiling", "km Foiling", "km foiling", "km foiling", "km foiling", "km foiling"),

    "spots.empty" to row("Noch keine Spots", "No kei Spots", "Noch keine Spots", "No spots yet", "Aucun spot", "Nessuno spot", "Sin spots"),
    "chat.empty" to row("Noch keine Chats", "No kei Chats", "Noch keine Chats", "No chats yet", "Aucun chat", "Nessuna chat", "Sin chats"),
    "chat.placeholder" to row("Nachricht", "Nachricht", "Nachricht", "Message", "Message", "Messaggio", "Mensaje"),
    "chat.send" to row("Senden", "Schicke", "Senden", "Send", "Envoyer", "Invia", "Enviar"),

    "foils.search" to row("Foil suchen", "Foil sueche", "Foil suchen", "Search foil", "Chercher un foil", "Cerca foil", "Buscar foil"),
    "foils.brand" to row("Marke", "Marke", "Marke", "Brand", "Marque", "Marca", "Marca"),
    "foils.mine" to row("Meine Foils", "Myni Foils", "Meine Foils", "My foils", "Mes foils", "I miei foil", "Mis foils"),
    "foils.all" to row("Alle Foils", "Alli Foils", "Alle Foils", "All foils", "Tous les foils", "Tutti i foil", "Todos los foils"),
    "foils.more" to row("Weitere", "Wytri", "Weitere", "More", "Autres", "Altri", "Más"),
    "foils.default" to row("Standard", "Standard", "Standard", "Default", "Défaut", "Predefinito", "Predet."),

    "foilstats.intro" to row("Welche Werte mit welchem Foil gefahren werden (Community).", "Weli Wärt mit welem Foil gfahre wärde (Community).", "Welche Werte mit welchem Foil gefahren werden (Community).", "Which values are ridden with which foil (community).", "Quelles valeurs avec quel foil (communauté).", "Quali valori con quale foil (community).", "Qué valores con qué foil (comunidad)."),
    "foilstats.riders" to row("Fahrer", "Fahrer", "Fahrer", "Riders", "Riders", "Rider", "Riders"),
    "foilstats.bestKm" to row("best km", "best km", "best km", "best km", "meilleur km", "miglior km", "mejor km"),

    "datafields.intro" to row("Bis zu 3 Felder pro Seite. Leere Seiten entfallen auf der Uhr.", "Bis zu 3 Fälder pro Syte. Lääri Syte falle uf de Uhr wäg.", "Bis zu 3 Felder pro Seite. Leere Seiten entfallen auf der Uhr.", "Up to 3 fields per page. Empty pages are skipped on the watch.", "Jusqu'à 3 champs par page. Les pages vides sont ignorées sur la montre.", "Fino a 3 campi per pagina. Le pagine vuote vengono saltate sull'orologio.", "Hasta 3 campos por página. Las páginas vacías se omiten en el reloj."),
    "datafields.page" to row("Seite", "Syte", "Seite", "Page", "Page", "Pagina", "Página"),
    "datafields.field" to row("Feld", "Fäld", "Feld", "Field", "Champ", "Campo", "Campo"),
    "datafields.removePage" to row("Seite entfernen", "Syte entferne", "Seite entfernen", "Remove page", "Supprimer la page", "Rimuovi pagina", "Quitar página"),
    "datafields.addPage" to row("Seite hinzufügen", "Syte zuefüege", "Seite hinzufügen", "Add page", "Ajouter une page", "Aggiungi pagina", "Añadir página"),

    "field.0" to row("— leer —", "— läär —", "— leer —", "— off —", "— vide —", "— vuoto —", "— vacío —"),
    "field.1" to row("Speed (3 s)", "Speed (3 s)", "Speed (3 s)", "Speed (3 s)", "Vitesse (3 s)", "Velocità (3 s)", "Velocidad (3 s)"),
    "field.5" to row("Speed (aktuell)", "Speed (aktuell)", "Speed (aktuell)", "Speed (current)", "Vitesse (actuelle)", "Velocità (attuale)", "Velocidad (actual)"),
    "field.6" to row("Ø Speed", "Ø Speed", "Ø Speed", "Avg speed", "Vitesse moy.", "Velocità media", "Velocidad med."),
    "field.7" to row("Max Speed", "Max Speed", "Max Speed", "Max speed", "Vitesse max", "Velocità max", "Velocidad máx"),
    "field.2" to row("Puls", "Puls", "Puls", "Heart rate", "Fréq. cardiaque", "Frequenza card.", "Pulso"),
    "field.8" to row("Ø Puls", "Ø Puls", "Ø Puls", "Avg HR", "FC moy.", "FC media", "Pulso med."),
    "field.9" to row("Max Puls", "Max Puls", "Max Puls", "Max HR", "FC max", "FC max", "Pulso máx"),
    "field.3" to row("Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo"),
    "field.4" to row("Distanz", "Distanz", "Distanz", "Distance", "Distance", "Distanza", "Distancia"),
    "field.10" to row("Höhe", "Höchi", "Höhe", "Altitude", "Altitude", "Altitudine", "Altitud"),
    "field.13" to row("Aufstieg", "Ufstig", "Aufstieg", "Ascent", "Montée", "Salita", "Ascenso"),
    "field.11" to row("Temperatur", "Temperatur", "Temperatur", "Temperature", "Température", "Temperatura", "Temperatura"),
    "field.12" to row("Uhrzeit", "Uhrziit", "Uhrzeit", "Clock", "Heure", "Ora", "Hora"),
    "field.14" to row("Lauf Dauer (live)", "Lauf Duur (live)", "Lauf Dauer (live)", "Run duration (live)", "Durée run (live)", "Durata run (live)", "Duración run (vivo)"),
    "field.15" to row("Lauf Strecke (live)", "Lauf Strecki (live)", "Lauf Strecke (live)", "Run distance (live)", "Distance run (live)", "Distanza run (live)", "Distancia run (vivo)"),
    "field.16" to row("Letzter Lauf: Dauer", "Letschte Lauf: Duur", "Letzter Lauf: Dauer", "Last run: duration", "Dernier run : durée", "Ultimo run: durata", "Último run: duración"),
    "field.17" to row("Letzter Lauf: Strecke", "Letschte Lauf: Strecki", "Letzter Lauf: Strecke", "Last run: distance", "Dernier run : distance", "Ultimo run: distanza", "Último run: distancia"),
    "field.18" to row("Letzter Lauf: Ø Speed", "Letschte Lauf: Ø Speed", "Letzter Lauf: Ø Speed", "Last run: avg speed", "Dernier run : vit. moy.", "Ultimo run: vel. media", "Último run: vel. med."),
    "field.19" to row("Letzter Lauf: Max Speed", "Letschte Lauf: Max Speed", "Letzter Lauf: Max Speed", "Last run: max speed", "Dernier run : vit. max", "Ultimo run: vel. max", "Último run: vel. máx"),
    "field.20" to row("Läufe (Anzahl)", "Läuf (Aazahl)", "Läufe (Anzahl)", "Runs (count)", "Runs (nombre)", "Run (numero)", "Runs (número)"),
)
