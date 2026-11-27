#!/usr/bin/env python3
"""Sperre gegen Nutzernamen im oeffentlichen Repo (06.11.2026).

WARUM: Commit-Nachrichten und Doku entstehen oft direkt aus einem Nutzerfall („Fix fuer X's Session").
Das Repo ist oeffentlich; ein Name im Git-Log laesst sich nicht mehr zurueckholen. Eine feste
Namensliste waere selbst ein Leck — deshalb liest dieses Skript die Namen bei JEDEM Lauf frisch aus der
DB (nur lesend), haelt sie nur im Speicher und gibt sie NIE aus: gemeldet werden nur Fundstellen
(Datei:Zeile, Wort-Nummer). So erfaehrt auch ein mitlesender Assistent die Liste nicht.

  * pre-commit (`--staged`): hinzugefuegte Zeilen und Dateinamen des Commits.
  * commit-msg (`--nachricht <datei>`): die Commit-Nachricht.
  * `--verlauf N`: zaehlt Funde in den letzten N Commits (Nachricht + Diff), nur Zahlen je Commit.
  * `--baum [pfad …]`: der ganze aktuelle Stand (alle getrackten Textdateien), Fundstellen + Zahl je Datei
    (27.11.2026: Altbestand vor der Sperre bereinigen; die Historie bleibt, Jan: „nicht rueckwirkend").

Woerter: Anzeigename und E-Mail-Vorderteil jedes Nutzers, in Woerter zerlegt, ab 4 Zeichen. Ausgenommen
sind englische Woerterbuch-Woerter, Woerter aus den UI-Texten (de/en) und Eintraege in `.namen-ausnahmen`
(nur SHA-256 des kleingeschriebenen Wortes, damit auch die Ausnahmeliste keinen Namen verraet;
Hash bilden: `scripts/namen-pruefen.py --hash <wort>`).

Ohne DB (z. B. auf dem Mac) prueft es nichts und sagt das — die CI hat keine Nutzerdaten.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                           check=True).stdout.strip())
MIN = 4
WORT = re.compile(r"[^\W\d_]+", re.U)


def h(w: str) -> str:
    return hashlib.sha256(w.lower().encode()).hexdigest()


def db_url() -> str | None:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = ROOT / "server/.env"
    if env.exists():
        for z in env.read_text().splitlines():
            if z.startswith("DATABASE_URL="):
                return z.split("=", 1)[1].strip().strip('"')
    return None


def namen() -> set[str] | None:
    url = db_url()
    if not url:
        return None
    try:
        import psycopg  # noqa: F401
        dsn = re.sub(r"^postgresql\+\w+://", "postgresql://", url)
        import psycopg as pg
        with pg.connect(dsn, connect_timeout=3) as c:
            zeilen = c.execute("SELECT display_name, split_part(email, '@', 1) FROM users").fetchall()
    except Exception:
        try:
            import sqlalchemy as sa
            with sa.create_engine(url).connect() as c:
                zeilen = c.execute(sa.text("SELECT display_name, split_part(email, '@', 1) FROM users")).fetchall()
        except Exception:
            return None
    out = set()
    for anzeige, mail in zeilen:
        for teil in (anzeige or "", mail or ""):
            for w in WORT.findall(teil):
                if len(w) >= MIN:
                    out.add(w.lower())
    return out


def besitzer_lader():
    """-> Funktion ids -> {session_id: user_id} (nur lesend, gecacht). Ohne DB: leeres Ergebnis (nichts gemeldet)."""
    url = db_url()
    cache: dict[int, int] = {}

    def laden(ids):
        neu = [i for i in set(ids) if i not in cache]
        if neu and url:
            try:
                import psycopg as pg
                dsn = re.sub(r"^postgresql\+\w+://", "postgresql://", url)
                with pg.connect(dsn, connect_timeout=3) as c:
                    for sid, uid in c.execute("SELECT id, user_id FROM sessions WHERE id = ANY(%s)", (neu,)).fetchall():
                        cache[sid] = uid
            except Exception:
                pass
            for i in neu:
                cache.setdefault(i, -1)            # unbekannt/keine Session -> nicht melden
        return {i: cache[i] for i in ids if cache.get(i, -1) != -1}
    return laden


def ausnahmen_woerter() -> tuple[set[str], set[str]]:
    woerter: set[str] = set()
    for d in ("/usr/share/dict/american-english", "/usr/share/dict/words"):
        if Path(d).exists():
            woerter |= {w.strip().lower() for w in Path(d).read_text(errors="replace").splitlines()}
            break
    # alle UI-Sprachen: sonst sperren Uebersetzungen, die zufaellig wie ein Vorname klingen
    for f in sorted((ROOT / "web/src/i18n/locales").glob("*.ts")):
        for m in re.finditer(r':\s*"((?:[^"\\]|\\.)*)"', f.read_text()):
            woerter |= {w.lower() for w in WORT.findall(m.group(1))}
    hashes = set()
    f = ROOT / ".namen-ausnahmen"
    if f.exists():
        hashes = {z.split("#", 1)[0].strip() for z in f.read_text().splitlines() if z.split("#", 1)[0].strip()}
    return woerter, hashes


class Pruefer:
    def __init__(self, liste: set[str]):
        woerter, hashes = ausnahmen_woerter()
        self.namen = {n for n in liste if n not in woerter and h(n) not in hashes}
        self.woerter, self.hashes = woerter, hashes
        self.besitzer = besitzer_lader()

    def funde(self, text: str) -> list[int]:
        """-> Wort-Nummern (ab 1) der Treffer in der Zeile. Auch gebeugt: Genitiv „<Name>s" (27.11.2026, so stand ein
        Name noch im TODO, nachdem die Grundform ersetzt war)."""
        out = []
        for i, w in enumerate(WORT.findall(text), 1):
            k = w.lower()
            if k in self.namen or (len(k) > MIN and k.endswith("s") and k[:-1] in self.namen
                                   and k not in self.woerter and h(k) not in self.hashes):
                out.append(i)
        return out


# Personenbezug ueber Kennungen (Jan, 27.11.2026: „lieber nicht durch u-ids, die kann man ja einfach nachschlagen"):
# Konto-IDs, DM-Kennungen und Session-Nummern fremder Fahrer gehoeren nach lokal/FAELLE.md, oeffentlich nur Rolle +
# Fall-Kennung. Erlaubt: Jans Konto (2), Assistent (230), Store-/Testkonten — und Sessions dieser Konten.
ERLAUBTE_KONTEN = {2, 6, 7, 38, 230, 881}
KONTO = re.compile(r"(?<![\\\w+/=])u(\d{2,5})(?![\w+/=])|\buser_id\s*[=:]\s*(\d{2,5})\b|\b[Uu]ser (\d{2,5})\b|\bdm:230-(\d+)\b|\bdm:(\d+)-230\b")   # DM-Kennung des Assistenten = echtes Gespraech (Testdaten nutzen erfundene)
# Nackte „#<Zahl>" erst ab 5 Stellen (Sessions liegen seit Monaten darueber; 4-stellig sind oft Changelog-, Geraete-
# oder Feedback-Nummern). Ausdruecklich als Session benannt zaehlt auch 4-stellig.
SESSION = re.compile(r"(?<![\w&])#(?!0)(\d{5,6})\b(?![0-9a-fA-F])|\b[Ss]ession(?:s)?/?\s*#?(\d{4,6})\b|/sessions/(\d{4,6})\b")
TYPEN = {8, 16, 32, 64}        # u8/u16/u32/u64 im Suunto-Protokoll


def kennungen(text: str, sessions_besitzer) -> list[str]:
    """-> Beschreibungen der Treffer (ohne Namen). `sessions_besitzer(ids)` -> {id: user_id}."""
    out = []
    for m in KONTO.finditer(text):
        ids = [int(g) for g in m.groups() if g]
        if m.group(1) and int(m.group(1)) in TYPEN:
            continue
        if any(i not in ERLAUBTE_KONTEN for i in ids):
            out.append("Konto-Kennung")
    sids = [int(next(g for g in m.groups() if g)) for m in SESSION.finditer(text)]
    if sids:
        besitzer = sessions_besitzer(sids)
        for sid in sids:
            if sid in besitzer and besitzer[sid] not in ERLAUBTE_KONTEN:
                out.append("Session-Nummer eines Fahrers")
    return out


def staged(p: Pruefer) -> list[str]:
    diff = subprocess.run(["git", "diff", "--cached", "-U0", "--no-color", "--diff-filter=AM"],
                          capture_output=True, text=True, cwd=ROOT).stdout
    out, datei, zeile = [], "", 0
    for z in diff.splitlines():
        if z.startswith("+++ b/"):
            datei = z[6:]
            if p.funde(datei):
                out.append(f"{datei}: im Dateinamen")
        elif z.startswith("@@"):
            m = re.search(r"\+(\d+)", z)
            zeile = int(m.group(1)) if m else 0
        elif z.startswith("+") and not z.startswith("+++"):
            for nr in p.funde(z[1:]):
                out.append(f"{datei}:{zeile}: Wort {nr} der Zeile")
            if not datei.startswith("lokal/"):
                for art in kennungen(z[1:], p.besitzer):
                    out.append(f"{datei}:{zeile}: {art}")
            zeile += 1
    return out


def nachricht(p: Pruefer, pfad: str) -> list[str]:
    out = []
    for i, z in enumerate(Path(pfad).read_text().splitlines(), 1):
        if z.startswith("#"):
            continue
        for nr in p.funde(z):
            out.append(f"Commit-Nachricht Zeile {i}: Wort {nr}")
        for art in kennungen(z, p.besitzer):
            out.append(f"Commit-Nachricht Zeile {i}: {art}")
    return out


def verlauf(p: Pruefer, n: int) -> None:
    log = subprocess.run(["git", "log", f"-{n}", "--format=%h"], capture_output=True, text=True, cwd=ROOT).stdout.split()
    gesamt_msg = gesamt_diff = 0
    je_wort: dict[str, list] = {}
    for c in log:
        msg = subprocess.run(["git", "log", "-1", "--format=%B", c], capture_output=True, text=True, cwd=ROOT).stdout
        diff = subprocess.run(["git", "show", "-U0", "--format=", "--no-color", c],
                              capture_output=True, text=True, cwd=ROOT).stdout
        a = sum(len(p.funde(z)) for z in msg.splitlines())
        b = sum(len(p.funde(z[1:])) for z in diff.splitlines() if z.startswith("+") and not z.startswith("+++"))
        gesamt_msg += a; gesamt_diff += b
        for z in msg.splitlines() + [z[1:] for z in diff.splitlines() if z.startswith("+") and not z.startswith("+++")]:
            for w in WORT.findall(z):
                if w.lower() in p.namen:
                    e = je_wort.setdefault(h(w)[:12], [0, c])
                    e[0] += 1
    print(f"{len(log)} Commits: {gesamt_msg} Funde in Nachrichten, {gesamt_diff} in Diffs, "
          f"{len(je_wort)} verschiedene Woerter")
    # Nur Hash-Anfang, Anzahl und erster Commit — nie das Wort. Wer nachsehen will, schaut den Commit an.
    for k, (anz, c) in sorted(je_wort.items(), key=lambda kv: -kv[1][0])[:30]:
        print(f"  {k}  {anz:>4}x  z. B. {c}")


def baum(p: Pruefer, pfade: list[str]) -> list[str]:
    dateien = subprocess.run(["git", "ls-files", "-z", "--", *pfade], capture_output=True, text=True,
                             cwd=ROOT).stdout.split("\0")
    out = []
    for d in filter(None, dateien):
        f = ROOT / d
        if not f.is_file() or f.stat().st_size > 5_000_000:
            continue
        roh = f.read_bytes()
        if b"\0" in roh[:8192]:
            continue                                   # Binaerdatei
        if p.funde(d):
            out.append(f"{d}: im Dateinamen")
        for i, z in enumerate(roh.decode("utf-8", "replace").splitlines(), 1):
            for nr in p.funde(z):
                out.append(f"{d}:{i}: Wort {nr} der Zeile")
            for art in kennungen(z, p.besitzer):
                out.append(f"{d}:{i}: {art}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--staged", action="store_true")
    ap.add_argument("--nachricht")
    ap.add_argument("--verlauf", type=int)
    ap.add_argument("--hash")
    ap.add_argument("--baum", nargs="*")
    a = ap.parse_args()
    if a.hash:
        print(f"{h(a.hash)}  # Grund: ...")
        return 0
    liste = namen()
    if liste is None:
        print("namen-pruefen: keine DB erreichbar — Nutzernamen NICHT geprueft", file=sys.stderr)
        return 0
    p = Pruefer(liste)
    if a.verlauf:
        verlauf(p, a.verlauf)
        return 0
    if a.baum is not None:
        funde = baum(p, a.baum)
        je: dict[str, int] = {}
        for f in funde:
            je[f.split(":", 1)[0]] = je.get(f.split(":", 1)[0], 0) + 1
        for f in funde:
            print(f)
        print(f"{len(funde)} Funde in {len(je)} Dateien", file=sys.stderr)
        for d, n in sorted(je.items(), key=lambda kv: -kv[1])[:40]:
            print(f"  {n:>5}  {d}", file=sys.stderr)
        return 1 if funde else 0
    funde = (staged(p) if a.staged else []) + (nachricht(p, a.nachricht) if a.nachricht else [])
    if funde:
        print("GESPERRT: Nutzername (aus der DB) gefunden — das Repo ist oeffentlich.", file=sys.stderr)
        for f in funde[:40]:
            print(f"  {f}", file=sys.stderr)
        print("Umschreiben (Rolle statt Name: „ein Fahrer“, Konto-IDs nur in lokalen Dateien). Ist es KEIN Name,\n"
              "sondern ein normales Wort: Hash per --hash <wort> in .namen-ausnahmen eintragen, mit Grund.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
