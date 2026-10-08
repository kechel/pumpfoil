import SwiftUI

// Oeffentliche Foiler-Seite EINES Nutzers, nativ (PWA web/src/pages/Foiler.tsx, Daten
// GET /api/community/foiler/{id}). Erreichbar ueber jedes Profilbild mit bekannter User-ID
// (OnlinePunkt.swift). Bis 01.10.2026 gab es die Seite nur im Web.
//
// Welche Bloecke erscheinen, entscheidet der SERVER anhand der Schalter des Nutzers. Diese Seite
// prueft nichts nachtraeglich: fehlt ein Feld, wird es nicht gezeigt.
//
// Zur Sessionliste: am 04.09.2026 war entschieden, dass es keine Liste je Nutzer gibt. Am
// 08.09.2026 hat Jan fuer diese Seite die letzten FUENF ausdruecklich gewollt — die Grenze zieht
// der Server, nicht diese Seite.

/// Ziel „1:1-Chat oeffnen" (Knopf „Nachricht"), wert-basiert im Stapel des Sheets.
struct FoilerChatDest: Hashable {
    let scope: String
    let name: String
    let otherId: Int
}

/// Die Foiler-Seite als Sheet mit eigenem Stapel. Warum Sheet statt Push: s. ProfilbildExtras.
/// Alle Ziele der Seite (Session, Spot, Chat) sind hier EINMAL registriert.
struct FoilerSheet: View {
    let userId: Int
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.dismiss) private var dismiss
    @State private var pfad = NavigationPath()

    var body: some View {
        NavigationStack(path: $pfad) {
            FoilerView(userId: userId, pfad: $pfad)
                .toolbar { schliessenKnopf }
                .navigationDestination(for: SessionDest.self) { d in
                    SessionDetailView(id: d.id, dataVersion: d.dataVersion)
                }
                .navigationDestination(for: SpotDest.self) { d in
                    SpotSessionsView(spot: d.spot, vorgegebeneSpotId: d.spotId, sport: d.sport)
                }
                .navigationDestination(for: FoilerChatDest.self) { d in
                    ChatRoomView(scope: d.scope, title: d.name, otherId: d.otherId)
                }
        }
    }

    @ToolbarContentBuilder private var schliessenKnopf: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(Loc.t("common.close", lang)) { dismiss() }
        }
    }
}

struct FoilerView: View {
    let userId: Int
    @Binding var pfad: NavigationPath
    @AppStorage("appLang") private var lang = "de"
    @State private var d: FoilerProfil?
    @State private var fehler: String?
    @State private var chatFehler: String?
    @State private var chatOeffnet = false
    @State private var galerie: ChatGalerie?

    // Drei Zustaende (laedt / Fehler / Daten) — ohne sichtbaren Ladezustand liefe `.task` nie
    // (Memory swiftui-leere-group-laedt-nicht).
    var body: some View {
        inhalt
            .navigationTitle(titel)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { chatToolbar }
            // Auf dieser Seite fuehrt sein Profilbild nicht noch einmal hierher (PWA: pathname).
            .environment(\.foilerSeite, userId)
            .task(id: userId) { await laden() }
            .fullScreenCover(item: $galerie) { g in
                ChatBildGalerie(photos: g.photos, start: g.start) { galerie = nil }
            }
    }

    // Name statt Wortmarke in der Leiste: links „Schliessen", rechts „Nachricht" — die Wortmarke
    // dazwischen passte auf kleinen iPhones nicht mehr.
    private var titel: String { d?.name ?? "" }

    @ViewBuilder private var inhalt: some View {
        if let d {
            liste(d)
        } else if let fehler {
            Text(fehler)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ProgressView(Loc.t("common.loading", lang))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func liste(_ d: FoilerProfil) -> some View {
        List {
            chatFehlerZeile
            ausHinweis(d)
            kopf(d)
            angaben(d)
            rekordeSection(d)
            titelSection(d)
            medienSection(d)
            spotNotizenSection(d)
            sessionsSection(d)
        }
        .listStyle(.insetGrouped)
        .refreshable { await laden() }
    }

    // MARK: - Knopf „Nachricht" (PWA b89044e2), nicht auf der eigenen Seite

    @ToolbarContentBuilder private var chatToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) { chatKnopf }
    }

