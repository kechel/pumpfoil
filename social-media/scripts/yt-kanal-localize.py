#!/usr/bin/env python3
"""
yt-kanal-localize.py — Kanalbeschreibungen aus brand/social/ auf YouTube setzen.

Aufruf:
    python3 yt-kanal-localize.py                 # nur zeigen: was liegt an, was fehlt
    python3 yt-kanal-localize.py --push ar th    # genannte Sprachen schreiben
    python3 yt-kanal-localize.py --push --alle   # alle vorhandenen Dateien schreiben

Ohne --push wird nichts geaendert. Vor jedem Schreiben legt das Skript den aktuellen
Stand als .yt-kanal-localizations-<zeitstempel>.json neben die anderen Sicherungen.

Zwei Fallen, die hier schon Geld gekostet haben:
  * Kanaluebersetzungen nutzen Locale-Codes mit Unterstrich (`pt_BR`, `zh_CN`), die
    Video-Lokalisierungen dagegen Bindestriche (`pt-BR`, `zh-CN`). Geschrieben wird mit
    dem einfachen Sprachcode, YouTube normalisiert selbst.
  * YouTube meint mit `pt` das BRASILIANISCHE Portugiesisch, `pt-PT` ist die Abweichung.
    Deshalb geht kanal-beschreibung-pt-BR-brasilianisch.txt nach `pt` und
    kanal-beschreibung-pt-portugiesisch.txt nach `pt-PT`.
Details in brand/social/kanal-beschreibung-README.md.
"""

import datetime
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

TEXTE = HERE.parent.parent / "brand" / "social"
SICHERUNG = HERE.parent
GRENZE = 1000                       # Zeichengrenze des YouTube-Formulars

# Datei-Kuerzel -> YouTube-Sprachcode. Was hier fehlt, bietet YouTube nicht an
# (de-AT, gsw) oder wird bewusst nicht geschrieben.
CODES = {
    "de": "de", "en": "en", "fr": "fr", "it": "it", "es": "es", "fi": "fi",
    "nl": "nl", "cs": "cs", "pl": "pl", "ru": "ru", "id": "id", "ja": "ja",
    "zh": "zh-CN", "nb": "no", "ar": "ar", "th": "th", "tr": "tr", "vi": "vi",
    "pt-BR": "pt",      # YouTube: `pt` = brasilianisch
    "pt": "pt-PT",      # unsere Datei "pt-portugiesisch" ist die europaeische
}


def dateien() -> dict:
    """{YouTube-Code: (Pfad, Text)} aus brand/social/kanal-beschreibung-*.txt."""
    out = {}
    for p in sorted(TEXTE.glob("kanal-beschreibung-*.txt")):
        m = re.match(r"kanal-beschreibung-(.+?)-[a-z]+\.txt$", p.name)
        kuerzel = m.group(1) if m else ""
        code = CODES.get(kuerzel)
        if code:
            out[code] = (p, p.read_text(encoding="utf-8").strip())
    return out


def main() -> None:
    push = "--push" in sys.argv
    alle = "--alle" in sys.argv
    gewuenscht = [a for a in sys.argv[1:] if not a.startswith("--")]

    auth = {"Authorization": f"Bearer {sm.yt_access_token()}"}
    ch = sm._http_json("https://www.googleapis.com/youtube/v3/channels"
                       "?part=localizations,snippet,brandingSettings&mine=true",
                       headers=auth)["items"][0]
    default = (ch.get("snippet") or {}).get("defaultLanguage") or ""
    live = ch.get("localizations") or {}
    da = dateien()

    def live_key(code: str, alle_codes) -> str:
        """Unter welchem Schluessel liegt diese Sprache schon auf dem Kanal?

        YouTube liefert Locale-Codes zurueck (de_DE, nb_NO, zh_CN, pt_BR), geschrieben
        wird mit dem Sprachcode (de, no, zh-CN, pt). Wir vergleichen deshalb ueber die
        Basissprache — aber ein Treffer, der exakt einem ANDEREN unserer Codes
        entspricht, zaehlt nicht: sonst wuerde `pt` auf pt_PT zeigen.
        """
        c = code.lower().replace("_", "-")
        basis = {"no": "nb", "nb": "no"}
        fremd = {x.lower().replace("_", "-") for x in alle_codes if x != code}
        for k in live:
            if k.lower().replace("_", "-") == c:
                return k
        for k in live:
            kk = k.lower().replace("_", "-")
            if kk in fremd or "-" in c:
                continue
            if kk.split("-")[0] in (c, basis.get(c)):
                return k
        return ""

    print(f"Kanal: {ch['snippet']['title']} · {len(live)} Uebersetzungen live")
    for code, (p, text) in sorted(da.items()):
        zu_lang = " ZU LANG!" if len(text) > GRENZE else ""
        status = ("haupt" if code == default
                  else "live" if live_key(code, da) else "FEHLT")
        print(f"  {code:6s} {status:5s} {len(text):4d} Zeichen  {p.name}{zu_lang}")

    ziele = list(da) if alle else [c for c in gewuenscht if c in da]
    for c in gewuenscht:
        if c not in da:
            raise SystemExit(f"Keine Datei fuer Sprachcode {c} — siehe CODES im Skript.")
    if not push:
        print("\n(nichts geschrieben — --push fehlt)")
        return
    if not ziele:
        raise SystemExit("Nichts zu tun: Sprachcodes angeben oder --alle.")

    stempel = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    sich = SICHERUNG / f".yt-kanal-localizations-{stempel}.json"
    sich.write_text(json.dumps({"localizations": live,
                                "brandingSettings": ch.get("brandingSettings", {})},
                               ensure_ascii=False, indent=1))
    print(f"\nSicherung: {sich.name}")

    neu = dict(live)
    haupt = ""
    for code in ziele:
        p, text = da[code]
        if len(text) > GRENZE:
            raise SystemExit(f"{p.name} hat {len(text)} Zeichen — Grenze ist {GRENZE}.")
        if code == default:
            # Die Standardsprache des Kanals hat KEINE echte Uebersetzung: ihr
            # Localizations-Eintrag ist nur ein Spiegel von brandingSettings. Ein PUT
            # darauf wird stillschweigend verworfen (hier am 09.09. an de_DE gesehen,
            # das trotz erfolgreichem PUT auf dem alten Stand blieb).
            haupt = text
            print(f"  schreibe {code:6s} als Kanal-Haupttext aus {p.name}")
            continue
        # Vorhandene Sprachen unter ihrem bestehenden Schluessel aktualisieren
        # (YouTube hat sie als de_DE, pt_BR, zh_CN … abgelegt) — sonst stehen am Ende
        # zwei Eintraege fuer dieselbe Sprache auf dem Kanal.
        schluessel = live_key(code, da) or code
        neu[schluessel] = {"title": ch["snippet"]["title"], "description": text}
        print(f"  schreibe {schluessel:6s} aus {p.name}")
    if neu != live:
        sm._http_json("https://www.googleapis.com/youtube/v3/channels?part=localizations",
                      {"id": ch["id"], "localizations": neu}, method="PUT", headers=auth)
    if haupt:
        bs = ch.get("brandingSettings") or {}
        bs.setdefault("channel", {})["description"] = haupt
        sm._http_json("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings",
                      {"id": ch["id"], "brandingSettings": bs}, method="PUT", headers=auth)
    print(f"fertig: {len(ziele)} geschrieben, {len(neu)} Uebersetzungen gesamt")
    print("Hinweis: eine sofortige Rueckfrage liefert oft noch den alten Stand.")


if __name__ == "__main__":
    main()
