import SwiftUI

// Anleitung fuer die Uhr — Port von web/src/components/WatchGuide.tsx (04.11.2026): oben die Plattform als Reiter
// Garmin | Apple Watch | Wear OS | Amazfit | Huawei | Kompatibilitaet, darunter je Plattform Untertitel, Store-Link,
// nummerierte Schritte und Vorschaubilder vom Server (dieselben Pfade wie im Web), danach die plattformuebergreifenden
// Karten Verbinden, Einstellungen an der Uhr und Hochladen. „Kompatibilitaet" ist die Uhren-Tabelle (WatchMatrix.tsx).
// Die Texte sind dieselben wie im Web (Schluessel aus den Web-Locales), damit ein Satz nicht an zwei Stellen
// unterschiedlich lautet. Nicht uebernommen: das Demo-Video ganz unten.
//
// Jeder Abschnitt ist eine eigene, explizit typisierte Property: Swifts Type-Checker loest einen ViewBuilder als EINEN
// Ausdruck auf, und diese Datei ist ueberwiegend Text (s. Kommentar in GarminPairView).
struct GuideView: View {
    @AppStorage("appLang") private var lang = "de"
    /// Als Reiter in Uhr › Anleitung (wie web Account.tsx, 04.11.2026): ohne eigene Kopfleiste.
    var eingebettet: Bool = false
    /// „Verbinden" in den Schritten: eingebettet springt es auf den Reiter „Meine Uhr(en)"; nil (eigene Seite) oeffnet
    /// stattdessen die Verbinden-Seite.
    var zuVerbinden: (() -> Void)? = nil
    @State private var plattform: String = ReiterSpeicher.von("uhrguide", "garmin")

    private var reiter: [ReiterDef] {
        [ReiterDef(id: "garmin", label: "Garmin"),
         ReiterDef(id: "apple", label: "Apple Watch"),
         ReiterDef(id: "wear", label: "Wear OS"),
         ReiterDef(id: "amazfit", label: "Amazfit"),
         ReiterDef(id: "huawei", label: "Huawei"),
         ReiterDef(id: "compat", label: Loc.t("account.tabCompat", lang))]
    }

    private var bindung: Binding<String> {
        Binding(get: { plattform }, set: { plattform = $0; ReiterSpeicher.setze("uhrguide", $0) })
    }

