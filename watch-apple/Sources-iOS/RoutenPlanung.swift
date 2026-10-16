import Foundation
import SwiftUI

// Zustand und Ablauf der Routenplanung — nach `RoutenVorschlag` in web/src/components/SpotHeatmap.tsx
// (Jan, 16.10.2026), wie RoutenPlanung.kt in der Android-App. Die Oberflaeche steht in
// SpotHeatmapPanel.swift; hier nur, was passiert:
//
//  - Startplaetze holen (mind. Starts / mind. Fahrer / Umkreis), dabei Start, Ausschluesse und Ziel
//    ueber die Lage uebernehmen statt auf den Anfang zu springen.
//  - Rechnen nur auf Anstoss (Jetzt berechnen, erstes Oeffnen, Aufruf einer gemerkten Route); passt
//    die Liste nicht mehr zu den Einstellungen, ist sie „veraltet" und verschwindet.
//  - Eigene Punkte („+" auf der Karte) je Spot in den UserDefaults; Punkte einer aufgerufenen fremden
//    Route nur fuer diese Route (weg bei der naechsten eigenen Berechnung und beim Schliessen).
//  - Merken mit dem Formular, damit ein Aufruf alles wiederherstellt; gespeichert werden nur die
//    manuellen Punkte, die die Route wirklich anfaehrt.

struct EigenerPunkt: Equatable {
    var lat: Double
    var lon: Double
    var lokal: Bool
}

enum RoutenSpalte { case empf, meter, legs, kreuz, doppelt }

@MainActor
final class RoutenPlanung: ObservableObject {
    static let zuverlaessig: [Int] = [2, 3, 5]
    static let fahrerStufen: [Int] = [1, 2, 3]
    static let umkreisStufen: [Int] = [2, 5, 10, 20, 30]
    static let eigeneMax = 20
    static let nahM: Double = 40        // gemerkter Punkt == heutiger Startplatz, wenn so nah
    static let meinM: Double = 30       // so nah an einem eigenen Start = „schon gestartet"

    let spotId: Int
    @Published var minStarts = 3
    @Published var minFahrer = 1
    @Published var umkreis = 2
    @Published var start = 0
    @Published var minM = 50
    @Published var maxM = 300
    @Published var anzahl = 6
    @Published var ohneKreuzung = true
    @Published var rundkurs = true
    @Published var zielPlatz: Int? = nil
    @Published var richtung: Int? = nil
    @Published var aus: Set<Int> = []
    @Published var serverPos: [Startposition]? = nil
    @Published var eigene: [EigenerPunkt] = []
    @Published var ergebnis: RoutenErgebnis? = nil
    @Published var gerechnetMit = ""
    @Published var sortierung: (RoutenSpalte, Bool) = (.empf, false)
    @Published var gewaehlt: String? = nil
    @Published var merkStatus: String? = nil
    @Published var wieder: GemerkteRoute? = nil
    @Published var ueberlagert: GemerkteRoute? = nil
    @Published var setzen = false
    @Published var grund: RoutenGrund? = nil
    /// Nach einem Umkreis-Wechsel die Karte auf die Startplaetze einpassen (liest das Panel).
    @Published var einpassen = false
    private var erstGerechnet = false
    private var vorher: [Startposition]? = nil
    private var geladenMit: String? = nil

    init(spotId: Int) {
        self.spotId = spotId
        eigene = eigeneLaden()
    }

    var nServer: Int { serverPos?.count ?? 0 }
    var pos: [Startposition]? {
        guard let s = serverPos else { return nil }
        return s + eigene.map { Startposition(lat: $0.lat, lon: $0.lon, eigen: true) }
    }
    var zielAktiv: Int? {
        guard let z = zielPlatz, !rundkurs, z != start, !aus.contains(z) else { return nil }
        return z
    }
    var einstellungsSchluessel: String {
        let e: String = eigene.map { "\($0.lat),\($0.lon)" }.joined(separator: ";")
        return "\(minStarts)|\(minFahrer)|\(umkreis)|\(start)|\(minM)|\(maxM)|\(anzahl)|\(ohneKreuzung)|\(rundkurs)|\(aus.sorted())|\(zielAktiv ?? -1)|\(e)"
    }
    var veraltet: Bool { pos != nil && (gerechnetMit != einstellungsSchluessel || ergebnis == nil) }

