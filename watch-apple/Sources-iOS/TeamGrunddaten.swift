import SwiftUI
import PhotosUI

// Reiter „Grunddaten" der Team-Verwaltung, nur fuer die Leitung (App-Port, 04.11.2026) — der zweite Teil von
// web/src/pages/TeamEinstellungen.tsx: Freigabe beantragen, Auftritt (Herkunft, Logo, Teambild mit Fokus, Name,
// Adresse, Beschreibung, Farbe), Beitritt, Sichtbarkeit, Bestenlisten-Tafeln, Teamspots, Team loeschen.
// Herkunft, Farbe und die Schalter gelten sofort (wie im Web); Name/Adresse/Beschreibung erst mit „Speichern".

/// Kontinente bzw. die ganze Erde als Herkunft (server/app/teams.py KONTINENTE), Reihenfolge wie im Web.
let TEAM_KONTINENTE: [String] = ["k:earth", "k:eu", "k:af", "k:as", "k:na", "k:sa", "k:oc"]

/// Name einer Herkunft: Kontinent als eigener Text (`region.*`), Land ueber die Systemnamen in der App-Sprache.
func teamHerkunftName(_ land: String, _ lang: String) -> String {
    if land.hasPrefix("k:") { return Loc.t("region." + String(land.dropFirst(2)), lang) }
    return teamLocale(lang).localizedString(forRegionCode: land) ?? land
}

/// Alle Laender (ISO 3166-1 alpha-2) nach Namen in der App-Sprache. Das Web nimmt die 250 Codes, fuer die es Flaggen hat;
/// hier liefert iOS die Liste (Locale.Region.isoRegions, ab iOS 16) — der Server nimmt jeden zweistelligen Code.
struct TeamLand: Identifiable {
    let code: String
    let name: String
    var id: String { code }
}

func teamLaenderListe(_ lang: String) -> [TeamLand] {
    let codes: [String] = Locale.Region.isoRegions.map { $0.identifier }.filter { c in
        c.count == 2 && c.allSatisfy { $0.isLetter && $0.isASCII }
    }
    let l: Locale = teamLocale(lang)
    return codes.map { TeamLand(code: $0, name: l.localizedString(forRegionCode: $0) ?? $0) }
        .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
}

