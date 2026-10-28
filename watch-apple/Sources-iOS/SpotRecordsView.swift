import SwiftUI

// Rekorde EINES Spots — und die Datenlogik, die sich die Community-Ansicht mit dieser hier teilt.
//
// Warum es die Datei gibt (Jan, 07.09.2026): auf der Spot-Seite fehlten die Rekorde ganz, obwohl
// die PWA sie seit dem 06.09. ganz oben zeigt. Die Community-Ansicht hat ein Rekord-Raster, das
// aber an ihren eigenen Navigationspfad und ihre Avatar-/Track-Helfer gebunden ist. Geteilt wird
// deshalb die DATENLOGIK (welche zwölf Kacheln, wie formatiert), nicht die Darstellung.

/// Eine Rekord-Kachel. Die `id` MUSS stabil sein: `rekordZeilen()` läuft bei jedem Neuzeichnen,
/// mit `UUID()` bekam jede Zeile eine neue Identität — SwiftUI hat die Navigationsziele darunter
/// dann verworfen und neu aufgebaut, und eine laufende Navigation landete irgendwo (Jans Befund,
/// mehrfach). Der Metrik-Schlüssel ist stabil und eindeutig, also ist er die Identität.
struct RecRow: Identifiable {
    let id: String
    let label: String
    let value: String
    let entry: CommunityRecordEntry?
}



/// Rekorde je Sportart (20.10.2026, wie PWA SPORT_REC): welche Zusatz-Kacheln zu welcher Sportart gehoeren.
// Der Rekord-SATZ kommt aus der Server-Liste (Feld `rekorde`, SportClass.swift `Sportarten`, 25.10.2026), welche Kacheln
// zu einem Satz gehoeren, steht hier. Ozeanwelle hat keinen Server-Satz, aber eigene Kacheln.
let REK_SAETZE: [String: [String]] = [
    "wind": ["jibe_quote", "tack_quote", "vmg_best", "upwind_m", "jibes_foil", "ride_longest", "ride_farthest"],
    "wind_ohne_foil": ["vmg_best", "upwind_m", "ride_longest", "ride_farthest"],
    "sup": ["paddle_success", "paddle_quote", "paddle_foil_longest"],
    "paddel": ["ride_longest", "ride_farthest"],
    "wake": ["wake_longest", "wake_time"],
    "downwind": ["dw_ab", "dw_ab_speed"],
]
func sportRek(_ sport: String?) -> [String] {
    if sport == "surf_wave" { return ["waves", "wave_longest"] }
    guard let satz = Sportarten.eintrag(sport)?.rekorde else { return [] }
    return REK_SAETZE[satz] ?? []
}

/// Eine Zusatz-Kachel je Sportart: Eintrag, Label und Format. In Schritten (Type-Checker).
func sportRekordZeile(_ key: String, _ r: PeriodRecords, lang: String) -> RecRow? {
    let e: CommunityRecordEntry?
    let label: String
    let fmt: (Double) -> String
    let km: (Double) -> String = { String(format: "%.1f km", $0 / 1000.0) }
    let pct: (Double) -> String = { "\(Int(($0 * 100).rounded())) %" }
    let anz: (Double) -> String = { "\(Int($0.rounded()))" }
    let kmh: (Double) -> String = { String(format: "%.1f km/h", $0) }
    let dauer: (Double) -> String = { fmtLaufDauer($0) }
    switch key {
    case "jibe_quote": e = r.jibe_quote; label = "rec.jibeQuote"; fmt = pct
    case "tack_quote": e = r.tack_quote; label = "rec.tackQuote"; fmt = pct
    case "vmg_best": e = r.vmg_best; label = "rec.vmgBest"; fmt = kmh
    case "upwind_m": e = r.upwind_m; label = "rec.upwind"; fmt = km
    case "jibes_foil": e = r.jibes_foil; label = "rec.jibesFoil"; fmt = anz
    case "ride_longest": e = r.ride_longest; label = "rec.rideLongest"; fmt = dauer
    case "ride_farthest": e = r.ride_farthest; label = "rec.rideFarthest"; fmt = km
    case "paddle_success": e = r.paddle_success; label = "rec.paddleSuccess"; fmt = anz
    case "paddle_quote": e = r.paddle_quote; label = "rec.paddleQuote"; fmt = pct
    case "paddle_foil_longest": e = r.paddle_foil_longest; label = "rec.paddleFoilLongest"; fmt = dauer
    case "wake_longest": e = r.wake_longest; label = "rec.wakeLongest"; fmt = dauer
    case "wake_time": e = r.wake_time; label = "rec.wakeTime"; fmt = dauer
    case "dw_ab": e = r.dw_ab; label = "rec.dwAb"; fmt = km
    case "dw_ab_speed": e = r.dw_ab_speed; label = "rec.dwAbSpeed"; fmt = kmh
    case "waves": e = r.waves; label = "rec.waves"; fmt = anz
    case "wave_longest": e = r.wave_longest; label = "rec.waveLongest"; fmt = dauer
    default: return nil
    }
    let da: Bool = e?.session_id != nil && (e?.value ?? 0) > 0
    var text: String = da ? fmt(e?.value ?? 0) : "–"
    if da, let n = e?.anzahl {   // Quoten mit Anzahl („100 % von 146", 20.10.2026)
        text = Loc.t("rec.ofN", lang).replacingOccurrences(of: "{p}", with: text).replacingOccurrences(of: "{n}", with: String(n))
    }
    return RecRow(id: key, label: Loc.t(label, lang), value: text, entry: da ? e : nil)
}

