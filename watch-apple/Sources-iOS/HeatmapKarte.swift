import SwiftUI
import MapKit

// Heatmap der Spot-Karte (Jan, 15.10.2026; PWA Spots.tsx, Server app/heatmap.py): wie viele
// Sessions an einer Stelle gefahren sind, nur die Laeufe, fuer alle gleich, einmal taeglich
// vorgerechnet. Die Zellen sind Kacheln der Webkarte (x, y auf Stufe z).
//
// Die Spot-Karte ist SwiftUIs `Map` (s. SpotsView.spotKarte) — die kennt unter iOS 17 keine eigenen
// Flaechen. Deshalb liegt die Heatmap als `Canvas` UEBER der Karte, durchlaessig fuer Tipps
// (allowsHitTesting false) und halb durchsichtig, damit die Pins sichtbar und bedienbar bleiben.
// Umgerechnet wird ueber die Region der Karte in Web-Mercator — dieselbe Projektion wie MapKit.

struct HeatAntwort: Decodable {
    var z: Int? = nil
    var cells: [[Int]] = []
    var max: Int = 1
    var stand: String? = nil
    var sessions: Int = 0
}

/// Blau -> Cyan -> Gelb -> Rot, wie in der PWA (heatFarbe in Spots.tsx).
func heatFarbe(_ t: Double) -> Color {
    let stops: [[Double]] = [[59, 130, 246], [34, 211, 238], [250, 204, 21], [239, 68, 68]]
    let x: Double = t * Double(stops.count - 1)
    let i: Int = Swift.min(stops.count - 2, Int(x))
    let f: Double = x - Double(i)
    func k(_ j: Int) -> Double { (stops[i][j] + (stops[i + 1][j] - stops[i][j]) * f) / 255.0 }
    return Color(red: k(0), green: k(1), blue: k(2))
}

/// Kartenzoom (Kachelstufe) aus der Region — fuer die Wahl der Rasterstufe auf dem Server.
func kartenZoom(_ region: MKCoordinateRegion, breite: Double) -> Int {
    let d: Double = Swift.max(region.span.longitudeDelta, 0.000_01)
    return Swift.max(0, Swift.min(22, Int(log2(360.0 / d * breite / 256.0))))
}

private func mercY(_ lat: Double) -> Double {
    let r: Double = Swift.max(-85.05, Swift.min(85.05, lat)) * .pi / 180
    return log(tan(.pi / 4 + r / 2))
}

struct HeatSchicht: View {
    let daten: HeatAntwort
    let region: MKCoordinateRegion

    var body: some View {
        Canvas { ctx, size in
            guard let z = daten.z else { return }
            let n: Double = pow(2.0, Double(z))
            let lonL: Double = region.center.longitude - region.span.longitudeDelta / 2
            let yOben: Double = mercY(region.center.latitude + region.span.latitudeDelta / 2)
            let yUnten: Double = mercY(region.center.latitude - region.span.latitudeDelta / 2)
            let sx: Double = Double(size.width) / region.span.longitudeDelta
            let sy: Double = Double(size.height) / Swift.max(yOben - yUnten, 1e-9)
            let skala: Double = log(1.0 + Double(daten.max))
            for c in daten.cells where c.count >= 3 {
                let x0: Double = Double(c[0]) / n * 360 - 180
                let x1: Double = Double(c[0] + 1) / n * 360 - 180
                // Kachel-y -> Mercator-y direkt: y_merc = pi * (1 - 2*y/n)
                let m0: Double = .pi * (1 - 2 * Double(c[1]) / n)
                let m1: Double = .pi * (1 - 2 * Double(c[1] + 1) / n)
                let px: Double = (x0 - lonL) * sx
                let py: Double = (yOben - m0) * sy
                let w: Double = Swift.max(1, (x1 - x0) * sx)
                let h: Double = Swift.max(1, (m0 - m1) * sy)
                let t: Double = Swift.min(1, log(1.0 + Double(c[2])) / skala)
                ctx.fill(Path(CGRect(x: px, y: py, width: w, height: h)),
                         with: .color(heatFarbe(t).opacity(0.25 + 0.4 * t)))
            }
        }
        .allowsHitTesting(false)
    }
}
