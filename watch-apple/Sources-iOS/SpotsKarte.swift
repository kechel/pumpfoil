import Foundation
import MapKit

/// Zuletzt angeschauter Ausschnitt der Spots-Karte.
///
/// Ohne das setzte `SpotsView.load()` den Ausschnitt bei JEDEM Besuch per `fitRegion` auf alle
/// Spots zurueck — wer hineinzoomte, einen Spot ansah und zurueckkam, stand wieder auf der
/// Weltkarte. Auf Android am 18.09.2026 gemeldet und behoben (Jan: „merkt sich auch nicht wenn
/// ich rauszoome und dann woanders hingehe und zurueck auf spots gehe, eigentlich sollte sich das
/// lokal den ausschnitt merken"); hier dieselbe Loesung.
///
/// NUR IM SPEICHER, nicht in den Einstellungen — dieselbe Entscheidung wie in der PWA, die dafuer
/// bewusst `sessionStorage` und nicht `localStorage` nimmt (`web/src/pages/Spots.tsx`): der
/// Ausschnitt soll das Hin- und Herwechseln ueberleben, aber nicht ewig. Beim naechsten kalten
/// Start ist die Uebersicht wieder die richtige Ansicht.
struct SpotsKarte {
    private static var gemerkt: MKCoordinateRegion?

    /// Liegt ein gemerkter Ausschnitt vor? Dann NICHT auf die Spots einpassen.
    static var vorhanden: Bool { gemerkt != nil }

    static func merken(_ r: MKCoordinateRegion) {
        // Unfertige Kartenzustaende nicht merken (SwiftUI meldet beim Aufbau kurz 0/0).
        guard r.span.latitudeDelta > 0, r.span.longitudeDelta > 0,
              !(r.center.latitude == 0 && r.center.longitude == 0) else { return }
        gemerkt = r
    }

    static func holen() -> MKCoordinateRegion? { gemerkt }
}
