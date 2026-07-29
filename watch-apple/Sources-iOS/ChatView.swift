import SwiftUI

// Chat: Räume (Spot/Community) -> Nachrichten + Senden (spiegelt web/Android-Chat).
// Zwei Tabs: „Meine" (DMs + eigene Spot-Chats) und „Spot-Chats" (alle, aktivste zuerst).
// Globale Suche über beide: tippen -> Personen (→ DM) + Spots (→ öffnen), egal welcher Tab.
struct ChatView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rooms: [ChatRoom] = []
    @State private var allSpots: [SpotChat] = []
    @State private var loading = false
    @State private var error: String?
    @State private var tab = 0        // 0 = Meine, 1 = Spot-Chats
    @State private var q = ""
    @State private var results: [DmUser] = []
    @State private var openDm: DmOpen?
    @State private var blockedUsers: [DmUser] = []   // zum Entblocken
    @State private var showBlocked = false

    private var term: String { q.trimmingCharacters(in: .whitespaces) }
    private var joined: Set<String> { Set(rooms.map { $0.scope }) }   // Spots, in denen man drin ist
    private var subscribedScopes: Set<String> { Set(rooms.filter { $0.push == true }.map { $0.scope }) }  // abonniert → Glocke
    private var blockedIds: Set<Int> { Set(blockedUsers.map { $0.id }) }
    // Blockierte DM-Chats gar nicht in „Meine" listen (nur unten in der Blockiert-Liste).
    private var visibleRooms: [ChatRoom] { rooms.filter { !($0.kind == "dm" && blockedIds.contains($0.other?.id ?? 0)) } }
    private var spotsShown: [SpotChat] {
        let sorted = allSpots.sorted { $0.messages > $1.messages }    // aktivste zuerst
        guard !term.isEmpty else { return sorted }
        return sorted.filter { $0.label.lowercased().contains(term.lowercased()) }
    }

    // Ein Body pro Abschnitt: Swifts Type-Checker loest einen ViewBuilder als EINEN Ausdruck auf,
    // und die Kosten wachsen ueberproportional mit Kindern/Modifiern/Ternaries. Die Liste unten war
    // ein 55-Zeilen-Ausdruck mit drei verschachtelten Zweigen (>500 ms im Build-Log).
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabPicker
                chatList
            }
            .navigationTitle(Loc.t("nav.chat", lang))
            .brandToolbar(Loc.t("nav.chat", lang))
            .overlay { loadingOverlay }
            .navigationDestination(isPresented: dmBinding) { dmDestination }
        }
    }

    // .tag() muss direktes Kind des Pickers bleiben -> Picker und Tabs wandern gemeinsam hierher.
    private var tabPicker: some View {
        Picker("", selection: $tab) {
            Text(Loc.t("dm.tabMine", lang)).tag(0)
            Text(Loc.t("dm.tabSpots", lang)).tag(1)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal).padding(.top, 8)
    }

    @ViewBuilder private var loadingOverlay: some View {
        if loading && rooms.isEmpty { ProgressView() }
    }

    // Binding vorab: die Closure-Paare im Modifier-Argument kosten den Type-Checker extra.
    private var dmBinding: Binding<Bool> {
        Binding(get: { openDm != nil }, set: { if !$0 { openDm = nil } })
    }

    @ViewBuilder private var dmDestination: some View {
        if let d = openDm { ChatRoomView(scope: d.scope, title: d.other.name ?? "", otherId: d.other.id) }
    }

    private var chatList: some View {
        List {
            searchField
            errorRow
            if !term.isEmpty {
                searchResults
            } else if tab == 0 {
                mineTab
            } else {
                spotsTab
            }
        }
        .listStyle(.plain)   // .insetGrouped hatte großen Top-Inset -> zu viel Padding oben
        .refreshable { await load() }
        .task { if rooms.isEmpty { await load() } }
        .onChange(of: q) { _ in Task { await search() } }
        .onChange(of: tab) { _ in resetSearch() }
    }

    private var searchField: some View {
        Section {
            TextField(Loc.t("dm.searchAll", lang), text: $q)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
        }
    }

    @ViewBuilder private var errorRow: some View {
        if let error { Text(error).foregroundStyle(.secondary) }
    }

    // Globale Suche: Personen (→ DM) + Spots (→ öffnen), egal welcher Tab.
    @ViewBuilder private var searchResults: some View {
        if !results.isEmpty { Section { ForEach(results) { userRow($0) } } }
        if !spotsShown.isEmpty { Section { ForEach(spotsShown) { spotRow($0) } } }
        if results.isEmpty && spotsShown.isEmpty {
            Text(Loc.t("dm.noResults", lang)).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var mineTab: some View {
        ForEach(visibleRooms) { roomRow($0) }
        if visibleRooms.isEmpty && !loading && error == nil {
            Text(Loc.t("chat.empty", lang)).foregroundStyle(.secondary)
        }
        blockedSection
    }

    // Blockierte: aus der Liste raus, hier ausklappbar zum Entblocken.
    @ViewBuilder private var blockedSection: some View {
        if !blockedUsers.isEmpty {
            Section {
                DisclosureGroup(isExpanded: $showBlocked) {
                    ForEach(blockedUsers) { u in blockedRow(u) }
                } label: {
                    Text(blockedListLabel)
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder private var spotsTab: some View {
        globalRoomRow
        ForEach(spotsShown) { spotRow($0) }
        if spotsShown.isEmpty {
            Text(Loc.t("chat.empty", lang)).foregroundStyle(.secondary)
        }
    }

    // Globaler Community-Chat: fester Eintrag oben (Einstieg & Wieder-Beitritt).
    private var globalRoomRow: some View {
        NavigationLink { ChatRoomView(scope: "global:main", title: Loc.t("chat.globalName", lang), otherId: 0) } label: {
            HStack(spacing: 10) {
                Image(systemName: "bubble.left.and.bubble.right.fill").foregroundStyle(Color.accentColor)
                Text(Loc.t("chat.globalName", lang)).font(.headline)
                Spacer()
                globalJoinedMark
            }
        }
    }

    @ViewBuilder private var globalJoinedMark: some View {
        if joined.contains("global:main") {
            Image(systemName: "checkmark").font(.caption).foregroundStyle(Color.accentColor)
        }
    }

    @ViewBuilder private func userRow(_ u: DmUser) -> some View {
        Button {
            openDmWith(u)
        } label: {
            HStack {
                Image(systemName: "person.crop.circle.fill").foregroundStyle(Color.accentColor)
                Text(u.display_name ?? "—")
            }
        }
    }

    @ViewBuilder private func roomRow(_ r: ChatRoom) -> some View {
        NavigationLink { ChatRoomView(scope: r.scope, title: roomTitle(r), otherId: r.other?.id ?? 0) } label: {
            HStack {
                Image(systemName: roomIcon(r))
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(roomTitle(r)).font(.headline)
                    if !r.last_text.isEmpty {
                        Text(r.last_text).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer()
                roomBadges(r)
            }
        }
    }

    @ViewBuilder private func roomBadges(_ r: ChatRoom) -> some View {
        if r.push == true {
            Image(systemName: "bell.fill").font(.caption2).foregroundStyle(Color.accentColor)
        }
        if r.unread > 0 {
            Text("\(r.unread)").font(.caption2).bold()
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(Color.accentColor, in: Capsule())
                .foregroundStyle(.white)
        }
    }

    @ViewBuilder private func spotRow(_ s: SpotChat) -> some View {
        NavigationLink { ChatRoomView(scope: s.scope, title: s.label, otherId: 0) } label: {
            HStack {
                Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.accentColor)
                Text(s.label).font(.headline)
                Spacer()
                spotMark(s)
                Text("\(s.messages)").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    // Abonniert → Glocke; sonst beigetreten → Häkchen.
    @ViewBuilder private func spotMark(_ s: SpotChat) -> some View {
        if subscribedScopes.contains(s.scope) {
            Image(systemName: "bell.fill").font(.caption2).foregroundStyle(Color.accentColor)
        } else if joined.contains(s.scope) {
            Image(systemName: "checkmark").font(.caption2).foregroundStyle(Color.accentColor)
        }
    }

    @ViewBuilder private func blockedRow(_ u: DmUser) -> some View {
        HStack {
            Image(systemName: "person.crop.circle.fill").foregroundStyle(Color.accentColor)
            Text(u.display_name ?? "—")
            Spacer()
            Button(Loc.t("dm.unblock", lang)) { unblock(u) }.buttonStyle(.borderless)
        }
    }

    // Texte/Symbole vorab typisiert: Verkettung, Interpolation und Ternaries sind im ViewBuilder die
    // teuersten Konstrukte (jede Ueberladung muss geprueft werden).
    private var blockedListLabel: String {
        let name: String = Loc.t("dm.blockedList", lang)
        return name + " (\(blockedUsers.count))"
    }

    private func roomTitle(_ r: ChatRoom) -> String {
        r.kind == "dm" ? (r.other?.name ?? r.label) : r.label
    }

    private func roomIcon(_ r: ChatRoom) -> String {
        r.kind == "dm" ? "person.crop.circle.fill" : "bubble.left.and.bubble.right.fill"
    }

    // Ablauflogik als Methoden statt als Closures im ViewBuilder.
    private func openDmWith(_ u: DmUser) {
        Task { if let d = try? await Api.chatDmOpen(userId: u.id) { q = ""; results = []; openDm = d } }
    }

    private func unblock(_ u: DmUser) {
        Task { try? await Api.chatUnblock(userId: u.id); blockedUsers.removeAll { $0.id == u.id } }
    }

    private func resetSearch() {
        q = ""; results = []
    }

    private func search() async {
        let t = q.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { results = []; return }
        try? await Task.sleep(nanoseconds: 250_000_000)
        if t != q.trimmingCharacters(in: .whitespaces) { return }   // veraltet -> verwerfen
        results = (try? await Api.chatSearchUsers(t)) ?? []
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { rooms = try await Api.chatRooms(); error = nil }
        catch { self.error = error.localizedDescription }
        allSpots = (try? await Api.chatAllSpots()) ?? []
        blockedUsers = (try? await Api.chatBlocks()) ?? []
    }
}

// Einzelner Chat-Raum: Nachrichten + Eingabe.
struct ChatRoomView: View {
    let scope: String
    let title: String
    var otherId: Int = 0                       // > 0 nur bei DMs (für Blockieren)
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
    @State private var blocked = false
    @State private var confirmBlock = false
    private var isDm: Bool { scope.hasPrefix("dm:") }
    @Environment(\.dismiss) private var dismiss

    // Dieser Body war 112 Zeilen (Scroller + Eingabe + 3 Toolbar-Items + 2 Dialoge + Polling-Task +
    // Cover + Alert) und stand mit >500 ms im Build-Log. Alles unten sind eigene, explizit typisierte
    // Ausdruecke; Reihenfolge der Modifier bleibt unveraendert.
    var body: some View {
        VStack(spacing: 0) {
            messageScroll
            blockedNote
            errorNote
            composer
        }
        .brandToolbar(title)
        .toolbar { roomToolbar }
        .confirmationDialog(Loc.t("chat.leaveConfirm", lang), isPresented: $confirmLeave, titleVisibility: .visible) {
            leaveDialogButtons
        }
        .confirmationDialog(Loc.t("dm.blockConfirm", lang), isPresented: $confirmBlock, titleVisibility: .visible) {
            blockDialogButtons
        }
        .task { await enterRoom() }
        .fullScreenCover(isPresented: $showDict) { dictationCover }
        .alert(Loc.t("chat.edit", lang), isPresented: editBinding) { editDialogButtons }
    }

    // Der ScrollViewReader bleibt hier: proxy.scrollTo muss im selben ViewBuilder-Scope stehen wie
    // der Proxy. Nur der Inhalt (der den Proxy nicht braucht) wandert nach messageList.
    private var messageScroll: some View {
        ScrollViewReader { proxy in
            ScrollView { messageList }
                .onChange(of: msgs.count) { _ in
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
        }
    }

    private var messageList: some View {
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

    @ViewBuilder private var blockedNote: some View {
        if blocked { Text(Loc.t("dm.blockedNote", lang)).font(.caption).foregroundStyle(.red).padding(.horizontal) }
    }

    @ViewBuilder private var errorNote: some View {
        if let error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField(Loc.t("chat.placeholder", lang), text: $draft, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
            Button { showDict = true } label: { Image(systemName: "mic.fill") }
            sendButton
        }
        .padding(8)
        .background(.bar)
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            Image(systemName: "paperplane.fill")
        }
        .disabled(sendDisabled)
    }

    private var sendDisabled: Bool {
        sending || draft.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // Abonnieren (Push) + Verlassen — wie Web-Chat.
    @ToolbarContentBuilder private var roomToolbar: some ToolbarContent {
        blockToolbarItem
        ToolbarItem(placement: .topBarTrailing) {
            Button { togglePush() } label: {
                Image(systemName: pushIcon).foregroundStyle(pushTint)
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { confirmLeave = true } label: { Image(systemName: "rectangle.portrait.and.arrow.right") }
        }
    }

    // DM: blockieren/entblocken.
    @ToolbarContentBuilder private var blockToolbarItem: some ToolbarContent {
        if isDm && otherId > 0 {
            ToolbarItem(placement: .topBarTrailing) {
                Button { toggleBlock() } label: {
                    Image(systemName: "hand.raised.fill").foregroundStyle(blockTint)
                }
            }
        }
    }

    @ViewBuilder private var leaveDialogButtons: some View {
        Button(Loc.t("chat.leave", lang), role: .destructive) { leaveRoom() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    @ViewBuilder private var blockDialogButtons: some View {
        Button(Loc.t("dm.block", lang), role: .destructive) { blockUser() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    private var dictationCover: some View {
        DictationView(existing: draft, title: title, lang: lang) { text, doSend in
            applyDictation(text, doSend: doSend)
        }
    }

    private var editBinding: Binding<Bool> {
        Binding(get: { editMsg != nil }, set: { if !$0 { editMsg = nil } })
    }

    @ViewBuilder private var editDialogButtons: some View {
        TextField(Loc.t("chat.placeholder", lang), text: $editText)
        Button(Loc.t("common.save", lang)) { saveEdit() }
        Button(Loc.t("common.cancel", lang), role: .cancel) { editMsg = nil }
    }

    // Symbol/Farbe vorab typisiert — Ternaries direkt im Modifier sind fuer den Type-Checker teuer.
    private var pushIcon: String { push ? "bell.fill" : "bell.slash" }
    private var pushTint: Color { push ? Color.accentColor : .secondary }
    private var blockTint: Color { blocked ? Color.accentColor : .secondary }

    // MARK: - Ablauf (aus den Closures herausgezogen)

    private func togglePush() {
        Task { push = (try? await Api.chatSubscribe(scope: scope, on: !push)) ?? push }
    }

    private func toggleBlock() {
        if blocked { Task { try? await Api.chatUnblock(userId: otherId); blocked = false } }
        else { confirmBlock = true }
    }

    private func leaveRoom() {
        Task { try? await Api.chatLeave(scope: scope); dismiss() }
    }

    private func blockUser() {
        Task { try? await Api.chatBlock(userId: otherId); blocked = true }
    }

    private func applyDictation(_ text: String, doSend: Bool) {
        let t: String = (draft.isEmpty ? text : "\(draft) \(text)").trimmingCharacters(in: .whitespaces)
        draft = t
        if doSend { Task { await self.send() } }
    }

    private func saveEdit() {
        guard let m = editMsg else { return }
        let t: String = editText.trimmingCharacters(in: .whitespaces)
        editMsg = nil
        if !t.isEmpty { Task { try? await Api.chatEdit(m.id, text: t); await load() } }
    }

    private func enterRoom() async {
        if let p = try? await Api.getProfile() { isAdmin = p.is_admin ?? false }
        push = (try? await Api.chatRoomState(scope: scope).push) ?? false
        if isDm && otherId > 0 { blocked = ((try? await Api.chatBlocks()) ?? []).contains { $0.id == otherId } }
        await load()
        await pollNew()
    }

    // Live-Polling neuer Nachrichten (~10 s), wie die Web-PWA.
    private func pollNew() async {
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

    // Eigene Nachricht < 1 h -> bearbeitbar/löschbar (Server erzwingt es ohnehin).
    private func editable(_ m: ChatMsg) -> Bool {
        guard m.mine, let s = m.created_at, let d = SessionDetail.parseDate(s) else { return false }
        return Date().timeIntervalSince(d) < 3600
    }

    // Flacher Diskussions-Thread wie die PWA (Avatar + Name + Zeit + Text), nicht iMessage-Blasen —
    // passend für den öffentlichen Spot-Gruppenchat und konsistent mit Web/Android.
    @ViewBuilder private func bubble(_ m: ChatMsg) -> some View {
        HStack(alignment: .top, spacing: 8) {
            chatAvatarColumn(m)
            VStack(alignment: .leading, spacing: 2) {
                bubbleHeader(m)
                Text(linkified(m.text)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(bubbleOpacity(m))
        .contextMenu { bubbleMenu(m) }
    }

    @ViewBuilder private func bubbleHeader(_ m: ChatMsg) -> some View {
        HStack(spacing: 6) {
            Text(m.name ?? "—").font(.subheadline).fontWeight(.semibold)
            if let ts = hhmmChat(m.created_at) {
                Text(ts).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private func bubbleMenu(_ m: ChatMsg) -> some View {
        if editable(m) {
            Button(Loc.t("chat.edit", lang)) { editText = m.text; editMsg = m }
            Button(Loc.t("common.delete", lang), role: .destructive) {
                Task { try? await Api.chatDelete(m.id); await load() }
            }
        }
        if !m.mine {
            Button(Loc.t("chat.report", lang)) { Task { try? await Api.chatReport(m.id) } }
        }
        if isAdmin { adminMenu(m) }
    }

    @ViewBuilder private func adminMenu(_ m: ChatMsg) -> some View {
        Button(hideLabel(m)) {
            Task { try? await Api.chatHide(m.id, hidden: !m.hidden); await load() }
        }
        if !m.mine {
            Button(Loc.t("chat.readonly", lang), role: .destructive) {
                Task { try? await Api.chatSetReadonly(userId: m.user_id, readonly: true) }
            }
        }
    }

    private func bubbleOpacity(_ m: ChatMsg) -> Double { m.hidden ? 0.5 : 1 }

    private func hideLabel(_ m: ChatMsg) -> String {
        m.hidden ? Loc.t("chat.unhide", lang) : Loc.t("chat.hide", lang)
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

    // Avatar plus Daumen-hoch darunter -- dieselbe Anordnung wie in der PWA (Chat.tsx:244-252):
    // gefuellt+cyan wenn gesetzt, sonst grau, Zaehler nur wenn > 0, bei versteckten Nachrichten gar
    // nicht. In zwei Teil-Views getrennt ([[ios-swift-typecheck-hang]]).
    @ViewBuilder private func chatAvatarColumn(_ m: ChatMsg) -> some View {
        VStack(spacing: 2) {
            chatAvatar(m)
            if !m.hidden { chatLikeButton(m) }
        }
    }

    @ViewBuilder private func chatLikeButton(_ m: ChatMsg) -> some View {
        let count: Int = m.like_count ?? 0
        let icon: String = (m.liked ?? false) ? "hand.thumbsup.fill" : "hand.thumbsup"
        let tint: Color = (m.liked ?? false) ? Color.accentColor : Color.secondary
        Button {
            toggleLike(m)
        } label: {
            HStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.caption)
                if count > 0 { Text("\(count)").font(.caption2) }
            }
            .foregroundStyle(tint)
        }
        .buttonStyle(.plain)
    }

    private func toggleLike(_ m: ChatMsg) {
        Task {
            guard let r = try? await Api.chatLike(m.id) else { return }
            msgs = msgs.map { x in relike(x, id: m.id, count: r.like_count, liked: r.liked) }
        }
    }

    // ChatMsg hat nur `let`-Felder -> die getroffene Nachricht wird neu gebaut, der Rest bleibt.
    private func relike(_ x: ChatMsg, id: Int, count: Int, liked: Bool) -> ChatMsg {
        guard x.id == id else { return x }
        return ChatMsg(id: x.id, user_id: x.user_id, name: x.name, avatar_url: x.avatar_url,
                       text: x.text, created_at: x.created_at, mine: x.mine, hidden: x.hidden,
                       like_count: count, liked: liked)
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