struct TeamGrunddatenView: View {
    let team: TeamInfo
    let slug: String
    let lang: String
    let auswahl: TeamAuswahl?
    let melden: (String) -> Void
    let fragen: (TeamFrage) -> Void
    let geaendert: (TeamInfo) -> Void
    let neuLaden: () -> Void
    let geloescht: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            freigabeKarte
            TeamAuftrittKarte(team: team, slug: slug, lang: lang, melden: melden, geaendert: geaendert, neuLaden: neuLaden)
            beitrittKarte
            sichtbarkeitKarte
            TeamTafelnKarte(slug: slug, lang: lang, auswahl: auswahl, melden: melden)
            spotsKarte
            TeamLoeschenKarte(team: team, slug: slug, lang: lang, melden: melden, geloescht: geloescht)
        }
    }

    // MARK: Freigabe

    private var freigabeKarte: some View {
        let f: String = team.freigabe ?? "keine"
        return TeamKarte {
            Text(Loc.t("team.freigabe.titel", lang)).font(.headline)
            Text(teamFreigabeText(f, lang, satz: true)).font(.subheadline)
            if f == "abgelehnt", let n = team.freigabe_notiz, !n.isEmpty {
                Text(n).font(.subheadline).foregroundStyle(.orange)
            }
            if f == "frei" && team.auftritt_geaendert == true {
                Text(Loc.t("team.freigabe.geaendert", lang)).font(.footnote).foregroundStyle(.secondary)
            }
            if f == "keine" || f == "abgelehnt" {
                TeamKnopf(titel: Loc.t("team.freigabe.beantragen", lang), farbe: team.farbe) {
                    Task {
                        do { _ = try await Api.teamFreigabe(slug); neuLaden() } catch { melden(Api.teamFehlerText(error, lang)) }
                    }
                }
            }
        }
    }

    // MARK: Beitritt, Sichtbarkeit

    private func schalter(_ key: String, _ wert: Bool?) -> Binding<Bool> {
        Binding(get: { wert == true }, set: { v in einstellen([key: v]) })
    }

    private var beitrittKarte: some View {
        TeamKarte {
            Text(Loc.t("team.beitritt", lang)).font(.headline)
            TeamSchalter(titel: Loc.t("team.anmeldungenZulassen", lang), text: Loc.t("team.anmeldungenZulassenText", lang),
                         an: schalter("anmeldungen_zulassen", team.anmeldungen_zulassen))
            TeamSchalter(titel: Loc.t("team.automatischAkzeptieren", lang), text: Loc.t("team.automatischAkzeptierenText", lang),
                         an: schalter("automatisch_akzeptieren", team.automatisch_akzeptieren))
        }
    }

    private var sichtbarWahl: Binding<String> {
        Binding(get: { team.mitglieder_sichtbar ?? "mitglieder" }, set: { v in einstellen(["mitglieder_sichtbar": v]) })
    }

    private var sichtbarkeitKarte: some View {
        TeamKarte {
            Text(Loc.t("team.sichtbarkeit", lang)).font(.headline)
            TeamSchalter(titel: Loc.t("team.oeffentlich", lang), text: Loc.t("team.oeffentlichText", lang),
                         an: schalter("oeffentlich", team.oeffentlich))
            if team.oeffentlich == true && team.frei == nil {
                Text(Loc.t("team.oeffentlichErstNachFreigabe", lang)).font(.footnote).foregroundStyle(.orange)
            }
            Text(Loc.t("team.mitgliederSichtbar", lang)).font(.subheadline).padding(.top, 4)
            Picker(Loc.t("team.mitgliederSichtbar", lang), selection: sichtbarWahl) {
                Text(Loc.t("team.sichtbar.mitglieder", lang)).tag("mitglieder")
                Text(Loc.t("team.sichtbar.angemeldete", lang)).tag("angemeldete")
            }
            .pickerStyle(.menu)
        }
    }

    private func einstellen(_ felder: [String: Any]) {
        Task {
            do {
                let d = try await Api.teamEinstellen(slug, felder)
                geaendert(d)
                melden(Loc.t("team.gespeichert", lang))
            } catch {
                melden(Api.teamFehlerText(error, lang))
            }
        }
    }

    // MARK: Teamspots

    private var spotsKarte: some View {
        let ids: [Int] = (team.spots ?? []).map { $0.id }
        return TeamKarte {
            Text(Loc.t("team.spots", lang)).font(.headline)
            Text(Loc.t("team.spotsHinweis", lang)).font(.footnote).foregroundStyle(.secondary)
            if ids.isEmpty {
                Text("—").foregroundStyle(.secondary)
            } else {
                FoilerFliessReihe(abstand: 6) {
                    ForEach(team.spots ?? []) { s in
                        TeamSpotPille(name: s.anzeige, farbe: team.farbe) { spotsSetzen(ids.filter { $0 != s.id }) }
                    }
                }
            }
            TeamSpotHinzu(spots: auswahl?.spots ?? [], ausgeschlossen: ids, lang: lang) { neu in spotsSetzen(ids + [neu]) }
        }
    }

    private func spotsSetzen(_ ids: [Int]) {
        Task {
            do { try await Api.teamSpotsSetzen(slug, ids); neuLaden() } catch { melden(Api.teamFehlerText(error, lang)) }
        }
    }
}

// MARK: - Auftritt

struct TeamAuftrittKarte: View {
    let team: TeamInfo
    let slug: String
    let lang: String
    let melden: (String) -> Void
    let geaendert: (TeamInfo) -> Void
    let neuLaden: () -> Void
    @State private var name = ""
    @State private var neuSlug = ""
    @State private var beschreibung = ""
    @State private var geladenFuer: Int?
    @State private var logoItem: PhotosPickerItem?

