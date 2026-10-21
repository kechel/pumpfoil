using Toybox.Application.Storage;
using Toybox.Attention;
using Toybox.Lang;
using Toybox.Math;
using Toybox.Graphics;
using Toybox.System;

// DANCE (Jan, 21.10.2026): Tanzerkennung auf der Uhr mit Bestaetigen/Aendern. NUR Tanz-App — nichts
// davon geht je nach watch/ (Regel „nur Pumpfoil -> Tanz", CLAUDE.md).
//
// Je 10 s (250 Werte bei 25 Hz) ein Fenster:
//   Bewegung  = Streuung des Accel-Betrags (g); tanzend ab 0,08 g und klarem Rhythmus
//   Tempo     = Autokorrelation des Betrags, Abstand 6..21 Werte (71..250 /min); der kleinste Abstand
//               mit >= 85 % der staerksten Korrelation gewinnt (Schlag statt Takt)
//   Drehung   = Kreisel um die Senkrechte (Schwerkraft aus dem Accel-Mittel), netto in Umdrehungen
// Abschnitt beginnt, wenn 3 der letzten 4 Fenster tanzend sind, endet nach 4 ruhigen in Folge.
// Bedienung (Jan, 21.10.): der Datenbildschirm zeigt NUR Uhrzeit + erkannten Tanz. HOCH/RUNTER waehlt
// einen anderen Tanz, START kurz = bestaetigen („passt"); START halten bleibt Stopp. Ohne Erkennung
// startet eine Bestaetigung einen manuellen Abschnitt ab jetzt; „Kein Tanz" bestaetigt beendet ihn.
// Zu Beginn eines erkannten Abschnitts vibriert die Uhr kurz. Befunde: docs/TODO.md Inbox 21.10.
//
// Speicher: Abschnitte in Storage "tz_<uuid>" als
//   [start_ms, ende_ms (-1 = laeuft), vorschlag (null bei manuell), gewaehlt (null),
//    quelle 0 auto|1 bestaetigt|2 geaendert|3 manuell,
//    tempo_median, dreh_anteil_prozent]
// Uploader schickt die Liste im /complete als "tanz" mit (Server: app/tanz.py).
module Tanz {
    const N = 250;
    const MIN_LAG = 6;
    const MAX_LAG = 21;
    const AKT_G = 0.08;
    const KLAR = 0.15;        // 21.10.: 0,3 erkannte im Boogie nur 11 von 58 min, 0,15 ~41
    const DREH_WIN = 0.8;      // Umdrehungen je 10 s, ab dann zaehlt das Fenster als „gedreht" (Samba P90 0,77)
    const START_N = 3;
    const ENDE_N = 4;          // 40 s ruhig = Ende (kurze Haenger ueberbruecken)

    // Schluessel -> Anzeige. Reihenfolge = Menue (Standard, Latein, Gesellschaftstaenze).
    const KEYS = ["lw", "tango", "ww", "slowfox", "quickstep", "samba", "chacha", "rumba", "paso", "jive",
                  "salsa", "bachata", "discofox", "boogie"];
    const NAMEN = ["Langsamer Walzer", "Tango", "Wiener Walzer", "Slowfox", "Quickstep", "Samba", "Cha-Cha-Cha",
                   "Rumba", "Paso Doble", "Jive", "Salsa", "Bachata", "Disco-Fox", "Boogie"];
    // Erste Schaetzung: Tempo der Auf-und-ab-Bewegung am Handgelenk je Tanz (/min), aus Jans Sessions
    // 14.-19.10. (LW ~92, Samba ~96, Salsa ~87, Jive ~117-132, Boogie ~126) und Musiktempi. Grob — die
    // Bestaetigungen sind die eigentliche Wahrheit, der Server lernt daraus.
    const VON = [80, 118, 0, 100, 95, 88, 115, 95, 115, 112, 78, 65, 112, 120];
    const BIS = [100, 135, 0, 115, 110, 102, 132, 110, 128, 138, 95, 82, 130, 134];

