import SwiftUI

// Community: Bestenliste, neueste Medien, best bewertet, Spot-Rekorde + Feed
// (spiegelt web/Community + Android).
struct CommunityView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [CommunityItem] = []
    @State private var leaders: Leaders?
    @State private var media: [MediaItem] = []
    @State private var topLiked: [CommunityItem] = []
    @State private var loading = false
    @State private var error: String?
    @State private var lbMetric = "sessions"
    @State private var spotQuery = ""
    @State private var spotRecords: PeriodRecords?
    @State private var spotShown = ""
    @State private var cstats: Api.CommunityStats?

    private var lbMetrics: [(String, String)] {
        [("sessions", Loc.t("nav.sessions", lang)), ("runs", Loc.t("home.runs", lang)),
         ("pumps", Loc.t("home.pumps", lang)), ("spots", Loc.t("nav.spots", lang))]
    }
    private func lbList(_ lb: Leaders) -> [LeaderEntry] {
        switch lbMetric { case "runs": return lb.runs ?? []; case "pumps": return lb.pumps ?? []
        case "spots": return lb.spots ?? []; default: return lb.sessions ?? [] }
    }
    private func lbValue(_ e: LeaderEntry) -> Int {
        switch lbMetric { case "runs": return e.runs ?? 0; case "pumps": return e.pumps ?? 0
        case "spots": return e.spots ?? 0; default: return e.sessions ?? 0 }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }

                if let cs = cstats {
                    communityStatsText(cs, lang)
                        .font(.caption)
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                }

                if let lb = leaders, !lbList(lb).isEmpty || !(lb.sessions ?? []).isEmpty {
                    Section(Loc.t("community.leaderboard", lang)) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(lbMetrics, id: \.0) { id, label in chip(label, lbMetric == id) { lbMetric = id } }
                            }
                        }
                        let list = Array(lbList(lb).prefix(5))
                        if list.isEmpty {
                            Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
                        } else {
                            ForEach(Array(list.enumerated()), id: \.offset) { i, e in
                                HStack(spacing: 8) {
                                    Text("\(i + 1)").font(.subheadline).bold().foregroundStyle(Color.accentColor).frame(width: 20)
                                    leaderAvatar(e)
                                    Text(e.name ?? "—").lineLimit(1)
                                    Spacer()
                                    Text("\(lbValue(e))").fontWeight(.semibold)
                                }
                            }
                        }
                    }
                }

                if !media.isEmpty {
                    Section(Loc.t("community.latestMedia", lang)) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(media) { m in
                                    NavigationLink { SessionDetailView(id: m.session_id) } label: { mediaThumb(m) }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }

                if !topLiked.isEmpty {
                    Section(Loc.t("community.topRated", lang)) {
                        ForEach(topLiked) { s in
                            NavigationLink { SessionDetailView(id: s.id) } label: { CommunityRow(item: s) }
                        }
                    }
                }

                Section(Loc.t("community.spotRecords", lang)) {
                    HStack {
                        TextField(Loc.t("sessions.searchSpot", lang), text: $spotQuery)
                            .textInputAutocapitalization(.never).onSubmit { searchSpot() }
                        Button { searchSpot() } label: { Image(systemName: "magnifyingglass") }
                    }
                    if let rec = spotRecords {
                        Text("📍 \(spotShown)").font(.caption).foregroundStyle(.secondary)
                        let tiles = spotTiles(rec)
                        if tiles.isEmpty {
                            Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
                        } else {
                            ForEach(tiles, id: \.label) { t in
                                if let sid = t.entry.session_id {
                                    NavigationLink { SessionDetailView(id: sid) } label: { recordTile(t) }
                                } else { recordTile(t) }
                            }
                        }
                    }
                }

                Section(Loc.t("sessions.all", lang)) {
                    ForEach(items) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { CommunityRow(item: s) }
                    }
                    if items.isEmpty && !loading && error == nil {
                        Text(Loc.t("sessions.empty", lang)).foregroundStyle(.secondary)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.community", lang))
            .brandToolbar(Loc.t("nav.community", lang))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { CommunityRecordsView() } label: { Image(systemName: "trophy") }
                }
                ToolbarItem(placement: .topBarTrailing) { SyncButton() }
            }
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    private struct RecRow { let label: String; let value: String; let entry: CommunityRecordEntry }

    private func spotTiles(_ r: PeriodRecords) -> [RecRow] {
        var out: [RecRow] = []
        func dist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
        func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
        if let e = r.speed, (e.value ?? 0) > 0 { out.append(RecRow(label: Loc.t("home.topSpeed", lang), value: String(format: "%.1f km/h", (e.value ?? 0) * 3.6), entry: e)) }
        if let e = r.distance, (e.value ?? 0) > 0 { out.append(RecRow(label: Loc.t("home.farthestRun", lang), value: dist(e.value ?? 0), entry: e)) }
        if let e = r.duration, (e.value ?? 0) > 0 { out.append(RecRow(label: Loc.t("home.longestRun", lang), value: dur(e.value ?? 0), entry: e)) }
        if let e = r.glide, (e.value ?? 0) > 0 { out.append(RecRow(label: Loc.t("home.longestGlide", lang), value: dur(e.value ?? 0), entry: e)) }
        if let e = r.runs, (e.value ?? 0) > 0 { out.append(RecRow(label: Loc.t("home.mostRuns", lang), value: "\(Int(e.value ?? 0))", entry: e)) }
        return out
    }

    private func recordTile(_ t: RecRow) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t.label).font(.caption).foregroundStyle(.secondary)
            Text(t.value).font(.title3).bold().foregroundStyle(Color.accentColor)
            if let n = t.entry.name, !n.isEmpty { Text(n).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private func chip(_ label: String, _ on: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).font(.caption).padding(.horizontal, 12).padding(.vertical, 6)
                .background(on ? Color.accentColor : Color(.tertiarySystemBackground))
                .foregroundStyle(on ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func leaderAvatar(_ e: LeaderEntry) -> some View {
        if let url = Api.mediaURL(e.avatar_url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 28, height: 28).clipShape(Circle())
        }
    }

    @ViewBuilder private func mediaThumb(_ m: MediaItem) -> some View {
        let thumb: URL? = m.kind == "video"
            ? youtubeId(m.youtube_url).flatMap { URL(string: "https://img.youtube.com/vi/\($0)/hqdefault.jpg") }
            : Api.mediaURL(m.url)
        ZStack {
            AsyncImage(url: thumb) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Color(.tertiarySystemBackground)
                }
            }
            .frame(width: 150, height: 100).clipped()
            if m.kind == "video" {
                Image(systemName: "play.circle.fill").font(.title).foregroundStyle(.white.opacity(0.9))
            }
        }
        .frame(width: 150, height: 100).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func searchSpot() {
        let q = spotQuery.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        Task {
            spotShown = q
            spotRecords = try? await Api.spotRecords(q)
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            items = try await Api.communitySessions(); error = nil
            cstats = try? await Api.communityStats()
            leaders = try? await Api.leaders()
            media = (try? await Api.latestPhotos()) ?? []
            topLiked = (try? await Api.topLiked(limit: 5)) ?? []
        } catch { self.error = error.localizedDescription }
    }
}

