import Foundation

// Funkprotokoll v1 der Suunto-App, iPhone-Seite (docs/SUUNTO.md „Funkprotokoll") — Port von
// android/.../SuuntoProtokoll.kt, Referenz watch-suunto/test/empfaenger.mjs. Nur Foundation: auf
// der VM mit der Linux-Toolchain kompiliert und gegen die Pakete der echten Uhr-App geprueft
// (watch-suunto/test/swift/, Testvektoren android/app/src/test/resources/suunto/pakete.json).

enum SuuntoProtokoll {
    static let service = "0022C44B-105D-4FBA-842C-F2C3C143EB6B"
    static let schreiben = "0022C44C-105D-4FBA-842C-F2C3C143EB6B"
    static let notify = "0022C44D-105D-4FBA-842C-F2C3C143EB6B"
    static let accelScale = 2048

    struct Hallo { let ver: Int; let hz: Int; let display: Character; let appVer: Int; let uhrId: Int64
                   let sitzung: Int64; let laeuft: Bool; let pause: Bool; let einheit: Int; let stdHash: Int64 }
    struct Block { let nr: Int64; let t: Int64; let werte: [Int16] }
    struct Gps { let nr: Int64; let sek: Int; let lat: Double; let lon: Double; let speed: Double
                 let hr: Int; let acc: Int?; let alt: Int }
    struct Ereignis { let nr: Int; let art: Int; let t: Int64; let sek: Int }

    static let start = 1, pause = 2, weiter = 3, ende = 4, verworfen = 5
}

private extension Array where Element == UInt8 {
    func u8(_ i: Int) -> Int { Int(self[i]) }
    func u16(_ i: Int) -> Int { Int(self[i]) | Int(self[i + 1]) << 8 }
    func i16(_ i: Int) -> Int { Int(Int16(bitPattern: UInt16(u16(i)))) }
    func u32(_ i: Int) -> Int64 { Int64(u16(i)) | Int64(u16(i + 2)) << 16 }
    func i32(_ i: Int) -> Int { Int(Int32(bitPattern: UInt32(truncatingIfNeeded: u32(i)))) }
}

/// Setzt die Pakete einer Aufnahme zusammen (wie SuuntoEmpfang in Kotlin). Quittiert wird nur, was
/// der Aufrufer als gesichert meldet.
final class SuuntoEmpfang {
    private(set) var hallo: SuuntoProtokoll.Hallo?
    var position: (Double, Double)?
    private final class Teil { let nr: Int64; let n: Int; var t: Int64 = 0; var daten: [UInt8]; var hat = Set<Int>()
        init(nr: Int64, n: Int) { self.nr = nr; self.n = n; daten = [UInt8](repeating: 0, count: n * 6) } }
    private var teile: [Int64: Teil] = [:]
    private var gps: [Int64: SuuntoProtokoll.Gps] = [:]
    private var ereignisse: [Int: SuuntoProtokoll.Ereignis] = [:]
    private(set) var blockBis: Int64
    private(set) var gpsBis: Int64
    private(set) var ereigBis = -1
    private var fertigeBloecke: [SuuntoProtokoll.Block] = []
    private var fertigeGps: [SuuntoProtokoll.Gps] = []
    private var neueEreignisse: [SuuntoProtokoll.Ereignis] = []

    init(startBlock: Int64 = -1, startGps: Int64 = -1) { blockBis = startBlock; gpsBis = startGps }

    private func teileZahl(_ n: Int) -> Int { 1 + max(0, (n * 6 - 12 + 17) / 18) }
    private func voll(_ t: Teil) -> Bool { t.hat.count >= teileZahl(t.n) }

    func paket(_ d: Data) { paket([UInt8](d)) }

