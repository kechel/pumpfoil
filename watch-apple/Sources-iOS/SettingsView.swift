import SwiftUI

// Allgemeine Einstellungen: Gewicht, Homespot, Design (Theme), Push-Benachrichtigungen.
// Bewusst Standard-Bindings + .onChange(of:) (kein derived Binding) — release-robust.
struct SettingsView: View {
    @AppStorage("themeMode") private var themeMode = "auto"
    @State private var weight = 0
    @State private var homespot = ""
    @State private var spots: [String] = []
    @State private var nLike = true
    @State private var nAnalyzed = true
    @State private var nRecord = true
    @State private var saved = false

    var body: some View {
        Form {
            Section("Gewicht") {
                Stepper("\(weight) kg", value: $weight, in: 0...300)
            }
            Section("Homespot") {
                Picker("Homespot", selection: $homespot) {
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
                Toggle("Likes", isOn: $nLike)
                Toggle("Auswertung fertig", isOn: $nAnalyzed)
                Toggle("Aufnahme/Records", isOn: $nRecord)
            }
            Section {
                Button("Speichern") { save() }
                if saved { Text("Gespeichert").foregroundStyle(.green).font(.footnote) }
            }
        }
        .navigationTitle("Einstellungen")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: weight) { _ in saved = false }
        .onChange(of: homespot) { _ in saved = false }
        .onChange(of: nLike) { _ in saved = false }
        .onChange(of: nAnalyzed) { _ in saved = false }
        .onChange(of: nRecord) { _ in saved = false }
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
