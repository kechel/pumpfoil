import SwiftUI

// Ein Event mit allen Bestenlisten (Native-Port Stufe 4, 01.11.2026) — PWA web/src/pages/TeamEventSeite.tsx.
// Bild (eigenes, sonst das Teambild wenn `teambild_zeigen`), Titel + Status, Zeitraum fett, Beschreibung fett mit
// Absaetzen; vor dem Start ein grosser Countdown, waehrenddessen „Endet in"; „Event gesamt" ueber den Bestenlisten;
// Teilen-Zeile bei oeffentlichem Team; Box „Event-Regeln". Beitreten fuer Angemeldete ohne Mitgliedschaft mit dem
// Kleingedruckten (TeamBeitrittSheet). Leitung/Moderatoren bearbeiten das Event ueber das Zahnrad oben
// (TeamEventsVerwalten.swift, seit 04.11.2026 nativ; vorher im Web).
// Seit 06.11.2026 (web 5a5db913 … c6697ebf): EINE Bestenliste zur Zeit per Auswahl, „Aktualisieren", solange das Event
// laeuft oder ausgewertet wird, „Stand <Datum Uhrzeit>" bzw. „Endstand" in den Listen, Teilen als Bild mit Abzeichen LIVE.
// Globale Events (jeder nimmt automatisch teil): kein Beitreten, Hinweis mit Opt-out, Top 10 + eigene Zeile und darunter
// die Team-Rangliste (Summe der besten N je Team), kein Haftungsabsatz (das Event ist von pumpfoil.org selbst).

struct TeamEventView: View {
    let slug: String
    let eventId: Int
    @AppStorage("appLang") private var lang = "de"
    @State private var team: TeamInfo?
    @State private var ev: TeamEvent?
    @State private var fehlt = false
    @State private var dialog = false
    @State private var busy = false
    @State private var meldung: String?
    @State private var editor: TeamEventEntwurf?
    /// Gewaehlte Bestenliste (Index in `tafeln`), wie die Auswahl der Community-Bestenliste.
    @State private var wahl = 0
    @State private var laedt = false
    /// Eigene aktive Teams (globale Events: eigene Teams hinter Platz 10 bleiben in der Team-Rangliste sichtbar).
    @State private var meineSlugs: [String] = []
    @Environment(\.dismiss) private var dismiss

    private var feedbackPfad: String { "/teams/" + slug + "/events/" + String(eventId) }

