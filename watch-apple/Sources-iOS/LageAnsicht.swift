import SwiftUI

// LAGE DES BRETTS — Handy am Brett montiert, portiert aus der PWA am 25.09.2026 (SessionDetail.tsx,
// BoardAttitude.tsx, PersonalHome.tsx); dieselbe Aufteilung wie Android (LageAnsicht.kt).
//
// Alles haengt an `placement == "board"`: ohne feste Montage misst das Handy den FAHRER und nicht
// das Brett (Kopf von server/app/analysis/lage.py).
//
// Die Bodies sind bewusst klein und explizit typisiert (s. Memory ios-swift-typecheck-hang).

// MARK: - Frage und Schalter

/// „Sass das Handy am Brett?" — nur, wenn die Erkennung anschlaegt; bleibt dann stehen (Jan,
/// 24.09.2026). Ein Tipp setzt `placement`, danach liefert der Server `verdacht: false`.
struct BrettFrageView: View {
    let session: SessionDetail
    let lang: String
    let nachher: () async -> Void
    @State private var frage = false

    var body: some View {
        Group {
            if frage {
                HStack(spacing: 10) {
                    Text(Loc.t("sd.boardAsk", lang)).font(.subheadline.weight(.semibold))
                    Spacer(minLength: 4)
                    Button(Loc.t("sd.boardAskYes", lang)) { markieren() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(12)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            } else {
                // Ohne sichtbaren Inhalt liefe `.task` nie (Memory swiftui-leere-group-laedt-nicht).
                Color.clear.frame(height: 0)
            }
        }
        .task(id: aufgabenSchluessel) { await pruefen() }
    }

    private var aufgabenSchluessel: String { "\(session.id)-\(session.placement ?? "")" }

    private func pruefen() async {
        frage = false
        // Nur mit Kreiseldaten fragen — ohne sie kann die Antwort nur „nein" lauten.
        guard session.owned == true, session.has_gyro == true, session.placement != "board" else { return }
        frage = (try? await Api.boardHint(session.id)) ?? false
    }

    private func markieren() {
        Task {
            try? await Api.setPlacement(session.id, "board")
            frage = false
            await nachher()
        }
    }
}

/// „Handy war am Brett" — nur bei Aufnahmen mit Kreisel; eine markierte behaelt den Schalter.
/// Abschalten setzt bei Handy-Aufnahmen "phone", sonst leer (PWA, Fehler an #8546).
struct BrettSchalterView: View {
    let session: SessionDetail
    let lang: String
    let nachher: () async -> Void
    @State private var busy = false

    var body: some View {
        if session.owned == true, session.has_gyro == true || session.placement == "board" {
            Toggle(Loc.t("board.markBoard", lang), isOn: binding).disabled(busy)
        }
    }

    private var binding: Binding<Bool> {
        Binding(get: { session.placement == "board" }, set: { an in setzen(an) })
    }

    private func setzen(_ an: Bool) {
        let wert: String = an ? "board" : ((session.has_gyro == true) ? "phone" : "")
        busy = true
        Task {
            try? await Api.setPlacement(session.id, wert)
            await nachher()
            busy = false
        }
    }
}

// MARK: - Lage je Lauf

/// Lage je Lauf in den Session-Details: je Lauf eine Zeile pro Phase, Umschalter korrigiert |
/// unkorrigiert, Legende (13.10.2026, wie PWA SessionDetail + TechnikTabelle.tsx). EIN Abruf aus dem
/// Speicher (`nurLaeufe`). Geerbte Montage grau.
struct LageJeLaufTabelle: View {
    let session: SessionDetail
    let lang: String
    @Binding var ausgewaehlt: Int?
    @State private var laeufe: [LageLauf] = []
    @State private var korr = true

    var body: some View {
        Group {
            if session.placement == "board", !laeufe.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(Loc.t("sd.attitudePerRun", lang).uppercased())
                            .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Spacer()
                        KorrekturUmschalter(korr: $korr, lang: lang)
                    }
                    LagePhasenTabelle(vorneSpalten: vorne, zeilen: zeilen, korr: korr, lang: lang,
                                      hintenSpalten: hinten)
                    LaufLegende(lang: lang)
                }
                .padding(12)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .task(id: "\(session.id)-\(session.placement ?? "")") { await laden() }
    }

    private var vorne: [LageSpalte] {
        [LageSpalte(kopf: "#", breite: 30), LageSpalte(kopf: Loc.t("sd.colDuration", lang), breite: 56)]
    }

    private var hinten: [LageSpalte] {
        let m: String = Loc.t("board.mounting", lang).trimmingCharacters(in: CharacterSet(charactersIn: ": ："))
        return [LageSpalte(kopf: m, breite: 80)]
    }

    private func dauer(_ lauf: Int) -> String {
        guard let segs = session.analysis?.segments, lauf < segs.count, let d = segs[lauf].duration_s else { return "–" }
        return fmtLaufDauer(d)
    }

    private var zeilen: [LageTabZeile] {
        laeufe.map { (k: LageLauf) -> LageTabZeile in
            let rot: String = k.rot_deg.map { "\(Int($0.rounded()))°" } ?? "–"
            let farbe: Color = k.rot_eigen == true ? .primary : .secondary
            let vorneZellen: [AnyView] = [
                AnyView(Text("\(k.lauf + 1)").font(.caption)),
                AnyView(Text(dauer(k.lauf)).font(.caption.weight(.semibold))),
            ]
            let hintenZellen: [AnyView] = [AnyView(Text(rot).font(.caption).foregroundStyle(farbe))]
            return LageTabZeile(id: "\(k.lauf)", k: k, geladen: true, vorne: vorneZellen, hinten: hintenZellen,
                                markiert: ausgewaehlt == k.lauf,
                                onTap: { ausgewaehlt = (ausgewaehlt == k.lauf) ? nil : k.lauf })
        }
    }

    private func laden() async {
        guard session.placement == "board" else { laeufe = []; return }
        let d = try? await Api.boardAttitude(session.id, nurLaeufe: true)
        laeufe = (d?.ok == true) ? (d?.laeufe ?? []).filter { $0.ok } : []
    }
}

// MARK: - Lage je Lauf mit Phasen (gemeinsam fuer Session und Vergleich)

/// Eine Phasenzeile eines Laufs; `haupt` = die Hauptzahl (cyan, fett), wie in der PWA.
struct PhaseZeile {
    let phase: String
    let werte: Technik?
    let haupt: Bool
}

/// Wie `phasenDesLaufs` in TechnikTabelle.tsx.
func phasenDesLaufs(_ k: LageLauf, korr: Bool, lang: String) -> [PhaseZeile] {
    guard let x = k.technik else {
        // Ohne Technik (zu kurz/alt) wenigstens das Gieren des ganzen Laufs.
        return [PhaseZeile(phase: Loc.t("tech.sWhole", lang), werte: Technik(gier_deg_s: k.gier_rms_deg_s), haupt: false)]
    }
    func f(_ p: TechnikPaar?) -> Technik? { korr ? p?.mit : p?.ohne }
    if x.teil == "ganz" { return [PhaseZeile(phase: Loc.t("tech.sWhole", lang), werte: f(x), haupt: true)] }
    let kg: KurveGerade? = korr ? x.kurve_gerade : x.kurve_gerade_ohne
    var r: [PhaseZeile] = [PhaseZeile(phase: Loc.t("tech.sStable", lang), werte: f(x), haupt: true)]
    if let kg {
        r.append(PhaseZeile(phase: Loc.t("tech.sTurn", lang), werte: kg.kurve?.alsTechnik, haupt: false))
        r.append(PhaseZeile(phase: Loc.t("tech.sStraight", lang), werte: kg.gerade?.alsTechnik, haupt: false))
    }
    if let g = x.ganz { r.append(PhaseZeile(phase: Loc.t("tech.sWhole", lang), werte: f(g), haupt: false)) }
    return r
}

/// Sortierwert = die Zahl oben in der Zelle (Mittelteil, bei kurzen Laeufen der ganze Lauf).
/// Schluessel wie in der PWA: pitch, roll, yaw, pitchHz, hub.
func lageSortWert(_ k: LageLauf?, _ key: String) -> Double? {
    guard let k, k.ok else { return nil }
    let mit: Technik? = k.technik?.teil != "ganz" ? k.technik?.mit : nil
    switch key {
    case "pitch": return mit?.pump_nicken_deg ?? k.pitch_amplitude_deg
    case "roll": return mit?.pump_rollen_deg ?? k.roll_amplitude_deg
    case "yaw": return k.gier_rms_deg_s
    case "pitchHz": return mit?.takt_hz ?? k.pitch_hz
    case "hub": return mit?.hub_cm ?? k.hub_pp_cm
    default: return nil
    }
}

/// Kopf einer Spalte vor oder hinter den Phasen; `key` != nil = sortierbar.
struct LageSpalte {
    let kopf: String
    let breite: CGFloat
    var key: String? = nil
}

/// Eine Zeile = ein Lauf. `k == nil` = (noch) keine Lage-Zahlen -> „…" bzw. „–".
struct LageTabZeile: Identifiable {
    let id: String
    let k: LageLauf?
    let geladen: Bool
    let vorne: [AnyView]
    var hinten: [AnyView] = []
    var markiert: Bool = false
    var onTap: (() -> Void)? = nil
}

/// Umschalter korrigiert | unkorrigiert (wie PWA KorrekturUmschalter).
struct KorrekturUmschalter: View {
    @Binding var korr: Bool
    let lang: String

