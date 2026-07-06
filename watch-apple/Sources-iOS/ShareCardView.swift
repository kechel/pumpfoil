import SwiftUI
import UIKit
import PhotosUI

// Konfig-Sheet vor dem Teilen einer Session-Card. Spiegelt web/components/ShareDialog.tsx:
// Track-Farbmodus, Titel, Stats-Auswahl, Hell/Dunkel-Blau. Card kommt server-generiert (PNG);
// color/stats/track/shade werden als Profil-Default (settings.share) gespeichert.
// (Foto-Hintergrund mit Pinch/Pan folgt separat — hier zunaechst bg=navy.)
struct ShareCardView: View {
    let session: SessionDetail
    let lang: String
    @Environment(\.dismiss) private var dismiss

    private static let statOrder = ["foiling", "runs", "pumps", "speed", "time", "longest", "distance", "pumprate"]

    @State private var color = "cyan"
    @State private var sel: Set<String> = []
    @State private var track = true
    @State private var shade = "light"
    @State private var title = ""
    @State private var dim = 0.55
    @State private var loaded = false

    // Foto-Hintergrund (optional, wie die PWA): darunter komponiert, Card kommt dann transparent.
    @State private var photo: UIImage?
    @State private var photoItem: PhotosPickerItem?
    @State private var photoVersion = 0          // bump -> Card neu holen (bg transparent/navy)
    @State private var scale: CGFloat = 1         // relativ zur Cover-Fit-Basis
    @State private var baseScale: CGFloat = 1
    @State private var offset: CGSize = .zero     // in 1080-Einheiten
    @State private var baseOffset: CGSize = .zero
    @State private var previewSide: CGFloat = 1

    @State private var cardImage: UIImage?        // server-Card (navy o. transparent)
    @State private var composited: UIImage?       // was angezeigt/geteilt wird
    @State private var loading = true
    @State private var shareURL: ShareItem?

    private var avail: [String] {
        guard let a = session.analysis else { return [] }
        // Exakt wie die PWA: „runs"/„longest" liegen NICHT im Analysis-Objekt (num_runs/
        // best_distance_m sind serverseitig separate Spalten) -> dort nie wählbar (6 statt 8).
        let ok: [String: Bool] = [
            "foiling": (a.foiling_distance_m ?? 0) > 0,
            "runs": false,
            "pumps": (a.pump_count ?? 0) > 0,
            "speed": (a.max_speed_mps ?? 0) > 0,
            "time": (a.foiling_time_s ?? 0) > 0,
            "longest": false,
            "distance": (a.total_distance_m ?? 0) > 0,
            "pumprate": (a.foiling_time_s ?? 0) > 0 && (a.pump_count ?? 0) > 0,
        ]
        return Self.statOrder.filter { ok[$0] == true }
    }
    private var hasHr: Bool {
        guard let m = session.analysis?.metrics else { return false }
        return m.avg_hr != nil || m.max_hr != nil
    }
    private var configKey: String { "\(color)|\(sel.sorted().joined(separator: ","))|\(track)|\(shade)|\(title)|\(photoVersion > 0 && photo != nil)|\(loaded)" }
    private var saveKey: String { "\(color)|\(sel.sorted().joined(separator: ","))|\(track)|\(shade)|\(dim)|\(loaded)" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Vorschau (quadratisch); mit Foto: ziehen zum Verschieben, kneifen zum Zoomen.
                    ZStack {
                        RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground))
                        if let composited {
                            Image(uiImage: composited).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        if loading { ProgressView() }
                    }
                    .aspectRatio(1, contentMode: .fit)
                    .contentShape(Rectangle())
                    .background(GeometryReader { g in
                        Color.clear
                            .onAppear { previewSide = g.size.width }
                            .onChange(of: g.size) { s in previewSide = s.width }
                    })
                    .gesture(
                        SimultaneousGesture(
                            DragGesture()
                                .onChanged { v in
                                    let k = 1080 / max(previewSide, 1)
                                    offset = CGSize(width: baseOffset.width + v.translation.width * k,
                                                    height: baseOffset.height + v.translation.height * k)
                                    updatePreview()
                                }
                                .onEnded { _ in baseOffset = offset },
                            MagnificationGesture()
                                .onChanged { m in scale = max(0.5, baseScale * m); updatePreview() }
                                .onEnded { _ in baseScale = scale }
                        ),
                        including: photo == nil ? .subviews : .all
                    )
                    if photo != nil {
                        Text(Loc.t("share.photoHint", lang)).font(.caption2).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }

