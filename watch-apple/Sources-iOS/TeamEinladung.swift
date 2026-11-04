import SwiftUI

// Einladungslink eines Teams (PWA web/src/pages/TeamEinladung.tsx, 31.10.2026, docs/TEAMS.md):
// pumpfoil.org/teams/<slug>/join-<token> bzw. /apply-<token>. Angemeldet: Wappen + Name, darunter der Beitritts-Dialog
// mit dem Kleingedruckten zur Oeffentlichkeit; danach direkt Mitglied (join) bzw. angefragt (apply).
//
// Wie der Link in die App kommt: RootView `.onOpenURL`. Das Schema `pumpfoil://teams/<slug>/join-<token>` geht sofort
// (CFBundleURLSchemes in project.yml). Fuer https-Links von pumpfoil.org braucht es Universal Links (Associated Domains
// `applinks:pumpfoil.org` + apple-app-site-association auf dem Server) — beides ist (Stand 04.11.2026) NICHT
// eingerichtet; bis dahin oeffnet ein getippter https-Link die Webseite. Der Parser hier versteht beide Formen.

/// Ein erkannter Einladungslink.
struct TeamEinladungLink: Identifiable, Equatable {
    let slug: String
    let art: String          // join | apply
    let token: String
    var id: String { token }

    /// Merker fuer einen Link, der VOR der Anmeldung kam (wie PWA localStorage `foil_team_einladung`): nach dem Login
    /// oeffnet RootView ihn.
    static let merkerKey = "foil_team_einladung"

    /// `https://pumpfoil.org/teams/<slug>/<join|apply>-<token>` oder `pumpfoil://teams/<slug>/<join|apply>-<token>`.
    static func aus(_ url: URL) -> TeamEinladungLink? {
        var teile: [String] = url.pathComponents.filter { $0 != "/" }
        let schema: String = (url.scheme ?? "").lowercased()
        if schema == "pumpfoil" {
            // Beim eigenen Schema steht „teams" als Host vor dem Pfad.
            guard let h = url.host else { return nil }
            teile.insert(h, at: 0)
        } else {
            let host: String = (url.host ?? "").lowercased()
            guard schema == "https", host == "pumpfoil.org" || host == "www.pumpfoil.org" else { return nil }
        }
        guard teile.count == 3, teile[0] == "teams" else { return nil }
        return ausTeil(teile[2], slug: teile[1])
    }

    /// Wie web `einladungAusPfad`: `^(join|apply)-([A-Za-z0-9_-]{6,64})$`.
    private static func ausTeil(_ teil: String, slug: String) -> TeamEinladungLink? {
        guard let re = try? NSRegularExpression(pattern: "^(join|apply)-([A-Za-z0-9_-]{6,64})$") else { return nil }
        let r = NSRange(teil.startIndex..., in: teil)
        guard let m = re.firstMatch(in: teil, range: r), m.numberOfRanges == 3,
              let ra = Range(m.range(at: 1), in: teil), let rt = Range(m.range(at: 2), in: teil) else { return nil }
        return TeamEinladungLink(slug: slug, art: String(teil[ra]), token: String(teil[rt]))
    }
}

/// Die Einladung als Sheet mit eigenem Stapel; nach dem Annehmen (oder wenn man schon Mitglied ist) die Teamseite.
struct TeamEinladungSheet: View {
    let link: TeamEinladungLink
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            TeamEinladungView(link: link, lang: lang)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(Loc.t("common.close", lang)) { dismiss() }
                    }
                }
        }
    }
}

private struct TeamEinladungView: View {
    let link: TeamEinladungLink
    let lang: String
    @Environment(\.dismiss) private var dismiss
    @State private var info: TeamEinladungInfo?
    @State private var fehlt = false
    @State private var busy = false
    @State private var fehler: String?
    /// Gesetzt = die Teamseite zeigen (schon Mitglied oder eben beigetreten/angefragt).
    @State private var teamSlug: String?

    var body: some View {
        inhalt
            .task { await laden() }
    }

    @ViewBuilder private var inhalt: some View {
        if let s = teamSlug {
            TeamView(slug: s)
        } else if fehlt {
            Text(Loc.t("team.einladungUngueltig", lang)).font(.subheadline).foregroundStyle(.secondary).padding()
        } else if let i = info {
            ScrollView { karte(i).padding(20) }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func karte(_ i: TeamEinladungInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                TeamWappen(name: i.name, logo: i.logo_url, farbe: i.farbe, size: 56)
                Text(i.name).font(.title3.weight(.bold)).foregroundStyle(TeamFarbe(i.farbe).akzent)
            }
            if i.mein_status == "angefragt" && i.art == "apply" {
                Text(Loc.t("team.join.wartet", lang)).font(.subheadline)
            } else {
                dialog(i)
            }
            if let f = fehler { Text(f).font(.subheadline).foregroundStyle(.red) }
        }
    }

    /// Inhalt wie web BeitrittDialog / TeamBeitrittSheet: Frage, was passiert, das Kleingedruckte, Abbrechen | Beitreten.
    private func dialog(_ i: TeamEinladungInfo) -> some View {
        let freigabe: Bool = i.art == "apply"
        let text: String = freigabe
            ? Loc.t("team.join.anfrage", lang) + " " + Loc.t("team.join.anfrageProfil", lang)
            : Loc.t("team.join.direkt", lang)
        let klein: String = Loc.t(i.oeffentlich ? "team.join.kleinOeffentlich" : "team.join.kleinIntern", lang)
            + " " + Loc.t("team.join.kleinAenderbar", lang)
        let ja: String = Loc.t(freigabe ? "team.join.anfragen" : "team.join.beitreten", lang)
        return VStack(alignment: .leading, spacing: 12) {
            Text(teamText("team.join.title", lang, ["name": i.name])).font(.headline)
            Text(text).font(.subheadline)
            Text(klein).font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Spacer()
                Button(Loc.t("common.cancel", lang)) { dismiss() }
                TeamKnopf(titel: ja, farbe: i.farbe, deaktiviert: busy) { Task { await annehmen() } }
            }
        }
    }

    private func laden() async {
        guard info == nil, teamSlug == nil else { return }
        do {
            let d = try await Api.teamEinladungAnsehen(link.token)
            if d.mein_status == "aktiv" { teamSlug = d.slug } else { info = d }
        } catch {
            fehlt = true
        }
    }

    private func annehmen() async {
        busy = true
        defer { busy = false }
        do {
            let r = try await Api.teamEinladungAnnehmen(link.token)
            teamSlug = r.slug
        } catch {
            fehler = Api.teamFehlerText(error, lang)
        }
    }
}
