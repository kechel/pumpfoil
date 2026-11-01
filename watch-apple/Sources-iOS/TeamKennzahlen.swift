import SwiftUI

// Kennzahlen, Bestenlisten und Summen-Kacheln der Teams (Native-Port Stufe 4, 01.11.2026).
// Port von web/src/lib/teamKennzahlen.ts und den Bausteinen `Tafel`/`Statistik` (pages/Team.tsx) bzw.
// `EventSummen` (pages/TeamEventSeite.tsx). Schluessel = server/app/teams.py KENNZAHLEN / EVENT_SUMMEN.

/// Text mit Platzhaltern `{name}` usw. (wie t(key, vars) im Web).
func teamText(_ key: String, _ lang: String, _ werte: [String: String] = [:]) -> String {
    var s: String = Loc.t(key, lang)
    for (k, v) in werte { s = s.replacingOccurrences(of: "{" + k + "}", with: v) }
    return s
}

/// Ganze Zahl mit Tausendertrennung in der App-Sprache (wie toLocaleString()).
func teamGanz(_ v: Double, _ lang: String) -> String {
    let f = NumberFormatter()
    f.locale = teamLocale(lang)
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v.rounded()))
}

private func teamKm(_ m: Double) -> String {
    if m < 1000 { return String(format: "%.0f m", m) }
    return String(format: m < 100000 ? "%.1f km" : "%.0f km", m / 1000)
}

private func teamStunden(_ s: Double) -> String {
    if s < 3600 { return String(format: "%.0f min", s / 60) }
    return String(format: "%.1f h", s / 3600)
}

/// Beschriftung + Format einer Bestenlisten-Kennzahl.
struct TeamKennzahl {
    let labelKey: String
    let fmt: (Double, String) -> String
}

func teamKennzahl(_ key: String) -> TeamKennzahl {
    switch key {
    case "session_pumps": return TeamKennzahl(labelKey: "rec.sessionPumps") { v, l in teamGanz(v, l) }
    case "distance": return TeamKennzahl(labelKey: "rec.farthestRun") { v, _ in v < 1000 ? String(format: "%.0f m", v) : String(format: "%.2f km", v / 1000) }
    case "duration": return TeamKennzahl(labelKey: "rec.longestRun") { v, _ in fmtLaufDauer(v) }
    case "speed": return TeamKennzahl(labelKey: "rec.topSpeed") { v, _ in String(format: "%.1f km/h", v * 3.6) }
    case "glide": return TeamKennzahl(labelKey: "rec.longestGlide") { v, _ in String(format: "%.1f s", v) }
    case "runs": return TeamKennzahl(labelKey: "rec.mostRuns") { v, l in teamGanz(v, l) }
    case "session_distance": return TeamKennzahl(labelKey: "rec.sessionDistance") { v, _ in String(format: "%.1f km", v / 1000) }
    case "session_time": return TeamKennzahl(labelKey: "rec.sessionTime") { v, _ in String(format: "%.0f min", v / 60) }
    case "sum_distance": return TeamKennzahl(labelKey: "team.k.sum_distance") { v, _ in teamKm(v) }
    case "sum_time": return TeamKennzahl(labelKey: "team.k.sum_time") { v, _ in teamStunden(v) }
    case "sum_pumps", "sum_runs", "sum_sessions", "sum_spots":
        return TeamKennzahl(labelKey: "team.k." + key) { v, l in teamGanz(v, l) }
    default: return TeamKennzahl(labelKey: key) { v, _ in String(format: "%g", v) }
    }
}

/// Was eine Bestenliste misst: Kennzahl, dahinter die Sportart, wenn es nicht Pumpfoil ist.
func teamTafelKurz(_ tf: TeamTafel, _ lang: String) -> String {
    let name: String = Loc.t(teamKennzahl(tf.kennzahl).labelKey, lang)
    guard tf.sportart != "pumpfoil" else { return name }
    return name + " (" + Loc.t("cls.sport." + tf.sportart, lang) + ")"
}

/// Sportarten eines Teams kurz („Pumpfoil · Wingfoil").
func teamSportartenText(_ sp: [String]?, _ lang: String) -> String {
    (sp ?? []).map { Loc.t("cls.sport." + $0, lang) }.joined(separator: " · ")
}

