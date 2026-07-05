import SwiftUI

private enum SessionScope { case mine, spot, all }

// Sessions-Liste mit Scope-Umschalter (Meine / Homespot / Alle) + Spot-Suche.
struct SessionsView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var own: [SessionSummary] = []
    @State private var feed: [CommunityItem] = []
    @State private var scope: SessionScope = .mine
    @State private var homespot = ""
    @State private var spot = ""          // aktiver Spot (für .spot)
    @State private var spotInput = ""
    @State private var loading = false
    @State private var error: String?
    @State private var suggestions: [MergeSuggestion] = []

    var body: some View {
        NavigationStack {
            List {
                if scope == .mine {
                    ForEach(suggestions) { sug in
                        NavigationLink { CompareView(preselect: Set(sug.ids)) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Loc.t("merge.suggestTitle", lang)).font(.subheadline).bold()
                                Text([sug.place, sug.date, "\(sug.count)×"].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .listRowBackground(Color.accentColor.opacity(0.12))
                    }
                }
                Section {
                    scopeChips
                    HStack {
                        TextField(Loc.t("sessions.searchSpot", lang), text: $spotInput)
                            .textInputAutocapitalization(.never)
                            .onSubmit { applySpotSearch() }
                        Button { applySpotSearch() } label: { Image(systemName: "magnifyingglass") }
                            .buttonStyle(.borderless)
                    }
                }
                if let error { Text(error).foregroundStyle(.secondary) }
                if scope == .mine {
                    ForEach(own) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { SessionRow(session: s) }
                    }
                } else {
                    ForEach(feed) { c in
                        NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                    }
                }
                if isEmpty && !loading && error == nil {
                    Text(Loc.t("sessions.empty", lang)).foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(title)
            .brandToolbar(title)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
            .overlay { if loading && isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task {
                if homespot.isEmpty {
                    homespot = ((try? await Api.settings())?["homespot"] as? String) ?? ""
                }
                suggestions = (try? await Api.mergeSuggestions()) ?? []
                await load()
            }
            .onChange(of: scope) { _ in Task { await load() } }
            .onChange(of: spot) { _ in Task { await load() } }
            .onChange(of: sync.tick) { _ in Task { await load() } }
        }
    }

    private var title: String {
        switch scope {
        case .mine: return "\(Loc.t("nav.sessions", lang)) · \(Loc.t("sessions.mine", lang))"
        case .all: return "\(Loc.t("nav.sessions", lang)) · \(Loc.t("sessions.all", lang))"
        case .spot: return "\(Loc.t("nav.sessions", lang)) · 📍\(spot)"
        }
    }

    private var isEmpty: Bool { scope == .mine ? own.isEmpty : feed.isEmpty }

    @ViewBuilder private var scopeChips: some View {
        HStack(spacing: 8) {
            chip(Loc.t("sessions.mine", lang), scope == .mine) { scope = .mine }
            if !homespot.isEmpty {
                chip("📍\(homespot)", scope == .spot && spot == homespot) { spot = homespot; scope = .spot }
            }
            chip(Loc.t("sessions.all", lang), scope == .all) { scope = .all }
        }
    }

    private func chip(_ label: String, _ active: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(label).font(.subheadline) }
            .buttonStyle(.bordered)
            .tint(active ? .accentColor : .secondary)
    }

    private func applySpotSearch() {
        let s = spotInput.trimmingCharacters(in: .whitespaces)
        if !s.isEmpty { spot = s; scope = .spot }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            switch scope {
            case .mine: own = try await Api.sessions()
            case .all: feed = try await Api.communitySessions()
            case .spot: feed = spot.isEmpty ? [] : (try await Api.spotSessions(spot))
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct SessionRow: View {
    let session: SessionSummary
    var showOwner: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                leading
                VStack(alignment: .leading, spacing: 3) {
                    Text(headline).font(.headline)
                    let chips = chipLabels
                    if !chips.isEmpty {
                        HStack(spacing: 6) { ForEach(chips, id: \.self) { pill($0) } }
                    }
                    if !showOwner, let cap = session.caption, !cap.isEmpty {
                        Text(cap).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if let tp = session.track_preview {
                    TrackPreviewView(data: tp).frame(width: 58, height: 42)
                }
                if let url = Api.mediaURL(session.thumb_url) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color.secondary.opacity(0.15)
                        }
                    }
                    .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            if let stats = statsText {
                Text(stats).font(.caption).lineLimit(1)
            }
            if showBottom {
                HStack(spacing: 8) {
                    if session.status != "analyzed" {
                        Text(statusLabel(session.status)).font(.caption2).foregroundStyle(.orange)
                    }
                    Spacer()
                    if let likes = session.like_count, likes > 0 {
                        Label("\(likes)", systemImage: "heart.fill")
                            .font(.caption2).foregroundStyle(.pink).labelStyle(.titleAndIcon)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private var leading: some View {
        let avatar = showOwner ? Api.mediaURL(session.owner_avatar_url) : nil
        if let url = avatar {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 40, height: 40).clipShape(Circle())
        } else {
            Image(systemName: showOwner ? "person.crop.circle.fill" : "water.waves")
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 40, height: 40)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func pill(_ text: String) -> some View {
        Text(text).font(.caption2).lineLimit(1)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Color.secondary.opacity(0.15), in: Capsule())
    }

    private var headline: String {
        if showOwner, let owner = session.owner_name, !owner.isEmpty { return owner }
        return dateText
    }

    private var chipLabels: [String] {
        var c: [String] = []
        if let p = session.place_name, !p.isEmpty { c.append(p) }
        if let f = session.foil {
            let label = [f.brand, f.model, f.size].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
            if !label.isEmpty { c.append(label) }
        }
        return c
    }

    private var statsText: String? {
        guard let a = session.analysis else { return nil }
        let m = a.metrics
        var parts: [String] = []
        if let d = a.foiling_distance_m { parts.append(String(format: "%.2f km", d / 1000)) }
        if let t = a.foiling_time_s { parts.append(fmtDur(t)) }
        if let n = m?.num_segments, n > 0 { parts.append("\(n) " + (n == 1 ? "Lauf" : "Läufe")) }
        if let s = m?.avg_speed_mps { parts.append(String(format: "Ø %.1f km/h", s * 3.6)) }
        if let p = a.pump_count {
            var s = "↕ \(p)"
            if let hz = m?.avg_pump_hz { s += String(format: " · %.2f Hz", hz) }
            parts.append(s)
        }
        if let hr = m?.avg_hr, hr > 0 {
            var s = "♥ \(Int(hr.rounded()))"
            if let mx = m?.max_hr { s += "/\(Int(mx.rounded()))" }
            parts.append(s)
        }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    private var showBottom: Bool {
        session.status != "analyzed" || (session.like_count ?? 0) > 0
    }

    private var dateText: String {
        guard let d = session.startedDate else { return session.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}

// Mini-Track-Vorschau als Canvas-Polylinie (normalisierte Linien aus der Analyse).
struct TrackPreviewView: View {
    let data: String
    var body: some View {
        Canvas { ctx, size in
            guard let tp = TrackPreviewData.parse(data), !tp.lines.isEmpty, tp.w > 0, tp.h > 0 else { return }
            let sc = min(size.width / tp.w, size.height / tp.h)
            let ox = (size.width - tp.w * sc) / 2
            let oy = (size.height - tp.h * sc) / 2
            for line in tp.lines where line.count >= 2 {
                var path = Path()
                for (i, pt) in line.enumerated() where pt.count >= 2 {
                    let x = ox + pt[0] * sc
                    let y = oy + pt[1] * sc
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
                ctx.stroke(path, with: .color(.accentColor), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

// Wiederverwendbarer Chip (Spot/Foil) — auch von CommunityRow genutzt.
@ViewBuilder func sessionPill(_ text: String) -> some View {
    Text(text).font(.caption2).lineLimit(1)
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(Color.secondary.opacity(0.15), in: Capsule())
}

func fmtDur(_ s: Double) -> String { let t = Int(s); return String(format: "%d:%02d", t / 60, t % 60) }

private func statusLabel(_ s: String) -> String {
    switch s {
    case "live": return "läuft"
    case "uploaded", "processing", "analyzing": return "verarbeite…"
    default: return s
    }
}
