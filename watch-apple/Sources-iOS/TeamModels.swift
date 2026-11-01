import Foundation

// Teams & Events (Native-Port Stufe 4, 01.11.2026) — Datenmodelle zu server/app/api/teams.py.
// Spiegelt die Typen in web/src/lib/api.ts („---- Teams ----"). Alles Optionale bleibt optional:
// der Server liefert je Betrachter (Leitung, Mitglied, Fremder) unterschiedlich viele Felder,
// und die App rechnet keine Regel nach — sie zeigt nur, was kommt (docs/TEAMS.md).

/// Spot eines Teams/Events (`name` kann fehlen, dann zeigt die App „#id").
struct TeamSpotKurz: Codable, Hashable, Identifiable {
    let id: Int
    let name: String?
    var anzeige: String { name ?? "#\(id)" }
}

/// Eigenes Team (`GET /api/teams/mine`): aktiv oder angefragt; `anfragen` > 0 nur fuer Leitung/Moderatoren.
struct TeamKurz: Codable, Identifiable {
    let id: Int
    let name: String
    let slug: String
    let beschreibung: String?
    let logo_url: String?
    let farbe: String?
    var sportarten: [String]? = nil
    let rolle: String
    let status: String
    let anfragen: Int
    var freigabe: String? = nil
}

/// Eintrag der Seite „Alle Teams" (`GET /api/teams/liste`).
struct TeamListenEintrag: Codable, Identifiable {
    let id: Int
    let name: String
    let slug: String
    let beschreibung: String?
    let logo_url: String?
    let farbe: String?
    var sportarten: [String]? = nil
    let mitglieder_anzahl: Int
    let anmeldungen_zulassen: Bool
    let bestenlisten_oeffentlich: Bool
}

/// Teamseite (`GET /api/teams/{slug}`).
struct TeamInfo: Codable {
    let id: Int
    let name: String
    let slug: String
    let beschreibung: String?
    let logo_url: String?
    let farbe: String?
    var banner_url: String? = nil
    var banner_fokus: String? = nil
    var sportarten: [String]? = nil
    let mitglieder_anzahl: Int
    var oeffentlich: Bool? = nil
    var bestenlisten_oeffentlich: Bool? = nil
    var anmeldungen_zulassen: Bool? = nil
    var automatisch_akzeptieren: Bool? = nil
    var meine_rolle: String? = nil          // leiter | moderator | mitglied
    var mein_status: String? = nil          // aktiv | angefragt
    var darf_bestenlisten: Bool? = nil
    var darf_mitglieder: Bool? = nil
    var chat_scope: String? = nil           // nur fuer aktive Mitglieder
    var anfragen_offen: Int? = nil          // offene Beitrittsanfragen, nur Leitung/Moderatoren > 0
    var spots: [TeamSpotKurz]? = nil

    var istVerwalter: Bool { meine_rolle == "leiter" || meine_rolle == "moderator" }
}

/// Eine Zeile einer Bestenliste. Gastform: nur Rang, Name, Initialen, Wert.
struct TeamZeile: Codable, Identifiable {
    let rang: Int
    let name: String?
    var initialen: String? = nil
    let value: Double
    var user_id: Int? = nil
    var avatar_url: String? = nil
    var session_id: Int? = nil
    var started_at: String? = nil
    var spot: String? = nil
    var id: String { "\(rang)-\(user_id ?? 0)-\(name ?? "")" }
}

/// Bestenliste mit Zeilen (Team und Event). Events haben kein `id`/`nur_teamspots`.
struct TeamTafel: Codable {
    var id: Int? = nil
    let kennzahl: String
    let sportart: String
    var accel_only: Bool? = nil
    var nur_brett: Bool? = nil
    var foil_band: String? = nil
    var nur_teamspots: Bool? = nil
    let zeilen: [TeamZeile]
}

struct TeamBestenlisten: Codable {
    let period: String?
    let tafeln: [TeamTafel]
}

struct TeamStatistik: Codable {
    let sessions: Double
    let runs: Double
    let pumps: Double
    let distance_m: Double
    let time_s: Double
    let spots: Double
    let aktive: Int
    let mitglieder: Int
}

struct TeamLogbuchEintrag: Codable {
    let kennzahl: String
    let sportart: String
    let user_id: Int?
    let name: String?
    let avatar_url: String?
    let session_id: Int?
    let wert: Double
    let vorher_user_id: Int?
    let vorher_name: String?
    let vorher_wert: Double?
    let gefahren_am: String?
    let erfasst_am: String?
}

struct TeamMitglied: Codable, Identifiable {
    let user_id: Int
    let name: String
    let avatar_url: String?
    let rolle: String
    let seit: String?
    var id: Int { user_id }
}

struct TeamMitgliederAntwort: Codable {
    let mitglieder: [TeamMitglied]
}

/// Ein Event mit Bestenlisten (`GET /api/teams/{slug}/events[/{id}]`, Server teams.event_out).
struct TeamEvent: Codable, Identifiable {
    let id: Int
    let titel: String
    let beschreibung: String?
    let start: String
    let ende: String
    let zeitzone: String?
    let status: String                       // kommend | laeuft | auswertung | beendet
    let spots: [TeamSpotKurz]
    let einfrieren_am: String
    let tafeln: [TeamTafel]                  // darf LEER sein (Event nur mit Summen)
    var banner_url: String? = nil
    var banner_fokus: String? = nil
    var ohne_dateien: Bool? = nil
    var teambild_zeigen: Bool? = nil
    var summen_auswahl: [String]? = nil
    /// Werte koennen theoretisch null sein — dann zaehlt 0, statt das ganze Event nicht zu dekodieren.
    var summen: [String: Double?]? = nil
    var summen_sportart: String? = nil

    func summe(_ key: String) -> Double {
        guard let w = summen?[key], let v = w else { return 0 }
        return v
    }

    /// Sportarten: die der Bestenlisten, ohne Bestenliste die der Summen (wie Team.tsx eventSportarten).
    var sportarten: [String] {
        let aus: [String] = tafeln.isEmpty ? [summen_sportart ?? "pumpfoil"] : tafeln.map { $0.sportart }
        var gesehen = Set<String>()
        return aus.filter { gesehen.insert($0).inserted }
    }
}

/// Team-Kopf in der Kurzform eines Events.
struct TeamEventTeam: Codable, Hashable {
    let slug: String
    let name: String
    let logo_url: String?
    let farbe: String?
}

/// Event ohne Bestenlisten fuer Listen (Community, „Alle Events"; Server `_event_kurz`).
struct TeamEventKurz: Codable, Identifiable {
    let id: Int
    let titel: String
    let beschreibung: String?
    let start: String
    let ende: String
    let zeitzone: String?
    let status: String
    let sportarten: [String]
    let spots: [TeamSpotKurz]
    let team: TeamEventTeam
    var listenId: String { "\(team.slug)-\(id)" }
}

/// Antwort auf Beitreten / Einladung annehmen.
struct TeamBeitrittAntwort: Codable {
    let status: String                       // aktiv | angefragt
    let slug: String
}

/// Was ein Einladungslink bewirkt (`GET /api/teams/einladung/{token}`).
struct TeamEinladungInfo: Codable {
    let id: Int
    let name: String
    let slug: String
    let beschreibung: String?
    let logo_url: String?
    let farbe: String?
    let art: String                          // join | apply
    let oeffentlich: Bool
    let mein_status: String?
}

/// Ziele der Team-Seiten, wert-basiert fuer Stapel mit NavigationPath (Community).
enum TeamsZiel: Hashable {
    case alleTeams
    case alleEvents
    case team(String)
    case event(String, Int)
}