    var body: some View {
        inhalt
            .navigationTitle(ev?.titel ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .feedbackToolbar(feedbackPfad)
            .task { if ev == nil { await laden() } }
            .refreshable { await laden() }
            .sheet(isPresented: $dialog) { beitrittSheet }
            .toolbar { zahnrad }
            .sheet(item: $editor) { e in editorSheet(e) }
    }

    // Zahnrad fuer Leitung/Moderatoren: derselbe Editor wie in der Verwaltung, fuer genau dieses Event.
    @ToolbarContentBuilder private var zahnrad: some ToolbarContent {
        if team?.istVerwalter == true, let e = ev {
            ToolbarItem(placement: .topBarTrailing) {
                Button { editor = TeamEventEntwurf.aus(e) } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel(Loc.t("team.event.bearbeiten", lang))
            }
        }
    }

    private func editorSheet(_ e: TeamEventEntwurf) -> some View {
        TeamEventEditor(slug: slug, farbe: team?.farbe, entwurf: e, auswahl: nil, lang: lang, offiziell: team?.offiziell == true,
                        fertig: { gespeichert in
            editor = nil
            if gespeichert { meldung = Loc.t("team.gespeichert", lang) }
            Task { await laden() }
        }, geloescht: { dismiss() })
    }

    @ViewBuilder private var inhalt: some View {
        if fehlt {
            Text(Loc.t("team.nichtGefunden", lang)).foregroundStyle(.secondary).padding()
        } else if let t = team, let e = ev {
            ScrollView { seite(t, e).padding(.horizontal).padding(.bottom, 24) }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func seite(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            teamZeile(t, e)
            if let m = meldung { meldungsBox(m) }
            bild(t, e)
            EventKopf(e: e, farbe: t.farbe, lang: lang)
            if !e.istGlobal { beitrittBereich(t) }
            Text(Loc.t(eventStandKey(e.status), lang)).font(.title3.weight(.bold))
            meinTeamBereich(t, e)
            standBereich(t, e)
            teilenBereich(t, e)
            EventRegelnBox(e: e, lang: lang)
        }
    }

    /// Globale Events: Wappen + Name des offiziellen Teams ohne Link, dazu „Global" (web: kein Team zum Mitmachen).
    @ViewBuilder private func teamZeile(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if e.istGlobal {
            HStack(spacing: 8) {
                TeamWappen(name: t.name, logo: t.logo_url, farbe: t.farbe, size: 20)
                Text(t.name).font(.subheadline).foregroundStyle(.secondary)
                EventGlobalChip(lang: lang)
            }
            .padding(.top, 8)
        } else {
            teamZeile(t)
        }
    }

    /// Zurueck zum Team: Wappen + Name (die Navigationsleiste fuehrt zusaetzlich eine Ebene zurueck).
    private func teamZeile(_ t: TeamInfo) -> some View {
        NavigationLink { TeamView(slug: t.slug) } label: {
            HStack(spacing: 8) {
                TeamWappen(name: t.name, logo: t.logo_url, farbe: t.farbe, size: 20)
                Text(t.name).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .padding(.top, 8)
    }

    private func meldungsBox(_ m: String) -> some View {
        Text(m).font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func bild(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if let u = Api.mediaURL(e.banner_url) {
            TeamBanner(url: u, fokus: e.banner_fokus)
        } else if e.teambild_zeigen != false, let u = Api.mediaURL(t.banner_url) {
            TeamBanner(url: u, fokus: t.banner_fokus)
        }
    }

    // MARK: Beitreten

    private func beitrittHinweis(_ t: TeamInfo) -> String { teamText("team.join.eventHinweis", lang, ["name": t.name]) }

    @ViewBuilder private func beitrittBereich(_ t: TeamInfo) -> some View {
        if t.anmeldungen_zulassen == true && t.mein_status == nil {
            VStack(alignment: .leading, spacing: 6) {
                TeamKnopf(titel: Loc.t("team.join.knopf", lang), farbe: t.farbe) { dialog = true }
                Text(beitrittHinweis(t)).font(.footnote).foregroundStyle(.secondary)
            }
        }
        if t.mein_status == "angefragt" {
            Text(Loc.t("team.join.wartet", lang)).font(.subheadline)
        }
    }

    @ViewBuilder private var beitrittSheet: some View {
        if let t = team {
            TeamBeitrittSheet(name: t.name, oeffentlich: t.oeffentlich == true,
                              freigabeNoetig: t.automatisch_akzeptieren != true, farbe: t.farbe, busy: busy,
                              lang: lang, onJa: { Task { await beitreten() } }, onNein: { dialog = false })
        }
    }

    // MARK: Teamwahl globaler Events (10.11.2026)

    /// Wie web TeamEventSeite: schon vor dem Start, bis 6 h vor dem Ende; nur wer in mehr als einem wertbaren Team ist.
    @ViewBuilder private func meinTeamBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if e.istGlobal, let mt = e.mein_team, mt.auswahl.count >= 2, e.status == "kommend" || e.status == "laeuft" {
            EventMeinTeamKarte(slug: t.slug, evId: e.id, mt: mt, lang: lang) { Task { await neuLaden() } }
        }
    }

    // MARK: Stand / Ergebnis

    @ViewBuilder private func standBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if e.status == "kommend" {
            EventCountdownKarte(e: e, farbe: t.farbe, lang: lang)
        } else {
            if e.status == "laeuft" { EventEndetInKarte(e: e, farbe: t.farbe, lang: lang) }
            if !(e.summen_auswahl ?? []).isEmpty { summenBereich(t, e) }
            auswahlZeile(t, e)
            tafelBereich(t, e)
        }
    }

    /// Je nach Anzahl ueber die ganze Breite (web b48a1cac, Spalten wie dort auf dem Handy): 1 -> 1, 3 -> 1, sonst 2.
    private func summenSpalten(_ e: TeamEvent) -> Int {
        let n: Int = eventSummenKacheln(e, lang).count
        return n == 1 || n == 3 ? 1 : 2
    }

    private func summenBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("team.event.teamGesamt", lang).uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            TeamZahlenRaster(kacheln: eventSummenKacheln(e, lang), farbe: t.farbe, spalten: summenSpalten(e), rand: true, gross: true)
        }
    }

    // MARK: Eine Bestenliste zur Zeit

    private func gewaehlt(_ e: TeamEvent) -> TeamTafel? {
        guard !e.tafeln.isEmpty else { return nil }
        return e.tafeln[min(wahl, e.tafeln.count - 1)]
    }

    /// Globale Events: Top 10 und die eigene Zeile darunter (wie die Community-Bestenliste, web 61628ba7).
    private func anzeigeTafel(_ e: TeamEvent, _ tf: TeamTafel) -> TeamTafel {
        guard e.istGlobal else { return tf }
        var x: TeamTafel = tf
        var z: [TeamZeile] = Array(tf.zeilen.prefix(10))
        if let ich = tf.eigene, ich.rang > 10 { z.append(ich) }
        x.zeilen = z
        return x
    }

    private func laeuftNoch(_ e: TeamEvent) -> Bool { e.status == "laeuft" || e.status == "auswertung" }

    /// Bestenlisten oder Summen vorhanden — dann gibt es die Event-Uebersicht als Bild (web c0d044a2).
    private func uebersichtMoeglich(_ e: TeamEvent) -> Bool { e.tafeln.count + (e.summen_auswahl ?? []).count > 0 }

    /// Auswahl der Bestenliste (ab zwei), „Übersicht teilen" und „Aktualisieren" (solange sich noch etwas aendern kann);
    /// bricht auf schmalen Geraeten um wie die Zeile im Web (flex-wrap).
    @ViewBuilder private func auswahlZeile(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if e.tafeln.count > 1 || laeuftNoch(e) || uebersichtMoeglich(e) {
            FoilerFliessReihe(abstand: 8) {
                if e.tafeln.count > 1 { tafelAuswahl(e) }
                if uebersichtMoeglich(e) { uebersichtKnopf(t, e) }
                if laeuftNoch(e) { neuLadenKnopf }
            }
        }
    }

    private func uebersichtKnopf(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        Button { uebersichtBild(t, e) } label: {
            Label(Loc.t("team.event.uebersichtTeilen", lang), systemImage: "square.and.arrow.up").font(.subheadline)
        }
        .buttonStyle(.bordered)
    }

    private func tafelAuswahl(_ e: TeamEvent) -> some View {
        let n: Int = e.tafeln.count
        let bindung: Binding<Int> = Binding(get: { min(wahl, n - 1) }, set: { wahl = $0 })
        return Picker(Loc.t("home.leaderboards", lang), selection: bindung) {
            // Mehrere Sportarten (z. B. Pumpfoil und Foil Scoot getrennt, web d6b52f77): Sportart mit in die Auswahl.
            ForEach(Array(e.tafeln.enumerated()), id: \.offset) { i, tf in
                Text(eventTafelTitel(tf, e, lang)).tag(i)
            }
        }
        .pickerStyle(.menu)
        // Einzeilig (07.11.2026): neben „Aktualisieren" brach „Total on-foil distance" sonst in zwei Zeilen um.
        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
    }

    /// Der Server rechnet hoechstens alle 2 min neu (web 881d7843).
    private var neuLadenKnopf: some View {
        Button { Task { await neuLaden() } } label: {
            HStack(spacing: 6) {
                if laedt { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.clockwise") }
                Text(Loc.t("team.event.neuLaden", lang))
            }
            .font(.subheadline)
        }
        .buttonStyle(.bordered)
        .disabled(laedt)
    }

    /// Fahrer-Liste, bei globalen Events darunter die Team-Rangliste (auf dem Handy untereinander wie im Web).
    @ViewBuilder private func tafelBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if let tf0 = gewaehlt(e) {
            let stand: String? = eventStandText(e, tf0, lang)
            let mehrSport: Bool = Set(e.tafeln.map { $0.sportart }).count > 1
            // Siegertreppchen ueber der Bestenliste, nur beendete Events (web EventPodest, 09.11.2026).
            if e.status == "beendet" {
                EventPodest(evId: e.id, tf: tf0, global: e.istGlobal, farbe: t.farbe, lang: lang)
            }
            TeamTafelKarte(tf: anzeigeTafel(e, tf0), farbe: t.farbe, lang: lang, ohneFilter: true, sportZeigen: mehrSport,
                           standText: stand, onBild: { fahrerBild(t, e, tf0) }, teamsZeigen: e.istGlobal)
            if e.istGlobal {
                TeamWertungKarte(tf: tf0, n: e.team_wertung_n ?? 5, farbe: t.farbe, lang: lang, eigeneSlugs: meineSlugs,
                                 standText: stand, onBild: { teamsBild(e, tf0) })
            }
        }
    }

    // MARK: Teilen als Bild

    /// Abzeichen oben rechts im Bild, solange das Event nicht final ist (web 6f12c55f).
    private func bildAbzeichen(_ e: TeamEvent) -> String? {
        laeuftNoch(e) ? Loc.t("team.event.status." + e.status, lang) : nil
    }

    /// Fahrer-Bestenliste als Bild (web TeamTafelBild): Teamname, darunter Kennzahl · Sportart · Event · Stand; Top 10.
    private func fahrerBild(_ t: TeamInfo, _ e: TeamEvent, _ tf: TeamTafel) {
        let k: TeamKennzahl = teamKennzahl(tf.kennzahl)
        let sprache: String = lang
        var teile: [String] = [Loc.t(k.labelKey, lang)]
        if tf.sportart != "pumpfoil" { teile.append(Loc.t("cls.sport." + tf.sportart, lang)) }
        teile.append(e.titel)
        if let st = eventStandText(e, tf, lang) { teile.append(st) }
        let unter: String = teile.joined(separator: " · ")
        let abz: String? = bildAbzeichen(e)
        let titel: String = t.name
        var zeilen: [TeamBildZeile] = []
        for z in tf.zeilen.prefix(10) {
            zeilen.append(TeamBildZeile(rang: z.rang, name: z.name ?? z.initialen ?? "—", wert: k.fmt(z.value, sprache), ich: false,
                                        logo: nil, farbe: nil, land: z.land))
        }
        // Eigene Zeile hinter Platz 10 (globale Events), im Dialog abwaehlbar (web 56960f2a, 07.11.2026).
        var eigen: TeamBildZeile? = nil
        if let z = tf.eigene, z.rang > 10 {
            eigen = TeamBildZeile(rang: z.rang, name: z.name ?? z.initialen ?? "—", wert: k.fmt(z.value, sprache), ich: true,
                                  logo: nil, farbe: nil, land: z.land)
        }
        let fertig: [TeamBildZeile] = zeilen
        let ende: TeamBildZeile? = eigen
        Task { @MainActor in
            let flaggen: [String: UIImage] = TeamEventView.flaggen(fertig + (ende.map { [$0] } ?? []))
            let daten = TeamBildDaten(titel: titel, unterzeile: unter, zeilen: fertig, eigene: ende, logos: [:], flaggen: flaggen,
                                      abzeichen: abz)
            TeamBildDialog.zeigen(daten, lang: sprache)
        }
    }

    /// Team-Rangliste als Bild (web 6b9a6f0d): Top 10, das eigene Team dahinter darunter, Wappen je Zeile.
    private func teamsBild(_ e: TeamEvent, _ tf: TeamTafel) {
        let k: TeamKennzahl = teamKennzahl(tf.kennzahl)
        let sprache: String = lang
        let n: Int = e.team_wertung_n ?? 5
        let meine: [String] = meineSlugs
        let alle: [TeamWertungZeile] = tf.teams ?? []
        let wertung: String = teamWertungText(tf.kennzahl, n, lang)
        var teile: [String] = [e.titel, wertung]
        if let st = eventStandText(e, tf, lang) { teile.append(st) }
        let unter: String = teile.joined(separator: " · ")
        let titel: String = teamWertungTitel(tf, lang)
        let abz: String? = bildAbzeichen(e)
        var zeilen: [TeamBildZeile] = []
        for x in alle.prefix(10) { zeilen.append(TeamEventView.bildZeile(x, k.fmt(x.value, sprache), meine.contains(x.slug))) }
        var eigen: TeamBildZeile? = nil
        if let x = alle.dropFirst(10).first(where: { meine.contains($0.slug) }) {
            eigen = TeamEventView.bildZeile(x, k.fmt(x.value, sprache), true)
        }
        let fertig: [TeamBildZeile] = zeilen
        let ende: TeamBildZeile? = eigen
        Task { @MainActor in
            let alleZeilen: [TeamBildZeile] = fertig + (ende.map { [$0] } ?? [])
            let logos: [String: UIImage] = await TeamBildLogos.laden(alleZeilen)
            let flaggen: [String: UIImage] = TeamEventView.flaggen(alleZeilen)
            let daten = TeamBildDaten(titel: titel, unterzeile: unter, zeilen: fertig, eigene: ende, logos: logos, flaggen: flaggen,
                                      eigenesTeam: true, abzeichen: abz)
            TeamBildDialog.zeigen(daten, lang: sprache)
        }
    }

    /// Event-Uebersicht als Bild (web EventUebersichtBild, c0d044a2): Summen + die ersten 3 je Kategorie, Kategorien
    /// (Fahrer-Bestenlisten, bei globalen Events auch ihre Team-Wertungen) im Dialog waehlbar.
    private func uebersichtBild(_ t: TeamInfo, _ e: TeamEvent) {
        var kategorien: [TeamUebersichtKategorie] = []
        for (i, tf) in e.tafeln.enumerated() {
            kategorien.append(TeamUebersichtKategorie(key: "p" + String(i), titel: eventTafelTitel(tf, e, lang),
                                                      zeilen: uebersichtFahrer(e, tf), team: false))
        }
        if e.istGlobal {
            for (i, tf) in e.tafeln.enumerated() {
                let titel: String = Loc.t("team.event.teams", lang) + " · " + eventTafelTitel(tf, e, lang)
                kategorien.append(TeamUebersichtKategorie(key: "t" + String(i), titel: titel,
                                                          zeilen: uebersichtTeams(tf), team: true))
            }
        }
        var klein: [String] = [eventZeitraum(e.start, e.ende, e.zeitzone, lang)]
        if let tf = e.tafeln.first, let st = eventStandText(e, tf, lang) { klein.append(st) }
        let daten = TeamUebersichtDaten(titel: e.titel, unterzeile: t.name, unterzeile2: klein,
                                        summen: eventSummenKacheln(e, lang), kategorien: kategorien,
                                        logos: [:], flaggen: [:], abzeichen: bildAbzeichen(e))
        let sprache: String = lang
        Task { @MainActor in
            let alle: [TeamBildZeile] = daten.kategorien.flatMap { $0.zeilen }
            let logos: [String: UIImage] = await TeamBildLogos.laden(alle)
            let fertig = TeamUebersichtDaten(titel: daten.titel, unterzeile: daten.unterzeile, unterzeile2: daten.unterzeile2,
                                             summen: daten.summen, kategorien: daten.kategorien, logos: logos,
                                             flaggen: TeamEventView.flaggen(alle), abzeichen: daten.abzeichen)
            TeamUebersichtDialog.zeigen(fertig, lang: sprache)
        }
    }

    /// Die ersten 3 einer Fahrer-Bestenliste; bei globalen Events mit dem Wappen ihres (ersten) Teams (web wappenVon).
    private func uebersichtFahrer(_ e: TeamEvent, _ tf: TeamTafel) -> [TeamBildZeile] {
        let k: TeamKennzahl = teamKennzahl(tf.kennzahl)
        return tf.zeilen.prefix(3).map { z in
            let w: TeamEventTeam? = e.istGlobal ? z.teams?.first : nil
            return TeamBildZeile(rang: z.rang, name: z.name ?? z.initialen ?? "—", wert: k.fmt(z.value, lang), ich: false,
                                 logo: w?.logo_url, farbe: w?.farbe, land: z.land, wappenName: w?.name)
        }
    }

    private func uebersichtTeams(_ tf: TeamTafel) -> [TeamBildZeile] {
        let k: TeamKennzahl = teamKennzahl(tf.kennzahl)
        return (tf.teams ?? []).prefix(3).map { x in TeamEventView.bildZeile(x, k.fmt(x.value, lang), false) }
    }

    private static func bildZeile(_ x: TeamWertungZeile, _ wert: String, _ ich: Bool) -> TeamBildZeile {
        TeamBildZeile(rang: x.rang, name: x.name, wert: wert, ich: ich, logo: x.logo_url, farbe: x.farbe, land: x.land)
    }

    @MainActor private static func flaggen(_ zeilen: [TeamBildZeile]) -> [String: UIImage] {
        var out: [String: UIImage] = [:]
        for z in zeilen {
            if let l = z.land, out[l] == nil, let b = TeamFlaggenBild.bild(l) { out[l] = b }
        }
        return out
    }

    @ViewBuilder private func teilenBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        // Globale Events immer (sichtbar fuer jeden Angemeldeten und als Gast-Link), sonst nur bei oeffentlichen Bestenlisten.
        if t.bestenlisten_oeffentlich == true || e.istGlobal, let u = Api.teamWebURL("/teams/" + t.slug + "/events/" + String(e.id)) {
            VStack(alignment: .leading, spacing: 6) {
                Text(Loc.t("team.event.teilen", lang)).font(.subheadline).foregroundStyle(.secondary)
                TeamTeilenZeile(url: u, titel: e.titel, farbe: t.farbe, lang: lang)
            }
        }
    }

