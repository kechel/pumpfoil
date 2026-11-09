import SwiftUI

// Events anlegen, aendern, loeschen und das Eventbild (App-Port, 04.11.2026) — wie web/src/components/TeamEventsVerwalten.tsx.
// In der Team-Verwaltung („Verwalten", Leitung und Moderatoren) die Liste mit „+ Neues Event"; auf der Event-Seite das
// Zahnrad (web TeamEventSeite.tsx), das denselben Editor fuer genau dieses Event oeffnet. Vorlagen fuellen Titel, Kennzahl
// und (Wochenende/Monat) das Zeitfenster vor; danach ist alles frei. Zeiten gelten in der Zeitzone des Geraets, die
// mitgespeichert wird, damit „Samstag 0 Uhr" fuer alle derselbe Zeitpunkt bleibt. Zu geht der Editor nur ueber
// Speichern oder Abbrechen (kein Wischen) — sonst waeren halb eingegebene Events weg.

/// Vorlagen wie web lib/teamEvents.ts EVENT_VORLAGEN (Schluessel, Titel, Kennzahl, Zeitfenster Wochenende/Monat).
struct TeamEventVorlage {
    let key: String
    let titelKey: String
    let kennzahl: String
    let monat: Bool
}

let TEAM_EVENT_VORLAGEN: [TeamEventVorlage] = [
    TeamEventVorlage(key: "wochenende_pumps", titelKey: "team.vorlage.wochenende_pumps", kennzahl: "sum_pumps", monat: false),
    TeamEventVorlage(key: "wochenende_laeufe", titelKey: "team.vorlage.wochenende_laeufe", kennzahl: "sum_runs", monat: false),
    TeamEventVorlage(key: "laengster_lauf", titelKey: "team.vorlage.laengster_lauf", kennzahl: "duration", monat: false),
    TeamEventVorlage(key: "weitester_lauf", titelKey: "team.vorlage.weitester_lauf", kennzahl: "distance", monat: false),
    TeamEventVorlage(key: "top_speed", titelKey: "team.vorlage.top_speed", kennzahl: "speed", monat: false),
    TeamEventVorlage(key: "session_pumps", titelKey: "team.vorlage.session_pumps", kennzahl: "session_pumps", monat: false),
    TeamEventVorlage(key: "monat_strecke", titelKey: "team.vorlage.monat_strecke", kennzahl: "sum_distance", monat: true),
]

/// Naechster Samstag 0:00 bis Montag 0:00 (lokal); ist heute Samstag, der naechste.
func teamEventWochenende() -> (Date, Date) {
    let k = Calendar.current
    let heute: Date = k.startOfDay(for: Date())
    let wt: Int = k.component(.weekday, from: heute)   // 1 = Sonntag … 7 = Samstag
    var bis: Int = (7 - wt + 7) % 7
    if bis == 0 { bis = 7 }
    let sa: Date = k.date(byAdding: .day, value: bis, to: heute) ?? heute
    return (sa, k.date(byAdding: .day, value: 2, to: sa) ?? sa)
}

/// Dieser Monat (1. 0:00 bis 1. des naechsten Monats).
func teamEventMonat() -> (Date, Date) {
    let k = Calendar.current
    let a: Date = k.date(from: k.dateComponents([.year, .month], from: Date())) ?? Date()
    return (a, k.date(byAdding: .month, value: 1, to: a) ?? a)
}

/// Bearbeitbarer Stand eines Events (web `Entwurf`).
struct TeamEventEntwurf: Identifiable {
    var eventId: Int?
    var eingefroren = false
    var banner_url: String?
    var banner_fokus: String?
    var ohne_dateien = false
    var teambild_zeigen = true
    var summen: [String] = []
    var summen_sportart = "pumpfoil"
    var summen_accel_only = false
    var titel = ""
    var beschreibung = ""
    var start: Date
    var ende: Date
    var tafeln: [TeamTafelEntwurf] = [TeamTafelEntwurf()]
    var spot_ids: [Int] = []
    var vorlage: String?
    /// Globales Event (06.11.2026, nur im offiziellen Team) und Teamwertung: beste N, 0 = alle.
    var global_event = false
    var team_wertung_n = 5
    let id = UUID()