    var body: some View {
        VStack(spacing: 0) {
            Reiterleiste(reiter: reiter, aktiv: bindung)
                .padding(.horizontal)
            Form {
                plattformTeil
                if plattform != "compat" {
                    pairSection
                    settingsSection
                    syncSection
                }
            }
        }
        .brandToolbarWenn(!eingebettet, Loc.t("guide.howto", lang))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var plattformTeil: some View {
        switch plattform {
        case "apple": appleSection
        case "wear": wearSection
        case "amazfit": amazfitSection
        case "huawei": huaweiSection
        case "compat": UhrenMatrix(lang: lang)
        default: garminSection
        }
    }

    // MARK: - Plattformen

    private var garminSection: some View {
        Section {
            Text(Loc.t("guide.garminSub", lang)).font(.callout).foregroundStyle(.secondary)
            Text(Loc.t("guide.g.storeLead", lang)).font(.footnote)
            Link(Loc.t("guide.g.storeCta", lang), destination: URL(string: GUIDE_URL_CONNECT_IQ)!)
            Text(Loc.t("guide.g.manualLead", lang)).font(.footnote).foregroundStyle(.secondary)
            garminSchritt1
            schritt("guide.g.s2Title", Loc.t("guide.g.s2", lang))
            schritt("guide.g.s3Title", Loc.t("guide.g.s3", lang), verbinden: true)
            schritt("guide.g.s4Title", Loc.t("guide.g.s4", lang))
            schritt("guide.g.s5Title", Loc.t("guide.g.s5", lang))
            schritt("guide.g.s6Title", Loc.t("guide.g.s6", lang))
            bilder(GUIDE_BILDER_GARMIN, vorschau: "guide.previewVer")
        } header: {
            Text("Garmin")
        }
    }

    // Sideload: der .prg-Download liegt nur im Web (Uhr › App), OpenMTP fuer den Mac — beides als Link.
    private var garminSchritt1: some View {
        VStack(alignment: .leading, spacing: 4) {
            schritt("guide.g.s1Title", garminS1Text)
            HStack(spacing: 14) {
                Link(Loc.t("guide.g.s1Download", lang), destination: URL(string: "\(Api.baseURL)/account?tab=app")!)
                Link("OpenMTP", destination: URL(string: "https://openmtp.ganeshrvel.com/")!)
            }
            .font(.footnote)
            .buttonStyle(.borderless)
        }
    }

    private var garminS1Text: String {
        let teile: [String] = [Loc.t("guide.g.s1a", lang), Loc.t("guide.g.s1Download", lang), Loc.t("guide.g.s1b", lang),
                               "OpenMTP", Loc.t("guide.g.s1c", lang), "GARMIN/APPS/", Loc.t("guide.g.s1d", lang)]
        return teile.joined(separator: " ")
    }

    private var appleSection: some View {
        Section {
            Text(Loc.t("guide.appleSub", lang)).font(.callout).foregroundStyle(.secondary)
            Link("App Store", destination: URL(string: GUIDE_URL_APP_STORE)!)
            schritt("guide.a.s1Title", Loc.t("guide.a.s1", lang))
            schritt("guide.a.s2Title", zwei("guide.a.s2a", "guide.a.s2b"), verbinden: true)
            schritt("guide.a.s3Title", Loc.t("guide.a.s3", lang))
            schritt("guide.a.s4Title", Loc.t("guide.a.s4", lang))
            bilder(GUIDE_BILDER_APPLE, vorschau: "guide.preview")
        } header: {
            Text("Apple Watch")
        }
    }

    private var wearSection: some View {
        Section {
            Text(Loc.t("guide.wearSub", lang)).font(.callout).foregroundStyle(.secondary)
            Link("Google Play", destination: URL(string: GUIDE_URL_PLAY)!)
            schritt("guide.w.s1Title", Loc.t("guide.w.s1", lang), hinweis: Loc.t("guide.w.s1Note", lang))
            schritt("guide.w.s2Title", zwei("guide.w.s2a", "guide.w.s2b"), verbinden: true)
            schritt("guide.w.s3Title", Loc.t("guide.w.s3", lang))
            schritt("guide.w.s4Title", Loc.t("guide.w.s4", lang))
            bilder(GUIDE_BILDER_WEAR, vorschau: "guide.preview")
        } header: {
            Text("Wear OS")
        }
    }

    private var amazfitSection: some View {
        Section {
            Text(Loc.t("guide.amazfitSub", lang)).font(.callout).foregroundStyle(.secondary)
            Text(Loc.t("guide.z.store", lang)).font(.footnote)
            HStack(spacing: 14) {
                Link("Zepp · App Store", destination: URL(string: GUIDE_URL_ZEPP_IOS)!)
                Link("Zepp · Google Play", destination: URL(string: GUIDE_URL_ZEPP_ANDROID)!)
            }
            .buttonStyle(.borderless)
            schritt(nil, "1. " + Loc.t("guide.z.s1", lang))
            schritt(nil, "2. " + Loc.t("guide.z.s2", lang))
            schritt(nil, "3. " + Loc.t("guide.z.s3", lang), verbinden: true)
            schritt(nil, "4. " + Loc.t("guide.z.s4", lang))
            bilder(GUIDE_BILDER_AMAZFIT, vorschau: "guide.preview")
        } header: {
            Text("Amazfit")
        }
    }

    // HUAWEI WATCH 5 (AppGallery seit 04.11.2026); Store-Zeile wie im Web (Name + Untertitel), Huaweis Badge fehlt uns.
    private var huaweiSection: some View {
        Section {
            Text(Loc.t("guide.huaweiSub", lang)).font(.callout).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Link("AppGallery → „Pumpfoil\"", destination: URL(string: GUIDE_URL_APPGALLERY)!)
                Text("Record pump foiling · HUAWEI WATCH 5").font(.caption).foregroundStyle(.secondary)
            }
            schritt(nil, "1. " + Loc.t("guide.h.s1", lang))
            schritt(nil, "2. " + Loc.t("guide.h.s2", lang), verbinden: true)
            schritt(nil, "3. " + Loc.t("guide.h.s3", lang))
            schritt(nil, "4. " + Loc.t("guide.h.s4", lang))
            bilder(GUIDE_BILDER_HUAWEI, vorschau: "guide.preview")
        } header: {
            Text("HUAWEI WATCH 5")
        }
    }

