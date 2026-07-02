import SwiftUI

// Garmin-Uhr verbinden — beide Wege (spiegelt web ClaimFromWatch + GenerateCode):
//  - Reverse: der auf der Uhr angezeigte Code wird hier eingegeben (pair-claim).
//  - Forward: hier einen Code erzeugen und in der Garmin-Connect-App unter Pumpfoil eintragen.
struct GarminPairView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var code = ""
    @State private var claimBusy = false
    @State private var claimMsg: String?
    @State private var genBusy = false
    @State private var genCode: String?
    @State private var genMsg: String?

    var body: some View {
        Form {
            // Reverse: Code von der Uhr eingeben.
            Section {
                TextField(Loc.t("garmin.codePlaceholder", lang), text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(.body, design: .monospaced))
                Button {
                    Task {
                        claimBusy = true; claimMsg = nil
                        do { try await Api.pairClaim(code: code); claimMsg = Loc.t("garmin.claimOk", lang); code = "" }
                        catch { claimMsg = error.localizedDescription }
                        claimBusy = false
                    }
                } label: {
                    Text(claimBusy ? "…" : Loc.t("garmin.claimBtn", lang))
                }
                .disabled(claimBusy || code.trimmingCharacters(in: .whitespaces).count < 4)
                if let m = claimMsg { Text(m).font(.footnote).foregroundStyle(.secondary) }
            } header: {
                Text(Loc.t("garmin.claimTitle", lang))
            } footer: {
                Text(Loc.t("garmin.claimHelp", lang))
            }

            // Forward: Code erzeugen -> in Garmin-Connect-App eintragen.
            Section {
                Button {
                    Task {
                        genBusy = true; genMsg = nil
                        do { genCode = try await Api.generatePairingCode().code }
                        catch { genMsg = error.localizedDescription }
                        genBusy = false
                    }
                } label: {
                    Text(genBusy ? "…" : Loc.t("garmin.genBtn", lang))
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
        .navigationTitle(Loc.t("garmin.title", lang))
        .navigationBarTitleDisplayMode(.inline)
    }
}
