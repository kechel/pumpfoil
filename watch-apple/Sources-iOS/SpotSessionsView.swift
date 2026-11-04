import SwiftUI

// Spot-Seite (Tippen auf einen Pin/Eintrag in den Spots) — seit dem App-Port (docs/UX-IA.md, Phase 9, 04.11.2026) mit
// Reitern wie im Web (`SpotBereich` in web/src/pages/Sessions.tsx): Rekorde · Sessions · Heatmap · Wetter · Beschreibungen.
// Heatmap und Beschreibungen nur mit Spot-Zeile (spot_id), wie dort.
//
// `eingebettet`: derselbe Inhalt in Home › Spots (Phase 4) — ohne eigene Liste und Toolbar, die Reiter unter der Spotzeile,
// darunter der Kopf mit Spotname und Link „Spot-Seite →". Der Reiter bleibt dort beim Spotwechsel stehen (eigener Bereich).
//
// ACHTUNG, DOPPELUNG: dasselbe zeigt `SessionsView` im Spot-Modus (dort ueber die Chips in der
// Sessionliste erreichbar). Die PWA hat nur EINE Ansicht — ein Klick auf der Spot-Karte fuehrt
// dort zu `/sessions?spot=…`. Die beiden iOS-Ansichten sind auseinandergelaufen: hier fehlten
// Rekorde UND Wetter, dort fehlten die Rekorde (Jan, 07.09.2026). Angeglichen sind sie jetzt,
// zusammengelegt gehoeren sie trotzdem — s. docs/TODO.md.
struct SpotSessionsView: View {
    let spot: String
    /// Vom Einstieg mitgegebene Spot-Zeile (Karte/Liste/Session). Ist sie da, wird nicht mehr
    /// gesucht — genau diese Suche hat die Beschreibungen verschluckt.
    var vorgegebeneSpotId: Int? = nil
    /// Sportart-Filter der Spot-Karte (27.09.2026), damit die Liste dieselbe Menge zeigt wie die
    /// Zahl am Pin. nil = Endpunkt-Default (Einstieg aus Session/Vergleich, unveraendert).
    var sport: String? = nil
    /// Gemerkte Route aus der Community-Liste: im Panel „Heatmap & Routen" direkt aufrufen.
    var routeId: Int? = nil
    var eingebettet: Bool = false
    @EnvironmentObject private var store: SessionStore
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [CommunityItem] = []
    @State private var loading = false
    @State private var error: String?
    // Automatik „Spot ohne eine einzige Session mit Beschleunigungsdaten": statt einer leeren Liste
    // einmal mit accel_only=false nachfragen und dann alle zeigen. Beides ist View-State dieses
    // Spots -> beim Verlassen/Wechseln wieder weg (NICHT gemerkt), es gilt wieder der Default.
    @State private var showAll = false
    @State private var autoTried = false
    // Beschreibungen haengen an der spot_id, hierher kommt nur der NAME (die Navigation ist
    // namensbasiert). Einmal ueber die Karte zuordnen; ohne Spot-Zeile bleibt es nil.
    @State private var spotId: Int?
    @State private var spotLabel: String?      // Gewaesser bzw. Steg/Ortslage, fuer den Titel
    @State private var weather: SpotWeather?
    // Sportarten-Filter DIESER Seite (28.10.2026): startet mit der Vorgabe der Spot-Karte, sonst „alle";
    // umgestellt ueber die Knoepfe im Rekord-Kasten (wie PWA/Android). Vorher stand er ohne Vorgabe fest
    // auf Pumpfoil, und der Sportart-Umschalter erschien nie.
    @State private var sportGewaehlt: String?
    private var aktSport: String { sportGewaehlt ?? sport ?? "all" }
    // Sportarten DIESES Spots fuer die Filter-Knoepfe (28.10.2026) und daraus die Sportart von Rekorden
    // und Heatmap (Filter, bei „Alle" Pumpfoil bzw. die erste des Spots).
    @State private var spotSports: [String] = []
    private var rekordSport: String? { rekordSportFuer(aktSport, spotSports) }
    // „Heatmap & Routen": Zustand hier (nicht in der Listenzeile), Lage des Spots fuer die Karte
    @State private var heatZustand: SpotPanelZustand? = nil
    @State private var spotOrt: (Double, Double)? = nil
    // Gewaehlter Reiter. Seite: Bereich "spot" (neuer Start = Rekorde), Home › Spots: eigener Bereich "homeSpot".
    // Kommt man ueber eine gemerkte Route, steht die Heatmap vorn (dort wird sie aufgerufen).
    @State private var spotTab: String