    func paket(_ p: [UInt8]) {
        guard !p.isEmpty else { return }
        switch p.u8(0) & 15 {
        case 1 where p.count >= 16:
            hallo = .init(ver: p.u8(1), hz: p.u8(2), display: Character(UnicodeScalar(p[3])), appVer: p.u16(4),
                          uhrId: p.u32(6), sitzung: p.u32(10), laeuft: p.u8(14) & 1 != 0, pause: p.u8(14) & 2 != 0,
                          einheit: p.u8(15), stdHash: p.count >= 20 ? p.u32(16) : 0)
        case 2 where p.count >= 8:
            let nr = vollzaehler(p.u16(1), blockBis)
            if nr > blockBis {
                let t = teile[nr] ?? Teil(nr: nr, n: min(25, p.u8(7)))
                teile[nr] = t
                t.t = p.u32(3)
                kopiere(p, 8, t, 0)
                t.hat.insert(0)
            }
        case 3 where p.count >= 2:
            let teil = p.u8(0) >> 4, lo = p.u8(1)
            if teil >= 1, let t = teile.values.filter({ Int($0.nr & 255) == lo && !voll($0) }).max(by: { $0.nr < $1.nr }) {
                kopiere(p, 2, t, 12 + (teil - 1) * 18); t.hat.insert(teil)
            }
        case 4 where p.count >= 19:
            let nr = vollzaehler(p.u16(17), gpsBis), sp = p.u16(11)
            if nr > gpsBis {
                gps[nr] = .init(nr: nr, sek: p.u16(1), lat: Double(p.i32(3)) / 1e7, lon: Double(p.i32(7)) / 1e7,
                                speed: sp == 0xFFFF ? -1 : Double(sp) / 100, hr: p.u8(13),
                                acc: p.u8(14) == 255 ? nil : p.u8(14), alt: p.i16(15))
            }
        case 5 where p.count >= 9:
            let nr = p.u8(1), d = (nr - ereigBis) & 255
            if ereigBis < 0 || (1...127).contains(d) {
                ereignisse[nr] = .init(nr: nr, art: p.u8(2), t: p.u32(3), sek: p.u16(7))
            }
        case 6 where p.count >= 9:
            position = (Double(p.i32(1)) / 1e7, Double(p.i32(5)) / 1e7)
        default: break
        }
        nachziehen()
    }

    private func kopiere(_ p: [UInt8], _ von: Int, _ t: Teil, _ ab: Int) {
        let n = min(p.count - von, t.daten.count - ab)
        if n > 0 && ab >= 0 { for i in 0..<n { t.daten[ab + i] = p[von + i] } }
    }

    private func vollzaehler(_ u: Int, _ bis: Int64) -> Int64 {
        let ref = bis + 1
        var v = ref - ((ref - Int64(u)) & 0xFFFF)
        if ref - v > 0x8000 { v += 0x10000 }
        return v
    }

    private func nachziehen() {
        while true {
            let n = blockBis + 1
            if let t = teile[n], voll(t) {
                var w = [Int16](repeating: 0, count: t.n * 3)
                for i in 0..<(t.n * 3) { w[i] = Int16(bitPattern: UInt16(t.daten[2 * i]) | UInt16(t.daten[2 * i + 1]) << 8) }
                fertigeBloecke.append(.init(nr: n, t: t.t, werte: w)); teile[n] = nil; blockBis = n; continue
            }
            if teile[n] == nil && teile.contains(where: { $0.key > n && voll($0.value) }) { blockBis = n; continue }
            break
        }
        while true {
            let n = gpsBis + 1
            if let g = gps.removeValue(forKey: n) { fertigeGps.append(g); gpsBis = n; continue }
            if gps.keys.contains(where: { $0 > n }) { gpsBis = n; continue }
            break
        }
        while let e = ereignisse.removeValue(forKey: (ereigBis + 1) & 255) { neueEreignisse.append(e); ereigBis = e.nr }
    }

    func abholenBloecke() -> [SuuntoProtokoll.Block] { defer { fertigeBloecke = [] }; return fertigeBloecke }
    func abholenGps() -> [SuuntoProtokoll.Gps] { defer { fertigeGps = [] }; return fertigeGps }
    func abholenEreignisse() -> [SuuntoProtokoll.Ereignis] { defer { neueEreignisse = [] }; return neueEreignisse }

