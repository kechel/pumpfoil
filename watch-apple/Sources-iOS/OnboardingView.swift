import SwiftUI
import UIKit   // UIApplication.shared.open — wie in HomeView ausdruecklich importiert

/// Einrichtungs-Assistent, portiert aus der PWA (`web/src/pages/Onboarding.tsx`).
///
/// Gleiche sechs Schritte, gleiche Reihenfolge, gleiche Texte (die Tabelle in
/// `LocOnboarding.swift` wird aus denselben Web-Sprachdateien erzeugt) — und dieselben
/// Grundsaetze: jeder Schritt ist freiwillig und ueberspringbar, ueberall stehen die
/// VORHANDENEN Werte drin, und jeder Schritt speichert sofort fuer sich.
///
/// ZWEI Stellen sind bewusst anders als im Web, weil die Wirklichkeit anders ist:
///  - Apple Watch braucht hier keinen Pairing-Code: die angemeldete iPhone-App mintet das
///    Token und schiebt es per WatchConnectivity auf die Uhr. Der Code bleibt als Rueckfall.
///  - Die Handy-Recorder-Karte traegt den SCHALTER selbst (`phone_rec_enabled`, lokal je
///    Geraet) statt der Store-Knoepfe. In der PWA gibt es nichts einzuschalten, hier schon.
///
/// Aufbau wie SettingsView: ein Abschnitt = eine eigene, explizit typisierte Property. Swifts
/// Type-Checker loest einen ViewBuilder als EINEN Ausdruck auf; ein langer `body` mit vielen
/// Sections laesst den Build minutenlang haengen (belegt in Loc.swift und SettingsView).
struct OnboardingView: View {
    var onFertig: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @AppStorage("appLang") private var lang = "de"
    @AppStorage("phone_rec_enabled") private var phoneRecEnabled = false
    @AppStorage(OnbState.schrittKey) private var schrittId = ""

    @State private var geladen = false
    @State private var name = ""
    @State private var nameBusy = false
    @State private var nameMeldung: (ok: Bool, text: String)?
    @State private var sens = "normal"
    @State private var gewicht = ""
    @State private var sport = "pumpfoil"
    @State private var meineFoils: [Int] = []
    @State private var standardFoil: Int?
    @State private var foils: [Foil] = []
    @State private var suche = ""
    @State private var geraete: [PairedDevice] = []
    @State private var wahl: String?
    @State private var code = ""
    @State private var claimMeldung: (ok: Bool, text: String)?
    @State private var kontoStatus: Api.IntegrationStatus?

    private let schritte = ["lang", "level", "sport", "foil", "watch", "done"]
    private var i: Int { max(0, schritte.firstIndex(of: schrittId) ?? 0) }

    private func t(_ k: String) -> String { Loc.t(k, lang) }

