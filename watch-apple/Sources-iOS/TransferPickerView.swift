import SwiftUI

// „Session übertragen an …" — Besitzer gibt eine Session an einen anderen Nutzer weiter
// (z. B. Uhr verliehen). Zeigt sonst den Status einer ausstehenden Übertragung + Zurücknehmen.
struct TransferPickerView: View {
    let sessionId: Int
    @AppStorage("appLang") private var lang = "de"
    @State private var pending: Transfer?
    @State private var showPicker = false
    @State private var friends: [DmUser] = []
    @State private var query = ""
    @State private var results: [DmUser] = []
    @State private var confirmUser: DmUser?
    @State private var busy = false

    var body: some View {
        content
            .task { await loadPending() }
            .sheet(isPresented: $showPicker) { picker }
    }

    @ViewBuilder private var content: some View {
        if let p = pending {
            pendingRow(p)
        } else {
            openPickerButton
        }
    }

    private func pendingRow(_ p: Transfer) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "paperplane")
            Text(pendingText(p))
                .font(.footnote)
            Spacer()
            Button(Loc.t("transfer.cancel", lang)) { cancel(p) }.font(.footnote)
        }
        .foregroundStyle(.orange)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.12)))
    }

    private var openPickerButton: some View {
        Button { openPicker() } label: {
            Label(Loc.t("transfer.action", lang), systemImage: "paperplane")
        }
        .buttonStyle(.bordered)
    }

    private func openPicker() {
        showPicker = true
        Task { friends = (try? await Api.transferFriends()) ?? [] }
    }

    // MARK: - Auswahl-Sheet

    // Der Sheet-Inhalt war ~50 Zeilen in EINEM Ausdruck — mit searchable, confirmationDialog samt
    // .map{}??-Titel und inline gebautem Binding. Swifts Type-Checker loest einen ViewBuilder als
    // EINEN Ausdruck auf; genau solche Ketten treiben die Kosten. Jetzt je ein typisierter Teil.
    private var picker: some View {
        NavigationStack {
            pickerList
                .searchable(text: $query, prompt: Loc.t("transfer.searchAll", lang))
                .onChange(of: query) { q in searchChanged(q) }
                .navigationTitle(Loc.t("transfer.title", lang))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { cancelToolbar }
                .safeAreaInset(edge: .top) { descBanner }
                .confirmationDialog(confirmTitle, isPresented: confirmPresented,
                                    titleVisibility: .visible) { confirmButtons }
        }
    }

    private var pickerList: some View {
        List {
            if trimmedQuery.isEmpty, !friends.isEmpty {
                Section(Loc.t("transfer.friends", lang)) { rows(friends) }
            } else {
                resultRows
            }
        }
    }

    @ViewBuilder private var resultRows: some View {
        let list: [DmUser] = trimmedQuery.isEmpty ? friends : results
        if list.isEmpty {
            Text(Loc.t("transfer.noResults", lang)).foregroundStyle(.secondary)
        } else {
            rows(list)
        }
    }

    @ToolbarContentBuilder private var cancelToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button(Loc.t("common.cancel", lang)) { showPicker = false }
        }
    }

    private var descBanner: some View {
        Text(Loc.t("transfer.desc", lang))
            .font(.caption).foregroundStyle(.secondary)
            .padding(.horizontal).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
    }

    @ViewBuilder private var confirmButtons: some View {
        if let u = confirmUser {
            Button(Loc.t("transfer.action", lang)) { send(u) }
            Button(Loc.t("common.cancel", lang), role: .cancel) { confirmUser = nil }
        }
    }

    // Verketteter .map{}??-Ausdruck bzw. inline gebautes Binding — beides vorab typisiert.
    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    private func pendingText(_ p: Transfer) -> String {
        let name: String = p.other?.display_name ?? "?"
        return Loc.t("transfer.pending", lang).replacingOccurrences(of: "{name}", with: name)
    }

    private var confirmTitle: String {
        guard let u = confirmUser else { return "" }
        let name: String = u.display_name ?? "?"
        return Loc.t("transfer.confirmSend", lang).replacingOccurrences(of: "{name}", with: name)
    }

    private var confirmPresented: Binding<Bool> {
        Binding(get: { confirmUser != nil }, set: { if !$0 { confirmUser = nil } })
    }

    // Debounce der Nutzersuche (250 ms) — Ablauflogik als Methode statt als onChange-Closure.
    private func searchChanged(_ q: String) {
        let s = q.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { results = []; return }
        Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if s == query.trimmingCharacters(in: .whitespaces) {
                results = (try? await Api.chatSearchUsers(s)) ?? []
            }
        }
    }

    @ViewBuilder private func rows(_ list: [DmUser]) -> some View {
        ForEach(list) { u in
            Button { confirmUser = u } label: {
                HStack(spacing: 10) {
                    if let url = Api.mediaURL(u.avatar_url) {
                        NetzBild(url: url) { stand in
                            if case .da(let img) = stand { img.resizable().scaledToFill() }
                            else { Color.secondary.opacity(0.15) }
                        }
                            .frame(width: 30, height: 30).clipShape(Circle())
                    } else {
                        Image(systemName: "person.circle.fill").resizable().frame(width: 30, height: 30).foregroundStyle(.secondary)
                    }
                    Text(u.display_name ?? "?")
                    Spacer()
                }
            }
            .disabled(busy)
        }
    }

    private func loadPending() async {
        if let t = try? await Api.transferForSession(sessionId), t.role == "sender" { pending = t }
    }

    private func send(_ u: DmUser) {
        confirmUser = nil
        busy = true
        Task {
            pending = try? await Api.transferInitiate(sessionId: sessionId, toUserId: u.id)
            showPicker = false; query = ""; results = []
            busy = false
        }
    }

    private func cancel(_ p: Transfer) {
        Task { try? await Api.transferCancel(p.id); pending = nil }
    }
}