    var _uuid = null;
    var _x = new [N];
    var _n = 0;
    var _sx = 0.0; var _sy = 0.0; var _sz = 0.0;
    var _yaw = [];               // Drehraten (Grad/s) je Accel-Wert des Fensters, fuer die Senkrechte
    var _gx = []; var _gy = []; var _gz = [];
    var _hist = [];              // tanzend ja/nein der letzten 4 Fenster
    var _folge = 0;              // tanzende Fenster in Folge (vor dem Start) bzw. ruhige (im Abschnitt)
    var _kand = [];              // Fenster-Ergebnisse [ms, tempo, gedreht] seit dem moeglichen Beginn
    var _offen = false;
    var _abschnitte = [];
    var _letzter = null;         // zuletzt bestaetigter Tanz (Vorrang bei gleichem Tempo)
    var _offenManuell = false;   // offener Abschnitt kam von Jan, nicht aus der Erkennung
    var _jetzt = 0;              // letzte Session-ms aus add()
    var _wahl = -1;              // Index in KEYS (+ KEYS.size() = „Kein Tanz") beim Blaettern, -1 = nicht
    var _wahlBis = 0;            // System-ms, ab dann faellt eine unbestaetigte Wahl zurueck

    function start(uuid) as Void {
        _uuid = uuid; _n = 0; _sx = 0.0; _sy = 0.0; _sz = 0.0;
        _gx = []; _gy = []; _gz = [];
        _folge = 0; _kand = []; _offen = false; _offenManuell = false; _abschnitte = []; _hist = [];
        _wahl = -1; _jetzt = 0;
    }

    // Ein Sensorpaket (~1 s). a = accelerometerData (milli-g), g = gyroscopeData (Grad/s) oder null.
    function add(a, g, ms) as Void {
        if (_uuid == null || a == null || a.x == null) { return; }
        _jetzt = ms;
        var k = a.x.size();
        var mitG = (g != null && g.x != null && g.x.size() == k);
        for (var i = 0; i < k; i++) {
            var x = a.x[i] / 1000.0; var y = a.y[i] / 1000.0; var z = a.z[i] / 1000.0;
            _x[_n] = Math.sqrt(x * x + y * y + z * z);
            _sx += x; _sy += y; _sz += z;
            if (mitG) { _gx.add(g.x[i]); _gy.add(g.y[i]); _gz.add(g.z[i]); }
            _n++;
            if (_n == N) {
                _fenster(ms - ((k - 1 - i) * 40));
                _n = 0; _sx = 0.0; _sy = 0.0; _sz = 0.0; _gx = []; _gy = []; _gz = [];
            }
        }
    }

