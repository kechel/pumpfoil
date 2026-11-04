import SwiftUI

/// Home › Uebersicht: „Neue Kommentare & Likes" (PWA PersonalHome NeuBeiMir, Olek/Jan 03.11.2026) — die letzten
/// Kommentare und Likes anderer an den eigenen Sessions, hoechstens 5 aus 14 Tagen (Server). Leer -> gar nicht da.
/// Das Profilbild fuehrt aufs Profil, der Rest der Zeile zur Session.
struct NeuBeiMirAbschnitt: View {
    let lang: String
    var neuLadenTick: Int = 0
    @State private var liste: [Api.Aktivitaet]?

    var body: some View {
        Group {
            if let l = liste, !l.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(Loc.t("act.title", lang)).font(.headline)
                    ForEach(l) { e in zeile(e) }
                }
            } else {
                // Platzhalter, damit `.task` ueberhaupt laeuft (Memory swiftui-leere-group-laedt-nicht).
                Color.clear.frame(height: 0)
            }
        }
        .task(id: neuLadenTick) { liste = (try? await Api.myActivity()) ?? liste ?? [] }
    }

    private func zeile(_ e: Api.Aktivitaet) -> some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(name: e.user.name, url: Api.mediaURL(e.user.avatar_url), size: 32, userId: e.user.id)
            NavigationLink(value: SessionDest(id: e.session_id)) { inhalt(e) }
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemBackground)))
    }

    private func inhalt(_ e: Api.Aktivitaet) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: 6) {
                symbol(e)
                (Text(e.user.name).fontWeight(.semibold) + Text(" " + wasText(e))).font(.subheadline)
                Spacer(minLength: 4)
                Text(wann(e.at)).font(.caption).foregroundStyle(.secondary).monospacedDigit()
            }
            if e.typ == "comment", let t = e.text, !t.isEmpty {
                Text(t).font(.subheadline).italic().foregroundStyle(.secondary).lineLimit(2)
            }
            if !sessionText(e).isEmpty {
                Text(sessionText(e)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func symbol(_ e: Api.Aktivitaet) -> some View {
        if e.typ == "comment" {
            Image(systemName: "bubble.left").font(.subheadline).foregroundStyle(Color.accentColor)
        } else {
            Image(systemName: "heart.fill").font(.subheadline).foregroundStyle(.pink)
        }
    }

    private func wasText(_ e: Api.Aktivitaet) -> String {
        if e.typ == "comment" { return Loc.t("act.comment", lang) }
        let n: Int = e.anzahl ?? 1
        if n > 1 { return Loc.t("act.likeMany", lang).replacingOccurrences(of: "{n}", with: String(n - 1)) }
        return Loc.t("act.like", lang)
    }

    /// „Session vom 02.11.2026 · Spot".
    private func sessionText(_ e: Api.Aktivitaet) -> String {
        var teile: [String] = []
        if let s = e.started_at, let d = SessionDetail.parseDate(s) {
            let datum: String = d.formatted(date: .numeric, time: .omitted)
            teile.append(Loc.t("act.session", lang).replacingOccurrences(of: "{d}", with: datum))
        }
        if let sp = e.spot, !sp.isEmpty { teile.append(sp) }
        return teile.joined(separator: " · ")
    }

    private func wann(_ iso: String) -> String {
        guard let d = SessionDetail.parseDate(iso) else { return "" }
        let f = DateFormatter()
        f.dateFormat = "dd.MM. HH:mm"
        return f.string(from: d)
    }
}