    var body: some View {
        Picker("", selection: $korr) {
            Text(Loc.t("tech.colWith", lang)).tag(true)
            Text(Loc.t("tech.colWithout", lang)).tag(false)
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }
}

/// Legende unter der Tabelle (wie PWA LaufLegende).
struct LaufLegende: View {
    let lang: String

    private var zeilen: [(String, String)] {
        let pump: String = [Loc.t("board.pitch", lang), Loc.t("board.roll", lang), Loc.t("sd.colPitchRhythm", lang),
                            Loc.t("sd.colHeave", lang)].joined(separator: ", ")
        let kg: String = Loc.t("tech.sTurn", lang) + " · " + Loc.t("tech.sStraight", lang)
        return [
            (pump, Loc.t("tech.gPump", lang)),
            (Loc.t("tech.wobble", lang), Loc.t("tech.gWobble", lang)),
            (Loc.t("tech.colLean", lang), Loc.t("tech.gLean", lang)),
            (Loc.t("board.yaw", lang), Loc.t("tech.gYaw", lang)),
            (Loc.t("tech.sStable", lang), Loc.t("tech.gStable", lang)),
            (kg, Loc.t("tech.gTurnStraight", lang)),
            (Loc.t("tech.sWhole", lang), Loc.t("tech.gWhole", lang)),
        ]
    }

