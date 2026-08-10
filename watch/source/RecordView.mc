using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Attention;

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
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.055, Graphics.FONT_XTINY, Strings.s("rec.paused"),
                Graphics.TEXT_JUSTIFY_CENTER);
        }
        if (showResume) {
            dc.setColor(classic ? Graphics.COLOR_LT_GRAY : Graphics.COLOR_WHITE,
                Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.955, Graphics.FONT_XTINY, "ENTER: " + Strings.s("rec.resume"),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // Fortsetzen-Hinweis über einem eigenen Layout: nur die ersten Sekunden nach dem Pausieren.
    hidden function _pauseHintDue() {
        return _pausedAtMs != null && System.getTimer() - _pausedAtMs < PAUSE_HINT_MS;
    }

    (:full) hidden function _hasPausedHint(entry) {
        var els = (entry.size() > 2 && entry[2] instanceof Lang.Array) ? entry[2] : [];
        for (var i = 0; i < els.size(); i++) {
            if (els[i] instanceof Lang.Array && els[i].size() > 0 && els[i][0] == 7) { return true; }
        }
        return false;
    }
    (:lite) hidden function _hasPausedHint(entry) { return false; }

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
        dc.drawText(w / 2, h * 0.42, Graphics.FONT_TINY, Strings.s("rec.holdMenu"),
            Graphics.TEXT_JUSTIFY_CENTER);
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
        var titleY = h * 0.20;
        // Kleines Telefon-Icon oben, wenn eine aktive Verbindung zum Handy besteht.
        if (Uploader.phoneConnected()) { _drawPhone(dc, w / 2, h * 0.115); }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, titleY, Graphics.FONT_MEDIUM, "Pumpfoil", Graphics.TEXT_JUSTIFY_CENTER);
        // Version anhand der echten Titel-Font-Höhe darunter -> kein Überlappen (geräteunabhängig).
        var titleH = dc.getFontHeight(Graphics.FONT_MEDIUM);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, titleY + titleH + 2, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
        // Update-Hinweis: kurz nach App-Start einblenden, wenn der Server eine neuere IQ-Store-
        // Version meldet (Config-Abruf setzt updateHintUntilMs). Ganz oben, brand-cyan.
        if (_rec.updateAvailable && System.getTimer() < _rec.updateHintUntilMs) {
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.03, Graphics.FONT_XTINY, Strings.s("upd.store"), Graphics.TEXT_JUSTIFY_CENTER);
        }
        // Selbstheilung: letzte Aufnahme mit dynamischem Layout ist abgestürzt -> diese Sitzung
        // läuft statisch. Kurz sagen, damit der Nutzer weiß, warum seine Layouts fehlen.
        _drawLayoutCrashHint(dc, w, h);
        // GPS-Status (vorgewärmt seit App-Start) — so weiß man, wann man loslegen kann.
        // Aufzeichnungsrate hinten dran (Config-Check: 25 Hz / 10 Hz / GPS).
        var rl = _rec.recordRateLabel();
        if (_rec.hasGpsFix()) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            var gtxt = Strings.s("gps.ready");
            // Auto-Start: während des Vorlaufs Countdown „Auto-Start Ns", danach nur „Auto-Start" (scharf).
            if (_rec.autoStartOn()) {
                gtxt += " · " + Strings.s("auto.short");
                if (!_rec.autoArmed()) { gtxt += " " + _rec.autoLead() + "s"; }
            }
            gtxt += " · " + rl;
            dc.drawText(w / 2, h * 0.44, Graphics.FONT_XTINY, gtxt, Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.44, Graphics.FONT_XTINY, Strings.s("gps.searching") + " · " + rl, Graphics.TEXT_JUSTIFY_CENTER);
        }
        // Hinweiszeile bei h*0.50, EINE nach Dringlichkeit (Jan, 01.08.): Object-Store voll >
        // ungepairt (Sessions erreichen das Konto nicht — Aufnehmen geht trotzdem) > wartende
        // Uploads (drittes Support-Muster: Session "fehlt", lag aber nur auf der Uhr).
        // Speicher voll: bisher zeigte das NUR der Recorder an. Der Uploader schreibt aber nach
        // jedem bestaetigten Chunk (sa_/sg_) und das Pairing schreibt das Token — scheitert das,
        // erfuhr der Nutzer nichts, obwohl genau das die Ursache ist.
        if (_rec.storageFull || Uploader.storageFull() || Config.storeFailed) {
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.50, Graphics.FONT_XTINY, Strings.s("err.storageFull"), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (!_rec.isPaired()) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.50, Graphics.FONT_XTINY,
                Strings.s("up.notLinked") + " · " + Strings.s("start.menu"), Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            var pn = Uploader.pendingCount();
            if (pn > 0) {
                // Volumen dazu, nicht nur die Anzahl: 20 kurze Sessions sind weniger Daten als
                // 3 lange (0,6 MB gegen 13 MB). Nur bei nennenswerter Menge, damit die Zeile auf
                // kleinen Displays kurz bleibt. Cache: neu rechnen erst, wenn sich die Anzahl
                // aendert — pendingKb() liest je Session ein state_ und soll nicht pro Bild laufen.
                if (_pendKbFor != pn) { _pendKb = Uploader.pendingKb(); _pendKbFor = pn; }
                var txt = pn + " " + Strings.s("up.pendingN");
                if (_pendKb >= 1024) { txt += " · " + (_pendKb / 1024) + " MB"; }
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, h * 0.50, Graphics.FONT_XTINY, txt, Graphics.TEXT_JUSTIFY_CENTER);
            }
        }
        // Gewählte Foil (per DOWN einstellbar). Glocke daneben, wenn der Alarm an ist.
        if (_rec.foils.size() >= 1 || _rec.manualAlarm) {
            var lbl = _rec.activeAlarmLabel.equals("") ? "-" : _rec.activeAlarmLabel;
            var txt = Strings.s("foil.prefix") + lbl;
            var ty = h * 0.555;
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, ty, Graphics.FONT_XTINY, txt, Graphics.TEXT_JUSTIFY_CENTER);
            if (_rec.alarmEnabled) {
                var tw = dc.getTextWidthInPixels(txt, Graphics.FONT_XTINY);
                var bh = dc.getFontHeight(Graphics.FONT_XTINY);
                _drawBell(dc, (w / 2) + (tw / 2) + 9, ty + (bh / 2));
            }
        }
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.65, Graphics.FONT_SMALL, Strings.s("start.rec"), Graphics.TEXT_JUSTIFY_CENTER);
        // Dezente Hinweise: Foil-Auswahl per DOWN, Einstellungen (Verbinden/Upload) hinter MENU.
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        if (_rec.foils.size() >= 1 || _rec.manualAlarm) {
            dc.drawText(w / 2, h * 0.79, Graphics.FONT_XTINY, Strings.s("start.chooseAlarm"), Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.88, Graphics.FONT_XTINY, Strings.s("start.menu"), Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.drawText(w / 2, h * 0.84, Graphics.FONT_XTINY, Strings.s("start.menu"), Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    // Nach Stopp&Speichern: klare Erfolgsmeldung (nicht mit Aufnahme verwechselbar).
    hidden function _drawStopped(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.28, Graphics.FONT_MEDIUM, Strings.s("saved.title"), Graphics.TEXT_JUSTIFY_CENTER);
        // grünes Häkchen
        dc.setPenWidth(4);
        dc.drawLine(w / 2 - 14, h * 0.46, w / 2 - 4, h * 0.50);
        dc.drawLine(w / 2 - 4, h * 0.50, w / 2 + 16, h * 0.42);
        dc.setPenWidth(1);
        // Solange die Uebertragung laeuft/wartet: DEUTLICH sagen, dass die App offen bleiben muss —
        // Connect IQ laedt nur im Vordergrund. Drei Support-Faelle ("Session fehlt", kam Stunden
        // spaeter) hatten genau diese Wissensluecke. Orange, damit es nicht im Grau untergeht.
        if (Uploader.isBusy() || Uploader.pendingCount() > 0) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.545, Graphics.FONT_XTINY, Strings.s("up.keepOpen"), Graphics.TEXT_JUSTIFY_CENTER);
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, Strings.s("saved.upload"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.72, Graphics.FONT_XTINY, Strings.s("saved.newRec"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.85, Graphics.FONT_XTINY, "v" + Config.VERSION, Graphics.TEXT_JUSTIFY_CENTER);
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
        dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY, Strings.s("gps.sky"),
            Graphics.TEXT_JUSTIFY_CENTER);
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
        } else {
            value = "--"; label = "";
        }
        return [value, label, color];
    }

    hidden function _drawField(dc, type, cx, cy, n) {
        var pp = _fieldParts(type);
        var value = pp[0];
        var label = pp[1];
        dc.setColor(pp[2], Graphics.COLOR_TRANSPARENT);
        var font = (n >= 3) ? Graphics.FONT_NUMBER_MEDIUM : Graphics.FONT_NUMBER_HOT;
        dc.drawText(cx, cy, font, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        // Beschriftung größer + lesbarer (Nutzer-Feedback): bei 1–2 Feldern FONT_TINY, bei 3 (eng)
        // FONT_XTINY. Abstand aus der echten Fonthöhe statt fixer 30 px — trägt über alle
        // Auflösungen (176…454 px) und ist die Grundlage des Layout-Renderers.
        var lblFont = (n >= 3) ? Graphics.FONT_XTINY : Graphics.FONT_TINY;
        // Label-Abstand: NICHT aus dc.getFontHeight() ableiten. Die Funktion liefert bei den
        // NUMBER-Fonts die ZEILENhöhe inklusive Durchschuss (deutlich mehr als die Ziffernhöhe) —
        // damit landete das Label mitten im NÄCHSTEN Feld statt unter seinem eigenen Wert
        // (Jan im Simulator, zwei Anläufe: /2 klebte am Wert, *0,75 rutschte ins nächste Feld).
        // Stattdessen geometrisch: 33 % der Slot-Höhe (bleibt im eigenen Feld), gekappt auf 10 %
        // der Displayhöhe (sonst schwebt das Label bei nur einem Feld weit weg vom Wert).
        var hh = dc.getHeight();
        var slot = hh * 0.74 / n;
        var gap = slot * 0.33;
        if (gap > hh * 0.10) { gap = hh * 0.10; }
        var y = cy + gap;
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
    //   x/y RELATIV 0…1000 -> mal dc.getWidth()/getHeight(): trägt über alle Auflösungen
    //       (176…454 px) und Formen. size = Font-Stufe, color = Index in die Palette.
    //   flags: Bit0 linksbündig, Bit1 rechtsbündig, Bit2 Farbe nach Wert.
    // KOMPLETT hinter (:full): die 96-KB-Uhren bekommen diesen Code nicht mitkompiliert.
    // Server-Vertrag + Palette: server/app/api/layouts.py, Vorschau: web/src/lib/watchLayout.ts.
    (:full) hidden function _drawLayoutPage(dc, entry, w, h, idx) {
        var bg = _layoutColor(entry.size() > 1 ? entry[1] : 0, Graphics.COLOR_BLACK);
        dc.setColor(bg, bg);
        dc.clear();
        var els = (entry.size() > 2 && entry[2] instanceof Lang.Array) ? entry[2] : [];
        // Trennlinien zuerst (liegen hinter Text), dann der Rest — wie in der Web-Vorschau.
        for (var pass = 0; pass < 2; pass++) {
            for (var i = 0; i < els.size(); i++) {
                var e = els[i];
                if (!(e instanceof Lang.Array) || e.size() < 6) { continue; }
                var isLine = (e[0] == 4);
                if ((pass == 0) != isLine) { continue; }
                _drawElement(dc, e, w, h, idx);
            }
        }
    }

    (:full) hidden function _drawElement(dc, e, w, h, idx) {
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

    // Größenstufe -> echter Garmin-Font. Ab Stufe 5 sind es NUMBER-Fonts: die enthalten NUR
    // Ziffern, deshalb bekommen Labels/Freitexte (typ 2/3) höchstens FONT_LARGE — sonst wären
    // sie auf der Uhr unsichtbar. Dieselbe Grenze prüft der Server (MAX_TEXT_STEP).
    (:full) hidden function _layoutFont(step, typ) {
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
    (:full) hidden function _layoutColor(idx, fallback) {
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

    // Lite-Build (96-KB-Uhren): kein Renderer. Der Server liefert diesen Uhren gar keine
    // Layouts (Gating >= 512 KB), diese Variante ist nur der Kompilier-Ersatz.
    (:lite) hidden function _drawLayoutPage(dc, entry, w, h, idx) {
        _drawFieldPage(dc, [Config.FIELD_SPEED3S, Config.FIELD_NONE, Config.FIELD_NONE], w, h);
    }

    (:full) hidden function _drawLayoutCrashHint(dc, w, h) as Void {
        if (!_rec.layoutCrash || System.getTimer() >= _rec.layoutHintUntilMs) { return; }
        dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.03, Graphics.FONT_XTINY, Strings.s("lay.fallback"),
            Graphics.TEXT_JUSTIFY_CENTER);
    }
    (:lite) hidden function _drawLayoutCrashHint(dc, w, h) as Void { }

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

    // Wert-abhängige Farben (Buckets, gut ablesbar auf der Uhr).
    hidden function _speedColor(kmh) {
        if (kmh < 12) { return Graphics.COLOR_BLUE; }
        if (kmh < 16) { return Graphics.COLOR_GREEN; }
        if (kmh < 20) { return Graphics.COLOR_YELLOW; }
        return Graphics.COLOR_RED;
    }
    hidden function _hrColor(hr) {
        if (hr < 120) { return Graphics.COLOR_GREEN; }
        if (hr < 150) { return Graphics.COLOR_YELLOW; }
        if (hr < 170) { return Graphics.COLOR_ORANGE; }
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
