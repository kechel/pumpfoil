import SwiftUI

// Verlauf: Trend-Charts je Kennzahl (kumuliert / 7-Tage- / 30-Tage-Fenster) — spiegelt web + Android.
struct VerlaufView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [HistoryPoint] = []
    @State private var loading = false
    @State private var error: String?
    @State private var mode: VMode = .w7

    // Gemeinsame Zeitachse (epoch s), chronologisch alt→neu.
    private var data: [(t: Double, h: HistoryPoint)] {
        items.compactMap { hp in epochS(hp.started_at).map { (t: $0, h: hp) } }
            .sorted { $0.t < $1.t }
    }
    private var domain: (Double, Double) {
        guard let f = data.first?.t, let l = data.last?.t else { return (0, 1) }
        return (f, l)
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading && items.isEmpty {
                    ProgressView()
                } else if let error {
                    Text(error).foregroundStyle(.secondary).padding()
                } else if data.count < 2 {
                    Text(Loc.t("verlauf.empty", lang)).foregroundStyle(.secondary).padding()
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                modeChip(.cumulative, Loc.t("verlauf.cumulative", lang))
                                modeChip(.w7, "7 \(Loc.t("verlauf.daysAbbr", lang))")
                                modeChip(.w30, "30 \(Loc.t("verlauf.daysAbbr", lang))")
                            }
                            .padding(.top, 8)
                            ForEach(VerlaufView.metrics) { m in
                                MetricChartCard(data: data, metric: m, mode: mode, domain: domain, lang: lang)
                            }
                            Text(Loc.t("verlauf.aggTitle", lang) + aggSuffix)
                                .font(.title3).fontWeight(.semibold).padding(.top, 6)
                            ForEach(VerlaufView.metricsSum) { m in
                                MetricChartCard(data: data, metric: m, mode: mode, domain: domain, lang: lang)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 16)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(Loc.t("nav.history", lang))
            .brandToolbar(Loc.t("nav.history", lang))
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    private var aggSuffix: String {
        switch mode {
        case .w7: return " · 7 \(Loc.t("verlauf.daysAbbr", lang))"
        case .w30: return " · 30 \(Loc.t("verlauf.daysAbbr", lang))"
        case .cumulative: return ""
        }
    }

    private func modeChip(_ m: VMode, _ label: String) -> some View {
        Button { mode = m } label: {
            Text(label)
                .font(.subheadline)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(mode == m ? Color.accentColor : Color(.secondarySystemBackground))
                .foregroundStyle(mode == m ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.history(); error = nil }
        catch { self.error = error.localizedDescription }
    }

    // ISO → epoch seconds; nicht parsbar → nil (Punkt fällt raus).
    private func epochS(_ iso: String) -> Double? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d.timeIntervalSince1970 }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)?.timeIntervalSince1970
    }

    // Best-pro-Session-Metriken (kumuliert = laufender Bestwert, Fenster = Max im Fenster).
    static let metrics: [VMetric] = [
        VMetric("home.farthestRun", 0x22D3EE, .max, { $0.distance }, fmt: { String(format: "%.0f m", $0) }),
        VMetric("home.longestRun", 0x34D399, .max, { $0.duration }, fmt: { mmssMin($0) }),
        VMetric("home.longestGlide", 0xA78BFA, .max, { $0.glide }, fmt: { String(format: "%.1f s", $0) }),
        VMetric("verlauf.foilingPerSession", 0x60A5FA, .max, { $0.foiling_km }, fmt: { String(format: "%.1f km", $0) }),
        VMetric("sd.avgSpeed", 0xF59E0B, .max, { $0.avg_speed.map { $0 * 3.6 } }, fmt: { String(format: "%.1f km/h", $0) }),
        VMetric("sd.avgPump", 0xF472B6, .max, { $0.avg_pump_hz }, fmt: { String(format: "%.2f Hz", $0) }),
        VMetric("verlauf.pumpsPerSession", 0xFB7185, .ratio, { _ in nil },
                num: { Double($0.pumps) }, den: { _ in 1.0 }, fmt: { String(format: "%.0f", $0) }),
        VMetric("sd.avgDistPerPump", 0x2DD4BF, .ratio, { _ in nil },
                num: { $0.foiling_km }, den: { Double($0.pumps) }, fmt: { String(format: "%.1f m", $0 * 1000) }),
    ]

    // Summen über das Fenster bzw. kumuliert.
    static let metricsSum: [VMetric] = [
        VMetric("nav.sessions", 0x60A5FA, .count, { _ in 1.0 }, fmt: { String(format: "%.0f", $0) }),
        VMetric("home.runs", 0x34D399, .sum, { Double($0.runs) }, fmt: { String(format: "%.0f", $0) }),
        VMetric("verlauf.kmFoiling", 0x22D3EE, .sum, { $0.foiling_km }, fmt: { String(format: "%.1f km", $0) }),
        VMetric("home.pumps", 0xA78BFA, .sum, { Double($0.pumps) }, fmt: { String(format: "%.0f", $0) }),
    ]
}

