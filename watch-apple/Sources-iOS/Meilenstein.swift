import Foundation

/// Wann eine Zahl in der Community-Leiste pulsiert — dieselbe Regel wie im Web
/// (`web/src/lib/pumpPulse.ts`) und auf Android (`Meilenstein.kt`).
///
/// Jan, 23.09.2026: die Pump-Zahl soll pulsieren, sobald die Million steht; am 24.09. erweitert
/// auf Foiler und Spots, dort ab 1.000. Die Abschalt-Regel ist seine: „puls bei 1000-1100 fuer
/// nutzer und spots, und 1000000-1100000 bei pumps" — ein Fenster von zehn Prozent ueber der
/// Stufe. Kein Merker, kein Zeitrechnen: die Regel steht in der Zahl selbst, jeder sieht
/// denselben Zustand, und sie erlischt, wenn die Gemeinschaft zehn Prozent weiter gewachsen ist.
///
/// JEDE STUFE ZAEHLT: die zweite Million pulst wieder, von 2.000.000 bis 2.200.000.
///
/// WENN SICH DIE REGEL AENDERT, aendert sie sich an DREI Stellen — Web, Android und hier. Eine
/// gemeinsame Quelle gibt es fuer diese drei Zeilen nicht; dafuer steht in jeder derselbe
/// Kommentar, damit die anderen beiden beim Suchen gefunden werden.
enum Meilenstein {
    static let pumps = 1_000_000
    static let leute = 1_000          // Foiler und Spots
    private static let fenster = 0.1

    /// Liegt der Wert im Feier-Fenster ueber einer erreichten Stufe?
    static func imFenster(_ wert: Int, _ stufe: Int) -> Bool {
        guard wert >= stufe else { return false }
        let erreicht = (wert / stufe) * stufe
        return Double(wert) < Double(erreicht) * (1 + fenster)
    }
}
