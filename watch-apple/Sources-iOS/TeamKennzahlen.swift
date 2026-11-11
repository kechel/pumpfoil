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

/// Sprint ueber eine Strecke: „12.3 s · 29.3 km/h" (web sprintStrecke).
private func teamSprintStrecke(_ m: Double, _ v: Double) -> String {
    guard v > 0 else { return "—" }
    return String(format: "%.1f s · %.1f km/h", m / v, v * 3.6)
}

/// Kennzahlen, deren Team-Wertung der Durchschnitt der besten N ist (web SPRINT_KENNZAHLEN) — Tempo addiert man nicht.
let TEAM_SPRINT_KENNZAHLEN: Set<String> = ["sprint_100m", "sprint_200m", "sprint_300m", "sprint_60s"]

/// Wie die Team-Wertung globaler Events zaehlt (web wertungText): Sprints als Durchschnitt der besten N, sonst Summe.
func teamWertungText(_ kennzahl: String, _ n: Int, _ lang: String) -> String {
    let schnitt: Bool = TEAM_SPRINT_KENNZAHLEN.contains(kennzahl)
    if n == 0 { return Loc.t(schnitt ? "team.event.wertungSchnittAlle" : "team.event.wertungAlle", lang) }
    return teamText(schnitt ? "team.event.wertungSchnittBeste" : "team.event.wertungBeste", lang, ["n": String(n)])
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
    // Fliegende Sprints (09.11.2026, web SPRINT_KENNZAHLEN): Wert = Tempo des besten Fensters in m/s. Strecken als Zeit,
    // km/h dahinter; die Minute als km/h und die Strecke in dieser Minute. Eine Nachkommastelle, mehr gibt GPS nicht her.
    case "sprint_100m": return TeamKennzahl(labelKey: "team.k.sprint_100m") { v, _ in teamSprintStrecke(100, v) }
    case "sprint_200m": return TeamKennzahl(labelKey: "team.k.sprint_200m") { v, _ in teamSprintStrecke(200, v) }
    case "sprint_300m": return TeamKennzahl(labelKey: "team.k.sprint_300m") { v, _ in teamSprintStrecke(300, v) }
    case "sprint_60s":
        return TeamKennzahl(labelKey: "team.k.sprint_60s") { v, _ in String(format: "%.1f km/h · %.0f m", v * 3.6, (v * 60).rounded()) }
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
    /// Sportart als Marke neben der Ueberschrift — wenn die Bestenlisten verschiedene Sportarten haben (web 831f6406,
    /// Jan 02.11.2026: „in den kacheln fehlt die anzeige welche sportart jeweils gemeint ist").
    var sportZeigen: Bool = false
    /// „Stand 6. Nov., 14:32" bzw. „Endstand" unter der Ueberschrift (Event-Seite, web 72c78190, 06.11.2026).
    var standText: String? = nil
    /// Als Bild teilen — Knopf „Teilen" rechts neben der Ueberschrift (web 6b9a6f0d); nil = kein Knopf.
    var onBild: (() -> Void)? = nil
    /// Globale Events: Spalte mit den Team-Wappen je Fahrer (web 8fc88474, 07.11.2026).
    var teamsZeigen: Bool = false

    private var k: TeamKennzahl { teamKennzahl(tf.kennzahl) }
    private var tfarbe: TeamFarbe { TeamFarbe(farbe) }
    private var titel: String { Loc.t(k.labelKey, lang) }
    private var strittige: Int { tf.zeilen.filter { $0.strittig == true }.count }
    private var filter: String {
        var teile: [String] = []
        if tf.sportart != "pumpfoil" && !sportZeigen { teile.append(Loc.t("cls.sport." + tf.sportart, lang)) }
        if tf.nur_teamspots == true { teile.append(Loc.t("team.tafel.nurTeamspots", lang)) }
        if tf.nur_brett == true { teile.append(Loc.t("team.tafel.nurBrett", lang)) }
        return teile.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            titelZeile
            if !ohneFilter && !filter.isEmpty {
                Text(filter).font(.caption).foregroundStyle(.secondary)
            }
            if let st = standText { Text(st).font(.caption).foregroundStyle(.secondary) }
            zeilenBereich
            TeamStrittigHinweis(anzahl: strittige, lang: lang)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private var titelZeile: some View {
        HStack(spacing: 8) {
            Text(titel).font(.headline).foregroundStyle(tfarbe.akzent)
            if sportZeigen {
                Text(Loc.t("cls.sport." + tf.sportart, lang)).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Capsule().fill(Color(.tertiarySystemBackground)))
            }
            if let b = onBild, !tf.zeilen.isEmpty {
                Spacer(minLength: 4)
                TeamTeilenKnopf(lang: lang, aktion: b)
            }
        }
    }

    @ViewBuilder private var zeilenBereich: some View {
        if tf.zeilen.isEmpty {
            Text(Loc.t("team.tafel.leer", lang)).font(.subheadline).foregroundStyle(.secondary).padding(.top, 4)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(tf.zeilen.enumerated()), id: \.offset) { i, z in
                    if i > 0 { Divider() }
                    TeamTafelZeile(z: z, wert: k.fmt(z.value, lang), farbe: farbe, lang: lang, teamsZeigen: teamsZeigen,
                                   kennzahl: tf.kennzahl)
                }
            }
        }
    }
}