    var body: some View {
        Form {
            kopfSection
            inhaltSection
            navSection
            ausgangSection
        }
        .navigationTitle(t("onb.welcome"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await laden() }
        // Zustand der Verknuepfung erst holen, wenn ein Dienst gewaehlt ist. Ohne das blieb
        // `kontoStatus` nil und der Schritt zeigte immer „gerade nicht verfuegbar".
        .onChange(of: wahl) { neu in
            guard let d = neu, ["polar", "coros", "suunto"].contains(d) else { kontoStatus = nil; return }
            kontoStatus = nil
            Task { kontoStatus = try? await Api.integrationStatus(d) }
        }
    }

    // MARK: - Abschnitte

    private var kopfSection: some View {
        Section {
            Text(t("onb.intro")).font(.footnote).foregroundStyle(.secondary)
            ProgressView(value: Double(i + 1), total: Double(schritte.count))
            Text(t("onb.step").replacingOccurrences(of: "{n}", with: "\(i + 1)")
                    .replacingOccurrences(of: "{total}", with: "\(schritte.count)"))
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var inhaltSection: some View {
        if !geladen {
            Section { ProgressView() }
        } else {
            switch schritte[i] {
            case "lang": sprachSection; nameSection
            case "level": koennenSection; gewichtSection
            case "sport": sportSection
            case "foil": foilSection
            case "watch": uhrSection; handyRecSection
            default: fertigSection
            }
        }
    }

    private var sprachSection: some View {
        Section(t("onb.x.lang")) {
            Picker(t("onb.x.lang"), selection: $lang) {
                ForEach(Loc.langs, id: \.self) { c in Text(Loc.langName(c)).tag(c) }
            }
            .pickerStyle(.navigationLink)
        }
    }

    private var nameSection: some View {
        Section {
            TextField(t("onb.x.namePh"), text: $name)
            Button(t("onb.x.save")) { Task { await nameSpeichern() } }
                .disabled(nameBusy || name.trimmingCharacters(in: .whitespaces).count < 2)
            if let m = nameMeldung {
                Text(m.text).font(.caption).foregroundStyle(m.ok ? Color.green : Color.red)
            }
        } header: { Text(t("onb.x.name")) } footer: { Text(t("onb.name.sub")) }
    }

    private var koennenSection: some View {
        Section {
            ForEach(onbStufen, id: \.id) { stufe in
                Button {
                    // Nur bei echter Aenderung senden: der Server startet dann eine Reanalyse
                    // aller eigenen Sessions.
                    if stufe.sens != sens { sens = stufe.sens; Task { _ = try? await Api.updateFoilSensitivity(stufe.sens) } }
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(t("onb.level.\(stufe.id)"))
                            Text(t("onb.x.sens.\(stufe.sens)")).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if sens == stufe.sens { Image(systemName: "checkmark") }
                    }
                }
                .buttonStyle(.borderless)
            }
        } header: { Text(t("onb.level.title")) } footer: { Text(t("onb.level.sub")) }
    }

    private var gewichtSection: some View {
        Section {
            HStack {
                TextField("95", text: $gewicht).keyboardType(.numberPad)
                Text("kg").foregroundStyle(.secondary)
            }
            .onChange(of: gewicht) { neu in
                let n = Int(neu) ?? 0
                if neu.isEmpty || (0...300).contains(n) { Task { try? await Api.saveSettings(["weight_kg": n]) } }
            }
        } header: { Text(t("onb.x.weight")) } footer: { Text(t("onb.weight.sub")) }
    }

    private var sportSection: some View {
        Section(t("onb.sport.title")) {
            Picker(t("onb.sport.title"), selection: $sport) {
                ForEach(["pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "efoil", "foildrive", "other"],
                        id: \.self) { s in Text(t("onb.x.sport.\(s)")).tag(s) }
            }
            .pickerStyle(.navigationLink)
            .onChange(of: sport) { neu in Task { try? await Api.saveSettings(["default_sport_class": neu]) } }
        }
    }

    private var foilSection: some View {
        Section {
            ForEach(gewaehlteFoils) { f in
                HStack {
                    Button { waehleFoil(f.id) } label: {
                        Image(systemName: f.id == standardFoil ? "star.fill" : "star")
                    }
                    .buttonStyle(.borderless)
                    Text("\(f.brand) \(f.model) \(f.size)")
                    Spacer()
                    Button { entferneFoil(f.id) } label: { Image(systemName: "trash") }
                        .buttonStyle(.borderless)
                }
            }
            TextField(t("onb.foil.search"), text: $suche)
            ForEach(trefferFoils) { f in
                Button { waehleFoil(f.id) } label: {
                    HStack {
                        Text("\(f.brand) \(f.model) \(f.size)")
                        Spacer()
                        Text(t("onb.x.add")).foregroundStyle(.tint)
                    }
                }
                .buttonStyle(.borderless)
            }
            if !suche.isEmpty && trefferFoils.isEmpty { Text(t("onb.foil.none")).foregroundStyle(.secondary) }
            Text(t("onb.foil.missingHow")).font(.caption).foregroundStyle(.secondary)
        } header: { Text(t("onb.foil.title")) } footer: { Text(t("onb.foil.sub")) }
    }

    private var uhrSection: some View {
        Section {
            Picker(t("onb.watch.title"), selection: Binding(get: { wahl ?? "" }, set: { wahl = $0 })) {
                Text("—").tag("")
                Text("Garmin").tag("garmin")
                Text("Apple Watch").tag("apple")
                Text("Wear OS").tag("wear")
                Text("Amazfit").tag("amazfit")
                Text("Polar").tag("polar")
                Text("COROS").tag("coros")
                Text("Suunto").tag("suunto")
            }
            .pickerStyle(.navigationLink)
            uhrInhalt
            if !geraete.isEmpty {
                Text(t("onb.watch.already")).font(.footnote).bold()
                ForEach(geraete) { d in Text(d.model ?? d.label ?? "—").font(.footnote) }
            }
        } header: { Text(t("onb.watch.title")) } footer: { Text(t("onb.watch.sub")) }
    }

    @ViewBuilder private var uhrInhalt: some View {
        switch wahl {
        case "garmin", "apple", "wear", "amazfit": schrittListe
        case "polar", "coros", "suunto": kontoInhalt
        default: EmptyView()
        }
    }

    @ViewBuilder private var schrittListe: some View {
        let p = wahl == "garmin" ? "g" : wahl == "apple" ? "a" : wahl == "wear" ? "w" : "z"
        ForEach(1...3, id: \.self) { n in Text("\(n). " + t("onb.watch.\(p)\(n)")).font(.footnote) }
        // Apple und Wear verbinden sich ueber die angemeldete Handy-App selbst; der Code ist
        // dort nur der Rueckfall. Garmin und Amazfit brauchen ihn immer.
        Text(p == "g" || p == "z" ? t("onb.x.claimTitle") : t("onb.watch.codeFallback")).font(.footnote).bold()
        TextField(t("onb.x.claimPh"), text: $code).textInputAutocapitalization(.characters)
        Button(t("onb.x.claimBtn")) { Task { await claim() } }
            .disabled(code.trimmingCharacters(in: .whitespaces).count < 4)
        if let m = claimMeldung {
            Text(m.text).font(.caption).foregroundStyle(m.ok ? Color.green : Color.red)
        }
    }

    @ViewBuilder private var kontoInhalt: some View {
        let d = wahl ?? "polar"
        Text(t("onb.x.\(d)Title")).font(.footnote).bold()
        if let st = kontoStatus, st.available {
            if st.linked {
                Text(t("onb.link.linked")).foregroundStyle(.green)
            } else {
                Text(t("onb.link.leaves")).font(.caption).foregroundStyle(.secondary)
                Button(t("onb.x.\(d)Connect")) {
                    Task {
                        if let s = try? await Api.integrationAuthorizeURL(d), let u = URL(string: s) {
                            await UIApplication.shared.open(u)
                        }
                    }
                }
            }
        } else {
            Text(t("onb.link.unavailable")).foregroundStyle(.secondary)
        }
    }

    // Handy-Recorder MIT Schalter — anders als in der PWA. `phone_rec_enabled` liegt lokal auf
    // diesem Geraet; ohne ihn erscheint der Aufnahme-Knopf auf der Startseite gar nicht.
    private var handyRecSection: some View {
        Section {
            Toggle(t("onb.x.phonerec"), isOn: $phoneRecEnabled)
        } footer: { Text(t("onb.watch.noWatch")) }
    }

    private var fertigSection: some View {
        Section {
            Text(geraete.isEmpty ? t("onb.done.noWatch") : t("onb.done.withWatch"))
            if !geraete.isEmpty {
                Text(t("onb.done.upload").replacingOccurrences(of: "§", with: "")).font(.footnote)
            }
            Text(t("onb.done.more")).font(.footnote).foregroundStyle(.secondary)
            Text(t("onb.done.feedback")).font(.footnote).foregroundStyle(.secondary)
            Text("Have fun, keep pumping!").font(.headline).foregroundStyle(.tint)
                .frame(maxWidth: .infinity, alignment: .center)
        } header: { Text(t("onb.done.title")) }
    }

    private var navSection: some View {
        Section {
            HStack {
                if i > 0 { Button(t("onb.back")) { schrittId = schritte[i - 1] }.buttonStyle(.borderless) }
                Spacer()
                if schritte[i] != "done" {
                    Button(t("onb.skip") + " »") { schrittId = schritte[i + 1] }.buttonStyle(.borderless)
                    Button(t("onb.next")) { schrittId = schritte[i + 1] }.buttonStyle(.borderless).bold()
                } else {
                    Button(t("onb.finish")) { beenden() }.buttonStyle(.borderless).bold()
                }
            }
        }
    }

    // „Spaeter fortsetzen" laesst den Schritt-Merker stehen — das ist die Zusage des Knopfs.
    // „Nicht mehr zeigen" raeumt ihn weg und setzt den Merker am Konto.
    private var ausgangSection: some View {
        Section {
            Button(t("onb.later")) { onFertig(); dismiss() }.buttonStyle(.borderless)
            Button(t("onb.never")) { beenden() }.buttonStyle(.borderless)
        }
    }

    // MARK: - Daten

    private var gewaehlteFoils: [Foil] {
        foils.filter { $0.id == standardFoil || meineFoils.contains($0.id) }
    }
    private var trefferFoils: [Foil] {
        let q = suche.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return [] }
        return foils.filter { "\($0.brand) \($0.model) \($0.size)".lowercased().contains(q) }.prefix(8).map { $0 }
    }

    private func laden() async {
        if schrittId.isEmpty || !schritte.contains(schrittId) { schrittId = schritte[0] }
        if let p = try? await Api.getProfile() {
            name = p.display_name ?? ""
            sens = p.foil_sensitivity ?? "normal"
        }
        if let s = try? await Api.settings() {
            let w = (s["weight_kg"] as? NSNumber)?.intValue ?? (s["weight_kg"] as? Int) ?? 0
            gewicht = w > 0 ? "\(w)" : ""
            sport = (s["default_sport_class"] as? String) ?? "pumpfoil"
            meineFoils = ((s["my_foils"] as? [Any]) ?? []).compactMap { ($0 as? NSNumber)?.intValue ?? $0 as? Int }
            standardFoil = (s["foil_id"] as? NSNumber)?.intValue ?? (s["foil_id"] as? Int)
        }
        geraete = ((try? await Api.myDevices()) ?? []).filter { $0.revoked_at == nil }
        foils = (try? await Api.foils()) ?? []
        geladen = true
    }

    private func nameSpeichern() async {
        nameBusy = true
        defer { nameBusy = false }
        do {
            _ = try await Api.updateDisplayName(name.trimmingCharacters(in: .whitespaces))
            nameMeldung = (true, t("onb.x.saved"))
        } catch {
            let s = "\(error)"
            nameMeldung = (false, s.contains("409") ? t("onb.x.nameTaken")
                                : s.contains("400") ? t("onb.x.nameLen") : t("onb.x.saveErr"))
        }
    }

    private func waehleFoil(_ id: Int) {
        if !meineFoils.contains(id) { meineFoils.append(id) }
        standardFoil = id
        Task { try? await Api.saveSettings(["my_foils": meineFoils, "foil_id": id]) }
    }

    private func entferneFoil(_ id: Int) {
        meineFoils.removeAll { $0 == id }
        // War es das Standard-Foil, MUSS foil_id mit weg: der Server erzwingt „Default
        // impliziert Mitgliedschaft" und nimmt es sonst sofort wieder auf.
        if standardFoil == id { standardFoil = nil }
        var patch: [String: Any] = ["my_foils": meineFoils]
        // NICHT `standardFoil as Any? ?? NSNull()`: ein Optional in ein `Any?` zu casten ergibt
        // IMMER `.some` (die Huelle, nicht der Inhalt), der ??-Zweig liefe also nie — und der
        // Server bekaeme statt `null` ein verschachteltes Optional. Explizit ausschreiben.
        if let sf = standardFoil { patch["foil_id"] = sf } else { patch["foil_id"] = NSNull() }
        Task { try? await Api.saveSettings(patch) }
    }

    private func claim() async {
        do {
            try await Api.pairClaim(code: code.trimmingCharacters(in: .whitespaces).uppercased(),
                                    label: Api.markeLabel(wahl))
            code = ""
            geraete = ((try? await Api.myDevices()) ?? []).filter { $0.revoked_at == nil }
            claimMeldung = (true, t("onb.x.claimOk"))
        } catch {
            claimMeldung = (false, "\(error)")
        }
    }

    private func beenden() {
        OnbState.angeboten = true
        let jetzt = ISO8601DateFormatter().string(from: Date())
        Task { try? await Api.saveSettings(["onboarding": ["done_at": jetzt, "version": 1]]) }
        // ERST schliessen, dann den Schritt zuruecksetzen: andersherum stand fuer einen
        // Wimpernschlag wieder Schritt 1 da, bevor die Ansicht wegging.
        onFertig()
        dismiss()
        schrittId = ""
    }
}

/// Merker rund um den Assistenten. `schrittKey` liegt in UserDefaults (ueberlebt den App-Lauf,
/// wie der localStorage der PWA); `angeboten` nur im Speicher — es ist die Sperre „einmal je
/// App-Lauf" gegen die Schleife, wenn jemand „Spaeter fortsetzen" drueckt. Beim Abmelden
/// zuruecksetzen, sonst hiesse „beim naechsten Login nochmal" in Wahrheit „beim naechsten
/// App-Start nochmal".
enum OnbState {
    static let schrittKey = "onb_schritt"
    static var angeboten = false
}

/// Koennen-Stufen in inhaltlicher Reihenfolge (Anfaenger -> sicher). Als Liste und nicht als
/// Woerterbuch: eine Map haette hier nach Schluessel sortiert werden muessen, und dass das
/// zufaellig dieselbe Reihenfolge ergibt, ist keine Zusicherung.
private struct OnbStufe: Identifiable { let id: String; let sens: String }
private let onbStufen = [OnbStufe(id: "beginner", sens: "attempts"),
                         OnbStufe(id: "inter", sens: "light"),
                         OnbStufe(id: "pro", sens: "normal")]

