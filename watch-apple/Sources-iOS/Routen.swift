import Foundation

// Routen-Vorschlaege aus den verlaesslichen Startplaetzen eines Spots — 1:1 nach
// `web/src/lib/routen.ts` (Jan, 16.10.2026), wie `Routen.kt` in der Android-App. Wer hier etwas
// aendert, aendert es dort mit: alle drei sollen fuer dieselben Startplaetze dieselben Routen liefern
// (geprueft gegen Node-Erwartungen, s. android/app/src/test/resources/routen).
//
// Eine Route beginnt am gewaehlten Start, geht von Platz zu Platz, jeder hoechstens einmal, jeder
// Abschnitt zwischen minM und maxM. Sie hat genau `punkte` Startplaetze (Start mitgezaehlt). Mit
// ohneKreuzung darf kein Abschnitt einen frueheren kreuzen. Sortiert nach Strecke plus Aufschlag fuer
// Kehren spitzer als 90 Grad und fuer doppelt gefahrene Abschnitte.

/// eigen: selbst gesetzter Punkt (nicht aus echten Starts); vomSpot: mit Umkreis false = Nachbarspot.
struct Startposition: Decodable, Equatable {
    var lat: Double
    var lon: Double
    var starts: Int = 0
    var sessions: Int = 0
    var fahrer: Int? = nil
    var vomSpot: Bool? = nil
    var eigen: Bool = false

    enum CodingKeys: String, CodingKey { case lat, lon, starts, sessions, fahrer, vomSpot = "vom_spot" }

    init(lat: Double, lon: Double, starts: Int = 0, sessions: Int = 0, eigen: Bool = false) {
        self.lat = lat; self.lon = lon; self.starts = starts; self.sessions = sessions; self.eigen = eigen
    }

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        starts = (try? c.decode(Int.self, forKey: .starts)) ?? 0
        sessions = (try? c.decode(Int.self, forKey: .sessions)) ?? 0
        fahrer = try? c.decode(Int.self, forKey: .fahrer)
        vomSpot = try? c.decode(Bool.self, forKey: .vomSpot)
    }
}

struct Route: Equatable {
    let punkte: [Int]
    let meter: Double
    let wertung: Double
    let erstesZiel: Int
    let kreuzungen: Int
    let doppelt: Int
    var schluessel: String { punkte.map(String.init).joined(separator: "-") }
}

struct RoutenOptionen {
    var punkte: Int
    var ohneKreuzung: Bool
    var rundkurs: Bool = false
    var jeRichtung: Int = 20
    var ausgeschlossen: Set<Int> = []
    var ziel: Int? = nil
}

struct RoutenErgebnis {
    let routen: [Route]
    let gekuerzt: Bool
}

enum RoutenGrund {
    case nachbar(Int?), zuWenig(Int), rundkurs, kreuzung, punkte(Int), ziel, unbekannt
}

enum Routen {
    static let maxNachbarn = 8
    private static let zeitMs: Double = 150
    private static let zeitJePunkt: Double = 15

    static func abstandM(_ aLat: Double, _ aLon: Double, _ bLat: Double, _ bLon: Double) -> Double {
        let kx: Double = 111320.0 * cos(aLat * .pi / 180)
        return hypot((bLon - aLon) * kx, (bLat - aLat) * 111320.0)
    }
    static func abstandM(_ a: Startposition, _ b: Startposition) -> Double { abstandM(a.lat, a.lon, b.lat, b.lon) }

    /// Schneiden sich a-b und c-d echt (gemeinsame Endpunkte zaehlen nicht)?
    static func kreuzen(_ a: (Double, Double), _ b: (Double, Double), _ c: (Double, Double), _ d: (Double, Double)) -> Bool {
        func o(_ p: (Double, Double), _ q: (Double, Double), _ r: (Double, Double)) -> Double {
            let v: Double = (q.0 - p.0) * (r.1 - p.1) - (q.1 - p.1) * (r.0 - p.0)
            return v > 0 ? 1 : (v < 0 ? -1 : 0)
        }
        return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
    }

