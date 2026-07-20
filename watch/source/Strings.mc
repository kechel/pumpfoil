using Toybox.Lang;
using Toybox.System;

// On-Device-Lokalisierung des Garmin-Recorders nach Profil-Sprache (vom Server
// via /api/devices/config geliefert, in Storage "lang" gecacht). Fallback: de.
// Reine Einheiten (km/h, bpm, °C, m) bleiben unlokalisiert; nur Wörter werden übersetzt.
module Strings {

    // Sprachreihenfolge der Tabellen-Spalten.
    // 0 de | 1 gsw | 2 de-AT | 3 en | 4 fr | 5 it | 6 es
    var _idx = 0;

    // Profil-Sprache setzen. Kann die Uhr die Sprache direkt (7 Spalten) -> nehmen. Sonst
    // (fi/nl/cs oder leer/unbekannt) NICHT hart auf Deutsch, sondern auf die GERÄTE-SYSTEMSPRACHE
    // ausweichen (Wunsch: englische Uhr = englische App). Letzter Fallback: Englisch.
    function setLang(code as Lang.String or Null) as Void {
        var i = _idxForCode(code);
        _idx = (i >= 0) ? i : _systemIdx();
    }

    // Index unserer 7 Uhr-Spalten für einen Sprachcode, -1 wenn nicht direkt unterstützt.
    function _idxForCode(code as Lang.String or Null) as Lang.Number {
        if (code == null) { return -1; }
        if (code.equals("de")) { return 0; }
        if (code.equals("gsw")) { return 1; }
        if (code.equals("de-AT")) { return 2; }
        if (code.equals("en")) { return 3; }
        if (code.equals("fr")) { return 4; }
        if (code.equals("it")) { return 5; }
        if (code.equals("es")) { return 6; }
        return -1;
    }

    // Geräte-Systemsprache -> unsere Spalte (nur die, die wir haben; sonst Englisch).
    function _systemIdx() as Lang.Number {
        var sl = System.getDeviceSettings().systemLanguage;
        if (sl == System.LANGUAGE_DEU) { return 0; }   // Deutsch
        if (sl == System.LANGUAGE_ENG) { return 3; }   // Englisch
        if (sl == System.LANGUAGE_FRE) { return 4; }   // Französisch
        if (sl == System.LANGUAGE_ITA) { return 5; }   // Italienisch
        if (sl == System.LANGUAGE_SPA) { return 6; }   // Spanisch
        return 3;   // alles andere (fi/nl/cs/…): neutraler Fallback Englisch
    }

    // Lokalisierten String holen (Fallback: de-Spalte, dann der Key selbst).
    function s(key as Lang.String) as Lang.String {
        var row = _table()[key];
        if (row == null) { return key; }
        var v = row[_idx];
        if (v == null || v.equals("")) { v = row[0]; }
        return v;
    }

    // Tabelle LAZY in einer Funktion bauen und cachen — NICHT als const-Dictionary auf
    // Modulebene: das löste auf der Uhr einen Initialisierungs-Crash („IQ!" beim Start) aus.
    var _T = null;