    private func zeile(_ k: String, _ v: String) -> Text {
        Text(k + ": ").fontWeight(.semibold) + Text(v)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(Loc.t("tech.gColumns", lang))
            ForEach(zeilen.indices, id: \.self) { i in zeile(zeilen[i].0, zeilen[i].1) }
            Text(Loc.t("tech.lCorrection", lang))
            Text(Loc.t("tech.gSpread", lang))
            Text(Loc.t("tech.gHeave", lang))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.top, 6)
    }
}

/// Die Tabelle: Kopf mit sortierbaren Spaltentiteln (▼/▲ an der aktiven Spalte, wie PWA), je Lauf die
/// Zellen `vorne` einmal links neben allen Phasenzeilen. `onSort == nil` = nicht sortierbar.
struct LagePhasenTabelle: View {
    let vorneSpalten: [LageSpalte]
    let zeilen: [LageTabZeile]
    let korr: Bool
    let lang: String
    var hintenSpalten: [LageSpalte] = []
    var sortKey: String? = nil
    var sortAuf: Bool = false
    var onSort: ((String) -> Void)? = nil

    private let phaseBreite: CGFloat = 96

    private var werteSpalten: [LageSpalte] {
        [LageSpalte(kopf: Loc.t("board.pitch", lang), breite: 62, key: "pitch"),
         LageSpalte(kopf: Loc.t("board.roll", lang), breite: 62, key: "roll"),
         LageSpalte(kopf: Loc.t("tech.wobble", lang), breite: 64),
         LageSpalte(kopf: Loc.t("tech.colLean", lang), breite: 56),
         LageSpalte(kopf: Loc.t("sd.colPitchRhythm", lang), breite: 84, key: "pitchHz"),
         LageSpalte(kopf: Loc.t("sd.colHeave", lang), breite: 60, key: "hub"),
         LageSpalte(kopf: Loc.t("board.yaw", lang), breite: 64, key: "yaw")]
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                kopfZeile
                Divider()
                ForEach(zeilen) { z in
                    laufZeile(z)
                    Divider()
                }
            }
        }
    }

    private func kopfText(_ sp: LageSpalte, rechts: Bool) -> some View {
        let aktiv: Bool = sp.key != nil && sp.key == sortKey
        let text: String = aktiv ? sp.kopf + (sortAuf ? " ▲" : " ▼") : sp.kopf
        return Text(text).font(.caption2).lineLimit(2)
            .foregroundStyle(aktiv ? Color.primary : Color.secondary)
            .frame(width: sp.breite, alignment: rechts ? .trailing : .leading)
            .contentShape(Rectangle())
            .onTapGesture { if let k = sp.key, let onSort { onSort(k) } }
    }

    private var kopfZeile: some View {
        HStack(alignment: .bottom, spacing: 6) {
            ForEach(vorneSpalten.indices, id: \.self) { i in kopfText(vorneSpalten[i], rechts: false) }
            kopfText(LageSpalte(kopf: Loc.t("tech.colPhase", lang), breite: phaseBreite), rechts: false)
            ForEach(werteSpalten.indices, id: \.self) { i in kopfText(werteSpalten[i], rechts: true) }
            ForEach(hintenSpalten.indices, id: \.self) { i in kopfText(hintenSpalten[i], rechts: false) }
        }
        .padding(.vertical, 4)
    }

    private func werte(_ t: Technik?) -> [String?] {
        [t?.pump_nicken_deg.map { String(format: "±%.1f°", $0) },
         t?.pump_rollen_deg.map { String(format: "±%.1f°", $0) },
         t?.wackeln_deg.map { String(format: "±%.1f°", $0) },
         t?.kurvenlage_deg.map { String(format: "%.1f°", $0) },
         t?.takt_hz.map { String(format: "%.2f Hz", $0) },
         t?.hub_cm.map { String(format: "%.0f cm", $0) },
         t?.gier_deg_s.map { String(format: "%.0f°/s", $0) }]
    }

    private func phasenZeile(_ p: PhaseZeile) -> some View {
        let w: [String?] = werte(p.werte)
        let spalten: [LageSpalte] = werteSpalten
        return HStack(spacing: 6) {
            Text(p.phase).font(.caption).lineLimit(1).frame(width: phaseBreite, alignment: .leading)
            ForEach(0..<w.count, id: \.self) { i in
                Text(w[i] ?? "–").font(.caption).monospacedDigit()
                    .fontWeight(p.haupt && w[i] != nil ? .semibold : .regular)
                    .foregroundStyle(p.haupt && w[i] != nil ? Color.accentColor : Color.primary)
                    .frame(width: spalten[i].breite, alignment: .trailing)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private func phasenBlock(_ z: LageTabZeile) -> some View {
        if let k = z.k, k.ok {
            let ph: [PhaseZeile] = phasenDesLaufs(k, korr: korr, lang: lang)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(ph.indices, id: \.self) { i in phasenZeile(ph[i]) }
            }
        } else {
            let breite: CGFloat = phaseBreite + werteSpalten.reduce(0) { $0 + $1.breite + 6 }
            Text(z.geladen ? "–" : "…").font(.caption).foregroundStyle(.secondary)
                .frame(width: breite, alignment: .leading)
        }
    }

    private func laufZeile(_ z: LageTabZeile) -> some View {
        HStack(alignment: .top, spacing: 6) {
            ForEach(z.vorne.indices, id: \.self) { i in
                z.vorne[i].frame(width: i < vorneSpalten.count ? vorneSpalten[i].breite : 60, alignment: .leading)
            }
            phasenBlock(z)
            ForEach(z.hinten.indices, id: \.self) { i in
                z.hinten[i].frame(width: i < hintenSpalten.count ? hintenSpalten[i].breite : 60, alignment: .leading)
            }
        }
        .padding(.vertical, 4)
        .background(z.markiert ? Color.accentColor.opacity(0.18) : Color.clear)
        .contentShape(Rectangle())
        .onTapGesture { z.onTap?() }
    }
}

// MARK: - Die Lage-Ansicht

private let gierFenster: [Double] = [0.1, 0.5, 1, 3, 5]

private func fensterText(_ f: Double) -> String {
    let s = String(format: "%.1f", f)
    return s.hasSuffix(".0") ? String(s.dropLast(2)) : s
}

/// Eine Kurve: Name, Werte, Farbe, Einheit, eigener Bereich (normiert auf das eigene Maximum).
struct LageReihe {
    let name: String
    let werte: [Double]
    let farbe: Color
    let einheit: String
    var bereich: Double { max(1, werte.map { abs($0) }.max() ?? 1) }
}

/// Zeichnung + Kurven + Kennzahlen. Die Zeichnung bewegt sich per FINGER auf den Kurven (wie die
/// Maus im Web) oder per eigenem Abspielknopf in ECHTZEIT — die Session-Wiedergabe, der sie in der
/// PWA folgt, gibt es in der App nicht. Beide Wege speisen dieselbe Position.
struct LageAnsichtView: View {
    let session: SessionDetail
    let run: Int?
    let lang: String
    @State private var fenster: Double = 1
    @State private var daten: BoardAttitude? = nil
    @State private var laden = true
    @State private var zusammen = true
    @State private var pos: Double = 1
    @State private var spielt = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(Loc.t("board.title", lang)).font(.headline)
            inhalt
        }
        .padding(12)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .task(id: "\(session.id)-\(run ?? -1)-\(fenster)") { await abrufen() }
        .task(id: spielt) { await abspielen() }
    }

    @ViewBuilder private var inhalt: some View {
        if laden && daten == nil {
            ProgressView().frame(maxWidth: .infinity)
        } else if let d = daten, d.ok, let t = d.t_ms, !t.isEmpty {
            LageInhaltView(session: session, d: d, lang: lang, pos: $pos, spielt: $spielt,
                           zusammen: $zusammen, fenster: $fenster)
        } else {
            Text(daten?.grund.map { "\(Loc.t("board.noData", lang)) (\($0))" } ?? Loc.t("board.noData", lang))
                .font(.callout).foregroundStyle(.secondary)
        }
    }

    private func abrufen() async {
        laden = true
        spielt = false
        daten = try? await Api.boardAttitude(session.id, run: run, hz: 20, yawWindowS: fenster)
        pos = 1
        laden = false
    }

    /// Echtzeit: die Position waechst um die vergangene Wanduhrzeit / Spanne der Aufnahme.
    private func abspielen() async {
        guard spielt, let t = daten?.t_ms, t.count > 1 else { return }
        let spanne = max(1, (t.last ?? 1) - (t.first ?? 0))
        if pos >= 1 { pos = 0 }
        var vorher = Date()
        while spielt && pos < 1 && !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 33_000_000)
            let jetzt = Date()
            pos = min(1, pos + jetzt.timeIntervalSince(vorher) * 1000 / spanne)
            vorher = jetzt
        }
        spielt = false
    }
}