    func quittung(_ blockGesichert: Int64, _ gpsGesichert: Int64) -> [UInt8] {
        let f = (blockGesichert >= 0 ? 1 : 0) | (gpsGesichert >= 0 ? 2 : 0) | (ereigBis >= 0 ? 4 : 0)
        let b = Int(blockGesichert & 0xFFFF), s = Int(gpsGesichert & 0xFFFF)
        return [0x81, UInt8(b & 255), UInt8(b >> 8), UInt8(s & 255), UInt8(s >> 8), UInt8(ereigBis & 255), UInt8(f)]
    }
}

/// Chunks im Upload-Format (docs/data-format.md), ein Index-Zaehler fuer GPS und Accel.
final class SuuntoSammler {
    var naechsterIndex: Int
    let hz: Int
    private var gpsZeilen: [SuuntoProtokoll.Gps] = []
    private var bloecke: [SuuntoProtokoll.Block] = []
    var blockGesichert: Int64 = -1
    var gpsGesichert: Int64 = -1
    private(set) var hrWerte = 0
    static let bloeckeJeChunk = 10, gpsJeChunk = 30

    init(naechsterIndex: Int = 0, hz: Int = 25) { self.naechsterIndex = naechsterIndex; self.hz = hz }

    func nimm(_ bl: [SuuntoProtokoll.Block], _ gp: [SuuntoProtokoll.Gps]) -> [[String: Any]] {
        var aus: [[String: Any]] = []
        for b in bl {
            if let l = bloecke.last {
                let passt = b.nr == l.nr + 1 && b.t == l.t + Int64(l.werte.count / 3 * 1000 / hz)
                if !passt || bloecke.count >= Self.bloeckeJeChunk { aus.append(accelChunk()) }
            }
            bloecke.append(b)
        }
        for g in gp {
            if g.lat == 0 && g.lon == 0 { gpsGesichert = max(gpsGesichert, g.nr); continue }
            gpsZeilen.append(g)
            if gpsZeilen.count >= Self.gpsJeChunk { aus.append(gpsChunk()) }
        }
        return aus
    }

    func leeren() -> [[String: Any]] {
        var aus: [[String: Any]] = []
        if !bloecke.isEmpty { aus.append(accelChunk()) }
        if !gpsZeilen.isEmpty { aus.append(gpsChunk()) }
        return aus
    }

    private func accelChunk() -> [String: Any] {
        var bytes = [UInt8](); bytes.reserveCapacity(bloecke.reduce(0) { $0 + $1.werte.count * 2 })
        for b in bloecke { for v in b.werte { let u = UInt16(bitPattern: v); bytes.append(UInt8(u & 255)); bytes.append(UInt8(u >> 8)) } }
        let n = bytes.count / 6, erst = bloecke[0], letzt = bloecke[bloecke.count - 1]
        let o: [String: Any] = ["index": naechsterIndex, "kind": "accel", "encoding": "int16-b64",
                                "t0_ms": erst.t, "t1_ms": letzt.t + Int64(letzt.werte.count / 3 * 1000 / hz),
                                "count": n, "data": Data(bytes).base64EncodedString()]
        naechsterIndex += 1
        blockGesichert = letzt.nr
        bloecke = []
        return o
    }

    private func gpsChunk() -> [String: Any] {
        var zeilen: [[Any]] = []
        for g in gpsZeilen {
            zeilen.append([g.sek * 1000, g.lat, g.lon, g.speed, g.hr > 0 ? g.hr as Any : NSNull(), g.acc.map { $0 as Any } ?? NSNull()])
            if g.hr > 0 { hrWerte += 1 }
        }
        let o: [String: Any] = ["index": naechsterIndex, "kind": "gps", "encoding": "json",
                                "t0_ms": gpsZeilen[0].sek * 1000, "count": gpsZeilen.count, "data": zeilen]
        naechsterIndex += 1
        gpsGesichert = max(gpsGesichert, gpsZeilen[gpsZeilen.count - 1].nr)
        gpsZeilen = []
        return o
    }
}

