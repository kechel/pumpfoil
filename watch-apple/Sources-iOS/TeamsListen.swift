import SwiftUI

// Listen und Einstiege der Teams (Native-Port Stufe 4, 01.11.2026):
//  * Community-Abschnitt „Laufende & kommende Events" mit Links „Alle Events" / „Alle Teams" (web Home.tsx TeamsSection)
//  * „Alle Teams" mit Suche (web TeamsAlle.tsx), „Alle Events" endlos scrollend, 20 je Seite (web EventsAlle.tsx)
//  * eigene Teams auf der Startseite (Wappen + Name, offene Anfragen als Zahl) und im Profil

/// Ziel-Ansicht fuer wert-basierte Links (`TeamsZiel`), z. B. im Community-Stapel.
struct TeamsZielView: View {
    let ziel: TeamsZiel

    var body: some View {
        switch ziel {
        case .alleTeams: TeamsAlleView()
        case .alleEvents: EventsAlleView()
        case .team(let slug): TeamView(slug: slug)
        case .event(let slug, let id): TeamEventView(slug: slug, eventId: id)
        // „Team gruenden" aus der Community: die Seite /teams des Webs (eigene Teams, Suche, Gruenden).
        case .gruenden:
            EinstellungenTeamView(lang: Api.uiLang)
                .navigationTitle(Loc.t("team.meine", Api.uiLang))
                .navigationBarTitleDisplayMode(.inline)
                .feedbackToolbar("/teams")
        }
    }
}

// MARK: - Community-Abschnitt

/// Laufende und in den naechsten Tagen beginnende Events, alle; je Event eine Listenzeile mit GENAU einem Link
/// (mehrere Links in einer List-Zeile oeffnen sonst zwei Ziele, s. CommunityView). Die beiden Links unten sind
/// Knoepfe, die selbst genau ein Ziel an den Stapel haengen.
struct TeamEventsAbschnitt: View {
    let lang: String
    @Binding var pfad: NavigationPath
    @State private var events: [TeamEventKurz]?

    var body: some View {
        Section {
            if let ev = events, ev.isEmpty {
                Text(Loc.t("team.event.keineAktuellen", lang)).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(events ?? []) { e in zeile(e) }
            linkZeile
        } header: {
            Label(Loc.t("team.eventsAktuell", lang), systemImage: "flag.checkered").font(.headline)
        }
        .task { if events == nil { await laden() } }
    }

    private func zeile(_ e: TeamEventKurz) -> some View {
        NavigationLink(value: TeamsZiel.event(e.team.slug, e.id)) {
            TeamEventKachel(d: EventKachelDaten(e), lang: lang)
        }
        .listRowSeparator(.hidden)
    }

    // „Alle Teams" steht seit 04.11.2026 unter den aktivsten Teams (AktivsteTeamsAbschnitt), wie im Web.
    private var linkZeile: some View {
        HStack(spacing: 16) {
            Spacer()
            Button { pfad.append(TeamsZiel.alleEvents) } label: { linkText("team.alleEvents") }
                .buttonStyle(.borderless)
        }
    }

    private func linkText(_ key: String) -> some View {
        Text(Loc.t(key, lang) + " →").font(.subheadline).foregroundStyle(Color.accentColor)
    }

    func laden() async {
        events = (try? await Api.teamsEventsAktuell()) ?? []
    }
}

// MARK: - Aktivste Teams

/// „Aktivste Teams" der Community (web Home.tsx `AktivsteTeams`): die 10 Teams mit den meisten Sessions ihrer
/// Mitglieder in 30 Tagen; ohne solche Teams entfaellt der Abschnitt. Darunter immer „Alle Teams" und „Team gruenden".
struct AktivsteTeamsAbschnitt: View {
    let lang: String
    @Binding var pfad: NavigationPath
    @State private var teams: [TeamListenEintrag]?

    private var top: [TeamListenEintrag] {
        Array((teams ?? []).filter { ($0.sessions_30d ?? 0) > 0 }
            .sorted { ($0.sessions_30d ?? 0) > ($1.sessions_30d ?? 0) }.prefix(10))
    }

