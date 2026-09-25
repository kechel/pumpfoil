import SwiftUI

// Sprachnamen in der jeweiligen Sprache (Reihenfolge = Loc.langs).

// Allgemeine Einstellungen: Gewicht, Homespot, Design (Theme), Push-Benachrichtigungen.
// Bewusst Standard-Bindings + .onChange(of:) (kein derived Binding) — release-robust.
struct SettingsView: View {
    @AppStorage("themeMode") private var themeMode = "auto"
    @AppStorage("appLang") private var lang = "de"
    // Anzeige-Einheit der Pump-Kadenz (hz|ppm): lokal sofort wirksam, danach ans Profil
    // (synct zu Web/anderen Geräten). Reine Darstellung — siehe PumpUnit.swift.
    @AppStorage(PumpUnit.storeKey) private var pumpUnit = "hz"
    @State private var weight = 0
    // Puls-Zonen: sechs steigende Grenzen (Z1-unten … Z5-oben). Der Server liefert nie leer —
    // ohne eigene Einstellung kommt ein Vorschlag aus dem hoechsten je gemessenen Puls.
    @State private var zonen: [Int] = [95, 114, 133, 152, 171, 190]
    @State private var zonenVorschlag = true
    @State private var spZonen: [Int] = [8, 12, 16, 20, 24, 28]
    @State private var spZonenVorschlag = true
    @State private var homespot = ""
    @State private var spots: [String] = []
    @State private var nLike = true
    @State private var nAnalyzed = true
    @State private var nRecord = true
    @State private var nChat = true
    @State private var saved = false
    @State private var pwCur = ""
    @State private var pwNew = ""
    @State private var pwMsg: (ok: Bool, text: String)?
    @State private var pwBusy = false
    @State private var sensitivity = "normal"
    @State private var reanalysis: ReanalysisProgress?
    @State private var sensReady = false   // erst nach dem Laden auf Änderungen reagieren
    // Eigener YouTube-Kanal fuer den Community-Feed.
    @State private var kanal: SocialChannelState?
    @State private var kanalUrl = ""
    @State private var kanalFehler = ""
    @State private var kanalBusy = false

