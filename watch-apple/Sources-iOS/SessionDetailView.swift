import SwiftUI
import PhotosUI
import MapKit
import CoreLocation
import UIKit

// Session-Detail: Kopf + Track auf MapKit-Karte (nur Foiling-Segmente, speed-gefärbt) +
// Kennzahlen. Spiegelt web/src/pages/SessionDetail.tsx.
struct SessionDetailView: View {
    let id: Int
    var dataVersion: Int? = nil   // aus der Liste: erlaubt Cache-Treffer ohne Netz (nil -> immer laden)
    // Welche Session gerade GEZEIGT wird. „Älter"/„Neuer" TAUSCHEN sie hier aus, statt eine weitere
    // Detailansicht auf den Navigations-Stack zu legen. Vorher tat genau das der NavigationLink im
    // neighborNav -- mit der Folge, dass der Zurueck-Button oben links durch die Kette der
    // durchgeblaetterten Sessions lief statt eine Ebene hoeher (Jans Befund: Rekord antippen, zurueck,
    // und man steht in einer voellig anderen Session). Der Zurueck-Button gehoert der Ebene; zum
    // Blaettern gibt es „Älter"/„Neuer".
    @State private var shownId: Int?
    private var sid: Int { shownId ?? id }
    @EnvironmentObject private var store: SessionStore
    @AppStorage("appLang") private var lang = "de"
    // Beobachtet die Anzeige-Einheit der Pump-Kadenz -> Umschalten wirkt sofort (PumpUnit.swift).
    @AppStorage(PumpUnit.storeKey) private var pumpUnit = "hz"
    @State private var session: SessionDetail?
    @State private var loading = true
    @State private var error: String?
    // Setup-Kataloge fuer die Auswahlfelder je Session. Mast und Shim sind reine Werte aus den
    // Einstellungen des Nutzers -- ohne eigene Werte kein Feld, genau wie FoilSelect.tsx.
    @State private var allStabs: [StabBrief] = []
    @State private var myStabIds: Set<Int> = []
    @State private var myMasts: [Int] = []
    @State private var myShims: [Double] = []
    @State private var myBoards: [BoardBrief] = []
    // Sportart-Klassifikation (docs/sport-classification.md). Die Melde-Zustände (nicht Pumpfoil /
    // unecht / unangemessen) liegen in SessionReportRow — die zeigt nur fremde Sessions.
    @State private var appealOpen = false
    @State private var appealDraft = ""
    @State private var classErr: String?
    @State private var liked = false
    @State private var likeCount = 0
    @State private var photos: [SessionPhoto] = []
    @State private var videos: [SessionVideo] = []
    @State private var videoDialog = false
    @State private var videoUrl = ""
    @State private var videoErr = false
    @State private var lightbox: SessionPhoto?     // angetipptes Foto -> Vollbild
    @State private var pickerItem: PhotosPickerItem?
    @State private var colorMode: TrackColorMode = .speed
    @State private var carve: CarveData?   // Carve-Bögen + Zähler (GET /carves)
    @State private var win = 3
    @State private var showPumps = false   // Pump-Marker default aus
    @State private var selectedRun: Int?     // ausgewählter Lauf -> nur dieser farbig, Karte zoomt
    @State private var allFoils: [Foil] = []
    @State private var mineIds: Set<Int> = []
    @State private var selectedFoilId = 0
    @State private var showTrim = false
    @State private var showShare = false
    @State private var showLink = false        // Teilen-Link-Sheet (Besitzer)
    @State private var shareUrl: String?
    @State private var linkCopied = false
    @State private var trimStart = 0.0
    @State private var trimEnd = 0.0
    @State private var weightKg = 0.0
    // Lauf/Zeitbereich aussortieren (POST /runs/exclude, umkehrbar): Bestätigung, Sperre während
    // des Serverlaufs (der rechnet die Session neu) und Fehlertext direkt bei der Lauf-Tabelle.
    @State private var pendingExcludeRun = -1
    @State private var confirmExcludeRun = false
    @State private var confirmExcludeRange = false
    @State private var excludeBusy = false
    @State private var excludeErr: String?
    @State private var confirmDelete = false
    @State private var caption = ""
    @State private var editingCaption = false
    @State private var draftCaption = ""
    @State private var neighbors: Api.Neighbors?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    // Warnfarbe des Hinweises „N Läufe aussortiert" — dieselben Werte wie SessionReportRow/Android
    // (92400E hell / FDE68A dunkel), damit der Text in BEIDEN Modi lesbar bleibt.
    private var amber: Color {
        scheme == .dark ? Color(red: 0.992, green: 0.902, blue: 0.541) : Color(red: 0.573, green: 0.251, blue: 0.055)
    }

    // Hinweisfarbe des Fremdkraft-Kastens — sky-700 hell / sky-300 dunkel, wie die PWA
    // (Kasten dort sky statt amber: Vorschlag der Erkennung, keine Warnung). Beide Modi lesbar.
    private var sky: Color {
        scheme == .dark ? Color(red: 0.490, green: 0.827, blue: 0.988) : Color(red: 0.012, green: 0.412, blue: 0.631)
    }

