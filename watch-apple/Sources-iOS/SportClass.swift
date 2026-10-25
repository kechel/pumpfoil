import Foundation

// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Home-Hinweis. Spiegelt web/src/lib/sportClass.ts
// (Reihenfolge inklusive) und die Server-Tupel SPORTS/DATA_QUALITY in server/app/api/sessions.py.
// ACHTUNG: `SessionSummary.sport` ist etwas ANDERES — der Aktivitätstyp aus der Aufnahmedatei.

/// Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen.
// „wake" seit 05.08. in drei Kategorien aufgeteilt (beim Pumpen verschiedene Dinge):
// wakethief = Welle eines FREMDEN Boots mitnehmen · towed = am Seil hinterm Boot · surf_wave =
// Ozeanwelle am Strand. `wake` bleibt nur als Label für Altbestände (nicht mehr auswählbar).
// `parawing` seit 13.09.2026: Lowkite / Parawing / Parakite sind dasselbe (Jan).
// Seit 25.10.2026 vom Server (Sportarten unten, GET /api/app/sports); eingebaut nur als Rueckfall.
var SPORTS: [String] { Sportarten.ids() }

/// Datenqualität — Müll/Dopplung, zählt nirgends.
let DATA_QUALITY = ["ok", "false_data", "duplicate", "test"]

/// Zeigt die Session eine abweichende Klassifikation, die man benennen sollte?
func isClassified(sportClass: String?, dataQuality: String?) -> Bool {
    (sportClass ?? "pumpfoil") != "pumpfoil" || (dataQuality ?? "ok") != "ok"
}

/// Beschriftbare Werte: auswählbare Sportarten + stillgelegte Altwerte. Der Server kann Kategorien
/// hinzufügen, bevor diese App das Update hat — was hier NICHT drinsteht, bekommt das Label von
/// „andere Sportart" statt eines rohen i18n-Keys auf dem Bildschirm.
private var LABELED_SPORTS: [String] { SPORTS + ["wake"] }

/// i18n-Key des Anzeige-Labels; Datenqualität schlägt die Sportart, weil sie mehr aussagt.
func classLabelKey(sportClass: String?, dataQuality: String?) -> String {
    let dq = dataQuality ?? "ok"
    if dq != "ok" { return "cls.dq.\(dq)" }
    let sport = sportClass ?? "pumpfoil"
    return "cls.sport.\(LABELED_SPORTS.contains(sport) ? sport : "other")"
}

// Sortierung aller Sportart-Listen wie im Web (web/src/lib/sportClass.ts, Jan 25.10.2026: „die sportartenliste bitte
// immer alphabetisch sortieren, nur pumpfoil (oder das eigene default) ganz oben"): eigene Standard-Sportart zuerst,
// „other" zuletzt, dazwischen nach dem ANGEZEIGTEN Namen in der gewaehlten Sprache. Die Standard-Sportart setzen die
// Ansichten, die die Einstellungen laden (Profil, Foils, Einrichtung) — Pumpfoil als Rueckfall.
var standardSport: String = "pumpfoil"

func sortiereSports(_ ids: [String], lang: String, std: String? = nil) -> [String] {
    let erster: String = std ?? standardSport
    func rang(_ id: String) -> Int { id == erster ? 0 : (id == "other" ? 2 : 1) }
    return ids.sorted { (a: String, b: String) -> Bool in
        let ra: Int = rang(a), rb: Int = rang(b)
        if ra != rb { return ra < rb }
        let na: String = Loc.t("cls.sport." + a, lang).lowercased()
        let nb: String = Loc.t("cls.sport." + b, lang).lowercased()
        return na < nb
    }
}


