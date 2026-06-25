import SwiftUI

// Foil-Statistik (spiegelt web/FoilStats): Community-Vergleich je Foil als Cards.
struct FoilStatsView: View {
    @State private var rows: [FoilStat] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("Welche Werte mit welchem Foil gefahren werden (Community).")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let error { Text(error).foregroundStyle(.secondary) }
            if !loading && rows.isEmpty && error == nil {
                Text("Noch keine Daten").foregroundStyle(.secondary)
            }
            ForEach(rows) { s in
                Section("\(s.brand) \(s.model) \(s.size)") {
                    HStack {
                        metric("\(s.sessions)", "Sessions")
                        Spacer(); metric("\(s.users)", "Fahrer")
                        Spacer(); metric(s.avg_speed_kmh.map { String(format: "%.1f", $0) } ?? "–", "Ø km/h")
                    }
                    HStack {
                        metric(s.meters_per_pump.map { String(format: "%.1f", $0) } ?? "–", "m/Pump")
                        Spacer(); metric(s.best_distance_m.map { String(format: "%.2f", $0 / 1000) } ?? "–", "best km")
                        Spacer(); metric(s.avg_pump_hz.map { String(format: "%.2f", $0) } ?? "–", "Ø Hz")
                    }
                }
            }
        }
        .overlay { if loading { ProgressView() } }
        .navigationTitle("Foil-Statistik")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { rows = try await Api.foilStats(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
