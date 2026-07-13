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
        // TODO (Jan/Xcode): echte DeclaredAgeRange-API verdrahten. Die konkreten Typnamen
        // (Service/Request/Response) müssen gegen die finale iOS-26-SDK-Doku gesetzt werden
        // (developer.apple.com/documentation/declaredagerange). Bis dahin nil zurückgeben →
        // social_allowed bleibt auf dem Backend-Default (erlaubt). Skizze der erwarteten Logik:
        //   let response = try await <AgeRangeService>.requestAgeRange(ageGates: 13)
        //   -> aus lower/upperBound: allowed = lower >= 13, bracket = "under13"/"13-15"/"16-17"/"18+"
        //   return (allowed, bracket)
        return nil
    }
    #endif
}
