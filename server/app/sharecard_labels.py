"""Beschriftung der Teilen-Karte je Sprache — ERZEUGT von scripts/i18n-sharecard.py.

NICHT von Hand aendern: Quelle sind die Web-Sprachdateien (`share.*` in
web/src/i18n/locales/*.ts), damit der Teilen-Dialog und das gerenderte PNG nie
verschiedene Woerter zeigen. Nach einer Textaenderung dort das Skript neu laufen lassen.

Japanisch und Chinesisch tragen hier ENGLISCHE Texte, und das ist Absicht: die
Kartenschrift (DejaVuSans) hat keine CJK-Zeichen, und die einzige CJK-Schrift auf dem
Server (DroidSansFallbackFull) hat kein Latein, keine Ziffern und keinen Schraegstrich.
Ein gemischtes Label kaeme in jedem Fall teils als leere Kaestchen heraus.
"""
from __future__ import annotations

LABELS: dict[str, dict[str, str]] = {
    "cs": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Jízdy',
        "share.stat.pumps": 'Pumpy',
        "share.stat.avgspeed": 'Ø Rychlost',
        "share.stat.speed": 'Max. rychlost',
        "share.stat.time": 'Čas na foilu',
        "share.stat.longest": 'Nejdelší',
        "share.stat.distance": 'Vzdálenost/pump',
        "share.stat.pumprate": 'Ø Pumpy/min',
        "share.run": 'Jízda {n}',
    },
    "de": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Läufe',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Speed',
        "share.stat.speed": 'Top-Speed',
        "share.stat.time": 'Foil-Zeit',
        "share.stat.longest": 'Längster',
        "share.stat.distance": 'Strecke/Pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Lauf {n}',
    },
    "de-AT": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Läufe',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Speed',
        "share.stat.speed": 'Top-Speed',
        "share.stat.time": 'Foil-Zeit',
        "share.stat.longest": 'Längster',
        "share.stat.distance": 'Strecke/Pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Lauf {n}',
    },
    "en": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Speed',
        "share.stat.speed": 'Top speed',
        "share.stat.time": 'Foil time',
        "share.stat.longest": 'Longest',
        "share.stat.distance": 'Distance/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "es": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Velocidad',
        "share.stat.speed": 'Vel. máxima',
        "share.stat.time": 'Tiempo foil',
        "share.stat.longest": 'Más largo',
        "share.stat.distance": 'Distancia/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "fi": {
        "share.stat.foiling": 'Foilaus',
        "share.stat.runs": 'Vedot',
        "share.stat.pumps": 'Pumput',
        "share.stat.avgspeed": 'Ø Nopeus',
        "share.stat.speed": 'Huippunopeus',
        "share.stat.time": 'Foilaika',
        "share.stat.longest": 'Pisin',
        "share.stat.distance": 'Matka/pumppu',
        "share.stat.pumprate": 'Ø Pumput/min',
        "share.run": 'Veto {n}',
    },
    "fr": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Vitesse',
        "share.stat.speed": 'Vitesse max',
        "share.stat.time": 'Temps foil',
        "share.stat.longest": 'Plus long',
        "share.stat.distance": 'Distance/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "gsw": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Läuf',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Speed',
        "share.stat.speed": 'Top-Speed',
        "share.stat.time": 'Foil-Ziit',
        "share.stat.longest": 'Längschte',
        "share.stat.distance": 'Strecki/Pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Lauf {n}',
    },
    "id": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Run',
        "share.stat.pumps": 'Pump',
        "share.stat.avgspeed": 'Ø Kecepatan',
        "share.stat.speed": 'Kecepatan maks',
        "share.stat.time": 'Waktu foil',
        "share.stat.longest": 'Terpanjang',
        "share.stat.distance": 'Jarak/pump',
        "share.stat.pumprate": 'Ø Pump/mnt',
        "share.run": 'Run {n}',
    },
    "it": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Run',
        "share.stat.pumps": 'Pump',
        "share.stat.avgspeed": 'Ø Velocità',
        "share.stat.speed": 'Velocità max',
        "share.stat.time": 'Tempo foil',
        "share.stat.longest": 'Più lungo',
        "share.stat.distance": 'Distanza/pump',
        "share.stat.pumprate": 'Ø Pump/min',
        "share.run": 'Run {n}',
    },
    "ja": {
        "share.stat.foiling": 'フォイリング',
        "share.stat.runs": 'ラン',
        "share.stat.pumps": 'ポンプ',
        "share.stat.avgspeed": 'Ø 速度',
        "share.stat.speed": '最高速度',
        "share.stat.time": 'オンフォイル時間',
        "share.stat.longest": '最長ラン',
        "share.stat.distance": '距離/ポンプ',
        "share.stat.pumprate": 'ポンプ/分',
        "share.run": 'ラン {n}',
    },
    "nb": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Fart',
        "share.stat.speed": 'Toppfart',
        "share.stat.time": 'Foiltid',
        "share.stat.longest": 'Lengste',
        "share.stat.distance": 'Distanse/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "nl": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Snelheid',
        "share.stat.speed": 'Topsnelheid',
        "share.stat.time": 'Foiltijd',
        "share.stat.longest": 'Langste',
        "share.stat.distance": 'Afstand/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "pl": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Przejazdy',
        "share.stat.pumps": 'Pompy',
        "share.stat.avgspeed": 'Ø Prędkość',
        "share.stat.speed": 'Maks. prędkość',
        "share.stat.time": 'Czas na foilu',
        "share.stat.longest": 'Najdłuższy',
        "share.stat.distance": 'Dystans/pompę',
        "share.stat.pumprate": 'Ø Pompy/min',
        "share.run": 'Przejazd {n}',
    },
    "pt": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Velocidade',
        "share.stat.speed": 'Vel. máxima',
        "share.stat.time": 'Tempo de foil',
        "share.stat.longest": 'Mais longo',
        "share.stat.distance": 'Distância/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "pt-PT": {
        "share.stat.foiling": 'Foiling',
        "share.stat.runs": 'Runs',
        "share.stat.pumps": 'Pumps',
        "share.stat.avgspeed": 'Ø Velocidade',
        "share.stat.speed": 'Vel. máxima',
        "share.stat.time": 'Tempo de foil',
        "share.stat.longest": 'Mais longo',
        "share.stat.distance": 'Distância/pump',
        "share.stat.pumprate": 'Ø Pumps/min',
        "share.run": 'Run {n}',
    },
    "ru": {
        "share.stat.foiling": 'Фойлинг',
        "share.stat.runs": 'Заезды',
        "share.stat.pumps": 'Пампы',
        "share.stat.avgspeed": 'Ø Скорость',
        "share.stat.speed": 'Макс. скорость',
        "share.stat.time": 'Время фойла',
        "share.stat.longest": 'Длиннейший',
        "share.stat.distance": 'Дистанция/памп',
        "share.stat.pumprate": 'Ø Пампы/мин',
        "share.run": 'Заезд {n}',
    },
    "zh": {
        "share.stat.foiling": '上翼距离',
        "share.stat.runs": '航段',
        "share.stat.pumps": '泵动',
        "share.stat.avgspeed": 'Ø 速度',
        "share.stat.speed": '最高速度',
        "share.stat.time": '上翼时长',
        "share.stat.longest": '最长航段',
        "share.stat.distance": '距离/泵动',
        "share.stat.pumprate": '泵动/分',
        "share.run": '航段 {n}',
    },
}