    function _table() {
        if (_T != null) { return _T; }
        _T = {
        // Start-/GPS-/Stop-Screen
        "gps.ready"      => ["GPS bereit", "GPS bereit", "GPS bereit", "GPS ready", "GPS prêt", "GPS pronto", "GPS listo"],
        "upd.store"      => ["Update im Store", "Update im Store", "Update im Store", "Update in store", "Màj dispo", "Aggiornamento", "Actualización"],
        "auto.short"     => ["Auto-Start", "Auto-Start", "Auto-Start", "auto-start", "auto-départ", "avvio auto", "inicio auto"],
        "gps.searching"  => ["GPS suchen…", "GPS sueche…", "GPS suchen…", "GPS searching…", "Recherche GPS…", "Ricerca GPS…", "Buscando GPS…"],
        "gps.searchBig"  => ["GPS wird gesucht", "GPS wird gsuecht", "GPS wird gesucht", "Searching GPS", "Recherche GPS", "Ricerca GPS", "Buscando GPS"],
        "gps.sky"        => ["bitte freien Himmel", "bitte freie Himmel", "bitte freien Himmel", "please open sky", "ciel dégagé svp", "cielo libero", "cielo despejado"],
        "start.rec"      => ["START: Aufnahme", "START: Ufnahm", "START: Aufnahme", "START: record", "START : enreg.", "START: registra", "START: grabar"],
        "start.chooseAlarm" => ["DOWN: Foil & Alarm", "DOWN: Foil & Alarm", "DOWN: Foil & Alarm", "DOWN: Foil & alarm", "DOWN: Foil & alarme", "DOWN: Foil & allarme", "DOWN: Foil & alarma"],
        "start.menu"     => ["MENU: Einstellungen", "MENU: Yystellige", "MENU: Einstellungen", "MENU: settings", "MENU : réglages", "MENU: impostazioni", "MENU: ajustes"],
        "alarm.prefix"   => ["Alarm: ", "Alarm: ", "Alarm: ", "Alarm: ", "Alarme : ", "Allarme: ", "Alarma: "],
        "foil.prefix"    => ["Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil : ", "Foil: ", "Foil: "],
        "alarm.off"      => ["aus", "us", "aus", "off", "off", "off", "off"],
        "err.storageFull" => ["Speicher voll – App neu installieren", "Spycher voll – App neu installiere", "Speicher voll – App neu installieren", "Storage full – reinstall app", "Mémoire pleine – réinstaller l'app", "Memoria piena – reinstalla l'app", "Memoria llena – reinstala la app"],
        "saved.title"    => ["Gespeichert", "Gspycheret", "Gespeichert", "Saved", "Enregistré", "Salvato", "Guardado"],
        "saved.upload"   => ["Upload bei WLAN/Telefon", "Upload bi WLAN/Telefon", "Upload bei WLAN/Telefon", "Upload via Wi-Fi/phone", "Envoi via Wi-Fi/tél.", "Upload via Wi-Fi/telefono", "Subida por Wi-Fi/teléfono"],
        "saved.newRec"   => ["START = neue Aufnahme", "START = nöji Ufnahm", "START = neue Aufnahme", "START = new recording", "START = nouvel enreg.", "START = nuova registr.", "START = nueva grabación"],
        "rec.stopping"   => ["Stoppen…", "Stoppe…", "Stoppen…", "Stopping…", "Arrêt…", "Arresto…", "Parando…"],

        // Datenfeld-Labels (Wörter lokalisiert, Einheiten universell)
        "f.kmh3s"   => ["km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)"],
        "f.bpm"     => ["bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm"],
        "f.time"    => ["Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo"],
        "f.kmh"     => ["km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h"],
        "f.kmhAvg"  => ["km/h Ø", "km/h Ø", "km/h Ø", "km/h avg", "km/h moy", "km/h media", "km/h med"],
        "f.kmhMax"  => ["km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h máx"],
        "f.bpmAvg"  => ["bpm Ø", "bpm Ø", "bpm Ø", "bpm avg", "bpm moy", "bpm media", "bpm med"],
        "f.bpmMax"  => ["bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm máx"],
        "f.mAlt"    => ["m Höhe", "m Höchi", "m Höhe", "m alt", "m alt", "m alt", "m alt"],
        "f.mAsc"    => ["m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑"],
        "f.degC"    => ["°C", "°C", "°C", "°C", "°C", "°C", "°C"],
        "f.clock"   => ["Uhr", "Uhr", "Uhr", "Clock", "Heure", "Ora", "Hora"],
        "f.runActive" => ["Lauf läuft", "Lauf lauft", "Lauf läuft", "run active", "run actif", "run attivo", "run activo"],
        "f.run"     => ["Lauf", "Lauf", "Lauf", "Run", "Run", "Run", "Tramo"],
        "f.lastRun" => ["letzter Lauf", "letschte Lauf", "letzter Lauf", "last run", "dernier run", "ultimo run", "último tramo"],
        "f.last"    => ["letzter", "letschte", "letzter", "last", "dernier", "ultimo", "último"],
        "f.kmhAvgLast" => ["km/h Ø letzt.", "km/h Ø letscht.", "km/h Ø letzt.", "km/h avg last", "km/h moy dern.", "km/h media ult.", "km/h med últ."],
        "f.kmhMaxLast" => ["km/h max letzt.", "km/h max letscht.", "km/h max letzt.", "km/h max last", "km/h max dern.", "km/h max ult.", "km/h máx últ."],
        "f.runs"    => ["Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Tramos"],

        // Einstellungs-Menü
        "menu.connected"   => ["Verbunden", "Verbunde", "Verbunden", "Connected", "Connecté", "Connesso", "Conectado"],
        "menu.connect"     => ["Verbinden", "Verbinde", "Verbinden", "Connect", "Se connecter", "Connetti", "Conectar"],
        "menu.linked"      => ["Konto verknüpft", "Konto verchnüpft", "Konto verknüpft", "Account linked", "Compte lié", "Account collegato", "Cuenta vinculada"],
        "menu.genCode"     => ["Pairing-Code erzeugen", "Pairing-Code erzüge", "Pairing-Code erzeugen", "Generate pairing code", "Générer un code", "Genera codice", "Generar código"],
        "pair.repairHint"  => ["ENTER: neu verbinden", "ENTER: nöi verbinde", "ENTER: neu verbinden", "ENTER: re-pair", "ENTER : reconnecter", "ENTER: ricollega", "ENTER: reconectar"],
        "menu.upload"      => ["Upload / Sync", "Upload / Sync", "Upload / Sync", "Upload / Sync", "Envoi / Sync", "Upload / Sync", "Subir / Sync"],
        "menu.uploadSub"   => ["ausstehende Sessions", "offeni Sessions", "ausstehende Sessions", "pending sessions", "sessions en attente", "sessioni in sospeso", "sesiones pendientes"],

        // Upload-Ansicht
        "up.connected"  => ["Telefon verbunden", "Telefon verbunde", "Telefon verbunden", "Phone connected", "Téléphone connecté", "Telefono connesso", "Teléfono conectado"],
        "up.noPhone"    => ["Kein Telefon", "Kei Telefon", "Kein Telefon", "No phone", "Pas de téléphone", "Nessun telefono", "Sin teléfono"],
        "up.nothing"    => ["Nichts offen", "Nüt offe", "Nichts offen", "Nothing pending", "Rien en attente", "Niente in sospeso", "Nada pendiente"],
        "up.allDone"    => ["alles hochgeladen", "alles ueglade", "alles hochgeladen", "all uploaded", "tout envoyé", "tutto caricato", "todo subido"],
        "up.running"    => ["Upload läuft…", "Upload lauft…", "Upload läuft…", "Uploading…", "Envoi…", "Caricamento…", "Subiendo…"],
        "up.open"       => ["offen", "offe", "offen", "pending", "en attente", "in sospeso", "pendientes"],
        "up.waitConn"   => ["Wartet auf Verbindung", "Wartet uf Verbindig", "Wartet auf Verbindung", "Waiting for connection", "Attente de connexion", "Attesa connessione", "Esperando conexión"],
        "up.willResume" => ["wird fortgesetzt", "wird fortgsetzt", "wird fortgesetzt", "will resume", "reprendra", "riprenderà", "se reanudará"],
        "up.serverErr"  => ["Server-Fehler", "Server-Fähler", "Server-Fehler", "Server error", "Erreur serveur", "Errore server", "Error de servidor"],
        "up.serverUnreach" => ["Server nicht erreichbar", "Server nöd erreichbar", "Server nicht erreichbar", "Server unreachable", "Serveur injoignable", "Server irraggiungibile", "Servidor no disponible"],
        "up.retryIn"    => ["Neuer Versuch in", "Neue Versuech i", "Neuer Versuch in", "Retry in", "Nouvel essai dans", "Nuovo tentativo tra", "Reintento en"],
        "up.later"      => ["später erneut", "spöter nomal", "später erneut", "retry later", "réessai plus tard", "riprova più tardi", "reintento más tarde"],
        "up.notLinked"  => ["Nicht verbunden", "Nöd verbunde", "Nicht verbunden", "Not linked", "Non lié", "Non collegato", "No vinculado"],
        "up.pairAction" => ["START: Code erzeugen", "START: Code erzüge", "START: Code erzeugen", "START: get code", "START : générer le code", "START: genera codice", "START: generar código"],
        "up.linkHint"   => ["oder MENU → Verbinden", "oder MENU → Verbinde", "oder MENU → Verbinden", "or MENU → Connect", "ou MENU → Connecter", "o MENU → Collega", "o MENU → Conectar"],
        "up.waiting"    => ["Warte…", "Warte…", "Warte…", "Waiting…", "Attente…", "Attendo…", "Esperando…"],
        "up.done"       => ["Upload fertig", "Upload fertig", "Upload fertig", "Upload done", "Upload terminé", "Upload completato", "Subida lista"]
        };
        return _T;
    }
}