// Die Sportarten-Liste kommt vom Server (GET /api/app/sports, server/app/data/sportarten.json — Jan, 25.10.2026: „eine
// einzige zentrale liste der sportarten fuer alle apps/uhren/web"). Neue Sportarten erscheinen damit ohne App-Update:
// Name in allen Sprachen, Gruppe (pump/wind/welle/motor/paddel), ob es On-Foil-Fahren gibt, Rekord-Satz. Eingebaut
// bleibt eine Liste als Rueckfall (erster Start ohne Netz); der letzte Abruf wird in den UserDefaults gemerkt.
struct SportEintrag: Codable {
    let id: String
    let gruppe: String?
    let foil: Bool?
    let land: Bool?
    let rekorde: String?
    let namen: [String: String]?
}

struct SportListe: Codable {
    let version: String?
    let sportarten: [SportEintrag]
}

enum Sportarten {
    private static let schluessel: String = "sportarten_json"

    private static func e(_ id: String, _ gruppe: String = "pump", foil: Bool = true, land: Bool = false,
                          rek: String? = nil) -> SportEintrag {
        SportEintrag(id: id, gruppe: gruppe, foil: foil, land: land, rekorde: rek, namen: nil)
    }

    // Rueckfall = Stand der Server-Liste vom 25.10.2026 (Reihenfolge wie dort, `other` zuletzt).
    private static let eingebaut: [SportEintrag] = [
        e("pumpfoil"), e("wingfoil", "wind", rek: "wind"), e("kitefoil", "wind", rek: "wind"),
        e("parawing", "wind", rek: "wind"), e("kitesurf", "wind", foil: false, rek: "wind_ohne_foil"),
        e("windsurf", "wind", foil: false, rek: "wind_ohne_foil"),
        e("snowkite", "wind", foil: false, land: true, rek: "wind_ohne_foil"),
        e("kite_atb", "wind", foil: false, land: true, rek: "wind_ohne_foil"),
        e("kitebuggy", "wind", foil: false, land: true, rek: "wind_ohne_foil"),
        e("surf_downwind", "welle", rek: "downwind"), e("surf_wave", "welle"), e("sup_paddle", rek: "sup"),
        e("sup", "paddel", foil: false, rek: "paddel"), e("wakethief", rek: "wake"), e("towed", "motor"),
        e("efoil", "motor"), e("foildrive", "motor"), e("foil_scoot"), e("other", foil: false),
    ]

    private static var liste: [SportEintrag] = gemerkt() ?? eingebaut

    static func ids() -> [String] { liste.map { $0.id } }
    static func eintrag(_ id: String?) -> SportEintrag? {
        let gesucht: String = id ?? "pumpfoil"
        return liste.first(where: { $0.id == gesucht })
    }
    static func gruppe(_ id: String?) -> String { eintrag(id)?.gruppe ?? "pump" }
    static func foil(_ id: String?) -> Bool { eintrag(id)?.foil ?? true }
    /// Wind und Paddeln ohne Foil: keine Pumps, keine Laufzahl, keine Gleit-/Carve-Rekorde (wie die PWA).
    static func windArtig(_ id: String?) -> Bool { ["wind", "paddel"].contains(gruppe(id)) }
    static func motor(_ id: String?) -> Bool { gruppe(id) == "motor" }

    /// Name vom Server in der Sprache (pt-PT faellt auf pt, sonst Englisch) — fuer Sportarten, die diese App noch nicht kennt.
    static func name(_ id: String, _ lang: String) -> String? {
        guard let n = eintrag(id)?.namen else { return nil }
        if let v = n[lang] { return v }
        if lang == "pt-PT", let v = n["pt"] { return v }
        return n["en"]
    }

    private static func gemerkt() -> [SportEintrag]? {
        guard let d = UserDefaults.standard.data(forKey: schluessel),
              let l = try? JSONDecoder().decode(SportListe.self, from: d), l.sportarten.count >= 2 else { return nil }
        return l.sportarten
    }

    /// Frisch vom Server holen und merken. Fehler lassen die bisherige Liste stehen.
    @MainActor static func laden() async {
        guard let l = try? await Api.appSports(), l.sportarten.count >= 2 else { return }
        liste = l.sportarten
        if let d = try? JSONEncoder().encode(l) { UserDefaults.standard.set(d, forKey: schluessel) }
    }
}