    private var adressZustand: String {
        if team.bestenlisten_oeffentlich == true { return "oeffentlich" }
        return team.oeffentlich == true ? "wartet" : "intern"
    }

    var body: some View {
        TeamKarte {
            Text(Loc.t("team.auftritt", lang)).font(.headline)
            Text(Loc.t("team.auftrittHinweis", lang)).font(.footnote).foregroundStyle(.secondary)
            herkunft
            logo
            banner
            texte
            farben
            TeamKnopf(titel: Loc.t("common.save", lang), farbe: team.farbe) {
                einstellen(["name": name, "slug": neuSlug, "beschreibung": beschreibung])
            }
        }
        .onAppear { entwurfSetzen() }
        .onChange(of: team.id) { _ in entwurfSetzen() }
        .onChange(of: logoItem) { item in logoHoch(item) }
    }

    private var banner: some View {
        TeamBildBearbeiten(url: team.banner_url, fokus: team.banner_fokus, event: false, lang: lang,
                           hochladen: { b in _ = try await Api.teamBanner(slug, bild: b); neuLaden(); melden(Loc.t("team.gespeichert", lang)) },
                           fokusSetzen: { f in
                               let d = try await Api.teamEinstellen(slug, ["banner_fokus": f])
                               geaendert(d)
                           },
                           entfernen: { try await Api.teamBannerEntfernen(slug); neuLaden(); melden(Loc.t("team.gespeichert", lang)) },
                           fehler: { melden(Api.teamFehlerText($0, lang)) })
    }

    /// Entwurf aus dem Team (einmal je Team; nach dem Speichern kommt der gespeicherte Stand zurueck).
    private func entwurfSetzen() {
        guard geladenFuer != team.id else { return }
        geladenFuer = team.id
        name = team.name
        neuSlug = team.slug
        beschreibung = team.beschreibung ?? ""
    }

    // Herkunft: Land, Kontinent oder die ganze Erde — gilt sofort, ohne Freigabe (feste Liste).
    private var herkunftWahl: Binding<String> {
        Binding(get: { team.land ?? "" }, set: { v in einstellen(["land": v]) })
    }

