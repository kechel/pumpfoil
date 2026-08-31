import Foundation

/// Synchrones Abspielen im Session-Vergleich — die Zeitrechnung dahinter.
///
/// Portiert aus `web/src/lib/syncPlayback.ts` (und deckungsgleich mit `SyncPlayback.kt` auf
/// Android); bewusst dieselbe Rechnung, damit Web und Apps denselben Moment zeigen. Wer hier
/// etwas aendert, aendert es dort mit.
///
/// **Warum das ueberhaupt gerechnet werden muss:** ein Trackpunkt ist NICHT eine Sekunde. Der
/// Server liefert zum Track keine Zeitstempel je Punkt, und bei GPS-Aussetzern laeuft der
/// Sample-Index gegen die Uhr auseinander (gemessen: 1000 → 1734 ms je Index innerhalb EINER
/// Session). Stuetzpunkte gibt es nur an den Laufgrenzen — `i_start`/`i_end` zusammen mit
/// `t_start_session_ms`/`t_end_session_ms`. Zwischen zwei Stuetzpunkten wird linear gerechnet,
/// an den Raendern mit 1 Hz extrapoliert.
///
/// **Nur `t_*_session_ms` taugt fuer eine Uhrzeit**, nicht `t_start_ms` — letzteres ist auf den
/// Trim verschoben (docs/DATA-PIPELINE.md).

private let msJeSample: Double = 1000

/// Kuerzere Luecken NICHT ueberspringen: unter ein paar Sekunden wirkt ein Sprung wie ein Ruckler.
private let minSprungMs: Double = 5000

/// Etwas Vorlauf/Nachlauf um jeden Lauf — sonst setzt das Bild genau im ersten Pump ein.
private let randMs: Double = 2000

private func epochMs(_ iso: String?) -> Double? {
    guard let iso, !iso.isEmpty, let d = TimeFmt.parseISO(iso) else { return nil }
    return d.timeIntervalSince1970 * 1000
}

/// Umrechnung Sample-Index ↔ absolute Zeit fuer EINE Session.
struct Zeitachse {
    let anker: [(i: Int, ms: Double)]
    let von: Double
    let bis: Double
    let start: Double

    /// Absolute Zeit an einem (auch gebrochenen) Sample-Index.
    func zeit(_ i: Double) -> Double {
        let x = min(max(i, Double(anker[0].i)), Double(anker[anker.count - 1].i))
        var lo = 0, hi = anker.count - 1
        while hi - lo > 1 {
            let m = (lo + hi) / 2
            if Double(anker[m].i) <= x { lo = m } else { hi = m }
        }
        let a = anker[lo], b = anker[hi]
        let f = b.i == a.i ? 0 : (x - Double(a.i)) / Double(b.i - a.i)
        return start + a.ms + f * (b.ms - a.ms)
    }

    /// Sample-Index zu einer absoluten Zeit; `nil`, wenn die Session da nicht aufgezeichnet hat.
    func index(_ tAbs: Double) -> Double? {
        if tAbs < von || tAbs > bis { return nil }
        let ms = tAbs - start
        var lo = 0, hi = anker.count - 1
        while hi - lo > 1 {
            let m = (lo + hi) / 2
            if anker[m].ms <= ms { lo = m } else { hi = m }
        }
        let a = anker[lo], b = anker[hi]
        let f = b.ms == a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms)
        return Double(a.i) + f * Double(b.i - a.i)
    }
}

func zeitachseVon(_ session: SessionDetail, punkte: Int) -> Zeitachse? {
    guard let segs = session.analysis?.segments, !segs.isEmpty, punkte > 0,
          let start = epochMs(session.started_at) else { return nil }

    // Anker einsammeln und nach Index sortieren. Doppelte Indizes (zwei Segmente stossen
    // aneinander) fallen weg — sonst entstuende eine Stufe mit Steigung 0.
    var roh: [(i: Int, ms: Double)] = []
    for s in segs {
        if let a = s.t_start_session_ms { roh.append((s.i_start, a)) }
        if let b = s.t_end_session_ms { roh.append((s.i_end, b)) }
    }
    roh.sort { $0.i < $1.i }
    var anker: [(i: Int, ms: Double)] = []
    for a in roh {
        if let l = anker.last {
            if a.i == l.i { continue }
            // Nicht-monotone Anker verwerfen statt die Achse rueckwaerts laufen zu lassen.
            if a.ms <= l.ms { continue }
        }
        anker.append(a)
    }
    if anker.count < 2 { return nil }

    // Raender ergaenzen: vor dem ersten und nach dem letzten Lauf mit der GPS-Rate extrapolieren.
    let erster = anker[0], letzter = anker[anker.count - 1]
    if erster.i > 0 { anker.insert((0, erster.ms - Double(erster.i) * msJeSample), at: 0) }
    if letzter.i < punkte - 1 {
        anker.append((punkte - 1, letzter.ms + Double(punkte - 1 - letzter.i) * msJeSample))
    }
    return Zeitachse(anker: anker, von: start + anker[0].ms,
                     bis: start + anker[anker.count - 1].ms, start: start)
}

