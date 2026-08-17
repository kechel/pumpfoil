import SwiftUI

// Uhr-Datenseiten konfigurieren. Drei Sätze — während man foilt, während man nicht foilt und bei
// MANUELL pausierter Aufnahme —, je bis zu 8 Seiten. Eine Seite ist entweder eine klassische
// 3-Feld-Seite ODER ein eigenes Layout (nur Verweis auf dessen ID; gestaltet wird es in der PWA).
// Genau so liegt es im Server: ein Eintrag in `pages`/`off_foil_pages`/`pause_pages` ist eine
// Liste (3 Feld-IDs) oder eine Zahl (watch_layouts.id) — settings.py:43-56.
//
// WICHTIG: geschrieben wird `pages`, NICHT `views`. Der Server lässt `views` beim Speichern von
// `pages` ableiten, aber nicht umgekehrt (settings.py:277-280) — eine reine `views`-Speicherung
// würde die gemischte Reihenfolge auf neuen Uhren unverändert lassen und damit wirkungslos bleiben.
//
// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin. Labels via Loc "field.<id>".
// Höhe (10) / Anstieg (13) / Temperatur (11) ausgelassen: Wear/Apple Watch haben keinen Baro-/
// Temp-Sensor und für einen Wassersport sind sie ~konstant/0 -> würden nur „–" zeigen. (Web
// behält sie für Garmin-Nutzer mit Barometer.)
private let FIELD_IDS = [0, 1, 5, 6, 7, 2, 8, 9, 3, 4, 12, 14, 15, 16, 17, 18, 19, 20]

/// Eine Seite: klassische 3-Feld-Seite oder Verweis auf ein eigenes Layout.
enum WatchPage: Equatable {
    case classic([Int])
    case layout(Int)
}

/// Liest einen Seiten-Satz; fällt auf die Alt-Schlüssel zurück, wenn der neue fehlt (bestehende
/// Konten sollen ihre Konfiguration behalten).
func readWatchPages(_ s: [String: Any], key: String, legacyView: String?, legacyLayout: String?) -> [WatchPage] {
    if let arr = s[key] as? [Any] {
        var out: [WatchPage] = []
        for el in arr {
            if let n = el as? Int {
                out.append(.layout(n))
            } else if let row = el as? [Any] {
                out.append(.classic((0..<3).map { (row.indices.contains($0) ? row[$0] as? Int : nil) ?? 0 }))
            }
        }
        if !out.isEmpty { return out }
    }
    if let lk = legacyLayout, let n = s[lk] as? Int { return [.layout(n)] }
    if let lv = legacyView, let of = s[lv] as? [Any], of.count >= 3 {
        return [.classic((0..<3).map { (of[$0] as? Int) ?? 0 })]
    }
    return []
}

func watchPagesPayload(_ pages: [WatchPage]) -> [Any] {
    pages.map { pg -> Any in
        switch pg {
        case .classic(let f): return f
        case .layout(let id): return id
        }
    }
}