/// Ablage je Aufnahme (Ordner suunto-<uhr>-<start>: meta.json, chunk-N.json, zustand.json,
/// complete.json) — dieselben Regeln wie SuuntoAblage in Kotlin.
final class SuuntoAblage {
    final class Laufend {
        let uhrId: Int64, sitzung: Int64, dir: URL, empfang: SuuntoEmpfang, sammler: SuuntoSammler, hz: Int
        var pausen: [[Int64]] = []
        var pauseSeit: Int64 = 0, pauseT: Int64 = 0, letztT: Int64 = 0, letztPaket: Int64 = 0
        var verloren: Int64 = 0, naechsterBlock: Int64 = 0
        init(uhrId: Int64, sitzung: Int64, dir: URL, empfang: SuuntoEmpfang, sammler: SuuntoSammler, hz: Int) {
            self.uhrId = uhrId; self.sitzung = sitzung; self.dir = dir; self.empfang = empfang; self.sammler = sammler; self.hz = hz
        }
    }
    struct Antwort { let quittung: [UInt8]?; let position: (Double, Double)?; let uhrId: Int64; let geaendert: Bool }

    let wurzel: URL
    private let jetzt: () -> Int64
    private(set) var aktuell: Laufend?
    private var hallo: SuuntoProtokoll.Hallo?
    private var vorab = SuuntoEmpfang()

    init(wurzel: URL, jetzt: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.wurzel = wurzel; self.jetzt = jetzt
        try? FileManager.default.createDirectory(at: wurzel, withIntermediateDirectories: true)
    }

    func uuid(_ uhrId: Int64, _ sitzung: Int64) -> String { "suunto-" + String(uhrId, radix: 16) + "-" + String(sitzung) }

    func paket(_ p: [UInt8]) -> Antwort {
        guard !p.isEmpty else { return .init(quittung: nil, position: nil, uhrId: 0, geaendert: false) }
        let typ = Int(p[0]) & 15
        var pos: (Double, Double)?
        var geaendert = false
        if typ == 1 {
            vorab = SuuntoEmpfang(); vorab.paket(p)
            guard let h = vorab.hallo else { return .init(quittung: nil, position: nil, uhrId: 0, geaendert: false) }
            hallo = h
            if let a = aktuell, a.uhrId != h.uhrId || a.sitzung != h.sitzung { abschliessen(a); geaendert = true }
            if h.sitzung != 0 && aktuell == nil { aktuell = oeffnen(h); geaendert = true }
            let q = aktuell.map { $0.empfang.quittung($0.sammler.blockGesichert, $0.sammler.gpsGesichert) }
            return .init(quittung: q, position: nil, uhrId: h.uhrId, geaendert: geaendert)
        }
        if typ == 6 { vorab.paket(p); pos = vorab.position; vorab.position = nil }
        guard let a = aktuell else { return .init(quittung: nil, position: pos, uhrId: hallo?.uhrId ?? 0, geaendert: false) }
        a.letztPaket = jetzt()
        a.empfang.paket(p)
        var chunks: [[String: Any]] = []
        let bl = a.empfang.abholenBloecke()
        for b in bl {
            if b.nr > a.naechsterBlock { a.verloren += b.nr - a.naechsterBlock }
            a.naechsterBlock = b.nr + 1
            a.letztT = max(a.letztT, b.t + Int64(b.werte.count / 3 * 1000 / a.hz))
        }
        let gp = a.empfang.abholenGps()
        for g in gp { a.letztT = max(a.letztT, Int64(g.sek) * 1000) }
        chunks += a.sammler.nimm(bl, gp)
        var ende = false
        for e in a.empfang.abholenEreignisse() {
            geaendert = true
            switch e.art {
            case SuuntoProtokoll.pause: chunks += a.sammler.leeren(); a.pauseSeit = jetzt(); a.pauseT = e.t
            case SuuntoProtokoll.weiter:
                if a.pauseSeit > 0 { a.pausen.append([a.pauseT, jetzt() - a.pauseSeit]) }
                a.pauseSeit = 0
            case SuuntoProtokoll.ende: chunks += a.sammler.leeren(); ende = true
            case SuuntoProtokoll.verworfen:
                try? FileManager.default.removeItem(at: a.dir); aktuell = nil
                return .init(quittung: a.empfang.quittung(a.sammler.blockGesichert, a.sammler.gpsGesichert),
                             position: pos, uhrId: a.uhrId, geaendert: true)
            default: break
            }
        }
        for c in chunks { schreibe(a.dir.appendingPathComponent(String(format: "chunk-%06d.json", c["index"] as? Int ?? 0)), c) }
        if !chunks.isEmpty || geaendert { zustandSpeichern(a) }
        let q = a.empfang.quittung(a.sammler.blockGesichert, a.sammler.gpsGesichert)
        if ende { abschliessen(a); geaendert = true }
        return .init(quittung: q, position: pos, uhrId: a.uhrId, geaendert: geaendert || !chunks.isEmpty)
    }

