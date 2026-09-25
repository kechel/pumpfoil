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
    /// Von der Verlaufsansicht GELADEN und hereingegeben — nicht selbst geholt. Eine Karte, die
    /// ohne Daten nichts zeichnet, wird in einem LazyVStack womoeglich nie angelegt; ein `.task`
    /// an ihr feuerte dann nie und sie bliebe fuer immer leer (genau das war der Fehler, Jan 18.08.).
    let daten: HrProgress?
    /// Absoluter Puls oder ANSTIEG gegenueber dem Puls zu Beginn desselben Laufs. Gleiche
    /// Umschaltung wie in PWA und Android-App; der Server liefert den Anstieg als `d<marke>` mit.
    @State private var anstieg = false

    var body: some View {
        // Auch mit leerer Liste zeichnen, sobald ueberhaupt Daten da sind: sonst verschwaende
        // die Karte beim Umschalten und man kaeme nicht zurueck.
        if daten?.series?.isEmpty == false {
            karte(marken ?? [])
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
                // „> 0" gilt NUR fuer den absoluten Puls, wo 0 kein Messwert ist. Ein Anstieg
                // von 0 oder darunter ist ein echter Wert (Puls blieb gleich oder fiel).
                let roh: Double? = anstieg ? p.anstieg[m] : p.werte[m]
                guard let v = roh, anstieg || v > 0, let iso = p.started_at,
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
            Picker("", selection: $anstieg) {
                Text(Loc.t("hr.viewPeak", lang)).tag(false)
                Text(Loc.t("hr.viewRise", lang)).tag(true)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            if anstieg {
                Text(Loc.t("hr.viewRiseHint", lang)).font(.callout).foregroundStyle(.secondary)
            }
            if m.isEmpty {
                // Kein Lauf mit Start-Puls -> in dieser Ansicht gibt es nichts zu zeigen.
                Text(Loc.t("hr.pickNone", lang)).font(.callout).foregroundStyle(.secondary)
            }
            ForEach(m, id: \.mark) { eintrag in
                abschnitt(eintrag)
            }
            EigenerZeitpunktView(daten: daten, anstieg: anstieg, lang: lang)
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
        // Im Anstiegs-Modus darf sie unter 0 gehen — ein gefallener Puls ist ein Ergebnis.
        let vmin: Double = anstieg ? tiefster - 4 : max(0, tiefster - 8)
        let bereich: (Double, Double) = (e.pts.first?.t ?? 0, e.pts.last?.t ?? 1)
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(titel(e.mark)).font(.subheadline).fontWeight(.semibold)
                Spacer()
                Text(HrProgressCardView.bpm(letzt, anstieg)).font(.subheadline).bold()
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
        return "\(basis)  \(HrProgressCardView.bpm(erst, anstieg)) → \(HrProgressCardView.bpm(letzt, anstieg))"
    }

    /// Pulswert beschriften. Im Anstiegs-Modus MIT Vorzeichen: „+18 bpm" liest sich als Zunahme,
    /// „18 bpm" waere von einem absoluten Wert nicht zu unterscheiden.
    static func bpm(_ v: Double, _ anstieg: Bool) -> String {
        let n: Int = Int(v.rounded())
        return (anstieg && n > 0) ? "+\(n) bpm" : "\(n) bpm"
    }

    /// Rose wie in der PWA (#f43f5e) — Puls hat dort durchgehend diese Farbe.
    static let hrFarbe = Color(red: 0.957, green: 0.247, blue: 0.369)

    /// ISO-Zeitstempel -> Sekunden seit 1970. WICHTIG: die uebrigen Verlaufs-Diagramme rechnen
    /// ebenfalls in SEKUNDEN (DAY_S = 86400, VerlaufView), nicht in Millisekunden — sonst passt die
    /// Zeitachse nicht zum Rest.
    static func zeit(_ iso: String) -> Double? {
        let mit = ISO8601DateFormatter()
        mit.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = mit.date(from: iso) { return d.timeIntervalSince1970 }
        let ohne = ISO8601DateFormatter()
        ohne.formatOptions = [.withInternetDateTime]
        if let d = ohne.date(from: iso) { return d.timeIntervalSince1970 }
        return nil
    }
}


/// Frei waehlbarer Zeitpunkt (Jan, 05.09.2026: „mich wuerde z. B. nach 45 Sekunden interessieren"),
/// wie die PWA (HrProgress.tsx EigenerZeitpunkt). Der Regler laeuft OHNE Nachladen, der Server
/// schickt das ganze Raster je Session. Die Wahl bleibt gemerkt (@AppStorage). Wie viele Sessions
/// einen Wert haben, steht dabei — je weiter rechts, desto weniger Laeufe waren so lang.
struct EigenerZeitpunktView: View {
    let daten: HrProgress?
    let anstieg: Bool
    let lang: String
    @AppStorage("hrMark") private var sek: Int = 45

    private var raster: [Int] { daten?.grid ?? [] }
    private var index: Int { raster.firstIndex(of: sek) ?? min(raster.count - 1, max(0, raster.count / 6)) }

    var body: some View {
        if raster.count >= 2 {
            inhalt
        }
    }

    private var punkte: [VPt] {
        let i: Int = index
        var out: [VPt] = []
        for p in daten?.series ?? [] {
            let liste: [Double?] = anstieg ? p.rasterAnstieg : p.raster
            guard i < liste.count, let v = liste[i], anstieg || v > 0,
                  let iso = p.started_at, let ts = HrProgressCardView.zeit(iso) else { continue }
            out.append(VPt(t: ts, v: v))
        }
        return out.sorted { $0.t < $1.t }
    }

    private var regler: Binding<Double> {
        Binding(get: { Double(index) }, set: { f in
            let i: Int = max(0, min(raster.count - 1, Int(f.rounded())))
            sek = raster[i]
        })
    }

    @ViewBuilder private var inhalt: some View {
        let pts: [VPt] = punkte
        let gesamt: Int = daten?.series?.count ?? 0
        Divider().padding(.vertical, 6)
        Text(Loc.t("hr.pickTitle", lang)).font(.subheadline.weight(.semibold))
        Text(Loc.t("hr.pickHint", lang)).font(.callout).foregroundStyle(.secondary)
        HStack {
            Slider(value: regler, in: 0...Double(raster.count - 1), step: 1).tint(HrProgressCardView.hrFarbe)
            Text("\(raster[index]) s").font(.subheadline.weight(.bold)).monospacedDigit()
        }
        Text(Loc.t("hr.pickCount", lang).replacingOccurrences(of: "{n}", with: "\(pts.count)")
                .replacingOccurrences(of: "{total}", with: "\(gesamt)")).font(.callout)
        if pts.count < 2 {
            Text(Loc.t("hr.pickNone", lang)).font(.callout).foregroundStyle(.secondary)
        } else {
            diagramm(pts)
        }
    }

    private func diagramm(_ pts: [VPt]) -> some View {
        let tiefster: Double = pts.map { $0.v }.min() ?? 0
        let vmin: Double = anstieg ? tiefster - 4 : max(0, tiefster - 8)
        let bereich: (Double, Double) = (pts.first?.t ?? 0, pts.last?.t ?? 1)
        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(Loc.t("hr.afterSecondsExact", lang).replacingOccurrences(of: "{sec}", with: "\(raster[index])"))
                    .font(.subheadline).fontWeight(.semibold)
                Spacer()
                Text(HrProgressCardView.bpm(pts.last?.v ?? 0, anstieg)).font(.subheadline).bold()
                    .foregroundStyle(HrProgressCardView.hrFarbe)
            }
            LineChartView(pts: pts, color: HrProgressCardView.hrFarbe, domain: bereich, lang: lang, vmin: vmin)
                .frame(height: 110)
        }
    }
}
