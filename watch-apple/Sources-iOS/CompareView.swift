import SwiftUI

// Mehrere eigene Sessions auswählen und Kennzahlen nebeneinander vergleichen.
struct CompareView: View {
    @State private var sessions: [SessionSummary] = []
    @State private var selected: Set<Int> = []
    @State private var results: [SessionDetail] = []
    @State private var loading = true
    @State private var comparing = false

    var body: some View {
        // Kein eigener NavigationStack: View wird aus ProfileView gepusht und nutzt
        // dessen Stack (sonst verschachtelt -> Zurück-Button verschwindet).
        Group {
                if loading {
                    ProgressView()
                } else if comparing {
                    compareTable
                } else {
                    VStack(spacing: 0) {
                        List {
                            Section("2+ Sessions wählen") {
                                ForEach(sessions) { s in
                                    Button { toggle(s.id) } label: {
                                        HStack {
                                            Image(systemName: selected.contains(s.id) ? "checkmark.circle.fill" : "circle")
                                                .foregroundStyle(selected.contains(s.id) ? Color.accentColor : .secondary)
                                            VStack(alignment: .leading) {
                                                Text(dateText(s)).foregroundStyle(.primary)
                                                if let p = s.place_name, !p.isEmpty {
                                                    Text(p).font(.caption).foregroundStyle(.secondary)
                                                }
                                            }
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        Button {
                            Task {
                                var out: [SessionDetail] = []
                                for id in selected { if let d = try? await Api.session(id) { out.append(d) } }
                                results = out.sorted { ($0.started_at) < ($1.started_at) }
                                comparing = true
                            }
                        } label: { Text("Vergleichen (\(selected.count))").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent)
                        .disabled(selected.count < 2)
                        .padding()
                    }
                }
            }
            .navigationTitle(comparing ? "Vergleich" : "Vergleichen")
            .toolbar {
                if comparing {
                    ToolbarItem(placement: .topBarLeading) { Button("Auswahl") { comparing = false } }
                }
            }
            .task { sessions = (try? await Api.sessions()) ?? []; loading = false }
    }

    private var compareTable: some View {
        let metrics: [(String, (SessionDetail) -> String)] = [
            ("Strecke", { $0.analysis?.total_distance_m.map { "\(Int($0)) m" } ?? "–" }),
            ("Foiling", { $0.analysis?.foiling_distance_m.map { "\(Int($0)) m" } ?? "–" }),
            ("Top-Speed", { $0.analysis?.max_speed_mps.map { String(format: "%.1f km/h", $0 * 3.6) } ?? "–" }),
            ("Pumps", { $0.analysis?.pump_count.map { "\($0)" } ?? "–" }),
            ("Foil-Zeit", { s in s.analysis?.foiling_time_s.map { String(format: "%d:%02d", Int($0) / 60, Int($0) % 60) } ?? "–" }),
            ("Cadence", { $0.analysis?.avg_cadence_hz.map { String(format: "%.2f Hz", $0) } ?? "–" }),
        ]
        return ScrollView([.horizontal]) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("").frame(width: 90, alignment: .leading)
                    ForEach(results) { s in
                        Text(s.startedDate?.formatted(date: .abbreviated, time: .shortened) ?? s.started_at)
                            .font(.caption).bold().frame(width: 120, alignment: .leading)
                    }
                }
                Divider()
                ForEach(metrics, id: \.0) { label, fn in
                    HStack {
                        Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 90, alignment: .leading)
                        ForEach(results) { s in
                            Text(fn(s)).frame(width: 120, alignment: .leading)
                        }
                    }
                }
            }
            .padding()
        }
    }

    private func toggle(_ id: Int) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    private func dateText(_ s: SessionSummary) -> String {
        guard let d = s.startedDate else { return s.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