                    TextField(Loc.t("share.cardTitlePlaceholder", lang), text: $title)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: title) { newVal in if newVal.count > 40 { title = String(newVal.prefix(40)) } }

                    Toggle(Loc.t("share.showTrack", lang), isOn: $track)

                    if track {
                        Text(Loc.t("share.trackColor", lang)).font(.caption).foregroundStyle(.secondary)
                        Picker("", selection: $color) {
                            Text(Loc.t("share.color.cyan", lang)).tag("cyan")
                            Text(Loc.t("share.color.speed", lang)).tag("speed")
                            if hasHr { Text(Loc.t("share.color.hr", lang)).tag("hr") }
                        }.pickerStyle(.segmented)
                    }

                    // Hintergrund-Foto (optional).
                    Text(Loc.t("share.background", lang)).font(.caption).foregroundStyle(.secondary)
                    HStack {
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Label(photo == nil ? Loc.t("share.addPhoto", lang) : Loc.t("share.changePhoto", lang), systemImage: "photo")
                        }.buttonStyle(.bordered)
                        if photo != nil {
                            Button(Loc.t("share.noPhoto", lang), role: .destructive) {
                                photo = nil; photoVersion += 1; updatePreview()
                            }.buttonStyle(.bordered)
                        }
                    }
                    if photo != nil {
                        HStack {
                            Text(Loc.t("share.darken", lang)).font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Text("\(Int(dim * 100))%").font(.caption).monospacedDigit()
                        }
                        Slider(value: $dim, in: 0...0.85) { _ in } .onChange(of: dim) { _ in updatePreview() }
                    }

                    Text(Loc.t("share.textColor", lang)).font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: $shade) {
                        Text(Loc.t("share.shade.light", lang)).tag("light")
                        Text(Loc.t("share.shade.dark", lang)).tag("dark")
                    }.pickerStyle(.segmented)

                    if !avail.isEmpty {
                        Text(Loc.t("share.stats", lang)).font(.caption).foregroundStyle(.secondary)
                        FlowChips(items: avail, selected: sel) { k in
                            if sel.contains(k) { sel.remove(k) } else { sel.insert(k) }
                        } label: { Loc.t("share.stat.\($0)", lang) }
                    }

                    Button {
                        writeAndShare()
                    } label: {
                        Label(Loc.t("sd.share", lang), systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(composited == nil)
                }
                .padding()
            }
            .navigationTitle(Loc.t("sd.share", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { dismiss() } } }
        }
        .task { await loadDefaults() }
        .task(id: configKey) { await refresh() }
        .task(id: saveKey) { await saveDefault() }
        .onChange(of: photoItem) { item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    photo = img; scale = 1; baseScale = 1; offset = .zero; baseOffset = .zero
                    photoVersion += 1; updatePreview()
                }
            }
        }
        .sheet(item: $shareURL) { item in ActivityView(items: [item.url]) }
    }

    private func loadDefaults() async {
        sel = Set(avail)
        if let all = try? await Api.settings(), let sh = all["share"] as? [String: Any] {
            if let c = sh["color"] as? String, c == "cyan" || c == "speed" || (c == "hr" && hasHr) { color = c }
            if let st = sh["stats"] as? [String] {
                let keep = st.filter { avail.contains($0) }
                if !keep.isEmpty { sel = Set(keep) }
            }
            if let tr = sh["track"] as? Bool { track = tr }
            if let s = sh["shade"] as? String, s == "light" || s == "dark" { shade = s }
            if let d = sh["dim"] as? Double { dim = d }
        }
        loaded = true
    }

    private func refresh() async {
        guard loaded else { return }
        loading = true
        try? await Task.sleep(nanoseconds: 220_000_000)
        if Task.isCancelled { return }
        let chosen = Self.statOrder.filter { sel.contains($0) }
        let bg = photo != nil ? "transparent" : "navy"
        if let data = try? await Api.shareCard(session.id, color: color, stats: chosen, track: track, title: title, shade: shade, bg: bg) {
            cardImage = UIImage(data: data)
            updatePreview()
        }
        loading = false
    }

    private func saveDefault() async {
        guard loaded else { return }
        try? await Task.sleep(nanoseconds: 500_000_000)
        if Task.isCancelled { return }
        let chosen = Self.statOrder.filter { sel.contains($0) }
        try? await Api.saveSettings(["share": ["color": color, "stats": chosen, "track": track, "shade": shade, "dim": dim]])
    }

    // Foto (Cover-Fit + Zoom/Pan) + Scrim (dim) + server-Card zusammensetzen — wie das Canvas
    // der PWA. Ohne Foto = nur die Card auf 1080er-Fläche.
    private func compose() -> UIImage? {
        guard let card = cardImage else { return nil }
        let n: CGFloat = 1080
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: n, height: n))
        return renderer.image { ctx in
            if let p = photo {
                let base = max(n / p.size.width, n / p.size.height)   // Cover-Fit
                let w = p.size.width * base * scale
                let h = p.size.height * base * scale
                let x = (n - w) / 2 + offset.width
                let y = (n - h) / 2 + offset.height
                p.draw(in: CGRect(x: x, y: y, width: w, height: h))
                // Scrim MUSS mit .normal blenden — ctx.fill nutzt sonst .copy und LÖSCHT das Foto.
                UIColor(red: 2.0/255.0, green: 6.0/255.0, blue: 23.0/255.0, alpha: CGFloat(dim)).setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: n, height: n), blendMode: .normal)
            }
            card.draw(in: CGRect(x: 0, y: 0, width: n, height: n))
        }
    }

    private func updatePreview() { composited = compose() }

    private func writeAndShare() {
        guard let img = compose(), let data = img.pngData() else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("pumpfoil-\(session.id).png")
        do { try data.write(to: url); shareURL = ShareItem(url: url) } catch {}
    }
}

