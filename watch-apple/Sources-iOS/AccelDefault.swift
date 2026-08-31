import Foundation

// Default des „nur Accel | alle"-Umschalters — Port von web/src/lib/useAccelDefault.ts.
//
// GEAENDERT 31.08.2026 (Jan): die Sessions-Listen starten jetzt IMMER mit „alle", auch wenn der
// anschauende Nutzer selbst Beschleunigungsdaten hat. Vorher wurde /api/sessions/has-accel gefragt
// und bei „ja" auf „nur Accel" gestellt. Das ist fuer eine UEBERSICHT falsch: es verschweigt still
// die Sessions der Mitfahrer, deren Uhr keine verwertbaren Accel-Daten liefert — genau daran ist
// am 29.08. ein Nutzer haengengeblieben („14 Sessions am Spot, nach dem Klick stehen drei da").
// Fuer Rekorde/Bestenlisten bleibt „nur praezise" richtig; die haben eigene Umschalter.
//
// Die Form bleibt, damit die Aufrufer unveraendert bleiben und ein Zurueckdrehen eine Zeile ist.
enum AccelDefault {
    /// Startwert des Umschalters: „alle".
    static var cached: Bool { false }

    /// Ohne Netz-Abfrage — der Default haengt nicht mehr davon ab, was der Nutzer selbst hat.
    static func preferred() async -> Bool { false }
}
