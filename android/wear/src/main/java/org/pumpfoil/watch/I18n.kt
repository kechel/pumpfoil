package org.pumpfoil.watch

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// On-Device-Lokalisierung des Wear-Recorders nach Profil-Sprache (vom Server via
// /api/devices/config geliefert, in SharedPrefs gecacht). Fallback: de. Reine
// Einheiten (km/h, bpm, m) bleiben unlokalisiert.
object I18n {
    private val LANGS = listOf("de", "gsw", "de-AT", "en", "fr", "it", "es")
    var lang by mutableStateOf("de")
        private set

    fun load(ctx: Context) {
        lang = prefs(ctx).getString("lang", null) ?: systemLang()
    }

    // Aus der (gecachten) Config gesetzt; persistiert für Offline-Start. Kann die Uhr die
    // Profil-Sprache nicht (fi/nl/cs/leer) -> NICHT hart Deutsch, sondern die GERÄTE-SYSTEMSPRACHE.
    fun set(ctx: Context, code: String?) {
        val v = if (code != null && LANGS.contains(code)) code else systemLang()
        lang = v
        prefs(ctx).edit().putString("lang", v).apply()
    }

    // Geräte-Systemsprache auf unsere Spalten (de/en/fr/it/es); alles andere -> Englisch.
    private fun systemLang(): String {
        val sys = java.util.Locale.getDefault().language   // "de","en","fr","it","es","fi",…
        return if (LANGS.contains(sys)) sys else "en"
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)

    fun t(key: String): String {
        val row = S[key] ?: return key
        return row[lang] ?: row["de"] ?: key
    }
}

private fun row(de: String, gsw: String, deAT: String, en: String, fr: String, it: String, es: String) =
    mapOf("de" to de, "gsw" to gsw, "de-AT" to deAT, "en" to en, "fr" to fr, "it" to it, "es" to es)

