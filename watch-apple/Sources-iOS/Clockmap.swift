import Foundation

/// Session-ms -> Uhrzeit. Gegenstueck zu `server/app/clockmap.py`, `web/src/lib/clock.ts` und
/// `Clockmap.kt`; die lange Begruendung steht im Python-Modul.
///
/// Kurz: die Sample-Zeitachse einer Aufnahme laeuft in AKTIVER Zeit — der Garmin-Recorder zieht
/// Pausen ab, damit GPS/Accel lueckenlos bleiben. Wer daraus eine Uhrzeit macht, muss die Pausen
/// dazurechnen, sonst liegt jeder Lauf nach der ersten Pause um die gesamte Pausendauer zu frueh
/// (Nutzermeldung 10.09.2026). Fuer LAEUFE liefert der Server das fertig als `t_start_clock_ms`.
enum Clockmap {

    /// Summe der Pausen (ms), die VOR `tSessionMs` begonnen haben.
    static func pauseVersatzMs(_ pausen: [[Int]]?, _ tSessionMs: Double) -> Double {
        guard let pausen, !pausen.isEmpty else { return 0 }
        var summe: Double = 0
        for p in pausen where p.count >= 2 {
            if Double(p[0]) <= tSessionMs { summe += Double(p[1]) }
        }
        return summe
    }

    /// Session-ms -> ms ab `started_at` in Wanduhr-Zeit.
    static func wanduhrMs(_ pausen: [[Int]]?, _ tSessionMs: Double) -> Double {
        return tSessionMs + pauseVersatzMs(pausen, tSessionMs)
    }

    /// Uhrzeit-Offset eines Laufs (ms ab `started_at`) oder nil. `t_start_clock_ms` vom Server
    /// bevorzugt; sonst selbst rechnen — und dabei NICHT `t_start_ms` nehmen, das ist auf den
    /// Trim re-based.
    static func laufUhrzeitMs(_ seg: Segment, _ trimStartMs: Int?, _ pausen: [[Int]]?) -> Double? {
        if let fertig = seg.t_start_clock_ms { return fertig }
        var sessionMs: Double? = seg.t_start_session_ms
        if sessionMs == nil, let roh = seg.t_start_ms {
            sessionMs = roh + Double(trimStartMs ?? 0)
        }
        guard let sessionMs else { return nil }
        return wanduhrMs(pausen, sessionMs)
    }
}
