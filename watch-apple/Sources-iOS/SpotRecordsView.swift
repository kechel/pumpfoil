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
func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
// Tageszeit-Rekorde: Sekunden seit Mitternacht (Spot-Ortszeit); Night Owl kann >24 h sein.
func hhmm(_ v: Double) -> String {
    let s = ((Int(v) % 86400) + 86400) % 86400
    return String(format: "%02d:%02d", s / 3600, (s % 3600) / 60)
}
return [
    row("rec.farthestRun", r?.distance) { "\(Int($0.rounded())) m" },
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
/// Zeitfenster wie im Web: erst zehn Tage, und wenn dort nichts steht, weiter auf 30 Tage, ein
/// Jahr, alles. Sobald der Nutzer selbst ein Fenster wählt, bleibt seine Wahl stehen. Gibt es in
/// KEINEM Fenster einen Rekord, verschwindet der Block ganz — eine Reihe „–" hilft niemandem.
struct SpotRecordsView: View {
    let spot: String
    let lang: String
    let accelOnly: Bool

    private static let fenster = ["10d", "30d", "365d", "all"]

    @State private var alle: [String: PeriodRecords] = [:]
    @State private var fensterWahl = "10d"
    @State private var selbstGewaehlt = false
    @State private var geladen = false

    private var zeilen: [RecRow] { rekordZeilen(alle[fensterWahl], lang: lang) }
    private var etwasDa: Bool {
        Self.fenster.contains { !rekordZeilen(alle[$0], lang: lang).allSatisfy { $0.entry == nil } }
    }

    var body: some View {
        Group {
            if geladen && etwasDa {
                Section {
                    Picker("", selection: $fensterWahl) {
                        ForEach(Self.fenster, id: \.self) { f in
                            Text(Loc.t("period.\(f)", lang)).tag(f)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: fensterWahl) { _ in selbstGewaehlt = true }

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
                } header: { Text(Loc.t("rec.spotTitle", lang)) }
            }
        }
        .task(id: accelOnly) {
            alle = (try? await Api.communityRecords(accelOnly: accelOnly, spot: spot)) ?? [:]
            geladen = true
            if !selbstGewaehlt {
                fensterWahl = Self.fenster.first {
                    !rekordZeilen(alle[$0], lang: lang).allSatisfy { $0.entry == nil }
                } ?? "all"
            }
        }
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
