using Toybox.System;
using Toybox.Lang;

// Erinnerung in der Pause (Jan, 22.10.2026): alle 10 min deutlich vibrieren und auf den Bildschirm zum
// Fortsetzen/Beenden springen — IMMER, nicht abschaltbar („wenn man das nicht will kann man ja speichern
// und spaeter neu starten"). Anlass: eine Apple-Watch-Pause (vermutlich Wasser/Aermel auf dem Knopf) blieb
// 85 min unbemerkt stehen, alle Laeufe danach fehlten (#17726). Nur VOLL-Build: Lite kann nicht pausieren.
// Eigenes Modul statt Membern in SessionRecorder (253-Member-Grenze der 128-KB-Builds).
(:full)
module PauseMahner {
    const ABSTAND_MS = 600000;
    var _seit = null;      // System.getTimer() beim ersten Takt in der Pause
    var _schon = 0;        // wie viele Erinnerungen in dieser Pause schon kamen

    // Einmal je Sekundentakt. true = jetzt erinnern.
    function faellig(pausiert) as Lang.Boolean {
        if (!pausiert) { _seit = null; _schon = 0; return false; }
        var jetzt = System.getTimer();
        if (_seit == null) { _seit = jetzt; _schon = 0; return false; }
        var n = (jetzt - _seit) / ABSTAND_MS;
        if (n > _schon) { _schon = n; return true; }
        return false;
    }
}
