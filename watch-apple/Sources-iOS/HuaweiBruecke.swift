import Foundation
import SwiftUI
#if canImport(WearEngineSDK)
import WearEngineSDK
#endif

// Bruecke fuer HUAWEI-Uhren auf dem iPhone (07.10.2026, watch-huawei/, docs/HUAWEI.md).
//
// Die Uhren haben fuer Fremd-Apps kein eigenes Netz. Die Uhren-App schreibt ihre Aufnahme als
// Dateien im normalen Upload-Format (docs/ingest-contract.md) und schickt sie per Wear Engine
// hierher — als NACHRICHTEN in Teilen (`PF1|<datei>|<nr>|<anzahl>|<inhalt>`, watch-huawei/common/
// kern.js), weil Huaweis iOS-SDK laut Doku „only supports P2P message communications … not file
// transfers". Wir setzen die Teile zusammen, legen die Dateien ab und laden sie mit einem EIGENEN
// Geraete-Token je Uhr hoch — so erscheint die Session unter der Uhr, nicht unter „Phone".
//
// Das Wear-Engine-SDK (WearEngineSDK.framework + .bundle) liegt NICHT im Repo (watch-apple/
// .gitignore, watch-huawei/README.md „SDK holen"). Ohne das Framework baut die App unveraendert:
// alles, was das SDK beruehrt, steht unter `#if canImport(WearEngineSDK)`, und die Karte im
// Uhren-Bereich erscheint gar nicht erst.
//
// NOCH NIE GEBAUT ODER GELAUFEN (auf der VM gibt es kein Xcode und kein SDK). Gegen die Huawei-
// Doku geschrieben: `HiWear.getAuthClient().auth(withClientId:…ulinkType:)`,
// `HiWear.getP2PClient().registerReceiver(_:srcInfo:destInfo:receiverCallback:)`,
// `WESIdentityInfo.mPackageName/.mFingerPrint`, `message?.data`, `processAuthResult(with:)`.
// EINE Stelle ist ungeprueft und markiert: die Methode fuer die Liste gekoppelter Uhren
// (`geraeteLaden`).
@MainActor
final class HuaweiBruecke: ObservableObject {
    static let shared = HuaweiBruecke()

    struct Stand {
        var verbunden = false
        var uhren: [String] = []
        var empfangen = 0
        var offen = 0
        var laedt = false
        var fehler = ""          // "" | "config" | "abgelehnt" | "keine-uhr" | Freitext
    }
    @Published var stand = Stand()

    // --- Kennungen (Platzhalter `…_EINTRAGEN` liefert Jan nach, s. watch-huawei/README.md) ---
    static let uhrPkg = "org.pumpfoil.huawei"
    static let uhrFp = "HUAWEI_WATCH_FINGERPRINT_EINTRAGEN"
    /// iOS-Apps haben laut Huawei keinen Fingerabdruck („enter any text") — die Uhr schickt an
    /// genau diesen Wert (watch-huawei/common/konfig.js IOS_FP), beide Seiten muessen gleich sein.
    static let eigenesPkg = "org.pumpfoil.coolwatch"
    static let eigenerFp = "org.pumpfoil.coolwatch"
    static let clientId = "HUAWEI_CLIENT_ID_EINTRAGEN"
    static let clientSecret = "HUAWEI_CLIENT_SECRET_EINTRAGEN"
    static let schemeSecret = "HUAWEI_SCHEME_SECRET_EINTRAGEN"
    /// Rueckweg aus Huawei Health in unsere App. Wir besitzen das Schema `pumpfoil` schon
    /// (Browser-Login); der Pfad trennt es davon.
    static let rueckScheme = "pumpfoil://huawei/zurueck"

    static var verfuegbar: Bool {
        #if canImport(WearEngineSDK)
        return true
        #else
        return false
        #endif
    }
    static var konfiguriert: Bool { !uhrFp.contains("EINTRAGEN") && !clientId.contains("EINTRAGEN") }

    private static let PREF_AN = "huawei_an"
    private static let MAX_DATEI = 5 * 1024 * 1024

