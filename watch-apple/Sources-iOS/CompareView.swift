import SwiftUI

// Mehrere eigene Sessions auswählen und Kennzahlen nebeneinander vergleichen.
struct CompareView: View {
    var preselect: Set<Int> = []
    @AppStorage("appLang") private var lang = "de"
    @State private var sessions: [SessionSummary] = []
    @State private var selected: Set<Int> = []
    @State private var results: [SessionDetail] = []
    @State private var loading = true
    @State private var comparing = false
    @State private var merging = false
    @State private var mergeError: String?
    @State private var mergedId: Int?

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
                            Section(Loc.t("compare.pick", lang)) {
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
                        if let mergeError { Text(mergeError).font(.caption).foregroundStyle(.red).padding(.horizontal) }
                        HStack {
                            Button {
                                Task {
                                    var out: [SessionDetail] = []
                                    for id in selected { if let d = try? await Api.session(id) { out.append(d) } }
                                    results = out.sorted { ($0.started_at) < ($1.started_at) }
                                    comparing = true
                                }
                            } label: { Text("\(Loc.t("compare.title", lang)) (\(selected.count))").frame(maxWidth: .infinity) }
                            .buttonStyle(.bordered)
                            .disabled(selected.count < 2)
                            Button {
                                let ids = Array(selected); mergeError = nil; merging = true
                                Task {
                                    do { mergedId = try await Api.mergeSessions(ids) }
                                    catch { mergeError = error.localizedDescription }
                                    merging = false
                                }
                            } label: { Text(Loc.t("merge.action", lang)).frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent)
                            .disabled(selected.count < 2 || merging)
                        }
                        .padding()
                    }
                }
            }
            .navigationDestination(isPresented: Binding(get: { mergedId != nil }, set: { if !$0 { mergedId = nil } })) {
                if let id = mergedId { SessionDetailView(id: id) }
            }
            .task(id: preselect) { if selected.isEmpty { selected = preselect } }
            .navigationTitle(comparing ? Loc.t("compare.result", lang) : Loc.t("compare.title", lang))
            .toolbar {
                if comparing {
                    ToolbarItem(placement: .topBarLeading) { Button(Loc.t("compare.backToSelection", lang)) { comparing = false } }
                }
            }
            .task { sessions = (try? await Api.sessions()) ?? []; loading = false }
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

    private func toggle(_ id: Int) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    private func dateText(_ s: SessionSummary) -> String {
        guard let d = s.startedDate else { return s.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
