import SwiftUI
import MapKit

// Schutzgebiete auf den MapKit-Karten — wie `schutzgebiete()` in web/src/lib/mapTiles.ts und
// Schutzgebiete.kt in der Android-App (Jan, 16.10.2026): Naturschutzgebiete (rot), FFH/Natura 2000
// (orange gestrichelt) und eingetragene Bade-/Fahrverbote (dunkelrot) aus OpenStreetMap. Der Server
// holt und speichert sie (app/schutzgebiete.py); die App fragt nur /api/community/schutzgebiete.
//
//  - Erst ab etwa Zoom 11 (Ausschnitt schmaler als ~0,35 Grad), nachgeladen beim Verschieben;
//    meldet der Server „unvollstaendig" (Overpass langsam), fragt die Karte bis zu sechsmal nach.
//    Die Karte haengt nie davon ab.
//  - Immer an; der Schild-Knopf blendet alle aus (nicht gespeichert), ein Tipp auf eine Flaeche zeigt
//    Name, Art, „keine Rechtsauskunft" und „Ausblenden" (nur bis zum Neuladen).
//  - Legende unten links mit den gezeichneten Arten.
//
// Einbau in eine MKMapView: `SchutzLader(map:)` anlegen, `ausschnittGeaendert()` aus
// regionDidChange, `renderer(for:)` aus rendererFor, `tippen(bei:)` aus einem Tipp. Knopf, Legende
// und Fenster: `.schutzgebietSteuerung(lang:)` an der SwiftUI-Huelle der Karte.

@MainActor
final class SchutzZustand: ObservableObject {
    static let shared = SchutzZustand()
    @Published var an = true
    @Published var gezeichnet: Set<String> = []
    @Published var angetippt: SchutzFlaeche? = nil
    weak var angetipptVon: SchutzLader?
    var lader: [WeakLader] = []

    struct WeakLader { weak var l: SchutzLader? }

    func umschalten() {
        an.toggle()
        for w in lader { w.l?.sichtbarSetzen(an) }
    }
}

final class SchutzPolygon: MKPolygon {
    var flaeche: SchutzFlaeche? = nil
}

@MainActor
final class SchutzLader {
    private weak var map: MKMapView?
    private var da: Set<String> = []
    private var polygone: [SchutzPolygon] = []
    private var arten: Set<String> = []
    private var aufgabe: Task<Void, Never>? = nil
    private var versuche = 0
    private var gestoppt = false

    init(map: MKMapView) {
        self.map = map
        let z = SchutzZustand.shared
        z.gezeichnet = []
        z.lader.removeAll { $0.l == nil }
        z.lader.append(SchutzZustand.WeakLader(l: self))
    }

    func stoppen() { gestoppt = true; aufgabe?.cancel() }

    func ausschnittGeaendert() {
        versuche = 0
        aufgabe?.cancel()
        aufgabe = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            await self?.laden()
        }
    }

    func sichtbarSetzen(_ sichtbar: Bool) {
        guard let map else { return }
        if sichtbar { map.addOverlays(polygone, level: .aboveRoads) } else { map.removeOverlays(polygone) }
    }

    private func laden() async {
        guard !gestoppt, let map, map.region.span.longitudeDelta < 0.35, map.bounds.width > 0 else { return }
        let r = map.region
        let w = r.center.longitude - r.span.longitudeDelta / 2, e = r.center.longitude + r.span.longitudeDelta / 2
        let s = r.center.latitude - r.span.latitudeDelta / 2, n = r.center.latitude + r.span.latitudeDelta / 2
        guard let a = try? await Api.schutzgebiete(w: w, s: s, e: e, n: n), !gestoppt, !Task.isCancelled else { return }
        var neu: [SchutzPolygon] = []
        for f in a.flaechen where !da.contains(f.id) {
            da.insert(f.id)
            let innen: [MKPolygon] = f.innen.map { ring in
                let k = ring.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }
                return MKPolygon(coordinates: k, count: k.count)
            }
            // je Aussenring eine Flaeche (Natura-2000-Gebiete bestehen oft aus mehreren Teilen)
            for ring in f.aussen where ring.count >= 3 {
                let k = ring.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }
                let p = SchutzPolygon(coordinates: k, count: k.count, interiorPolygons: innen)
                p.flaeche = f
                neu.append(p)
            }
            arten.insert(f.art)
        }
        polygone += neu
        if SchutzZustand.shared.an { map.addOverlays(neu, level: .aboveRoads) }
        SchutzZustand.shared.gezeichnet = arten
        if a.unvollstaendig && versuche < 6 {
            versuche += 1
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if !Task.isCancelled { await laden() }
        }
    }

    func renderer(for overlay: MKOverlay) -> MKOverlayRenderer? {
        guard let p = overlay as? SchutzPolygon, let f = p.flaeche else { return nil }
        let r = MKPolygonRenderer(polygon: p)
        let farbe = SchutzLader.farbe(f.art)
        r.strokeColor = farbe
        r.lineWidth = f.art == "verbot" ? 3 : (f.art == "ffh" ? 1.5 : 2)
        if f.art == "ffh" { r.lineDashPattern = [6, 4] }
        r.fillColor = farbe.withAlphaComponent(f.art == "verbot" ? 0.25 : (f.art == "ffh" ? 0.05 : 0.1))
        return r
    }

    /// Tipp auf die Karte: liegt er in einer Flaeche, deren Fenster oeffnen.
    func tippen(bei koord: CLLocationCoordinate2D) {
        guard let map, SchutzZustand.shared.an else { return }
        let punkt = MKMapPoint(koord)
        for p in polygone.reversed() {
            guard let r = map.renderer(for: p) as? MKPolygonRenderer else { continue }
            if r.path?.contains(r.point(for: punkt)) == true, let f = p.flaeche {
                SchutzZustand.shared.angetipptVon = self
                SchutzZustand.shared.angetippt = f
                return
            }
        }
    }

    func ausblenden(_ f: SchutzFlaeche) {
        let weg = polygone.filter { $0.flaeche?.id == f.id }
        map?.removeOverlays(weg)
        polygone.removeAll { $0.flaeche?.id == f.id }
    }

    static func farbe(_ art: String) -> UIColor {
        switch art {
        case "ffh": return UIColor(red: 245 / 255, green: 158 / 255, blue: 11 / 255, alpha: 1)
        case "verbot": return UIColor(red: 185 / 255, green: 28 / 255, blue: 28 / 255, alpha: 1)
        default: return UIColor(red: 220 / 255, green: 38 / 255, blue: 38 / 255, alpha: 1)
        }
    }
    static func artKey(_ art: String) -> String {
        art == "ffh" ? "map.ffh" : (art == "verbot" ? "map.prohibited" : "map.nsg")
    }
}

