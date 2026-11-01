import SwiftUI

// Ein Event mit allen Bestenlisten (Native-Port Stufe 4, 01.11.2026) — PWA web/src/pages/TeamEventSeite.tsx.
// Bild (eigenes, sonst das Teambild wenn `teambild_zeigen`), Titel + Status, Zeitraum fett, Beschreibung fett mit
// Absaetzen; vor dem Start ein grosser Countdown, waehrenddessen „Endet in"; „Event gesamt" ueber den Bestenlisten;
// Teilen-Zeile bei oeffentlichem Team; Box „Event-Regeln". Beitreten fuer Angemeldete ohne Mitgliedschaft mit dem
// Kleingedruckten (TeamBeitrittSheet). Bearbeiten bleibt im Web.

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

    private var feedbackPfad: String { "/teams/" + slug + "/events/" + String(eventId) }

    var body: some View {
        inhalt
            .navigationTitle(ev?.titel ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .feedbackToolbar(feedbackPfad)
            .task { if ev == nil { await laden() } }
            .refreshable { await laden() }
            .sheet(isPresented: $dialog) { beitrittSheet }
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
            teamZeile(t)
            if let m = meldung { meldungsBox(m) }
            bild(t, e)
            EventKopf(e: e, farbe: t.farbe, lang: lang)
            beitrittBereich(t)
            Text(Loc.t(eventStandKey(e.status), lang)).font(.title3.weight(.bold))
            standBereich(t, e)
            teilenBereich(t, e)
            EventRegelnBox(e: e, lang: lang)
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

    // MARK: Stand / Ergebnis

    @ViewBuilder private func standBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if e.status == "kommend" {
            EventCountdownKarte(e: e, farbe: t.farbe, lang: lang)
        } else {
            if e.status == "laeuft" { EventEndetInKarte(e: e, farbe: t.farbe, lang: lang) }
            if !(e.summen_auswahl ?? []).isEmpty { summenBereich(t, e) }
            ForEach(Array(e.tafeln.enumerated()), id: \.offset) { _, tf in
                TeamTafelKarte(tf: tf, farbe: t.farbe, lang: lang, ohneFilter: true)
            }
        }
    }

    private func summenBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("team.event.teamGesamt", lang).uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            TeamZahlenRaster(kacheln: eventSummenKacheln(e, lang), farbe: t.farbe, spalten: 2, rand: true, gross: true)
        }
    }

    @ViewBuilder private func teilenBereich(_ t: TeamInfo, _ e: TeamEvent) -> some View {
        if t.bestenlisten_oeffentlich == true, let u = Api.teamWebURL("/teams/" + t.slug + "/events/" + String(e.id)) {
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
        } catch {
            _ = await t
            if ev == nil { fehlt = true }
        }
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
            haftung
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