enum VMode { case cumulative, w7, w30 }
enum VKind { case max, sum, count, avg, ratio }

private func mmssMin(_ s: Double) -> String { String(format: "%d:%02d min", Int(s / 60), Int(s.truncatingRemainder(dividingBy: 60))) }
private func hexColor(_ hex: UInt) -> Color {
    Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
}

// Eine Verlauf-Kennzahl: Aggregationsart + Formatierung/Farbe.
struct VMetric: Identifiable {
    let labelKey: String
    let hex: UInt
    let kind: VKind
    let value: (HistoryPoint) -> Double?
    let num: ((HistoryPoint) -> Double?)?
    let den: ((HistoryPoint) -> Double?)?
    let fmt: (Double) -> String
    var id: String { labelKey }
    var color: Color { hexColor(hex) }

    init(_ labelKey: String, _ hex: UInt, _ kind: VKind,
         _ value: @escaping (HistoryPoint) -> Double?,
         num: ((HistoryPoint) -> Double?)? = nil, den: ((HistoryPoint) -> Double?)? = nil,
         fmt: @escaping (Double) -> String) {
        self.labelKey = labelKey; self.hex = hex; self.kind = kind
        self.value = value; self.num = num; self.den = den; self.fmt = fmt
    }
}

struct VPt { let t: Double; let v: Double }

private let DAY_S: Double = 86400
private func winS(_ mode: VMode) -> Double { (mode == .w7 ? 7 : 30) * DAY_S }

// Zeitreihe für eine Metrik (kumuliert oder gleitendes Fenster über das Tagesraster).
func vSeries(_ data: [(t: Double, h: HistoryPoint)], _ m: VMetric, _ mode: VMode, _ domain: (Double, Double)) -> [VPt] {
    if m.kind == .ratio {
        let valid: [(Double, Double, Double)] = data.compactMap { (t, h) in
            guard let n = m.num?(h), let d = m.den?(h), n.isFinite, d.isFinite, n > 0, d > 0 else { return nil }
            return (t, n, d)
        }
        if valid.count < 2 { return [] }
        if mode == .cumulative {
            var sn = 0.0, sd = 0.0
            return valid.map { (t, n, d) in sn += n; sd += d; return VPt(t: t, v: sd > 0 ? sn / sd : 0) }
        }
        let w = winS(mode)
        func at(_ tt: Double) -> VPt {
            var sn = 0.0, sd = 0.0
            for (t, n, d) in valid where t > tt - w && t <= tt { sn += n; sd += d }
            return VPt(t: tt, v: sd > 0 ? sn / sd : 0)
        }
        var out: [VPt] = []; var tt = domain.0
        while tt < domain.1 { out.append(at(tt)); tt += DAY_S }
        out.append(at(domain.1)); return out
    }
    let valid: [(Double, Double)] = data.compactMap { (t, h) in
        guard let v = m.value(h), v.isFinite else { return nil }
        return (t, v)
    }
    if valid.count < 2 { return [] }
    if mode == .cumulative {
        var sum = 0.0, n = 0, mx = 0.0
        return valid.map { (t, v) in
            sum += v; n += 1; if v > mx { mx = v }
            let val: Double
            switch m.kind { case .avg: val = sum / Double(n); case .count: val = Double(n); case .max: val = mx; default: val = sum }
            return VPt(t: t, v: val)
        }
    }
    let w = winS(mode)
    func at(_ tt: Double) -> VPt {
        var sum = 0.0, n = 0, mx = 0.0
        for (t, v) in valid where t > tt - w && t <= tt { sum += v; n += 1; if v > mx { mx = v } }
        let val: Double
        switch m.kind { case .avg: val = n > 0 ? sum / Double(n) : 0; case .count: val = Double(n); case .max: val = mx; default: val = sum }
        return VPt(t: tt, v: val)
    }
    var out: [VPt] = []; var tt = domain.0
    while tt < domain.1 { out.append(at(tt)); tt += DAY_S }
    out.append(at(domain.1)); return out
}

