import SwiftUI

// Foil-Katalog (spiegelt web/Foils): „meine" merken, eines als Standard (Stern). Persistiert via PUT /api/settings
// (my_foils, foil_id). Seit dem App-Port (Phase 7, 04.11.2026) der Reiter „Foils" der Ausruestung (AusruestungView.swift)
// und der Katalog NUR ueber die Suche (Jan, 04.11.2026): ohne Suchbegriff stehen nur die eigenen da. Standard-Sportart
// und Sportarten an der Uhr stehen im Reiter „Sportarten" (`SportartenSection`).
struct FoilsView: View {
    @AppStorage("appLang") private var lang = "de"
    var eingebettet: Bool = false
    @State private var foils: [Foil] = []
    @State private var brands: [String] = []
    @State private var brand = ""
    @State private var query = ""
    @State private var mine: Set<Int> = []
    @State private var def: Int?
    @State private var loading = true
    @State private var error: String?

    private var filtered: [Foil] {
        foils.filter { f in
            (brand.isEmpty || f.brand == brand) &&
            (query.isEmpty || gearMatches("\(f.brand) \(f.model) \(f.size) \(f.aliases ?? "")", query))
        }
    }

    /// Erst mit Suchbegriff oder Marke erscheint der Katalog.
    private var sucht: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty || !brand.isEmpty }

    var body: some View {
        Form {
            if let error { Text(error).foregroundStyle(.secondary) }
            Section {
                TextField(Loc.t("foils.search", lang), text: $query)
                if !brands.isEmpty {
                    Picker(Loc.t("foils.brand", lang), selection: $brand) {
                        Text(Loc.t("sessions.all", lang)).tag("")
                        ForEach(brands, id: \.self) { b in Text(b).tag(b) }
                    }
                }
            }
            if loading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else {
                katalog
            }
        }
        .brandToolbarWenn(!eingebettet, Loc.t("profile.foils", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // „Meine" zuerst (Standard ganz oben), darunter nur bei einer Suche die Treffer aus dem Katalog.
    @ViewBuilder private var katalog: some View {
        let mineList = filtered.filter { mine.contains($0.id) }.sorted { ($0.id == def ? 0 : 1) < ($1.id == def ? 0 : 1) }
        let restList = filtered.filter { !mine.contains($0.id) }
        if !mineList.isEmpty {
            Section(Loc.t("foils.mine", lang)) { ForEach(mineList) { row($0) } }
        }
        if sucht {
            Section(mineList.isEmpty ? Loc.t("foils.all", lang) : Loc.t("foils.more", lang)) {
                ForEach(restList) { row($0) }
                if restList.isEmpty { Text(Loc.t("gear.noHits", lang)).foregroundStyle(.secondary) }
            }
            specsEstFooter
            Section { MissingHintRow(question: Loc.t("foils.missingFoil", lang), lang: lang) }
        } else {
            Section { Text(Loc.t("gear.searchHint", lang)).foregroundStyle(.secondary) }
        }
    }

    // Erklärung zum Kennzeichen „Maße abgeleitet" — nur, wenn in der gefilterten Liste wirklich
    // ein solcher Eintrag steht. Normale Schriftgröße (Hinweise nie kleiner).
    @ViewBuilder private var specsEstFooter: some View {
        if filtered.contains(where: { $0.specs_estimated == true }) {
            Section { Text(Loc.t("foils.specsEstHint", lang)).foregroundStyle(.secondary) }
        }
    }

    // „0 cm² · AR –" wäre eine Falschaussage: neu erschienene Modelle stehen mit 0 im Katalog,
    // solange der Hersteller keine Maße veröffentlicht hat (auswählbar bleiben sie).
    private func subline(_ f: Foil) -> String {
        guard f.area_cm2 > 0, f.span_cm > 0 else { return Loc.t("foils.noSpecs", lang) }
        let ar: String = f.aspect_ratio.map { String(format: "%.1f", $0) } ?? "–"
        return "\(Int(f.area_cm2)) cm²  ·  AR \(ar)"
    }

    @ViewBuilder private func row(_ f: Foil) -> some View {
        let isMine = mine.contains(f.id)
        let isDefault = f.id == def
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(f.brand) \(f.model) \(f.size)")
                Text(subline(f)).font(.caption).foregroundStyle(.secondary)
                if f.specs_estimated == true {
                    Text(Loc.t("foils.specsEst", lang)).font(.caption).foregroundStyle(Color.orange)
                }
            }
            Spacer()
            Button { setDefault(f.id) } label: {
                Image(systemName: isDefault ? "star.fill" : "star")
                    .foregroundStyle(isDefault ? .yellow : .secondary)
            }.buttonStyle(.borderless)
            Button { toggleMine(f.id) } label: {
                Image(systemName: isMine ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isMine ? Color.accentColor : .secondary)
            }.buttonStyle(.borderless)
        }
    }

    private func toggleMine(_ id: Int) {
        if mine.contains(id) { mine.remove(id); if def == id { def = nil } } else { mine.insert(id) }
        persist()
    }
    private func setDefault(_ id: Int) {
        if def == id { def = nil } else { def = id; mine.insert(id) }
        persist()
    }
    private func persist() {
        let patch: [String: Any] = ["my_foils": mine.sorted(), "foil_id": def ?? NSNull()]
        Task { try? await Api.saveSettings(patch) }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            foils = try await Api.foils()
            brands = (try? await Api.foilBrands()) ?? []
            if let s = try? await Api.settings() {
                if let mf = s["my_foils"] as? [Int] { mine = Set(mf) }
                else if let mf = s["my_foils"] as? [NSNumber] { mine = Set(mf.map(\.intValue)) }
                def = (s["foil_id"] as? Int) ?? (s["foil_id"] as? NSNumber)?.intValue
                if let ds = s["default_sport_class"] as? String, !ds.isEmpty { standardSport = ds }
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// „Fehlt im Katalog?" — Frage plus ein Knopf, der das Feedback-Blatt mit genau dieser Frage als
// vorbelegtem Text öffnet (wie web/src/components/MissingHint.tsx). Steht unter Katalog-Listen,
// die naturgemäß unvollständig sind (Foils, Stabs): ohne diesen Weg war die Lücke eine Sackgasse,
// und Nutzer schrieben erst Tage später per Mail.
struct MissingHintRow: View {
    let question: String
    let lang: String
    @State private var show = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question).foregroundStyle(.secondary)
            Button {
                show = true
            } label: {
                Label(Loc.t("foils.missingCta", lang), systemImage: "envelope")
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.accentColor)
            .fontWeight(.semibold)
        }
        .sheet(isPresented: $show) { FeedbackView(lang: lang, prefill: question) }
    }
}