    // MARK: Laden

    private func laden() async {
        async let t: TeamInfo? = try? Api.team(slug)
        do {
            let e = try await Api.teamEvent(slug, id: eventId)
            ev = e
            team = await t
            fehlt = team == nil
            if e.istGlobal && meineSlugs.isEmpty { await meineTeamsLaden() }
        } catch {
            _ = await t
            if ev == nil { fehlt = true }
        }
    }

    /// Nur die Bestenlisten neu holen (Knopf „Aktualisieren"); schlaegt es fehl, bleibt der alte Stand stehen.
    private func neuLaden() async {
        laedt = true
        defer { laedt = false }
        if let e = try? await Api.teamEvent(slug, id: eventId) { ev = e }
    }

    private func meineTeamsLaden() async {
        guard let l = try? await Api.teamsMine() else { return }
        meineSlugs = l.filter { $0.status == "aktiv" && $0.slug != slug }.map { $0.slug }
    }

    private func beitreten() async {
        busy = true
        defer { busy = false }
        do {
            let r = try await Api.teamBeitreten(slug)
            dialog = false
            meldung = Loc.t(r.status == "aktiv" ? "team.join.erfolg" : "team.join.angefragt", lang)
            await laden()
        } catch {
            dialog = false
            meldung = Api.teamFehlerText(error, lang)
        }
    }
}

