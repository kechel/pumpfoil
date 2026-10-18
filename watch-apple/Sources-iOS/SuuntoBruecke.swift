import CoreBluetooth
import SwiftUI

// Bruecke fuer die SuuntoPlus-App (watch-suunto/, docs/SUUNTO.md), 17.10.2026 — Gegenstueck zu
// android/.../SuuntoBruecke.kt. Ist „Rohdaten ans Handy" an, verbindet sich die Suunto-App als
// Bluetooth-Central mit diesem iPhone: wir sind Peripheral (GATT-Server) und werben die Service-UUID.
// Pakete -> SuuntoAblage (SuuntoProtokoll.swift, auf Linux gegen die echte Uhr-App geprueft) ->
// Upload mit eigenem Token je Uhr: laufend, `/analyze` in der Pause, `/complete` am Ende.
//
// iOS-Grenze: im Hintergrund wirbt iOS die Service-UUID nur im „Overflow"-Bereich, den eine Suunto
// nicht findet. Die Verbindung muss also bei offener App zustande kommen; einmal verbunden, haelt sie
// im Hintergrund (UIBackgroundModes bluetooth-peripheral). Darum sagt die Karte das ausdruecklich.

final class SuuntoBruecke: NSObject, ObservableObject, CBPeripheralManagerDelegate {
    static let shared = SuuntoBruecke()

    struct Stand {
        var an = UserDefaults.standard.bool(forKey: "suunto_an")
        var werben = false
        var verbunden = false
        var uhr = ""
        var aufnahme = false
        var empfangenS = 0
        var verlorenS = 0
        var offen = 0
        var laedt = false
        var fehler = ""
    }
    @Published var stand = Stand()

    static let wurzel: URL = {
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("suunto-sessions", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()

    private var pm: CBPeripheralManager?
    private var notifyChar: CBMutableCharacteristic?
    private var zentralen: [CBCentral] = []
    private lazy var ablage = SuuntoAblage(wurzel: Self.wurzel)
    private var offeneQuittung: Data?
    private var letzteQuittung = Date.distantPast
    private var warteschlange: [Data] = []     // Notify: Konfiguration; die Quittung geht immer vor
    private var konfigFuer: Int64 = -1
    private var halloUhr: Int64 = 0
    private var halloOhneAufnahme = false
    private var takt: Timer?
    private var laedtGerade = false
    private var sekunden = 0
    private var iphoneNimmtAuf = false     // PhoneRecorder ist @MainActor -> je Sekunde hierher gespiegelt

    func start() {
        stand.offen = Self.offen()
        if stand.an { einschalten() }
        hochladen()
    }

    func einschalten() {
        UserDefaults.standard.set(true, forKey: "suunto_an")
        stand.an = true
        if pm == nil {
            // Wiederherstellung: iOS weckt die App, wenn die Uhr im Hintergrund schreibt.
            pm = CBPeripheralManager(delegate: self, queue: nil,
                                     options: [CBPeripheralManagerOptionRestoreIdentifierKey: "pumpfoil-suunto"])
        }
        if takt == nil {
            takt = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.sekunde() }
        }
    }

    func ausschalten() {
        UserDefaults.standard.set(false, forKey: "suunto_an")
        pm?.stopAdvertising(); pm?.removeAllServices(); pm = nil
        takt?.invalidate(); takt = nil
        stand.an = false; stand.werben = false; stand.verbunden = false
    }

    private func sekunde() {
        Task { @MainActor in self.iphoneNimmtAuf = PhoneRecorder.shared.recording }
        if sekunden % 5 == 0 && !zentralen.isEmpty {
            warteschlange.removeAll { $0.first == 0x82 }
            warteschlange.append(statusPaket())
        }
        quittungSenden(sofort: true)
        if ablage.pruefen() { melden(); hochladen() }
        sekunden += 1
        if sekunden % 20 == 0 { hochladen() }      // laufend hochladen
    }

    // MARK: CBPeripheralManagerDelegate

    func peripheralManagerDidUpdateState(_ p: CBPeripheralManager) {
        switch p.state {
        case .poweredOn:
            stand.fehler = ""
            dienstAnlegen(p)
        case .unauthorized: stand.fehler = "rechte"; stand.werben = false
        case .poweredOff: stand.fehler = "bt"; stand.werben = false
        default: stand.werben = false
        }
    }

    func peripheralManager(_ p: CBPeripheralManager, willRestoreState dict: [String: Any]) {
        if let s = (dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService])?.first {
            notifyChar = s.characteristics?.first { $0.uuid == CBUUID(string: SuuntoProtokoll.notify) } as? CBMutableCharacteristic
        }
    }

