import SwiftUI

// Teamseite (Native-Port Stufe 4, 01.11.2026) — PWA web/src/pages/Team.tsx. Eine Seite fuer zwei Betrachter:
//  * Mitglieder: Event-Kacheln, Bestenlisten mit Links zu den Sessions, Teamstatistik, Logbuch, Mitglieder,
//    Team-Chat, Austreten.
//  * Angemeldete ohne Mitgliedschaft: freigegebener Auftritt, Beitreten (wenn zugelassen), Bestenlisten nur bei
//    oeffentlichem Team.
// Die Regeln setzt der Server (server/app/teams.py); hier wird nur gezeigt, was er liefert. Leitung/Moderatoren kommen
// ueber das Zahnrad und „N neue Anfragen" in die native Verwaltung (TeamVerwaltung.swift, seit 04.11.2026; vorher Browser).

let TEAM_ZEITRAEUME: [(String, String)] = [
    ("today", "period.today"), ("yesterday", "period.yesterday"), ("10d", "period.10d"), ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all"),
]

struct TeamView: View {
    let slug: String
    @AppStorage("appLang") private var lang = "de"
    @State private var kopf: TeamInfo?
    @State private var fehlt = false
    @State private var period = "30d"
    @State private var tafeln: [TeamTafel]?
    @State private var stat: TeamStatistik?
    @State private var logbuch: [TeamLogbuchEintrag]?
    @State private var events: [TeamEvent]?
    @State private var mitglieder: [TeamMitglied]?
    @State private var dialog = false
    @State private var busy = false
    @State private var meldung: String?
    @State private var austretenFragen = false
    // Reiter der Teamseite (wie ReiterSpeicher ueberall: gilt fuer die App-Sitzung).
    @State private var tteil: String = ReiterSpeicher.von("team", "rekorde")
    @Environment(\.dismiss) private var dismiss

    private var feedbackPfad: String { "/teams/" + slug }

