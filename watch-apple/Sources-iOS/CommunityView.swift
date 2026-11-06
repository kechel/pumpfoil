import SwiftUI

// Community: Stats, darunter Reiter Rekorde & Bestenliste · Medien · Teams & Events (App-Port Phase 8, 04.11.2026;
// spiegelt web/pages/Home.tsx + Android CommunityScreen). Spots und Routen stehen unter „Spots".
struct CommunityView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    // Programmatische Navigation: die Rekord-/Medien-Kacheln sind MEHRERE Links in EINER
    // List-Zeile — dort aktiviert die Zeile zusaetzlich einen Link und es liegen ZWEI Ziele
    // auf dem Stapel (Jans "Zurueck geht eine Session zurueck", nur aus Rekorden). Buttons,
    // die selbst GENAU EIN SessionDest anhaengen, machen den Push eindeutig.
    @State private var navPath = NavigationPath()
    // Der Social-Feed haelt seinen Zustand HIER, nicht in der Section: das Vollbild darf nicht
    // an einer List-Zeile haengen, sonst raeumt SwiftUI es beim ersten Antippen gleich wieder
    // ab (Jan, 31.08.). Details an `SocialFeedModell`.
    @StateObject private var social = SocialFeedModell()

    @State private var records: [String: PeriodRecords]?
    @State private var leaders: Leaders?
    @State private var media: [MediaItem] = []
    @State private var topLiked: [CommunityItem] = []
    @State private var topKommentiert: [CommunityItem] = []
    // Uhr-Layouts der Community (Top 5) — wie der Abschnitt auf der Community-Seite der PWA (Home.tsx).
    @State private var layoutsTop: [WatchLayoutBrief] = []
    @State private var cstats: Api.CommunityStats?
    @State private var loading = false
    // Reiter (App-Port Phase 8, 04.11.2026, wie web Home.tsx): Rekorde & Bestenliste · Medien · Teams & Events. Die letzte
    // Wahl gilt fuer die App-Sitzung. Spots und Routen stehen seitdem unter „Spots" (Reiter Liste/Routen).
    @State private var tab: String = ReiterSpeicher.von("community", "bestenliste")
    // Abzeichen am Reiter „Teams & Events" (web 5ac875bc, 06.11.2026): LIVE, solange ein globales Event laeuft, sonst die
    // Zahl der bald beginnenden (dieselbe Liste wie der Abschnitt „Globale Events").
    @State private var eventAbzeichen: ReiterAbzeichen? = nil
    @State private var error: String?
    @State private var period = "10d"
    // Foil-Band („vergleichbare Foils") fuer Rekorde UND Bestenlisten — NICHT fuer Spots und
    // „Am besten bewertet" (Jans Vorgabe): dort geht es nicht um Vergleichbarkeit der Ausruestung.
    // Die Baender samt Session-/Fahrerzahl kommen vom Server, damit hier keine Grenzen fest
    // verdrahtet sind (s. FOIL_BANDS in server/app/api/community.py).
    @State private var bands: [FoilBand] = []
    // Filter der Rangliste merkt sich die App (web 05.11.2026: „browser soll sich alle merken"), Schluessel wie im Web;
    // den Zeitraum bewusst nicht (sonst greift die Heute/10-Tage-Automatik nie mehr).
    @AppStorage("foil_komm_band") private var bandKey = "all"
    // accel / alle / Freunde als EIN gemerkter Wert (vorher drei Chips, seit 05.11.2026 ein Menue wie im Web).
    @AppStorage("foil_komm_genau") private var genau = "accel"
    private var accelWahl: Bool { genau != "alle" }
    // Ansicht „Freunde" (Jan, 15.10.2026): die ganze Seite nur ueber mich + meine Freunde — alles,
    // was accel/alle aendert, filtert dann auf Freunde. Die Statistikzeile oben bleibt global.
    // Ein reiner Filter, er gibt nichts frei (server app/freunde.py). Freunde zaehlen wie „alle".
    private var freunde: Bool { genau == "freunde" }
    private var accelOnly: Bool { accelWahl && !freunde }
    // Standard wie im Web: die laengste Laufdauer (Vorschlag eines Team-Kapitaens, 02.11.2026).
    @AppStorage("foil_leader_wahl") private var lbMetric = "run_time"
    // Zeitraum selbst gewaehlt? Sonst „Heute", sobald heute alle 10 Plaetze besetzt sind (web Home.tsx, 02.11.2026).
    @State private var periodeGewaehlt = false
    // Sportart wie im Web (19.10.2026): Rekorde und Bestenliste je Sportart; Standard Pumpfoil.
    @AppStorage("foil_komm_sport") private var sportart = "pumpfoil"
    @State private var sportListe: [String] = ["pumpfoil"]
    // Region nach Nationalitaet (web 05.11.2026, server app/regionen.py): "all" | "k:eu" … | "PL".
    @AppStorage("foil_komm_region") private var region = "all"
    @State private var regionen: Api.Regionen?
    private var istWind: Bool { Sportarten.windArtig(sportart) }   // Gruppe aus der Server-Liste (25.10.2026)
    private var istMotor: Bool { Sportarten.motor(sportart) }

    private let periods: [(String, String)] = [("today", "period.today"), ("yesterday", "period.yesterday"), ("10d", "period.10d"), ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all")]
    private let gridCols = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    private var periodLabel: String { Loc.t(periods.first { $0.0 == period }?.1 ?? "period.all", lang) }
    private var bandSuffix: String {
        guard let b = band, b.art != "alle" else { return "" }
        return " · " + bandLabel(b)
    }
    // Kennzahlen, Werte und Reihenfolge der Bestenliste: Bestenliste.swift (geteilt mit der Spot-Seite).
    private var lbMetrics: [(String, String)] { Bestenliste.arten(lang, wind: istWind, motor: istMotor) }
    private func lbList(_ lb: Leaders) -> [LeaderEntry] { Bestenliste.liste(lb, lbMetric) }
    private func lbValue(_ e: LeaderEntry) -> String { Bestenliste.wert(e, lbMetric) }
    private func lbUnit(_ e: LeaderEntry) -> String { Bestenliste.einheit(e, lbMetric, lang) }

    // Kopfzeilen + Toolbar ebenfalls als eigene Teile, Ladefolgen als Methoden: der Body war EIN
    // Ausdruck aus acht Abschnitten, drei Toolbar-Items und fünf Closures mit je derselben
    // dreiteiligen Ladefolge. Reihenfolge und Ladereihenfolge sind unverändert.
    var body: some View {
        NavigationStack(path: $navPath) {
            List {
                errorRow
                statsHeader
                Reiterleiste(reiter: communityReiter, aktiv: Binding(get: { tab }, set: { tab = $0; ReiterSpeicher.setze("community", $0) }))
                    .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                    .listRowSeparator(.hidden)
                switch tab {
                case "medien": medienTab
                case "teams": teamsTab
                default: bestenlisteTab
                }
            }
            .listStyle(.plain)   // .insetGrouped hatte großen Top-Inset -> zu viel Padding oben
            // Vollbild des Social-Feeds — an der LIST, nicht an der Zeile (s. oben).
            .fullScreenCover(isPresented: Binding(
                get: { social.offen != nil },
                set: { sichtbar in if !sichtbar { social.offen = nil } })
            ) {
                if let i = social.offen, social.items.indices.contains(i) {
                    SocialPlayerView(
                        lang: lang,
                        item: social.items[i],
                        hatZurueck: i > 0,
                        hatWeiter: i < social.items.count - 1,
                        onZurueck: { social.offen = i - 1 },
                        onWeiter: { social.offen = i + 1 },
                        onClose: { social.offen = nil }
                    )
                }
            }
            // EIN Ziel fuer alle Session-Links dieses Stapels (Rekorde, Medien, Zeilen) —
            // wert-basiert statt closure-basiert, s. SessionDest in Models.swift.
            .navigationDestination(for: SessionDest.self) { d in
                SessionDetailView(id: d.id, dataVersion: d.dataVersion)
            }
            // Team-Events, „Alle Events", „Alle Teams" (TeamsListen.swift)
            .navigationDestination(for: TeamsZiel.self) { z in TeamsZielView(ziel: z) }
            .navigationTitle(Loc.t("nav.community", lang))
            .brandToolbar(Loc.t("nav.community", lang), feedbackUrl: "/community")
            .toolbar { communityToolbar }
            .overlay { if loading && records == nil { ProgressView() } }
            .refreshable { await reloadAll() }
            .task { if records == nil { await reloadAll() } }
            .task { await heuteVorwaehlen() }
            .task { await eventAbzeichenLaden() }
            // „Neueste Medien" bei jedem Betreten auffrischen (gelöschte Fotos sofort weg, wie PWA).
            .onAppear { Task { await refreshMedia() } }
            .onChange(of: genau) { _ in Task { await reloadAll() } }
            .onChange(of: region) { _ in Task { await reloadBand() } }
            .onChange(of: period) { _ in Task { await reloadPeriod() } }
            // Foil-Band gewechselt -> Rekorde UND Bestenlisten neu holen. Fehlte bis 01.09.
            // (Jans Befund im Simulator): die Auswahl aenderte nur die Beschriftung, weil ein
            // .onChange fuer bandKey nicht existierte. Bewusst NICHT reloadAll(): das holt auch
            // die Bandliste und kann bandKey selbst zurueckstellen (Endlosschleife).
            .onChange(of: bandKey) { _ in Task { await reloadBand() } }
            // Sportart gewechselt: Rekorde + Bestenliste neu; ausgeblendete Kennzahl zuruecksetzen.
            .onChange(of: sportart) { _ in
                // Nicht mehr angebotene Liste -> die erste der neuen Reihe (web: arten[0]).
                if !lbMetrics.contains(where: { $0.0 == lbMetric }) { lbMetric = lbMetrics.first?.0 ?? "sessions" }
                Task { await reloadBand() }
                Task { await heuteVorwaehlen() }
                Task { await regionenLaden() }
            }
            .task { await regionenLaden() }
            .task { sportListe = sortiereSports(((try? await Api.communitySports()) ?? []).map { $0.sport }.filter { !$0.isEmpty }, lang: lang)
                    if sportListe.isEmpty { sportListe = ["pumpfoil"] } }
        }
    }

    private var communityReiter: [ReiterDef] {
        [ReiterDef(id: "bestenliste", label: Loc.t("tab.rankings", lang)), ReiterDef(id: "medien", label: Loc.t("tab.media", lang)),
         ReiterDef(id: "teams", label: Loc.t("land.teamsTitle", lang), abzeichen: eventAbzeichen)]
    }

    private func eventAbzeichenLaden() async {
        guard let l = try? await Api.teamsEventsAktuell() else { return }
        eventAbzeichen = reiterAbzeichen(l)
    }

    // Rekorde und Bestenliste in EINER Ansicht (Jan, 02.11.2026: die Kacheln passen gut ueber die Bestenlisten).
    // Rangliste nach Oleks Entwurf (web Home.tsx, 05.11.2026): oben EINE Zeile fuer alles (Zeitraum, Region, Sportart),
    // darunter die Bestenliste der Mitglieder mit ihren eigenen Menues (Kennzahl, accel/alle/Freunde, Foil), dann die
    // der Teams (Kennzahl, Beste N), zuletzt die Rekord-Kacheln.
    @ViewBuilder private var bestenlisteTab: some View {
        filterSection
        leaderboardSection
        TeamBestenlistenSection(lang: lang, period: period, sport: sportart, region: region,
                                titel: Loc.t("home.leaderboards", lang) + " – " + Loc.t("team.community", lang))
        recordsSection
    }

    // Medien: neueste Fotos/Videos, Best bewertet (mit derselben Zeitwahl), Social-Feed, Uhr-Layouts — wie im Web.
    // Der Social-Feed laedt sich selbst; ist nichts freigegeben oder der Nutzer unter 13, zeichnet er gar nichts.
    @ViewBuilder private var medienTab: some View {
        mediaFeedSection
        Section { zeitChips }
        topLikedSection
        topKommentiertSection
        SocialFeedSection(lang: lang, modell: social)
        layoutsSection
    }

    // Teams & Events: oben die Team-Bestenlisten (Jan, 03.11.2026), darunter laufende & kommende Events, dann die
    // aktivsten Teams.
    // Die Team-Bestenlisten stehen seit 05.11.2026 im Reiter Rekorde & Bestenliste (Oleks Entwurf).
    @ViewBuilder private var teamsTab: some View {
        TeamEventsAbschnitt(lang: lang, pfad: $navPath)
        // Aktivste Teams + „Alle Teams" / „Team gruenden" (wie web Home.tsx, 04.11.2026).
        AktivsteTeamsAbschnitt(lang: lang, pfad: $navPath)
    }

    private var zeitChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(periods, id: \.0) { id, key in chip(Loc.t(key, lang), period == id) { periodeGewaehlt = true; period = id } }
            }
        }
    }

    @ViewBuilder private var errorRow: some View {
        if let error { Text(error).foregroundStyle(.secondary) }
    }

    @ViewBuilder private var statsHeader: some View {
        if let cs = cstats {
            CommunityStatsText(stats: cs, lang: lang)
                .font(.caption)
                .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
        }
    }

    @ViewBuilder private var recordsSection: some View {
        if records != nil {
            Section(Loc.t("side.records", lang) + bandSuffix) {
                recordGrid(records?[period], showSpot: true)
                QuellenZeile(quellen: records?[period]?.quellen, lang: lang)
            }
        }
    }

    private var sportPicker: some View {
        Picker(Loc.t("sport.choose", lang), selection: $sportart) {
            // Die gewaehlte Sportart steht immer zur Wahl (gemerkt, auch wenn die Liste sie gerade nicht enthaelt).
            ForEach(sportListe.contains(sportart) ? sportListe : sportListe + [sportart], id: \.self) { sp in
                Text(Loc.t("cls.sport.\(sp)", lang)).tag(sp)
            }
        }
    }

    @ToolbarContentBuilder private var communityToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            NavigationLink { FoilStatsView() } label: { Image(systemName: "figure.surfing") }
        }
        ToolbarItem(placement: .topBarLeading) {
            NavigationLink { WatchStatsView() } label: { Image(systemName: "applewatch") }
        }
        ToolbarItem(placement: .topBarTrailing) { SyncButton() }
    }

    // MARK: - Rekord-Grid

    // Die `id` MUSS stabil sein: `recordRows()` laeuft bei jedem Neuzeichnen, mit `UUID()` bekam
    // jede Zeile dabei eine NEUE Identitaet. SwiftUI hat die NavigationLinks darunter deshalb
    // verworfen und neu aufgebaut — und damit eine laufende Navigation zerlegt: nach „zurueck"
    // landete man irgendwo statt auf der Community-Seite (Jans Befund, mehrfach). Der Metrik-Key ist
    // stabil und eindeutig, also ist er die Identitaet.
    // `RecRow`/`rekordZeilen` stehen in SpotRecordsView.swift — dieselbe Datenlogik nutzt die
    // Spot-Ansicht (Jan, 07.09.: dort fehlten die Rekorde ganz). Nur die DARSTELLUNG ist hier
    // eigen, weil sie an `navPath` und die Avatar-/Track-Helfer dieser Ansicht haengt.
    private func recordRows(_ r: PeriodRecords?) -> [RecRow] { rekordZeilen(r, lang: lang, sport: sportart) }

    @ViewBuilder private func recordGrid(_ r: PeriodRecords?, showSpot: Bool) -> some View {
        let rows = recordRows(r)
        if rows.allSatisfy({ $0.entry == nil }) {
            Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
        } else {
            LazyVGrid(columns: gridCols, spacing: 8) {
                ForEach(rows) { t in
                    if let sid = t.entry?.session_id {
                        Button { navPath.append(SessionDest(id: sid)) } label: { recordCell(t, showSpot: showSpot) }
                            .buttonStyle(.plain)
                    } else {
                        recordCell(t, showSpot: showSpot)
                    }
                }
            }
            .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
        }
    }

    private func recordCell(_ t: RecRow, showSpot: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(t.value).font(.title3).bold().foregroundStyle(Color.accentColor).lineLimit(1)
            Text(t.label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            if let e = t.entry {
                if let n = e.name, !n.isEmpty {
                    HStack(spacing: 4) {
                        recAvatar(e.avatar_url, userId: e.user_id)
                        Text(n).font(.caption).foregroundStyle(Color.accentColor).lineLimit(1)
                    }
                }
                let sub = [shortDate(e.started_at, e.tz), showSpot ? e.spot : nil].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !sub.isEmpty { Text(sub).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .overlay(alignment: .trailing) { recTrack(t.entry?.track_preview) }
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Mini-Track der Rekord-Session, wie in der PWA (Home.tsx: halbtransparent rechts in der
    // Kachel). Als Overlay, nicht als Layout-Element: ohne Vorschau bleibt die Kachel exakt
    // gleich groß (kein Platzhalter, kein Sprung). Farbe = Akzentfarbe -> beide Farbmodi ok.
    @ViewBuilder private func recTrack(_ data: String?) -> some View {
        if let d = data, !d.isEmpty {
            TrackPreviewView(data: d)
                .frame(width: 56, height: 40)
                .opacity(0.7)
                .padding(.trailing, 6)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Kleine Bausteine

    private func chip(_ label: String, _ on: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).font(.caption).padding(.horizontal, 12).padding(.vertical, 6)
                .background(on ? Color.accentColor : Color(.tertiarySystemBackground))
                .foregroundStyle(on ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // Punkt + Tipp nur am vorhandenen Bild: ohne Profilbild zeigt die Kachel wie bisher nur den
    // Namen, ein Punkt im Leeren waere keinem Bild zuzuordnen.
    @ViewBuilder private func recAvatar(_ url: String?, userId: Int?) -> some View {
        if let u = Api.mediaURL(url) {
            NetzBild(url: u) { stand in
                    switch stand {
                    case .da(let img): img.resizable().scaledToFill()
                    default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                    }
                }
            .frame(width: 18, height: 18).clipShape(Circle())
            .profilbild(userId: userId, size: 18)
        }
    }

    /// Ab wie vielen FAHRERN ein Foil-Band angeboten wird. Ein „Rekord" aus zwei Fahrern ist
    /// keiner, sondern eine persoenliche Bestleistung mit Etikett. Gleiche Schwelle wie in der PWA.
    private var minBandFahrer: Int { 3 }

    private var band: FoilBand? { bands.first { $0.key == bandKey } }
    private var sichtbareBands: [FoilBand] { bands.filter { $0.art == "alle" || $0.fahrer >= minBandFahrer } }

    /// Beschriftung eines Foil-Bandes — EINE Stelle, damit Auswahl und Bestenlisten-Ueberschrift
    /// nie auseinanderlaufen. Reine Zahlenbereiche brauchen keinen Uebersetzungs-Schluessel.
    private func bandLabel(_ b: FoilBand) -> String {
        func z(_ v: Double?) -> String {
            guard let v else { return "" }
            return v == v.rounded() ? String(Int(v)) : String(v)
        }
        switch b.art {
        case "alle": return Loc.t("cr.foilAll", lang)
        case "eigenes": return Loc.t("cr.foilMine", lang)
        case "ar":
            return b.von != nil
                ? Loc.t("cr.foilHighAspect", lang).replacingOccurrences(of: "{n}", with: z(b.von))
                : Loc.t("cr.foilThick", lang).replacingOccurrences(of: "{n}", with: z(b.bis))
        default:
            if b.von != nil && b.bis != nil { return "\(z(b.von))–\(z(b.bis)) cm²" }
            if b.bis != nil { return Loc.t("cr.foilUnder", lang).replacingOccurrences(of: "{n}", with: z(b.bis)) }
            return "\(z(b.von))+ cm²"
        }
    }

    // In typisierte Teil-Views zerlegt (Type-Checker-Hänger beim Archivieren) — [[ios-swift-typecheck-hang]].
    // Oben: Zeitraum, darunter Region und Sportart; bei gewaehlter Region die Grundlage und, wer selbst keine
    // Nationalitaet hat, warum er fehlt.
    @ViewBuilder private var filterSection: some View {
        Section {
            zeitChips
            HStack(spacing: 8) {
                if regionKeys.count > 1 { regionMenu }
                Spacer(minLength: 4)
                if sportListe.count > 1 || sportart != "pumpfoil" { sportPicker }
            }
            if region != "all" { regionHinweis }
        }
    }

    // Global, Kontinente (fest vom Server), eigenes Land (immer), dann die uebrigen Laender alphabetisch in der App-Sprache.
    private var regionKeys: [String] {
        let ich: String? = regionen?.ich
        var roh: [String] = ["all"] + (regionen?.regionen ?? []).map { $0.key } + [region]
        if let ich { roh.append(ich) }
        var gesehen = Set<String>()
        let alle: [String] = roh.filter { gesehen.insert($0).inserted }
        let kont: [String] = alle.filter { $0 == "all" || $0.hasPrefix("k:") }
        let rest: [String] = alle.filter { !kont.contains($0) && $0 != ich }
            .sorted { Laender.name($0, lang).localizedCompare(Laender.name($1, lang)) == .orderedAscending }
        return kont + (ich.map { [$0] } ?? []) + rest
    }

    /// Ein natives Menue kann nur Text: Laender mit Flaggen-Emoji, Kontinente und Global mit dem Globus (Jan, 05.11.2026:
    /// „in dem dropdown bitte die flagge / regionsskizze mit anzeigen").
    private func regionText(_ k: String) -> String {
        switch k {
        case "all": return "🌐 " + Loc.t("region.global", lang)
        case "k:na", "k:sa": return "🌎 " + Loc.t("region." + String(k.dropFirst(2)), lang)
        case "k:as", "k:oc": return "🌏 " + Loc.t("region." + String(k.dropFirst(2)), lang)
        default:
            if k.hasPrefix("k:") { return "🌍 " + Loc.t("region." + String(k.dropFirst(2)), lang) }
            return (teamFlaggenEmoji(k).map { $0 + " " } ?? "") + Laender.name(k, lang)
        }
    }

    private var regionMenu: some View {
        Picker(Loc.t("region.basis", lang), selection: $region) {
            ForEach(regionKeys, id: \.self) { k in Text(regionText(k)).tag(k) }
        }
        .pickerStyle(.menu)
    }

    @ViewBuilder private var regionHinweis: some View {
        Text(Loc.t("region.basis", lang)).font(.footnote).foregroundStyle(.secondary)
        if let r = regionen, r.ich == nil {
            Text(Loc.t("region.ohneLand", lang) + " " + Loc.t("profile.land", lang) + " → " + Loc.t("ptab.me", lang))
                .font(.footnote).foregroundStyle(.orange)
        }
    }

    // Filter nur fuer die Mitglieder (und die Kacheln): Kennzahl, accel/alle/Freunde, Foil-Band.
    private var mitgliederMenues: some View {
        HStack(spacing: 8) {
            Picker(Loc.t("community.leaderboard", lang), selection: $lbMetric) {
                ForEach(lbMetrics, id: \.0) { id, label in Text(label).tag(id) }
            }
            .pickerStyle(.menu)
            Spacer(minLength: 4)
            Picker("accel", selection: $genau) {
                Text(Loc.t("side.onlyAccel", lang).capitalized).tag("accel")
                Text(Loc.t("side.all", lang).capitalized).tag("alle")
                Text(Loc.t("friends.title", lang)).tag("freunde")
            }
            .pickerStyle(.menu)
        }
    }

    // Foil-Band. Reihenfolge kommt vom Server (Nuetzlichstes oben); die Sessionzahl steht dabei, weil jede Auswahl
    // ausser „Alle Foils" den Topf verkleinert.
    @ViewBuilder private var bandMenue: some View {
        if sichtbareBands.count > 1 {
            Picker(Loc.t("cr.foilAll", lang), selection: $bandKey) {
                ForEach(sichtbareBands) { b in Text(bandLabel(b) + (b.art == "alle" ? "" : " (\(b.sessions))")).tag(b.key) }
            }
            .pickerStyle(.menu)
        }
    }

    @ViewBuilder private var mediaFeedSection: some View {
        if !media.isEmpty {
            Section(Loc.t("community.latestMedia", lang)) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(media) { m in
                            Button { navPath.append(SessionDest(id: m.session_id)) } label: { mediaThumb(m) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var leaderboardSection: some View {
        // Kopf und Menues bleiben auch bei leerer Liste stehen — man soll die Filter zurueckstellen koennen.
        Section(Loc.t("home.leaderboards", lang) + " – " + Loc.t("team.mitglieder", lang)) {
            mitgliederMenues
            bandMenue
            if let lb = leaders {
                // Alle 10 wie im Web: die eigene Zeile darunter (Olek, 01.11.2026) gibt der Server nur, wenn man nicht
                // unter den ersten 10 steht — bei prefix(5) fehlten sonst die Plaetze 6 bis 10.
                let list = Array(lbList(lb).prefix(10))
                if list.isEmpty {
                    Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(Array(list.enumerated()), id: \.offset) { i, e in leaderTap(i + 1, e) }
                    if let ich = lb.me?[lbMetric] ?? nil, let r = ich.rank {
                        Text("⋮").frame(maxWidth: .infinity).foregroundStyle(.secondary)
                        leaderTap(r, ich, ich: true)
                    }
                    QuellenZeile(quellen: lb.quellen, lang: lang)
                    teilenZeile(lb)
                }
            }
        }
    }

    /// Teilen der Bestenliste nur als Bild (derselbe Dialog wie bei den Team-Bestenlisten, Vorschlag eines
    /// Team-Kapitaens 02.11.2026). Der Link ist am 05.11.2026 raus (Jan: „sharen als link bei leaderboards ueberall
    /// raus, nur das bild") — /community ist nur fuer Angemeldete, nach aussen teilt man das Bild.
    private func teilenZeile(_ lb: Leaders) -> some View {
        HStack(spacing: 16) {
            Button { bildBauen(lb) } label: {
                Label(Loc.t("team.bild.titel", lang), systemImage: "square.and.arrow.up").font(.subheadline)
            }
            .buttonStyle(.borderless)
        }
    }

    /// Wie web BestenlisteBildDialog: Titel = die Liste, darunter Sportart · Zeitraum · Foil-Band · Datum.
    private func bildBauen(_ lb: Leaders) {
        let titel: String = lbMetrics.first { $0.0 == lbMetric }?.1 ?? ""
        var unter: [String] = [Loc.t("cls.sport." + sportart, lang), periodLabel]
        if let b = band, b.art != "alle" { unter.append(bandLabel(b)) }
        Bestenliste.bildZeigen(lb, key: lbMetric, titel: titel, unter: unter, lang: lang)
    }

    /// Ohne eigene Wahl: „Heute", sobald heute alle 10 Plaetze der Bestenliste besetzt sind (web Home.tsx, 02.11.2026 —
    /// „wenn heute mit heute uebereinstimmt, wirkt die Seite gepflegt"), sonst bleibt es bei 10 Tagen.
    private func heuteVorwaehlen() async {
        guard !periodeGewaehlt else { return }
        let sp: String = sportart
        guard let d = try? await Api.leaders(period: "today", accelOnly: accelOnly, sport: sp) else { return }
        if !periodeGewaehlt && sp == sportart && (d.sessions ?? []).count >= 10 { period = "today" }
    }

    /// Einzellauf-Listen: die ganze Zeile oeffnet die Session (01.11.2026, wie das Web); das Profilbild ist dann kein
    /// eigener Link, sonst teilten sich zwei Tippziele eine Zeile.
    @ViewBuilder private func leaderTap(_ platz: Int, _ e: LeaderEntry, ich: Bool = false) -> some View {
        if let sid = e.session_id {
            Button { navPath.append(SessionDest(id: sid)) } label: { leaderRow(platz, e, avatarLink: false, ich: ich).contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else {
            leaderRow(platz, e, ich: ich)
        }
    }

    @ViewBuilder private func leaderRow(_ platz: Int, _ e: LeaderEntry, avatarLink: Bool = true, ich: Bool = false) -> some View {
        HStack(spacing: 8) {
            // Feste Spalten (05.11.2026, Jan: „ausrichtung noch fixen"): Platz, Profilbild (ohne Bild die Initiale), Flagge.
            Text("\(platz)").font(.subheadline).bold().foregroundStyle(Color.accentColor).frame(width: 26, alignment: .leading)
            AvatarView(name: e.name, url: Api.mediaURL(e.avatar_url), size: 28, userId: e.user_id, link: avatarLink)
            LandFlagge(land: e.land)   // nach dem Profilbild, Platz bleibt auch ohne Land (web Flagge)
            Text(e.name ?? "—").lineLimit(1)
            Spacer()
            Text(lbValue(e)).fontWeight(.semibold)
            Text(lbUnit(e)).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.horizontal, ich ? 4 : 0)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.accentColor.opacity(ich ? 0.6 : 0), lineWidth: 1))
    }

    @ViewBuilder private var topLikedSection: some View {
        if !topLiked.isEmpty {
            Section("\(Loc.t("community.topRated", lang)) · \(periodLabel)") {
                ForEach(topLiked) { s in
                    NavigationLink(value: SessionDest(id: s.id)) { CommunityRow(item: s) }
                }
            }
        }
    }

    // Meist kommentiert (PWA Home.tsx), derselbe Zeitraum wie Best bewertet.
    @ViewBuilder private var topKommentiertSection: some View {
        if !topKommentiert.isEmpty {
            Section("\(Loc.t("home.topCommented", lang)) · \(periodLabel)") {
                ForEach(topKommentiert) { s in
                    NavigationLink(value: SessionDest(id: s.id)) { CommunityRow(item: s) }
                }
            }
        }
    }

    // Uhr-Layouts der Community: die fuenf meistgenutzten als Vorschau, darunter EIN Link in die ganze
    // Galerie (bisher nur ueber Profil → Datenfelder erreichbar). Zwei getrennte Zeilen, damit nicht
    // ein Tipp mehrere Ziele ausloest. Nichts veroeffentlicht -> kein leerer Abschnitt.
    @ViewBuilder private var layoutsSection: some View {
        if !layoutsTop.isEmpty {
            Section(Loc.t("home.layouts", lang)) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(layoutsTop) { l in layoutKachel(l) }
                    }
                    .padding(.vertical, 4)
                }
                NavigationLink(Loc.t("home.layoutsAll", lang)) {
                    LayoutGalleryView(lang: lang)
                }
            }
        }
    }

    private func layoutKachel(_ l: WatchLayoutBrief) -> some View {
        let w: Int = l.authored_w ?? 240
        let h: Int = l.authored_h ?? 240
        return VStack(spacing: 4) {
            WatchLayoutPreview(elements: l.elements ?? [], bgColor: l.bg_color ?? 0, shape: l.shape ?? "round",
                               w: w, h: h, px: 96, pageCount: 1, pageIndex: 0, lang: lang)
            Text(l.name).font(.caption).lineLimit(1).frame(maxWidth: 96)
        }
    }

    @ViewBuilder private func mediaThumb(_ m: MediaItem) -> some View {
        // Video-Thumb über den servereigenen Proxy (zuverlässig, wie Sessions/Detail) statt
        // img.youtube.com direkt — letzteres lieferte im Feed leere Kacheln.
        let thumb: URL? = m.kind == "video"
            ? youtubeId(m.youtube_url).flatMap { URL(string: "\(Api.baseURL)/api/public/video-thumb/\($0)") }
            : Api.mediaURL(m.url)
        ZStack {
            // NetzBild statt AsyncImage: beim Tab-Wechsel wurde sonst jedes Bild neu
            // angefordert, und zusammen mit der Feed-Galerie darueber blieben beide Zeilen
            // leer (Jan, 31.08.). Mit Cache passiert beim Zurueckkommen gar keine Anfrage.
            NetzBild(url: thumb) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFill()
                default:           Color(.tertiarySystemBackground)
                }
            }
            .frame(width: 150, height: 100).clipped()
            if m.kind == "video" {
                Image(systemName: "play.circle.fill").font(.title).foregroundStyle(.white.opacity(0.9))
            }
        }
        .frame(width: 150, height: 100).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func shortDate(_ iso: String?, _ tz: String?) -> String? {
        TimeFmt.shortDate(iso, tz)   // "dd.MM.yy" in Spot-Ortszeit
    }

    // MARK: - Laden

    // Dieselbe Folge wie vorher inline (Basis -> Zeitraum -> Spot-Rekorde), nur einmal benannt.
    private func reloadAll() async {
        layoutsTop = Array(((try? await Api.communityLayouts()) ?? []).prefix(5))
        await loadBase()
        await loadPeriod()
    }

    private func reloadPeriod() async {
        await loadPeriod()
    }

    private func refreshMedia() async {
        media = (try? await Api.latestPhotos(limit: 30, freunde: freunde)) ?? []
    }

    private func loadBase() async {
        loading = true; defer { loading = false }
        do {
            records = try await Api.communityRecords(accelOnly: accelOnly, foilBand: bandKey, sport: sportart, freunde: freunde,
                                                     region: region); error = nil
            let bs = (try? await Api.foilBands(accelOnly: accelOnly, freunde: freunde)) ?? []
            bands = bs
            // Zurueck auf „Alle Foils", wenn das gewaehlte Band durch den Wechsel zu duenn wurde —
            // sonst stuende man vor leeren Rekorden.
            if !bs.contains(where: { $0.key == bandKey && ($0.art == "alle" || $0.fahrer >= minBandFahrer) }) {
                bandKey = "all"
            }
            cstats = try? await Api.communityStats()
            media = (try? await Api.latestPhotos(limit: 30, freunde: freunde)) ?? []
        } catch { self.error = error.localizedDescription }
    }

    /// Nur die bandabhaengigen Teile: Rekorde + Bestenlisten. Spots und Best-bewertet haengen
    /// bewusst NICHT am Band (dort ist der Spot der Vergleich, nicht das Foil).
    private func reloadBand() async {
        records = (try? await Api.communityRecords(accelOnly: accelOnly, foilBand: bandKey, sport: sportart, freunde: freunde,
                                                   region: region)) ?? records
        leaders = try? await Api.leaders(period: period, accelOnly: accelOnly, foilBand: bandKey, freunde: freunde, sport: sportart,
                                         region: region)
    }

    /// Waehlbare Regionen (Server rechnet immer ueber Allzeit) — nur bei Start und Sportwechsel.
    private func regionenLaden() async {
        if let r = try? await Api.communityRegionen(sport: sportart) { regionen = r }
    }

    private func loadPeriod() async {
        leaders = try? await Api.leaders(period: period, accelOnly: accelOnly, foilBand: bandKey, freunde: freunde, sport: sportart,
                                         region: region)
        topLiked = (try? await Api.topLiked(period: period, freunde: freunde)) ?? []
        topKommentiert = (try? await Api.topCommented(period: period, freunde: freunde)) ?? []
    }
}

// Community-Feed-Zeile (eigene Shape: name/spot/avatar_url/like_count).
struct CommunityRow: View {
    let item: CommunityItem
    @ObservedObject private var compare = CompareStore.shared
    @AppStorage("appLang") private var lang = "de"
    // Kacheln oder EINE Zeile je Session — derselbe Merker wie alle Listen (KompakteListe).
    @AppStorage(KompakteListe.key) private var kompakt = false

    var body: some View {
        zeile
            .contextMenu {
                Button {
                    compare.toggle(item.id)
                } label: {
                    Label(compare.contains(item.id) ? Loc.t("compare.remove", lang) : Loc.t("compare.add", lang),
                          systemImage: "arrow.left.arrow.right")
                }
            }
            .overlay(alignment: .leading) {
                if compare.contains(item.id) {
                    RoundedRectangle(cornerRadius: 3).fill(Color.accentColor).frame(width: 3)
                }
            }
    }

    @ViewBuilder private var zeile: some View {
        if kompakt { kompaktZeile } else { content }
    }

    // Zeilen-Ansicht wie die PWA mobil (SessionCard kompakt): oben Datum, Uhrzeit, Name, Spot;
    // unten Sportart, Kennzahlen und Herz — ohne Bilder, Setup und Geraet.
    private var kompaktZeile: some View {
        KompaktZeile(avatarName: item.name, avatarURL: Api.mediaURL(item.avatar_url),
                     avatarUserId: item.user_id,
                     datum: TimeFmt.kurzDatum(item.started_at, item.tz) ?? "",
                     zeit: TimeFmt.timeOnly(item.started_at, item.tz) ?? "",
                     name: item.name, spot: item.spot, abzeichen: sportLabel,
                     kennzahlen: statsText ?? "",
                     likeId: item.id, liked: item.liked ?? false, likeCount: item.like_count ?? 0,
                     kommentare: item.comment_count ?? 0)
    }

    // Zeile in Spalten zerlegt: die Zeile war EIN Ausdruck mit sieben Geschwistern, davon drei
    // optionale Bild-Zweige mit eigenen NetzBild-Zweigen — der teuerste Posten der Datei.
    private var content: some View {
        VStack(alignment: .leading, spacing: 6) {
            headerRow
            if let stats = statsText { Text(stats).font(.caption).lineLimit(1) }
        }
        .padding(.vertical, 4)
    }

    private var headerRow: some View {
        HStack(alignment: .top, spacing: 12) {
            avatarColumn
            infoColumn
            Spacer(minLength: 8)
            trackPreview
            photoThumb
            videoThumb
        }
    }

    private var avatarColumn: some View {
        VStack(spacing: 6) {   // Like unter dem Avatar (wie PWA), nicht in eigener Zeile rechts
            avatar
            LikeButton(sessionId: item.id, liked: item.liked ?? false, count: item.like_count ?? 0)
            KommentarZahl(n: item.comment_count ?? 0)
        }
    }

    private var infoColumn: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.name ?? dateText).font(.headline)
            if item.name != nil { Text(dateText).font(.caption).foregroundStyle(.secondary) }
            pillRow
            captionText
        }
    }

    // Spot · Stab · Mastlänge · Board · Uhr, davor das Sportart-Kennzeichen (nur wenn es KEIN
    // Pumpfoilen war). Je Teil nur, wenn hinterlegt — wie web/src/components/SessionCard.tsx.
    private var chipItems: [SessionChipItem] {
        sessionChipItems(sport: sportLabel, spot: item.spot, foil: foilChipText,
                         setup: item.setup, device: item.device_label, placement: item.placement,
                         ohneFoil: !Sportarten.foil(item.sport_class))
    }

    private var foilChipText: String {
        guard let f = item.foil else { return "" }
        return foilLabel(f.brand, f.model, f.size, f.aspect_ratio)
    }

    /// Anzeige-Name der Sportart, wenn die Session nicht als Pumpfoilen eingeordnet ist.
    private var sportLabel: String? {
        guard let sc = item.sport_class, !sc.isEmpty, sc != "pumpfoil" else { return nil }
        return Loc.t("cls.sport." + sc, lang)
    }

    @ViewBuilder private var pillRow: some View {
        let lines: [[SessionChipItem]] = sessionChipLines(chipItems)
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 3) {
                ForEach(lines.indices, id: \.self) { i in sessionChipLine(lines[i]) }
            }
        }
    }

    @ViewBuilder private var captionText: some View {
        if let cap = item.caption, !cap.isEmpty {
            Text(cap).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    @ViewBuilder private var trackPreview: some View {
        if let tp = item.track_preview {
            TrackPreviewView(data: tp).frame(width: 58, height: 42)
        }
    }

    @ViewBuilder private var photoThumb: some View {
        if let url = Api.mediaURL(item.thumb_url) {
            NetzBild(url: url) { stand in
                    switch stand {
                    case .da(let img): img.resizable().scaledToFill()
                    default: Color.secondary.opacity(0.15)
                    }
                }
            .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    @ViewBuilder private var videoThumb: some View {
        if let vid = youtubeId(item.youtube_url) {
            ZStack {
                NetzBild(url: videoThumbURL(vid)) { stand in
                    switch stand {
                    case .da(let img): img.resizable().scaledToFill()
                    default: Color.secondary.opacity(0.15)
                    }
                }
                .frame(width: 58, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                Image(systemName: "play.circle.fill").foregroundStyle(.white).font(.title3)
            }
        }
    }

    private func videoThumbURL(_ vid: String) -> URL? {
        URL(string: "\(Api.baseURL)/api/public/video-thumb/\(vid)")
    }

    private var statsText: String? {
        var parts: [String] = []
        if let r = item.runs, r > 0 {
            let unit: String = Loc.t(r == 1 ? "unit.run" : "unit.runs", lang)
            parts.append("\(r) \(unit)")
        }
        if Sportarten.foil(item.sport_class), let km = item.foiling_km, km > 0 { parts.append(String(format: "%.2f km", km)) }  // ohne Foil keine On-Foil-Strecke
        if let mx = item.max_speed_mps { parts.append(String(format: "max %.1f km/h", mx * 3.6)) }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    // Online-Punkt + Tipp auf die Foiler-Seite (OnlinePunkt.swift). Die Zeile selbst oeffnet die
    // Session; der Profilbild-Knopf ist `.borderless` und faengt seinen Tipp selbst ab.
    private var avatar: some View {
        avatarBild.profilbild(userId: item.user_id, size: 36)
    }

    @ViewBuilder private var avatarBild: some View {
        if let url = Api.mediaURL(item.avatar_url) {
            NetzBild(url: url) { stand in
                    switch stand {
                    case .da(let img): img.resizable().scaledToFill()
                    default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                    }
                }
            .frame(width: 36, height: 36).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.title3).foregroundStyle(Color.accentColor)
                .frame(width: 36, height: 36)
        }
    }

    private var dateText: String {
        sessionDateTime(item.started_at, item.ended_at, item.tz)
    }
}

/// Alle gemerkten Routen aller Spots (wie RoutenSection in web/src/pages/Home.tsx und
/// RoutenAbschnitt in der Android-App): dieselben Kaertchen wie unter der Spot-Karte, dazu der
/// Spotname, filterbar nach Gesamtlaenge. Ein Tipp oeffnet den Spot und ruft die Route dort in der
/// Planung auf. Nur Datum, nie wer.
struct RoutenAbschnitt: View {
    let lang: String
    @State private var routen: [GemerkteRoute]? = nil
    @State private var minKm: Double = 0
    @State private var maxKm: Double = 50
    private let obergrenze: Double = 50

    var body: some View {
        Group {
            if let alle = routen, !alle.isEmpty {     // noch keine gemerkt -> kein leerer Abschnitt
                Section(Loc.t("home.routes", lang)) {
                    regler(Loc.t("home.routesMin", lang), wert: minKm) { minKm = Swift.min($0, maxKm) }
                    regler(Loc.t("home.routesMax", lang), wert: maxKm) { maxKm = Swift.max($0, minKm) }
                    let passend: [GemerkteRoute] = alle.filter { r in
                        Double(r.meter) >= minKm * 1000 && (maxKm >= obergrenze || Double(r.meter) <= maxKm * 1000)
                    }
                    if passend.isEmpty {
                        Text(Loc.t("home.routesNone", lang)).font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(passend) { r in zeile(r) }
                }
            }
        }
        .task { if routen == nil { routen = (try? await Api.alleRouten()) ?? [] } }
    }

    private func regler(_ label: String, wert: Double, setz: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(label): " + (wert >= obergrenze ? Loc.t("home.routesNoLimit", lang) : "\(Int(wert)) km"))
                .font(.caption).foregroundStyle(.secondary)
            Slider(value: Binding(get: { wert }, set: { setz($0.rounded()) }), in: 0...obergrenze)
        }
    }

    @ViewBuilder private func zeile(_ r: GemerkteRoute) -> some View {
        if let name = r.spotName, !name.isEmpty {
            NavigationLink { SpotSessionsView(spot: name, vorgegebeneSpotId: r.spotId, routeId: r.id) } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if r.eigeneId != nil { Circle().fill(Color.accentColor).frame(width: 8, height: 8) }
                        Text("📍 \(name)").font(.subheadline.weight(.semibold))
                        if r.mitEigenen {
                            Text(Loc.t("routes.manualTag", lang)).font(.caption2)
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(Capsule().fill(Color.secondary.opacity(0.2)))
                        }
                    }
                    Text(text(r)).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func text(_ r: GemerkteRoute) -> String {
        let k = r.kurz
        return Loc.t("routes.savedChip", lang).replacingOccurrences(of: "{n}", with: "\(k.starts)")
            .replacingOccurrences(of: "{max}", with: "\(k.maxM)").replacingOccurrences(of: "{total}", with: "\(r.meter)")
            .replacingOccurrences(of: "{datum}", with: r.datum(lang))
    }
}