    private func dienstAnlegen(_ p: CBPeripheralManager) {
        if notifyChar == nil {
            let schreiben = CBMutableCharacteristic(type: CBUUID(string: SuuntoProtokoll.schreiben),
                                                    properties: [.write, .writeWithoutResponse], value: nil, permissions: [.writeable])
            let n = CBMutableCharacteristic(type: CBUUID(string: SuuntoProtokoll.notify),
                                            properties: [.notify, .read], value: nil, permissions: [.readable])
            let s = CBMutableService(type: CBUUID(string: SuuntoProtokoll.service), primary: true)
            s.characteristics = [schreiben, n]
            p.add(s)
            notifyChar = n
        }
        // Die Uhr sucht die 128-bit-Service-UUID in der Werbung (searchParam 6/7), kein Name noetig.
        p.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [CBUUID(string: SuuntoProtokoll.service)]])
    }

    func peripheralManagerDidStartAdvertising(_ p: CBPeripheralManager, error: Error?) {
        stand.werben = error == nil
        if let e = error { stand.fehler = "werben \(e.localizedDescription)" }
    }

    func peripheralManager(_ p: CBPeripheralManager, central: CBCentral, didSubscribeTo c: CBCharacteristic) {
        if !zentralen.contains(where: { $0.identifier == central.identifier }) { zentralen.append(central) }
        stand.verbunden = true
        quittungSenden(sofort: true)
    }

    func peripheralManager(_ p: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom c: CBCharacteristic) {
        zentralen.removeAll { $0.identifier == central.identifier }
        stand.verbunden = !zentralen.isEmpty
        if zentralen.isEmpty {
            warteschlange = []; konfigFuer = -1
            // Funk weg, waehrend die Uhr im Startzustand war: App verlassen, ohne aufzunehmen
            if halloOhneAufnahme && ablage.aktuell == nil { appGeschlossen(halloUhr) }
            halloOhneAufnahme = false
        }
    }

    func peripheralManager(_ p: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        // Erst ablegen, dann antworten: die Uhr schickt das naechste Paket erst nach WRITE_DONE.
        for r in requests where r.characteristic.uuid == CBUUID(string: SuuntoProtokoll.schreiben) {
            if let v = r.value { verarbeiten([UInt8](v)) }
            if !zentralen.contains(where: { $0.identifier == r.central.identifier }) {
                zentralen.append(r.central); stand.verbunden = true
            }
        }
        if let erste = requests.first { p.respond(to: erste, withResult: .success) }
    }

    func peripheralManager(_ p: CBPeripheralManager, didReceiveRead r: CBATTRequest) {
        r.value = offeneQuittung ?? Data()
        p.respond(to: r, withResult: .success)
    }

    func peripheralManagerIsReady(toUpdateSubscribers p: CBPeripheralManager) { quittungSenden(sofort: true) }

    private func verarbeiten(_ p: [UInt8]) {
        let a = ablage.paket(p)
        if (p.first ?? 0) & 15 == 1 {
            let e = SuuntoEmpfang(); e.paket(p)
            if let h = e.hallo {
                halloUhr = h.uhrId; halloOhneAufnahme = h.sitzung == 0
                stand.uhr = SuuntoAblage.modell(h.display).components(separatedBy: " ·").first ?? "Suunto"
                if konfigFuer != h.uhrId { konfigFuer = h.uhrId; konfigSenden(h) }
            }
        }
        if let pos = a.position { position(uhrId: a.uhrId, lat: pos.0, lon: pos.1) }
        if let q = a.quittung { offeneQuittung = Data(q) }
        melden()
        if a.geaendert { hochladen() }
        quittungSenden(sofort: false)
    }

    private func melden() {
        if let l = ablage.aktuell {
            stand.aufnahme = true
            stand.empfangenS = Int(l.sammler.blockGesichert + 1) * 25 / max(1, l.hz)
            stand.verlorenS = Int(l.verloren) * 25 / max(1, l.hz)
        } else { stand.aufnahme = false }
    }

    /// Quittung hoechstens alle 250 ms (oder sofort); danach, was in der Warteschlange steht.
    private func quittungSenden(sofort: Bool) {
        guard let n = notifyChar, let p = pm, !zentralen.isEmpty else { return }
        if let q = offeneQuittung, sofort || Date().timeIntervalSince(letzteQuittung) >= 0.25 {
            letzteQuittung = Date()
            if !p.updateValue(q, for: n, onSubscribedCentrals: zentralen) { return }   // voll: isReady ruft wieder
        }
        while let erstes = warteschlange.first {
            if !p.updateValue(erstes, for: n, onSubscribedCentrals: zentralen) { return }
            warteschlange.removeFirst()
        }
    }

    /// Seiten, Alarme und Sprache aus dem Profil an die Uhr (einmal je Verbindung).
    private func konfigSenden(_ h: SuuntoProtokoll.Hallo) {
        Task { @MainActor in
            let v = String(format: "%d.%02d", h.appVer / 100, h.appVer % 100)
            guard let t = await token(h.uhrId, SuuntoAblage.modell(h.display)),
                  let url = URL(string: Api.baseURL + "/api/devices/config-kompakt?p=suunto&std=\(h.stdHash)&v=" + v)
            else { konfigFuer = -1; return }
            var req = URLRequest(url: url); req.setValue(t, forHTTPHeaderField: "X-Device-Token")
            guard let (d, r) = try? await URLSession.shared.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200
            else { konfigFuer = -1; return }
            let text = String(decoding: d, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            warteschlange += SuuntoKonfig.pakete(text).map { Data($0) }
            quittungSenden(sofort: true)
        }
    }

    /// STATUS fuer die Uhr: bit0 Konto, bit1 Server erreichbar, bit2 laedt hoch, bit3 iPhone nimmt selbst auf.
    private func statusPaket() -> Data {
        let konto = Api.token != nil
        let online = !stand.fehler.hasPrefix("upload")
        let f = (konto ? 1 : 0) | (online ? 2 : 0) | (stand.laedt || stand.offen > 0 ? 4 : 0)
            | (iphoneNimmtAuf ? 8 : 0)
        let n = min(max(stand.offen, 0), 0xFFFF)
        return Data([0x82, UInt8(f), UInt8(n & 255), UInt8(n >> 8)])
    }

    /// Uhr-App ohne Aufnahme verlassen — wie die anderen Uhren POST /devices/app-closed (nur mit vorhandenem Token).
    private func appGeschlossen(_ uhrId: Int64) {
        guard let t = UserDefaults.standard.string(forKey: "suunto_token_" + String(uhrId, radix: 16)) else { return }
        Task { _ = try? await Self.post("/api/devices/app-closed", [:], t) }
    }

    /// Erster GPS-Fix der Uhr im Startzustand -> „gerade am Pumpen" (POST /devices/position).
    private func position(uhrId: Int64, lat: Double, lon: Double) {
        Task {
            guard let t = await token(uhrId, "Suunto") else { return }
            _ = try? await Self.post("/api/devices/position", ["lat": lat, "lon": lon], t)
        }
    }

    /// Sessions, die noch (ganz oder teilweise) zum Server muessen.
    private static func offen() -> Int {
        ((try? FileManager.default.contentsOfDirectory(at: wurzel, includingPropertiesForKeys: nil)) ?? [])
            .filter { FileManager.default.fileExists(atPath: $0.appendingPathComponent("meta.json").path) }.count
    }

    /// Ein Token je Uhr, einmal gemintet; danach /config?p=suunto, damit der Server die Plattform kennt
    /// (wie SuuntoBruecke.kt `token`). Schluessel wie in `appGeschlossen`.
    private func token(_ uhrId: Int64, _ label: String) async -> String? {
        let key = "suunto_token_" + String(uhrId, radix: 16)
        if let t = UserDefaults.standard.string(forKey: key) { return t }
        guard let t = try? await Api.mintDeviceToken(label: String(label.prefix(60))) else { return nil }
        UserDefaults.standard.set(t, forKey: key)
        if let url = URL(string: Api.baseURL + "/api/devices/config?p=suunto&v=1.00") {
            var req = URLRequest(url: url); req.setValue(t, forHTTPHeaderField: "X-Device-Token")
            _ = try? await URLSession.shared.data(for: req)
        }
        return t
    }

    func hochladen() {
        if laedtGerade { return }
        laedtGerade = true
        stand.laedt = true
        let ordner = ((try? FileManager.default.contentsOfDirectory(at: Self.wurzel, includingPropertiesForKeys: nil)) ?? [])
        Task { @MainActor in
            for dir in ordner {
                do { try await session(dir) }
                catch let e as PhoneIngest.IngestError {
                    if e.status == 401 {
                        for k in UserDefaults.standard.dictionaryRepresentation().keys where k.hasPrefix("suunto_token_") {
                            UserDefaults.standard.removeObject(forKey: k)
                        }
                    }
                    stand.fehler = "upload \(e.status)"
                } catch { stand.fehler = "upload" }
            }
            laedtGerade = false
            stand.laedt = false
            stand.offen = Self.offen()
        }
    }

    private func session(_ dir: URL) async throws {
        let name = dir.lastPathComponent
        guard name.range(of: "^suunto-[0-9a-f]{1,8}-[0-9]{1,12}$", options: .regularExpression) != nil,
              var meta = SuuntoAblage.lies(dir.appendingPathComponent("meta.json")),
              let z = SuuntoAblage.lies(dir.appendingPathComponent("zustand.json")) else { return }
        if (meta["session_uuid"] as? String) != name { try? FileManager.default.removeItem(at: dir); return }
        let completeURL = dir.appendingPathComponent("complete.json")
        let fertig = FileManager.default.fileExists(atPath: completeURL.path)
        let chunks = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.lastPathComponent.hasPrefix("chunk-") && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { SuuntoAblage.lies($0) }
        if !fertig && chunks.isEmpty { return }
        let uhrId = (z["uhrId"] as? NSNumber)?.int64Value ?? 0
        guard let tok = await token(uhrId, (meta["device_model"] as? String) ?? "Suunto") else { return }
        if fertig { meta["expected_chunks"] = chunks.count }
        let antwort = try await Self.post("/api/ingest/session", meta, tok)
        let da = Set((antwort["received_chunks"] as? [Int]) ?? [])
        let fehlen = chunks.filter { !da.contains(($0["index"] as? Int) ?? -1) }
            .sorted { (($0["kind"] as? String) == "gps" ? 0 : 1) < (($1["kind"] as? String) == "gps" ? 0 : 1) }
        var i = 0
        while i < fehlen.count {
            let paket = Array(fehlen[i..<min(i + 30, fehlen.count)])
            let r = try await Self.post("/api/ingest/session/\(name)/chunks", ["chunks": paket], tok)
            if ((r["received"] as? [Int])?.count ?? 0) < paket.count { throw PhoneIngest.IngestError(status: 500) }
            i += 30
        }
        if fertig {
            _ = try await Self.post("/api/ingest/session/\(name)/complete", SuuntoAblage.lies(completeURL) ?? [:], tok)
            try? FileManager.default.removeItem(at: dir)   // erst NACH /complete
        } else if let seit = (z["pauseSeit"] as? NSNumber)?.int64Value, seit > 0 {
            // In der Pause einmal auswerten lassen: die Session erscheint live mit den Laeufen bis hier.
            let merker = dir.appendingPathComponent("analysiert-\(seit)")
            if !FileManager.default.fileExists(atPath: merker.path) {
                _ = try await Self.post("/api/ingest/session/\(name)/analyze", [:], tok)
                FileManager.default.createFile(atPath: merker.path, contents: Data())
            }
        }
    }

    private static func post(_ path: String, _ body: [String: Any], _ token: String) async throws -> [String: Any] {
        guard let url = URL(string: Api.baseURL + path) else { throw PhoneIngest.IngestError(status: -1) }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "X-Device-Token")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if !(200...299).contains(code) { throw PhoneIngest.IngestError(status: code) }
        return ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
    }
}

