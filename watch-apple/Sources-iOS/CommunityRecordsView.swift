import SwiftUI

// Community-Rekorde je Zeitraum (Top-Speed, weitester/längster Lauf, längster Gleit,
// meiste Läufe), klickbar zur Session. Spiegelt web/Community-Records.
struct CommunityRecordsView: View {
    private let periods: [(String, String)] = [
        ("today", "Heute"), ("10d", "10 T"), ("30d", "30 T"), ("365d", "Jahr"), ("all", "Gesamt"),
    ]
    @State private var data: [String: PeriodRecords] = [:]
    @State private var period = "all"
    @State private var loaded = false

    var body: some View {
        List {
            Section {
                Picker("Zeitraum", selection: $period) {
                    ForEach(periods, id: \.0) { id, label in Text(label).tag(id) }
                }
                .pickerStyle(.segmented)
            }
            let r = data[period]
            let rows = entries(r)
            if rows.isEmpty {
                Text(loaded ? "Noch keine Rekorde in diesem Zeitraum." : "")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(rows, id: \.label) { row in
                    if let sid = row.entry.session_id {
                        NavigationLink { SessionDetailView(id: sid) } label: { recordRow(row) }
                    } else {
                        recordRow(row)
                    }
                }
            }
        }
        .navigationTitle("Rekorde")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if !loaded { ProgressView() } }
        .task { data = (try? await Api.communityRecords()) ?? [:]; loaded = true }
    }

    private struct Row { let label: String; let value: String; let entry: CommunityRecordEntry }

    private func entries(_ r: PeriodRecords?) -> [Row] {
        guard let r else { return [] }
        var out: [Row] = []
        if let e = r.speed, (e.value ?? 0) > 0 { out.append(Row(label: "Top-Speed", value: String(format: "%.1f km/h", (e.value ?? 0) * 3.6), entry: e)) }
        if let e = r.distance, (e.value ?? 0) > 0 { out.append(Row(label: "Weitester Lauf", value: dist(e.value ?? 0), entry: e)) }
        if let e = r.duration, (e.value ?? 0) > 0 { out.append(Row(label: "Längster Lauf", value: dur(e.value ?? 0), entry: e)) }
        if let e = r.glide, (e.value ?? 0) > 0 { out.append(Row(label: "Längster Gleit", value: dur(e.value ?? 0), entry: e)) }
        if let e = r.runs, (e.value ?? 0) > 0 { out.append(Row(label: "Meiste Läufe", value: "\(Int(e.value ?? 0))", entry: e)) }
        return out
    }

    private func recordRow(_ row: Row) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.label).font(.caption).foregroundStyle(.secondary)
            Text(row.value).font(.title3).bold().foregroundStyle(Color.accentColor)
            let holder = [row.entry.name, row.entry.spot].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · ")
            if !holder.isEmpty { Text(holder).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private func dist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
    private func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}
