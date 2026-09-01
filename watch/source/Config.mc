using Toybox.Application;

// Zentraler Zugriff auf App-Settings/Properties.
module Config {

    // App-Version (im Start-Screen angezeigt -> zum Verifizieren des installierten Builds).
    // NAECHSTES Release nach dem Store-Stand 1.0.79. Die Nummer zaehlt RELEASES, nicht Builds:
    // Zwischenstaende zum Testen bekommen KEINE eigene Nummer (Jan, 26.08.) — sonst verbrennen
    // wir Versionen, die im Store nie auftauchen. Inhalt: Wert-Grafiken in Layouts, Puls-Zonen
    // aus dem Profil, expected_chunks im Upload, gesaeuberter Max-Speed + Lauf-Zusammenfuehrung,
    // „Gespeichert" nicht mehr doppelt und mit 10-s-Ablauf.
    const VERSION = "1.0.85";

    // Marken-Cyan (docs/BRAND.md, = Web brand-400 #22d3ee). Primaerer/interaktiver Akzent:
    // Pairing-Code, aktive Upload-Status-Titel, Fortschrittsbalken. Funktionale Skalen
    // (HR-/Speed-Zonen, Erfolg-Gruen, Warn-Orange, Fehler-Rot) bleiben bewusst mehrfarbig.
    const BRAND_CYAN = 0x22D3EE;

    // Server-Basis-URL (per -D base_url=... im Build überschreibbar).
    function baseUrl() {
        return "https://pumpfoil.org";
    }

    function getString(key) {
        var v = Application.Properties.getValue(key);
        return v == null ? "" : v;
    }

    function getNumber(key, dflt) {
        var v = Application.Properties.getValue(key);
        return v == null ? dflt : v;
    }

    function getBool(key, dflt) {
        var v = Application.Properties.getValue(key);
        return v == null ? dflt : v;
    }

    // Ist der Speicher der Uhr voll, wirft `setValue` — und ein ungefangener Wurf beendet die App
    // mit „IQ!". Genau hier ist das besonders heikel: `setString("deviceToken", …)` steht im
    // Pairing- UND im 401-Pfad, und der 401-Pfad wird beim App-Start durchlaufen, sobald gepufferte
    // Sessions hochgehen. Lieber das Token nicht speichern (der Nutzer koppelt neu) als abstuerzen.
    var storeFailed = false;   // ein Properties-Write ist gescheitert -> UI zeigt „Speicher voll"

    function setString(key, value) {
        try {
            Application.Properties.setValue(key, value);
            return true;
        } catch (e) {
            storeFailed = true;
            return false;
        }
    }

    // Datenfeld-Typen (IDs identisch mit web/src/lib/fields.ts)
    enum {
        FIELD_NONE = 0,
        FIELD_SPEED3S = 1,
        FIELD_HR = 2,
        FIELD_TIMER = 3,
        FIELD_DISTANCE = 4,
        FIELD_SPEED = 5,        // aktuelle Geschwindigkeit
        FIELD_AVG_SPEED = 6,
        FIELD_MAX_SPEED = 7,
        FIELD_AVG_HR = 8,
        FIELD_MAX_HR = 9,
        FIELD_ALTITUDE = 10,
        FIELD_TEMPERATURE = 11,
        FIELD_CLOCK = 12,
        FIELD_ASCENT = 13,
        // On-Watch-Lauferkennung (live): aktueller bzw. letzter Foil-Lauf.
        FIELD_RUN_DURATION = 14,        // aktueller Lauf (läuft er nicht: letzter)
        FIELD_RUN_DISTANCE = 15,
        FIELD_LAST_RUN_DURATION = 16,
        FIELD_LAST_RUN_DISTANCE = 17,
        FIELD_LAST_RUN_AVG_SPEED = 18,
        FIELD_LAST_RUN_MAX_SPEED = 19,
        FIELD_RUN_COUNT = 20,
        FIELD_LAST_RUN_MAX_HR = 21
    }
}