    @ViewBuilder private var chatKnopf: some View {
        if let d, !d.ich {
            Button { chatOeffnen(d) } label: {
                Label(Loc.t("foiler.chat", lang), systemImage: "bubble.left.and.bubble.right")
                    .labelStyle(.titleAndIcon)
            }
            .disabled(chatOeffnet)
        }
    }

    @ViewBuilder private var chatFehlerZeile: some View {
        if let chatFehler {
            Text(chatFehler).font(.callout).foregroundStyle(.red)
        }
    }

    // Derselbe Weg wie die Personensuche im Chat (`ChatView.openDmWith`): /api/chat/dm liefert
    // Scope und Gegenueber, der Raum oeffnet im Stapel dieses Sheets.
    private func chatOeffnen(_ d: FoilerProfil) {
        chatOeffnet = true
        Task {
            do {
                let r: DmOpen = try await Api.chatDmOpen(userId: d.id)
                let name: String = r.other.name ?? (d.name ?? "")
                chatFehler = nil
                pfad.append(FoilerChatDest(scope: r.scope, name: name, otherId: r.other.id))
            } catch {
                chatFehler = error.localizedDescription
            }
            chatOeffnet = false
        }
    }

    // MARK: - Kopf

    /// Nur der Besitzer sieht diesen Hinweis — sonst waere „ist abgeschaltet" selbst eine Auskunft
    /// ueber ein fremdes Konto. Der Server liefert `aus` deshalb auch nur ihm.
    @ViewBuilder private func ausHinweis(_ d: FoilerProfil) -> some View {
        if d.ich && d.aus {
            Section {
                Text(Loc.t("foiler.offHint", lang)).foregroundStyle(.orange)
                NavigationLink(Loc.t("nav.profile", lang)) { SettingsView() }
            }
        }
    }

    private func kopf(_ d: FoilerProfil) -> some View {
        Section {
            HStack(spacing: 12) {
                AvatarView(name: d.name, url: Api.mediaURL(d.avatar_url), size: 56, userId: d.id, link: false)
                kopfText(d)
            }
            .padding(.vertical, 4)
        }
    }

