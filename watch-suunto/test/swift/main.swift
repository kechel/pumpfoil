// Prueft watch-apple/Sources-iOS/SuuntoProtokoll.swift auf Linux gegen die Pakete der echten Uhr-App.
// Aufruf: watch-suunto/test/swift/pruefen.sh
import Foundation

func fail(_ s: String) -> Never { print("FEHLER: " + s); exit(1) }
let args = CommandLine.arguments
let g = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [String: Any]
let pakete = (g["pakete"] as! [[Int]]).map { $0.map { UInt8($0) } }
let soll = g["erwartet"] as! [String: Any]

// 1) Empfang wie die Referenz
let e = SuuntoEmpfang()
var bl: [SuuntoProtokoll.Block] = [], gp: [SuuntoProtokoll.Gps] = [], er: [SuuntoProtokoll.Ereignis] = []
for p in pakete { e.paket(p); bl += e.abholenBloecke(); gp += e.abholenGps(); er += e.abholenEreignisse() }
let sb = soll["bloecke"] as! [[String: Any]]
if sb.count != bl.count { fail("Bloecke \(bl.count) statt \(sb.count)") }
for (i, o) in sb.enumerated() {
    if (o["t"] as! Int) != Int(bl[i].t) { fail("Block \(i) t") }
    if (o["werte"] as! [Int]) != bl[i].werte.map({ Int($0) }) { fail("Block \(i) Werte") }
}
let sg = soll["gps"] as! [[String: Any]]
if sg.count != gp.count { fail("GPS \(gp.count) statt \(sg.count)") }
for (i, o) in sg.enumerated() where abs((o["lat"] as! Double) - gp[i].lat) > 1e-9 { fail("GPS \(i) lat") }
let arten = (soll["ereignisse"] as! [[String: Any]]).map { $0["art"] as! Int }
if arten != er.map({ $0.art }) { fail("Ereignisse \(er.map { $0.art }) statt \(arten)") }
if e.hallo?.uhrId != Int64((soll["hallo"] as! [String: Any])["uhrId"] as! Int) { fail("Hallo") }

// 2) Ablage: dieselben Dateien wie die Android-Ablage (Fixture des Server-Tests)
let dir = URL(fileURLWithPath: args[2]).appendingPathComponent("ablage-\(getpid())")
var uhr: Int64 = 1_000_000
let ab = SuuntoAblage(wurzel: dir, jetzt: { uhr })
var pos: (Double, Double)?
for p in pakete { uhr += 50; if let x = ab.paket(p).position { pos = x } }
if pos == nil { fail("Position") }
let fix = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[3]))) as! [String: String]
let ordner = try! FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
if ordner.count != 1 { fail("Ordner \(ordner.count)") }
let s = ordner[0]
func json(_ t: String) -> NSDictionary { try! JSONSerialization.jsonObject(with: t.data(using: .utf8)!) as! NSDictionary }
var n = 0
for (name, inhalt) in fix {
    guard let d = try? Data(contentsOf: s.appendingPathComponent(name)) else { fail("Datei fehlt: \(name)") }
    let ich = try! JSONSerialization.jsonObject(with: d) as! NSDictionary
    let ref = json(inhalt)
    // ended_at/started_at: gleiche Zeit, iOS schreibt Millisekunden mit
    for k in ref.allKeys as! [String] where k != "ended_at" && k != "started_at" {
        if !((ref[k] as! NSObject).isEqual(ich[k])) { fail("\(name): \(k) weicht ab: \(ich[k] ?? "nil") / \(ref[k]!)") }
    }
    n += 1
}
try? FileManager.default.removeItem(at: dir)
print("OK: \(bl.count) Bloecke, \(gp.count) GPS, \(er.count) Ereignisse, \(n) Dateien wie Android")

// 3) Konfiguration: Server-Text in Teilen <= 20 Bytes, wieder zusammensetzbar
let kt = String(repeating: "{\"P\":[\"1,4;1,dw,8c,7,0,4,1\"],\"F\":\"s\",\"sh\":24}", count: 5)
let kp = SuuntoKonfig.pakete(kt)
if kp.contains(where: { $0.count > 20 || $0[0] != 0x83 || (Int($0[3]) | Int($0[4]) << 8) != kp.count }) { fail("Konfig Pakete") }
if String(decoding: kp.flatMap { $0.dropFirst(5) }, as: UTF8.self) != kt { fail("Konfig zusammensetzen") }
print("OK: Konfiguration \(kt.utf8.count) Bytes in \(kp.count) Paketen")
