import PhotosUI
import SwiftUI
import UIKit

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

    // Profilbild statt Personen-Symbol, damit der Online-Punkt einen Platz hat (PWA DmWidget).
    // `link: false`: der Tipp oeffnet hier den Chat, nicht die Foiler-Seite.
    @ViewBuilder private func userRow(_ u: DmUser) -> some View {
        Button {
            openDmWith(u)
        } label: {
            HStack {
                AvatarView(name: u.display_name, url: Api.mediaURL(u.avatar_url), size: 28,
                           userId: u.id, link: false)
                Text(u.display_name ?? "—")
            }
        }
    }

    @ViewBuilder private func roomRow(_ r: ChatRoom) -> some View {
        NavigationLink { ChatRoomView(scope: r.scope, title: roomTitle(r), otherId: r.other?.id ?? 0) } label: {
            HStack {
                roomLeading(r)
                VStack(alignment: .leading, spacing: 2) {
                    Text(roomTitle(r)).font(.headline)
                    roomPreview(r)
                }
                Spacer()
                roomBadges(r)
            }
        }
    }

    // 1:1: Profilbild des Gegenuebers mit Online-Punkt (PWA DmWidget), ohne Tipp auf die
    // Foiler-Seite — die Zeile oeffnet den Chat. Spot-/Community-Raeume behalten ihr Symbol.
    @ViewBuilder private func roomLeading(_ r: ChatRoom) -> some View {
        if r.kind == "dm", let o = r.other {
            AvatarView(name: o.name, url: Api.mediaURL(o.avatar_url), size: 32, userId: o.id, link: false)
        } else {
            Image(systemName: roomIcon(r))
                .foregroundStyle(Color.accentColor)
        }
    }

    // Vorschau der letzten Nachricht; hatte sie Bilder, steht ein Kamera-Symbol davor (PWA
    // DmWidget, 30.09.2026). Eine Nachricht NUR aus Bildern hat leeren Text — dann steht das
    // Symbol allein da, statt dass die Zeile leer bleibt.
    @ViewBuilder private func roomPreview(_ r: ChatRoom) -> some View {
        let foto: Bool = r.last_photo == true
        if foto || !r.last_text.isEmpty {
            HStack(spacing: 4) {
                if foto { Image(systemName: "camera.fill").font(.caption) }
                Text(r.last_text).lineLimit(1)
            }
            .font(.subheadline).foregroundStyle(.secondary)
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
    // Nachricht, die gerade bearbeitet wird. Seit 30.09.2026 im EINGABEFELD wie die PWA (vorher
    // ein Alert mit Textfeld): nur dort lassen sich die Bilder der Nachricht zeigen, entfernen und
    // ergaenzen. Wirksam erst beim Speichern, Abbrechen laesst alles, wie es war.
    @State private var editMsg: ChatMsg?
    @State private var showDict = false
    // Bilder im Eingabefeld (senden vorerst nur Admins, wie die PWA): gleich beim Auswaehlen
    // hochgeladen, damit die Vorschau steht und das Senden sofort geht (s. ChatAnhang).
    @State private var anhaenge: [ChatAnhang] = []
    @State private var bildItems: [PhotosPickerItem] = []
    @State private var zeigeBildWahl = false
    @State private var galerie: ChatGalerie?
    @State private var isAdmin = false
    // Bilder anhaengen: Server-Schalter (`chat_photos`), NICHT isAdmin — Freigabe fuer alle ohne neuen Build.
    @State private var kannFotos = false
    @State private var push = false
    @State private var confirmLeave = false
    @State private var lastId = 0
    @State private var blocked = false
    @State private var confirmBlock = false
    // 1:1 mit dem Bot-Account (Server: /state.weiter_an): statt Eingabebereich ein Knopf in den 1:1
    // mit Jan. Jan, 01.10.2026: „dann ist jedem klar das hier kein ki-agent automatisch antwortet".
    @State private var weiterAn: DmOther?
    @State private var weiterDm: DmOpen?
    // LESEBESTAETIGUNG, nur im 1:1 (PWA 1d7ac4a0, Jan 01.10.2026: „wie in WhatsApp, aber nur im
    // 1:1"): bis zu welcher Nachricht das Gegenueber gelesen hat. nil = kein 1:1 / alter Server.
    @State private var gelesenBis: Int?
    // Den EIGENEN Lesestand nur setzen, wenn der Raum wirklich vor Augen ist: App aktiv, Ansicht
    // erschienen (nicht von einer weiteren ueberdeckt) und ihr Tab vorne. Sonst kaeme beim
    // Gegenueber ✓✓ von einem Chat, den niemand ansieht — der Raum pollt auch verdeckt weiter.
    @State private var sichtbar = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.tabSichtbar) private var tabSichtbar
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
            composerOderWeiter
        }
        .brandToolbar(title)
        .navigationDestination(isPresented: weiterBinding) { weiterDestination }
        .toolbar { roomToolbar }
        .confirmationDialog(Loc.t("chat.leaveConfirm", lang), isPresented: $confirmLeave, titleVisibility: .visible) {
            leaveDialogButtons
        }
        .confirmationDialog(Loc.t("dm.blockConfirm", lang), isPresented: $confirmBlock, titleVisibility: .visible) {
            blockDialogButtons
        }
        .task { await enterRoom() }
        .onAppear { sichtbar = true; lesestandSetzen() }
        .onDisappear { sichtbar = false }
        .onChange(of: scenePhase) { _ in lesestandSetzen() }
        .onChange(of: tabSichtbar) { _ in lesestandSetzen() }
        .fullScreenCover(isPresented: $showDict) { dictationCover }
        .fullScreenCover(item: $galerie) { g in ChatBildGalerie(photos: g.photos, start: g.start) { galerie = nil } }
        // Knopf + `.photosPicker(isPresented:)` statt der PhotosPicker-View: an dieser Ansicht
        // haengen mehrere Darstellungs-Modifier, darunter kommt die View-Variante nicht durch
        // (Memory swiftui-listenzeile-mehrere-knoepfe, Falle 2).
        .photosPicker(isPresented: $zeigeBildWahl, selection: $bildItems,
                      maxSelectionCount: bildPlatz, matching: .images)
        .onChange(of: bildItems) { neu in bilderGewaehlt(neu) }
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
            editHintRow
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

    // Hinweis „lange druecken zum Bearbeiten" entfaellt mit dem Eingabefeld (1:1 mit dem Bot).
    @ViewBuilder private var editHintRow: some View {
        if weiterAn == nil {
            Text(Loc.t("chat.editHint", lang))
                .font(.caption2).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 6)
        }
    }

    // Jan, 01.10.2026: „anstelle des input-feldes unten ein link 'Antworten bitte direkt an Jan'".
    // Schreibt eine aeltere App trotzdem hier hinein, leitet der Server die Nachricht an Jan um.
    @ViewBuilder private var composerOderWeiter: some View {
        if let w = weiterAn { weiterKnopf(w) } else { composer }
    }

    private func weiterKnopf(_ w: DmOther) -> some View {
        let text: String = Loc.t("chat.replyDirect", lang).replacingOccurrences(of: "{name}", with: w.name ?? "Jan")
        return Button { openWeiter(w) } label: {
            Text(text + " →").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .padding(8)
        .background(.bar)
    }

    // Derselbe Weg wie die Nutzersuche (`openDmWith`): /api/chat/dm liefert scope + other, damit
    // der Kopf des neuen Raums Name und Avatar zeigt.
    private func openWeiter(_ w: DmOther) {
        Task { if let d = try? await Api.chatDmOpen(userId: w.id) { weiterDm = d } }
    }

    // Binding vorab (wie ChatView.dmBinding), damit der Type-Checker den Modifier billig bekommt.
    private var weiterBinding: Binding<Bool> {
        Binding(get: { weiterDm != nil }, set: { if !$0 { weiterDm = nil } })
    }

    @ViewBuilder private var weiterDestination: some View {
        if let d = weiterDm { ChatRoomView(scope: d.scope, title: d.other.name ?? "", otherId: d.other.id) }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            editBar
            anhangLeiste
            composerRow
        }
        .padding(8)
        .background(.bar)
    }

    private var composerRow: some View {
        HStack(spacing: 8) {
            bildKnopf
            TextField(Loc.t("chat.placeholder", lang), text: $draft, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
            micKnopf
            sendButton
        }
    }

    // Beim Bearbeiten kein Diktat — wie die PWA (dort entfaellt das Mikro im Bearbeiten-Modus).
    @ViewBuilder private var micKnopf: some View {
        if editMsg == nil {
            Button { showDict = true } label: { Image(systemName: "mic.fill") }
        }
    }

    // Bilder anhaengen: vorerst nur Admins (Server antwortet sonst 403), wie die PWA.
    @ViewBuilder private var bildKnopf: some View {
        if kannFotos {
            Button { zeigeBildWahl = true } label: { Image(systemName: "camera") }
                .disabled(sending || anhaenge.count >= Self.maxBilder)
                .accessibilityLabel(Loc.t("chat.photoAdd", lang))
        }
    }

    // „Nachricht bearbeiten" + X ueber dem Eingabefeld, solange eine Nachricht bearbeitet wird.
    @ViewBuilder private var editBar: some View {
        if editMsg != nil {
            HStack {
                Text(Loc.t("chat.editing", lang)).font(.caption).foregroundStyle(Color.accentColor)
                Spacer()
                Button { cancelEdit() } label: { Image(systemName: "xmark").font(.caption) }
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(Loc.t("chat.editCancel", lang))
            }
        }
    }

    @ViewBuilder private var anhangLeiste: some View {
        if !anhaenge.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(anhaenge) { a in anhangKachel(a) }
                    }
                    .padding(.top, 6).padding(.trailing, 6)
                }
                if anhaenge.contains(where: { $0.fehler }) {
                    Text(Loc.t("chat.photoFailed", lang)).font(.caption).foregroundStyle(.red)
                }
            }
        }
    }

    // Vorschau eines Anhangs: laeuft der Upload noch, halb durchsichtig mit Kreisel; ging er
    // schief, roter Rand. Das X entfernt den Anhang (bei einer bearbeiteten Nachricht erst beim
    // Speichern wirksam).
    private func anhangKachel(_ a: ChatAnhang) -> some View {
        let rand: Color = a.fehler ? Color.red : Color.secondary.opacity(0.4)
        let laeuft: Bool = a.photoId == nil && !a.fehler
        return anhangBild(a)
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(rand, lineWidth: 1))
            .opacity(laeuft || a.fehler ? 0.5 : 1)
            .overlay { if laeuft { ProgressView() } }
            .overlay(alignment: .topTrailing) {
                Button { anhangWeg(a.key) } label: {
                    Image(systemName: "xmark.circle.fill").font(.body)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Color.white, Color.black.opacity(0.7))
                }
                .offset(x: 6, y: -6)
                .accessibilityLabel(Loc.t("chat.photoRemove", lang))
            }
    }

    // Neu gewaehlte Bilder zeigen ihr lokales Bild, schon versandte (Bearbeiten) ihr Vorschaubild.
    @ViewBuilder private func anhangBild(_ a: ChatAnhang) -> some View {
        if let ui = a.lokal {
            Image(uiImage: ui).resizable().scaledToFill()
        } else {
            NetzBild(url: a.vorschauURL) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFill()
                default: Color.secondary.opacity(0.15)
                }
            }
        }
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            Image(systemName: editMsg == nil ? "paperplane.fill" : "checkmark")
        }
        .disabled(sendDisabled)
        .accessibilityLabel(Loc.t(editMsg == nil ? "chat.send" : "common.save", lang))
    }

    // Ohne Text darf nur gesendet werden, wenn fertige Bilder dabei sind; waehrend ein Bild noch
    // hochlaedt gar nicht (sonst fehlte es in der Nachricht).
    private var sendDisabled: Bool {
        if sending || laedtNoch { return true }
        return draft.trimmingCharacters(in: .whitespaces).isEmpty && bereiteBilder.isEmpty
    }

    private static let maxBilder = 10   // Server MAX_CHAT_FOTOS
    private var laedtNoch: Bool { anhaenge.contains { $0.photoId == nil && !$0.fehler } }
    private var bereiteBilder: [Int] { anhaenge.compactMap { $0.photoId } }
    // Der Picker braucht mindestens 1, auch wenn der Knopf bei 10 Bildern ohnehin gesperrt ist.
    private var bildPlatz: Int { max(1, Self.maxBilder - anhaenge.count) }

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

    // MARK: - Bearbeiten und Bilder (30.09.2026, PWA 866779e6 + bd988744)

    private func startEdit(_ m: ChatMsg) {
        editMsg = m
        draft = m.text
        anhaenge = (m.photos ?? []).map { p in
            ChatAnhang(key: "p\(p.id)", lokal: nil, vorschauURL: Api.mediaURL(p.thumb_url ?? p.url),
                       photoId: p.id, fehler: false)
        }
    }

    private func cancelEdit() {
        editMsg = nil
        draft = ""
        anhaenge = []
    }

    // Die Bildliste geht nur mit, wenn die Nachricht Bilder hat oder hatte — reine
    // Textnachrichten laufen wie bisher (`photo_ids` fehlt, der Server laesst die Bilder in Ruhe).
    private func saveEdit() async {
        guard let m = editMsg, !sending, !laedtNoch else { return }
        let t: String = draft.trimmingCharacters(in: .whitespaces)
        let hatteBilder: Bool = !(m.photos ?? []).isEmpty
        let ids: [Int]? = (hatteBilder || !anhaenge.isEmpty) ? bereiteBilder : nil
        if t.isEmpty && (ids ?? []).isEmpty { return }
        sending = true; defer { sending = false }
        do {
            try await Api.chatEdit(m.id, text: t, photoIds: ids)
            editMsg = nil
            draft = ""
            anhaenge = []
            error = nil
            await load()
        } catch { self.error = error.localizedDescription }
    }

    /// Gewaehlte Bilder sofort als Anhang zeigen und einzeln hochladen; die id kommt nach, sobald
    /// der Upload durch ist. Ein Fehler bleibt am Anhang stehen (roter Rand + Hinweis) — nicht
    /// stumm verworfen, sonst fehlte das Bild ohne Erklaerung in der Nachricht.
    private func bilderGewaehlt(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        bildItems = []
        for item in items.prefix(bildPlatz) {
            let key: String = UUID().uuidString
            anhaenge.append(ChatAnhang(key: key, lokal: nil, vorschauURL: nil, photoId: nil, fehler: false))
            Task { await bildHochladen(item, key: key) }
        }
    }

    private func bildHochladen(_ item: PhotosPickerItem, key: String) async {
        guard let raw = try? await item.loadTransferable(type: Data.self) else {
            anhangAendern(key) { $0.fehler = true }
            return
        }
        let bild: UIImage? = UIImage(data: raw)
        anhangAendern(key) { $0.lokal = bild }
        do {
            let p = try await Api.uploadChatPhoto(data: chatJPEG(raw, bild))
            anhangAendern(key) { $0.photoId = p.id }
        } catch {
            anhangAendern(key) { $0.fehler = true }
        }
    }

    /// Immer JPEG hochladen: `downscaleJPEG` gibt bei „kein Gewinn" das Original zurueck, und das
    /// ist aus der Fotomediathek oft HEIC — das kann der Server (Pillow ohne HEIF) nicht lesen.
    private func chatJPEG(_ raw: Data, _ bild: UIImage?) -> Data {
        let klein: Data = downscaleJPEG(raw, maxEdge: 1600)
        if klein.starts(with: [0xFF, 0xD8]) { return klein }
        return bild?.jpegData(compressionQuality: 0.85) ?? klein
    }

    // Anhang ueber seinen Schluessel aendern — die Liste kann sich waehrend des Uploads aendern
    // (entfernt, weitere dazu), ein gemerkter Index waere dann falsch.
    private func anhangAendern(_ key: String, _ f: (inout ChatAnhang) -> Void) {
        guard let i = anhaenge.firstIndex(where: { $0.key == key }) else { return }
        f(&anhaenge[i])
    }

    private func anhangWeg(_ key: String) {
        anhaenge.removeAll { $0.key == key }
    }

    private func enterRoom() async {
        if let p = try? await Api.getProfile() {
            isAdmin = p.is_admin ?? false
            kannFotos = p.chat_photos ?? isAdmin
        }
        if let st = try? await Api.chatRoomState(scope: scope) {
            push = st.push; weiterAn = st.weiter_an; gelesenBis = st.gelesen_bis
        } else { push = false }
        if isDm && otherId > 0 { blocked = ((try? await Api.chatBlocks()) ?? []).contains { $0.id == otherId } }
        await load()
        await pollNew()
    }

    // Live-Polling neuer Nachrichten (~10 s), wie die Web-PWA.
    private func pollNew() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            if Task.isCancelled { break }
            // Im 1:1 den Lesestand des Gegenuebers mitholen (✓ -> ✓✓), wie die PWA.
            if isDm, let st = try? await Api.chatRoomState(scope: scope) { gelesenBis = st.gelesen_bis }
            if let since = try? await Api.chatSince(scope: scope, after: lastId), !since.isEmpty {
                let known = Set(msgs.map { $0.id })
                let add = since.filter { !known.contains($0.id) }
                if !add.isEmpty {
                    msgs.append(contentsOf: add)
                    lastId = msgs.map { $0.id }.max() ?? lastId
                    lesestandSetzen()
                }
            }
        }
    }

    /// Eigenen Lesestand setzen (Unread auf der Startseite, im 1:1 die ✓✓ beim Gegenueber) — nur
    /// wenn der Raum wirklich angesehen wird. Wird er spaeter sichtbar (App wieder aktiv, Tab vorne,
    /// zurueck aus einer anderen Ansicht), holt der Aufruf aus dem jeweiligen Wechsel es nach.
    private func lesestandSetzen() {
        guard lastId > 0, sichtbar, tabSichtbar, scenePhase == .active else { return }
        let bis: Int = lastId
        Task { try? await Api.chatMarkRead(scope: scope, upTo: bis) }
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
                bubbleText(m)
                bubblePhotos(m)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(bubbleOpacity(m))
        .contextMenu { bubbleMenu(m) }
    }

    // Eine Nachricht darf NUR aus Bildern bestehen — dann kein leerer Textblock.
    @ViewBuilder private func bubbleText(_ m: ChatMsg) -> some View {
        if !m.text.isEmpty {
            Text(linkified(m.text)).fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private func bubblePhotos(_ m: ChatMsg) -> some View {
        let fotos: [ChatPhoto] = m.photos ?? []
        if !fotos.isEmpty {
            ChatFotoStapel(photos: fotos, lang: lang) { i in galerie = ChatGalerie(photos: fotos, start: i) }
                .padding(.top, 4)
        }
    }

    @ViewBuilder private func bubbleHeader(_ m: ChatMsg) -> some View {
        HStack(spacing: 6) {
            Text(m.name ?? "—").font(.subheadline).fontWeight(.semibold)
            if let ts = hhmmChat(m.created_at) {
                Text(ts).font(.caption2).foregroundStyle(.secondary)
            }
            lesehaken(m)
        }
    }

    // ✓ grau = gesendet, ✓✓ in Markenfarbe = gelesen — nur an EIGENEN Nachrichten im 1:1.
    // Zwei ueberlagerte, leicht versetzte Haken: ein Doppelhaken-Symbol gibt es in SF Symbols nicht.
    @ViewBuilder private func lesehaken(_ m: ChatMsg) -> some View {
        if isDm && m.mine, let g = gelesenBis {
            if m.id <= g {
                ZStack(alignment: .leading) {
                    Image(systemName: "checkmark")
                    Image(systemName: "checkmark").offset(x: 5)
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .padding(.trailing, 5)
                .accessibilityElement()
                .accessibilityLabel(Loc.t("chat.read", lang))
            } else {
                Image(systemName: "checkmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(Loc.t("chat.sent", lang))
            }
        }
    }

    @ViewBuilder private func bubbleMenu(_ m: ChatMsg) -> some View {
        if editable(m) {
            Button(Loc.t("chat.edit", lang)) { startEdit(m) }
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
                       like_count: count, liked: liked, photos: x.photos)
    }

    // Online-Punkt + Tipp auf die Foiler-Seite des Verfassers (OnlinePunkt.swift).
    private func chatAvatar(_ m: ChatMsg) -> some View {
        chatAvatarBild(m).profilbild(userId: m.user_id, size: 32)
    }

    @ViewBuilder private func chatAvatarBild(_ m: ChatMsg) -> some View {
        if let url = Api.mediaURL(m.avatar_url) {
            NetzBild(url: url) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFill()
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
            lesestandSetzen()
        } catch { self.error = error.localizedDescription }
    }

    private func send() async {
        if editMsg != nil { await saveEdit(); return }
        let text = draft.trimmingCharacters(in: .whitespaces)
        let ids: [Int] = bereiteBilder
        guard !text.isEmpty || !ids.isEmpty, !laedtNoch, !sending else { return }
        sending = true; defer { sending = false }
        do {
            let m = try await Api.chatPost(scope: scope, text: text, photoIds: ids)
            msgs.append(m)
            lastId = max(lastId, m.id)
            draft = ""
            anhaenge = []
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Bilder im Chat (30.09.2026, PWA FotoStapel.tsx)

/// Ein Bild im Eingabefeld. `photoId` (Server) fehlt, solange der Upload laeuft; `lokal` ist das gewaehlte Bild
/// (neu), `vorschauURL` das Vorschaubild eines schon versandten Bildes (beim Bearbeiten).
struct ChatAnhang: Identifiable {
    let key: String
    var lokal: UIImage?
    var vorschauURL: URL?
    var photoId: Int?
    var fehler: Bool
    var id: String { key }
}

/// Welche Bilder die Vollbild-Galerie zeigt und mit welchem sie beginnt (`fullScreenCover(item:)`).
struct ChatGalerie: Identifiable {
    let id = UUID()
    let photos: [ChatPhoto]
    let start: Int
}

/// Bilder an einer Chat-Nachricht (Jan, 30.09.2026: „wenn mehr Bilder als eins in einer Nachricht,
/// dann gestapelt"). EIN Bild: normal gross. MEHRERE: ein Stapel — das erste obenauf, bis zu zwei
/// weitere leicht versetzt und gedreht dahinter, dazu die Anzahl. Ein Tipp oeffnet die Galerie.
struct ChatFotoStapel: View {
    let photos: [ChatPhoto]
    let lang: String
    let oeffnen: (Int) -> Void

    var body: some View {
        Button { oeffnen(0) } label: { inhalt }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
    }

    @ViewBuilder private var inhalt: some View {
        if photos.count == 1 {
            einzeln
        } else {
            stapel
        }
    }

    private var label: String {
        if photos.count == 1 { return Loc.t("chat.photoOpen", lang) }
        return Loc.t("chat.photosOpen", lang).replacingOccurrences(of: "{n}", with: "\(photos.count)")
    }

    private var rest: String { "+\(photos.count - 1)" }

    private func kleinURL(_ p: ChatPhoto) -> URL? { Api.mediaURL(p.thumb_url ?? p.url) }

    // Ein Bild in seinem Seitenverhaeltnis, hoechstens 240 × 240 (PWA: max 16rem × 16rem).
    private var einzeln: some View {
        NetzBild(url: kleinURL(photos[0])) { stand in
            switch stand {
            case .da(let img): img.resizable().scaledToFit()
            default: Color.secondary.opacity(0.15).frame(width: 200, height: 150)
            }
        }
        .frame(maxWidth: 240, maxHeight: 240, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var stapel: some View {
        let hinten: [ChatPhoto] = Array(photos.dropFirst().prefix(2))
        return ZStack(alignment: .bottomTrailing) {
            ForEach(Array(hinten.enumerated().reversed()), id: \.element.id) { i, p in
                stapelBlatt(p, versatz: i == 0 ? 8 : 16, grad: i == 0 ? 3 : 6)
                    .opacity(i == 0 ? 0.9 : 0.75)
            }
            stapelBlatt(photos[0], versatz: 0, grad: 0)
            Text(rest).font(.caption.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(Color.black.opacity(0.75), in: Capsule())
                .padding(6)
        }
        .frame(width: 200, height: 150)
        .padding(.top, 12).padding(.trailing, 16)
    }

    private func stapelBlatt(_ p: ChatPhoto, versatz: CGFloat, grad: Double) -> some View {
        NetzBild(url: kleinURL(p)) { stand in
            switch stand {
            case .da(let img): img.resizable().scaledToFill()
            default: Color.secondary.opacity(0.2)
            }
        }
        .frame(width: 200, height: 150)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.4), lineWidth: 1))
        .rotationEffect(.degrees(grad))
        .offset(x: versatz, y: -versatz * 0.75)
    }
}

/// Vollbild-Galerie der Bilder einer Nachricht: wischen blaettert, X oder Tipp schliesst —
/// dieselbe Bedienung wie die Foto-Ansicht der Session (SessionDetailView.PhotoLightboxView).
struct ChatBildGalerie: View {
    let photos: [ChatPhoto]
    let start: Int
    let schliessen: () -> Void
    @State private var sel = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            TabView(selection: $sel) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { i, p in
                    vollbild(p).tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .automatic : .never))
        }
        .overlay(alignment: .topTrailing) {
            Button { schliessen() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(12)
                    .shadow(radius: 4)
            }
        }
        .onTapGesture { schliessen() }
        .onAppear { sel = start }
    }

    private func vollbild(_ p: ChatPhoto) -> some View {
        NetzBild(url: Api.mediaURL(p.url)) { stand in
            switch stand {
            case .da(let img): img.resizable().scaledToFit()
            default: ProgressView()
            }
        }
    }
}
