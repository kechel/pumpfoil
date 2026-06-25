import SwiftUI

// Chat: Räume (Spot/Community) -> Nachrichten + Senden (spiegelt web/Android-Chat).
struct ChatView: View {
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
                    Text("Noch keine Chats").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Chat")
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
    @State private var msgs: [ChatMsg] = []
    @State private var draft = ""
    @State private var sending = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(msgs) { m in bubble(m) }
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
                TextField("Nachricht", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
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
            }
            if !m.mine { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading)
    }

    private func load() async {
        do { msgs = try await Api.chatLatest(scope: scope); error = nil }
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
