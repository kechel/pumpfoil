import SwiftUI
import MapKit

// Karte des Spot-Panels „Heatmap & Routen" (SpotHeatmapPanel.swift) — MKMapView, weil SwiftUIs `Map`
// unter iOS 16 keine eigenen Linien und Flaechen kennt. Zeichnet:
//  - die Heatmap (Zellen der Webkarte, dieselben Farben wie die PWA) als eigenes MKOverlay,
//  - die Schutzgebiete (SchutzLader, Schutzgebiete.swift),
//  - im Planungsmodus Umkreis, Route (jeder Abschnitt nach Laenge eingefaerbt, mit Nummer) und die
//    Startplaetze als Buchstaben (gruen = selbst gestartet, gestrichelt = eigener Punkt, ziehbar),
//  - ohne Planung die angetippte gemerkte Route.
// Tippen auf einen Startplatz macht ihn zum Start; ist „+" aktiv, setzt ein Tipp auf die Karte einen
// eigenen Punkt; ein Tipp auf ein Schutzgebiet oeffnet dessen Fenster.

/// Ein Startplatz-Marker.
struct KartenPlatz: Equatable {
    let index: Int
    let lat: Double
    let lon: Double
    let name: String
    let farbe: UIColor
    let istStart: Bool
    let eigen: Bool
    let raus: Bool
}

/// Was die Karte zeigen soll — ein Wert, damit `updateUIView` nur bei echten Aenderungen neu zeichnet.
struct KartenInhalt: Equatable {
    var plaetze: [KartenPlatz] = []
    var linie: [CLLocationCoordinate2D] = []
    var umkreis: (CLLocationCoordinate2D, Double)? = nil
    /// kleine Punkte einer gemerkten Route ohne Planung (Start weiss, eigene Starts gruen)
    var routenPunkte: [(CLLocationCoordinate2D, UIColor, Bool)] = []

    static func == (a: KartenInhalt, b: KartenInhalt) -> Bool {
        a.plaetze == b.plaetze && a.linie.count == b.linie.count
            && zip(a.linie, b.linie).allSatisfy { $0.latitude == $1.latitude && $0.longitude == $1.longitude }
            && a.umkreis?.1 == b.umkreis?.1 && a.umkreis?.0.latitude == b.umkreis?.0.latitude
            && a.routenPunkte.count == b.routenPunkte.count
            && zip(a.routenPunkte, b.routenPunkte).allSatisfy { $0.0.latitude == $1.0.latitude && $0.0.longitude == $1.0.longitude && $0.1 == $1.1 }
    }
}

/// Wert -> Farbe (blau niedrig -> rot hoch), wie rampColor der PWA.
func rampeFarbe(_ t: Double) -> UIColor {
    let tt: Double = Swift.max(0, Swift.min(1, t))
    return UIColor(hue: CGFloat((1 - tt) * 240 / 360), saturation: 0.85, brightness: 0.95, alpha: 1)
}