    // MARK: - Fuer alle Plattformen

    private var pairSection: some View {
        Section {
            Text(Loc.t("guide.pair.intro", lang)).font(.footnote)
            schritt("guide.pair.autoTitle", Loc.t("guide.pair.auto", lang))
            schritt("guide.pair.codeTitle", Loc.t("guide.pair.code", lang), verbinden: true)
            schritt("guide.pair.relinkTitle", Loc.t("guide.pair.relink", lang))
        } header: {
            Text(Loc.t("guide.pair.title", lang))
        } footer: {
            Text(Loc.t("guide.pair.note", lang))
        }
    }

    // Was sich AN DER UHR einstellen laesst (web guide-settings, Jan 17.08.): direkt hinter dem Verbinden.
    private var settingsSection: some View {
        Section {
            schritt(nil, zwei("guide.settings.intro", "guide.settings.intro2"), verbinden: true)
            schritt("guide.settings.recordTitle", Loc.t("guide.settings.record", lang))
            schritt("guide.settings.gnssTitle", Loc.t("guide.settings.gnss", lang))
            Text(Loc.t("guide.settings.gpsWarn", lang)).font(.callout).foregroundStyle(.orange)
            Text(Loc.t("guide.settings.zepp", lang)).font(.footnote).foregroundStyle(.secondary)
        } header: {
            Text(Loc.t("guide.settings.title", lang))
        }
    }

    private var syncSection: some View {
        Section {
            schritt("guide.sync.nowTitle", Loc.t("guide.sync.now", lang))
            schritt("guide.sync.retryTitle", Loc.t("guide.sync.retry", lang))
            schritt("guide.sync.laterTitle", Loc.t("guide.sync.later", lang))
        } header: {
            Text(Loc.t("guide.sync.title", lang))
        } footer: {
            Text(Loc.t("guide.sync.note", lang))
        }
    }

    // MARK: - Bausteine

    /// Zwei Textteile, zwischen denen im Web der Verbinden-Link steht.
    private func zwei(_ a: String, _ b: String) -> String {
        Loc.t(a, lang) + " " + Loc.t("guide.connect", lang) + " " + Loc.t(b, lang)
    }

