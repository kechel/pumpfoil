import SwiftUI

// Bestenlisten der Fahrer (web Home.tsx Leaderboards/LEADER_KINDS) — die Kennzahlen, ihre Werte und das Teilen-Bild an
// EINER Stelle: die Community (CommunityView) und die Spot-Seite (SpotBestenliste unten, web 0fc2eba8, /leaders?spot=)
// zeigen dieselben Listen.

enum Bestenliste {
    /// Reihenfolge wie web LEADER_KINDS (Vorschlag eines Team-Kapitaens, 02.11.2026): zuerst die Laufdauer, dann die
    /// Summen, zuletzt der weiteste Lauf. Bei Wind/Paddeln vorne die ganze Fahrt; dort keine Pumps/Laeufe, bei Motor
    /// keine Pumps.
    static func arten(_ lang: String, wind: Bool, motor: Bool) -> [(String, String)] {
        let alle: [(String, String)] = [("ride_total", Loc.t("rec.sessionTotal", lang)), ("run_time", Loc.t("rec.longestRun", lang)),
         ("distance", Loc.t("leader.totalDistance", lang)), ("time", Loc.t("leader.totalTime", lang)),
         ("runs", Loc.t("leader.mostRuns", lang)), ("pumps", Loc.t("leader.mostPumps", lang)),
         ("sessions", Loc.t("leader.mostSessions", lang)), ("spots", Loc.t("leader.mostSpots", lang)),
         ("run_distance", Loc.t("rec.farthestRun", lang))]
        return alle.filter { a in
            let k: String = a.0
            if wind && (k == "pumps" || k == "runs") { return false }
            if motor && k == "pumps" { return false }
            return k != "ride_total" || wind
        }
    }

    static func liste(_ lb: Leaders, _ key: String) -> [LeaderEntry] {
        switch key {
        case "runs": return lb.runs ?? []
        case "pumps": return lb.pumps ?? []
        case "spots": return lb.spots ?? []
        case "distance": return lb.distance ?? []
        case "time": return lb.time ?? []
        case "run_distance": return lb.run_distance ?? []
        case "run_time": return lb.run_time ?? []
        case "ride_total": return lb.ride_total ?? []
        default: return lb.sessions ?? []
        }
    }

    static func wert(_ e: LeaderEntry, _ key: String) -> String {
        switch key {
        case "runs": return "\(e.runs ?? 0)"
        case "pumps": return "\(e.pumps ?? 0)"
        case "spots": return "\(e.spots ?? 0)"
        case "distance": return String(format: "%.1f", (e.distance_m ?? 0) / 1000)
        case "time": return dauer(e.time_s ?? 0)
        case "run_distance": return String(format: "%.2f", (e.run_distance_m ?? 0) / 1000)
        case "run_time": return dauer(e.run_time_s ?? 0)
        case "ride_total": return String(format: "%.1f", (e.ride_total_m ?? 0) / 1000)
        default: return "\(e.sessions ?? 0)"
        }
    }

    static func einheit(_ e: LeaderEntry, _ key: String, _ lang: String) -> String {
        switch key {
        case "runs": return Loc.t("unit.runs", lang)
        case "pumps": return Loc.t("unit.pumps", lang)
        case "spots": return Loc.t("unit.spots", lang)
        case "distance", "run_distance", "ride_total": return "km"
        case "time": return (e.time_s ?? 0) >= 3600 ? "h" : "min"
        case "run_time": return (e.run_time_s ?? 0) >= 3600 ? "h" : "min"
        default: return Loc.t("unit.sessions", lang)
        }
    }

    /// Zeit auf dem Foil wie im Web: h:mm, unter einer Stunde m:ss.
    static func dauer(_ s: Double) -> String {
        let t = Int(s), h = t / 3600, m = (t % 3600) / 60
        return h > 0 ? String(format: "%d:%02d", h, m) : String(format: "%d:%02d", m, t % 60)
    }

    /// Als Bild teilen (web BestenlisteBildDialog): derselbe Dialog wie bei den Team-Bestenlisten. Titel = die Liste,
    /// `unter` = Sportart · Zeitraum · (Foil-Band) — das Datum kommt hier dazu. Die ersten 10, die eigene Stelle darunter.
    static func bildZeigen(_ lb: Leaders, key: String, titel: String, unter: [String], lang: String) {
        let df = DateFormatter()
        df.locale = Locale(identifier: lang == "gsw" ? "de-CH" : lang)
        df.dateStyle = .medium
        df.timeStyle = .none
        let unterzeile: String = (unter + [df.string(from: Date())]).joined(separator: " · ")
        var bz: [TeamBildZeile] = []
        for (i, e) in liste(lb, key).prefix(10).enumerated() { bz.append(bildZeile(e, i + 1, key, lang, ich: false)) }
        var ende: TeamBildZeile? = nil
        if let ich = lb.me?[key] ?? nil, let r = ich.rank { ende = bildZeile(ich, r, key, lang, ich: true) }
        let eigene: TeamBildZeile? = ende
        let zeilen: [TeamBildZeile] = bz
        Task { @MainActor in
            var flaggen: [String: UIImage] = [:]
            for z in zeilen + (eigene.map { [$0] } ?? []) {
                if let l = z.land, flaggen[l] == nil, let b = TeamFlaggenBild.bild(l) { flaggen[l] = b }
            }
            let daten = TeamBildDaten(titel: titel, unterzeile: unterzeile, zeilen: zeilen, eigene: eigene,
                                      logos: [:], flaggen: flaggen)
            TeamBildDialog.zeigen(daten, lang: lang)
        }
    }

