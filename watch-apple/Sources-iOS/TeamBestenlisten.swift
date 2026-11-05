import SwiftUI
import UIKit

// Team-Bestenlisten (App-Port Phase 8, docs/UX-IA.md, 04.11.2026) — ganz oben unter Community › Teams & Events, wie
// `TeamBestenlisten` in web/src/pages/Home.tsx: je Kennzahl die Summe der besten 3/5/10 Fahrer eines Teams, damit ein
// grosses Team nicht allein durch seine Groesse gewinnt. Gerechnet am Server fuer alle Teams gleich, hier nur sortiert.
// Teilen als Bild wie web/src/lib/bestenlisteBild.ts (quadratisch 1080, hell oder dunkel waehlbar wie beim Teilen einer
// Session, Werte in der Akzentfarbe, Wappen und Flagge je Zeile, das eigene Team hinterlegt und hinter Platz 10 darunter).

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
            Text(Loc.t("team.vergleich.hinweis", lang).replacingOccurrences(of: "{n}", with: String(top)).replacingOccurrences(of: "{sport}", with: "Pumpfoil"))
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
                // Das eigene Team hinterlegt, wie im Teilen-Bild (04.11.2026).
                NavigationLink(value: TeamsZiel.team(z.slug)) { zeile(i + 1, z) }
                    .listRowBackground(eigenHintergrund(z.slug))
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
            // Herkunft nach dem Namen wie web TeamHerkunft (Land als Flagge, Kontinent/Erde als Kuerzel).
            HStack(spacing: 5) {
                Text(z.name).font(.subheadline.weight(.semibold)).foregroundStyle(tf.akzent).lineLimit(1)
                TeamHerkunftMarke(land: z.land)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(teamVergleichWert(z.wert(art), art)).font(.headline.monospacedDigit()).foregroundStyle(tf.akzent)
                Text(aus).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func eigenHintergrund(_ slug: String) -> Color? {
        meine.contains(slug) ? Color.accentColor.opacity(0.14) : nil
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

    /// Daten zusammenstellen, Logos laden, dann die Vorschau mit Hell/Dunkel-Wahl zeigen (wie web BestenlisteBildDialog).
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
        let sprache: String = lang
        Task { @MainActor in
            let alleZeilen: [TeamBildZeile] = bz + (ende.map { [$0] } ?? [])
            let logos: [String: UIImage] = await TeamBildLogos.laden(alleZeilen)
            var flaggen: [String: UIImage] = [:]
            for z in alleZeilen {
                if let l = z.land, flaggen[l] == nil, let b = TeamFlaggenBild.bild(l) { flaggen[l] = b }
            }
            let daten = TeamBildDaten(titel: titel, unterzeile: unter, zeilen: bz, eigene: ende, logos: logos, flaggen: flaggen)
            TeamBildDialog.zeigen(daten, lang: sprache)
            baut = false
        }
    }

    private func bildZeile(_ rang: Int, _ z: TeamVergleichZeile, _ a: String) -> TeamBildZeile {
        TeamBildZeile(rang: rang, name: z.name, wert: teamVergleichWert(z.wert(a), a), ich: meine.contains(z.slug),
                      logo: z.logo_url, farbe: z.farbe, land: z.land)
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
    var land: String? = nil
    var id: Int { rang }
}

/// Alles, was das Bild braucht — Logos und Flaggen schon geladen (ImageRenderer zeichnet sofort).
struct TeamBildDaten {
    let titel: String
    let unterzeile: String
    let zeilen: [TeamBildZeile]
    let eigene: TeamBildZeile?
    let logos: [String: UIImage]
    let flaggen: [String: UIImage]
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

/// Feste Farben je Fassung wie web bestenlisteBild.ts (DUNKEL/HELL = sharecard.py), unabhaengig vom Geraet.
struct TeamBildFarben {
    let grund: Color, flaeche: Color, linie: Color, akzent: Color, text: Color, sek: Color, leise: Color

    private static func c(_ hex: UInt32) -> Color {
        Color(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }

    static let dunkel = TeamBildFarben(grund: c(0x020617), flaeche: c(0x0c1426), linie: c(0x1e293b), akzent: c(0x22d3ee),
                                       text: c(0xffffff), sek: c(0xcbd5e1), leise: c(0x94a3b8))
    static let hell = TeamBildFarben(grund: c(0xf8fafc), flaeche: c(0xe0f2fe), linie: c(0xe2e8f0), akzent: c(0x0e7490),
                                     text: c(0x0f172a), sek: c(0x475569), leise: c(0x64748b))
}

/// Vorschau + Hell/Dunkel + Teilen (web BestenlisteBildDialog). Als UIKit-Blatt gezeigt: ein `.sheet` an einer
/// Listen-Section raeumt SwiftUI beim naechsten Neuzeichnen der Liste wieder ab (dieselbe Falle wie beim Social-Feed,
/// s. CommunityView). Die Wahl Hell/Dunkel merkt sich das Geraet (wie der Browser im Web, `foil_bild_hell`).
struct TeamBildDialog: View {
    let daten: TeamBildDaten
    let lang: String
    let schliessen: () -> Void
    let teilen: (UIImage) -> Void
    @AppStorage("foil_bild_hell") private var hell = false
    @State private var bild: UIImage?

    @MainActor static func zeigen(_ daten: TeamBildDaten, lang: String) {
        let fenster: UIWindow? = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        guard var oben: UIViewController = fenster?.rootViewController else { return }
        while let p = oben.presentedViewController { oben = p }
        let host = UIHostingController(rootView: AnyView(EmptyView()))
        let dialog = TeamBildDialog(daten: daten, lang: lang, schliessen: { [weak host] in host?.dismiss(animated: true) },
                                    teilen: { [weak host] img in
            guard let h = host else { return }
            let vc = UIActivityViewController(activityItems: [img], applicationActivities: nil)
            vc.popoverPresentationController?.sourceView = h.view
            h.present(vc, animated: true)
        })
        host.rootView = AnyView(dialog)
        oben.present(host, animated: true)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    vorschau
                    Picker("", selection: $hell) {
                        Text(Loc.t("theme.dark", lang)).tag(false)
                        Text(Loc.t("theme.light", lang)).tag(true)
                    }
                    .pickerStyle(.segmented)
                    Button { if let b = bild { teilen(b) } } label: {
                        Label(Loc.t("team.teilen", lang), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(bild == nil)
                }
                .padding()
            }
            .navigationTitle(Loc.t("team.bild.titel", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { schliessen() } }
            }
        }
        .task(id: hell) { await zeichnen() }
    }

    @ViewBuilder private var vorschau: some View {
        if let b = bild {
            Image(uiImage: b).resizable().scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.4), lineWidth: 1))
        } else {
            ProgressView().frame(maxWidth: .infinity, minHeight: 300)
        }
    }

    @MainActor private func zeichnen() {
        let inhalt = TeamBestenlisteBild(daten: daten, hell: hell)
            .environment(\.colorScheme, hell ? .light : .dark)
        let r = ImageRenderer(content: inhalt)
        r.scale = 1
        bild = r.uiImage
    }
}

