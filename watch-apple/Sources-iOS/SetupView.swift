import SwiftUI

// Detailliertes Setup: Stab, Mastlänge, Shim, Boards — je „meine" markieren + einen Standard,
// pro Session überschreibbar (das passiert in der Session-Detailansicht). Spiegelt
// web/src/pages/Setup.tsx, inklusive der Server-Grenzen: Mast 30–130 cm, Shim −5…+5°.
// Der Standard ist ein Stern (SF Symbol, kein Emoji); nochmal antippen hebt ihn auf.
// Nach jedem Speichern werden die Einstellungen neu gelesen — der Server dedupliziert und
// begrenzt, die Anzeige soll zeigen, was wirklich gespeichert ist.
// Absichtlich viele kleine Teil-Views: große verschachtelte Ausdrücke lassen Xcodes
// Type-Checker beim Archivieren hängen ([[ios-swift-typecheck-hang]]).
struct SetupView: View {
    @AppStorage("appLang") private var lang = "de"

    @State private var stabs: [StabBrief] = []
    @State private var brands: [String] = []
    @State private var boards: [BoardBrief] = []
    @State private var myStabs: [Int] = []
    @State private var stabId: Int?
    @State private var myMasts: [Int] = []
    @State private var mastLen: Int?
    @State private var myShims: [Double] = []
    @State private var shimDeg: Double?
    @State private var boardId: Int?

    @State private var query = ""
    @State private var brand = ""
    @State private var newMast = ""
    @State private var newShim = ""
    @State private var nsBrand = ""
    @State private var nsModel = ""
    @State private var nsSize = ""
    @State private var stabErr = ""
    @State private var nbName = ""
    @State private var nbVol = ""
    @State private var nbLen = ""
    @State private var loading = true

    var body: some View {
        Form {
            Section { Text(Loc.t("setup.hint", lang)).font(.callout).foregroundStyle(.secondary) }
            if loading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else {
                stabSections
                mastSection
                shimSection
                boardSection
            }
        }
        .navigationTitle(Loc.t("setup.title", lang))
        .task { await load() }
    }

    // MARK: - Stabilizer

