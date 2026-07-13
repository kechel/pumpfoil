import SwiftUI

// Sprachnamen in der jeweiligen Sprache (Reihenfolge = Loc.langs).
private let langNames = ["de": "Deutsch", "gsw": "Schwiizerdütsch", "de-AT": "Österreichisch",
                         "en": "English", "fr": "Français", "it": "Italiano", "es": "Español", "fi": "Suomi"]

// Allgemeine Einstellungen: Gewicht, Homespot, Design (Theme), Push-Benachrichtigungen.
// Bewusst Standard-Bindings + .onChange(of:) (kein derived Binding) — release-robust.
struct SettingsView: View {
    @AppStorage("themeMode") private var themeMode = "auto"
    @AppStorage("appLang") private var lang = "de"
    @State private var weight = 0
    @State private var homespot = ""
    @State private var activityType = "surfing"
    @State private var activityReady = false   // erst nach dem Laden auf Änderungen reagieren
    @State private var hasGarmin = false        // Aktivitätstyp nur bei verknüpfter Garmin-Uhr
    @State private var spots: [String] = []
    @State private var nLike = true
    @State private var nAnalyzed = true
    @State private var nRecord = true
    @State private var saved = false
    @State private var pwCur = ""
    @State private var pwNew = ""
    @State private var pwMsg: (ok: Bool, text: String)?
    @State private var pwBusy = false
    @State private var sensitivity = "normal"
    @State private var reanalysis: ReanalysisProgress?
    @State private var sensReady = false   // erst nach dem Laden auf Änderungen reagieren

    var body: some View {
        Form {
            Section(Loc.t("settings.weight", lang)) {
                Stepper("\(weight) kg", value: $weight, in: 0...300)
            }
            Section(Loc.t("settings.homespot", lang)) {
                Picker(Loc.t("settings.homespot", lang), selection: $homespot) {
                    Text(Loc.t("settings.auto", lang)).tag("")
                    ForEach(spots, id: \.self) { Text($0).tag($0) }
                }
            }
            // Aktivitätstyp der Garmin-Aufnahme (Surfen | Open Water). Nur bei verknüpfter Garmin-Uhr.
            if hasGarmin {
                Section {
                    Picker(Loc.t("account.activityType", lang), selection: $activityType) {
                        Text(Loc.t("account.activitySurfing", lang)).tag("surfing")
                        Text(Loc.t("account.activityOpenWater", lang)).tag("openwater")
                    }
                } header: { Text(Loc.t("account.activityType", lang)) }
                footer: { Text(Loc.t("account.activityTypeHint", lang)) }
            }
            Section(Loc.t("settings.design", lang)) {
                Picker(Loc.t("settings.design", lang), selection: $themeMode) {
                    Text(Loc.t("settings.auto", lang)).tag("auto")
                    Text(Loc.t("settings.light", lang)).tag("light")
                    Text(Loc.t("settings.dark", lang)).tag("dark")
                }
                .pickerStyle(.segmented)
            }
            // Sprache: wirkt sofort (appLang) + ans Profil gespeichert (synct zu Web/Uhr).
            Section(Loc.t("settings.language", lang)) {
                Picker(Loc.t("settings.language", lang), selection: $lang) {
                    ForEach(Loc.langs, id: \.self) { code in
                        Text(langNames[code] ?? code).tag(code)
                    }
                }
            }
            // Persönliche Erkennungs-Empfindlichkeit (nur eigene Ansicht; Server reanalysiert eigene Sessions).
            Section {
                Picker(Loc.t("foilsens.label", lang), selection: $sensitivity) {
                    Text(Loc.t("foilsens.normal", lang)).tag("normal")
                    Text(Loc.t("foilsens.light", lang)).tag("light")
                    Text(Loc.t("foilsens.attempts", lang)).tag("attempts")
                }
                if let p = reanalysis, p.running {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(p.done)/\(p.total > 0 ? String(p.total) : "…") · \(Loc.t("foilsens.reanalyzing", lang))")
                            .font(.footnote).foregroundStyle(.secondary)
                        if p.total > 0 { ProgressView(value: Double(p.done), total: Double(p.total)) }
                    }
                }
            } header: { Text(Loc.t("foilsens.label", lang)) }
            footer: { Text(Loc.t("foilsens.hint", lang)) }
            Section(Loc.t("settings.notifications", lang)) {
                Toggle(Loc.t("settings.nLikes", lang), isOn: $nLike)
                Toggle(Loc.t("settings.nAnalyzed", lang), isOn: $nAnalyzed)
                Toggle(Loc.t("settings.nRecord", lang), isOn: $nRecord)
            }
            // Passwort ändern (wie PWA-Settings).
            Section {
                Text(Loc.t("profile.changePwHint", lang)).font(.footnote).foregroundStyle(.secondary)
                SecureField(Loc.t("profile.curPw", lang), text: $pwCur)
                SecureField(Loc.t("profile.newPw", lang), text: $pwNew)
                Button(Loc.t("profile.changePw", lang)) { changePassword() }
                    .disabled(pwBusy || pwCur.isEmpty || pwNew.isEmpty)
                if let m = pwMsg {
                    Text(m.text).font(.footnote).foregroundStyle(m.ok ? Color.accentColor : .red)
                }
            } header: { Text(Loc.t("profile.changePw", lang)) }
            Section {
                Button(Loc.t("common.save", lang)) { save() }
                if saved { Text(Loc.t("common.saved", lang)).foregroundStyle(.green).font(.footnote) }
            }
        }
        .brandToolbar(Loc.t("settings.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: weight) { _ in saved = false }
        .onChange(of: homespot) { _ in saved = false }
        .onChange(of: nLike) { _ in saved = false }
        .onChange(of: nAnalyzed) { _ in saved = false }
        .onChange(of: nRecord) { _ in saved = false }
        .onChange(of: lang) { l in Task { try? await Api.updateLanguage(l) } }
        .onChange(of: sensitivity) { v in if sensReady { changeSensitivity(v) } }
        .onChange(of: activityType) { v in
            if activityReady { Task { try? await Api.saveSettings(["activity_type": v]); saved = true } }
        }
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
        activityType = (s["activity_type"] as? String) ?? "surfing"
        activityReady = true
        if let ds = try? await Api.myDevices() { hasGarmin = ds.contains { $0.platform == "garmin" && $0.revoked_at == nil } }
        if let np = s["notify_prefs"] as? [String: Any] {
            nLike = (np["like"] as? Bool) ?? true
            nAnalyzed = (np["analyzed"] as? Bool) ?? true
            nRecord = (np["record"] as? Bool) ?? true
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
                "homespot": homespot,
                "notify_prefs": ["like": nLike, "analyzed": nAnalyzed, "record": nRecord],
            ])
            saved = true
        }
    }
}
