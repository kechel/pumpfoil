import Foundation

// Default des „nur Accel | alle"-Umschalters — Port von web/src/lib/useAccelDefault.ts.
// „nur Accel", wenn der anschauende Nutzer selbst Läufe mit Beschleunigungsdaten hat, sonst „alle".
// Der Wert kommt aus /api/sessions/has-accel und wird pro App-Lauf EINMAL geladen (wie der
// session-weite Cache der PWA).
enum AccelDefault {
    private static var cache: Bool?

    /// Bereits bekannter Default; solange noch nichts geladen ist optimistisch „nur Accel" (wie PWA).
    static var cached: Bool { cache ?? true }

    /// Lädt has-accel höchstens einmal; Fehler -> „alle" (wie PWA).
    static func preferred() async -> Bool {
        if let c = cache { return c }
        let v = ((try? await Api.hasAccel()) ?? false)
        cache = v
        return v
    }
}
