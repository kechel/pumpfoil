using Toybox.Lang;
using Toybox.System;

// On-Device-Lokalisierung des Garmin-Recorders nach Profil-Sprache (vom Server
// via /api/devices/config geliefert, in Storage "lang" gecacht).
// SPRACH-FALLBACK (setLang): unbekannte/nicht direkt unterstützte Sprache -> GERÄTE-
// SYSTEMSPRACHE, sonst Englisch (NICHT hart Deutsch). Nur der Pro-STRING-Fallback in s()
// greift auf die de-Spalte zurück, weil die als Quelle immer vollständig gefüllt ist.
// Reine Einheiten (km/h, bpm, °C, m) bleiben unlokalisiert; nur Wörter werden übersetzt.
// Hinweis: ja/zh sind NICHT dabei — die Built-in-Fonts der fēnix/Forerunner haben keine
// CJK-Glyphen (würde Tofu-Boxen zeigen). pt/id (Latein) + ru (Kyrillisch, in den meisten
// Built-in-Fonts vorhanden) sind dagegen darstellbar. nl/fi/cs (Latein) FEHLEN noch als
// Spalten -> solche Profile bekommen aktuell System-/Englisch (offen: docs/TODO.md).
module Strings {

    // Sprachreihenfolge der Tabellen-Spalten.
    // 0 de | 1 gsw | 2 de-AT | 3 en | 4 fr | 5 it | 6 es | 7 pt | 8 id | 9 ru
    var _idx = 0;

    // Profil-Sprache setzen. Kann die Uhr die Sprache direkt (10 Spalten) -> nehmen. Sonst
    // (fi/nl/cs/ja/zh oder leer/unbekannt) NICHT hart auf Deutsch, sondern auf die GERÄTE-
    // SYSTEMSPRACHE ausweichen (Wunsch: englische Uhr = englische App). Letzter Fallback: Englisch.
    function setLang(code as Lang.String or Null) as Void {
        var i = _idxForCode(code);
        _idx = (i >= 0) ? i : _systemIdx();
    }