    /// Regelmaessig: 10 min pausiert oder 30 min stumm -> abschliessen.
    @discardableResult func pruefen() -> Bool {
        guard let a = aktuell else { return false }
        let still = jetzt() - max(a.letztPaket, a.pauseSeit)
        if (a.pauseSeit > 0 && still > 600_000) || still > 1_800_000 { abschliessen(a); return true }
        return false
    }

    private func oeffnen(_ h: SuuntoProtokoll.Hallo) -> Laufend {
        let dir = wurzel.appendingPathComponent(uuid(h.uhrId, h.sitzung))
        let fm = FileManager.default
        if let z = Self.lies(dir.appendingPathComponent("zustand.json")),
           !fm.fileExists(atPath: dir.appendingPathComponent("complete.json").path) {
            let block = (z["block"] as? NSNumber)?.int64Value ?? -1, g = (z["gps"] as? NSNumber)?.int64Value ?? -1
            let hz = (z["hz"] as? Int) ?? h.hz
            let s = SuuntoSammler(naechsterIndex: (z["index"] as? Int) ?? 0, hz: hz)
            s.blockGesichert = block; s.gpsGesichert = g
            let l = Laufend(uhrId: h.uhrId, sitzung: h.sitzung, dir: dir, empfang: SuuntoEmpfang(startBlock: block, startGps: g),
                            sammler: s, hz: hz)
            l.pausen = ((z["pausen"] as? [[NSNumber]]) ?? []).map { $0.map { $0.int64Value } }
            l.pauseSeit = (z["pauseSeit"] as? NSNumber)?.int64Value ?? 0
            l.pauseT = (z["pauseT"] as? NSNumber)?.int64Value ?? 0
            l.letztT = (z["letztT"] as? NSNumber)?.int64Value ?? 0
            l.verloren = (z["verloren"] as? NSNumber)?.int64Value ?? 0
            l.naechsterBlock = block + 1; l.letztPaket = jetzt()
            return l
        }
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let meta: [String: Any] = ["session_uuid": dir.lastPathComponent, "started_at": Self.iso(h.sitzung * 1000),
                                   "sport": "pumpfoil", "gps_hz": 1, "accel_hz": h.hz,
                                   "accel_scale": SuuntoProtokoll.accelScale, "accel_luecken": true,
                                   "device_model": Self.modell(h.display),
                                   "app_version": String(format: "%d.%02d", h.appVer / 100, h.appVer % 100)]
        schreibe(dir.appendingPathComponent("meta.json"), meta)
        let l = Laufend(uhrId: h.uhrId, sitzung: h.sitzung, dir: dir, empfang: SuuntoEmpfang(),
                        sammler: SuuntoSammler(naechsterIndex: 0, hz: h.hz), hz: h.hz)
        l.letztPaket = jetzt()
        zustandSpeichern(l)
        return l
    }