struct LageInhaltView: View {
    let session: SessionDetail
    let d: BoardAttitude
    let lang: String
    @Binding var pos: Double
    @Binding var spielt: Bool
    @Binding var zusammen: Bool
    @Binding var fenster: Double

    private var tMs: [Double] { d.t_ms ?? [] }
    private var idx: Int { max(0, min(tMs.count - 1, Int((Double(tMs.count - 1) * pos).rounded()))) }
    private func wert(_ r: [Double]?) -> Double { r.flatMap { idx < $0.count ? $0[idx] : nil } ?? 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            richtungHinweis
            kacheln
            LageKurvenView(reihen: reihen, tMs: tMs, pos: $pos, spielt: $spielt, idx: idx, zusammen: zusammen,
                           von: d.auswahl_von_ms, bis: d.auswahl_bis_ms)
            zeitachse
            bedienung
            kennzahlen
        }
    }

    /// Vorn/hinten nicht aus den Daten bestimmbar: sagen statt still ein Bild zeigen, das genauso
    /// gut spiegelverkehrt sein kann (PWA BoardAttitude.tsx, Jan 27.09.2026: „keinerlei annahmen").
    /// Normale Schriftgroesse, Amber-Kasten wie die uebrigen Hinweise der App.
    @ViewBuilder private var richtungHinweis: some View {
        if d.richtung_bestimmt == false {
            Text(Loc.t("board.directionUnknown", lang))
                .font(.body)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.orange.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.orange.opacity(0.4), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private var reihen: [LageReihe] {
        var r: [LageReihe] = [
            LageReihe(name: Loc.t("board.pitch", lang), werte: d.pitch_deg ?? [], farbe: Color(red: 0.22, green: 0.74, blue: 0.97), einheit: "°"),
            LageReihe(name: Loc.t("board.roll", lang), werte: d.roll_deg ?? [], farbe: Color(red: 0.96, green: 0.62, blue: 0.04), einheit: "°"),
            LageReihe(name: Loc.t("board.yaw", lang), werte: d.gier_delta_deg ?? [], farbe: Color(red: 0.65, green: 0.55, blue: 0.98), einheit: "°"),
        ]
        if let h = d.hub_cm {
            r.append(LageReihe(name: Loc.t("board.height", lang), werte: h, farbe: Color(red: 0.20, green: 0.83, blue: 0.60), einheit: " cm"))
        }
        return r
    }

    /// Ausschnitt der Seitenansicht NUR aus dem Lauf, 95. Perzentil (Jan, 21.09.: „warum ist das
    /// board links so klein?" — der doppelt integrierte Hub im Rand ging bis 147 cm).
    private var hubBereich: Double {
        guard let hub = d.hub_cm, !hub.isEmpty else { return 0 }
        var nur: [Double] = hub
        if let von = d.auswahl_von_ms, let bis = d.auswahl_bis_ms {
            let f: [Double] = zip(hub, tMs).filter { $0.1 >= von && $0.1 <= bis }.map { $0.0 }
            if f.count >= 8 { nur = f }
        }
        let s: [Double] = nur.map { abs($0) }.sorted()
        return max(2, s[min(s.count - 1, Int(Double(s.count) * 0.95))])
    }

    @ViewBuilder private var kacheln: some View {
        if let rig = d.rig {
            let hb: Double = hubBereich
            let hub: Double = max(-hb, min(hb, wert(d.hub_cm)))
            LageKachel(titel: Loc.t("board.pitch", lang), hinweis: Loc.t("board.pitchHint", lang), wert: wert(d.pitch_deg)) {
                SeitenAnsicht(rig: rig, pitch: wert(d.pitch_deg), hub: hub, hubBereich: hb)
            }
            LageKachel(titel: Loc.t("board.roll", lang), hinweis: Loc.t("board.rollHint", lang), wert: wert(d.roll_deg)) {
                FrontAnsicht(rig: rig, roll: wert(d.roll_deg), pitch: wert(d.pitch_deg))
            }
            LageKachel(titel: Loc.t("board.yaw", lang),
                       hinweis: Loc.t("board.yawHint", lang).replacingOccurrences(of: "{s}", with: fensterText(fenster)),
                       wert: wert(d.gier_delta_deg)) {
                DraufAnsicht(rig: rig, yaw: wert(d.gier_delta_deg))
            }
        }
    }

    private func uhrzeit(_ t: Double) -> String {
        guard let start = session.startedDate else { return "" }
        let wand: Double = Clockmap.wanduhrMs(session.pause_windows, t)
        return TimeFmt.hhmmss(start.addingTimeInterval(wand / 1000), session.tz)
    }

    private var zeitachse: some View {
        HStack {
            Text(uhrzeit(tMs.first ?? 0))
            Spacer()
            Text(uhrzeit(tMs[tMs.count / 2]))
            Spacer()
            Text(uhrzeit(tMs.last ?? 0))
        }
        .font(.caption2).monospacedDigit().foregroundStyle(.secondary)
    }

    private var bedienung: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Button { spielt.toggle() } label: { Image(systemName: spielt ? "pause.fill" : "play.fill") }
                    .buttonStyle(.bordered)
                Button(Loc.t(zusammen ? "board.separate" : "board.combined", lang)) { zusammen.toggle() }
                    .buttonStyle(.bordered)
                Spacer()
                Text("\(uhrzeit(tMs[idx])) · \(String(format: "%.1f", (tMs[idx] - (tMs.first ?? 0)) / 1000)) s")
                    .font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Text(Loc.t("board.window", lang)).font(.caption).foregroundStyle(.secondary)
                    ForEach(gierFenster, id: \.self) { f in fensterKnopf(f) }
                }
            }
        }
    }

    private func fensterKnopf(_ f: Double) -> some View {
        Button("\(fensterText(f)) s") { fenster = f }
            .font(.caption)
            .buttonStyle(.bordered)
            .tint(f == fenster ? Color.accentColor : Color.secondary)
    }

    @ViewBuilder private var kennzahlen: some View {
        if let k = d.kennzahlen {
            Text(kennzahlText(k)).font(.callout).foregroundStyle(.secondary)
            // Unsicherer Hub: WORAUF er sich bezieht (Jan, 23.09.) — ganze Aufnahme oder Lauf.
            if k.hub_pp_cm != nil, k.hub_sicher != true {
                let key: String = d.auswahl_von_ms == nil ? "board.heaveShakyAll" : "board.heaveShaky"
                Text(Loc.t(key, lang).replacingOccurrences(of: "{s}", with: fensterText(d.hub_fenster_s ?? 3)))
                    .font(.callout).foregroundStyle(.orange)
            }
        }
    }

    private func kennzahlText(_ k: LageKennzahlen) -> String {
        var teile: [String] = [Loc.t("board.stats", lang)
            .replacingOccurrences(of: "{pitch}", with: "\(Int(k.pitch_amplitude_deg.rounded()))")
            .replacingOccurrences(of: "{roll}", with: "\(Int(k.roll_amplitude_deg.rounded()))")
            .replacingOccurrences(of: "{yaw}", with: "\(Int(k.gier_rms_deg_s.rounded()))")]
        if let hz = k.pitch_hz {
            teile.append(Loc.t("board.cadence", lang).replacingOccurrences(of: "{hz}", with: String(format: "%.2f", hz)))
        }
        if let cm = k.hub_pp_cm {
            teile.append(Loc.t("board.heaveStat", lang)
                .replacingOccurrences(of: "{cm}", with: "\(Int(cm.rounded()))")
                .replacingOccurrences(of: "{s}", with: fensterText(d.hub_fenster_s ?? 3)))
        }
        if let rot = d.rot_deg {
            teile.append("\(Loc.t("board.mounting", lang)) \(Int(rot.rounded()))° (\(Loc.t("board.mountAuto", lang)))")
        }
        return teile.joined(separator: " · ")
    }
}

