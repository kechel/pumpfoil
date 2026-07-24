import SwiftUI

// Community/Foilers: Stats → Zeitraum+Accel → Community-Rekorde → Medien → Bestenliste →
// Best bewertet → Spots (spiegelt web/pages/Home.tsx + Android CommunityScreen).
struct CommunityView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var records: [String: PeriodRecords]?
    @State private var leaders: Leaders?
    @State private var media: [MediaItem] = []
    @State private var topLiked: [CommunityItem] = []
    @State private var cstats: Api.CommunityStats?
    @State private var spots: SpotsList?
    @State private var spotShown: [String] = []
    @State private var spotRecs: [String: PeriodRecords] = [:]
    @State private var spotQuery = ""
    @State private var loading = false
    @State private var error: String?
    @State private var period = "10d"
    @State private var accelOnly = true
    @State private var lbMetric = "sessions"

    private let periods: [(String, String)] = [("today", "period.today"), ("10d", "period.10d"), ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all")]
    private let gridCols = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    private var periodLabel: String { Loc.t(periods.first { $0.0 == period }?.1 ?? "period.all", lang) }
    private var lbMetrics: [(String, String)] {
        [("sessions", Loc.t("leader.mostSessions", lang)), ("runs", Loc.t("leader.mostRuns", lang)),
         ("pumps", Loc.t("leader.mostPumps", lang)), ("spots", Loc.t("leader.mostSpots", lang))]
    }
    private func lbList(_ lb: Leaders) -> [LeaderEntry] {
        switch lbMetric { case "runs": return lb.runs ?? []; case "pumps": return lb.pumps ?? []
        case "spots": return lb.spots ?? []; default: return lb.sessions ?? [] }
    }
    private func lbValue(_ e: LeaderEntry) -> Int {
        switch lbMetric { case "runs": return e.runs ?? 0; case "pumps": return e.pumps ?? 0
        case "spots": return e.spots ?? 0; default: return e.sessions ?? 0 }
    }
    private var lbUnit: String {
        switch lbMetric { case "runs": return Loc.t("unit.runs", lang); case "pumps": return Loc.t("unit.pumps", lang)
        case "spots": return Loc.t("unit.spots", lang); default: return Loc.t("unit.sessions", lang) }
    }
    private var spotMatches: [String] {
        let q = spotQuery.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty, let all = spots?.all else { return [] }
        return all.filter { $0.lowercased().contains(q) && !spotShown.contains($0) }.prefix(6).map { $0 }
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

                periodSection
                if records != nil {
                    Section { recordGrid(records?[period], showSpot: true) }
                }
                mediaFeedSection
                leaderboardSection
                topLikedSection
                spotsSection
            }
            .listStyle(.plain)   // .insetGrouped hatte großen Top-Inset -> zu viel Padding oben
            .navigationTitle(Loc.t("nav.community", lang))
            .brandToolbar(Loc.t("nav.community", lang))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { FoilStatsView() } label: { Image(systemName: "figure.surfing") }
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { WatchStatsView() } label: { Image(systemName: "applewatch") }
                }
                ToolbarItem(placement: .topBarTrailing) { SyncButton() }
            }
            .overlay { if loading && records == nil { ProgressView() } }
            .refreshable { await loadBase(); await loadPeriod(); await loadSpotRecs() }
            .task { if records == nil { await loadBase(); await loadPeriod(); await loadSpotRecs() } }
            // „Neueste Medien" bei jedem Betreten auffrischen (gelöschte Fotos sofort weg, wie PWA).
            .onAppear { Task { media = (try? await Api.latestPhotos()) ?? [] } }
            .onChange(of: accelOnly) { _ in Task { await loadBase(); await loadPeriod(); await loadSpotRecs() } }
            .onChange(of: period) { _ in Task { await loadPeriod(); await loadSpotRecs() } }
            .onChange(of: spotShown) { _ in Task { await loadSpotRecs() } }
        }
    }

    // MARK: - Rekord-Grid

    private struct RecRow: Identifiable { let id = UUID(); let label: String; let value: String; let entry: CommunityRecordEntry? }

    private func recordRows(_ r: PeriodRecords?) -> [RecRow] {
        func ok(_ e: CommunityRecordEntry?) -> Bool { e?.session_id != nil && (e?.value ?? 0) > 0 }
        func row(_ key: String, _ e: CommunityRecordEntry?, _ fmt: (Double) -> String) -> RecRow {
            RecRow(label: Loc.t(key, lang), value: ok(e) ? fmt(e!.value ?? 0) : "–", entry: ok(e) ? e : nil)
        }
        func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
        // Tageszeit-Rekorde: Sekunden seit Mitternacht (Spot-Ortszeit); Night Owl kann >24 h sein.
        func hhmm(_ v: Double) -> String {
            let s = ((Int(v) % 86400) + 86400) % 86400
            return String(format: "%02d:%02d", s / 3600, (s % 3600) / 60)
        }
        return [
            row("rec.farthestRun", r?.distance) { "\(Int($0.rounded())) m" },
            row("rec.longestRun", r?.duration) { dur($0) },
            row("rec.topSpeed", r?.speed) { String(format: "%.1f km/h", $0 * 3.6) },
            row("rec.longestGlide", r?.glide) { String(format: "%.1f s", $0) },
            row("rec.mostRuns", r?.runs) { "\(Int($0))" },
            row("rec.sessionDistance", r?.session_distance) { String(format: "%.1f km", $0 / 1000.0) },
            row("rec.sessionTime", r?.session_time) { "\(Int(($0 / 60).rounded())) min" },
            row("rec.sessionPumps", r?.session_pumps) { "\(Int($0.rounded()))" },
            row("rec.maxHr", r?.max_hr) { "\(Int($0.rounded())) bpm" },
            row("rec.earlyBird", r?.early_bird) { hhmm($0) },
            row("rec.nightOwl", r?.night_owl) { hhmm($0) },
        ]
    }

    @ViewBuilder private func recordGrid(_ r: PeriodRecords?, showSpot: Bool) -> some View {
        let rows = recordRows(r)
        if rows.allSatisfy({ $0.entry == nil }) {
            Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
        } else {
            LazyVGrid(columns: gridCols, spacing: 8) {
                ForEach(rows) { t in
                    if let sid = t.entry?.session_id {
                        NavigationLink { SessionDetailView(id: sid) } label: { recordCell(t, showSpot: showSpot) }
                            .buttonStyle(.plain)
                    } else {
                        recordCell(t, showSpot: showSpot)
                    }
                }
            }
            .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
        }
    }

    private func recordCell(_ t: RecRow, showSpot: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(t.value).font(.title3).bold().foregroundStyle(Color.accentColor).lineLimit(1)
            Text(t.label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            if let e = t.entry {
                if let n = e.name, !n.isEmpty {
                    HStack(spacing: 4) {
                        recAvatar(e.avatar_url)
                        Text(n).font(.caption).foregroundStyle(Color.accentColor).lineLimit(1)
                    }
                }
                let sub = [shortDate(e.started_at, e.tz), showSpot ? e.spot : nil].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !sub.isEmpty { Text(sub).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Kleine Bausteine

    private func chip(_ label: String, _ on: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).font(.caption).padding(.horizontal, 12).padding(.vertical, 6)
                .background(on ? Color.accentColor : Color(.tertiarySystemBackground))
                .foregroundStyle(on ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func recAvatar(_ url: String?) -> some View {
        if let u = Api.mediaURL(url) {
            AsyncImage(url: u) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 18, height: 18).clipShape(Circle())
        }
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

    // In typisierte Teil-Views zerlegt (Type-Checker-Hänger beim Archivieren) — [[ios-swift-typecheck-hang]].
    @ViewBuilder private var periodSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(periods, id: \.0) { id, key in chip(Loc.t(key, lang), period == id) { period = id } }
                }
            }
            HStack {
                Spacer()
                chip(Loc.t("side.onlyAccel", lang), accelOnly) { accelOnly = true }
                chip(Loc.t("side.all", lang), !accelOnly) { accelOnly = false }
            }
        }
    }

    @ViewBuilder private var mediaFeedSection: some View {
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
    }

    @ViewBuilder private var leaderboardSection: some View {
        if let lb = leaders, !(lb.sessions ?? []).isEmpty || !(lb.runs ?? []).isEmpty || !(lb.spots ?? []).isEmpty {
            Section("\(Loc.t("community.leaderboard", lang)) · \(periodLabel)") {
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
                        leaderRow(i, e)
                    }
                }
            }
        }
    }

    @ViewBuilder private func leaderRow(_ i: Int, _ e: LeaderEntry) -> some View {
        HStack(spacing: 8) {
            Text("\(i + 1)").font(.subheadline).bold().foregroundStyle(Color.accentColor).frame(width: 20)
            leaderAvatar(e)
            Text(e.name ?? "—").lineLimit(1)
            Spacer()
            Text("\(lbValue(e))").fontWeight(.semibold)
            Text(lbUnit).font(.caption2).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var topLikedSection: some View {
        if !topLiked.isEmpty {
            Section("\(Loc.t("community.topRated", lang)) · \(periodLabel)") {
                ForEach(topLiked) { s in
                    NavigationLink { SessionDetailView(id: s.id) } label: { CommunityRow(item: s) }
                }
            }
        }
    }

    @ViewBuilder private var spotsSection: some View {
        Section(Loc.t("home.spots", lang)) {
            TextField(Loc.t("home.spotSearch", lang), text: $spotQuery).textInputAutocapitalization(.never)
            ForEach(spotMatches, id: \.self) { m in
                Button {
                    if !spotShown.contains(m) { spotShown.insert(m, at: 0) }
                    spotQuery = ""
                } label: {
                    Label(m, systemImage: "mappin.and.ellipse").foregroundStyle(Color.accentColor)
                }
            }
            if spotShown.isEmpty {
                Text(Loc.t("home.noSpots", lang)).font(.caption).foregroundStyle(.secondary)
            }
            ForEach(spotShown, id: \.self) { sp in
                HStack {
                    Text("📍 \(sp)").font(.subheadline).bold().foregroundStyle(Color.accentColor)
                    if spots?.mine?.contains(sp) != true {
                        Button(Loc.t("home.remove", lang)) { spotShown.removeAll { $0 == sp } }
                            .font(.caption).foregroundStyle(.secondary).buttonStyle(.plain)
                    }
                }
                recordGrid(spotRecs["\(accelOnly):\(period):\(sp)"], showSpot: false)
            }
        }
    }

    @ViewBuilder private func mediaThumb(_ m: MediaItem) -> some View {
        // Video-Thumb über den servereigenen Proxy (zuverlässig, wie Sessions/Detail) statt
        // img.youtube.com direkt — letzteres lieferte im Feed leere Kacheln.
        let thumb: URL? = m.kind == "video"
            ? youtubeId(m.youtube_url).flatMap { URL(string: "\(Api.baseURL)/api/public/video-thumb/\($0)") }
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

    private func shortDate(_ iso: String?, _ tz: String?) -> String? {
        TimeFmt.shortDate(iso, tz)   // "dd.MM.yy" in Spot-Ortszeit
    }

    // MARK: - Laden

    private func loadBase() async {
        loading = true; defer { loading = false }
        do {
            records = try await Api.communityRecords(accelOnly: accelOnly); error = nil
            cstats = try? await Api.communityStats()
            media = (try? await Api.latestPhotos()) ?? []
            if let sp = try? await Api.spots(accelOnly: false) {
                spots = sp
                spotShown = sp.mine ?? []
                spotRecs = [:]
            }
        } catch { self.error = error.localizedDescription }
    }

    private func loadPeriod() async {
        leaders = try? await Api.leaders(period: period, accelOnly: accelOnly)
        topLiked = (try? await Api.topLiked(period: period)) ?? []
    }

    private func loadSpotRecs() async {
        for sp in spotShown {
            let key = "\(accelOnly):\(period):\(sp)"
            if spotRecs[key] == nil, let r = try? await Api.spotRecords(sp, period: period, accelOnly: accelOnly) {
                spotRecs[key] = r
            }
        }
    }
}

// Community-Feed-Zeile (eigene Shape: name/spot/avatar_url/like_count).
struct CommunityRow: View {
    let item: CommunityItem
    @ObservedObject private var compare = CompareStore.shared
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        content
            .contextMenu {
                Button {
                    compare.toggle(item.id)
                } label: {
                    Label(compare.contains(item.id) ? Loc.t("compare.remove", lang) : Loc.t("compare.add", lang),
                          systemImage: "arrow.left.arrow.right")
                }
            }
            .overlay(alignment: .leading) {
                if compare.contains(item.id) {
                    RoundedRectangle(cornerRadius: 3).fill(Color.accentColor).frame(width: 3)
                }
            }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 6) {   // Like unter dem Avatar (wie PWA), nicht in eigener Zeile rechts
                    avatar
                    LikeButton(sessionId: item.id, liked: item.liked ?? false, count: item.like_count ?? 0)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name ?? dateText).font(.headline)
                    if item.name != nil { Text(dateText).font(.caption).foregroundStyle(.secondary) }
                    if (item.spot?.isEmpty == false) || (item.device_label?.isEmpty == false) {
                        HStack(spacing: 6) {
                            if let spot = item.spot, !spot.isEmpty { sessionPill(spot) }
                            if let dl = item.device_label, !dl.isEmpty { sessionPill(dl) }
                        }
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
                if let vid = youtubeId(item.youtube_url) {
                    ZStack {
                        AsyncImage(url: URL(string: "\(Api.baseURL)/api/public/video-thumb/\(vid)")) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: Color.secondary.opacity(0.15)
                            }
                        }
                        .frame(width: 58, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                        Image(systemName: "play.circle.fill").foregroundStyle(.white).font(.title3)
                    }
                }
            }
            if let stats = statsText { Text(stats).font(.caption).lineLimit(1) }
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
        sessionDateTime(item.started_at, item.ended_at, item.tz)
    }
}
