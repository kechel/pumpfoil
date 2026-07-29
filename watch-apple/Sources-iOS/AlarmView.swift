import SwiftUI

// Vibrationsalarm konfigurieren (spiegelt web AlarmEditor). Persistiert via PUT /api/settings;
// die Uhr-Recorder laden das über /api/devices/config.
struct AlarmView: View {
    @AppStorage("appLang") private var lang = "de"
    private var patterns: [(String, String)] {
        [("short1", Loc.t("alarm.patShort1", lang)), ("short2", Loc.t("alarm.patShort2", lang)),
         ("long2", Loc.t("alarm.patLong2", lang)), ("lsl", Loc.t("alarm.patLsl", lang))]
    }

    @State private var loaded = false
    @State private var saved = false

    @State private var enabled = false
    @State private var def = "foil"
    @State private var high = 0
    @State private var low = 0
    @State private var patHigh = "short2"
    @State private var patLow = "long2"
    @State private var repeatMode = "once"

    // Ein Abschnitt = eine eigene, explizit typisierte Property. Swifts Type-Checker loest einen
    // ViewBuilder als EINEN Ausdruck auf; sechs Sections mit eigenen footer-Closures, Steppern und
    // Pickern multiplizieren sich darin (Body war ~54 Zeilen). Reihenfolge/Inhalte unveraendert.
    var body: some View {
        Form {
            enableSection
            enabledSections
            saveSection
        }
        .brandToolbar(Loc.t("alarm.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: enabled) { _ in saved = false }
        .onChange(of: def) { _ in saved = false }
        .onChange(of: high) { _ in saved = false }
        .onChange(of: low) { _ in saved = false }
        .onChange(of: patHigh) { _ in saved = false }
        .onChange(of: patLow) { _ in saved = false }
        .onChange(of: repeatMode) { _ in saved = false }
    }

    // MARK: - Abschnitte

    private var enableSection: some View {
        Section {
            Toggle(Loc.t("alarm.enable", lang), isOn: $enabled)
        } footer: {
            Text(Loc.t("alarm.desc", lang))
        }
    }

    @ViewBuilder private var enabledSections: some View {
        if enabled {
            defaultSourceSection
            overSection
            underSection
            modeSection
        }
    }

    // Die .tag()-Aufrufe bleiben ABSICHTLICH direkte Kinder ihres Pickers — nur so findet die
    // Auswahl ihre Eintraege. Darum wird immer die ganze Section ausgelagert, nie deren Inhalt.
    private var defaultSourceSection: some View {
        Section {
            Picker(Loc.t("alarm.defaultSource", lang), selection: $def) {
                Text(Loc.t("alarm.defaultFoil", lang)).tag("foil")
                Text(Loc.t("alarm.defaultFixed", lang)).tag("fixed")
            }
        } footer: {
            Text(Loc.t("alarm.defaultHelp", lang))
        }
    }

    private var overSection: some View {
        Section(Loc.t("alarm.overTitle", lang)) {
            Stepper(highLabel, value: $high, in: 0...60)
            patternPicker(Loc.t("alarm.pattern", lang), selection: $patHigh)
        }
    }

    private var underSection: some View {
        Section(Loc.t("alarm.underTitle", lang)) {
            Stepper(lowLabel, value: $low, in: 0...60)
            patternPicker(Loc.t("alarm.pattern", lang), selection: $patLow)
        }
    }

    private var modeSection: some View {
        Section {
            Picker(Loc.t("alarm.mode", lang), selection: $repeatMode) {
                Text(Loc.t("alarm.modeOnce", lang)).tag("once")
                Text(Loc.t("alarm.modeContinuous", lang)).tag("continuous")
            }
        } footer: {
            Text(Loc.t("alarm.zeroHint", lang))
        }
    }

    private var saveSection: some View {
        Section {
            Button(Loc.t("common.save", lang)) { save() }
            if saved {
                Text(Loc.t("common.saved", lang)).foregroundStyle(.green).font(.footnote)
            }
        }
    }

    // Mehrteilige Interpolationen aus dem ViewBuilder heraus: jede zwingt den Checker sonst durch
    // alle Stepper-/LocalizedStringKey-Ueberladungen. Text identisch.
    private var highLabel: String { "\(Loc.t("alarm.maxSpeed", lang)): \(high) km/h" }
    private var lowLabel: String { "\(Loc.t("alarm.minSpeed", lang)): \(low) km/h" }

    private func patternPicker(_ title: String, selection: Binding<String>) -> some View {
        Picker(title, selection: selection) {
            ForEach(patterns, id: \.0) { id, label in Text(label).tag(id) }
        }
    }

    private func load() async {
        let s = (try? await Api.settings()) ?? [:]
        enabled = (s["alarm_enabled"] as? Bool) ?? false
        def = (s["alarm_default"] as? String) ?? "foil"
        high = (s["speed_high"] as? Int) ?? 0
        low = (s["speed_low"] as? Int) ?? 0
        patHigh = (s["alarm_pattern_high"] as? String) ?? "short2"
        patLow = (s["alarm_pattern_low"] as? String) ?? "long2"
        repeatMode = (s["alarm_repeat"] as? String) ?? "once"
        loaded = true
    }

    private func save() {
        Task {
            try? await Api.saveSettings([
                "alarm_enabled": enabled,
                "alarm_default": def,
                "speed_high": high,
                "speed_low": low,
                "alarm_pattern_high": patHigh,
                "alarm_pattern_low": patLow,
                "alarm_repeat": repeatMode,
            ])
            saved = true
        }
    }
}
