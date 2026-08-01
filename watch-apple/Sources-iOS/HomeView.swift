import SwiftUI
import UIKit

// Prozessweiter App-Start-Zeitpunkt: Rating erst nach >2 min in der App (siehe maybeShowRating).
enum AppSession { static let launch = Date() }

// Persönliches Dashboard: Gesamt-Kennzahlen, Rekorde (klickbar zur Session), letzte Sessions.
struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    // Programmatische Navigation fuer die Rekord-Kacheln (LazyVGrid) — s. CommunityView.
    @State private var navPath = NavigationPath()

    @State private var stats: OverallStats?
    @State private var latest: [SessionSummary] = []
    @State private var weather: WeatherBlock?
    @State private var loading = true
    // Rekorde: nur Accel (präzise) oder alle (inkl. GPS-only). Default nur Accel,
    // aber einmalig auf "alle" fallen, wenn der Nutzer gar keine Accel-Läufe hat.
    @State private var accelOnly = true
    @State private var decidedDefault = false
    @State private var updateVer: String?
    @State private var updateURL = ""
    @State private var updateDismissed = false
    @State private var community: Api.CommunityStats?
    @State private var startSuccess: StartSuccess?   // persönliche Home-Stats (unten)
    @State private var carveStats: CarveStats?
    // Zeitfenster wie PWA: heute / 10 T / 30 T / 1 J / gesamt.
    private let statWindows: [(String, String)] = [("today", "period.today"), ("10d", "period.10d"), ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all")]
    @State private var showFeedback = false
    // News-Banner DB-gesteuert (wie PWA): der AppStorage-Wert = zuletzt weggeklickte VERSION.
    @AppStorage("foil_banner_v1") private var newsVerStored = 0
    @State private var news: NewsBanner?
    // App-Rating: ab 5 gesyncten Sessions; >=4★ -> nie mehr; Später -> 14 T; Feedback (<=3★) ->
    // 14 T (ab 2. Mal 3 Monate), erst wieder wenn seither neue Sessions da sind.
    @AppStorage("rating_done") private var ratingDone = false
    @AppStorage("rating_snooze") private var ratingSnooze = 0.0
    @AppStorage("rating_min_count") private var ratingMinCount = 0
    @AppStorage("rating_fb_count") private var ratingFbCount = 0
    @State private var showRating = false
    @AppStorage("phone_rec_enabled") private var phoneRecEnabled = false
    @State private var showRecord = false
    @State private var incomingXfer = 0
    private var showBanner: Bool { if let n = news { return n.enabled && n.version > newsVerStored } else { return false } }

    private let cols = [GridItem(.flexible()), GridItem(.flexible())]
    private let cols3 = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    // Der Body war EIN Ausdruck (66 Zeilen: 11 Kinder + 14 Modifier mit Closures) und stand mit
    // >500 ms im Build-Log — Swifts Type-Checker loest einen ViewBuilder als einen einzigen Ausdruck
    // auf. Jeder Abschnitt ist jetzt ein eigener, typisierter Teil; Ablauflogik steckt in Methoden.
    var body: some View {
        NavigationStack(path: $navPath) {
            ScrollView { homeStack }
                // Wert-basiertes Session-Ziel (s. SessionDest in Models.swift) — die
                // Rekord-Kacheln unten sind ein LazyVGrid, closure-Links pushten dort doppelt.
                .navigationDestination(for: SessionDest.self) { d in
                    SessionDetailView(id: d.id, dataVersion: d.dataVersion)
                }
                .navigationTitle(Loc.t("nav.home", lang))
                .brandToolbar(Loc.t("nav.home", lang))
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showFeedback = true } label: { Image(systemName: "envelope") }
                    }
                }
                .sheet(isPresented: $showFeedback) { FeedbackView(lang: lang) }
                .fullScreenCover(isPresented: $showRecord) { RecordView() }
                .sheet(isPresented: $showRating) { ratingSheet }
                .overlay { if loading && stats == nil { ProgressView() } }
                .refreshable { await load() }
                .task { await load() }
                .task { await checkUpdate() }
                .onChange(of: sync.tick) { _ in Task { await load() } }
                .onChange(of: stats?.count) { _ in maybeShowRating() }
                .task { await ratingAfterDelay() }
                .onChange(of: accelOnly) { _ in Task { stats = try? await Api.stats(accelOnly: accelOnly) } }
        }
    }

    private var homeStack: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Live-Upload-Karte ganz oben: eigene Session lädt gerade hoch (Parität zur PWA).
            UploadProgressCard()
            updateBannerIfAny
            newsBannerIfAny
            greetingRow
            if incomingXfer > 0 { transferHint }
            if let n = session.profile?.needs_classification, n > 0 { needsClassHint(n) }
            latestSection
            if let st = stats { recordsSection(st) }
            if let ss = startSuccess { startSuccessSection(ss) }
            if let cs = carveStats, carveStatsHasAny(cs) { carveStatsSection(cs) }
            if let wb = weather { HomeWeatherCard(wb: wb, lang: lang) }
        }
        .padding(.horizontal).padding(.bottom).padding(.top, 2)
    }

    @ViewBuilder private var updateBannerIfAny: some View {
        if let uv = updateVer, !updateDismissed { updateBanner(uv) }
    }

    @ViewBuilder private var newsBannerIfAny: some View {
        if showBanner, let n = news { welcomeBanner(n) }
    }

    private var greetingRow: some View {
        HStack {
            Text(helloText).font(.title2).bold()
            Spacer()
            recordButton
        }
        .padding(.top, 12)
    }

    // Hängt NUR am lokalen Toggle, NICHT mehr an profile.beta (Server-Flag
    // wird für echte private Betas frei, siehe docs/TODO).
    @ViewBuilder private var recordButton: some View {
        if phoneRecEnabled {
            Button { showRecord = true } label: {
                Label(Loc.t("home.recordBtn", lang), systemImage: "record.circle")
                    .font(.headline)
            }.buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    private var ratingSheet: some View {
        RatingView(
            lang: lang,
            onLater: { ratingSnooze = Date().timeIntervalSince1970 + 14 * 24 * 3600 },
            onRated: { ratingDone = true },   // >=4 Sterne -> nie mehr
            onFeedback: { onRatingFeedback() })
    }

    private func onRatingFeedback() {
        ratingFbCount += 1
        let days: Double = ratingFbCount >= 2 ? 90 : 14   // ab 2. Feedback 3-Monats-Rhythmus
        ratingSnooze = Date().timeIntervalSince1970 + days * 24 * 3600
        ratingMinCount = stats?.count ?? 0                // erst wieder bei neuen Sessions
    }

    // Rating frühestens 2 min nach App-Start prüfen (auch wenn stats früher da sind).
    private func ratingAfterDelay() async {
        let wait: Double = max(0, 120 - Date().timeIntervalSince(AppSession.launch))
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        maybeShowRating()
    }

    // Willkommens-/Community-Banner (schließbar). Spiegelt web WelcomeBanner.
    // In typisierte Teil-Views zerlegt (Type-Checker-Hänger beim Archivieren) — [[ios-swift-typecheck-hang]].
    private var helloText: String {
        (session.profile?.display_name?.isEmpty == false)
            ? Loc.t("phome.hello", lang).replacingOccurrences(of: "{name}", with: session.profile!.display_name!)
            : Loc.t("nav.home", lang)
    }

    // Offene Sportart-Zuordnung (docs/sport-classification.md): jemand hat gebeten, eine eigene
    // Session einzuordnen. Bewusst KEIN Push -- dieser Hinweis reicht und erklaert in Ruhe, statt
    // unaufgefordert nach Vorwurf zu klingen. Bei genau einer Session direkt dorthin.
    @ViewBuilder private func needsClassHint(_ n: Int) -> some View {
        let one = n == 1
        let sid = session.profile?.needs_classification_id
        let text = one
            ? Loc.t("home.needsClassification", lang)
            : Loc.t("home.needsClassificationN", lang).replacingOccurrences(of: "{n}", with: "\(n)")
        NavigationLink {
            if one, let sid { SessionDetailView(id: sid) } else { SessionsView() }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "questionmark.circle").foregroundStyle(.orange)
                Text(text).font(.subheadline)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.orange.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    private var transferHint: some View {
        NavigationLink { SessionsView() } label: {
            HStack(spacing: 10) {
                Image(systemName: "paperplane.fill").foregroundStyle(Color.accentColor)
                Text(Loc.t("transfer.homeHint", lang)).font(.subheadline)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var latestSection: some View {
        HStack {
            Text(Loc.t("phome.latest", lang)).font(.headline)
            Spacer()
            NavigationLink { SessionsView() } label: {
                Text("\(Loc.t("phome.allMine", lang)) →").font(.caption).foregroundStyle(Color.accentColor)
            }
        }
        if latest.isEmpty {
            Text(Loc.t("sessions.empty", lang))
                .foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .center)
                .padding(20).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        } else {
            VStack(spacing: 0) {
                ForEach(latest) { s in
                    NavigationLink(value: SessionDest(id: s.id, dataVersion: s.data_version)) { SessionRow(session: s) }
                        .buttonStyle(.plain)
                    Divider()
                }
            }
        }
    }

    @ViewBuilder private func recordsSection(_ st: OverallStats) -> some View {
        HStack(spacing: 8) {
            Text(Loc.t("side.records", lang)).font(.headline)
            HStack(spacing: 4) {
                segButton(Loc.t("side.onlyAccel", lang), active: accelOnly) { accelOnly = true }
                segButton(Loc.t("side.all", lang), active: !accelOnly) { accelOnly = false }
            }
        }
        let r = st.records
        LazyVGrid(columns: cols3, spacing: 10) {
            recTile(r?.distance, Loc.t("rec.farthestRun", lang)) { "\(Int($0)) m" }
            recTile(r?.duration, Loc.t("rec.longestRun", lang)) { fmtDur($0) }
            recTile(r?.speed, Loc.t("rec.topSpeed", lang)) { String(format: "%.1f km/h", $0 * 3.6) }
            recTile(r?.glide, Loc.t("rec.longestGlide", lang)) { String(format: "%.1f s", $0) }
            recTile(r?.runs, Loc.t("rec.mostRuns", lang)) { "\(Int($0))" }
            tile("\(st.count ?? 0)", Loc.t("side.sessions", lang))
            tile("\(st.runs_total ?? 0)", Loc.t("stat.runs", lang))
            tile(String(format: "%.1f km", st.foiling_km ?? 0), Loc.t("side.foiling", lang))
            tile(fmtMin(st.foiling_min ?? 0), Loc.t("side.foilingTime", lang))
            tile("\(st.pumps ?? 0)", Loc.t("side.pumps", lang))
        }
    }

    @ViewBuilder private func welcomeBanner(_ n: NewsBanner) -> some View {
        let newsText: String = n.texts[lang] ?? n.texts["de"] ?? ""
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    if !newsText.isEmpty {
                        Text(newsText).font(.subheadline).bold().foregroundStyle(Color.accentColor)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    bannerMsgLine
                }
                Spacer(minLength: 4)
                Button { newsVerStored = n.version } label: { Image(systemName: "xmark") }
                    .buttonStyle(.plain).foregroundStyle(.secondary)
            }
            if let c = community {
                communityStatsText(c, lang).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.accentColor.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    // Text-Verkettung explizit als Text typisiert: jedes „+" zwingt den Type-Checker durch alle
    // Operator-Ueberladungen — im ViewBuilder war das mit Abstand der teuerste Teil des Banners.
    private var bannerMsgLine: some View {
        let msg: String = " " + Loc.t("banner.msg", lang)
        let line: Text = Text("👋 ") + Text("Pumpfoil.org").bold() + Text(msg)
        return line.font(.subheadline).fixedSize(horizontal: false, vertical: true)
    }

    // Nicht-blockierender Update-Hinweis (wie das PWA-Update-Banner).
    @ViewBuilder private func updateBanner(_ version: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(Loc.t("update.available", lang)).font(.subheadline).bold()
                Text("Version \(version)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(Loc.t("update.action", lang)) { openStore() }
                .buttonStyle(.borderedProminent).controlSize(.small)
            Button { updateDismissed = true } label: { Image(systemName: "xmark") }
                .buttonStyle(.plain).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Fallback-URL, falls der Server keine Store-URL mitschickt. Als Methode statt als Ternaer in
    // der Button-Aktion (Ablauflogik im ViewBuilder kostet den Type-Checker unnoetig viel).
    private func openStore() {
        let s: String = updateURL.isEmpty ? "https://apps.apple.com/app/pumpfoil" : updateURL
        if let url = URL(string: s) { UIApplication.shared.open(url) }
    }

    private func maybeShowRating() {
        guard Date().timeIntervalSince(AppSession.launch) >= 120 else { return }   // erst >2 min in der App
        let c = stats?.count ?? 0
        if c >= 5 && !ratingDone && Date().timeIntervalSince1970 >= ratingSnooze && c > ratingMinCount {
            showRating = true
        }
    }

    private func checkUpdate() async {
        news = try? await Api.newsBanner()
        community = try? await Api.communityStats()
        guard let a = try? await Api.appLatest(platform: "ios"), !a.latest.isEmpty else { return }
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        if Self.versionNewer(a.latest, current) { updateVer = a.latest; updateURL = a.store_url }
    }

    // Semantischer Versionsvergleich "1.1.8" > "1.1.5".
    static func versionNewer(_ latest: String, _ current: String) -> Bool {
        func parts(_ v: String) -> [Int] { v.split(separator: ".").map { Int($0.filter(\.isNumber)) ?? 0 } }
        let a = parts(latest), b = parts(current)
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0, y = i < b.count ? b[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    private func tile(_ value: String, _ label: String, _ date: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3).bold().foregroundStyle(Color.accentColor)
            Text(label).font(.caption).foregroundStyle(.secondary)
            if let date { Text(date).font(.caption2).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func recordTile(_ value: String, _ label: String, _ sessionId: Int?, _ startedAt: String? = nil, _ tz: String? = nil) -> some View {
        let date = startedAt.flatMap { TimeFmt.dateNumeric($0, tz) }
        if let sessionId {
            Button { navPath.append(SessionDest(id: sessionId)) } label: { tile(value, label, date) }
                .buttonStyle(.plain)
        } else {
            tile(value, label, date)
        }
    }

    private func dateText(_ s: SessionSummary) -> String {
        TimeFmt.dateTime(s.started_at, s.tz) ?? s.started_at
    }
    private func fmtDist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
    private func fmtDur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
    // Foiling-Zeit aus Minuten, Format wie Web-fmtDur: "X h Y min" bzw. "Y min".
    private func fmtMin(_ min: Double) -> String {
        let h = Int(min) / 60, m = Int(min.rounded()) % 60
        return h > 0 ? "\(h) h \(m) min" : "\(m) min"
    }

    // Rekord-Kachel: klickbar zur Session wenn Wert > 0, sonst "–".
    @ViewBuilder private func recTile(_ rec: RecordEntry?, _ label: String, _ fmt: (Double) -> String) -> some View {
        let v = rec?.value ?? 0
        if v > 0 { recordTile(fmt(v), label, rec?.session_id, rec?.started_at, rec?.tz) }
        else { tile("–", label) }
    }

    @ViewBuilder
    private func segButton(_ label: String, active: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.caption).fontWeight(.medium)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(active ? Color.accentColor : Color.secondary.opacity(0.18))
                .foregroundColor(active ? .white : .secondary)
                .clipShape(Capsule())
        }.buttonStyle(.plain)
    }

    private func load() async {
        loading = true; defer { loading = false }
        if let s = try? await Api.stats(accelOnly: accelOnly) {
            let r = s.records
            let noAccel = (r?.distance?.value ?? 0) == 0 && (r?.duration?.value ?? 0) == 0 && (r?.speed?.value ?? 0) == 0
            if !decidedDefault && accelOnly && noAccel {
                decidedDefault = true; accelOnly = false   // onChange lädt Stats mit "alle" neu
            } else {
                decidedDefault = true; stats = s
            }
        }
        latest = Array(((try? await Api.sessions()) ?? []).prefix(3))
        let hs = (try? await Api.settings())?["homespot"] as? String
        if let hs, !hs.isEmpty { weather = (try? await Api.spotWeather(hs))?.weather } else { weather = nil }
        incomingXfer = ((try? await Api.transfersIncoming()) ?? []).count
        startSuccess = try? await Api.startSuccess()
        carveStats = try? await Api.carveStats()
    }

    // --- Persönliche Home-Stats (unten), wie PWA PersonalHome ---
    private func carveStatsHasAny(_ cs: CarveStats) -> Bool {
        cs.windows.values.contains { ($0.s + $0.m + $0.l) > 0 }
    }

    // Eigene Schwelle: ab welcher Distanz ein Start als echter Lauf gilt. Der aktuelle Wert ist
    // immer dabei, auch wenn er nicht in der Vorschlagsliste steht (der Server erlaubt jeden Wert).
    @ViewBuilder private func thresholdPicker(_ current: Int) -> some View {
        let opts = Array(Set([20, 30, 40, 50, 75, 100, current])).sorted()
        Menu {
            ForEach(opts, id: \.self) { o in
                Button("\(o) m") { Task { await saveThreshold(o) } }
            }
        } label: {
            HStack(spacing: 2) {
                Text("\(current) m").font(.caption)
                Image(systemName: "chevron.down").font(.caption2)
            }
        }
    }

    private func saveThreshold(_ m: Int) async {
        // Nach dem Speichern die Quote neu holen -- die Prozentwerte haengen an der Schwelle.
        try? await Api.saveSettings(["start_threshold_m": m])
        startSuccess = try? await Api.startSuccess()
    }

    @ViewBuilder private func startSuccessSection(_ ss: StartSuccess) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(Loc.t("home.startSuccess", lang)).font(.headline)
                Spacer()
                Text(Loc.t("home.startThreshold", lang)).font(.caption).foregroundStyle(.secondary)
                thresholdPicker(ss.threshold_m)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(statWindows, id: \.0) { win in startSuccessTile(ss, win) }
                }
            }
        }
    }

    // Kachel + Beschriftungen als eigene, typisierte Teile: die Optional-Ketten (rate.map, ?? 0)
    // standen sonst mitten im ViewBuilder und wurden je ForEach-Element mitgeloest.
    private func startSuccessTile(_ ss: StartSuccess, _ win: (String, String)) -> some View {
        let w: SSWindow? = ss.windows[win.0]
        return VStack(spacing: 2) {
            Text(rateText(w)).font(.title3).bold()
            Text(Loc.t(win.1, lang)).font(.caption2).foregroundStyle(.secondary)
            Text(ratioText(w)).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(minWidth: 64).padding(8)
        .background(Color.secondary.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func rateText(_ w: SSWindow?) -> String {
        guard let r = w?.rate else { return "–" }
        return "\(r)%"
    }

    private func ratioText(_ w: SSWindow?) -> String {
        let s: Int = w?.success ?? 0
        let t: Int = w?.total ?? 0
        return "\(s)/\(t)"
    }

    @ViewBuilder private func carveStatsSection(_ cs: CarveStats) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Carves").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(statWindows, id: \.0) { win in carveTile(cs, win) }
                }
            }
        }
    }

    private func carveTile(_ cs: CarveStats, _ win: (String, String)) -> some View {
        let w: CarveWin? = cs.windows[win.0]
        return VStack(alignment: .leading, spacing: 2) {
            Text(Loc.t(win.1, lang)).font(.caption2).foregroundStyle(.secondary)
            Text(carveLine("90–180°", w?.s)).font(.caption)
            Text(carveLine("180–360°", w?.m)).font(.caption)
            Text(carveLine(">360°", w?.l)).font(.caption)
        }
        .padding(8).background(Color.secondary.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func carveLine(_ label: String, _ n: Int?) -> String {
        let v: Int = n ?? 0
        return label + ": \(v)"
    }
}

// Wetter-Karte am Homespot (aktuell + 3-Tage-Vorschau, Wind in kn, WMO-Emoji).
struct HomeWeatherCard: View {
    let wb: WeatherBlock
    let lang: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("home.weather", lang)).font(.caption).foregroundStyle(.secondary)
            if let c = wb.current {
                HStack(spacing: 10) {
                    Text(wxIcon(c.code)).font(.title2)
                    if let t = c.temp { Text("\(Int(t.rounded()))°").font(.title2.bold()) }
                    if let w = c.wind {
                        Text("\(Int(w.rounded())) kn \(dirLabel(c.dir))").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            if let days = wb.days, !days.isEmpty {
                HStack {
                    ForEach(Array(days.prefix(3).enumerated()), id: \.offset) { i, d in
                        VStack(spacing: 2) {
                            Text(dayLabel(i, d.date, lang)).font(.caption2).foregroundStyle(.secondary)
                            Text(wxIcon(d.code))
                            Text(d.tmax.map { "\(Int($0.rounded()))°" } ?? "–").font(.caption)
                            if let wm = d.wind_max { Text("\(Int(wm.rounded())) kn").font(.caption2).foregroundStyle(.secondary) }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

private func wxIcon(_ code: Int?) -> String {
    guard let code else { return "•" }
    switch code {
    case 0: return "☀️"
    case 1, 2: return "🌤️"
    case 3: return "☁️"
    case 4...48: return "🌫️"
    case 49...57: return "🌦️"
    case 58...67: return "🌧️"
    case 68...77: return "🌨️"
    case 78...82: return "🌦️"
    case 83...86: return "🌨️"
    default: return "⛈️"
    }
}

private let card8 = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]
private func dirLabel(_ deg: Double?) -> String {
    guard let deg else { return "" }
    return card8[(Int((deg / 45).rounded()) % 8 + 8) % 8]
}

private func dayLabel(_ i: Int, _ date: String?, _ lang: String) -> String {
    if i == 0 { return Loc.t("wx.today", lang) }
    if i == 1 { return Loc.t("wx.tomorrow", lang) }
    guard let date else { return "" }
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: date) else { return "" }
    let wf = DateFormatter(); wf.dateFormat = "EE"
    return wf.string(from: d)
}
