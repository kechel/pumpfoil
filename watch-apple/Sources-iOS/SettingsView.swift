import SwiftUI

// Allgemeine Einstellungen: Gewicht, Homespot, Design (Theme), Push-Benachrichtigungen.
struct SettingsView: View {
    @AppStorage("themeMode") private var themeMode = "auto"
    @State private var weight = 0
    @State private var homespot = ""
    @State private var spots: [String] = []
    @State private var nLike = true
    @State private var nAnalyzed = true
    @State private var nRecord = true
    @State private var loaded = false
    @State private var saved = false

    var body: some View {
        Form {
            Section("Gewicht") {
                Stepper("\(weight) kg", value: $weight.onChange { saved = false }, in: 0...300)
            }
            Section("Homespot") {
                Picker("Homespot", selection: $homespot.onChange { saved = false }) {
                    Text("Automatisch").tag("")
                    ForEach(spots, id: \.self) { Text($0).tag($0) }
                }
            }
            Section("Design") {
                Picker("Design", selection: $themeMode) {
                    Text("Automatisch").tag("auto")
                    Text("Hell").tag("light")
                    Text("Dunkel").tag("dark")
                }
                .pickerStyle(.segmented)
            }
            Section("Benachrichtigungen") {
                Toggle("Likes", isOn: $nLike.onChange { saved = false })
                Toggle("Auswertung fertig", isOn: $nAnalyzed.onChange { saved = false })
                Toggle("Aufnahme/Records", isOn: $nRecord.onChange { saved = false })
            }
            Section {
                Button("Speichern") { save() }
                if saved { Text("Gespeichert").foregroundStyle(.green).font(.footnote) }
            }
        }
        .navigationTitle("Einstellungen")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        let s = (try? await Api.settings()) ?? [:]
        weight = min(max((s["weight_kg"] as? Int) ?? 0, 0), 300)   // in Stepper-Range klemmen (Release-Crash vermeiden)
        homespot = (s["homespot"] as? String) ?? ""
        if let np = s["notify_prefs"] as? [String: Any] {
            nLike = (np["like"] as? Bool) ?? true
            nAnalyzed = (np["analyzed"] as? Bool) ?? true
            nRecord = (np["record"] as? Bool) ?? true
        }
        spots = (try? await Api.spots())?.all ?? []
        loaded = true
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
