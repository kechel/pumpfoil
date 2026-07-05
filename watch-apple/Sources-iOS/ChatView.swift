import SwiftUI

// Chat: Räume (Spot/Community) -> Nachrichten + Senden (spiegelt web/Android-Chat).
struct ChatView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rooms: [ChatRoom] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(rooms) { r in
                    NavigationLink { ChatRoomView(scope: r.scope, title: r.label) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.label).font(.headline)
                                if !r.last_text.isEmpty {
                                    Text(r.last_text).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                            Spacer()
                            if r.unread > 0 {
                                Text("\(r.unread)").font(.caption2).bold()
                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                    .background(Color.accentColor, in: Capsule())
                                    .foregroundStyle(.white)
                            }
                        }
                    }
                }
                if rooms.isEmpty && !loading && error == nil {
                    Text(Loc.t("chat.empty", lang)).foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.chat", lang))
            .brandToolbar(Loc.t("nav.chat", lang))
            .overlay { if loading && rooms.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if rooms.isEmpty { await load() } }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { rooms = try await Api.chatRooms(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

// Einzelner Chat-Raum: Nachrichten + Eingabe.
struct ChatRoomView: View {
    let scope: String
    let title: String
    @AppStorage("appLang") private var lang = "de"
    @State private var msgs: [ChatMsg] = []
    @State private var draft = ""
    @State private var sending = false
    @State private var error: String?
    @State private var editMsg: ChatMsg?
    @State private var editText = ""
    @State private var showDict = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(msgs) { m in bubble(m) }
                        Text(Loc.t("chat.editHint", lang))
                            .font(.caption2).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 6)
                    }
                    .padding()
                    .id("bottom")
                }
                .onChange(of: msgs.count) { _ in
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
            HStack(spacing: 8) {
                TextField(Loc.t("chat.placeholder", lang), text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                Button { showDict = true } label: { Image(systemName: "mic.fill") }
                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(8)
            .background(.bar)
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .fullScreenCover(isPresented: $showDict) {
            DictationView(existing: draft, title: title, lang: lang) { text, send in
                let t = (draft.isEmpty ? text : "\(draft) \(text)").trimmingCharacters(in: .whitespaces)
                if send {
                    draft = t
                    Task { await self.send() }
                } else {
                    draft = t
                }
            }
        }
        .alert(Loc.t("chat.edit", lang), isPresented: Binding(get: { editMsg != nil }, set: { if !$0 { editMsg = nil } })) {
            TextField(Loc.t("chat.placeholder", lang), text: $editText)
            Button(Loc.t("common.save", lang)) {
                if let m = editMsg { let t = editText.trimmingCharacters(in: .whitespaces); editMsg = nil
                    if !t.isEmpty { Task { try? await Api.chatEdit(m.id, text: t); await load() } } }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) { editMsg = nil }
        }
    }

    // Eigene Nachricht < 1 h -> bearbeitbar/löschbar (Server erzwingt es ohnehin).
    private func editable(_ m: ChatMsg) -> Bool {
        guard m.mine, let s = m.created_at, let d = SessionDetail.parseDate(s) else { return false }
        return Date().timeIntervalSince(d) < 3600
    }

    @ViewBuilder private func bubble(_ m: ChatMsg) -> some View {
        HStack {
            if m.mine { Spacer(minLength: 40) }
            VStack(alignment: m.mine ? .trailing : .leading, spacing: 2) {
                if !m.mine, let n = m.name, !n.isEmpty {
                    Text(n).font(.caption2).foregroundStyle(.secondary)
                }
                Text(m.text)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(m.mine ? Color.accentColor : Color(.secondarySystemBackground),
                                in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(m.mine ? .white : .primary)
                    .contextMenu {
                        if editable(m) {
                            Button(Loc.t("chat.edit", lang)) { editText = m.text; editMsg = m }
                            Button(Loc.t("common.delete", lang), role: .destructive) {
                                Task { try? await Api.chatDelete(m.id); await load() }
                            }
                        }
                    }
            }
            if !m.mine { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading)
    }

    private func load() async {
        do { msgs = try await Api.chatLatest(scope: scope, limit: 100); error = nil }
        catch { self.error = error.localizedDescription }
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        sending = true; defer { sending = false }
        do {
            let m = try await Api.chatPost(scope: scope, text: text)
            msgs.append(m)
            draft = ""
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
