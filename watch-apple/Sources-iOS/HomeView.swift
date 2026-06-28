import SwiftUI

// Persönliches Dashboard: Gesamt-Kennzahlen, Rekorde (klickbar zur Session), letzte Sessions.
struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var stats: OverallStats?
    @State private var latest: [SessionSummary] = []
    @State private var loading = true

    private let cols = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("\(Loc.t("home.hello", lang)) \(session.profile?.display_name ?? "")".trimmingCharacters(in: .whitespaces))
                        .font(.title2).bold()

                    if let st = stats {
                        LazyVGrid(columns: cols, spacing: 12) {
                            tile("\(st.count ?? 0)", Loc.t("nav.sessions", lang))
                            tile(String(format: "%.1f km", st.foiling_km ?? 0), Loc.t("home.foiling", lang))
                            tile("\(st.runs_total ?? 0)", Loc.t("home.runs", lang))
                            tile("\(st.pumps ?? 0)", Loc.t("home.pumps", lang))
                        }
                        if let r = st.records {
                            Text(Loc.t("home.records", lang)).font(.headline)
                            LazyVGrid(columns: cols, spacing: 12) {
                                if let v = r.speed { recordTile(String(format: "%.1f km/h", (v.value ?? 0) * 3.6), Loc.t("home.topSpeed", lang), v.session_id) }
                                if let v = r.distance { recordTile(fmtDist(v.value ?? 0), Loc.t("home.farthestRun", lang), v.session_id) }
                                if let v = r.duration { recordTile(fmtDur(v.value ?? 0), Loc.t("home.longestRun", lang), v.session_id) }
                                if let v = r.glide { recordTile(fmtDur(v.value ?? 0), Loc.t("home.longestGlide", lang), v.session_id) }
                                if let v = r.runs { recordTile("\(Int(v.value ?? 0))", Loc.t("home.mostRuns", lang), v.session_id) }
                            }
                        }
                    }

                    if !latest.isEmpty {
                        Text(Loc.t("home.latest", lang)).font(.headline)
                        VStack(spacing: 0) {
                            ForEach(latest) { s in
                                NavigationLink { SessionDetailView(id: s.id) } label: {
                                    SessionRow(session: s)
                                }
                                .buttonStyle(.plain)
                                Divider()
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(Loc.t("nav.home", lang))
            .overlay { if loading && stats == nil { ProgressView() } }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: sync.tick) { _ in Task { await load() } }
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3).bold().foregroundStyle(Color.accentColor)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func recordTile(_ value: String, _ label: String, _ sessionId: Int?) -> some View {
        if let sessionId {
            NavigationLink { SessionDetailView(id: sessionId) } label: { tile(value, label) }
                .buttonStyle(.plain)
        } else {
            tile(value, label)
        }
    }

    private func dateText(_ s: SessionSummary) -> String {
        guard let d = s.startedDate else { return s.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
    private func fmtDist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
    private func fmtDur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }

    private func load() async {
        loading = true; defer { loading = false }
        stats = try? await Api.stats()
        latest = Array(((try? await Api.sessions()) ?? []).prefix(3))
    }
}