struct MetricChartCard: View {
    let data: [(t: Double, h: HistoryPoint)]
    let metric: VMetric
    let mode: VMode
    let domain: (Double, Double)
    let lang: String

    private var pts: [VPt] { vSeries(data, metric, mode, domain) }

    var body: some View {
        let cur = pts.last?.v ?? 0
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(Loc.t(metric.labelKey, lang)).font(.subheadline).fontWeight(.semibold)
                Spacer()
                Text(cur > 0 ? metric.fmt(cur) : "–").font(.subheadline).fontWeight(.semibold).foregroundStyle(metric.color)
            }
            LineChartView(pts: pts, color: metric.color, domain: domain, lang: lang).frame(height: 110)
            if pts.count >= 2 {
                let shortSpan = (domain.1 - domain.0) <= 120 * 86400
                HStack {
                    Text(axisDate(domain.0, shortSpan)).font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    Text(axisDate(domain.1, shortSpan)).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Kurze Zeitspanne -> Tag+Monat (wie Web), sonst Monat+Jahr.
    private func axisDate(_ s: Double, _ shortSpan: Bool) -> String {
        let f = DateFormatter(); f.dateFormat = shortSpan ? "dd. MMM" : "MMM yy"
        return f.string(from: Date(timeIntervalSince1970: s))
    }
}

struct LineChartView: View {
    let pts: [VPt]
    let color: Color
    let domain: (Double, Double)
    let lang: String

    var body: some View {
        if pts.count < 2 {
            Text(Loc.t("verlauf.empty", lang)).font(.caption2).foregroundStyle(.secondary)
        } else {
            Canvas { ctx, size in
                let w = size.width, h = size.height, padB: CGFloat = 6
                let tmin = domain.0, tmax = max(domain.1, tmin + 1)
                let vmax = max((pts.map { $0.v }.max() ?? 1) * 1.05, 1e-6)
                func px(_ t: Double) -> CGFloat { CGFloat((t - tmin) / (tmax - tmin)) * w }
                func py(_ v: Double) -> CGFloat { h - padB - CGFloat(v / vmax) * (h - padB) }
                var line = Path(), area = Path()
                for (i, p) in pts.enumerated() {
                    let x = px(p.t), y = py(p.v)
                    if i == 0 { line.move(to: CGPoint(x: x, y: y)); area.move(to: CGPoint(x: x, y: h - padB)); area.addLine(to: CGPoint(x: x, y: y)) }
                    else { line.addLine(to: CGPoint(x: x, y: y)); area.addLine(to: CGPoint(x: x, y: y)) }
                }
                area.addLine(to: CGPoint(x: px(pts.last!.t), y: h - padB)); area.closeSubpath()
                ctx.fill(area, with: .color(color.opacity(0.13)))
                ctx.stroke(line, with: .color(color), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                var base = Path(); base.move(to: CGPoint(x: 0, y: h - padB)); base.addLine(to: CGPoint(x: w, y: h - padB))
                ctx.stroke(base, with: .color(Color(red: 0.2, green: 0.255, blue: 0.333)), lineWidth: 1)
            }
        }
    }
}
