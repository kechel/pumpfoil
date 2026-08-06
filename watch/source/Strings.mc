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
// Built-in-Fonts vorhanden) sind dagegen darstellbar. nl/fi/cs (Latein) sind seit 2026-07-24
// als Spalten 10/11/12 enthalten (KI-Übersetzung, Muttersprachler-Review offen). nb (Bokmål,
// Latein, darstellbar) ist seit 2026-08-06 Spalte 13 — Anlass war der erste norwegische
// Nutzer; nn/no landen ebenfalls dort (eine zweite norwegische Norm waere zu viel).
//
// SPEICHER (kritisch für Low-Mem-Uhren wie Instinct 2): es wird NICHTS gecacht und keine
// 13-Sprachen-Tabelle im Speicher gehalten. Pro s()-Aufruf baut _arr(key) über kleine
// if-Ketten (_a0.._a8) EIN einzelnes 13-Spalten-Array für genau diesen Key; danach ist es
// referenzlos -> Speicher wieder frei. Spitzenlast = 1 kleines Array.
//
// (:full) — dieses volle 13-Sprachen-Modul wird im LITE-Build (96-KB-Uhren) KOMPLETT
// ausgeschlossen; dort liefert StringsLite.mc ein English-only-Modul (spart die Sprach-
// Daten = Code). Volle App behält alle 13 Sprachen.
(:full)
module Strings {

    // Sprachreihenfolge der Array-Spalten.
    // 0 de | 1 gsw | 2 de-AT | 3 en | 4 fr | 5 it | 6 es | 7 pt | 8 id | 9 ru | 10 nl | 11 fi | 12 cs | 13 nb
    var _idx = 0;

    // Profil-Sprache setzen. Kann die Uhr die Sprache direkt -> nehmen. Sonst NICHT hart auf
    // Deutsch, sondern auf die GERÄTE-SYSTEMSPRACHE ausweichen (Wunsch: englische Uhr =
    // englische App). Letzter Fallback: Englisch.
    function setLang(code as Lang.String or Null) as Void {
        var i = _idxForCode(code);
        _idx = (i >= 0) ? i : _systemIdx();
    }

