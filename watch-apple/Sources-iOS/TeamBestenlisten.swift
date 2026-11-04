import SwiftUI
import UIKit

// Team-Bestenlisten (App-Port Phase 8, docs/UX-IA.md, 04.11.2026) — ganz oben unter Community › Teams & Events, wie
// `TeamBestenlisten` in web/src/pages/Home.tsx: je Kennzahl die Summe der besten 3/5/10 Fahrer eines Teams, damit ein
// grosses Team nicht allein durch seine Groesse gewinnt. Gerechnet am Server fuer alle Teams gleich, hier nur sortiert.
// Teilen als Bild wie web/src/lib/bestenlisteBild.ts (quadratisch 1080, Navy-Grund, Werte in Marken-Cyan, Wappen je
// Zeile, das eigene Team hinterlegt und hinter Platz 10 darunter).

/// Antwort von GET /api/teams/liste/vergleich?period=&top=
struct TeamVergleich: Decodable {
    var period: String? = nil
    var top: Int? = nil
    let teams: [TeamVergleichZeile]
}

struct TeamVergleichZeile: Decodable, Identifiable {
    let slug: String
    let name: String
    var logo_url: String? = nil
    var farbe: String? = nil
    var land: String? = nil
    var mitglieder: Int? = nil
    var aktive: Int? = nil
    var pumps: Double? = nil
    var distance_m: Double? = nil
    var time_s: Double? = nil
    var sessions: Double? = nil
    var runs: Double? = nil
    var pumps_fahrer: Int? = nil
    var distance_m_fahrer: Int? = nil
    var time_s_fahrer: Int? = nil
    var sessions_fahrer: Int? = nil
    var runs_fahrer: Int? = nil
    var id: String { slug }

    func wert(_ art: String) -> Double {
        switch art {
        case "distance_m": return distance_m ?? 0
        case "time_s": return time_s ?? 0
        case "sessions": return sessions ?? 0
        case "runs": return runs ?? 0
        default: return pumps ?? 0
        }
    }

    func fahrer(_ art: String) -> Int {
        switch art {
        case "distance_m": return distance_m_fahrer ?? 0
        case "time_s": return time_s_fahrer ?? 0
        case "sessions": return sessions_fahrer ?? 0
        case "runs": return runs_fahrer ?? 0
        default: return pumps_fahrer ?? 0
        }
    }
}

extension Api {
    static func teamsVergleich(period: String, top: Int) async throws -> TeamVergleich {
        let p: String = period.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? period
        return try await request("/api/teams/liste/vergleich?period=\(p)&top=\(top)", method: "GET", body: nil, auth: true)
    }
}

/// Kennzahl -> Beschriftung (dieselbe Reihenfolge wie im Web).
private let VERGLEICH_ARTEN: [(String, String)] = [
    ("pumps", "team.stat.pumps"), ("distance_m", "team.stat.strecke"), ("time_s", "team.stat.zeit"),
    ("sessions", "team.stat.sessions"), ("runs", "team.stat.laeufe"),
]
private let VERGLEICH_ZEITEN: [(String, String)] = [
    ("today", "period.today"), ("yesterday", "period.yesterday"), ("10d", "period.10d"), ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all"),
]

func teamVergleichWert(_ v: Double, _ art: String) -> String {
    switch art {
    case "distance_m":
        if v < 1000 { return "\(Int(v.rounded())) m" }
        return v < 100_000 ? String(format: "%.1f km", v / 1000) : String(format: "%.0f km", v / 1000)
    case "time_s":
        return v < 3600 ? "\(Int((v / 60).rounded())) min" : String(format: "%.1f h", v / 3600)
    default:
        return String(Int(v.rounded()))
    }
}

