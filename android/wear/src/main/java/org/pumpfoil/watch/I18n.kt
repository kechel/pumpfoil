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
        lang = prefs(ctx).getString("lang", "de") ?: "de"
    }

    // Aus der (gecachten) Config gesetzt; persistiert für Offline-Start.
    fun set(ctx: Context, code: String?) {
        val v = if (code != null && LANGS.contains(code)) code else "de"
        lang = v
        prefs(ctx).edit().putString("lang", v).apply()
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
    "pair.gen" to row("Pairing-Code erzeugen", "Pairing-Code erzüge", "Pairing-Code erzeugen", "Generate pairing code", "Générer un code", "Genera codice", "Generar código"),
    "pair.enterOn" to row("Auf pumpfoil.org eingeben:", "Uf pumpfoil.org yygeh:", "Auf pumpfoil.org eingeben:", "Enter on pumpfoil.org:", "Saisir sur pumpfoil.org :", "Inserisci su pumpfoil.org:", "Introduce en pumpfoil.org:"),
    "pair.waiting" to row("warte auf Bestätigung…", "warte uf Bestätigung…", "warte auf Bestätigung…", "waiting for confirmation…", "attente de confirmation…", "attendo conferma…", "esperando confirmación…"),
    "pair.later" to row("Später verbinden", "Spöter verbinde", "Später verbinden", "Connect later", "Connecter plus tard", "Collega più tardi", "Conectar más tarde"),

    // Aufnahme-Screen
    "rec.start" to row("Start", "Start", "Start", "Start", "Démarrer", "Avvia", "Iniciar"),
    "rec.stop" to row("Stop", "Stop", "Stop", "Stop", "Arrêter", "Stop", "Parar"),
    "rec.stopHold" to row("Halten", "Halte", "Halten", "Hold", "Maintenir", "Tieni", "Mantén"),
    "rec.starting" to row("starte…", "start…", "starte…", "starting…", "démarrage…", "avvio…", "iniciando…"),
    "rec.autoStart" to row("Auto-Start aktiv", "Auto-Start aktiv", "Auto-Start aktiv", "Auto-start on", "Démarrage auto", "Avvio auto", "Inicio auto"),
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
    "foil.choose" to row("Alarm wählen", "Alarm wähle", "Alarm wählen", "Choose alarm", "Choisir l'alarme", "Scegli allarme", "Elegir alarma"),
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
