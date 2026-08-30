import SwiftUI
import MapKit

private let KARTE_HOEHE: CGFloat = 260
// Ab welchem Punkt-Abstand zwei Pins als "uebereinander" gelten. Das Web nimmt 26 (Kreise mit
// 9 px Radius); unsere Pins sind 30 Punkt breit, also braucht es hier mehr — 38 = Pin-Breite plus
// ein wenig Luft. Gemessen an den echten 231 Spots bleiben damit auf JEDER Zoomstufe hoechstens
// 23 Pins stehen (mit 26 waeren es in der Europa-Ansicht 39).
private let NAEHE: Double = 38

// Ein Karten-Pin: entweder EIN Spot oder ein Buendel mehrerer, die sich beim aktuellen Zoom
// ueberdecken wuerden. `id` ist der Name des staerksten Spots darin — Spot-Namen sind eindeutig.
struct SpotBuendel: Identifiable {
    let id: String
    let teil: [SpotMapItem]
    // Mitte des umschliessenden Rechtecks (wie L.latLngBounds().getCenter() im Web).
    var mitte: CLLocationCoordinate2D {
        let lats = teil.map { $0.lat }, lons = teil.map { $0.lon }
        return CLLocationCoordinate2D(
            latitude: ((lats.min() ?? 0) + (lats.max() ?? 0)) / 2,
            longitude: ((lons.min() ?? 0) + (lons.max() ?? 0)) / 2)
    }
}