func sportRekordZeilen(_ r: PeriodRecords?, lang: String, sport: String?) -> [RecRow] {
    guard let r = r else { return [] }
    let keys: [String] = sportRek(sport)
    return keys.compactMap { sportRekordZeile($0, r, lang: lang) }
}

/// Eigene Bestwerte je Sportart, eine abgesetzte Zeile je Sportart (Home + Foiler-Seite, 20.10.2026).
/// Kacheln als NavigationLink(value:) — Home und Foiler-Seite registrieren SessionDest.
struct SportRekordeZeilenView: View {
    let zeilen: [SportRekordeZeile]
    let titel: String
    let lang: String
    private let spalten = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titel).font(.headline)
            ForEach(zeilen, id: \.sport) { z in zeile(z) }
        }
    }

    private func zeile(_ z: SportRekordeZeile) -> some View {
        let rows: [RecRow] = sportRekordZeilen(periode(z.rekorde), lang: lang, sport: z.sport).filter { $0.entry != nil }
        return VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("cls.sport.\(z.sport)", lang)).font(.subheadline)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(Color.orange.opacity(0.2)).foregroundStyle(.orange)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            LazyVGrid(columns: spalten, spacing: 8) {
                ForEach(rows) { t in kachel(t) }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
    }

    @ViewBuilder private func kachel(_ t: RecRow) -> some View {
        let inhalt = VStack(alignment: .leading, spacing: 3) {
            Text(t.value).font(.title3).bold().foregroundStyle(Color.accentColor).lineLimit(1)
            Text(t.label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            if let e = t.entry {
                let sub: String = [TimeFmt.shortDate(e.started_at, e.tz), e.spot].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !sub.isEmpty { Text(sub).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        if let sid = t.entry?.session_id {
            NavigationLink(value: SessionDest(id: sid)) { inhalt }.buttonStyle(.plain)
        } else {
            inhalt
        }
    }

    private func periode(_ m: [String: CommunityRecordEntry]) -> PeriodRecords {
        var p = PeriodRecords(distance: nil, duration: nil, speed: nil, glide: nil, runs: nil,
                              session_distance: nil, session_time: nil, session_pumps: nil,
                              max_hr: nil, early_bird: nil, night_owl: nil, carves180: nil)
        p.jibe_quote = m["jibe_quote"]; p.tack_quote = m["tack_quote"]; p.vmg_best = m["vmg_best"]
        p.upwind_m = m["upwind_m"]; p.jibes_foil = m["jibes_foil"]; p.ride_longest = m["ride_longest"]
        p.ride_farthest = m["ride_farthest"]; p.paddle_success = m["paddle_success"]; p.paddle_quote = m["paddle_quote"]
        p.paddle_foil_longest = m["paddle_foil_longest"]; p.wake_longest = m["wake_longest"]; p.wake_time = m["wake_time"]
        p.dw_ab = m["dw_ab"]; p.dw_ab_speed = m["dw_ab_speed"]; p.waves = m["waves"]; p.wave_longest = m["wave_longest"]
        return p
    }
}

func rekordZeilen(_ r: PeriodRecords?, lang: String, sport: String? = nil) -> [RecRow] {
// `ohneSession`: der Rekord gehoert einem NUTZER, nicht einer Session (bisher nur
// „Meiste Carves >180°"). Dann reicht der WERT — ohne dieses Kennzeichen fiele die Kachel
// durch die session_id-Pruefung und stuende dauerhaft auf „–".
func ok(_ e: CommunityRecordEntry?, _ ohneSession: Bool = false) -> Bool {
    (ohneSession || e?.session_id != nil) && (e?.value ?? 0) > 0
}
func row(_ key: String, _ e: CommunityRecordEntry?, ohneSession: Bool = false,
         _ fmt: (Double) -> String) -> RecRow {
    let da = ok(e, ohneSession)
    return RecRow(id: key, label: Loc.t(key, lang), value: da ? fmt(e!.value ?? 0) : "–",
                  entry: da ? e : nil)
}
func dur(_ s: Double) -> String { fmtLaufDauer(s) }
// Tageszeit-Rekorde: Sekunden seit Mitternacht (Spot-Ortszeit); Night Owl kann >24 h sein.
func hhmm(_ v: Double) -> String {
    let s = ((Int(v) % 86400) + 86400) % 86400
    return String(format: "%02d:%02d", s / 3600, (s % 3600) / 60)
}
// Rekord-Arten je Sportart wie im Web (19.10.2026): Wind mit laengster Fahrt zuerst, ohne Gleit-,
// Pump-, Laufzahl- und Carve-Rekorde; Motor ohne Gleit-/Pump-Rekorde; sonst wie bisher.
let wind: Bool = Sportarten.windArtig(sport)
let motor: Bool = Sportarten.motor(sport)
let ohne: Set<String> = wind ? ["rec.longestGlide", "rec.sessionPumps", "rec.mostRuns", "rec.carves180"]
    : (motor ? ["rec.longestGlide", "rec.sessionPumps"] : [])
let kopf: [RecRow] = wind ? [row("rec.sessionTotal", r?.session_total) { String(format: "%.1f km", $0 / 1000.0) }] : []
let alle: [RecRow] = [
    row("rec.farthestRun", r?.distance) { meterOderKm($0) },
    row("rec.longestRun", r?.duration) { dur($0) },
    row("rec.topSpeed", r?.speed) { String(format: "%.1f km/h", $0 * 3.6) },
    row("rec.longestGlide", r?.glide) { String(format: "%.1f s", $0) },
    row("rec.mostRuns", r?.runs) { "\(Int($0))" },
    row("rec.sessionDistance", r?.session_distance) { String(format: "%.1f km", $0 / 1000.0) },
    row("rec.sessionTime", r?.session_time) { "\(Int(($0 / 60).rounded())) min" },
    row("rec.sessionPumps", r?.session_pumps) { "\(Int($0.rounded()))" },
    row("rec.maxHr", r?.max_hr) { "\(Int($0.rounded())) bpm" },
    row("rec.earlyBird", r?.early_bird) { hhmm($0) },
    row("rec.nightOwl", r?.night_owl) { hhmm($0) },
    row("rec.carves180", r?.carves180, ohneSession: true) { "\(Int($0.rounded()))" },
]
// In Schritten statt in einem Ausdruck: der Type-Checker haengt sich sonst gern auf (Memory ios-swift-typecheck-hang).
let gefiltert: [RecRow] = alle.filter { !ohne.contains($0.id) }
// Rekorde je Sportart ans Ende (20.10.2026).
let zusatz: [RecRow] = sportRekordZeilen(r, lang: lang, sport: sport)
return kopf + gefiltert + zusatz
}


/// Die Rekorde dieses Spots, ganz oben auf der Spot-Seite — wie in der PWA seit dem 06.09.2026.
///
/// JE SPORTART (PWA a9725cb9, 29.09.2026; Anlass: ein Nutzer vermisste seine Foil-Scoot-Rekorde am
/// Spot, abgefragt wurde fest Pumpfoil). Folgt dem Sportarten-Filter der Seite: eine Sportart
/// gewaehlt -> nur deren Rekorde; „alle Sportarten" -> EIN Kasten mit Umschalter je Sportart (seit
/// 28.10.2026, vorher ein Kasten je Sportart untereinander), nie ein gemischter
/// — ein Foil-Scoot-Tempo gegen ein Pumpfoil-Tempo waere kein Rekord. Kaesten ohne Rekord fallen
/// weg. Gibt es in KEINEM Kasten einen Rekord, steht EIN Hinweis da (s. unten, warum nicht nichts).
struct SpotRecordsView: View {
    let spot: String
    let lang: String
    let accelOnly: Bool
    /// Sportart-Filter der Seite: "all" = je Sportart ein Kasten.
    var sport: String = "all"
    /// Sportarten fuer „alle" (Server /api/community/sports). Leer -> nur Pumpfoil, wie die PWA.
    var sports: [String] = []
    /// Meldet die gezeigte Sportart (nil = kein Kasten) — die Heatmap der Seite folgt ihr (28.10.2026).
    var onAktiv: (String?) -> Void = { _ in }

    /// Sportarten-Filter der Seite setzen (Knopf „Alle" = "all").
    var onSport: (String) -> Void = { _ in }

    private var gezeigt: String? {
        guard geladen, mitRekorden.contains(aktiv) || sport != "all" else { return nil }
        return aktiv
    }

    @State private var jeSportart: [String: [String: PeriodRecords]] = [:]
    @State private var geladen = false
    @State private var ladeStand = 0     // zaehlt Abrufe; die Kaesten waehlen danach ihr Fenster neu
    // Fuer welchen Schluessel schon geladen wird/wurde. NOETIG: eine `Group` gibt ihre Modifier an
    // JEDES Kind weiter — bei drei Sportart-Kaesten liefe `.task` dreimal, und jeder neu
    // erscheinende Kasten stiesse es erneut an. Der erste Lauf je Schluessel gewinnt.
    @State private var geladenFuer: String?

    /// IMMER alle Sportarten abfragen, nicht nur die gewaehlte — die Knopfzeile ist der Filter der
    /// ganzen Spot-Seite und muss nach einem Klick weiter alle Sportarten mit Rekord kennen.
    private var liste: [String] {
        sports.isEmpty ? ["pumpfoil"] : sports
    }

    /// Neu laden, sobald sich Spot, Filter oder die Liste der Sportarten aendert.
    private var ladeSchluessel: String {
        let teile: [String] = [spot, String(accelOnly)] + liste
        return teile.joined(separator: "|")
    }

    /// Angezeigte Sportart: Filter der Seite, bei „alle" Pumpfoil, sonst die erste mit Rekord.
    private var aktiv: String {
        if sport != "all" { return sport }
        let mit: [String] = mitRekorden
        if mit.contains("pumpfoil") { return "pumpfoil" }
        return mit.first ?? "pumpfoil"
    }

    /// Knoepfe: Sportarten mit Rekord, dazu eine gewaehlte ohne Rekord (sonst kaeme man nicht zurueck).
    private var knoepfe: [String] {
        let mit: [String] = mitRekorden
        return sport != "all" && !mit.contains(sport) ? mit + [sport] : mit
    }

    private var mitRekorden: [String] {
        liste.filter { SpotRecordsKasten.hatRekorde(jeSportart[$0], lang: lang, sport: $0) }
    }

    var body: some View {
        Group {
            // Solange nichts geladen ist, steht hier ein Platzhalter — und wenn geladen wurde,
            // aber nichts drin ist, sagt die Ansicht das AUCH. Vorher gab sie in beiden Faellen
            // gar nichts aus, und damit war nicht unterscheidbar, ob der Abruf scheitert, ob es
            // keine Rekorde gibt oder ob die Ansicht nie gebaut wird (Jan, 07.09.: „keine
            // rekorde" bei frischem Build, waehrend der Server 11 Kacheln liefert). Ausserdem
            // haengt `.task` hier: ohne sichtbaren Inhalt liefe es nicht zuverlaessig
            // (Memory swiftui-leere-group-laedt-nicht).
            if !geladen {
                Section { Text(Loc.t("common.loading", lang)).font(.caption).foregroundStyle(.secondary) }
                    header: { Text(Loc.t("rec.spotTitle", lang)) }
            } else if mitRekorden.isEmpty && sport == "all" {
                Section { Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary) }
                    header: { Text(Loc.t("rec.spotTitle", lang)) }
            } else {
                // EIN Kasten fuer EINE Sportart (Jan, 28.10.2026; wie PWA/Android). Die Knoepfe sind der
                // Sportarten-Filter der ganzen Spot-Seite: „Alle" + Sportarten mit Rekord; ein Knopf setzt
                // `sport` der Seite (Liste, Rekorde, Heatmap). `.id` setzt das Zeitfenster neu.
                SpotRecordsKasten(sport: aktiv, alle: jeSportart[aktiv] ?? [:], lang: lang, ladeStand: ladeStand,
                                  // Keine Knoepfe mehr IM Kasten: sie stehen als Filter der Seite darueber (SpotSportKnoepfe).
                                  sportWahl: [],
                                  gewaehlt: sport, onSport: onSport)
                    .id(aktiv)
            }
        }
        .task(id: ladeSchluessel) { await laden() }
        .onChange(of: gezeigt) { neu in onAktiv(neu) }
    }

    /// Alle Sportarten nebeneinander abfragen; eine gescheiterte zaehlt als „keine Rekorde".
    private func laden() async {
        let schluessel: String = ladeSchluessel
        guard geladenFuer != schluessel else { return }
        geladenFuer = schluessel
        let spot: String = self.spot
        let only: Bool = accelOnly
        var neu: [String: [String: PeriodRecords]] = [:]
        await withTaskGroup(of: (String, [String: PeriodRecords]).self) { gruppe in
            for s in liste {
                gruppe.addTask {
                    let r = (try? await Api.communityRecords(accelOnly: only, spot: spot, sport: s)) ?? [:]
                    return (s, r)
                }
            }
            for await (s, r) in gruppe { neu[s] = r }
        }
        // Ein ueberholter Lauf darf nichts mehr schreiben: kommt die Sportartenliste nach dem ersten
        // Laden, startet `.task(id:)` neu und bricht den alten ab — dessen Abrufe scheitern dann
        // (try? -> leer), und kam er NACH dem neuen an, stand „keine Rekorde" da (Jan, 28.10.2026).
        guard geladenFuer == schluessel, !Task.isCancelled else { return }
        jeSportart = neu
        geladen = true
        ladeStand += 1
    }
}

/// Ein Kasten „Rekorde an diesem Spot · <Sportart>". Zeitfenster wie im Web: erst zehn Tage, und
/// wenn dort nichts steht, weiter auf 30 Tage, ein Jahr, alles. Sobald der Nutzer selbst ein
/// Fenster waehlt, bleibt seine Wahl stehen.
struct SpotRecordsKasten: View {
    let sport: String
    let alle: [String: PeriodRecords]
    let lang: String
    let ladeStand: Int
    /// Knoepfe des Sportarten-Filters der Seite, "all" = alle (leer = keine Knopfzeile).
    var sportWahl: [String] = []
    /// Gewaehlter Filter der Seite (hervorgehobener Knopf).
    var gewaehlt: String = "all"
    var onSport: (String) -> Void = { _ in }

    static let fenster = ["10d", "30d", "365d", "all"]

    @State private var fensterWahl = "10d"
    @State private var selbstGewaehlt = false

    static func hatRekorde(_ alle: [String: PeriodRecords]?, lang: String, sport: String) -> Bool {
        guard let alle else { return false }
        return fenster.contains { !rekordZeilen(alle[$0], lang: lang, sport: sport).allSatisfy { $0.entry == nil } }
    }

    // Nur Kacheln mit Rekord, keine Reihen aus „–" (Jan, 28.10.2026; wie PWA/Android). Hat das
    // Zeitfenster gar keinen, bleiben die „–"-Kacheln statt einer leeren Flaeche.
    private var zeilen: [RecRow] {
        let alleZeilen: [RecRow] = rekordZeilen(alle[fensterWahl], lang: lang, sport: sport)
        let belegt: [RecRow] = alleZeilen.filter { $0.entry != nil }
        return belegt.isEmpty ? alleZeilen : belegt
    }

    private var titel: String {
        let t: String = Loc.t("rec.spotTitle", lang)
        return t + " · " + Loc.t("cls.sport.\(sport)", lang)
    }

    // Eigene Wahl merken — ueber das Binding statt `.onChange(of:)`, das auch beim automatischen
    // Setzen feuerte und die Automatik damit nach dem ersten Laden abschaltete.
    private var wahl: Binding<String> {
        Binding(get: { fensterWahl }, set: { fensterWahl = $0; selbstGewaehlt = true })
    }

    var body: some View {
        Section {
            if !sportWahl.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(sportWahl, id: \.self) { s in
                            sportKnopf(s)
                        }
                    }
                }
            }
            Picker("", selection: wahl) {
                ForEach(Self.fenster, id: \.self) { f in
                    Text(Loc.t("period.\(f)", lang)).tag(f)
                }
            }
            .pickerStyle(.segmented)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(zeilen) { z in
                    if let sid = z.entry?.session_id {
                        NavigationLink { SessionDetailView(id: sid) } label: { kachel(z) }
                            .buttonStyle(.plain)
                    } else {
                        kachel(z)
                    }
                }
            }
        } header: { Text(titel) }
        .task(id: ladeStand) { ersteFensterWahl() }
    }

    private func ersteFensterWahl() {
        guard !selbstGewaehlt else { return }
        fensterWahl = Self.fenster.first {
            !rekordZeilen(alle[$0], lang: lang, sport: sport).allSatisfy { $0.entry == nil }
        } ?? "all"
    }

    private func sportKnopf(_ s: String) -> some View {
        let an: Bool = s == gewaehlt
        let text: String = s == "all" ? Loc.t("all.allSports", lang) : Loc.t("cls.sport.\(s)", lang)
        return Button { onSport(s) } label: {
            Text(text).font(.subheadline)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .foregroundStyle(an ? Color.black : Color.primary)
                .background(an ? Color.accentColor : Color(.secondarySystemBackground))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func kachel(_ z: RecRow) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(z.value).font(.title3).bold().foregroundStyle(Color.accentColor).lineLimit(1)
            Text(z.label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            if let n = z.entry?.name, !n.isEmpty {
                Text(n).font(.caption).foregroundStyle(Color.accentColor).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}


/// Sportart von Rekorden und Heatmap der Spot-Seite: der Filter, bei „Alle" Pumpfoil, sonst die erste des Spots.
func rekordSportFuer(_ sport: String, _ spotSports: [String]) -> String? {
    if sport != "all" { return sport }
    if spotSports.contains("pumpfoil") { return "pumpfoil" }
    return spotSports.first
}

/// Sportart-Knoepfe = Filter der ganzen Spot-Seite (Liste, Rekorde, Heatmap), UEBER der Rekord-Ueberschrift
/// (Jan, 28.10.2026: „die buttons sind ja jetzt die generellen filter"). „Alle" + die Sportarten dieses Spots
/// (Server /api/community/sports?spot=); eine per Spot-Karte gewaehlte ohne Session hier steht trotzdem da,
/// sonst kaeme man nicht zurueck. Bei nur einer Sportart und ohne Filter: keine Knoepfe.
struct SpotSportKnoepfe: View {
    let spotSports: [String]
    let sport: String
    let lang: String
    let onSport: (String) -> Void

    private var knoepfe: [String] {
        let extra: [String] = sport != "all" && !spotSports.contains(sport) ? [sport] : []
        return spotSports + extra
    }

    var body: some View {
        if knoepfe.count > 1 || sport != "all" {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(["all"] + knoepfe, id: \.self) { s in knopf(s) }
                }
            }
        }
    }

    private func knopf(_ s: String) -> some View {
        let an: Bool = s == sport
        let text: String = s == "all" ? Loc.t("all.allSports", lang) : Loc.t("cls.sport.\(s)", lang)
        return Button { onSport(s) } label: {
            Text(text).font(.subheadline)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .foregroundStyle(an ? Color.black : Color.primary)
                .background(an ? Color.accentColor : Color(.secondarySystemBackground))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
