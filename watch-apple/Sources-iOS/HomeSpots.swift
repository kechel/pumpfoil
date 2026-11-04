import SwiftUI

// Home › Spots (App-Port Phase 4, docs/UX-IA.md, 04.11.2026), wie `SpotsBereich`/`MeineSpots` in
// web/src/pages/PersonalHome.tsx: zweite Zeile = die eigenen Spots (Homespot zuerst mit Haus-Symbol, dann zuletzt
// besuchte), waagrecht wischbar, „Alle (n)" rechts immer sichtbar. Ein Spot -> darunter dessen Reiter (dieselbe Ansicht
// wie die Spot-Seite, `SpotSessionsView(eingebettet: true)`); „Alle" -> Kacheln je Spot. Ein Kachel-Tipp waehlt den Spot
// in der Zeile und bleibt in der Ansicht.

/// Ein Spot mit eigenen Sessions (GET /api/sessions/my-spots-stats), zuletzt besuchte zuerst. Gezaehlt am Server wie die
/// Spot-Liste des Verlaufs; Pumps zaehlt er nur bei Sessions MIT Foil.
struct MeinSpot: Decodable, Identifiable {
    let spot_id: Int
    let name: String?
    var water: String? = nil
    let sessions: Int
    var first: String? = nil
    var last: String? = nil
    var time_s: Double = 0
    var distance_m: Double = 0
    var runs: Int = 0
    var pumps: Int = 0
    var sports: [String] = []
    var foil_sessions: Int = 0
    var id: Int { spot_id }
}

extension Api {
    static func mySpotsStats() async throws -> [MeinSpot] {
        try await request("/api/sessions/my-spots-stats", method: "GET", body: nil, auth: true)
    }
}

struct HomeSpotsBereich: View {
    let lang: String
    /// nil = laedt noch.
    let liste: [MeinSpot]?
    /// Homespot (Name, `homespot_effective`); seine id kommt aus der Liste.
    let homespotName: String?

    // Gewaehlter Spot fuer die App-Sitzung ("alle" = Kacheln), wie `?spot=` im Web.
    @State private var wahl: String = ReiterSpeicher.von("homeSpotWahl", "")

    private struct SpotPille: Identifiable {
        let id: Int
        let name: String
        let home: Bool
    }

    private var homespotId: Int? {
        guard let h = homespotName, !h.isEmpty else { return nil }
        return (liste ?? []).first { $0.name == h }?.spot_id
    }

    /// Homespot zuerst, dann die Liste in Server-Reihenfolge (zuletzt besucht).
    private var pillen: [SpotPille] {
        var out: [SpotPille] = []
        let hid: Int? = homespotId
        if let hid, let h = (liste ?? []).first(where: { $0.spot_id == hid }) {
            out.append(SpotPille(id: hid, name: h.name ?? "—", home: true))
        }
        for x in liste ?? [] where x.spot_id != hid {
            out.append(SpotPille(id: x.spot_id, name: x.name ?? "—", home: false))
        }
        return out
    }

    /// Gemerkte Wahl, wenn es sie noch gibt; sonst der erste Spot (Homespot), ohne Spots „alle".
    private var aktiv: String {
        let p: [SpotPille] = pillen
        if wahl == "alle" || p.contains(where: { String($0.id) == wahl }) { return wahl }
        return p.first.map { String($0.id) } ?? "alle"
    }

    private func waehlen(_ id: String) {
        wahl = id
        ReiterSpeicher.setze("homeSpotWahl", id)
    }

    var body: some View {
        if let l = liste {
            VStack(alignment: .leading, spacing: 12) {
                spotZeile(l.count)
                inhalt(l)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(.top, 20)
        }
    }

    @ViewBuilder private func inhalt(_ l: [MeinSpot]) -> some View {
        let a: String = aktiv
        if let p = pillen.first(where: { String($0.id) == a }) {
            SpotSessionsView(spot: p.name, vorgegebeneSpotId: p.id, eingebettet: true)
                .id(p.id)
        } else {
            MeineSpotsKacheln(liste: l, homespotId: homespotId, lang: lang) { waehlen(String($0)) }
        }
    }

    // MARK: - Spotzeile

    private func spotZeile(_ anzahl: Int) -> some View {
        HStack(spacing: 4) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(pillen) { p in pille(p) }
                    }
                }
                .onChange(of: aktiv) { neu in withAnimation { proxy.scrollTo(neu, anchor: .center) } }
                .onAppear { proxy.scrollTo(aktiv, anchor: .center) }
            }
            alleKnopf(anzahl)
        }
        .padding(6)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }

    private func pille(_ p: SpotPille) -> some View {
        let an: Bool = String(p.id) == aktiv
        return Button { waehlen(String(p.id)) } label: {
            HStack(spacing: 4) {
                Image(systemName: p.home ? "house.fill" : "mappin.and.ellipse")
                    .font(.caption).foregroundStyle(Color.accentColor)
                Text(p.name).font(.subheadline).fontWeight(an ? .semibold : .regular).lineLimit(1)
                    .foregroundStyle(an ? Color.primary : Color.secondary)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(an ? Color(.systemBackground) : Color.clear))
        }
        .buttonStyle(.plain)
        .id(String(p.id))
    }

    private func alleKnopf(_ anzahl: Int) -> some View {
        let an: Bool = aktiv == "alle"
        let text: String = Loc.t("mySpots.all", lang).replacingOccurrences(of: "{n}", with: String(anzahl))
        return Button { waehlen("alle") } label: {
            Text(text).font(.subheadline).fontWeight(an ? .semibold : .regular).lineLimit(1)
                .foregroundStyle(an ? Color.primary : Color.secondary)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(an ? Color(.systemBackground) : Color.clear))
        }
        .buttonStyle(.plain)
        .fixedSize()
    }
}