    // Index unserer Uhr-Spalten für einen Sprachcode, -1 wenn nicht direkt unterstützt.
    function _idxForCode(code as Lang.String or Null) as Lang.Number {
        if (code == null) { return -1; }
        if (code.equals("de")) { return 0; }
        if (code.equals("gsw")) { return 1; }
        if (code.equals("de-AT")) { return 2; }
        if (code.equals("en")) { return 3; }
        if (code.equals("fr")) { return 4; }
        if (code.equals("it")) { return 5; }
        if (code.equals("es")) { return 6; }
        if (code.equals("pt")) { return 7; }
        if (code.equals("id")) { return 8; }
        if (code.equals("ru")) { return 9; }
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
        if (sl == System.LANGUAGE_POR) { return 7; }   // Portugiesisch
        if (sl == System.LANGUAGE_IND) { return 8; }   // Indonesisch
        if (sl == System.LANGUAGE_RUS) { return 9; }   // Russisch
        return 3;   // alles andere (fi/nl/cs/ja/zh/…): neutraler Fallback Englisch
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
        "gps.ready"      => ["GPS bereit", "GPS bereit", "GPS bereit", "GPS ready", "GPS prêt", "GPS pronto", "GPS listo", "GPS pronto", "GPS siap", "GPS готов"],
        "upd.store"      => ["Update im Store", "Update im Store", "Update im Store", "Update in store", "Màj dispo", "Aggiornamento", "Actualización", "Atualização na loja", "Pembaruan di store", "Обновление в сторе"],
        "auto.short"     => ["Auto-Start", "Auto-Start", "Auto-Start", "auto-start", "auto-départ", "avvio auto", "inicio auto", "início auto", "mulai-otom", "автостарт"],
        "gps.searching"  => ["GPS suchen…", "GPS sueche…", "GPS suchen…", "GPS searching…", "Recherche GPS…", "Ricerca GPS…", "Buscando GPS…", "Buscando GPS…", "Mencari GPS…", "Поиск GPS…"],
        "gps.searchBig"  => ["GPS wird gesucht", "GPS wird gsuecht", "GPS wird gesucht", "Searching GPS", "Recherche GPS", "Ricerca GPS", "Buscando GPS", "Buscando GPS", "Mencari GPS", "Поиск GPS"],
        "gps.sky"        => ["bitte freien Himmel", "bitte freie Himmel", "bitte freien Himmel", "please open sky", "ciel dégagé svp", "cielo libero", "cielo despejado", "céu aberto, por favor", "langit terbuka", "нужно открытое небо"],
        "start.rec"      => ["START: Aufnahme", "START: Ufnahm", "START: Aufnahme", "START: record", "START : enreg.", "START: registra", "START: grabar", "START: gravar", "START: rekam", "START: запись"],
        "start.chooseAlarm" => ["DOWN: Foil & Alarm", "DOWN: Foil & Alarm", "DOWN: Foil & Alarm", "DOWN: Foil & alarm", "DOWN: Foil & alarme", "DOWN: Foil & allarme", "DOWN: Foil & alarma", "DOWN: Foil & alarme", "DOWN: Foil & alarm", "DOWN: Foil и сигнал"],
        "start.menu"     => ["MENU: Einstellungen", "MENU: Yystellige", "MENU: Einstellungen", "MENU: settings", "MENU : réglages", "MENU: impostazioni", "MENU: ajustes", "MENU: ajustes", "MENU: setelan", "MENU: настройки"],
        "alarm.prefix"   => ["Alarm: ", "Alarm: ", "Alarm: ", "Alarm: ", "Alarme : ", "Allarme: ", "Alarma: ", "Alarme: ", "Alarm: ", "Сигнал: "],
        "foil.prefix"    => ["Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil : ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil: "],
        "alarm.off"      => ["aus", "us", "aus", "off", "off", "off", "off", "off", "mati", "выкл"],
        "err.storageFull" => ["Speicher voll – App neu installieren", "Spycher voll – App neu installiere", "Speicher voll – App neu installieren", "Storage full – reinstall app", "Mémoire pleine – réinstaller l'app", "Memoria piena – reinstalla l'app", "Memoria llena – reinstala la app", "Memória cheia – reinstale o app", "Memori penuh – instal ulang app", "Память заполнена – переустановите"],
        "saved.title"    => ["Gespeichert", "Gspycheret", "Gespeichert", "Saved", "Enregistré", "Salvato", "Guardado", "Salvo", "Tersimpan", "Сохранено"],
        "saved.upload"   => ["Upload bei WLAN/Telefon", "Upload bi WLAN/Telefon", "Upload bei WLAN/Telefon", "Upload via Wi-Fi/phone", "Envoi via Wi-Fi/tél.", "Upload via Wi-Fi/telefono", "Subida por Wi-Fi/teléfono", "Envio via Wi-Fi/telefone", "Unggah via Wi-Fi/HP", "Загрузка по Wi-Fi/телефону"],
        "saved.newRec"   => ["START = neue Aufnahme", "START = nöji Ufnahm", "START = neue Aufnahme", "START = new recording", "START = nouvel enreg.", "START = nuova registr.", "START = nueva grabación", "START = nova gravação", "START = rekaman baru", "START = новая запись"],
        "rec.stopping"   => ["Stoppen…", "Stoppe…", "Stoppen…", "Stopping…", "Arrêt…", "Arresto…", "Parando…", "Parando…", "Menghentikan…", "Остановка…"],
        "rec.saveRelease" => ["Loslassen: Speichern", "Loslah: Speichere", "Loslassen: Speichern", "Release: Save", "Relâcher : Enreg.", "Rilascia: Salva", "Soltar: Guardar", "Soltar: Salvar", "Lepas: Simpan", "Отпустить: сохранить"],
        "rec.discardHold" => ["Halten: Verwerfen", "Halte: Verwerfe", "Halten: Verwerfen", "Hold: Discard", "Maintenir : Suppr.", "Tieni: Scarta", "Mantener: Descartar", "Segurar: Descartar", "Tahan: Buang", "Удерживать: сброс"],

        // Datenfeld-Labels (Wörter lokalisiert, Einheiten universell)
        "f.kmh3s"   => ["km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)"],
        "f.bpm"     => ["bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm"],
        "f.time"    => ["Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo", "Tempo", "Waktu", "Время"],
        "f.kmh"     => ["km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h"],
        "f.kmhAvg"  => ["km/h Ø", "km/h Ø", "km/h Ø", "km/h avg", "km/h moy", "km/h media", "km/h med", "km/h méd", "km/h rata", "km/h ср"],
        "f.kmhMax"  => ["km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h máx", "km/h máx", "km/h maks", "km/h макс"],
        "f.bpmAvg"  => ["bpm Ø", "bpm Ø", "bpm Ø", "bpm avg", "bpm moy", "bpm media", "bpm med", "bpm méd", "bpm rata", "bpm ср"],
        "f.bpmMax"  => ["bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm máx", "bpm máx", "bpm maks", "bpm макс"],
        "f.mAlt"    => ["m Höhe", "m Höchi", "m Höhe", "m alt", "m alt", "m alt", "m alt", "m alt", "m ket", "m выс"],
        "f.mAsc"    => ["m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑"],
        "f.degC"    => ["°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C"],
        "f.clock"   => ["Uhr", "Uhr", "Uhr", "Clock", "Heure", "Ora", "Hora", "Hora", "Jam", "Часы"],
        "f.runActive" => ["Lauf läuft", "Lauf lauft", "Lauf läuft", "run active", "run actif", "run attivo", "run activo", "run ativo", "run aktif", "заезд идёт"],
        "f.run"     => ["Lauf", "Lauf", "Lauf", "Run", "Run", "Run", "Tramo", "Run", "Run", "Заезд"],
        "f.lastRun" => ["letzter Lauf", "letschte Lauf", "letzter Lauf", "last run", "dernier run", "ultimo run", "último tramo", "último run", "run terakhir", "посл. заезд"],
        "f.last"    => ["letzter", "letschte", "letzter", "last", "dernier", "ultimo", "último", "último", "terakhir", "посл."],
        "f.kmhAvgLast" => ["km/h Ø letzt.", "km/h Ø letscht.", "km/h Ø letzt.", "km/h avg last", "km/h moy dern.", "km/h media ult.", "km/h med últ.", "km/h méd últ.", "km/h rata akhir", "km/h ср посл."],
        "f.kmhMaxLast" => ["km/h max letzt.", "km/h max letscht.", "km/h max letzt.", "km/h max last", "km/h max dern.", "km/h max ult.", "km/h máx últ.", "km/h máx últ.", "km/h maks akhir", "km/h макс посл."],
        "f.runs"    => ["Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Tramos", "Runs", "Run", "Заезды"],

        // Einstellungs-Menü
        "menu.connected"   => ["Verbunden", "Verbunde", "Verbunden", "Connected", "Connecté", "Connesso", "Conectado", "Conectado", "Terhubung", "Подключено"],
        "menu.connect"     => ["Verbinden", "Verbinde", "Verbinden", "Connect", "Se connecter", "Connetti", "Conectar", "Conectar", "Hubungkan", "Подключить"],
        "menu.linked"      => ["Konto verknüpft", "Konto verchnüpft", "Konto verknüpft", "Account linked", "Compte lié", "Account collegato", "Cuenta vinculada", "Conta vinculada", "Akun tertaut", "Аккаунт привязан"],
        "menu.genCode"     => ["Pairing-Code erzeugen", "Pairing-Code erzüge", "Pairing-Code erzeugen", "Generate pairing code", "Générer un code", "Genera codice", "Generar código", "Gerar código", "Buat kode", "Создать код"],
        "pair.repairHint"  => ["ENTER: neu verbinden", "ENTER: nöi verbinde", "ENTER: neu verbinden", "ENTER: re-pair", "ENTER : reconnecter", "ENTER: ricollega", "ENTER: reconectar", "ENTER: reconectar", "ENTER: sambung ulang", "ENTER: заново"],
        "menu.upload"      => ["Upload / Sync", "Upload / Sync", "Upload / Sync", "Upload / Sync", "Envoi / Sync", "Upload / Sync", "Subir / Sync", "Envio / Sync", "Unggah / Sync", "Загрузка / синхр."],
        "menu.uploadSub"   => ["ausstehende Sessions", "offeni Sessions", "ausstehende Sessions", "pending sessions", "sessions en attente", "sessioni in sospeso", "sesiones pendientes", "sessões pendentes", "sesi tertunda", "сессии в очереди"],

        // Upload-Ansicht
        "up.connected"  => ["Telefon verbunden", "Telefon verbunde", "Telefon verbunden", "Phone connected", "Téléphone connecté", "Telefono connesso", "Teléfono conectado", "Telefone conectado", "HP terhubung", "Телефон подключён"],
        "up.noPhone"    => ["Kein Telefon", "Kei Telefon", "Kein Telefon", "No phone", "Pas de téléphone", "Nessun telefono", "Sin teléfono", "Sem telefone", "Tanpa HP", "Нет телефона"],
        "up.nothing"    => ["Nichts offen", "Nüt offe", "Nichts offen", "Nothing pending", "Rien en attente", "Niente in sospeso", "Nada pendiente", "Nada pendente", "Tidak ada", "Очередь пуста"],
        "up.allDone"    => ["alles hochgeladen", "alles ueglade", "alles hochgeladen", "all uploaded", "tout envoyé", "tutto caricato", "todo subido", "tudo enviado", "semua terunggah", "всё загружено"],
        "up.running"    => ["Upload läuft…", "Upload lauft…", "Upload läuft…", "Uploading…", "Envoi…", "Caricamento…", "Subiendo…", "Enviando…", "Mengunggah…", "Загрузка…"],
        "up.open"       => ["offen", "offe", "offen", "pending", "en attente", "in sospeso", "pendientes", "pendente", "tertunda", "в очереди"],
        "up.waitConn"   => ["Wartet auf Verbindung", "Wartet uf Verbindig", "Wartet auf Verbindung", "Waiting for connection", "Attente de connexion", "Attesa connessione", "Esperando conexión", "Aguardando conexão", "Menunggu koneksi", "Ожидание связи"],
        "up.willResume" => ["wird fortgesetzt", "wird fortgsetzt", "wird fortgesetzt", "will resume", "reprendra", "riprenderà", "se reanudará", "vai continuar", "akan lanjut", "продолжится"],
        "up.serverErr"  => ["Server-Fehler", "Server-Fähler", "Server-Fehler", "Server error", "Erreur serveur", "Errore server", "Error de servidor", "Erro do servidor", "Kesalahan server", "Ошибка сервера"],
        "up.serverUnreach" => ["Server nicht erreichbar", "Server nöd erreichbar", "Server nicht erreichbar", "Server unreachable", "Serveur injoignable", "Server irraggiungibile", "Servidor no disponible", "Servidor indisponível", "Server tak terjangkau", "Сервер недоступен"],
        "up.retryIn"    => ["Neuer Versuch in", "Neue Versuech i", "Neuer Versuch in", "Retry in", "Nouvel essai dans", "Nuovo tentativo tra", "Reintento en", "Tentar em", "Coba lagi dalam", "Повтор через"],
        "up.later"      => ["später erneut", "spöter nomal", "später erneut", "retry later", "réessai plus tard", "riprova più tardi", "reintento más tarde", "tentar depois", "coba nanti", "повтор позже"],
        "up.notLinked"  => ["Nicht verbunden", "Nöd verbunde", "Nicht verbunden", "Not linked", "Non lié", "Non collegato", "No vinculado", "Não vinculado", "Tidak tertaut", "Не привязано"],
        "up.pairAction" => ["START: Code erzeugen", "START: Code erzüge", "START: Code erzeugen", "START: get code", "START : générer le code", "START: genera codice", "START: generar código", "START: gerar código", "START: dapatkan kode", "START: получить код"],
        "up.linkHint"   => ["oder MENU → Verbinden", "oder MENU → Verbinde", "oder MENU → Verbinden", "or MENU → Connect", "ou MENU → Connecter", "o MENU → Collega", "o MENU → Conectar", "ou MENU → Conectar", "atau MENU → Hubungkan", "или MENU → Подключить"],
        "up.waiting"    => ["Warte…", "Warte…", "Warte…", "Waiting…", "Attente…", "Attendo…", "Esperando…", "Aguardando…", "Menunggu…", "Ожидание…"],
        "up.done"       => ["Upload fertig", "Upload fertig", "Upload fertig", "Upload done", "Upload terminé", "Upload completato", "Subida lista", "Envio concluído", "Unggah selesai", "Загрузка готова"],

        // Einstellungs-Menü (RecordDelegate.onMenu) + Foil-/Alarm-Menü + Min/Max-Editor
        "menu.settings"  => ["Einstellungen", "Yystellige", "Einstellungen", "Settings", "Réglages", "Impostazioni", "Ajustes", "Ajustes", "Setelan", "Настройки"],
        "menu.autostart" => ["Auto-Start", "Auto-Start", "Auto-Start", "Auto-start", "Démarrage auto", "Avvio auto", "Inicio auto", "Início auto", "Mulai otomatis", "Автостарт"],
        "common.on"      => ["An", "Aa", "An", "On", "Activé", "On", "Sí", "Lig", "Nyala", "Вкл"],
        "common.off"     => ["Aus", "Us", "Aus", "Off", "Désactivé", "Off", "No", "Desl", "Mati", "Выкл"],
        "fm.title"       => ["Foil & Alarm", "Foil & Alarm", "Foil & Alarm", "Foil & alarm", "Foil & alarme", "Foil & allarme", "Foil & alarma", "Foil & alarme", "Foil & alarm", "Foil и сигнал"],
        "fm.alarm"       => ["Alarm", "Alarm", "Alarm", "Alarm", "Alarme", "Allarme", "Alarma", "Alarme", "Alarm", "Сигнал"],
        "fm.thresholds"  => ["Schwellen", "Schwelle", "Schwellen", "Thresholds", "Seuils", "Soglie", "Umbrales", "Limites", "Ambang", "Пороги"],
        "fm.autoFoil"    => ["Auto (Foil)", "Auto (Foil)", "Auto (Foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Авто (фойл)"],
        "fm.manual"      => ["Manuell", "Manuell", "Manuell", "Manual", "Manuel", "Manuale", "Manual", "Manual", "Manual", "Вручную"],
        "fm.min"         => ["Min", "Min", "Min", "Min", "Min", "Min", "Mín", "Mín", "Min", "Мин"],
        "fm.max"         => ["Max", "Max", "Max", "Max", "Max", "Max", "Máx", "Máx", "Maks", "Макс"],
        "fm.minKmh"      => ["Min km/h", "Min km/h", "Min km/h", "Min km/h", "Min km/h", "Min km/h", "Mín km/h", "Mín km/h", "Min km/h", "Мин km/h"],
        "fm.maxKmh"      => ["Max km/h", "Max km/h", "Max km/h", "Max km/h", "Max km/h", "Max km/h", "Máx km/h", "Máx km/h", "Maks km/h", "Макс km/h"],
        "fm.noFoil"      => ["Keine Foil", "Kei Foil", "Keine Foil", "No foil", "Aucun foil", "Nessun foil", "Sin foil", "Sem foil", "Tanpa foil", "Без фойла"],
        "fm.metaOnly"    => ["nur Metadaten", "nur Metadate", "nur Metadaten", "metadata only", "métadonnées seules", "solo metadati", "solo metadatos", "apenas metadados", "metadata saja", "только метаданные"],

        // Verbinden-/Pair-Ansicht
        "pair.enterThere" => ["eingeben", "yygeh", "eingeben", "enter it there", "à saisir ici", "inseriscilo", "introdúcelo", "insira aqui", "masukkan", "введите"],
        "pair.generating" => ["Code wird erzeugt…", "Code wird erzügt…", "Code wird erzeugt…", "generating code…", "génération du code…", "generazione codice…", "generando código…", "gerando código…", "membuat kode…", "создание кода…"],
        "pair.fetching"   => ["hole Code…", "hole Code…", "hole Code…", "fetching code…", "obtention du code…", "recupero codice…", "obteniendo código…", "obtendo código…", "mengambil kode…", "получение кода…"],
        "pair.done"       => ["Verbunden!", "Verbunde!", "Verbunden!", "Connected!", "Connecté !", "Connesso!", "¡Conectado!", "Conectado!", "Terhubung!", "Подключено!"],
        "common.error"    => ["Fehler", "Fähler", "Fehler", "Error", "Erreur", "Errore", "Error", "Erro", "Kesalahan", "Ошибка"]
        };
        return _T;
    }
}
