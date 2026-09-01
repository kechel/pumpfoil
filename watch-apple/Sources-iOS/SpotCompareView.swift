import SwiftUI

// Spot-Vergleich unter der Karte — dieselbe Sache wie SpotCompare.tsx in der PWA: je Kennzahl
// der fuehrende Spot, darunter der gewaehlte (standardmaessig der eigene Homespot) mit Wert und
// Rang. Zwei der acht Kennzahlen sind Einzel-Rekorde (weitester Lauf, Topspeed) — dort steht
// zusaetzlich, wer ihn gefahren hat und wann, und die Karte fuehrt zu genau dieser Session.
//
// In kleine Teil-Views zerlegt, nicht aus Stilgruenden: ein ViewBuilder ist fuer den
// Swift-Type-Checker EIN Ausdruck, und genau daran hing der iOS-Release-Build schon einmal
// minutenlang (s. SpotsView, Loc.swift).

/// Eine Vergleichs-Kennzahl. `halter` gesetzt = Einzel-Rekord.
struct SpotKennzahl: Identifiable {
    let titel: String
    let wert: (SpotAgg) -> Double
    let zeige: (Double) -> String
    var halter: ((SpotAgg) -> SpotRecHolder?)? = nil
    var id: String { titel }
}

/// Navigationsziel der Rekord-Karten (Wert-basiert, wie SpotDest in SpotsView).
struct SpotCmpSessionDest: Hashable { let id: Int }