    // MARK: eigene Punkte
    private var speicherSchluessel: String { "routen_eigene_\(spotId)" }
    private func eigeneLaden() -> [EigenerPunkt] {
        guard let a = UserDefaults.standard.array(forKey: speicherSchluessel) as? [[Double]] else { return [] }
        return a.filter { $0.count == 2 }.prefix(Self.eigeneMax).map { EigenerPunkt(lat: $0[0], lon: $0[1], lokal: true) }
    }
    func setzeEigene(_ e: [EigenerPunkt]) {
        eigene = e
        UserDefaults.standard.set(e.filter { $0.lokal }.map { [$0.lat, $0.lon] }, forKey: speicherSchluessel)
    }
    func eigenenSetzen(_ lat: Double, _ lon: Double) {
        setzen = false
        if eigene.count >= Self.eigeneMax { return }
        setzeEigene(eigene + [EigenerPunkt(lat: lat, lon: lon, lokal: true)])
    }
    func eigenenVerschieben(_ k: Int, _ lat: Double, _ lon: Double) {
        guard eigene.indices.contains(k) else { return }
        var e = eigene
        e[k] = EigenerPunkt(lat: lat, lon: lon, lokal: true)
        setzeEigene(e)
    }
    /// Eigenen Punkt k entfernen: Indizes dahinter ruecken vor (Start, Ausschluesse, Ziel, Richtung).
    func eigenenEntfernen(_ k: Int) {
        let gi = nServer + k
        func r(_ i: Int) -> Int { i > gi ? i - 1 : i }
        start = start == gi ? 0 : r(start)
        aus = Set(aus.filter { $0 != gi }.map(r))
        if let z = zielPlatz { zielPlatz = z == gi ? nil : r(z) }
        if let x = richtung { richtung = x == gi ? nil : r(x) }
        var e = eigene
        if e.indices.contains(k) { e.remove(at: k) }
        setzeEigene(e)
    }
    /// Punkte einer aufgerufenen fremden Route entfernen (eigene Berechnung, Schliessen).
    @discardableResult
    func fremdeEntfernen() -> Bool {
        if eigene.allSatisfy({ $0.lokal }) { return false }
        var neu: [Int] = []
        var n = 0
        for i in 0..<(nServer + eigene.count) {
            if i < nServer || eigene[i - nServer].lokal { neu.append(n); n += 1 } else { neu.append(-1) }
        }
        func um(_ i: Int) -> Int { neu.indices.contains(i) ? neu[i] : -1 }
        start = Swift.max(0, um(start))
        aus = Set(aus.map(um).filter { $0 >= 0 })
        if let z = zielPlatz { zielPlatz = um(z) >= 0 ? um(z) : nil }
        if let x = richtung { richtung = um(x) >= 0 ? um(x) : nil }
        setzeEigene(eigene.filter { $0.lokal })
        return true
    }

    func naechster(_ p: [Startposition], _ lat: Double, _ lon: Double) -> Int {
        var best = -1
        var bm = Self.nahM
        for (i, q) in p.enumerated() {
            let m = Routen.abstandM(q.lat, q.lon, lat, lon)
            if m < bm { bm = m; best = i }
        }
        return best
    }
    func schonGestartet(_ meine: [[Double]], _ p: Startposition) -> Bool {
        meine.contains { $0.count == 2 && Routen.abstandM($0[0], $0[1], p.lat, p.lon) < Self.meinM }
    }

    // MARK: Startplaetze laden + rechnen
    func ladePositionen(sport: String) async {
        let schl = "\(minStarts)/\(minFahrer)/\(umkreis)/\(sport)"
        if schl == geladenMit && serverPos != nil && wieder == nil { return }   // nur aus dem Bild und zurueck
        geladenMit = schl
        if let p = pos { vorher = p }
        serverPos = nil; ergebnis = nil
        let geholt: [Startposition] = (try? await Api.spotStartpositionen(spotId, minStarts: minStarts, minFahrer: minFahrer,
                                                                          sport: sport, umkreisKm: umkreis)) ?? []
        serverPos = geholt
        guard let p = pos else { return }
        let w = wieder
        let alt: [Startposition]? = w == nil ? vorher : nil
        vorher = nil
        func neu(_ i: Int?) -> Int {
            guard let i, let alt, alt.indices.contains(i) else { return -1 }
            return naechster(p, alt[i].lat, alt[i].lon)
        }
        var s = Swift.max(0, p.firstIndex { $0.vomSpot != false && !$0.eigen } ?? 0)
        if let ws = w?.einstellungen["start"]?.koord {
            let i = naechster(p, ws.0, ws.1)
            if i >= 0 { s = i }
        } else if alt != nil && neu(start) >= 0 {
            s = neu(start)
        }
        start = s
        let exAlt: [(Double, Double)]
        if let w { exAlt = w.einstellungen["ausgeschlossen"]?.koordListe ?? [] }
        else if let alt { exAlt = aus.filter { alt.indices.contains($0) }.map { (alt[$0].lat, alt[$0].lon) } }
        else { exAlt = [] }
        aus = Set(exAlt.map { naechster(p, $0.0, $0.1) }.filter { $0 >= 0 && $0 != s })
        let zi: Int
        if let wz = w?.einstellungen["ziel"]?.koord { zi = naechster(p, wz.0, wz.1) } else { zi = neu(zielPlatz) }
        zielPlatz = zi >= 0 ? zi : nil
        if let x = richtung { let ni = neu(x); richtung = (ni >= 0 && ni != start) ? ni : nil }
        if !erstGerechnet || w != nil { erstGerechnet = true; await rechnen() }
    }