    var body: some View {
        inhalt
            .navigationTitle(kopf?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .feedbackToolbar(feedbackPfad)
            .task { if kopf == nil { await laden() } }
            .refreshable { await laden() }
            // Zurueck aus der Verwaltung: Kopf, Anfragen und Mitglieder neu holen.
            .onAppear { if kopf != nil { Task { await laden() } } }
            .onChange(of: period) { _ in Task { await periodeLaden() } }
            .sheet(isPresented: $dialog) { beitrittSheet }
            .alert(austretenFrage, isPresented: $austretenFragen) { austretenKnoepfe }
    }

    @ViewBuilder private var inhalt: some View {
        if fehlt {
            Text(Loc.t("team.nichtGefunden", lang)).foregroundStyle(.secondary).padding()
        } else if let k = kopf {
            ScrollView { seite(k).padding(.horizontal).padding(.bottom, 24) }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// Reiter direkt unter dem Kopf wie im Web (Jan, 02.11.2026): Rekorde | Events | Logbuch | Mitglieder | Teilen | Regeln.
    /// Beitreten, Meldungen und Austreten stehen fuer alle Reiter sichtbar.
    private func seite(_ k: TeamInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            oberteil(k)
            reiterInhalt(k)
            unterBereich(k)
        }
    }

    private func oberteil(_ k: TeamInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let u = Api.mediaURL(k.banner_url) { TeamBanner(url: u, fokus: k.banner_fokus).padding(.top, 8) }
            TeamKopf(k: k, lang: lang, geloescht: { teamGeloescht() })
            Reiterleiste(reiter: reiter(k), aktiv: Binding(get: { aktiverReiter(k) }, set: { tteil = $0; ReiterSpeicher.setze("team", $0) }))
            if let m = meldung { meldungsBox(m) }
            beitrittBereich(k)
        }
    }

    /// Mitglieder nur, wenn der Server sie zeigt; Teilen nur fuer Mitglieder (web Team.tsx).
    private func reiter(_ k: TeamInfo) -> [ReiterDef] {
        var r: [ReiterDef] = [ReiterDef(id: "rekorde", label: Loc.t("side.records", lang)),
                              ReiterDef(id: "events", label: Loc.t("tab.events", lang)),
                              ReiterDef(id: "logbuch", label: Loc.t("tab.logbook", lang))]
        if mitglieder != nil { r.append(ReiterDef(id: "mitglieder", label: Loc.t("team.mitglieder", lang))) }
        if k.mein_status == "aktiv" { r.append(ReiterDef(id: "teilen", label: Loc.t("team.teilen", lang))) }
        r.append(ReiterDef(id: "regeln", label: Loc.t("tab.rules", lang)))
        return r
    }

    /// Gewaehlter Reiter, sonst „Rekorde" (z. B. nach dem Austreten verschwindet „Teilen").
    private func aktiverReiter(_ k: TeamInfo) -> String {
        reiter(k).contains { $0.id == tteil } ? tteil : "rekorde"
    }

    @ViewBuilder private func reiterInhalt(_ k: TeamInfo) -> some View {
        switch aktiverReiter(k) {
        case "events": eventsBereich(k)
        case "logbuch": logbuchBereich; nurMitgliederHinweis(k)
        case "mitglieder": mitgliederBereich(k)
        case "teilen": teilenBereich(k)
        case "regeln": TeamRegelnInhalt(lang: lang)
        default: bestenlistenBereich(k)
        }
    }

    /// Nicht freigegeben und nicht angefragt: „Nur fuer Mitglieder" (web: alle Reiter ausser Events).
    @ViewBuilder private func nurMitgliederHinweis(_ k: TeamInfo) -> some View {
        if k.darf_bestenlisten != true && k.mein_status != "angefragt" {
            Text(Loc.t("team.nurFuerMitglieder", lang)).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    /// Teilen: Teamadresse mit Kopieren/Teilen und der QR-Code dazu (web TeamQr, Jan 02.11.2026: fuer jedes Mitglied).
    @ViewBuilder private func teilenBereich(_ k: TeamInfo) -> some View {
        if k.mein_status == "aktiv" {
            TeamAdresseKarte(k: k, lang: lang)
            if let u = Api.teamWebURL("/teams/" + k.slug) {
                TeamQrBild(url: u.absoluteString, lang: lang)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    private func meldungsBox(_ m: String) -> some View {
        Text(m).font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Beitreten

    @ViewBuilder private func beitrittBereich(_ k: TeamInfo) -> some View {
        if k.mein_status == nil && k.anmeldungen_zulassen == true {
            TeamKnopf(titel: Loc.t("team.join.knopf", lang), farbe: k.farbe) { dialog = true }
        }
        if k.mein_status == "angefragt" {
            HStack(spacing: 6) {
                Text(Loc.t("team.join.wartet", lang)).font(.subheadline)
                Button(Loc.t("team.zurueckziehen", lang)) { austretenFragen = true }.font(.subheadline)
            }
        }
    }

    @ViewBuilder private var beitrittSheet: some View {
        if let k = kopf {
            TeamBeitrittSheet(name: k.name, oeffentlich: k.oeffentlich == true,
                              freigabeNoetig: k.automatisch_akzeptieren != true, farbe: k.farbe, busy: busy,
                              lang: lang, onJa: { Task { await beitreten() } }, onNein: { dialog = false })
        }
    }

    private var austretenFrage: String {
        guard let k = kopf else { return "" }
        if k.mein_status == "angefragt" { return Loc.t("team.zurueckziehenFrage", lang) }
        return teamText("team.austretenFrage", lang, ["name": k.name])
    }

    private var austretenKnopfText: String {
        Loc.t(kopf?.mein_status == "angefragt" ? "team.zurueckziehen" : "team.austreten", lang)
    }

    @ViewBuilder private var austretenKnoepfe: some View {
        Button(Loc.t("common.cancel", lang), role: .cancel) { }
        Button(austretenKnopfText, role: .destructive) { Task { await austreten() } }
    }

    // MARK: Events

    /// Oben: laufende, kommende und bis eine Woche nach dem Ende auch beendete Events (laeuft, kommend mit dem
    /// naechsten zuerst, dann die gerade vorbei sind). Aeltere unten — mit derselben Kachel.
    private var eventsOben: [TeamEvent] {
        let grenze: Date = Date().addingTimeInterval(-7 * 24 * 3600)
        let oben: [TeamEvent] = (events ?? []).filter { e in
            e.status != "beendet" || (teamDatum(e.ende) ?? .distantPast) > grenze
        }
        return oben.sorted(by: teamEventVorOben)
    }

    private var eventsUnten: [TeamEvent] {
        let obenIds: Set<Int> = Set(eventsOben.map { $0.id })
        return (events ?? []).filter { !obenIds.contains($0.id) }.sorted { $0.ende > $1.ende }
    }

    /// Reiter „Events": oben die aktuellen, darunter die vergangenen; keine -> Hinweis (web team.event.keineAktuellen).
    @ViewBuilder private func eventsBereich(_ k: TeamInfo) -> some View {
        if eventsOben.isEmpty && eventsUnten.isEmpty {
            Text(Loc.t("team.event.keineAktuellen", lang)).font(.subheadline).foregroundStyle(.secondary)
        }
        eventsObenBereich(k)
        eventsUntenBereich(k)
    }

    @ViewBuilder private func eventsObenBereich(_ k: TeamInfo) -> some View {
        if !eventsOben.isEmpty {
            VStack(spacing: 10) {
                ForEach(eventsOben) { e in eventLink(e, k) }
            }
        }
    }

    @ViewBuilder private func eventsUntenBereich(_ k: TeamInfo) -> some View {
        if !eventsUnten.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(Loc.t("team.event.vergangen", lang)).font(.headline)
                ForEach(eventsUnten) { e in eventLink(e, k) }
            }
        }
    }

    private func eventLink(_ e: TeamEvent, _ k: TeamInfo) -> some View {
        NavigationLink { TeamEventView(slug: k.slug, eventId: e.id) } label: {
            TeamEventKachel(d: EventKachelDaten(e, slug: k.slug, farbe: k.farbe), lang: lang)
        }
        .buttonStyle(.plain)
    }

    // MARK: Bestenlisten

    @ViewBuilder private func bestenlistenBereich(_ k: TeamInfo) -> some View {
        if k.darf_bestenlisten == true {
            TeamZeitraumWahl(period: $period, farbe: k.farbe, lang: lang)
            if let s = stat { TeamZahlenRaster(kacheln: teamStatistikKacheln(s, lang), farbe: k.farbe) }
            tafelnBereich(k)
        } else if k.mein_status != "angefragt" {
            Text(Loc.t("team.nurFuerMitglieder", lang)).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func tafelnBereich(_ k: TeamInfo) -> some View {
        if let tl = tafeln {
            if tl.isEmpty {
                Text(Loc.t("team.keineTafeln", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(Array(tl.enumerated()), id: \.offset) { _, tf in
                    TeamTafelKarte(tf: tf, farbe: k.farbe, lang: lang, sportZeigen: Set(tl.map { $0.sportart }).count > 1)
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    // MARK: Mitglieder, Logbuch, Ende der Seite

    @ViewBuilder private func mitgliederBereich(_ k: TeamInfo) -> some View {
        if let m = mitglieder, !m.isEmpty {
            TeamMitgliederKarte(mitglieder: m, farbe: k.farbe, lang: lang)
        }
    }

    @ViewBuilder private var logbuchBereich: some View {
        if let lb = logbuch, kopf?.darf_bestenlisten == true {
            TeamLogbuchKarte(eintraege: lb, lang: lang)
        }
    }

    /// „Auch nur GPS" einmal unten statt an jeder Bestenliste.
    private var gpsHinweis: String? {
        guard let tl = tafeln, tl.contains(where: { $0.accel_only != true }) else { return nil }
        return Loc.t(tl.allSatisfy { $0.accel_only != true } ? "team.tafel.gpsAlle" : "team.tafel.gpsEinige", lang)
    }

    @ViewBuilder private func unterBereich(_ k: TeamInfo) -> some View {
        if k.mein_status == "aktiv" && k.meine_rolle != "leiter" {
            Button(Loc.t("team.austreten", lang)) { austretenFragen = true }
                .font(.subheadline).foregroundStyle(.secondary).padding(.top, 8)
        }
        if aktiverReiter(k) == "rekorde", let g = gpsHinweis { Text(g).font(.footnote).foregroundStyle(.secondary) }
    }

    // MARK: Laden

    private func laden() async {
        do {
            let k = try await Api.team(slug)
            kopf = k
            fehlt = false
            if k.darf_mitglieder == true {
                mitglieder = (try? await Api.teamMitglieder(slug))?.mitglieder
            } else {
                mitglieder = nil
            }
            guard k.darf_bestenlisten == true else {
                tafeln = nil; stat = nil; logbuch = nil; events = nil
                return
            }
            async let lb: [TeamLogbuchEintrag]? = try? Api.teamLogbuch(slug)
            async let ev: [TeamEvent]? = try? Api.teamEvents(slug)
            await periodeLaden()
            logbuch = await lb
            events = await ev
        } catch {
            if kopf == nil { fehlt = true }
        }
    }

    private func periodeLaden() async {
        guard kopf?.darf_bestenlisten == true else { return }
        async let b: TeamBestenlisten? = try? Api.teamBestenlisten(slug, period: period)
        async let s: TeamStatistik? = try? Api.teamStatistik(slug, period: period)
        tafeln = (await b)?.tafeln ?? []
        stat = await s
    }

    /// Team in der Verwaltung geloescht: die Seite gibt es nicht mehr.
    private func teamGeloescht() {
        kopf = nil
        fehlt = true
        dismiss()
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

    private func austreten() async {
        do {
            try await Api.teamAustreten(slug)
            mitglieder = nil; tafeln = nil; stat = nil; logbuch = nil; events = nil
            meldung = nil
            await laden()
        } catch {
            meldung = Api.teamFehlerText(error, lang)
        }
    }
}

/// Reihenfolge oben: laeuft, kommend (naechstes zuerst), auswertung, beendet (zuletzt beendet zuerst).
func teamEventVorOben(_ a: TeamEvent, _ b: TeamEvent) -> Bool {
    let rang: [String: Int] = ["laeuft": 0, "kommend": 1, "auswertung": 2, "beendet": 3]
    let ra: Int = rang[a.status] ?? 4
    let rb: Int = rang[b.status] ?? 4
    if ra != rb { return ra < rb }
    if a.status == "kommend" { return a.start < b.start }
    return a.ende > b.ende
}

// MARK: - Bausteine der Teamseite

/// Kopf: Wappen, Name mit Herkunft und Zahnrad, Mitglieder · oeffentlich · Sportarten, offene Anfragen, Team-Chat.
private struct TeamKopf: View {
    let k: TeamInfo
    let lang: String
    let geloescht: () -> Void

    private var tf: TeamFarbe { TeamFarbe(k.farbe) }
    private var infoZeile: String {
        var teile: [String] = [teamText(k.mitglieder_anzahl == 1 ? "team.mitgliederAnzahl1" : "team.mitgliederAnzahl", lang, ["n": String(k.mitglieder_anzahl)])]
        if k.bestenlisten_oeffentlich == true { teile.append(Loc.t("team.oeffentlichBadge", lang)) }
        let sp: String = teamSportartenText(k.sportarten, lang)
        if !sp.isEmpty { teile.append(sp) }
        return teile.joined(separator: " · ")
    }
    private var anfragenText: String {
        let n: Int = k.anfragen_offen ?? 0
        return teamText(n == 1 ? "team.anfragenEins" : "team.anfragenViele", lang, ["n": String(n)])
    }
    private var chatTitel: String { teamText("team.chatTitel", lang, ["name": k.name]) }

    private var verwaltung: some View { TeamVerwaltungView(slug: k.slug, onGeloescht: geloescht) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                TeamWappen(name: k.name, logo: k.logo_url, farbe: k.farbe, size: 64)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(k.name).font(.title2.weight(.bold)).foregroundStyle(tf.akzent)
                        TeamHerkunftMarke(land: k.land, gross: true)
                    }
                    Text(infoZeile).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                // Zahnrad fuer Leitung/Moderatoren (wie im Web) — in die Verwaltung.
                if k.istVerwalter {
                    NavigationLink { verwaltung } label: {
                        Image(systemName: "gearshape").font(.title3).foregroundStyle(.secondary)
                            .padding(8)
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1))
                    }
                    .accessibilityLabel(Loc.t("team.tab.verwalten", lang))
                }
            }
            knopfZeile
            if let b = k.beschreibung, !b.isEmpty { Text(b).font(.subheadline) }
            Rectangle().fill(tf.akzent).frame(height: 2)
        }
    }

    private var knopfZeile: some View {
        FoilerFliessReihe(abstand: 8) {
            if (k.anfragen_offen ?? 0) > 0 {
                NavigationLink { verwaltung } label: {
                    Text(anfragenText).font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color(red: 0x02 / 255, green: 0x06 / 255, blue: 0x17 / 255))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 10))
                }
            }
            if let scope = k.chat_scope {
                NavigationLink { ChatRoomView(scope: scope, title: chatTitel) } label: {
                    teamUmrissKnopf(Loc.t("team.chat", lang), "bubble.left.and.bubble.right", tf.akzent)
                }
            }
        }
    }
}

/// Knopf mit Rahmen und Symbol (Team-Chat, Teilen).
func teamUmrissKnopf(_ titel: String, _ symbol: String, _ akzent: Color) -> some View {
    Label {
        Text(titel).foregroundStyle(Color.primary)
    } icon: {
        Image(systemName: symbol).foregroundStyle(akzent)
    }
    .font(.subheadline)
    .padding(.horizontal, 10).padding(.vertical, 5)
    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1))
}

/// Volle Flaeche in Teamfarbe (Beitreten).
struct TeamKnopf: View {
    let titel: String
    let farbe: String?
    var deaktiviert: Bool = false
    let aktion: () -> Void

    private var tf: TeamFarbe { TeamFarbe(farbe) }

    var body: some View {
        Button(action: aktion) {
            Text(titel).font(.body.weight(.semibold)).foregroundStyle(tf.aufFlaeche)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(tf.flaeche, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(deaktiviert)
        .opacity(deaktiviert ? 0.5 : 1)
    }
}

/// Zeitraum-Wahl der Bestenlisten (Heute … Gesamt), gewaehlter in Teamfarbe.
struct TeamZeitraumWahl: View {
    @Binding var period: String
    let farbe: String?
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(farbe) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(TEAM_ZEITRAEUME, id: \.0) { z in knopf(z.0, Loc.t(z.1, lang)) }
            }
        }
    }

    private func knopf(_ key: String, _ titel: String) -> some View {
        let an: Bool = period == key
        return Button { period = key } label: {
            Text(titel).font(.subheadline.weight(an ? .semibold : .regular))
                .foregroundStyle(an ? tf.aufFlaeche : Color.primary)
                .padding(.horizontal, 12).padding(.vertical, 5)
                .background(an ? tf.flaeche : Color.clear, in: Capsule())
                .overlay(Capsule().strokeBorder(an ? Color.clear : Color.secondary.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Mitgliederliste (Profilbild tippt auf die Foiler-Seite).
private struct TeamMitgliederKarte: View {
    let mitglieder: [TeamMitglied]
    let farbe: String?
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(farbe) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("team.mitglieder", lang)).font(.headline)
            FoilerFliessReihe(abstand: 12) {
                ForEach(mitglieder) { m in eintrag(m) }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func eintrag(_ m: TeamMitglied) -> some View {
        HStack(spacing: 6) {
            AvatarView(name: m.name, url: Api.mediaURL(m.avatar_url), size: 28, userId: m.user_id)
            Text(m.name).font(.subheadline).lineLimit(1)
            if m.rolle != "mitglied" {
                Text(Loc.t("team.rolle." + m.rolle, lang)).font(.caption2).foregroundStyle(tf.akzent)
            }
        }
    }
}

/// Team-Logbuch: wer wann welchen Teamrekord gebrochen hat.
private struct TeamLogbuchKarte: View {
    let eintraege: [TeamLogbuchEintrag]
    let lang: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("team.logbuch", lang)).font(.headline)
            Text(Loc.t("team.logbuchHinweis", lang)).font(.caption).foregroundStyle(.secondary)
            if eintraege.isEmpty {
                Text(Loc.t("team.logbuchLeer", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(Array(eintraege.enumerated()), id: \.offset) { i, e in
                    if i > 0 { Divider() }
                    zeile(e)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func text(_ e: TeamLogbuchEintrag) -> String {
        let k: TeamKennzahl = teamKennzahl(e.kennzahl)
        let vorherWert: String = e.vorher_wert.map { k.fmt($0, lang) } ?? ""
        let werte: [String: String] = ["name": e.name ?? "—", "was": Loc.t(k.labelKey, lang), "wert": k.fmt(e.wert, lang),
                                       "vorher": e.vorher_name ?? "—", "vorherWert": vorherWert]
        return teamText(e.vorher_wert == nil ? "team.logbuch.start" : "team.logbuch.gebrochen", lang, werte)
    }

    @ViewBuilder private func zeile(_ e: TeamLogbuchEintrag) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(teamKurzdatum(e.gefahren_am ?? e.erfasst_am, lang)).font(.caption).foregroundStyle(.secondary)
                .frame(width: 72, alignment: .leading)
            if let sid = e.session_id {
                NavigationLink { SessionDetailView(id: sid) } label: {
                    Text(text(e)).font(.subheadline).multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
            } else {
                Text(text(e)).font(.subheadline)
            }
        }
        .padding(.vertical, 4)
    }
}

/// Teamadresse zum Teilen (nur fuer Mitglieder, als Karte). Der Satz darunter sagt, was Gaeste dort sehen.
private struct TeamAdresseKarte: View {
    let k: TeamInfo
    let lang: String

    private var url: URL? { Api.teamWebURL("/teams/" + k.slug) }
    private var zustand: String {
        if k.bestenlisten_oeffentlich == true { return "oeffentlich" }
        return k.oeffentlich == true ? "wartet" : "intern"
    }
    private var hinweisFarbe: Color { zustand == "oeffentlich" ? Color.secondary : Color.orange }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("team.adresseTeilen.titel", lang)).font(.subheadline.weight(.semibold))
            if let u = url { TeamTeilenZeile(url: u, titel: k.name, farbe: k.farbe, lang: lang) }
            Text(Loc.t("team.adresseTeilen." + zustand, lang)).font(.footnote).foregroundStyle(hinweisFarbe)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Adresse + Kopieren + Teilen (Team- und Event-Adresse).
struct TeamTeilenZeile: View {
    let url: URL
    let titel: String
    let farbe: String?
    let lang: String
    @State private var kopiert = false

    private var kopierText: String { Loc.t(kopiert ? "team.kopiert" : "team.kopieren", lang) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(url.absoluteString).font(.footnote.monospaced()).lineLimit(1).truncationMode(.middle)
                .textSelection(.enabled)
            HStack(spacing: 8) {
                TeamKnopf(titel: kopierText, farbe: farbe) { kopieren() }
                ShareLink(item: url, subject: Text(titel)) {
                    teamUmrissKnopf(Loc.t("team.teilen", lang), "square.and.arrow.up", TeamFarbe(farbe).akzent)
                }
            }
        }
    }

    private func kopieren() {
        UIPasteboard.general.string = url.absoluteString
        kopiert = true
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            kopiert = false
        }
    }
}

/// Beitritts-Dialog — auch von der Event-Seite. Das Kleingedruckte steht IMMER da (Jan, 31.10.2026): wer
/// beitritt, stimmt zu, dass die Bestenlisten oeffentlich sein KOENNEN (web BeitrittDialog).
struct TeamBeitrittSheet: View {
    let name: String
    let oeffentlich: Bool
    let freigabeNoetig: Bool
    let farbe: String?
    let busy: Bool
    let lang: String
    let onJa: () -> Void
    let onNein: () -> Void

    private var titel: String { teamText("team.join.title", lang, ["name": name]) }
    private var text: String {
        if freigabeNoetig { return Loc.t("team.join.anfrage", lang) + " " + Loc.t("team.join.anfrageProfil", lang) }
        return Loc.t("team.join.direkt", lang)
    }
    private var klein: String {
        Loc.t(oeffentlich ? "team.join.kleinOeffentlich" : "team.join.kleinIntern", lang) + " " + Loc.t("team.join.kleinAenderbar", lang)
    }
    private var jaText: String { Loc.t(freigabeNoetig ? "team.join.anfragen" : "team.join.beitreten", lang) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(titel).font(.title3.weight(.bold))
            Text(text).font(.subheadline)
            Text(klein).font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Spacer()
                Button(Loc.t("common.cancel", lang), action: onNein)
                TeamKnopf(titel: jaText, farbe: farbe, deaktiviert: busy, aktion: onJa)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.medium])
    }
}

/// Reiter „Regeln" (web TeamRegeln eingebettet, Jan 02.11.2026): je Abschnitt ein Titel und Punkte; die Punkte stehen in
/// EINEM Text je Abschnitt, getrennt durch Zeilenumbrueche. Muss zu server/app/teams.py passen.
struct TeamRegelnInhalt: View {
    let lang: String

    private static let abschnitte: [String] = ["was", "rollen", "beitreten", "oeffentlich", "bestenlisten", "statistik",
                                               "logbuch", "events", "chat", "loeschen", "konto", "haftung"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Loc.t("team.regeln.intro", lang)).font(.subheadline).foregroundStyle(.secondary)
            ForEach(Self.abschnitte, id: \.self) { a in abschnitt(a) }
        }
    }

    private func punkte(_ a: String) -> [String] {
        Loc.t("team.regeln." + a + ".text", lang).components(separatedBy: "\n").filter { !$0.isEmpty }
    }

    private func abschnitt(_ a: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("team.regeln." + a + ".titel", lang)).font(.subheadline.weight(.semibold))
            ForEach(Array(punkte(a).enumerated()), id: \.offset) { _, z in
                HStack(alignment: .top, spacing: 6) {
                    Text("•").font(.subheadline).foregroundStyle(.secondary)
                    Text(z).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
