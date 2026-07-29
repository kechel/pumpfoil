import SwiftUI
import MapKit

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
                Map(coordinateRegion: $region, annotationItems: items) { s in
                    MapAnnotation(coordinate: coord(s)) {
                        NavigationLink { SpotSessionsView(spot: s.spot) } label: { pin(s.sessions) }
                    }
                }
                .frame(height: 260)
                .listRowInsets(EdgeInsets())
            }
        }
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

    private func load() async {
        loading = true; defer { loading = false }
        do {
            let s = try await Api.spotMap().sorted { $0.sessions > $1.sessions }
            items = s
            fitRegion(s)
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