struct RoutenKarte: UIViewRepresentable {
    let mapType: MKMapType
    let heat: HeatAntwort?
    let inhalt: KartenInhalt
    let setzen: Bool
    /// Ausschnitt einmalig herstellen (Token zaehlt hoch, wenn neu eingepasst werden soll).
    let einpassen: (MKMapRect, Int)?
    let onRegion: (MKCoordinateRegion, Double) -> Void
    let onPlatz: (Int) -> Void
    let onSetzen: (Double, Double) -> Void
    let onZiehen: (Int, Double, Double) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.showsCompass = false
        map.pointOfInterestFilter = .excludingAll
        let tipp = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.getippt(_:)))
        tipp.cancelsTouchesInView = false
        map.addGestureRecognizer(tipp)
        context.coordinator.map = map
        context.coordinator.schutz = SchutzLader(map: map)
        map.addOverlay(context.coordinator.heatOverlay, level: .aboveRoads)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        let c = context.coordinator
        c.parent = self
        if map.mapType != mapType { map.mapType = mapType }
        if let ein = einpassen, ein.1 != c.eingepasst {
            c.eingepasst = ein.1
            map.setVisibleMapRect(ein.0, edgePadding: UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24), animated: false)
        }
        if c.heatOverlay.daten?.cells != heat?.cells || c.heatOverlay.daten?.z != heat?.z {
            c.heatOverlay.daten = heat
            (map.renderer(for: c.heatOverlay) as? HeatRenderer)?.setNeedsDisplay()
        }
        if c.letzterInhalt != inhalt {
            c.letzterInhalt = inhalt
            c.zeichnen(map, inhalt)
        }
    }

    static func dismantleUIView(_ map: MKMapView, coordinator: Coordinator) {
        coordinator.schutz?.stoppen()
    }

    @MainActor final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: RoutenKarte?
        weak var map: MKMapView?
        var schutz: SchutzLader?
        let heatOverlay = HeatOverlay()
        var eingepasst = -1
        var letzterInhalt: KartenInhalt? = nil
        private var eigeneOverlays: [MKOverlay] = []
        private var eigeneMarker: [MKAnnotation] = []

        func zeichnen(_ map: MKMapView, _ i: KartenInhalt) {
            map.removeOverlays(eigeneOverlays); map.removeAnnotations(eigeneMarker)
            eigeneOverlays = []; eigeneMarker = []
            if let u = i.umkreis {
                let k = MKCircle(center: u.0, radius: u.1)
                eigeneOverlays.append(k)
            }
            if i.linie.count >= 2 {
                var m: [Double] = []
                for k in 1..<i.linie.count {
                    m.append(Routen.abstandM(i.linie[k - 1].latitude, i.linie[k - 1].longitude, i.linie[k].latitude, i.linie[k].longitude))
                }
                let lo: Double = m.min() ?? 0, hi: Double = m.max() ?? 0
                for k in 1..<i.linie.count {
                    let pts: [CLLocationCoordinate2D] = [i.linie[k - 1], i.linie[k]]
                    let kontur = FarbLinie(coordinates: pts, count: 2)
                    kontur.farbe = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1); kontur.breite = 7
                    let farbig = FarbLinie(coordinates: pts, count: 2)
                    farbig.farbe = rampeFarbe(hi > lo ? (m[k - 1] - lo) / (hi - lo) : 0.5); farbig.breite = 4
                    eigeneOverlays.append(kontur); eigeneOverlays.append(farbig)
                    let mitte = CLLocationCoordinate2D(latitude: (pts[0].latitude + pts[1].latitude) / 2,
                                                       longitude: (pts[0].longitude + pts[1].longitude) / 2)
                    eigeneMarker.append(NummerMarker(coordinate: mitte, nummer: k))
                }
            }
            for (koord, farbe, istStart) in i.routenPunkte {
                eigeneMarker.append(PunktMarker(coordinate: koord, farbe: farbe, gross: istStart))
            }
            for p in i.plaetze { eigeneMarker.append(PlatzMarker(p)) }
            map.addOverlays(eigeneOverlays, level: .aboveLabels)
            map.addAnnotations(eigeneMarker)
        }

        // MARK: Tippen / Ziehen
        @objc func getippt(_ g: UITapGestureRecognizer) {
            guard let map, let parent else { return }
            let pt = g.location(in: map)
            // Marker bekommen ihren Tipp ueber didSelect; hier nur freie Flaeche
            if map.annotations.contains(where: { a in
                guard let v = map.view(for: a), !(a is MKUserLocation) else { return false }
                return v.frame.insetBy(dx: -6, dy: -6).contains(pt)
            }) { return }
            let koord = map.convert(pt, toCoordinateFrom: map)
            if parent.setzen { parent.onSetzen(koord.latitude, koord.longitude); return }
            schutz?.tippen(bei: koord)
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            if let p = view.annotation as? PlatzMarker, !p.platz.raus { parent?.onPlatz(p.platz.index) }
            mapView.deselectAnnotation(view.annotation, animated: false)
        }

        func mapView(_ mapView: MKMapView, annotationView view: MKAnnotationView,
                     didChange newState: MKAnnotationView.DragState, fromOldState oldState: MKAnnotationView.DragState) {
            guard newState == .ending, let p = view.annotation as? PlatzMarker else { return }
            view.dragState = .none
            parent?.onZiehen(p.platz.index, p.coordinate.latitude, p.coordinate.longitude)
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            parent?.onRegion(mapView.region, Double(mapView.bounds.width))
            schutz?.ausschnittGeaendert()
        }

        // MARK: Darstellung
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if let p = annotation as? PlatzMarker {
                let v = MKAnnotationView(annotation: p, reuseIdentifier: nil)
                v.image = platzBild(p.platz)
                v.isDraggable = p.platz.eigen
                v.canShowCallout = false
                v.accessibilityLabel = p.platz.name
                return v
            }
            if let n = annotation as? NummerMarker {
                let v = MKAnnotationView(annotation: n, reuseIdentifier: nil)
                v.image = nummerBild(n.nummer)
                v.isUserInteractionEnabled = false
                return v
            }
            if let n = annotation as? PunktMarker {
                let v = MKAnnotationView(annotation: n, reuseIdentifier: nil)
                v.image = punktBild(n.farbe, gross: n.gross)
                v.isUserInteractionEnabled = false
                return v
            }
            return nil
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let h = overlay as? HeatOverlay { return HeatRenderer(overlay: h) }
            if let l = overlay as? FarbLinie {
                let r = MKPolylineRenderer(polyline: l)
                r.strokeColor = l.farbe; r.lineWidth = l.breite; r.lineCap = .round
                return r
            }
            if let k = overlay as? MKCircle {
                let r = MKCircleRenderer(circle: k)
                r.strokeColor = UIColor(red: 34 / 255, green: 211 / 255, blue: 238 / 255, alpha: 1)
                r.lineWidth = 1.5; r.lineDashPattern = [6, 6]; r.fillColor = .clear
                return r
            }
            if let r = schutz?.renderer(for: overlay) { return r }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}