    private var herkunft: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("team.herkunft", lang)).font(.subheadline)
            HStack(spacing: 8) {
                Picker(Loc.t("team.herkunft", lang), selection: herkunftWahl) {
                    Text(Loc.t("profile.landNone", lang)).tag("")
                    ForEach(TEAM_KONTINENTE, id: \.self) { k in Text(teamHerkunftName(k, lang)).tag(k) }
                    Divider()
                    ForEach(teamLaenderListe(lang)) { x in Text(x.name).tag(x.code) }
                }
                .pickerStyle(.menu)
                TeamHerkunftMarke(land: team.land, gross: true)
            }
        }
    }

    private var logo: some View {
        HStack(spacing: 12) {
            TeamWappen(name: team.name, logo: team.logo_url, farbe: team.farbe, size: 64)
            PhotosPicker(selection: $logoItem, matching: .images) {
                Text(Loc.t("team.logoHochladen", lang)).font(.subheadline)
            }
            .buttonStyle(.bordered)
        }
    }

    private var texte: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("team.name", lang)).font(.subheadline)
            TextField("", text: $name).textFieldStyle(.roundedBorder)
                .onChange(of: name) { n in if n.count > 60 { name = String(n.prefix(60)) } }
            Text(Loc.t("team.adresse", lang)).font(.subheadline).padding(.top, 4)
            TeamAdressFeld(slug: $neuSlug)
            if let u = Api.teamWebURL("/teams/" + team.slug) {
                Text(u.absoluteString).font(.caption.monospaced()).textSelection(.enabled)
            }
            Text(Loc.t("team.adresseAendernHinweis", lang) + " " + Loc.t("team.adresseTeilen." + adressZustand, lang))
                .font(.caption).foregroundStyle(.secondary)
            Text(Loc.t("team.beschreibung", lang)).font(.subheadline).padding(.top, 4)
            TextField("", text: $beschreibung, axis: .vertical)
                .lineLimit(3...8)
                .textFieldStyle(.roundedBorder)
                .onChange(of: beschreibung) { b in if b.count > 1000 { beschreibung = String(b.prefix(1000)) } }
        }
    }

    // Je Farbton eine Spalte: oben hell, Mitte, unten dunkel (wie im Web); schmal: seitlich wischen.
    private var farben: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("team.farbe", lang)).font(.subheadline)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHGrid(rows: [GridItem(.fixed(34)), GridItem(.fixed(34)), GridItem(.fixed(34))], spacing: 8) {
                    ForEach(TEAM_FARB_SCHLUESSEL, id: \.self) { f in farbKnopf(f) }
                }
                .padding(4)
            }
        }
    }

    private func farbKnopf(_ f: String) -> some View {
        let an: Bool = (team.farbe ?? "cyan") == f
        return Button { einstellen(["farbe": f]) } label: {
            Circle().fill(TeamFarbe(f).flaeche).frame(width: 30, height: 30)
                .overlay(Circle().stroke(an ? Color.primary : Color.clear, lineWidth: 2).padding(-3))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(f)
    }

    private func einstellen(_ felder: [String: Any]) {
        Task {
            do {
                let d = try await Api.teamEinstellen(slug, felder)
                geaendert(d)
                if felder["name"] != nil {
                    name = d.name; neuSlug = d.slug; beschreibung = d.beschreibung ?? ""
                }
                melden(Loc.t("team.gespeichert", lang))
            } catch {
                melden(Api.teamFehlerText(error, lang))
            }
        }
    }

    private func logoHoch(_ item: PhotosPickerItem?) {
        guard let item else { return }
        logoItem = nil
        Task {
            guard let roh = try? await item.loadTransferable(type: Data.self), let b = TeamUploadBild.aus(roh, logo: true) else {
                melden(Loc.t("team.err.unbekannt", lang)); return
            }
            do {
                _ = try await Api.teamLogo(slug, bild: b)
                neuLaden()
                melden(Loc.t("team.gespeichert", lang))
            } catch {
                melden(Api.teamFehlerText(error, lang))
            }
        }
    }
}

// MARK: - Bestenlisten

struct TeamTafelnKarte: View {
    let slug: String
    let lang: String
    let auswahl: TeamAuswahl?
    let melden: (String) -> Void
    @State private var tafeln: [TeamTafelEntwurf] = []
    @State private var geladen = false

    var body: some View {
        TeamKarte {
            Text(Loc.t("team.bestenlisten", lang)).font(.headline)
            Text(Loc.t("team.bestenlistenHinweis", lang)).font(.footnote).foregroundStyle(.secondary)
            // Bindungen je Eintrag (nicht ueber Indizes): Loeschen mitten in der Liste stuerzt sonst ab.
            ForEach($tafeln) { $tf in tafel($tf) }
            HStack(spacing: 8) {
                Button("+ " + Loc.t("team.tafel.neu", lang)) { tafeln.append(TeamTafelEntwurf()) }
                    .buttonStyle(.bordered)
                    .disabled(tafeln.count >= 20)
                Spacer()
                Button(Loc.t("common.save", lang)) { Task { await speichern() } }
                    .buttonStyle(.borderedProminent)
            }
        }
        .task { if !geladen { await laden() } }
    }