struct Zeitraum {
    var von: Double
    var bis: Double
}

/// Die Laeufe einer Session als absolute Zeitraeume — dort ist jemand on foil.
///
/// `nur` = die im Vergleich AUSGEWAEHLTEN Laeufe (nil = ganze Session). Wer einzelne Laeufe
/// nebeneinanderlegt, will auch genau die abgespielt sehen; ohne diese Einschraenkung liefen
/// Fahrer durchs Bild, die im Vergleich gar nicht stehen.
func laufZeitraeume(_ session: SessionDetail, nur: Set<Int>?) -> [Zeitraum] {
    guard let segs = session.analysis?.segments, let start = epochMs(session.started_at) else { return [] }
    var out: [Zeitraum] = []
    for (i, s) in segs.enumerated() {
        if let nur, !nur.contains(i) { continue }
        if let a = s.t_start_session_ms, let b = s.t_end_session_ms, b > a {
            out.append(Zeitraum(von: start + a, bis: start + b))
        }
    }
    return out
}

/// Ueberlappende/nahe Zeitraeume zu einer aufsteigenden, ueberschneidungsfreien Liste verschmelzen.
func verschmelzen(_ alle: [Zeitraum]) -> [Zeitraum] {
    var out: [Zeitraum] = []
    for z in alle.sorted(by: { $0.von < $1.von }) {
        if !out.isEmpty, z.von - out[out.count - 1].bis <= minSprungMs {
            out[out.count - 1].bis = max(out[out.count - 1].bis, z.bis)
        } else {
            out.append(z)
        }
    }
    return out
}

struct SyncPlan {
    let sessions: [SessionDetail]
    let achsen: [Int: Zeitachse]
    /// Die im Vergleich ausgewaehlten Laeufe je Session (nil = ganze Session).
    let laeufe: [Int: Set<Int>?]
    /// Abschnitte, in denen MINDESTENS EINER on foil ist — nur die werden abgespielt.
    let aktiv: [Zeitraum]
    /// Summe der aktiven Abschnitte in ms = die Laenge der Wiedergabe.
    let dauerMs: Double

    /// Wiedergabe-Position (0…dauerMs) → absolute Uhrzeit.
    func zuUhrzeit(_ posMs: Double) -> Double {
        var rest = min(max(posMs, 0), dauerMs)
        for z in aktiv {
            let laenge = z.bis - z.von
            if rest <= laenge { return z.von + rest }
            rest -= laenge
        }
        return aktiv[aktiv.count - 1].bis
    }

    /// Wie viel Leerlauf faellt weg — die Zahl, die den Nutzen erklaert.
    var uebersprungenMin: Double {
        let vons = sessions.compactMap { achsen[$0.id]?.von }
        let bisse = sessions.compactMap { achsen[$0.id]?.bis }
        guard let von = vons.min(), let bis = bisse.max() else { return 0 }
        return max(0, (bis - von) - dauerMs) / 60000
    }
}

