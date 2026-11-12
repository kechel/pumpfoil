using Toybox.Lang;
using Toybox.Math;
using Toybox.Position;

// GPS-Luecke am Lauf-Ende (12.11.2026). Anlass: Uhr zeigte 1:34 als laengsten Lauf, der Server 1:09.
// Der Fahrer stuerzte, die Uhr war danach 36 s unter Wasser (kein GPS). In der Luecke haelt Garmin die
// letzte Geschwindigkeit, die Lauferkennung sah kein „langsam" und zaehlte ~25 s weiter, bis die
// Fix-Qualitaet absank.
//
// Regel (Jan: „waehrend eines runs vorsichtiger damit umgehen, aber wenn dann wieder ein gps-fix kommt
// koennten die last-run anzeigen so eine pruefung vornehmen"), angeglichen an den Server
// (server/app/analysis/gps.py GAP_SPLIT_S = 15):
//   - Waehrend des Laufs wird NIE wegen einer Luecke unterbrochen, solange sie hoechstens 15 s dauert.
//   - Endet ein Lauf und lag direkt vor dem Ende eine Luecke (> 3 s ohne brauchbaren Fix), entscheidet
//     die Strecke ueber die Luecke: Luftlinie letzter Fix davor -> erster Fix danach, geteilt durch die
//     Dauer. Ab 2,5 m/s (Ende-Schwelle) war er durchgefahren, alles zaehlt. Sonst (oder Luecke laeuft noch)
//     endet der Lauf am letzten guten Fix (brauchbar + Tempo >= 2,5 m/s): Dauer, Strecke, Max-Puls von dort.
//   - Luecke ueber 15 s mitten im Lauf: der Lauf endet rueckwirkend am letzten guten Fix, auch wenn es
//     danach schnell weitergeht (dann beginnt ein neuer Lauf, keine Fortsetzung) — wie der Server.
//
// Eigenes Modul statt Felder in SessionRecorder: die 128-KB-Stufe steht dort am Limit von 253
// Instanz-Mitgliedern (Memory garmin-sessionrecorder-memberlimit). Zeiten sind timerTime-ms
// (elapsedTimeMs), Strecken elapsedDistance (distanceM) — dieselben Achsen wie _updateRun.
//
// NUR VOLL + ENG (`(:full)`). LITE (96 KB, Instinct 2) bekommt den leeren Ersatz unten: die Korrektur
// kostet ~1,1 KB Code, und die Lite-Fassung darf nicht wachsen (Jan, 25.09.2026).
(:full)
module LaufLuecke {
    const LUECKE_MS = 3000;     // so lange ohne brauchbaren Fix = Luecke
    const TRENN_MS = 15000;     // Server GAP_SPLIT_S
    const FAHR_MPS = 2.5;       // = RUN_EXIT_MPS

    var gT = -1;                // letzter guter Fix: Zeit, Strecke, Max-Puls des Laufs bis dahin
    var gD = 0.0;
    var gHr = 0;
    var fT = -1;                // letzter brauchbarer Fix ueberhaupt (Zeit, Lage in Grad)
    var fLa = 0.0;
    var fLo = 0.0;
    var aT = -1;                // letzte geschlossene Luecke: Beginn (= Fix davor), Ende, Tempo ueber die Luftlinie
    var bT = -1;
    var aV = 0.0;
    var pT = -1;                // guter Fix VOR dieser Luecke (der erste Fix danach ueberschreibt gT schon)
    var pD = 0.0;
    var pHr = 0;
    var trennen = false;        // Luecke > 15 s im Lauf geschlossen -> _updateRun beendet den Lauf

    function reset() as Void {
        gT = -1; fT = -1; aT = -1; bT = -1; aV = 0.0; pT = -1; trennen = false;
    }

    // Je Positions-Event waehrend der Aufnahme (nicht in der Pause).
    function fix(t, d, la, lo, spd, q, hr, laeuft) as Void {
        if (q == null || q < Position.QUALITY_USABLE) { return; }   // schlechter Fix zaehlt als Luecke
        if (fT >= 0 && t - fT > LUECKE_MS) {
            var dla = Math.toRadians(la - fLa);
            var dlo = Math.toRadians(lo - fLo) * Math.cos(Math.toRadians((la + fLa) / 2.0));
            var m = 6371000.0 * Math.sqrt(dla * dla + dlo * dlo);
            aT = fT; bT = t; aV = m / ((t - fT) / 1000.0);
            pT = gT; pD = gD; pHr = gHr;
            if (laeuft && t - fT > TRENN_MS) { trennen = true; }
        }
        fT = t; fLa = la; fLo = lo;
        if (spd != null && spd >= FAHR_MPS) { gT = t; gD = d; gHr = hr; }
    }

    // Beim Lauf-Ende: null = nichts zu korrigieren, sonst [Zeit, Strecke, Max-Puls] des letzten guten Fixes.
    function schnitt(jetzt, start) {
        // Luecke laeuft noch (kein brauchbarer Fix seit > 3 s): Ende am letzten guten Fix.
        if (fT >= 0 && jetzt - fT > LUECKE_MS) {
            return (gT >= 0 && gT >= start) ? [gT, gD, gHr] : null;
        }
        // Sonst zaehlt nur eine Luecke, die das Letzte im Lauf war: nach ihrem Ende kein weiterer guter Fix
        // (ausser dem ersten danach). Ist er danach weitergefahren, endet der Lauf normal.
        if (aT < 0 || gT > bT || pT < 0 || pT < start) { return null; }
        if (bT - aT <= TRENN_MS && aV >= FAHR_MPS) { return null; }      // ueber die Luecke durchgefahren
        return [pT, pD, pHr];
    }
}

(:lite)
module LaufLuecke {
    var trennen = false;
    function reset() as Void {}
    function fix(t, d, la, lo, spd, q, hr, laeuft) as Void {}
    function schnitt(jetzt, start) { return null; }
}