    init(spot: String, vorgegebeneSpotId: Int? = nil, sport: String? = nil, routeId: Int? = nil, eingebettet: Bool = false) {
        self.spot = spot
        self.vorgegebeneSpotId = vorgegebeneSpotId
        self.sport = sport
        self.routeId = routeId
        self.eingebettet = eingebettet
        let start: String = ReiterSpeicher.von(eingebettet ? "homeSpot" : "spot", "rekorde")
        _spotTab = State(initialValue: routeId != nil ? "heatmap" : start)
    }

    private var echteId: Int? { spotId ?? vorgegebeneSpotId }

    private var spotReiter: [ReiterDef] {
        var r: [ReiterDef] = [ReiterDef(id: "rekorde", label: Loc.t("side.records", lang)),
                              ReiterDef(id: "sessions", label: Loc.t("sessions.title", lang))]
        if echteId != nil { r.append(ReiterDef(id: "heatmap", label: Loc.t("spots.heatmap", lang))) }
        r.append(ReiterDef(id: "wetter", label: Loc.t("tab.weather", lang)))
        if echteId != nil { r.append(ReiterDef(id: "beschreibungen", label: Loc.t("tab.descriptions", lang))) }
        return r
    }

    /// Ohne Spot-Zeile gibt es Heatmap und Beschreibungen nicht — dann zurueck auf Rekorde.
    private var aktivTab: String { spotReiter.contains { $0.id == spotTab } ? spotTab : "rekorde" }

    private var tabBindung: Binding<String> {
        Binding(get: { aktivTab }, set: { neu in
            spotTab = neu
            ReiterSpeicher.setze(eingebettet ? "homeSpot" : "spot", neu)
        })
    }

    var body: some View {
        Group {
            if eingebettet { eingebettetInhalt } else { seite }
        }
        .overlay { if loading && items.isEmpty && aktivTab == "sessions" { ProgressView() } }
        // EIN Task fuer alles. Vorher hingen drei `.task`-Blocke an derselben Liste — dass alle
        // drei laufen, ist nicht garantiert genug, um sich darauf zu verlassen, und ein stumm
        // ausgefallener Block ist von „keine Daten" nicht zu unterscheiden (Jan, 07.09.: Wetter
        // da, Rekorde und Beschreibungen nicht). Nacheinander in einem Block, mit den
        // Nebenlaeufen in einer Gruppe, damit nichts aufeinander wartet.
        .task(id: spot) { await allesLaden() }
    }

    // MARK: - Spot-Seite (eigene Liste)