/// „Teilen" mit Symbol (web 6b9a6f0d: Text neben dem Symbol) — oeffnet das Teilen-Bild einer Bestenliste.
struct TeamTeilenKnopf: View {
    let lang: String
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Label(Loc.t("team.teilen", lang), systemImage: "square.and.arrow.up").font(.subheadline)
        }
        .buttonStyle(.borderless)
        .accessibilityHint(Loc.t("team.bild.titel", lang))
    }
}

/// Eine Zeile einer Bestenliste. Die GANZE Zeile ist antippbar (web 713147c3, Jan 11.11.2026): mit Lauf -> die Session
/// mit diesem Lauf ausgewaehlt (bei Sprints dazu die Kennzahl fuer die Hervorhebung), nur Session -> die Session, sonst
/// (Summen) -> das Profil des Fahrers. Profilbild und Wappen behalten ihre eigenen Ziele (liegen als eigene Knoepfe darin).
private struct TeamTafelZeile: View {
    let z: TeamZeile
    let wert: String
    let farbe: String?
    let lang: String
    var teamsZeigen: Bool = false
    var kennzahl: String = ""
    @State private var profil = false

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var rangFarbe: Color { z.rang <= 3 ? tf.akzent : Color.secondary }
    private var name: String { z.name ?? "—" }
    private var unterzeile: String? {
        guard z.started_at != nil else { return nil }
        let datum: String = teamKurzdatum(z.started_at, lang)
        guard let sp = z.spot, !sp.isEmpty else { return datum }
        return datum + " · " + sp
    }
    /// Sprint-Kennzahl nur zusammen mit einem Lauf (web: `?run=…&sprint=…`).
    private var sprintKz: String? {
        guard z.run_idx != nil, kennzahl.hasPrefix("sprint_") else { return nil }
        return kennzahl
    }

    @ViewBuilder var body: some View {
        if let sid = z.session_id, z.user_id != nil {
            NavigationLink { SessionDetailView(id: sid, vorwahlLauf: z.run_idx, sprintKz: sprintKz) } label: { inhalt }
                .buttonStyle(.plain)
        } else if let uid = z.user_id {
            Button { profil = true } label: { inhalt }
                .buttonStyle(.plain)
                .sheet(isPresented: $profil) { FoilerSheet(userId: uid) }
        } else {
            inhalt
        }
    }

