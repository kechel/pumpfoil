import SwiftUI
import UIKit

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
    @State private var loaded = false

    @State private var preview: UIImage?
    @State private var pngData: Data?
    @State private var loading = true
    @State private var shareURL: ShareItem?

    private var avail: [String] {
        guard let a = session.analysis else { return [] }
        let m = a.metrics
        let runs = a.segments?.count ?? m?.num_segments ?? 0
        let ok: [String: Bool] = [
            "foiling": (a.foiling_distance_m ?? 0) > 0,
            "runs": runs > 0,
            "pumps": (a.pump_count ?? 0) > 0,
            "speed": (a.max_speed_mps ?? 0) > 0,
            "time": (a.foiling_time_s ?? 0) > 0,
            "longest": (m?.farthest_segment_m ?? 0) > 0,
            "distance": (a.total_distance_m ?? 0) > 0,
            "pumprate": (a.foiling_time_s ?? 0) > 0 && (a.pump_count ?? 0) > 0,
        ]
        return Self.statOrder.filter { ok[$0] == true }
    }
    private var hasHr: Bool {
        guard let m = session.analysis?.metrics else { return false }
        return m.avg_hr != nil || m.max_hr != nil
    }
    private var configKey: String { "\(color)|\(sel.sorted().joined(separator: ","))|\(track)|\(shade)|\(title)|\(loaded)" }
    private var saveKey: String { "\(color)|\(sel.sorted().joined(separator: ","))|\(track)|\(shade)|\(loaded)" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Vorschau (quadratisch)
                    ZStack {
                        RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground))
                        if let preview {
                            Image(uiImage: preview).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        if loading { ProgressView() }
                    }
                    .aspectRatio(1, contentMode: .fit)

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
                    .disabled(pngData == nil)
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
        }
        loaded = true
    }

    private func refresh() async {
        guard loaded else { return }
        loading = true
        try? await Task.sleep(nanoseconds: 220_000_000)
        if Task.isCancelled { return }
        let chosen = Self.statOrder.filter { sel.contains($0) }
        if let data = try? await Api.shareCard(session.id, color: color, stats: chosen, track: track, title: title, shade: shade) {
            pngData = data
            preview = UIImage(data: data)
        }
        loading = false
    }

    private func saveDefault() async {
        guard loaded else { return }
        try? await Task.sleep(nanoseconds: 500_000_000)
        if Task.isCancelled { return }
        let chosen = Self.statOrder.filter { sel.contains($0) }
        try? await Api.saveSettings(["share": ["color": color, "stats": chosen, "track": track, "shade": shade]])
    }

    private func writeAndShare() {
        guard let data = pngData else { return }
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
