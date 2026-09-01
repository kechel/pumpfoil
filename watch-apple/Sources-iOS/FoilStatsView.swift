import SwiftUI

// Sortier-Zeile für die Stats-Listen (wie die sortierbaren Web-Spalten): Chip je Kennzahl,
// erneutes Tippen dreht die Richtung; Einträge ohne Wert immer unten.
struct StatSortBar: View {
    let options: [(key: String, label: String)]
    @Binding var sortKey: String
    @Binding var sortAsc: Bool

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.key) { o in
                    chip(o.key, o.label)
                }
            }
        }
    }

    private func chip(_ key: String, _ label: String) -> some View {
        let selected = sortKey == key
        let text = selected ? "\(label) \(sortAsc ? "↑" : "↓")" : label
        return Button {
            if selected { sortAsc.toggle() } else { sortKey = key; sortAsc = (key == "name") }
        } label: {
            Text(text).font(.caption)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(selected ? Color.accentColor.opacity(0.2) : Color(.secondarySystemBackground))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// Nach Kennzahl sortieren; Einträge ohne Wert immer unten (wie web/SortableTable).
func sortStats<T>(_ list: [T], asc: Bool, key: (T) -> Double?) -> [T] {
    let has = list.filter { key($0) != nil }.sorted { (key($0) ?? 0) < (key($1) ?? 0) }
    let none = list.filter { key($0) == nil }
    return (asc ? has : has.reversed()) + none
}

// Foil-Statistik (spiegelt web/FoilStats): Community-Vergleich je Foil als Cards.
struct FoilStatsView: View {
    @AppStorage("appLang") private var lang = "de"
    // Beobachtet die Anzeige-Einheit der Pump-Kadenz -> Umschalten wirkt sofort (PumpUnit.swift).
    @AppStorage(PumpUnit.storeKey) private var pumpUnit = "hz"
    @State private var rows: [FoilStat] = []
    @State private var loading = true
    @State private var error: String?
    @State private var sortKey = "sessions"
    @State private var sortAsc = false

    private var sorted: [FoilStat] {
        if sortKey == "name" {
            let s = rows.sorted { nameKey($0) < nameKey($1) }
            return sortAsc ? s : s.reversed()
        }
        return sortStats(rows, asc: sortAsc) { s in
            switch sortKey {
            case "users": return Double(s.users)
            case "speed": return s.avg_speed_kmh
            case "mpp": return s.meters_per_pump
            case "best": return s.best_distance_m
            case "dur": return s.best_duration_s
            case "hz": return s.avg_pump_hz
            default: return Double(s.sessions)
            }
        }
    }

    // Ein Abschnitt = eine eigene Teil-View, Strings vorformatiert: der Body war EIN Ausdruck aus
    // Sortier-Chips (7 Tupel), zwei Kennzahl-Zeilen mit je drei .map{}??-Interpolationen und einer
    // Toolbar — genau die Bausteine, an denen der Type-Checker beim Archivieren hängt.
    var body: some View {
        List {
            introSection
            statusRows
            statRows
        }
        .overlay { if loading { ProgressView() } }
        .brandToolbar(Loc.t("profile.stats", lang))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { otherStatsToolbar }
        .task { await load() }
    }

    private var introSection: some View {
        Section {
            Text(Loc.t("foilStats.hint", lang))
                .font(.subheadline).foregroundStyle(.secondary)
            StatSortBar(options: sortOptions, sortKey: $sortKey, sortAsc: $sortAsc)
        }
    }

    // Sortier-Chips: vorab typisiert statt als Literal-Array im ViewBuilder.
    private var sortOptions: [(key: String, label: String)] {
        [("name", "Foil"),
         ("sessions", Loc.t("nav.sessions", lang)),
         ("users", Loc.t("foilstats.riders", lang)),
         ("speed", "Ø km/h"),
         ("mpp", "m/Pump"),
         ("best", Loc.t("foilstats.bestKm", lang)),
         ("dur", Loc.t("rec.longestRun", lang)),
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
            Section(title(s)) {
                topRow(s)
                pumpRow(s)
                bestRow(s)
            }
        }
    }

    private func topRow(_ s: FoilStat) -> some View {
        HStack {
            metric("\(s.sessions)", Loc.t("nav.sessions", lang))
            Spacer(); metric("\(s.users)", Loc.t("foilstats.riders", lang))
            Spacer(); metric(dec1(s.avg_speed_kmh), "Ø km/h")
        }
    }

    private func pumpRow(_ s: FoilStat) -> some View {
        HStack {
            metric(dec1(s.meters_per_pump), "m/Pump")
            Spacer(); metric(PumpUnit.fmtValue(s.avg_pump_hz), avgPumpLabel)
        }
    }

    // Die beiden Bestwerte EINES Laufs als Paar (Nutzerwunsch 30.08.: "best time and distance
    // for each different foil") — zu zweit bleibt Platz fuer die langen Labels.
    private func bestRow(_ s: FoilStat) -> some View {
        HStack {
            metric(kmStr(s.best_distance_m), Loc.t("foilstats.bestKm", lang))
            Spacer(); metric(durStr(s.best_duration_s), Loc.t("rec.longestRun", lang))
        }
    }

    // Wie im Web: oben rechts zur jeweils anderen Statistik.
    @ToolbarContentBuilder private var otherStatsToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink(Loc.t("watchStats.title", lang)) { WatchStatsView() }
        }
    }

    // Explizit typisierte Helfer statt Verkettung/Interpolation direkt im ViewBuilder.
    private var avgPumpLabel: String { "Ø " + PumpUnit.unitLabel(lang) }
    private func title(_ s: FoilStat) -> String { "\(s.brand) \(s.model) \(s.size)" }
    private func nameKey(_ s: FoilStat) -> String { title(s).lowercased() }
    private func dec1(_ v: Double?) -> String {
        guard let v else { return "–" }
        return String(format: "%.1f", v)
    }
    // m:ss wie in den Rekord-Kacheln der Startseite; erst runden, sonst entsteht "6:60".
    private func durStr(_ sec: Double?) -> String {
        guard let sec else { return "–" }
        let t = Int(sec.rounded())
        return String(format: "%d:%02d", t / 60, t % 60)
    }
    private func kmStr(_ m: Double?) -> String {
        guard let m else { return "–" }
        return String(format: "%.2f", m / 1000)
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { rows = try await Api.foilStats(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