    private static func bildZeile(_ e: LeaderEntry, _ rang: Int, _ key: String, _ lang: String, ich: Bool) -> TeamBildZeile {
        let w: String = wert(e, key) + " " + einheit(e, key, lang)
        return TeamBildZeile(rang: rang, name: e.name ?? "—", wert: w, ich: ich, logo: nil, farbe: nil, land: e.land)
    }
}

/// Bestenlisten an einem Spot (web SpotRecordsSport + Leaderboards spot=, 02.11.2026) unter den Rekord-Kacheln,
/// Zeitraum wie die Kacheln darueber. Eine Liste sichtbar, umschaltbar; Einzellauf-Listen oeffnen die Session.
struct SpotBestenliste: View {
    let spot: String
    let sport: String
    let period: String
    let accelOnly: Bool
    let lang: String
    @State private var lb: Leaders?
    @State private var wahl = "run_time"

    private var arten: [(String, String)] {
        Bestenliste.arten(lang, wind: Sportarten.windArtig(sport), motor: Sportarten.motor(sport))
    }
    /// Gewaehlte Liste, sonst die erste angebotene (web: arten[0]).
    private var key: String { arten.contains { $0.0 == wahl } ? wahl : (arten.first?.0 ?? "sessions") }
    private var periodLabel: String { Loc.t("period." + period, lang) }

    var body: some View {
        Section {
            if let d = lb { inhalt(d) } else { ProgressView().frame(maxWidth: .infinity) }
        } header: {
            Text(Loc.t("community.leaderboard", lang) + " · " + periodLabel)
        }
        .task(id: "\(spot)|\(sport)|\(period)|\(accelOnly)") { await laden() }
    }

    @ViewBuilder private func inhalt(_ d: Leaders) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(arten, id: \.0) { a in chip(a.1, a.0 == key) { wahl = a.0 } }
            }
        }
        let liste: [LeaderEntry] = Array(Bestenliste.liste(d, key).prefix(10))
        if liste.isEmpty {
            Text("—").font(.caption).foregroundStyle(.secondary)
        } else {
            ForEach(Array(liste.enumerated()), id: \.offset) { i, e in zeileTap(i + 1, e, ich: false) }
            if let ich = d.me?[key] ?? nil, let r = ich.rank {
                Text("⋮").frame(maxWidth: .infinity).foregroundStyle(.secondary)
                zeileTap(r, ich, ich: true)
            }
            Button { bild(d) } label: {
                Label(Loc.t("team.bild.titel", lang), systemImage: "square.and.arrow.up").font(.subheadline)
            }
            .buttonStyle(.borderless)
        }
    }

    @ViewBuilder private func zeileTap(_ platz: Int, _ e: LeaderEntry, ich: Bool) -> some View {
        if let sid = e.session_id {
            NavigationLink { SessionDetailView(id: sid) } label: { zeile(platz, e, link: false, ich: ich) }
        } else {
            zeile(platz, e, link: true, ich: ich)
        }
    }

    private func zeile(_ platz: Int, _ e: LeaderEntry, link: Bool, ich: Bool) -> some View {
        HStack(spacing: 8) {
            Text("\(platz)").font(.subheadline).bold().foregroundStyle(Color.accentColor).frame(minWidth: 20)
            AvatarView(name: e.name, url: Api.mediaURL(e.avatar_url), size: 28, userId: e.user_id, link: link)
            LandFlagge(land: e.land)
            Text(e.name ?? "—").lineLimit(1)
            Spacer()
            Text(Bestenliste.wert(e, key)).fontWeight(.semibold)
            Text(Bestenliste.einheit(e, key, lang)).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.horizontal, ich ? 4 : 0)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.accentColor.opacity(ich ? 0.6 : 0), lineWidth: 1))
    }

    private func chip(_ label: String, _ an: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).font(.caption).padding(.horizontal, 12).padding(.vertical, 6)
                .background(an ? Color.accentColor : Color(.tertiarySystemBackground))
                .foregroundStyle(an ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.borderless)
    }

    private func bild(_ d: Leaders) {
        let titel: String = arten.first { $0.0 == key }?.1 ?? ""
        Bestenliste.bildZeigen(d, key: key, titel: titel, unter: [spot, Loc.t("cls.sport." + sport, lang), periodLabel], lang: lang)
    }

    private func laden() async {
        let p: String = period
        let neu: Leaders? = try? await Api.leaders(period: p, accelOnly: accelOnly, sport: sport, spot: spot)
        if p == period { lb = neu ?? Leaders(sessions: [], runs: [], spots: [], pumps: []) }
    }
}