struct SpotCompareView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var period = "10d"
    @State private var daten: [SpotAgg]? = nil
    @State private var sel = ""            // Vergleichsspot (place_name)

    private let perioden: [(String, String)] = [
        ("today", "period.today"), ("10d", "period.10d"), ("30d", "period.30d"),
        ("365d", "period.365d"), ("all", "period.all"),
    ]

    var body: some View {
        Section {
            kopfzeile
            zeitfenster
            if let liste = daten, !liste.isEmpty { spotWahl(liste) }
            inhalt
        }
        .task(id: period) { await laden() }
        .task { await homespotVorbelegen() }
    }

    private var kopfzeile: some View {
        Text(Loc.t("spotcmp.title", lang)).font(.headline)
    }

    private var zeitfenster: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(perioden, id: \.0) { p in
                    Button { period = p.0 } label: {
                        Text(Loc.t(p.1, lang))
                            .font(.subheadline)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(period == p.0 ? Color.accentColor.opacity(0.25) : Color.gray.opacity(0.15))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func spotWahl(_ liste: [SpotAgg]) -> some View {
        Picker(Loc.t("spotcmp.pick", lang), selection: $sel) {
            Text(Loc.t("spotcmp.pick", lang)).tag("")
            ForEach(liste.sorted { $0.spot < $1.spot }) { s in
                Text(s.spot).tag(s.spot)
            }
        }
    }

    @ViewBuilder private var inhalt: some View {
        if let liste = daten {
            if liste.isEmpty {
                Text(Loc.t("spots.none", lang)).foregroundStyle(.secondary)
            } else {
                let gewaehlt = liste.first { $0.spot == sel }
                ForEach(kennzahlen) { k in
                    let rang = liste.filter { k.wert($0) > 0 }.sorted { k.wert($0) > k.wert($1) }
                    if let fuehrend = rang.first {
                        SpotKennzahlZeile(k: k, fuehrend: fuehrend, rang: rang, gewaehlt: gewaehlt, lang: lang)
                    }
                }
            }
        } else {
            ProgressView()
        }
    }

    private var kennzahlen: [SpotKennzahl] {
        [
            SpotKennzahl(titel: Loc.t("leader.mostSessions", lang), wert: { Double($0.sessions) }, zeige: { String(Int($0)) }),
            SpotKennzahl(titel: Loc.t("leader.mostRuns", lang), wert: { Double($0.runs) }, zeige: { String(Int($0)) }),
            SpotKennzahl(titel: Loc.t("leader.mostPumps", lang), wert: { Double($0.pumps) }, zeige: { String(Int($0)) }),
            SpotKennzahl(titel: Loc.t("spotcmp.foilers", lang), wert: { Double($0.foilers) }, zeige: { String(Int($0)) }),
            SpotKennzahl(titel: Loc.t("spotcmp.distance", lang), wert: { $0.foiling_km }, zeige: { String(format: "%.1f km", $0) }),
            SpotKennzahl(titel: Loc.t("rec.sessionTime", lang), wert: { Double($0.onfoil_s) }, zeige: { Self.dauer($0) }),
            SpotKennzahl(titel: Loc.t("rec.farthestRun", lang), wert: { $0.longest_run?.value ?? 0 },
                         zeige: { $0 >= 1000 ? String(format: "%.2f km", $0 / 1000) : String(format: "%.0f m", $0) },
                         halter: { $0.longest_run }),
            SpotKennzahl(titel: Loc.t("rec.topSpeed", lang), wert: { $0.top_speed?.value ?? 0 },
                         zeige: { String(format: "%.1f km/h", $0) }, halter: { $0.top_speed }),
        ]
    }

    static func dauer(_ s: Double) -> String {
        let m = Int((s / 60).rounded())
        return m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m"
    }

    private func laden() async {
        let angefragt = period
        let neu = (try? await Api.spotCompare(period: angefragt)) ?? []
        if angefragt == period { daten = neu }
    }

    /// Vorbelegung: der eigene Homespot, sobald bekannt (wie im Web).
    private func homespotVorbelegen() async {
        guard sel.isEmpty else { return }
        if let d = try? await Api.settings(), let h = d["homespot"] as? String, !h.isEmpty {
            sel = h
        }
    }
}

/// Eine Zeile: fuehrender Spot mit Wert, Halter (nur bei Einzel-Rekorden), darunter der
/// Vergleichsspot mit Rang. Rekord-Karten fuehren zur Session, Aggregate zur Spot-Liste.
private struct SpotKennzahlZeile: View {
    let k: SpotKennzahl
    let fuehrend: SpotAgg
    let rang: [SpotAgg]
    let gewaehlt: SpotAgg?
    let lang: String

    var body: some View {
        let halter = k.halter?(fuehrend) ?? nil
        if let sid = halter?.session_id {
            NavigationLink(value: SpotCmpSessionDest(id: sid)) { rumpf(halter) }
        } else {
            NavigationLink(value: SpotDest(spot: fuehrend.spot)) { rumpf(halter) }
        }
    }

    @ViewBuilder private func rumpf(_ halter: SpotRecHolder?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(k.zeige(k.wert(fuehrend))).font(.headline).foregroundStyle(Color.accentColor)
                Spacer()
                Text(k.titel).font(.subheadline).foregroundStyle(.secondary)
            }
            HStack(spacing: 3) {
                Image(systemName: "mappin.circle.fill").font(.caption).foregroundStyle(.secondary)
                Text(fuehrend.spot).font(.subheadline).lineLimit(1)
            }
            if let h = halter, h.name != nil || h.started_at != nil {
                Text(halterZeile(h)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            if let g = gewaehlt, g.spot != fuehrend.spot {
                Divider()
                HStack {
                    Text(vergleichsZeile(g)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    Text(k.wert(g) > 0 ? k.zeige(k.wert(g)) : "—").font(.subheadline)
                }
            }
        }
    }

    private func halterZeile(_ h: SpotRecHolder) -> String {
        var teile: [String] = []
        if let n = h.name, !n.isEmpty { teile.append(n) }
        if let d = h.started_at, let t = TimeFmt.shortDate(d, h.tz) { teile.append(t) }
        return teile.joined(separator: " · ")
    }

    private func vergleichsZeile(_ g: SpotAgg) -> String {
        let platz = (rang.firstIndex { $0.spot == g.spot }).map { $0 + 1 } ?? 0
        return platz > 0 ? "\(g.spot)  #\(platz)/\(rang.count)" : g.spot
    }
}
