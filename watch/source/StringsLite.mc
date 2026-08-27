using Toybox.Lang;

// SPARSAME Lokalisierung: ausschließlich Englisch — spart gegenüber der vollen 13-Sprachen-
// Tabelle (Strings.mc, `(:i18n)`) den Großteil der String-Daten = Code. Kein Cache, keine
// Container: s() liefert das englische Literal direkt (Gruppen _e0.._e8, spiegeln
// Strings._a0.._a8). setLang() ist ein No-Op (Sprache fix Englisch).
// Verwendet von BEIDEN sparsamen Stufen (s. monkey.jungle): dem LITE-Build der 96-KB-Uhren
// (Instinct-2-Klasse) und der ENG-Stufe der 128-KB-Uhren (FR55/fenix 6/Venu Sq …).
// Siehe memory garmin-instinct2-lowmem.
(:noi18n)
module Strings {

    function setLang(code as Lang.String or Null) as Void {}

    function s(key as Lang.String) as Lang.String {
        var v = _e0(key); if (v != null) { return v; }
        v = _e1(key); if (v != null) { return v; }
        v = _e2(key); if (v != null) { return v; }
        v = _e3(key); if (v != null) { return v; }
        v = _e4(key); if (v != null) { return v; }
        v = _e5(key); if (v != null) { return v; }
        v = _e6(key); if (v != null) { return v; }
        v = _e7(key); if (v != null) { return v; }
        v = _e8(key); if (v != null) { return v; }
        v = _e9(key); if (v != null) { return v; }
        return key;
    }

    function _e0(key as Lang.String) {
        if (key.equals("gps.ready"))      { return "GPS ready"; }
        if (key.equals("upd.store"))      { return "Update in store"; }
        if (key.equals("auto.short"))     { return "auto-start"; }
        if (key.equals("gps.searching"))  { return "GPS searching…"; }
        if (key.equals("gps.searchBig"))  { return "Searching GPS"; }
        if (key.equals("gps.sky"))        { return "please open sky"; }
        if (key.equals("start.rec"))      { return "START: record"; }
        if (key.equals("start.chooseAlarm")) { return "DOWN: Foil & alarm"; }
        if (key.equals("start.menu"))     { return "MENU: settings"; }
        if (key.equals("alarm.prefix"))   { return "Alarm: "; }
        if (key.equals("foil.prefix"))    { return "Foil: "; }
        if (key.equals("alarm.off"))      { return "off"; }
        if (key.equals("err.storageSoon")) { return "min until storage is full – stop & sync"; }
        if (key.equals("start.bufferMin")) { return "min buffer"; }
        if (key.equals("err.storageFull")) { return "Storage full – upload first"; }
        if (key.equals("err.dataLost")) { return "Storage full – losing data!"; }
        if (key.equals("up.uploadFirst")) { return "upload first!"; }
        return null;
    }

    function _e1(key as Lang.String) {
        if (key.equals("saved.title"))    { return "Saved"; }
        if (key.equals("saved.upload"))   { return "Upload via Wi-Fi/phone"; }
        if (key.equals("saved.newRec"))   { return "START = new recording"; }
        if (key.equals("rec.stopping"))   { return "Stopping…"; }
        if (key.equals("rec.saveRelease")) { return "Release: Save"; }
        if (key.equals("rec.discardHold")) { return "Hold: Discard"; }
        if (key.equals("rec.sessionTitle")) { return "Session"; }
        if (key.equals("rec.save"))       { return "Save"; }
        if (key.equals("rec.discard"))    { return "Discard"; }
        if (key.equals("rec.pause"))      { return "Pause"; }
        if (key.equals("rec.resume"))     { return "Resume"; }
        if (key.equals("rec.paused"))     { return "Paused"; }
        if (key.equals("rec.holdMenu"))   { return "Hold: Save"; }
        return null;
    }

    function _e2(key as Lang.String) {
        if (key.equals("f.kmh3s"))   { return "km/h (3s)"; }
        if (key.equals("f.bpm"))     { return "bpm"; }
        if (key.equals("f.time"))    { return "Time"; }
        if (key.equals("f.kmh"))     { return "km/h"; }
        if (key.equals("f.kmhAvg"))  { return "km/h avg"; }
        if (key.equals("f.kmhMax"))  { return "km/h max"; }
        if (key.equals("f.bpmAvg"))  { return "bpm avg"; }
        if (key.equals("f.bpmMax"))  { return "bpm max"; }
        if (key.equals("f.mAlt"))    { return "m alt"; }
        if (key.equals("f.mAsc"))    { return "m ↑"; }
        if (key.equals("f.degC"))    { return "°C"; }
        if (key.equals("f.clock"))   { return "Clock"; }
        return null;
    }

    function _e3(key as Lang.String) {
        if (key.equals("f.runActive")) { return "run active"; }
        if (key.equals("f.run"))     { return "Run"; }
        if (key.equals("f.lastRun")) { return "last run"; }
        if (key.equals("f.last"))    { return "last"; }
        if (key.equals("f.kmhAvgLast")) { return "km/h avg last"; }
        if (key.equals("f.kmhMaxLast")) { return "km/h max last"; }
        if (key.equals("f.runs"))    { return "Runs"; }
        return null;
    }