struct LageKachel<Inhalt: View>: View {
    let titel: String
    let hinweis: String
    let wert: Double
    @ViewBuilder let zeichnung: () -> Inhalt

    var body: some View {
        VStack(spacing: 4) {
            Text(titel.uppercased()).font(.caption.weight(.semibold))
            zeichnung()
            Text((wert > 0 ? "+" : "") + String(format: "%.1f°", wert)).font(.title3.weight(.bold)).monospacedDigit()
            Text(hinweis).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Die Kurven mit Zeiger. Im gemeinsamen Bild ist jede Reihe auf IHR eigenes Maximum normiert
/// (Grad und Zentimeter haben keinen gemeinsamen Massstab); die Legende nennt den Bereich.
struct LageKurvenView: View {
    let reihen: [LageReihe]
    let tMs: [Double]
    @Binding var pos: Double
    @Binding var spielt: Bool
    let idx: Int
    let zusammen: Bool
    let von: Double?
    let bis: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if zusammen {
                kurve(reihen, hoehe: 150)
                legende
            } else {
                ForEach(0..<reihen.count, id: \.self) { i in einzeln(reihen[i]) }
            }
        }
    }

    private func einzeln(_ r: LageReihe) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(r.name).font(.caption.weight(.semibold)).foregroundStyle(r.farbe)
                Spacer()
                Text("\(wertText(r))  ±\(Int(r.bereich.rounded()))\(r.einheit)").font(.caption).foregroundStyle(.secondary)
            }
            kurve([r], hoehe: 72)
        }
    }

    private var legende: some View {
        let texte: [(String, Color)] = reihen.map { r in
            ("\(r.name) \(wertText(r)) (±\(Int(r.bereich.rounded()))\(r.einheit))", r.farbe)
        }
        return VStack(alignment: .leading, spacing: 2) {
            ForEach(0..<texte.count, id: \.self) { i in
                Text(texte[i].0).font(.caption.weight(.semibold)).foregroundStyle(texte[i].1)
            }
        }
    }

    private func wertText(_ r: LageReihe) -> String {
        guard idx < r.werte.count else { return "" }
        let v = r.werte[idx]
        return (v > 0 ? "+" : "") + String(format: "%.1f", v) + r.einheit
    }

    private func kurve(_ gruppe: [LageReihe], hoehe: CGFloat) -> some View {
        GeometryReader { geo in
            Canvas { ctx, size in zeichnen(ctx, size, gruppe) }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                    spielt = false
                    pos = max(0, min(1, g.location.x / max(1, geo.size.width)))
                })
        }
        .frame(height: hoehe)
    }

    private func zeichnen(_ ctx: GraphicsContext, _ size: CGSize, _ gruppe: [LageReihe]) {
        guard let t0 = tMs.first, let t1 = tMs.last else { return }
        let w = size.width, h = size.height, spanne = max(1, t1 - t0)
        let x: (Double) -> Double = { t in (t - t0) / spanne * w }
        // Grauer Rand vor und nach dem Lauf — dort liegt der Anlauf.
        if let von, let bis {
            let a = max(0, min(w, x(von))), b = max(0, min(w, x(bis)))
            if a > 0 { ctx.fill(Path(CGRect(x: 0, y: 0, width: a, height: h)), with: .color(.secondary.opacity(0.14))) }
            if b < w { ctx.fill(Path(CGRect(x: b, y: 0, width: w - b, height: h)), with: .color(.secondary.opacity(0.14))) }
        }
        var mitte = Path(); mitte.move(to: CGPoint(x: 0, y: h / 2)); mitte.addLine(to: CGPoint(x: w, y: h / 2))
        ctx.stroke(mitte, with: .color(.secondary), lineWidth: 1)
        for r in gruppe {
            var pfad = Path()
            let bereich = r.bereich
            for (i, v) in r.werte.enumerated() where i < tMs.count {
                let pt = CGPoint(x: x(tMs[i]), y: h / 2 - v / bereich * (h / 2 - 6))
                if i == 0 { pfad.move(to: pt) } else { pfad.addLine(to: pt) }
            }
            ctx.stroke(pfad, with: .color(r.farbe), lineWidth: 2)
        }
        let zx = max(1, min(w - 1, pos * w))
        var zeiger = Path(); zeiger.move(to: CGPoint(x: zx, y: 0)); zeiger.addLine(to: CGPoint(x: zx, y: h))
        ctx.stroke(zeiger, with: .color(.primary), lineWidth: 1.5)
        for r in gruppe where idx < r.werte.count {
            let y = h / 2 - r.werte[idx] / r.bereich * (h / 2 - 6)
            ctx.fill(Path(ellipseIn: CGRect(x: zx - 4, y: y - 4, width: 8, height: 8)), with: .color(r.farbe))
        }
    }
}

