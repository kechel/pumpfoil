import SwiftUI

/// Ein Foil im Einzelnen: die Community-Rekorde MIT DIESEM Flügel und alle Sessions, die damit
/// aufgezeichnet wurden — über alle Fahrer, nicht nur die eigenen.
///
/// Kam als Nutzer-Vorschlag (04.09.2026): „Why not make the foil model clickable, so clicking it
/// shows all sessions recorded with that specific front wing?" In der PWA gibt es die Seite seit
/// dem 04.09. (`/foil-stats/:foilId`); in den Apps fehlte sie — aufgefallen erst am 07.09., weil
/// `docs/PARITY-AUDIT.md` teils vom 17.08. war und ich mich auf die Erinnerung verlassen hatte.
///
/// Serverseitig brauchte es dafür keinen neuen Endpunkt: die Rekorde kennen das synthetische Band
/// `foil:<id>` (s. `community._band_filter`), die Sessionliste den Parameter `foil_id`.
struct FoilDetailView: View {
    let foil: FoilStat
    @AppStorage("appLang") private var lang = "de"

    @State private var records: [String: PeriodRecords] = [:]
    @State private var sessions: [CommunityItem] = []
    @State private var mehr = true
    @State private var laedt = false
    @State private var geladen = false

    private let seite = 20

    var body: some View {
        List {
            kopf

            Section {
                // Allzeit ist hier das richtige Fenster: bei einem einzelnen Flügel ist der Topf
                // klein, „heute" wäre fast immer leer. Ohne Zeitfenster-Auswahl, wie in der PWA.
                if !geladen {
                    Text(Loc.t("common.loading", lang)).font(.caption).foregroundStyle(.secondary)
                } else {
                    let zeilen = rekordZeilen(records["all"], lang: lang)
                    if zeilen.allSatisfy({ $0.entry == nil }) {
                        Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
                    } else {
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
                    }
                }
            } header: { Text(Loc.t("foilDetail.records", lang)) }

            Section {
                if sessions.isEmpty && geladen {
                    Text(Loc.t("foilDetail.none", lang)).foregroundStyle(.secondary)
                }
                ForEach(sessions) { c in
                    NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                }
                // Fühler zum Nachladen: liegt immer im Baum, damit er beim ersten Zeichnen
                // schon da ist (dieselbe Mechanik wie in der Sessionliste).
                if mehr {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .task { await seiteHolen() }
                }
            } header: { Text(Loc.t("foilDetail.sessions", lang)) }
        }
        .listStyle(.insetGrouped)
        .brandToolbar(name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            // Rekorde bewusst mit accel_only=false: bei einem einzelnen Foil ist der Topf klein,
            // und ein GPS-only-Lauf ist hier immer noch die beste bekannte Marke.
            records = (try? await Api.communityRecords(accelOnly: false,
                                                       foilBand: "foil:\(foil.foil_id)")) ?? [:]
            geladen = true
        }
    }

    private var name: String {
        [foil.brand, foil.model, foil.size].filter { !$0.isEmpty }.joined(separator: " ")
    }

    @ViewBuilder private var kopf: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.headline)
                HStack(spacing: 6) {
                    if let ar = foil.aspect_ratio {
                        Text("AR \(String(format: "%.1f", ar))").font(.caption).foregroundStyle(.secondary)
                    }
                    Text(Loc.t("foilDetail.community", lang)
                        .replacingOccurrences(of: "{sessions}", with: String(foil.sessions))
                        .replacingOccurrences(of: "{users}", with: String(foil.users)))
                        .font(.caption).foregroundStyle(.secondary)
                }
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

    private func seiteHolen() async {
        if laedt || !mehr { return }
        laedt = true
        defer { laedt = false }
        // ALLE Fahrer, nicht nur die eigenen: der Vorschlag lautete „all sessions recorded with
        // that specific front wing", und die eigene Liste ist bei fremden Foils leer.
        let teil = (try? await Api.communitySessions(limit: seite, offset: sessions.count,
                                                     accelOnly: false, foilId: foil.foil_id,
                                                     sport: "pumpfoil")) ?? []
        sessions += teil
        mehr = teil.count == seite
    }
}
