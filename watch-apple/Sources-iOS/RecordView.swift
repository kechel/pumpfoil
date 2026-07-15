import SwiftUI

// „Record on Phone" (Beta): das iPhone als Recorder. Gleiche Live-Werte wie die Uhr-Apps, aber
// ohne Einstellungs-Optionen (die stehen anderswo) — dafür die Session-Foil direkt wählbar.
// 3 Sekunden halten zum Stoppen (gegen versehentliches Beenden). Aufnahme läuft im Hintergrund
// (PhoneRecorder / Background-Location) weiter, auch mit Screen aus / in der Tasche.
struct RecordView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appLang") private var lang = "de"
    @ObservedObject private var rec = PhoneRecorder.shared
    @State private var foils: [Foil] = []
    @State private var foilId: Int?
    @State private var holdProgress: CGFloat = 0

    private func foilLabel(_ id: Int?) -> String {
        guard let id, let f = foils.first(where: { $0.id == id }) else { return Loc.t("rec.foilNone", lang) }
        return "\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces)
    }
    private func mmss(_ s: Int) -> String { String(format: "%d:%02d", s / 60, s % 60) }
    private func km(_ m: Double) -> String { m >= 1000 ? String(format: "%.2f km", m / 1000) : "\(Int(m)) m" }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if rec.recording { recordingBody }
                else if rec.status == "gespeichert" || rec.status == "speichere…" { savedBody }
                else { idleBody }
            }
            .padding(20)
            .navigationTitle(Loc.t("rec.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !rec.recording {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(Loc.t("common.done", lang)) { dismiss() }
                    }
                }
            }
            .task {
                rec.refreshPending()
                foils = (try? await Api.foils()) ?? []
                foilId = rec.sessionFoilId
            }
        }
    }

    private var idleBody: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 4)
            Text(Loc.t("rec.gpsHint", lang))
                .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 6) {
                Text(Loc.t("rec.foilLabel", lang).uppercased())
                    .font(.caption).foregroundStyle(.secondary)
                Menu {
                    Button(Loc.t("rec.foilNone", lang)) { foilId = nil }
                    ForEach(foils) { f in
                        Button("\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces)) { foilId = f.id }
                    }
                } label: {
                    HStack {
                        Text(foilLabel(foilId)).lineLimit(1)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").font(.caption)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.4)))
                }
            }
            Button {
                rec.sessionFoilId = foilId
                rec.start()
            } label: {
                Text(Loc.t("rec.start", lang)).bold().frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            if rec.pendingCount > 0 {
                Text(Loc.t("rec.pending", lang).replacingOccurrences(of: "{n}", with: "\(rec.pendingCount)"))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var recordingBody: some View {
        VStack(spacing: 14) {
            Text(rec.isFoiling ? Loc.t("rec.onfoil", lang) : Loc.t("rec.recording", lang))
                .font(.title3).foregroundStyle(rec.isFoiling ? Color.accentColor : Color.secondary)
            statRow(Loc.t("rec.time", lang), mmss(rec.elapsedSec), Loc.t("rec.dist", lang), km(rec.distanceM))
            statRow(Loc.t("rec.speed", lang), String(format: "%.1f", rec.speedKmh), Loc.t("rec.speedMax", lang), String(format: "%.1f", rec.maxSpeedKmh))
            statRow(Loc.t("rec.runs", lang), "\(rec.runCount)", Loc.t("rec.runDur", lang), mmss(rec.runDurationMs / 1000))
            if rec.uploading { Text(Loc.t("rec.upRunning", lang)).font(.footnote).foregroundStyle(.secondary) }
            Spacer()
            Text(Loc.t("rec.holdStop", lang)).font(.footnote).foregroundStyle(.secondary)
            ZStack {
                RoundedRectangle(cornerRadius: 28).fill(Color.red)
                Rectangle().fill(Color.white.opacity(0.28)).scaleEffect(x: holdProgress, anchor: .leading)
                Text(Loc.t("rec.stop", lang)).bold().foregroundStyle(.white)
            }
            .frame(height: 56).clipShape(RoundedRectangle(cornerRadius: 28))
            .onLongPressGesture(minimumDuration: 3.0, maximumDistance: 60,
                perform: { rec.stop() },
                onPressingChanged: { pressing in
                    if pressing { withAnimation(.linear(duration: 3.0)) { holdProgress = 1 } }
                    else { withAnimation(.linear(duration: 0.15)) { holdProgress = 0 } }
                })
        }
    }

    private var savedBody: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 30)
            Text(rec.status == "speichere…" ? Loc.t("rec.saving", lang) : Loc.t("rec.saved", lang))
                .font(.title2).foregroundStyle(Color.accentColor)
            let info: String = rec.uploading ? Loc.t("rec.upRunning", lang)
                : rec.uploadError == "offline" ? Loc.t("rec.upLater", lang)
                : (rec.pendingCount == 0 && rec.status == "gespeichert") ? Loc.t("rec.upDone", lang) : ""
            if !info.isEmpty { Text(info).foregroundStyle(.secondary) }
            Spacer()
            Button { dismiss() } label: { Text(Loc.t("common.done", lang)).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    private func statRow(_ l1: String, _ v1: String, _ l2: String, _ v2: String) -> some View {
        HStack(spacing: 12) { statCell(l1, v1); statCell(l2, v2) }
    }
    private func statCell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 26, weight: .bold))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.secondary.opacity(0.12)))
    }
}
