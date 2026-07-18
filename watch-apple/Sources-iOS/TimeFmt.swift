import Foundation

// Uhrzeiten/Daten in der ORTSZEIT DES SPOTS anzeigen — der Server liefert je Session die
// IANA-Zeitzone (`tz`, aus den Spot-Koordinaten; Web-Pendant: web/src/lib/time.ts).
// Eine 12:17-Session in Helsinki erscheint damit überall als 12:17, egal von wo man schaut.
// Fallback: Geräte-Zeitzone (tz fehlt/ungültig) = bisheriges Verhalten.
// Bewusst einfache, typisierte Funktionen — kein SwiftUI, entlastet den Type-Checker.
enum TimeFmt {
    // ISO-8601 (mit/ohne Sekundenbruchteile) -> Date (wie SessionDetail.parseDate).
    static func parseISO(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    // IANA-Name -> TimeZone; Fallback Geräte-Zeitzone.
    static func zone(_ tz: String?) -> TimeZone {
        guard let tz, let z = TimeZone(identifier: tz) else { return .current }
        return z
    }

    // Datum + Uhrzeit wie `.formatted(date: .abbreviated, time: .shortened)`, nur in Spot-Zeit.
    static func dateTime(_ iso: String?, _ tz: String?) -> String? {
        guard let iso, let d = parseISO(iso) else { return nil }
        let style = Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: zone(tz))
        return d.formatted(style)
    }

    // Nur Uhrzeit wie `.formatted(date: .omitted, time: .shortened)` (End-Zeit in Listen).
    static func timeOnly(_ iso: String?, _ tz: String?) -> String? {
        guard let iso, let d = parseISO(iso) else { return nil }
        let style = Date.FormatStyle(date: .omitted, time: .shortened, timeZone: zone(tz))
        return d.formatted(style)
    }

    // Nur Datum wie `.formatted(date: .numeric, time: .omitted)` (Rekord-Kacheln Home).
    static func dateNumeric(_ iso: String?, _ tz: String?) -> String? {
        guard let iso, let d = parseISO(iso) else { return nil }
        let style = Date.FormatStyle(date: .numeric, time: .omitted, timeZone: zone(tz))
        return d.formatted(style)
    }

    // "HH:mm" (Start–Ende-Zeile im Session-Detail).
    static func hhmm(_ date: Date, _ tz: String?) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        f.timeZone = zone(tz)
        return f.string(from: date)
    }

    // "dd.MM.yy" (Community-Rekord-Kacheln).
    static func shortDate(_ iso: String?, _ tz: String?) -> String? {
        guard let iso, !iso.isEmpty, let d = parseISO(iso) else { return nil }
        let f = DateFormatter()
        f.dateFormat = "dd.MM.yy"
        f.timeZone = zone(tz)
        return f.string(from: d)
    }
}
