import SwiftUI

// Uhren-Statistik (spiegelt web/WatchStats): Community-Aggregat je Uhr-Modell als Cards.
struct WatchStatsView: View {
    @AppStorage("appLang") private var lang = "de"
    // Beobachtet die Anzeige-Einheit der Pump-Kadenz -> Umschalten wirkt sofort (PumpUnit.swift).
    @AppStorage(PumpUnit.storeKey) private var pumpUnit = "hz"
    @State private var rows: [WatchStat] = []
    @State private var quali: WatchQuality?
    @State private var loading = true
    @State private var error: String?
    @State private var sortKey = "sessions"
    @State private var sortAsc = false

    private var sorted: [WatchStat] {
        if sortKey == "name" {
            let s = rows.sorted { $0.watch.lowercased() < $1.watch.lowercased() }
            return sortAsc ? s : s.reversed()
        }
        return sortStats(rows, asc: sortAsc) { s in
            switch sortKey {
            case "users": return Double(s.users)
            case "km": return s.foiling_km
            case "speed": return s.avg_speed_kmh
            case "bestSpeed": return s.best_speed_kmh
            case "hz": return s.avg_pump_hz
            default: return Double(s.sessions)
            }
        }
    }

    // Ein Abschnitt = eine eigene Teil-View, Strings vorformatiert: der Body war EIN Ausdruck aus
    // Sortier-Chips (7 Tupel), zwei Kennzahl-Zeilen mit je drei .map{}??-Interpolationen und einer
    // Toolbar — das kostete den Type-Checker am meisten. Inhalt/Reihenfolge unverändert.
    var body: some View {
        List {
            introSection
            statusRows
            statRows
            qualiSection
        }
        .overlay { if loading { ProgressView() } }
        .navigationTitle(Loc.t("watchStats.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { otherStatsToolbar }
        .task { await load() }
    }

    // Uhren-Auswertung: was die Geraete wirklich abliefern. Bewusst OHNE Urteil -- das
    // entscheiden Nutzer selbst (Jan, 05.09.); dafuer stehen die Zahlen da. Einzelne
    // Teil-Views und vorformatierte Strings, damit der Type-Checker nicht ausufert
    // (dieselbe Vorsicht wie oben im Body).
    @ViewBuilder private var qualiSection: some View {
        if let q = quali, !q.modelle.isEmpty {
            Section(Loc.t("watchQuality.title", lang)) {
                Text(qualiLead(q)).font(.subheadline).foregroundStyle(.secondary)
                Text(Loc.t("watchQuality.new", lang)).font(.subheadline)
            }
            ForEach(q.modelle.sorted { $0.sessions > $1.sessions }) { m in
                Section(m.modell) { qualiRows(m) }
            }
            Section { Text(Loc.t("watchQuality.note", lang)).font(.footnote).foregroundStyle(.secondary) }
        }
    }

    private func qualiLead(_ q: WatchQuality) -> String {
        Loc.t("watchQuality.lead", lang)
            .replacingOccurrences(of: "{sessions}", with: String(q.sessions ?? 0))
            .replacingOccurrences(of: "{hours}", with: String(q.stunden ?? 0))
            .replacingOccurrences(of: "{date}", with: q.stand)
    }

    @ViewBuilder private func qualiRows(_ m: WatchQualityModel) -> some View {
        // Garmin meldet eine Guete-Stufe, die anderen Meter -- nie in EINE Zahl mischen.
        let gps: String = {
            if let g = m.guete_gut {
                return Loc.t("watchQuality.gpsGood", lang)
                    .replacingOccurrences(of: "{pct}", with: String(Int(g.rounded())))
            }
            if let h = m.hacc_m { return String(format: "%.1f m", h) }
            return "–"
        }()
        let puls: String = m.puls_wechsel.map {
            Loc.t("watchQuality.hrRate", lang)
                .replacingOccurrences(of: "{n}", with: String(Int($0.rounded())))
        } ?? "–"
        let accel: String = m.accel_hz.map { String(format: "%.0f Hz", $0) } ?? "–"
        // Aufbau wie die Kennzahl-Zeilen darueber: `metric` statt eigener Zeilenart.
        HStack {
            metric(String(m.nutzer), Loc.t("watchStats.users", lang))
            Spacer(); metric(String(m.sessions), Loc.t("nav.sessions", lang))
            Spacer(); metric(accel, Loc.t("watchQuality.colPump", lang))
        }
        HStack {
            metric(gps, Loc.t("watchQuality.colGps", lang))
            Spacer(); metric(puls, Loc.t("watchQuality.colHr", lang))
            Spacer(); Spacer()
        }
        if m.nutzer <= 3 {
            Text(Loc.t("watchQuality.few", lang)).font(.footnote).foregroundStyle(.orange)
        }
    }

    private var introSection: some View {
        Section {
            Text(Loc.t("watchStats.hint", lang))
                .font(.subheadline).foregroundStyle(.secondary)
            StatSortBar(options: sortOptions, sortKey: $sortKey, sortAsc: $sortAsc)
        }
    }

    // Sortier-Chips: vorab typisiert statt als Literal-Array im ViewBuilder.
    private var sortOptions: [(key: String, label: String)] {
        [("name", Loc.t("nav.watch", lang)),
         ("sessions", Loc.t("nav.sessions", lang)),
         ("users", Loc.t("watchStats.users", lang)),
         ("km", Loc.t("watchStats.km", lang)),
         ("speed", "Ø km/h"),
         ("bestSpeed", Loc.t("watchStats.bestSpeed", lang)),
         ("hz", avgPumpLabel)]
    }

    @ViewBuilder private var statusRows: some View {
        if let error { Text(error).foregroundStyle(.secondary) }
        if !loading && rows.isEmpty && error == nil {
            Text(Loc.t("common.noData", lang)).foregroundStyle(.secondary)
        }
    }

    private var statRows: some View {
        ForEach(sorted) { s in
            Section(s.watch) {
                topRow(s)
                speedRow(s)
            }
        }
    }

    private func topRow(_ s: WatchStat) -> some View {
        HStack {
            metric("\(s.sessions)", Loc.t("nav.sessions", lang))
            Spacer(); metric("\(s.users)", Loc.t("watchStats.users", lang))
            Spacer(); metric(dec1(s.foiling_km), Loc.t("watchStats.km", lang))
        }
    }

    private func speedRow(_ s: WatchStat) -> some View {
        HStack {
            metric(dec1(s.avg_speed_kmh), "Ø km/h")
            Spacer(); metric(dec1(s.best_speed_kmh), Loc.t("watchStats.bestSpeed", lang))
            Spacer(); metric(PumpUnit.fmtValue(s.avg_pump_hz), avgPumpLabel)
        }
    }

    // Wie im Web: oben rechts zur jeweils anderen Statistik.
    @ToolbarContentBuilder private var otherStatsToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink(Loc.t("profile.stats", lang)) { FoilStatsView() }
        }
    }

    // Explizit typisierte Helfer statt Verkettung/`.map{}??` direkt im ViewBuilder.
    private var avgPumpLabel: String { "Ø " + PumpUnit.unitLabel(lang) }
    private func dec1(_ v: Double?) -> String {
        guard let v else { return "–" }
        return String(format: "%.1f", v)
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { rows = try await Api.watchStats(); error = nil }
        catch { self.error = error.localizedDescription }
        // Zweiter, unabhaengiger Abruf: schlaegt er fehl, fehlt nur dieser Abschnitt.
        quali = try? await Api.watchQuality()
    }
}
