import SwiftUI

// Apple-Vorgabe „soziale Medien": vor Freigabe von UGC/Feed/Chat die Altersspanne prüfen
// (ohne Geburtsdatum) via Declared Age Range API (iOS 26+). Ergebnis ans Backend melden
// (social_allowed), das die Social-Features plattformweit sperrt.
//
// XCODE-SEITIG (Jan):
//   1. Capability/Entitlement `com.apple.developer.declared-age-range` zum iOS-Target hinzufügen.
//   2. Die API gibt es erst ab iOS 26 (#available unten). Für ältere iOS bleibt social_allowed
//      unangetastet (Default true) — ggf. später einen manuellen Alters-Fallback ergänzen.
//   3. Die exakten Typnamen der Antwort unten gegen die aktuelle SDK-Doku prüfen
//      (developer.apple.com/documentation/declaredagerange) — Struktur ist best-effort.

enum AgeGate {
    // Fragt die Altersspanne (Gate 13) ab und meldet das Ergebnis ans Backend. Einmal je
    // Login/Start aufrufen. Fehler/Ablehnung -> nichts ändern (Backend-Default bleibt).
    @MainActor
    static func checkAndReport(session: SessionStore) async {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) {
            guard let (allowed, bracket) = await resolve() else { return }
            if let p = try? await Api.setAgeRange(socialAllowed: allowed, ageBracket: bracket) {
                session.profile = p
            }
        }
        #endif
    }

    #if canImport(DeclaredAgeRange)
    @available(iOS 26.0, *)
    private static func resolve() async -> (Bool, String)? {
        // VERIFY: Aufruf + Response-Shape gegen die aktuelle DeclaredAgeRange-API abgleichen.
        // Erwartet: Anfrage mit Gate 13; Antwort liefert die deklarierte Spanne (lower/upper).
        let service = AgeRangeService.shared
        do {
            let response = try await service.requestAgeRange(ageGates: 13)
            switch response {
            case .sharing(let range):
                // range.lowerBound / range.upperBound sind Int? — >=13 => Social erlaubt.
                let lower = range.lowerBound ?? 0
                let allowed = lower >= 13
                let bracket: String
                if let ub = range.upperBound, ub < 13 { bracket = "under13" }
                else if lower >= 18 { bracket = "18+" }
                else if lower >= 16 { bracket = "16-17" }
                else if lower >= 13 { bracket = "13-15" }
                else { bracket = "under13" }
                return (allowed, bracket)
            case .declinedSharing:
                // Keine Angabe -> API erfüllt (wir haben gefragt); Backend-Default (erlaubt) lassen.
                return nil
            @unknown default:
                return nil
            }
        } catch {
            return nil
        }
    }
    #endif
}