    private var filteredStabs: [StabBrief] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return stabs.filter { st in
            (brand.isEmpty || st.brand == brand)
                && (q.isEmpty || gearMatches("\(st.brand) \(st.model) \(st.size)", q))
        }
    }

    @ViewBuilder private var stabSections: some View {
        Section(Loc.t("setup.stabTitle", lang)) {
            TextField(Loc.t("foils.search", lang), text: $query)
            if !brands.isEmpty {
                Picker(Loc.t("foils.brand", lang), selection: $brand) {
                    Text(Loc.t("sessions.all", lang)).tag("")
                    ForEach(brands, id: \.self) { b in Text(b).tag(b) }
                }
            }
        }
        let mineList = filteredStabs.filter { myStabs.contains($0.id) }
        let restList = filteredStabs.filter { !myStabs.contains($0.id) }
        if !mineList.isEmpty {
            Section(Loc.t("setup.myStabs", lang)) { ForEach(mineList) { stabRow($0, isMine: true) } }
        }
        Section(mineList.isEmpty ? Loc.t("foils.catalog", lang) : Loc.t("foils.more", lang)) {
            ForEach(restList) { stabRow($0, isMine: false) }
        }
        Section {
            Text(Loc.t("setup.stabAddHint", lang)).font(.callout).foregroundStyle(.secondary)
            TextField(Loc.t("setup.stabBrandPlaceholder", lang), text: $nsBrand)
            TextField(Loc.t("setup.stabModelPlaceholder", lang), text: $nsModel)
            TextField(Loc.t("setup.stabSizePlaceholder", lang), text: $nsSize)
            Button(Loc.t("foils.add", lang)) { Task { await addStab() } }
                .disabled(nsBrand.trimmingCharacters(in: .whitespaces).isEmpty
                          || nsModel.trimmingCharacters(in: .whitespaces).isEmpty)
            if !stabErr.isEmpty { Text(stabErr).foregroundStyle(.red) }
        }
        Section { MissingHintRow(question: Loc.t("setup.missingStab", lang), lang: lang) }
    }

    @ViewBuilder private func stabRow(_ st: StabBrief, isMine: Bool) -> some View {
        HStack {
            Button {
                Task { await toggleStabDefault(st) }
            } label: {
                Image(systemName: stabId == st.id ? "star.fill" : "star")
                    .foregroundStyle(stabId == st.id ? Color.accentColor : Color.secondary)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(st.brand) \(st.model) \(st.size)".trimmingCharacters(in: .whitespaces))
                    .fontWeight(stabId == st.id ? .semibold : .regular)
                if let specs = stabSpecs(st) {
                    Text(specs).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button {
                Task { await toggleStabMine(st, isMine: isMine) }
            } label: {
                Image(systemName: isMine ? "xmark" : "plus")
                    .foregroundStyle(isMine ? Color.secondary : Color.accentColor)
            }
            .buttonStyle(.plain)
            if st.is_own == true {
                Button(role: .destructive) {
                    Task { await deleteStab(st) }
                } label: { Image(systemName: "trash") }
                    .buttonStyle(.plain)
            }
        }
    }

    // Spannweite und Fläche unter dem Namen — nur, wenn im Katalog gepflegt (der Server schickt
    // 0 als null, damit „nicht gepflegt" und „0 cm²" unterscheidbar bleiben). Wie web Setup.tsx;
    // gerechnet wird damit nichts.
    private func stabSpecs(_ st: StabBrief) -> String? {
        guard let span = st.span_cm, let area = st.area_cm2, span > 0, area > 0 else { return nil }
        let base: String = "\(fmtNum(span)) cm · \(fmtNum(area)) cm²"
        guard st.specs_estimated == true else { return base }
        return base + " · " + Loc.t("foils.specsEst", lang)
    }

    // MARK: - Werte-Abschnitte (Mast, Shim)

    @ViewBuilder private var mastSection: some View {
        Section(Loc.t("setup.mastTitle", lang)) {
            Text(Loc.t("setup.mastDesc", lang)).font(.callout).foregroundStyle(.secondary)
            if myMasts.isEmpty { Text(Loc.t("setup.emptyList", lang)).foregroundStyle(.secondary) }
            ForEach(myMasts, id: \.self) { m in
                valueRow(label: "\(m) cm", isDefault: mastLen == m,
                         onPick: { Task { await save(["mast_len_cm": mastLen == m ? NSNull() : m]) } },
                         onRemove: { Task { await removeMast(m) } })
            }
            HStack {
                TextField(Loc.t("setup.mastPlaceholder", lang), text: $newMast)
                    .keyboardType(.numberPad)
                Button(Loc.t("setup.addValue", lang)) { Task { await addMast() } }
            }
        }
    }

    @ViewBuilder private var shimSection: some View {
        Section(Loc.t("setup.shimTitle", lang)) {
            Text(Loc.t("setup.shimDesc", lang)).font(.callout).foregroundStyle(.secondary)
            if myShims.isEmpty { Text(Loc.t("setup.emptyList", lang)).foregroundStyle(.secondary) }
            ForEach(myShims, id: \.self) { v in
                valueRow(label: fmtShimValue(v), isDefault: shimDeg == v,
                         onPick: { Task { await save(["shim_deg": shimDeg == v ? NSNull() : v]) } },
                         onRemove: { Task { await removeShim(v) } })
            }
            HStack {
                TextField(Loc.t("setup.shimPlaceholder", lang), text: $newShim)
                Button(Loc.t("setup.addValue", lang)) { Task { await addShim() } }
            }
        }
    }

    @ViewBuilder private func valueRow(
        label: String, isDefault: Bool, onPick: @escaping () -> Void, onRemove: @escaping () -> Void
    ) -> some View {
        HStack {
            Button(action: onPick) {
                Image(systemName: isDefault ? "star.fill" : "star")
                    .foregroundStyle(isDefault ? Color.accentColor : Color.secondary)
            }
            .buttonStyle(.plain)
            Text(label).fontWeight(isDefault ? .semibold : .regular)
            Spacer()
            Button(action: onRemove) { Image(systemName: "xmark").foregroundStyle(.secondary) }
                .buttonStyle(.plain)
        }
    }

    // MARK: - Boards

    @ViewBuilder private var boardSection: some View {
        Section(Loc.t("setup.boardTitle", lang)) {
            Text(Loc.t("setup.boardDesc", lang)).font(.callout).foregroundStyle(.secondary)
            if boards.isEmpty { Text(Loc.t("setup.emptyList", lang)).foregroundStyle(.secondary) }
            ForEach(boards) { b in boardRow(b) }
            TextField(Loc.t("setup.boardNamePlaceholder", lang), text: $nbName)
            HStack {
                TextField(Loc.t("setup.boardVolPlaceholder", lang), text: $nbVol)
                TextField(Loc.t("setup.boardLenPlaceholder", lang), text: $nbLen)
            }
            Button(Loc.t("foils.add", lang)) { Task { await addBoard() } }
                .disabled(nbName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    @ViewBuilder private func boardRow(_ b: BoardBrief) -> some View {
        HStack {
            Button {
                Task { await save(["board_id": boardId == b.id ? NSNull() : b.id]) }
            } label: {
                Image(systemName: boardId == b.id ? "star.fill" : "star")
                    .foregroundStyle(boardId == b.id ? Color.accentColor : Color.secondary)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 1) {
                Text(b.name).fontWeight(boardId == b.id ? .semibold : .regular)
                Text(boardSpecs(b)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(role: .destructive) {
                Task { await deleteBoard(b) }
            } label: { Image(systemName: "trash") }
                .buttonStyle(.plain)
        }
    }

    private func boardSpecs(_ b: BoardBrief) -> String {
        var parts: [String] = []
        if let v = b.volume_l { parts.append("\(fmtNum(v)) l") }
        if let l = b.length_cm { parts.append("\(fmtNum(l)) cm") }
        return parts.isEmpty ? Loc.t("setup.noSpecs", lang) : parts.joined(separator: " · ")
    }

    // MARK: - Laden und Speichern

    private func load() async {
        loading = true
        defer { loading = false }
        stabs = (try? await Api.stabs()) ?? []
        brands = (try? await Api.stabBrands()) ?? []
        boards = (try? await Api.boards()) ?? []
        await refreshSettings()
    }

    private func refreshSettings() async {
        guard let s = try? await Api.settings() else { return }
        myStabs = (s["my_stabs"] as? [Any])?.compactMap { $0 as? Int } ?? []
        stabId = s["stab_id"] as? Int
        myMasts = (s["my_masts"] as? [Any])?.compactMap { $0 as? Int } ?? []
        mastLen = s["mast_len_cm"] as? Int
        myShims = (s["my_shims"] as? [Any])?.compactMap { v -> Double? in
            if let d = v as? Double { return d }
            if let i = v as? Int { return Double(i) }
            return nil
        } ?? []
        shimDeg = s["shim_deg"] as? Double ?? (s["shim_deg"] as? Int).map(Double.init)
        boardId = s["board_id"] as? Int
    }

    private func save(_ patch: [String: Any]) async {
        try? await Api.saveSettings(patch)
        await refreshSettings()
    }

    private func toggleStabDefault(_ st: StabBrief) async {
        let mine = myStabs.contains(st.id) ? myStabs : myStabs + [st.id]
        await save(["my_stabs": mine, "stab_id": stabId == st.id ? NSNull() : st.id])
    }

    private func toggleStabMine(_ st: StabBrief, isMine: Bool) async {
        if isMine {
            var patch: [String: Any] = ["my_stabs": myStabs.filter { $0 != st.id }]
            if stabId == st.id { patch["stab_id"] = NSNull() }
            await save(patch)
        } else {
            await save(["my_stabs": myStabs + [st.id]])
        }
    }

    private func addStab() async {
        let b = nsBrand.trimmingCharacters(in: .whitespaces)
        let m = nsModel.trimmingCharacters(in: .whitespaces)
        guard !b.isEmpty, !m.isEmpty else { return }
        do {
            let created = try await Api.stabCreate(brand: b, model: m, size: nsSize.trimmingCharacters(in: .whitespaces))
            if !stabs.contains(where: { $0.id == created.id }) { stabs.append(created) }
            if !brands.contains(created.brand) { brands = (brands + [created.brand]).sorted() }
            nsBrand = ""; nsModel = ""; nsSize = ""; stabErr = ""
            await save(["my_stabs": myStabs.contains(created.id) ? myStabs : myStabs + [created.id]])
        } catch { stabErr = Loc.t("setup.stabAddErr", lang) }
    }

    private func deleteStab(_ st: StabBrief) async {
        try? await Api.stabDelete(st.id)
        stabs = stabs.filter { $0.id != st.id }
        await refreshSettings()
    }

    private func addMast() async {
        guard let v = Int(newMast.replacingOccurrences(of: ",", with: ".").split(separator: ".").first.map(String.init) ?? ""),
              v >= 30, v <= 130 else { return }
        newMast = ""
        await save(["my_masts": myMasts + [v]])
    }

    private func removeMast(_ m: Int) async {
        var patch: [String: Any] = ["my_masts": myMasts.filter { $0 != m }]
        if mastLen == m { patch["mast_len_cm"] = NSNull() }
        await save(patch)
    }

    private func addShim() async {
        guard let v = Double(newShim.replacingOccurrences(of: ",", with: ".")), v >= -5, v <= 5 else { return }
        newShim = ""
        await save(["my_shims": myShims + [v]])
    }

    private func removeShim(_ v: Double) async {
        var patch: [String: Any] = ["my_shims": myShims.filter { $0 != v }]
        if shimDeg == v { patch["shim_deg"] = NSNull() }
        await save(patch)
    }

    private func addBoard() async {
        let n = nbName.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        let vol = Double(nbVol.replacingOccurrences(of: ",", with: "."))
        let len = Double(nbLen.replacingOccurrences(of: ",", with: "."))
        if let created = try? await Api.boardCreate(name: n, volumeL: vol, lengthCm: len) {
            boards.append(created)
            nbName = ""; nbVol = ""; nbLen = ""
        }
    }

    private func deleteBoard(_ b: BoardBrief) async {
        try? await Api.boardDelete(b.id)
        boards = boards.filter { $0.id != b.id }
        await refreshSettings()
    }
}

/// Shim-Anzeige: 0 bleibt „0°", positive Werte mit Vorzeichen, Dezimale nur wenn nötig.
func fmtShimValue(_ v: Double) -> String {
    let txt = v == v.rounded() ? String(Int(v)) : String(v)
    return (v > 0 ? "+" + txt : txt) + "°"
}

func fmtNum(_ v: Double) -> String {
    v == v.rounded() ? String(Int(v)) : String(v)
}