/// Gesamtsummen eines Events in Server-Reihenfolge (teams.EVENT_SUMMEN).
struct EventSumme {
    let key: String
    let labelKey: String
}

let EVENT_SUMMEN: [EventSumme] = [
    EventSumme(key: "pumps", labelKey: "team.stat.pumps"),
    EventSumme(key: "distance_m", labelKey: "team.stat.strecke"),
    EventSumme(key: "time_s", labelKey: "team.stat.zeit"),
    EventSumme(key: "sessions", labelKey: "team.stat.sessions"),
    EventSumme(key: "runs", labelKey: "team.stat.laeufe"),
    EventSumme(key: "spots", labelKey: "team.k.sum_spots"),
    EventSumme(key: "aktive", labelKey: "team.event.teilnehmer"),
]

func eventSummeFormat(_ key: String, _ v: Double, _ lang: String) -> String {
    switch key {
    case "distance_m": return teamKm(v)
    case "time_s": return teamStunden(v)
    default: return teamGanz(v, lang)
    }
}

/// „Längster Lauf · Event gesamt: Pumps, On-Foil-Strecke" — erste Zeile der Event-Regeln.
func eventGemessen(_ e: TeamEvent, _ lang: String) -> String {
    var teile: [String] = e.tafeln.map { teamTafelKurz($0, lang) }
    let auswahl: [String] = e.summen_auswahl ?? []
    let summen: [String] = EVENT_SUMMEN.filter { auswahl.contains($0.key) }.map { Loc.t($0.labelKey, lang) }
    if !summen.isEmpty { teile.append(Loc.t("team.event.teamGesamt", lang) + ": " + summen.joined(separator: ", ")) }
    return teile.joined(separator: " · ")
}

// MARK: - Kachel-Raster (Teamstatistik, Event gesamt)

struct TeamZahlKachel: Identifiable {
    let label: String
    let wert: String
    var id: String { label }
}

/// Zahlen-Kacheln in Teamfarbe; `rand` = mit farbigem Rahmen (Event gesamt).
struct TeamZahlenRaster: View {
    let kacheln: [TeamZahlKachel]
    let farbe: String?
    var spalten: Int = 3
    var rand: Bool = false
    var gross: Bool = false

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var raster: [GridItem] { Array(repeating: GridItem(.flexible(), spacing: 8), count: spalten) }
    private var randFarbe: Color { rand ? tf.akzent : Color.clear }
    private var schrift: Font { gross ? .title2.weight(.bold) : .headline.weight(.bold) }

    var body: some View {
        LazyVGrid(columns: raster, spacing: 8) {
            ForEach(kacheln) { k in kachel(k) }
        }
    }

    private func kachel(_ k: TeamZahlKachel) -> some View {
        VStack(spacing: 2) {
            Text(k.wert).font(schrift).foregroundStyle(tf.akzent).lineLimit(1).minimumScaleFactor(0.6)
            Text(k.label).font(.caption2).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8).padding(.horizontal, 4)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(randFarbe, lineWidth: 2))
    }
}

/// Teamstatistik im Zeitraum (sechs Kacheln wie im Web).
func teamStatistikKacheln(_ s: TeamStatistik, _ lang: String) -> [TeamZahlKachel] {
    [
        TeamZahlKachel(label: Loc.t("team.stat.pumps", lang), wert: teamGanz(s.pumps, lang)),
        TeamZahlKachel(label: Loc.t("team.stat.strecke", lang), wert: teamKm(s.distance_m)),
        TeamZahlKachel(label: Loc.t("team.stat.zeit", lang), wert: teamStunden(s.time_s)),
        TeamZahlKachel(label: Loc.t("team.stat.sessions", lang), wert: teamGanz(s.sessions, lang)),
        TeamZahlKachel(label: Loc.t("team.stat.laeufe", lang), wert: teamGanz(s.runs, lang)),
        TeamZahlKachel(label: Loc.t("team.stat.aktiv", lang), wert: "\(s.aktive) / \(s.mitglieder)"),
    ]
}