/// Baut den Plan — oder `nil`, wenn synchrones Abspielen keinen Sinn ergibt.
///
/// Bedingung (Jan): die Sessions muessen sich **zeitlich ueberschneiden** UND am **gleichen Spot**
/// sein. Beides zusammen, sonst laufen im Bild Leute nebeneinander her, die sich nie gesehen haben.
func syncPlan(_ auswahl: [(session: SessionDetail, runIdx: Int?)], punkte: [Int: Int]) -> SyncPlan? {
    // Je Session zusammenfassen: mehrfach dieselbe Session (mehrere ausgewaehlte Laeufe) ergibt
    // EINEN Eintrag mit allen ihren Laeufen. Steht die ganze Session auch nur einmal im Vergleich,
    // gilt die ganze Session — eine Auswahl kann eine andere nicht wieder einschraenken.
    var reihenfolge: [Int] = []
    var proSession: [Int: (session: SessionDetail, laeufe: Set<Int>?)] = [:]
    for a in auswahl {
        if let da = proSession[a.session.id] {
            if da.laeufe == nil || a.runIdx == nil {
                proSession[a.session.id] = (da.session, nil)
            } else if let r = a.runIdx {
                var m = da.laeufe ?? []
                m.insert(r)
                proSession[a.session.id] = (da.session, m)
            }
        } else {
            reihenfolge.append(a.session.id)
            proSession[a.session.id] = (a.session, a.runIdx.map { Set([$0]) })
        }
    }

    struct Eintrag {
        let s: SessionDetail
        let laeufe: Set<Int>?
        let a: Zeitachse
    }
    let mitAchse: [Eintrag] = reihenfolge.compactMap { id in
        guard let e = proSession[id], let a = zeitachseVon(e.session, punkte: punkte[id] ?? 0) else { return nil }
        return Eintrag(s: e.session, laeufe: e.laeufe, a: a)
    }
    if mitAchse.count < 2 { return nil }

    // Nach Spot gruppieren; ohne Spotnamen kann man Gleichzeitigkeit nicht sinnvoll behaupten.
    var spotNamen: [String] = []
    var nachSpot: [String: [Eintrag]] = [:]
    for x in mitAchse {
        let spot = (x.s.place_name ?? "").trimmingCharacters(in: .whitespaces)
        if spot.isEmpty { continue }
        if nachSpot[spot] == nil { spotNamen.append(spot); nachSpot[spot] = [] }
        nachSpot[spot]?.append(x)
    }

    // Innerhalb eines Spots in ZUSAMMENHAENGENDE Gruppen zerlegen — nicht einfach alles nehmen,
    // was sich mit irgendwem ueberschneidet. Sonst wird aus zwei Ausfahrten am selben Tag
    // (morgens zu dritt, abends zu zweit) eine Wiedergabe, die mitten im Abspielen vom Morgen in
    // den Abend schneidet.
    var gruppen: [[Eintrag]] = []
    for name in spotNamen {
        var offen = nachSpot[name] ?? []
        while !offen.isEmpty {
            var gruppe = [offen.removeFirst()]
            var gewachsen = true
            while gewachsen {
                gewachsen = false
                for k in stride(from: offen.count - 1, through: 0, by: -1) {
                    let kandidat = offen[k]
                    if gruppe.contains(where: { kandidat.a.von < $0.a.bis && $0.a.von < kandidat.a.bis }) {
                        gruppe.append(kandidat)
                        offen.remove(at: k)
                        gewachsen = true
                    }
                }
            }
            if gruppe.count >= 2 { gruppen.append(gruppe) }
        }
    }
    // Die groesste Gruppe gewinnt; bei Gleichstand die mit der laengeren gemeinsamen Zeit.
    func spanne(_ g: [Eintrag]) -> Double {
        (g.map { $0.a.bis }.max() ?? 0) - (g.map { $0.a.von }.min() ?? 0)
    }
    guard let beste = gruppen.sorted(by: {
        $0.count != $1.count ? $0.count > $1.count : spanne($0) > spanne($1)
    }).first, beste.count >= 2 else { return nil }

    var roh: [Zeitraum] = []
    for x in beste {
        for z in laufZeitraeume(x.s, nur: x.laeufe) {
            roh.append(Zeitraum(von: z.von - randMs, bis: z.bis + randMs))
        }
    }
    let aktiv = verschmelzen(roh)
    if aktiv.isEmpty { return nil }

    var achsen: [Int: Zeitachse] = [:]
    var laeufe: [Int: Set<Int>?] = [:]
    for x in beste {
        achsen[x.s.id] = x.a
        laeufe[x.s.id] = x.laeufe
    }
    return SyncPlan(sessions: beste.map { $0.s }, achsen: achsen, laeufe: laeufe,
                    aktiv: aktiv, dauerMs: aktiv.reduce(0) { $0 + ($1.bis - $1.von) })
}
