import SwiftUI

private enum SessionScope { case mine, spot, all }

// Sessions-Liste mit Scope-Umschalter (Meine / Homespot / Alle) + Spot-Suche.
struct SessionsView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var own: [SessionSummary] = []
    @State private var confirmDeleteAll = false
    @State private var feed: [CommunityItem] = []
    @State private var groups: [CommunityGroup] = []   // Community/Spot: Tages-Gruppen
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
                if scope == .mine { transfersAndSuggestions }
                filterSection
                if scope == .spot, let wb = weather {
                    Section { HomeWeatherCard(wb: wb, lang: lang) }
                }
                if let error { Text(error).foregroundStyle(.secondary) }
                sessionRows
                if isEmpty && !loading && error == nil {
                    Text(scope == .mine && !month.isEmpty ? Loc.t("sessions.noneMonth", lang) : Loc.t("sessions.empty", lang))
                        .foregroundStyle(.secondary)
                }
            }
            .listStyle(.plain)   // .insetGrouped hatte großen Top-Inset -> zu viel Padding oben
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

    // In typisierte Teil-Views zerlegt, damit der Swift-Type-Checker den body nicht als einen
    // Riesen-Ausdruck lösen muss (Archive-Hänger) — [[ios-swift-typecheck-hang]].
    @ViewBuilder private var transfersAndSuggestions: some View {
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

    @ViewBuilder private var filterSection: some View {
        Section {
            // Alle Filter in EINER List-Row (VStack) — sonst erzeugt jede Zeile den großen
            // Default-Zeilenabstand der List zwischen sich.
            VStack(alignment: .leading, spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) { scopeChips }
                HStack {
                    chip(Loc.t("side.onlyAccel", lang), accelOnly) { accelOnly = true }
                    chip(Loc.t("side.all", lang), !accelOnly) { accelOnly = false }
                    Spacer()
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
                if scope == .mine { monthFilterRow }
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    @ViewBuilder private var monthFilterRow: some View {
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
            // Alle Aussortierten löschen — Server erzwingt owner+other; hier nur Komfort + Confirm.
            if filter == "other" && !own.isEmpty {
                Spacer()
                Button(Loc.t("sessions.deleteAllOther", lang), role: .destructive) { confirmDeleteAll = true }
                    .font(.caption)
            }
        }
        .alert(Loc.t("sessions.deleteAllOther", lang), isPresented: $confirmDeleteAll) {
            Button(Loc.t("common.delete", lang), role: .destructive) {
                Task {
                    _ = try? await Api.deleteAllOtherSessions()
                    await load()
                }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        } message: {
            Text(Loc.t("sessions.deleteAllOtherConfirm", lang))
        }
    }

    @ViewBuilder private var sessionRows: some View {
        if scope == .mine {
            ForEach(own) { s in
                NavigationLink { SessionDetailView(id: s.id, dataVersion: s.data_version) } label: { SessionRow(session: s) }
            }
            if !own.isEmpty {
                Text(Loc.t("sessions.listEnd", lang)).font(.caption2).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        } else {
            ForEach(groups) { g in
                if g.count <= 1, let c = g.sessions.first {
                    NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                } else {
                    GroupCardView(group: g)
                }
            }
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

    private var isEmpty: Bool { scope == .mine ? own.isEmpty : groups.isEmpty }

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
            case .all: groups = try await Api.communitySessionsGrouped(accelOnly: accelOnly)
            case .spot: groups = spot.isEmpty ? [] : (try await Api.communitySessionsGrouped(spot: spot, accelOnly: accelOnly))
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
            // Kopf: Avatar + Titel/Chips (Titel OBEN, volle Breite — nicht neben die Medien quetschen).
            HStack(alignment: .top, spacing: 12) {
                leading
                VStack(alignment: .leading, spacing: 3) {
                    Text(headline).font(.footnote).fontWeight(.semibold)
                        .lineLimit(1).minimumScaleFactor(0.75)
                    let chips = chipLabels
                    if !chips.isEmpty {
                        HStack(spacing: 6) { ForEach(chips, id: \.self) { pill($0) } }
                    }
                    if !showOwner, let cap = session.caption, !cap.isEmpty {
                        Text(cap).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                // Track-Vorschau bleibt rechts im Kopf.
                if let tp = session.track_preview {
                    TrackPreviewView(data: tp).frame(width: 74, height: 42)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            media   // Foto/Video als eigene Zeile DARUNTER
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

    // Foto/Video als eigene Zeile unter dem Titel — gleich große Kacheln (Track bleibt im Kopf).
    @ViewBuilder private var media: some View {
        let thumb = Api.mediaURL(session.thumb_url)
        let vid = youtubeId(session.youtube_url)
        if thumb != nil || vid != nil {
            HStack(spacing: 8) {
                if let url = thumb {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color.secondary.opacity(0.15)
                        }
                    }
                    .frame(width: 74, height: 42).clipShape(RoundedRectangle(cornerRadius: 8))
                }
                if let vid {
                    ZStack {
                        AsyncImage(url: URL(string: "\(Api.baseURL)/api/public/video-thumb/\(vid)")) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: Color.secondary.opacity(0.15)
                            }
                        }
                        .frame(width: 74, height: 42).clipShape(RoundedRectangle(cornerRadius: 8))
                        Image(systemName: "play.circle.fill").foregroundStyle(.white).font(.title3)
                    }
                }
                Spacer(minLength: 0)
            }
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
        sessionDateTime(session.started_at, session.ended_at, session.tz)
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
// Tages-Gruppe (≥2 Sessions eines Nutzers am Tag): Kopf mit Tages-Summen + Kombi-Minimap;
// aufklappen -> Einzel-Sessions je mit Detail-Link. Wie PWA/Android.
struct GroupCardView: View {
    let group: CommunityGroup
    @State private var open = false
    @AppStorage("appLang") private var lang = "de"

    private var dateLabel: String {
        let p = group.date.split(separator: "-")
        return p.count == 3 ? "\(p[2]).\(p[1]).\(p[0])" : group.date
    }
    private var statsText: String {
        var parts: [String] = ["\(group.count) " + Loc.t("unit.sessions", lang)]
        if group.foiling_km > 0 { parts.append(String(format: "%.1f km", group.foiling_km)) }
        if group.foiling_time_s > 0 { parts.append(String(format: "%d:%02d", Int(group.foiling_time_s) / 60, Int(group.foiling_time_s) % 60)) }
        if group.pump_count > 0 { parts.append("↕ \(group.pump_count)") }
        if let sp = group.max_speed_mps { parts.append(String(format: "max %.1f km/h", sp * 3.6)) }
        return parts.joined(separator: "  ·  ")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation { open.toggle() } } label: {
                HStack(alignment: .top, spacing: 12) {
                    AvatarView(name: group.name, url: Api.mediaURL(group.avatar_url), size: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(dateLabel + (group.name.map { " · \($0)" } ?? "")).font(.headline)
                        if let sp = group.spot, !sp.isEmpty { sessionPill(sp) }
                        Text(statsText).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    if let tp = group.track_previews?.first { TrackPreviewView(data: tp).frame(width: 58, height: 42) }
                    Image(systemName: open ? "chevron.up" : "chevron.down").foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
            if open {
                ForEach(group.sessions) { c in
                    NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                        .padding(.leading, 8)
                }
            }
        }
    }
}

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
// tz = IANA-Zeitzone des Spots (Server) — Anzeige in Ortszeit, Fallback Geräte-Zeit.
func sessionDateTime(_ startISO: String, _ endISO: String?, _ tz: String? = nil) -> String {
    guard let start = TimeFmt.dateTime(startISO, tz) else { return startISO }
    let lang = UserDefaults.standard.string(forKey: "appLang") ?? "de"
    let oc = Loc.t("sessions.oclock", lang)
    let ocSuffix = oc.isEmpty ? "" : " " + oc
    if let endISO, let end = TimeFmt.timeOnly(endISO, tz) {
        return start + " – " + end + ocSuffix
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