// MARK: - Karte im Uhren-Bereich

/// „Suunto-Uhr (Beta)" — nur mit verknuepftem Suunto-Konto oder eingeschaltetem Empfang.
struct SuuntoKarte: View {
    @ObservedObject private var b = SuuntoBruecke.shared
    @AppStorage("appLang") private var lang = "de"
    @State private var verknuepft = false

    var body: some View {
        Group {
            if verknuepft || b.stand.an {
                Section(SuuntoTexte.t("suunto.title", lang)) {
                    Text(SuuntoTexte.t("suunto.body", lang)).font(.callout)
                    zustand
                    fehler
                    knoepfe
                }
            }
        }
        .task {
            b.start()
            verknuepft = ((try? await Api.integrationStatus("suunto"))?.linked) ?? false
        }
    }

    @ViewBuilder private var zustand: some View {
        let s = b.stand
        if s.an {
            if s.verbunden && s.aufnahme {
                Text(SuuntoTexte.t("suunto.receiving", lang).replacingOccurrences(of: "{s}", with: String(s.empfangenS / 60))).font(.callout)
            } else if s.verbunden {
                Text(SuuntoTexte.t("suunto.connected", lang).replacingOccurrences(of: "{uhr}", with: s.uhr.isEmpty ? "Suunto" : s.uhr)).font(.callout)
            } else if s.werben {
                Text(SuuntoTexte.t("suunto.waiting", lang)).font(.callout)
            }
            if s.verlorenS > 0 {
                Text(SuuntoTexte.t("suunto.lost", lang).replacingOccurrences(of: "{s}", with: String(s.verlorenS)))
                    .font(.callout).foregroundStyle(.red)
            }
        }
        if s.offen > 0 && !s.aufnahme {
            Text(HuaweiTexte.t("huawei.pending", lang).replacingOccurrences(of: "{n}", with: String(s.offen))).font(.callout)
        }
    }