    var body: some View {
        Group {
            if !top.isEmpty {
                Section {
                    ForEach(top) { tm in
                        NavigationLink(value: TeamsZiel.team(tm.slug)) { zeile(tm) }
                    }
                } header: {
                    Text(Loc.t("team.aktivste", lang)).font(.headline)
                }
            }
            Section {
                HStack(spacing: 16) {
                    Spacer()
                    Button { pfad.append(TeamsZiel.alleTeams) } label: { linkText("team.alle") }
                        .buttonStyle(.borderless)
                    Button { pfad.append(TeamsZiel.gruenden) } label: { linkText("team.gruenden") }
                        .buttonStyle(.borderless)
                }
            }
        }
        .task { if teams == nil { teams = (try? await Api.teamsListe()) ?? [] } }
    }

    private func linkText(_ key: String) -> some View {
        Text(Loc.t(key, lang) + " →").font(.subheadline).foregroundStyle(Color.accentColor)
    }

    private func unterzeile(_ tm: TeamListenEintrag) -> String {
        let n: String = teamText("team.mitgliederAnzahl", lang, ["n": String(tm.mitglieder_anzahl)])
        let sp: String = teamSportartenText(tm.sportarten, lang)
        return sp.isEmpty ? n : n + " · " + sp
    }

    private func zeile(_ tm: TeamListenEintrag) -> some View {
        let tf = TeamFarbe(tm.farbe)
        return HStack(spacing: 10) {
            TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(tm.name).font(.subheadline.weight(.semibold)).foregroundStyle(tf.akzent).lineLimit(1)
                    TeamHerkunftMarke(land: tm.land)
                }
                Text(unterzeile(tm)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(String(tm.sessions_30d ?? 0)).font(.headline.monospacedDigit()).foregroundStyle(tf.akzent)
                Text(Loc.t("team.sessions30", lang)).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Alle Teams

struct TeamsAlleView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rows: [TeamListenEintrag]?
    @State private var q = ""

    private var treffer: [TeamListenEintrag] {
        (rows ?? []).filter { passtZu(q, $0.name, $0.slug, $0.beschreibung ?? "") }
    }

    var body: some View {
        inhalt
            .navigationTitle(Loc.t("team.alle", lang))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $q, prompt: Loc.t("team.alleSuche", lang))
            .feedbackToolbar("/teams/liste")
            .task { if rows == nil { await laden() } }
            .refreshable { await laden() }
    }

    @ViewBuilder private var inhalt: some View {
        if let r = rows {
            List {
                leerZeile(r)
                ForEach(treffer) { tm in zeile(tm) }
            }
            .listStyle(.plain)
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder private func leerZeile(_ r: [TeamListenEintrag]) -> some View {
        if r.isEmpty {
            Text(Loc.t("team.communityLeer", lang)).foregroundStyle(.secondary)
        } else if treffer.isEmpty {
            Text(Loc.t("team.alleLeer", lang)).foregroundStyle(.secondary)
        }
    }

    private func unterzeile(_ tm: TeamListenEintrag) -> String {
        let n: String = teamText("team.mitgliederAnzahl", lang, ["n": String(tm.mitglieder_anzahl)])
        let sp: String = teamSportartenText(tm.sportarten, lang)
        return sp.isEmpty ? n : n + " · " + sp
    }

    private func zeile(_ tm: TeamListenEintrag) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 12) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tm.name).font(.headline).foregroundStyle(TeamFarbe(tm.farbe).akzent).lineLimit(1)
                    Text(unterzeile(tm)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func laden() async {
        rows = (try? await Api.teamsListe()) ?? []
    }
}

// MARK: - Alle Events

/// Alle Events, die man oeffnen darf (oeffentliche, freigegebene Teams und eigene Teams): erst laufende, dann
/// kommende, dann vergangene. Nachladen, sobald das Ende der Liste sichtbar wird.
struct EventsAlleView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var events: [TeamEventKurz]?
    @State private var mehrDa = true
    @State private var laedt = false

    private let seite: Int = 20

    var body: some View {
        inhalt
            .navigationTitle(Loc.t("team.alleEvents", lang))
            .navigationBarTitleDisplayMode(.inline)
            .feedbackToolbar("/events")
            .task { if events == nil { await seiteHolen() } }
            .refreshable { await neuLaden() }
    }

    @ViewBuilder private var inhalt: some View {
        if let ev = events {
            List {
                if ev.isEmpty { Text(Loc.t("team.alleEventsLeer", lang)).foregroundStyle(.secondary) }
                ForEach(ev, id: \.listenId) { e in zeile(e) }
                if mehrDa && !ev.isEmpty { fuehler }
            }
            .listStyle(.plain)
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func zeile(_ e: TeamEventKurz) -> some View {
        NavigationLink { TeamEventView(slug: e.team.slug, eventId: e.id) } label: {
            TeamEventKachel(d: EventKachelDaten(e), lang: lang)
        }
        .listRowSeparator(.hidden)
    }

    /// Ladezeile am Listenende: erscheint sie, kommt die naechste Seite.
    private var fuehler: some View {
        ProgressView().frame(maxWidth: .infinity)
            .listRowSeparator(.hidden)
            .onAppear { Task { await seiteHolen() } }
    }

    private func seiteHolen() async {
        guard !laedt, mehrDa else { return }
        laedt = true
        defer { laedt = false }
        let offset: Int = events?.count ?? 0
        do {
            let neu = try await Api.teamsEventsAlle(offset: offset, n: seite)
            if neu.count < seite { mehrDa = false }
            events = (events ?? []) + neu
        } catch {
            mehrDa = false
            if events == nil { events = [] }
        }
    }

    private func neuLaden() async {
        events = nil
        mehrDa = true
        await seiteHolen()
    }
}

// MARK: - Eigene Teams

/// Offene Beitrittsanfragen als kleine Zahl in Marken-Cyan.
struct TeamAnfragenZahl: View {
    let n: Int

    var body: some View {
        Text(String(n)).font(.caption2.weight(.bold))
            .foregroundStyle(Color(red: 0x02 / 255, green: 0x06 / 255, blue: 0x17 / 255))
            .padding(.horizontal, 5)
            .background(Color.accentColor, in: Capsule())
    }
}

/// Home › Team (App-Port Phase 3, 04.11.2026, wie Web): die eigenen Teams als Zeilen, darunter der Weg zu allen Teams
/// (dort mit Suche). Ohne Team der Hinweis aus dem Web und gleich die Teamsuche + „Team gruenden" (Phase 6).
struct HomeTeamsListe: View {
    let lang: String
    var neuLadenTick: Int = 0
    @State private var teams: [TeamKurz]? = nil
    // Neu gegruendetes Team: die Verwaltung haengt HIER (bleibt stehen), nicht an der Gruenden-Karte, die beim Neuladen
    // der Teamliste verschwindet.
    @State private var neuSlug: String?
    @State private var zeigeNeu = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let t = teams, t.isEmpty {
                Text(Loc.t("team.keineTeams", lang)).font(.subheadline).foregroundStyle(.secondary)
                TeamSuche(lang: lang)
                TeamGruendenKarte(lang: lang) { s in neuSlug = s; zeigeNeu = true }
            } else if let t = teams {
                VStack(spacing: 0) {
                    ForEach(t) { tm in zeile(tm) }
                }
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
                // Die letzten Sessions der Teammitglieder (PWA TeamLetzteMitWahl).
                TeamLetzteAbschnitt(teams: t, lang: lang)
            }
            NavigationLink { TeamsAlleView() } label: {
                Text(Loc.t("team.alle", lang) + " →").font(.subheadline)
            }
        }
        .task(id: neuLadenTick) { teams = ((try? await Api.teamsMine()) ?? teams ?? []).filter { $0.status == "aktiv" } }
        .navigationDestination(isPresented: $zeigeNeu) {
            if let s = neuSlug { TeamVerwaltungView(slug: s, start: "einstellungen") }
        }
    }

    private func zeile(_ tm: TeamKurz) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 10) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Text(tm.name).font(.subheadline.weight(.semibold)).foregroundStyle(TeamFarbe(tm.farbe).akzent).lineLimit(1)
                        TeamHerkunftMarke(land: tm.land)
                    }
                    Text(Loc.t("team.rolle." + tm.rolle, lang)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                if tm.anfragen > 0 { TeamAnfragenZahl(n: tm.anfragen) }
            }
            .padding(8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
