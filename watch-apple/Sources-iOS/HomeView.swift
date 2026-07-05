import SwiftUI
import UIKit

// Persönliches Dashboard: Gesamt-Kennzahlen, Rekorde (klickbar zur Session), letzte Sessions.
struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var stats: OverallStats?
    @State private var latest: [SessionSummary] = []
    @State private var weather: WeatherBlock?
    @State private var rooms: [ChatRoom] = []
    @State private var loading = true
    // Rekorde: nur Accel (präzise) oder alle (inkl. GPS-only). Default nur Accel,
    // aber einmalig auf "alle" fallen, wenn der Nutzer gar keine Accel-Läufe hat.
    @State private var accelOnly = true
    @State private var decidedDefault = false
    @State private var updateVer: String?
    @State private var updateURL = ""
    @State private var updateDismissed = false

    private let cols = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let uv = updateVer, !updateDismissed { updateBanner(uv) }

                    Text("\(Loc.t("home.hello", lang)) \(session.profile?.display_name ?? "")".trimmingCharacters(in: .whitespaces))
                        .font(.title2).bold()

                    if let wb = weather { HomeWeatherCard(wb: wb, lang: lang) }

                    if let st = stats {
                        LazyVGrid(columns: cols, spacing: 12) {
                            tile("\(st.count ?? 0)", Loc.t("nav.sessions", lang))
                            tile(String(format: "%.1f km", st.foiling_km ?? 0), Loc.t("home.foiling", lang))
                            tile("\(st.runs_total ?? 0)", Loc.t("home.runs", lang))
                            tile("\(st.pumps ?? 0)", Loc.t("home.pumps", lang))
                        }
                        if let r = st.records {
                            HStack(spacing: 8) {
                                Text(Loc.t("home.records", lang)).font(.headline)
                                HStack(spacing: 4) {
                                    segButton(Loc.t("home.onlyAccel", lang), active: accelOnly) { accelOnly = true }
                                    segButton(Loc.t("home.allRecords", lang), active: !accelOnly) { accelOnly = false }
                                }
                            }
                            LazyVGrid(columns: cols, spacing: 12) {
                                if let v = r.speed { recordTile(String(format: "%.1f km/h", (v.value ?? 0) * 3.6), Loc.t("home.topSpeed", lang), v.session_id) }
                                if let v = r.distance { recordTile(fmtDist(v.value ?? 0), Loc.t("home.farthestRun", lang), v.session_id) }
                                if let v = r.duration { recordTile(fmtDur(v.value ?? 0), Loc.t("home.longestRun", lang), v.session_id) }
                                if let v = r.glide { recordTile(fmtDur(v.value ?? 0), Loc.t("home.longestGlide", lang), v.session_id) }
                                if let v = r.runs { recordTile("\(Int(v.value ?? 0))", Loc.t("home.mostRuns", lang), v.session_id) }
                            }
                        }
                    }

                    if !rooms.isEmpty {
                        Text(Loc.t("home.myChats", lang)).font(.headline)
                        VStack(spacing: 0) {
                            ForEach(rooms) { room in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(room.label).fontWeight(.medium)
                                        if !room.last_text.isEmpty {
                                            Text(room.last_text).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                        }
                                    }
                                    Spacer()
                                    if room.unread > 0 {
                                        Text("\(room.unread)").font(.caption2).foregroundStyle(.white)
                                            .padding(.horizontal, 7).padding(.vertical, 2)
                                            .background(Color.accentColor, in: Capsule())
                                    }
                                }
                                .padding(.vertical, 6)
                                Divider()
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
            .brandToolbar(Loc.t("nav.home", lang))
            .overlay { if loading && stats == nil { ProgressView() } }
            .refreshable { await load() }
            .task { await load() }
            .task { await checkUpdate() }
            .onChange(of: sync.tick) { _ in Task { await load() } }
            .onChange(of: accelOnly) { _ in Task { stats = try? await Api.stats(accelOnly: accelOnly) } }
        }
    }

    // Nicht-blockierender Update-Hinweis (wie das PWA-Update-Banner).
    @ViewBuilder private func updateBanner(_ version: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(Loc.t("update.available", lang)).font(.subheadline).bold()
                Text("Version \(version)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(Loc.t("update.action", lang)) {
                if let url = URL(string: updateURL.isEmpty ? "https://apps.apple.com/app/pumpfoil" : updateURL) {
                    UIApplication.shared.open(url)
                }
            }.buttonStyle(.borderedProminent).controlSize(.small)
            Button { updateDismissed = true } label: { Image(systemName: "xmark") }
                .buttonStyle(.plain).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func checkUpdate() async {
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
        rooms = (try? await Api.chatRooms()) ?? []
        let hs = (try? await Api.settings())?["homespot"] as? String
        if let hs, !hs.isEmpty { weather = (try? await Api.spotWeather(hs))?.weather } else { weather = nil }
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
