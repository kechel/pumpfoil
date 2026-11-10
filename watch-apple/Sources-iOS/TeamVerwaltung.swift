import SwiftUI
import PhotosUI
import CoreImage.CIFilterBuiltins

// Team-Verwaltung nativ (App-Port, 04.11.2026) — wie web/src/pages/TeamEinstellungen.tsx. Bisher fuehrten Zahnrad und
// „N neue Anfragen" in den Browser. Zwei Reiter wie im Web:
//  * „Verwalten" fuer Leitung UND Moderatoren: Anfragen, Mitglieder, Events, Einladungslinks (mit QR-Code).
//  * „Grunddaten" nur fuer die Leitung (TeamGrunddaten.swift): Freigabe, Auftritt mit Teambild, Beitritt, Sichtbarkeit,
//    Bestenlisten, Teamspots, Loeschen.
// Rechte wie im Web; die verbindliche Pruefung macht der Server (server/app/api/teams.py).

/// Rueckfrage vor einer Aktion (Entfernen, Leitung uebergeben, neuer Link …).
struct TeamFrage: Identifiable {
    let id = UUID()
    let text: String
    let knopf: String
    var zerstoerend: Bool = true
    let aktion: () -> Void
}

/// Freigabe-Stand kurz (Liste „Meine Teams") bzw. als Satz (Grunddaten) — die Schluessel stehen hier ausgeschrieben,
/// damit gen-loc-teams-ios.py sie findet.
func teamFreigabeText(_ f: String, _ lang: String, satz: Bool = false) -> String {
    switch (f, satz) {
    case ("wartet", false): return Loc.t("team.freigabe.wartet", lang)
    case ("frei", false): return Loc.t("team.freigabe.frei", lang)
    case ("abgelehnt", false): return Loc.t("team.freigabe.abgelehnt", lang)
    case (_, false): return Loc.t("team.freigabe.keine", lang)
    case ("wartet", true): return Loc.t("team.freigabe.text.wartet", lang)
    case ("frei", true): return Loc.t("team.freigabe.text.frei", lang)
    case ("abgelehnt", true): return Loc.t("team.freigabe.text.abgelehnt", lang)
    default: return Loc.t("team.freigabe.text.keine", lang)
    }
}