    static func neu() -> TeamEventEntwurf {
        let (a, b) = teamEventWochenende()
        return TeamEventEntwurf(start: a, ende: b)
    }

    static func aus(_ ev: TeamEvent) -> TeamEventEntwurf {
        var e = TeamEventEntwurf(start: teamDatum(ev.start) ?? Date(), ende: teamDatum(ev.ende) ?? Date())
        e.eventId = ev.id
        e.eingefroren = ev.status == "beendet"
        e.banner_url = ev.banner_url
        e.banner_fokus = ev.banner_fokus
        e.ohne_dateien = ev.ohne_dateien ?? false
        e.teambild_zeigen = ev.teambild_zeigen != false
        e.summen = ev.summen_auswahl ?? []
        e.summen_sportart = ev.summen_sportart ?? "pumpfoil"
        e.summen_accel_only = ev.summen_accel_only ?? false
        e.titel = ev.titel
        e.beschreibung = ev.beschreibung ?? ""
        e.tafeln = ev.tafeln.map { TeamTafelEntwurf($0) }
        e.spot_ids = ev.spot_ids ?? ev.spots.map { $0.id }
        e.vorlage = ev.vorlage
        e.global_event = ev.istGlobal
        e.team_wertung_n = ev.team_wertung_n ?? 5
        return e
    }

    var speicherbar: Bool {
        titel.trimmingCharacters(in: .whitespaces).count >= 2 && (!tafeln.isEmpty || !summen.isEmpty)
    }

    var json: [String: Any] {
        let iso = ISO8601DateFormatter()
        let b: String = beschreibung.trimmingCharacters(in: .whitespacesAndNewlines)
        let beschr: Any = b.isEmpty ? NSNull() as Any : b as Any
        let vorl: Any = vorlage.map { $0 as Any } ?? NSNull() as Any
        return [
            "titel": titel.trimmingCharacters(in: .whitespaces),
            "beschreibung": beschr,
            "start": iso.string(from: start), "ende": iso.string(from: ende),
            "zeitzone": TimeZone.current.identifier,
            "tafeln": tafeln.map { $0.json(mitTeamspots: false) },
            "spot_ids": spot_ids,
            "vorlage": vorl,
            "ohne_dateien": ohne_dateien,
            "teambild_zeigen": teambild_zeigen,
            "summen": summen,
            "summen_sportart": summen_sportart,
            "summen_accel_only": summen_accel_only,
            "global_event": global_event,
            "team_wertung_n": global_event ? team_wertung_n as Any : NSNull() as Any,
        ]
    }
}

// MARK: - Liste in der Verwaltung

struct TeamEventsVerwaltenKarte: View {
    let slug: String
    let farbe: String?
    let auswahl: TeamAuswahl?
    let lang: String
    let melden: (String) -> Void
    /// Offizielles Team (06.11.2026): im Editor der Haken „Globales Event" und die Teamwertung.
    var offiziell: Bool = false
    @State private var liste: [TeamEvent] = []
    @State private var offen: TeamEventEntwurf?

    var body: some View {
        TeamKarte {
            Text(Loc.t("team.events", lang)).font(.headline)
            ForEach(Array(liste.enumerated()), id: \.element.id) { i, ev in
                if i > 0 { Divider() }
                zeile(ev)
            }
            TeamKnopf(titel: "+ " + Loc.t("team.event.neu", lang), farbe: farbe) { offen = TeamEventEntwurf.neu() }
                .padding(.top, 4)
        }
        .task { await laden() }
        .sheet(item: $offen) { e in
            TeamEventEditor(slug: slug, farbe: farbe, entwurf: e, auswahl: auswahl, lang: lang, offiziell: offiziell) { gespeichert in
                offen = nil
                Task { await laden() }
                if gespeichert { melden(Loc.t("team.gespeichert", lang)) }
            }
        }
    }