    static func vorschlagen(_ p: [Startposition], start: Int, minM: Double, maxM: Double, opt: RoutenOptionen) -> RoutenErgebnis {
        let ziel: Int = Swift.min(Swift.max(2, opt.punkte), p.count - opt.ausgeschlossen.count)
        if p.count < 2 || start < 0 || start >= p.count { return RoutenErgebnis(routen: [], gekuerzt: false) }
        let k: Int = opt.jeRichtung
        let kx: Double = 111320.0 * cos(p[0].lat * .pi / 180)
        let xy: [(Double, Double)] = p.map { ($0.lon * kx, $0.lat * 111320.0) }
        let n: Int = p.count
        var d: [[Double]] = Array(repeating: Array(repeating: 0, count: n), count: n)
        for i in 0..<n { for j in 0..<n { d[i][j] = abstandM(p[i], p[j]) } }
        var nachbarn: [[Int]] = []
        for i in 0..<n {
            let kand: [Int] = (0..<n).filter { j in j != i && d[i][j] >= minM && d[i][j] <= maxM && !opt.ausgeschlossen.contains(j) }
            nachbarn.append(Array(kand.sorted { d[i][$0] < d[i][$1] }.prefix(maxNachbarn)))
        }
        var beste: [[Route]] = Array(repeating: [], count: n)
        var schritte = 0
        var gekuerzt = false
        let bis: Double = Date().timeIntervalSince1970 * 1000 + zeitMs + zeitJePunkt * Double(ziel)
        var weg: [Int] = [start]
        var besucht: Set<Int> = [start]
        let mitZiel: Bool = !opt.rundkurs && opt.ziel != nil && opt.ziel != start

        func kreuztFrueheren(_ i: Int, _ j: Int) -> Bool {
            var q = 0
            while q + 1 < weg.count - 1 {
                if kreuzen(xy[weg[q]], xy[weg[q + 1]], xy[i], xy[j]) { return true }
                q += 1
            }
            return false
        }
        func kehre(_ i: Int, _ j: Int) -> Double {
            if weg.count < 2 { return 0 }
            let h = xy[weg[weg.count - 2]]
            let a: (Double, Double) = (h.0 - xy[i].0, h.1 - xy[i].1)
            let b: (Double, Double) = (xy[j].0 - xy[i].0, xy[j].1 - xy[i].1)
            var nenner: Double = hypot(a.0, a.1) * hypot(b.0, b.1)
            if nenner == 0 { nenner = 1 }
            let w: Double = acos(Swift.max(-1, Swift.min(1, (a.0 * b.0 + a.1 * b.1) / nenner))) * 180 / .pi
            return w < 90 ? (90 - w) / 90 * d[i][j] : 0
        }
        func schranke(_ r: Int) -> Double { beste[r].count < k ? .infinity : beste[r][k - 1].wertung }

        func gehe(_ i: Int, _ meter0: Double, _ wertung0: Double, _ r: Int) {
            if gekuerzt { return }
            schritte += 1
            if (schritte & 1023) == 0 && Date().timeIntervalSince1970 * 1000 > bis { gekuerzt = true; return }
            var meter = meter0
            var wertung = wertung0
            if wertung >= schranke(r) { return }
            if weg.count == ziel {
                var punkte = weg
                if opt.rundkurs {
                    if d[i][start] < minM || d[i][start] > maxM { return }
                    if opt.ohneKreuzung && kreuztFrueheren(i, start) { return }
                    wertung += d[i][start] + kehre(i, start)
                    meter += d[i][start]
                    if wertung >= schranke(r) { return }
                    punkte = weg + [start]
                }
                var gesehen = Set<String>()
                var doppelt = 0
                for q in 0..<(punkte.count - 1) {
                    let a = punkte[q], b = punkte[q + 1]
                    let s: String = a < b ? "\(a)-\(b)" : "\(b)-\(a)"
                    if gesehen.contains(s) { doppelt += 1; wertung += d[a][b] } else { gesehen.insert(s) }
                }
                if wertung >= schranke(r) { return }
                var kreuzungen = 0
                for q in 0..<(punkte.count - 1) {
                    var u = q + 2
                    while u + 1 < punkte.count {
                        if kreuzen(xy[punkte[q]], xy[punkte[q + 1]], xy[punkte[u]], xy[punkte[u + 1]]) { kreuzungen += 1 }
                        u += 1
                    }
                }
                var liste = beste[r]
                liste.append(Route(punkte: punkte, meter: meter, wertung: wertung, erstesZiel: r, kreuzungen: kreuzungen, doppelt: doppelt))
                // stabil wie Array.prototype.sort / Kotlin sortBy
                liste = liste.enumerated().sorted { ($0.element.wertung, $0.offset) < ($1.element.wertung, $1.offset) }.map { $0.element }
                if liste.count > k { liste.removeLast() }
                beste[r] = liste
                return
            }
            for j in nachbarn[i] {
                if besucht.contains(j) { continue }
                if mitZiel && ((j == opt.ziel) != (weg.count == ziel - 1)) { continue }
                if opt.ohneKreuzung && kreuztFrueheren(i, j) { continue }
                let rr: Int = weg.count == 1 ? j : r
                let kk: Double = kehre(i, j)
                besucht.insert(j); weg.append(j)
                gehe(j, meter + d[i][j], wertung + d[i][j] + kk, rr)
                weg.removeLast(); besucht.remove(j)
            }
        }
        gehe(start, 0, 0, 0)
        let alle: [Route] = beste.flatMap { $0 }
        let sortiert: [Route] = alle.enumerated().sorted { ($0.element.wertung, $0.offset) < ($1.element.wertung, $1.offset) }.map { $0.element }
        return RoutenErgebnis(routen: sortiert, gekuerzt: gekuerzt)
    }

