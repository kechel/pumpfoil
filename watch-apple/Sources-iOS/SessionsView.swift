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
    @State private var spotNames: [String] = []
    @State private var spot = ""          // aktiver Spot (für .spot)
    @State private var loading = false
    @State private var error: String?
    @State private var suggestions: [MergeSuggestion] = []
    @State private var incoming: [Transfer] = []
    @State private var accelOnly = false      // wie PWA-Umschalter (Default: alle)
    @State private var filter = "pump"         // pump | other (nur eigene)
    @State private var month = ""              // "YYYY-MM" | "" (nur eigene)
    @State private var months: [MonthCount] = []
    @State private var weather: WeatherBlock?

    var body: some View {
        NavigationStack {
            List {
                if scope == .mine {
                    ForEach(incoming) { tr in
                        IncomingTransferRow(tr: tr, lang: lang) { await reloadIncoming() }
                            .listRowBackground(Color.accentColor.opacity(0.12))
                    }
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
                    // Scope-Umschalter in eigener Zeile, damit Meine | 📍Homespot | Alle immer
                    // vollständig sichtbar sind (vorher im gequetschten H-Scroll -> „Alle" abgeschnitten).
                    ScrollView(.horizontal, showsIndicators: false) { scopeChips }
                    HStack {
                        chip(Loc.t("side.onlyAccel", lang), accelOnly) { accelOnly = true }
                        chip(Loc.t("side.all", lang), !accelOnly) { accelOnly = false }
                        Spacer()
                        // Spot-Auswahl als Menü (statt Freitext-Suche, die exakte Namen brauchte).
                        Menu {
                            Button(Loc.t("all.allSpots", lang)) { spot = ""; if scope == .spot { scope = .all } }
                            ForEach(spotNames, id: \.self) { s in
                                Button(s) { spot = s; scope = .spot }
                            }
                        } label: {
                            Label(spot.isEmpty ? Loc.t("all.allSpots", lang) : spot, systemImage: "mappin.and.ellipse")
                                .font(.subheadline).lineLimit(1)
                        }
                    }
                    if scope == .mine {
                        HStack(spacing: 8) {
                            chip(Loc.t("sessions.filterPump", lang), filter == "pump") { filter = "pump"; month = "" }
                            chip(Loc.t("sessions.filterOther", lang), filter == "other") { filter = "other"; month = "" }
                            Menu {
                                Button(Loc.t("sessions.allMonths", lang)) { month = "" }
                                ForEach(months) { mc in
                                    Button("\(monthLabel(mc.month)) (\(mc.count))") { month = mc.month }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Text(month.isEmpty ? Loc.t("sessions.allMonths", lang) : monthLabel(month)).font(.subheadline)
                                    Image(systemName: "chevron.down").font(.caption2)
                                }
                            }
                        }
                    }
                }
                if scope == .spot, let wb = weather {
                    Section { HomeWeatherCard(wb: wb, lang: lang) }
                }
                if let error { Text(error).foregroundStyle(.secondary) }
                if scope == .mine {
                    ForEach(own) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { SessionRow(session: s) }
                    }
                    if !own.isEmpty {
                        Text(Loc.t("sessions.listEnd", lang)).font(.caption2).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                } else {
                    ForEach(feed) { c in
                        NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                    }
                }
                if isEmpty && !loading && error == nil {
                    Text(scope == .mine && !month.isEmpty ? Loc.t("sessions.noneMonth", lang) : Loc.t("sessions.empty", lang))
                        .foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(title)
            .brandToolbar(title)
            .toolbar {
                // Spot-Chat, wenn ein Spot gefiltert ist (scope "spot:<name>", wie PWA/SpotSessions).
                if scope == .spot, !spot.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink { ChatRoomView(scope: "spot:\(spot)", title: spot) } label: {
                            Image(systemName: "bubble.left.and.bubble.right")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { SyncButton() }
            }
            .overlay { if loading && isEmpty { ProgressView() } }
            .refreshable { await reloadIncoming(); await load() }
            .task {
                if homespot.isEmpty {
                    homespot = ((try? await Api.settings())?["homespot"] as? String) ?? ""
                }
                suggestions = (try? await Api.mergeSuggestions()) ?? []
                spotNames = (try? await Api.spots(accelOnly: false))?.all ?? []
                await reloadIncoming()
                await load()
            }
            // Bei jedem Betreten neu laden (neue Sessions sofort sichtbar, wie PWA) — leert
            // die Liste nicht, aktualisiert nur im Hintergrund.
            .onAppear { Task { await load() } }
            .onChange(of: scope) { _ in Task { await load() } }
            .onChange(of: spot) { _ in Task { await loadWeather(); await load() } }
            .onChange(of: accelOnly) { _ in Task { await load() } }
            .onChange(of: filter) { _ in Task { await loadMonths(); await load() } }
            .onChange(of: month) { _ in Task { await load() } }
            .onChange(of: sync.tick) { _ in Task { await load() } }
            .task { await loadMonths() }
        }
    }

    private func reloadIncoming() async { incoming = (try? await Api.transfersIncoming()) ?? [] }
    private func loadMonths() async { months = (try? await Api.sessionMonths(filter: filter)) ?? [] }
    private func loadWeather() async {
        weather = spot.isEmpty ? nil : (try? await Api.spotWeather(spot))?.weather
    }
    private func monthLabel(_ m: String) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM"
        guard let d = f.date(from: m) else { return m }
        let out = DateFormatter(); out.dateFormat = "LLLL yyyy"
        return out.string(from: d).capitalized
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
            chip(Loc.t("sessions.mine", lang), scope == .mine) { spot = ""; scope = .mine }
            if !homespot.isEmpty {
                chip("📍\(homespot)", scope == .spot && spot == homespot) { spot = homespot; scope = .spot }
            }
            chip(Loc.t("sessions.all", lang), scope == .all && spot.isEmpty) { spot = ""; scope = .all }
        }
    }

    private func chip(_ label: String, _ active: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(label).font(.subheadline) }
            .buttonStyle(.bordered)
            .tint(active ? .accentColor : .secondary)
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            switch scope {
            case .mine: own = try await Api.sessions(month: month.isEmpty ? nil : month, filter: filter, accelOnly: accelOnly)
            case .all: feed = try await Api.communitySessions(accelOnly: accelOnly)
            case .spot: feed = spot.isEmpty ? [] : (try await Api.spotSessions(spot, accelOnly: accelOnly))
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct SessionRow: View {
    let session: SessionSummary
    var showOwner: Bool = false
    @ObservedObject private var compare = CompareStore.shared
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        content
            .contextMenu {
                Button {
                    compare.toggle(session.id)
                } label: {
                    Label(compare.contains(session.id) ? Loc.t("compare.remove", lang) : Loc.t("compare.add", lang),
                          systemImage: "arrow.left.arrow.right")
                }
            }
            .overlay(alignment: .leading) {
                if compare.contains(session.id) {
                    RoundedRectangle(cornerRadius: 3).fill(Color.accentColor).frame(width: 3)
                }
            }
    }

    private var content: some View {
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
                if let vid = youtubeId(session.youtube_url) {
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
            if let stats = statsText {
                Text(stats).font(.caption).lineLimit(1)
            }
            HStack(spacing: 8) {
                if session.transfer_to != nil {
                    Text(Loc.t("transfer.badge", lang)).font(.caption2)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.orange.opacity(0.2)).foregroundStyle(.orange)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                if session.status != "analyzed" {
                    Text(statusLabel(session.status)).font(.caption2).foregroundStyle(.orange)
                }
                Spacer()
                LikeButton(sessionId: session.id, liked: session.liked ?? false, count: session.like_count ?? 0)
            }
        }
        .padding(.vertical, 4)
    }

    // Profilbild des Besitzers, sonst farbiger Kreis mit Initiale (wie PWA). owner_* liefert der
    // Server jetzt für alle Sessions (auch eigene).
    private var leading: some View {
        AvatarView(name: session.owner_name, url: Api.mediaURL(session.owner_avatar_url), size: 40)
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
        if let dl = session.device_label, !dl.isEmpty { c.append(dl) }
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
            var s = "\(Int(hr.rounded()))"
            if let mx = m?.max_hr { s += "/\(Int(mx.rounded()))" }
            parts.append(s + " bpm")
        }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    private var showBottom: Bool {
        session.status != "analyzed" || (session.like_count ?? 0) > 0
    }

    private var dateText: String {
        sessionDateTime(session.started_at, session.ended_at)
    }
}

// Tappbarer Like-Button in Listenkarten (optimistisch, wie Web): rosa wenn geliked.
struct LikeButton: View {
    let sessionId: Int
    @State var liked: Bool
    @State var count: Int
    var body: some View {
        Button {
            let prev = liked; liked.toggle(); count += liked ? 1 : -1
            Task {
                do { let st = try await Api.toggleLike(sessionId); liked = st.liked; count = st.like_count }
                catch { liked = prev; count += liked ? 1 : -1 }
            }
        } label: {
            Label(count > 0 ? "\(count)" : "", systemImage: liked ? "heart.fill" : "heart")
                .labelStyle(.titleAndIcon).font(.caption2)
                .foregroundStyle(liked ? .pink : .secondary)
        }
        .buttonStyle(.plain)
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

// Datum + Start[–Ende] + „Uhr" (nur wo üblich, via sessions.oclock) für die Listen-Zeilen.
func sessionDateTime(_ startISO: String, _ endISO: String?) -> String {
    func parse(_ s: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]; return f.date(from: s)
    }
    guard let s = parse(startISO) else { return startISO }
    let lang = UserDefaults.standard.string(forKey: "appLang") ?? "de"
    let oc = Loc.t("sessions.oclock", lang)
    let ocSuffix = oc.isEmpty ? "" : " " + oc
    let start = s.formatted(date: .abbreviated, time: .shortened)
    if let endISO, let e = parse(endISO) {
        return start + " – " + e.formatted(date: .omitted, time: .shortened) + ocSuffix
    }
    return start + ocSuffix
}

private func statusLabel(_ s: String) -> String {
    switch s {
    case "live": return "läuft"
    case "uploaded", "processing", "analyzing": return "verarbeite…"
    default: return s
    }
}

// Eingehende Session-Übertragung an mich: ansehen / annehmen / ablehnen (spiegelt web/IncomingTransfers).
struct IncomingTransferRow: View {
    let tr: Transfer
    let lang: String
    let onDone: () async -> Void
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(Loc.t("transfer.incomingTitle", lang)) · \(Loc.t("transfer.from", lang).replacingOccurrences(of: "{name}", with: tr.other?.display_name ?? "?"))")
                .font(.subheadline).bold()
            if let s = tr.session {
                let sub = [s.place, s.started_at.map(prettyDay)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !sub.isEmpty { Text(sub).font(.caption).foregroundStyle(.secondary) }
            }
            HStack {
                if let sid = tr.session?.id {
                    NavigationLink(Loc.t("transfer.view", lang)) { SessionDetailView(id: sid) }
                        .buttonStyle(.bordered).font(.caption)
                }
                Spacer()
                Button(Loc.t("transfer.decline", lang)) {
                    busy = true; Task { try? await Api.transferDecline(tr.id); await onDone(); busy = false }
                }.buttonStyle(.bordered).font(.caption).disabled(busy)
                Button(Loc.t("transfer.accept", lang)) {
                    busy = true; Task { try? await Api.transferAccept(tr.id); await onDone(); busy = false }
                }.buttonStyle(.borderedProminent).font(.caption).disabled(busy)
            }
        }
        .padding(.vertical, 2)
    }

    private func prettyDay(_ iso: String) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let d = f.date(from: iso) ?? { f.formatOptions = [.withInternetDateTime]; return f.date(from: iso) }()
        guard let d else { return "" }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
