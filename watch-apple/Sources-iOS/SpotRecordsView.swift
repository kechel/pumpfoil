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



func rekordZeilen(_ r: PeriodRecords?, lang: String) -> [RecRow] {
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
return [
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
}


/// Die Rekorde dieses Spots, ganz oben auf der Spot-Seite — wie in der PWA seit dem 06.09.2026.
///
/// JE SPORTART (PWA a9725cb9, 29.09.2026; Anlass: ein Nutzer vermisste seine Foil-Scoot-Rekorde am
/// Spot, abgefragt wurde fest Pumpfoil). Folgt dem Sportarten-Filter der Seite: eine Sportart
/// gewaehlt -> nur deren Rekorde; „alle Sportarten" -> ein Kasten JE Sportart, nicht ein gemischter
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

    @State private var jeSportart: [String: [String: PeriodRecords]] = [:]
    @State private var geladen = false
    @State private var ladeStand = 0     // zaehlt Abrufe; die Kaesten waehlen danach ihr Fenster neu
    // Fuer welchen Schluessel schon geladen wird/wurde. NOETIG: eine `Group` gibt ihre Modifier an
    // JEDES Kind weiter — bei drei Sportart-Kaesten liefe `.task` dreimal, und jeder neu
    // erscheinende Kasten stiesse es erneut an. Der erste Lauf je Schluessel gewinnt.
    @State private var geladenFuer: String?

    private var liste: [String] {
        if sport != "all" { return [sport] }
        return sports.isEmpty ? ["pumpfoil"] : sports
    }

    /// Neu laden, sobald sich Spot, Filter oder die Liste der Sportarten aendert.
    private var ladeSchluessel: String {
        let teile: [String] = [spot, String(accelOnly)] + liste
        return teile.joined(separator: "|")
    }

    private var mitRekorden: [String] {
        liste.filter { SpotRecordsKasten.hatRekorde(jeSportart[$0], lang: lang) }
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
            } else if mitRekorden.isEmpty {
                Section { Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary) }
                    header: { Text(Loc.t("rec.spotTitle", lang)) }
            } else {
                ForEach(mitRekorden, id: \.self) { s in
                    SpotRecordsKasten(sport: s, alle: jeSportart[s] ?? [:], lang: lang, ladeStand: ladeStand)
                }
            }
        }
        .task(id: ladeSchluessel) { await laden() }
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

    static let fenster = ["10d", "30d", "365d", "all"]

    @State private var fensterWahl = "10d"
    @State private var selbstGewaehlt = false

    static func hatRekorde(_ alle: [String: PeriodRecords]?, lang: String) -> Bool {
        guard let alle else { return false }
        return fenster.contains { !rekordZeilen(alle[$0], lang: lang).allSatisfy { $0.entry == nil } }
    }

    private var zeilen: [RecRow] { rekordZeilen(alle[fensterWahl], lang: lang) }

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
            !rekordZeilen(alle[$0], lang: lang).allSatisfy { $0.entry == nil }
        } ?? "all"
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