// MARK: - „Alle": Kacheln je Spot

/// Kacheln je Spot (web `MeineSpots`): Sessions, zuletzt/seit, On-Foil-Zeit/-Strecke nur bei Sessions MIT Foil, Laeufe,
/// Pumps nur > 0, Sportarten als letztes Feld nur, wenn eine vom eigenen Standard abweicht. Homespot mit Rand + Plakette.
struct MeineSpotsKacheln: View {
    let liste: [MeinSpot]
    let homespotId: Int?
    let lang: String
    let onWahl: (Int) -> Void

    private let spalten = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    private struct Zahl: Identifiable {
        let id: String
        let wert: String
    }

    var body: some View {
        if liste.isEmpty {
            Text(Loc.t("mySpots.empty", lang)).font(.subheadline).foregroundStyle(.secondary)
        } else {
            VStack(spacing: 8) {
                ForEach(liste) { sp in
                    Button { onWahl(sp.spot_id) } label: { kachel(sp) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func kachel(_ sp: MeinSpot) -> some View {
        let home: Bool = sp.spot_id == homespotId
        return VStack(alignment: .leading, spacing: 6) {
            kopf(sp, home: home)
            Text(unterzeile(sp)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            LazyVGrid(columns: spalten, alignment: .leading, spacing: 6) {
                ForEach(zahlen(sp)) { z in zelle(z.wert, z.id) }
                if let st = sportText(sp) { zelle(st, Loc.t("mySpots.sports", lang)) }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(home ? Color.accentColor : Color.clear, lineWidth: 1))
        .contentShape(Rectangle())
    }

    private func kopf(_ sp: MeinSpot, home: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "mappin.and.ellipse").font(.caption).foregroundStyle(Color.accentColor)
            Text(sp.name ?? "—").font(.subheadline.weight(.semibold)).lineLimit(1)
            if home {
                Text(Loc.t("foiler.homespot", lang)).font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(red: 0x02 / 255, green: 0x06 / 255, blue: 0x17 / 255))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Capsule().fill(Color.accentColor))
            }
            Spacer(minLength: 0)
        }
    }

    private func zelle(_ wert: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(wert).font(.subheadline.weight(.bold)).foregroundStyle(Color.accentColor).lineLimit(1)
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    private func zahlen(_ sp: MeinSpot) -> [Zahl] {
        var z: [Zahl] = [Zahl(id: Loc.t("team.stat.sessions", lang), wert: String(sp.sessions))]
        // On-Foil-Zahlen nur, wenn es am Spot Sessions MIT Foil gibt (04.11.2026; Pumps zaehlt der Server nur dort).
        if sp.foil_sessions > 0 {
            z.append(Zahl(id: Loc.t("team.stat.zeit", lang), wert: zeitText(sp.time_s)))
            z.append(Zahl(id: Loc.t("team.stat.strecke", lang), wert: kmText(sp.distance_m)))
        }
        z.append(Zahl(id: Loc.t("team.stat.laeufe", lang), wert: String(sp.runs)))
        if sp.pumps > 0 { z.append(Zahl(id: Loc.t("team.stat.pumps", lang), wert: String(sp.pumps))) }
        return z
    }

    /// Gewaesser (wenn anders als der Name) · zuletzt · seit.
    private func unterzeile(_ sp: MeinSpot) -> String {
        var teile: [String] = []
        if let w = sp.water, !w.isEmpty, w != sp.name { teile.append(w) }
        teile.append(Loc.t("mySpots.last", lang).replacingOccurrences(of: "{d}", with: tag(sp.last)))
        teile.append(Loc.t("mySpots.since", lang).replacingOccurrences(of: "{d}", with: tag(sp.first)))
        return teile.joined(separator: " · ")
    }

    private func sportText(_ sp: MeinSpot) -> String? {
        guard sp.sports.contains(where: { $0 != standardSport }) else { return nil }
        return sortiereSports(sp.sports, lang: lang).map { Loc.t("cls.sport." + $0, lang) }.joined(separator: ", ")
    }

    private func tag(_ iso: String?) -> String { TimeFmt.dateNumeric(iso, nil) ?? "—" }

    private func kmText(_ m: Double) -> String {
        if m < 1000 { return "\(Int(m.rounded())) m" }
        return m < 100_000 ? String(format: "%.1f km", m / 1000) : String(format: "%.0f km", m / 1000)
    }

    private func zeitText(_ s: Double) -> String {
        s < 3600 ? "\(Int((s / 60).rounded())) min" : String(format: "%.1f h", s / 3600)
    }
}
