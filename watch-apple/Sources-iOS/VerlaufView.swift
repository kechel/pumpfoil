import SwiftUI

// Verlauf: chronologische Liste mit Kennzahlen je Session (spiegelt web/Verlauf).
struct VerlaufView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [HistoryPoint] = []
    @State private var loading = false
    @State private var error: String?
    @State private var windowDays = 0   // 0 = Gesamt
    @State private var metric: HMetric = .km

    private var shown: [HistoryPoint] {
        windowDays == 0 ? items : items.filter { withinDays($0.started_at, windowDays) }
    }

    // Chronologisch (alt→neu) für den Trend-Chart.
    private var chartValues: [Double] {
        shown.map { (parseDate($0.started_at) ?? Date.distantPast, metric.value($0)) }
            .sorted { $0.0 < $1.0 }
            .map { $0.1 }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                if !items.isEmpty {
                    Section {
                        Picker(Loc.t("verlauf.period", lang), selection: $windowDays) {
                            Text(Loc.t("verlauf.total", lang)).tag(0)
                            Text("30 \(Loc.t("verlauf.daysAbbr", lang))").tag(30)
                            Text("7 \(Loc.t("verlauf.daysAbbr", lang))").tag(7)
                        }
                        .pickerStyle(.segmented)
                    }
                    Section("\(Loc.t("verlauf.cumulative", lang)) · \(windowDays == 0 ? Loc.t("verlauf.total", lang) : "\(windowDays) \(Loc.t("verlauf.daysWord", lang))")") {
                        HStack {
                            stat("\(shown.count)", Loc.t("nav.sessions", lang))
                            Spacer(); stat(String(format: "%.1f", shown.reduce(0) { $0 + $1.foiling_km }), "km")
                            Spacer(); stat("\(shown.reduce(0) { $0 + $1.runs })", Loc.t("home.runs", lang))
                            Spacer(); stat("\(shown.reduce(0) { $0 + $1.pumps })", Loc.t("home.pumps", lang))
                        }
                    }
                    if shown.count >= 2 {
                        Section(metric.title(lang)) {
                            Picker("", selection: $metric) {
                                ForEach(HMetric.allCases, id: \.self) { m in Text(m.short(lang)).tag(m) }
                            }
                            .pickerStyle(.segmented)
                            VStack(alignment: .leading, spacing: 4) {
                                HistoryChart(values: chartValues)
                                    .frame(height: 120)
                                if let mx = chartValues.max() {
                                    Text("max \(metric.fmt(mx))").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                ForEach(shown) { h in
                    NavigationLink { SessionDetailView(id: h.session_id) } label: { row(h) }
                }
                if items.isEmpty && !loading && error == nil {
                    Text(Loc.t("verlauf.empty", lang)).foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.history", lang))
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    @ViewBuilder private func row(_ h: HistoryPoint) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dateText(h.started_at)).font(.headline)
            HStack(spacing: 14) {
                stat("\(String(format: "%.1f", h.foiling_km)) km", Loc.t("home.foiling", lang))
                stat("\(h.runs)", Loc.t("home.runs", lang))
                stat("\(h.pumps)", Loc.t("home.pumps", lang))
                stat(h.pumps > 0 ? String(format: "%.1f", h.foiling_km * 1000 / Double(h.pumps)) : "–", "m/Pump")
                stat("\(String(format: "%.1f", h.speed * 3.6))", "km/h")
            }
        }
        .padding(.vertical, 2)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).font(.subheadline).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func dateText(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: iso)
        if d == nil { f.formatOptions = [.withInternetDateTime]; d = f.date(from: iso) }
        guard let date = d else { return iso }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    // started_at innerhalb der letzten N Tage? Bei Parse-Fehler einschließen.
    private func withinDays(_ iso: String, _ days: Int) -> Bool {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: iso)
        if d == nil { f.formatOptions = [.withInternetDateTime]; d = f.date(from: iso) }
        guard let date = d else { return true }
        return date > Date().addingTimeInterval(-Double(days) * 86400)
    }

    private func parseDate(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.history(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

// Auswählbare Trend-Metrik (spiegelt die Web-History-Serien).
enum HMetric: CaseIterable {
    case km, runs, pumps, speed, perPump

    func value(_ h: HistoryPoint) -> Double {
        switch self {
        case .km: return h.foiling_km
        case .runs: return Double(h.runs)
        case .pumps: return Double(h.pumps)
        case .speed: return h.speed * 3.6
        case .perPump: return h.pumps > 0 ? h.foiling_km * 1000 / Double(h.pumps) : 0
        }
    }

    func short(_ lang: String) -> String {
        switch self {
        case .km: return "km"
        case .runs: return Loc.t("home.runs", lang)
        case .pumps: return Loc.t("home.pumps", lang)
        case .speed: return "km/h"
        case .perPump: return "m/P"
        }
    }

    func title(_ lang: String) -> String {
        switch self {
        case .km: return Loc.t("home.foiling", lang)
        case .runs: return Loc.t("home.runs", lang)
        case .pumps: return Loc.t("home.pumps", lang)
        case .speed: return "km/h"
        case .perPump: return "m/Pump"
        }
    }

    func fmt(_ v: Double) -> String {
        switch self {
        case .runs, .pumps: return String(Int(v.rounded()))
        default: return String(format: "%.1f", v)
        }
    }
}

// Schlanker Balken-Trend (Canvas, iOS-15-sicher) — ein Balken je Session, alt→neu.
struct HistoryChart: View {
    let values: [Double]
    var body: some View {
        Canvas { ctx, size in
            guard !values.isEmpty else { return }
            let maxV = max(values.max() ?? 1, 0.0001)
            let n = values.count
            let gap: CGFloat = n > 1 ? min(3, size.width / CGFloat(n) * 0.3) : 0
            let bw = max(1, (size.width - gap * CGFloat(n - 1)) / CGFloat(n))
            for (i, v) in values.enumerated() {
                let h = CGFloat(max(0, v) / maxV) * size.height
                let x = CGFloat(i) * (bw + gap)
                let rect = CGRect(x: x, y: size.height - h, width: bw, height: max(1, h))
                ctx.fill(Path(roundedRect: rect, cornerRadius: min(2, bw / 2)), with: .color(.accentColor))
            }
        }
    }
}