    private func zeile(_ ev: TeamEvent) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ev.titel).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(Loc.t("team.event.status." + ev.status, lang) + " · " + eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            // Loeschen nur im Editor (wie im Web); eingefrorene Events oeffnen ihn nur noch zum Loeschen.
            Button(Loc.t("team.event.bearbeiten", lang)) { offen = TeamEventEntwurf.aus(ev) }
                .font(.subheadline).buttonStyle(.bordered)
        }
        .padding(.vertical, 2)
    }

    private func laden() async {
        if let l = try? await Api.teamEvents(slug) { liste = l }
    }
}

// MARK: - Editor

struct TeamEventEditor: View {
    let slug: String
    let farbe: String?
    @State var entwurf: TeamEventEntwurf
    @State var auswahl: TeamAuswahl?
    let lang: String
    /// Offizielles Team: Haken „Globales Event" + Teamwertung (web 5a5db913). Sonst wird nie global gespeichert.
    var offiziell: Bool = false
    /// `true` = gespeichert, `false` = abgebrochen oder geloescht.
    let fertig: (Bool) -> Void
    var geloescht: (() -> Void)? = nil
    @State private var fehler: String?
    @State private var busy = false
    @State private var loeschenFragen = false

    private var kopf: String {
        guard entwurf.eventId != nil else { return Loc.t("team.event.neu", lang) }
        return Loc.t("team.event.bearbeiten", lang) + ": " + entwurf.titel
    }

    var body: some View {
        NavigationStack {
            Form {
                if entwurf.eingefroren {
                    Section {
                        Text(entwurf.titel).font(.headline)
                        Text(Loc.t("team.err.event_eingefroren", lang)).font(.subheadline).foregroundStyle(.secondary)
                    }
                } else {
                    if offiziell { globalSection }
                    grundSection
                    tafelnSection
                    summenSection
                    spotsSection
                    Section { Toggle(Loc.t("team.event.ohneDateien", lang), isOn: $entwurf.ohne_dateien).font(.subheadline) }
                }
                if let f = fehler { Section { Text(f).foregroundStyle(.red) } }
                if entwurf.eventId != nil { loeschenSection }
            }
            .navigationTitle(kopf)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { leiste }
            .alert(teamText("team.event.loeschenFrage", lang, ["titel": entwurf.titel]), isPresented: $loeschenFragen) {
                Button(Loc.t("common.cancel", lang), role: .cancel) { }
                Button(Loc.t("common.delete", lang), role: .destructive) { Task { await loeschen() } }
            }
        }
        .interactiveDismissDisabled(true)
        .task { if auswahl == nil { auswahl = await TeamAuswahl.laden(lang) } }
    }