    private func tafel(_ tf: Binding<TeamTafelEntwurf>) -> some View {
        let id: UUID = tf.wrappedValue.id
        let i: Int = tafeln.firstIndex { $0.id == id } ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(String(i + 1) + ".").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Button { verschieben(id, -1) } label: { Image(systemName: "arrow.up") }.disabled(i == 0)
                Button { verschieben(id, 1) } label: { Image(systemName: "arrow.down") }.disabled(i == tafeln.count - 1)
                Button { tafeln.removeAll { $0.id == id } } label: { Image(systemName: "trash") }
                    .accessibilityLabel(Loc.t("common.delete", lang))
            }
            .buttonStyle(.borderless)
            TeamTafelEditor(tf: tf, auswahl: auswahl, lang: lang)
        }
        .padding(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.3), lineWidth: 1))
    }

    private func verschieben(_ id: UUID, _ d: Int) {
        guard let i = tafeln.firstIndex(where: { $0.id == id }) else { return }
        let j: Int = i + d
        guard j >= 0, j < tafeln.count else { return }
        tafeln.swapAt(i, j)
    }

    private func laden() async {
        guard let b = try? await Api.teamBestenlisten(slug, period: "30d") else { return }
        tafeln = b.tafeln.map { TeamTafelEntwurf($0) }
        geladen = true
    }

    private func speichern() async {
        do {
            try await Api.teamTafelnSetzen(slug, tafeln)
            melden(Loc.t("team.gespeichert", lang))
            await laden()
        } catch {
            melden(Api.teamFehlerText(error, lang))
        }
    }
}

// MARK: - Loeschen

struct TeamLoeschenKarte: View {
    let team: TeamInfo
    let slug: String
    let lang: String
    let melden: (String) -> Void
    let geloescht: () -> Void
    @State private var eingabe = ""

    private var passt: Bool { eingabe.trimmingCharacters(in: .whitespaces).lowercased() == team.name.lowercased() }

    var body: some View {
        TeamKarte {
            Text(Loc.t("team.loeschen", lang)).font(.headline).foregroundStyle(.red)
            Text(teamText("team.loeschenText", lang, ["name": team.name])).font(.subheadline)
            TextField(team.name, text: $eingabe)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button(role: .destructive) { Task { await loeschen() } } label: {
                Text(Loc.t("team.loeschenKnopf", lang)).font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .disabled(!passt)
        }
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.red.opacity(0.4), lineWidth: 1))
    }

    private func loeschen() async {
        do {
            try await Api.teamLoeschen(slug, name: eingabe)
            geloescht()
        } catch {
            melden(Api.teamFehlerText(error, lang))
        }
    }
}

// MARK: - Team- und Eventbild

/// Bild hochladen, Fokuspunkt antippen, Vorschau fuer Handy (2,5:1) und Rechner (4:1), entfernen — fuer Team- und
/// Eventbild (web TeamBanner.tsx `BannerBearbeiten`). Das Bild wird nie zugeschnitten gespeichert.
struct TeamBildBearbeiten: View {
    let url: String?
    let fokus: String?
    let event: Bool
    let lang: String
    let hochladen: (TeamUploadBild) async throws -> Void
    let fokusSetzen: (String) async throws -> Void
    let entfernen: () async throws -> Void
    let fehler: (Error) -> Void
    @State private var punkt: CGPoint?
    @State private var item: PhotosPickerItem?
    @State private var laeuft = false

