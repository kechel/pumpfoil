import SwiftUI

// Prominente Live-Upload-Karte (Home + Sessions): eigene Sessions im Zwischenzustand
// (recording/live), sobald Chunks am Server ankommen — inkl. „GPS da"-Anzeige, Stall-Hinweis
// (>5 min kein Chunk) und Tap -> Detailseite (dort triggert der Server die gps_only-Analyse).
// Pollt schnell (4 s) solange etwas läuft, sonst träge (20 s). Rendert nichts, wenn leer.
// Parität zur PWA/Android. NICHT in Community einbauen.
struct UploadProgressCard: View {
    @State private var rows: [InProgressSession] = []

    var body: some View {
        Group {
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    // UEBERHOLTE Aufnahmen (die Uhr hat ihren Puffer weitergedreht, es kommt
                    // nichts mehr) stehen NICHT als grosse Karte ueber allem — dort saesse sonst
                    // dauerhaft ein langer Hinweis, obwohl nichts laeuft und nichts zu tun ist,
                    // solange man nicht hineingeht (Jan, 11.09.2026; in der PWA seit demselben
                    // Tag so). Ganz verschwinden duerfen sie auch nicht: eine `live`-Session
                    // steht in der Liste nur unter „Aussortiert", und genau daran lag der Befund
                    // vom 03.09. — 30 haengende Uploads sahen ihre Besitzer NIRGENDS. Deshalb
                    // eine schmale Zeile mit dem Weg zur Session; entschieden wird dort.
                    ForEach(rows.filter { $0.ueberholt != true }) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { UploadCardRow(s: s) }
                            .buttonStyle(.plain)
                    }
                    ForEach(rows.filter { $0.ueberholt == true }) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { SchmaleZeile() }
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
}

/// Eine ueberholte Aufnahme in der Uebersicht: eine Zeile, kein Block. Gegenstueck zu
/// `SchmaleZeile` in der PWA und in der Android-App.
private struct SchmaleZeile: View {
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle").foregroundStyle(.secondary)
            Text(Loc.t("upload.supersededShort", lang))
                .font(.callout).foregroundStyle(.secondary)
                .lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}

// Eine Upload-Zeile — von der Liste (Home/Sessions) und von der Detailseite derselben Session
// benutzt, damit beide waehrend eines Uploads genau dasselbe zeigen (Jan, 01.09.).
struct UploadCardRow: View {
    let s: InProgressSession
    @AppStorage("appLang") private var lang = "de"

    var body: some View { rowView(s) }

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
            // „Ueberholt": seither ist eine neuere Session komplett angekommen, die Uhr hat ihren
            // Puffer also weitergedreht — „App auf der Uhr oeffnen" waere ein falscher Rat.
            if s.ueberholt == true {
                Label(Loc.t(s.has_gps ? "upload.supersededHint" : "upload.supersededEmpty", lang),
                      systemImage: "info.circle")
                    .font(.subheadline).foregroundColor(.orange)
            } else if stalled(s) {
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

// Dieselbe Karte auf der Detailseite EINER Session — ohne Tap-Ziel (sie wuerde auf sich selbst
// fuehren). Verschwindet von selbst, sobald der Upload durch ist: dann steht die Session nicht
// mehr in /in-progress und nur noch die Analyse laeuft.
struct SessionUploadCard: View {
    let id: Int
    @State private var row: InProgressSession? = nil

    var body: some View {
        Group {
            if let row { UploadCardRow(s: row) }
        }
        .task { await poll() }
    }

    private func poll() async {
        while !Task.isCancelled {
            if let r = try? await Api.inProgress() { row = r.first { $0.id == id } }
            let secs: UInt64 = row == nil ? 20 : 4
            try? await Task.sleep(nanoseconds: secs * 1_000_000_000)
        }
    }
}
