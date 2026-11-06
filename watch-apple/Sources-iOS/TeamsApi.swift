import Foundation

// Teams & Events (Native-Port Stufe 4, 01.11.2026): Aufrufe zu server/app/api/teams.py, wie
// web/src/lib/api.ts (`teamsMine` … `teamEinladungAnnehmen`). Lesen, Beitreten, Austreten und
// Einladungen; die Verwaltung (Gruenden, Einstellungen, Mitglieder, Events, Bilder) steht seit 04.11.2026 in
// TeamVerwaltungApi.swift.
extension Api {
    private static func teamPfad(_ slug: String) -> String {
        "/api/teams/" + (slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug)
    }

    private static func periodeQuery(_ period: String) -> String {
        period.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? period
    }

    /// Eigene Teams (aktiv + angefragt), mit offenen Anfragen fuer Leitung/Moderatoren.
    static func teamsMine() async throws -> [TeamKurz] {
        try await request("/api/teams/mine", method: "GET", body: nil, auth: true)
    }

    /// Alle freigegebenen Teams (Seite „Alle Teams").
    static func teamsListe() async throws -> [TeamListenEintrag] {
        try await request("/api/teams/liste", method: "GET", body: nil, auth: true)
    }

    /// Laufende und in den naechsten Tagen beginnende Events (Community-Abschnitt).
    static func teamsEventsAktuell() async throws -> [TeamEventKurz] {
        try await request("/api/teams/liste/events", method: "GET", body: nil, auth: true)
    }

    /// Team-Events der eigenen Teams (laufend, kommend, letzte 7 Tage; Community unter den globalen und Home › Team,
    /// 06.11.2026). Globale Events stehen dort nicht.
    static func teamsEventsMeine() async throws -> [TeamEventKurz] {
        try await request("/api/teams/liste/events/meine", method: "GET", body: nil, auth: true)
    }

    /// Alle Events seitenweise: laufend -> kommend -> vergangen. Der Server begrenzt `n` auf 50.
    static func teamsEventsAlle(offset: Int, n: Int) async throws -> [TeamEventKurz] {
        try await request("/api/teams/liste/events/alle?offset=\(offset)&n=\(n)", method: "GET", body: nil, auth: true)
    }

    static func team(_ slug: String) async throws -> TeamInfo {
        try await request(teamPfad(slug), method: "GET", body: nil, auth: true)
    }

    static func teamBestenlisten(_ slug: String, period: String) async throws -> TeamBestenlisten {
        try await request(teamPfad(slug) + "/bestenlisten?period=" + periodeQuery(period), method: "GET", body: nil, auth: true)
    }

    static func teamStatistik(_ slug: String, period: String) async throws -> TeamStatistik {
        try await request(teamPfad(slug) + "/statistik?period=" + periodeQuery(period), method: "GET", body: nil, auth: true)
    }

    static func teamLogbuch(_ slug: String) async throws -> [TeamLogbuchEintrag] {
        try await request(teamPfad(slug) + "/logbuch", method: "GET", body: nil, auth: true)
    }

    /// Mitgliederliste — nur wenn `darf_mitglieder` (sonst 403).
    static func teamMitglieder(_ slug: String) async throws -> TeamMitgliederAntwort {
        try await request(teamPfad(slug) + "/mitglieder", method: "GET", body: nil, auth: true)
    }

    static func teamEvents(_ slug: String) async throws -> [TeamEvent] {
        try await request(teamPfad(slug) + "/events", method: "GET", body: nil, auth: true)
    }

    static func teamEvent(_ slug: String, id: Int) async throws -> TeamEvent {
        try await request(teamPfad(slug) + "/events/\(id)", method: "GET", body: nil, auth: true)
    }

    /// Beitreten: `status` aktiv (automatisch akzeptiert) oder angefragt.
    static func teamBeitreten(_ slug: String) async throws -> TeamBeitrittAntwort {
        try await request(teamPfad(slug) + "/beitreten", method: "POST", body: nil, auth: true)
    }

    /// Austreten bzw. Anfrage zurueckziehen. Leitung: 409 `leiter_erst_uebergeben`.
    static func teamAustreten(_ slug: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request(teamPfad(slug) + "/austreten", method: "POST", body: nil, auth: true)
    }

    static func teamEinladungAnsehen(_ token: String) async throws -> TeamEinladungInfo {
        let t = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
        return try await request("/api/teams/einladung/" + t, method: "GET", body: nil, auth: true)
    }

    static func teamEinladungAnnehmen(_ token: String) async throws -> TeamBeitrittAntwort {
        let t = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
        return try await request("/api/teams/einladung/" + t, method: "POST", body: nil, auth: true)
    }

    /// Fehlercode aus der Server-Antwort (`{"detail":"nur_mitglieder"}`) — die Texte stehen unter `team.err.<code>`
    /// (wie web/src/lib/teamKennzahlen.ts `fehlerCode`).
    static func teamFehlerCode(_ e: Error) -> String {
        guard case ApiError.http(_, let body) = e,
              let d = body.data(using: .utf8),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let code = j["detail"] as? String else { return "unbekannt" }
        return code
    }

    /// Fehlertext zu einem Team-Fehler; unbekannte Codes -> `team.err.unbekannt`.
    static func teamFehlerText(_ e: Error, _ lang: String) -> String {
        let key = "team.err." + teamFehlerCode(e)
        let text = Loc.t(key, lang)
        return text == key ? Loc.t("team.err.unbekannt", lang) : text
    }

    /// Adresse einer Team-/Event-Seite im Web (Teilen, „im Browser oeffnen").
    static func teamWebURL(_ pfad: String) -> URL? {
        URL(string: baseURL + pfad)
    }
}