// Spots: native MapKit-Karte mit Pins (Session-Anzahl) + Liste darunter
// (spiegelt web/Spots; auf iOS idiomatisch via MapKit, kein API-Key nötig).
struct SpotsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [SpotMapItem] = []
    @State private var loading = false
    @State private var error: String?
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 51.0, longitude: 10.0),
        span: MKCoordinateSpan(latitudeDelta: 12, longitudeDelta: 12))
    // Was wirklich auf der Karte liegt: gebuendelte Spots, neu berechnet nur bei echtem
    // Zoom/Schwenk (s. buendelnFallsNoetig). Vorher lag hier je Spot eine eigene Annotation.
    @State private var buendel: [SpotBuendel] = []
    @State private var kartenBreite: Double = 390
    @State private var letzteSpanne: Double = 0
    @State private var letzteMitte = CLLocationCoordinate2D(latitude: 0, longitude: 0)

    // Ein Abschnitt = eine eigene Teil-View: Swifts Type-Checker löst einen ViewBuilder als EINEN
    // Ausdruck auf, und Karte samt Pin-Label (verschachtelte Closures) plus Liste in einem Body
    // ließen das Archive hängen. Reihenfolge, Layout und Texte sind unverändert.
    var body: some View {
        NavigationStack {
            List {
                mapSection
                listSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.spots", lang))
            .brandToolbar(Loc.t("nav.spots", lang))
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    @ViewBuilder private var mapSection: some View {
        if !items.isEmpty {
            Section {
                Map(coordinateRegion: $region, annotationItems: buendel) { b in
                    MapAnnotation(coordinate: b.mitte) { annotation(b) }
                }
                .frame(height: KARTE_HOEHE)
                .listRowInsets(EdgeInsets())
                .background(GeometryReader { geo in
                    // Echte Breite nachreichen (Voreinstellung 390) und einmal neu buendeln.
                    Color.clear.onAppear { kartenBreite = Double(geo.size.width); buendeln() }
                })
                // MKCoordinateRegion ist nicht Equatable -> auf die Skalare hoeren.
                .onChange(of: region.span.longitudeDelta) { _ in buendelnFallsNoetig() }
                .onChange(of: region.center.latitude) { _ in buendelnFallsNoetig() }
                .onChange(of: region.center.longitude) { _ in buendelnFallsNoetig() }
            }
        }
    }

    // Ein Pin: einzelner Spot -> direkt zu seinen Sessions. Buendel -> hineinzoomen, damit der
    // Nutzer selbst waehlt (genau Jaceks Meldung vom 20.08.: bei Europa-Zoom ueberdeckten sich die
    // Pins, und der Klick landete in einem beliebigen Nachbarspot).
    @ViewBuilder private func annotation(_ b: SpotBuendel) -> some View {
        if b.teil.count == 1 {
            NavigationLink { SpotSessionsView(spot: b.teil[0].spot) } label: { pin(b.teil[0].sessions) }
        } else {
            Button { hineinzoomen(b) } label: { buendelPin(b.teil.count) }
                .buttonStyle(.plain)
                .accessibilityLabel("\(b.teil.count) \(Loc.t("nav.spots", lang))")
        }
    }

    // Buendel-Pin: Anzahl der SPOTS im Kreis, ohne Spitze — dadurch von einem einzelnen Spot
    // (Anzahl der Sessions, mit Spitze) auf den ersten Blick zu unterscheiden.
    private func buendelPin(_ anzahl: Int) -> some View {
        Text("\(anzahl)")
            .font(.caption).bold().foregroundStyle(.black)
            .frame(width: 30, height: 30)
            .background(Color.accentColor, in: Circle())
            .overlay(Circle().stroke(.black, lineWidth: 2))
    }

    // Karten-Pin: Session-Anzahl im Kreis + Spitze nach unten.
    private func pin(_ sessions: Int) -> some View {
        VStack(spacing: 0) {
            Text("\(sessions)")
                .font(.caption2).bold().foregroundStyle(.white)
                .padding(6)
                .background(Color.accentColor, in: Circle())
            Image(systemName: "arrowtriangle.down.fill")
                .font(.caption2).foregroundStyle(Color.accentColor)
                .offset(y: -3)
        }
    }

    @ViewBuilder private var listSection: some View {
        Section {
            if let error { Text(error).foregroundStyle(.secondary) }
            ForEach(items) { s in
                NavigationLink { SpotSessionsView(spot: s.spot) } label: { spotRow(s) }
            }
            if items.isEmpty && !loading && error == nil {
                Text(Loc.t("spots.empty", lang)).foregroundStyle(.secondary)
            }
        }
    }

    private func spotRow(_ s: SpotMapItem) -> some View {
        HStack {
            Image(systemName: "mappin.circle.fill").foregroundStyle(Color.accentColor)
            Text(s.spot)
            Spacer()
            Text("\(s.sessions)").font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private func coord(_ s: SpotMapItem) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: s.lat, longitude: s.lon)
    }

    // Spots buendeln, solange sie sich beim aktuellen Zoom ueberdecken — dieselbe Regel wie im Web
    // (web/src/pages/Spots.tsx, 20.08.): Abstand in Punkten, Schwelle NAEHE, die sessionstaerksten
    // Spots zuerst als Anker (deterministisch, unabhaengig von der Datenreihenfolge).
    //
    // Zusaetzlich zum Web wird auf den sichtbaren Ausschnitt (plus 30 % Rand) gefiltert. Das ist
    // hier keine Kosmetik: jede MapAnnotation ist eine eigene gehostete SwiftUI-View, und 231
    // davon haben auf einem Nutzergeraet den 10-Sekunden-Watchdog ausgeloest (0x8BADF00D,
    // Crash-Log vom 20.08.). Mit Buendelung UND Ausschnitt sind es bei jedem Zoom hoechstens 23.
    private func buendeln() {
        letzteSpanne = region.span.longitudeDelta
        letzteMitte = region.center
        let dLat = region.span.latitudeDelta, dLon = region.span.longitudeDelta
        guard !items.isEmpty, dLat > 0, dLon > 0 else { buendel = []; return }
        let sicht = items.filter {
            abs($0.lat - region.center.latitude) <= dLat * 0.65
                && abs($0.lon - region.center.longitude) <= dLon * 0.65
        }
        guard !sicht.isEmpty else { buendel = []; return }
        // Punkte je Grad im aktuellen Ausschnitt. Lineare Naeherung statt echter Mercator-
        // Projektion wie im Web — fuer eine Ueberdeckungs-Schwelle in Punkten genau genug.
        let ppLon = kartenBreite / dLon
        let ppLat = Double(KARTE_HOEHE) / dLat
        let reihe = (0..<sicht.count).sorted { sicht[$0].sessions > sicht[$1].sessions }
        var belegt = Array(repeating: false, count: sicht.count)
        var out: [SpotBuendel] = []
        for i in reihe where !belegt[i] {
            belegt[i] = true
            var gruppe = [sicht[i]]
            for j in reihe where !belegt[j] {
                let dx = (sicht[i].lon - sicht[j].lon) * ppLon
                let dy = (sicht[i].lat - sicht[j].lat) * ppLat
                if dx * dx + dy * dy < NAEHE * NAEHE { gruppe.append(sicht[j]); belegt[j] = true }
            }
            out.append(SpotBuendel(id: sicht[i].spot, teil: gruppe))
        }
        buendel = out
    }

    // Nur bei echter Aenderung neu buendeln: waehrend eines Schwenks feuert `region` laufend.
    // Schwelle: 10 % Zoom oder ein Fuenftel der Ausschnittsbreite verschoben.
    private func buendelnFallsNoetig() {
        guard letzteSpanne > 0 else { buendeln(); return }
        let v = region.span.longitudeDelta / letzteSpanne
        let weit = abs(region.center.latitude - letzteMitte.latitude) > region.span.latitudeDelta * 0.2
            || abs(region.center.longitude - letzteMitte.longitude) > region.span.longitudeDelta * 0.2
        if v < 0.9 || v > 1.1 || weit { buendeln() }
    }

    // Klick auf ein Buendel: auf dessen Spots zoomen, statt eine Zufallsauswahl zu treffen.
    private func hineinzoomen(_ b: SpotBuendel) {
        let lats = b.teil.map { $0.lat }, lons = b.teil.map { $0.lon }
        let hLat = ((lats.max() ?? 0) - (lats.min() ?? 0)) * 1.6
        let hLon = ((lons.max() ?? 0) - (lons.min() ?? 0)) * 1.6
        // Untergrenze: liegen die Spots (fast) aufeinander, wird trotzdem sichtbar
        // weitergezoomt — sonst tippt man ins Leere.
        let neu = MKCoordinateRegion(
            center: b.mitte,
            span: MKCoordinateSpan(latitudeDelta: max(hLat, region.span.latitudeDelta / 4),
                                   longitudeDelta: max(hLon, region.span.longitudeDelta / 4)))
        withAnimation { region = neu }
        buendeln()
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            let s = try await Api.spotMap().sorted { $0.sessions > $1.sessions }
            items = s
            fitRegion(s)
            buendeln()
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    // Kartenausschnitt an alle Spots anpassen. Zwischenwerte explizit Double — die Mischung aus
    // Literalen und Rechnung in EINEM MKCoordinateRegion-Ausdruck ist für den Checker teuer.
    private func fitRegion(_ s: [SpotMapItem]) {
        guard !s.isEmpty else { return }
        let lats: [Double] = s.map { $0.lat }, lons: [Double] = s.map { $0.lon }
        let minLat: Double = lats.min()!, maxLat: Double = lats.max()!
        let minLon: Double = lons.min()!, maxLon: Double = lons.max()!
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
        let latDelta: Double = max((maxLat - minLat) * 1.4, 0.05)
        let lonDelta: Double = max((maxLon - minLon) * 1.4, 0.05)
        region = MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: latDelta, longitudeDelta: lonDelta))
    }
}
