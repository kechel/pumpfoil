using Toybox.Application.Storage;
using Toybox.Attention;
using Toybox.Lang;
using Toybox.Math;
using Toybox.Graphics;
using Toybox.System;

// DANCE (Jan, 21.10.2026): Tanzerkennung auf der Uhr mit Bestaetigen/Aendern. NUR Tanz-App — nichts
// davon geht je nach watch/ (Regel „nur Pumpfoil -> Tanz", CLAUDE.md).
//
// DIESELBE Rechnung wie server/app/tanz_analyse.py (dort ausfuehrlich, inkl. Nachanalyse und Pruefung).
// Je 10 s (250 Werte bei 25 Hz) ein Fenster:
//   Bewegung  = Streuung des Accel-Betrags (g); tanzend ab 0,08 g und klarem Rhythmus
//   Tempo     = Autokorrelation der SENKRECHTEN Beschleunigung, Abstand 6..37 Werte (40..250 /min; seit
//               21.10. ab 40 statt 71 — Wiener Walzer ~57, Rumba ~48 lagen darunter); der kleinste Abstand
//               mit >= 85 % der staerksten Korrelation gewinnt (Schlag statt Takt)
//   Quer      = Streuung waagrecht / senkrecht (Arm fuehrt seitlich vs. federt)
//   Drehung   = Kreisel um die Senkrechte (Schwerkraft aus dem Accel-Mittel), netto in Umdrehungen
// Vorschlag = naechstes Muster (tanz_muster.json -> Konstanten unten), gemeinsame Streuung je Merkmal.
// Abschnitt beginnt, wenn 3 der letzten 4 Fenster tanzend sind, endet nach 4 ruhigen in Folge.
// Bedienung (Jan, 21.10.): der Datenbildschirm zeigt NUR Uhrzeit + erkannten Tanz. HOCH/RUNTER waehlt
// einen anderen Tanz, START kurz = bestaetigen („passt"); START halten bleibt Stopp.
// Jede Bestaetigung ist ein MARKER (Zeitpunkt + Tanz) und sonst nichts (Jan, 21.10.: „die marker
// koennen vorher oder hinterher oder zwischen Taenzen gesetzt werden, das wird jeder anders machen,
// also ist das nur ein Indikator"). Die Uhr deutet NICHT, wofuer er gilt — das macht der Server.
// Laeuft gerade ein erkannter Abschnitt, bekommt er die Wahl zusaetzlich als `gewaehlt`.
// Zu Beginn eines erkannten Abschnitts vibriert die Uhr kurz. Befunde: docs/TODO.md Inbox 21.10.
//
// Speicher: Abschnitte in Storage "tz_<uuid>" als
//   [start_ms, ende_ms (-1 = laeuft), vorschlag (null bei manuell), gewaehlt (null),
//    quelle 0 auto|1 bestaetigt|2 geaendert|3 manuell (nur 0.1-0.3)|4 nachtraeglich (nur 0.4)|5 Marker,
//    tempo_median, dreh_anteil_prozent]
// Uploader schickt die Liste im /complete als "tanz" mit (Server: app/tanz.py).
module Tanz {
    const N = 250;
    const MIN_LAG = 6;
    const MAX_LAG = 37;
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
    // MUSTER-BEGINN (erzeugt: scripts/tanz_muster_ableiten.py --uhr; nicht von Hand aendern)
    const M_TEMPO = [113, 65, 60, 58, 107, 97, 63, 48, 60, 123, 79, 66, 125, 131];
    const M_QUER = [871, 739, 666, -1, 702, 789, 848, 796, -1, 831, 667, -1, -1, 722];     // x1000, -1 = keine Daten
    const M_UMDR = [-1, 420, 495, -1, 423, 174, 218, 364, -1, 272, 422, -1, -1, 204];     // Umdrehungen je 10 s x1000, -1 = keine Daten
    const M_GESCH = [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0];   // 1 = geschaetzt (ohne eigene Daten)
    // MUSTER-ENDE
    const S_TEMPO = 0.15; const S_QUER = 0.15; const S_UMDR = 0.2;   // wie tanz_analyse.py