    private func kopfText(_ d: FoilerProfil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(d.name ?? "—").font(.title2.bold()).lineLimit(1)
            if let s = seitText(d) {
                Text(s).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    /// „Dabei seit 20. Juni 2026" in der PROFILSPRACHE (PWA: Intl mit `lang`, nicht Browser).
    private func seitText(_ d: FoilerProfil) -> String? {
        guard let seit = d.seit else { return nil }
        let ein = DateFormatter()
        ein.locale = Locale(identifier: "en_US_POSIX")
        ein.dateFormat = "yyyy-MM-dd"
        guard let datum = ein.date(from: String(seit.prefix(10))) else { return nil }
        let aus = DateFormatter()
        aus.locale = Locale(identifier: lang == "gsw" ? "de-CH" : lang)
        aus.dateStyle = .long
        aus.timeStyle = .none
        let text: String = aus.string(from: datum)
        return Loc.t("foiler.since", lang).replacingOccurrences(of: "{date}", with: text)
    }

    // MARK: - Angaben (Homespot, Uhr, Foil, YouTube)

    private func hatAngaben(_ d: FoilerProfil) -> Bool {
        let hs: Bool = !(d.homespot ?? "").isEmpty
        let uhr: Bool = !(d.uhren ?? []).isEmpty
        let foil: Bool = !(d.foils ?? []).isEmpty
        return hs || uhr || foil || d.kanal != nil
    }

    @ViewBuilder private func angaben(_ d: FoilerProfil) -> some View {
        if hatAngaben(d) {
            Section {
                homespotZeile(d)
                uhrZeile(d)
                foilZeile(d)
                kanalZeile(d)
            }
        }
    }

    // Der Homespot fuehrt auf den Spot, wenn der Server ihn zuordnen konnte.
    @ViewBuilder private func homespotZeile(_ d: FoilerProfil) -> some View {
        if let h = d.homespot, !h.isEmpty {
            let label: String = Loc.t("foiler.homespot", lang)
            if let sid = d.homespot_id {
                NavigationLink(value: SpotDest(spot: h, spotId: sid)) {
                    angabeZeile("mappin.and.ellipse", label, h)
                }
            } else {
                angabeZeile("mappin.and.ellipse", label, h)
            }
        }
    }

    @ViewBuilder private func uhrZeile(_ d: FoilerProfil) -> some View {
        let uhren: [String] = d.uhren ?? []
        if !uhren.isEmpty {
            angabeZeile("applewatch", Loc.t("foiler.watch", lang), uhren.joined(separator: " · "))
        }
    }

    @ViewBuilder private func foilZeile(_ d: FoilerProfil) -> some View {
        let foils: [FoilerFoil] = d.foils ?? []
        if !foils.isEmpty {
            angabeZeile(nil, Loc.t("foiler.foil", lang), foilText(foils))
        }
    }

    private func foilText(_ foils: [FoilerFoil]) -> String {
        let teile: [String] = foils.map { f in
            let roh: String = "\(f.brand ?? "") \(f.model ?? "") \(f.size ?? "")"
            return roh.trimmingCharacters(in: .whitespaces)
        }
        return teile.joined(separator: " · ")
    }

    // Externer Link: angezeigt wird der Kanal-Name (@handle), nicht die ganze Adresse.
    @ViewBuilder private func kanalZeile(_ d: FoilerProfil) -> some View {
        if let k = d.kanal, let url = URL(string: k) {
            Link(destination: url) {
                angabeZeile("play.rectangle", "YouTube", kanalName(k))
            }
        }
    }

    private func kanalName(_ s: String) -> String {
        guard let u = URL(string: s) else { return s }
        let teile: [String] = u.path.split(separator: "/").map { String($0) }
        if let letzter = teile.last, !letzter.isEmpty { return letzter }
        return u.host ?? s
    }

    /// Label links, Wert rechts. `symbol == nil` = unser Foil-Icon (gibt es nicht als SF Symbol).
    private func angabeZeile(_ symbol: String?, _ label: String, _ wert: String) -> some View {
        HStack(spacing: 8) {
            angabeIcon(symbol)
            Text(label).foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(wert).fontWeight(.semibold).multilineTextAlignment(.trailing)
        }
    }

    @ViewBuilder private func angabeIcon(_ symbol: String?) -> some View {
        if let symbol {
            Image(systemName: symbol).foregroundStyle(.secondary).frame(width: 20)
        } else {
            FoilIcon(tint: .secondary).frame(width: 18, height: 18).frame(width: 20)
        }
    }

    // MARK: - Persoenliche Rekorde (12 Monate) + Summen

    @ViewBuilder private func rekordeSection(_ d: FoilerProfil) -> some View {
        if d.zeigt.records == true, let s = d.rekorde {
            Section(Loc.t("foiler.records", lang)) {
                LazyVGrid(columns: rasterSpalten, spacing: 8) {
                    ForEach(kacheln(s)) { k in kachelKnopf(k) }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var rasterSpalten: [GridItem] {
        [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
    }

    // Jede Rekord-Kachel fuehrt in die Session, in der er gefahren wurde (wie die PWA). `.plain`
    // wie im Rekord-Raster der Community-Seite: mehrere Knoepfe in EINER Listenzeile.
    @ViewBuilder private func kachelKnopf(_ k: FoilerKachel) -> some View {
        if let sid = k.sessionId {
            Button { pfad.append(SessionDest(id: sid)) } label: { kachel(k) }
                .buttonStyle(.plain)
        } else {
            kachel(k)
        }
    }

    private func kachel(_ k: FoilerKachel) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k.label).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            Text(k.wert).font(.headline).monospacedDigit().foregroundStyle(Color.accentColor)
                .lineLimit(1).minimumScaleFactor(0.7)
            kachelDatum(k)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color(.tertiarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder private func kachelDatum(_ k: FoilerKachel) -> some View {
        if let dt = k.datum {
            Text(dt).font(.caption2).monospacedDigit().foregroundStyle(.secondary)
        }
    }

    // Dieselben Kacheln und dieselbe Formatierung wie auf der eigenen Startseite — driftet die
    // Darstellung auseinander, wirken es zwei verschiedene Zahlen.
    private func kacheln(_ s: OverallStats) -> [FoilerKachel] {
        let r: OverallRecords? = s.records
        var out: [FoilerKachel] = []
        out.append(rekordKachel("distance", "rec.farthestRun", r?.distance))
        out.append(rekordKachel("duration", "rec.longestRun", r?.duration))
        out.append(rekordKachel("speed", "rec.topSpeed", r?.speed))
        out.append(rekordKachel("glide", "rec.longestGlide", r?.glide))
        out.append(rekordKachel("runs", "rec.mostRuns", r?.runs))
        out.append(summenKachel("side.sessions", "\(s.count ?? 0)"))
        out.append(summenKachel("stat.runs", "\(s.runs_total ?? 0)"))
        out.append(summenKachel("side.foiling", String(format: "%.1f km", s.foiling_km ?? 0)))
        out.append(summenKachel("side.foilingTime", foilerMinuten(s.foiling_min ?? 0)))
        out.append(summenKachel("side.pumps", (s.pumps ?? 0).formatted()))
        return out
    }

    private func rekordKachel(_ metric: String, _ key: String, _ e: RecordEntry?) -> FoilerKachel {
        let v: Double = e?.value ?? 0
        let da: Bool = v > 0
        let wert: String = da ? foilerRekordWert(metric, v) : "–"
        let datum: String? = da ? TimeFmt.shortDate(e?.started_at, e?.tz) : nil
        let sid: Int? = da ? e?.session_id : nil
        return FoilerKachel(id: key, label: Loc.t(key, lang), wert: wert, datum: datum, sessionId: sid)
    }

    private func summenKachel(_ key: String, _ wert: String) -> FoilerKachel {
        FoilerKachel(id: key, label: Loc.t(key, lang), wert: wert, datum: nil, sessionId: nil)
    }

    // MARK: - Community-Rekorde, die er AKTUELL haelt (12 Monate)

    @ViewBuilder private func titelSection(_ d: FoilerProfil) -> some View {
        let titel: [FoilerTitel] = d.titel ?? []
        let gruppen: [FoilerSpotGruppe] = spotGruppen(d)
        if d.zeigt.titles == true && (!titel.isEmpty || !gruppen.isEmpty) {
            Section(Loc.t("foiler.titles", lang)) {
                basisZeile("accel", titel)
                basisZeile("gps", titel)
                ForEach(gruppen) { g in spotZeile(g) }
            }
        }
    }

    // Zwei Zeilen fuer die community-weiten Titel: unter den Aufnahmen MIT Bewegungssensor und
    // unter denen ohne („nur GPS", nicht „alle" — sonst stuende derselbe Rekord zweimal da).
    @ViewBuilder private func basisZeile(_ basis: String, _ alle: [FoilerTitel]) -> some View {
        let liste: [FoilerTitel] = alle.filter { $0.basis == basis }
        if !liste.isEmpty {
            let key: String = basis == "accel" ? "side.onlyAccel" : "foiler.basisGps"
            VStack(alignment: .leading, spacing: 6) {
                Label(Loc.t(key, lang), systemImage: "person.2")
                    .font(.subheadline.weight(.semibold))
                FoilerFliessReihe(abstand: 6) {
                    ForEach(Array(liste.enumerated()), id: \.offset) { _, x in
                        titelChip(x.metric, x.value, sessionId: x.session_id, hervor: true)
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    // Eine Zeile je Spot. Ist er dort der einzige Fahrer, haelt er zwangslaeufig jeden Rekord —
    // dann sagt EIN Hinweis mehr als zehn Titel ohne Gegner (Jan).
    private func spotZeile(_ g: FoilerSpotGruppe) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { pfad.append(SpotDest(spot: g.name, spotId: g.spotId)) } label: {
                Label(g.name, systemImage: "mappin.and.ellipse")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderless)
            spotChips(g)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private func spotChips(_ g: FoilerSpotGruppe) -> some View {
        if g.titel.first?.allein == true {
            Text(Loc.t("foiler.onlyFoiler", lang))
                .font(.subheadline).foregroundStyle(.secondary)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .overlay(Capsule().stroke(Color.secondary.opacity(0.4), lineWidth: 1))
        } else {
            FoilerFliessReihe(abstand: 6) {
                ForEach(Array(g.titel.enumerated()), id: \.offset) { _, x in
                    titelChip(x.metric, x.value, sessionId: x.session_id, hervor: false)
                }
            }
        }
    }

    // „Meiste Carves >180°" haengt an keiner Session -> kein Knopf. Je Chip ein eigener
    // `.borderless`-Knopf, sonst loest ein Tipp in der Zeile alle aus.
    @ViewBuilder private func titelChip(_ metric: String, _ value: Double, sessionId: Int?, hervor: Bool) -> some View {
        if let sid = sessionId {
            Button { pfad.append(SessionDest(id: sid)) } label: { chipInhalt(metric, value, hervor: hervor) }
                .buttonStyle(.borderless)
        } else {
            chipInhalt(metric, value, hervor: hervor)
        }
    }

    // Community-weite Titel gefuellt (die Auszeichnung ist mehr als ein Spot-Rekord), Spot-Titel
    // nur umrandet — wie die PWA.
    private func chipInhalt(_ metric: String, _ value: Double, hervor: Bool) -> some View {
        let label: String = Loc.t(foilerRekordKey(metric), lang)
        let wert: String = foilerRekordWert(metric, value)
        let farbe: Color = hervor ? Color.accentColor : Color.primary
        let fuellung: Color = hervor ? Color.accentColor.opacity(0.15) : Color.clear
        let rand: Color = hervor ? Color.clear : Color.secondary.opacity(0.4)
        return HStack(spacing: 4) {
            Text(label)
            Text(wert).fontWeight(.semibold).monospacedDigit()
        }
        .font(.subheadline)
        .foregroundStyle(farbe)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(Capsule().fill(fuellung))
        .overlay(Capsule().stroke(rand, lineWidth: 1))
    }

    /// Spot-Titel nach Spot buendeln; die Reihenfolge kommt schon sortiert vom Server.
    private func spotGruppen(_ d: FoilerProfil) -> [FoilerSpotGruppe] {
        var reihenfolge: [String] = []
        var je: [String: [FoilerSpotTitel]] = [:]
        for x in d.spot_titel ?? [] {
            let k: String = x.spot ?? "—"
            if je[k] == nil { reihenfolge.append(k) }
            je[k, default: []].append(x)
        }
        return reihenfolge.map { k in
            let liste: [FoilerSpotTitel] = je[k] ?? []
            return FoilerSpotGruppe(name: k, spotId: liste.first?.spot_id ?? 0, titel: liste)
        }
    }

    // MARK: - Medien

    // Einzeilig als Karussell, unter jeder Kachel das Datum. Ein Foto oeffnet die Vollbild-Galerie
    // mit den Fotos dieses Nutzers; ein Video oeffnet die Session (dort laeuft es im Player, wie
    // ueberall in der App — ein zweiter Abspielweg waere eine zweite Datenschutz-Baustelle).
    @ViewBuilder private func medienSection(_ d: FoilerProfil) -> some View {
        let medien: [FoilerMedium] = d.medien ?? []
        if d.zeigt.media == true && !medien.isEmpty {
            Section(medienTitel(medien.count)) {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 8) {
                        ForEach(Array(medien.enumerated()), id: \.offset) { i, m in
                            Button { medienTipp(i, medien) } label: { medienKachel(m) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func medienTitel(_ n: Int) -> String {
        let t: String = Loc.t("foiler.media", lang)
        return t + " (\(n))"
    }

    private func medienKachel(_ m: FoilerMedium) -> some View {
        VStack(spacing: 4) {
            ZStack {
                NetzBild(url: medienBild(m)) { stand in
                    switch stand {
                    case .da(let img): img.resizable().scaledToFill()
                    default: Color.secondary.opacity(0.15)
                    }
                }
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                medienPlay(m)
            }
            Text(TimeFmt.shortDate(m.started_at, nil) ?? "")
                .font(.caption2).monospacedDigit().foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func medienPlay(_ m: FoilerMedium) -> some View {
        if m.kind == "video" {
            Image(systemName: "play.circle.fill").font(.title).foregroundStyle(.white.opacity(0.9))
        }
    }

    // Video-Vorschau ueber UNSEREN Server (/api/public/video-thumb), nie direkt von YouTube.
    private func medienBild(_ m: FoilerMedium) -> URL? {
        if m.kind == "video" {
            guard let vid = youtubeId(m.youtube_url) else { return nil }
            return URL(string: "\(Api.baseURL)/api/public/video-thumb/\(vid)")
        }
        return Api.mediaURL(m.thumb_url ?? m.url)
    }

    /// Die Galerie zeigt nur Fotos, in derselben Reihenfolge wie das Karussell — damit das
    /// angetippte Bild auch das ist, das aufgeht. Die Galerie der Chat-Bilder taugt dafuer
    /// unveraendert; als id dient die Position im Karussell (eindeutig).
    private func medienTipp(_ index: Int, _ medien: [FoilerMedium]) {
        let m: FoilerMedium = medien[index]
        if m.kind == "video" {
            pfad.append(SessionDest(id: m.session_id))
            return
        }
        var fotos: [ChatPhoto] = []
        var start: Int = 0
        for (i, x) in medien.enumerated() where x.kind != "video" {
            guard let u = x.url else { continue }
            if i == index { start = fotos.count }
            fotos.append(ChatPhoto(id: i, url: u, thumb_url: x.thumb_url))
        }
        if !fotos.isEmpty { galerie = ChatGalerie(photos: fotos, start: start) }
    }

    // MARK: - Spot-Beschreibungen + letzte Sessions

    @ViewBuilder private func spotNotizenSection(_ d: FoilerProfil) -> some View {
        let notizen: [FoilerSpotNotiz] = d.spot_notizen ?? []
        if d.zeigt.spots == true && !notizen.isEmpty {
            Section(Loc.t("foiler.spotNotes", lang)) {
                ForEach(notizen, id: \.spot_id) { n in
                    NavigationLink(value: SpotDest(spot: n.name, spotId: n.spot_id)) {
                        Label(notizText(n), systemImage: "mappin.and.ellipse")
                    }
                }
            }
        }
    }

    private func notizText(_ n: FoilerSpotNotiz) -> String {
        guard let a = n.area_name, !a.isEmpty else { return n.name }
        return n.name + " · " + a
    }

    // Dieselbe Zeile wie in der eigenen Sessionliste; das Profilbild darin traegt den Online-Punkt.
    @ViewBuilder private func sessionsSection(_ d: FoilerProfil) -> some View {
        let liste: [SessionSummary] = d.sessions ?? []
        if d.zeigt.sessions == true && !liste.isEmpty {
            Section {
                ForEach(liste) { s in
                    NavigationLink(value: SessionDest(id: s.id, dataVersion: s.data_version)) {
                        SessionRow(session: s, avatarUserId: d.id)
                    }
                }
            } header: {
                sessionsKopf
            }
        }
    }

    private var sessionsKopf: some View {
        HStack {
            Text(Loc.t("foiler.lastSessions", lang))
            Spacer()
            ListenAnsichtUmschalter(lang: lang)
        }
    }

    // MARK: - Laden

    // 404 = Seite nicht verfuegbar (abgeschaltet, gesperrt, unter 13) — der Server sagt bewusst
    // nicht, welcher Grund. Andere Fehler zeigen ihre Meldung; beim Nachladen bleibt der alte Stand.
    private func laden() async {
        do {
            d = try await Api.foilerProfil(userId)
            fehler = nil
        } catch ApiError.http(let code, _) where code == 404 {
            d = nil
            fehler = Loc.t("foiler.notFound", lang)
        } catch {
            if d == nil { fehler = error.localizedDescription }
        }
    }
}

// MARK: - Bausteine

struct FoilerKachel: Identifiable {
    let id: String
    let label: String
    let wert: String
    let datum: String?
    let sessionId: Int?
}

struct FoilerSpotGruppe: Identifiable {
    let name: String
    let spotId: Int
    let titel: [FoilerSpotTitel]
    var id: String { name }
}

/// Uebersetzungs-Schluessel einer Rekord-Kennzahl — dieselbe Zuordnung wie REC_ITEMS (PWA Home.tsx)
/// und `rekordZeilen` (SpotRecordsView.swift).
func foilerRekordKey(_ metric: String) -> String {
    switch metric {
    case "distance": return "rec.farthestRun"
    case "duration": return "rec.longestRun"
    case "speed": return "rec.topSpeed"
    case "glide": return "rec.longestGlide"
    case "runs": return "rec.mostRuns"
    case "session_distance": return "rec.sessionDistance"
    case "session_time": return "rec.sessionTime"
    case "session_pumps": return "rec.sessionPumps"
    case "max_hr": return "rec.maxHr"
    case "early_bird": return "rec.earlyBird"
    case "night_owl": return "rec.nightOwl"
    case "carves180": return "rec.carves180"
    default: return metric
    }
}

/// Wert einer Rekord-Kennzahl, Formeln wie REC_ITEMS (PWA Home.tsx). Tageszeit-Rekorde sind
/// Sekunden seit Mitternacht; die Nachteule kann ueber 24 h liegen -> mod 24 h.
func foilerRekordWert(_ metric: String, _ v: Double) -> String {
    switch metric {
    case "distance": return meterOderKm(v)
    case "duration": return foilerMinSek(v)
    case "speed": return String(format: "%.1f km/h", v * 3.6)
    case "glide": return String(format: "%.1f s", v)
    case "session_distance": return String(format: "%.1f km", v / 1000.0)
    case "session_time": return "\(Int((v / 60).rounded())) min"
    case "max_hr": return "\(Int(v.rounded())) bpm"
    case "early_bird", "night_owl": return foilerUhrzeit(v)
    default: return "\(Int(v.rounded()))"
    }
}

/// m:ss wie die PWA (Minuten abgerundet, Sekunden gerundet).
func foilerMinSek(_ s: Double) -> String {
    let m: Int = Int(s / 60)
    let sek: Int = Int(s.truncatingRemainder(dividingBy: 60).rounded())
    return String(format: "%d:%02d", m, sek)
}

func foilerUhrzeit(_ v: Double) -> String {
    let s: Int = ((Int(v) % 86400) + 86400) % 86400
    return String(format: "%02d:%02d", s / 3600, (s % 3600) / 60)
}

/// Bewusst dieselbe Formel wie die eigene Startseite der PWA (`fmtDur`): „1 h 5 min" / „45 min".
func foilerMinuten(_ min: Double) -> String {
    let h: Int = Int(min / 60)
    let m: Int = Int(min.truncatingRemainder(dividingBy: 60).rounded())
    return h > 0 ? "\(h) h \(m) min" : "\(m) min"
}

/// Chips, die umbrechen statt abgeschnitten zu werden (die PWA nutzt flex-wrap). iOS 16 hat dafuer
/// das Layout-Protokoll; ein Chip breiter als die Zeile wird auf die Zeilenbreite begrenzt.
struct FoilerFliessReihe: Layout {
    var abstand: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let breite: CGFloat = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var zeile: CGFloat = 0
        var weiteste: CGFloat = 0
        for v in subviews {
            let s: CGSize = groesse(v, breite)
            if x > 0 && x + s.width > breite {
                x = 0
                y += zeile + abstand
                zeile = 0
            }
            x += s.width
            weiteste = max(weiteste, x)
            x += abstand
            zeile = max(zeile, s.height)
        }
        // Nie eine unendliche Breite melden: fragt SwiftUI mit .infinity (statt nil), war das bisher
        // die Antwort — Verdacht fuer das Einfrieren auf Nicolas_Is Profil (08.10.2026, unbelegt).
        let vorschlag: CGFloat? = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        return CGSize(width: vorschlag ?? weiteste, height: y + zeile)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var zeile: CGFloat = 0
        for v in subviews {
            let s: CGSize = groesse(v, bounds.width)
            if x > bounds.minX && x + s.width > bounds.maxX {
                x = bounds.minX
                y += zeile + abstand
                zeile = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: s.width, height: s.height))
            x += s.width + abstand
            zeile = max(zeile, s.height)
        }
    }

    private func groesse(_ v: LayoutSubview, _ breite: CGFloat) -> CGSize {
        let frei: CGSize = v.sizeThatFits(.unspecified)
        if frei.width <= breite { return frei }
        return v.sizeThatFits(ProposedViewSize(width: breite, height: nil))
    }
}