    /// Kurzbeschreibung relativ zum Bezugspunkt, z. B. „130 m SW", ab 1 km in km.
    static func lageText(_ pLat: Double, _ pLon: Double, _ bLat: Double, _ bLon: Double, richtungen: [String], sprache: String) -> String {
        let m: Double = abstandM(bLat, bLon, pLat, pLon)
        if m < 15 { return "" }
        let kx: Double = 111320.0 * cos(bLat * .pi / 180)
        let w: Double = atan2((pLon - bLon) * kx, (pLat - bLat) * 111320.0) * 180 / .pi
        let idx: Int = Int((((w + 360).truncatingRemainder(dividingBy: 360)) / 45).rounded()) % 8
        let r: String = idx < richtungen.count ? richtungen[idx] : ""
        if m < 1000 { return "\(Int((m / 10).rounded()) * 10) m \(r)" }
        let f = NumberFormatter()
        f.locale = Locale(identifier: sprache)
        f.maximumFractionDigits = 1
        f.minimumFractionDigits = 0
        return "\(f.string(from: NSNumber(value: m / 1000)) ?? "") km \(r)"
    }

    /// Warum keine Route — die erste gelockerte Einstellung, mit der es ginge.
    static func warumKeine(_ pos: [Startposition], start: Int, minM: Double, maxM: Double, opt: RoutenOptionen) -> RoutenGrund {
        let aus = opt.ausgeschlossen
        let verfuegbar: Int = pos.count - aus.count
        if verfuegbar < Swift.max(2, opt.punkte) { return .zuWenig(verfuegbar) }
        let andere: [Int] = pos.indices.filter { $0 != start && !aus.contains($0) }
        let abst: [Double] = andere.map { abstandM(pos[start], pos[$0]) }
        if !abst.contains(where: { $0 >= minM && $0 <= maxM }) { return .nachbar(abst.min().map { Int($0.rounded()) }) }
        func geht(_ o: RoutenOptionen) -> Bool {
            var o2 = o; o2.jeRichtung = 1
            return !vorschlagen(pos, start: start, minM: minM, maxM: maxM, opt: o2).routen.isEmpty
        }
        if opt.rundkurs { var o = opt; o.rundkurs = false; if geht(o) { return .rundkurs } }
        if !opt.rundkurs && opt.ziel != nil { var o = opt; o.ziel = nil; if geht(o) { return .ziel } }
        if opt.ohneKreuzung { var o = opt; o.ohneKreuzung = false; if geht(o) { return .kreuzung } }
        var n = opt.punkte - 1
        while n >= 2 { var o = opt; o.punkte = n; if geht(o) { return .punkte(n) }; n -= 1 }
        return .unbekannt
    }

    /// Name eines Startplatzes: A … Z, AA, AB …
    static func platzName(_ i: Int) -> String {
        var n = i
        var s = ""
        repeat {
            s = String(UnicodeScalar(UInt8(65 + n % 26))) + s
            n = n / 26 - 1
        } while n >= 0
        return s
    }
}

// MARK: - Modelle vom Server