    // Der Body war EIN Ausdruck von 88 Zeilen (Toolbar mit vier Zweigen, zwei Dialoge mit Aktionen,
    // Poll-Task, drei Sheets) und stand mit >500 ms im Build-Log — Swifts Type-Checker loest einen
    // ViewBuilder als einen einzigen Ausdruck auf. Jeder Teil unten ist eigenstaendig typisiert;
    // alle Ablauflogik steckt in Methoden statt in Closures.
    var body: some View {
        ScrollView { scrollBody }
            .navigationTitle(Loc.t("sd.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarItems }
            .confirmationDialog(Loc.t("sd.deleteTitle", lang), isPresented: $confirmDelete, titleVisibility: .visible) {
                deleteDialogActions
            }
            .confirmationDialog(Loc.t("sd.excludeRun", lang), isPresented: $confirmExcludeRun, titleVisibility: .visible) {
                excludeRunDialogActions
            } message: {
                Text(Loc.t("sd.excludeConfirm", lang))
            }
            .alert(Loc.t("sd.caption", lang), isPresented: $editingCaption) { captionAlertActions }
            .task(id: sid) { await load() }
            .task(id: session?.status) { await pollWhileLive() }
            .onChange(of: selectedFoilId) { fid in onFoilPicked(fid) }
            .sheet(isPresented: $showLink) { linkSheet }
            .sheet(isPresented: $showTrim) { trimSheet }
            .sheet(isPresented: $showShare) { shareSheet }
            .fullScreenCover(item: $lightbox) { start in
                PhotoLightboxView(photos: photos, startId: start.id) { lightbox = nil }
            }
    }

    @ViewBuilder private var scrollBody: some View {
        if loading {
            ProgressView().padding(40)
        } else if let error {
            Text(error).foregroundStyle(.secondary).padding()
        } else if let s = session {
            content(s)
        }
    }

    // Die Melde-Aktionen standen früher hier in einem Menü hinter einem Flaggen-Symbol —
    // praktisch unsichtbar. Sie stehen jetzt sichtbar im Inhalt (SessionReportRow), an
    // derselben Stelle wie die Klassifikations-Felder eigener Sessions (wie in der PWA).
    @ToolbarContentBuilder private var toolbarItems: some ToolbarContent {
        spotChatItem
        ownerToolbarItems
    }

    // Spot-Chat der Session (scope "spot:<name>") — bei Age-Gate (social_allowed=false) aus.
    @ToolbarContentBuilder private var spotChatItem: some ToolbarContent {
        if let sp = session?.place_name, !sp.isEmpty, store.profile?.social_allowed != false {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { ChatRoomView(scope: "spot:\(sp)", title: sp) } label: {
                    Image(systemName: "bubble.left.and.bubble.right")
                }
            }
        }
    }

    // Trimmen/Löschen sind selten gebraucht -> nicht mehr oben, sondern unten im Body.
    @ToolbarContentBuilder private var ownerToolbarItems: some ToolbarContent {
        if session?.owned == true {
            if session?.analysis?.track_geojson != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showShare = true } label: { Image(systemName: "square.and.arrow.up") }
                }
            }
            // Öffentlicher Teilen-Link (Besitzer): Link-Icon -> Sheet mit Erklärung + Kopieren.
            ToolbarItem(placement: .topBarTrailing) {
                Button { openShareLink() } label: { Image(systemName: "link") }
            }
            // Pump-Label-Ansicht mobil vorerst ausgeblendet (Jan: „machen wir andermal").
            // Code (LabelingView) bleibt bestehen — nur der Toolbar-Button ist deaktiviert.
            if false {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { LabelingView(id: id) } label: { Image(systemName: "tag") }
                }
            }
        }
    }

    private func openShareLink() {
        showLink = true; linkCopied = false
        if shareUrl == nil { Task { shareUrl = try? await Api.createShareLink(sid) } }
    }

    @ViewBuilder private var deleteDialogActions: some View {
        Button(Loc.t("common.delete", lang), role: .destructive) {
            Task { try? await Api.deleteSession(sid); dismiss() }
        }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    @ViewBuilder private var captionAlertActions: some View {
        TextField(Loc.t("sd.caption", lang), text: $draftCaption)
        Button(Loc.t("common.save", lang)) { saveCaption() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    private func saveCaption() {
        let c: String = String(draftCaption.prefix(30)).trimmingCharacters(in: .whitespaces)
        caption = c
        Task { try? await Api.setCaption(sid, caption: c) }
    }

    @ViewBuilder private var shareSheet: some View {
        if let s = session {
            ShareCardView(session: s, lang: lang, initialHighlight: selectedRun ?? -1)
        }
    }

    // 4a: eigene In-Progress-Session (recording/live) -> still nachpollen. Der GET triggert
    // server-seitig die gps_only-Vorabanalyse; sobald sie/der fertige Upload da ist,
    // aktualisiert sich das Detail (Track/Läufe/Pumps) seamless. Stoppt bei anderem Status.
    private func pollWhileLive() async {
        guard session?.owned == true,
              let st = session?.status, st == "recording" || st == "live" else { return }
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if let fresh = try? await Api.session(sid) { session = fresh; SessionCache.store(fresh) }
        }
    }

    private func onFoilPicked(_ fid: Int) {
        let current: Int = session?.foil?.id ?? 0
        guard fid != current else { return }
        Task { try? await Api.setSessionFoil(sid, foilId: fid == 0 ? nil : fid); await load() }
    }

    /// Hat der Katalog-Eintrag echte Herstellermaße? Einträge ohne stehen mit 0 in Fläche und
    /// Spannweite — die Leistungsrechnung teilt durch die Fläche, das ergäbe NaN-Zahlen. Dann
    /// lieber keine Leistungs-Karte als erfundene Werte.
    private func hasSpecs(_ f: Foil) -> Bool {
        f.area_cm2 > 0 && f.span_cm > 0 && f.thickness_mm > 0
    }

    private var durSec: Double {
        guard let a = session?.startedDate, let b = session?.endedDate, b > a else { return 0 }
        return b.timeIntervalSince(a)
    }

    // Teilen-Link-Sheet (Besitzer): Erklärung + Link + Kopieren + Deaktivieren.
    private var linkSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(Loc.t("share.linkExplain", lang)).font(.callout).foregroundStyle(.secondary)
                Text(shareUrl ?? Loc.t("common.loading", lang))
                    .font(.footnote).foregroundStyle(Color.accentColor)
                    .textSelection(.enabled)
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.12)))
                Button {
                    if let u = shareUrl { UIPasteboard.general.string = u; linkCopied = true }
                } label: {
                    Label(linkCopied ? Loc.t("share.copied", lang) : Loc.t("share.copy", lang), systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large).disabled(shareUrl == nil)
                Button(role: .destructive) {
                    Task { try? await Api.revokeShareLink(sid) }
                    shareUrl = nil; showLink = false
                } label: { Text(Loc.t("share.revoke", lang)) }
                Spacer()
            }
            .padding(20)
            .navigationTitle(Loc.t("share.linkTitle", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(Loc.t("common.close", lang)) { showLink = false }
            } }
        }
    }

    private var trimSheet: some View {
        NavigationStack {
            Form {
                Section(trimLabel("common.start", trimStart)) { Slider(value: $trimStart, in: 0...max(durSec, 1)) }
                Section(trimLabel("common.end", trimEnd)) { Slider(value: $trimEnd, in: 0...max(durSec, 1)) }
                Section {
                    Button(Loc.t("sd.apply", lang)) {
                        let a = min(trimStart, trimEnd), b = max(trimStart, trimEnd)
                        showTrim = false
                        Task { try? await Api.setTrim(sid, startMs: Int(a * 1000), endMs: Int(b * 1000)); await load() }
                    }
                    Button(Loc.t("sd.trimReset", lang), role: .destructive) {
                        showTrim = false
                        Task { try? await Api.setTrim(sid, startMs: nil, endMs: nil); await load() }
                    }
                }
                excludeRangeSection
            }
            .navigationTitle(Loc.t("sd.trim", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { showTrim = false } } }
            .confirmationDialog(Loc.t("sd.excludeRange", lang), isPresented: $confirmExcludeRange, titleVisibility: .visible) {
                excludeRangeDialogActions
            } message: {
                Text(excludeRangeConfirmText)
            }
        }
    }

    // Nutzerbefund: „Beim Trimmen fehlt ein Feedback, bis wohin getrimmt wird — bei den Läufen
    // steht die Ortszeit, beim Trimmen die Zeit ab Sessionbeginn." Deshalb beides nebeneinander:
    // Sekunden ab Start UND die Uhrzeit in der Ortszeit des Spots (wie die Lauf-Zeilen).
    private func trimLabel(_ key: String, _ sec: Double) -> String {
        let base: String = Loc.t(key, lang) + ": " + mmss(sec)
        guard let clock = clockAt(sec) else { return base }
        return base + " · " + clock
    }

    /// Uhrzeit (Spot-Ortszeit) an Sekunde `sec` ab Sessionbeginn; nil, solange nichts geladen ist.
    private func clockAt(_ sec: Double) -> String? {
        guard let s = session, let start = s.startedDate else { return nil }
        return hhmmss(start.addingTimeInterval(sec), s.tz)
    }

    // Denselben Bereich AUSSORTIEREN statt zuschneiden (wie TrimPanel in der PWA): nötig, wenn der
    // Störteil mitten in der Aufnahme liegt — der Zuschnitt kann nur Anfang/Ende wegnehmen.
    @ViewBuilder private var excludeRangeSection: some View {
        Section {
            Button(Loc.t("sd.excludeRange", lang)) { confirmExcludeRange = true }
                .disabled(excludeBusy)
            Text(Loc.t("sd.excludeRangeHint", lang)).font(.body).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var excludeRangeDialogActions: some View {
        Button(Loc.t("sd.excludeRange", lang), role: .destructive) { excludeRangeConfirmed() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    private var excludeRangeConfirmText: String {
        let a: Double = min(trimStart, trimEnd)
        let b: Double = max(trimStart, trimEnd)
        let raw: String = Loc.t("sd.excludeRangeConfirm", lang)
        // Uhrzeiten statt mm:ss — „3:41 bis 7:12" sagt einem im Zweifelsfall gar nichts (wie PWA).
        let from: String = clockAt(a) ?? mmss(a)
        let to: String = clockAt(b) ?? mmss(b)
        return raw
            .replacingOccurrences(of: "{from}", with: from)
            .replacingOccurrences(of: "{to}", with: to)
    }

    private func excludeRangeConfirmed() {
        let a: Double = min(trimStart, trimEnd)
        let b: Double = max(trimStart, trimEnd)
        guard b - a >= 1 else { return }   // Server verlangt >= 1 s
        showTrim = false
        excludeBusy = true
        let startMs: Int = Int(a * 1000)
        let endMs: Int = Int(b * 1000)
        Task {
            do {
                let fresh = try await Api.excludeRange(sid, startMs: startMs, endMs: endMs)
                await applyExcludeResult(fresh)
            } catch {
                await showExcludeError(error)
            }
        }
    }

    private func askExcludeRun(_ i: Int) {
        pendingExcludeRun = i
        confirmExcludeRun = true
    }

    @ViewBuilder private var excludeRunDialogActions: some View {
        Button(Loc.t("sd.excludeRun", lang), role: .destructive) { excludeRunConfirmed() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    private func excludeRunConfirmed() {
        let idx: Int = pendingExcludeRun
        guard idx >= 0 else { return }
        excludeBusy = true
        Task {
            do {
                let fresh = try await Api.excludeRun(sid, runIndex: idx)
                await applyExcludeResult(fresh)
            } catch {
                await showExcludeError(error)
            }
        }
    }

    private func includeExcludedRange(_ i: Int) {
        excludeBusy = true
        Task {
            do {
                let fresh = try await Api.includeRange(sid, rangeIndex: i)
                await applyExcludeResult(fresh)
            } catch {
                await showExcludeError(error)
            }
        }
    }

    /// Antwort der Exclude/Include-Aufrufe ist die KOMPLETTE Session mit frischer Analyse ->
    /// direkt übernehmen (kein zweiter Fetch). Die Lauf-Auswahl passt danach nicht mehr.
    @MainActor private func applyExcludeResult(_ fresh: SessionDetail) {
        session = fresh
        SessionCache.store(fresh)
        selectedRun = nil
        excludeErr = nil
        excludeBusy = false
    }

    @MainActor private func showExcludeError(_ e: Error) {
        excludeErr = Loc.t("sd.excludeFail", lang) + e.localizedDescription
        excludeBusy = false
    }

    private func mmss(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }

    // In kleine, je einzeln type-gecheckte Helfer zerlegt (früher ein ~200-Zeilen-@ViewBuilder mit
    // >10 direkten Kindern -> Swift-Type-Checker/Archive lief exponentiell/„ewig"; vgl. CompareView).
    // Melden ganz unten, UNTER den Lauf-Statistiken (Jan, 29.07.): erst die Session ansehen, dann
    // urteilen — oben stand es im Weg. Nur bei FREMDEN Sessions; sich selbst zu melden ist sinnlos.
    @ViewBuilder private func reportSection(_ s: SessionDetail) -> some View {
        Divider()
        if s.owned == true {
            classificationPickers(s)
        } else if store.profile?.social_allowed != false {
            // Melden ist eine SOZIALE Funktion und haengt damit am Age-Gate — genauso wie der
            // Spot-Chat weiter oben in dieser Datei. Fuer Konten unter 13 (social_allowed = false)
            // weist der Server den Vote mit 403 ab; die Knoepfe waeren also nicht nur unerlaubt,
            // sondern auch kaputt. Die Klassifikation der EIGENEN Session bleibt erlaubt, die ist
            // nicht sozial.
            SessionReportRow(sessionId: s.id, lang: lang)
        }
    }

    @ViewBuilder private func content(_ s: SessionDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            neighborNav
            headerRow(s)
            foilPicker(s)      // Foil gehört zu den Metadaten (wie PWA) — direkt unter dem Kopf
            if s.owned == true { setupPickers(s) }
            // Eigene Session: Klassifikation bleibt oben (man ordnet die eigene Fahrt gleich ein).
            // Fremde Session: die MELDE-Knöpfe stehen ganz unten, s. reportSection.
            if s.owned == true { classificationNotice(s) }
            mediaSection(s)
            trackSection(s)
            if let a = s.analysis, let foil = s.foil, hasSpecs(foil), weightKg > 0 {
                PowerCard(analysis: a, foil: foil, weightKg: weightKg, lang: lang)
            }
            statsSection(s)
            unmergeRow(s)
            bottomActions(s)
            reportSection(s)
        }
        .padding()
    }

    // Selten gebrauchte Aktionen ganz unten (wie PWA): Übertragen · Trimmen · Löschen.
    // Regler auf den gespeicherten Zuschnitt setzen (wie die PWA), sonst auf die volle Dauer.
    private func presetTrimSliders(_ s: SessionDetail) {
        let a: Double = Double(s.trim_start_ms ?? 0) / 1000.0
        let b: Double = Double(s.trim_end_ms ?? Int(durSec * 1000)) / 1000.0
        trimStart = min(max(a, 0), durSec)
        trimEnd = min(max(b, 0), durSec)
    }

    @ViewBuilder private func bottomActions(_ s: SessionDetail) -> some View {
        if s.owned == true {
            VStack(alignment: .leading, spacing: 10) {
                Divider()
                TransferPickerView(sessionId: s.id)
                HStack(spacing: 10) {
                    if durSec > 1 {
                        Button { presetTrimSliders(s); showTrim = true } label: {
                            Label(Loc.t("sd.trim", lang), systemImage: "scissors")
                        }.buttonStyle(.bordered)
                    }
                    Spacer()
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label(Loc.t("common.delete", lang), systemImage: "trash")
                    }.buttonStyle(.bordered).tint(.red)
                }
            }
        }
    }

    // Vor/Zurück zu Nachbar-Sessions (wie Web).
    @ViewBuilder private var neighborNav: some View {
        if let nb = neighbors, nb.older != nil || nb.newer != nil {
            HStack {
                neighborButton(Loc.t("sd.older", lang), target: nb.older)
                Spacer()
                neighborButton(Loc.t("sd.newer", lang), target: nb.newer)
            }
            .font(.subheadline)
        }
    }

    @ViewBuilder private func neighborButton(_ title: String, target: Int?) -> some View {
        if let target {
            Button(title) { showSession(target) }
        } else {
            Text(title).foregroundStyle(.tertiary)
        }
    }

    /// Angezeigte Session austauschen (kein Push!). Der Zustand der alten muss weg, sonst blitzt sie
    /// in der neuen kurz auf; `.task(id: sid)` laedt anschliessend neu.
    private func showSession(_ newId: Int) {
        session = nil; carve = nil; neighbors = nil
        photos = []; videos = []
        selectedRun = nil; lightbox = nil
        shareUrl = nil; linkCopied = false; showLink = false
        appealOpen = false; appealDraft = ""; classErr = nil
        editingCaption = false
        error = nil; loading = true
        shownId = newId
    }

    private func headerRow(_ s: SessionDetail) -> some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(name: s.owner_name, url: Api.mediaURL(s.owner_avatar_url), size: 44)
            headerMeta(s)
            Spacer()
            likeButton(s)
        }
    }

    // Jede Kopfzeile ein eigener kleiner Ausdruck: acht Optional-Zweige in EINEM VStack waren der
    // zweitteuerste Ausdruck der Ansicht.
    private func headerMeta(_ s: SessionDetail) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dateText(s)).font(.title2).bold()
            ownerLine(s)
            placeLine(s)
            waterLine(s)
            timeLine(s)
            deviceLine(s)
            if !caption.isEmpty { Text(caption).foregroundStyle(.secondary) }
            captionButton(s)
        }
    }

    @ViewBuilder private func ownerLine(_ s: SessionDetail) -> some View {
        if s.owned != true, let on = s.owner_name, !on.isEmpty {
            Text(on).font(.subheadline).foregroundStyle(Color.accentColor)
        }
    }

    @ViewBuilder private func placeLine(_ s: SessionDetail) -> some View {
        if let p = s.place_name, !p.isEmpty {
            Label(p, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func waterLine(_ s: SessionDetail) -> some View {
        if let w = s.place_water, !w.isEmpty, w != s.place_name {
            Text(w).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func timeLine(_ s: SessionDetail) -> some View {
        if let tr = timeRangeText(s) {
            Text(tr).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func deviceLine(_ s: SessionDetail) -> some View {
        if let dl = s.device_label, !dl.isEmpty {
            Label(dl, systemImage: "applewatch").font(.caption2).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func captionButton(_ s: SessionDetail) -> some View {
        if s.owned == true {
            Button(captionButtonLabel) { draftCaption = caption; editingCaption = true }
                .font(.caption).buttonStyle(.borderless)
        }
    }

    private var captionButtonLabel: String {
        caption.isEmpty ? Loc.t("sd.captionAdd", lang) : Loc.t("sd.captionEdit", lang)
    }

    private func likeButton(_ s: SessionDetail) -> some View {
        Button { toggleLike(s.id) } label: {
            Label("\(likeCount)", systemImage: liked ? "heart.fill" : "heart")
                .foregroundStyle(liked ? .pink : Color.accentColor)
        }
        .buttonStyle(.bordered)
    }

    // Optimistisch wie in der Liste; bei Fehler auf den vorherigen Stand zurueck.
    private func toggleLike(_ sid: Int) {
        let prev: Bool = liked
        liked.toggle(); likeCount += liked ? 1 : -1
        Task {
            do { let st = try await Api.toggleLike(sid); liked = st.liked; likeCount = st.like_count }
            catch { liked = prev; likeCount += liked ? 1 : -1 }
        }
    }

    // Videos laden; Fallback (alter Server ohne /videos): Legacy-Feld als Einzelvideo.
    private func loadVideos(_ s: SessionDetail) async -> [SessionVideo] {
        if let v = try? await Api.sessionVideos(sid) { return v }
        if let url = s.youtube_url, !url.isEmpty { return [SessionVideo(id: 0, youtube_url: url)] }
        return []
    }

    // Medien als EIN 2-Spalten-Grid (Videos zuerst, dann Fotos) — gleich große 16:9-Kacheln, wie PWA/Android.
    @ViewBuilder private func mediaSection(_ s: SessionDetail) -> some View {
        if !videos.isEmpty || !photos.isEmpty { mediaGrid(s) }
        if s.owned == true { mediaAddRow(s) }
    }

    private func mediaGrid(_ s: SessionDetail) -> some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
        let owned: Bool = s.owned == true
        return LazyVGrid(columns: cols, spacing: 10) {
            ForEach(videos) { v in videoTile(v, owned: owned) }
            ForEach(photos) { p in photoTile(p, owned: owned) }
        }
    }

    private func photoTile(_ p: SessionPhoto, owned: Bool) -> some View {
        mediaTile {
            AsyncImage(url: Api.mediaURL(p.url)) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Color(.secondarySystemBackground)
                }
            }
        }
        .onTapGesture { lightbox = p }
        .overlay(alignment: .topTrailing) { photoRemoveButton(p, owned: owned) }
    }

    @ViewBuilder private func photoRemoveButton(_ p: SessionPhoto, owned: Bool) -> some View {
        if owned {
            Button { removePhoto(p) } label: { removeBadge }
                .buttonStyle(.plain)
        }
    }

    // Gleiches X-Symbol fuer Foto- und Video-Kachel (vorher zweimal derselbe Ausdruck).
    private var removeBadge: some View {
        Image(systemName: "xmark.circle.fill")
            .font(.title3).foregroundStyle(.white, .black.opacity(0.55))
            .padding(6)
    }

    private func removePhoto(_ p: SessionPhoto) {
        Task {
            try? await Api.deleteSessionPhoto(sid, photoId: p.id)
            photos = (try? await Api.sessionPhotos(sid)) ?? []
        }
    }

    private func removeVideo(_ v: SessionVideo) {
        Task {
            try? await Api.deleteSessionVideo(sid, videoId: v.id)
            videos = (try? await Api.sessionVideos(sid)) ?? []
        }
    }

    private func mediaAddRow(_ s: SessionDetail) -> some View {
        HStack(spacing: 16) {
            photoPickerButton
            linkVideoButton
        }
        .alert(Loc.t("meta.linkVideo", lang), isPresented: $videoDialog) { videoAlertActions(s) }
        .alert(Loc.t("meta.errYoutube", lang), isPresented: $videoErr) {
            Button("OK", role: .cancel) {}
        }
    }

    private var photoPickerButton: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            Label(Loc.t("sd.addPhoto", lang), systemImage: "photo.badge.plus")
        }
        .onChange(of: pickerItem) { item in onPhotoPicked(item) }
    }

    private func onPhotoPicked(_ item: PhotosPickerItem?) {
        Task {
            if let data = try? await item?.loadTransferable(type: Data.self) {
                try? await Api.uploadSessionPhoto(sid, data: downscaleJPEG(data))
                photos = (try? await Api.sessionPhotos(sid)) ?? []
            }
        }
    }

    private var linkVideoButton: some View {
        Button {
            videoUrl = ""; videoErr = false; videoDialog = true
        } label: {
            Label(Loc.t("meta.linkVideo", lang), systemImage: "video.badge.plus")
        }
    }

    @ViewBuilder private func videoAlertActions(_ s: SessionDetail) -> some View {
        TextField(Loc.t("meta.youtubePlaceholder", lang), text: $videoUrl)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        Button(Loc.t("common.save", lang)) { addVideo(s) }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    // 16:9-Video-Kachel: YouTube-Thumb + Play; Besitzer bekommt ein X zum Entfernen.
    @ViewBuilder private func videoTile(_ v: SessionVideo, owned: Bool) -> some View {
        if let ytId = youtubeId(v.youtube_url), let ytUrl = URL(string: v.youtube_url) {
            Link(destination: ytUrl) { videoTileLabel(ytId) }
                .overlay(alignment: .topTrailing) { videoRemoveButton(v, owned: owned) }
        }
    }

    private func videoTileLabel(_ ytId: String) -> some View {
        let thumb: URL? = URL(string: "https://img.youtube.com/vi/\(ytId)/hqdefault.jpg")
        return mediaTile {
            AsyncImage(url: thumb) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Color(.secondarySystemBackground)
                }
            }
        }
        .overlay {
            Image(systemName: "play.circle.fill")
                .font(.system(size: 40)).foregroundStyle(.white.opacity(0.9))
        }
    }

    @ViewBuilder private func videoRemoveButton(_ v: SessionVideo, owned: Bool) -> some View {
        if owned && v.id > 0 {
            Button { removeVideo(v) } label: { removeBadge }
                .buttonStyle(.plain)
        }
    }

    private func addVideo(_ s: SessionDetail) {
        let u = videoUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !u.isEmpty else { return }
        Task {
            do {
                try await Api.addSessionVideo(sid, youtubeUrl: u)
                videos = await loadVideos(s)
            } catch { videoErr = true }
        }
    }

    // 16:9-Kachel fester Größe (Breite = Grid-Spalte); Inhalt füllt + wird beschnitten.
    private func mediaTile<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Color(.secondarySystemBackground)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay { content() }
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Schwerste Sektion: viele let-Bindungen/Tupel + Ternär. Als non-builder-Funktion mit guard +
    // AnyView -> der Type-Checker sieht die lets als normale Statements (nicht im Result-Builder).
    // Die Werte stecken zusaetzlich in EINEM typisierten Wert, die Zeilen in eigenen Teil-Views.
    private func trackSection(_ s: SessionDetail) -> some View {
        guard let track = s.analysis?.track_geojson, track.geometry.coordinates.count >= 2,
              let segs = s.analysis?.segments, !segs.isEmpty else { return AnyView(EmptyView()) }
        let v = trackVals(track)
        return AnyView(VStack(alignment: .leading, spacing: 16) {
            modeRow(s, v)
            smoothingRow
            trackMap(track, segs, v)
            legendRow(v)
            selectedRunRow
        })
    }

    // Alle abgeleiteten Track-Werte explizit typisiert an einer Stelle — vorher ein Dutzend
    // let-Bindungen (inkl. Tupel und ??-Ketten) unmittelbar vor dem ViewBuilder.
    private struct TrackVals {
        let speeds: [Double]
        let hr: [Int?]
        let pumpHz: [Double?]
        let hasHr: Bool
        let hasPump: Bool
        let hasCarves: Bool
        let hrRange: (Int, Int)
        let pumpRange: (Double, Double)
        let carveGMax: Double
    }

    private func trackVals(_ track: TrackGeo) -> TrackVals {
        let speeds3: [Double] = track.properties?.speeds_mps ?? []
        let smoothed: [Double] = track.properties?.speeds?[String(win)] ?? speeds3
        let speeds: [Double] = colorMode == .speed ? smoothed : speeds3
        let hr: [Int?] = track.properties?.hr ?? []
        let pumpHz: [Double?] = track.properties?.pump_hz ?? []
        let hrVals: [Int] = hr.compactMap { $0 }.filter { $0 > 0 }
        let pumpVals: [Double] = pumpHz.compactMap { $0 }
        let gVals: [Double] = carveGValues()
        return TrackVals(speeds: speeds, hr: hr, pumpHz: pumpHz,
                         hasHr: hr.contains { ($0 ?? 0) > 0 },
                         hasPump: pumpHz.contains { $0 != nil },
                         hasCarves: !((carve?.carves.isEmpty) ?? true),
                         hrRange: (hrVals.min() ?? 0, hrVals.max() ?? 1),
                         pumpRange: (pumpVals.min() ?? 0, pumpVals.max() ?? 1),
                         carveGMax: min(max(0.6, gVals.max() ?? 0.6), 1.0))
    }

    private func carveGValues() -> [Double] {
        let base: [Double] = carve?.g ?? []
        let fromArcs: [Double] = carve?.arcs.flatMap { $0 }.compactMap { $0.count > 2 ? $0[2] : nil } ?? []
        return base + fromArcs
    }

    // Farbmodus (Speed/Puls/Pump/Carves) + Marker-Umschalter in DERSELBEN Zeile.
    @ViewBuilder private func modeRow(_ s: SessionDetail, _ v: TrackVals) -> some View {
        if v.hasHr || v.hasPump || v.hasCarves {
            HStack(spacing: 12) {
                colorModePicker(v)
                if (s.analysis?.pump_count ?? 0) > 0 {
                    Toggle(Loc.t("sd.markerShort", lang), isOn: $showPumps).font(.caption).fixedSize()
                }
            }
        }
    }

    // Die .tag()-Aufrufe bleiben ABSICHTLICH direkte Kinder des Pickers.
    private func colorModePicker(_ v: TrackVals) -> some View {
        Picker(Loc.t("sd.coloring", lang), selection: $colorMode) {
            Text(Loc.t("sd.colorSpeed", lang)).tag(TrackColorMode.speed)
            if v.hasHr { Text(Loc.t("sd.colorPuls", lang)).tag(TrackColorMode.hr) }
            if v.hasPump { Text(Loc.t("sd.colorPump", lang)).tag(TrackColorMode.pump) }
            if v.hasCarves { Text("Carves").tag(TrackColorMode.turns) }
        }
        .pickerStyle(.segmented)
    }

    // Glättung (nur Speed) in eigener Zeile darunter.
    @ViewBuilder private var smoothingRow: some View {
        if colorMode == .speed {
            HStack {
                Picker("", selection: $win) {
                    Text("1s").tag(1); Text("3s").tag(3); Text("5s").tag(5)
                }
                .pickerStyle(.segmented).frame(maxWidth: 200)
                Spacer()
            }
        }
    }

    private func trackMap(_ track: TrackGeo, _ segs: [Segment], _ v: TrackVals) -> some View {
        let arcs: [[[Double]]] = colorMode == .turns ? (carve?.arcs ?? []) : []
        let h: CGFloat = 300
        return TrackMap(points: track.geometry.coordinates, speedsMps: v.speeds, hr: v.hr, pumpHz: v.pumpHz,
                        segments: segs, mode: colorMode, hrRange: v.hrRange, pumpRange: v.pumpRange,
                        showPumps: showPumps, selectedRun: selectedRun,
                        onSelectRun: { selectedRun = (selectedRun == $0) ? nil : $0 },
                        carveArcs: arcs, carveGMax: v.carveGMax)
            .frame(height: h).frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func legendRow(_ v: TrackVals) -> some View {
        if colorMode == .turns { carveLegend(counts: carve?.counts, gMax: v.carveGMax) }
        else { colorLegend(mode: colorMode, hrRange: v.hrRange, pumpRange: v.pumpRange) }
    }

    @ViewBuilder private var selectedRunRow: some View {
        if let sel = selectedRun {
            HStack {
                Text(runLabel(sel)).font(.subheadline).foregroundStyle(Color.accentColor)
                Button(Loc.t("sd.clearSelection", lang)) { selectedRun = nil }.font(.caption).buttonStyle(.borderless)
            }
        }
    }

    private func runLabel(_ idx: Int) -> String {
        Loc.t("home.runs", lang) + " #\(idx + 1)"
    }

    // Farb-Legende (min→max Verlauf) für den gewählten Modus — wie PWA/Android.
    private func legendLabels(mode: TrackColorMode, hrRange: (Int, Int), pumpRange: (Double, Double)) -> (String, String) {
        switch mode {
        case .speed: return ("8 km/h", "25 km/h")
        case .hr: return ("\(hrRange.0)", "\(hrRange.1) bpm")
        case .pump: return (PumpUnit.fmtLegend(pumpRange.0, lang, withUnit: false),
                            PumpUnit.fmtLegend(pumpRange.1, lang, withUnit: true))
        case .turns: return ("", "")   // TURNS nutzt carveLegend
        }
    }

    private func colorLegend(mode: TrackColorMode, hrRange: (Int, Int), pumpRange: (Double, Double)) -> some View {
        let (lo, hi) = legendLabels(mode: mode, hrRange: hrRange, pumpRange: pumpRange)
        return VStack(spacing: 2) {
            LinearGradient(colors: [.blue, .cyan, .green, .yellow, .orange, .red], startPoint: .leading, endPoint: .trailing)
                .frame(height: 10).clipShape(Capsule())
            HStack { Text(lo); Spacer(); Text(hi) }.font(.caption2).foregroundStyle(.secondary)
        }
    }

    // Carve-Legende: Kurvenlage-Verlauf (grün→rot, oberhalb 0,6 g magenta→weiß bis Lauf-Max) +
    // Carve-Zähler nach Drehung (fett wenn >0). Nur Anzeige, NICHT Rekorde/Stats.
    private func carveLegend(counts: CarveCounts?, gMax: Double) -> some View {
        let c = counts ?? CarveCounts()
        let step = max((gMax - 0.1) / 8.0, 0.02)
        let stops: [Color] = stride(from: 0.1, through: gMax, by: step).map { Color(uiColor: carveColor($0, gMax)) }
        let maxLabel = gMax <= 0.6 ? "0,6" : String(format: "%.1f", gMax).replacingOccurrences(of: ".", with: ",")
        return VStack(alignment: .leading, spacing: 4) {
            LinearGradient(colors: stops.count >= 2 ? stops : [.green, .red], startPoint: .leading, endPoint: .trailing)
                .frame(height: 10).clipShape(Capsule())
            HStack { Text("0,1 g"); Spacer(); Text("\(maxLabel) g") }.font(.caption2).foregroundStyle(.secondary)
            HStack(spacing: 12) { carveCount("90–180°", c.s); carveCount("180–360°", c.m); carveCount(">360°", c.l) }
        }
    }
    @ViewBuilder private func carveCount(_ label: String, _ n: Int) -> some View {
        Text("\(label): \(n)").font(.caption).fontWeight(n > 0 ? .bold : .regular)
            .foregroundStyle(n > 0 ? Color.primary : Color.secondary)
    }

    // Restliches Setup je Session: Stab, Mastlaenge, Shim, Board. "Standard verwenden" = Override
    // loeschen (der Server braucht dafuer ein explizit gesendetes null). Jedes Feld erscheint nur,
    // wenn es etwas zu waehlen gibt. Bewusst vier kleine Teil-Views ([[ios-swift-typecheck-hang]]).
    // Setup wie in der PWA (web/src/components/FoilSelect.tsx): KEINE Labels, alles hintereinander
    // in einer umbrechenden Zeile — genauso wie der Foil-Picker darueber. Und: ein Eintrag erscheint
    // nur, wenn dafuer ueberhaupt ein Wert gesetzt ist. Vorher stand dort der Platzhalter
    // „Standard verwenden" bzw. — weil der Key in Loc.swift fehlte — der rohe Text „setup.inherit".
    //
    // Folge, bewusst: fuer eine Kategorie ohne jeden Wert (auch ohne Profil-Standard) gibt es hier
    // keinen Knopf mehr. Den Standard setzt man im Profil; per Session aendert man, was schon da ist.
    @ViewBuilder private func setupPickers(_ s: SessionDetail) -> some View {
        let cols = [GridItem(.adaptive(minimum: 110), spacing: 12, alignment: .leading)]
        LazyVGrid(columns: cols, alignment: .leading, spacing: 6) {
            if !allStabs.isEmpty, let v = stabValue(s) { stabPicker(s, value: v) }
            if !myMasts.isEmpty, let v = mastValue(s) { mastPicker(s, value: v) }
            if !myShims.isEmpty, let v = shimValue(s) { shimPicker(s, value: v) }
            if !myBoards.isEmpty, let v = boardValue(s) { boardPicker(s, value: v) }
        }
    }

    // Anzeigewert je Kategorie — nil heisst „nichts gesetzt" und damit „nicht anzeigen". Dieselbe
    // Bedingung wie in der PWA (`setup?.stab ? … : Titel`), nur ohne den Titel als Rueckfall.
    private func stabValue(_ s: SessionDetail) -> String? {
        guard let st = s.setup?.stab else { return nil }
        return stabLabel(st)
    }

    private func mastValue(_ s: SessionDetail) -> String? {
        guard let cm = s.setup?.mast_len_cm else { return nil }
        return "\(cm) cm"
    }

    private func shimValue(_ s: SessionDetail) -> String? {
        guard let d = s.setup?.shim_deg else { return nil }
        return fmtShim(d)
    }

    private func boardValue(_ s: SessionDetail) -> String? {
        guard let b = s.setup?.board else { return nil }
        return b.name
    }

    @ViewBuilder private func stabPicker(_ s: SessionDetail, value: String) -> some View {
        Menu {
            Button(Loc.t("setup.inherit", lang)) { Task { await applySetup(stab: nil, setStab: true) } }
            // Eigene zuerst, dann der Rest des Katalogs -- wie die Gruppen in FoilSelect.tsx.
            ForEach(quickStabs(s)) { st in
                Button(stabLabel(st)) { Task { await applySetup(stab: st.id, setStab: true) } }
            }
            Divider()
            ForEach(otherStabs(s)) { st in
                Button(stabLabel(st)) { Task { await applySetup(stab: st.id, setStab: true) } }
            }
        } label: { setupChip(value) }
    }

    // Gleiche Falle wie beim Foil: der fuer DIESE Session gesetzte Stab steht mit in der
    // Favoriten-Gruppe (und nicht doppelt im Katalog), damit die Favoriten sichtbar bleiben.
    // Ein geerbter Standard (is_default) ist ohnehin schon in „meine Stabs".
    private func quickStabs(_ s: SessionDetail) -> [StabBrief] {
        let sel: Int? = (s.setup?.stab?.is_default == false) ? s.setup?.stab?.id : nil
        return allStabs.filter { myStabIds.contains($0.id) || $0.id == sel }
    }

    private func otherStabs(_ s: SessionDetail) -> [StabBrief] {
        let ids: Set<Int> = Set(quickStabs(s).map(\.id))
        return allStabs.filter { !ids.contains($0.id) }
    }

    @ViewBuilder private func mastPicker(_ s: SessionDetail, value: String) -> some View {
        Menu {
            Button(Loc.t("setup.inherit", lang)) { Task { await applySetup(mast: nil, setMast: true) } }
            ForEach(myMasts, id: \.self) { m in
                Button("\(m) cm") { Task { await applySetup(mast: m, setMast: true) } }
            }
        } label: { setupChip(value) }
    }

    @ViewBuilder private func shimPicker(_ s: SessionDetail, value: String) -> some View {
        Menu {
            Button(Loc.t("setup.inherit", lang)) { Task { await applySetup(shim: nil, setShim: true) } }
            ForEach(myShims, id: \.self) { v in
                Button(fmtShim(v)) { Task { await applySetup(shim: v, setShim: true) } }
            }
        } label: { setupChip(value) }
    }

    @ViewBuilder private func boardPicker(_ s: SessionDetail, value: String) -> some View {
        Menu {
            Button(Loc.t("setup.inherit", lang)) { Task { await applySetup(board: nil, setBoard: true) } }
            ForEach(myBoards) { b in
                Button(b.name) { Task { await applySetup(board: b.id, setBoard: true) } }
            }
        } label: { setupChip(value) }
    }

    // Sieht aus wie der Foil-Picker: nur der Wert plus Doppel-Chevron, in Akzentfarbe.
    private func setupChip(_ value: String) -> some View {
        HStack(spacing: 3) {
            Text(value).font(.callout).lineLimit(1)
            Image(systemName: "chevron.up.chevron.down").font(.caption2)
        }
        .foregroundStyle(Color.accentColor)
    }

    private func stabLabel(_ st: StabBrief?) -> String {
        guard let st else { return "" }
        return "\(st.brand) \(st.model) \(st.size)".trimmingCharacters(in: .whitespaces)
    }

    /// Shim-Anzeige: 0 bleibt "0 Grad", positive Werte mit Vorzeichen, Dezimale nur wenn noetig.
    private func fmtShim(_ v: Double?) -> String {
        guard let v else { return "—" }
        let txt = v == v.rounded() ? String(Int(v)) : String(v)
        // Ternary + zwei Verkettungen in einem Ausdruck -> in Schritte zerlegt (Type-Checker).
        let vorzeichen: String = v > 0 ? "+" : ""
        return vorzeichen + txt + "°"
    }

    private func applySetup(
        stab: Int? = nil, setStab: Bool = false,
        mast: Int? = nil, setMast: Bool = false,
        shim: Double? = nil, setShim: Bool = false,
        board: Int? = nil, setBoard: Bool = false
    ) async {
        try? await Api.setSessionSetup(sid, stabId: stab, setStab: setStab, mastLenCm: mast, setMast: setMast,
                                      shimDeg: shim, setShim: setShim, boardId: board, setBoard: setBoard)
        await load()
    }

    // Sportart-Klassifikation, Besitzer-Sicht (docs/sport-classification.md). Aufbau wie in der PWA
    // (ClassificationPanel): amber Kasten, solange eine Bitte offen ist ODER die Maschine geurteilt
    // hat (sport_auto) — der Nutzer soll wissen, dass eine Maschine das war und dass er sie mit
    // einem Tipp überstimmen kann. Zurueck auf "Pumpfoil" geht bei menschlichen Meldungen NUR ueber
    // den Widerspruch -- der Server lehnt das direkte Zuruecksetzen mit 409 ab; beim reinen
    // Maschinen-Urteil laesst der Server die direkte Wahl zu (kein Widerspruch noetig).
    // Bewusst in kleine Teil-Views zerlegt ([[ios-swift-typecheck-hang]]).
    // Nur der HINWEIS „bitte einordnen" (samt Widerspruch) bleibt oben — als Aufforderung waere er
    // unten wirkungslos.
    @ViewBuilder private func classificationNotice(_ s: SessionDetail) -> some View {
        if s.needs_classification == true || s.sport_auto != nil {
            appealBox(s).padding(.vertical, 4)
        }
    }

    // Kopfzeile des Kastens: Maschinen-Urteil erklaeren (offen -> Bitte, sonst „eingeordnet als X"),
    // ohne Maschinen-Urteil die allgemeine Besitzer-Bitte. Vorab gebauter String (Type-Checker).
    private func classNoticeText(_ s: SessionDetail) -> String {
        guard s.sport_auto != nil else { return Loc.t("cls.ownerAsk", lang) }
        if s.needs_classification == true { return Loc.t("cls.autoAsk", lang) }
        let sport: String = Loc.t("cls.sport.\(s.sport_class ?? "other")", lang)
        return Loc.t("cls.autoSetAs", lang).replacingOccurrences(of: "{sport}", with: sport)
    }

    // Begruendungszeile aus den MESSWERTEN, lokalisiert IN DER APP gebaut — das Server-Feld `grund`
    // ist deutscher Admin-Klartext und wird nie angezeigt (deshalb auch nicht dekodiert, Models.swift).
    private func classWhyText(_ s: SessionDetail) -> String? {
        guard let m = s.sport_auto?.merkmale else { return nil }
        let dur: String = String(Int((m.laengster_lauf_s ?? 0).rounded()))
        let kmh: String = String(format: "%.1f", m.tempo_median_kmh ?? 0)
        if let hr = m.puls_antwort_bpm {
            let hrTxt: String = (hr > 0 ? "+" : "") + String(Int(hr.rounded()))
            return Loc.t("cls.autoWhyPulse", lang)
                .replacingOccurrences(of: "{dur}", with: dur)
                .replacingOccurrences(of: "{kmh}", with: kmh)
                .replacingOccurrences(of: "{hr}", with: hrTxt)
        }
        return Loc.t("cls.autoWhy", lang)
            .replacingOccurrences(of: "{dur}", with: dur)
            .replacingOccurrences(of: "{kmh}", with: kmh)
    }

    // Die beiden ANPASSUNGEN (Sportart, Datenqualitaet) sitzen ganz unten: selten gebraucht, und das
    // Label darueber nahm nur Platz (Jan, 29.07.). Ohne Label, umbrechend wie die Setup-Zeile.
    @ViewBuilder private func classificationPickers(_ s: SessionDetail) -> some View {
        let cols = [GridItem(.adaptive(minimum: 130), spacing: 12, alignment: .leading)]
        LazyVGrid(columns: cols, alignment: .leading, spacing: 6) {
            classPicker(current: s.sport_class ?? "pumpfoil", options: SPORTS, prefix: "cls.sport.") { v in
                Task { await applyClass(sport: v) }
            }
            classPicker(current: s.data_quality ?? "ok", options: DATA_QUALITY, prefix: "cls.dq.") { v in
                Task { await applyClass(dq: v) }
            }
        }
        if let e = classErr { Text(e).font(.callout).foregroundStyle(.red) }
    }

    @ViewBuilder private func appealBox(_ s: SessionDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(classNoticeText(s)).font(.callout)
            if let why = classWhyText(s) {
                Text(why).font(.callout).foregroundStyle(.secondary)
            }
            // Zum Umstellen dieselben Auswahlfelder wie unten in der Aktionszeile (wie die PWA,
            // die den Picker ebenfalls im Kasten UND unten zeigt).
            classificationPickers(s)
            appealControls(s)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Widerspruch geht an den Admin und ist NUR noetig, wenn ein MENSCH gemeldet hat. Beim reinen
    // Maschinen-Urteil (sport_auto ohne flag_count) waehlt der Besitzer einfach „Pumpfoil" — der
    // Server laesst das direkt zu; der Umweg wuerde nur Jans Warteschlange fuellen (wie PWA).
    @ViewBuilder private func appealControls(_ s: SessionDetail) -> some View {
        if s.sport_auto == nil || (s.flag_count ?? 0) > 0 {
            if s.appeal_text != nil {
                Text(Loc.t("cls.appealPending", lang)).font(.callout).fontWeight(.semibold)
            } else if appealOpen {
                TextField(Loc.t("cls.appealPlaceholder", lang), text: $appealDraft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button(Loc.t("cls.appealSend", lang)) {
                    Task {
                        do {
                            try await Api.appealClassification(sid, text: appealDraft)
                            appealOpen = false
                            await load()
                        } catch { classErr = Loc.t("cls.pickErr", lang) }
                    }
                }
                .buttonStyle(.borderedProminent)
            } else {
                Button(Loc.t("cls.wasPumpfoil", lang)) { appealOpen = true }
            }
        }
    }

    @ViewBuilder private func classPicker(
        current: String, options: [String], prefix: String, onPick: @escaping (String) -> Void
    ) -> some View {
        Menu {
            ForEach(options, id: \.self) { o in
                Button(Loc.t(prefix + o, lang)) { onPick(o) }
            }
        } label: {
            HStack(spacing: 4) {
                Text(Loc.t(prefix + current, lang)).lineLimit(1)
                Image(systemName: "chevron.down").font(.caption2)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Color.secondary.opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func applyClass(sport: String? = nil, dq: String? = nil) async {
        do {
            try await Api.setClassification(sid, sport: sport, dataQuality: dq)
            classErr = nil
            await load()
        } catch { classErr = Loc.t("cls.pickErr", lang) }
    }

    @ViewBuilder private func foilPicker(_ s: SessionDetail) -> some View {
        if s.owned == true && !allFoils.isEmpty {
            // Dropdown wie die PWA (<select>): Standard-Foil + Meine Foils + Alle Marken;
            // .menu zeigt nur den gewählten Foil (nicht alle auf einmal).
            Picker(Loc.t("sd.foilOfSession", lang), selection: $selectedFoilId) {
                Text(Loc.t("foil.useDefault", lang)).tag(0)
                ForEach(quickFoils) { f in
                    Text("\(f.brand) \(f.model) \(f.size)").tag(f.id)
                }
                ForEach(otherFoils) { f in
                    Text("\(f.brand) \(f.model) \(f.size)").tag(f.id)
                }
            }
            .pickerStyle(.menu)
        }
    }

    // Nutzerbefund (PWA, FoilSelect.tsx): „Wechsel von Sirus XXL auf Sirus XL — man muss nach oben
    // scrollen, obwohl der XL auch in den Favoriten ist." Ursache: die Auswahl klappt beim
    // GEWÄHLTEN Eintrag auf; steht der im langen Katalog-Block, liegen die Favoriten außerhalb des
    // Sichtfelds. Deshalb das gewählte Foil MIT in die Favoriten-Gruppe — und aus dem Katalog
    // lassen, damit es nicht doppelt erscheint.
    private var quickFoils: [Foil] {
        let sel: Int = selectedFoilId
        return allFoils.filter { mineIds.contains($0.id) || $0.id == sel }
    }

    private var otherFoils: [Foil] {
        let ids: Set<Int> = Set(quickFoils.map(\.id))
        return allFoils.filter { !ids.contains($0.id) }
    }

    @ViewBuilder private func statsSection(_ s: SessionDetail) -> some View {
        if let a = s.analysis {
            let stats = buildStats(a)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(stats) { st in
                    StatTile(item: st, selected: st.runIdx != nil && st.runIdx == selectedRun) {
                        if let r = st.runIdx { selectedRun = (selectedRun == r) ? nil : r }
                    }
                }
            }
            excludedSection(s)
            poweredSection(s)
            excludeErrorRow
            if let segs = a.segments, !segs.isEmpty {
                runsTable(segs, s)
            }
        } else {
            Text(Loc.t("sd.analyzing", lang)).foregroundStyle(.secondary)
        }
    }

    private func runsTable(_ segs: [Segment], _ s: SessionDetail) -> some View {
        RunsTable(segments: segs, selected: selectedRun, lang: lang,
                  canEdit: s.owned == true, busy: excludeBusy,
                  onExclude: { askExcludeRun($0) },
                  onSelect: { selectedRun = (selectedRun == $0) ? nil : $0 })
    }

    @ViewBuilder private var excludeErrorRow: some View {
        if let e = excludeErr {
            Text(e).font(.body).foregroundStyle(.red)
        }
    }

    // Aussortierte Zeitfenster (excluded_ranges): Hinweis + je Fenster „wieder aufnehmen".
    // Auch bei 0 Läufen zeigen (es können alle aussortiert sein) — genau wie in der PWA.
    @ViewBuilder private func excludedSection(_ s: SessionDetail) -> some View {
        let wins: [[Int]] = s.excluded_ranges ?? []
        if !wins.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                excludedHeader(wins.count)
                Text(Loc.t("sd.excludedHint", lang)).font(.body).foregroundStyle(.secondary)
                ForEach(Array(wins.enumerated()), id: \.offset) { i, w in
                    excludedRow(s, index: i, window: w)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.orange.opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func excludedHeader(_ n: Int) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "nosign").foregroundStyle(amber)
            Text(excludedTitleText(n)).font(.body).bold().foregroundStyle(amber)
        }
    }

    private func excludedTitleText(_ n: Int) -> String {
        if n == 1 { return Loc.t("sd.excludedTitleOne", lang) }
        return Loc.t("sd.excludedTitle", lang).replacingOccurrences(of: "{n}", with: "\(n)")
    }

    @ViewBuilder private func excludedRow(_ s: SessionDetail, index: Int, window: [Int]) -> some View {
        HStack(spacing: 10) {
            Text(excludedRangeText(s, window)).font(.body).monospacedDigit()
            Spacer()
            if s.owned == true {
                Button(Loc.t("sd.includeRun", lang)) { includeExcludedRange(index) }
                    .font(.body)
                    .buttonStyle(.bordered)
                    .disabled(excludeBusy)
            }
        }
    }

    /// „09:42:31 · 1:20" — Uhrzeit des Fenster-Starts (Spot-Ortszeit) + Länge des Fensters.
    private func excludedRangeText(_ s: SessionDetail, _ w: [Int]) -> String {
        guard w.count >= 2, let start = s.startedDate else { return "–" }
        let from: Double = Double(w[0]) / 1000.0
        let to: Double = Double(w[1]) / 1000.0
        let clock: String = hhmmss(start.addingTimeInterval(from), s.tz)
        let len: String = mmss(max(0, to - from))
        return "\(clock) · \(len)"
    }

    private func hhmmss(_ d: Date, _ tz: String?) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        f.timeZone = TimeFmt.zone(tz)
        return f.string(from: d)
    }

    // Fremdkraft-Vorschläge der Erkennung v2: abgetrennte Läufe (Boot/Auto/Motor-Verdacht) mit
    // Grund und Ein-Tipp-Rückholung — Vorschlag, keine stille Löschung. Für ALLE sichtbar
    // (Transparenz, warum die Zahlen so sind), Knöpfe nur beim Besitzer. Wie PWA (RunsTable).
    @ViewBuilder private func poweredSection(_ s: SessionDetail) -> some View {
        let runs: [PoweredRun] = s.analysis?.metrics?.fremdkraft_laeufe ?? []
        let kept: [[Int]] = s.fremdkraft_keep ?? []
        if !runs.isEmpty || !kept.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                poweredHeader
                if !runs.isEmpty {
                    Text(Loc.t("v2.sepIntro", lang)).font(.body).foregroundStyle(.secondary)
                }
                ForEach(Array(runs.enumerated()), id: \.offset) { _, r in
                    poweredRow(s, run: r)
                }
                ForEach(Array(kept.enumerated()), id: \.offset) { _, w in
                    keptRow(s, window: w)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.blue.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var poweredHeader: some View {
        HStack(spacing: 6) {
            Image(systemName: "nosign").foregroundStyle(sky)
            Text(Loc.t("v2.sepTitle", lang)).font(.body).bold().foregroundStyle(sky)
        }
    }

    // Ein Vorschlag: Uhrzeit (Spot-Ortszeit) + lokalisierte Begründung, darunter der Rückhol-Knopf.
    @ViewBuilder private func poweredRow(_ s: SessionDetail, run r: PoweredRun) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(poweredRowText(s, r)).font(.body)
            if s.owned == true {
                Button(Loc.t("v2.keep", lang)) {
                    keepPoweredRun(startMs: r.t_start_ms ?? 0, endMs: r.t_end_ms ?? 0, keep: true)
                }
                .font(.body)
                .buttonStyle(.borderedProminent)
                .disabled(excludeBusy)
            }
        }
    }

    private func poweredRowText(_ s: SessionDetail, _ r: PoweredRun) -> String {
        let clock: String = poweredClock(s, r.t_start_ms)
        let why: String = poweredWhyText(r)
        return clock + " · " + why
    }

    private func poweredClock(_ s: SessionDetail, _ ms: Int?) -> String {
        guard let ms, let start = s.startedDate else { return "–" }
        return hhmmss(start.addingTimeInterval(Double(ms) / 1000.0), s.tz)
    }

    // Begründung lokalisiert aus den MESSWERTEN gebaut — metrics.grund ist deutscher Admin-Klartext
    // und wird nie angezeigt (wie PWA poweredWhy).
    private func poweredWhyText(_ r: PoweredRun) -> String {
        let dur: String = String(Int((r.dauer_s ?? 0).rounded()))
        let kmh: String = String(format: "%.1f", r.kmh ?? 0)
        if let hr = r.puls_antwort_bpm {
            let hrTxt: String = (hr > 0 ? "+" : "") + String(Int(hr.rounded()))
            return Loc.t("v2.sepWhyPulse", lang)
                .replacingOccurrences(of: "{dur}", with: dur)
                .replacingOccurrences(of: "{kmh}", with: kmh)
                .replacingOccurrences(of: "{hr}", with: hrTxt)
        }
        return Loc.t("v2.sepWhy", lang)
            .replacingOccurrences(of: "{dur}", with: dur)
            .replacingOccurrences(of: "{kmh}", with: kmh)
    }

    // Zurückgeholtes Fenster: Uhrzeit + Länge + Label, daneben „wieder abtrennen" (nur Besitzer).
    @ViewBuilder private func keptRow(_ s: SessionDetail, window w: [Int]) -> some View {
        HStack(spacing: 10) {
            Text(keptRowText(s, w)).font(.body).monospacedDigit()
            Spacer()
            if s.owned == true, w.count >= 2 {
                Button(Loc.t("v2.unkeep", lang)) {
                    keepPoweredRun(startMs: w[0], endMs: w[1], keep: false)
                }
                .font(.body)
                .buttonStyle(.bordered)
                .disabled(excludeBusy)
            }
        }
    }

    private func keptRowText(_ s: SessionDetail, _ w: [Int]) -> String {
        // excludedRangeText liefert dasselbe Format „09:42:31 · 1:20" — gleiche Fenster-Basis.
        excludedRangeText(s, w) + " · " + Loc.t("v2.keptLabel", lang)
    }

    // Zurückholen/wieder abtrennen: Antwort ist wie bei exclude/include die KOMPLETTE Session mit
    // frischer Analyse -> direkt übernehmen (applyExcludeResult), gleiche Sperre/Fehleranzeige.
    private func keepPoweredRun(startMs: Int, endMs: Int, keep: Bool) {
        guard endMs > startMs else { return }
        excludeBusy = true
        Task {
            do {
                let fresh = try await Api.keepPoweredRun(sid, startMs: startMs, endMs: endMs, keep: keep)
                await applyExcludeResult(fresh)
            } catch {
                await showExcludeError(error)
            }
        }
    }

    // Zusammenführung wieder auflösen (nur Besitzer, ganz am Ende).
    @ViewBuilder private func unmergeRow(_ s: SessionDetail) -> some View {
        if s.owned == true, (s.merged_count ?? 0) > 0 {
            HStack {
                Text(Loc.t("merge.mergedFrom", lang)).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button(Loc.t("merge.unmerge", lang), role: .destructive) {
                    Task { try? await Api.unmergeSession(sid); await load() }
                }.font(.caption)
            }
        }
    }

    private func dateText(_ s: SessionDetail) -> String {
        TimeFmt.dateTime(s.started_at, s.tz) ?? s.started_at
    }

    // Start–End-Zeit ("08:13 – 09:45 Uhr · Dauer 1:32"); Endzeit ggf. serverseitig aus GPS.
    // Uhrzeiten in Spot-Ortszeit (s.tz); die Dauer ist eine Differenz und bleibt tz-frei.
    private func timeRangeText(_ s: SessionDetail) -> String? {
        guard let a = s.startedDate else { return nil }
        let f = DateFormatter(); f.dateFormat = "HH:mm"; f.timeZone = TimeFmt.zone(s.tz)
        let oc = Loc.t("sessions.oclock", lang)
        let ocSuffix = oc.isEmpty ? "" : " \(oc)"
        if let b = s.endedDate, b > a {
            let dur = Int(b.timeIntervalSince(a))
            let durS = dur >= 3600
                ? String(format: "%d:%02d:%02d", dur / 3600, (dur % 3600) / 60, dur % 60)
                : String(format: "%d:%02d", dur / 60, dur % 60)
            return "\(f.string(from: a)) – \(f.string(from: b))\(ocSuffix) · \(Loc.t("sd.duration", lang)) \(durS)"
        }
        return "\(f.string(from: a))\(ocSuffix)"
    }

    private func buildStats(_ a: Analysis) -> [StatItem] {
        let segs = a.segments ?? []
        let m = a.metrics
        func dist(_ x: Double) -> String { x < 1000 ? "\(Int(x)) m" : String(format: "%.2f km", x / 1000) }
        func mmssD(_ x: Double) -> String { String(format: "%d:%02d", Int(x) / 60, Int(x) % 60) }
        // Rekord-Läufe -> anklickbare Kacheln (Lauf auswählen).
        let bestSpeedIdx = segs.indices.max { (segs[$0].max_speed_mps ?? 0) < (segs[$1].max_speed_mps ?? 0) }
        let longestRunIdx = segs.indices.max { (segs[$0].duration_s ?? 0) < (segs[$1].duration_s ?? 0) }
        let farthestRunIdx = segs.indices.max { (segs[$0].distance_m ?? 0) < (segs[$1].distance_m ?? 0) }
        let bestGlideIdx = segs.indices.max { (segs[$0].longest_glide_s ?? 0) < (segs[$1].longest_glide_s ?? 0) }

        var out: [StatItem] = []
        if let v = a.total_distance_m { out.append(StatItem(Loc.t("compare.distance", lang), dist(v))) }
        if let v = a.foiling_distance_m { out.append(StatItem(Loc.t("home.foiling", lang), dist(v))) }
        if let v = a.foiling_time_s { out.append(StatItem(Loc.t("compare.foilTime", lang), mmssD(v))) }
        if !segs.isEmpty { out.append(StatItem(Loc.t("home.runs", lang), "\(segs.count)")) }
        if let v = m?.avg_speed_mps { out.append(StatItem(Loc.t("sd.avgSpeed", lang), String(format: "%.1f km/h", v * 3.6))) }
        if let v = a.max_speed_mps { out.append(StatItem(Loc.t("home.topSpeed", lang), String(format: "%.1f km/h", v * 3.6), runIdx: bestSpeedIdx)) }
        if let pc = a.pump_count {
            out.append(StatItem(Loc.t("home.pumps", lang), "\(pc)"))
            if pc > 0, let fd = a.foiling_distance_m { out.append(StatItem(Loc.t("sd.avgDistPerPump", lang), String(format: "%.1f m", fd / Double(pc)))) }
        }
        if let v = m?.avg_pump_hz ?? a.avg_cadence_hz { out.append(StatItem(Loc.t("sd.avgPump", lang), PumpUnit.fmt(v, lang))) }
        if let v = m?.avg_hr, v > 0 { out.append(StatItem(Loc.t("sd.avgHr", lang), String(format: "%.0f", v))) }
        if let v = m?.max_hr, v > 0 { out.append(StatItem(Loc.t("sd.maxHr", lang), String(format: "%.0f", v))) }
        if let i = longestRunIdx, let v = segs[i].duration_s { out.append(StatItem(Loc.t("home.longestRun", lang), mmssD(v), runIdx: i)) }
        if let i = farthestRunIdx, let v = segs[i].distance_m { out.append(StatItem(Loc.t("home.farthestRun", lang), dist(v), runIdx: i)) }
        if let i = bestGlideIdx, let v = segs[i].longest_glide_s, v > 0 { out.append(StatItem(Loc.t("home.longestGlide", lang), String(format: "%.1f s", v), runIdx: i)) }
        return out
    }

    private func load() async {
        loading = true; defer { loading = false }
        // Cache-Treffer (data_version stimmt) -> Detail aus dem Disk-Cache, kein Netz-Fetch.
        let cached = session == nil ? SessionCache.load(id: sid, expectedVersion: shownId == nil ? dataVersion : nil) : nil
        do {
            let s: SessionDetail
            if let cached {
                s = cached
            } else {
                s = try await Api.session(sid)
                SessionCache.store(s)
            }
            session = s
            carve = try? await Api.sessionCarves(sid)   // Carve-Bögen (nur Anzeige)
            neighbors = try? await Api.sessionNeighbors(sid)
            liked = s.liked ?? false
            likeCount = s.like_count ?? 0
            caption = s.caption ?? ""
            selectedFoilId = s.foil?.id ?? 0
            photos = (try? await Api.sessionPhotos(sid)) ?? []
            videos = await loadVideos(s)
            let settings = (try? await Api.settings()) ?? [:]
            weightKg = (settings["weight_kg"] as? Int).map(Double.init) ?? 0
            if s.owned == true {
                mineIds = Set((settings["my_foils"] as? [Any])?.compactMap { $0 as? Int } ?? [])
                allFoils = (try? await Api.foils()) ?? []
                myStabIds = Set((settings["my_stabs"] as? [Any])?.compactMap { $0 as? Int } ?? [])
                myMasts = (settings["my_masts"] as? [Any])?.compactMap { $0 as? Int } ?? []
                myShims = (settings["my_shims"] as? [Any])?.compactMap { v -> Double? in
                    if let d = v as? Double { return d }
                    if let i = v as? Int { return Double(i) }
                    return nil
                } ?? []
                allStabs = (try? await Api.stabs()) ?? []
                myBoards = (try? await Api.boards()) ?? []
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// Melde-Knöpfe für FREMDE Sessions — an derselben Stelle, an der bei eigenen Sessions die
// Klassifikations-Felder stehen (wie web/src/pages/SessionDetail.tsx). Reihenfolge nach Schwere,
// mildestes zuerst: „nicht Pumpfoil" ist nur eine Bitte um Zuordnung, „wirkt unecht" zweifelt die
// Daten an, „unangemessen" ist die Beschwerde. Waren vorher in einem Toolbar-Menü versteckt.
private struct SessionReportRow: View {
    let sessionId: Int
    let lang: String
    @Environment(\.colorScheme) private var scheme
    @State private var votes: Api.VoteState?
    @State private var flagDone = false
    @State private var askNotPumpfoil = false
    @State private var askInappropriate = false

    // Beide Farben in Hell UND Dunkel lesbar (gleiche Werte wie Android: 92400E/FDE68A, B91C1C/FCA5A5).
    private var amber: Color {
        scheme == .dark ? Color(red: 0.992, green: 0.902, blue: 0.541) : Color(red: 0.573, green: 0.251, blue: 0.055)
    }
    private var red: Color {
        scheme == .dark ? Color(red: 0.988, green: 0.647, blue: 0.647) : Color(red: 0.725, green: 0.110, blue: 0.110)
    }
    private var fakeOn: Bool { votes?.my_fake == true }
    private var inappOn: Bool { votes?.my_inappropriate == true }
    private var fakeCount: Int { votes?.fake_count ?? 0 }
    private var inappCount: Int { votes?.inappropriate_count ?? 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            firstRow
            HStack(spacing: 8) {
                fakeButton
                inappButton
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, 4)
        .task { votes = try? await Api.sessionVotes(sessionId) }
        .confirmationDialog(Loc.t("cls.notPumpfoil", lang), isPresented: $askNotPumpfoil, titleVisibility: .visible) {
            Button(Loc.t("sd.report", lang)) { sendNotPumpfoil() }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        } message: { Text(Loc.t("cls.confirmFlag", lang)) }
        .confirmationDialog(Loc.t("vote.reportConfirm", lang), isPresented: $askInappropriate, titleVisibility: .visible) {
            Button(Loc.t("sd.report", lang), role: .destructive) { toggleVote("inappropriate") }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        }
    }

    // Erste Zeile: „nicht Pumpfoil" bzw. nach dem Melden nur noch der Dank.
    @ViewBuilder private var firstRow: some View {
        if flagDone {
            Text(Loc.t("cls.thanks", lang)).font(.subheadline).foregroundStyle(.secondary)
        } else {
            Button { askNotPumpfoil = true } label: {
                pill(Loc.t("cls.notPumpfoil", lang), icon: "questionmark.circle",
                     iconColor: Color.accentColor, active: false, tint: Color.secondary, count: 0)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var fakeButton: some View {
        Button { toggleVote("fake") } label: {
            pill(Loc.t("sd.fake", lang), icon: "flag", iconColor: amber,
                 active: fakeOn, tint: amber, count: fakeCount)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var inappButton: some View {
        Button {
            // Vor dem Melden fragen — beim Zurückziehen der eigenen Meldung nicht.
            if inappOn { toggleVote("inappropriate") } else { askInappropriate = true }
        } label: {
            pill(inappOn ? Loc.t("sd.reported", lang) : Loc.t("sd.inappropriate", lang),
                 icon: "exclamationmark.octagon", iconColor: red,
                 active: inappOn, tint: red, count: inappCount)
        }
        .buttonStyle(.plain)
    }

    // Ein Melde-Knopf. Farben/Größen als explizit typisierte Konstanten (Type-Checker).
    @ViewBuilder private func pill(_ text: String, icon: String, iconColor: Color,
                                   active: Bool, tint: Color, count: Int) -> some View {
        let fg: Color = active ? tint : Color.secondary
        let bg: Color = active ? tint.opacity(0.18) : Color.secondary.opacity(0.15)
        let r: CGFloat = 8
        HStack(spacing: 5) {
            Image(systemName: icon).font(.caption).foregroundStyle(iconColor)
            Text(text)
            if count > 0 { Text("\(count)").monospacedDigit() }
        }
        .font(.subheadline)
        .foregroundStyle(fg)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: r))
    }

    // Bewusst OHNE Rückmeldung, ob die Meldung „gezählt" hat (wie PWA): sonst wird das Nachzählen
    // zum Spiel. Der Knopf weicht einfach dem Dank.
    private func sendNotPumpfoil() {
        flagDone = true
        Task { try? await Api.flagNotPumpfoil(sessionId) }
    }

    // Fehler lassen den bisherigen Stand stehen (nicht auf nil zurückfallen).
    private func toggleVote(_ kind: String) {
        Task {
            if let v = try? await Api.vote(sessionId, kind: kind) { votes = v }
        }
    }
}

enum TrackColorMode { case speed, hr, pump, turns }

// Kurvenlage-g -> Farbe (wie Web/turns.ts). Untere Hälfte fix (grün 0,1 → gelb 0,35 → rot 0,6),
// darüber bis gMax (gedeckelt 1,0) rot → magenta → weiß. g<=0.02 = kein Carve (grau).
func carveColor(_ g: Double, _ gMax: Double) -> UIColor {
    if g <= 0.02 { return .systemGray }
    let top = max(0.6, gMax)
    let gc = min(max(g, 0.1), top)
    func lerp(_ a: (Double, Double, Double), _ b: (Double, Double, Double), _ t: Double) -> UIColor {
        let tt = CGFloat(min(max(t, 0), 1))
        return UIColor(red: CGFloat(a.0) + (CGFloat(b.0) - CGFloat(a.0)) * tt,
                       green: CGFloat(a.1) + (CGFloat(b.1) - CGFloat(a.1)) * tt,
                       blue: CGFloat(a.2) + (CGFloat(b.2) - CGFloat(a.2)) * tt, alpha: 1)
    }
    let green = (0.133, 0.773, 0.369), yellow = (0.918, 0.702, 0.031), red = (0.863, 0.149, 0.149)
    let magenta = (0.851, 0.275, 0.937), white = (1.0, 1.0, 1.0)
    if gc <= 0.35 { return lerp(green, yellow, (gc - 0.1) / 0.25) }
    if gc <= 0.6 { return lerp(yellow, red, (gc - 0.35) / 0.25) }
    let f = (gc - 0.6) / (top - 0.6)
    return f <= 0.5 ? lerp(red, magenta, f / 0.5) : lerp(magenta, white, (f - 0.5) / 0.5)
}

// Wert -> Farbe (blau niedrig -> rot hoch).
private func uiRampColor(_ t: Double) -> UIColor {
    let tt = min(max(t, 0), 1)
    return UIColor(hue: (1 - tt) * 240 / 360, saturation: 0.85, brightness: 0.95, alpha: 1)
}
// Speed -> Farbe (8..25 km/h), wie Web/Wear/Android.
private func uiSpeedColor(_ kmh: Double) -> UIColor { uiRampColor((kmh - 8) / (25 - 8)) }

// Annotation für einen Pump-Stoß (weißer Punkt auf dem Track).
private class PumpDot: NSObject, MKAnnotation { let coordinate: CLLocationCoordinate2D
    init(_ c: CLLocationCoordinate2D) { coordinate = c } }

// Track auf MapKit-Karte: nur die Foiling-Läufe (segments[].i_start..i_end), je Punktpaar
// nach Modus (Speed/Puls/Pump) gefärbt; Nicht-Foiling unsichtbar; optional weiße Pump-Marker.
// iOS-16-tauglich über MKMapView (neue SwiftUI-Map-Polyline-API erst ab iOS 17).
struct TrackMap: UIViewRepresentable {
    let points: [[Double]]      // [lon,lat]
    let speedsMps: [Double]
    let hr: [Int?]
    let pumpHz: [Double?]
    let segments: [Segment]
    let mode: TrackColorMode
    let hrRange: (Int, Int)
    let pumpRange: (Double, Double)
    let showPumps: Bool
    let selectedRun: Int?
    let onSelectRun: (Int) -> Void
    var carveArcs: [[[Double]]] = []   // je Carve Punkte [lat,lon,g] — nur im TURNS-Modus
    var carveGMax: Double = 0.6
    private let maxGapM = 30.0

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.showsScale = true   // dezente Maßstabsleiste (erscheint beim Zoomen), wie Web-Karte (#15)
        map.delegate = context.coordinator
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        map.addGestureRecognizer(tap)
        return map
    }

    private func colorAt(_ i: Int) -> UIColor {
        switch mode {
        case .speed:
            return uiSpeedColor((speedsMps.indices.contains(i) ? speedsMps[i] : 0) * 3.6)
        case .hr:
            guard let v = (hr.indices.contains(i) ? hr[i] : nil), v > 0 else { return .systemGray }
            return uiRampColor(Double(v - hrRange.0) / Double(max(hrRange.1 - hrRange.0, 1)))
        case .pump:
            guard let v = (pumpHz.indices.contains(i) ? pumpHz[i] : nil) else { return .systemGray }
            return uiRampColor((v - pumpRange.0) / max(pumpRange.1 - pumpRange.0, 1e-6))
        case .turns:
            return .systemGray   // Basis-Track grau; die Carve-Bögen kommen farbig darüber
        }
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        map.removeOverlays(map.overlays)
        map.removeAnnotations(map.annotations)
        let co = context.coordinator
        co.colors.removeAll(); co.widths.removeAll()
        co.points = points; co.segments = segments; co.onSelectRun = onSelectRun
        var all: [CLLocationCoordinate2D] = []
        var sel: [CLLocationCoordinate2D] = []
        for (runIdx, seg) in segments.enumerated() {
            let dim = selectedRun != nil && runIdx != selectedRun   // anderer Lauf -> ausgegraut
            let lo = max(0, min(seg.i_start, points.count - 1))
            let hi = max(0, min(seg.i_end, points.count - 1))
            var i = lo
            while i < hi {
                let a = points[i], b = points[i + 1]
                let ca = CLLocationCoordinate2D(latitude: a[1], longitude: a[0])
                let cb = CLLocationCoordinate2D(latitude: b[1], longitude: b[0])
                let gap = CLLocation(latitude: ca.latitude, longitude: ca.longitude)
                    .distance(from: CLLocation(latitude: cb.latitude, longitude: cb.longitude))
                if gap <= maxGapM {
                    let pl = MKPolyline(coordinates: [ca, cb], count: 2)
                    co.colors[ObjectIdentifier(pl)] = dim ? UIColor.systemGray.withAlphaComponent(0.5) : colorAt(i + 1)
                    co.widths[ObjectIdentifier(pl)] = dim ? 2.5 : 5
                    map.addOverlay(pl)
                    all.append(ca); all.append(cb)
                    if !dim { sel.append(ca); sel.append(cb) }
                }
                i += 1
            }
            // Pump-Marker nur für den (ggf. ausgewählten) Lauf, nicht für gedimmte.
            if showPumps && !dim {
                for idx in (seg.pump_idx ?? []) where points.indices.contains(idx) {
                    let p = points[idx]
                    map.addAnnotation(PumpDot(CLLocationCoordinate2D(latitude: p[1], longitude: p[0])))
                }
            }
        }
        // Carve-Bögen (feine 25-Hz-Polylinie je Carve) über dem grauen Basis-Track, je Segment
        // nach Kurvenlage-g gefärbt (wie PWA). Nur im TURNS-Modus.
        if mode == .turns {
            for arc in carveArcs {
                var k = 0
                while k < arc.count - 1 {
                    let p0 = arc[k], p1 = arc[k + 1]
                    if p0.count >= 3 && p1.count >= 3 {
                        let c0 = CLLocationCoordinate2D(latitude: p0[0], longitude: p0[1])   // [lat,lon,g]
                        let c1 = CLLocationCoordinate2D(latitude: p1[0], longitude: p1[1])
                        let pl = MKPolyline(coordinates: [c0, c1], count: 2)
                        co.colors[ObjectIdentifier(pl)] = carveColor(p1[2], carveGMax)
                        co.widths[ObjectIdentifier(pl)] = 6
                        map.addOverlay(pl)
                        all.append(c0); all.append(c1)
                    }
                    k += 1
                }
            }
        }
        // Auf den ausgewählten Lauf zoomen, sonst auf alle Foiling-Läufe.
        let fit = (selectedRun != nil && !sel.isEmpty) ? sel : all
        if !fit.isEmpty { map.setRegion(region(fitting: fit), animated: false) }
    }

    // Ausschnitt um die Punkte (13 % Rand, Mindest-Span). Als eigene Methode mit explizit
    // typisierten Zwischenwerten: die Literal-Arithmetik war der teuerste Teil von updateUIView.
    private func region(fitting fit: [CLLocationCoordinate2D]) -> MKCoordinateRegion {
        let lats: [CLLocationDegrees] = fit.map { $0.latitude }
        let lons: [CLLocationDegrees] = fit.map { $0.longitude }
        let latMin: CLLocationDegrees = lats.min() ?? 0, latMax: CLLocationDegrees = lats.max() ?? 0
        let lonMin: CLLocationDegrees = lons.min() ?? 0, lonMax: CLLocationDegrees = lons.max() ?? 0
        let center = CLLocationCoordinate2D(latitude: (latMin + latMax) / 2, longitude: (lonMin + lonMax) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max((latMax - latMin) * 1.3, 0.002),
                                    longitudeDelta: max((lonMax - lonMin) * 1.3, 0.002))
        return MKCoordinateRegion(center: center, span: span)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var colors: [ObjectIdentifier: UIColor] = [:]
        var widths: [ObjectIdentifier: CGFloat] = [:]
        var points: [[Double]] = []
        var segments: [Segment] = []
        var onSelectRun: ((Int) -> Void)?

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let pl = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: pl)
            r.strokeColor = colors[ObjectIdentifier(pl)] ?? .systemBlue
            r.lineWidth = widths[ObjectIdentifier(pl)] ?? 4
            return r
        }
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard annotation is PumpDot else { return nil }
            let id = "pump"
            let v = mapView.dequeueReusableAnnotationView(withIdentifier: id)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: id)
            v.annotation = annotation
            v.frame = CGRect(x: 0, y: 0, width: 9, height: 9)   // sichtbar, aber dezent
            v.backgroundColor = .white
            v.layer.cornerRadius = 4.5
            v.layer.borderColor = UIColor(white: 0.06, alpha: 1).cgColor
            v.layer.borderWidth = 1.5
            v.isEnabled = false
            return v
        }

        // Tipp auf die Karte -> nächstgelegenen Foiling-Lauf auswählen (≤ ~40 m am Bildschirm).
        @objc func handleTap(_ g: UITapGestureRecognizer) {
            guard let map = g.view as? MKMapView, let onSel = onSelectRun else { return }
            let pt = g.location(in: map)
            let coord = map.convert(pt, toCoordinateFrom: map)
            let tapLoc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
            var best: (run: Int, d: CLLocationDistance)?
            for (runIdx, seg) in segments.enumerated() {
                let lo = max(0, min(seg.i_start, points.count - 1))
                let hi = max(0, min(seg.i_end, points.count - 1))
                guard lo <= hi else { continue }
                for i in lo...hi where points.indices.contains(i) {
                    let p = points[i]
                    let d = tapLoc.distance(from: CLLocation(latitude: p[1], longitude: p[0]))
                    if best == nil || d < best!.d { best = (runIdx, d) }
                }
            }
            // Schwelle relativ zur Zoomstufe: 5 % der sichtbaren Breite.
            let span = map.region.span.longitudeDelta
            let threshM = max(40.0, span * 111_000 * 0.05)
            if let b = best, b.d <= threshM { onSel(b.run) }
        }
    }
}

// Leistungs-Karte: theoretische Pump-Leistung (W) bei Ø- und Top-Speed.
private struct PowerCard: View {
    let analysis: Analysis
    let foil: Foil
    let weightKg: Double
    let lang: String

    var body: some View {
        let dims = FoilPhysics.FoilDims(spanCm: foil.span_cm, areaCm2: foil.area_cm2, thicknessMm: foil.thickness_mm)
        let rider = FoilPhysics.RiderParams(riderWeight: weightKg)
        let pump = analysis.avg_cadence_hz.map { FoilPhysics.PumpParams(pumpFreqHz: $0) }
        let avgKmh: Double? = (analysis.foiling_time_s ?? 0) > 0 && analysis.foiling_distance_m != nil
            ? analysis.foiling_distance_m! / analysis.foiling_time_s! * 3.6 : nil
        let topKmh = analysis.max_speed_mps.map { $0 * 3.6 }
        func watt(_ kmh: Double?) -> String {
            guard let kmh else { return "–" }
            return "\(Int(FoilPhysics.computeFoilPowerAtSpeed(foil: dims, speedKmh: kmh, rider: rider, pump: pump).power.rounded())) W"
        }
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(Loc.t("sd.power", lang)) (\(foil.brand) \(foil.model) \(foil.size))")
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 24) {
                VStack(alignment: .leading) {
                    Text(watt(avgKmh)).font(.title3).bold().foregroundStyle(Color.accentColor)
                    Text(Loc.t("sd.atAvg", lang)).font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading) {
                    Text(watt(topKmh)).font(.title3).bold().foregroundStyle(Color.accentColor)
                    Text(Loc.t("sd.atTop", lang)).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// Läufe-Tabelle: je Foiling-Lauf Distanz/Dauer/Ø-/Top-Speed/Pumps. Zeile antippen -> Lauf auswählen
// (Karte zeigt dann nur diesen farbig); ausgewählte Zeile ist hervorgehoben.
private struct RunsTable: View {
    let segments: [Segment]
    let selected: Int?
    let lang: String
    // Eigene Session -> je Zeile ein Knopf „Lauf aussortieren" (wie in der PWA-Lauf-Tabelle).
    var canEdit: Bool = false
    var busy: Bool = false
    var onExclude: ((Int) -> Void)? = nil
    let onSelect: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(Loc.t("home.runs", lang)) (\(segments.count))").font(.caption).foregroundStyle(.secondary)
            HStack {
                ForEach(["#", Loc.t("sd.hDist", lang), Loc.t("field.3", lang), "Ø", "Top", Loc.t("home.pumps", lang)], id: \.self) { h in
                    Text(h).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                }
                if canEdit { Spacer().frame(width: 30) }
            }
            ForEach(Array(segments.enumerated()), id: \.offset) { i, seg in
                let sel = selected == i
                HStack {
                    cell("\(i + 1)", sel)
                    cell(dist(seg.distance_m ?? 0), sel)
                    cell(dur(seg.duration_s ?? 0), sel)
                    cell(String(format: "%.0f", (seg.avg_speed_mps ?? 0) * 3.6), sel)
                    cell(String(format: "%.0f", (seg.max_speed_mps ?? 0) * 3.6), sel)
                    cell((seg.pumps ?? 0) > 0 ? "\(seg.pumps!)" : "–", sel)
                    excludeButton(i)
                }
                .padding(.vertical, 4).padding(.horizontal, 4)
                .background(sel ? Color.accentColor.opacity(0.16) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .contentShape(Rectangle())
                .onTapGesture { onSelect(i) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func cell(_ s: String, _ sel: Bool) -> some View {
        Text(s).font(.caption).foregroundStyle(sel ? Color.accentColor : Color.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Eigene Zelle statt Zeilen-Tap: der Knopf schluckt den Tap, die Zeilen-Auswahl bleibt.
    @ViewBuilder private func excludeButton(_ i: Int) -> some View {
        if canEdit {
            Button { onExclude?(i) } label: {
                Image(systemName: "nosign").font(.footnote).foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .tint(.secondary)   // inaktiv grau (nicht cyan) — der Knopf ist eine Nebenaktion
            .disabled(busy)
            .frame(width: 30)
            .accessibilityLabel(Loc.t("sd.excludeRun", lang))
        }
    }
    private func dist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
    private func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}

// Eine Kennzahl-Kachel; runIdx != nil => an einen Lauf gebunden (antippen -> Lauf auswählen).
struct StatItem: Identifiable {
    let label: String
    let value: String
    let runIdx: Int?
    // Stabil, nicht UUID(): buildStats() laeuft im Body, mit UUID() bekaeme jede Kachel bei jedem
    // Neuzeichnen eine neue Identitaet (dasselbe Muster wie RecRow in CommunityView). Labels sind
    // innerhalb einer Session eindeutig.
    var id: String { label }
    init(_ label: String, _ value: String, runIdx: Int? = nil) {
        self.label = label; self.value = value; self.runIdx = runIdx
    }
}

private struct StatTile: View {
    let item: StatItem
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.value).font(.title3).bold().foregroundStyle(Color.accentColor)
            Text(item.label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(selected ? Color.accentColor.opacity(0.18) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(item.runIdx != nil ? Color.accentColor.opacity(0.35) : .clear, lineWidth: 1))
        .contentShape(Rectangle())
        .onTapGesture { if item.runIdx != nil { onTap() } }
    }
}

// YouTube-Video-ID aus watch?v=, youtu.be/, shorts/, embed/ ziehen (wie web/Android).
func youtubeId(_ url: String?) -> String? {
    guard let url = url, !url.isEmpty else { return nil }
    let patterns = ["[?&]v=([\\w-]{11})", "youtu\\.be/([\\w-]{11})", "shorts/([\\w-]{11})", "embed/([\\w-]{11})"]
    for p in patterns {
        if let r = url.range(of: p, options: .regularExpression) {
            let match = String(url[r])
            if let idr = match.range(of: "[\\w-]{11}$", options: .regularExpression) {
                return String(match[idr])
            }
        }
    }
    return nil
}

// Vollbild-Foto-Ansicht: tippen schließt, bei mehreren Fotos horizontal wischen.
private struct PhotoLightboxView: View {
    let photos: [SessionPhoto]
    let startId: Int
    let onClose: () -> Void
    @State private var sel: Int = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            TabView(selection: $sel) {
                ForEach(photos) { p in
                    AsyncImage(url: Api.mediaURL(p.url)) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit()
                        default: ProgressView()
                        }
                    }
                    .tag(p.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .automatic : .never))
        }
        // Sichtbares Schließen-Steuerelement (X oben rechts) — Tap aufs Bild schliesst zusätzlich.
        .overlay(alignment: .topTrailing) {
            Button { onClose() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(12)
                    .shadow(radius: 4)
            }
        }
        .onTapGesture { onClose() }
        .onAppear { sel = startId }
    }
}
