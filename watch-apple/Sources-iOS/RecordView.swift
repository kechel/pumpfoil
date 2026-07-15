import SwiftUI

// „Record on Phone" (Beta): das iPhone als Recorder. Gleiche Live-Werte wie die Uhr-Apps, aber
// ohne Einstellungs-Optionen (die stehen anderswo) — dafür die Session-Foil direkt wählbar.
// 3 Sekunden halten zum Stoppen (gegen versehentliches Beenden). Aufnahme läuft im Hintergrund
// (PhoneRecorder / Background-Location) weiter, auch mit Screen aus / in der Tasche.
struct RecordView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appLang") private var lang = "de"
    @ObservedObject private var rec = PhoneRecorder.shared
    @State private var foils: [Foil] = []       // ganzer Katalog (für „anderes Foil")
    @State private var favFoils: [Foil] = []     // Favoriten (my_foils) — als Chips direkt wählbar
    @State private var foilId: Int?
    @State private var defaultLoaded = false
    @State private var holdProgress: CGFloat = 0

    private func foilLabel(_ id: Int?) -> String {
        guard let id, let f = foils.first(where: { $0.id == id }) else { return Loc.t("rec.foilNone", lang) }
        return "\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces)
    }
    private func shortLabel(_ f: Foil) -> String { "\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces) }
    private func mmss(_ s: Int) -> String { String(format: "%d:%02d", s / 60, s % 60) }
    private func km(_ m: Double) -> String { m >= 1000 ? String(format: "%.2f km", m / 1000) : "\(Int(m)) m" }

    // Direkt antippbarer Foil-Chip (Favoriten + „Ohne Foil"); hervorgehoben, wenn ausgewählt.
    private func foilChip(_ id: Int?, _ label: String) -> some View {
        let sel = foilId == id
        return Button { foilId = id } label: {
            Text(label).font(.subheadline).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10).padding(.horizontal, 8)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(sel ? Color.accentColor : Color.secondary.opacity(0.15)))
                .foregroundStyle(sel ? Color.white : Color.primary)
        }.buttonStyle(.plain)
    }

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
                await rec.drain()   // offen gebliebene Uploads gleich versuchen (falls jetzt Netz da)
                foils = (try? await Api.foils()) ?? []
                let s = (try? await Api.settings()) ?? [:]
                let favIds = (s["my_foils"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue ?? ($0 as? Int) } ?? []
                favFoils = foils.filter { favIds.contains($0.id) }
                if !defaultLoaded {   // Default-Foil vorwählen (nur beim ersten Öffnen der Ansicht)
                    let def = (s["foil_id"] as? NSNumber)?.intValue ?? (s["foil_id"] as? Int)
                    foilId = rec.sessionFoilId ?? def
                    defaultLoaded = true
                }
            }
            // Idle-GPS für „GPS bereit" + Autostart, solange die Ansicht offen und nicht aufgenommen wird.
            .onAppear { rec.startIdleMonitor() }
            .onDisappear { rec.stopIdleMonitor() }
        }
    }

    private var idleBody: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 4)
            // Live-GPS-Status (wie Uhr).
            Text(rec.gpsReady ? Loc.t("rec.gpsReady", lang) : Loc.t("rec.gpsSearch", lang))
                .font(.subheadline).bold()
                .foregroundStyle(rec.gpsReady ? Color.accentColor : Color.secondary)
            Text(Loc.t("rec.gpsHint", lang))
                .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            // Autostart (wie Uhr): losfahren startet die Aufnahme automatisch.
            Toggle(isOn: $rec.autoStart) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Loc.t("rec.autostart", lang)).font(.subheadline)
                    if rec.autoStart {
                        Text(Loc.t("rec.autostartHint", lang)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(Loc.t("rec.foilLabel", lang).uppercased())
                    .font(.caption).foregroundStyle(.secondary)
                // Favoriten (my_foils) direkt als Chips wählbar; Standard-Foil vorausgewählt.
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                    foilChip(nil, Loc.t("rec.foilNone", lang))
                    ForEach(favFoils) { f in foilChip(f.id, shortLabel(f)) }
                }
                // Zusätzlich: ganzer Katalog, falls ein Foil außerhalb der Favoriten gebraucht wird.
                Menu {
                    Button(Loc.t("rec.foilNone", lang)) { foilId = nil }
                    ForEach(foils) { f in Button(shortLabel(f)) { foilId = f.id } }
                } label: {
                    HStack {
                        Text(foilId != nil && !favFoils.contains(where: { $0.id == foilId })
                             ? foilLabel(foilId) : Loc.t("rec.foilOther", lang))
                            .foregroundStyle(.secondary).lineLimit(1)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.3)))
                }
            }
            Button {
                rec.sessionFoilId = foilId
                rec.start()
            } label: {
                Text(Loc.t("rec.start", lang)).bold().frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            if rec.pendingCount > 0 { pendingRow }
            Spacer()
        }
    }

    // Offene Uploads + manueller „Jetzt hochladen"-Trigger (falls beim Beenden kein Netz da war).
    @ViewBuilder private var pendingRow: some View {
        HStack(spacing: 10) {
            Text(rec.uploading ? Loc.t("rec.upRunning", lang)
                 : Loc.t("rec.pending", lang).replacingOccurrences(of: "{n}", with: "\(rec.pendingCount)"))
                .font(.footnote).foregroundStyle(.secondary)
            if !rec.uploading {
                Button(Loc.t("rec.uploadNow", lang)) { Task { await rec.drain() } }
                    .font(.footnote.bold())
            }
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
            // Live-Track des aktuellen Laufs füllt den Platz bis zum fixen STOPP-Button.
            trackCanvas.frame(maxWidth: .infinity, maxHeight: .infinity)
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
            if rec.pendingCount > 0 && !rec.uploading {
                Button(Loc.t("rec.uploadNow", lang)) { Task { await rec.drain() } }
                    .font(.footnote.bold())
            }
            Spacer()
            Button { dismiss() } label: { Text(Loc.t("common.done", lang)).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    // Live-Track, selbst gezeichnet (keine externen Karten-Tiles) — Norden oben, Längengrad um
    // cos(lat) gestaucht. Aktuelle Position als roter Punkt.
    private var trackCanvas: some View {
        RoundedRectangle(cornerRadius: 16).fill(Color.secondary.opacity(0.12))
            .overlay {
                if rec.track.count < 2 {
                    Text(Loc.t("rec.gpsSearch", lang)).font(.footnote).foregroundStyle(.secondary)
                } else {
                    Canvas { ctx, size in
                        let pts = rec.track
                        var minLat = Double.greatestFiniteMagnitude, maxLat = -Double.greatestFiniteMagnitude
                        var minLon = Double.greatestFiniteMagnitude, maxLon = -Double.greatestFiniteMagnitude
                        for p in pts {
                            minLat = min(minLat, p[0]); maxLat = max(maxLat, p[0])
                            minLon = min(minLon, p[1]); maxLon = max(maxLon, p[1])
                        }
                        let midLat = (minLat + maxLat) / 2
                        let lonScale = max(0.01, cos(midLat * .pi / 180))
                        let w = max(1e-9, (maxLon - minLon) * lonScale)
                        let h = max(1e-9, maxLat - minLat)
                        let scale = min(size.width / w, size.height / h)
                        let offX = (size.width - w * scale) / 2
                        let offY = (size.height - h * scale) / 2
                        func px(_ lon: Double) -> CGFloat { offX + (lon - minLon) * lonScale * scale }
                        func py(_ lat: Double) -> CGFloat { offY + (maxLat - lat) * scale }   // Norden oben
                        var path = Path()
                        for (i, p) in pts.enumerated() {
                            let pt = CGPoint(x: px(p[1]), y: py(p[0]))
                            if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
                        }
                        ctx.stroke(path, with: .color(rec.isFoiling ? .accentColor : .secondary),
                                   style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                        if let last = pts.last {
                            let c = CGPoint(x: px(last[1]), y: py(last[0]))
                            ctx.fill(Path(ellipseIn: CGRect(x: c.x - 5, y: c.y - 5, width: 10, height: 10)),
                                     with: .color(.red))
                        }
                    }
                    .padding(14)
                }
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
