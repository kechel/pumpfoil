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
        Group {
            if let p = pending {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane")
                    Text(Loc.t("transfer.pending", lang).replacingOccurrences(of: "{name}", with: p.other?.display_name ?? "?"))
                        .font(.footnote)
                    Spacer()
                    Button(Loc.t("transfer.cancel", lang)) { cancel(p) }.font(.footnote)
                }
                .foregroundStyle(.orange)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.12)))
            } else {
                Button {
                    showPicker = true
                    Task { friends = (try? await Api.transferFriends()) ?? [] }
                } label: {
                    Label(Loc.t("transfer.action", lang), systemImage: "paperplane")
                }
                .buttonStyle(.bordered)
            }
        }
        .task { await loadPending() }
        .sheet(isPresented: $showPicker) { picker }
    }

    private var picker: some View {
        NavigationStack {
            List {
                if query.trimmingCharacters(in: .whitespaces).isEmpty, !friends.isEmpty {
                    Section(Loc.t("transfer.friends", lang)) { rows(friends) }
                } else {
                    let list = query.trimmingCharacters(in: .whitespaces).isEmpty ? friends : results
                    if list.isEmpty {
                        Text(Loc.t("transfer.noResults", lang)).foregroundStyle(.secondary)
                    } else {
                        rows(list)
                    }
                }
            }
            .searchable(text: $query, prompt: Loc.t("transfer.searchAll", lang))
            .onChange(of: query) { q in
                let s = q.trimmingCharacters(in: .whitespaces)
                guard !s.isEmpty else { results = []; return }
                Task {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    if s == query.trimmingCharacters(in: .whitespaces) {
                        results = (try? await Api.chatSearchUsers(s)) ?? []
                    }
                }
            }
            .navigationTitle(Loc.t("transfer.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(Loc.t("common.cancel", lang)) { showPicker = false }
                }
            }
            .safeAreaInset(edge: .top) {
                Text(Loc.t("transfer.desc", lang))
                    .font(.caption).foregroundStyle(.secondary)
                    .padding(.horizontal).padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.bar)
            }
            .confirmationDialog(
                confirmUser.map { Loc.t("transfer.confirmSend", lang).replacingOccurrences(of: "{name}", with: $0.display_name ?? "?") } ?? "",
                isPresented: Binding(get: { confirmUser != nil }, set: { if !$0 { confirmUser = nil } }),
                titleVisibility: .visible
            ) {
                if let u = confirmUser {
                    Button(Loc.t("transfer.action", lang)) { send(u) }
                    Button(Loc.t("common.cancel", lang), role: .cancel) { confirmUser = nil }
                }
            }
        }
    }

    @ViewBuilder private func rows(_ list: [DmUser]) -> some View {
        ForEach(list) { u in
            Button { confirmUser = u } label: {
                HStack(spacing: 10) {
                    if let url = Api.mediaURL(u.avatar_url) {
                        AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.15) }
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
        if let t = try? await Api.transferForSession(sessionId), t?.role == "sender" { pending = t }
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
