import SwiftUI

// Bereiche labeln (Pump/Gleiten/Kein Foiling) als Trainingsdaten fürs Modell.
struct LabelingView: View {
    let id: Int
    private let types: [(String, String)] = [("pump", "Pump"), ("glide", "Gleiten"), ("not_foiling", "Kein Foiling")]

    @State private var labels: [SessionLabel] = []
    @State private var durSec = 0.0
    @State private var loading = true
    @State private var type = "pump"
    @State private var start = 0.0
    @State private var end = 0.0

    var body: some View {
        Form {
            if !labels.isEmpty {
                Section("Vorhandene Labels") {
                    ForEach(labels) { l in
                        HStack {
                            Text("\(typeText(l.label))  \(mmss(Double(l.t_start_ms) / 1000))–\(mmss(Double(l.t_end_ms) / 1000))")
                            Spacer()
                            Button(role: .destructive) {
                                Task { try? await Api.deleteLabel(id, labelId: l.id); await reload() }
                            } label: { Image(systemName: "trash") }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }
            Section("Label hinzufügen") {
                Picker("Typ", selection: $type) {
                    ForEach(types, id: \.0) { id2, label in Text(label).tag(id2) }
                }
                .pickerStyle(.segmented)
                VStack(alignment: .leading) {
                    Text("Start: \(mmss(start))").font(.caption)
                    Slider(value: $start, in: 0...max(durSec, 1))
                    Text("Ende: \(mmss(end))").font(.caption)
                    Slider(value: $end, in: 0...max(durSec, 1))
                }
                Button("Label hinzufügen") {
                    let a = min(start, end), b = max(start, end)
                    Task { try? await Api.addLabel(id, startMs: Int(a * 1000), endMs: Int(b * 1000), label: type); await reload() }
                }
                .disabled(end <= start)
            }
        }
        .navigationTitle("Labeling")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if loading { ProgressView() } }
        .task {
            if let s = try? await Api.session(id), let a = s.startedDate, let b = s.endedDate, b > a {
                durSec = b.timeIntervalSince(a); end = durSec
            }
            await reload()
            loading = false
        }
    }

    private func reload() async { labels = (try? await Api.labels(id)) ?? [] }
    private func typeText(_ id: String) -> String { types.first { $0.0 == id }?.1 ?? id }
    private func mmss(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}