/// „Event gesamt": nur die angehakten Summen.
func eventSummenKacheln(_ e: TeamEvent, _ lang: String) -> [TeamZahlKachel] {
    let auswahl: [String] = e.summen_auswahl ?? []
    return EVENT_SUMMEN.filter { auswahl.contains($0.key) }.map { k in
        // Einzahl bei 1 („1 Teilnehmer“, 01.11.2026)
        let eins: Bool = k.key == "aktive" && e.summe(k.key) == 1
        let schluessel: String = eins ? "team.event.teilnehmer1" : k.labelKey
        return TeamZahlKachel(label: Loc.t(schluessel, lang), wert: eventSummeFormat(k.key, e.summe(k.key), lang))
    }
}

// MARK: - Bestenliste

/// Eine Bestenliste (Team oder Event). Zeilen mit Profilbild (Tipp -> Foiler-Seite) und Wert als Link zur
/// Session. Die Zurueck-Navigation fuehrt von dort von selbst auf diese Seite zurueck (Push im selben Stapel).
struct TeamTafelKarte: View {
    let tf: TeamTafel
    let farbe: String?
    let lang: String
    /// Filterzeile weglassen — auf der Event-Seite.
    var ohneFilter: Bool = false

    private var k: TeamKennzahl { teamKennzahl(tf.kennzahl) }
    private var tfarbe: TeamFarbe { TeamFarbe(farbe) }
    private var titel: String { Loc.t(k.labelKey, lang) }
    private var filter: String {
        var teile: [String] = []
        if tf.sportart != "pumpfoil" { teile.append(Loc.t("cls.sport." + tf.sportart, lang)) }
        if tf.nur_teamspots == true { teile.append(Loc.t("team.tafel.nurTeamspots", lang)) }
        if tf.nur_brett == true { teile.append(Loc.t("team.tafel.nurBrett", lang)) }
        return teile.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(titel).font(.headline).foregroundStyle(tfarbe.akzent)
            if !ohneFilter && !filter.isEmpty {
                Text(filter).font(.caption).foregroundStyle(.secondary)
            }
            zeilenBereich
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder private var zeilenBereich: some View {
        if tf.zeilen.isEmpty {
            Text(Loc.t("team.tafel.leer", lang)).font(.subheadline).foregroundStyle(.secondary).padding(.top, 4)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(tf.zeilen.enumerated()), id: \.offset) { i, z in
                    if i > 0 { Divider() }
                    TeamTafelZeile(z: z, wert: k.fmt(z.value, lang), farbe: farbe, lang: lang)
                }
            }
        }
    }
}

private struct TeamTafelZeile: View {
    let z: TeamZeile
    let wert: String
    let farbe: String?
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var rangFarbe: Color { z.rang <= 3 ? tf.akzent : Color.secondary }
    private var name: String { z.name ?? "—" }
    private var unterzeile: String? {
        guard z.started_at != nil else { return nil }
        let datum: String = teamKurzdatum(z.started_at, lang)
        guard let sp = z.spot, !sp.isEmpty else { return datum }
        return datum + " · " + sp
    }

    var body: some View {
        HStack(spacing: 8) {
            Text("\(z.rang)").font(.subheadline.weight(.bold)).foregroundStyle(rangFarbe)
                .frame(width: 24, alignment: .trailing)
            bild
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.subheadline).lineLimit(1)
                if let u = unterzeile { Text(u).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer(minLength: 4)
            wertBereich
        }
        .padding(.vertical, 6)
    }

    @ViewBuilder private var bild: some View {
        if let uid = z.user_id {
            AvatarView(name: z.name, url: Api.mediaURL(z.avatar_url), size: 28, userId: uid)
        } else {
            Text(z.initialen ?? teamInitialen(z.name)).font(.caption2.weight(.semibold))
                .frame(width: 28, height: 28)
                .background(tf.flaeche.opacity(0.35), in: Circle())
        }
    }

    @ViewBuilder private var wertBereich: some View {
        if let sid = z.session_id {
            NavigationLink { SessionDetailView(id: sid) } label: {
                Text(wert).font(.subheadline.weight(.semibold)).underline()
            }
            .buttonStyle(.plain)
        } else {
            Text(wert).font(.subheadline.weight(.semibold))
        }
    }
}
