package org.pumpfoil.app

// Texte des App-Ports (docs/UX-IA.md, ab 04.11.2026). ERZEUGT von scripts/gen-i18n-port.py aus
// web/src/i18n/locales/*.ts — Wortlaut im Web aendern und neu erzeugen, nie hier. I18n.t fragt diese Tabelle
// nach NEU und den Teams-Texten; Rueckfall gsw/de-AT -> de, pt-PT -> pt, dann Englisch.

private val PORT_BRUECKE = mapOf("gsw" to "de", "de-AT" to "de", "pt-PT" to "pt")

private val PORT_TEXTE: Map<String, Map<String, String>> by lazy {
    mapOf(
        "de" to mapOf(
            "tab.overview" to "Übersicht",
            "tab.team" to "Team",
            "tab.stats" to "Stats",
            "tab.insights" to "Kennzahlen",
            "nav.settings" to "Einstellungen",
        ),
        "gsw" to mapOf(
            "tab.overview" to "Übersicht",
            "tab.team" to "Team",
            "tab.stats" to "Stats",
            "tab.insights" to "Kennzahle",
            "nav.settings" to "Iistellige",
        ),
        "de-AT" to mapOf(
            "tab.overview" to "Übersicht",
            "tab.team" to "Team",
            "tab.stats" to "Stats",
            "tab.insights" to "Kennzahlen",
            "nav.settings" to "Einstellungen",
        ),
        "en" to mapOf(
            "tab.overview" to "Overview",
            "tab.team" to "Team",
            "tab.stats" to "Stats",
            "tab.insights" to "Insights",
            "nav.settings" to "Settings",
        ),
        "fr" to mapOf(
            "tab.overview" to "Aperçu",
            "tab.team" to "Équipe",
            "tab.stats" to "Stats",
            "tab.insights" to "Indicateurs",
            "nav.settings" to "Réglages",
        ),
        "it" to mapOf(
            "tab.overview" to "Panoramica",
            "tab.team" to "Team",
            "tab.stats" to "Statistiche",
            "tab.insights" to "Indicatori",
            "nav.settings" to "Impostazioni",
        ),
        "es" to mapOf(
            "tab.overview" to "Resumen",
            "tab.team" to "Equipo",
            "tab.stats" to "Estadísticas",
            "tab.insights" to "Indicadores",
            "nav.settings" to "Ajustes",
        ),
        "fi" to mapOf(
            "tab.overview" to "Yleiskatsaus",
            "tab.team" to "Tiimi",
            "tab.stats" to "Tilastot",
            "tab.insights" to "Tunnusluvut",
            "nav.settings" to "Asetukset",
        ),
        "nl" to mapOf(
            "tab.overview" to "Overzicht",
            "tab.team" to "Team",
            "tab.stats" to "Statistieken",
            "tab.insights" to "Kerncijfers",
            "nav.settings" to "Instellingen",
        ),
        "cs" to mapOf(
            "tab.overview" to "Přehled",
            "tab.team" to "Tým",
            "tab.stats" to "Statistiky",
            "tab.insights" to "Ukazatele",
            "nav.settings" to "Nastavení",
        ),
        "pl" to mapOf(
            "tab.overview" to "Przegląd",
            "tab.team" to "Drużyna",
            "tab.stats" to "Statystyki",
            "tab.insights" to "Wskaźniki",
            "nav.settings" to "Ustawienia",
        ),
        "pt" to mapOf(
            "tab.overview" to "Visão geral",
            "tab.team" to "Equipe",
            "tab.stats" to "Estatísticas",
            "tab.insights" to "Indicadores",
            "nav.settings" to "Configurações",
        ),
        "pt-PT" to mapOf(
            "tab.overview" to "Visão geral",
            "tab.team" to "Equipa",
            "tab.stats" to "Estatísticas",
            "tab.insights" to "Indicadores",
            "nav.settings" to "Definições",
        ),
        "ja" to mapOf(
            "tab.overview" to "概要",
            "tab.team" to "チーム",
            "tab.stats" to "統計",
            "tab.insights" to "指標",
            "nav.settings" to "設定",
        ),
        "zh" to mapOf(
            "tab.overview" to "概览",
            "tab.team" to "团队",
            "tab.stats" to "统计",
            "tab.insights" to "指标",
            "nav.settings" to "设置",
        ),
        "ru" to mapOf(
            "tab.overview" to "Обзор",
            "tab.team" to "Команда",
            "tab.stats" to "Статистика",
            "tab.insights" to "Показатели",
            "nav.settings" to "Настройки",
        ),
        "id" to mapOf(
            "tab.overview" to "Ringkasan",
            "tab.team" to "Tim",
            "tab.stats" to "Statistik",
            "tab.insights" to "Wawasan",
            "nav.settings" to "Pengaturan",
        ),
        "nb" to mapOf(
            "tab.overview" to "Oversikt",
            "tab.team" to "Lag",
            "tab.stats" to "Statistikk",
            "tab.insights" to "Nøkkeltall",
            "nav.settings" to "Innstillinger",
        ),
    )
}

internal fun portText(key: String, lang: String): String? =
    PORT_TEXTE[lang]?.get(key) ?: PORT_BRUECKE[lang]?.let { PORT_TEXTE[it]?.get(key) } ?: PORT_TEXTE["en"]?.get(key)
