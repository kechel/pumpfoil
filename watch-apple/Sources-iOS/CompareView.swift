import SwiftUI

// Mehrere eigene Sessions nebeneinander vergleichen. Auswahl kommt AUSSCHLIESSLICH per
// Long-Press aus den Session-Listen (CompareStore/preselect) — keine eigene Auswahlliste hier.
struct CompareView: View {
    var preselect: Set<Int> = []
    @AppStorage("appLang") private var lang = "de"
    @State private var results: [SessionDetail] = []
    @State private var loading = true
    @State private var merging = false
    @State private var mergeError: String?
    @State private var mergedId: Int?

    var body: some View {
        // Kein eigener NavigationStack: View wird gepusht und nutzt den vorhandenen Stack.
        Group {
            if loading {
                ProgressView()
            } else if results.isEmpty {
                Text(Loc.t("compare.pick", lang)).foregroundStyle(.secondary).padding()
            } else {
                VStack(spacing: 0) {
                    compareTable
                    if let mergeError { Text(mergeError).font(.caption).foregroundStyle(.red).padding(.horizontal) }
                    if mergeable {
                        Button {
                            mergeError = nil; merging = true
                            Task {
                                do { mergedId = try await Api.mergeSessions(Array(preselect)) }
                                catch { mergeError = error.localizedDescription }
                                merging = false
                            }
                        } label: { Text(Loc.t("merge.action", lang)).frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent)
                        .disabled(merging)
                        .padding()
                    }
                }
            }
        }
        .navigationDestination(isPresented: Binding(get: { mergedId != nil }, set: { if !$0 { mergedId = nil } })) {
            if let id = mergedId { SessionDetailView(id: id) }
        }
        .navigationTitle(Loc.t("compare.title", lang))
        .task { await load() }
    }

    private func load() async {
        var out: [SessionDetail] = []
        for id in preselect { if let d = try? await Api.session(id) { out.append(d) } }
        results = out.sorted { $0.started_at < $1.started_at }
        loading = false
    }

    // Zusammenführen nur, wenn plausibel erlaubt (Client-Spiegel; Server prüft final): alle
    // eigene Sessions, >=2, gleicher Tag UND gleicher Spot.
    private var mergeable: Bool {
        guard results.count == preselect.count, results.count >= 2, results.allSatisfy({ $0.owned == true }) else { return false }
        let days = Set(results.map { String($0.started_at.prefix(10)) })
        let spots = Set(results.map { ($0.place_name ?? "").trimmingCharacters(in: .whitespaces).lowercased() })
        return days.count == 1 && spots.count == 1
    }

    private var compareTable: some View {
        let metrics: [(String, (SessionDetail) -> String)] = [
            (Loc.t("compare.distance", lang), { $0.analysis?.total_distance_m.map { "\(Int($0)) m" } ?? "–" }),
            (Loc.t("home.foiling", lang), { $0.analysis?.foiling_distance_m.map { "\(Int($0)) m" } ?? "–" }),
            (Loc.t("home.topSpeed", lang), { $0.analysis?.max_speed_mps.map { String(format: "%.1f km/h", $0 * 3.6) } ?? "–" }),
            (Loc.t("home.pumps", lang), { $0.analysis?.pump_count.map { "\($0)" } ?? "–" }),
            (Loc.t("compare.foilTime", lang), { s in s.analysis?.foiling_time_s.map { String(format: "%d:%02d", Int($0) / 60, Int($0) % 60) } ?? "–" }),
            (Loc.t("compare.cadence", lang), { $0.analysis?.avg_cadence_hz.map { String(format: "%.2f Hz", $0) } ?? "–" }),
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
}
