import SwiftUI

// Sprachnamen in der jeweiligen Sprache (Reihenfolge = Loc.langs).
private let langNames = ["de": "Deutsch", "gsw": "Schwiizerdütsch", "de-AT": "Österreichisch",
                         "en": "English", "fr": "Français", "it": "Italiano", "es": "Español"]

// Allgemeine Einstellungen: Gewicht, Homespot, Design (Theme), Push-Benachrichtigungen.
// Bewusst Standard-Bindings + .onChange(of:) (kein derived Binding) — release-robust.
struct SettingsView: View {
    @AppStorage("themeMode") private var themeMode = "auto"
    @AppStorage("appLang") private var lang = "de"
    @State private var weight = 0
    @State private var homespot = ""
    @State private var spots: [String] = []
    @State private var nLike = true
    @State private var nAnalyzed = true
    @State private var nRecord = true
    @State private var saved = false

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
            Section(Loc.t("settings.notifications", lang)) {
                Toggle(Loc.t("settings.nLikes", lang), isOn: $nLike)
                Toggle(Loc.t("settings.nAnalyzed", lang), isOn: $nAnalyzed)
                Toggle(Loc.t("settings.nRecord", lang), isOn: $nRecord)
            }
            Section {
                Button(Loc.t("common.save", lang)) { save() }
                if saved { Text(Loc.t("common.saved", lang)).foregroundStyle(.green).font(.footnote) }
            }
        }
        .navigationTitle(Loc.t("settings.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: weight) { _ in saved = false }
        .onChange(of: homespot) { _ in saved = false }
        .onChange(of: nLike) { _ in saved = false }
        .onChange(of: nAnalyzed) { _ in saved = false }
        .onChange(of: nRecord) { _ in saved = false }
        .onChange(of: lang) { l in Task { try? await Api.updateLanguage(l) } }
    }

    private func load() async {
        let s = (try? await Api.settings()) ?? [:]
        weight = min(max((s["weight_kg"] as? Int) ?? 0, 0), 300)
        homespot = (s["homespot"] as? String) ?? ""
        if let np = s["notify_prefs"] as? [String: Any] {
            nLike = (np["like"] as? Bool) ?? true
            nAnalyzed = (np["analyzed"] as? Bool) ?? true
            nRecord = (np["record"] as? Bool) ?? true
        }
        spots = (try? await Api.spots())?.all ?? []
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