    private var titel: String { Loc.t(event ? "team.eventbild.titel" : "team.banner.titel", lang) }
    private var hinweis: String { Loc.t(event ? "team.eventbild.hinweis" : "team.banner.hinweis", lang) }
    private var hochText: String { Loc.t(event ? "team.eventbild.hochladen" : "team.banner.hochladen", lang) }
    private var wegText: String { Loc.t(event ? "team.eventbild.entfernen" : "team.banner.entfernen", lang) }
    private var aktFokus: CGPoint { punkt ?? teamBannerFokus(fokus) }
    private var fokusText: String { String(Int((aktFokus.x * 100).rounded())) + "," + String(Int((aktFokus.y * 100).rounded())) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titel).font(.subheadline)
            Text(hinweis).font(.caption).foregroundStyle(.secondary)
            if let u = Api.mediaURL(url) { bildTeil(u) }
            HStack(spacing: 8) {
                PhotosPicker(selection: $item, matching: .images) { Text(hochText).font(.subheadline) }
                    .buttonStyle(.bordered)
                    .disabled(laeuft)
                if url != nil {
                    Button(wegText) { Task { do { try await entfernen() } catch { fehler(error) } } }
                        .font(.subheadline).buttonStyle(.bordered)
                }
                if laeuft { ProgressView() }
            }
        }
        .onChange(of: item) { neu in hoch(neu) }
        .onChange(of: fokus) { _ in punkt = nil }
    }

    @ViewBuilder private func bildTeil(_ u: URL) -> some View {
        Text(Loc.t("team.banner.fokusHinweis", lang)).font(.caption).foregroundStyle(.secondary)
        NetzBild(url: u) { stand in
            switch stand {
            case .da(let img): fokusBild(img)
            default: Color(.tertiarySystemBackground).frame(height: 120)
            }
        }
        HStack(spacing: 10) {
            vorschau(u, 2.5, Loc.t("team.banner.handy", lang))
            vorschau(u, 4, Loc.t("team.banner.rechner", lang))
        }
    }

    /// Ganzes Bild; Antippen setzt den Fokus (Prozent der Bildbreite/-hoehe).
    private func fokusBild(_ img: Image) -> some View {
        img.resizable().scaledToFit()
            .overlay {
                GeometryReader { geo in
                    Circle().fill(Color.black.opacity(0.4)).frame(width: 20, height: 20)
                        .overlay(Circle().stroke(Color.white, lineWidth: 2))
                        .position(x: aktFokus.x * geo.size.width, y: aktFokus.y * geo.size.height)
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture(coordinateSpace: .local) { p in tippen(p, geo.size) }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func vorschau(_ u: URL, _ verhaeltnis: CGFloat, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            TeamBannerVorschau(url: u, fokus: fokusText, verhaeltnis: verhaeltnis)
            Text(text).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func tippen(_ p: CGPoint, _ groesse: CGSize) {
        guard groesse.width > 0, groesse.height > 0 else { return }
        let x: CGFloat = max(0, min(1, p.x / groesse.width))
        let y: CGFloat = max(0, min(1, p.y / groesse.height))
        punkt = CGPoint(x: x, y: y)
        let f: String = fokusText
        Task { do { try await fokusSetzen(f) } catch { fehler(error) } }
    }

    private func hoch(_ neu: PhotosPickerItem?) {
        guard let neu else { return }
        item = nil
        laeuft = true
        Task {
            defer { laeuft = false }
            guard let roh = try? await neu.loadTransferable(type: Data.self), let b = TeamUploadBild.aus(roh, logo: false) else { return }
            do { try await hochladen(b) } catch { fehler(error) }
        }
    }
}

/// Teambild in einem festen Seitenverhaeltnis mit Fokuspunkt (wie TeamBanner, aber Verhaeltnis waehlbar).
struct TeamBannerVorschau: View {
    let url: URL
    let fokus: String
    let verhaeltnis: CGFloat

    var body: some View {
        Color.clear
            .aspectRatio(verhaeltnis, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay { GeometryReader { geo in bild(geo.size) } }
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func bild(_ rahmen: CGSize) -> some View {
        let f: CGPoint = teamBannerFokus(fokus)
        return NetzBild(url: url) { stand in
            switch stand {
            case .da(let img):
                img.resizable().scaledToFill()
                    .alignmentGuide(.leading) { d in (d.width - rahmen.width) * f.x }
                    .alignmentGuide(.top) { d in (d.height - rahmen.height) * f.y }
                    .frame(width: rahmen.width, height: rahmen.height, alignment: .topLeading)
                    .clipped()
            default: Color(.tertiarySystemBackground)
            }
        }
    }
}