/// Beliebiger JSON-Wert — fuer die Einstellungen einer gemerkten Route, die roh zurueckkommen.
enum JSONWert: Decodable, Equatable {
    case zahl(Double), wahr(Bool), text(String), liste([JSONWert]), objekt([String: JSONWert]), leer

    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if c.decodeNil() { self = .leer }
        else if let b = try? c.decode(Bool.self) { self = .wahr(b) }
        else if let z = try? c.decode(Double.self) { self = .zahl(z) }
        else if let t = try? c.decode(String.self) { self = .text(t) }
        else if let l = try? c.decode([JSONWert].self) { self = .liste(l) }
        else if let o = try? c.decode([String: JSONWert].self) { self = .objekt(o) }
        else { self = .leer }
    }
    var zahl: Double? { if case .zahl(let z) = self { return z }; return nil }
    var wahr: Bool? { if case .wahr(let b) = self { return b }; return nil }
    var liste: [JSONWert]? { if case .liste(let l) = self { return l }; return nil }
    /// [lat, lon] -> Paar
    var koord: (Double, Double)? {
        guard let l = liste, l.count == 2, let a = l[0].zahl, let b = l[1].zahl else { return nil }
        return (a, b)
    }
    var koordListe: [(Double, Double)] { liste?.compactMap { $0.koord } ?? [] }
}

/// Gemerkte Route (GET /spot/{id}/routen bzw. /routen): nur Datum, nie wer.
struct GemerkteRoute: Decodable, Identifiable, Equatable {
    var id: Int? = nil
    var schluessel: String = ""
    var gemerktAm: String = ""
    var punkte: [[Double]] = []
    var meter: Int = 0
    var eigeneId: Int? = nil
    var einstellungen: [String: JSONWert] = [:]
    var spotId: Int? = nil
    var spotName: String? = nil

    enum CodingKeys: String, CodingKey {
        case id, schluessel, punkte, meter, einstellungen
        case gemerktAm = "gemerkt_am", eigeneId = "eigene_id", spotId = "spot_id", spotName = "spot_name"
    }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = try? c.decode(Int.self, forKey: .id)
        schluessel = (try? c.decode(String.self, forKey: .schluessel)) ?? ""
        gemerktAm = (try? c.decode(String.self, forKey: .gemerktAm)) ?? ""
        punkte = (try? c.decode([[Double]].self, forKey: .punkte)) ?? []
        meter = (try? c.decode(Int.self, forKey: .meter)) ?? 0
        eigeneId = try? c.decode(Int.self, forKey: .eigeneId)
        einstellungen = (try? c.decode([String: JSONWert].self, forKey: .einstellungen)) ?? [:]
        spotId = try? c.decode(Int.self, forKey: .spotId)
        spotName = try? c.decode(String.self, forKey: .spotName)
    }

    /// Startplaetze und laengster Abschnitt fuer die Kaertchen.
    var kurz: (starts: Int, maxM: Int) {
        guard punkte.count >= 2 else { return (punkte.count, 0) }
        let rund: Bool = punkte.count > 2 && Routen.abstandM(punkte[0][0], punkte[0][1], punkte[punkte.count - 1][0], punkte[punkte.count - 1][1]) < 1
        var hoechst: Double = 0
        for k in 1..<punkte.count { hoechst = Swift.max(hoechst, Routen.abstandM(punkte[k - 1][0], punkte[k - 1][1], punkte[k][0], punkte[k][1])) }
        return (rund ? punkte.count - 1 : punkte.count, Int(hoechst))
    }
    /// Enthaelt die Route selbst gesetzte Punkte? -> „manuell".
    var mitEigenen: Bool {
        let e = einstellungen["eigene"]?.koordListe ?? []
        return punkte.contains { p in e.contains { Routen.abstandM(p[0], p[1], $0.0, $0.1) < 5 } }
    }
    /// Datum in der App-Sprache (Tag, Monat, Jahr).
    func datum(_ sprache: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let d: Date? = iso.date(from: gemerktAm) ?? { let i2 = ISO8601DateFormatter(); return i2.date(from: gemerktAm) }()
        guard let d else { return String(gemerktAm.prefix(10)) }
        let f = DateFormatter()
        f.locale = Locale(identifier: sprache)
        f.dateStyle = .short
        f.timeStyle = .none
        return f.string(from: d)
    }
}

/// Schutzgebiete im Ausschnitt (app/schutzgebiete.py). Ringe als [[lat, lon], …].
struct SchutzAntwort: Decodable {
    var zuWeit: Bool = false
    var unvollstaendig: Bool = false
    var flaechen: [SchutzFlaeche] = []
    enum CodingKeys: String, CodingKey { case zuWeit = "zu_weit", unvollstaendig, flaechen }
}

struct SchutzFlaeche: Decodable, Equatable {
    var id: String = ""
    var art: String = ""
    var name: String = ""
    var titel: String = ""
    var aussen: [[[Double]]] = []
    var innen: [[[Double]]] = []
}