    private static var wurzel: URL {
        let u = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("huawei-sessions")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
    private static var teileWurzel: URL {
        let u = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("huawei-teile")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    private var laedtGerade = false

    // MARK: - Lebenslauf

    /// Beim App-Start: nur wenn der Nutzer die Uhr schon einmal verbunden hat (kein Dialog).
    func start() {
        stand.offen = Self.offen()
        if UserDefaults.standard.bool(forKey: Self.PREF_AN) { empfangen() }
        hochladen()
    }

    /// Knopf „HUAWEI-Uhr verbinden": Huawei Health fragt den Nutzer, danach empfangen.
    func verbinden() {
        stand.fehler = ""
        guard Self.konfiguriert else { stand.fehler = "config"; return }
        #if canImport(WearEngineSDK)
        HiWear.getAuthClient().auth(
            withClientId: Self.clientId, scheme: Self.rueckScheme, schemeSecret: Self.schemeSecret,
            clientSecret: Self.clientSecret, srcPkgName: Self.eigenesPkg, destPkgName: Self.uhrPkg,
            ulinkType: .eu
        ) { [weak self] ok, code in
            Task { @MainActor in
                guard let self else { return }
                if ok {
                    UserDefaults.standard.set(true, forKey: Self.PREF_AN)
                    self.empfangen()
                } else {
                    // 223 = „Erlauben" getippt, aber keine Geraeteberechtigung gewaehlt (Doku).
                    self.stand.fehler = code.rawValue == 223 ? "abgelehnt" : "auth \(code.rawValue)"
                }
            }
        }
        #endif
    }

    /// Rueckkehr aus Huawei Health (PumpfoilApp `.onOpenURL`). true = war fuer uns.
    func urlEmpfangen(_ url: URL) -> Bool {
        let s = url.absoluteString
        guard s.contains("wearenginesdk://") || s.hasPrefix(Self.rueckScheme) else { return false }
        #if canImport(WearEngineSDK)
        HiWear.getAuthClient().processAuthResult(with: url)
        #endif
        return true
    }

    func trennen() {
        UserDefaults.standard.set(false, forKey: Self.PREF_AN)
        stand.verbunden = false
        stand.uhren = []
    }

    // MARK: - Empfang

    private func empfangen() {
        guard Self.konfiguriert else { stand.fehler = "config"; return }
        #if canImport(WearEngineSDK)
        geraeteLaden { [weak self] geraete in
            Task { @MainActor in
                guard let self else { return }
                let quelle = WESIdentityInfo()
                quelle.mPackageName = Self.uhrPkg
                quelle.mFingerPrint = Self.uhrFp
                let ziel = WESIdentityInfo()
                ziel.mPackageName = Self.eigenesPkg
                ziel.mFingerPrint = Self.eigenerFp
                for g in geraete {
                    HiWear.getP2PClient().registerReceiver(g, srcInfo: quelle, destInfo: ziel) { status, message in
                        Task { @MainActor in self.nachricht(status: status.rawValue, daten: message?.data) }
                    }
                }
                self.stand.verbunden = true
                self.stand.uhren = geraete.map { $0.name ?? "?" }
                self.stand.fehler = geraete.isEmpty ? "keine-uhr" : ""
            }
        }
        #endif
    }

    #if canImport(WearEngineSDK)
    /// Gekoppelte Uhren. UNGEPRUEFT: der Methodenname stammt aus dem Android-SDK
    /// (`getBondedDevices`); die iOS-Signatur steht in WearEngineSDK.h bzw. in der Doku-Seite
    /// „Querying Available Wearable Devices" (check-availabla-dev-ios-0000001921237861). Falls
    /// der Build hier stolpert, nur diese Funktion anpassen.
    private func geraeteLaden(_ weiter: @escaping ([WESDevice]) -> Void) {
        HiWear.getDeviceClient().getBondedDevices { [weak self] status, geraete in
            if status != .WESErrorCodeSuccess {
                Task { @MainActor in self?.stand.fehler = "geraete \(status.rawValue)" }
                weiter([])
                return
            }
            weiter(geraete ?? [])
        }
    }
    #endif

    /// Eine Nachricht der Uhr. `status`/`daten` sind schon aus dem SDK-Typ geloest, damit dieser
    /// Teil auch OHNE Framework uebersetzt und sich gegen Texte pruefen laesst.
    func nachricht(status: Int, daten: Data?) {
        guard status == 0, let d = daten, let text = String(data: d, encoding: .utf8) else { return }
        stand.empfangen += 1
        let fertig = teilAnnehmen(text)
        stand.offen = Self.offen()
        if fertig { hochladen() }
    }

    // MARK: - Teile zusammensetzen (Spiegel von HuaweiBruecke.kt)

    struct Teil { let datei: String; let nr: Int; let anzahl: Int; let inhalt: String }

    /// Nur das erwartete Format, nur bekannte Dateinamen, vernuenftige Groessen — sonst nil.
    static func teilLesen(_ text: String) -> Teil? {
        guard text.hasPrefix("PF1|") else { return nil }
        let f = text.split(separator: "|", maxSplits: 4, omittingEmptySubsequences: false).map(String.init)
        guard f.count == 5, let nr = Int(f[2]), let n = Int(f[3]) else { return nil }
        guard (1...20000).contains(n), (0..<n).contains(nr), f[4].count <= 1000 else { return nil }
        guard zielName(f[1]) != nil else { return nil }
        return Teil(datei: f[1], nr: nr, anzahl: n, inhalt: f[4])
    }

    /// true = eine Session ist vollstaendig angekommen.
    func teilAnnehmen(_ text: String) -> Bool {
        guard let t = Self.teilLesen(text) else { return false }
        let dir = Self.teileWurzel.appendingPathComponent(t.datei)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? t.inhalt.write(to: dir.appendingPathComponent(String(t.nr)), atomically: true, encoding: .utf8)
        let da = (try? FileManager.default.contentsOfDirectory(atPath: dir.path).count) ?? 0
        if da < t.anzahl { return false }
        var ganz = ""
        for i in 0..<t.anzahl {
            guard let s = try? String(contentsOf: dir.appendingPathComponent(String(i)), encoding: .utf8) else { return false }
            ganz += s
        }
        try? FileManager.default.removeItem(at: dir)
        return Self.ablegen(name: t.datei, text: ganz)
    }

    /// Eine Datei der Uhr ablegen. Nur nach Name und Inhalt geprueft — nichts von der Uhr darf
    /// ausserhalb des eigenen Ordners schreiben. true = complete.json ist da.
    static func ablegen(name: String, text: String) -> Bool {
        guard !text.isEmpty, text.utf8.count <= MAX_DATEI, let d = text.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: d)) != nil,
              let z = zielName(name) else { return false }
        let dir = wurzel.appendingPathComponent(z.0)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? d.write(to: dir.appendingPathComponent(z.1))
        return z.1 == "complete.json"
    }

