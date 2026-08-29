import SwiftUI

// Garmin-Uhr verbinden — beide Wege (spiegelt web ClaimFromWatch + GenerateCode):
//  - Reverse: der auf der Uhr angezeigte Code wird hier eingegeben (pair-claim).
//  - Forward: hier einen Code erzeugen und in der Garmin-Connect-App unter Pumpfoil eintragen.
/// Store-Seite der Uhr-App — dieselbe URL wie im Web (ConnectIqButton.tsx) und in der
/// Android-App (GarminPairScreen.kt).
private let CONNECT_IQ_URL = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351"

struct GarminPairView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var code = ""
    @State private var claimBusy = false
    @State private var claimMsg: String?
    @State private var genBusy = false
    @State private var genCode: String?
    @State private var genMsg: String?

    // Ein Abschnitt = eine eigene, explizit typisierte Property, die Netz-Aufrufe stecken in
    // Methoden statt in Button-Closures: Swifts Type-Checker loest einen ViewBuilder als EINEN
    // Ausdruck auf, und dieser Body war ~51 Zeilen mit zwei Task-Closures und zwei Ternaries
    // darin. Reihenfolge, Texte und Verhalten sind unveraendert.
    var body: some View {
        Form {
            installSection
            claimSection
            genSection
        }
        .brandToolbar(Loc.t("garmin.title", lang))
        .navigationBarTitleDisplayMode(.inline)
    }

    // SCHRITT 0 — der hier fehlte. Beide Abschnitte darunter setzen voraus, dass die App schon
    // auf der Uhr liegt („Pumpfoil auf der Uhr oeffnen"). Wie sie dorthin kommt, stand nirgends:
    // bei Garmin kommt sie NICHT aus dem App Store, sondern aus dem Connect IQ Store ueber die
    // Garmin-Connect-App. Ein Nutzer ist genau daran haengengeblieben (27.08., franzoesisch, aus
    // der Android-App heraus — dort ist es jetzt behoben; auf iOS fehlte es genauso).
    private var installSection: some View {
        Section {
            Link(Loc.t("garmin.installBtn", lang), destination: URL(string: CONNECT_IQ_URL)!)
        } header: {
            Text(Loc.t("garmin.installTitle", lang))
        } footer: {
            Text(Loc.t("garmin.installHelp", lang))
        }
    }

    // Reverse: Code von der Uhr eingeben.
    private var claimSection: some View {
        Section {
            TextField(Loc.t("garmin.codePlaceholder", lang), text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.system(.body, design: .monospaced))
            Button { claim() } label: {
                Text(claimButtonText)
            }
            .disabled(claimDisabled)
            if let m = claimMsg { Text(m).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            Text(Loc.t("garmin.claimTitle", lang))
        } footer: {
            Text(Loc.t("garmin.claimHelp", lang))
        }
    }

    // Forward: Code erzeugen -> in Garmin-Connect-App eintragen.
    private var genSection: some View {
        Section {
            Button { generate() } label: {
                Text(genButtonText)
            }
            .disabled(genBusy)
            if let c = genCode {
                Text(c).font(.system(.title, design: .monospaced)).bold().foregroundStyle(.tint)
            }
            if let m = genMsg { Text(m).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            Text(Loc.t("garmin.genTitle", lang))
        } footer: {
            Text(Loc.t("garmin.genHelp", lang))
        }
    }

    // Ternaries und die Trim-Bedingung vorab typisiert — im ViewBuilder kosten sie am meisten.
    private var claimButtonText: String { claimBusy ? "…" : Loc.t("garmin.claimBtn", lang) }
    private var genButtonText: String { genBusy ? "…" : Loc.t("garmin.genBtn", lang) }
    private var claimDisabled: Bool {
        claimBusy || code.trimmingCharacters(in: .whitespaces).count < 4
    }

    // MARK: - Aktionen

    private func claim() {
        Task {
            claimBusy = true; claimMsg = nil
            do { try await Api.pairClaim(code: code); claimMsg = Loc.t("garmin.claimOk", lang); code = "" }
            catch { claimMsg = error.localizedDescription }
            claimBusy = false
        }
    }

    private func generate() {
        Task {
            genBusy = true; genMsg = nil
            do { genCode = try await Api.generatePairingCode().code }
            catch { genMsg = error.localizedDescription }
            genBusy = false
        }
    }
}