/// Schild-Knopf (oben links unter dem Ebenen-Umschalter) und Legende (unten links).
struct SchutzSteuerung: ViewModifier {
    let lang: String
    @ObservedObject private var z = SchutzZustand.shared

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .topLeading) {
                if !z.gezeichnet.isEmpty {
                    Button { z.umschalten() } label: {
                        Image(systemName: z.an ? "shield.lefthalf.filled" : "shield.slash")
                            .foregroundStyle(z.an ? Color.red : Color.gray)
                            .padding(7).background(.thinMaterial).clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Loc.t("map.protectedToggle", lang))
                    .padding(.leading, 8).padding(.top, 48)
                }
            }
            .overlay(alignment: .bottomLeading) {
                if z.an && !z.gezeichnet.isEmpty { legende }
            }
            .alert(z.angetippt.map { $0.name.isEmpty ? Loc.t(SchutzLader.artKey($0.art), lang) : $0.name } ?? "",
                   isPresented: Binding(get: { z.angetippt != nil }, set: { if !$0 { z.angetippt = nil } })) {
                Button(Loc.t("map.hideArea", lang)) {
                    if let f = z.angetippt { z.angetipptVon?.ausblenden(f) }
                    z.angetippt = nil
                }
                Button("OK", role: .cancel) { z.angetippt = nil }
            } message: {
                Text(fensterText)
            }
    }

    private var fensterText: String {
        guard let f = z.angetippt else { return "" }
        let art: String = Loc.t(SchutzLader.artKey(f.art), lang)
        let zusatz: String = (!f.titel.isEmpty && f.titel != art) ? " · \(f.titel)" : ""
        return art + zusatz + "\n\n" + Loc.t("map.protectedHint", lang)
    }

    private var legende: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(["nsg", "ffh", "verbot"].filter { z.gezeichnet.contains($0) }, id: \.self) { a in
                HStack(spacing: 6) {
                    LegendenLinie(farbe: Color(SchutzLader.farbe(a)), gestrichelt: a == "ffh", dick: a == "verbot")
                    Text(Loc.t(SchutzLader.artKey(a), lang)).font(.caption2).foregroundStyle(Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255))
                }
            }
        }
        .padding(.horizontal, 7).padding(.vertical, 4)
        .background(Color.white.opacity(0.88)).clipShape(RoundedRectangle(cornerRadius: 6))
        .padding(8)
    }
}

private struct LegendenLinie: View {
    let farbe: Color
    let gestrichelt: Bool
    let dick: Bool
    var body: some View {
        Canvas { ctx, size in
            var p = Path()
            p.move(to: CGPoint(x: 0, y: size.height / 2)); p.addLine(to: CGPoint(x: size.width, y: size.height / 2))
            ctx.stroke(p, with: .color(farbe), style: StrokeStyle(lineWidth: dick ? 3 : 2, dash: gestrichelt ? [6, 4] : []))
        }
        .frame(width: 22, height: 8)
    }
}

extension View {
    /// Schild-Knopf, Legende und Fenster der Schutzgebiete ueber eine MapKit-Karte legen.
    func schutzgebietSteuerung(lang: String) -> some View { modifier(SchutzSteuerung(lang: lang)) }
}
