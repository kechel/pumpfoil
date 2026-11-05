#!/usr/bin/env python3
"""Land -> Kontinent fuer den Regions-Filter der Bestenlisten (Jan, 05.11.2026: Region nach der NATIONALITAET der
Fahrer, wie im Wettkampf). Erzeugt server/app/data/land_kontinent.json aus Natural Earth 1:10m Laender (gemeinfrei).
Die Quelldatei kommt NICHT ins Repo:
    curl -L -o /tmp/ne10m.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
    python3 scripts/land-kontinent-erzeugen.py /tmp/ne10m.geojson

Kuerzel wie bei der Team-Herkunft (k:eu, k:af, k:as, k:na, k:sa, k:oc; scripts/kontinente-erzeugen.py). Laender aus
der Nationalitaets-Auswahl (web/src/lib/laender.ts), die Natural Earth nicht einzeln fuehrt (Ueberseegebiete, die dort
zu Frankreich/Niederlande gehoeren), stehen unten in EXTRA. Antarktis-Gebiete bekommen keinen Kontinent: sie zaehlen
dann nur in „Global".
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
KONT = {"Europe": "k:eu", "Africa": "k:af", "Asia": "k:as", "North America": "k:na", "South America": "k:sa", "Oceania": "k:oc"}
# Natural Earth fuehrt kleine Inselstaaten unter „Seven seas (open ocean)" — dann die UN-Region.
UN = {"Africa": "k:af", "Asia": "k:as", "Oceania": "k:oc", "Europe": "k:eu", "Americas": None}
EXTRA = {
    "GF": "k:sa",                                   # Franzoesisch-Guayana
    "GP": "k:na", "MQ": "k:na", "BL": "k:na", "MF": "k:na", "BQ": "k:na", "SX": "k:na", "CW": "k:na",  # Karibik
    "RE": "k:af", "YT": "k:af",                     # Reunion, Mayotte
    "PM": "k:na", "SJ": "k:eu", "TK": "k:oc", "UM": "k:oc", "CC": "k:as", "CX": "k:as",
    # Natural Earth legt Zypern nach Asien (Geografie); als EU-Mitglied erwartet man es unter Europa.
    "CY": "k:eu",
}
# Mehrere Eintraege je Code (Clipperton = „FR", Kokosinseln = „AU" …): das Mutterland gewinnt.
HAUPT = ("Country", "Sovereign country", "Sovereignty")
OHNE = {"AQ", "BV", "HM", "GS", "TF"}               # Antarktis und subantarktische Inseln


def main(quelle: str) -> None:
    d = json.load(open(quelle, encoding="utf-8"))
    ne: dict[str, str] = {}
    for f in d["features"]:
        p = f["properties"]
        code = p.get("ISO_A2_EH") or p.get("ISO_A2")
        if not code or code == "-99":
            continue
        k = KONT.get(p.get("CONTINENT"))
        if k is None and p.get("REGION_UN") == "Americas":
            k = "k:sa" if p.get("SUBREGION") == "South America" else "k:na"
        elif k is None:
            k = UN.get(p.get("REGION_UN"))
        if k and (code not in ne or p.get("TYPE") in HAUPT):
            ne[code] = k
    laender = re.findall(r'"([A-Z]{2})"', (ROOT / "web/src/lib/laender.ts").read_text().split("LAENDER")[1].split("];")[0])
    out, fehlt = {}, []
    for c in laender:
        if c in OHNE:
            continue
        k = EXTRA.get(c) or ne.get(c)
        if k:
            out[c] = k
        else:
            fehlt.append(c)
    if fehlt:
        sys.exit(f"ohne Kontinent: {fehlt} — in EXTRA oder OHNE eintragen")
    ziel = ROOT / "server/app/data/land_kontinent.json"
    ziel.write_text(json.dumps(dict(sorted(out.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"{len(out)} Laender -> {ziel}")


if __name__ == "__main__":
    main(sys.argv[1])
