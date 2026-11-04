import SwiftUI

// Liker und Kommentare einer Session (PWA SessionDetail.tsx WerHatGeliked + SessionKommentare, 02.11.2026).
// Regeln liegen im Server (server/app/kommentare.py): alle Angemeldeten duerfen kommentieren, der Inhaber kann es im
// Profil abschalten und fremde Kommentare loeschen; unter 13 (social_allowed) gar nicht.

/// Ziel „Foiler-Seite oeffnen" aus einer Liste heraus (`.sheet(item:)` braucht Identifiable).
struct ProfilZiel: Identifiable { let id: Int }

/// Kleiner Knopf neben dem Herz: zeigt die Liste der Liker (Name -> Profil). Nur fuer den Inhaber; laedt erst beim Oeffnen.
struct WerHatGeliktKnopf: View {
    let sessionId: Int
    let anzahl: Int
    @AppStorage("appLang") private var lang = "de"
    @State private var offen = false

    var body: some View {
        Button { offen = true } label: {
            Text(Loc.t("sd.whoLiked", lang)).font(.caption)
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
        .sheet(isPresented: $offen) {
            LikerListe(sessionId: sessionId, anzahl: anzahl)
        }
    }
}

private struct LikerListe: View {
    let sessionId: Int
    let anzahl: Int
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.dismiss) private var dismiss
    @State private var liste: [Api.Liker]?
    @State private var ziel: ProfilZiel?

    var body: some View {
        NavigationStack {
            inhalt
                .navigationTitle("\(anzahl) " + Loc.t("sd.likes", lang))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(Loc.t("common.close", lang)) { dismiss() }
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .task(id: anzahl) { liste = (try? await Api.sessionLikers(sessionId)) ?? [] }
        .sheet(item: $ziel) { z in FoilerSheet(userId: z.id) }
    }

    @ViewBuilder private var inhalt: some View {
        if let l = liste {
            if l.isEmpty {
                Text("—").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(l) { z in zeile(z) }.listStyle(.plain)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func zeile(_ z: Api.Liker) -> some View {
        Button { ziel = ProfilZiel(id: z.user_id) } label: {
            HStack(spacing: 10) {
                AvatarView(name: z.name ?? "—", url: Api.mediaURL(z.avatar_url), size: 28, userId: z.user_id, link: false)
                Text(z.name ?? "—").foregroundStyle(.primary).lineLimit(1)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }
}

/// Kommentare unter der Session (PWA SessionKommentare): Kopf mit Zahl, die neuesten Kommentare als Vorschau, darunter
/// ein Eingabefeld-Knopf in den Thread. Der Thread selbst ist der Chat (ChatRoomView, scope "session:<id>") — mit
/// Antworten, Daumen und Loeschen fremder Kommentare durch den Inhaber. Abgeschaltet sieht nur der Inhaber einen
/// Hinweis, wo er es wieder einschaltet; unter 13 (social_allowed) gar nichts.
struct SessionKommentareKarte: View {
    let sessionId: Int
    let owned: Bool
    let aus: Bool
    let anzahlServer: Int
    @Binding var threadOffen: Bool
    @AppStorage("appLang") private var lang = "de"
    @State private var neueste: [ChatMsg] = []
    @State private var geladen = 0

    static func scope(_ id: Int) -> String { "session:\(id)" }

    var body: some View {
        if aus {
            if owned { ausHinweis }
        } else {
            karte
                .task(id: geladen) { await laden() }
                // Zurueck aus dem Thread: Vorschau und Zahl frisch holen.
                .onChange(of: threadOffen) { offen in if !offen { geladen += 1 } }
        }
    }

    private var ausHinweis: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("comments.offOwner", lang)).font(.subheadline).foregroundStyle(.secondary)
            NavigationLink { SettingsView(teil: "privat") } label: {
                Text(Loc.t("comments.offLink", lang)).font(.subheadline)
            }
        }
    }

    /// Zahl: solange die geholte Liste vollstaendig ist (< 100), ihre sichtbaren Eintraege, sonst die Zahl des Servers.
    private var anzahl: Int {
        if geladen == 0 && neueste.isEmpty { return anzahlServer }
        return neueste.count < 100 ? neueste.filter { !$0.hidden }.count : anzahlServer
    }

    private var karte: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label {
                Text(Loc.t("comments.title", lang) + (anzahl > 0 ? " (\(anzahl))" : "")).font(.headline)
            } icon: {
                Image(systemName: "bubble.left").foregroundStyle(Color.accentColor)
            }
            if neueste.isEmpty {
                Text(Loc.t("comments.empty", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(neueste.suffix(3)) { m in vorschau(m) }
            }
            Button { threadOffen = true } label: {
                Text(Loc.t("comments.placeholder", lang)).font(.subheadline).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func vorschau(_ m: ChatMsg) -> some View {
        let text: String = m.text.isEmpty && !(m.photos ?? []).isEmpty ? Loc.t("chat.quotePhoto", lang) : m.text
        return HStack(alignment: .top, spacing: 8) {
            AvatarView(name: m.name ?? "—", url: Api.mediaURL(m.avatar_url), size: 28, userId: m.user_id)
            VStack(alignment: .leading, spacing: 1) {
                Text(m.name ?? "—").font(.caption.weight(.semibold))
                Text(text).font(.subheadline).lineLimit(3)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .onTapGesture { threadOffen = true }
    }

    private func laden() async {
        if let l = try? await Api.chatLatest(scope: Self.scope(sessionId), limit: 100) {
            neueste = l
        }
    }
}

/// Profil › Privatsphaere: Kommentare unter den eigenen Sessions erlauben (PWA KommentareCard, Feld `comments_off` in
/// /api/settings). Speichert sofort; schlaegt das fehl, springt der Schalter zurueck.
struct KommentareSection: View {
    let lang: String
    @State private var an: Bool? = nil
    @State private var busy = false

    var body: some View {
        Section {
            if an != nil {
                Toggle(Loc.t("comments.settingSwitch", lang), isOn: Binding(get: { an ?? true }, set: { v in setzen(v) }))
                    .disabled(busy)
            } else {
                // Ohne sichtbaren Inhalt laeuft `.task` nie (Memory swiftui-leere-group-laedt-nicht).
                ProgressView()
            }
        } header: {
            Text(Loc.t("comments.title", lang))
        } footer: {
            Text(Loc.t("comments.settingHint", lang))
        }
        .task { await laden() }
    }

    private func setzen(_ v: Bool) {
        let alt = an
        an = v
        busy = true
        Task {
            do { try await Api.saveSettings(["comments_off": !v]) } catch { an = alt }
            busy = false
        }
    }

    private func laden() async {
        let s = (try? await Api.settings()) ?? [:]
        an = (s["comments_off"] as? Bool) != true
    }
}