// Community-Feed-Zeile (eigene Shape: name/spot/avatar_url/like_count).
struct CommunityRow: View {
    let item: CommunityItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                avatar
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name ?? dateText).font(.headline)
                    if item.name != nil { Text(dateText).font(.caption).foregroundStyle(.secondary) }
                    if let spot = item.spot, !spot.isEmpty {
                        HStack(spacing: 6) { sessionPill(spot) }
                    }
                    if let cap = item.caption, !cap.isEmpty {
                        Text(cap).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if let tp = item.track_preview {
                    TrackPreviewView(data: tp).frame(width: 58, height: 42)
                }
                if let url = Api.mediaURL(item.thumb_url) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color.secondary.opacity(0.15)
                        }
                    }
                    .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            if let stats = statsText { Text(stats).font(.caption).lineLimit(1) }
            if let likes = item.like_count, likes > 0 {
                HStack {
                    Spacer()
                    Label("\(likes)", systemImage: "heart.fill")
                        .font(.caption2).foregroundStyle(.pink).labelStyle(.titleAndIcon)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var statsText: String? {
        var parts: [String] = []
        if let r = item.runs, r > 0 { parts.append("\(r) " + (r == 1 ? "Lauf" : "Läufe")) }
        if let km = item.foiling_km, km > 0 { parts.append(String(format: "%.2f km", km)) }
        if let mx = item.max_speed_mps { parts.append(String(format: "max %.1f km/h", mx * 3.6)) }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    @ViewBuilder private var avatar: some View {
        if let url = Api.mediaURL(item.avatar_url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 36, height: 36).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.title3).foregroundStyle(Color.accentColor)
                .frame(width: 36, height: 36)
        }
    }

    private var dateText: String {
        guard let d = item.startedDate else { return item.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