    /// Dateiname der Uhr -> (Session-ID, Name in der Ablage), sonst nil.
    ///   m_<id>.json -> meta.json · c_<id>_<n>.json -> chunk-<n>.json · e_<id>.json -> complete.json
    static func zielName(_ name: String) -> (String, String)? {
        let basis = name.split(separator: "/").last.map(String.init) ?? name
        if let id = treffer(basis, #"^m_([A-Za-z0-9_-]{1,80})\.json$"#) { return (id, "meta.json") }
        if let id = treffer(basis, #"^e_([A-Za-z0-9_-]{1,80})\.json$"#) { return (id, "complete.json") }
        if let r = try? NSRegularExpression(pattern: #"^c_([A-Za-z0-9_-]{1,80})_(\d{1,6})\.json$"#),
           let m = r.firstMatch(in: basis, range: NSRange(basis.startIndex..., in: basis)),
           let idR = Range(m.range(at: 1), in: basis), let nR = Range(m.range(at: 2), in: basis),
           let n = Int(basis[nR]) {
            return (String(basis[idR]), String(format: "chunk-%06d.json", n))
        }
        return nil
    }
    private static func treffer(_ s: String, _ muster: String) -> String? {
        guard let r = try? NSRegularExpression(pattern: muster),
              let m = r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              let g = Range(m.range(at: 1), in: s) else { return nil }
        return String(s[g])
    }

    // MARK: - Upload (eigenes Token je Uhr, Sammel-Endpunkt)

    private static func sessionOrdner() -> [URL] {
        let alle = (try? FileManager.default.contentsOfDirectory(at: wurzel, includingPropertiesForKeys: nil)) ?? []
        return alle.filter {
            FileManager.default.fileExists(atPath: $0.appendingPathComponent("meta.json").path) &&
            FileManager.default.fileExists(atPath: $0.appendingPathComponent("complete.json").path)
        }
    }
    private static func offen() -> Int { sessionOrdner().count }

    private func token(_ label: String) async -> String? {
        let key = "huawei_token_" + String(label.hashValue)
        if let t = UserDefaults.standard.string(forKey: key) { return t }
        guard let t = try? await Api.mintDeviceToken(label: String(label.prefix(60))) else { return nil }
        UserDefaults.standard.set(t, forKey: key)
        return t
    }

    func hochladen() {
        if laedtGerade { return }
        laedtGerade = true
        stand.laedt = true
        Task {
            for dir in Self.sessionOrdner() {
                do { try await session(dir) }
                catch let e as PhoneIngest.IngestError {
                    if e.status == 401 {   // Token serverseitig ungueltig -> beim naechsten Mal neu minten
                        for k in UserDefaults.standard.dictionaryRepresentation().keys where k.hasPrefix("huawei_token_") {
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
        guard let meta = Store.readJson(dir.appendingPathComponent("meta.json")),
              let id = meta["session_uuid"] as? String else { return }
        if id != dir.lastPathComponent { try? FileManager.default.removeItem(at: dir); return }
        let label = (meta["device_model"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "HUAWEI"
        guard let tok = await token(label) else { return }
        let dateien = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.lastPathComponent.hasPrefix("chunk-") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        var m = meta
        m["expected_chunks"] = dateien.count
        let antwort = try await Self.post("/api/ingest/session", m, tok)
        let da = Set((antwort["received_chunks"] as? [Int]) ?? [])
        // GPS zuerst (wie der Handy-Recorder): bricht der Upload ab, ist die Spur schon vollstaendig.
        let chunks = dateien.compactMap { Store.readJson($0) }
            .filter { !da.contains(($0["index"] as? Int) ?? -1) }
            .sorted { (($0["kind"] as? String) == "gps" ? 0 : 1) < (($1["kind"] as? String) == "gps" ? 0 : 1) }
        var i = 0
        while i < chunks.count {
            let paket = Array(chunks[i..<min(i + 30, chunks.count)])
            let r = try await Self.post("/api/ingest/session/\(id)/chunks", ["chunks": paket], tok)
            let ok = (r["received"] as? [Int])?.count ?? 0
            if ok < paket.count { throw PhoneIngest.IngestError(status: 500) }
            i += 30
        }
        let comp = Store.readJson(dir.appendingPathComponent("complete.json")) ?? [:]
        _ = try await Self.post("/api/ingest/session/\(id)/complete", comp, tok)
        try? FileManager.default.removeItem(at: dir)   // erst NACH /complete
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

/// „HUAWEI-Uhr (Beta)" — nur, wenn das Wear-Engine-SDK eingebaut ist (sonst gibt es nichts zu
/// verbinden). Zeigt Verbindung, wartende Uploads und Fehler; Fehler bleiben stehen, solange es
/// sie gibt (Berechtigungen nie stumm scheitern).
struct HuaweiKarte: View {
    @ObservedObject private var b = HuaweiBruecke.shared
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        if HuaweiBruecke.verfuegbar {
            Section(HuaweiTexte.t("huawei.title", lang)) {
                Text(HuaweiTexte.t("huawei.body", lang)).font(.callout)
                verbunden
                offen
                fehler
                knopf
            }
            .task { b.start() }
        }
    }

    @ViewBuilder private var verbunden: some View {
        if b.stand.verbunden && !b.stand.uhren.isEmpty {
            Text(HuaweiTexte.t("huawei.connected", lang)
                    .replacingOccurrences(of: "{uhren}", with: b.stand.uhren.joined(separator: ", ")))
                .font(.callout)
        }
    }
    @ViewBuilder private var offen: some View {
        if b.stand.offen > 0 {
            Text(HuaweiTexte.t("huawei.pending", lang)
                    .replacingOccurrences(of: "{n}", with: String(b.stand.offen)))
                .font(.callout)
        }
    }
    @ViewBuilder private var fehler: some View {
        let f = b.stand.fehler
        if !f.isEmpty {
            Text(fehlerText(f)).font(.callout).foregroundStyle(.red)
        }
    }
    private func fehlerText(_ f: String) -> String {
        switch f {
        case "config": return HuaweiTexte.t("huawei.errConfig", lang)
        case "keine-uhr": return HuaweiTexte.t("huawei.errNoWatch", lang)
        case "abgelehnt": return HuaweiTexte.t("huawei.errDenied", lang)
        default: return HuaweiTexte.t("huawei.errOther", lang).replacingOccurrences(of: "{f}", with: f)
        }
    }
    @ViewBuilder private var knopf: some View {
        if b.stand.verbunden {
            Button(HuaweiTexte.t("huawei.disconnect", lang)) { b.trennen() }
        } else {
            Button(HuaweiTexte.t("huawei.connect", lang)) { b.verbinden() }
        }
    }
}

// MARK: - Texte (eigene kleine Tabelle statt Loc.swift: 11 Schluessel, je Sprache ein Literal —
// Loc.swift ist der Type-Checker-Engpass, s. Memory ios-swift-typecheck-hang)

enum HuaweiTexte {
    static func t(_ key: String, _ lang: String) -> String {
        if let s = tabelle(lang)[key] { return s }
        return en[key] ?? key
    }
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
        case "pl": return pl
        case "pt": return pt
        case "pt-PT": return ptPT
        case "ja": return ja
        case "zh": return zh
        case "ru": return ru
        case "id": return id
        case "nb": return nb
        default: return en
        }
    }
    private static let de: [String: String] = [
        "huawei.title": "HUAWEI-Uhr (Beta)",
        "huawei.body": "Die Pumpfoil-App auf deiner HUAWEI-Uhr schickt ihre Aufnahmen über dieses iPhone. Lass Pumpfoil nach der Session offen, bis die Uhr „Alles übertragen“ zeigt.",
        "huawei.connect": "HUAWEI-Uhr verbinden",
        "huawei.disconnect": "Trennen",
        "huawei.connected": "Verbunden: {uhren}",
        "huawei.pending": "Warten auf Upload: {n}",
        "huawei.errConfig": "Noch nicht verfügbar – die HUAWEI-Beta wird gerade eingerichtet.",
        "huawei.errNoWatch": "Keine gekoppelte HUAWEI-Uhr gefunden. Koppel sie zuerst in Huawei Health.",
        "huawei.errDenied": "Zugriff abgelehnt. Tippe auf Verbinden, um es noch einmal zu versuchen.",
        "huawei.errOther": "Etwas ist schiefgegangen: {f}",
    ]
    private static let gsw: [String: String] = [
        "huawei.title": "HUAWEI-Uhr (Beta)",
        "huawei.body": "D Pumpfoil-App uf dinere HUAWEI-Uhr schickt iri Ufnahme über das iPhone. Lass Pumpfoil nach de Session offe, bis d Uhr „Alles übertreit“ aazeigt.",
        "huawei.connect": "HUAWEI-Uhr verbinde",
        "huawei.disconnect": "Trenne",
        "huawei.connected": "Verbunde: {uhren}",
        "huawei.pending": "Wartet uf Upload: {n}",
        "huawei.errConfig": "No nöd verfüegbar – d HUAWEI-Beta wird grad iigrichtet.",
        "huawei.errNoWatch": "Kei kopplete HUAWEI-Uhr gfunde. Kopple si zerscht in Huawei Health.",
        "huawei.errDenied": "Zuegriff abglehnt. Tipp uf Verbinde zum nomal probiere.",
        "huawei.errOther": "Öppis isch schiefgange: {f}",
    ]
    private static let deAT: [String: String] = [
        "huawei.title": "HUAWEI-Uhr (Beta)",
        "huawei.body": "Die Pumpfoil-App auf deiner HUAWEI-Uhr schickt ihre Aufnahmen über dieses iPhone. Lass Pumpfoil nach der Session offen, bis die Uhr „Alles drüben“ anzeigt.",
        "huawei.connect": "HUAWEI-Uhr verbinden",
        "huawei.disconnect": "Trennen",
        "huawei.connected": "Verbunden: {uhren}",
        "huawei.pending": "Wartet auf Upload: {n}",
        "huawei.errConfig": "Noch nicht verfügbar – die HUAWEI-Beta wird gerade eingerichtet.",
        "huawei.errNoWatch": "Keine gekoppelte HUAWEI-Uhr gefunden. Koppel sie zuerst in Huawei Health.",
        "huawei.errDenied": "Zugriff abgelehnt. Tipp auf Verbinden, dann probier ma's nochmal.",
        "huawei.errOther": "Da ist was schiefgegangen: {f}",
    ]
    private static let en: [String: String] = [
        "huawei.title": "HUAWEI watch (beta)",
        "huawei.body": "The Pumpfoil app on your HUAWEI watch sends its recordings through this iPhone. After a session, keep Pumpfoil open until the watch shows “All sent”.",
        "huawei.connect": "Connect HUAWEI watch",
        "huawei.disconnect": "Disconnect",
        "huawei.connected": "Connected: {uhren}",
        "huawei.pending": "Waiting for upload: {n}",
        "huawei.errConfig": "Not available yet – the HUAWEI beta is being set up.",
        "huawei.errNoWatch": "No paired HUAWEI watch found. Pair it in Huawei Health first.",
        "huawei.errDenied": "Access was declined. Tap Connect to try again.",
        "huawei.errOther": "Something went wrong: {f}",
    ]
    private static let fr: [String: String] = [
        "huawei.title": "Montre HUAWEI (bêta)",
        "huawei.body": "L’app Pumpfoil de ta montre HUAWEI envoie ses enregistrements via cet iPhone. Après une session, garde Pumpfoil ouvert jusqu’à ce que la montre affiche « Tout envoyé ».",
        "huawei.connect": "Connecter la montre HUAWEI",
        "huawei.disconnect": "Déconnecter",
        "huawei.connected": "Connectée : {uhren}",
        "huawei.pending": "En attente d’envoi : {n}",
        "huawei.errConfig": "Pas encore disponible – la bêta HUAWEI est en préparation.",
        "huawei.errNoWatch": "Aucune montre HUAWEI couplée. Couple-la d’abord dans Huawei Health.",
        "huawei.errDenied": "Accès refusé. Touche Connecter pour réessayer.",
        "huawei.errOther": "Un problème est survenu : {f}",
    ]
    private static let it: [String: String] = [
        "huawei.title": "Orologio HUAWEI (beta)",
        "huawei.body": "L’app Pumpfoil sul tuo orologio HUAWEI invia le registrazioni tramite questo iPhone. Dopo una sessione tieni aperto Pumpfoil finché l’orologio mostra « Tutto inviato ».",
        "huawei.connect": "Collega orologio HUAWEI",
        "huawei.disconnect": "Scollega",
        "huawei.connected": "Collegato: {uhren}",
        "huawei.pending": "In attesa di caricamento: {n}",
        "huawei.errConfig": "Non ancora disponibile – la beta HUAWEI è in preparazione.",
        "huawei.errNoWatch": "Nessun orologio HUAWEI associato. Associalo prima in Huawei Health.",
        "huawei.errDenied": "Accesso negato. Tocca Collega per riprovare.",
        "huawei.errOther": "Qualcosa è andato storto: {f}",
    ]
    private static let es: [String: String] = [
        "huawei.title": "Reloj HUAWEI (beta)",
        "huawei.body": "La app Pumpfoil de tu reloj HUAWEI envía sus grabaciones a través de este iPhone. Tras una sesión, deja Pumpfoil abierto hasta que el reloj muestre «Todo enviado».",
        "huawei.connect": "Conectar reloj HUAWEI",
        "huawei.disconnect": "Desconectar",
        "huawei.connected": "Conectado: {uhren}",
        "huawei.pending": "Esperando subida: {n}",
        "huawei.errConfig": "Aún no disponible: la beta de HUAWEI se está preparando.",
        "huawei.errNoWatch": "No se encontró ningún reloj HUAWEI emparejado. Empareja primero en Huawei Health.",
        "huawei.errDenied": "Acceso denegado. Toca Conectar para intentarlo de nuevo.",
        "huawei.errOther": "Algo salió mal: {f}",
    ]
    private static let fi: [String: String] = [
        "huawei.title": "HUAWEI-kello (beta)",
        "huawei.body": "HUAWEI-kellosi Pumpfoil-sovellus lähettää tallenteensa tämän iPhonen kautta. Pidä Pumpfoil auki session jälkeen, kunnes kello näyttää ”Kaikki lähetetty”.",
        "huawei.connect": "Yhdistä HUAWEI-kello",
        "huawei.disconnect": "Katkaise yhteys",
        "huawei.connected": "Yhdistetty: {uhren}",
        "huawei.pending": "Odottaa latausta: {n}",
        "huawei.errConfig": "Ei vielä saatavilla – HUAWEI-betaa valmistellaan.",
        "huawei.errNoWatch": "Pariliitettyä HUAWEI-kelloa ei löytynyt. Muodosta pariliitos ensin Huawei Healthissa.",
        "huawei.errDenied": "Pääsy evättiin. Yritä uudelleen napauttamalla Yhdistä.",
        "huawei.errOther": "Jokin meni pieleen: {f}",
    ]
    private static let nl: [String: String] = [
        "huawei.title": "HUAWEI-horloge (bèta)",
        "huawei.body": "De Pumpfoil-app op je HUAWEI-horloge stuurt zijn opnames via deze iPhone. Laat Pumpfoil na een sessie open tot het horloge „Alles verzonden” toont.",
        "huawei.connect": "HUAWEI-horloge koppelen",
        "huawei.disconnect": "Ontkoppelen",
        "huawei.connected": "Gekoppeld: {uhren}",
        "huawei.pending": "Wacht op upload: {n}",
        "huawei.errConfig": "Nog niet beschikbaar – de HUAWEI-bèta wordt voorbereid.",
        "huawei.errNoWatch": "Geen gekoppeld HUAWEI-horloge gevonden. Koppel het eerst in Huawei Health.",
        "huawei.errDenied": "Toegang geweigerd. Tik op Koppelen om het opnieuw te proberen.",
        "huawei.errOther": "Er ging iets mis: {f}",
    ]
    private static let cs: [String: String] = [
        "huawei.title": "Hodinky HUAWEI (beta)",
        "huawei.body": "Aplikace Pumpfoil v hodinkách HUAWEI posílá záznamy přes tento iPhone. Po session nech Pumpfoil otevřený, dokud hodinky neukážou „Vše odesláno“.",
        "huawei.connect": "Připojit hodinky HUAWEI",
        "huawei.disconnect": "Odpojit",
        "huawei.connected": "Připojeno: {uhren}",
        "huawei.pending": "Čeká na nahrání: {n}",
        "huawei.errConfig": "Zatím nedostupné – beta pro HUAWEI se připravuje.",
        "huawei.errNoWatch": "Nenalezeny žádné spárované hodinky HUAWEI. Nejdřív je spáruj v Huawei Health.",
        "huawei.errDenied": "Přístup odmítnut. Klepni na Připojit a zkus to znovu.",
        "huawei.errOther": "Něco se pokazilo: {f}",
    ]
    private static let pl: [String: String] = [
        "huawei.title": "Zegarek HUAWEI (beta)",
        "huawei.body": "Aplikacja Pumpfoil na zegarku HUAWEI wysyła nagrania przez tego iPhone’a. Po sesji zostaw Pumpfoil otwarty, aż zegarek pokaże „Wszystko wysłane”.",
        "huawei.connect": "Połącz zegarek HUAWEI",
        "huawei.disconnect": "Rozłącz",
        "huawei.connected": "Połączono: {uhren}",
        "huawei.pending": "Czeka na wysłanie: {n}",
        "huawei.errConfig": "Jeszcze niedostępne – beta dla HUAWEI jest w przygotowaniu.",
        "huawei.errNoWatch": "Nie znaleziono sparowanego zegarka HUAWEI. Najpierw sparuj go w Huawei Health.",
        "huawei.errDenied": "Odmowa dostępu. Stuknij Połącz, aby spróbować ponownie.",
        "huawei.errOther": "Coś poszło nie tak: {f}",
    ]
    private static let pt: [String: String] = [
        "huawei.title": "Relógio HUAWEI (beta)",
        "huawei.body": "O app Pumpfoil no seu relógio HUAWEI envia as gravações por este iPhone. Depois de uma sessão, deixe o Pumpfoil aberto até o relógio mostrar “Tudo enviado”.",
        "huawei.connect": "Conectar relógio HUAWEI",
        "huawei.disconnect": "Desconectar",
        "huawei.connected": "Conectado: {uhren}",
        "huawei.pending": "Aguardando envio: {n}",
        "huawei.errConfig": "Ainda não disponível – o beta da HUAWEI está sendo preparado.",
        "huawei.errNoWatch": "Nenhum relógio HUAWEI pareado encontrado. Pareie primeiro no Huawei Health.",
        "huawei.errDenied": "Acesso negado. Toque em Conectar para tentar de novo.",
        "huawei.errOther": "Algo deu errado: {f}",
    ]
    private static let ptPT: [String: String] = [
        "huawei.title": "Relógio HUAWEI (beta)",
        "huawei.body": "A app Pumpfoil no teu relógio HUAWEI envia as gravações através deste iPhone. Depois de uma sessão, mantém o Pumpfoil aberto até o relógio mostrar «Tudo enviado».",
        "huawei.connect": "Ligar relógio HUAWEI",
        "huawei.disconnect": "Desligar",
        "huawei.connected": "Ligado: {uhren}",
        "huawei.pending": "A aguardar envio: {n}",
        "huawei.errConfig": "Ainda não disponível – a beta da HUAWEI está a ser preparada.",
        "huawei.errNoWatch": "Nenhum relógio HUAWEI emparelhado. Emparelha-o primeiro no Huawei Health.",
        "huawei.errDenied": "Acesso recusado. Toca em Ligar para tentar de novo.",
        "huawei.errOther": "Algo correu mal: {f}",
    ]
    private static let ja: [String: String] = [
        "huawei.title": "HUAWEIウォッチ（ベータ）",
        "huawei.body": "HUAWEIウォッチのPumpfoilアプリは、このiPhone経由で記録を送信します。セッション後は、ウォッチに「すべて送信済み」と表示されるまでPumpfoilを開いたままにしてください。",
        "huawei.connect": "HUAWEIウォッチを接続",
        "huawei.disconnect": "接続解除",
        "huawei.connected": "接続済み: {uhren}",
        "huawei.pending": "アップロード待ち: {n}",
        "huawei.errConfig": "まだ利用できません。HUAWEIベータを準備中です。",
        "huawei.errNoWatch": "ペアリング済みのHUAWEIウォッチが見つかりません。先にHuawei Healthでペアリングしてください。",
        "huawei.errDenied": "アクセスが拒否されました。「接続」をタップしてもう一度お試しください。",
        "huawei.errOther": "問題が発生しました: {f}",
    ]
    private static let zh: [String: String] = [
        "huawei.title": "HUAWEI 手表（测试版）",
        "huawei.body": "HUAWEI 手表上的 Pumpfoil 应用通过这部 iPhone 发送记录。训练结束后，请保持 Pumpfoil 打开，直到手表显示“全部已发送”。",
        "huawei.connect": "连接 HUAWEI 手表",
        "huawei.disconnect": "断开连接",
        "huawei.connected": "已连接：{uhren}",
        "huawei.pending": "等待上传：{n}",
        "huawei.errConfig": "暂不可用 —— HUAWEI 测试版正在准备中。",
        "huawei.errNoWatch": "未找到已配对的 HUAWEI 手表。请先在华为运动健康中配对。",
        "huawei.errDenied": "访问被拒绝。点击“连接”重试。",
        "huawei.errOther": "出错了：{f}",
    ]
    private static let ru: [String: String] = [
        "huawei.title": "Часы HUAWEI (бета)",
        "huawei.body": "Приложение Pumpfoil на часах HUAWEI отправляет записи через этот iPhone. После сессии держи Pumpfoil открытым, пока часы не покажут «Всё отправлено».",
        "huawei.connect": "Подключить часы HUAWEI",
        "huawei.disconnect": "Отключить",
        "huawei.connected": "Подключено: {uhren}",
        "huawei.pending": "Ожидает загрузки: {n}",
        "huawei.errConfig": "Пока недоступно — бета для HUAWEI готовится.",
        "huawei.errNoWatch": "Сопряжённые часы HUAWEI не найдены. Сначала выполни сопряжение в Huawei Health.",
        "huawei.errDenied": "Доступ запрещён. Нажми «Подключить», чтобы попробовать снова.",
        "huawei.errOther": "Что-то пошло не так: {f}",
    ]
    private static let id: [String: String] = [
        "huawei.title": "Jam HUAWEI (beta)",
        "huawei.body": "Aplikasi Pumpfoil di jam HUAWEI-mu mengirim rekamannya lewat iPhone ini. Setelah sesi, biarkan Pumpfoil terbuka sampai jam menampilkan “Semua terkirim”.",
        "huawei.connect": "Hubungkan jam HUAWEI",
        "huawei.disconnect": "Putuskan",
        "huawei.connected": "Terhubung: {uhren}",
        "huawei.pending": "Menunggu unggahan: {n}",
        "huawei.errConfig": "Belum tersedia – beta HUAWEI sedang disiapkan.",
        "huawei.errNoWatch": "Tidak ada jam HUAWEI yang terpasangkan. Pasangkan dulu di Huawei Health.",
        "huawei.errDenied": "Akses ditolak. Ketuk Hubungkan untuk mencoba lagi.",
        "huawei.errOther": "Terjadi kesalahan: {f}",
    ]
    private static let nb: [String: String] = [
        "huawei.title": "HUAWEI-klokke (beta)",
        "huawei.body": "Pumpfoil-appen på HUAWEI-klokken sender opptakene via denne iPhonen. Etter en økt: la Pumpfoil være åpen til klokken viser «Alt sendt».",
        "huawei.connect": "Koble til HUAWEI-klokke",
        "huawei.disconnect": "Koble fra",
        "huawei.connected": "Tilkoblet: {uhren}",
        "huawei.pending": "Venter på opplasting: {n}",
        "huawei.errConfig": "Ikke tilgjengelig ennå – HUAWEI-betaen settes opp.",
        "huawei.errNoWatch": "Fant ingen sammenkoblet HUAWEI-klokke. Koble den sammen i Huawei Health først.",
        "huawei.errDenied": "Tilgang avslått. Trykk Koble til for å prøve igjen.",
        "huawei.errOther": "Noe gikk galt: {f}",
    ]
}
