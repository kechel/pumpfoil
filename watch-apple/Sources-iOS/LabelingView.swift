import SwiftUI

// Bereiche labeln (Pump/Gleiten/Kein Foiling) als Trainingsdaten fürs Modell.
struct LabelingView: View {
    let id: Int
    @AppStorage("appLang") private var lang = "de"
    private var types: [(String, String)] {
        [("pump", Loc.t("lab.pump", lang)), ("glide", Loc.t("lab.glide", lang)), ("not_foiling", Loc.t("lab.notFoiling", lang))]
    }

    @State private var labels: [SessionLabel] = []
    @State private var durSec = 0.0
    @State private var loading = true
    @State private var type = "pump"
    @State private var start = 0.0
    @State private var end = 0.0

    // Ein Abschnitt = eine eigene Teil-View, Zeitangaben vorformatiert: der Body war EIN Ausdruck
    // mit vierteiliger Interpolation, Picker, zwei Slidern und zwei Task-Closures — teuer für den
    // Type-Checker. Reihenfolge, Layout und Texte sind unverändert.
    var body: some View {
        Form {
            existingSection
            addSection
        }
        .navigationTitle(Loc.t("lab.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if loading { ProgressView() } }
        .task { await initialLoad() }
    }

    @ViewBuilder private var existingSection: some View {
        if !labels.isEmpty {
            Section(Loc.t("lab.existing", lang)) {
                ForEach(labels) { l in labelRow(l) }
            }
        }
    }

    private func labelRow(_ l: SessionLabel) -> some View {
        HStack {
            Text(rangeText(l))
            Spacer()
            Button(role: .destructive) { delete(l) } label: { Image(systemName: "trash") }
                .buttonStyle(.borderless)
        }
    }

    // Der Picker bleibt als Ganzes eine Teil-View — .tag() muss direktes Kind bleiben.
    private var addSection: some View {
        Section(Loc.t("lab.add", lang)) {
            Picker(Loc.t("lab.type", lang), selection: $type) {
                ForEach(types, id: \.0) { id2, label in Text(label).tag(id2) }
            }
            .pickerStyle(.segmented)
            rangeSliders
            Button(Loc.t("lab.add", lang)) { add() }
                .disabled(end <= start)
        }
    }

    private var rangeSliders: some View {
        VStack(alignment: .leading) {
            Text(startText).font(.caption)
            Slider(value: $start, in: 0...sliderMax)
            Text(endText).font(.caption)
            Slider(value: $end, in: 0...sliderMax)
        }
    }

    // Explizit typisierte Strings/Zahlen statt Interpolation bzw. max() direkt im ViewBuilder.
    private var sliderMax: Double { max(durSec, 1) }
    private var startText: String { "\(Loc.t("common.start", lang)): \(mmss(start))" }
    private var endText: String { "\(Loc.t("common.end", lang)): \(mmss(end))" }
    private func rangeText(_ l: SessionLabel) -> String {
        let a: Double = Double(l.t_start_ms) / 1000
        let b: Double = Double(l.t_end_ms) / 1000
        return "\(typeText(l.label))  \(mmss(a))–\(mmss(b))"
    }

    // Ablauflogik aus den Closures heraus (eigene Methoden, typisierte Parameter).
    private func delete(_ l: SessionLabel) {
        Task { try? await Api.deleteLabel(id, labelId: l.id); await reload() }
    }

    private func add() {
        let a: Double = min(start, end), b: Double = max(start, end)
        Task { try? await Api.addLabel(id, startMs: Int(a * 1000), endMs: Int(b * 1000), label: type); await reload() }
    }

    private func initialLoad() async {
        if let s = try? await Api.session(id), let a = s.startedDate, let b = s.endedDate, b > a {
            durSec = b.timeIntervalSince(a); end = durSec
        }
        await reload()
        loading = false
    }

    private func reload() async { labels = (try? await Api.labels(id)) ?? [] }
    private func typeText(_ id: String) -> String { types.first { $0.0 == id }?.1 ?? id }
    private func mmss(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}