    // Ein Abschnitt = eine eigene, explizit typisierte Property. Swifts Type-Checker loest einen
    // ViewBuilder als EINEN Ausdruck auf; elf Sections mit je eigenen header/footer-Closures
    // multiplizieren sich darin. Dieser Body war ~97 Zeilen und stand mit >500 ms im Build-Log
    // (Archive hing minutenlang). Reihenfolge und Inhalte sind unveraendert.
    var body: some View {
        Form {
            // Sprache GANZ OBEN (Vorgabe Jan, 13.09.2026, wie in der PWA): wer die Seite in
            // einer Sprache vor sich hat, die er nicht liest, muss hier als Erstes fuendig
            // werden statt an sechs Abschnitten vorbeizuscrollen.
            languageSection
            weightSection
            zonenSection
            spZonenSection
            homespotSection
            // Was sehen andere von mir — oeffentliche Foiler-Seite und „Ort verbergen" direkt
            // untereinander, wie in der PWA. Beide speichern sofort, nicht ueber „Speichern".
            OeffentlicheSeiteSection(lang: lang)
            OrtVerbergenSection(lang: lang)
            GeteilteAufnahmenSection(lang: lang)
            designSection
            pumpUnitSection
            sensitivitySection
            notificationsSection
            socialKanalSection
            passwordSection
            saveSection
        }
        .brandToolbar(Loc.t("settings.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: weight) { _ in saved = false }
        .onChange(of: homespot) { _ in saved = false }
        .onChange(of: nLike) { _ in saved = false }
        .onChange(of: nAnalyzed) { _ in saved = false }
        .onChange(of: nRecord) { _ in saved = false }
        .onChange(of: nChat) { _ in saved = false }
        .onChange(of: lang) { l in Task { try? await Api.updateLanguage(l) } }
        .onChange(of: sensitivity) { v in if sensReady { changeSensitivity(v) } }
        .onChange(of: pumpUnit) { v in Task { _ = try? await Api.updatePumpUnit(v) } }
    }

    // MARK: - Abschnitte

    private var weightSection: some View {
        Section(Loc.t("settings.weight", lang)) {
            Stepper(weightLabel, value: $weight, in: 0...300)
        }
    }

    // Puls-Zonen. Einzige Quelle fuer ALLE Plattformen: nur Garmin und Zepp koennen die Zonen der
    // Uhr selbst lesen, watchOS und Wear OS haben keine API dafuer. Stepper statt Textfeld — im
    // Formular tippt niemand gern sechs Zahlen, und ein Stepper kann nicht ungueltig werden.
    private var zonenSection: some View {
        Section {
            ForEach(0..<5, id: \.self) { i in
                Stepper(value: zonenBinding(i), in: 60...240) {
                    HStack {
                        Circle().fill(zonenFarbe(i)).frame(width: 10, height: 10)
                        Text(Loc.t("hrz.z\(i + 1)", lang))
                        Spacer()
                        Text(zonenText(i)).foregroundStyle(.secondary)
                    }
                }
            }
            Stepper(value: zonenBinding(5), in: 60...240) {
                HStack {
                    Text(Loc.t("hrz.z5", lang))
                    Spacer()
                    Text("\(zonen[5]) bpm").foregroundStyle(.secondary)
                }
            }
            if !zonenVorschlag {
                Button(Loc.t("hrz.reset", lang)) { zonenZuruecksetzen() }
            }
        } header: { Text(Loc.t("hrz.title", lang)) }
        footer: { Text(zonenFuss) }
    }

    private var zonenFuss: String {
        if zonenVorschlag {
            return Loc.t("hrz.isSuggestion", lang).replacingOccurrences(of: "{max}", with: "\(zonen[5])")
        }
        return Loc.t("hrz.hint", lang)
    }

    private func zonenText(_ i: Int) -> String { "\(zonen[i])–\(zonen[i + 1])" }

    private func zonenFarbe(_ i: Int) -> Color {
        let farben: [Color] = [
            Color(red: 0.231, green: 0.510, blue: 0.965), Color(red: 0.133, green: 0.773, blue: 0.369),
            Color(red: 0.918, green: 0.702, blue: 0.031), Color(red: 0.976, green: 0.451, blue: 0.086),
            Color(red: 0.937, green: 0.267, blue: 0.267),
        ]
        return farben[min(max(i, 0), farben.count - 1)]
    }

    /// Grenzen muessen streng steigen. Statt eine Eingabe abzulehnen die Nachbarn mitschieben —
    /// so bleibt jede Zone mindestens 1 bpm breit (Spiegel von HrZones.tsx / SettingsScreen.kt).
    private func zonenBinding(_ i: Int) -> Binding<Int> {
        Binding(
            get: { zonen[i] },
            set: { neu in
                var w = zonen
                w[i] = min(max(neu, 60), 240)
                var k = i + 1
                while k < w.count { w[k] = max(w[k], w[k - 1] + 1); k += 1 }
                k = i - 1
                while k >= 0 { w[k] = min(w[k], w[k + 1] - 1); k -= 1 }
                zonen = w.map { min(max($0, 60), 240) }
                zonenVorschlag = false
                saved = false
            }
        )
    }

    // --- Geschwindigkeits-Zonen: dieselbe Mechanik wie oben, nur andere Einheit/Grenzen. Sie
    // faerben die Zahl auf der Uhr UND die Wert-Grafiken (docs/COLOR-ZONES.md).
    private var spZonenSection: some View {
        Section {
            ForEach(0..<5, id: \.self) { i in
                Stepper(value: spZonenBinding(i), in: 1...80) {
                    HStack {
                        Circle().fill(zonenFarbe(i)).frame(width: 10, height: 10)
                        Text(Loc.t("spz.z\(i + 1)", lang))
                        Spacer()
                        Text("\(spZonen[i])–\(spZonen[i + 1])").foregroundStyle(.secondary)
                    }
                }
            }
            Stepper(value: spZonenBinding(5), in: 1...80) {
                HStack {
                    Text(Loc.t("spz.z5", lang))
                    Spacer()
                    Text("\(spZonen[5]) km/h").foregroundStyle(.secondary)
                }
            }
            if !spZonenVorschlag {
                Button(Loc.t("spz.reset", lang)) { spZonenZuruecksetzen() }
            }
        } header: { Text(Loc.t("spz.title", lang)) }
        footer: { Text(spZonenFuss) }
    }

    private var spZonenFuss: String {
        if spZonenVorschlag {
            return Loc.t("spz.isSuggestion", lang).replacingOccurrences(of: "{max}", with: "\(spZonen[5])")
        }
        return Loc.t("spz.hint", lang)
    }

    private func spZonenBinding(_ i: Int) -> Binding<Int> {
        Binding(
            get: { spZonen[i] },
            set: { neu in
                var w = spZonen
                w[i] = min(max(neu, 1), 80)
                var k = i + 1
                while k < w.count { w[k] = max(w[k], w[k - 1] + 1); k += 1 }
                k = i - 1
                while k >= 0 { w[k] = min(w[k], w[k + 1] - 1); k -= 1 }
                spZonen = w.map { min(max($0, 1), 80) }
                spZonenVorschlag = false
                saved = false
            }
        )
    }

    private func spZonenZuruecksetzen() {
        Task {
            try? await Api.saveSettings(["speed_zones": NSNull()])
            await load()
        }
    }

    private func zonenZuruecksetzen() {
        Task {
            try? await Api.saveSettings(["hr_zones": NSNull()])
            let s = (try? await Api.settings()) ?? [:]
            if let z = (s["hr_zones"] as? [Any])?.compactMap({ ($0 as? NSNumber)?.intValue }), z.count == 6 {
                zonen = z
            }
            zonenVorschlag = true
        }
    }

    // Die .tag()-Aufrufe bleiben ABSICHTLICH direkte Kinder ihres Pickers — nur so findet die
    // Auswahl ihre Eintraege. Darum wird immer die ganze Section ausgelagert, nie deren Inhalt.
    private var homespotSection: some View {
        Section(Loc.t("settings.homespot", lang)) {
            Picker(Loc.t("settings.homespot", lang), selection: $homespot) {
                Text(Loc.t("settings.auto", lang)).tag("")
                ForEach(spots, id: \.self) { Text($0).tag($0) }
            }
        }
    }

    // Aktivitätstyp der Garmin-Aufnahme (Surfen | Open Water). Nur bei verknüpfter Garmin-Uhr.
    private var designSection: some View {
        Section(Loc.t("settings.design", lang)) {
            Picker(Loc.t("settings.design", lang), selection: $themeMode) {
                Text(Loc.t("settings.auto", lang)).tag("auto")
                Text(Loc.t("settings.light", lang)).tag("light")
                Text(Loc.t("settings.dark", lang)).tag("dark")
            }
            .pickerStyle(.segmented)
        }
    }

    // Sprache: wirkt sofort (appLang) + ans Profil gespeichert (synct zu Web/Uhr).
    private var languageSection: some View {
        Section(Loc.t("settings.language", lang)) {
            Picker(Loc.t("settings.language", lang), selection: $lang) {
                ForEach(Loc.langs, id: \.self) { code in
                    Text(Loc.langName(code)).tag(code)
                }
            }
        }
    }

    // Pump-Kadenz als Hz oder Pumps pro Minute — „1,43 Hz" kann sich kaum jemand vorstellen.
    private var pumpUnitSection: some View {
        Section {
            Picker(Loc.t("pumpunit.label", lang), selection: $pumpUnit) {
                Text(Loc.t("pumpunit.hz", lang)).tag("hz")
                Text(Loc.t("pumpunit.ppm", lang)).tag("ppm")
            }
        } header: { Text(Loc.t("pumpunit.label", lang)) }
        footer: { Text(Loc.t("pumpunit.hint", lang)) }
    }

    // Persönliche Erkennungs-Empfindlichkeit (nur eigene Ansicht; Server reanalysiert eigene Sessions).
    private var sensitivitySection: some View {
        Section {
            Picker(Loc.t("foilsens.label", lang), selection: $sensitivity) {
                Text(Loc.t("foilsens.normal", lang)).tag("normal")
                Text(Loc.t("foilsens.light", lang)).tag("light")
                Text(Loc.t("foilsens.attempts", lang)).tag("attempts")
            }
            reanalysisLine
        } header: { Text(Loc.t("foilsens.label", lang)) }
        footer: { Text(Loc.t("foilsens.hint", lang)) }
    }

    @ViewBuilder private var reanalysisLine: some View {
        if let p = reanalysis, p.running {
            VStack(alignment: .leading, spacing: 4) {
                Text(reanalysisText(p))
                    .font(.footnote).foregroundStyle(.secondary)
                if p.total > 0 { ProgressView(value: Double(p.done), total: Double(p.total)) }
            }
        }
    }

    private var notificationsSection: some View {
        Section(Loc.t("settings.notifications", lang)) {
            Toggle(Loc.t("settings.nLikes", lang), isOn: $nLike)
            Toggle(Loc.t("settings.nAnalyzed", lang), isOn: $nAnalyzed)
            Toggle(Loc.t("settings.nRecord", lang), isOn: $nRecord)
            Toggle(Loc.t("settings.nChat", lang), isOn: $nChat)
        }
    }

    /// Eigener YouTube-Kanal fuer den Community-Feed.
    ///
    /// Speichert sich SELBST (eigener Endpunkt `/api/social/mine`), nicht ueber den
    /// „Speichern"-Knopf der Seite — sonst wuerde eine Kanal-Aenderung stumm mitgehen, wenn
    /// jemand nur seine Sprache umstellt. Ein eingetragener Kanal landet immer erst als
    /// „wartet auf Freigabe"; ein bereits freigegebener bleibt bis dahin live.
    @ViewBuilder private var socialKanalSection: some View {
        Section(Loc.t("social.channelTitle", lang)) {
            Text(Loc.t("social.channelHint", lang)).font(.caption).foregroundStyle(.secondary)
            if let st = kanal, let zeile = kanalStand(st) {
                Text(zeile.text).font(.caption).foregroundStyle(zeile.farbe)
            }
            TextField("https://www.youtube.com/@deinkanal", text: $kanalUrl)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            if !kanalFehler.isEmpty {
                Text(kanalFehler).font(.caption).foregroundStyle(.red)
            }
            HStack {
                Button(Loc.t(kanal?.url != nil ? "social.submitChange" : "social.submit", lang)) {
                    kanalBusy = true; kanalFehler = ""
                    Task {
                        do { kanal = try await Api.socialSetChannel(kanalUrl.trimmingCharacters(in: .whitespaces)); kanalUrl = "" }
                        catch { kanalFehler = Loc.t("social.badUrl", lang) }
                        kanalBusy = false
                    }
                }
                .disabled(kanalBusy || kanalUrl.trimmingCharacters(in: .whitespaces).isEmpty)
                if kanal?.url != nil {
                    Spacer()
                    Button(Loc.t("social.remove", lang), role: .destructive) {
                        Task { kanal = (try? await Api.socialRemoveChannel()) ?? kanal }
                    }
                }
            }
        }
        .task { if kanal == nil { kanal = try? await Api.socialMine() } }
    }

    /// Zustandszeile des Kanals — als eigene Funktion, damit der Type-Checker nicht eine
    /// vierstufige Bedingung mitten im ViewBuilder aufloesen muss.
    private func kanalStand(_ st: SocialChannelState) -> (text: String, farbe: Color)? {
        if st.blocked { return (Loc.t("social.stateBlocked", lang), .red) }
        if st.status == "approved", let u = st.url {
            return ("✓ " + Loc.t("social.stateApproved", lang) + ": " + u, Color.accentColor)
        }
        if st.status == "pending" {
            return (Loc.t("social.statePending", lang) + ": " + (st.pending_url ?? ""), .orange)
        }
        if st.status == "rejected", let g = st.rejected_reason {
            return (Loc.t("social.stateRejected", lang) + ": " + g, .red)
        }
        return nil
    }

    // Passwort ändern (wie PWA-Settings).
    private var passwordSection: some View {
        Section {
            Text(Loc.t("profile.changePwHint", lang)).font(.footnote).foregroundStyle(.secondary)
            SecureField(Loc.t("profile.curPw", lang), text: $pwCur)
            SecureField(Loc.t("profile.newPw", lang), text: $pwNew)
            Button(Loc.t("profile.changePw", lang)) { changePassword() }
                .disabled(pwDisabled)
            pwMessage
        } header: { Text(Loc.t("profile.changePw", lang)) }
    }

    // Ternary vorab in eine typisierte Farbe aufgeloest — im Modifier ist es teuer.
    @ViewBuilder private var pwMessage: some View {
        if let m = pwMsg {
            let color: Color = m.ok ? Color.accentColor : Color.red
            Text(m.text).font(.footnote).foregroundStyle(color)
        }
    }

    private var saveSection: some View {
        Section {
            Button(Loc.t("common.save", lang)) { save() }
            savedFlash
        }
    }

    @ViewBuilder private var savedFlash: some View {
        if saved { Text(Loc.t("common.saved", lang)).foregroundStyle(.green).font(.footnote) }
    }

    // MARK: - Texte/Flags vorab typisiert (Interpolation + Verkettung kosten im ViewBuilder am meisten)

    private var weightLabel: String { "\(weight) kg" }

    private var pwDisabled: Bool { pwBusy || pwCur.isEmpty || pwNew.isEmpty }

    private func reanalysisText(_ p: ReanalysisProgress) -> String {
        let total: String = p.total > 0 ? String(p.total) : "…"
        let what: String = Loc.t("foilsens.reanalyzing", lang)
        return "\(p.done)/\(total) · \(what)"
    }

    private func changeSensitivity(_ v: String) {
        Task {
            _ = try? await Api.updateFoilSensitivity(v)
            if v == "normal" { reanalysis = nil; return }
            reanalysis = ReanalysisProgress(running: true, done: 0, total: 0)
            // Fortschritt pollen bis fertig (gecachte Stufen sind sofort durch).
            for _ in 0..<120 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                let p = try? await Api.reanalysisProgress()
                reanalysis = p
                if p == nil || !(p!.running) { return }
            }
        }
    }

    private func load() async {
        let s = (try? await Api.settings()) ?? [:]
        weight = min(max((s["weight_kg"] as? Int) ?? 0, 0), 300)
        homespot = (s["homespot"] as? String) ?? ""
        if let z = (s["hr_zones"] as? [Any])?.compactMap({ ($0 as? NSNumber)?.intValue }), z.count == 6 {
            zonen = z
        }
        zonenVorschlag = (s["hr_zones_suggested"] as? Bool) ?? false
        if let z = (s["speed_zones"] as? [Any])?.compactMap({ ($0 as? NSNumber)?.intValue }), z.count == 6 {
            spZonen = z
        }
        spZonenVorschlag = (s["speed_zones_suggested"] as? Bool) ?? false
        // Dieselben Zahlen fuer die Layout-Vorschauen UND fuer die Wert-Farbe auf der Uhr.
        LayoutScales.aus(hrZones: zonen, speedZones: spZonen)
        if let np = s["notify_prefs"] as? [String: Any] {
            nLike = (np["like"] as? Bool) ?? true
            nAnalyzed = (np["analyzed"] as? Bool) ?? true
            nRecord = (np["record"] as? Bool) ?? true
            nChat = (np["chat"] as? Bool) ?? true
        }
        spots = (try? await Api.spots())?.all ?? []
        if let prof = try? await Api.getProfile() { sensitivity = prof.foil_sensitivity ?? "normal" }
        sensReady = true
    }

    private func changePassword() {
        pwMsg = nil
        if pwNew.count < 8 { pwMsg = (false, Loc.t("profile.pwMin", lang)); return }
        pwBusy = true
        Task {
            do {
                try await Api.changePassword(current: pwCur, newPw: pwNew)
                pwMsg = (true, Loc.t("profile.pwChanged", lang)); pwCur = ""; pwNew = ""
            } catch {
                let s = error.localizedDescription
                pwMsg = (false, s.contains("400") ? Loc.t("profile.pwWrong", lang) : Loc.t("profile.error", lang))
            }
            pwBusy = false
        }
    }

    private func save() {
        Task {
            try? await Api.saveSettings([
                "weight_kg": weight,
                "hr_zones": zonen,
                "speed_zones": spZonen,
                "homespot": homespot,
                // "chat" MUSS mit: notify_prefs wird als Ganzes ersetzt, ein Speichern von hier
                // hat die im Web gesetzte Chat-Einstellung also stillschweigend geloescht.
                "notify_prefs": ["like": nLike, "analyzed": nAnalyzed, "record": nRecord, "chat": nChat],
            ])
            saved = true
        }
    }
}


// MARK: - Privatsphaere (portiert aus der PWA am 25.09.2026, s. Android PrivatsphaereKarten.kt)
//
// Jede Karte laedt selbst und speichert sofort — wie in der PWA. Eigene Structs statt Properties
// von SettingsView: der Type-Checker prueft sie getrennt (s. Kommentar ueber `body`).

private let pubprofFelder = ["join", "watch", "foil", "homespot", "records", "media", "spots",
                             "sessions", "titles", "channel"]

/// Oeffentliche Foiler-Seite: Hauptschalter + Einzelschalter. Der SERVER entscheidet, was auf der
/// Seite landet; die Karte schreibt nur und filtert nicht selbst. Die Seite gibt es nur im Web.
struct OeffentlicheSeiteSection: View {
    let lang: String
    @State private var werte: [String: Bool]? = nil
    @State private var eigeneId: Int = 0