    /// Ein Schritt: fetter Titel (Schluessel, oft mit Nummer), Text, optional Warnhinweis und der Verbinden-Knopf.
    private func schritt(_ titelKey: String?, _ text: String, verbinden: Bool = false, hinweis: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let titelKey { Text(Loc.t(titelKey, lang)).font(.subheadline).bold() }
            Text(text).font(.footnote).foregroundStyle(.secondary)
            if let hinweis { Text(hinweis).font(.callout).foregroundStyle(.orange) }
            if verbinden { verbindenKnopf }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private var verbindenKnopf: some View {
        if let zuVerbinden {
            Button { zuVerbinden() } label: { Label(Loc.t("guide.connect", lang), systemImage: "link") }
                .font(.footnote.weight(.semibold))
                .buttonStyle(.borderless)
        } else {
            NavigationLink { GarminPairView() } label: { Label(Loc.t("guide.connect", lang), systemImage: "link") }
                .font(.footnote.weight(.semibold))
        }
    }

    /// Vorschaubilder vom Server, drei je Zeile, mit Bildunterschrift.
    private func bilder(_ liste: [GuideBild], vorschau: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t(vorschau, lang)).font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(liste) { b in GuideBildZelle(bild: b, lang: lang) }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Bilder

struct GuideBild: Identifiable {
    let pfad: String
    let cap: String
    /// Eckige Uhr (Apple, alte Amazfit-Bilder): abgerundete Ecken statt Kreis.
    var eckig: Bool = false
    let nr: Int
    var id: String { "\(nr)-\(pfad)" }
}

private struct GuideBildZelle: View {
    let bild: GuideBild
    let lang: String

    var body: some View {
        VStack(spacing: 4) {
            NetzBild(url: URL(string: Api.baseURL + bild.pfad)) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFit()
                case .laedt: ProgressView()
                case .fehler: Image(systemName: "applewatch").foregroundStyle(.secondary)
                }
            }
            .aspectRatio(bild.eckig ? 0.85 : 1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: bild.eckig ? 14 : 200))
            Text(Loc.t(bild.cap, lang)).font(.caption2).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}

/// Liste aus (Pfad, Bildunterschrift) — Pfade wie im Web (web/public/guide/…).
private func guideBilder(_ paare: [(String, String)], eckig: Bool = false) -> [GuideBild] {
    paare.enumerated().map { GuideBild(pfad: $0.element.0, cap: $0.element.1, eckig: eckig, nr: $0.offset) }
}

private let GUIDE_BILDER_GARMIN: [GuideBild] = guideBilder([
    ("/guide/garmin/start.webp", "guide.cap.gStart"), ("/guide/garmin/settings.webp", "guide.cap.gSettings"),
    ("/guide/garmin/pairing-code.webp", "guide.cap.gPairCode"), ("/guide/garmin/pairing-success.webp", "guide.cap.gPairOk"),
    ("/guide/garmin/alarm-1.webp", "guide.cap.gAlarm1"), ("/guide/garmin/alarm-2.webp", "guide.cap.gAlarm2"),
    ("/guide/garmin/alarm-3.webp", "guide.cap.gAlarm3"), ("/guide/garmin/on-foil-1.webp", "guide.cap.onFoil"),
    ("/guide/garmin/on-foil-2.webp", "guide.cap.onFoil"),
])

private let GUIDE_BILDER_WEAR: [GuideBild] = guideBilder([
    ("/guide/wear/connect.webp", "guide.cap.wConnect"), ("/guide/wear/start.webp", "guide.cap.wStart"),
    ("/guide/wear/alarm.webp", "guide.cap.wAlarm"), ("/guide/wear/data.webp", "guide.cap.onFoil"),
    ("/guide/wear/stats.webp", "guide.cap.wStats"), ("/guide/wear/run.webp", "guide.cap.wRun"),
    ("/guide/wear/stop.webp", "guide.cap.wStop"),
])

private let GUIDE_BILDER_APPLE: [GuideBild] = guideBilder([
    ("/guide/apple/connect.webp", "guide.cap.aConnect"), ("/guide/apple/code.webp", "guide.cap.aCode"),
    ("/guide/apple/start.webp", "guide.cap.aStart"), ("/guide/apple/alarm.webp", "guide.cap.aAlarm"),
    ("/guide/apple/data-1.webp", "guide.cap.onFoil"), ("/guide/apple/data-2.webp", "guide.cap.onFoil"),
    ("/guide/apple/stop.webp", "guide.cap.aStop"), ("/guide/apple/upload.webp", "guide.cap.aUpload"),
], eckig: true)

// Amazfit: Koppeln aus 1.0.6 (eckig), der Rest aus 1.0.13 (rund) — wie im Web.
private let GUIDE_BILDER_AMAZFIT: [GuideBild] = guideBilder([
    ("/guide/amazfit/pair-code.webp", "guide.cap.gPairCode"), ("/guide/amazfit/pair-ok.webp", "guide.cap.gPairOk"),
], eckig: true) + guideBilder([
    ("/watch-amazfit-v2-7.webp", "guide.cap.wStart"), ("/watch-amazfit-v2-1.webp", "guide.cap.onFoil"),
    ("/watch-amazfit-v2-2.webp", "guide.cap.onFoil"), ("/watch-amazfit-v2-3.webp", "guide.cap.onFoil"),
    ("/watch-amazfit-v2-6.webp", "guide.cap.wRun"), ("/watch-amazfit-v2-8.webp", "guide.cap.wStats"),
    ("/watch-amazfit-v2-4.webp", "guide.cap.wStop"),
]).map { GuideBild(pfad: $0.pfad, cap: $0.cap, eckig: false, nr: $0.nr + 10) }

private let GUIDE_BILDER_HUAWEI: [GuideBild] = guideBilder([
    ("/guide/huawei/connect.webp", "guide.cap.wConnect"), ("/guide/huawei/start.webp", "guide.cap.wStart"),
    ("/guide/huawei/data-1.webp", "guide.cap.onFoil"), ("/guide/huawei/data-2.webp", "guide.cap.onFoil"),
    ("/guide/huawei/run.webp", "guide.cap.wRun"), ("/guide/huawei/stop.webp", "guide.cap.wStop"),
    ("/guide/huawei/upload.webp", "guide.cap.aUpload"),
])

// MARK: - Store-Adressen (wie web StoreBadge.tsx / ConnectIqButton.tsx)

/// Dieselbe URL wie in GarminPairView — dort ist sie `private`, deshalb hier unter eigenem Namen
/// statt einer geteilten Konstante quer durch die Datei-Sichtbarkeiten.
private let GUIDE_URL_CONNECT_IQ = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351"
private let GUIDE_URL_APP_STORE = "https://apps.apple.com/app/id6783975714"
private let GUIDE_URL_PLAY = "https://play.google.com/store/apps/details?id=org.pumpfoil.app"
private let GUIDE_URL_ZEPP_IOS = "https://apps.apple.com/app/id1127269366"
private let GUIDE_URL_ZEPP_ANDROID = "https://play.google.com/store/apps/details?id=com.huami.watch.hmwatchmanager"
private let GUIDE_URL_APPGALLERY = "https://appgallery.huawei.com/app/detail?id=org.pumpfoil.huawei"

// MARK: - Kompatibilitaet

/// Uhren-Tabelle wie web WatchMatrix.tsx (dort Kacheln auf dem Handy): Name, Modellzeile, Hinweis, GPS/Puls/Pumps
/// (✓ / ~ / –) und Status bzw. Store-Link oder Konto-Hinweis. `sub` bleibt unuebersetzt (Eigennamen).
private struct UhrZeile: Identifiable {
    let name: String
    let sub: String
    let gps: Character
    let hr: Character
    let pump: Character
    let status: String
    let note: String
    var links: [(String, String)] = []
    var konto: String? = nil
    var subKey: String? = nil
    var id: String { name }
}

private let UHREN_ZEILEN: [UhrZeile] = [
    UhrZeile(name: "Garmin", sub: "Connect IQ · Fenix, Forerunner, Epix …", gps: "y", hr: "y", pump: "y", status: "avail",
             note: "watches.nGarmin", links: [("Connect IQ Store", GUIDE_URL_CONNECT_IQ)]),
    UhrZeile(name: "Apple Watch", sub: "watchOS", gps: "y", hr: "y", pump: "y", status: "avail",
             note: "watches.nApple", links: [("App Store", GUIDE_URL_APP_STORE)]),
    UhrZeile(name: "Wear OS", sub: "Samsung Galaxy, Google Pixel, TicWatch …", gps: "y", hr: "y", pump: "y", status: "avail",
             note: "watches.nWear", links: [("Google Play", GUIDE_URL_PLAY)]),
    UhrZeile(name: "Amazfit", sub: "Zepp OS", gps: "y", hr: "y", pump: "p", status: "avail", note: "watches.nAmazfit",
             links: [("Zepp · App Store", GUIDE_URL_ZEPP_IOS), ("Zepp · Google Play", GUIDE_URL_ZEPP_ANDROID)]),
    UhrZeile(name: "Huawei Watch 5", sub: "HarmonyOS 5/6 · AppGallery", gps: "y", hr: "y", pump: "y", status: "avail",
             note: "watches.nHuaweiW5", links: [("AppGallery → „Pumpfoil\"", GUIDE_URL_APPGALLERY)]),
    UhrZeile(name: "Huawei", sub: "Lite Wearable (GT 3–7, Fit 2–5, D2)", gps: "y", hr: "y", pump: "p", status: "planned",
             note: "watches.nHuawei"),
    UhrZeile(name: "Polar", sub: "Vantage, Grit X …", gps: "y", hr: "y", pump: "n", status: "import",
             note: "watches.nPolar", konto: "watches.linkAccount"),
    UhrZeile(name: "Suunto", sub: "Race, Vertical …", gps: "y", hr: "y", pump: "n", status: "import",
             note: "watches.nSuunto", konto: "watches.linkAccount"),
    UhrZeile(name: "Xiaomi", sub: "Redmi Watch, Watch S …", gps: "y", hr: "y", pump: "n", status: "import",
             note: "watches.nXiaomi", konto: "watches.linkViaSuunto"),
    UhrZeile(name: "COROS", sub: "Apex, Vertix …", gps: "y", hr: "y", pump: "n", status: "import",
             note: "watches.nSuunto", konto: "watches.linkAccount"),
    UhrZeile(name: "Fitbit", sub: "—", gps: "n", hr: "n", pump: "n", status: "no", note: "watches.nFitbit"),
    UhrZeile(name: "Strava", sub: "", gps: "y", hr: "y", pump: "n", status: "nope", note: "watches.nStrava",
             subKey: "watches.subStrava"),
]

private struct UhrenMatrix: View {
    let lang: String

