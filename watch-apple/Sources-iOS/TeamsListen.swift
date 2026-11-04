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

    private var linkZeile: some View {
        HStack(spacing: 16) {
            Spacer()
            Button { pfad.append(TeamsZiel.alleEvents) } label: { linkText("team.alleEvents") }
                .buttonStyle(.borderless)
            Button { pfad.append(TeamsZiel.alleTeams) } label: { linkText("team.alle") }
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

/// Startseite: eigene (aktive) Teams als kleine Links mit Wappen und Teamfarbe; offene Anfragen (nur Leitung/
/// Moderatoren) als Zahl daneben. Der Link fuehrt immer auf die Teamseite (Jan: „nicht direkt ins management").
/// Ohne Teams zeichnet die Zeile nichts (eine leere Zeile ist trotzdem da, damit sie laedt).
struct MeineTeamsZeile: View {
    let lang: String
    var neuLadenTick: Int = 0
    @State private var teams: [TeamKurz] = []

    private var hoehe: CGFloat { teams.isEmpty ? 0 : 24 }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(teams) { tm in link(tm) }
            }
        }
        .frame(height: hoehe)
        .task(id: neuLadenTick) { await laden() }
    }

    private func link(_ tm: TeamKurz) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 4) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 16)
                Text(tm.name).font(.caption).foregroundStyle(TeamFarbe(tm.farbe).akzent).lineLimit(1)
                if tm.anfragen > 0 { TeamAnfragenZahl(n: tm.anfragen) }
            }
        }
        .buttonStyle(.plain)
    }

    private func laden() async {
        guard let alle = try? await Api.teamsMine() else { return }
        teams = alle.filter { $0.status == "aktiv" }
    }
}

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

/// Profil: „Meine Teams" (aktiv und angefragt) und der Link „Alle Teams". Je Zeile genau ein Link.
struct MeineTeamsSection: View {
    let lang: String
    @State private var teams: [TeamKurz] = []

    var body: some View {
        Section {
            ForEach(teams) { tm in zeile(tm) }
            NavigationLink { TeamsAlleView() } label: {
                Label { Text(Loc.t("team.alle", lang)) } icon: { Image(systemName: "person.3").foregroundStyle(Color.accentColor) }
            }
            NavigationLink { EventsAlleView() } label: {
                Label { Text(Loc.t("team.alleEvents", lang)) } icon: { Image(systemName: "flag.checkered").foregroundStyle(Color.accentColor) }
            }
        } header: {
            Text(Loc.t("team.meine", lang))
        }
        .task { await laden() }
    }

    private func rolleText(_ tm: TeamKurz) -> String {
        Loc.t(tm.status == "angefragt" ? "team.join.wartet" : "team.rolle." + tm.rolle, lang)
    }

    private func zeile(_ tm: TeamKurz) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 10) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 24)
                Text(tm.name).foregroundStyle(TeamFarbe(tm.farbe).akzent).lineLimit(1)
                Spacer(minLength: 4)
                Text(rolleText(tm)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if tm.anfragen > 0 { TeamAnfragenZahl(n: tm.anfragen) }
            }
        }
    }

    private func laden() async {
        teams = (try? await Api.teamsMine()) ?? teams
    }
}

/// Home › Team (App-Port Phase 3, 04.11.2026, wie Web): die eigenen Teams als Zeilen, darunter der Weg zu allen Teams
/// (dort mit Suche). Ohne Team der Hinweis aus dem Web.
struct HomeTeamsListe: View {
    let lang: String
    var neuLadenTick: Int = 0
    @State private var teams: [TeamKurz]? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let t = teams, t.isEmpty {
                Text(Loc.t("team.keineTeams", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else if let t = teams {
                VStack(spacing: 0) {
                    ForEach(t) { tm in zeile(tm) }
                }
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
            }
            NavigationLink { TeamsAlleView() } label: {
                Text(Loc.t("team.alle", lang) + " →").font(.subheadline)
            }
        }
        .task(id: neuLadenTick) { teams = ((try? await Api.teamsMine()) ?? teams ?? []).filter { $0.status == "aktiv" } }
    }

    private func zeile(_ tm: TeamKurz) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 10) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tm.name).font(.subheadline.weight(.semibold)).foregroundStyle(TeamFarbe(tm.farbe).akzent).lineLimit(1)
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
