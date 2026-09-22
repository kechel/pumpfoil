#!/usr/bin/env python3
"""Uebersetzte Nerd-Artikel aus JSON in die `nerdN.i18n.ts` einbauen — mit Pruefung.

    python3 scripts/nerd-i18n-einbauen.py --ordner <scratchpad>/nerd-i18n            # nur pruefen
    python3 scripts/nerd-i18n-einbauen.py --ordner <scratchpad>/nerd-i18n --echt     # schreiben

WOZU: die vier Artikel liegen in `web/src/pages/nerdN.i18n.ts` als je ein Objekt pro Sprache.
Uebersetzt wird ausserhalb (Agenten, JSON), eingebaut wird hier — maschinell, damit aus einer
Uebersetzung kein Syntaxfehler und aus einem fehlenden Schluessel kein leerer Absatz wird.

WAS GEPRUEFT WIRD, und warum jede Pruefung existiert:
  * GLEICHE STRUKTUR wie die Quelle. Ein fehlender Schluessel faellt sonst erst auf, wenn die
    Seite in dieser Sprache aufgerufen wird — und `undefined` rendert als leere Zeile, nicht als
    Fehler.
  * GLEICHE LISTENLAENGE. Eine Uebersetzung, die zwei Punkte zu einem zusammenzieht, verliert
    Inhalt lautlos.
  * LINKZIELE UNVERAENDERT. `[label](/nerd-analysen-2)` darf uebersetzt werden, `/nerd-analysen-2`
    nicht — ein uebersetzter Pfad ist ein toter Link.
  * MARKUP-BILANZ. Gleiche Zahl an `**`, `` ` `` und `[` wie im Original; sonst steht mitten im
    Text ein Sternchenpaar offen.
Das sind FEHLER: eine Sprache, die einen davon reisst, wird NICHT eingebaut — der Rest schon.

Als blosser HINWEIS laeuft dagegen ein gerades Anfuehrungszeichen: das ist eine Hauskonvention
dieser Dateien, der generierte TS-Quelltext entsteht ueber `json.dumps` und kann daran nicht
zerbrechen. Eine sonst gute Uebersetzung deswegen wegzuwerfen waere die teurere Entscheidung.

DATEINAMEN: erwartet wird `out/<lang>-nerd<N>.json`. Ein Uebersetzer hat am 22.09.2026 statt
dessen `nerd4.fr.json` geschrieben — das Muster hat die drei Dateien schweigend uebergangen,
und aufgefallen ist es nur, weil die Bilanz am Ende nicht aufging. Wer hier etwas aendert:
lieber laut scheitern als still weniger einbauen.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
SEITEN = WURZEL / "web" / "src" / "pages"
# Teil 1-3 sind auf Deutsch geschrieben, Teil 4 auf Englisch.
QUELLE = {1: "de", 2: "de", 3: "de", 4: "en"}
LINK = re.compile(r"\[[^\]]*?\]\(([^)]+?)\)")


def flach(o, pfad=""):
    """Alle Strings mit ihrem Pfad — fuer den Strukturvergleich."""
    if isinstance(o, dict):
        for k, v in o.items():
            yield from flach(v, f"{pfad}.{k}" if pfad else k)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from flach(v, f"{pfad}[{i}]")
    else:
        yield pfad, o


def pruefen(quelle: dict, ziel: dict, name: str) -> tuple[list[str], list[str]]:
    """-> (Fehler, Hinweise). FEHLER halten eine Sprache zurueck, HINWEISE nicht.

    Die Trennung ist keine Bequemlichkeit, sondern eine Abwaegung: ein verlorener Schluessel
    oder ein zerrissenes Markup ist im fertigen Artikel sichtbar kaputt. Ein gerades
    Anfuehrungszeichen dagegen ist eine Hausregel dieser Dateien — der generierte TS-Quelltext
    entsteht ueber `json.dumps` und kann daran gar nicht zerbrechen. Eine sonst gute Uebersetzung
    deswegen wegzuwerfen, waere die teurere Entscheidung.
    """
    q, z = dict(flach(quelle)), dict(flach(ziel))
    fehler, hinweise = [], []
    fehlt = sorted(set(q) - set(z))
    zuviel = sorted(set(z) - set(q))
    if fehlt:
        fehler.append(f"{len(fehlt)} Schluessel fehlen: {', '.join(fehlt[:4])}")
    if zuviel:
        fehler.append(f"{len(zuviel)} Schluessel zu viel: {', '.join(zuviel[:4])}")
    for k in sorted(set(q) & set(z)):
        a, b = str(q[k]), str(z[k])
        if not b.strip():
            fehler.append(f"{k}: leer")
            continue
        if '"' in b:
            hinweise.append(f"{k}: gerades Anfuehrungszeichen")
        qa, qb = LINK.findall(a), LINK.findall(b)
        if qa != qb:
            fehler.append(f"{k}: Linkziel geaendert ({qa} -> {qb})")
        for zeichen in ("**", "`", "["):
            if a.count(zeichen) != b.count(zeichen):
                fehler.append(f"{k}: {zeichen} {a.count(zeichen)}x im Original, {b.count(zeichen)}x hier")
    return fehler, hinweise


def ident(lang: str) -> str:
    return lang.replace("-", "")


def einbauen(teil: int, lang: str, daten: dict) -> bool:
    p = SEITEN / f"nerd{teil}.i18n.ts"
    s = p.read_text(encoding="utf-8")
    name = ident(lang)
    if re.search(rf"^const {name}: N{teil} =", s, re.M):
        print(f"   nerd{teil}/{lang}: steht schon drin — uebersprungen")
        return False
    block = (f"\nconst {name}: N{teil} = "
             + json.dumps(daten, ensure_ascii=False, indent=2) + ";\n")
    # Vor die Export-Zeile setzen; die Reihenfolge der Sprachen spielt keine Rolle.
    m = re.search(rf"^export const NERD{teil}\b", s, re.M)
    assert m, f"Export-Zeile in nerd{teil}.i18n.ts nicht gefunden"
    s = s[:m.start()] + block + "\n" + s[m.start():]
    # ... und in die Karte aufnehmen. Beide Schreibweisen kommen vor (einzeilig/mehrzeilig).
    eintrag = f'"{lang}": {name}' if "-" in lang else name
    m2 = re.search(rf"(export const NERD{teil}: Partial<Record<Lang, N{teil}>> = \{{)", s)
    assert m2
    s = s[:m2.end()] + f" {eintrag}," + s[m2.end():]
    p.write_text(s, encoding="utf-8")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ordner", required=True)
    ap.add_argument("--echt", action="store_true")
    args = ap.parse_args()
    basis = pathlib.Path(args.ordner)
    quellen = {n: json.loads((basis / "src" / f"nerd{n}.{QUELLE[n]}.json").read_text(encoding="utf-8"))
               for n in (1, 2, 3, 4)}

    gut, schlecht = [], []
    for datei in sorted((basis / "out").glob("*-nerd?.json")):
        m = re.match(r"(.+)-nerd(\d)\.json$", datei.name)
        if not m:
            continue
        lang, teil = m.group(1), int(m.group(2))
        try:
            daten = json.loads(datei.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            schlecht.append((lang, teil, [f"kein gueltiges JSON: {e}"]))
            continue
        fehler, hinweise = pruefen(quellen[teil], daten, datei.name)
        if fehler:
            schlecht.append((lang, teil, fehler))
        else:
            gut.append((lang, teil, daten, hinweise))

    for lang, teil, fehler in schlecht:
        print(f"❌ nerd{teil} / {lang}")
        for f in fehler[:6]:
            print(f"     {f}")
        if len(fehler) > 6:
            print(f"     … und {len(fehler) - 6} weitere")
    for lang, teil, _, hinweise in gut:
        zusatz = f"  ({len(hinweise)} Hinweis(e), nicht blockierend)" if hinweise else ""
        print(f"✅ nerd{teil} / {lang}{zusatz}")
    print(f"\n{len(gut)} in Ordnung, {len(schlecht)} mit Befund.")

    if not args.echt:
        print("(Voranzeige — nichts geschrieben. Mit --echt einbauen.)")
        return 1 if schlecht else 0
    n = sum(1 for lang, teil, daten, _ in gut if einbauen(teil, lang, daten))
    print(f"{n} Sprachfassungen eingebaut. Jetzt `cd web && npm run build`.")
    return 1 if schlecht else 0


if __name__ == "__main__":
    raise SystemExit(main())
