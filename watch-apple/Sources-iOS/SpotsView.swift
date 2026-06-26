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

    var body: some View {
        NavigationStack {
            List {
                if !items.isEmpty {
                    Section {
                        Map(coordinateRegion: $region, annotationItems: items) { s in
                            MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: s.lat, longitude: s.lon)) {
                                VStack(spacing: 0) {
                                    Text("\(s.sessions)")
                                        .font(.caption2).bold().foregroundStyle(.white)
                                        .padding(6)
                                        .background(Color.accentColor, in: Circle())
                                    Image(systemName: "arrowtriangle.down.fill")
                                        .font(.caption2).foregroundStyle(Color.accentColor)
                                        .offset(y: -3)
                                }
                            }
                        }
                        .frame(height: 260)
                        .listRowInsets(EdgeInsets())
                    }
                }
                Section {
                    if let error { Text(error).foregroundStyle(.secondary) }
                    ForEach(items) { s in
                        HStack {
                            Image(systemName: "mappin.circle.fill").foregroundStyle(Color.accentColor)
                            Text(s.spot)
                            Spacer()
                            Text("\(s.sessions)").font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    if items.isEmpty && !loading && error == nil {
                        Text(Loc.t("spots.empty", lang)).foregroundStyle(.secondary)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.spots", lang))
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
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

    // Kartenausschnitt an alle Spots anpassen.
    private func fitRegion(_ s: [SpotMapItem]) {
        guard !s.isEmpty else { return }
        let lats = s.map { $0.lat }, lons = s.map { $0.lon }
        let minLat = lats.min()!, maxLat = lats.max()!, minLon = lons.min()!, maxLon = lons.max()!
        region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2),
            span: MKCoordinateSpan(
                latitudeDelta: max((maxLat - minLat) * 1.4, 0.05),
                longitudeDelta: max((maxLon - minLon) * 1.4, 0.05)))
    }
}
