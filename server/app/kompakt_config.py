"""Kompakte Uhr-Konfiguration (17.10.2026, zuerst fuer die Suunto-App, docs/SUUNTO.md).

Die SuuntoPlus-App hat nur ~2 KB Datenspeicher. `GET /api/devices/config-kompakt` liefert dieselbe
Konfiguration wie `/config`, aber klein, als ASCII-Text, den das Handy unveraendert an die Uhr gibt:

  * nur, was die Datenseiten/Alarme der Uhr brauchen (`SCHLUESSEL`), mit kurzen Codes,
  * Werte, die die Uhr ohnehin annimmt (`STANDARD`, = watch-huawei/common/lauf.js `Konfig`), fehlen,
  * Seitensaetze, die die Standard-Layouts sind, als `"s"` — nur wenn die Uhr dieselben Standard-Layouts
    mitbringt (`std` = Pruefsumme, s. standard_layouts.pruefsumme),
  * jede Seite als Text: Zahlen zur Basis 36, `,` zwischen Zahlen, `;` zwischen Elementen —
    klassisch `"0,1,k,e"`, Layout `"1,4;1,dw,8c,7,0,4,1;…"`.

Gegenstueck auf der Uhr: watch-suunto/quelle/kompakt.js; Testvektoren in
watch-suunto/test/fixtures/kompakt.json (beide Seiten pruefen gegen dieselbe Datei).
Andere Uhren koennen den Endpunkt spaeter genauso nutzen.
"""
from __future__ import annotations

import json

# Langer Schluessel aus /config -> Code
CODES = {
    "views": "v", "offFoilView": "o", "pauseView": "p", "browseAll": "b", "foils": "f",
    "alarmEnabled": "ae", "alarmDefault": "ad", "speedLow": "sl", "speedHigh": "sh", "hrHigh": "hh",
    "alarmPatternHigh": "ph", "alarmPatternLow": "pl", "alarmPatternHr": "pr", "alarmRepeat": "ar",
    "alarmRepeatS": "as", "runDistM": "dm", "runDistMode": "dd", "alarmPatternDist": "pd",
    "runTimeS": "tm", "runTimeMode": "td", "alarmPatternTime": "pt", "layoutsOn": "lo",
    "latestVersion": "lv", "colorByValue": "cv", "hrZones": "hz", "speedZones": "sz",
    "pages": "P", "offFoilPages": "F", "pausePages": "Q",
}
SEITEN = ("pages", "offFoilPages", "pausePages")

# Was die Uhr ohne Angabe annimmt (lauf.js Konfig) — wird nicht geschickt.
STANDARD = {
    "views": [[1, 2, 0]], "offFoilView": [12, 17, 16], "pauseView": [12, 20, 2], "browseAll": True,
    "layoutsOn": True, "colorByValue": False, "alarmEnabled": False, "alarmDefault": "foil",
    "speedLow": 0, "speedHigh": 0, "hrHigh": 0, "alarmPatternHigh": "short2", "alarmPatternLow": "long2",
    "alarmPatternHr": "short1", "alarmRepeat": "once", "alarmRepeatS": 5, "runDistM": 0,
    "runDistMode": "once", "alarmPatternDist": "short1", "runTimeS": 0, "runTimeMode": "once",
    "alarmPatternTime": "short2", "latestVersion": "", "hrZones": [95, 114, 133, 152, 171, 190],
    "speedZones": [8, 12, 16, 20, 24, 28], "foils": [],
}
# Profil-Sprache -> Spalte der Feld-Texte auf der Uhr (watch-suunto/bau.mjs SPRACHEN)
SPALTE = {"de": 0, "gsw": 1, "de-AT": 2, "en": 3, "fr": 4, "it": 5, "es": 6, "pt": 7, "pt-PT": 7,
          "id": 8, "ru": 9, "nl": 10, "fi": 11, "cs": 12, "ja": 13, "zh": 14}


def b36(n) -> str:
    n = int(round(float(n)))
    if n < 0:
        return "-" + b36(-n)
    ziffern = "0123456789abcdefghijklmnopqrstuvwxyz"
    s = ""
    while True:
        s = ziffern[n % 36] + s
        n //= 36
        if n == 0:
            return s


def seite_text(seite: list) -> str | None:
    """[0,a,b,c] -> "0,a,b,c"; [1,bg,[[…],…]] -> "1,bg;e1;e2" (Zahlen Basis 36). Ein Text (Freitext-
    Element typ 3) steht als letztes mit `~` davor; `,` `;` `~` darin werden zu Leerzeichen."""
    if not isinstance(seite, list) or not seite:
        return None
    if seite[0] == 0:
        return ",".join(b36(x) for x in seite[:4])
    if seite[0] == 1:
        teile = [b36(1) + "," + b36(seite[1] if len(seite) > 1 else 0)]
        for e in (seite[2] if len(seite) > 2 else []) or []:
            if not isinstance(e, list):
                continue
            t = []
            for x in e:
                if isinstance(x, (int, float)) and not isinstance(x, bool):
                    t.append(b36(x))
                elif isinstance(x, str):
                    t.append("~" + "".join(" " if c in ",;~" else c for c in x)[:24])
                else:
                    t.append("0")
            teile.append(",".join(t))
        return ";".join(teile)
    return None


def kompakt(cfg: dict, uhr_std: int | None, max_foils: int = 1) -> str:
    """Volle /config (inkl. standardSeiten/standardHash) -> kompakter ASCII-Text. `max_foils`: die Suunto
    kann kein Foil auswaehlen, es zaehlt nur das Standard-Foil (das erste) fuer die Alarm-Grenzen."""
    o: dict = {}
    for lang, code in CODES.items():
        if lang in SEITEN or lang not in cfg:
            continue
        v = cfg[lang]
        if lang == "foils":
            v = [{"i": f.get("id"), "l": str(f.get("label") or "")[:24], "a": f.get("min"), "b": f.get("max")}
                 for f in (v or []) if isinstance(f, dict)][:max(0, max_foils)]
        if v == STANDARD.get(lang) or (lang == "foils" and not v):
            continue
        o[code] = v
    std = set(cfg.get("standardSeiten") or []) if uhr_std and cfg.get("standardHash") == uhr_std else set()
    for lang in SEITEN:
        if lang in std:
            o[CODES[lang]] = "s"
        elif cfg.get(lang):
            texte = [t for t in (seite_text(s) for s in cfg[lang]) if t]
            if texte:
                o[CODES[lang]] = texte
    if cfg.get("language") in SPALTE:
        o["s"] = SPALTE[cfg["language"]]
    return json.dumps(o, separators=(",", ":"), ensure_ascii=True)
