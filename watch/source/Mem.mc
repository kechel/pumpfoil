using Toybox.Application.Storage;
using Toybox.Lang;
using Toybox.System;

// Speicher-Spitze der App messen und beim Config-Abruf melden (19.10.2026), wie Amazfit seit 1.0.12.
//
// WOZU: ob die kleinen Builds (96/128 KB) eine kompaktere Konfiguration brauchen oder ob es eng
// woanders wird (Upload-Spitze, s. docs/TODO.md „fenix5/128-KB unter Dauerlast"), liess sich nicht
// sagen — Garmin meldete bisher keine einzige Zahl. Gemessen wird `usedMemory` an den Stellen, an
// denen es teuer wird: jedes Neuzeichnen, jede Upload- und Config-Antwort. Der groesste Wert geht als
// `mem` (KB) mit `memtot` (Systemspeicher der Uhr in KB) zum Server, der sich je Uhr das Maximum
// merkt (`device_tokens.mem_peak_kb`). REINE DIAGNOSE: nichts haengt daran.
//
// Eigenes Modul in ALLEN Builds — gerade die kleinen sollen messen. Nicht in SessionRecorder: die
// 128-KB-Stufe steht dort am Limit von 253 Instanz-Mitgliedern (s. Sport.mc). Jeder Fehler wird
// verschluckt; eine Messung darf nie eine Aufnahme kosten.
module Mem {
    var spitze = 0;   // Bytes, groesster Wert seit App-Start

    function messen() as Void {
        try {
            var u = System.getSystemStats().usedMemory;
            if (u > spitze) { spitze = u; }
        } catch (e) { }
    }

    // Am Ende einer Aufnahme und beim Beenden: die Spitze ueber den App-Lauf hinaus behalten
    // (die Aufnahme laeuft ohne Netz, gemeldet wird erst beim naechsten Config-Abruf).
    function sichern() as Void {
        try {
            var alt = Storage.getValue("mem_peak");
            if (!(alt instanceof Lang.Number) || spitze > alt) { Storage.setValue("mem_peak", spitze); }
        } catch (e) { }
    }

    function param(p) as Void {
        try {
            messen();
            var m = spitze;
            var alt = Storage.getValue("mem_peak");
            if (alt instanceof Lang.Number && alt > m) { m = alt; }
            p["mem"] = (m / 1024).toString();
            p["memtot"] = (System.getSystemStats().totalMemory / 1024).toString();
        } catch (e) { }
    }
}