// MARK: - Overlays und Marker

final class FarbLinie: MKPolyline {
    var farbe: UIColor = .systemBlue
    var breite: CGFloat = 4
}

final class PlatzMarker: NSObject, MKAnnotation {
    let platz: KartenPlatz
    @objc dynamic var coordinate: CLLocationCoordinate2D
    init(_ p: KartenPlatz) { platz = p; coordinate = CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon) }
}

final class NummerMarker: NSObject, MKAnnotation {
    let coordinate: CLLocationCoordinate2D
    let nummer: Int
    init(coordinate: CLLocationCoordinate2D, nummer: Int) { self.coordinate = coordinate; self.nummer = nummer }
}

final class PunktMarker: NSObject, MKAnnotation {
    let coordinate: CLLocationCoordinate2D
    let farbe: UIColor
    let gross: Bool
    init(coordinate: CLLocationCoordinate2D, farbe: UIColor, gross: Bool) { self.coordinate = coordinate; self.farbe = farbe; self.gross = gross }
}

private let dunkelUI = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)

private func platzBild(_ p: KartenPlatz) -> UIImage {
    let s: CGFloat = 26
    return UIGraphicsImageRenderer(size: CGSize(width: s, height: s)).image { ctx in
        let c = ctx.cgContext
        let rand: CGFloat = p.istStart ? 3 : 2
        let kreis = CGRect(x: rand / 2, y: rand / 2, width: s - rand, height: s - rand)
        c.setFillColor(p.farbe.withAlphaComponent(p.raus ? 0.6 : 1).cgColor)
        c.fillEllipse(in: kreis)
        c.setStrokeColor((p.istStart ? UIColor.white : dunkelUI).cgColor)
        c.setLineWidth(rand)
        if p.eigen && !p.istStart { c.setLineDash(phase: 0, lengths: [3, 2.5]) }
        c.strokeEllipse(in: kreis)
        var attr: [NSAttributedString.Key: Any] = [.font: UIFont.boldSystemFont(ofSize: p.name.count > 1 ? 10 : 12),
                                                   .foregroundColor: dunkelUI]
        if p.raus { attr[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
        let t = NSAttributedString(string: p.name, attributes: attr)
        let g = t.size()
        t.draw(at: CGPoint(x: (s - g.width) / 2, y: (s - g.height) / 2))
    }
}

private func nummerBild(_ n: Int) -> UIImage {
    let s: CGFloat = 18
    return UIGraphicsImageRenderer(size: CGSize(width: s, height: s)).image { ctx in
        let c = ctx.cgContext
        let kreis = CGRect(x: 0.5, y: 0.5, width: s - 1, height: s - 1)
        c.setFillColor(UIColor.white.cgColor); c.fillEllipse(in: kreis)
        c.setStrokeColor(dunkelUI.cgColor); c.setLineWidth(1); c.strokeEllipse(in: kreis)
        let t = NSAttributedString(string: "\(n)", attributes: [.font: UIFont.boldSystemFont(ofSize: 10), .foregroundColor: dunkelUI])
        let g = t.size()
        t.draw(at: CGPoint(x: (s - g.width) / 2, y: (s - g.height) / 2))
    }
}

private func punktBild(_ farbe: UIColor, gross: Bool) -> UIImage {
    let s: CGFloat = gross ? 14 : 10
    return UIGraphicsImageRenderer(size: CGSize(width: s, height: s)).image { ctx in
        let c = ctx.cgContext
        let kreis = CGRect(x: 1, y: 1, width: s - 2, height: s - 2)
        c.setFillColor(farbe.cgColor); c.fillEllipse(in: kreis)
        c.setStrokeColor(dunkelUI.cgColor); c.setLineWidth(2); c.strokeEllipse(in: kreis)
    }
}

// MARK: - Heatmap als MKOverlay

final class HeatOverlay: NSObject, MKOverlay {
    var daten: HeatAntwort? = nil
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: 0, longitude: 0) }
    var boundingMapRect: MKMapRect { .world }
}

/// Zeichnet die Zellen (Kacheln x, y auf Stufe z) — Farbe und Deckkraft wie HeatSchicht/die PWA.
final class HeatRenderer: MKOverlayRenderer {
    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        guard let d = (overlay as? HeatOverlay)?.daten, let z = d.z else { return }
        let n: Double = pow(2.0, Double(z))
        let welt: Double = MKMapRect.world.size.width
        let zelle: Double = welt / n
        let skala: Double = log(1.0 + Double(d.max))
        for c in d.cells where c.count >= 3 {
            let r = MKMapRect(x: Double(c[0]) * zelle, y: Double(c[1]) * zelle, width: zelle, height: zelle)
            if !r.intersects(mapRect) { continue }
            let t: Double = Swift.min(1.0, log(1.0 + Double(c[2])) / skala)
            context.setFillColor(UIColor(heatFarbe(t)).withAlphaComponent(CGFloat(0.35 + 0.45 * t)).cgColor)
            context.fill(rect(for: r))
        }
    }
}