    var body: some View {
        Group {
            if let w = werte {
                Section {
                    Toggle(Loc.t("pubprof.enabled", lang), isOn: binding("enabled", w))
                    if w["enabled"] == true {
                        ForEach(pubprofFelder, id: \.self) { k in
                            Toggle(Loc.t("pubprof.\(k)", lang), isOn: binding(k, w))
                        }
                        ansehenLink
                    }
                } header: {
                    Text(Loc.t("pubprof.title", lang))
                } footer: {
                    Text(Loc.t("pubprof.hint", lang))
                }
            } else {
                // Ohne sichtbaren Inhalt laeuft `.task` nie (s. Memory swiftui-leere-group-laedt-nicht).
                Section(Loc.t("pubprof.title", lang)) { ProgressView() }
            }
        }
        .task { await laden() }
    }

    @ViewBuilder private var ansehenLink: some View {
        if eigeneId > 0, let url = URL(string: Api.baseURL + "/foiler/\(eigeneId)") {
            Link(Loc.t("pubprof.view", lang), destination: url)
        }
    }

    private func binding(_ k: String, _ w: [String: Bool]) -> Binding<Bool> {
        Binding(get: { werte?[k] ?? true }, set: { v in setzen(k, v) })
    }

    private func setzen(_ k: String, _ v: Bool) {
        guard let alt = werte else { return }
        var neu = alt
        neu[k] = v
        werte = neu                               // sofort sichtbar, der Server bestaetigt danach
        Task {
            do { try await Api.saveSettings(["public_profile": neu]) } catch { werte = alt }
        }
    }

