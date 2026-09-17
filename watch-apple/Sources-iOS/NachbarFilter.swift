import Foundation

/// Filter der Liste, aus der man ins Session-Detail gekommen ist.
///
/// „Älter/neuer" im Detail soll GENAU dieser Liste folgen (Jan, 17.09.2026: „wenn ich auf meine
/// bin, mit nur Accel, dann auch bei meinen nur Accel die frühere oder nächste Session … wenn ich
/// aber an diesem Spot bin, die nächste an meinem Spot von allen Fahrern"). Der Server nimmt dafür
/// dieselben Parameter wie die Listen-Endpunkte.
///
/// Bewusst ein einfacher Merker im Speicher — genau wie in der PWA (`lastSession.ts`) und in der
/// Android-App (`NachbarFilter.kt`). Wer das Detail über einen Rekord, die Startseite oder eine
/// Benachrichtigung öffnet, hat keinen Listen-Kontext; dann bleibt `leer` stehen und der Server
/// antwortet wie bisher (eigene Sessions, gleiche Art wie die aktuelle).
struct NachbarFilter {
    var scope = "mine"          // "mine" | "all"
    var spot: String?           // Spot-Name oder -id; gesetzt = alle Fahrer an diesem Spot
    var sport: String?          // nil = Serverdefault ("all")
    var accelOnly = false
    var filter: String?         // "pump" | "other" (nur eigene)
    var month: String?          // "YYYY-MM" (nur eigene)

    static let leer = NachbarFilter()
    /// Zuletzt gesehene Liste. Wird nur aus SwiftUI-Views heraus gesetzt und gelesen.
    static var aktuell = NachbarFilter.leer

    /// Query-Anhang für `/api/sessions/{id}/neighbors` — leer, wenn nichts eingeschränkt ist.
    var query: String {
        var teile: [String] = []
        // Unreservierte Zeichen (RFC 3986) stehen lassen — sonst wird aus „2026-07" ein
        // „2026%2D07". Der Server verstünde beides, lesbar ist aber nur das eine.
        let erlaubt = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_.~"))
        func add(_ k: String, _ v: String) {
            teile.append("\(k)=\(v.addingPercentEncoding(withAllowedCharacters: erlaubt) ?? v)")
        }
        if scope == "all" { add("scope", "all") }
        if let s = spot, !s.isEmpty { add("spot", s) }
        if let s = sport, !s.isEmpty { add("sport", s) }
        if accelOnly { add("accel_only", "true") }
        if filter == "other" { add("filter", "other") }
        if let m = month, !m.isEmpty { add("month", m) }
        return teile.isEmpty ? "" : "?" + teile.joined(separator: "&")
    }
}
