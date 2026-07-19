using Toybox.Application;

// Zentraler Zugriff auf App-Settings/Properties.
module Config {

    // App-Version (im Start-Screen angezeigt -> zum Verifizieren des installierten Builds).
    const VERSION = "1.0.56";

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

    function setString(key, value) {
        Application.Properties.setValue(key, value);
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
        FIELD_RUN_COUNT = 20
    }
}