    private func laden() async {
        let s = (try? await Api.settings()) ?? [:]
        let p = (s["public_profile"] as? [String: Any]) ?? [:]
        var w: [String: Bool] = [:]
        // Fehlt ein Wert, gilt er als an — dieselbe Vorgabe wie settings.DEFAULTS.
        for k in ["enabled"] + pubprofFelder { w[k] = (p[k] as? Bool) != false }
        werte = w
        if let prof = try? await Api.getProfile() { eigeneId = prof.id ?? 0 }
    }
}

/// „Ort verbergen" als Voreinstellung fuer ALLE eigenen Aufnahmen, rueckwirkend. Der Text sagt
/// ausdruecklich, was NICHT verborgen wird.
struct OrtVerbergenSection: View {
    let lang: String
    @State private var an: Bool? = nil

    var body: some View {
        Section {
            if an != nil {
                Toggle(Loc.t("hideloc.switch", lang), isOn: Binding(get: { an ?? false }, set: { v in setzen(v) }))
                Text(Loc.t("hideloc.scope", lang)).font(.callout).foregroundStyle(.secondary)
                Text(Loc.t("hideloc.single", lang)).font(.callout).foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        } header: {
            Text(Loc.t("hideloc.title", lang))
        } footer: {
            Text(Loc.t("hideloc.hint", lang))
        }
        .task { await laden() }
    }

    private func setzen(_ v: Bool) {
        let alt = an
        an = v
        Task {
            do { try await Api.saveSettings(["hide_location": v]) } catch { an = alt }
        }
    }

    private func laden() async {
        let s = (try? await Api.settings()) ?? [:]
        an = (s["hide_location"] as? Bool) ?? false
    }
}

/// Jede eigene Aufnahme mit aktivem Teilen-Link, mit Knopf zum Zuruecknehmen. Nichts geteilt ->
/// keine Karte. Wann ein Link erzeugt oder ob er je geoeffnet wurde, wissen wir nicht — dafuer
/// braeuchte es ein Zugriffsprotokoll, und das waere Tracking.
struct GeteilteAufnahmenSection: View {
    let lang: String
    @State private var zeilen: [Api.GeteilterLink]? = nil

