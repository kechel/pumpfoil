import SwiftUI

// Vibrationsalarm konfigurieren (spiegelt web AlarmEditor). Persistiert via PUT /api/settings;
// die Uhr-Recorder laden das über /api/devices/config.
struct AlarmView: View {
    private let patterns: [(String, String)] = [
        ("short1", "1× kurz"), ("short2", "2× kurz"),
        ("long2", "2× lang"), ("lsl", "lang-kurz-lang"),
    ]

    @State private var loaded = false
    @State private var saved = false

    @State private var enabled = false
    @State private var def = "foil"
    @State private var high = 0
    @State private var low = 0
    @State private var patHigh = "short2"
    @State private var patLow = "long2"
    @State private var repeatMode = "once"

    var body: some View {
        Form {
            Section {
                Toggle("Vibrationsalarm aktivieren", isOn: $enabled.onChange { saved = false })
            } footer: {
                Text("Die Uhr vibriert beim Foilen, sobald du eine Geschwindigkeitsgrenze über- oder "
                    + "unterschreitest – z. B. um in der optimalen Pump-Geschwindigkeit zu bleiben. "
                    + "Ist der Alarm aus, zeigt der Uhr-Startbildschirm „Alarm: aus“.")
            }

            if enabled {
                Section {
                    Picker("Standard auf der Uhr", selection: $def.onChange { saved = false }) {
                        Text("Mein Standard-Foil").tag("foil")
                        Text("Feste Werte (unten)").tag("fixed")
                    }
                } footer: {
                    Text("Womit die Uhr beim Start vorbelegt ist – an der Uhr (↓) jederzeit umstellbar. "
                        + "„Mein Standard-Foil“ nutzt die aus Foil + Gewicht berechneten Schwellen, "
                        + "„Feste Werte“ die unten eingestellten.")
                }

                Section("Max-Geschwindigkeit überschritten") {
                    Stepper("Max: \(high) km/h", value: $high.onChange { saved = false }, in: 0...60)
                    patternPicker("Muster", selection: $patHigh)
                }
                Section("Min-Geschwindigkeit unterschritten") {
                    Stepper("Min: \(low) km/h", value: $low.onChange { saved = false }, in: 0...60)
                    patternPicker("Muster", selection: $patLow)
                }

                Section {
                    Picker("Auslösen", selection: $repeatMode.onChange { saved = false }) {
                        Text("einmalig beim Über-/Unterschreiten").tag("once")
                        Text("dauerhaft, solange drüber/drunter").tag("continuous")
                    }
                } footer: {
                    Text("Tipp: 0 km/h schaltet die jeweilige Grenze aus.")
                }
            }

            Section {
                Button("Speichern") { save() }
                if saved {
                    Text("Gespeichert").foregroundStyle(.green).font(.footnote)
                }
            }
        }
        .navigationTitle("Vibrationsalarm")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func patternPicker(_ title: String, selection: Binding<String>) -> some View {
        Picker(title, selection: selection.onChange { saved = false }) {
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

// Kleiner Helfer: Binding-Änderung mit Seiteneffekt (z. B. „ungespeichert"-Flag zurücksetzen).
extension Binding {
    func onChange(_ action: @escaping () -> Void) -> Binding<Value> {
        Binding(get: { wrappedValue }, set: { wrappedValue = $0; action() })
    }
}