FORMATE: dict[str, dict[str, str]] = {
    "cs": {"dez": ',', "tsd": ' ', "datum": '%d.%m.%Y'},
    "de": {"dez": ',', "tsd": '.', "datum": '%d.%m.%Y'},
    "de-AT": {"dez": ',', "tsd": '.', "datum": '%d.%m.%Y'},
    "en": {"dez": '.', "tsd": ',', "datum": '%d %b %Y'},
    "es": {"dez": ',', "tsd": '.', "datum": '%d/%m/%Y'},
    "fi": {"dez": ',', "tsd": ' ', "datum": '%d.%m.%Y'},
    "fr": {"dez": ',', "tsd": ' ', "datum": '%d/%m/%Y'},
    "gsw": {"dez": ',', "tsd": '.', "datum": '%d.%m.%Y'},
    "id": {"dez": ',', "tsd": '.', "datum": '%d/%m/%Y'},
    "it": {"dez": ',', "tsd": '.', "datum": '%d/%m/%Y'},
    "ja": {"dez": '.', "tsd": ',', "datum": '%Y年%m月%d日'},
    "nb": {"dez": ',', "tsd": ' ', "datum": '%d.%m.%Y'},
    "nl": {"dez": ',', "tsd": '.', "datum": '%d-%m-%Y'},
    "pl": {"dez": ',', "tsd": ' ', "datum": '%d.%m.%Y'},
    "pt": {"dez": ',', "tsd": '.', "datum": '%d/%m/%Y'},
    "pt-PT": {"dez": ',', "tsd": '.', "datum": '%d/%m/%Y'},
    "ru": {"dez": ',', "tsd": ' ', "datum": '%d.%m.%Y'},
    "zh": {"dez": '.', "tsd": ',', "datum": '%Y年%m月%d日'},
}


def _fm(lang: str | None) -> dict[str, str]:
    return FORMATE.get(lang or "") or FORMATE["en"]


def zahl(v: float, stellen: int, lang: str | None) -> str:
    """Zahl in der Schreibweise der Sprache: Dezimalzeichen und Tausendertrennung."""
    fm = _fm(lang)
    s = f"{v:,.{stellen}f}"          # immer erst englisch: 1,234.5
    ganz, _, rest = s.partition(".")
    ganz = ganz.replace(",", fm["tsd"]) if fm["tsd"] else ganz.replace(",", "")
    return ganz + (fm["dez"] + rest if rest else "")


def datum(d, lang: str | None) -> str:
    """Datum im Muster der Sprache."""
    return d.strftime(_fm(lang)["datum"])


def t(key: str, lang: str | None) -> str:
    """Ein Kartentext. Unbekannte Sprache -> Englisch (nicht Deutsch), fehlender
    Schluessel -> Englisch, sonst der Schluessel selbst."""
    tab = LABELS.get(lang or "") or LABELS["en"]
    return tab.get(key) or LABELS["en"].get(key) or key