/// Standard-Sportart neuer Sessions (docs/sport-classification.md) und Sportarten an der Uhr (19.10.2026) — Reiter
/// „Sportarten" der Ausruestung, wie `Sportarten` in web/src/pages/Foils.tsx. Stand vorher oben auf der Foil-Seite.
struct SportartenSection: View {
    let lang: String
    @State private var defSport = "pumpfoil"
    // Sportarten an der Uhr (19.10.2026): Standard immer dabei, die uebrigen hier anwaehlen.
    @State private var mySports: [String] = []
    @State private var geladen = false

    private func sportBindung(_ sp: String) -> Binding<Bool> {
        Binding(get: { sp == defSport || mySports.contains(sp) }, set: { an in
            var neu = mySports.filter { $0 != sp }
            if an { neu.append(sp) }
            mySports = neu
            Task { try? await Api.saveSettings(["my_sports": neu]) }
        })
    }

    var body: some View {
        Section {
            Picker(Loc.t("foils.defaultSport", lang), selection: $defSport) {
                ForEach(sortiereSports(SPORTS, lang: lang), id: \.self) { sp in
                    Text(Loc.t("cls.sport." + sp, lang)).tag(sp)
                }
            }
            .onChange(of: defSport) { v in
                // Erst nach dem Laden speichern — sonst schriebe der Startwert „pumpfoil" ueber die echte Vorgabe.
                guard geladen else { return }
                standardSport = v
                Task { try? await Api.saveSettings(["default_sport_class": v]) }
            }
            Text(Loc.t("foils.defaultSportHint", lang)).font(.callout).foregroundStyle(.secondary)
            // Sportarten an der Uhr (19.10.2026, wie das Web)
            DisclosureGroup(Loc.t("foils.mySports", lang)) {
                ForEach(sortiereSports(SPORTS.filter { $0 != "other" }, lang: lang), id: \.self) { sp in
                    Toggle(Loc.t("cls.sport." + sp, lang), isOn: sportBindung(sp)).disabled(sp == defSport)
                }
                Text(Loc.t("foils.mySportsHint", lang)).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .task { await laden() }
    }

    private func laden() async {
        guard let s = try? await Api.settings() else { return }
        if let ds = s["default_sport_class"] as? String, !ds.isEmpty { defSport = ds; standardSport = ds }
        mySports = (s["my_sports"] as? [String]) ?? []
        // Erst im naechsten Durchlauf scharf schalten: das onChange des eben gesetzten Werts kommt danach.
        DispatchQueue.main.async { geladen = true }
    }
}
