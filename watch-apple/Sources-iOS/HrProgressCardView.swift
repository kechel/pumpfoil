import SwiftUI

// Trainingskurve: je Marke (30 s, 1, 2, 5 min LAUF) eine Kurve über die Sessions.
//
// Aussage: fällt der Puls bei gleicher Belastung über die Wochen, ist der Fahrer fitter geworden.
// Deshalb steht die Zeile „aus N Läufen in M Sessions" mit dem Verlauf erst→letzt in NORMALER
// Schriftgröße und Lesefarbe — sie ist die eigentliche Aussage, nicht Beiwerk (so auch in der PWA,
// Jans Vorgabe vom 17.08.).
//
// Eigene Karte mit eigenem Ladezustand: die Kurve hängt an einer eigenen Abfrage und nicht am
// Zeitraum der übrigen Verlaufs-Diagramme. Sie zeichnet gar nichts, solange keine Daten da sind —
// eine leere Karte wäre nur Rauschen.
//
// Arithmetik bewusst explizit getypt und in kleine Schritte zerlegt: gemischte Literale in einem
// SwiftUI-Ausdruck sind für den Type-Checker teuer (s. memory ios-swift-typecheck-hang).
struct HrProgressCardView: View {
    let lang: String

    @State private var daten: HrProgress?
    @State private var geladen = false

    var body: some View {
        Group {
            if let m = marken, !m.isEmpty {
                karte(m)
            }
        }
        .task {
            if !geladen {
                daten = try? await Api.hrProgress()
                geladen = true
            }
        }
    }

    /// Je Marke: Punkte, Anzahl Läufe. Marken ohne mindestens zwei Werte fallen weg, statt ein
    /// leeres Diagramm zu zeigen.
    private var marken: [(mark: Int, pts: [VPt], laeufe: Int)]? {
        guard let d = daten, let alle = d.marks, let reihe = d.series else { return nil }
        var out: [(mark: Int, pts: [VPt], laeufe: Int)] = []
        for m in alle {
            var punkte: [VPt] = []
            var n = 0
            for p in reihe {
                n += p.laeufe[m] ?? 0
                guard let v = p.werte[m], v > 0, let iso = p.started_at,
                      let ts = HrProgressCardView.zeit(iso) else { continue }
                punkte.append(VPt(t: ts, v: v))
            }
            punkte.sort { $0.t < $1.t }
            if punkte.count >= 2 { out.append((mark: m, pts: punkte, laeufe: n)) }
        }
        return out
    }

    @ViewBuilder private func karte(_ m: [(mark: Int, pts: [VPt], laeufe: Int)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("hr.progressTitle", lang)).font(.headline)
            Text(Loc.t("hr.progressHint", lang)).font(.callout).foregroundStyle(.secondary)
            ForEach(m, id: \.mark) { eintrag in
                abschnitt(eintrag)
            }
            Text(Loc.t("hr.axisHint", lang)).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func abschnitt(_ e: (mark: Int, pts: [VPt], laeufe: Int)) -> some View {
        let erst: Double = e.pts.first?.v ?? 0
        let letzt: Double = e.pts.last?.v ?? 0
        let tiefster: Double = e.pts.map { $0.v }.min() ?? 0
        // y-Achse NICHT bei 0: der interessante Bereich liegt zwischen ~110 und ~175 bpm.
        let vmin: Double = max(0, tiefster - 8)
        let bereich: (Double, Double) = (e.pts.first?.t ?? 0, e.pts.last?.t ?? 1)
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(titel(e.mark)).font(.subheadline).fontWeight(.semibold)
                Spacer()
                Text("\(Int(letzt.rounded())) bpm").font(.subheadline).bold()
                    .foregroundStyle(Self.hrFarbe)
            }
            Text(untertitel(laeufe: e.laeufe, sessions: e.pts.count, erst: erst, letzt: letzt))
                .font(.callout)
            LineChartView(pts: e.pts, color: Self.hrFarbe, domain: bereich, lang: lang, vmin: vmin)
                .frame(height: 110)
        }
        .padding(.top, 6)
    }

    private func titel(_ mark: Int) -> String {
        if mark < 60 {
            return Loc.t("hr.afterSeconds", lang)
                .replacingOccurrences(of: "{sec}", with: "\(mark)")
        }
        return Loc.t("hr.afterMinutes", lang)
            .replacingOccurrences(of: "{min}", with: "\(mark / 60)")
    }

    private func untertitel(laeufe: Int, sessions: Int, erst: Double, letzt: Double) -> String {
        let basis: String = Loc.t("hr.fromRuns", lang)
            .replacingOccurrences(of: "{runs}", with: "\(laeufe)")
            .replacingOccurrences(of: "{sessions}", with: "\(sessions)")
        return "\(basis)  \(Int(erst.rounded())) → \(Int(letzt.rounded())) bpm"
    }

    /// Rose wie in der PWA (#f43f5e) — Puls hat dort durchgehend diese Farbe.
    private static let hrFarbe = Color(red: 0.957, green: 0.247, blue: 0.369)

    /// ISO-Zeitstempel -> Sekunden seit 1970. WICHTIG: die uebrigen Verlaufs-Diagramme rechnen
    /// ebenfalls in SEKUNDEN (DAY_S = 86400, VerlaufView), nicht in Millisekunden — sonst passt die
    /// Zeitachse nicht zum Rest.
    private static func zeit(_ iso: String) -> Double? {
        let mit = ISO8601DateFormatter()
        mit.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = mit.date(from: iso) { return d.timeIntervalSince1970 }
        let ohne = ISO8601DateFormatter()
        ohne.formatOptions = [.withInternetDateTime]
        if let d = ohne.date(from: iso) { return d.timeIntervalSince1970 }
        return nil
    }
}