    var body: some View {
        Group {
            if let z = zeilen, !z.isEmpty {
                Section {
                    ForEach(z) { link in zeile(link) }
                } header: {
                    Text(Loc.t("shared.title", lang))
                } footer: {
                    Text(Loc.t("shared.hint", lang))
                }
            } else if zeilen == nil {
                // Platzhalter, damit `.task` ueberhaupt laeuft; danach verschwindet die Karte ganz.
                Color.clear.frame(height: 0).listRowBackground(Color.clear)
            }
        }
        .task { zeilen = (try? await Api.geteilteLinks()) ?? [] }
    }

    @ViewBuilder private func zeile(_ l: Api.GeteilterLink) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(TimeFmt.shortDate(l.started_at, l.tz) ?? "#\(l.id)").fontWeight(.medium)
                if let p = l.place_name { Text(p).font(.callout).foregroundStyle(.secondary) }
            }
            Spacer()
            Button(Loc.t("shared.revoke", lang)) { zuruecknehmen(l.id) }
                .buttonStyle(.borderless)
        }
    }

    private func zuruecknehmen(_ id: Int) {
        Task {
            do {
                try await Api.revokeShareLink(id)
                // Ohne Nachladen: die Zeile verschwindet sofort, das ist die Rueckmeldung.
                zeilen = zeilen?.filter { $0.id != id }
            } catch {}
        }
    }
}
