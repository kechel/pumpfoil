using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Attention;
using Toybox.Math;

// Aufzeichnungs-Ansicht: 1–3 konfigurierbare große Datenfelder.
// Default: Speed (3 s) + Puls. Aktualisiert sich 1×/s via requestUpdate (Timer im Delegate).
class RecordView extends WatchUi.View {

    hidden var _rec;
    var screenIdx = 0;   // aktive Seite (Datenansichten 0..n-1, n = Übersicht)
    hidden var _prevRecording = false;
    // Zustand der letzten Zeichnung (F3): wechselt er, fängt der Ring vorne an und die Uhr
    // vibriert einmal kurz. Ersetzt _prevFoiling/_lastDataIdx/_summaryShownAtMs und die
    // 8-Sekunden-Regel — Zustand statt Zeit (s. docs/setup-and-watch-layouts.md, F3).
    hidden var _prevState = null;
    // Wann wurde pausiert? Über einem eigenen Layout zeigt die Uhr den Fortsetzen-Hinweis nur die
    // ersten Sekunden — man braucht ihn genau dann, und danach bleibt das Layout frei.
    hidden var _pausedAtMs = null;
    const PAUSE_HINT_MS = 6000;
    // Hat schon einmal ein Bild fertig gezeichnet? Loescht die Start-Marke (s. onUpdate).
    hidden var _drewOnce = false;
    // Gepuffertes Volumen, gecacht je Session-Anzahl (s. Upload-Hinweis im Start-Screen).
    hidden var _pendKbFor = -1;
    hidden var _pendKb = 0;

    function initialize(recorder) {
        View.initialize();
        _rec = recorder;
    }

    // Beim (Wieder-)Anzeigen des Start-Screens den Auto-Start-Vorlauf neu starten — z.B. nach
    // Rückkehr aus dem Einstellungs-/Foil-Menü, damit die 10 s Countdown wieder von vorn laufen.
    function onShow() {
        _rec.resetAutoLead();
    }

    // Seitenzahl des AKTUELLEN Zustands (F3) — es gibt keinen Übersichts-Slot mehr, jeder Zustand
    // hat seinen eigenen Ring. Wird auch von den Seiten-Punkten und dem Label-Boden gebraucht.
    hidden function _pageCount() {
        var n = _ring(_state()).size();
        return n > 0 ? n : 1;
    }

    // UP/DOWN: blättert im Ring des aktuellen Zustands.
    function nextScreen() { screenIdx = (screenIdx + 1) % _pageCount(); }
    function prevScreen() { screenIdx = (screenIdx + _pageCount() - 1) % _pageCount(); }

    function onUpdate(dc) {
        // Start-Marke loeschen, sobald ein Bild nachweislich fertig geworden ist: wir sind ein
        // ZWEITES Mal hier, also hat der erste Durchlauf ueberlebt. Absichtlich nicht am Ende von
        // onUpdate — der Weg dorthin hat mehrere fruehe returns, und ein Absturz mitten im
        // Zeichnen soll die Marke gerade NICHT loeschen. Kostet einen Storage-Write pro App-Start.
        if (_drewOnce) { _rec.bootCanaryClear(); } else { _drewOnce = true; }
        // Dasselbe fuer den generischen Lauf-Canary: ab dem zweiten fertigen Bild ist der
        // Start ueberstanden, ab hier zaehlt ein Absturz als Leerlauf- statt Start-Problem.
        // runMark schreibt nur beim Phasenwechsel, hier passiert also fast immer nichts.
        if (!_rec.isRecording()) { _rec.runMark(_rec.PHASE_IDLE); }

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        // Aufnahme-Start erkennen -> Seiten-State zurücksetzen (damit man vor der Fahrt
        // die gewählte Ansicht sieht, nicht die Übersicht vom letzten Mal).
        var recording = _rec.isRecording();
        if (recording && !_prevRecording) {
            screenIdx = 0; _prevState = null;
        }
        _prevRecording = recording;

        // Nicht am Aufzeichnen -> klar unterscheidbarer Start- bzw. Erfolgs-Screen.
        if (!recording) {
            // Der Erfolgs-Screen laeuft nach 10 s von selbst ab -> Start-Screen. Wer die Uhr nach
            // dem Rausgehen wegsteckt, fand sie sonst beim naechsten Blick immer noch auf
            // „Gespeichert" — ohne GPS-Status, ohne Hinweis auf wartende Uploads.
            if (_rec.stopped && _rec.stoppedAtMs > 0
                    && System.getTimer() - _rec.stoppedAtMs > _rec.STOPPED_AUTO_BACK_MS) {
                _rec.stopped = false;
            }
            if (_rec.stopped) { _drawStopped(dc); } else { _drawIdle(dc); }
            return;
        }

        // Beim Start erst „GPS wird gesucht", dann die Ansichten (sobald Fix da ist).
        if (!_rec.hasGpsFix()) {
            _drawGpsSearch(dc);
            return;
        }

        // Stop-Halten aktiv -> AUSSCHLIESSLICH den Stop/Verwerfen-Screen zeigen. Die
        // Datenfelder werden komplett ausgeblendet (auf schwarzem Grund), auch wenn die
        // Uhr gerade noch „on-foil" denkt — sonst blitzen sie hinter dem Ring durch.
        var spHold = _rec.stopHoldProgress();
        if (spHold > 0.0) {
            _drawStopHold(dc, dc.getWidth(), dc.getHeight(), spHold);
            return;
        }

        // ================= Zustandsmaschine (F3) =================
        // Drei Zustände, jeder mit EIGENEM Seiten-Satz; geblättert wird innerhalb des Zustands
        // (Jan: „je nach status … durch jeweils alle zugehoerigen screens blaettern koennen und
        // durch keine anderen"). Steht der Haken „auch die übrigen Seiten", hängen die anderen
        // Sätze hinten dran — Default, damit niemand Seiten verliert, die er heute erreicht.
        // Ersetzt die frühere Zeitregel (8 s Off-Foil, dann Pause) und den Übersichts-Slot.
        var state = _state();
        if (state != _prevState) {
            screenIdx = 0;                 // neuer Zustand -> vorne anfangen
            if (_prevState != null) { _vibeSwitch(); }
            _pausedAtMs = (state == :paused) ? System.getTimer() : null;
            _prevState = state;
        }
        var ring = _ring(state);
        if (ring.size() == 0) { ring = [[0, Config.FIELD_SPEED3S, 0, 0]]; }
        if (screenIdx >= ring.size()) { screenIdx = 0; }

        var w = dc.getWidth();
        var h = dc.getHeight();
        var entry = ring[screenIdx];

        if (entry instanceof Lang.Array && entry.size() > 0 && entry[0] == 1) {
            _drawLayoutPage(dc, entry, w, h, screenIdx);
            // Pausiert muss auch über einem eigenen Layout erkennbar bleiben. Enthält das Layout
            // den Pflicht-Hinweis (Typ 7), zeichnet ihn der Renderer selbst; fehlt er (Layout von
            // vor F3), blendet die Uhr ihn zusätzlich ein — sonst sitzt man in einer pausierten
            // Aufnahme und hält es für einen Absturz.
            if (state == :paused) {
                // Hinweis nur, wenn das Layout ihn nicht selbst hat; der Fortsetzen-Tipp kurz.
                _drawPausedChrome(dc, w, h, false, !_hasPausedHint(entry), _pauseHintDue());
            }
            _drawDataLossWarn(dc, w, h);
            return;
        }
        var fields = [
            entry.size() > 1 ? entry[1] : Config.FIELD_NONE,
            entry.size() > 2 ? entry[2] : Config.FIELD_NONE,
            entry.size() > 3 ? entry[3] : Config.FIELD_NONE];
        _drawFieldPage(dc, fields, w, h);
        _drawPageDots(dc, w, h, screenIdx, Graphics.COLOR_WHITE, Graphics.COLOR_DK_GRAY);
        if (state == :paused) {
            _drawPausedChrome(dc, w, h, true, true, true);   // klassische Seite: beides, dauerhaft
        } else {
            _drawRec(dc, w / 2, h * 0.085, Graphics.COLOR_RED);
        }
        _drawDataLossWarn(dc, w, h);
    }

    // Rohdaten gehen JETZT verloren: der Uhr-Speicher ist voll, _flushGps/_flushAccel verwerfen die
    // Puffer. Bis 1.0.75 passierte das stumm — ein Nutzer hatte danach eine 54-min-Session mit
    // einem einzigen Lauf und konnte sich das nicht erklaeren (13.08., Instinct 2, zweiter Melder
    // am selben Tag). Deshalb hier, ueber ALLEN Aufnahme-Ansichten, in Rot: solange die Aufnahme
    // laeuft, kann man noch reagieren (pausieren -> dann laedt die Uhr hoch und schafft Platz).
    // VORWARNUNG, bevor Daten verloren gehen: der Puffer reicht noch fuer weniger als
    // STORAGE_WARN_MIN Minuten. Bis 1.0.80 gab es nur die Meldung DANACH (_drawDataLossWarn, rot) —
    // da ist der Lauf schon halb weg. Bedingungen bewusst eng, damit die Zeile nicht dauernd
    // steht:
    //   * kein Handy in Reichweite (mit Handy laedt die Uhr laufend hoch -> Puffer bleibt klein)
    //   * Budget bekannt (sonst wuerde eine erfundene Zahl gezeigt)
    //   * es gehen noch KEINE Daten verloren (dann sticht die rote Meldung)
    // Einmalige Vibration beim Unterschreiten — nicht wiederholt, das waere Gaengelei.
    hidden var _storageWarned = false;