/// Das Teilen-Bild wie web zeichneBestenliste: Kopf (Ueberschrift + Unterzeile in Akzentfarbe), bis zu 10 Zeilen
/// (Rang, Wappen, Flagge 4:3 mit feinem Rand — der Platz bleibt auch ohne Flagge frei, damit die Namen buendig stehen —,
/// Name, Wert), die Hoehe gleichmaessig verteilt, das eigene Team hinterlegt, unten Motto und Schriftzug.
struct TeamBestenlisteBild: View {
    let daten: TeamBildDaten
    let hell: Bool

    private var f: TeamBildFarben { hell ? .hell : .dunkel }
    private let rand: CGFloat = 90
    private let oben: CGFloat = 215
    private let unten: CGFloat = 930
    private var liste: [TeamBildZeile] { Array(daten.zeilen.prefix(10)) }
    private var mitEigener: Bool { daten.eigene != nil && !liste.isEmpty }
    /// Zeilenhoehe: verfuegbare Hoehe gleichmaessig, hoechstens 110 px (Web: n + 1,4 fuer die eigene Zeile).
    private var zh: CGFloat {
        let n: CGFloat = CGFloat(max(liste.count, 1)) + (mitEigener ? 1.4 : 0)
        return min(110, ((unten - oben) / n).rounded(.down))
    }
    private var gross: CGFloat { (zh * 0.5).rounded() }

