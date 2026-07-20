import Foundation

// On-Device-Lokalisierung des watchOS-Recorders nach Profil-Sprache (vom Server via
// /api/devices/config geliefert, in UserDefaults "appLang" gecacht). Fallback: de.
// Reine Einheiten (km/h, bpm, m) bleiben unlokalisiert.
enum WLoc {
    static func t(_ key: String, _ lang: String) -> String {
        guard let row = table[key] else { return key }
        if let v = row[lang] { return v }
        // Profil-Sprache kann die Uhr nicht (fi/nl/cs/leer) -> NICHT hart Deutsch, sondern die
        // GERÄTE-SYSTEMSPRACHE; sonst Englisch.
        return row[sysLang()] ?? row["en"] ?? row["de"] ?? key
    }

    // Geräte-Systemsprache auf unsere Spalten (de/en/fr/it/es); alles andere -> Englisch.
    static func sysLang() -> String {
        let code = String((Locale.preferredLanguages.first ?? "en").prefix(2))
        return ["de", "en", "fr", "it", "es"].contains(code) ? code : "en"
    }

    private static func r(_ de: String, _ gsw: String, _ deAT: String, _ en: String, _ fr: String, _ it: String, _ es: String) -> [String: String] {
        ["de": de, "gsw": gsw, "de-AT": deAT, "en": en, "fr": fr, "it": it, "es": es]
    }