    hidden function _drawStorageWarn(dc, w, h) {
        if (_rec.storageDropped > 0) { return; }
        var min = _rec.storageMinutesLeft();
        var grenze = _rec.storageWarnMinutes();
        if (min < 0 || grenze < 0 || min > grenze) { return; }
        // Mit Handy in Reichweite normalerweise still (der Puffer laeuft ja leer) — ABER unter
        // 3 Minuten trotzdem warnen: dann laeuft der Puffer offensichtlich NICHT leer (Handy
        // verbunden, aber ohne Internet ist der haeufige Fall am Wasser).
        if (Uploader.phoneConnected() && min > 3) { return; }
        if (!_storageWarned) {
            _storageWarned = true;
            _vibeSwitch();
        }
        dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_BLACK);
        // Tilde, weil beides geschaetzt ist: das Budget (gemessen, aber je Geraet verschieden)
        // und das Puffervolumen (pendingKb, ~±30 %).
        _drawWrap(dc, w / 2, h * 0.97, Graphics.FONT_XTINY,
            "~" + min.toString() + " " + Strings.s("err.storageSoon"), true);
        dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
    }

    hidden function _drawDataLossWarn(dc, w, h) {
        if (_rec.storageDropped <= 0) { _drawStorageWarn(dc, w, h); return; }
        // Unten VERANKERT (Unterkante 0,97) statt Oberkante 0,90: mit der alten Rechnung stand
        // die Zeile auf 176 px teilweise ausserhalb des Displays. Schwarzer Textgrund, weil die
        // Warnung ueber den Datenfeldern liegt und bei zwei Zeilen sonst im Wert verschwindet.
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_BLACK);
        _drawWrap(dc, w / 2, h * 0.97, Graphics.FONT_XTINY, Strings.s("err.dataLost"), true);
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
    }

    // Welcher Zustand gilt gerade? Reihenfolge ist wichtig: manuell pausiert sticht alles.
    hidden function _state() {
        if (_rec.isPaused()) { return :paused; }
        return _rec.isFoiling() ? :onFoil : :offFoil;
    }

    // Seiten-Ring des Zustands. Ohne dynamische Layouts sind es die klassischen Ansichten —
    // dieselbe Logik, nur mit [0,a,b,c]-Einträgen, damit Lite-Uhren nichts anderes tun.
    hidden function _setFor(state) {
        var dyn = (_rec.layoutsOn && _rec.pages.size() > 0);
        if (state == :onFoil) {
            if (dyn) { return _rec.pages; }
            var out = [];
            for (var i = 0; i < _rec.screens.size(); i++) {
                var v = _rec.screens[i];
                out.add([0, v[0], v[1], v[2]]);
            }
            return out;
        }
        var lst = (state == :paused) ? _rec.pausePages : _rec.offFoilPages;
        if (lst instanceof Lang.Array && lst.size() > 0) { return lst; }
        var f = (state == :paused) ? _rec.pauseView : _rec.offFoilView;
        return [[0, f[0], f[1], f[2]]];
    }

    hidden function _ring(state) {
        var ring = _setFor(state);
        if (state == :onFoil || !_rec.browseAll) { return ring; }
        // „Auch die übrigen Seiten": erst die des Zustands, dann der Rest in fester Reihenfolge —
        // vorhersehbar statt clever.
        var out = [];
        for (var i = 0; i < ring.size(); i++) { out.add(ring[i]); }
        var extra = (state == :paused)
            ? [_setFor(:onFoil), _setFor(:offFoil)]
            : [_setFor(:onFoil), _setFor(:paused)];
        for (var k = 0; k < extra.size(); k++) {
            var set = extra[k];
            for (var j = 0; j < set.size(); j++) { out.add(set[j]); }
        }
        return out;
    }

    // „Pausiert" + Fortsetzen-Hinweis als Chrome. `full` = klassische Seite (dort ist Platz oben),
    // sonst nur die knappe Zeile, damit ein eigenes Layout nicht zugedeckt wird.
    hidden function _drawPausedChrome(dc, w, h, classic, showPaused, showResume) {
        if (showPaused) {
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_BLACK);
            _drawWrap(dc, w / 2, h * 0.04, Graphics.FONT_XTINY, Strings.s("rec.paused"), false);
        }
        if (showResume) {
            // Unten verankert: mit VCENTER auf 0,955 ragte die halbe Zeilenhoehe unter den
            // Displayrand — auf jeder Groesse, auf kleinen faellt es nur mehr auf.
            dc.setColor(classic ? Graphics.COLOR_LT_GRAY : Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK);
            _drawWrap(dc, w / 2, h * 0.99, Graphics.FONT_XTINY,
                "ENTER: " + Strings.s("rec.resume"), true);
        }
    }

    // Fortsetzen-Hinweis über einem eigenen Layout: nur die ersten Sekunden nach dem Pausieren.
    hidden function _pauseHintDue() {
        return _pausedAtMs != null && System.getTimer() - _pausedAtMs < PAUSE_HINT_MS;
    }

    (:layouts) hidden function _hasPausedHint(entry) {
        var els = (entry.size() > 2 && entry[2] instanceof Lang.Array) ? entry[2] : [];
        for (var i = 0; i < els.size(); i++) {
            if (els[i] instanceof Lang.Array && els[i].size() > 0 && els[i][0] == 7) { return true; }
        }
        return false;
    }
    (:nolayouts) hidden function _hasPausedHint(entry) { return false; }

    // Klassische Seite: bis zu 3 Felder gleichmäßig in einem sicheren Band gestapelt.
    hidden function _drawFieldPage(dc, fields, w, h) {
        var active = [];
        for (var i = 0; i < 3; i++) {
            if (fields[i] != Config.FIELD_NONE) { active.add(fields[i]); }
        }
        var n = active.size();
        if (n == 0) { n = 1; active = [Config.FIELD_SPEED3S]; }
        // Band statt volle Höhe: hält die oberen/unteren Felder vom runden Display-Rand
        // (und von REC-Zeile oben / Seiten-Punkten unten) weg.
        var top = h * 0.13;
        var band = h * 0.74;
        for (var i = 0; i < n; i++) {
            var cy = top + band * (i + 0.5) / n;
            _drawField(dc, active[i], w / 2, cy, n);
        }
    }

    // Seiten-Indikator (Punkte). Farben kommen von außen, damit ein Layout eigene setzen kann.
    hidden function _drawPageDots(dc, w, h, idx, onColor, offColor) {
        var cnt = _pageCount();
        if (cnt <= 1) { return; }
        for (var i = 0; i < cnt; i++) {
            dc.setColor(i == idx ? onColor : offColor, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(w / 2 + (i - (cnt - 1) / 2.0) * 12, h * 0.92, 3);
        }
    }

    // Roter Punkt + „REC" (Position/Farbe von außen, damit ein Layout sie verschieben kann).
    hidden function _drawRec(dc, cx, cy, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx - 24, cy, 5);
        dc.drawText(cx - 12, cy, Graphics.FONT_XTINY, "REC",
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Halten zum Aktions-Menü, EINE Stufe, auf schwarzem Vollbild (keine Datenfelder dahinter):
    // roter Ring füllt sich 0..3 s im Uhrzeigersinn; bei voll öffnet sich das Menü (Speichern/
    // Verwerfen/Pausieren) automatisch. Längeres Halten tut nichts.
    hidden function _drawStopHold(dc, w, h, sp) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var r = (w < h ? w : h) / 2 - 8;
        dc.setPenWidth(12);
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(w / 2, h / 2, r, Graphics.ARC_CLOCKWISE, 90, 90.0 - 360.0 * sp);
        dc.setPenWidth(1);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        _drawWrap(dc, w / 2, h * 0.42, Graphics.FONT_TINY, Strings.s("rec.holdMenu"), false);
    }

    // Idle: nur der Start-Screen. Verbinden + Upload liegen — wie bei nativen
    // Garmin-Aktivitäten ("Laufen Einstellungen") — hinter MENU (Mitte-links halten),
    // erreichbar VOR dem Start der Aufnahme. Während der Aktivität ist Upload eh nicht
    // möglich, deshalb hat der laufende Screen keine Unterseiten mehr.
    hidden function _drawIdle(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        _drawStartPage(dc, w, h);
    }

    hidden function _drawStartPage(dc, w, h) {
        // "Klein" heisst hier NICHT wenige Pixel, sondern wenige ZEILEN — darauf kommt es an.
        // Die fenix 5 hat 240 px, ihr FONT_XTINY ist aber 26 px gross: es passen 7 Zeilen aufs
        // Display, weniger als auf die 176-px-Instinct-2 (8,8). Die fenix 7X Pro (280 px, xtiny
        // 13) fasst 16. Unter 13 Zeilen ruecken Titelband und Inhalt zusammen und die Version
        // entfaellt — sie steht auch auf dem Gespeichert-Screen und im Store.
        var klein = (h < 13 * dc.getFontHeight(Graphics.FONT_XTINY));
        var titleY = klein ? h * 0.10 : h * 0.20;
        // Kleines Telefon-Icon oben, wenn eine aktive Verbindung zum Handy besteht.
        if (Uploader.phoneConnected() && !klein) { _drawPhone(dc, w / 2, h * 0.115); }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, titleY, Graphics.FONT_MEDIUM, "Pumpfoil", Graphics.TEXT_JUSTIFY_CENTER);
        // Version anhand der echten Titel-Font-Höhe darunter -> kein Überlappen (geräteunabhängig).
        var titleH = dc.getFontHeight(Graphics.FONT_MEDIUM);
        var y = titleY + titleH + 2;
        if (!klein) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
            y += dc.getFontHeight(Graphics.FONT_XTINY);
        }
        // Update-Hinweis: kurz nach App-Start einblenden, wenn der Server eine neuere IQ-Store-
        // Version meldet (Config-Abruf setzt updateHintUntilMs). Ganz oben, brand-cyan.
        if (_rec.updateAvailable && System.getTimer() < _rec.updateHintUntilMs) {
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            _drawWrap(dc, w / 2, h * 0.05, Graphics.FONT_XTINY, Strings.s("upd.store"), false);
        }
        // Selbstheilung: letzte Aufnahme mit dynamischem Layout ist abgestürzt -> diese Sitzung
        // läuft statisch. Kurz sagen, damit der Nutzer weiß, warum seine Layouts fehlen.
        _drawLayoutCrashHint(dc, w, h);

        // Ab hier FLIESST die Seite: jede Zeile meldet ihre gezeichnete Hoehe zurueck, der
        // Cursor `y` wandert mit. Vorher stand alles auf festen Bruchteilen der Displayhoehe
        // (0,44 · 0,50 · 0,555 · 0,565 · 0,65) — auf 176 px liegen zwischen 0,50 und 0,555 aber
        // nur 10 px, weniger als eine Zeile hoch ist: Hinweis und Foil-Zeile ueberlappten sich
        // dort schon im Normalfall, und mit Umbruch waere es beliebig schlimm geworden.
        var luft = h * 0.015;
        var xf = Graphics.FONT_XTINY;
        var fh = dc.getFontHeight(xf);
        // Ab hier duerfen nur noch PFLICHT-Zeilen dazukommen: GPS-Status und die eine Warnung.
        // Zusatzzeilen (Foil, "erst hochladen") entfallen, damit die START-Zeile und die
        // Hinweise darunter Platz behalten. Auf der fenix 5 (7 Zeilen aufs ganze Display)
        // waeren sonst allein GPS + Warnung + Zusatz schon ueber dem unteren Rand.
        var mitteMax = h * (klein ? 0.58 : 0.70);
        if (!klein && y < h * 0.44) { y = h * 0.44; }   // grosse Uhren behalten ihr Layout

        // GPS-Status (vorgewärmt seit App-Start) — so weiß man, wann man loslegen kann.
        // Die Zeile wird nach WICHTIGKEIT zusammengesetzt: Zustand steht immer, Auto-Start und
        // Aufzeichnungsrate nur, solange sie in die Zeile passen. Auf 280 px steht alles da,
        // auf 176 px das Wesentliche — statt wie bisher an beiden Enden abgeschnitten zu werden.
        var rl = _rec.recordRateLabel();
        // Puffer-Reichweite: nur OHNE Handy in Reichweite. Mit Handy laedt die Uhr laufend hoch,
        // der Puffer bleibt klein — eine Restzeit waere dort schlicht falsch. Sie steht VOR dem
        // Hz-Label in der Wichtigkeit: „wie lange kann ich aufnehmen" ist mehr wert als „25 Hz".
        var puffer = null;
        if (!Uploader.phoneConnected()) {
            var minLinks = _rec.storageMinutesLeft();
            if (minLinks >= 0) { puffer = "~" + minLinks.toString() + " " + Strings.s("start.bufferMin"); }
        }
        var mw = _usableWidth(dc, y + fh / 2);
        if (_rec.hasGpsFix()) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            var auto = Strings.s("auto.short");
            if (_rec.autoStartOn() && !_rec.autoArmed()) { auto += " " + _rec.autoLead() + "s"; }
            var teile = _rec.autoStartOn() ? [Strings.s("gps.ready"), auto, rl]
                                           : [Strings.s("gps.ready"), rl];
            if (puffer != null) { teile = _rec.autoStartOn() ? [Strings.s("gps.ready"), auto, puffer, rl]
                                                            : [Strings.s("gps.ready"), puffer, rl]; }
            y += _drawWrap(dc, w / 2, y, xf, _zusammen(dc, xf, mw, teile), false) + luft;
        } else {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            var teileS = (puffer != null) ? [Strings.s("gps.searching"), puffer, rl]
                                          : [Strings.s("gps.searching"), rl];
            y += _drawWrap(dc, w / 2, y, xf, _zusammen(dc, xf, mw, teileS), false) + luft;
        }

        // Hinweiszeile, EINE nach Dringlichkeit (Jan, 01.08.): Object-Store voll >
        // ungepairt (Sessions erreichen das Konto nicht — Aufnehmen geht trotzdem) > wartende
        // Uploads (drittes Support-Muster: Session "fehlt", lag aber nur auf der Uhr).
        // Speicher voll: bisher zeigte das NUR der Recorder an. Der Uploader schreibt aber nach
        // jedem bestaetigten Chunk (sa_/sg_) und das Pairing schreibt das Token — scheitert das,
        // erfuhr der Nutzer nichts, obwohl genau das die Ursache ist.
        mw = _usableWidth(dc, y + fh / 2);
        if (_rec.storageFull || Uploader.storageFull() || Config.storeFailed) {
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            y += _drawWrap(dc, w / 2, y, xf, Strings.s("err.storageFull"), false) + luft;
        } else if (!_rec.isPaired()) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            // "MENU: Einstellungen" nur, wenn es in dieselbe Zeile passt — der Hinweis steht
            // ohnehin unten auf der Seite.
            y += _drawWrap(dc, w / 2, y, xf,
                _zusammen(dc, xf, mw, [Strings.s("up.notLinked"), Strings.s("start.menu")]),
                false) + luft;
        } else {
            var pn = Uploader.pendingCount();
            if (pn > 0) {
                // Volumen dazu, nicht nur die Anzahl: 20 kurze Sessions sind weniger Daten als
                // 3 lange (0,6 MB gegen 13 MB). Cache: neu rechnen erst, wenn sich die Anzahl
                // aendert — pendingKb() liest je Session ein state_ und soll nicht pro Bild laufen.
                if (_pendKbFor != pn) { _pendKb = Uploader.pendingKb(); _pendKbFor = pn; }
                var teile2 = [pn + " " + Strings.s("up.pendingN")];
                if (_pendKb >= 1024) { teile2.add((_pendKb / 1024) + " MB"); }
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                y += _drawWrap(dc, w / 2, y, xf, _zusammen(dc, xf, mw, teile2), false) + luft;
                // Auf speicherarmen Uhren (~96 KB) beschaedigt schon EINE wartende Session die
                // naechste Aufnahme: der Store ist voll, die neuen Chunks werden verworfen. Also
                // hier sagen, was zu tun ist, BEVOR er startet — nicht hinterher erklaeren muessen.
                if ((_rec.isLowMemWatch() || _pendKb >= 200) && y < mitteMax) {
                    dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
                    y += _drawWrap(dc, w / 2, y, xf, Strings.s("up.uploadFirst"), false) + luft;
                }
            }
        }

        // Gewählte Foil (per DOWN einstellbar). Glocke daneben, wenn der Alarm an ist.
        // Der Name kommt vom Nutzer -> NICHT umbrechen, sondern hinten kuerzen: ein mitten
        // durchgeschnittener Foil-Name liest sich schlechter als "Foil: Armstro…".
        var hatFoils = (_rec.foils.size() >= 1 || _rec.manualAlarm);
        if (hatFoils && y < mitteMax) {
            var lbl = _rec.activeAlarmLabel.equals("") ? "-" : _rec.activeAlarmLabel;
            var platz = _usableWidth(dc, y + fh / 2) - (_rec.alarmEnabled ? 22 : 0);
            var txt = _kuerzen(dc, Strings.s("foil.prefix") + lbl, xf, platz);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y, xf, txt, Graphics.TEXT_JUSTIFY_CENTER);
            if (_rec.alarmEnabled) {
                var tw = dc.getTextWidthInPixels(txt, xf);
                _drawBell(dc, (w / 2) + (tw / 2) + 9, y + (fh / 2));
            }
            y += fh + luft;
        }

        // Unterer Block (dezente Hinweise) und START-Zeile teilen sich den Rest. Erst MESSEN,
        // dann entscheiden: die START-Zeile ist die wichtigste Zeile der Seite, also fallen im
        // Zweifel die Hinweise weg — zuerst der Foil-Hinweis, dann der MENU-Hinweis. Bisher
        // standen sie auf festen 0,79/0,88 und konnten die START-Zeile ueberschreiben.
        var sf = dc.getFontHeight(Graphics.FONT_SMALL);
        var anker = h * (klein ? 0.60 : 0.65);
        var sy = (y > anker) ? y : anker;
        if (klein) {
            // Kleine Uhren: START und Hinweise FLIESSEN weiter, statt unten verankert zu sein.
            // Am unteren Rand ist eine runde Uhr zu schmal — auf 176 px sind bei 0,95 h nur noch
            // 73 px Sehne uebrig, dort braeuchte "MENU: Einstellungen" drei Zeilen und wuerde
            // deshalb ganz wegfallen. Weiter oben passt es in zwei.
            var unten = h * 0.99;
            if (sy + sf > unten) { sy = unten - sf; }
            if (sy < y) { sy = y; }
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            _drawWrap(dc, w / 2, sy, Graphics.FONT_SMALL, Strings.s("start.rec"), false);
            var yh = sy + sf + 2;
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            if (yh + _wrapHoehe(dc, yh, xf, Strings.s("start.menu"), false) <= unten) {
                yh += _drawWrap(dc, w / 2, yh, xf, Strings.s("start.menu"), false) + 2;
            }
            if (hatFoils && yh + _wrapHoehe(dc, yh, xf, Strings.s("start.chooseAlarm"), false) <= unten) {
                _drawWrap(dc, w / 2, yh, xf, Strings.s("start.chooseAlarm"), false);
            }
            return;
        }
        var yb = h * 0.95;
        var h1 = _wrapHoehe(dc, yb, xf, Strings.s("start.menu"), true);
        var h2 = hatFoils ? _wrapHoehe(dc, yb - h1 - 2, xf, Strings.s("start.chooseAlarm"), true) : 0;
        if (sy + sf > yb - h1 - h2 - 4) { h2 = 0; }
        if (sy + sf > yb - h1 - 4) { h1 = 0; }
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        if (h1 > 0) {
            _drawWrap(dc, w / 2, yb, xf, Strings.s("start.menu"), true);
            if (h2 > 0) { _drawWrap(dc, w / 2, yb - h1 - 2, xf, Strings.s("start.chooseAlarm"), true); }
        }
        // START-Zeile: normalerweise auf 0,65 wie bisher; sie rutscht nur nach unten, wenn die
        // Hinweise darueber mehr Platz brauchen, und nie in den unteren Block hinein.
        var grenze = yb - h1 - h2 - (h1 > 0 ? 4 : 0);
        if (sy + sf > grenze) { sy = grenze - sf; }
        if (sy < y) { sy = y; }
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        _drawWrap(dc, w / 2, sy, Graphics.FONT_SMALL, Strings.s("start.rec"), false);
    }

    // Baut eine Statuszeile aus Teilen NACH WICHTIGKEIT: der erste Teil steht immer, jeder
    // weitere kommt nur dazu, wenn die Zeile damit noch passt. Alternative waere Umbruch — aber
    // eine zweizeilige GPS-Zeile frisst auf 176 px ein Siebtel der Seite, und "· 25 Hz" ist
    // weniger wert als der Platz. Auf grossen Uhren aendert sich nichts, dort passt alles.
    hidden function _zusammen(dc, font, maxW, teile) {
        var out = teile[0];
        for (var i = 1; i < teile.size(); i++) {
            var probe = out + " · " + teile[i];
            if (dc.getTextWidthInPixels(probe, font) > maxW) { return out; }
            out = probe;
        }
        return out;
    }

    // Wie hoch WUERDE _drawWrap zeichnen? Fuer Bloecke, deren Platzbedarf man kennen muss,
    // bevor man entscheidet, ob sie ueberhaupt gezeichnet werden.
    hidden function _wrapHoehe(dc, y, font, text, nachOben) {
        if (text == null || text.equals("")) { return 0; }
        var fh = dc.getFontHeight(font);
        var maxW = _usableWidth(dc, nachOben ? y - fh / 2 : y + fh / 2);
        if (dc.getTextWidthInPixels(text, font) <= maxW) { return fh; }
        return _umbrechen(dc, text, font, maxW).size() * fh;
    }

    // Nach Stopp&Speichern: klare Erfolgsmeldung (nicht mit Aufnahme verwechselbar).
    hidden function _drawStopped(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var xf = Graphics.FONT_XTINY;
        var fh = dc.getFontHeight(xf);
        var klein = (h < 13 * fh);
        // Titel + Haekchen ruecken auf schmalen Uhren nach oben und zusammen, sonst bleibt fuer
        // die drei Hinweise darunter kein Platz: auf 176 px reichte es bisher rechnerisch bis
        // y = 213 bei 176 px Displayhoehe — die letzte Zeile lag komplett ausserhalb.
        var ty = klein ? h * 0.10 : h * 0.28;
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, ty, Graphics.FONT_MEDIUM, Strings.s("saved.title"), Graphics.TEXT_JUSTIFY_CENTER);
        // grünes Häkchen — Groesse und Lage relativ zum Titel statt auf festen Bruchteilen,
        // damit es auf jeder Displaygroesse gleich sitzt.
        var cy = ty + dc.getFontHeight(Graphics.FONT_MEDIUM) + h * 0.06;
        var sz = h * 0.055;
        dc.setPenWidth(4);
        dc.drawLine(w / 2 - sz, cy, w / 2 - sz * 0.3, cy + sz * 0.45);
        dc.drawLine(w / 2 - sz * 0.3, cy + sz * 0.45, w / 2 + sz * 1.1, cy - sz * 0.45);
        dc.setPenWidth(1);

        // Hinweise fliessend statt auf festen Bruchteilen: zwischen 0,62 und 0,72 liegen auf
        // 176 px nur 17 px — weniger als eine XTINY-Zeile hoch ist, die beiden Hinweise
        // ueberlappten sich dort schon ohne Umbruch. Und wenn es eng wird, entscheidet die
        // WICHTIGKEIT, welche Zeile faellt — nicht der Zufall, welche zuerst gezeichnet wird.
        // (Vorher blieb auf der Instinct 2 die Versionsnummer stehen und "START = neue Aufnahme"
        // fiel weg, weil die kurze Zeile zufaellig noch passte.)
        var y = cy + sz + h * 0.03;
        var luft = h * 0.015;
        var unten = h * 0.99;
        var busy = (Uploader.isBusy() || Uploader.pendingCount() > 0);
        // Solange die Uebertragung laeuft/wartet: DEUTLICH sagen, dass die App offen bleiben muss —
        // Connect IQ laedt nur im Vordergrund. Drei Support-Faelle ("Session fehlt", kam Stunden
        // spaeter) hatten genau diese Wissensluecke. Orange, damit es nicht im Grau untergeht.
        var txt = [];
        var col = [];
        if (busy) { txt.add(Strings.s("up.keepOpen")); col.add(Graphics.COLOR_ORANGE); }
        txt.add(Strings.s("saved.upload")); col.add(Graphics.COLOR_LT_GRAY);
        txt.add(Strings.s("saved.newRec")); col.add(Graphics.COLOR_LT_GRAY);
        txt.add("v" + Config.VERSION); col.add(Graphics.COLOR_LT_GRAY);
        var zeigen = new [txt.size()];
        for (var i = 0; i < zeigen.size(); i++) { zeigen[i] = true; }
        // Wegfall-Reihenfolge: zuerst die Version, dann die Upload-Info. Die Warnung und die
        // Handlungsanweisung ("START = neue Aufnahme") bleiben stehen.
        if (_stapelHoehe(dc, y, xf, txt, zeigen, luft) > unten - y) { zeigen[txt.size() - 1] = false; }
        if (_stapelHoehe(dc, y, xf, txt, zeigen, luft) > unten - y) { zeigen[busy ? 1 : 0] = false; }
        for (var i = 0; i < txt.size(); i++) {
            if (!zeigen[i]) { continue; }
            var hoehe = _wrapHoehe(dc, y, xf, txt[i], false);
            if (y + hoehe > unten) { break; }   // Sicherheitsnetz, falls alles zu lang ist
            dc.setColor(col[i], Graphics.COLOR_TRANSPARENT);
            _drawWrap(dc, w / 2, y, xf, txt[i], false);
            y += hoehe + luft;
        }
    }

    // Wie hoch wird der Stapel aus den sichtbaren Zeilen? Laeuft mit, weil die nutzbare Breite
    // (und damit die Zahl der Umbrueche) von der Hoehe abhaengt.
    hidden function _stapelHoehe(dc, y, font, txt, zeigen, luft) {
        var yy = y;
        for (var i = 0; i < txt.size(); i++) {
            if (zeigen[i]) { yy += _wrapHoehe(dc, yy, font, txt[i], false) + luft; }
        }
        return yy - y;
    }

    // Startbildschirm: GPS-Suche, bis ein brauchbarer Fix vorliegt.
    hidden function _drawGpsSearch(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.40, Graphics.FONT_MEDIUM, Strings.s("gps.searchBig"),
            Graphics.TEXT_JUSTIFY_CENTER);
        // animierte Punkte (1 Hz Update)
        var dots = "";
        var k = (System.getTimer() / 500) % 4;
        for (var i = 0; i < k; i++) { dots += "."; }
        dc.drawText(w / 2, h * 0.40 + 34, Graphics.FONT_SMALL, dots,
            Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        _drawWrap(dc, w / 2, h * 0.58, Graphics.FONT_XTINY, Strings.s("gps.sky"), false);
        // Aufnahme läuft bereits (roter Punkt oben).
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w / 2, h * 0.10, 6);
    }

    // Wert + Label + Farbe eines Datenfelds. EINE Quelle für die klassische 3-Feld-Ansicht
    // UND den Layout-Renderer — sonst driften Formatierung/Farb-Buckets auseinander.
    hidden function _fieldParts(type) {
        var value;
        var label;
        var color = Graphics.COLOR_WHITE;
        if (type == Config.FIELD_SPEED3S) {
            var kmh = _rec.speed3s() * 3.6;
            // Schlechtes GPS: "--" statt Phantom-Tempo (100 km/h im Stehen am Steg, 05.08.).
            value = _rec.gpsPoor() ? "--" : kmh.format("%.1f");
            label = Strings.s("f.kmh3s");
            if (_rec.colorByValue && !_rec.gpsPoor()) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_HR) {
            var hr = _rec.currentHr();
            value = hr == null ? "--" : hr.toString();
            label = Strings.s("f.bpm");
            if (_rec.colorByValue && hr != null) { color = _hrColor(hr); }
        } else if (type == Config.FIELD_TIMER) {
            value = _fmtTime(_rec.elapsedTimeMs());
            label = Strings.s("f.time");
        } else if (type == Config.FIELD_DISTANCE) {
            value = _distVal(_rec.distanceM());
            label = _distUnit(_rec.distanceM());
        } else if (type == Config.FIELD_SPEED) {
            var kmh = _rec.currentSpeed() * 3.6;
            value = _rec.gpsPoor() ? "--" : kmh.format("%.1f"); label = Strings.s("f.kmh");
            if (_rec.colorByValue && !_rec.gpsPoor()) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_AVG_SPEED) {
            var kmh = _rec.avgSpeed() * 3.6;
            value = kmh.format("%.1f"); label = Strings.s("f.kmhAvg");
        } else if (type == Config.FIELD_MAX_SPEED) {
            var kmh = _rec.maxSpeed() * 3.6;
            value = kmh.format("%.1f"); label = Strings.s("f.kmhMax");
            if (_rec.colorByValue) { color = _speedColor(kmh); }
        } else if (type == Config.FIELD_AVG_HR) {
            var v = _rec.avgHr();
            value = v == null ? "--" : v.toString(); label = Strings.s("f.bpmAvg");
        } else if (type == Config.FIELD_MAX_HR) {
            var v = _rec.maxHr();
            value = v == null ? "--" : v.toString(); label = Strings.s("f.bpmMax");
        } else if (type == Config.FIELD_ALTITUDE) {
            var v = _rec.altitudeM();
            value = v == null ? "--" : v.format("%.0f"); label = Strings.s("f.mAlt");
        } else if (type == Config.FIELD_ASCENT) {
            var v = _rec.ascentM();
            value = v == null ? "--" : v.format("%.0f"); label = Strings.s("f.mAsc");
        } else if (type == Config.FIELD_TEMPERATURE) {
            var v = _rec.temperatureC();
            value = v == null ? "--" : v.format("%.0f"); label = Strings.s("f.degC");
        } else if (type == Config.FIELD_CLOCK) {
            var c = System.getClockTime();
            value = c.hour.format("%02d") + ":" + c.min.format("%02d"); label = Strings.s("f.clock");
        } else if (type == Config.FIELD_RUN_DURATION) {
            value = _fmtTime(_rec.runDurationMs());
            label = _rec.isFoiling() ? Strings.s("f.runActive") : Strings.s("f.run");
            if (_rec.isFoiling()) { color = Graphics.COLOR_GREEN; }
        } else if (type == Config.FIELD_RUN_DISTANCE) {
            value = _distVal(_rec.runDistanceM());
            label = _distUnit(_rec.runDistanceM()) + " " + (_rec.isFoiling() ? Strings.s("f.runActive") : Strings.s("f.run"));
            if (_rec.isFoiling()) { color = Graphics.COLOR_GREEN; }
        } else if (type == Config.FIELD_LAST_RUN_DURATION) {
            value = _fmtTime(_rec.lastRunDurationMs()); label = Strings.s("f.lastRun");
        } else if (type == Config.FIELD_LAST_RUN_DISTANCE) {
            value = _distVal(_rec.lastRunDistanceM()); label = _distUnit(_rec.lastRunDistanceM()) + " " + Strings.s("f.last");
        } else if (type == Config.FIELD_LAST_RUN_AVG_SPEED) {
            value = (_rec.lastRunAvgSpeed() * 3.6).format("%.1f"); label = Strings.s("f.kmhAvgLast");
        } else if (type == Config.FIELD_LAST_RUN_MAX_SPEED) {
            value = (_rec.lastRunMaxSpeed() * 3.6).format("%.1f"); label = Strings.s("f.kmhMaxLast");
        } else if (type == Config.FIELD_RUN_COUNT) {
            value = _rec.runCount().toString(); label = Strings.s("f.runs");
        } else if (type == Config.FIELD_LAST_RUN_MAX_HR) {
            var lmh = _rec.lastRunMaxHr();
            value = (lmh > 0) ? lmh.toString() : "--"; label = Strings.s("f.bpmMaxLast");
            color = _hrColor(lmh);
        } else {
            value = "--"; label = "";
        }
        return [value, label, color];
    }

    // Verfuegbare Breite AUF HOEHE cy. Auf einer runden Uhr ist die Zeile oben und unten viel
    // kuerzer als in der Mitte (Sehne statt Durchmesser) — bei drei Feldern sitzen genau dort das
    // erste und das dritte. Bisher wurde nie gemessen, ob der Wert dort hinpasst.
    hidden function _usableWidth(dc, cy) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        if (System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_RECTANGLE) {
            return w * 0.96;
        }
        var r = (w < h ? w : h) / 2.0;
        var dy = cy - h / 2.0;
        var q = r * r - dy * dy;
        if (q <= 1.0) { return w * 0.30; }
        return 2.0 * Math.sqrt(q) * 0.94;   // etwas Luft zum Gehaeuserand
    }

    // Groesster Font aus der Liste, in den der Text hier wirklich passt. GEMESSEN, nicht
    // geschaetzt: `getTextWidthInPixels`/`getFontHeight` kennen die echten Geraete-Fonts. Das ist
    // der Kern der Sache — die Fonts skalieren NICHT mit der Displaygroesse. Aus den
    // Geraete-Dateien des SDK (Design-Groesse in px):
    //     fenix 7X Pro 280 px: numberMedium 39, xtiny 13   -> 14 % der Displayhoehe
    //     Instinct 2   176 px: numberMedium 32, xtiny 15   -> 18 %
    //     Forerunner 55 208 px: numberMedium 44, xtiny 13  -> 21 %
    // Auf der kleinen Uhr ist die Zahl also relativ die GROESSTE. Genau deshalb war die
    // klassische Drei-Feld-Seite dort zu voll, waehrend sie auf 280 px gut aussah.
    //
    // Ausgewaehlt wird der HOECHSTE passende Font, nicht der erste passende: die Reihenfolge
    // NUMBER_MILD > LARGE stimmt nicht ueberall (Instinct 2: numberMild 20 < large 23), erst
    // recht nicht ueber 78 Geraete. Die Uhr misst, statt sich auf eine Reihenfolge zu verlassen.
    hidden function _fitFont(dc, text, kandidaten, maxW, maxH) {
        var best = null;
        var bestH = -1;
        for (var i = 0; i < kandidaten.size(); i++) {
            var f = kandidaten[i];
            var fh = dc.getFontHeight(f);
            // HOEHE gegen die TINTE pruefen, nicht gegen die Zeilenbox: `getFontHeight` liefert
            // bei den NUMBER-Fonts die Box inklusive Durchschuss (Faktor ~1,5 zur em-Hoehe, im
            // Simulator gemessen, s. watchLayout.ts). Nimmt man sie als Grenze, schrumpft die
            // Schrift auch dort, wo heute alles sauber passt — eine Verschlechterung in die
            // andere Richtung.
            if (fh > bestH && dc.getTextWidthInPixels(text, f) <= maxW && fh * 0.66 <= maxH) {
                best = f;
                bestH = fh;
            }
        }
        // Nichts passt (sehr kleines Display, sehr langer Text): den kleinsten Kandidaten nehmen.
        if (best == null) {
            best = kandidaten[0];
            bestH = dc.getFontHeight(best);
            for (var i = 1; i < kandidaten.size(); i++) {
                var fh2 = dc.getFontHeight(kandidaten[i]);
                if (fh2 < bestH) { best = kandidaten[i]; bestH = fh2; }
            }
        }
        return best;
    }

    // Bricht einen Text an Leerzeichen um, GEMESSEN gegen die verfuegbare Breite. Greedy
    // (so viele Woerter pro Zeile wie passen) statt "in der Mitte teilen": auf der fenix-5-Reihe
    // ist FONT_XTINY 26 px gross bei 240 px Display — dort reichen zwei Zeilen nicht, "Speicher
    // voll – erst hochladen" braucht drei. Mehr als WRAP_MAX Zeilen gibt es nicht; was dann noch
    // uebrig bleibt, wird in der letzten Zeile gekuerzt.
    hidden const WRAP_MAX = 3;

    hidden function _umbrechen(dc, text, font, maxW) {
        var zeilen = [];
        var akt = "";
        var wort = "";
        var ch = text.toCharArray();
        for (var i = 0; i <= ch.size(); i++) {
            // Ein virtuelles Leerzeichen hinter dem Ende schliesst das letzte Wort ab.
            var c = (i < ch.size()) ? ch[i] : ' ';
            if (c != ' ') { wort += c.toString(); continue; }
            if (wort.equals("")) { continue; }
            var probe = akt.equals("") ? wort : (akt + " " + wort);
            // `akt.equals("")`: ein Wort, das allein schon zu breit ist, kommt trotzdem in die
            // Zeile — sonst entstuende eine leere Zeile und das Wort ginge verloren.
            if (akt.equals("") || dc.getTextWidthInPixels(probe, font) <= maxW) {
                akt = probe;
            } else {
                zeilen.add(akt);
                akt = wort;
            }
            wort = "";
        }
        if (!akt.equals("")) { zeilen.add(akt); }
        if (zeilen.size() > WRAP_MAX) {
            var rest = zeilen[WRAP_MAX - 1];
            for (var k = WRAP_MAX; k < zeilen.size(); k++) { rest += " " + zeilen[k]; }
            zeilen = zeilen.slice(0, WRAP_MAX - 1);
            zeilen.add(_kuerzen(dc, rest, font, maxW));
        }
        return zeilen;
    }

    // Hinweiszeile zeichnen — und UMBRECHEN statt ueber den Rand laufen zu lassen. Kleiner geht
    // es hier nicht: FONT_XTINY IST der kleinste Textfont der Uhr (auf der fenix 5 sind das
    // 26 px auf 240 px Display), und Hinweise duerfen nicht unter die normale Schriftgroesse.
    // Gemessen wird gegen die Sehne auf der jeweiligen Hoehe — am oberen und unteren Rand ist
    // eine runde Uhr nur noch einen Bruchteil so breit wie in der Mitte.
    //   nachOben = false -> y ist die OBERKANTE, der Block waechst nach unten
    //   nachOben = true  -> y ist die UNTERKANTE, der Block waechst nach oben (fuer Zeilen, die
    //                       am unteren Displayrand kleben)
    // Rueckgabe: gezeichnete Hoehe in Pixeln, damit der Aufrufer weiterstapeln kann.
    hidden function _drawWrap(dc, cx, y, font, text, nachOben) {
        if (text == null || text.equals("")) { return 0; }
        var fh = dc.getFontHeight(font);
        var maxW = _usableWidth(dc, nachOben ? y - fh / 2 : y + fh / 2);
        // Schneller Weg: passt ohnehin (der Normalfall auf grossen Uhren) — eine Messung, fertig.
        if (dc.getTextWidthInPixels(text, font) <= maxW) {
            dc.drawText(cx, nachOben ? y - fh : y, font, text, Graphics.TEXT_JUSTIFY_CENTER);
            return fh;
        }
        var zeilen = _umbrechen(dc, text, font, maxW);
        var oben = nachOben ? y - zeilen.size() * fh : y;
        for (var i = 0; i < zeilen.size(); i++) {
            dc.drawText(cx, oben + i * fh, font, zeilen[i], Graphics.TEXT_JUSTIFY_CENTER);
        }
        return zeilen.size() * fh;
    }

    // Einzeiler, der nicht umgebrochen werden darf, weil er Nutzerdaten enthaelt (Foil-Name):
    // hinten kuerzen und mit "…" markieren, statt einen Namen mitten durchzuschneiden.
    hidden function _kuerzen(dc, text, font, maxW) {
        if (dc.getTextWidthInPixels(text, font) <= maxW) { return text; }
        var ch = text.toCharArray();
        for (var n = ch.size() - 1; n > 1; n--) {
            var kurz = text.substring(0, n) + "…";
            if (dc.getTextWidthInPixels(kurz, font) <= maxW) { return kurz; }
        }
        return text;
    }

    hidden function _drawField(dc, type, cx, cy, n) {
        var pp = _fieldParts(type);
        var value = pp[0];
        var label = pp[1];
        dc.setColor(pp[2], Graphics.COLOR_TRANSPARENT);
        // Font-Leiter: so gross wie moeglich, aber nur so gross, wie er an DIESER Stelle passt.
        // Die NUMBER-Fonts enthalten nur Ziffern (plus : . -) und reichen fuer alle Werte; darunter
        // die Text-Fonts als letzter Rueckfall, damit auch "--" und lange Zeiten nie ueberstehen.
        var kandidaten = (n >= 3)
            ? [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE,
               Graphics.FONT_MEDIUM, Graphics.FONT_SMALL]
            : [Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD,
               Graphics.FONT_LARGE, Graphics.FONT_MEDIUM];
        var hh0 = dc.getHeight();
        var slotH = hh0 * 0.74 / n;
        // Beschriftung größer + lesbarer (Nutzer-Feedback): bei 1–2 Feldern FONT_TINY, bei 3 (eng)
        // FONT_XTINY. Abstand aus der echten Fonthöhe statt fixer 30 px — trägt über alle
        // Auflösungen (176…454 px) und ist die Grundlage des Layout-Renderers.
        var lblFont = _fitFont(dc, label,
            (n >= 3) ? [Graphics.FONT_XTINY] : [Graphics.FONT_TINY, Graphics.FONT_XTINY],
            _usableWidth(dc, cy + hh0 * 0.08), hh0);
        // HOEHENBUDGET des Werts. Ein Feld ist NICHT nur die Zahl: darunter haengen Abstand und
        // Beschriftung, und die naechste Zahl steht schon `slotH` tiefer. Ohne diese Rechnung
        // durfte die Zahl fast den ganzen Slot fuellen — auf 176 px (Instinct 2, drei Felder)
        // blieben zwischen Beschriftung und naechstem Wert rechnerisch <1 px, die Seite wirkte
        // ueberfuellt. Zahl ist auf cy zentriert, also zaehlt die halbe Hoehe nach unten:
        //   halbe Zahl + Abstand + Beschriftung <= slotH.
        var gap0 = slotH * 0.33;
        if (gap0 > hh0 * 0.10) { gap0 = hh0 * 0.10; }
        var budget = 2.0 * (slotH - gap0 - dc.getFontHeight(lblFont) * 0.8);
        if (budget > slotH * 0.95) { budget = slotH * 0.95; }
        if (budget < slotH * 0.45) { budget = slotH * 0.45; }   // nie laecherlich klein werden
        var font = _fitFont(dc, value, kandidaten, _usableWidth(dc, cy), budget);
        dc.drawText(cx, cy, font, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        // Label-Abstand: NICHT aus dc.getFontHeight() ableiten. Die Funktion liefert bei den
        // NUMBER-Fonts die ZEILENhöhe inklusive Durchschuss (deutlich mehr als die Ziffernhöhe) —
        // damit landete das Label mitten im NÄCHSTEN Feld statt unter seinem eigenen Wert
        // (Jan im Simulator, zwei Anläufe: /2 klebte am Wert, *0,75 rutschte ins nächste Feld).
        // Stattdessen geometrisch: 33 % der Slot-Höhe (bleibt im eigenen Feld), gekappt auf 10 %
        // der Displayhöhe (sonst schwebt das Label bei nur einem Feld weit weg vom Wert).
        var hh = hh0;
        var y = cy + gap0;
        // Unterste Grenze: das Label darf die Seiten-Punkte (h*0.92, Radius 3) nicht berühren.
        // `drawText` ohne VCENTER setzt die Textkante OBEN an, also die Fonthöhe einrechnen. Auf
        // 240 px (fēnix 5, 3 Felder) lief das Label sonst genau in die Punktreihe — von Jan im
        // Simulator gesehen; auf 280 px fiel es nicht auf, weil dort 26 px Luft bleiben.
        var floorY = hh * 0.92 - 5 - dc.getFontHeight(lblFont);
        if (_pageCount() > 1 && y > floorY) { y = floorY; }
        dc.drawText(cx, y, lblFont, label, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // ================================ Layout-Renderer =================================
    // Zeichnet eine frei gestaltete Seite: [1, bg, [element, …]] mit
    //   element = [typ, x, y, size, color, flags, extra…]
    //   typ 1 Wert (extra Feld-ID) · 2 übersetztes Label (Feld-ID) · 3 Freitext (String)
    //       4 Trennlinie (extra x2,y2; size = Dicke) · 5 REC-Punkt · 6 Seiten-Punkte
    //       8 Rand-Grafik (x = Start auf dem UMFANG ab 12 Uhr im Uhrzeigersinn, y = Länge,
    //         size = Dicke 1…4, extra = Feld-ID) · 9 Balken (x/y = Mitte, extra2 = Breite)
    //       Bei 8/9 färbt flags Bit0 nach Zone/Skala — dort hat Bit0 NICHT die Text-Bedeutung.
    //       Rund -> Ringsegment, eckig -> Rahmensegment: das entscheidet DIESER Renderer aus
    //       der echten Gehäuseform, damit ein Layout auf jeder Uhr passt.
    //   x/y RELATIV 0…1000 -> mal dc.getWidth()/getHeight(): trägt über alle Auflösungen
    //       (176…454 px) und Formen. size = Font-Stufe, color = Index in die Palette.
    //   flags: Bit0 linksbündig, Bit1 rechtsbündig, Bit2 Farbe nach Wert.
    // KOMPLETT hinter (:layouts): die 96-KB-Uhren (LITE) und die 128-KB-Klasse (ENG) bekommen
    // diesen Code nicht mitkompiliert. Server liefert beiden keine Layouts (Gating >= 512 KB).
    // Server-Vertrag + Palette: server/app/api/layouts.py, Vorschau: web/src/lib/watchLayout.ts.
    (:layouts) hidden function _drawLayoutPage(dc, entry, w, h, idx) {
        var bg = _layoutColor(entry.size() > 1 ? entry[1] : 0, Graphics.COLOR_BLACK);
        dc.setColor(bg, bg);
        dc.clear();
        var els = (entry.size() > 2 && entry[2] instanceof Lang.Array) ? entry[2] : [];
        // Trennlinien zuerst (liegen hinter Text), dann der Rest — wie in der Web-Vorschau.
        for (var pass = 0; pass < 2; pass++) {
            for (var i = 0; i < els.size(); i++) {
                var e = els[i];
                if (!(e instanceof Lang.Array) || e.size() < 6) { continue; }
                // Erster Durchlauf: alles, was HINTER dem Text liegt (Linien + Wert-Grafiken).
                var hinten = (e[0] == 4 || e[0] == 8 || e[0] == 9);
                if ((pass == 0) != hinten) { continue; }
                _drawElement(dc, e, w, h, idx);
            }
        }
    }

    (:layouts) hidden function _drawElement(dc, e, w, h, idx) {
        var typ = e[0];
        var x = w * e[1] / 1000.0;
        var y = h * e[2] / 1000.0;
        var step = e[3];
        var flags = e[5];
        if (typ == 4) {                                   // Trennlinie
            if (e.size() < 8) { return; }
            dc.setColor(_layoutColor(e[4], Graphics.COLOR_DK_GRAY), Graphics.COLOR_TRANSPARENT);
            var pen = step < 1 ? 1 : step;
            dc.setPenWidth(pen);
            dc.drawLine(x, y, w * e[6] / 1000.0, h * e[7] / 1000.0);
            dc.setPenWidth(1);
            return;
        }
        if (typ == 8 || typ == 9) {                       // Wert-Grafik (Rand / Balken)
            _drawValueGraphic(dc, e, w, h, typ);
            return;
        }
        if (typ == 5) {                                   // REC-Punkt
            _drawRec(dc, x, y, _layoutColor(e[4], Graphics.COLOR_RED));
            return;
        }
        if (typ == 6) {                                   // Seiten-Punkte
            var c = _layoutColor(e[4], Graphics.COLOR_LT_GRAY);
            _drawPageDots(dc, w, h, idx, c, Graphics.COLOR_DK_GRAY);
            return;
        }
        if (typ == 7) {                                   // „Pausiert"-Hinweis (Pflicht in Pausen-Layouts)
            // NUR zeichnen, wenn die Aufnahme wirklich pausiert ist. Steht „Alle Seiten durchblättern"
            // an, blättert man auch durch die Pausen-Layouts, während ganz normal aufgezeichnet wird —
            // ein „Pausiert" wäre dort schlicht falsch und beunruhigt (Jan, 29.07.). Das Element bleibt
            // im Layout unlöschbar; es blendet sich nur dynamisch aus.
            if (!_rec.isPaused()) { return; }
            var pc = _layoutColor(e[4], Config.BRAND_CYAN);
            dc.setColor(pc, Graphics.COLOR_TRANSPARENT);
            var pf = _layoutFont(step > 2 ? 2 : step, 2);   // klein halten, wie im Editor gedeckelt
            var pj = Graphics.TEXT_JUSTIFY_CENTER;
            if ((flags & 1) != 0) { pj = Graphics.TEXT_JUSTIFY_LEFT; }
            else if ((flags & 2) != 0) { pj = Graphics.TEXT_JUSTIFY_RIGHT; }
            dc.drawText(x, y, pf, Strings.s("rec.paused"), pj | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }
        // Text-Elemente: Wert / übersetztes Label / Freitext.
        var txt = null;
        var col = null;
        if (typ == 1) {
            var pp = _fieldParts(e.size() > 6 ? e[6] : Config.FIELD_NONE);
            txt = pp[0];
            // Bit2: Farbe nach Wert (dieselben Buckets wie die klassische Ansicht).
            if ((flags & 4) != 0) { col = pp[2]; }
        } else if (typ == 2) {
            txt = _fieldParts(e.size() > 6 ? e[6] : Config.FIELD_NONE)[1];
        } else if (typ == 3) {
            txt = (e.size() > 6 && e[6] != null) ? e[6].toString() : "";
        }
        if (txt == null || txt.equals("")) { return; }
        if (col == null) {
            col = _layoutColor(e[4], typ == 1 ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY);
        }
        dc.setColor(col, Graphics.COLOR_TRANSPARENT);
        var just = Graphics.TEXT_JUSTIFY_CENTER;
        if ((flags & 1) != 0) { just = Graphics.TEXT_JUSTIFY_LEFT; }
        else if ((flags & 2) != 0) { just = Graphics.TEXT_JUSTIFY_RIGHT; }
        dc.drawText(x, y, _layoutFont(step, typ), txt, just | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Wert-Grafik: leerer Track + gefüllter Anteil. Rund zeichnet dc.drawArc (glatt und billig),
    // eckig ein Rahmensegment aus Liniensegmenten — dieselbe Rand-Parametrisierung wie Web/Apps
    // (Parameter 0…1 ab 12 Uhr im Uhrzeigersinn).
    (:layouts) hidden function _drawValueGraphic(dc, e, w, h, typ) {
        var fid = (e.size() > 6) ? e[6] : Config.FIELD_NONE;
        var v = _graphicNumber(fid);
        var pen = e[3];
        if (pen == null || pen < 1) { pen = 1; }
        if (pen > 4) { pen = 4; }
        var dicke = (w * 0.018 * pen).toNumber();
        if (dicke < 2) { dicke = 2; }
        var anteil = (v == null) ? 0.0 : _scaleFraction(fid, v);
        var farbe;
        if ((e[5] & 1) != 0 && v != null) {
            farbe = _zoneColorAll(_scaleZone(fid, v));
        } else {
            farbe = _layoutColor(e[4], Config.BRAND_CYAN);
        }
        dc.setPenWidth(dicke);
        if (typ == 9) {                                   // Balken
            var bw = (e.size() > 7 && e[7] != null) ? e[7] : 400;
            if (bw < 50) { bw = 50; }
            if (bw > 1000) { bw = 1000; }
            var breite = w * bw / 1000.0;
            var bx = w * e[1] / 1000.0 - breite / 2.0;
            var by = h * e[2] / 1000.0;
            // „Leerer" Track als dunkelgraue Linie: eine echte Transparenz kennt Monkey C nicht.
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawLine(bx, by, bx + breite, by);
            if (anteil > 0.0) {
                dc.setColor(farbe, Graphics.COLOR_TRANSPARENT);
                var voll = breite * anteil;
                if (voll < dicke) { voll = dicke; }
                dc.drawLine(bx, by, bx + voll, by);
            }
            dc.setPenWidth(1);
            return;
        }
        var laenge = e[2];
        if (laenge == null || laenge < 0) { laenge = 0; }
        if (laenge > 1000) { laenge = 1000; }
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        _drawEdgeSegment(dc, w, h, dicke, e[1], laenge);
        if (anteil > 0.0) {
            dc.setColor(farbe, Graphics.COLOR_TRANSPARENT);
            _drawEdgeSegment(dc, w, h, dicke, e[1], laenge * anteil);
        }
        dc.setPenWidth(1);
    }

    // Randsegment. Start/Länge in 0…1000 des Umfangs, 0 = 12 Uhr, im Uhrzeigersinn.
    (:layouts) hidden function _drawEdgeSegment(dc, w, h, dicke, start, laenge) {
        if (laenge <= 0) { return; }
        var inset = dicke / 2.0 + 1;
        var rund = (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_RECTANGLE);
        if (rund) {
            // drawArc: 0° = 3 Uhr, 90° = 12 Uhr, 180° = 9 Uhr (SDK 9.2.0, Toybox.Graphics.Dc) —
            // die Grade wachsen also GEGEN den Uhrzeigersinn. Unser Parameter läuft ab 12 Uhr im
            // Uhrzeigersinn -> Grad = 90 - 360 * p, gezeichnet mit ARC_CLOCKWISE.
            var r = (w < h ? w : h) / 2.0 - inset;
            var span = 360.0 * (laenge / 1000.0);
            // ZWEI dokumentierte Fallen von drawArc: die Parameter werden gegen Null GEKAPPT, und
            // „degreeStart == degreeEnd" zeichnet den VOLLEN Kreis. Ein winziger Füllstand (z. B.
            // 0,3° bei knapp erreichter Zone) würde damit den ganzen Ring füllen — also erst ab
            // 1° zeichnen und volle Runden bewusst als Vollkreis stehen lassen.
            if (span < 1.0) { return; }
            if (span > 359.0) { span = 360.0; }
            var a1 = 90.0 - 360.0 * (start / 1000.0);
            var a2 = a1 - span;
            while (a1 < 0.0) { a1 += 360.0; }
            while (a1 >= 360.0) { a1 -= 360.0; }
            while (a2 < 0.0) { a2 += 360.0; }
            while (a2 >= 360.0) { a2 -= 360.0; }
            dc.drawArc(w / 2, h / 2, r, Graphics.ARC_CLOCKWISE, a1, a2);
            return;
        }
        // Eckig: Rahmensegment aus Liniensegmenten (nur die 5 rechteckigen Garmin-Modelle).
        var n = (laenge / 40).toNumber();
        if (n < 4) { n = 4; }
        var px = null;
        var py = null;
        for (var i = 0; i <= n; i++) {
            var p = (start + laenge * i / n) / 1000.0;
            var pt = _edgePoint(w, h, inset, p);
            if (px != null) { dc.drawLine(px, py, pt[0], pt[1]); }
            px = pt[0];
            py = pt[1];
        }
    }

    // Punkt auf dem RECHTECK-Rand, Parameter 0…1 ab oberer Mitte im Uhrzeigersinn.
    (:layouts) hidden function _edgePoint(w, h, inset, p) {
        // Ohne Toybox.Math: der Parameter liegt hier immer knapp bei 0…2, Abziehen genügt.
        var f = p;
        while (f >= 1.0) { f -= 1.0; }
        while (f < 0.0) { f += 1.0; }
        var bw = w - 2 * inset;
        var bh = h - 2 * inset;
        var d = f * 2 * (bw + bh);
        if (d < bw / 2) { return [inset + bw / 2 + d, inset]; }
        d -= bw / 2;
        if (d < bh) { return [w - inset, inset + d]; }
        d -= bh;
        if (d < bw) { return [w - inset - d, h - inset]; }
        d -= bw;
        if (d < bh) { return [inset, h - inset - d]; }
        d -= bh;
        return [inset + d, inset];
    }

    // Zahlenwert eines skalierbaren Feldes (km/h bzw. bpm); null = kein Wert.
    (:layouts) hidden function _graphicNumber(fid) {
        if (fid == Config.FIELD_SPEED3S) { return _rec.gpsPoor() ? null : _rec.speed3s() * 3.6; }
        if (fid == Config.FIELD_SPEED) { return _rec.gpsPoor() ? null : _rec.currentSpeed() * 3.6; }
        if (fid == Config.FIELD_AVG_SPEED) { return _rec.avgSpeed() * 3.6; }
        if (fid == Config.FIELD_MAX_SPEED) { return _rec.maxSpeed() * 3.6; }
        if (fid == Config.FIELD_LAST_RUN_AVG_SPEED) { return _rec.lastRunAvgSpeed() * 3.6; }
        if (fid == Config.FIELD_LAST_RUN_MAX_SPEED) { return _rec.lastRunMaxSpeed() * 3.6; }
        if (fid == Config.FIELD_HR) { var hr = _rec.currentHr(); return hr == null ? null : hr * 1.0; }
        if (fid == Config.FIELD_AVG_HR) { var a = _rec.avgHr(); return a == null ? null : a * 1.0; }
        if (fid == Config.FIELD_MAX_HR) { var m = _rec.maxHr(); return m == null ? null : m * 1.0; }
        if (fid == Config.FIELD_LAST_RUN_MAX_HR) {
            var l = _rec.lastRunMaxHr();
            return (l > 0) ? l * 1.0 : null;
        }
        return null;
    }

    // Die sechs Grenzen, die fuer dieses Feld gelten — Puls und Geschwindigkeit sind seit 27.08.
    // gleich gebaut, deshalb reicht EINE Auswahl fuer Farbe, Zone und Fuellgrad.
    hidden function _zonesFor(fid) {
        return _isHrFieldAll(fid) ? _rec.hrZones : _rec.speedZones;
    }

    // Puls-Feld? In JEDEM Build vorhanden — die Wert-FARBE gibt es auch ohne Layout-Renderer.
    hidden function _isHrFieldAll(fid) {
        return fid == Config.FIELD_HR || fid == Config.FIELD_AVG_HR
            || fid == Config.FIELD_MAX_HR || fid == Config.FIELD_LAST_RUN_MAX_HR;
    }

    // Füllgrad 0…1 auf der Skala des Feldes (außerhalb gekappt, nicht extrapoliert).
    (:layouts) hidden function _scaleFraction(fid, v) {
        var g = _zonesFor(fid);
        var lo = g[0] * 1.0;
        var hi = g[5] * 1.0;
        if (hi <= lo) { return 0.0; }
        var f = (v - lo) / (hi - lo);
        if (f < 0.0) { return 0.0; }
        if (f > 1.0) { return 1.0; }
        return f;
    }

    // Zone 0…4 auf den sechs Grenzen des Feldes.
    hidden function _scaleZone(fid, v) {
        return _zoneOf(v, _zonesFor(fid));
    }

    hidden function _zoneOf(v, grenzen) {
        var z = 0;
        for (var i = 1; i <= 4; i++) {
            if (v >= grenzen[i]) { z = i; }
        }
        return z;
    }

    // Größenstufe -> echter Garmin-Font. Ab Stufe 5 sind es NUMBER-Fonts: die enthalten NUR
    // Ziffern, deshalb bekommen Labels/Freitexte (typ 2/3) höchstens FONT_LARGE — sonst wären
    // sie auf der Uhr unsichtbar. Dieselbe Grenze prüft der Server (MAX_TEXT_STEP).
    (:layouts) hidden function _layoutFont(step, typ) {
        var s = step;
        if (typ != 1 && s > 4) { s = 4; }
        if (s <= 0) { return Graphics.FONT_XTINY; }
        if (s == 1) { return Graphics.FONT_TINY; }
        if (s == 2) { return Graphics.FONT_SMALL; }
        if (s == 3) { return Graphics.FONT_MEDIUM; }
        if (s == 4) { return Graphics.FONT_LARGE; }
        if (s == 5) { return Graphics.FONT_NUMBER_MILD; }
        if (s == 6) { return Graphics.FONT_NUMBER_MEDIUM; }
        if (s == 7) { return Graphics.FONT_NUMBER_HOT; }
        return Graphics.FONT_NUMBER_THAI_HOT;
    }

    // Palette-Index -> Gerätefarbe. Index 0 = „auto" -> der übergebene Standard.
    // Reihenfolge identisch mit PALETTE in server/app/api/layouts.py und der Web-Vorschau.
    (:layouts) hidden function _layoutColor(idx, fallback) {
        if (idx == null || idx <= 0) { return fallback; }
        if (idx == 1) { return Graphics.COLOR_WHITE; }
        if (idx == 2) { return Graphics.COLOR_LT_GRAY; }
        if (idx == 3) { return Graphics.COLOR_DK_GRAY; }
        if (idx == 4) { return Graphics.COLOR_BLACK; }
        if (idx == 5) { return Graphics.COLOR_RED; }
        if (idx == 6) { return Graphics.COLOR_ORANGE; }
        if (idx == 7) { return 0xFFAA00; }
        if (idx == 8) { return Graphics.COLOR_YELLOW; }
        if (idx == 9) { return Graphics.COLOR_GREEN; }
        if (idx == 10) { return Graphics.COLOR_DK_GREEN; }
        if (idx == 11) { return 0x00FFFF; }
        if (idx == 12) { return Config.BRAND_CYAN; }
        if (idx == 13) { return Graphics.COLOR_BLUE; }
        if (idx == 14) { return Graphics.COLOR_PURPLE; }
        if (idx == 15) { return Graphics.COLOR_PINK; }
        return fallback;
    }

    // Sparsame Stufen (LITE 96 KB + ENG 128 KB): kein Renderer. Der Server liefert diesen Uhren
    // gar keine Layouts (Gating >= 512 KB), diese Variante ist nur der Kompilier-Ersatz.
    (:nolayouts) hidden function _drawLayoutPage(dc, entry, w, h, idx) {
        _drawFieldPage(dc, [Config.FIELD_SPEED3S, Config.FIELD_NONE, Config.FIELD_NONE], w, h);
    }

    (:layouts) hidden function _drawLayoutCrashHint(dc, w, h) as Void {
        if (!_rec.layoutCrash || System.getTimer() >= _rec.layoutHintUntilMs) { return; }
        dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
        // 0,05 statt 0,03: ganz oben ist die nutzbare Sehne einer runden Uhr am schmalsten,
        // ein paar Prozent tiefer bringt spuerbar Breite (176 px: 60 -> 101 px).
        _drawWrap(dc, w / 2, h * 0.05, Graphics.FONT_XTINY, Strings.s("lay.fallback"), false);
    }
    (:nolayouts) hidden function _drawLayoutCrashHint(dc, w, h) as Void { }

    // Kleine Glocke (~12 px), gezeichnet neben der Foil-Zeile, wenn der Alarm an ist.
    hidden function _drawBell(dc, cx, cy) {
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(cx - 1, cy - 6, 2, 2);                                   // Griff oben
        dc.fillCircle(cx, cy - 3, 3);                                             // Kuppel
        dc.fillPolygon([[cx - 5, cy + 3], [cx + 5, cy + 3], [cx + 3, cy - 2], [cx - 3, cy - 2]]); // Körper
        dc.fillRectangle(cx - 6, cy + 3, 12, 1);                                  // Rand unten
        dc.fillCircle(cx, cy + 6, 1);                                             // Klöppel
    }

    // Kleines Telefon-Icon (grün = aktive Handy-Verbindung).
    hidden function _drawPhone(dc, cx, cy) {
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - 6, cy - 9, 12, 18, 2);                       // Gehäuse
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(cx - 4, cy - 5, 8, 10);                                  // Display
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(cx - 2, cy - 7, 4, 1);                                   // Hörer oben
        dc.fillCircle(cx, cy + 7, 1);                                             // Home-Button
    }

    // Wert-abhängige Farben — aus den PROFIL-ZONEN, derselben Skala, die auch die Grafiken in
    // freien Layouts faerbt (docs/COLOR-ZONES.md). Bis 1.0.80 standen hier feste Stufen
    // (12/16/20 km/h bzw. 120/150/170 bpm), waehrend die Grafik daneben nach Profil faerbte:
    // 15 km/h hiess gruene Zahl UND gelber Ring auf derselben Seite.
    // Ohne Config-Sync gelten die Notnagel-Zonen aus SessionRecorder — die ersten drei
    // Geschwindigkeits-Grenzen sind dort 12/16/20, es sieht also aus wie vorher.
    hidden function _speedColor(kmh) {
        return _zoneColorAll(_zoneOf(kmh, _rec.speedZones));
    }
    hidden function _hrColor(hr) {
        return _zoneColorAll(_zoneOf(hr, _rec.hrZones));
    }

    // Zonen-Farben Z1…Z5 in JEDEM Build (blau ruhig … rot maximal), damit die Wert-Farbe auch
    // auf den kleinen Uhren ohne Layout-Renderer dieselbe Bedeutung hat.
    hidden function _zoneColorAll(z) {
        if (z <= 0) { return Graphics.COLOR_BLUE; }
        if (z == 1) { return Graphics.COLOR_GREEN; }
        if (z == 2) { return Graphics.COLOR_YELLOW; }
        if (z == 3) { return Graphics.COLOR_ORANGE; }
        return Graphics.COLOR_RED;
    }

    // Dauer als M:SS, ab einer Stunde als H:MM:SS (Sekunden immer dabei).
    // Kurze Vibration beim Auto-Wechsel zur Übersicht (= Bestätigung „Lauf beendet").
    hidden function _vibeSwitch() {
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(50, 200)]);
        }
    }

    // Distanz: < 1000 m als ganze Meter, ab 1000 m als km (2 Nachkommastellen).
    hidden function _distVal(m) {
        return m < 1000 ? m.toNumber().toString() : (m / 1000.0).format("%.2f");
    }
    hidden function _distUnit(m) {
        return m < 1000 ? "m" : "km";
    }

    hidden function _fmtTime(ms) {
        var s = ms / 1000;
        var h = s / 3600;
        var m = (s / 60) % 60;
        var sec = s % 60;
        if (h > 0) {
            return h.format("%d") + ":" + m.format("%02d") + ":" + sec.format("%02d");
        }
        return m.format("%d") + ":" + sec.format("%02d");
    }
}