private val S: Map<String, Map<String, String>> = mapOf(
    // Pairing
    "pair.title" to row("Uhr verbinden", "Uhr verbinde", "Uhr verbinden", "Connect watch", "Connecter la montre", "Collega l'orologio", "Conectar reloj"),
    "pair.howto" to row("Pairing-Code erzeugen und auf pumpfoil.org (Account) eingeben.", "Pairing-Code erzüge und uf pumpfoil.org (Account) yygeh.", "Pairing-Code erzeugen und auf pumpfoil.org (Account) eingeben.", "Generate a pairing code and enter it on pumpfoil.org (Account).", "Générez un code et saisissez-le sur pumpfoil.org (Compte).", "Genera un codice e inseriscilo su pumpfoil.org (Account).", "Genera un código e introdúcelo en pumpfoil.org (Cuenta)."),
    "pair.gen" to row("Code erzeugen", "Code erzüge", "Code erzeugen", "Generate code", "Générer un code", "Genera codice", "Generar código"),
    "pair.enterOn" to row("Auf pumpfoil.org eingeben:", "Uf pumpfoil.org yygeh:", "Auf pumpfoil.org eingeben:", "Enter on pumpfoil.org:", "Saisir sur pumpfoil.org :", "Inserisci su pumpfoil.org:", "Introduce en pumpfoil.org:"),
    "pair.waiting" to row("warte auf Bestätigung…", "warte uf Bestätigung…", "warte auf Bestätigung…", "waiting for confirmation…", "attente de confirmation…", "attendo conferma…", "esperando confirmación…"),
    "pair.later" to row("Abbrechen", "Abbräche", "Abbrechen", "Cancel", "Annuler", "Annulla", "Cancelar"),

    // Aufnahme-Screen
    "rec.start" to row("Start", "Start", "Start", "Start", "Démarrer", "Avvia", "Iniciar"),
    "rec.stop" to row("Stop", "Stop", "Stop", "Stop", "Arrêter", "Stop", "Parar"),
    "rec.stopHold" to row("Halten", "Halte", "Halten", "Hold", "Maintenir", "Tieni", "Mantén"),
    "rec.starting" to row("starte…", "start…", "starte…", "starting…", "démarrage…", "avvio…", "iniciando…"),
    "rec.autoStart" to row("Auto-Start aktiv", "Auto-Start aktiv", "Auto-Start aktiv", "Auto-start on", "Démarrage auto", "Avvio auto", "Inicio auto"),
    "rec.autoStartIn" to row("Auto-Start in", "Auto-Start in", "Auto-Start in", "Auto-start in", "Démarrage auto dans", "Avvio auto tra", "Inicio auto en"),
    "rec.autoStartToggle" to row("Auto-Start", "Auto-Start", "Auto-Start", "Auto-start", "Démarrage auto", "Avvio automatico", "Inicio automático"),
    "rec.autoStartHelp" to row(
        "Startet ab 10 km/h von selbst – falls du's mal vergisst.",
        "Startet ab 10 km/h vo sälber – falls dus mal vergissch.",
        "Startet ab 10 km/h von selbst – falls du's mal vergisst.",
        "Auto-starts at 10 km/h – in case you forget.",
        "Démarre seul dès 10 km/h – si tu oublies.",
        "Parte da solo a 10 km/h – se te ne dimentichi.",
        "Arranca solo a 10 km/h – por si lo olvidas."),
    "rec.sync" to row("Sync…", "Sync…", "Sync…", "Sync…", "Sync…", "Sync…", "Sync…"),
    "rec.notNow" to row("Jetzt nicht", "Jetz nöd", "Jetzt nicht", "Not now", "Pas maintenant", "Non ora", "Ahora no"),
    "rec.toData" to row("Datenfelder →", "Datefälder →", "Datenfelder →", "Data fields →", "Champs →", "Campi →", "Campos →"),
    "rec.toSummary" to row("← Übersicht", "← Übersicht", "← Übersicht", "← Summary", "← Résumé", "← Riepilogo", "← Resumen"),
    "rec.notLinked" to row("Nicht verbunden – Sessions lokal", "Nöd verbunde – Sessions lokal", "Nicht verbunden – Sessions lokal", "Not linked – sessions local", "Non lié – sessions en local", "Non collegato – sessioni in locale", "No vinculado – sesiones locales"),
    "rec.connect" to row("Verbinden", "Verbinde", "Verbinden", "Connect", "Se connecter", "Connetti", "Conectar"),
    "rec.pendingUpload" to row("warten auf Upload", "warte uf Upload", "warten auf Upload", "waiting to upload", "en attente d'envoi", "in attesa di upload", "esperando subida"),
    "rec.uploadNow" to row("Jetzt hochladen", "Jetz ueglade", "Jetzt hochladen", "Upload now", "Envoyer maintenant", "Carica ora", "Subir ahora"),
    "rec.chooseFoil" to row("Foil wählen", "Foil wähle", "Foil wählen", "Choose foil", "Choisir foil", "Scegli foil", "Elegir foil"),
    "rec.syncNow" to row("Sync", "Sync", "Sync", "Sync", "Sync", "Sync", "Sync"),
    "foil.website" to row("Feste Werte", "Feschti Wärt", "Feste Werte", "Fixed values", "Valeurs fixes", "Valori fissi", "Valores fijos"),
    "rec.waitConn" to row("wartet auf Verbindung", "wartet uf Verbindig", "wartet auf Verbindung", "waiting for connection", "attente de connexion", "attesa connessione", "esperando conexión"),
    "rec.willResume" to row("wird fortgesetzt", "wird fortgsetzt", "wird fortgesetzt", "will resume", "reprendra", "riprenderà", "se reanudará"),
    "rec.uploading" to row("lädt hoch", "ladt ufe", "lädt hoch", "uploading", "envoi", "caricamento", "subiendo"),
    "rec.serverErr" to row("Server-Fehler – später erneut", "Server-Fähler – spöter nomal", "Server-Fehler – später erneut", "Server error – retry later", "Erreur serveur – réessai", "Errore server – riprova", "Error de servidor – reintento"),
    "rec.authErr" to row("Verbindung ungültig – neu verbinden", "Verbindig ungültig – neu verbinde", "Verbindung ungültig – neu verbinden", "Link invalid – reconnect", "Lien invalide – reconnecter", "Collegamento non valido – ricollega", "Vínculo no válido – reconectar"),
    "rec.repair" to row("Neu verbinden", "Neu verbinde", "Neu verbinden", "Reconnect", "Reconnecter", "Ricollega", "Reconectar"),
    "rec.switch" to row("Konto wechseln", "Konto wechsle", "Konto wechseln", "Switch account", "Changer de compte", "Cambia account", "Cambiar cuenta"),

    // Alarm-/Foil-Auswahl
    "foil.choose" to row("Foil & Alarm", "Foil & Alarm", "Foil & Alarm", "Foil & alarm", "Foil & alarme", "Foil & allarme", "Foil & alarma"),
    "foil.prefix" to row("Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil : ", "Foil: ", "Foil: "),
    "foil.alarm" to row("Alarm", "Alarm", "Alarm", "Alarm", "Alarme", "Allarme", "Alarma"),
    "foil.alarmHelp" to row(
        "Vibriert, wenn du den optimalen Speed-Bereich deines Foils über- oder unterschreitest.",
        "Vibriert, wenn du über oder under em optimale Speed-Bereich vo dim Foil bisch.",
        "Vibriert, wenn du den optimalen Speed-Bereich deines Foils über- oder unterschreitest.",
        "Vibrates when you go above or below your foil's optimal speed range.",
        "Vibre quand tu dépasses ou descends sous la plage de vitesse optimale de ton foil.",
        "Vibra quando superi o scendi sotto l'intervallo di velocità ottimale del tuo foil.",
        "Vibra cuando superas o bajas del rango de velocidad óptimo de tu foil."),
    "foil.chooseHelp" to row(
        "Speichert deinen Foil zu dieser Session und legt die Alarm-Schwellen fest, wenn als Quelle Foil gewählt ist.",
        "Speicheret dis Foil zu dere Session und leit d Alarm-Schwelle fescht, wenn als Quelle Foil gwählt isch.",
        "Speichert deinen Foil zu dieser Session und legt die Alarm-Schwellen fest, wenn als Quelle Foil gewählt ist.",
        "Saves your foil to this session and sets the alarm thresholds when the source is set to Foil.",
        "Enregistre ton foil pour cette session et définit les seuils d'alarme si la source est réglée sur Foil.",
        "Salva il tuo foil in questa sessione e imposta le soglie d'allarme se la sorgente è impostata su Foil.",
        "Guarda tu foil en esta sesión y define los umbrales de alarma si la fuente es Foil."),
    "foil.thresholds" to row("Schwellen", "Schwelle", "Schwellen", "Thresholds", "Seuils", "Soglie", "Umbrales"),
    "foil.auto" to row("Auto (Foil)", "Auto (Foil)", "Auto (Foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)"),
    "foil.manual" to row("Manuell", "Manuell", "Manuell", "Manual", "Manuel", "Manuale", "Manual"),
    "foil.min" to row("Min", "Min", "Min", "Min", "Min", "Min", "Mín"),
    "foil.max" to row("Max", "Max", "Max", "Max", "Max", "Max", "Máx"),
    "foil.noFoil" to row("Keine Foil", "Kei Foil", "Keine Foil", "No foil", "Aucun foil", "Nessun foil", "Sin foil"),
    "common.on" to row("An", "Aa", "An", "On", "Activé", "On", "Sí"),
    "common.off" to row("Aus", "Us", "Aus", "Off", "Désactivé", "Off", "No"),
    "common.done" to row("Fertig", "Fertig", "Fertig", "Done", "Terminé", "Fatto", "Listo"),
    "saved.title" to row("Gespeichert", "Gspycheret", "Gespeichert", "Saved", "Enregistré", "Salvato", "Guardado"),
    "saved.upload" to row("Upload bei WLAN/Telefon", "Upload bi WLAN/Telefon", "Upload bei WLAN/Telefon", "Upload via Wi-Fi/phone", "Envoi via Wi-Fi/tél.", "Upload via Wi-Fi/telefono", "Subida por Wi-Fi/teléfono"),
    "saved.uploadDone" to row("Upload fertig", "Upload fertig", "Upload fertig", "Upload done", "Upload terminé", "Upload completato", "Subida lista"),
    "saved.uploading" to row("lädt hoch…", "ladt ufe…", "lädt hoch…", "uploading…", "envoi…", "caricamento…", "subiendo…"),
    "foil.fixed" to row("Feste Werte", "Feschti Wärt", "Feste Werte", "Fixed values", "Valeurs fixes", "Valori fissi", "Valores fijos"),
    "foil.none" to row("Ohne Alarm", "Ohni Alarm", "Ohne Alarm", "No alarm", "Sans alarme", "Senza allarme", "Sin alarma"),
    "foil.triggerPrefix" to row("Auslösen: ", "Uslöse: ", "Auslösen: ", "Trigger: ", "Déclench. : ", "Attivazione: ", "Activación: "),
    "foil.continuous" to row("dauerhaft", "dauerhaft", "dauerhaft", "continuous", "continu", "continuo", "continuo"),
    "foil.once" to row("einmalig", "eimal", "einmalig", "once", "une fois", "una volta", "una vez"),

    "common.back" to row("Zurück", "Zrugg", "Zurück", "Back", "Retour", "Indietro", "Atrás"),
    "common.error" to row("Fehler", "Fähler", "Fehler", "Error", "Erreur", "Errore", "Error"),

    // Datenfeld-Labels (Wörter lokalisiert, Einheiten universell)
    "f.kmh3s" to row("km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)"),
    "f.kmh" to row("km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h"),
    "f.kmhAvg" to row("Ø km/h", "Ø km/h", "Ø km/h", "avg km/h", "moy km/h", "media km/h", "med km/h"),
    "f.kmhMax" to row("max km/h", "max km/h", "max km/h", "max km/h", "max km/h", "max km/h", "máx km/h"),
    "f.bpm" to row("bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm"),
    "f.bpmAvg" to row("Ø bpm", "Ø bpm", "Ø bpm", "avg bpm", "moy bpm", "media bpm", "med bpm"),
    "f.bpmMax" to row("max bpm", "max bpm", "max bpm", "max bpm", "max bpm", "max bpm", "máx bpm"),
    "f.time" to row("Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo"),
    "f.clock" to row("Uhr", "Uhr", "Uhr", "Clock", "Heure", "Ora", "Hora"),
    // Höhe / Temperatur / Aufstieg
    "f.alt" to row("Höhe", "Höchi", "Höhe", "Altitude", "Altitude", "Altitudine", "Altitud"),
    "f.temp" to row("Temp", "Temp", "Temp", "Temp", "Temp", "Temp", "Temp"),
    "f.ascent" to row("Aufstieg", "Ufstig", "Aufstieg", "Ascent", "Dénivelé", "Dislivello", "Ascenso"),
    // Lauf-Felder (aktueller Lauf)
    "f.runTime" to row("Lauf-Zeit", "Lauf-Ziit", "Lauf-Zeit", "Run time", "Temps run", "Tempo run", "Tiempo run"),
    "f.runDist" to row("Lauf-Dist", "Lauf-Dist", "Lauf-Dist", "Run dist", "Dist run", "Dist run", "Dist run"),
    "f.runs" to row("Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Runs"),
    // Lauf-Felder (letzter Lauf)
    "f.lastRunTime" to row("letzte Zeit", "letschti Ziit", "letzte Zeit", "last time", "dern. temps", "ult. tempo", "últ. tiempo"),
    "f.lastRunDist" to row("letzte Dist", "letschti Dist", "letzte Dist", "last dist", "dern. dist", "ult. dist", "últ. dist"),
    "f.lastRunAvg" to row("letzter Ø", "letschte Ø", "letzter Ø", "last avg", "dern. moy", "ult. media", "últ. med"),
    "f.lastRunMax" to row("letzter max", "letschte max", "letzter max", "last max", "dern. max", "ult. max", "últ. máx"),
)