struct TeamVerwaltungView: View {
    @State private var slug: String
    @State private var tab: String
    var onGeloescht: (() -> Void)? = nil
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.dismiss) private var dismiss
    @State private var team: TeamInfo?
    @State private var fehlt = false
    @State private var meldung: String?
    @State private var mitglieder: TeamMitgliederAntwort?
    @State private var links: [String: String]?
    @State private var auswahl: TeamAuswahl?
    @State private var frage: TeamFrage?

    /// `start`: "verwalten" oder "einstellungen" (Grunddaten, nur Leitung — Moderatoren landen in „Verwalten").
    init(slug: String, start: String = "verwalten", onGeloescht: (() -> Void)? = nil) {
        _slug = State(initialValue: slug)
        _tab = State(initialValue: start)
        self.onGeloescht = onGeloescht
    }

    private var leiter: Bool { team?.meine_rolle == "leiter" }
    private var grund: Bool { leiter && tab == "einstellungen" }
    private var titel: String {
        guard let t = team else { return "" }
        return leiter ? t.name : Loc.t("team.tab.verwalten", lang)
    }

    var body: some View {
        inhalt
            .navigationTitle(titel)
            .navigationBarTitleDisplayMode(.inline)
            .feedbackToolbar("/teams/" + slug + (grund ? "/einstellungen" : "/verwalten"))
            .task { if team == nil { await laden() } }
            .alert(frage?.text ?? "", isPresented: frageAktiv) { frageKnoepfe }
    }

    private var frageAktiv: Binding<Bool> {
        Binding(get: { frage != nil }, set: { if !$0 { frage = nil } })
    }

    @ViewBuilder private var frageKnoepfe: some View {
        Button(Loc.t("common.cancel", lang), role: .cancel) { frage = nil }
        if let f = frage {
            Button(f.knopf, role: f.zerstoerend ? .destructive : nil) { f.aktion(); frage = nil }
        }
    }

    @ViewBuilder private var inhalt: some View {
        if fehlt {
            Text(Loc.t("team.nichtGefunden", lang)).foregroundStyle(.secondary).padding()
        } else if let t = team {
            VStack(spacing: 0) {
                if leiter {
                    Reiterleiste(reiter: [ReiterDef(id: "verwalten", label: Loc.t("team.tab.verwalten", lang)),
                                          ReiterDef(id: "einstellungen", label: Loc.t("team.tab.grunddaten", lang))],
                                 aktiv: $tab)
                        .padding(.horizontal)
                }
                ScrollView { seite(t).padding(.horizontal).padding(.vertical, 12) }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder private func seite(_ t: TeamInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let m = meldung { meldungsBox(m) }
            if grund {
                TeamGrunddatenView(team: t, slug: slug, lang: lang, auswahl: auswahl, melden: melden, fragen: { frage = $0 },
                                   geaendert: { neu in uebernehmen(neu) }, neuLaden: { Task { await kopfLaden() } },
                                   geloescht: { geloescht() })
            } else {
                verwaltenSeite(t)
            }
        }
    }

    @ViewBuilder private func verwaltenSeite(_ t: TeamInfo) -> some View {
        if let m = mitglieder {
            TeamMitgliederVerwalten(daten: m, slug: slug, leiter: leiter, farbe: t.farbe, lang: lang, melden: melden,
                                    fragen: { frage = $0 }, neuLaden: { Task { await mitgliederLaden(); await kopfLaden() } })
        }
        TeamEventsVerwaltenKarte(slug: slug, farbe: t.farbe, auswahl: auswahl, lang: lang, melden: melden,
                                 offiziell: t.offiziell == true)
        if let l = links {
            TeamEinladungenKarte(slug: slug, name: t.name, farbe: t.farbe, links: l, leiter: leiter, lang: lang,
                                 fragen: { frage = $0 }, neu: { art in Task { await linkNeu(art) } })
        }
    }

    private func meldungsBox(_ m: String) -> some View {
        Text(m).font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3), lineWidth: 1))
    }

    // MARK: Ablauf

    /// Meldung oben; „Gespeichert" verschwindet nach 2,5 s wieder (wie im Web).
    private func melden(_ text: String) {
        meldung = text
        guard text == Loc.t("team.gespeichert", lang) else { return }
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if meldung == text { meldung = nil }
        }
    }

    private func uebernehmen(_ neu: TeamInfo) {
        team = neu
        if neu.slug != slug { slug = neu.slug }
    }

    private func geloescht() {
        onGeloescht?()
        dismiss()
    }

    private func laden() async {
        await kopfLaden()
        guard team != nil else { return }
        await mitgliederLaden()
        links = try? await Api.teamEinladungen(slug)
        auswahl = await TeamAuswahl.laden(lang)
    }

    private func kopfLaden() async {
        do {
            let d = try await Api.team(slug)
            // Nur Leitung und Moderatoren; Grunddaten nur die Leitung (wie die Weiterleitungen im Web).
            guard d.istVerwalter else { dismiss(); return }
            if d.meine_rolle != "leiter" { tab = "verwalten" }
            team = d
            fehlt = false
        } catch {
            if team == nil { fehlt = true }
        }
    }

    private func mitgliederLaden() async {
        if let m = try? await Api.teamMitglieder(slug) { mitglieder = m }
    }

    private func linkNeu(_ art: String) async {
        do {
            let r = try await Api.teamEinladungNeu(slug, art: art)
            var l: [String: String] = links ?? [:]
            for (k, v) in r { l[k] = v }
            links = l
        } catch {
            melden(Api.teamFehlerText(error, lang))
        }
    }
}

// MARK: - Mitglieder und Anfragen

struct TeamMitgliederVerwalten: View {
    let daten: TeamMitgliederAntwort
    let slug: String
    let leiter: Bool
    let farbe: String?
    let lang: String
    let melden: (String) -> Void
    let fragen: (TeamFrage) -> Void
    let neuLaden: () -> Void