struct DataFieldsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var onFoil: [WatchPage] = [.classic([1, 2, 0])]
    @State private var offFoil: [WatchPage] = [.classic([12, 17, 16])]
    @State private var pause: [WatchPage] = [.classic([12, 20, 2])]
    @State private var browseAll = true
    @State private var layoutsEnabled = true
    // Die zwei Uhr-Schalter, die der App bis 17.08. fehlten (PARITY-AUDIT). Beide gehoeren der
    // UHR: colorByValue faerbt Werte auf dem Uhr-Screen nach Hoehe, auto_start startet die
    // Aufnahme, sobald GPS Bewegung sieht. Feldnamen genau wie die PWA sie sendet.
    @State private var colorByValue = false
    @State private var autoStartWatch = true
    @State private var layouts: [WatchLayoutBrief] = []
    @State private var saved = false

    var body: some View {
        Form {
            Section { Text(Loc.t("datafields.intro", lang)).font(.callout).foregroundStyle(.secondary) }
            pageSet(title: nil, footer: nil, pages: $onFoil)
            pageSet(title: Loc.t("account.offFoilTitle", lang),
                    footer: Loc.t("account.offFoilDesc", lang), pages: $offFoil)
            pageSet(title: Loc.t("account.pauseTitle", lang),
                    footer: Loc.t("account.pauseDesc", lang), pages: $pause)
            switchSection
            Section {
                Button(Loc.t("common.save", lang)) { save() }
                if saved { Text(Loc.t("common.saved", lang)).foregroundStyle(.green).font(.callout) }
            }
        }
        .brandToolbar(Loc.t("profile.datafields", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder private var switchSection: some View {
        Section {
            // Reihenfolge wie in der PWA (Account.tsx), damit man sich zwischen Web und App
            // nicht umorientieren muss. Diese zwei haben bewusst keinen Erklaertext — die PWA
            // hat dort auch keinen.
            Toggle(Loc.t("account.colorByValue", lang), isOn: $colorByValue)
                .onChange(of: colorByValue) { _ in saved = false }
            Toggle(Loc.t("account.autoStart", lang), isOn: $autoStartWatch)
                .onChange(of: autoStartWatch) { _ in saved = false }
            Toggle(Loc.t("account.browseAll", lang), isOn: $browseAll)
                .onChange(of: browseAll) { _ in saved = false }
            Text(Loc.t("account.browseAllHint", lang)).font(.callout).foregroundStyle(.secondary)
            Toggle(Loc.t("account.layoutsEnabled", lang), isOn: $layoutsEnabled)
                .onChange(of: layoutsEnabled) { _ in saved = false }
            Text(Loc.t("account.layoutsEnabledHint", lang)).font(.callout).foregroundStyle(.secondary)
        }
    }

    // Ein Seiten-Satz. Klassische Seiten sind bearbeitbar; Layout-Seiten lassen sich einfügen,
    // entfernen und verschieben, gestaltet werden sie nur in der PWA.
    @ViewBuilder private func pageSet(title: String?, footer: String?, pages: Binding<[WatchPage]>) -> some View {
        Section {
            ForEach(pages.wrappedValue.indices, id: \.self) { idx in
                pageRows(pages: pages, idx: idx)
            }
            pageButtons(pages: pages)
        } header: {
            if let title { Text(title) }
        } footer: {
            if let footer { Text(footer) }
        }
    }

    @ViewBuilder private func pageRows(pages: Binding<[WatchPage]>, idx: Int) -> some View {
        let list = pages.wrappedValue
        Text("\(Loc.t("datafields.page", lang)) \(idx + 1)").font(.caption).foregroundStyle(.secondary)
        switch list[idx] {
        case .classic(let fields):
            ForEach(0..<3, id: \.self) { slot in
                Picker("\(Loc.t("datafields.field", lang)) \(slot + 1)",
                       selection: fieldBinding(pages: pages, idx: idx, slot: slot, current: fields)) {
                    ForEach(FIELD_IDS, id: \.self) { id in Text(Loc.t("field.\(id)", lang)).tag(id) }
                }
            }
        case .layout(let lid):
            let name = layouts.first { $0.id == lid }?.name
            Text(name ?? Loc.t("account.layoutMissing", lang))
                .foregroundStyle(name == nil ? Color.red : Color.accentColor)
        }
        pageActions(pages: pages, idx: idx)
    }

    @ViewBuilder private func pageActions(pages: Binding<[WatchPage]>, idx: Int) -> some View {
        HStack(spacing: 16) {
            if idx > 0 {
                Button { move(pages: pages, from: idx, to: idx - 1) } label: { Image(systemName: "arrow.up") }
                    .buttonStyle(.plain)
            }
            if idx < pages.wrappedValue.count - 1 {
                Button { move(pages: pages, from: idx, to: idx + 1) } label: { Image(systemName: "arrow.down") }
                    .buttonStyle(.plain)
            }
            Spacer()
            if pages.wrappedValue.count > 1 {
                Button(role: .destructive) {
                    var l = pages.wrappedValue
                    l.remove(at: idx)
                    pages.wrappedValue = l
                    saved = false
                } label: { Text(Loc.t("datafields.removePage", lang)) }
                    .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private func pageButtons(pages: Binding<[WatchPage]>) -> some View {
        if pages.wrappedValue.count < 8 {
            Button(Loc.t("datafields.addPage", lang)) {
                pages.wrappedValue.append(.classic([0, 0, 0]))
                saved = false
            }
            if !layouts.isEmpty {
                Menu(Loc.t("account.addLayoutPage", lang)) {
                    ForEach(layouts) { l in
                        Button(l.name) {
                            pages.wrappedValue.append(.layout(l.id))
                            saved = false
                        }
                    }
                }
            }
        }
    }

    private func move(pages: Binding<[WatchPage]>, from: Int, to: Int) {
        var l = pages.wrappedValue
        let item = l.remove(at: from)
        l.insert(item, at: to)
        pages.wrappedValue = l
        saved = false
    }

    private func fieldBinding(pages: Binding<[WatchPage]>, idx: Int, slot: Int, current: [Int]) -> Binding<Int> {
        Binding(
            get: { current.indices.contains(slot) ? current[slot] : 0 },
            set: { newVal in
                var fields = current
                while fields.count < 3 { fields.append(0) }
                fields[slot] = newVal
                var l = pages.wrappedValue
                l[idx] = .classic(fields)
                pages.wrappedValue = l
                saved = false
            }
        )
    }

    private func load() async {
        let s = (try? await Api.settings()) ?? [:]
        let on = readWatchPages(s, key: "pages", legacyView: "views", legacyLayout: nil)
        if !on.isEmpty { onFoil = on }
        let off = readWatchPages(s, key: "off_foil_pages", legacyView: "off_foil_view", legacyLayout: "off_foil_layout_id")
        if !off.isEmpty { offFoil = off }
        let pau = readWatchPages(s, key: "pause_pages", legacyView: "pause_view", legacyLayout: "pause_layout_id")
        if !pau.isEmpty { pause = pau }
        browseAll = (s["browse_all_pages"] as? Bool) ?? true
        layoutsEnabled = (s["layouts_enabled"] as? Bool) ?? true
        colorByValue = (s["colorByValue"] as? Bool) ?? false
        autoStartWatch = (s["auto_start"] as? Bool) ?? true
        layouts = (try? await Api.watchLayouts()) ?? []
    }

    private func save() {
        Task {
            try? await Api.saveSettings([
                "pages": watchPagesPayload(onFoil),
                "off_foil_pages": watchPagesPayload(offFoil),
                "pause_pages": watchPagesPayload(pause),
                "browse_all_pages": browseAll,
                "layouts_enabled": layoutsEnabled,
                "colorByValue": colorByValue,
                "auto_start": autoStartWatch,
            ])
            saved = true
        }
    }
}
