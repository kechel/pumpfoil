import SwiftUI

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
    // Rekorde: nur Accel (präzise) oder alle (inkl. GPS-only).
    @State private var accelOnly = true

    private let cols = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
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
                                Button { accelOnly.toggle() } label: {
                                    Text(accelOnly ? Loc.t("home.onlyAccel", lang) : Loc.t("home.allRecords", lang))
                                        .font(.caption).fontWeight(.medium)
                                        .padding(.horizontal, 10).padding(.vertical, 4)
                                        .background(accelOnly ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.18))
                                        .foregroundColor(accelOnly ? .accentColor : .secondary)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
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
            .onChange(of: sync.tick) { _ in Task { await load() } }
            .onChange(of: accelOnly) { _ in Task { stats = try? await Api.stats(accelOnly: accelOnly) } }
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
        stats = try? await Api.stats(accelOnly: accelOnly)
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
