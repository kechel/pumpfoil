import SwiftUI

// Verlauf: chronologische Liste mit Kennzahlen je Session (spiegelt web/Verlauf).
struct VerlaufView: View {
    @State private var items: [HistoryPoint] = []
    @State private var loading = false
    @State private var error: String?
    @State private var windowDays = 0   // 0 = Gesamt

    private var shown: [HistoryPoint] {
        windowDays == 0 ? items : items.filter { withinDays($0.started_at, windowDays) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                if !items.isEmpty {
                    Section {
                        Picker("Zeitraum", selection: $windowDays) {
                            Text("Gesamt").tag(0); Text("30 T").tag(30); Text("7 T").tag(7)
                        }
                        .pickerStyle(.segmented)
                    }
                    Section("Kumuliert · \(windowDays == 0 ? "Gesamt" : "\(windowDays) Tage")") {
                        HStack {
                            stat("\(shown.count)", "Sessions")
                            Spacer(); stat(String(format: "%.1f", shown.reduce(0) { $0 + $1.foiling_km }), "km")
                            Spacer(); stat("\(shown.reduce(0) { $0 + $1.runs })", "Läufe")
                            Spacer(); stat("\(shown.reduce(0) { $0 + $1.pumps })", "Pumps")
                        }
                    }
                }
                ForEach(shown) { h in
                    NavigationLink { SessionDetailView(id: h.session_id) } label: { row(h) }
                }
                if items.isEmpty && !loading && error == nil {
                    Text("Noch keine Sessions").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Verlauf")
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    @ViewBuilder private func row(_ h: HistoryPoint) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dateText(h.started_at)).font(.headline)
            HStack(spacing: 14) {
                stat("\(String(format: "%.1f", h.foiling_km)) km", "Foiling")
                stat("\(h.runs)", "Läufe")
                stat("\(h.pumps)", "Pumps")
                stat(h.pumps > 0 ? String(format: "%.1f", h.foiling_km * 1000 / Double(h.pumps)) : "–", "m/Pump")
                stat("\(String(format: "%.1f", h.speed * 3.6))", "km/h")
            }
        }
        .padding(.vertical, 2)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).font(.subheadline).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func dateText(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: iso)
        if d == nil { f.formatOptions = [.withInternetDateTime]; d = f.date(from: iso) }
        guard let date = d else { return iso }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    // started_at innerhalb der letzten N Tage? Bei Parse-Fehler einschließen.
    private func withinDays(_ iso: String, _ days: Int) -> Bool {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: iso)
        if d == nil { f.formatOptions = [.withInternetDateTime]; d = f.date(from: iso) }
        guard let date = d else { return true }
        return date > Date().addingTimeInterval(-Double(days) * 86400)
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.history(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