    var _uuid = null;
    var _ax = new [N]; var _ay = new [N]; var _az = new [N];
    var _x = new [N];            // Arbeitspuffer (senkrecht), wird ueber mehrere Pakete ausgewertet
    // Autokorrelation verteilt: je Sensorpaket (~1 s) hoechstens LAGS_JE_PAKET Abstaende, damit ein
    // Aufruf nie in die Zeitsperre (Watchdog) laeuft. Ergebnis ~4 s nach Fensterende.
    const LAGS_JE_PAKET = 9;
    var _lag = -1;               // naechster zu rechnender Abstand, -1 = nichts offen
    var _r = new [MAX_LAG + 2];
    var _p = null;               // [ms, akt, quer, umdr, r0] des Fensters in Arbeit
    var _bpm = 0;                // letzter gemessener Rhythmus (/min), fuer die Anzeige
    var _bpmZeit = 0;            // System-ms dazu
    var _verlaufUhr = [];        // je Fenster EINE Zahl (s. _packen); Fenster liegen lueckenlos ab _verlaufT0
    var _verlaufT0 = -1;
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
    var _marker = [];            // Marker, getrennt von den Abschnitten (die letzte Zeile dort ist der offene)
    var _ebenText = null;        // letzter Marker: Anzeige-Text „14:32 Boogie"
    var _ebenBis = 0;            // bis dahin hervorgehoben (frisch gesetzt)
    var _jetzt = 0;              // letzte Session-ms aus add()
    var _wahl = -1;              // Index in KEYS (+ KEYS.size() = „Kein Tanz") beim Blaettern, -1 = nicht
    var _wahlBis = 0;            // System-ms, ab dann faellt eine unbestaetigte Wahl zurueck

    function start(uuid) as Void {
        _uuid = uuid; _n = 0; _sx = 0.0; _sy = 0.0; _sz = 0.0;
        _gx = []; _gy = []; _gz = [];
        _folge = 0; _kand = []; _offen = false; _abschnitte = []; _marker = []; _hist = []; _ebenText = null;
        _lag = -1; _p = null; _bpm = 0; _verlaufUhr = []; _verlaufT0 = -1;
        _wahl = -1; _jetzt = 0;
    }