    // Index unserer Spalten für einen Sprachcode, -1 wenn nicht direkt unterstützt.
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
        if (code.equals("nl")) { return 10; }
        if (code.equals("fi")) { return 11; }
        if (code.equals("cs")) { return 12; }
        // Norwegisch: Bokmål-Spalte bedient auch Nynorsk (nn) und das generische "no".
        if (code.equals("nb") || code.equals("nn") || code.equals("no")) { return 13; }
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
        if (sl == System.LANGUAGE_DUT) { return 10; }  // Niederländisch
        if (sl == System.LANGUAGE_FIN) { return 11; }  // Finnisch
        if (sl == System.LANGUAGE_CES) { return 12; }  // Tschechisch
        return 3;   // alles andere (ja/zh/…): neutraler Fallback Englisch
    }

    // Lokalisierten String holen. Baut genau EIN Array (den Key) + gibt die aktive Spalte
    // zurück (Fallback: de-Spalte 0, dann der Key selbst). Kein Cache -> minimale Spitzenlast.
    function s(key as Lang.String) as Lang.String {
        var a = _arr(key);
        if (a == null) { return key; }
        var v = a[_idx];
        if (v == null || v.equals("")) { v = a[0]; }
        return v;
    }

    // Sucht das 13-Spalten-Array für einen Key über die Gruppen-Funktionen (nur die eine
    // passende baut ein Array; die übrigen liefern sofort null, ohne zu allokieren).
    function _arr(key as Lang.String) {
        var a = _a0(key); if (a != null) { return a; }
        a = _a1(key); if (a != null) { return a; }
        a = _a2(key); if (a != null) { return a; }
        a = _a3(key); if (a != null) { return a; }
        a = _a4(key); if (a != null) { return a; }
        a = _a5(key); if (a != null) { return a; }
        a = _a6(key); if (a != null) { return a; }
        a = _a7(key); if (a != null) { return a; }
        a = _a8(key); if (a != null) { return a; }
        return null;
    }

    // --- Rohdaten. Spalten: 0 de|1 gsw|2 de-AT|3 en|4 fr|5 it|6 es|7 pt|8 id|9 ru|10 nl|11 fi|12 cs ---

    // Start-/GPS-/Stop-Screen (Teil 1)
    function _a0(key as Lang.String) {
        if (key.equals("gps.ready"))      { return ["GPS bereit", "GPS bereit", "GPS bereit", "GPS ready", "GPS prêt", "GPS pronto", "GPS listo", "GPS pronto", "GPS siap", "GPS готов", "GPS klaar", "GPS valmis", "GPS připraveno", "GPS klar"]; }
        if (key.equals("upd.store"))      { return ["Update im Store", "Update im Store", "Update im Store", "Update in store", "Màj dispo", "Aggiornamento", "Actualización", "Atualização na loja", "Pembaruan di store", "Обновление в сторе", "Update in store", "Päivitys storessa", "Aktualizace v obchodě", "Oppdater i store"]; }
        if (key.equals("auto.short"))     { return ["Auto-Start", "Auto-Start", "Auto-Start", "auto-start", "auto-départ", "avvio auto", "inicio auto", "início auto", "mulai-otom", "автостарт", "auto-start", "autom. start", "autostart", "auto-start"]; }
        if (key.equals("gps.searching"))  { return ["GPS suchen…", "GPS sueche…", "GPS suchen…", "GPS searching…", "Recherche GPS…", "Ricerca GPS…", "Buscando GPS…", "Buscando GPS…", "Mencari GPS…", "Поиск GPS…", "GPS zoeken…", "GPS haku…", "hledání GPS…", "GPS søker…"]; }
        if (key.equals("gps.searchBig"))  { return ["GPS wird gesucht", "GPS wird gsuecht", "GPS wird gesucht", "Searching GPS", "Recherche GPS", "Ricerca GPS", "Buscando GPS", "Buscando GPS", "Mencari GPS", "Поиск GPS", "GPS zoeken", "Etsitään GPS", "Hledání GPS", "Søker GPS"]; }
        if (key.equals("gps.sky"))        { return ["bitte freien Himmel", "bitte freie Himmel", "bitte freien Himmel", "please open sky", "ciel dégagé svp", "cielo libero", "cielo despejado", "céu aberto, por favor", "langit terbuka", "нужно открытое небо", "vrije hemel a.u.b.", "avotaivas kiitos", "prosím volné nebe", "åpen himmel"]; }
        if (key.equals("start.rec"))      { return ["START: Aufnahme", "START: Ufnahm", "START: Aufnahme", "START: record", "START : enreg.", "START: registra", "START: grabar", "START: gravar", "START: rekam", "START: запись", "START: opname", "START: tallenna", "START: záznam", "START: opptak"]; }
        if (key.equals("start.chooseAlarm")) { return ["DOWN: Foil & Alarm", "DOWN: Foil & Alarm", "DOWN: Foil & Alarm", "DOWN: Foil & alarm", "DOWN: Foil & alarme", "DOWN: Foil & allarme", "DOWN: Foil & alarma", "DOWN: Foil & alarme", "DOWN: Foil & alarm", "DOWN: Foil и сигнал", "DOWN: Foil & alarm", "DOWN: Foil & hälytys", "DOWN: Foil & alarm", "DOWN: Foil & alarm"]; }
        if (key.equals("start.menu"))     { return ["MENU: Einstellungen", "MENU: Yystellige", "MENU: Einstellungen", "MENU: settings", "MENU : réglages", "MENU: impostazioni", "MENU: ajustes", "MENU: ajustes", "MENU: setelan", "MENU: настройки", "MENU: instellingen", "MENU: asetukset", "MENU: nastavení", "MENU: oppsett"]; }
        if (key.equals("alarm.prefix"))   { return ["Alarm: ", "Alarm: ", "Alarm: ", "Alarm: ", "Alarme : ", "Allarme: ", "Alarma: ", "Alarme: ", "Alarm: ", "Сигнал: ", "Alarm: ", "Hälytys: ", "Alarm: ", "Alarm: "]; }
        if (key.equals("foil.prefix"))    { return ["Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil : ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil: "]; }
        if (key.equals("alarm.off"))      { return ["aus", "us", "aus", "off", "off", "off", "off", "off", "mati", "выкл", "uit", "pois", "vyp", "av"]; }
        if (key.equals("err.storageFull")) { return ["Speicher voll – App neu installieren", "Spycher voll – App neu installiere", "Speicher voll – App neu installieren", "Storage full – reinstall app", "Mémoire pleine – réinstaller l'app", "Memoria piena – reinstalla l'app", "Memoria llena – reinstala la app", "Memória cheia – reinstale o app", "Memori penuh – instal ulang app", "Память заполнена – переустановите", "Opslag vol – app opnieuw installeren", "Muisti täynnä – asenna sovellus uudelleen", "Úložiště plné – přeinstalujte aplikaci", "Minnet fullt – reinstaller app"]; }
        return null;
    }

    // Start-/GPS-/Stop-Screen (Teil 2) + Session-Menü
    function _a1(key as Lang.String) {
        if (key.equals("saved.title"))    { return ["Gespeichert", "Gspycheret", "Gespeichert", "Saved", "Enregistré", "Salvato", "Guardado", "Salvo", "Tersimpan", "Сохранено", "Opgeslagen", "Tallennettu", "Uloženo", "Lagret"]; }
        if (key.equals("saved.upload"))   { return ["Upload bei WLAN/Telefon", "Upload bi WLAN/Telefon", "Upload bei WLAN/Telefon", "Upload via Wi-Fi/phone", "Envoi via Wi-Fi/tél.", "Upload via Wi-Fi/telefono", "Subida por Wi-Fi/teléfono", "Envio via Wi-Fi/telefone", "Unggah via Wi-Fi/HP", "Загрузка по Wi-Fi/телефону", "Upload via wifi/telefoon", "Lähetys Wi-Fi/puhelin", "Nahrání přes Wi-Fi/telefon", "Last opp via Wi-Fi/mobil"]; }
        if (key.equals("saved.newRec"))   { return ["START = neue Aufnahme", "START = nöji Ufnahm", "START = neue Aufnahme", "START = new recording", "START = nouvel enreg.", "START = nuova registr.", "START = nueva grabación", "START = nova gravação", "START = rekaman baru", "START = новая запись", "START = nieuwe opname", "START = uusi tallennus", "START = nový záznam", "START = nytt opptak"]; }
        if (key.equals("rec.stopping"))   { return ["Stoppen…", "Stoppe…", "Stoppen…", "Stopping…", "Arrêt…", "Arresto…", "Parando…", "Parando…", "Menghentikan…", "Остановка…", "Stoppen…", "Pysäytetään…", "Zastavování…", "Stopper…"]; }
        if (key.equals("rec.saveRelease")) { return ["Loslassen: Speichern", "Loslah: Speichere", "Loslassen: Speichern", "Release: Save", "Relâcher : Enreg.", "Rilascia: Salva", "Soltar: Guardar", "Soltar: Salvar", "Lepas: Simpan", "Отпустить: сохранить", "Loslaten: opslaan", "Vapauta: tallenna", "Uvolnit: uložit", "Slipp: Lagre"]; }
        if (key.equals("rec.discardHold")) { return ["Halten: Verwerfen", "Halte: Verwerfe", "Halten: Verwerfen", "Hold: Discard", "Maintenir : Suppr.", "Tieni: Scarta", "Mantener: Descartar", "Segurar: Descartar", "Tahan: Buang", "Удерживать: сброс", "Vasthouden: verwerpen", "Pidä: hylkää", "Podržet: zahodit", "Hold: Forkast"]; }
        if (key.equals("rec.sessionTitle")) { return ["Session", "Session", "Session", "Session", "Session", "Sessione", "Sesión", "Sessão", "Sesi", "Сессия", "Sessie", "Sessio", "Relace", "Økt"]; }
        if (key.equals("rec.save"))       { return ["Speichern", "Speichere", "Speichern", "Save", "Enregistrer", "Salva", "Guardar", "Salvar", "Simpan", "Сохранить", "Opslaan", "Tallenna", "Uložit", "Lagre"]; }
        if (key.equals("rec.discard"))    { return ["Verwerfen", "Verwärfe", "Verwerfen", "Discard", "Supprimer", "Scarta", "Descartar", "Descartar", "Buang", "Сбросить", "Verwerpen", "Hylkää", "Zahodit", "Forkast"]; }
        if (key.equals("rec.pause"))      { return ["Pausieren", "Pausiere", "Pausieren", "Pause", "Pause", "Pausa", "Pausar", "Pausar", "Jeda", "Пауза", "Pauzeren", "Tauko", "Pozastavit", "Pause"]; }
        if (key.equals("rec.resume"))     { return ["Fortsetzen", "Fortsetze", "Fortsetzen", "Resume", "Reprendre", "Riprendi", "Reanudar", "Retomar", "Lanjut", "Продолжить", "Hervatten", "Jatka", "Pokračovat", "Fortsett"]; }
        if (key.equals("rec.paused"))     { return ["Pausiert", "Pausiert", "Pausiert", "Paused", "En pause", "In pausa", "En pausa", "Pausado", "Dijeda", "Пауза", "Gepauzeerd", "Tauolla", "Pozastaveno", "Pauset"]; }
        if (key.equals("rec.holdMenu"))   { return ["Menü…", "Menü…", "Menü…", "Menu…", "Menu…", "Menu…", "Menú…", "Menu…", "Menu…", "Меню…", "Menu…", "Valikko…", "Menu…", "Meny…"]; }
        return null;
    }

    // Datenfeld-Labels (Teil 1)
    function _a2(key as Lang.String) {
        if (key.equals("f.kmh3s"))   { return ["km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)", "km/h (3s)"]; }
        if (key.equals("f.bpm"))     { return ["bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm", "bpm"]; }
        if (key.equals("f.time"))    { return ["Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo", "Tempo", "Waktu", "Время", "Tijd", "Aika", "Čas", "Tid"]; }
        if (key.equals("f.kmh"))     { return ["km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h", "km/h"]; }
        if (key.equals("f.kmhAvg"))  { return ["km/h Ø", "km/h Ø", "km/h Ø", "km/h avg", "km/h moy", "km/h media", "km/h med", "km/h méd", "km/h rata", "km/h ср", "km/h gem", "km/h ka", "km/h prům", "km/h snitt"]; }
        if (key.equals("f.kmhMax"))  { return ["km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h máx", "km/h máx", "km/h maks", "km/h макс", "km/h max", "km/h maks", "km/h max", "km/h maks"]; }
        if (key.equals("f.bpmAvg"))  { return ["bpm Ø", "bpm Ø", "bpm Ø", "bpm avg", "bpm moy", "bpm media", "bpm med", "bpm méd", "bpm rata", "bpm ср", "bpm gem", "bpm ka", "bpm prům", "bpm snitt"]; }
        if (key.equals("f.bpmMax"))  { return ["bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm máx", "bpm máx", "bpm maks", "bpm макс", "bpm max", "bpm maks", "bpm max", "bpm maks"]; }
        if (key.equals("f.mAlt"))    { return ["m Höhe", "m Höchi", "m Höhe", "m alt", "m alt", "m alt", "m alt", "m alt", "m ket", "m выс", "m hgt", "m kork", "m výš", "m høyde"]; }
        if (key.equals("f.mAsc"))    { return ["m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑", "m ↑"]; }
        if (key.equals("f.degC"))    { return ["°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C", "°C"]; }
        if (key.equals("f.clock"))   { return ["Uhr", "Uhr", "Uhr", "Clock", "Heure", "Ora", "Hora", "Hora", "Jam", "Часы", "Klok", "Kello", "Hodiny", "Klokke"]; }
        return null;
    }

    // Datenfeld-Labels (Teil 2)
    function _a3(key as Lang.String) {
        if (key.equals("f.runActive")) { return ["Lauf läuft", "Lauf lauft", "Lauf läuft", "run active", "run actif", "run attivo", "run activo", "run ativo", "run aktif", "заезд идёт", "run actief", "veto käynnissä", "jízda aktivní", "run aktivt"]; }
        if (key.equals("f.run"))     { return ["Lauf", "Lauf", "Lauf", "Run", "Run", "Run", "Tramo", "Run", "Run", "Заезд", "Run", "Veto", "Jízda", "Run"]; }
        if (key.equals("f.lastRun")) { return ["letzter Lauf", "letschte Lauf", "letzter Lauf", "last run", "dernier run", "ultimo run", "último tramo", "último run", "run terakhir", "посл. заезд", "laatste run", "viime veto", "posl. jízda", "siste run"]; }
        if (key.equals("f.last"))    { return ["letzter", "letschte", "letzter", "last", "dernier", "ultimo", "último", "último", "terakhir", "посл.", "laatste", "viime", "posl.", "siste"]; }
        if (key.equals("f.kmhAvgLast")) { return ["km/h Ø letzt.", "km/h Ø letscht.", "km/h Ø letzt.", "km/h avg last", "km/h moy dern.", "km/h media ult.", "km/h med últ.", "km/h méd últ.", "km/h rata akhir", "km/h ср посл.", "km/h gem laatst", "km/h ka viim", "km/h prům posl.", "km/h snitt siste"]; }
        if (key.equals("f.kmhMaxLast")) { return ["km/h max letzt.", "km/h max letscht.", "km/h max letzt.", "km/h max last", "km/h max dern.", "km/h max ult.", "km/h máx últ.", "km/h máx últ.", "km/h maks akhir", "km/h макс посл.", "km/h max laatst", "km/h maks viim", "km/h max posl.", "km/h maks siste"]; }
        if (key.equals("f.runs"))    { return ["Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Tramos", "Runs", "Run", "Заезды", "Runs", "Vedot", "Jízdy", "Runs"]; }
        return null;
    }

    // Einstellungs-Menü (Kopf) + Pairing-Status
    function _a4(key as Lang.String) {
        if (key.equals("menu.connected")) { return ["Verbunden", "Verbunde", "Verbunden", "Connected", "Connecté", "Connesso", "Conectado", "Conectado", "Terhubung", "Подключено", "Verbonden", "Yhdistetty", "Připojeno", "Tilkoblet"]; }
        if (key.equals("menu.connect"))   { return ["Verbinden", "Verbinde", "Verbinden", "Connect", "Se connecter", "Connetti", "Conectar", "Conectar", "Hubungkan", "Подключить", "Verbinden", "Yhdistä", "Připojit", "Koble til"]; }
        if (key.equals("menu.linked"))    { return ["Konto verknüpft", "Konto verchnüpft", "Konto verknüpft", "Account linked", "Compte lié", "Account collegato", "Cuenta vinculada", "Conta vinculada", "Akun tertaut", "Аккаунт привязан", "Account gekoppeld", "Tili linkitetty", "Účet propojen", "Konto tilkoblet"]; }
        if (key.equals("menu.genCode"))   { return ["Pairing-Code erzeugen", "Pairing-Code erzüge", "Pairing-Code erzeugen", "Generate pairing code", "Générer un code", "Genera codice", "Generar código", "Gerar código", "Buat kode", "Создать код", "Koppelcode genereren", "Luo pariliitoskoodi", "Vytvořit párovací kód", "Lag koblingskode"]; }
        if (key.equals("pair.repairHint")) { return ["ENTER: neu verbinden", "ENTER: nöi verbinde", "ENTER: neu verbinden", "ENTER: re-pair", "ENTER : reconnecter", "ENTER: ricollega", "ENTER: reconectar", "ENTER: reconectar", "ENTER: sambung ulang", "ENTER: заново", "ENTER: opnieuw koppelen", "ENTER: pariliitä uudelleen", "ENTER: spárovat znovu", "ENTER: koble igjen"]; }
        if (key.equals("pair.noConn"))    { return ["Keine Verbindung", "Kei Verbindig", "Keine Verbindung", "No connection", "Pas de connexion", "Nessuna connessione", "Sin conexión", "Sem conexão", "Tidak ada koneksi", "Нет связи", "Geen verbinding", "Ei yhteyttä", "Bez připojení", "Ikke tilkoblet"]; }
        if (key.equals("menu.upload"))    { return ["Upload / Sync", "Upload / Sync", "Upload / Sync", "Upload / Sync", "Envoi / Sync", "Upload / Sync", "Subir / Sync", "Envio / Sync", "Unggah / Sync", "Загрузка / синхр.", "Upload / sync", "Lähetys / sync", "Nahrání / sync", "Last opp / sync"]; }
        if (key.equals("menu.uploadSub")) { return ["ausstehende Sessions", "offeni Sessions", "ausstehende Sessions", "pending sessions", "sessions en attente", "sessioni in sospeso", "sesiones pendientes", "sessões pendentes", "sesi tertunda", "сессии в очереди", "openstaande sessies", "odottavat sessiot", "čekající relace", "økter i kø"]; }
        return null;
    }

    // Upload-Ansicht (Teil 1)
    function _a5(key as Lang.String) {
        if (key.equals("up.connected")) { return ["Telefon verbunden", "Telefon verbunde", "Telefon verbunden", "Phone connected", "Téléphone connecté", "Telefono connesso", "Teléfono conectado", "Telefone conectado", "HP terhubung", "Телефон подключён", "Telefoon verbonden", "Puhelin yhdistetty", "Telefon připojen", "Mobil tilkoblet"]; }
        if (key.equals("up.noPhone"))   { return ["Kein Telefon", "Kei Telefon", "Kein Telefon", "No phone", "Pas de téléphone", "Nessun telefono", "Sin teléfono", "Sem telefone", "Tanpa HP", "Нет телефона", "Geen telefoon", "Ei puhelinta", "Bez telefonu", "Ingen mobil"]; }
        if (key.equals("up.nothing"))   { return ["Nichts offen", "Nüt offe", "Nichts offen", "Nothing pending", "Rien en attente", "Niente in sospeso", "Nada pendiente", "Nada pendente", "Tidak ada", "Очередь пуста", "Niets openstaand", "Ei odottavia", "Nic nečeká", "Ingenting i kø"]; }
        if (key.equals("up.allDone"))   { return ["alles hochgeladen", "alles ueglade", "alles hochgeladen", "all uploaded", "tout envoyé", "tutto caricato", "todo subido", "tudo enviado", "semua terunggah", "всё загружено", "alles geüpload", "kaikki lähetetty", "vše nahráno", "alt lastet opp"]; }
        if (key.equals("up.running"))   { return ["Upload läuft…", "Upload lauft…", "Upload läuft…", "Uploading…", "Envoi…", "Caricamento…", "Subiendo…", "Enviando…", "Mengunggah…", "Загрузка…", "Uploaden…", "Lähetetään…", "Nahrávání…", "Laster opp…"]; }
        if (key.equals("up.open"))      { return ["offen", "offe", "offen", "pending", "en attente", "in sospeso", "pendientes", "pendente", "tertunda", "в очереди", "openstaand", "odottaa", "čeká", "i kø"]; }
        if (key.equals("up.waitConn")) { return ["Wartet auf Verbindung", "Wartet uf Verbindig", "Wartet auf Verbindung", "Waiting for connection", "Attente de connexion", "Attesa connessione", "Esperando conexión", "Aguardando conexão", "Menunggu koneksi", "Ожидание связи", "Wacht op verbinding", "Odottaa yhteyttä", "Čeká na spojení", "Venter på forbindelse"]; }
        if (key.equals("up.willResume")) { return ["wird fortgesetzt", "wird fortgsetzt", "wird fortgesetzt", "will resume", "reprendra", "riprenderà", "se reanudará", "vai continuar", "akan lanjut", "продолжится", "wordt hervat", "jatkuu", "bude pokračovat", "fortsetter"]; }
        if (key.equals("up.serverErr")) { return ["Server-Fehler", "Server-Fähler", "Server-Fehler", "Server error", "Erreur serveur", "Errore server", "Error de servidor", "Erro do servidor", "Kesalahan server", "Ошибка сервера", "Serverfout", "Palvelinvirhe", "Chyba serveru", "Serverfeil"]; }
        if (key.equals("up.serverUnreach")) { return ["Server nicht erreichbar", "Server nöd erreichbar", "Server nicht erreichbar", "Server unreachable", "Serveur injoignable", "Server irraggiungibile", "Servidor no disponible", "Servidor indisponível", "Server tak terjangkau", "Сервер недоступен", "Server onbereikbaar", "Palvelin ei tavoitettavissa", "Server nedostupný", "Server utilgjengelig"]; }
        return null;
    }

    // Upload-Ansicht (Teil 2)
    function _a6(key as Lang.String) {
        if (key.equals("up.retryIn"))   { return ["Neuer Versuch in", "Neue Versuech i", "Neuer Versuch in", "Retry in", "Nouvel essai dans", "Nuovo tentativo tra", "Reintento en", "Tentar em", "Coba lagi dalam", "Повтор через", "Opnieuw over", "Uusi yritys", "Zkusit za", "Prøver om"]; }
        if (key.equals("up.later"))     { return ["später erneut", "spöter nomal", "später erneut", "retry later", "réessai plus tard", "riprova più tardi", "reintento más tarde", "tentar depois", "coba nanti", "повтор позже", "later opnieuw", "yritä myöhemmin", "zkusit později", "prøv senere"]; }
        if (key.equals("up.notLinked")) { return ["Nicht verbunden", "Nöd verbunde", "Nicht verbunden", "Not linked", "Non lié", "Non collegato", "No vinculado", "Não vinculado", "Tidak tertaut", "Не привязано", "Niet gekoppeld", "Ei linkitetty", "Nepropojeno", "Ikke koblet"]; }
        if (key.equals("up.pairAction")) { return ["START: Code erzeugen", "START: Code erzüge", "START: Code erzeugen", "START: get code", "START : générer le code", "START: genera codice", "START: generar código", "START: gerar código", "START: dapatkan kode", "START: получить код", "START: code ophalen", "START: hae koodi", "START: získat kód", "START: hent kode"]; }
        if (key.equals("up.linkHint"))  { return ["oder MENU → Verbinden", "oder MENU → Verbinde", "oder MENU → Verbinden", "or MENU → Connect", "ou MENU → Connecter", "o MENU → Collega", "o MENU → Conectar", "ou MENU → Conectar", "atau MENU → Hubungkan", "или MENU → Подключить", "of MENU → Verbinden", "tai MENU → Yhdistä", "nebo MENU → Připojit", "eller MENU → Koble til"]; }
        if (key.equals("up.keepOpen"))  { return ["App offen lassen!", "App offe lah!", "App offen lassen!", "keep app open!", "garder l'app ouverte !", "tieni aperta l'app!", "¡mantén la app abierta!", "mantenha o app aberto!", "biarkan aplikasi terbuka!", "не закрывайте приложение!", "houd de app open!", "pidä sovellus auki!", "nech aplikaci otevřenou!", "hold appen åpen!"]; }
        if (key.equals("up.pendingN"))  { return ["warten auf Upload", "warted uf Upload", "warten auf Upload", "waiting for upload", "en attente d'envoi", "in attesa di upload", "esperando subida", "aguardando envio", "menunggu unggah", "ждут загрузки", "wachten op upload", "odottaa lähetystä", "čekají na nahrání", "venter på opplasting"]; }
        if (key.equals("up.waiting"))   { return ["Warte…", "Warte…", "Warte…", "Waiting…", "Attente…", "Attendo…", "Esperando…", "Aguardando…", "Menunggu…", "Ожидание…", "Wachten…", "Odotetaan…", "Čekání…", "Venter…"]; }
        if (key.equals("up.done"))      { return ["Upload fertig", "Upload fertig", "Upload fertig", "Upload done", "Upload terminé", "Upload completato", "Subida lista", "Envio concluído", "Unggah selesai", "Загрузка готова", "Upload klaar", "Lähetys valmis", "Nahrání hotovo", "Lastet opp"]; }
        return null;
    }

    // Einstellungs-Menü (Optionen) + Foil-/Alarm-Menü (Teil 1)
    function _a7(key as Lang.String) {
        if (key.equals("menu.settings")) { return ["Einstellungen", "Yystellige", "Einstellungen", "Settings", "Réglages", "Impostazioni", "Ajustes", "Ajustes", "Setelan", "Настройки", "Instellingen", "Asetukset", "Nastavení", "Innstillinger"]; }
        if (key.equals("menu.autostart")) { return ["Auto-Start", "Auto-Start", "Auto-Start", "Auto-start", "Démarrage auto", "Avvio auto", "Inicio auto", "Início auto", "Mulai otomatis", "Автостарт", "Auto-start", "Autom. start", "Autostart", "Auto-start"]; }
        // Not-Aus für die frei gestalteten Layouts (Sicherheitsnetz Stufe 1, rein lokal).
        if (key.equals("menu.layouts")) { return ["Eigene Layouts", "Eigeni Layouts", "Eigene Layouts", "Custom layouts", "Layouts perso", "Layout personali", "Diseños propios", "Layouts próprios", "Tata letak sendiri", "Свои макеты", "Eigen layouts", "Omat asettelut", "Vlastní rozvržení", "Egne oppsett"]; }
        // Nach einem Absturz mit dynamischem Layout: diese Sitzung läuft statisch.
        if (key.equals("lay.fallback")) { return ["Layout aus (Absturz)", "Layout us (Absturz)", "Layout aus (Absturz)", "Layout off (crash)", "Layout off (plantage)", "Layout off (crash)", "Diseño off (fallo)", "Layout off (falha)", "Tata letak off (error)", "Макет выкл (сбой)", "Layout uit (crash)", "Asettelu pois (kaatui)", "Rozvržení vyp (pád)", "Oppsett av (krasj)"]; }
        if (key.equals("common.on"))     { return ["An", "Aa", "An", "On", "Activé", "On", "Sí", "Lig", "Nyala", "Вкл", "Aan", "Päällä", "Zap", "På"]; }
        // „Automatisch" = die Voreinstellung vom Server übernehmen (Dreizustand des
        // Layout-Schalters). Reihenfolge der Spalten wie überall: de gsw de-AT en fr it es pt id ru nl fi cs
        // Schalter steht auf „an", der Server hat aber (noch) keine Layout-Seiten geliefert —
        // ehrlich anzeigen statt „An" zu behaupten.
        if (key.equals("lay.none"))      { return ["keine Seiten", "kei Site", "keine Seiten", "no pages", "aucune page", "nessuna pagina", "sin páginas", "sem páginas", "tidak ada", "нет страниц", "geen pagina's", "ei sivuja", "žádné strany", "ingen sider"]; }
        if (key.equals("common.auto"))   { return ["Automatisch", "Automatisch", "Automatisch", "Automatic", "Automatique", "Automatico", "Automático", "Automático", "Otomatis", "Авто", "Automatisch", "Automaattinen", "Automaticky", "Automatisk"]; }
        if (key.equals("common.off"))    { return ["Aus", "Us", "Aus", "Off", "Désactivé", "Off", "No", "Desl", "Mati", "Выкл", "Uit", "Pois", "Vyp", "Av"]; }
        if (key.equals("fm.title"))      { return ["Foil & Alarm", "Foil & Alarm", "Foil & Alarm", "Foil & alarm", "Foil & alarme", "Foil & allarme", "Foil & alarma", "Foil & alarme", "Foil & alarm", "Foil и сигнал", "Foil & alarm", "Foil & hälytys", "Foil & alarm", "Foil & alarm"]; }
        if (key.equals("fm.alarm"))      { return ["Alarm", "Alarm", "Alarm", "Alarm", "Alarme", "Allarme", "Alarma", "Alarme", "Alarm", "Сигнал", "Alarm", "Hälytys", "Alarm", "Alarm"]; }
        if (key.equals("fm.thresholds")) { return ["Schwellen", "Schwelle", "Schwellen", "Thresholds", "Seuils", "Soglie", "Umbrales", "Limites", "Ambang", "Пороги", "Drempels", "Kynnykset", "Prahy", "Grenser"]; }
        if (key.equals("fm.autoFoil"))   { return ["Auto (Foil)", "Auto (Foil)", "Auto (Foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Авто (фойл)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)"]; }
        if (key.equals("fm.manual"))     { return ["Manuell", "Manuell", "Manuell", "Manual", "Manuel", "Manuale", "Manual", "Manual", "Manual", "Вручную", "Handmatig", "Manuaalinen", "Ručně", "Manuell"]; }
        if (key.equals("fm.min"))        { return ["Min", "Min", "Min", "Min", "Min", "Min", "Mín", "Mín", "Min", "Мин", "Min", "Min", "Min", "Min"]; }
        if (key.equals("fm.max"))        { return ["Max", "Max", "Max", "Max", "Max", "Max", "Máx", "Máx", "Maks", "Макс", "Max", "Maks", "Max", "Maks"]; }
        return null;
    }

    // Foil-/Alarm-Menü (Teil 2) + Verbinden-/Pair-Ansicht
    function _a8(key as Lang.String) {
        if (key.equals("fm.minKmh"))     { return ["Min km/h", "Min km/h", "Min km/h", "Min km/h", "Min km/h", "Min km/h", "Mín km/h", "Mín km/h", "Min km/h", "Мин km/h", "Min km/h", "Min km/h", "Min km/h", "Min km/h"]; }
        if (key.equals("fm.maxKmh"))     { return ["Max km/h", "Max km/h", "Max km/h", "Max km/h", "Max km/h", "Max km/h", "Máx km/h", "Máx km/h", "Maks km/h", "Макс km/h", "Max km/h", "Maks km/h", "Max km/h", "Maks km/h"]; }
        if (key.equals("fm.noFoil"))     { return ["Keine Foil", "Kei Foil", "Keine Foil", "No foil", "Aucun foil", "Nessun foil", "Sin foil", "Sem foil", "Tanpa foil", "Без фойла", "Geen foil", "Ei foilia", "Bez foilu", "Ingen foil"]; }
        if (key.equals("fm.metaOnly"))   { return ["nur Metadaten", "nur Metadate", "nur Metadaten", "metadata only", "métadonnées seules", "solo metadati", "solo metadatos", "apenas metadados", "metadata saja", "только метаданные", "alleen metadata", "vain metatiedot", "jen metadata", "kun metadata"]; }
        if (key.equals("pair.enterThere")) { return ["eingeben", "yygeh", "eingeben", "enter it there", "à saisir ici", "inseriscilo", "introdúcelo", "insira aqui", "masukkan", "введите", "daar invoeren", "syötä se siellä", "zadejte tam", "tast den inn der"]; }
        if (key.equals("pair.generating")) { return ["Code wird erzeugt…", "Code wird erzügt…", "Code wird erzeugt…", "generating code…", "génération du code…", "generazione codice…", "generando código…", "gerando código…", "membuat kode…", "создание кода…", "code genereren…", "luodaan koodia…", "generuji kód…", "lager kode…"]; }
        if (key.equals("pair.fetching")) { return ["hole Code…", "hole Code…", "hole Code…", "fetching code…", "obtention du code…", "recupero codice…", "obteniendo código…", "obtendo código…", "mengambil kode…", "получение кода…", "code ophalen…", "haetaan koodia…", "načítám kód…", "henter kode…"]; }
        if (key.equals("pair.done"))     { return ["Verbunden!", "Verbunde!", "Verbunden!", "Connected!", "Connecté !", "Connesso!", "¡Conectado!", "Conectado!", "Terhubung!", "Подключено!", "Verbonden!", "Yhdistetty!", "Připojeno!", "Tilkoblet!"]; }
        if (key.equals("common.error"))  { return ["Fehler", "Fähler", "Fehler", "Error", "Erreur", "Errore", "Error", "Erro", "Kesalahan", "Ошибка", "Fout", "Virhe", "Chyba", "Feil"]; }
        return null;
    }
}
