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
    @State private var isAdmin = false
    @State private var push = false
    @State private var confirmLeave = false
    @State private var lastId = 0
    @Environment(\.dismiss) private var dismiss

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
        .toolbar {
            // Abonnieren (Push) + Verlassen — wie Web-Chat.
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { push = (try? await Api.chatSubscribe(scope: scope, on: !push)) ?? push }
                } label: {
                    Image(systemName: push ? "bell.fill" : "bell.slash")
                        .foregroundStyle(push ? Color.accentColor : .secondary)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { confirmLeave = true } label: { Image(systemName: "rectangle.portrait.and.arrow.right") }
            }
        }
        .confirmationDialog(Loc.t("chat.leaveConfirm", lang), isPresented: $confirmLeave, titleVisibility: .visible) {
            Button(Loc.t("chat.leave", lang), role: .destructive) {
                Task { try? await Api.chatLeave(scope: scope); dismiss() }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        }
        .task {
            if let p = try? await Api.getProfile() { isAdmin = p.is_admin ?? false }
            push = (try? await Api.chatRoomState(scope: scope).push) ?? false
            await load()
            // Live-Polling neuer Nachrichten (~10 s), wie die Web-PWA.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                if Task.isCancelled { break }
                if let since = try? await Api.chatSince(scope: scope, after: lastId), !since.isEmpty {
                    let known = Set(msgs.map { $0.id })
                    let add = since.filter { !known.contains($0.id) }
                    if !add.isEmpty {
                        msgs.append(contentsOf: add)
                        lastId = msgs.map { $0.id }.max() ?? lastId
                        try? await Api.chatMarkRead(scope: scope, upTo: lastId)
                    }
                }
            }
        }
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

    // Flacher Diskussions-Thread wie die PWA (Avatar + Name + Zeit + Text), nicht iMessage-Blasen —
    // passend für den öffentlichen Spot-Gruppenchat und konsistent mit Web/Android.
    @ViewBuilder private func bubble(_ m: ChatMsg) -> some View {
        HStack(alignment: .top, spacing: 8) {
            chatAvatar(m)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(m.name ?? "—").font(.subheadline).fontWeight(.semibold)
                    if let ts = hhmmChat(m.created_at) {
                        Text(ts).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Text(linkified(m.text)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(m.hidden ? 0.5 : 1)
        .contextMenu {
            if editable(m) {
                Button(Loc.t("chat.edit", lang)) { editText = m.text; editMsg = m }
                Button(Loc.t("common.delete", lang), role: .destructive) {
                    Task { try? await Api.chatDelete(m.id); await load() }
                }
            }
            if !m.mine {
                Button(Loc.t("chat.report", lang)) { Task { try? await Api.chatReport(m.id) } }
            }
            if isAdmin {
                Button(m.hidden ? Loc.t("chat.unhide", lang) : Loc.t("chat.hide", lang)) {
                    Task { try? await Api.chatHide(m.id, hidden: !m.hidden); await load() }
                }
                if !m.mine {
                    Button(Loc.t("chat.readonly", lang), role: .destructive) {
                        Task { try? await Api.chatSetReadonly(userId: m.user_id, readonly: true) }
                    }
                }
            }
        }
    }

    // Nachrichtentext mit klickbaren Links (wie Web-linkify).
    private func linkified(_ text: String) -> AttributedString {
        var a = AttributedString(text)
        if let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) {
            for m in detector.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                if let url = m.url, let r = Range(m.range, in: a) {
                    a[r].link = url
                    a[r].foregroundColor = .accentColor
                }
            }
        }
        return a
    }

    @ViewBuilder private func chatAvatar(_ m: ChatMsg) -> some View {
        if let url = Api.mediaURL(m.avatar_url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 32, height: 32).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill").resizable().scaledToFit()
                .frame(width: 32, height: 32).foregroundStyle(Color.accentColor)
        }
    }

    private func hhmmChat(_ iso: String?) -> String? {
        guard let iso, let d = SessionDetail.parseDate(iso) else { return nil }
        let f = DateFormatter(); f.dateFormat = "dd.MM. HH:mm"
        return f.string(from: d)
    }

    private func load() async {
        do {
            msgs = try await Api.chatLatest(scope: scope, limit: 100); error = nil
            lastId = msgs.map { $0.id }.max() ?? 0
            if lastId > 0 { try? await Api.chatMarkRead(scope: scope, upTo: lastId) }
        } catch { self.error = error.localizedDescription }
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        sending = true; defer { sending = false }
        do {
            let m = try await Api.chatPost(scope: scope, text: text)
            msgs.append(m)
            lastId = max(lastId, m.id)
            draft = ""
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