    var body: some View {
        ZStack(alignment: .topLeading) {
            f.grund
            kopf.offset(x: rand, y: 60)
            zeilenBlock.offset(x: rand, y: oben)
            fuss.offset(x: rand, y: 990)
        }
        .frame(width: 1080, height: 1080, alignment: .topLeading)
    }

    private var kopf: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(daten.titel).font(.system(size: 58, weight: .bold)).foregroundStyle(f.akzent).lineLimit(1)
            Text(daten.unterzeile).font(.system(size: 30, weight: .bold)).foregroundStyle(f.akzent).lineLimit(1)
        }
        .frame(width: 900, alignment: .leading)
    }

    private var zeilenBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(liste.enumerated()), id: \.offset) { i, z in
                zeile(z)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(f.linie).frame(height: 2) }
                    }
            }
            if mitEigener, let e = daten.eigene {
                Text("⋮").font(.system(size: gross, weight: .bold)).foregroundStyle(f.leise)
                    .frame(width: 60, height: (zh * 0.4).rounded())
                zeile(TeamBildZeile(rang: e.rang, name: e.name, wert: e.wert, ich: true, logo: e.logo, farbe: e.farbe, land: e.land))
            }
        }
        .frame(width: 900, alignment: .leading)
    }

    private func zeile(_ z: TeamBildZeile) -> some View {
        let fh: CGFloat = (gross * 0.8).rounded()
        let fw: CGFloat = (fh * 4 / 3).rounded()
        return HStack(spacing: 0) {
            Text(String(z.rang)).font(.system(size: gross, weight: .heavy))
                .foregroundStyle(z.rang <= 3 ? f.akzent : f.leise)
                .frame(width: 50, alignment: .trailing)
            Spacer().frame(width: 24)
            wappen(z)
            Spacer().frame(width: 16)
            flagge(z.land, fw, fh)
            Spacer().frame(width: 16)
            Text(z.name).font(.system(size: (gross * 0.92).rounded(), weight: z.rang == 1 || z.ich ? .bold : .medium))
                .foregroundStyle(f.text).lineLimit(1)
            Spacer(minLength: 30)
            Text(z.wert).font(.system(size: gross, weight: .bold)).foregroundStyle(f.akzent).lineLimit(1)
                .fixedSize()
        }
        .frame(width: 900, height: zh)
        .background(
            RoundedRectangle(cornerRadius: 16).fill(z.ich ? f.flaeche : Color.clear)
                .padding(.horizontal, -24).padding(.vertical, 4)
        )
    }

    @ViewBuilder private func wappen(_ z: TeamBildZeile) -> some View {
        let ws: CGFloat = (gross * 1.25).rounded()
        if let l = z.logo, let b = daten.logos[l] {
            Image(uiImage: b).resizable().scaledToFit()
                .frame(width: ws, height: ws)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            let tf = TeamFarbe(z.farbe)
            Text(teamInitialen(z.name)).font(.system(size: (ws * 0.38).rounded(), weight: .bold)).foregroundStyle(tf.aufFlaeche)
                .frame(width: ws, height: ws)
                .background(tf.flaeche, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    @ViewBuilder private func flagge(_ land: String?, _ fw: CGFloat, _ fh: CGFloat) -> some View {
        // Kontinent/Erde je nach Hell/Dunkel des Bildes (die vorab geladenen Flaggen kennen nur eine Fassung).
        let kont: UIImage? = land.flatMap { $0.hasPrefix("k:") ? TeamFlaggenBild.kontinent(String($0.dropFirst(2)), hell: hell) : nil }
        if let l = land, let b = kont ?? daten.flaggen[l] {
            Image(uiImage: b).resizable().scaledToFill()
                .frame(width: fw, height: fh)
                .clipped()
                .overlay(Rectangle().stroke(f.linie, lineWidth: 2))
        } else {
            Color.clear.frame(width: fw, height: fh)
        }
    }

    private var fuss: some View {
        HStack(alignment: .bottom) {
            Text("Have fun, keep pumping!").font(.system(size: 26)).foregroundStyle(f.leise)
                .padding(.bottom, 10)
            Spacer()
            Image("WordmarkH").renderingMode(.template).resizable().scaledToFit()
                .frame(height: 54).foregroundStyle(hell ? f.text : Color.white)
        }
        .frame(width: 900, height: 54)
    }
}
