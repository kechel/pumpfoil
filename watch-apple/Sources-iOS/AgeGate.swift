import SwiftUI
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

// Apple-Vorgabe „soziale Medien": vor Freigabe von UGC/Feed/Chat die Altersspanne prüfen
// (ohne Geburtsdatum) via Declared Age Range API (iOS 26+). Ergebnis ans Backend melden
// (social_allowed + age_bracket) — der Server sperrt Feed/Community/Chat plattformweit, wenn
// social_allowed=false; iOS blendet die Tabs zusätzlich aus (RootView.socialOK).
//
// ===== XCODE-SEITIG ZU ERLEDIGEN (Jan) =====================================================
//  1. Capability/Entitlement `com.apple.developer.declared-age-range` zum iOS-Target hinzufügen
//     (Signing & Capabilities). Ohne das schlägt requestAgeRange fehl -> wir fangen es ab
//     (ändert nichts, Social bleibt an).
//  2. Gegen das iOS-26-SDK bauen. Auf iOS < 26 ist der Block per #available inaktiv -> Social
//     bleibt an (kleine Minderheit).
//  3. EXAKTE TYPNAMEN gegen die SDK-Doku prüfen (developer.apple.com/documentation/declaredagerange):
//     Environment-Action `\.requestAgeRange`, Aufruf `requestAgeRange(ageGates: 13)`, Response-Fälle
//     (`.sharing(let range)` / `.declinedSharing`) + Range-Properties (`lowerBound`/`upperBound`).
//     Falls Namen abweichen: unten anpassen; die Logik (lower >= 13 -> erlaubt) bleibt gleich.
// ===========================================================================================

extension View {
    // In RootView auf den eingeloggten Inhalt anwenden. No-op auf iOS < 26 / ohne Framework.
    @ViewBuilder func ageGate(session: SessionStore) -> some View {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) {
            modifier(AgeGateModifier(session: session))
        } else {
            self
        }
        #else
        self
        #endif
    }
}

#if canImport(DeclaredAgeRange)
@available(iOS 26.0, *)
private struct AgeGateModifier: ViewModifier {
    let session: SessionStore
    @Environment(\.requestAgeRange) private var requestAgeRange
    @State private var checked = false

    func body(content: Content) -> some View {
        content.task(id: session.isLoggedIn) {
            guard session.isLoggedIn, !checked else { return }
            checked = true
            do {
                // Gate 13: „unter/über 13" (ohne Geburtsdatum).
                let response = try await requestAgeRange(ageGates: 13)
                switch response {
                case .sharing(let range):
                    let lower = range.lowerBound ?? 0     // nil = unbekannt
                    let allowed = lower >= 13
                    let bracket = lower >= 18 ? "18+" : (lower >= 16 ? "16-17" : (lower >= 13 ? "13-15" : "under13"))
                    if let p = try? await Api.setAgeRange(socialAllowed: allowed, ageBracket: bracket) {
                        await MainActor.run { session.profile = p }
                    }
                default:
                    break   // .declinedSharing o. ä. -> nichts ändern (Backend-Default bleibt)
                }
            } catch {
                // Kein Entitlement / Abbruch / Fehler -> nichts ändern.
            }
        }
    }
}
#endif