/// Abschnitt fuer die Community-Liste. Je Team eine eigene Listenzeile mit GENAU einem Link (s. CommunityView); die
/// Knopfzeilen mit `.borderless`, sonst loest ein Tipp alle Knoepfe einer Zeile aus.
struct TeamBestenlistenSection: View {
    let lang: String
    @State private var period = "30d"
    @State private var top = 5
    @State private var art = "pumps"
    @State private var d: TeamVergleich? = nil
    // Eigene (aktive) Teams fuer die Hervorhebung im Bild.
    @State private var meine: Set<String> = []
    @State private var baut = false

    private var zeilen: [TeamVergleichZeile] {
        let a: String = art
        return (d?.teams ?? []).filter { $0.wert(a) > 0 }.sorted { x, y in
            let wx: Double = x.wert(a), wy: Double = y.wert(a)
            return wx != wy ? wx > wy : x.name.localizedCompare(y.name) == .orderedAscending
        }
    }

    var body: some View {
        Section {
            Text(Loc.t("team.vergleich.hinweis", lang).replacingOccurrences(of: "{n}", with: String(top)))
                .font(.subheadline).foregroundStyle(.secondary)
            zeitZeile
            artZeile
            liste
        } header: {
            Text(Loc.t("team.vergleich.titel", lang)).font(.headline)
        }
        .task(id: "\(period)|\(top)") { await laden() }
        .task { await meineLaden() }
    }

    @ViewBuilder private var liste: some View {
        if d == nil {
            Text(Loc.t("common.loading", lang)).font(.subheadline).foregroundStyle(.secondary)
        } else if zeilen.isEmpty {
            Text(Loc.t("team.vergleich.leer", lang)).font(.subheadline).foregroundStyle(.secondary)
        } else {
            ForEach(Array(zeilen.enumerated()), id: \.element.slug) { i, z in
                NavigationLink(value: TeamsZiel.team(z.slug)) { zeile(i + 1, z) }
            }
            Button { bildBauen() } label: {
                Label(Loc.t("team.bild.titel", lang), systemImage: "square.and.arrow.up").font(.subheadline)
            }
            .buttonStyle(.borderless)
            .disabled(baut)
        }
    }