    private var anfragen: [TeamMitglied] { daten.anfragen ?? [] }

    var body: some View {
        TeamKarte {
            Text(Loc.t("team.mitglieder", lang)).font(.headline)
            if !anfragen.isEmpty {
                Text(Loc.t("team.anfragen", lang)).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                ForEach(anfragen) { m in anfrageZeile(m) }
                Divider().padding(.vertical, 4)
            }
            ForEach(Array(daten.mitglieder.enumerated()), id: \.element.id) { i, m in
                if i > 0 { Divider() }
                mitgliedZeile(m)
            }
        }
    }

    private func anfrageZeile(_ m: TeamMitglied) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                AvatarView(name: m.name, url: Api.mediaURL(m.avatar_url), size: 32, userId: m.user_id)
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.name).font(.subheadline).lineLimit(1)
                    if let p = m.profil { Text(profilText(p)).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                TeamKnopf(titel: Loc.t("team.annehmen", lang), farbe: farbe) { ausfuehren { try await Api.teamAnnehmen(slug, uid: m.user_id) } }
                Button(Loc.t("team.ablehnen", lang)) { ausfuehren { try await Api.teamEntfernen(slug, uid: m.user_id) } }
                    .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
    }

    /// Wo und was jemand bisher gefahren ist, beim Pruefen einer Anfrage (web AnfrageProfil).
    private func profilText(_ p: TeamAnfrageProfil) -> String {
        guard p.sessions > 0 else { return Loc.t("team.anfrage.keine", lang) }
        let sp: String = p.sportarten.map { Loc.t("cls.sport." + $0.sport, lang) + " " + String($0.n) }.joined(separator: ", ")
        var s: String = teamText("team.anfrage.sessions", lang, ["n": String(p.sessions)]) + " · " + sp
        if !p.spots.isEmpty {
            s += "\n" + Loc.t("team.anfrage.spots", lang) + ": " + p.spots.map { $0.name + " (" + String($0.n) + ")" }.joined(separator: ", ")
        }
        return s
    }

    private func mitgliedZeile(_ m: TeamMitglied) -> some View {
        HStack(spacing: 10) {
            AvatarView(name: m.name, url: Api.mediaURL(m.avatar_url), size: 32, userId: m.user_id)
            Text(m.name).font(.subheadline).lineLimit(1)
            Spacer(minLength: 4)
            rolle(m)
            if m.rolle != "leiter" && (leiter || m.rolle == "mitglied") {
                Button { entfernenFragen(m) } label: { Image(systemName: "trash") }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(Loc.t("team.entfernen", lang))
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private func rolle(_ m: TeamMitglied) -> some View {
        if leiter && m.rolle != "leiter" {
            Menu {
                Button(Loc.t("team.rolle.mitglied", lang)) { rolleSetzen(m, "mitglied") }
                Button(Loc.t("team.rolle.moderator", lang)) { rolleSetzen(m, "moderator") }
                Button(Loc.t("team.rolleUebergeben", lang)) { rolleSetzen(m, "leiter") }
            } label: {
                HStack(spacing: 3) {
                    Text(Loc.t("team.rolle." + m.rolle, lang)).font(.caption)
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
            }
        } else {
            Text(Loc.t("team.rolle." + m.rolle, lang)).font(.caption).foregroundStyle(TeamFarbe(farbe).akzent)
        }
    }

    private func rolleSetzen(_ m: TeamMitglied, _ r: String) {
        guard r != m.rolle else { return }
        if r == "leiter" {
            fragen(TeamFrage(text: teamText("team.uebergebenFrage", lang, ["name": m.name]), knopf: Loc.t("team.rolleUebergeben", lang)) {
                ausfuehren { try await Api.teamRolle(slug, uid: m.user_id, rolle: r) }
            })
        } else {
            ausfuehren { try await Api.teamRolle(slug, uid: m.user_id, rolle: r) }
        }
    }

    private func entfernenFragen(_ m: TeamMitglied) {
        fragen(TeamFrage(text: teamText("team.entfernenFrage", lang, ["name": m.name]), knopf: Loc.t("team.entfernen", lang)) {
            ausfuehren { try await Api.teamEntfernen(slug, uid: m.user_id) }
        })
    }

    private func ausfuehren(_ aufruf: @escaping () async throws -> Void) {
        Task {
            do { try await aufruf(); neuLaden() } catch { melden(Api.teamFehlerText(error, lang)) }
        }
    }
}

// MARK: - Einladungslinks

struct TeamEinladungenKarte: View {
    let slug: String
    let name: String
    let farbe: String?
    let links: [String: String]
    let leiter: Bool
    let lang: String
    let fragen: (TeamFrage) -> Void
    let neu: (String) -> Void

    var body: some View {
        TeamKarte {
            Text(Loc.t("team.links", lang)).font(.headline)
            Text(Loc.t("team.linksHinweis", lang)).font(.footnote).foregroundStyle(.secondary)
            art("join", Loc.t("team.link.join", lang), Loc.t("team.link.joinText", lang))
            Divider()
            art("apply", Loc.t("team.link.apply", lang), Loc.t("team.link.applyText", lang))
        }
    }

    @ViewBuilder private func art(_ a: String, _ titel: String, _ text: String) -> some View {
        if let tok = links[a], let url = Api.teamWebURL("/teams/" + slug + "/" + a + "-" + tok) {
            VStack(alignment: .leading, spacing: 8) {
                Text(titel).font(.subheadline.weight(.semibold))
                Text(text).font(.footnote).foregroundStyle(.secondary)
                TeamTeilenZeile(url: url, titel: name, farbe: farbe, lang: lang)
                if leiter {
                    Button(Loc.t("team.linkNeu", lang)) {
                        fragen(TeamFrage(text: Loc.t("team.linkNeuFrage", lang), knopf: Loc.t("team.linkNeu", lang)) { neu(a) })
                    }
                    .font(.subheadline).buttonStyle(.bordered)
                }
                TeamQrBild(url: url.absoluteString, lang: lang)
            }
            .padding(.vertical, 4)
        }
    }
}

/// QR-Code zum Einladungslink (web TeamQr.tsx): im Geraet erzeugt (CoreImage), immer schwarz auf weiss mit Ruhezone —
/// so lesen ihn alle Kameras. Teilen als Bild ueber das Teilen-Menue (dort auch „Bild sichern").
struct TeamQrBild: View {
    let url: String
    let lang: String

    private var bild: UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(url.utf8)
        f.correctionLevel = "M"
        guard let ci = f.outputImage else { return nil }
        let gross = ci.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cg = CIContext().createCGImage(gross, from: gross.extent) else { return nil }
        // Ruhezone (4 Module = 32 px) auf weissem Grund
        let rand: CGFloat = 32
        let seite = CGSize(width: gross.extent.width + 2 * rand, height: gross.extent.height + 2 * rand)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: seite, format: fmt).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: seite))
            ctx.cgContext.interpolationQuality = .none
            UIImage(cgImage: cg).draw(in: CGRect(x: rand, y: rand, width: gross.extent.width, height: gross.extent.height))
        }
    }

    var body: some View {
        if let b = bild {
            VStack(alignment: .leading, spacing: 6) {
                Image(uiImage: b).interpolation(.none).resizable().scaledToFit()
                    .frame(width: 160, height: 160)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel(Loc.t("team.qr", lang))
                let img = Image(uiImage: b)
                ShareLink(item: img, preview: SharePreview(Loc.t("team.qr", lang), image: img)) {
                    Label(Loc.t("team.qrTeilen", lang), systemImage: "qrcode").font(.subheadline)
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

// MARK: - Bausteine

/// Karte wie `Card` im Web.
struct TeamKarte<Inhalt: View>: View {
    @ViewBuilder let inhalt: () -> Inhalt

    var body: some View {
        VStack(alignment: .leading, spacing: 8) { inhalt() }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
    }
}

/// Schalter mit Titel und Erklaerung (web `Schalter`).
struct TeamSchalter: View {
    let titel: String
    var text: String? = nil
    @Binding var an: Bool

    var body: some View {
        Toggle(isOn: $an) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titel).font(.subheadline.weight(.medium))
                if let t = text { Text(t).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}

/// Spot als Pille mit „×" (Teamspots, Event-Spots).
struct TeamSpotPille: View {
    let name: String
    let farbe: String?
    let weg: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(name).font(.subheadline)
            Button(action: weg) { Image(systemName: "xmark").font(.caption2) }.buttonStyle(.borderless)
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(TeamFarbe(farbe).akzent.opacity(0.15), in: Capsule())
    }
}

/// Auswahl „Spot waehlen" + „+ Spot hinzufuegen".
struct TeamSpotHinzu: View {
    let spots: [TeamSpotWahl]
    let ausgeschlossen: [Int]
    let lang: String
    let hinzu: (Int) -> Void
    @State private var wahl: Int = 0

    var body: some View {
        HStack(spacing: 8) {
            Picker(Loc.t("team.spotWaehlen", lang), selection: $wahl) {
                Text(Loc.t("team.spotWaehlen", lang)).tag(0)
                ForEach(spots.filter { !ausgeschlossen.contains($0.id) }) { s in Text(s.name).tag(s.id) }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            Button("+ " + Loc.t("team.spotHinzu", lang)) { hinzu(wahl); wahl = 0 }
                .buttonStyle(.bordered)
                .disabled(wahl == 0)
        }
    }
}

/// Eine Bestenliste bearbeiten: Kennzahl, Sportart, Foil-Band, Bewegungsdaten, nur Brett (+ nur Teamspots).
struct TeamTafelEditor: View {
    @Binding var tf: TeamTafelEntwurf
    let auswahl: TeamAuswahl?
    let lang: String
    var mitTeamspots: Bool = true
    var gruppiert: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Picker(Loc.t("team.bestenlisten", lang), selection: $tf.kennzahl) { kennzahlen }
                .pickerStyle(.menu)
            HStack(spacing: 8) {
                Picker("", selection: $tf.sportart) {
                    ForEach(auswahl?.sports ?? ["pumpfoil"], id: \.self) { s in Text(Loc.t("cls.sport." + s, lang)).tag(s) }
                }
                .pickerStyle(.menu)
                Picker("", selection: $tf.foil_band) { baender }
                    .pickerStyle(.menu)
            }
            Toggle(Loc.t("team.tafel.nurBewegung", lang), isOn: $tf.accel_only).font(.subheadline)
            Toggle(Loc.t("team.tafel.nurBrett", lang), isOn: $tf.nur_brett).font(.subheadline)
            if mitTeamspots { Toggle(Loc.t("team.tafel.nurTeamspots", lang), isOn: $tf.nur_teamspots).font(.subheadline) }
        }
    }

    private var eventKennzahlen: [String] { TEAM_KENNZAHLEN_BEST + TEAM_KENNZAHLEN_SUMME + TEAM_KENNZAHLEN_SPRINT }

    @ViewBuilder private var kennzahlen: some View {
        if gruppiert {
            Section(Loc.t("team.k.best", lang)) {
                ForEach(TEAM_KENNZAHLEN_BEST, id: \.self) { k in Text(Loc.t(teamKennzahl(k).labelKey, lang)).tag(k) }
            }
            Section(Loc.t("team.k.summe", lang)) {
                ForEach(TEAM_KENNZAHLEN_SUMME, id: \.self) { k in Text(Loc.t(teamKennzahl(k).labelKey, lang)).tag(k) }
            }
        } else {
            // Events (web EVENT_KENNZAHLEN): Team-Kennzahlen plus die Sprints.
            ForEach(eventKennzahlen, id: \.self) { k in Text(Loc.t(teamKennzahl(k).labelKey, lang)).tag(k) }
        }
    }

    @ViewBuilder private var baender: some View {
        let b: [FoilBand] = auswahl?.bands ?? []
        if b.isEmpty {
            Text(Loc.t("team.tafel.alleFoils", lang)).tag("all")
        } else {
            ForEach(b) { x in Text(teamBandLabel(x, lang)).tag(x.key) }
        }
    }
}