    @ViewBuilder private var fehler: some View {
        let f = b.stand.fehler
        if !f.isEmpty {
            Text(f == "rechte" ? SuuntoTexte.t("suunto.errPerm", lang)
                 : f == "bt" ? SuuntoTexte.t("suunto.errBt", lang)
                 : HuaweiTexte.t("huawei.errOther", lang).replacingOccurrences(of: "{f}", with: f))
                .font(.callout).foregroundStyle(.red)
        }
    }

    @ViewBuilder private var knoepfe: some View {
        if b.stand.offen > 0 && !b.stand.laedt {
            Button(HuaweiTexte.t("huawei.retry", lang)) { b.hochladen() }
        }
        if b.stand.an {
            Button(SuuntoTexte.t("suunto.off", lang)) { b.ausschalten() }
        } else {
            Button(SuuntoTexte.t("suunto.on", lang)) { b.einschalten() }
        }
    }
}

// MARK: - Texte (eigene kleine Tabelle, wie HuaweiTexte — Loc.swift ist der Type-Checker-Engpass).
// Wortgleich mit android I18n.kt/I18nExtra.kt (suunto.*); pt-PT faellt auf pt zurueck.

enum SuuntoTexte {
    static func t(_ key: String, _ lang: String) -> String { tabelle(lang)[key] ?? en[key] ?? key }
    private static func tabelle(_ lang: String) -> [String: String] {
        switch lang {
        case "de": return de
        case "gsw": return gsw
        case "de-AT": return deAT
        case "fr": return fr
        case "it": return it
        case "es": return es
        case "fi": return fi
        case "nl": return nl
        case "cs": return cs
        case "pt": return pt
        case "ja": return ja
        case "zh": return zh
        case "ru": return ru
        case "id": return id
        case "nb": return nb
        case "pl": return pl
        case "pt-PT": return pt
        default: return en
        }
    }
    private static let de: [String: String] = [
        "suunto.title": "Suunto-Uhr (Beta)",
        "suunto.body": "Die Pumpfoil-App auf der Suunto-Uhr schickt Rohdaten über dieses Handy. Schalte den Empfang ein und nimm das Handy beim Fahren mit (wasserdichte Tasche) — außer Reichweite kommen nur GPS, Puls und Pumps über die Suunto-Cloud.",
        "suunto.on": "Empfang einschalten",
        "suunto.off": "Empfang ausschalten",
        "suunto.waiting": "Wartet auf die Uhr … Schalte in der Suunto-App in den Einstellungen der Pumpfoil-App „Raw data to phone app“ ein.",
        "suunto.connected": "Verbunden: {uhr}",
        "suunto.receiving": "Aufnahme läuft — {s} min empfangen",
        "suunto.lost": "{s} s außer Reichweite verloren",
        "suunto.errPerm": "Bluetooth-Berechtigung fehlt — bitte in den Einstellungen erlauben.",
        "suunto.errBt": "Bluetooth ist aus.",
        "suunto.notif": "Empfängt Daten deiner Suunto-Uhr",
    ]
    private static let gsw: [String: String] = [
        "suunto.title": "Suunto-Uhr (Beta)",
        "suunto.body": "D Pumpfoil-App uf de Suunto-Uhr schickt Rohdate über das Handy. Schalt de Empfang ii und nimm s Handy bim Fahre mit (wasserdichti Täsche) — usserhalb vo de Reichwiti chömed nur GPS, Puls und Pumps über d Suunto-Cloud.",
        "suunto.on": "Empfang iischalte",
        "suunto.off": "Empfang usschalte",
        "suunto.waiting": "Wartet uf d Uhr … Schalt i de Suunto-App i de Iistellige vo de Pumpfoil-App „Raw data to phone app“ ii.",
        "suunto.connected": "Verbunde: {uhr}",
        "suunto.receiving": "Ufnahm lauft — {s} min empfange",
        "suunto.lost": "{s} s usserhalb vo de Reichwiti verlore",
        "suunto.errPerm": "Bluetooth-Berechtigung fehlt — bitte i de Iistellige erlaube.",
        "suunto.errBt": "Bluetooth isch us.",
        "suunto.notif": "Empfangt Date vo dinere Suunto-Uhr",
    ]
    private static let deAT: [String: String] = [
        "suunto.title": "Suunto-Uhr (Beta)",
        "suunto.body": "Die Pumpfoil-App auf der Suunto-Uhr schickt Rohdaten über dieses Handy. Schalt den Empfang ein und nimm das Handy beim Fahren mit (wasserdichte Tasche) — außer Reichweite kommen nur GPS, Puls und Pumps über die Suunto-Cloud.",
        "suunto.on": "Empfang einschalten",
        "suunto.off": "Empfang ausschalten",
        "suunto.waiting": "Wartet auf die Uhr … Schalte in der Suunto-App in den Einstellungen der Pumpfoil-App „Raw data to phone app“ ein.",
        "suunto.connected": "Verbunden: {uhr}",
        "suunto.receiving": "Aufnahme läuft — {s} min empfangen",
        "suunto.lost": "{s} s außer Reichweite verloren",
        "suunto.errPerm": "Bluetooth-Berechtigung fehlt — bitte in den Einstellungen erlauben.",
        "suunto.errBt": "Bluetooth ist aus.",
        "suunto.notif": "Empfängt Daten deiner Suunto-Uhr",
    ]
    private static let en: [String: String] = [
        "suunto.title": "Suunto watch (beta)",
        "suunto.body": "The Pumpfoil app on your Suunto watch sends raw data through this phone. Turn reception on and carry the phone while riding (waterproof pouch) — out of range, only GPS, heart rate and pumps arrive via the Suunto cloud.",
        "suunto.on": "Turn on reception",
        "suunto.off": "Turn off reception",
        "suunto.waiting": "Waiting for the watch … In the Suunto app, turn on “Raw data to phone app” in the Pumpfoil app's settings.",
        "suunto.connected": "Connected: {uhr}",
        "suunto.receiving": "Recording — {s} min received",
        "suunto.lost": "{s} s lost out of range",
        "suunto.errPerm": "Bluetooth permission missing — please allow it in settings.",
        "suunto.errBt": "Bluetooth is off.",
        "suunto.notif": "Receiving data from your Suunto watch",
    ]
    private static let fr: [String: String] = [
        "suunto.title": "Montre Suunto (bêta)",
        "suunto.body": "L'app Pumpfoil de ta montre Suunto envoie les données brutes via ce téléphone. Active la réception et garde le téléphone sur toi (pochette étanche) — hors de portée, seuls le GPS, le pouls et les pumps arrivent via le cloud Suunto.",
        "suunto.on": "Activer la réception",
        "suunto.off": "Désactiver la réception",
        "suunto.waiting": "En attente de la montre … Dans l'app Suunto, active « Raw data to phone app » dans les réglages de l'app Pumpfoil.",
        "suunto.connected": "Connectée : {uhr}",
        "suunto.receiving": "Enregistrement — {s} min reçues",
        "suunto.lost": "{s} s perdues hors de portée",
        "suunto.errPerm": "Autorisation Bluetooth manquante — autorise-la dans les réglages.",
        "suunto.errBt": "Le Bluetooth est désactivé.",
        "suunto.notif": "Reçoit les données de ta montre Suunto",
    ]
    private static let it: [String: String] = [
        "suunto.title": "Orologio Suunto (beta)",
        "suunto.body": "L'app Pumpfoil sull'orologio Suunto invia i dati grezzi tramite questo telefono. Attiva la ricezione e porta il telefono con te (custodia impermeabile) — fuori portata arrivano solo GPS, battito e pump tramite il cloud Suunto.",
        "suunto.on": "Attiva ricezione",
        "suunto.off": "Disattiva ricezione",
        "suunto.waiting": "In attesa dell'orologio … Nell'app Suunto attiva “Raw data to phone app” nelle impostazioni dell'app Pumpfoil.",
        "suunto.connected": "Connesso: {uhr}",
        "suunto.receiving": "Registrazione — {s} min ricevuti",
        "suunto.lost": "{s} s persi fuori portata",
        "suunto.errPerm": "Manca il permesso Bluetooth — consentilo nelle impostazioni.",
        "suunto.errBt": "Il Bluetooth è spento.",
        "suunto.notif": "Riceve i dati dal tuo orologio Suunto",
    ]
    private static let es: [String: String] = [
        "suunto.title": "Reloj Suunto (beta)",
        "suunto.body": "La app Pumpfoil del reloj Suunto envía los datos brutos a través de este móvil. Activa la recepción y lleva el móvil contigo (funda estanca) — fuera de alcance solo llegan GPS, pulso y pumps por la nube de Suunto.",
        "suunto.on": "Activar recepción",
        "suunto.off": "Desactivar recepción",
        "suunto.waiting": "Esperando el reloj … En la app de Suunto, activa «Raw data to phone app» en los ajustes de la app Pumpfoil.",
        "suunto.connected": "Conectado: {uhr}",
        "suunto.receiving": "Grabando — {s} min recibidos",
        "suunto.lost": "{s} s perdidos fuera de alcance",
        "suunto.errPerm": "Falta el permiso de Bluetooth — permítelo en los ajustes.",
        "suunto.errBt": "El Bluetooth está apagado.",
        "suunto.notif": "Recibiendo datos de tu reloj Suunto",
    ]
    private static let fi: [String: String] = [
        "suunto.title": "Suunto-kello (beta)",
        "suunto.body": "Suunto-kellon Pumpfoil-sovellus lähettää raakadatan tämän puhelimen kautta. Kytke vastaanotto päälle ja pidä puhelin mukana ajaessa (vesitiivis pussi) — kantaman ulkopuolella vain GPS, syke ja pumppaukset tulevat Suunto-pilven kautta.",
        "suunto.on": "Kytke vastaanotto päälle",
        "suunto.off": "Kytke vastaanotto pois",
        "suunto.waiting": "Odotetaan kelloa … Kytke Suunto-sovelluksessa Pumpfoil-sovelluksen asetuksista päälle ”Raw data to phone app”.",
        "suunto.connected": "Yhdistetty: {uhr}",
        "suunto.receiving": "Tallennus käynnissä — {s} min vastaanotettu",
        "suunto.lost": "{s} s menetetty kantaman ulkopuolella",
        "suunto.errPerm": "Bluetooth-lupa puuttuu — salli se asetuksissa.",
        "suunto.errBt": "Bluetooth on pois päältä.",
        "suunto.notif": "Vastaanottaa dataa Suunto-kellostasi",
    ]
    private static let nl: [String: String] = [
        "suunto.title": "Suunto-horloge (bèta)",
        "suunto.body": "De Pumpfoil-app op je Suunto-horloge stuurt ruwe data via deze telefoon. Zet ontvangst aan en neem de telefoon mee tijdens het varen (waterdicht hoesje) — buiten bereik komen alleen gps, hartslag en pumps via de Suunto-cloud.",
        "suunto.on": "Ontvangst aanzetten",
        "suunto.off": "Ontvangst uitzetten",
        "suunto.waiting": "Wacht op het horloge … Zet in de Suunto-app bij de instellingen van de Pumpfoil-app „Raw data to phone app” aan.",
        "suunto.connected": "Verbonden: {uhr}",
        "suunto.receiving": "Opname loopt — {s} min ontvangen",
        "suunto.lost": "{s} s buiten bereik verloren",
        "suunto.errPerm": "Bluetooth-toestemming ontbreekt — sta die toe in de instellingen.",
        "suunto.errBt": "Bluetooth staat uit.",
        "suunto.notif": "Ontvangt data van je Suunto-horloge",
    ]
    private static let cs: [String: String] = [
        "suunto.title": "Hodinky Suunto (beta)",
        "suunto.body": "Aplikace Pumpfoil v hodinkách Suunto posílá surová data přes tento telefon. Zapni příjem a měj telefon při jízdě u sebe (vodotěsné pouzdro) — mimo dosah přijdou jen GPS, tep a pumpy přes cloud Suunto.",
        "suunto.on": "Zapnout příjem",
        "suunto.off": "Vypnout příjem",
        "suunto.waiting": "Čeká na hodinky … V aplikaci Suunto zapni v nastavení aplikace Pumpfoil „Raw data to phone app“.",
        "suunto.connected": "Připojeno: {uhr}",
        "suunto.receiving": "Záznam běží — přijato {s} min",
        "suunto.lost": "{s} s ztraceno mimo dosah",
        "suunto.errPerm": "Chybí oprávnění Bluetooth — povol ho v nastavení.",
        "suunto.errBt": "Bluetooth je vypnutý.",
        "suunto.notif": "Přijímá data z hodinek Suunto",
    ]
    private static let pt: [String: String] = [
        "suunto.title": "Relógio Suunto (beta)",
        "suunto.body": "O app Pumpfoil no relógio Suunto envia os dados brutos por este celular. Ative a recepção e leve o celular enquanto anda (capa à prova d'água) — fora do alcance, só GPS, frequência cardíaca e pumps chegam pela nuvem da Suunto.",
        "suunto.on": "Ativar recepção",
        "suunto.off": "Desativar recepção",
        "suunto.waiting": "Aguardando o relógio … No app da Suunto, ative “Raw data to phone app” nas configurações do app Pumpfoil.",
        "suunto.connected": "Conectado: {uhr}",
        "suunto.receiving": "Gravando — {s} min recebidos",
        "suunto.lost": "{s} s perdidos fora do alcance",
        "suunto.errPerm": "Falta a permissão de Bluetooth — permita nas configurações.",
        "suunto.errBt": "O Bluetooth está desligado.",
        "suunto.notif": "Recebendo dados do seu relógio Suunto",
    ]
    private static let ja: [String: String] = [
        "suunto.title": "Suunto ウォッチ（ベータ）",
        "suunto.body": "Suunto ウォッチの Pumpfoil アプリは、このスマホ経由で生データを送ります。受信をオンにして、走行中はスマホを身につけてください（防水ポーチ）。範囲外では GPS・心拍・パンプだけが Suunto クラウド経由で届きます。",
        "suunto.on": "受信をオン",
        "suunto.off": "受信をオフ",
        "suunto.waiting": "ウォッチを待っています … Suunto アプリで Pumpfoil アプリの設定から「Raw data to phone app」をオンにしてください。",
        "suunto.connected": "接続中: {uhr}",
        "suunto.receiving": "記録中 — {s} 分受信",
        "suunto.lost": "範囲外で {s} 秒失われました",
        "suunto.errPerm": "Bluetooth の許可がありません。設定で許可してください。",
        "suunto.errBt": "Bluetooth がオフです。",
        "suunto.notif": "Suunto ウォッチからデータを受信中",
    ]
    private static let zh: [String: String] = [
        "suunto.title": "Suunto 手表（测试版）",
        "suunto.body": "Suunto 手表上的 Pumpfoil 应用通过这部手机发送原始数据。请打开接收，并在滑行时随身携带手机（防水袋）——超出范围时只有 GPS、心率和泵次通过 Suunto 云传输。",
        "suunto.on": "打开接收",
        "suunto.off": "关闭接收",
        "suunto.waiting": "正在等待手表 … 请在 Suunto 应用中打开 Pumpfoil 应用设置里的“Raw data to phone app”。",
        "suunto.connected": "已连接：{uhr}",
        "suunto.receiving": "记录中 — 已接收 {s} 分钟",
        "suunto.lost": "超出范围丢失 {s} 秒",
        "suunto.errPerm": "缺少蓝牙权限——请在设置中允许。",
        "suunto.errBt": "蓝牙已关闭。",
        "suunto.notif": "正在接收 Suunto 手表的数据",
    ]
    private static let ru: [String: String] = [
        "suunto.title": "Часы Suunto (бета)",
        "suunto.body": "Приложение Pumpfoil на часах Suunto передаёт сырые данные через этот телефон. Включите приём и берите телефон с собой во время катания (водонепроницаемый чехол) — вне зоны действия через облако Suunto приходят только GPS, пульс и пампы.",
        "suunto.on": "Включить приём",
        "suunto.off": "Выключить приём",
        "suunto.waiting": "Ожидание часов … В приложении Suunto включите «Raw data to phone app» в настройках приложения Pumpfoil.",
        "suunto.connected": "Подключено: {uhr}",
        "suunto.receiving": "Идёт запись — получено {s} мин",
        "suunto.lost": "{s} с потеряно вне зоны действия",
        "suunto.errPerm": "Нет разрешения Bluetooth — разрешите его в настройках.",
        "suunto.errBt": "Bluetooth выключен.",
        "suunto.notif": "Получает данные с часов Suunto",
    ]
    private static let id: [String: String] = [
        "suunto.title": "Jam Suunto (beta)",
        "suunto.body": "Aplikasi Pumpfoil di jam Suunto mengirim data mentah lewat ponsel ini. Nyalakan penerimaan dan bawa ponsel saat bermain (kantong tahan air) — di luar jangkauan hanya GPS, detak jantung, dan pump yang tiba lewat cloud Suunto.",
        "suunto.on": "Nyalakan penerimaan",
        "suunto.off": "Matikan penerimaan",
        "suunto.waiting": "Menunggu jam … Di aplikasi Suunto, nyalakan “Raw data to phone app” di pengaturan aplikasi Pumpfoil.",
        "suunto.connected": "Terhubung: {uhr}",
        "suunto.receiving": "Merekam — {s} mnt diterima",
        "suunto.lost": "{s} dtk hilang di luar jangkauan",
        "suunto.errPerm": "Izin Bluetooth belum ada — izinkan di pengaturan.",
        "suunto.errBt": "Bluetooth mati.",
        "suunto.notif": "Menerima data dari jam Suunto",
    ]
    private static let nb: [String: String] = [
        "suunto.title": "Suunto-klokke (beta)",
        "suunto.body": "Pumpfoil-appen på Suunto-klokka sender rådata via denne telefonen. Slå på mottak og ha telefonen med deg mens du kjører (vanntett pose) — utenfor rekkevidde kommer bare GPS, puls og pumps via Suunto-skyen.",
        "suunto.on": "Slå på mottak",
        "suunto.off": "Slå av mottak",
        "suunto.waiting": "Venter på klokka … Slå på «Raw data to phone app» i innstillingene til Pumpfoil-appen i Suunto-appen.",
        "suunto.connected": "Tilkoblet: {uhr}",
        "suunto.receiving": "Opptak pågår — {s} min mottatt",
        "suunto.lost": "{s} s tapt utenfor rekkevidde",
        "suunto.errPerm": "Bluetooth-tillatelse mangler — tillat den i innstillingene.",
        "suunto.errBt": "Bluetooth er av.",
        "suunto.notif": "Mottar data fra Suunto-klokka di",
    ]
    private static let pl: [String: String] = [
        "suunto.title": "Zegarek Suunto (beta)",
        "suunto.body": "Aplikacja Pumpfoil na zegarku Suunto wysyła surowe dane przez ten telefon. Włącz odbiór i miej telefon przy sobie podczas jazdy (wodoszczelne etui) — poza zasięgiem przez chmurę Suunto docierają tylko GPS, tętno i pompy.",
        "suunto.on": "Włącz odbiór",
        "suunto.off": "Wyłącz odbiór",
        "suunto.waiting": "Czekam na zegarek … W aplikacji Suunto włącz „Raw data to phone app” w ustawieniach aplikacji Pumpfoil.",
        "suunto.connected": "Połączono: {uhr}",
        "suunto.receiving": "Nagrywanie — odebrano {s} min",
        "suunto.lost": "{s} s utracono poza zasięgiem",
        "suunto.errPerm": "Brak uprawnienia Bluetooth — zezwól w ustawieniach.",
        "suunto.errBt": "Bluetooth jest wyłączony.",
        "suunto.notif": "Odbiera dane z zegarka Suunto",
    ]
}