    // Ein Sensorpaket (~1 s). a = accelerometerData (milli-g), g = gyroscopeData (Grad/s) oder null.
    function add(a, g, ms) as Void {
        if (_uuid == null || a == null || a.x == null) { return; }
        _jetzt = ms;
        if (_lag >= 0) { _lagsRechnen(); }
        var k = a.x.size();
        var mitG = (g != null && g.x != null && g.x.size() == k);
        for (var i = 0; i < k; i++) {
            var x = a.x[i] / 1000.0; var y = a.y[i] / 1000.0; var z = a.z[i] / 1000.0;
            _ax[_n] = x; _ay[_n] = y; _az[_n] = z;
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
        if (_lag >= 0) { _lagsFertig(); }    // voriges Fenster noch offen: abschliessen, BEVOR _x neu belegt wird
        // Schwerkraft-Richtung = Mittel des Fensters
        var nn = Math.sqrt(_sx * _sx + _sy * _sy + _sz * _sz);
        if (nn <= 0) { return; }
        var ux = _sx / nn; var uy = _sy / nn; var uz = _sz / nn;
        // Betrag (fuer die Bewegung), senkrecht (Tempo), waagrecht (Quer)
        var mb = 0.0; var mb2 = 0.0; var mv = 0.0; var mh = 0.0; var mh2 = 0.0;
        for (var i = 0; i < N; i++) {
            var x = _ax[i]; var y = _ay[i]; var z = _az[i];
            var b = Math.sqrt(x * x + y * y + z * z);
            var v = x * ux + y * uy + z * uz;
            var hx = x - v * ux; var hy = y - v * uy; var hz = z - v * uz;
            var h = Math.sqrt(hx * hx + hy * hy + hz * hz);
            mb += b; mb2 += b * b; mh += h; mh2 += h * h;
            _x[i] = v; mv += v;
        }
        mb = mb / N; mv = mv / N; mh = mh / N;
        var vb = mb2 / N - mb * mb;
        var akt = (vb > 0) ? Math.sqrt(vb) : 0.0;
        var vh = mh2 / N - mh * mh;
        for (var i = 0; i < N; i++) { _x[i] = _x[i] - mv; }
        var r0 = 0.0;
        for (var i = 0; i < N; i++) { r0 += _x[i] * _x[i]; }
        var sv = Math.sqrt(r0 / N);
        var quer = (sv > 0 && vh > 0) ? Math.sqrt(vh) / sv : 0.0;
        var umdr = -1.0;     // -1 = kein Kreisel
        if (_gx.size() > 0) {
            var grad = 0.0;
            for (var i = 0; i < _gx.size(); i++) { grad += _gx[i] * ux + _gy[i] * uy + _gz[i] * uz; }
            umdr = (grad * 0.04) / 360.0;
            if (umdr < 0) { umdr = -umdr; }
        }
        _p = [ms, akt, quer, umdr, r0];
        _lag = MIN_LAG - 1;
    }

    // Ein Fenster als eine Zahl (spart Speicher und Upload): tempo 0..255 | klar% 0..127 << 8 |
    // quer% 0..255 << 15 | umdr% 0..253 (254 = kein Kreisel) << 23 — bleibt unter 2^31. Server: app/tanz.py fenster_entpacken.
    function _packen(tempo, klar, quer, umdr) {
        var t = (tempo > 255) ? 255 : tempo;
        var k = (klar * 100).toNumber(); if (k > 127) { k = 127; } if (k < 0) { k = 0; }
        var q = (quer * 100).toNumber(); if (q > 255) { q = 255; }
        var u = (umdr < 0) ? 254 : (umdr * 100).toNumber(); if (u > 253) { u = 253; }
        return t + (k << 8) + (q << 15) + (u << 23);
    }

    function _lagsRechnen() as Void {
        var bis = _lag + LAGS_JE_PAKET;
        if (bis > MAX_LAG + 1) { bis = MAX_LAG + 1; }
        for (var L = _lag; L <= bis; L++) {
            var s = 0.0;
            for (var i = L; i < N; i++) { s += _x[i] * _x[i - L]; }
            _r[L] = s;
        }
        _lag = bis + 1;
        if (_lag > MAX_LAG + 1) { _lagsFertig(); }
    }

    function _lagsFertig() as Void {
        while (_lag >= 0 && _lag <= MAX_LAG + 1) {   // Rest am Stueck (nur im Notfall)
            var s = 0.0;
            for (var i = _lag; i < N; i++) { s += _x[i] * _x[i - _lag]; }
            _r[_lag] = s; _lag++;
        }
        _lag = -1;
        var ms = _p[0]; var akt = _p[1]; var quer = _p[2]; var umdr = _p[3]; var r0 = _p[4];
        var r = _r;
        var best = 0.0;
        for (var L = MIN_LAG; L <= MAX_LAG; L++) { if (r[L] > best) { best = r[L]; } }
        var lag = -1;
        for (var L = MIN_LAG; L <= MAX_LAG; L++) {
            if (r[L] >= 0.85 * best && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { lag = L; break; }
        }
        var klar = (r0 > 0 && lag > 0 && best > 0) ? r[lag] / r0 : 0.0;
        var tempo = 0;
        if (lag > 0 && best > 0) {
            var d = r[lag - 1] - 2 * r[lag] + r[lag + 1];
            var lf = lag + ((d != 0) ? 0.5 * (r[lag - 1] - r[lag + 1]) / d : 0.0);
            tempo = (1500.0 / lf).toNumber();
        }
        var gedreht = (umdr >= DREH_WIN) ? 1 : 0;
        if (akt >= AKT_G && klar >= KLAR && tempo > 0) { _bpm = tempo; _bpmZeit = System.getTimer(); }
        if (_verlaufT0 < 0) { _verlaufT0 = ms - 10000; }
        if (_verlaufUhr.size() < 1080) { _verlaufUhr.add(_packen(tempo, klar, quer, umdr)); }   // bis 3 h
        if (_verlaufUhr.size() % 6 == 0) { _speichern(); }   // jede Minute sichern
        var tanzt = akt >= AKT_G && klar >= KLAR;
        var w = [ms - 10000, tempo, gedreht, quer, umdr, (akt >= AKT_G && klar >= KLAR) ? 1 : 0];
        _hist.add(tanzt ? 1 : 0);
        if (_hist.size() > 4) { _hist = _hist.slice(1, null); }
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
        _offen = false; _folge = 0; _kand = []; _hist = [];
        _speichern();
    }

    // Laufender Abschnitt bei Stopp der Aufnahme schliessen (SessionRecorder).
    function stopp(ms) as Void {
        if (_lag >= 0) { _lagsFertig(); }
        if (_offen) { _beenden(ms); }
        _speichern();
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

    // Median einer Spalte (nur Fenster mit Wert >= 0)
    function _medianSp(ws, sp) {
        var t = [];
        for (var i = 0; i < ws.size(); i++) { if (ws[i][sp] >= 0) { t.add(ws[i][sp]); } }
        if (t.size() == 0) { return -1; }
        for (var i = 1; i < t.size(); i++) {
            var v = t[i]; var j = i - 1;
            while (j >= 0 && t[j] > v) { t[j + 1] = t[j]; j--; }
            t[j + 1] = v;
        }
        return t[t.size() / 2];
    }

    // Vorschlag = Muster mit dem kleinsten Abstand (wie tanz_analyse.bewerten). Der zuletzt bestaetigte
    // Tanz gewinnt, wenn er hoechstens 1,0 schlechter ist (gleiches Lied, gleicher Tanz).
    function _vorschlag(ws) {
        var t = _median(ws);
        var q = _medianSp(ws, 3);
        var u = _medianSp(ws, 4);
        var besterI = 0; var besterD = 1.0e9; var letzterD = 1.0e9;
        for (var i = 0; i < KEYS.size(); i++) {
            var d = 0.0;
            if (t > 0 && M_TEMPO[i] > 0) {
                var lt = Math.ln(t) - Math.ln(M_TEMPO[i]);
                var d0 = (lt / S_TEMPO) * (lt / S_TEMPO);
                var lo = (lt - 0.6931) / S_TEMPO; var hi = (lt + 0.6931) / S_TEMPO;
                var d1 = lo * lo + 1.0; var d2 = hi * hi + 1.0;
                d += (d0 < d1) ? ((d0 < d2) ? d0 : d2) : ((d1 < d2) ? d1 : d2);
            } else { d += 4.0; }
            if (M_QUER[i] >= 0) { var dq = (q - M_QUER[i] / 1000.0) / S_QUER; d += dq * dq; } else { d += 1.5; }
            if (u >= 0) {
                if (M_UMDR[i] >= 0) { var du = (u - M_UMDR[i] / 1000.0) / S_UMDR; d += du * du; } else { d += 1.5; }
            }
            if (M_GESCH[i] == 1) { d += 1.0; }
            if (d < besterD) { besterD = d; besterI = i; }
            if (_letzter != null && KEYS[i].equals(_letzter)) { letzterD = d; }
        }
        if (_letzter != null && letzterD <= besterD + 1.0) { return _letzter; }
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
        var alle = [];
        alle.addAll(_abschnitte);
        alle.addAll(_marker);
        try { Storage.setValue("tz_" + _uuid, alle); } catch (e) {}
        try { Storage.setValue("tv_" + _uuid, { "t0" => _verlaufT0, "w" => _verlaufUhr }); } catch (e) {}
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

    // START kurz: das Gezeigte bestaetigen = Marker setzen. Rueckgabe false = nichts zu bestaetigen.
    function bestaetigen() as Lang.Boolean {
        var z = _anzeige();
        var key = z[0];
        _wahl = -1;
        if (key == null) { return false; }
        if (_offen && _abschnitte.size() > 0) {
            var a = _abschnitte[_abschnitte.size() - 1];
            a[3] = key;
            a[4] = (a[2] != null && key.equals(a[2])) ? 1 : 2;
        }
        // Marker immer, mit dem, was die Uhr in dem Moment zeigte (Vorschlag), als Hinweis fuer den Server.
        var gezeigt = null;
        if (_offen && _abschnitte.size() > 0) { gezeigt = _abschnitte[_abschnitte.size() - 1][2]; }
        _marker.add([_jetzt, _jetzt, gezeigt, key, 5, 0, 0]);
        _speichern();
        if (!key.equals("kein")) { _letzter = key; }
        _eben(key);
        _vibrieren();
        return true;
    }

    function _eben(key) as Void {
        var c = System.getClockTime();
        _ebenText = c.hour.format("%02d") + ":" + c.min.format("%02d") + " " + name(key);
        _ebenBis = System.getTimer() + 6000;
    }

    // ZURUECK: laufende Auswahl verwerfen. Rueckgabe false = es gab keine.
    function abbrechen() as Lang.Boolean {
        if (_wahl < 0) { return false; }
        _wahl = -1;
        return true;
    }

    // Datenbildschirm: Uhrzeit gross; darunter, was die UHR erkennt (klar getrennt von Jans Markern),
    // was eine Taste jetzt tut, und ganz unten der letzte Marker (Jan, 21.10.: „es sollte ersichtlich
    // sein ob das noch manuell ist oder erkannt wurde, sprich ob man etwas bestaetigen koennte").
    function zeichnen(dc) as Void {
        var w = dc.getWidth(); var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        var c = System.getClockTime();
        var zeit = c.hour.format("%02d") + ":" + c.min.format("%02d");
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 24 / 100, Graphics.FONT_NUMBER_HOT, zeit,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        // Rhythmus der Uhr (Auf-und-ab je min, letzte 30 s) — Jan, 21.10.: „die aktuelle bpm die erkannt wird"
        if (_bpm > 0 && System.getTimer() - _bpmZeit < 30000) {
            dc.setColor(Config.BRAND_CYAN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 39 / 100, Graphics.FONT_XTINY, _bpm.toString() + " /min",
                        Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        var z = _anzeige();
        var kopf; var text; var farbe; var aktion;
        if (z[1] == :wahl) {
            kopf = "Auswahl"; text = name(z[0]); farbe = Config.BRAND_CYAN;
            aktion = "START = Marker  ZURÜCK = weg";
        } else if (z[1] == :auto) {
            kopf = "Uhr erkennt"; text = name(z[0]) + "?"; farbe = Config.BRAND_CYAN;
            aktion = "START = passt";
        } else if (z[1] == :ok) {
            kopf = "Uhr erkennt"; text = name(z[0]); farbe = Graphics.COLOR_WHITE;
            aktion = "bestätigt";
        } else {
            kopf = "Uhr erkennt"; text = "nichts"; farbe = Graphics.COLOR_LT_GRAY;
            aktion = "HOCH/RUNTER = Marker setzen";
        }
        var xt = Graphics.FONT_XTINY;
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 49 / 100, xt, kopf, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(farbe, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 60 / 100, Graphics.FONT_MEDIUM, text,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 72 / 100, xt, aktion, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (_ebenText != null) {
            var frisch = System.getTimer() < _ebenBis;
            dc.setColor(frisch ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 84 / 100, xt, (frisch ? "Marker gesetzt: " : "Marker ") + _ebenText,
                        Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}