    private func abschliessen(_ a: Laufend) {
        if aktuell === a { aktuell = nil }
        guard FileManager.default.fileExists(atPath: a.dir.appendingPathComponent("meta.json").path) else { return }
        for c in a.sammler.leeren() { schreibe(a.dir.appendingPathComponent(String(format: "chunk-%06d.json", c["index"] as? Int ?? 0)), c) }
        if a.pauseSeit > 0 { a.pausen.append([a.pauseT, jetzt() - a.pauseSeit]) }
        let pausenMs = a.pausen.reduce(Int64(0)) { $0 + $1[1] }
        let c: [String: Any] = ["ended_at": Self.iso(a.sitzung * 1000 + a.letztT + pausenMs),
                                "total_chunks": a.sammler.naechsterIndex, "pauses": a.pausen,
                                "hr_samples": a.sammler.hrWerte, "hr_source": a.sammler.hrWerte > 0 ? "active" : "none",
                                "messweg": ["quelle": "suunto-ble", "hz": a.hz, "verloren_bloecke": a.verloren]]
        zustandSpeichern(a)
        schreibe(a.dir.appendingPathComponent("complete.json"), c)
    }

    private func zustandSpeichern(_ a: Laufend) {
        schreibe(a.dir.appendingPathComponent("zustand.json"), [
            "uhrId": a.uhrId, "sitzung": a.sitzung, "hz": a.hz, "index": a.sammler.naechsterIndex,
            "block": a.sammler.blockGesichert, "gps": a.sammler.gpsGesichert, "pausen": a.pausen,
            "pauseSeit": a.pauseSeit, "pauseT": a.pauseT, "letztT": a.letztT, "verloren": a.verloren])
    }

    /// Atomar (Data.write .atomic): ein Absturz hinterlaesst nie eine halbe Datei.
    private func schreibe(_ url: URL, _ obj: [String: Any]) {
        if let d = try? JSONSerialization.data(withJSONObject: obj) { try? d.write(to: url, options: .atomic) }
    }

    static func lies(_ url: URL) -> [String: Any]? {
        guard let d = try? Data(contentsOf: url) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }

    static func iso(_ ms: Int64) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date(timeIntervalSince1970: Double(ms) / 1000))
    }

    static func modell(_ d: Character) -> String {
        switch d {
        case "n": return "Suunto 9 Peak Pro · SuuntoPlus"
        case "o": return "Suunto Vertical · SuuntoPlus"
        default: return "Suunto Race / Vertical 2 / Ocean · SuuntoPlus"
        }
    }
}

/// Konfiguration fuer die Suunto-Uhr — wie SuuntoKonfig in Kotlin: nur Seiten, Foils, Alarme und Sprache,
/// als ASCII-JSON in KONFIG-Paketen [0x83, nr u16, anzahl u16, bis zu 15 Bytes].
enum SuuntoKonfig {
    static let schluessel = ["views", "offFoilView", "pauseView", "browseAll", "foils", "alarmEnabled",
        "alarmDefault", "speedLow", "speedHigh", "hrHigh", "alarmPatternHigh", "alarmPatternLow", "alarmPatternHr",
        "alarmRepeat", "alarmRepeatS", "runDistM", "runDistMode", "alarmPatternDist", "runTimeS", "runTimeMode",
        "alarmPatternTime", "layoutsOn", "latestVersion", "colorByValue", "hrZones", "speedZones"]
    static let seiten = ["pages", "offFoilPages", "pausePages"]

    /// Freies Layout -> [2, f1..f6] (Wert-Elemente in Lese-Reihenfolge), klassisch bleibt — wie Kotlin.
    static func seiteKurz(_ seite: [Any]) -> [Int]? {
        guard let art = seite.first as? Int else { return nil }
        if art == 0 { return seite.compactMap { $0 as? Int } }
        guard art == 1, seite.count > 2, let els = seite[2] as? [[Any]] else { return nil }
        var werte: [(Int, Int, Int)] = []
        for e in els where e.count > 6 {
            if (e[0] as? Int) == 1, let fid = e[6] as? Int, fid > 0 {
                werte.append(((e[2] as? Int) ?? 0, (e[1] as? Int) ?? 0, fid))
            }
        }
        werte.sort { ($0.0 / 60, $0.1) < ($1.0 / 60, $1.1) }
        var fids: [Int] = []
        for w in werte where !fids.contains(w.2) && fids.count < 6 { fids.append(w.2) }
        return fids.isEmpty ? nil : [2] + fids
    }
    static let spalte: [String: Int] = ["de": 0, "gsw": 1, "de-AT": 2, "en": 3, "fr": 4, "it": 5, "es": 6,
        "pt": 7, "pt-PT": 7, "id": 8, "ru": 9, "nl": 10, "fi": 11, "cs": 12, "ja": 13, "zh": 14]