    private var seite: some View {
        List {
            // Der Spotname MUSS in die Liste: `brandToolbar` belegt die Titelzeile mit der
            // Wortmarke und benutzt den uebergebenen Titel nur als Vorlesetext — sichtbar war
            // der Name also nie (Jan, 07.09.2026). Die PWA zeigt ihn als Ueberschrift.
            Section {
                VStack(alignment: .leading, spacing: 2) {
                    Text("📍 \(spot)").font(.title3.bold())
                    if let w = spotLabel, !w.isEmpty {
                        Text(w).font(.caption).foregroundStyle(.secondary)
                    }
                    // Sportart-Knoepfe als Filter der Seite, ueber den Rekorden — in derselben Zeile wie der
                    // Name statt einer eigenen Sektion, die zu viel Abstand brachte (Jan, 28.10.2026).
                    SpotSportKnoepfe(spotSports: spotSports, sport: aktSport, lang: lang) { sportWaehlen($0) }
                        .padding(.top, 6)
                }
            }
            Reiterleiste(reiter: spotReiter, aktiv: tabBindung)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            if let error { Text(error).foregroundStyle(.secondary) }
            reiterInhalt
        }
        .listStyle(.insetGrouped)
        .brandToolbar("📍 \(spot)" + (spotLabel.map { " · \($0)" } ?? ""),
                      feedbackUrl: "/sessions?spot=" + (spot.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? spot))
        .toolbar {
            // Spot-Chat (scope "spot:<name>", wie Web/PWA) — bei Age-Gate (social_allowed=false) aus.
            if store.profile?.social_allowed != false {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { ChatRoomView(scope: "spot:\(spot)", title: spot) } label: {
                        Image(systemName: "bubble.left.and.bubble.right")
                    }
                }
            }
        }
        .refreshable { await load() }
    }

    // MARK: - Home › Spots (im Stapel der Startseite)

    /// Kopf (Spotname + Link) UNTER der Reiterzeile, sonst risse er die Zeile von der Spotzeile darueber ab (wie im Web).
    private var eingebettetInhalt: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Die zweite Zeile ist schon die Spotzeile darueber — die Spot-Reiter stehen darunter als normale Leiste (wie im Web).
            Reiterleiste(reiter: spotReiter, aktiv: tabBindung)
            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.accentColor)
                Text(spot).font(.headline).lineLimit(1)
                Spacer(minLength: 4)
                NavigationLink { SpotSessionsView(spot: spot, vorgegebeneSpotId: echteId) } label: {
                    Text(Loc.t("tab.spotPage", lang) + " →").font(.caption).foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
            }
            SpotSportKnoepfe(spotSports: spotSports, sport: aktSport, lang: lang) { sportWaehlen($0) }
            if let error { Text(error).font(.caption).foregroundStyle(.secondary) }
            reiterInhalt
        }
    }

    // MARK: - Reiter-Inhalte (in der Liste als Sections, eingebettet untereinander)

    @ViewBuilder private var reiterInhalt: some View {
        switch aktivTab {
        case "sessions": sessionsInhalt
        case "heatmap": heatmapInhalt
        case "wetter": wetterInhalt
        case "beschreibungen": beschreibungenInhalt
        default: rekordeInhalt
        }
    }

    // Rekorde je Sportart wie die Liste: ohne Vorgabe Pumpfoil (Endpunkt-Default der Liste), bei „alle" ein Kasten je
    // Sportart (PWA a9725cb9). Rekorde ueber ALLE Sessions (wie Android SpotRecordsSection(accelOnly = false)): vorher nur
    // die mit Bewegungsdaten — an Spots mit vielen GPS-Aufnahmen (Cléder) blieb so nur SUP uebrig.
    @ViewBuilder private var rekordeInhalt: some View {
        if let rs = rekordSport {
            SpotRecordsView(spot: spot, lang: lang, accelOnly: false, sport: rs, sports: [rs])
        } else {
            Text(Loc.t("records.empty", lang)).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var heatmapInhalt: some View {
        if let hz = heatZustand, let ort = spotOrt {
            let hs: String = aktSport != "all" ? aktSport : (rekordSport ?? "all")
            Section { SpotHeatmapPanel(z: hz, lat: ort.0, lon: ort.1, sport: hs, lang: lang, routeAusLink: routeId) }
        } else {
            Text(Loc.t("common.loading", lang)).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var wetterInhalt: some View {
        if let sw = weather {
            Section { HomeWeatherCard(sw: sw, lang: lang, titelKey: "spot.weatherTitle") }
        } else {
            Text(Loc.t("common.loading", lang)).font(.caption).foregroundStyle(.secondary)
        }
    }

    // `?? vorgegebeneSpotId`: die id des Einstiegs gilt SOFORT. Vorher wurde sie erst im Task uebernommen — nach dem
    // Laden der Sessions — und bis dahin (oder wenn der Task nicht durchlief) stand hier nichts.
    @ViewBuilder private var beschreibungenInhalt: some View {
        if let sid = echteId {
            SpotNotesView(spotId: sid, lang: lang)
            // „Anderen Namen vorschlagen" — nur wer hier selbst gefahren ist (s. SpotNotesView.swift).
            SpotNamensVorschlag(spotId: sid, spotName: spot, lang: lang)
        }
    }

    // Kacheln / eine Zeile je Session (PWA 9160c6a2) — derselbe Merker wie alle Listen. Kein Sportart-Menue: die
    // Knoepfe oben filtern die Seite (Jan, 28.10.2026).
    @ViewBuilder private var sessionsInhalt: some View {
        if !items.isEmpty {
            HStack { Spacer(); ListenAnsichtUmschalter(lang: lang) }
        }
        ForEach(items) { c in sessionZeile(c) }
        if items.isEmpty && !loading && error == nil {
            Text(Loc.t("sessions.empty", lang)).foregroundStyle(.secondary)
        }
    }

    /// In der Liste mit Pfeil wie bisher; eingebettet ohne Knopf-Optik (sonst faerbt SwiftUI die ganze Zeile ein).
    @ViewBuilder private func sessionZeile(_ c: CommunityItem) -> some View {
        if eingebettet {
            NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                .buttonStyle(.plain)
            Divider()
        } else {
            NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
        }
    }

    // MARK: - Laden

    private func allesLaden() async {
        if items.isEmpty { await load() }
        if spotId == nil { spotId = vorgegebeneSpotId }
        if spotSports.isEmpty {
            spotSports = ((try? await Api.communitySports(spot: spot)) ?? []).map { $0.sport }
        }
        async let w = Api.spotWeather(spot)
        async let karte = Api.spotMap(accelOnly: false)
        weather = try? await w
        if let m = (try? await karte)?.first(where: { $0.spot == spot }) {
            spotId = m.spot_id
            if let sid = m.spot_id, m.lat != 0 || m.lon != 0 {
                spotOrt = (m.lat, m.lon)
                if heatZustand?.spotId != sid { heatZustand = SpotPanelZustand(spotId: sid) }
            }
            if let wn = m.water, !wn.isEmpty, wn.lowercased() != spot.lowercased() { spotLabel = wn }
        }
    }

    private func sportWaehlen(_ neu: String) {
        guard neu != aktSport else { return }
        sportGewaehlt = neu
        items = []; autoTried = false; showAll = false
        Task { await load() }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            // Default wie die PWA (useAccelDefault): seit 31.08. IMMER „alle", auch wenn der
            // Nutzer selbst Accel-Läufe hat — s. AccelDefault.swift.
            let only = showAll ? false : await AccelDefault.preferred()
            let sp: String = aktSport
            var rows = try await Api.spotSessions(spot, accelOnly: only, sport: sp)
            // Frueher griff das NUR bei einer komplett leeren Liste, und genau daran ist am 29.08. ein
            // Nutzer haengen geblieben: die Spot-Karte sagte „Meerkerk · 14“, nach dem Klick standen dort
            // seine eigenen drei. Die anderen elf sind ohne verwertbare Beschleunigungsdaten aufgenommen
            // (`detection = gps_only`) — die Karte zaehlt mit accel_only=false, die Liste filterte mit true.
            // Die Liste war also nicht leer, nur kuerzer als das Etikett versprach; auf 0 zu pruefen reicht
            // nicht. Verglichen wird jetzt die erste Seite gegen „alle“.
            if only, !autoTried {
                autoTried = true
                let all = try await Api.spotSessions(spot, accelOnly: false, sport: sp)
                if all.count > rows.count { showAll = true; rows = all }
            }
            items = rows
            // „Älter/neuer" im Detail soll an DIESEM Spot bleiben, über alle Fahrer — mit
            // demselben Accel-Filter, den diese Liste gerade zeigt (Jan, 17.09.2026).
            NachbarFilter.aktuell = NachbarFilter(scope: "all", spot: spot, sport: sp,
                                                  accelOnly: only && !showAll)
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