private struct ShareItem: Identifiable { let id = UUID(); let url: URL }

// Einfache Chip-Reihe (umbrechend) fuer die Stats-Auswahl.
private struct FlowChips: View {
    let items: [String]
    let selected: Set<String>
    let onToggle: (String) -> Void
    let label: (String) -> String

    var body: some View {
        // ViewThatFits-freie, simple umbrechende Anordnung via Wrap.
        Wrap(items, spacing: 8) { k in
            Button { onToggle(k) } label: {
                Text(label(k))
                    .font(.subheadline)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(selected.contains(k) ? Color.accentColor.opacity(0.25) : Color(.tertiarySystemFill))
                    .foregroundStyle(selected.contains(k) ? Color.accentColor : Color.primary)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

// Minimaler Wrap-Container (HStack mit Umbruch) fuer wenige Chips.
private struct Wrap<Data: RandomAccessCollection, Content: View>: View where Data.Element: Hashable {
    let data: Data
    let spacing: CGFloat
    let content: (Data.Element) -> Content
    init(_ data: Data, spacing: CGFloat, @ViewBuilder content: @escaping (Data.Element) -> Content) {
        self.data = data; self.spacing = spacing; self.content = content
    }
    var body: some View {
        // Grobe Aufteilung in Reihen zu je 3 — reicht fuer bis zu 8 Stats.
        let perRow = 3
        let elems = Array(data)
        let rows = stride(from: 0, to: elems.count, by: perRow).map { start in
            Array(elems[start..<min(start + perRow, elems.count)])
        }
        return VStack(alignment: .leading, spacing: spacing) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: spacing) { ForEach(row, id: \.self) { content($0) } }
            }
        }
    }
}

// UIActivityViewController-Bruecke fuers System-Share-Sheet.
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