    /// Werte, die die Uhr ohnehin annimmt (lauf.js Konfig) — weggelassen, ihr Speicher ist ~2 KB klein.
    static let standard: [String: String] = ["views": "[[1,2,0]]", "offFoilView": "[12,17,16]", "pauseView": "[12,20,2]",
        "browseAll": "true", "layoutsOn": "true", "colorByValue": "false", "alarmEnabled": "false",
        "alarmDefault": "\"foil\"", "speedLow": "0", "speedHigh": "0", "hrHigh": "0", "alarmPatternHigh": "\"short2\"",
        "alarmPatternLow": "\"long2\"", "alarmPatternHr": "\"short1\"", "alarmRepeat": "\"once\"", "alarmRepeatS": "5",
        "runDistM": "0", "runDistMode": "\"once\"", "alarmPatternDist": "\"short1\"", "runTimeS": "0",
        "runTimeMode": "\"once\"", "alarmPatternTime": "\"short2\"", "latestVersion": "\"\"",
        "hrZones": "[95,114,133,152,171,190]", "speedZones": "[8,12,16,20,24,28]", "foils": "[]"]

    /// JSON-Text eines Werts zum Vergleich mit `standard` (JSONSerialization schreibt Bool als true/false).
    static func jsonText(_ v: Any) -> String {
        if let s = v as? String { return "\"" + s + "\"" }
        if let d = try? JSONSerialization.data(withJSONObject: [v]), let t = String(data: d, encoding: .utf8) {
            return String(t.dropFirst().dropLast())
        }
        return ""
    }

    static func fuerUhr(_ config: [String: Any], appSprache: String?, uhrStdHash: Int64 = 0) -> String {
        var o: [String: Any] = [:]
        for s in schluessel { if let v = config[s], standard[s] != jsonText(v) { o[s] = v } }
        var std = Set<String>()
        if uhrStdHash != 0, (config["standardHash"] as? NSNumber)?.int64Value == uhrStdHash {
            std = Set((config["standardSeiten"] as? [String]) ?? [])
        }
        // Seiten vollstaendig (die Uhr zeichnet freie Layouts selbst) oder „std" fuer die mitgebrachten
        for s in seiten {
            if std.contains(s) { o[s] = "std" } else if let a = config[s] as? [Any], !a.isEmpty { o[s] = a }
        }
        if let fs = config["foils"] as? [[String: Any]] {
            o["foils"] = fs.isEmpty ? nil : fs.map { f -> [String: Any] in
                ["id": f["id"] ?? NSNull(), "label": String(((f["label"] as? String) ?? "").prefix(24)),
                 "min": f["min"] ?? NSNull(), "max": f["max"] ?? NSNull()]
            }
        }
        var lang = (config["language"] as? String) ?? ""
        if lang.isEmpty { lang = appSprache ?? "" }
        if let s = spalte[lang] { o["spr"] = s }
        let d = (try? JSONSerialization.data(withJSONObject: o)) ?? Data("{}".utf8)
        return ascii(String(decoding: d, as: UTF8.self))
    }

    static func ascii(_ s: String) -> String {
        var b = ""
        for u in s.utf16 {
            if u < 128 { b.append(Character(UnicodeScalar(u)!)) } else { b += String(format: "\\u%04x", u) }
        }
        return b
    }

    static func pakete(_ text: String) -> [[UInt8]] {
        let bytes = Array(text.utf8)
        let n = (bytes.count + 14) / 15
        guard n >= 1 && n <= 0xFFFF else { return [] }
        var aus: [[UInt8]] = []
        for i in 0..<n {
            var p: [UInt8] = [0x83, UInt8(i & 255), UInt8(i >> 8), UInt8(n & 255), UInt8(n >> 8)]
            let bis = min(bytes.count, (i + 1) * 15)
            p.append(contentsOf: bytes[(i * 15)..<bis])
            aus.append(p)
        }
        return aus
    }
}