    func rechnen() async {
        guard let p = pos else { return }
        let opt = RoutenOptionen(punkte: Swift.min(anzahl, p.count), ohneKreuzung: ohneKreuzung, rundkurs: rundkurs,
                                 ausgeschlossen: aus, ziel: zielAktiv)
        let s = start
        let a = Double(minM)
        let b = Double(Swift.max(minM, maxM))
        let schl = einstellungsSchluessel
        let (neu, warum): (RoutenErgebnis, RoutenGrund?) = await Task.detached(priority: .userInitiated) {
            let r = Routen.vorschlagen(p, start: s, minM: a, maxM: b, opt: opt)
            return (r, r.routen.isEmpty ? Routen.warumKeine(p, start: s, minM: a, maxM: b, opt: opt) : nil)
        }.value
        ergebnis = neu; grund = warum; gerechnetMit = schl; merkStatus = nil
        if let w = wieder {
            // Aufgerufene gemerkte Route: in der gemerkten Richtung zuerst, sonst umgekehrt
            let idx: [Int] = w.punkte.map { naechster(p, $0[0], $0[1]) }
            var passt: Route? = nil
            if idx.allSatisfy({ $0 >= 0 }) {
                passt = neu.routen.first { $0.punkte == idx } ?? neu.routen.first { $0.punkte == Array(idx.reversed()) }
            }
            if let ez = w.einstellungen["erstes_ziel"]?.koord {
                let i = naechster(p, ez.0, ez.1)
                richtung = i >= 0 ? i : nil
            } else { richtung = nil }
            gewaehlt = passt?.schluessel
            ueberlagert = passt == nil ? w : nil
            wieder = nil
        } else {
            gewaehlt = liste(richtung).first?.schluessel
        }
    }

    /// Die angezeigte Liste: je Richtung die besten 20, sortiert nach der gewaehlten Spalte.
    func liste(_ rich: Int?) -> [Route] {
        guard let e = ergebnis else { return [] }
        func empf(_ a: Route, _ b: Route) -> Bool {
            (a.kreuzungen, a.doppelt, a.wertung) < (b.kreuzungen, b.doppelt, b.wertung)
        }
        let (nach, ab) = sortierung
        func wert(_ r: Route) -> [Double] {
            switch nach {
            case .meter: return [r.meter]
            case .legs: return [Double(r.punkte.count), r.meter]
            case .kreuz: return [Double(r.kreuzungen), r.wertung]
            case .doppelt: return [Double(r.doppelt), r.wertung]
            case .empf: return [Double(r.kreuzungen), Double(r.doppelt), r.wertung]
            }
        }
        let gefiltert: [Route] = e.routen.filter { rich == nil || $0.erstesZiel == rich }
        let beste: [Route] = Array(gefiltert.enumerated().sorted { a, b in
            empf(a.element, b.element) || (!empf(b.element, a.element) && a.offset < b.offset)
        }.map { $0.element }.prefix(20))
        return beste.enumerated().sorted { a, b in
            let x = wert(a.element), y = wert(b.element)
            if x == y { return a.offset < b.offset }
            return ab ? x.lexicographicallyPrecedes(y) == false : x.lexicographicallyPrecedes(y)
        }.map { $0.element }
    }
    var routen: [Route] { liste(richtung) }
    var gewaehlteRoute: Route? { veraltet ? nil : routen.first { $0.schluessel == gewaehlt } }

    /// Moegliche erste Ziele: aus der gueltigen Liste, sonst die naechsten im Abstand (wie die Suche).
    var richtungsWahl: [Int] {
        guard let p = pos else { return [] }
        if !veraltet, let e = ergebnis {
            var r = Set(e.routen.map { $0.erstesZiel })
            if let x = richtung { r.insert(x) }
            return r.sorted()
        }
        guard p.indices.contains(start) else { return [] }
        let hi = Double(Swift.max(minM, maxM))
        let kand = p.indices.map { ($0, Routen.abstandM(p[start], p[$0])) }
            .filter { $0.0 != start && !aus.contains($0.0) && $0.1 >= Double(minM) && $0.1 <= hi }
            .sorted { $0.1 < $1.1 }.prefix(Routen.maxNachbarn)
        return kand.map { $0.0 }.sorted()
    }

