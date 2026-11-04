import Foundation

// Texte des App-Ports (docs/UX-IA.md, ab 04.11.2026). ERZEUGT von scripts/gen-i18n-port.py aus
// web/src/i18n/locales/*.ts — Wortlaut im Web aendern und neu erzeugen, nie hier. Loc.t fragt diese Tabelle zuerst.
// Je Sprache Bloecke zu hoechstens 45 Eintraegen (Swift-Type-Checker, s. LocTeams.swift).

enum LocPort {
    /// nil = Schluessel unbekannt (dann sucht Loc.t in den grossen Tabellen weiter).
    static func t(_ key: String, _ lang: String) -> String? {
        guard schluessel.contains(key) else { return nil }
        if let v = sprachen[lang]?[key] { return v }
        if lang == "pt-PT", let v = sprachen["pt"]?[key] { return v }
        if lang == "gsw" || lang == "de-AT", let v = sprachen["de"]?[key] { return v }
        return sprachen["en"]?[key]
    }

    static let schluessel: Set<String> = ["tab.overview", "tab.team", "tab.stats", "tab.insights", "nav.settings"]

    static let sprachen: [String: [String: String]] = {
        var r: [String: [String: String]] = [:]
        var mde: [String: String] = [:]
        let bde0: [String: String] = ["tab.overview": "Übersicht", "tab.team": "Team", "tab.stats": "Stats", "tab.insights": "Kennzahlen", "nav.settings": "Einstellungen"]
        mde.merge(bde0) { a, _ in a }
        r["de"] = mde
        var mgsw: [String: String] = [:]
        let bgsw0: [String: String] = ["tab.overview": "Übersicht", "tab.team": "Team", "tab.stats": "Stats", "tab.insights": "Kennzahle", "nav.settings": "Iistellige"]
        mgsw.merge(bgsw0) { a, _ in a }
        r["gsw"] = mgsw
        var mdeAT: [String: String] = [:]
        let bdeAT0: [String: String] = ["tab.overview": "Übersicht", "tab.team": "Team", "tab.stats": "Stats", "tab.insights": "Kennzahlen", "nav.settings": "Einstellungen"]
        mdeAT.merge(bdeAT0) { a, _ in a }
        r["de-AT"] = mdeAT
        var men: [String: String] = [:]
        let ben0: [String: String] = ["tab.overview": "Overview", "tab.team": "Team", "tab.stats": "Stats", "tab.insights": "Insights", "nav.settings": "Settings"]
        men.merge(ben0) { a, _ in a }
        r["en"] = men
        var mfr: [String: String] = [:]
        let bfr0: [String: String] = ["tab.overview": "Aperçu", "tab.team": "Équipe", "tab.stats": "Stats", "tab.insights": "Indicateurs", "nav.settings": "Réglages"]
        mfr.merge(bfr0) { a, _ in a }
        r["fr"] = mfr
        var mit: [String: String] = [:]
        let bit0: [String: String] = ["tab.overview": "Panoramica", "tab.team": "Team", "tab.stats": "Statistiche", "tab.insights": "Indicatori", "nav.settings": "Impostazioni"]
        mit.merge(bit0) { a, _ in a }
        r["it"] = mit
        var mes: [String: String] = [:]
        let bes0: [String: String] = ["tab.overview": "Resumen", "tab.team": "Equipo", "tab.stats": "Estadísticas", "tab.insights": "Indicadores", "nav.settings": "Ajustes"]
        mes.merge(bes0) { a, _ in a }
        r["es"] = mes
        var mfi: [String: String] = [:]
        let bfi0: [String: String] = ["tab.overview": "Yleiskatsaus", "tab.team": "Tiimi", "tab.stats": "Tilastot", "tab.insights": "Tunnusluvut", "nav.settings": "Asetukset"]
        mfi.merge(bfi0) { a, _ in a }
        r["fi"] = mfi
        var mnl: [String: String] = [:]
        let bnl0: [String: String] = ["tab.overview": "Overzicht", "tab.team": "Team", "tab.stats": "Statistieken", "tab.insights": "Kerncijfers", "nav.settings": "Instellingen"]
        mnl.merge(bnl0) { a, _ in a }
        r["nl"] = mnl
        var mcs: [String: String] = [:]
        let bcs0: [String: String] = ["tab.overview": "Přehled", "tab.team": "Tým", "tab.stats": "Statistiky", "tab.insights": "Ukazatele", "nav.settings": "Nastavení"]
        mcs.merge(bcs0) { a, _ in a }
        r["cs"] = mcs
        var mpl: [String: String] = [:]
        let bpl0: [String: String] = ["tab.overview": "Przegląd", "tab.team": "Drużyna", "tab.stats": "Statystyki", "tab.insights": "Wskaźniki", "nav.settings": "Ustawienia"]
        mpl.merge(bpl0) { a, _ in a }
        r["pl"] = mpl
        var mpt: [String: String] = [:]
        let bpt0: [String: String] = ["tab.overview": "Visão geral", "tab.team": "Equipe", "tab.stats": "Estatísticas", "tab.insights": "Indicadores", "nav.settings": "Configurações"]
        mpt.merge(bpt0) { a, _ in a }
        r["pt"] = mpt
        var mptPT: [String: String] = [:]
        let bptPT0: [String: String] = ["tab.overview": "Visão geral", "tab.team": "Equipa", "tab.stats": "Estatísticas", "tab.insights": "Indicadores", "nav.settings": "Definições"]
        mptPT.merge(bptPT0) { a, _ in a }
        r["pt-PT"] = mptPT
        var mja: [String: String] = [:]
        let bja0: [String: String] = ["tab.overview": "概要", "tab.team": "チーム", "tab.stats": "統計", "tab.insights": "指標", "nav.settings": "設定"]
        mja.merge(bja0) { a, _ in a }
        r["ja"] = mja
        var mzh: [String: String] = [:]
        let bzh0: [String: String] = ["tab.overview": "概览", "tab.team": "团队", "tab.stats": "统计", "tab.insights": "指标", "nav.settings": "设置"]
        mzh.merge(bzh0) { a, _ in a }
        r["zh"] = mzh
        var mru: [String: String] = [:]
        let bru0: [String: String] = ["tab.overview": "Обзор", "tab.team": "Команда", "tab.stats": "Статистика", "tab.insights": "Показатели", "nav.settings": "Настройки"]
        mru.merge(bru0) { a, _ in a }
        r["ru"] = mru
        var mid: [String: String] = [:]
        let bid0: [String: String] = ["tab.overview": "Ringkasan", "tab.team": "Tim", "tab.stats": "Statistik", "tab.insights": "Wawasan", "nav.settings": "Pengaturan"]
        mid.merge(bid0) { a, _ in a }
        r["id"] = mid
        var mnb: [String: String] = [:]
        let bnb0: [String: String] = ["tab.overview": "Oversikt", "tab.team": "Lag", "tab.stats": "Statistikk", "tab.insights": "Nøkkeltall", "nav.settings": "Innstillinger"]
        mnb.merge(bnb0) { a, _ in a }
        r["nb"] = mnb
        return r
    }()
}