    private var zeitZeile: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(VERGLEICH_ZEITEN, id: \.0) { k, lk in knopf(Loc.t(lk, lang), period == k) { period = k } }
                Spacer(minLength: 10)
                ForEach([3, 5, 10], id: \.self) { n in
                    knopf(Loc.t("team.vergleich.top", lang).replacingOccurrences(of: "{n}", with: String(n)), top == n) { top = n }
                }
            }
        }
    }

    private var artZeile: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(VERGLEICH_ARTEN, id: \.0) { k, lk in knopf(Loc.t(lk, lang), art == k) { art = k } }
            }
        }
    }

    private func knopf(_ text: String, _ an: Bool, _ aktion: @escaping () -> Void) -> some View {
        Button(action: aktion) {
            Text(text).font(.caption).fontWeight(an ? .semibold : .regular)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .foregroundStyle(an ? Color.black : Color.primary)
                .background(Capsule().fill(an ? Color.accentColor : Color(.tertiarySystemBackground)))
        }
        .buttonStyle(.borderless)
    }

    private func zeile(_ rang: Int, _ z: TeamVergleichZeile) -> some View {
        let tf = TeamFarbe(z.farbe)
        let aus: String = Loc.t("team.vergleich.ausFahrern", lang).replacingOccurrences(of: "{n}", with: String(z.fahrer(art)))
        return HStack(spacing: 10) {
            Text(String(rang)).font(.headline.monospacedDigit()).foregroundStyle(.secondary).frame(minWidth: 22)
            TeamWappen(name: z.name, logo: z.logo_url, farbe: z.farbe, size: 36)
            Text(z.name).font(.subheadline.weight(.semibold)).foregroundStyle(tf.akzent).lineLimit(1)
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(teamVergleichWert(z.wert(art), art)).font(.headline.monospacedDigit()).foregroundStyle(tf.akzent)
                Text(aus).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Laden

    private func laden() async {
        let p: String = period, n: Int = top
        if let neu = try? await Api.teamsVergleich(period: p, top: n), p == period, n == top { d = neu }
        else if d == nil { d = TeamVergleich(teams: []) }
    }

    private func meineLaden() async {
        guard let l = try? await Api.teamsMine() else { return }
        meine = Set(l.filter { $0.status == "aktiv" }.map { $0.slug })
    }

    // MARK: - Bild

    private func bildBauen() {
        baut = true
        let alle: [TeamVergleichZeile] = zeilen
        let a: String = art
        let titel: String = Loc.t(VERGLEICH_ARTEN.first { $0.0 == a }?.1 ?? "", lang)
        let df = DateFormatter()
        df.locale = Locale(identifier: lang == "gsw" ? "de-CH" : lang)
        df.dateStyle = .medium
        df.timeStyle = .none
        let unter: String = [Loc.t("team.vergleich.titel", lang),
                             Loc.t("team.vergleich.top", lang).replacingOccurrences(of: "{n}", with: String(top)),
                             Loc.t(VERGLEICH_ZEITEN.first { $0.0 == period }?.1 ?? "period.all", lang),
                             df.string(from: Date())].joined(separator: " · ")
        var bz: [TeamBildZeile] = []
        for (i, z) in alle.prefix(10).enumerated() { bz.append(bildZeile(i + 1, z, a)) }
        // Liegt das eigene Team hinter Platz 10, steht es darunter (04.11.2026).
        var eigene: TeamBildZeile? = nil
        if let i = alle.indices.first(where: { $0 >= 10 && meine.contains(alle[$0].slug) }) {
            eigene = bildZeile(i + 1, alle[i], a)
        }
        let ende: TeamBildZeile? = eigene
        Task { @MainActor in
            let logos: [String: UIImage] = await TeamBildLogos.laden(bz + (ende.map { [$0] } ?? []))
            let inhalt = TeamBestenlisteBild(titel: titel, unterzeile: unter, zeilen: bz, eigene: ende, logos: logos)
                .environment(\.colorScheme, .dark)
            let r = ImageRenderer(content: inhalt)
            r.scale = 1
            if let img = r.uiImage { teilenBlatt(img) }
            baut = false
        }
    }

    /// Teilen-Blatt direkt ueber UIKit: ein `.sheet` an einer Listen-Section raeumt SwiftUI beim naechsten Neuzeichnen
    /// der Liste wieder ab (dieselbe Falle wie beim Social-Feed, s. CommunityView).
    private func teilenBlatt(_ img: UIImage) {
        let fenster: UIWindow? = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        guard var oben: UIViewController = fenster?.rootViewController else { return }
        while let p = oben.presentedViewController { oben = p }
        let vc = UIActivityViewController(activityItems: [img], applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = oben.view
        oben.present(vc, animated: true)
    }

    private func bildZeile(_ rang: Int, _ z: TeamVergleichZeile, _ a: String) -> TeamBildZeile {
        TeamBildZeile(rang: rang, name: z.name, wert: teamVergleichWert(z.wert(a), a), ich: meine.contains(z.slug),
                      logo: z.logo_url, farbe: z.farbe)
    }
}

// MARK: - Bild (1080 × 1080)

struct TeamBildZeile: Identifiable {
    let rang: Int
    let name: String
    let wert: String
    let ich: Bool
    let logo: String?
    let farbe: String?
    var id: Int { rang }
}

/// Logos vorab laden: ImageRenderer zeichnet sofort, ein NetzBild kaeme zu spaet (dann stuenden nur Initialen da).
enum TeamBildLogos {
    @MainActor static func laden(_ zeilen: [TeamBildZeile]) async -> [String: UIImage] {
        var out: [String: UIImage] = [:]
        for z in zeilen {
            guard let l = z.logo, out[l] == nil, let url = Api.mediaURL(l) else { continue }
            if let b = BildCache.shared.bild(url) { out[l] = b; continue }
            if let r = try? await URLSession.shared.data(from: url), let b = UIImage(data: r.0) { out[l] = b }
        }
        return out
    }
}

/// Das Teilen-Bild: Navy-Grund, Ueberschrift + Unterzeile, bis zu 10 Zeilen (Rang, Wappen, Name, Wert), das eigene Team
/// hinterlegt, unten Motto und Wortmarke. Feste Farben wie die Session-Karte (sharecard.py), unabhaengig vom Geraet.
struct TeamBestenlisteBild: View {
    let titel: String
    let unterzeile: String
    let zeilen: [TeamBildZeile]
    let eigene: TeamBildZeile?
    let logos: [String: UIImage]

    private let grund = Color(red: 0x02 / 255, green: 0x06 / 255, blue: 0x17 / 255)
    private let flaeche = Color(red: 0x0c / 255, green: 0x14 / 255, blue: 0x26 / 255)
    private let cyan = Color(red: 0x22 / 255, green: 0xd3 / 255, blue: 0xee / 255)
    private let sek = Color(red: 0xcb / 255, green: 0xd5 / 255, blue: 0xe1 / 255)
    private let leise = Color(red: 0x94 / 255, green: 0xa3 / 255, blue: 0xb8 / 255)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(titel).font(.system(size: 58, weight: .bold)).foregroundStyle(cyan).lineLimit(1)
            Text(unterzeile).font(.system(size: 30, weight: .bold)).foregroundStyle(sek).lineLimit(1)
                .padding(.top, 8)
            VStack(spacing: 10) {
                ForEach(zeilen) { z in zeile(z) }
                if let e = eigene {
                    Text("⋮").font(.system(size: 40, weight: .bold)).foregroundStyle(leise)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.leading, 30)
                    zeile(e)
                }
            }
            .padding(.top, 40)
            Spacer(minLength: 0)
            HStack(alignment: .bottom) {
                Text("Have fun, keep pumping!").font(.system(size: 26)).foregroundStyle(leise)
                Spacer()
                Image("WordmarkH").renderingMode(.template).resizable().scaledToFit()
                    .frame(height: 56).foregroundStyle(Color.white)
            }
        }
        .padding(90)
        .frame(width: 1080, height: 1080, alignment: .topLeading)
        .background(grund)
    }

    private func zeile(_ z: TeamBildZeile) -> some View {
        HStack(spacing: 20) {
            Text(String(z.rang)).font(.system(size: 40, weight: .heavy)).foregroundStyle(z.rang == 1 ? cyan : sek)
                .frame(width: 60, alignment: .trailing)
            wappen(z)
            Text(z.name).font(.system(size: 37, weight: z.rang == 1 || z.ich ? .bold : .medium))
                .foregroundStyle(Color.white).lineLimit(1)
            Spacer(minLength: 20)
            Text(z.wert).font(.system(size: 40, weight: .bold)).foregroundStyle(cyan).lineLimit(1)
        }
        .padding(.horizontal, 16).frame(height: 62)
        .background(RoundedRectangle(cornerRadius: 14).fill(z.ich ? flaeche : Color.clear))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(z.ich ? cyan : Color.clear, lineWidth: 2))
    }

    @ViewBuilder private func wappen(_ z: TeamBildZeile) -> some View {
        if let l = z.logo, let b = logos[l] {
            Image(uiImage: b).resizable().scaledToFit()
                .frame(width: 50, height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            let tf = TeamFarbe(z.farbe)
            Text(teamInitialen(z.name)).font(.system(size: 19, weight: .bold)).foregroundStyle(tf.aufFlaeche)
                .frame(width: 50, height: 50)
                .background(tf.flaeche, in: RoundedRectangle(cornerRadius: 10))
        }
    }
}