    var body: some View {
        Section {
            Text(Loc.t("watches.intro", lang)).font(.footnote).foregroundStyle(.secondary)
            ForEach(UHREN_ZEILEN) { z in zeile(z) }
            legende
            Text(Loc.t("watches.foot", lang)).font(.caption).foregroundStyle(.secondary)
        } header: {
            Text(Loc.t("watches.title", lang))
        }
    }

    private func zeile(_ z: UhrZeile) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(z.name).font(.headline)
            Text(z.subKey.map { Loc.t($0, lang) } ?? z.sub).font(.caption).foregroundStyle(.secondary)
            Text(Loc.t(z.note, lang)).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 16) {
                faehigkeit("watches.colGps", z.gps)
                faehigkeit("watches.colHr", z.hr)
                faehigkeit("watches.colPump", z.pump)
            }
            .font(.subheadline)
            statusZelle(z)
        }
        .padding(.vertical, 2)
    }

    private func faehigkeit(_ key: String, _ c: Character) -> some View {
        HStack(spacing: 4) {
            Text(Loc.t(key, lang))
            zeichen(c)
        }
    }

    @ViewBuilder private func zeichen(_ c: Character) -> some View {
        switch c {
        case "y": Image(systemName: "checkmark").foregroundStyle(.green).fontWeight(.bold)
        case "p": Text("~").bold().foregroundStyle(.orange)
        default: Text("–").bold().foregroundStyle(.secondary)
        }
    }

    // Store-Link(s), Konto-Hinweis oder Status — wie die Statusspalte im Web.
    @ViewBuilder private func statusZelle(_ z: UhrZeile) -> some View {
        if !z.links.isEmpty {
            HStack(spacing: 14) {
                ForEach(z.links.indices, id: \.self) { i in Link(z.links[i].0, destination: URL(string: z.links[i].1)!) }
            }
            .font(.subheadline)
            .buttonStyle(.borderless)
        } else if let k = z.konto {
            Label(Loc.t(k, lang), systemImage: "checkmark").font(.caption).foregroundStyle(.secondary)
        } else {
            Text(Loc.t("watches.st.\(z.status)", lang))
                .font(.caption.weight(.medium))
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Capsule().fill(statusFarbe(z.status).opacity(0.15)))
                .foregroundStyle(statusFarbe(z.status))
        }
    }

    private func statusFarbe(_ s: String) -> Color {
        switch s {
        case "planned": return .blue
        case "no", "nope": return .red
        default: return .green
        }
    }

    private var legende: some View {
        HStack(spacing: 14) {
            Label(Loc.t("watches.legYes", lang), systemImage: "checkmark")
            Text("~ " + Loc.t("watches.legPartial", lang))
            Text("– " + Loc.t("watches.legNo", lang))
        }
        .font(.caption).foregroundStyle(.secondary)
    }
}