    @ToolbarContentBuilder private var leiste: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { fertig(false) } }
        if !entwurf.eingefroren {
            ToolbarItem(placement: .confirmationAction) {
                Button(entwurf.eventId != nil ? Loc.t("common.save", lang) : Loc.t("team.event.anlegen", lang)) { Task { await speichern() } }
                    .disabled(!entwurf.speicherbar || busy)
            }
        }
    }

    // MARK: Abschnitte

    private var vorlageWahl: Binding<String> {
        Binding(get: { entwurf.vorlage ?? "" }, set: { k in vorlageSetzen(k) })
    }

    /// Globales Event (06.11.2026): jeder mit passenden Sessions nimmt teil, dazu eine Team-Rangliste aus den besten N
    /// Mitgliedern jedes Teams. Nur im offiziellen Team.
    @ViewBuilder private var globalSection: some View {
        Section {
            Toggle(isOn: $entwurf.global_event) {
                Text(Loc.t("team.event.globalHaken", lang)).font(.subheadline.weight(.semibold))
            }
            if entwurf.global_event {
                Picker(Loc.t("team.event.wertung", lang), selection: $entwurf.team_wertung_n) {
                    ForEach([3, 5, 10], id: \.self) { n in
                        Text(teamText("team.event.wertungBeste", lang, ["n": String(n)])).tag(n)
                    }
                    Text(Loc.t("team.event.wertungAlle", lang)).tag(0)
                }
                .font(.subheadline)
            }
        }
        .listRowBackground(TeamFarbe(nil).flaeche.opacity(0.10))
    }

    @ViewBuilder private var grundSection: some View {
        Section {
            if entwurf.eventId == nil {
                Picker(Loc.t("team.event.vorlage", lang), selection: vorlageWahl) {
                    Text(Loc.t("team.event.ohneVorlage", lang)).tag("")
                    ForEach(TEAM_EVENT_VORLAGEN, id: \.key) { v in Text(Loc.t(v.titelKey, lang)).tag(v.key) }
                }
            }
            // Eventbild erst bei einem gespeicherten Event — der Upload braucht dessen id.
            if let id = entwurf.eventId { eventBild(id) }
            if entwurf.banner_url == nil {
                Toggle(Loc.t("team.event.teambildZeigen", lang), isOn: $entwurf.teambild_zeigen).font(.subheadline)
            }
            TextField(Loc.t("team.event.titel", lang), text: $entwurf.titel)
                .onChange(of: entwurf.titel) { t in if t.count > 80 { entwurf.titel = String(t.prefix(80)) } }
            DatePicker(Loc.t("team.event.start", lang), selection: $entwurf.start)
            DatePicker(Loc.t("team.event.ende", lang), selection: $entwurf.ende)
            TextField(Loc.t("team.beschreibung", lang), text: $entwurf.beschreibung, axis: .vertical)
                .lineLimit(2...6)
                .onChange(of: entwurf.beschreibung) { t in if t.count > 1000 { entwurf.beschreibung = String(t.prefix(1000)) } }
        }
    }

    private func eventBild(_ id: Int) -> some View {
        TeamBildBearbeiten(url: entwurf.banner_url, fokus: entwurf.banner_fokus, event: true, lang: lang,
                           hochladen: { b in
                               let r = try await Api.teamEventBanner(slug, id: id, bild: b)
                               entwurf.banner_url = r.banner_url; entwurf.banner_fokus = r.banner_fokus
                           },
                           fokusSetzen: { f in
                               let r = try await Api.teamEventBannerFokus(slug, id: id, fokus: f)
                               entwurf.banner_fokus = r.banner_fokus ?? f
                           },
                           entfernen: { try await Api.teamEventBannerEntfernen(slug, id: id); entwurf.banner_url = nil },
                           fehler: { fehler = Api.teamFehlerText($0, lang) })
    }

    // Auch die letzte Bestenliste darf weg, wenn Gesamtsummen gewaehlt sind (Event nur mit Summen).
    @ViewBuilder private var tafelnSection: some View {
        Section(Loc.t("team.bestenlisten", lang)) {
            ForEach($entwurf.tafeln) { $tf in
                VStack(alignment: .leading, spacing: 4) {
                    TeamTafelEditor(tf: $tf, auswahl: auswahl, lang: lang, mitTeamspots: false, gruppiert: false)
                    if entwurf.tafeln.count > 1 || !entwurf.summen.isEmpty {
                        Button(role: .destructive) { tafelWeg(tf.id) } label: {
                            Label(Loc.t("common.delete", lang), systemImage: "trash").font(.subheadline)
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            if entwurf.tafeln.count < 10 {
                Button("+ " + Loc.t("team.tafel.neu", lang)) { entwurf.tafeln.append(TeamTafelEntwurf()) }
            }
        }
    }

    private func summeAn(_ key: String) -> Binding<Bool> {
        Binding(get: { entwurf.summen.contains(key) }, set: { an in
            if an { if !entwurf.summen.contains(key) { entwurf.summen.append(key) } }
            else { entwurf.summen.removeAll { $0 == key } }
        })
    }

    // Gesamtsummen ueber alle Teilnehmer, einzeln anklickbar. Die letzte bleibt, solange es keine Bestenliste gibt.
    @ViewBuilder private var summenSection: some View {
        Section {
            ForEach(EVENT_SUMMEN, id: \.key) { k in
                Toggle(Loc.t(k.labelKey, lang), isOn: summeAn(k.key)).font(.subheadline)
                    .disabled(entwurf.tafeln.isEmpty && entwurf.summen == [k.key])
            }
            if entwurf.tafeln.isEmpty {
                Picker("", selection: $entwurf.summen_sportart) {
                    ForEach(auswahl?.sports ?? ["pumpfoil"], id: \.self) { s in Text(Loc.t("cls.sport." + s, lang)).tag(s) }
                }
                Toggle(Loc.t("team.tafel.nurBewegung", lang), isOn: $entwurf.summen_accel_only).font(.subheadline)
            }
        } header: {
            Text(Loc.t("team.event.summen", lang))
        } footer: {
            Text(Loc.t("team.event.summenHinweis", lang))
        }
    }

    @ViewBuilder private var spotsSection: some View {
        Section(Loc.t("team.event.spots", lang)) {
            if entwurf.spot_ids.isEmpty {
                Text(Loc.t("team.event.alleSpots", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                FoilerFliessReihe(abstand: 6) {
                    ForEach(entwurf.spot_ids, id: \.self) { id in
                        TeamSpotPille(name: auswahl?.spotName(id) ?? "#\(id)", farbe: farbe) {
                            entwurf.spot_ids.removeAll { $0 == id }
                        }
                    }
                }
            }
            TeamSpotHinzu(spots: auswahl?.spots ?? [], ausgeschlossen: entwurf.spot_ids, lang: lang) { neu in
                entwurf.spot_ids.append(neu)
            }
        }
    }

    private var loeschenSection: some View {
        Section {
            Button(role: .destructive) { loeschenFragen = true } label: {
                Label(Loc.t("common.delete", lang), systemImage: "trash")
            }
        }
    }

    // MARK: Ablauf

    private func tafelWeg(_ id: UUID) {
        entwurf.tafeln.removeAll { $0.id == id }
    }

    private func vorlageSetzen(_ key: String) {
        guard let v = TEAM_EVENT_VORLAGEN.first(where: { $0.key == key }) else { entwurf.vorlage = nil; return }
        let (a, b) = v.monat ? teamEventMonat() : teamEventWochenende()
        entwurf.vorlage = v.key
        entwurf.titel = Loc.t(v.titelKey, lang)
        entwurf.tafeln = [TeamTafelEntwurf(kennzahl: v.kennzahl)]
        entwurf.start = a
        entwurf.ende = b
    }

    private func speichern() async {
        busy = true
        fehler = nil
        defer { busy = false }
        // Global nur im offiziellen Team (der Server lehnt es sonst ab: nur_offiziell).
        if !offiziell { entwurf.global_event = false }
        do {
            if let id = entwurf.eventId {
                _ = try await Api.teamEventAendern(slug, id: id, entwurf.json)
            } else {
                _ = try await Api.teamEventAnlegen(slug, entwurf.json)
            }
            fertig(true)
        } catch {
            // Fehler IM Editor zeigen (web: die Seite dahinter ist verdeckt).
            fehler = Api.teamFehlerText(error, lang)
        }
    }

    private func loeschen() async {
        guard let id = entwurf.eventId else { return }
        do {
            try await Api.teamEventLoeschen(slug, id: id)
            fertig(false)
            geloescht?()
        } catch {
            fehler = Api.teamFehlerText(error, lang)
        }
    }
}