    function _fenster(ms) as Void {
        var m = 0.0;
        for (var i = 0; i < N; i++) { m += _x[i]; }
        m = m / N;
        for (var i = 0; i < N; i++) { _x[i] = _x[i] - m; }
        var r0 = 0.0;
        for (var i = 0; i < N; i++) { r0 += _x[i] * _x[i]; }
        var akt = Math.sqrt(r0 / N);
        var r = new [MAX_LAG + 2];
        var best = 0.0;
        for (var L = MIN_LAG - 1; L <= MAX_LAG + 1; L++) {
            var s = 0.0;
            for (var i = L; i < N; i++) { s += _x[i] * _x[i - L]; }
            r[L] = s;
            if (L >= MIN_LAG && L <= MAX_LAG && s > best) { best = s; }
        }
        var lag = -1;
        for (var L = MIN_LAG; L <= MAX_LAG; L++) {
            if (r[L] >= 0.85 * best && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { lag = L; break; }
        }
        var klar = (r0 > 0 && lag > 0) ? r[lag] / r0 : 0.0;
        var tempo = 0;
        if (lag > 0) {
            var d = r[lag - 1] - 2 * r[lag] + r[lag + 1];
            var lf = lag + ((d != 0) ? 0.5 * (r[lag - 1] - r[lag + 1]) / d : 0.0);
            tempo = (1500.0 / lf).toNumber();
        }
        var gedreht = 0;
        if (_gx.size() > 0) {
            var nn = Math.sqrt(_sx * _sx + _sy * _sy + _sz * _sz);
            if (nn > 0) {
                var ux = _sx / nn; var uy = _sy / nn; var uz = _sz / nn;
                var grad = 0.0;
                for (var i = 0; i < _gx.size(); i++) { grad += _gx[i] * ux + _gy[i] * uy + _gz[i] * uz; }
                var umdr = (grad * 0.04) / 360.0;
                if (umdr < 0) { umdr = -umdr; }
                if (umdr >= DREH_WIN) { gedreht = 1; }
            }
        }
        var tanzt = akt >= AKT_G && klar >= KLAR;
        var w = [ms - 10000, tempo, gedreht];
        _hist.add(tanzt ? 1 : 0);
        if (_hist.size() > 4) { _hist = _hist.slice(1, null); }
        if (_offenManuell) { if (tanzt) { _kand.add(w); } return; }   // Jan hat das Sagen
        if (!_offen) {
            if (tanzt) { _kand.add(w); }
            var summe = 0;
            for (var i = 0; i < _hist.size(); i++) { summe += _hist[i]; }
            if (tanzt && summe >= START_N) { _beginnen(); }
            else if (summe == 0) { _kand = []; }
        } else {
            if (tanzt) { _kand.add(w); _folge = 0; }
            else {
                _folge++;
                if (_folge >= ENDE_N) { _beenden(ms - ENDE_N * 10000); }
            }
        }
    }

    function _beginnen() as Void {
        _offen = true; _folge = 0;
        var v = _vorschlag(_kand);
        _abschnitte.add([_kand[0][0], -1, v, null, 0, _median(_kand), _drehProzent(_kand)]);
        _speichern();
        _wahl = -1;
        _vibrieren();
    }

    function _beenden(ende) as Void {
        var a = _abschnitte[_abschnitte.size() - 1];
        a[1] = ende;
        if (a[4] == 0) { a[2] = _vorschlag(_kand); }   // unbestaetigt: Vorschlag aus dem ganzen Abschnitt
        a[5] = _median(_kand); a[6] = _drehProzent(_kand);
        _offen = false; _offenManuell = false; _folge = 0; _kand = []; _hist = [];
        _speichern();
    }

    // Laufender Abschnitt bei Stopp der Aufnahme schliessen (SessionRecorder).
    function stopp(ms) as Void {
        if (_offen) { _beenden(ms); }
    }

    function _median(ws) {
        var t = [];
        for (var i = 0; i < ws.size(); i++) { if (ws[i][1] > 0) { t.add(ws[i][1]); } }
        if (t.size() == 0) { return 0; }
        // kleine Listen: einfach sortieren (Einfuegen)
        for (var i = 1; i < t.size(); i++) {
            var v = t[i]; var j = i - 1;
            while (j >= 0 && t[j] > v) { t[j + 1] = t[j]; j--; }
            t[j + 1] = v;
        }
        return t[t.size() / 2];
    }

    function _drehProzent(ws) {
        if (ws.size() == 0) { return 0; }
        var n = 0;
        for (var i = 0; i < ws.size(); i++) { n += ws[i][2]; }
        return (100 * n) / ws.size();
    }

    // Vorschlag: viel Drehung -> Wiener Walzer; sonst Taenze, deren Tempo-Bereich passt (der zuletzt
    // bestaetigte zuerst), sonst der mit der naechsten Bereichsmitte.
    function _vorschlag(ws) {
        if (ws.size() >= 6 && _drehProzent(ws) >= 50) { return "ww"; }
        var t = _median(ws);
        if (_letzter != null) {
            var li = KEYS.indexOf(_letzter);
            if (li >= 0 && VON[li] > 0 && t >= VON[li] && t <= BIS[li]) { return _letzter; }
        }
        var besterI = 0; var besterD = 99999;
        for (var i = 0; i < KEYS.size(); i++) {
            if (VON[i] == 0) { continue; }
            var mitte = (VON[i] + BIS[i]) / 2;
            var d = (t >= VON[i] && t <= BIS[i]) ? 0 : ((t < mitte) ? mitte - t : t - mitte);
            if (d < besterD) { besterD = d; besterI = i; }
        }
        return KEYS[besterI];
    }

    function name(key) as Lang.String {
        if (key == null) { return "?"; }
        if (key.equals("kein")) { return "Kein Tanz"; }
        var i = KEYS.indexOf(key);
        return (i >= 0) ? NAMEN[i] : key;
    }

    function _speichern() as Void {
        if (_uuid == null) { return; }
        try { Storage.setValue("tz_" + _uuid, _abschnitte); } catch (e) {}
    }

    // --- Bedienung auf dem Datenbildschirm ---

    function _vibrieren() as Void {
        if (Toybox has :Attention && Attention has :vibrate) {
            try { Attention.vibrate([new Attention.VibeProfile(60, 250), new Attention.VibeProfile(0, 150),
                                     new Attention.VibeProfile(60, 250)]); } catch (e) {}
        }
    }

    // Was gerade gilt: [key oder null, Zustand] — Zustand :wahl (blaettert, unbestaetigt),
    // :auto (erkannt, unbestaetigt), :ok (bestaetigt), :nichts.
    function _anzeige() {
        if (_wahl >= 0 && System.getTimer() > _wahlBis) { _wahl = -1; }
        if (_wahl >= 0) { return [_wahlKey(_wahl), :wahl]; }
        if (_offen && _abschnitte.size() > 0) {
            var a = _abschnitte[_abschnitte.size() - 1];
            if (a[3] != null) { return [a[3], :ok]; }
            return [a[2], :auto];
        }
        return [null, :nichts];
    }

    function _wahlKey(i) { return (i >= KEYS.size()) ? "kein" : KEYS[i]; }

    // HOCH/RUNTER: ab dem gerade gezeigten Tanz weiterblaettern (Liste + „Kein Tanz").
    function blaettern(d) as Void {
        var n = KEYS.size() + 1;
        if (_wahl < 0) {
            var k = _anzeige()[0];
            var i = (k == null) ? -1 : (k.equals("kein") ? KEYS.size() : KEYS.indexOf(k));
            _wahl = (i < 0) ? ((d > 0) ? 0 : n - 1) : (i + d + n) % n;
        } else {
            _wahl = (_wahl + d + n) % n;
        }
        _wahlBis = System.getTimer() + 15000;   // ohne Bestaetigung nach 15 s zurueck
    }

    // START kurz: das Gezeigte bestaetigen. Rueckgabe false = nichts zu bestaetigen.
    function bestaetigen() as Lang.Boolean {
        var z = _anzeige();
        var key = z[0];
        _wahl = -1;
        if (key == null) { return false; }
        if (_offen && _abschnitte.size() > 0) {
            var a = _abschnitte[_abschnitte.size() - 1];
            if (_offenManuell) {
                if (key.equals(a[3])) { _vibrieren(); return true; }
                _beenden(_jetzt);                      // anderer Tanz bzw. „Kein Tanz": manuellen schliessen
                if (!key.equals("kein")) { _manuell(key); }
            } else {
                a[3] = key;
                a[4] = (a[2] != null && key.equals(a[2])) ? 1 : 2;
                _speichern();
            }
        } else if (!key.equals("kein")) {
            _manuell(key);
        }
        if (!key.equals("kein")) { _letzter = key; }
        _vibrieren();
        return true;
    }

    function _manuell(key) as Void {
        _abschnitte.add([_jetzt, -1, null, key, 3, 0, 0]);
        _offen = true; _offenManuell = true; _folge = 0; _kand = [];
        _speichern();
    }

    // Datenbildschirm: Uhrzeit gross, darunter der Tanz.
    function zeichnen(dc) as Void {
        var w = dc.getWidth(); var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        var c = System.getClockTime();
        var zeit = c.hour.format("%02d") + ":" + c.min.format("%02d");
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 30 / 100, Graphics.FONT_NUMBER_HOT, zeit,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        var z = _anzeige();
        var text; var farbe; var unten = null;
        if (z[1] == :nichts) {
            text = "kein Tanz"; farbe = Graphics.COLOR_LT_GRAY; unten = "HOCH/RUNTER = Tanz wählen";
        } else if (z[1] == :ok) {
            text = name(z[0]); farbe = Graphics.COLOR_WHITE; unten = "bestätigt";   // kein ✓: nicht in jeder Uhr-Schrift
        } else if (z[1] == :auto) {
            text = name(z[0]) + "?"; farbe = Config.BRAND_CYAN; unten = "START = passt";
        } else {
            text = name(z[0]); farbe = Config.BRAND_CYAN; unten = "START = bestätigen";
        }
        dc.setColor(farbe, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 62 / 100, Graphics.FONT_MEDIUM, text,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (unten != null) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 78 / 100, Graphics.FONT_XTINY, unten,
                        Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}
