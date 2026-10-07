import SwiftUI

// Setup einer Session KOMPAKT (Jan, 07.10.2026): „die ganzen Einstellungs-Moeglichkeiten (Foil, Stab,
// Gewicht, Shim …) nehmen viel zu viel Platz ein — kleine Anzeige der aktuellen Werte und ein kleiner
// Edit-Knopf daneben, im Popup gemeinsam aendern und speichern." Vorher standen Foil-Menue und vier
// Setup-Menues untereinander bzw. in einem Raster. Jetzt: EINE umbrechende Textzeile fuer alle (auch
// fuer Fremde, die vorher gar nichts sahen), der Stift nur beim Besitzer.
// Bewusst kleine Teil-Views und vorab gebaute Strings ([[ios-swift-typecheck-hang]]).

struct SetupZeile: View {
    let session: SessionDetail
    let lang: String
    let kannBearbeiten: Bool
    let onEdit: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(zeilenText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            if kannBearbeiten {
                Button(action: onEdit) {
                    Image(systemName: "square.and.pencil").font(.body)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Loc.t("setup.editTitle", lang))
            }
        }
    }

    private var zeilenText: String {
        let teile: [String] = SetupZeile.teile(session)
        if teile.isEmpty { return Loc.t("setup.editTitle", lang) }
        return teile.joined(separator: " · ")
    }

    static func teile(_ s: SessionDetail) -> [String] {
        var out: [String] = []
        if let f = s.foil {
            out.append("\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces))
        }
        if let st = s.setup?.stab {
            out.append("\(st.brand) \(st.model) \(st.size)".trimmingCharacters(in: .whitespaces))
        }
        if let cm = s.setup?.mast_len_cm { out.append("\(cm) cm") }
        if let d = s.setup?.shim_deg { out.append(SetupZeile.shimText(d)) }
        if let b = s.setup?.board { out.append(b.name) }
        if let kg = s.setup?.weight_kg { out.append("\(kg) kg") }
        return out
    }

    /// 0 bleibt „0°", positive Werte mit Vorzeichen, Dezimale nur wenn noetig.
    static func shimText(_ v: Double) -> String {
        let zahl: String = v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
        return (v > 0 ? "+" : "") + zahl + "°"
    }
}

// Das Popup: alle sechs Felder, EIN Speichern. Leere Auswahl = Standard aus dem Profil (der Server
// braucht dafuer ein explizites null). Gesendet wird nur, was sich geaendert hat.
struct SetupBearbeitenSheet: View {
    let session: SessionDetail
    let lang: String
    let foils: [Foil]
    let meineFoils: Set<Int>
    let stabs: [StabBrief]
    let meineStabs: Set<Int>
    let masten: [Int]
    let shims: [Double]
    let boards: [BoardBrief]
    let onGespeichert: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var foilId: Int = 0
    @State private var stabId: Int = 0
    @State private var mast: Int = 0
    @State private var shim: String = ""
    @State private var boardId: Int = 0
    @State private var gewicht: String = ""
    @State private var start: [String: String] = [:]
    @State private var busy = false
    @State private var fehler: String?

    var body: some View {
        NavigationStack {
            Form {
                foilAbschnitt
                stabAbschnitt
                mastShimAbschnitt
                boardAbschnitt
                gewichtAbschnitt
                if let fehler { Text(fehler).foregroundStyle(.red) }
            }
            .navigationTitle(Loc.t("setup.editTitle", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { werkzeuge }
            .onAppear(perform: vorbelegen)
        }
    }

    @ToolbarContentBuilder private var werkzeuge: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(Loc.t("common.cancel", lang)) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button(Loc.t("common.save", lang)) { Task { await speichern() } }.disabled(busy)
        }
    }

    // MARK: Abschnitte

    private var foilAbschnitt: some View {
        Section(Loc.t("sd.foilOfSession", lang)) {
            Picker(Loc.t("sd.foilOfSession", lang), selection: $foilId) {
                Text(Loc.t("foil.useDefault", lang)).tag(0)
                ForEach(foilsSchnell) { f in Text(foilText(f)).tag(f.id) }
                ForEach(foilsRest) { f in Text(foilText(f)).tag(f.id) }
            }
            .pickerStyle(.menu)
            .labelsHidden()
        }
    }