// MARK: - Startseite

/// Startseite ganz unten: Lage je LAUFLAENGE, gesamt und je Foil (Jan, 24.09.2026). Nur aus
/// Aufnahmen mit dem Handy am Brett; ohne solche erscheint nichts. Mediane mit Laufzahl, „nicht
/// erkannt" statt Strich, Takt in der Profil-Einheit, kein Gieren (die Route ist frei gewaehlt).
struct BrettLageStartseite: View {
    let lang: String
    @State private var daten: BoardAttitudeStats? = nil

    var body: some View {
        Group {
            if let d = daten, !d.gesamt.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    kopf
                    BrettKlassenTabelle(klassen: d.gesamt, lang: lang)
                    // Je Foil nur bei mehr als einem, sonst stuende dieselbe Tabelle zweimal da.
                    if d.je_foil.count > 1 {
                        ForEach(d.je_foil) { f in jeFoil(f) }
                    }
                }
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .task { daten = try? await Api.boardAttitudeStats() }
    }

    private var kopf: some View {
        HStack(spacing: 8) {
            Text(Loc.t("home.boardAttitude", lang)).font(.title3.weight(.bold))
            // Abzeichen statt Erklaertext (Jan, 24.09.: „ganz raus").
            Text("Phone · \(Loc.t("session.onBoard", lang))")
                .font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 4))
        }
    }

    private func jeFoil(_ f: BoardFoilKlassen) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(f.foil) · \(Loc.t("home.baRuns", lang).replacingOccurrences(of: "{n}", with: "\(f.laeufe)"))")
                .font(.subheadline.weight(.semibold))
            BrettKlassenTabelle(klassen: f.klassen, lang: lang)
        }
    }
}