// MARK: - Bausteine der Event-Seite

/// Globale Events (web EventMeinTeam.tsx, 10.11.2026): wer in mehreren Teams ist, zaehlt nur fuer eines — vorgewaehlt das
/// primaere, hier fuer dieses Event umstellbar bis 6 h vor dem Ende.
struct EventMeinTeamKarte: View {
    let slug: String
    let evId: Int
    let mt: EventMeinTeam
    let lang: String
    let geaendert: () -> Void
    @State private var busy = false

    private func waehle(_ id: Int) {
        guard !busy, mt.aenderbar, id != mt.effektiv else { return }
        busy = true
        // Das primaere Team waehlen heisst: keine Sonderwahl fuer dieses Event (folgt spaeteren Aenderungen des primaeren).
        let wert: Int? = id == mt.primaer ? nil : id
        Task {
            let ok: Bool = (try? await Api.teamEventMeinTeam(slug, id: evId, teamId: wert)) != nil
            busy = false
            if ok { geaendert() }
        }
    }

    private func chip(_ x: EventMeinTeam.Wahl) -> some View {
        let an: Bool = x.id == mt.effektiv
        let tf = TeamFarbe(x.farbe)
        return Button { waehle(x.id) } label: {
            HStack(spacing: 6) {
                TeamWappen(name: x.name, logo: x.logo_url, farbe: x.farbe, size: 16)
                Text(x.name).font(.subheadline.weight(an ? .semibold : .regular)).lineLimit(1)
                if x.id == mt.primaer { Text("★").font(.caption).opacity(0.8) }
            }
            .foregroundStyle(an ? tf.aufFlaeche : Color.primary)
            .padding(.horizontal, 12).padding(.vertical, 5)
            .background(Capsule().fill(an ? tf.flaeche : Color.clear))
            .overlay(Capsule().stroke(an ? Color.clear : Color.secondary.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(busy || (!mt.aenderbar && !an))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("team.event.meinTeam", lang)).font(.subheadline.weight(.semibold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) { ForEach(mt.auswahl) { x in chip(x) } }
            }
            Text(Loc.t(mt.aenderbar ? "team.event.meinTeamHinweis" : "team.event.meinTeamFest", lang))
                .font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Name einer Event-Bestenliste; hat das Event Bestenlisten verschiedener Sportarten, steht die Sportart dabei (web tafelTitel).
func eventTafelTitel(_ tf: TeamTafel, _ e: TeamEvent, _ lang: String) -> String {
    let name: String = Loc.t(teamKennzahl(tf.kennzahl).labelKey, lang)
    guard Set(e.tafeln.map { $0.sportart }).count > 1 else { return name }
    return name + " · " + Loc.t("cls.sport." + tf.sportart, lang)
}

/// „Teams · Schnellste fliegende 100 m · Foil Scoot" — Sportart nur, wenn es nicht Pumpfoil ist (web TeamWertung, d6b52f77).
func teamWertungTitel(_ tf: TeamTafel, _ lang: String) -> String {
    let basis: String = Loc.t("team.event.teams", lang) + " · " + Loc.t(teamKennzahl(tf.kennzahl).labelKey, lang)
    guard tf.sportart != "pumpfoil" else { return basis }
    return basis + " · " + Loc.t("cls.sport." + tf.sportart, lang)
}

/// Titel + Status, Zeitraum fett (+ Spots), Beschreibung fett mit Absaetzen.
private struct EventKopf: View {
    let e: TeamEvent
    let farbe: String?
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var zeitraum: String { eventZeitraum(e.start, e.ende, e.zeitzone, lang) }
    private var spots: String? {
        guard !e.spots.isEmpty else { return nil }
        return e.spots.map { $0.anzeige }.joined(separator: ", ")
    }
    private var beschreibung: String? {
        let b: String = (e.beschreibung ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return b.isEmpty ? nil : b
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            FoilerFliessReihe(abstand: 8) {
                Text(e.titel).font(.title2.weight(.bold)).foregroundStyle(tf.akzent)
                TeamEventStatusChip(status: e.status, farbe: farbe, lang: lang)
            }
            Text(zeitraum).font(.subheadline.weight(.semibold))
            if let s = spots { teamSpotChip(s) }
            if let b = beschreibung { Text(b).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true) }
            if e.istGlobal { EventGlobalHinweis(lang: lang) }
            Rectangle().fill(tf.akzent).frame(height: 2)
        }
    }
}

/// Tage/Std./Min./Sek. bis `ziel`, sekundengenau; `klein` fuer „Endet in" waehrend des Events.
private struct EventUhr: View {
    let ziel: String
    let farbe: String?
    let lang: String
    var klein: Bool = false

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var zahlSchrift: Font { klein ? .title3.weight(.bold) : .largeTitle.weight(.bold) }
    private var breite: CGFloat { klein ? 52 : 68 }
    private var abstand: CGFloat { klein ? 6 : 10 }
    private var innenV: CGFloat { klein ? 4 : 8 }

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { ctx in
            HStack(spacing: abstand) {
                ForEach(teile(ctx.date), id: \.1) { t in feld(t.0, t.1) }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func teile(_ jetzt: Date) -> [(String, String)] {
        let zielDatum: Date = teamDatum(ziel) ?? jetzt
        let rest: Int = max(0, Int(zielDatum.timeIntervalSince(jetzt)))
        return [
            (String(rest / 86400), rest / 86400 == 1 ? "team.event.tag" : "team.event.tage"),
            (String(format: "%02d", (rest / 3600) % 24), "team.event.stunden"),
            (String(format: "%02d", (rest / 60) % 60), "team.event.minuten"),
            (String(format: "%02d", rest % 60), "team.event.sekunden"),
        ]
    }

    private func feld(_ zahl: String, _ key: String) -> some View {
        VStack(spacing: 2) {
            Text(zahl).font(zahlSchrift).monospacedDigit().foregroundStyle(tf.akzent)
            Text(Loc.t(key, lang)).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(minWidth: breite)
        .padding(.vertical, innenV).padding(.horizontal, 4)
        .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Vor dem Start: Countdown, gross das genaue Zeitfenster und bis wann Uploads zaehlen.
private struct EventCountdownKarte: View {
    let e: TeamEvent
    let farbe: String?
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var fenster: (String, String) { eventZeitraumGenau(e.start, e.ende, e.zeitzone, lang) }
    private var uploads: String { teamText("team.event.uploadsBis", lang, ["bis": eventZeit(e.einfrieren_am, e.zeitzone, lang)]) }

    var body: some View {
        VStack(spacing: 10) {
            Text(Loc.t("team.event.startIn", lang).uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            EventUhr(ziel: e.start, farbe: farbe, lang: lang)
            Text(fenster.0).font(.title3.weight(.bold))
            Text("–").font(.subheadline).foregroundStyle(.secondary)
            Text(fenster.1).font(.title3.weight(.bold))
            Text(uploads).font(.subheadline)
            Text(Loc.t("team.event.nochNichts", lang)).font(.caption).foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(16)
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(tf.akzent, lineWidth: 2))
    }
}

/// Waehrend das Event laeuft: wie lange noch.
private struct EventEndetInKarte: View {
    let e: TeamEvent
    let farbe: String?
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(farbe) }

    var body: some View {
        VStack(spacing: 8) {
            Text(Loc.t("team.event.endetIn", lang).uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            EventUhr(ziel: e.ende, farbe: farbe, lang: lang, klein: true)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(tf.akzent, lineWidth: 2))
    }
}

/// Box „Event-Regeln": zuerst was gemessen wird, „ohne Dateien", die Upload-Frist (Auswertung), dann die
/// allgemeinen Regeln (`team.regeln.events.text`, eine Zeile je Punkt).
private struct EventRegelnBox: View {
    let e: TeamEvent
    let lang: String

    private var punkte: [String] {
        var p: [String] = []
        let gemessen: String = eventGemessen(e, lang)
        if !gemessen.isEmpty { p.append(Loc.t("team.event.gemessen", lang) + ": " + gemessen) }
        if e.ohne_dateien == true { p.append(Loc.t("team.event.ohneDateienKurz", lang)) }
        if e.status == "auswertung" {
            p.append(teamText("team.event.auswertungHinweis", lang, ["bis": eventZeit(e.einfrieren_am, e.zeitzone, lang)]))
        }
        let allgemein: [String] = Loc.t("team.regeln.events.text", lang).components(separatedBy: "\n").filter { !$0.isEmpty }
        return p + allgemein
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("team.event.regelnTitel", lang)).font(.subheadline.weight(.semibold))
            ForEach(Array(punkte.enumerated()), id: \.offset) { _, z in punkt(z) }
            // Haftungsabsatz nur bei Team-Events — globale veranstaltet pumpfoil.org selbst (web 5a5db913).
            if !e.istGlobal { haftung }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .padding(.top, 8)
    }

    /// Haftungsausschluss (Jan, 01.11.2026): Events und ihre Zusagen sind Sache der Teams, nicht von pumpfoil.org.
    private var haftung: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Text(Loc.t("team.event.disclaimer", lang)).font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 4)
    }

    private func punkt(_ z: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("•").font(.subheadline).foregroundStyle(.secondary)
            Text(z).font(.subheadline).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Globale Events: „Alle nehmen automatisch teil …" und darunter der Weg zum Opt-out (Einstellungen › Privatsphaere,
/// web f82e0e66) als Link.
private struct EventGlobalHinweis: View {
    let lang: String
    private var marke: TeamFarbe { TeamFarbe(nil) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("team.event.globalHinweis", lang)).font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
            NavigationLink {
                EinstellungenView(start: "privat")
                    .brandToolbar(Loc.t("nav.settings", lang), feedbackUrl: "/einstellungen")
            } label: {
                Text(Loc.t("team.event.globalOptOut", lang)).font(.subheadline).underline()
                    .foregroundStyle(marke.akzent)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 2)
    }
}

/// Team-Rangliste eines globalen Events (web TeamWertung, 06.11.2026): je Team die Summe der besten N Mitglieder,
/// `fahrer`/`teilnehmer` daneben. Top 10, dazu die eigenen Teams weiter hinten. Gleiche Karte und Ueberschrift wie die
/// Fahrer-Liste (web 22c5da16: „einheitlich"), Stand in derselben Zeile wie „Summe der besten 5" (web c6697ebf).
private struct TeamWertungKarte: View {
    let tf: TeamTafel
    let n: Int
    let farbe: String?
    let lang: String
    let eigeneSlugs: [String]
    let standText: String?
    let onBild: () -> Void

    private var k: TeamKennzahl { teamKennzahl(tf.kennzahl) }
    private var tfarbe: TeamFarbe { TeamFarbe(farbe) }
    private var alle: [TeamWertungZeile] { tf.teams ?? [] }
    private var zeilen: [TeamWertungZeile] {
        let a: [TeamWertungZeile] = alle
        let hinten: [TeamWertungZeile] = a.dropFirst(10).filter { eigeneSlugs.contains($0.slug) }
        return Array(a.prefix(10)) + hinten
    }
    private var titel: String { teamWertungTitel(tf, lang) }
    /// „Summe der besten 5" bzw. bei Sprints „Durchschnitt der besten 5" (web wertungText).
    private var unterzeile: String {
        let w: String = teamWertungText(tf.kennzahl, n, lang)
        guard let st = standText else { return w }
        return w + " · " + st
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            kopf
            Text(unterzeile).font(.caption).foregroundStyle(.secondary)
            liste
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private var kopf: some View {
        HStack(spacing: 8) {
            Text(titel).font(.headline).foregroundStyle(tfarbe.akzent)
            if !alle.isEmpty {
                Spacer(minLength: 4)
                TeamTeilenKnopf(lang: lang, aktion: onBild)
            }
        }
    }

    @ViewBuilder private var liste: some View {
        if zeilen.isEmpty {
            Text(Loc.t("team.event.keineTeams", lang)).font(.subheadline).foregroundStyle(.secondary).padding(.top, 4)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(zeilen.enumerated()), id: \.element.slug) { i, z in
                    if i > 0 { Divider() }
                    zeile(z)
                }
            }
        }
    }

    private func rangFarbe(_ rang: Int) -> Color { rang <= 3 ? tfarbe.akzent : Color.secondary }

    private func anteil(_ z: TeamWertungZeile) -> String { String(z.fahrer) + "/" + String(z.teilnehmer) }

    /// Name, darunter die Sportart-Abzeichen (gemischte Ansicht) und „in Klärung" (ein mitgezaehltes Mitglied hat eine
    /// offene Meldung, 08.11.2026).
    private func namensBlock(_ z: TeamWertungZeile) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(z.name).font(.subheadline).lineLimit(1)
            SportAbzeichen(sportarten: z.sportarten, lang: lang)
            if z.strittig == true { TeamStrittigMarke(lang: lang) }
        }
    }

    private func zeile(_ z: TeamWertungZeile) -> some View {
        NavigationLink { TeamView(slug: z.slug) } label: {
            HStack(spacing: 8) {
                Text(String(z.rang)).font(.subheadline.weight(.bold)).foregroundStyle(rangFarbe(z.rang))
                    .lineLimit(1).minimumScaleFactor(0.6).frame(width: 28, alignment: .trailing)
                TeamWappen(name: z.name, logo: z.logo_url, farbe: z.farbe, size: 24)
                // Herkunft wie im Teilen-Bild (web 0595efde); fester Platz, damit die Namen buendig stehen.
                ZStack {
                    Color.clear.frame(width: 18, height: 12)
                    TeamHerkunftMarke(land: z.land, kuerzel: false)
                }
                namensBlock(z)
                Spacer(minLength: 4)
                Text(anteil(z)).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                Text(k.fmt(z.value, lang)).font(.subheadline.weight(.semibold)).monospacedDigit()
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