    private static let table: [String: [String: String]] = [
        // Pairing
        "pair.title": r("Uhr verbinden", "Uhr verbinde", "Uhr verbinden", "Connect watch", "Connecter la montre", "Collega l'orologio", "Conectar reloj"),
        "pair.howto": r("Pairing-Code erzeugen und auf pumpfoil.org (Account) eingeben.", "Pairing-Code erzüge und uf pumpfoil.org (Account) yygeh.", "Pairing-Code erzeugen und auf pumpfoil.org (Account) eingeben.", "Generate a pairing code and enter it on pumpfoil.org (Account).", "Générez un code et saisissez-le sur pumpfoil.org (Compte).", "Genera un codice e inseriscilo su pumpfoil.org (Account).", "Genera un código e introdúcelo en pumpfoil.org (Cuenta)."),
        "pair.gen": r("Pairing-Code erzeugen", "Pairing-Code erzüge", "Pairing-Code erzeugen", "Generate pairing code", "Générer un code", "Genera codice", "Generar código"),
        "pair.enterOn": r("Auf pumpfoil.org eingeben:", "Uf pumpfoil.org yygeh:", "Auf pumpfoil.org eingeben:", "Enter on pumpfoil.org:", "Saisir sur pumpfoil.org :", "Inserisci su pumpfoil.org:", "Introduce en pumpfoil.org:"),
        "pair.waiting": r("warte auf Bestätigung…", "warte uf Bestätigung…", "warte auf Bestätigung…", "waiting for confirmation…", "attente de confirmation…", "attendo conferma…", "esperando confirmación…"),
        "pair.later": r("Später verbinden", "Spöter verbinde", "Später verbinden", "Connect later", "Connecter plus tard", "Collega più tardi", "Conectar más tarde"),

        // Aufnahme-Screen
        "rec.start": r("Start", "Start", "Start", "Start", "Démarrer", "Avvia", "Iniciar"),
        "rec.stop": r("Stop", "Stop", "Stop", "Stop", "Arrêter", "Stop", "Parar"),
        "rec.stopHold": r("Stop · 3 s halten", "Stop · 3 s halte", "Stop · 3 s halten", "Stop · hold 3 s", "Stop · 3 s", "Stop · tieni 3 s", "Stop · mantén 3 s"),
        "rec.starting": r("starte…", "start…", "starte…", "starting…", "démarrage…", "avvio…", "iniciando…"),
        "rec.autoStart": r("Auto-Start aktiv", "Auto-Start aktiv", "Auto-Start aktiv", "Auto-start on", "Démarrage auto", "Avvio auto", "Inicio auto"),
        "rec.autoStartToggle": r("Auto-Start", "Auto-Start", "Auto-Start", "Auto-start", "Démarrage auto", "Avvio automatico", "Inicio automático"),
        "rec.autoStartHelp": r(
            "Startet ab 10 km/h von selbst – falls du's mal vergisst.",
            "Startet ab 10 km/h vo sälber – falls dus mal vergissch.",
            "Startet ab 10 km/h von selbst – falls du's mal vergisst.",
            "Auto-starts at 10 km/h – in case you forget.",
            "Démarre seul dès 10 km/h – si tu oublies.",
            "Parte da solo a 10 km/h – se te ne dimentichi.",
            "Arranca solo a 10 km/h – por si lo olvidas."),
        "rec.recording": r("Aufnahme läuft", "Ufnahm lauft", "Aufnahme läuft", "Recording", "Enregistrement", "Registrazione", "Grabando"),
        "rec.workoutFail": r("Workout-Start fehlgeschlagen: ", "Workout-Start fehlgschlage: ", "Workout-Start fehlgeschlagen: ", "Workout start failed: ", "Échec démarrage workout : ", "Avvio workout fallito: ", "Error al iniciar workout: "),
        "rec.sync": r("Sync…", "Sync…", "Sync…", "Sync…", "Sync…", "Sync…", "Sync…"),
        "rec.notNow": r("Jetzt nicht", "Jetz nöd", "Jetzt nicht", "Not now", "Pas maintenant", "Non ora", "Ahora no"),
        "rec.toData": r("Datenfelder →", "Datefälder →", "Datenfelder →", "Data fields →", "Champs →", "Campi →", "Campos →"),
        "rec.toSummary": r("← Übersicht", "← Übersicht", "← Übersicht", "← Summary", "← Résumé", "← Riepilogo", "← Resumen"),
        "rec.notLinked": r("Nicht verbunden – Sessions lokal", "Nöd verbunde – Sessions lokal", "Nicht verbunden – Sessions lokal", "Not linked – sessions local", "Non lié – sessions en local", "Non collegato – sessioni in locale", "No vinculado – sesiones locales"),
        "rec.connect": r("Verbinden", "Verbinde", "Verbinden", "Connect", "Se connecter", "Connetti", "Conectar"),
        "rec.pendingUpload": r("warten auf Upload", "warte uf Upload", "warten auf Upload", "waiting to upload", "en attente d'envoi", "in attesa di upload", "esperando subida"),
        "rec.uploadNow": r("Jetzt hochladen", "Jetz ueglade", "Jetzt hochladen", "Upload now", "Envoyer maintenant", "Carica ora", "Subir ahora"),
        "rec.waitConn": r("wartet auf Verbindung", "wartet uf Verbindig", "wartet auf Verbindung", "waiting for connection", "attente de connexion", "attesa connessione", "esperando conexión"),
        "rec.willResume": r("wird fortgesetzt", "wird fortgsetzt", "wird fortgesetzt", "will resume", "reprendra", "riprenderà", "se reanudará"),
        "rec.uploading": r("lädt hoch", "ladt ufe", "lädt hoch", "uploading", "envoi", "caricamento", "subiendo"),
        "rec.serverErr": r("Server-Fehler – später erneut", "Server-Fähler – spöter nomal", "Server-Fehler – später erneut", "Server error – retry later", "Erreur serveur – réessai", "Errore server – riprova", "Error de servidor – reintento"),
        "rec.authErr": r("Verbindung ungültig – neu verbinden", "Verbindig ungültig – neu verbinde", "Verbindung ungültig – neu verbinden", "Link invalid – reconnect", "Lien invalide – reconnecter", "Collegamento non valido – ricollega", "Vínculo no válido – reconectar"),
        "rec.repair": r("Neu verbinden", "Neu verbinde", "Neu verbinden", "Reconnect", "Reconnecter", "Ricollega", "Reconectar"),
        "rec.switch": r("Konto wechseln", "Konto wechsle", "Konto wechseln", "Switch account", "Changer de compte", "Cambia account", "Cambiar cuenta"),
        "rec.alarm": r("Alarm", "Alarm", "Alarm", "Alarm", "Alarme", "Allarme", "Alarma"),
        "rec.change": r("ändern", "ändere", "ändern", "change", "modifier", "modifica", "cambiar"),
        "rec.holdProgress": r("halten…", "halte…", "halten…", "hold…", "maintenir…", "tieni…", "mantén…"),

        // Alarm-/Foil-Auswahl
        "foil.choose": r("Foil wählen", "Foil wähle", "Foil wählen", "Choose foil", "Choisir le foil", "Scegli foil", "Elegir foil"),
        "foil.chooseHelp": r(
            "Speichert deinen Foil zu dieser Session und legt die Alarm-Schwellen fest, wenn als Quelle Foil gewählt ist.",
            "Speicheret dis Foil zu dere Session und leit d Alarm-Schwelle fescht, wenn als Quelle Foil gwählt isch.",
            "Speichert deinen Foil zu dieser Session und legt die Alarm-Schwellen fest, wenn als Quelle Foil gewählt ist.",
            "Saves your foil to this session and sets the alarm thresholds when the source is set to Foil.",
            "Enregistre ton foil pour cette session et définit les seuils d'alarme si la source est réglée sur Foil.",
            "Salva il tuo foil in questa sessione e imposta le soglie d'allarme se la sorgente è impostata su Foil.",
            "Guarda tu foil en esta sesión y define los umbrales de alarma si la fuente es Foil."),
        "foil.prefix": r("Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil : ", "Foil: ", "Foil: "),
        "foil.alarm": r("Alarm", "Alarm", "Alarm", "Alarm", "Alarme", "Allarme", "Alarma"),
        "foil.alarmOn": r("Vibrationsalarm", "Vibrationsalarm", "Vibrationsalarm", "Vibration alarm", "Alarme vibrante", "Allarme vibrazione", "Alarma vibración"),
        "foil.alarmHelp": r(
            "Vibriert, wenn du den optimalen Speed-Bereich deines Foils über- oder unterschreitest.",
            "Vibriert, wenn du über oder under em optimale Speed-Bereich vo dim Foil bisch.",
            "Vibriert, wenn du den optimalen Speed-Bereich deines Foils über- oder unterschreitest.",
            "Vibrates when you go above or below your foil's optimal speed range.",
            "Vibre quand tu dépasses ou descends sous la plage de vitesse optimale de ton foil.",
            "Vibra quando superi o scendi sotto l'intervallo di velocità ottimale del tuo foil.",
            "Vibra cuando superas o bajas del rango de velocidad óptimo de tu foil."),
        "foil.thresholds": r("Schwellen", "Schwelle", "Schwellen", "Thresholds", "Seuils", "Soglie", "Umbrales"),
        "foil.source": r("Quelle", "Quelle", "Quelle", "Source", "Source", "Sorgente", "Origen"),
        "foil.auto": r("Auto (Foil)", "Auto (Foil)", "Auto (Foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)"),
        "foil.manual": r("Manuell", "Manuell", "Manuell", "Manual", "Manuel", "Manuale", "Manual"),
        "foil.min": r("Min", "Min", "Min", "Min", "Min", "Min", "Mín"),
        "foil.max": r("Max", "Max", "Max", "Max", "Max", "Max", "Máx"),
        "foil.noFoil": r("Keine Foil", "Kei Foil", "Keine Foil", "No foil", "Aucun foil", "Nessun foil", "Sin foil"),
        "foil.fixed": r("Feste Werte", "Feschti Wärt", "Feste Werte", "Fixed values", "Valeurs fixes", "Valori fissi", "Valores fijos"),
        "foil.none": r("Ohne Foil", "Ohni Foil", "Ohne Foil", "No foil", "Sans foil", "Senza foil", "Sin foil"),
        "foil.noneSub": r("kein Alarm", "kei Alarm", "kein Alarm", "no alarm", "aucune alarme", "nessun allarme", "sin alarma"),
        "foil.trigger": r("Auslösen", "Uslöse", "Auslösen", "Trigger", "Déclenchement", "Attivazione", "Activación"),
        "foil.continuous": r("Dauerhaft", "Dauerhaft", "Dauerhaft", "Continuous", "Continu", "Continuo", "Continuo"),
        "common.cancel": r("Abbrechen", "Abbräche", "Abbrechen", "Cancel", "Annuler", "Annulla", "Cancelar"),

        // Datenfeld-Labels (Wörter lokalisiert, Einheiten universell)
        "f.kmh3s": r("km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)"),
        "f.kmh": r("km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h"),
        "f.kmhAvg": r("Ø km/h", "Ø km/h", "Ø km/h", "avg km/h", "moy km/h", "media km/h", "med km/h"),
        "f.kmhMax": r("max km/h", "max km/h", "max km/h", "max km/h", "max km/h", "max km/h", "máx km/h"),
        "f.bpm": r("bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm"),
        "f.bpmAvg": r("Ø bpm", "Ø bpm", "Ø bpm", "avg bpm", "moy bpm", "media bpm", "med bpm"),
        "f.bpmMax": r("max bpm", "max bpm", "max bpm", "max bpm", "max bpm", "max bpm", "máx bpm"),
        "f.time": r("Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo"),
        "f.clock": r("Uhr", "Uhr", "Uhr", "Clock", "Heure", "Ora", "Hora"),
        "f.alt": r("Höhe", "Höchi", "Höhe", "Altitude", "Altitude", "Altitudine", "Altitud"),
        "f.temp": r("Temp", "Temp", "Temp", "Temp", "Temp", "Temp", "Temp"),
        "f.ascent": r("Aufstieg", "Ufstig", "Aufstieg", "Ascent", "Dénivelé", "Dislivello", "Ascenso"),
        "f.runTime": r("Lauf-Zeit", "Lauf-Ziit", "Lauf-Zeit", "Run time", "Temps run", "Tempo run", "Tiempo run"),
        "f.runDist": r("Lauf-Dist", "Lauf-Dist", "Lauf-Dist", "Run dist", "Dist run", "Dist run", "Dist run"),
        "f.runs": r("Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Runs"),
        "f.lastRunTime": r("letzte Zeit", "letschti Ziit", "letzte Zeit", "last time", "dern. temps", "ult. tempo", "últ. tiempo"),
        "f.lastRunDist": r("letzte Dist", "letschti Dist", "letzte Dist", "last dist", "dern. dist", "ult. dist", "últ. dist"),
        "f.lastRunAvg": r("letzter Ø", "letschte Ø", "letzter Ø", "last avg", "dern. moy", "ult. media", "últ. med"),
        "f.lastRunMax": r("letzter max", "letschte max", "letzter max", "last max", "dern. max", "ult. max", "últ. máx"),
    ]
}
