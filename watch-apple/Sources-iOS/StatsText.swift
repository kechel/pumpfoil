import SwiftUI

// Community-Stats-Satz mit fett/cyan hervorgehobenen Zahlen (§-markiert, wie im Web).
// Genutzt vom Home-Willkommens-Banner und der Community-Stats-Leiste.
//
// MEILENSTEIN-PULS (Jan, 24.09.2026, „bau diese funktion direkt mal in ios und android nach"):
// erreicht eine Zahl ihre Stufe, atmet sie zehn Prozent lang. Die Regel steht in `Meilenstein`.
//
// WARUM EINE VIEW STATT EINER FUNKTION: der Satz entstand bisher als zusammengesetzter `Text`,
// und an einem solchen laesst sich ein einzelner Abschnitt nicht animieren — er ist eine
// Zeichenkette mit Attributen, keine Sammlung von Views. Ein `TimelineView(.animation)` baut ihn
// deshalb je Bild neu auf, mit einer Farbe, die aus der Uhrzeit kommt. Das kostet nur dann etwas,
// wenn ueberhaupt etwas pulst — sonst steht hier der statische Satz wie vorher.
//
// NUR HELLIGKEIT, keine Groesse: aus demselben Grund. Im Web ist der Groessenanteil ohnehin der
// kleinere (3,5 %), die Helligkeit macht den Effekt.
//
// Hell gegen dunkel wie im Web: auf dunklem Grund wird die Zahl HELLER, auf hellem SATTER.
// Aufhellen auf Weiss zoege sie Richtung Hintergrund, und der Hoehepunkt des Pulses waere genau
// der Moment, in dem sie am schlechtesten zu lesen ist.
struct CommunityStatsText: View {
    let stats: Api.CommunityStats
    let lang: String
    @Environment(\.colorScheme) private var schema

    private var pulsend: Set<String> {
        var s = Set<String>()
        if Meilenstein.imFenster(stats.pumps, Meilenstein.pumps) { s.insert(stats.pumps.formatted()) }
        if Meilenstein.imFenster(stats.foilers, Meilenstein.leute) { s.insert("\(stats.foilers)") }
        if Meilenstein.imFenster(stats.spots, Meilenstein.leute) { s.insert("\(stats.spots)") }
        return s
    }

    var body: some View {
        let hebt = pulsend
        if hebt.isEmpty {
            satz(takt: 0, hebt: hebt)
        } else {
            TimelineView(.animation) { zeit in
                // Ein voller Atemzug in 2,4 s — derselbe Takt wie im Web. `sin` ergibt die
                // weiche Kurve, die dort `ease-in-out` macht.
                let t = zeit.date.timeIntervalSinceReferenceDate
                let takt = (sin(t * 2 * .pi / 2.4) + 1) / 2
                satz(takt: takt, hebt: hebt)
            }
        }
    }

    private func satz(takt: Double, hebt: Set<String>) -> Text {
        let raw = Loc.t("banner.stats", lang)
            .replacingOccurrences(of: "{foilers}", with: "\(stats.foilers)")
            .replacingOccurrences(of: "{spots}", with: "\(stats.spots)")
            .replacingOccurrences(of: "{sessions}", with: "\(stats.sessions)")
            .replacingOccurrences(of: "{pumps}", with: stats.pumps.formatted())
        let ziel: Color = schema == .dark ? .white : .black
        let anteil = (schema == .dark ? 0.30 : 0.22) * takt
        var out = Text("")
        for (i, part) in raw.components(separatedBy: "§").enumerated() {
            if i % 2 == 1 {
                // Erkannt am WERT, nicht an der Position: die Wortstellung ist je Sprache anders.
                let farbe = hebt.contains(part)
                    ? Color.accentColor.mischen(mit: ziel, anteil: anteil) : Color.accentColor
                out = out + Text(part).bold().foregroundColor(farbe)
            } else {
                out = out + Text(part)
            }
        }
        return out
    }
}

private extension Color {
    /// Linear zwischen zwei Farben mischen. `UIColor` liefert die Komponenten; scheitert das
    /// (dynamische Farbe ohne aufgeloesten Kontext), bleibt die Ausgangsfarbe — dann pulst es
    /// eben nicht, statt dass etwas Falsches erscheint.
    func mischen(mit ziel: Color, anteil: Double) -> Color {
        let a = UIColor(self), b = UIColor(ziel)
        var ar: CGFloat = 0, ag: CGFloat = 0, ab: CGFloat = 0, aa: CGFloat = 0
        var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
        guard a.getRed(&ar, green: &ag, blue: &ab, alpha: &aa),
              b.getRed(&br, green: &bg, blue: &bb, alpha: &ba) else { return self }
        let f = CGFloat(max(0, min(1, anteil)))
        return Color(red: Double(ar + (br - ar) * f),
                     green: Double(ag + (bg - ag) * f),
                     blue: Double(ab + (bb - ab) * f))
    }
}