    private var inhalt: some View {
        HStack(spacing: 8) {
            Text("\(z.rang)").font(.subheadline.weight(.bold)).foregroundStyle(rangFarbe)
                .lineLimit(1).minimumScaleFactor(0.6).frame(width: 28, alignment: .trailing)
            bild
            LandFlagge(land: z.land)
            if teamsZeigen { TeamWappenSpalte(teams: z.teams ?? []) }
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.subheadline).lineLimit(1)
                SportAbzeichen(sportarten: z.sportarten, lang: lang)
                if z.strittig == true { TeamStrittigMarke(lang: lang) }
                if let u = unterzeile { Text(u).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer(minLength: 4)
            Text(wert).font(.subheadline.weight(.semibold))
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
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
}

// MARK: - Abzeichen, Wappen-Spalte, „in Klärung"

/// Warnfarbe wie im Web (amber-700 hell / amber-300 dunkel), in beiden Modi lesbar.
let teamAmberText: Color = Color(UIColor { tc in
    tc.userInterfaceStyle == .dark ? UIColor(red: 0.988, green: 0.827, blue: 0.302, alpha: 1)
                                   : UIColor(red: 0.706, green: 0.325, blue: 0.035, alpha: 1)
})

/// Abzeichen der Sportart in gemischten Ranglisten (web SportAbzeichen.tsx, 08.11.2026): nur dort, wo der Server
/// `sportarten` mitschickt — das tut er ausschliesslich in gemischten Ansichten. Feste Farbe je Sportart, unbekannte grau.
struct SportAbzeichen: View {
    let sportarten: [String]?
    let lang: String

    private var sortiert: [String] {
        let reihe: [String] = SPORTS
        func pos(_ s: String) -> Int { reihe.firstIndex(of: s) ?? -1 }
        return (sportarten ?? []).sorted { pos($0) < pos($1) }
    }

    var body: some View {
        if !(sportarten ?? []).isEmpty {
            HStack(spacing: 4) {
                ForEach(sortiert, id: \.self) { sp in marke(sp) }
            }
        }
    }

    private func schrift(_ sp: String) -> Color {
        switch sp {
        case "pumpfoil": return TeamFarbe(nil).akzent
        case "foil_scoot": return teamAmberText
        default: return Color.secondary
        }
    }

    private func flaeche(_ sp: String) -> Color {
        switch sp {
        case "pumpfoil": return TeamFarbe(nil).akzent.opacity(0.15)
        case "foil_scoot": return Color.orange.opacity(0.15)
        default: return Color(.tertiarySystemBackground)
        }
    }

    private func marke(_ sp: String) -> some View {
        Text(Loc.t("cls.sport." + sp, lang)).font(.system(size: 10, weight: .medium)).foregroundStyle(schrift(sp))
            .lineLimit(1)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(flaeche(sp), in: RoundedRectangle(cornerRadius: 4))
    }
}

/// „in Klärung" an einer Zeile (web 08.11.2026): offene Meldung, noch nicht entschieden — zaehlt, aber mit Vermerk.
struct TeamStrittigMarke: View {
    let lang: String

    var body: some View {
        Text(Loc.t("team.tafel.strittig", lang)).font(.system(size: 11, weight: .medium)).foregroundStyle(teamAmberText)
            .lineLimit(1)
            .accessibilityHint(Loc.t("team.tafel.strittigTitel", lang))
    }
}

/// „2 Sessions in Klärung" unter der Liste (web Team.tsx Tafel); nichts bei 0.
struct TeamStrittigHinweis: View {
    let anzahl: Int
    let lang: String

    private var text: String {
        let key: String = anzahl == 1 ? "team.tafel.strittigHinweis1" : "team.tafel.strittigHinweis"
        return teamText(key, lang, ["n": String(anzahl)])
    }

    var body: some View {
        if anzahl > 0 {
            Text(text).font(.caption).foregroundStyle(teamAmberText).padding(.top, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Globale Events: Team-Wappen eines Fahrers (hoechstens zwei, leicht ueberlappend; web 8fc88474). Fester Platz, damit
/// die Namen buendig stehen; Tipp fuehrt zum Team.
struct TeamWappenSpalte: View {
    let teams: [TeamEventTeam]

    var body: some View {
        HStack(spacing: -8) {
            ForEach(Array(teams.prefix(2)), id: \.slug) { x in
                NavigationLink { TeamView(slug: x.slug) } label: {
                    TeamWappen(name: x.name, logo: x.logo_url, farbe: x.farbe, size: 20)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(x.name)
            }
        }
        .frame(width: 28, alignment: .leading)
    }
}
