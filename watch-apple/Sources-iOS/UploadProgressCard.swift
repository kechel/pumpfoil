import SwiftUI

// Prominente Live-Upload-Karte (Home + Sessions): eigene Sessions im Zwischenzustand
// (recording/live), sobald Chunks am Server ankommen — inkl. „GPS da"-Anzeige, Stall-Hinweis
// (>5 min kein Chunk) und Tap -> Detailseite (dort triggert der Server die gps_only-Analyse).
// Pollt schnell (4 s) solange etwas läuft, sonst träge (20 s). Rendert nichts, wenn leer.
// Parität zur PWA/Android. NICHT in Community einbauen.
struct UploadProgressCard: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rows: [InProgressSession] = []

    var body: some View {
        Group {
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(rows) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { rowView(s) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .task { await poll() }
    }

    private func poll() async {
        while !Task.isCancelled {
            if let r = try? await Api.inProgress() { rows = r }
            let secs: UInt64 = rows.isEmpty ? 20 : 4
            try? await Task.sleep(nanoseconds: secs * 1_000_000_000)
        }
    }

    private func stalled(_ s: InProgressSession) -> Bool {
        guard let str = s.last_received_at else { return false }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let d = f.date(from: str) ?? {
            let g = ISO8601DateFormatter(); g.formatOptions = [.withInternetDateTime]; return g.date(from: str)
        }()
        guard let d else { return false }
        return Date().timeIntervalSince(d) > 300
    }

    @ViewBuilder private func rowView(_ s: InProgressSession) -> some View {
        let pct: Double? = (s.upload_total ?? 0) > 0
            ? min(1.0, Double(s.upload_received) / Double(s.upload_total!)) : nil
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "icloud.and.arrow.up").foregroundColor(.cyan)
                Text(Loc.t("upload.title", lang)).font(.subheadline).bold()
                if let dev = s.device_label, !dev.isEmpty {
                    Text(dev).font(.caption).foregroundColor(.secondary)
                }
                Spacer()
            }
            HStack(spacing: 10) {
                if s.has_gps {
                    HStack(spacing: 3) {
                        Image(systemName: "location.fill").font(.caption)
                        Text(Loc.t("upload.gpsReady", lang))
                        Image(systemName: "checkmark").font(.caption)
                    }.foregroundColor(.cyan).font(.subheadline)
                } else {
                    Text(Loc.t("upload.waiting", lang)).font(.subheadline).foregroundColor(.secondary)
                }
                Text(pct != nil
                     ? "\(Int(pct! * 100)) % · \(s.upload_received)/\(s.upload_total!)"
                     : Loc.t("upload.chunks", lang).replacingOccurrences(of: "{n}", with: "\(s.upload_received)"))
                    .font(.subheadline)
            }
            if let pct { ProgressView(value: pct).tint(.cyan) }
            else { ProgressView().progressViewStyle(.linear).tint(.cyan) }
            if stalled(s) {
                Label(Loc.t("upload.stalledHint", lang), systemImage: "info.circle")
                    .font(.subheadline).foregroundColor(.orange)
            } else {
                Text(Loc.t("upload.hint", lang)).font(.subheadline).foregroundColor(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.cyan.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
