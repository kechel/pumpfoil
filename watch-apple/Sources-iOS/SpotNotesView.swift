import PhotosUI
import SwiftUI

// Spot-Beschreibungen (Paritaet zur PWA): je Nutzer EIN Textblock + Fotos pro Spot, alle
// untereinander, mit Herzchen bewertbar. Sitzt wie im Web zwischen Spot-Wetter und Session-Liste.
//
// Schreiben darf nur, wer eine eigene Session an dem Spot hat — das entscheidet der Server
// (`can_write`); ohne das erscheint kein Bearbeiten-Knopf. Fremde Beitraege sind unantastbar,
// jeder pflegt nur seinen eigenen Abschnitt.
struct SpotNotesView: View {
    let spotId: Int
    let lang: String

    @State private var data: SpotNotesOut?
    @State private var editing = false
    @State private var draft = ""
    @State private var busy = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var gross: Bild?

    var body: some View {
        // Group statt zweier Zweige: die Ansicht existiert IMMER, damit `.task` laeuft und laedt —
        // haette der leere Zweig ein EmptyView, wuerde der Task je nach SwiftUI-Version nicht
        // ausgefuehrt. Ohne Inhalt gibt Group nichts aus, also auch keine leere Listenzeile.
        Group {
            if let d = data, d.can_write || !d.notes.isEmpty {
                Section {
                    Text(Loc.t("spotnote.disclaimer", lang))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if d.can_write { ownBlock(d) }
                    ForEach(d.notes.filter { !$0.mine }) { n in noteBlock(n, own: false) }
                    if d.notes.filter({ !$0.mine }).isEmpty && !d.can_write {
                        Text(Loc.t("spotnote.none", lang)).font(.caption).foregroundStyle(.secondary)
                    }
                } header: {
                    Text(Loc.t("spotnote.title", lang))
                }
            }
        }
        .task(id: spotId) { await load() }
        .onChange(of: pickerItem) { item in upload(item) }
        .sheet(isPresented: $editing) { editSheet() }
        .sheet(item: $gross) { b in FullBild(url: b.url) }
    }

    // Ein Bild als identifizierbares Element — `sheet(item:)` braucht Identifiable.
    private struct Bild: Identifiable { let url: String; var id: String { url } }

    private struct FullBild: View {
        let url: String
        var body: some View {
            AsyncImage(url: Api.mediaURL(url)) { img in
                img.resizable().scaledToFit()
            } placeholder: {
                ProgressView()
            }
        }
    }

    @ViewBuilder private func ownBlock(_ d: SpotNotesOut) -> some View {
        let meine = d.notes.first(where: { $0.mine })
        VStack(alignment: .leading, spacing: 6) {
            if let m = meine {
                noteBlock(m, own: true)
            } else {
                Text(Loc.t("spotnote.invite", lang)).font(.footnote)
            }
            HStack(spacing: 12) {
                Button {
                    draft = meine?.text ?? ""
                    editing = true
                } label: {
                    Label(meine == nil ? Loc.t("spotnote.write", lang) : Loc.t("spotnote.edit", lang),
                          systemImage: "square.and.pencil")
                }
                .disabled(busy)
                if (meine?.photos.count ?? 0) < d.max_photos {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label(Loc.t("spotnote.addPhoto", lang), systemImage: "photo.badge.plus")
                    }
                    .disabled(busy)
                }
            }
            .font(.footnote)
        }
    }

    @ViewBuilder private func noteBlock(_ n: SpotNote, own: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                AvatarView(name: n.name, url: Api.mediaURL(n.avatar_url), size: 28)
                VStack(alignment: .leading, spacing: 0) {
                    Text(n.name ?? "—").font(.subheadline.weight(.semibold))
                    if let u = n.updated_at {
                        Text("\(Loc.t("spotnote.updated", lang)) \(String(u.prefix(10)))")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button {
                    Task { _ = try? await Api.likeSpotNote(n.id); await load() }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: n.liked ? "heart.fill" : "heart")
                            .foregroundStyle(n.liked ? .red : .secondary)
                        if n.like_count > 0 { Text("\(n.like_count)").font(.caption) }
                    }
                }
                .buttonStyle(.plain)
                if !own {
                    Button {
                        Task { try? await Api.reportSpotNote(n.id); await load() }
                    } label: {
                        Image(systemName: "flag")
                            .foregroundStyle(n.my_report ? .red : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            if !n.text.isEmpty {
                Text(n.text).font(.body)
            }
            if !n.photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(n.photos) { p in
                            ZStack(alignment: .topTrailing) {
                                AsyncImage(url: Api.mediaURL(p.thumb_url ?? p.url)) { img in
                                    img.resizable().scaledToFill()
                                } placeholder: {
                                    Color.gray.opacity(0.2)
                                }
                                .frame(width: 88, height: 88)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .onTapGesture { gross = Bild(url: p.url) }
                                if own {
                                    Button {
                                        Task {
                                            busy = true
                                            try? await Api.deleteSpotNotePhoto(spotId, photoId: p.id)
                                            await load()
                                            busy = false
                                        }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                                    }
                                    .buttonStyle(.plain)
                                    .padding(2)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }

    // Bearbeiten als Sheet: der Abschnitt sitzt in einer scrollenden Liste, ein Textfeld darin
    // verschwindet beim Tippen unter der Tastatur.
    @ViewBuilder private func editSheet() -> some View {
        // `data` ist optional; hier zaehlen nur zwei Werte daraus, also gleich entpacken
        // (ein `if let` um ein ganzes Form herum macht den Ausdruck fuer den Type-Checker teuer —
        // genau das hat frueher schon einmal den Xcode-Build haengen lassen).
        let maxText = data?.max_text ?? 2000
        let hatEigene = data?.notes.contains(where: { $0.mine }) ?? false
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $draft)
                        .frame(minHeight: 160)
                        .onChange(of: draft) { v in
                            if v.count > maxText { draft = String(v.prefix(maxText)) }
                        }
                    Text("\(draft.count)/\(maxText)").font(.caption2).foregroundStyle(.secondary)
                } header: {
                    Text(Loc.t("spotnote.placeholder", lang))
                }
                if hatEigene {
                    Section {
                        Button(role: .destructive) {
                            Task {
                                busy = true
                                try? await Api.deleteSpotNote(spotId)
                                editing = false
                                await load()
                                busy = false
                            }
                        } label: {
                            Text(Loc.t("common.delete", lang))
                        }
                    }
                }
            }
            .navigationTitle(Loc.t("spotnote.write", lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(Loc.t("common.cancel", lang)) { editing = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(Loc.t("common.save", lang)) {
                        Task {
                            busy = true
                            try? await Api.saveSpotNote(spotId, text: draft)
                            editing = false
                            await load()
                            busy = false
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        data = try? await Api.spotNotes(spotId)
    }

    private func upload(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            busy = true
            if let raw = try? await item.loadTransferable(type: Data.self) {
                try? await Api.uploadSpotNotePhoto(spotId, data: downscaleJPEG(raw))
                await load()
            }
            pickerItem = nil
            busy = false
        }
    }
}