    @ViewBuilder private var stabAbschnitt: some View {
        if !stabs.isEmpty {
            Section(Loc.t("setup.stabTitle", lang)) {
                Picker(Loc.t("setup.stabTitle", lang), selection: $stabId) {
                    Text(Loc.t("setup.inherit", lang)).tag(0)
                    ForEach(stabsSchnell) { st in Text(stabText(st)).tag(st.id) }
                    ForEach(stabsRest) { st in Text(stabText(st)).tag(st.id) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
        }
    }

    @ViewBuilder private var mastShimAbschnitt: some View {
        if !mastWahl.isEmpty || !shimWahl.isEmpty {
            Section {
                if !mastWahl.isEmpty {
                    Picker(Loc.t("setup.mastTitle", lang), selection: $mast) {
                        Text(Loc.t("setup.inherit", lang)).tag(0)
                        ForEach(mastWahl, id: \.self) { m in Text("\(m) cm").tag(m) }
                    }
                }
                if !shimWahl.isEmpty {
                    Picker(Loc.t("setup.shimTitle", lang), selection: $shim) {
                        Text(Loc.t("setup.inherit", lang)).tag("")
                        ForEach(shimWahl, id: \.self) { v in Text(SetupZeile.shimText(v)).tag(shimSchluessel(v)) }
                    }
                }
            }
        }
    }

    @ViewBuilder private var boardAbschnitt: some View {
        if !boards.isEmpty {
            Section(Loc.t("setup.boardTitle", lang)) {
                Picker(Loc.t("setup.boardTitle", lang), selection: $boardId) {
                    Text(Loc.t("setup.inherit", lang)).tag(0)
                    ForEach(boards) { b in Text(b.name).tag(b.id) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
        }
    }

    private var gewichtAbschnitt: some View {
        Section(Loc.t("setup.weightTitle", lang)) {
            HStack {
                TextField(gewichtPlatzhalter, text: $gewicht)
                    .keyboardType(.numberPad)
                Text("kg").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Auswahl-Listen (das gewaehlte Element steht mit in der Favoriten-Gruppe, wie bisher)

    private var foilsSchnell: [Foil] { foils.filter { meineFoils.contains($0.id) || $0.id == foilId } }
    private var foilsRest: [Foil] {
        let ids: Set<Int> = Set(foilsSchnell.map(\.id))
        return foils.filter { !ids.contains($0.id) }
    }
    private var stabsSchnell: [StabBrief] { stabs.filter { meineStabs.contains($0.id) || $0.id == stabId } }
    private var stabsRest: [StabBrief] {
        let ids: Set<Int> = Set(stabsSchnell.map(\.id))
        return stabs.filter { !ids.contains($0.id) }
    }
    // Eigene Liste aus dem Profil, plus ein fuer diese Session gesetzter Wert, falls er dort fehlt.
    private var mastWahl: [Int] {
        var w: [Int] = masten
        if mast > 0 && !w.contains(mast) { w.append(mast) }
        return w
    }
    private var shimWahl: [Double] {
        var w: [Double] = shims
        if let v = Double(shim), !w.contains(v) { w.append(v) }
        return w
    }

    private func shimSchluessel(_ v: Double) -> String { String(v) }
    private func foilText(_ f: Foil) -> String { "\(f.brand) \(f.model) \(f.size)" }
    private func stabText(_ st: StabBrief) -> String {
        "\(st.brand) \(st.model) \(st.size)".trimmingCharacters(in: .whitespaces)
    }
    private var gewichtPlatzhalter: String {
        if session.setup?.weight_is_default != false, let kg = session.setup?.weight_kg { return "\(kg)" }
        return "—"
    }

    // MARK: Vorbelegen und Speichern

    /// Nur was fuer DIESE Session ausdruecklich gesetzt ist; Geerbtes steht als „Standard".
    private func vorbelegen() {
        let su: SessionSetup? = session.setup
        foilId = session.foil?.id ?? 0
        stabId = (su?.stab?.is_default == false) ? (su?.stab?.id ?? 0) : 0
        mast = (su?.mast_is_default == false) ? (su?.mast_len_cm ?? 0) : 0
        shim = (su?.shim_is_default == false) ? (su?.shim_deg.map { shimSchluessel($0) } ?? "") : ""
        boardId = (su?.board?.is_default == false) ? (su?.board?.id ?? 0) : 0
        gewicht = (su?.weight_is_default == false) ? (su?.weight_kg.map { String($0) } ?? "") : ""
        start = momentaufnahme()
    }

    private func momentaufnahme() -> [String: String] {
        ["foil": String(foilId), "stab": String(stabId), "mast": String(mast), "shim": shim,
         "board": String(boardId), "gewicht": gewicht.trimmingCharacters(in: .whitespaces)]
    }

    private func zahlOderNull(_ v: Int) -> Any { v == 0 ? NSNull() : v }

    private func speichern() async {
        let jetzt: [String: String] = momentaufnahme()
        var body: [String: Any] = [:]
        if jetzt["foil"] != start["foil"] { body["foil_id"] = zahlOderNull(foilId) }
        if jetzt["stab"] != start["stab"] { body["stab_id"] = zahlOderNull(stabId) }
        if jetzt["mast"] != start["mast"] { body["mast_len_cm"] = zahlOderNull(mast) }
        if jetzt["shim"] != start["shim"] { body["shim_deg"] = Double(shim).map { $0 as Any } ?? NSNull() }
        if jetzt["board"] != start["board"] { body["board_id"] = zahlOderNull(boardId) }
        if jetzt["gewicht"] != start["gewicht"] {
            let roh: String = jetzt["gewicht"] ?? ""
            if roh.isEmpty {
                body["rider_weight_kg"] = NSNull()
            } else if let kg = Int(roh), (20...300).contains(kg) {
                body["rider_weight_kg"] = kg
            } else {
                fehler = "20–300 kg"
                return
            }
        }
        busy = true
        defer { busy = false }
        do {
            try await Api.setSessionMeta(session.id, body)
            await onGespeichert()
            dismiss()
        } catch {
            fehler = error.localizedDescription
        }
    }
}
