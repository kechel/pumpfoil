import Foundation

// Endpunkte des App-Ports vom 04.11.2026 (Abgleich gegen die Web-Funktionen vom 01.–03.11.): Liker einer Session,
// Kommentare, „Neue Kommentare & Likes", Team-Einladungen, Team-Logbuch. Spiegelt web/src/lib/api.ts.
extension Api {
    /// Wer hat diese Session geliked — nur fuer den Inhaber (Server prueft es; alle anderen sehen nur die Zahl).
    struct Liker: Decodable, Identifiable {
        let user_id: Int
        let name: String?
        let avatar_url: String?
        let am: String?
        var id: Int { user_id }
    }

    static func sessionLikers(_ id: Int) async throws -> [Liker] {
        try await request("/api/community/sessions/\(id)/likes", method: "GET", body: nil, auth: true)
    }
}

extension Api {
    /// „Neue Kommentare & Likes" an den eigenen Sessions (Home › Uebersicht): hoechstens 5 aus 14 Tagen, Likes je
    /// Session zusammengefasst (Server, community.py).
    struct Aktivitaet: Decodable, Identifiable {
        struct Wer: Decodable { let id: Int; let name: String; let avatar_url: String? }
        let typ: String              // comment | like
        let at: String
        let session_id: Int
        let started_at: String?
        let spot: String?
        let user: Wer
        let anzahl: Int?             // like: Likes im Zeitraum (der genannte ist der neueste)
        let message_id: Int?         // comment
        let text: String?            // comment, gekuerzt
        var id: String { "\(typ)-\(message_id ?? session_id)" }
    }

    static func myActivity() async throws -> [Aktivitaet] {
        try await request("/api/community/my-activity", method: "GET", body: nil, auth: true)
    }
}
