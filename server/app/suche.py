"""Suchvergleich ohne Akzente, Bindestriche, Leerzeichen und Markenzeichen — fuer ALLE Server-Suchen.

Anlass (Jan, 01.10.2026: „teste mal alle Suchfunktionen durch"): von 14 Faellen fanden 4. „frederic"
fand Frédéric nicht, „cheran" nicht Alby-sur-Chéran, „fone" nicht F-One, „xover" nicht X-Over,
„mach2" nicht Mach-2. Der Browser (Strg-F) ignoriert Akzente; unsere Suchen taten es nicht.

Regel, ueberall gleich: der Suchtext zerfaellt in WORTE, jedes Wort muss irgendwo vorkommen (wie
schon in der Katalogsuche, s. gearsearch.py). Verglichen wird in einer SUCHFORM: klein, ohne Akzente,
ohne Bindestriche/Leerzeichen/®™©. Die Datenbank braucht dafuer keine Erweiterung (`unaccent`
waere ein Schema-Eingriff): `translate()` + `replace()` bilden dieselbe Form in SQL nach.
Die Web-Seite hat dieselbe Regel clientseitig (web/src/lib/suche.ts).
"""
from __future__ import annotations

import unicodedata

from sqlalchemy import and_, func, or_, true

# Zeichen, die fuer den Vergleich wegfallen (nach dem Kleinschreiben).
_WEG = "-‐–—_ ®™©'’"
# Mehrbuchstabige Ersetzungen — `translate()` kann nur 1:1, darum vorher per replace().
_MEHR = {"ß": "ss", "æ": "ae", "œ": "oe"}
# Einzelbuchstaben, die NFD nicht zerlegt (kein Grundbuchstabe + Akzent).
_EXTRA = {"ł": "l", "đ": "d", "ø": "o", "ı": "i", "ħ": "h", "þ": "t"}


def _grund(c: str) -> str:
    if c in _EXTRA:
        return _EXTRA[c]
    z = unicodedata.normalize("NFD", c)
    return z[0] if z and z[0] != c else c


# Alle Kleinbuchstaben mit Akzent aus Latin-1/Latin-Extended-A, dazu die Extras.
_AKZENT = "".join(sorted({c for c in (chr(i) for i in range(0xC0, 0x250))
                          if c.islower() and (_grund(c) != c) and c not in _MEHR}))
_VON = _AKZENT + _WEG
_NACH = "".join(_grund(c) for c in _AKZENT)   # kuerzer als _VON -> die _WEG-Zeichen fallen weg


def suchform(s: str | None) -> str:
    """Python-Seite: dieselbe Form wie `suchform_sql`."""
    s = (s or "").lower()
    for a, b in _MEHR.items():
        s = s.replace(a, b)
    s = "".join(_grund(c) for c in s)
    return "".join(c for c in s if c not in _WEG and not c.isspace())


def suchform_sql(spalte):
    """SQL-Seite: lower -> Mehrbuchstaben -> translate (Akzente weg, Trennzeichen raus)."""
    x = func.lower(func.coalesce(spalte, ""))
    for a, b in _MEHR.items():
        x = func.replace(x, a, b)
    return func.translate(x, _VON, _NACH)


def worte(q: str | None) -> list[str]:
    """Suchtext -> Woerter in Suchform (leere fallen weg)."""
    return [w for w in (suchform(t) for t in (q or "").split()) if w]


def wort_bedingung(q: str | None, spalten: list):
    """Jedes Wort muss in mindestens einer Spalte vorkommen. None = nicht filtern."""
    ws = worte(q)
    if not ws:
        return None
    return and_(*[or_(*[suchform_sql(s).like(f"%{w}%") for s in spalten]) for w in ws])


def bedingung_oder_alles(q: str | None, spalten: list):
    """Wie `wort_bedingung`, aber nie None — fuer Stellen, die direkt `.filter()` aufrufen
    (ein Suchtext nur aus „-" ergibt keine Worte und filtert dann nichts)."""
    b = wort_bedingung(q, spalten)
    return b if b is not None else true()