    // MARK: Umkreis / Aufruf / Merken
    func umkreisSetzen(_ km: Int) { if km != umkreis { einpassen = true; umkreis = km } }

    /// Gemerkte Route einstellen. true = direkt rechnen (gleiche Anforderungen); sonst laedt die
    /// Aenderung der Anforderungen neu und rechnet dann mit `wieder`.
    func aufrufen(_ g: GemerkteRoute) -> Bool {
        let e = g.einstellungen
        ueberlagert = nil
        wieder = g
        let lokale = eigene.filter { $0.lokal }
        let dazu: [EigenerPunkt] = (e["eigene"]?.koordListe ?? []).map { EigenerPunkt(lat: $0.0, lon: $0.1, lokal: false) }
            .filter { p in !lokale.contains { Routen.abstandM(p.lat, p.lon, $0.lat, $0.lon) < 5 } }
        setzeEigene(Array((lokale + dazu).prefix(Self.eigeneMax)))
        if let v = e["min_m"]?.zahl { minM = Int(v) }
        if let v = e["max_m"]?.zahl { maxM = Int(v) }
        if let v = e["punkte"]?.zahl { anzahl = Int(v) }
        if let v = e["ohne_kreuzung"]?.wahr { ohneKreuzung = v }
        if let v = e["rundkurs"]?.wahr { rundkurs = v }
        let ms = e["min_starts"]?.zahl.map { Int($0) } ?? minStarts
        let mf = e["min_fahrer"]?.zahl.map { Int($0) } ?? 1
        let ukRoh = e["umkreis_km"]?.zahl.map { Int($0) } ?? 0
        let uk = ukRoh > 0 ? ukRoh : 2
        if ms != minStarts || mf != minFahrer || uk != umkreis {
            minStarts = ms; minFahrer = mf; umkreisSetzen(uk)
            return false
        }
        guard let p = pos else { return false }
        var st = -1
        if let s = e["start"]?.koord { st = naechster(p, s.0, s.1) }
        if st >= 0 { start = st }
        aus = Set((e["ausgeschlossen"]?.koordListe ?? []).map { naechster(p, $0.0, $0.1) }.filter { $0 >= 0 && $0 != st })
        if let z = e["ziel"]?.koord { let i = naechster(p, z.0, z.1); zielPlatz = i >= 0 ? i : nil } else { zielPlatz = nil }
        return true
    }

    func merken(_ r: Route) async -> Bool {
        guard let p = pos else { return false }
        merkStatus = "…"
        func k(_ i: Int) -> [Double] { [p[i].lat, p[i].lon] }
        var einst: [String: Any] = [
            "min_starts": minStarts, "min_fahrer": minFahrer, "start": k(start),
            "min_m": minM, "max_m": maxM, "punkte": anzahl, "ohne_kreuzung": ohneKreuzung, "rundkurs": rundkurs,
            "ausgeschlossen": aus.sorted().map { k($0) },
            // nur die manuellen Punkte, die die Route wirklich anfaehrt (Jan)
            "eigene": Array(Set(r.punkte.filter { $0 >= nServer })).sorted().map { k($0) },
            "umkreis_km": umkreis,
        ]
        einst["erstes_ziel"] = richtung.map { k($0) } ?? NSNull()
        einst["ziel"] = zielAktiv.map { k($0) } ?? NSNull()
        do {
            try await Api.spotRouteMerken(spotId, punkte: r.punkte.map { k($0) }, einstellungen: einst)
            merkStatus = "ok"
            return true
        } catch ApiError.http(let code, _) where code == 409 {
            merkStatus = "limit"; return false
        } catch {
            merkStatus = "fehler"; return false
        }
    }

    /// Ist die Planung (gewaehlte bzw. ueberlagerte Route) noch genau die gemerkte g (mit Richtung)?
    func istNoch(_ g: GemerkteRoute) -> Bool {
        if veraltet { return false }
        if let r = gewaehlteRoute, let p = pos {
            if r.punkte.count != g.punkte.count { return false }
            for (k, i) in r.punkte.enumerated() where Routen.abstandM(p[i].lat, p[i].lon, g.punkte[k][0], g.punkte[k][1]) >= Self.nahM {
                return false
            }
            return true
        }
        return ueberlagert?.schluessel == g.schluessel
    }
}