struct BrettKlassenTabelle: View {
    let klassen: [BoardKlasse]
    let lang: String

    private var labels: [String: String] {
        ["bis30s": Loc.t("home.baUpTo30s", lang), "30bis60s": Loc.t("home.ba30to60s", lang),
         "1bis5min": Loc.t("home.ba1to5min", lang), "ueber5min": Loc.t("home.baOver5min", lang)]
    }

    var body: some View {
        VStack(spacing: 0) {
            kopf
            ForEach(klassen) { k in
                Divider()
                zeile(k)
            }
        }
        .padding(.vertical, 6)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var kopf: some View {
        let spalten: [String] = [Loc.t("home.baPitch", lang), Loc.t("home.baRoll", lang), Loc.t("home.baHeave", lang),
                                 "\(Loc.t("home.baCadence", lang)) \(PumpUnit.unitLabel(lang))"]
        return HStack {
            Text(Loc.t("home.baRunLength", lang)).frame(maxWidth: .infinity, alignment: .leading)
            ForEach(0..<spalten.count, id: \.self) { i in
                Text(spalten[i]).frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .font(.caption).foregroundStyle(.secondary)
        .padding(.horizontal, 12).padding(.vertical, 4)
    }

    private func zeile(_ k: BoardKlasse) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(labels[k.klasse] ?? k.klasse).font(.callout)
                Text(Loc.t("home.baRuns", lang).replacingOccurrences(of: "{n}", with: "\(k.laeufe)"))
                    .font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            zelle(k.pitch_deg.map { "\(Int($0.rounded()))°" }, betont: true)
            zelle(k.roll_deg.map { "\(Int($0.rounded()))°" }, betont: true)
            zelle(k.hub_cm.map { "\(Int($0.rounded())) cm" }, betont: false)
            // Der Takt folgt der eingestellten Einheit (Hz oder /min), wie jede Kadenz-Anzeige.
            zelle(k.takt_hz.map { PumpUnit.fmtValue($0) }, betont: false)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
    }

    private func zelle(_ text: String?, betont: Bool) -> some View {
        Text(text ?? Loc.t("home.baNotDetected", lang))
            .font(text == nil ? .caption : (betont ? .callout.weight(.semibold) : .callout))
            .foregroundStyle(text == nil ? Color.secondary : (betont ? Color.accentColor : Color.primary))
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}