    function _e4(key as Lang.String) {
        if (key.equals("menu.connected")) { return "Connected"; }
        if (key.equals("menu.connect"))   { return "Connect"; }
        if (key.equals("menu.linked"))    { return "Account linked"; }
        if (key.equals("menu.genCode"))   { return "Generate pairing code"; }
        if (key.equals("pair.repairHint")) { return "ENTER: re-pair"; }
        if (key.equals("pair.noConn"))    { return "No connection"; }
        if (key.equals("menu.upload"))    { return "Upload / Sync"; }
        if (key.equals("menu.uploadSub")) { return "pending sessions"; }
        return null;
    }

    function _e5(key as Lang.String) {
        if (key.equals("up.connected")) { return "Phone connected"; }
        if (key.equals("up.noPhone"))   { return "No phone"; }
        if (key.equals("up.nothing"))   { return "Nothing pending"; }
        if (key.equals("up.allDone"))   { return "all uploaded"; }
        if (key.equals("up.running"))   { return "Uploading…"; }
        if (key.equals("up.open"))      { return "pending"; }
        if (key.equals("up.waitConn"))  { return "Waiting for connection"; }
        if (key.equals("up.willResume")) { return "will resume"; }
        if (key.equals("up.serverErr")) { return "Server error"; }
        if (key.equals("up.serverUnreach")) { return "Server unreachable"; }
        return null;
    }

    function _e6(key as Lang.String) {
        if (key.equals("up.retryIn"))   { return "Retry in"; }
        if (key.equals("up.later"))     { return "retry later"; }
        if (key.equals("up.notLinked")) { return "Not linked"; }
        if (key.equals("up.keepOpen")) { return "keep app open!"; }
        if (key.equals("up.pendingN")) { return "waiting for upload"; }
        if (key.equals("up.pairAction")) { return "START: get code"; }
        if (key.equals("up.linkHint"))  { return "or MENU → Connect"; }
        if (key.equals("up.waiting"))   { return "Waiting…"; }
        if (key.equals("up.done"))      { return "Upload done"; }
        return null;
    }

    function _e7(key as Lang.String) {
        if (key.equals("menu.settings")) { return "Settings"; }
        if (key.equals("menu.autostart")) { return "Auto-start"; }
        if (key.equals("common.on"))     { return "On"; }
        if (key.equals("common.off"))    { return "Off"; }
        if (key.equals("fm.title"))      { return "Foil & alarm"; }
        if (key.equals("fm.alarm"))      { return "Alarm"; }
        if (key.equals("fm.thresholds")) { return "Thresholds"; }
        if (key.equals("fm.autoFoil"))   { return "Auto (foil)"; }
        if (key.equals("fm.manual"))     { return "Manual"; }
        if (key.equals("fm.min"))        { return "Min"; }
        if (key.equals("fm.max"))        { return "Max"; }
        return null;
    }

    function _e8(key as Lang.String) {
        if (key.equals("fm.minKmh"))     { return "Min km/h"; }
        if (key.equals("fm.maxKmh"))     { return "Max km/h"; }
        if (key.equals("fm.noFoil"))     { return "No foil"; }
        if (key.equals("fm.metaOnly"))   { return "metadata only"; }
        if (key.equals("pair.enterThere")) { return "enter it there"; }
        if (key.equals("pair.generating")) { return "generating code…"; }
        if (key.equals("pair.fetching")) { return "fetching code…"; }
        if (key.equals("pair.done"))     { return "Connected!"; }
        if (key.equals("common.error"))  { return "Error"; }
        return null;
    }

    // Nachgetragen 17.08. — diese Keys fehlten hier, weil sie im LITE-Build (96 KB) nie gebraucht
    // wurden: die Menue-Texte stecken hinter `(:full)`, das LITE gar nicht hat. Mit der neuen
    // ENG-Stufe (128 KB) sind die MENUES an, aber die Sprachtabelle ist diese hier — dadurch stand
    // im Pausen-Menue der rohe Key statt des Textes (Jans fenix 5, belegt per Screenshot).
    // `f.bpmMaxLast` fehlte unabhaengig davon: Datenfeld 21 (17.08.) wurde nur in Strings.mc
    // eingetragen, also zeigten auch die Instinct-2-Uhren dort den rohen Key.
    // MERKE: jeder neue Key gehoert in BEIDE Module. Gegenprobe (muss leer bleiben):
    //   diff <(grep -oP 'key\.equals\("\K[^"]+' source/Strings.mc | sort) \
    //        <(grep -oP 'key\.equals\("\K[^"]+' source/StringsLite.mc | sort)
    function _e9(key as Lang.String) {
        if (key.equals("rec.cancel"))    { return "Cancel"; }
        if (key.equals("rec.endSave"))   { return "End & save"; }
        if (key.equals("f.bpmMaxLast"))  { return "bpm max last"; }
        // Layout-Keys: in LITE/ENG ist der Renderer nicht dabei, der Menuepunkt also auch nicht.
        // Trotzdem hinterlegt, damit ein kuenftiger Aufruf keinen rohen Key mehr zeigen kann.
        if (key.equals("menu.layouts"))  { return "Custom layouts"; }
        if (key.equals("lay.fallback"))  { return "Layout off (crash)"; }
        if (key.equals("lay.none"))      { return "no pages"; }
        if (key.equals("common.auto"))   { return "Automatic"; }
        return null;
    }
}
