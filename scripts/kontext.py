#!/usr/bin/env python3
"""Was weiss das Projekt zu einem Thema? Uebersicht aus dem Projekt-Atlas (scripts/atlas/).

    scripts/kontext.py team icons, wappen
    scripts/kontext.py "garmin push" --quelle memory,repo
    scripts/kontext.py backup --bis 2026-09-01          # Stand bis zu einem Stichtag
    scripts/kontext.py --voll 4711,4712                  # Volltext einzelner Treffer

Stichpunkte durch Komma trennen. Gesucht wird dreifach und zusammengefuehrt:
  * Volltext mit Wortanfaengen (icon -> icons, Icon.tsx),
  * aehnliche Schreibweisen aus dem Wortschatz des Index (Wapen -> wappen, pumfoil -> pumpfoil),
  * Bedeutung per Vektor (Symbol fuer Teams -> TeamIcon, team icon; Deutsch und Englisch gemischt).
Ausgabe ist eine Uebersicht je Quelle mit Treffer-Nummer; den Volltext holt `--voll <nr>`.
"""
from __future__ import annotations

import argparse
import difflib
import os
import re
import signal
import sqlite3
import sys
import textwrap
from pathlib import Path

signal.signal(signal.SIGPIPE, signal.SIG_DFL)   # `| head` ohne Fehlermeldung
DB = Path(os.environ.get("ATLAS_DB", Path.home() / "pumpfoil-atlas" / "atlas.db"))
VENV = DB.parent / "venv/bin/python"

# In der venv neu starten, damit die Vektorsuche mitlaeuft (ohne venv: nur Volltext).
# (sys.prefix statt Pfadvergleich: venv/bin/python ist nur ein Link auf /usr/bin/python3.)
if not os.environ.get("ATLAS_KEIN_REEXEC") and VENV.exists() and Path(sys.prefix) != VENV.parent.parent:
    try:
        import numpy  # noqa: F401
        import fastembed  # noqa: F401
    except ImportError:
        os.environ["ATLAS_KEIN_REEXEC"] = "1"
        os.execv(str(VENV), [str(VENV), __file__] + sys.argv[1:])

# Reihenfolge und Platz der Gruppen in der Uebersicht.
GRUPPEN = [
    ("Regeln & Wissen (Memories, Skills)", ("memory", "skill"), 8),
    ("Projekt-Doku (CLAUDE.md, docs/, READMEs)", ("repo",), 8),
    ("Code-Verzeichnisse (API, Seiten, Env, Texte, Uhren)", ("code", "api", "web-route", "env", "i18n", "watch"), 10),
    ("Git-Verlauf", ("git",), 6),
    ("SDK-/Plattform-Dokus", None, 5),   # None = alles mit sdk:
]


def gruppe(quelle: str) -> int:
    for i, (_, qs, _) in enumerate(GRUPPEN):
        if qs is None and quelle.startswith("sdk:"):
            return i
        if qs and quelle in qs:
            return i
    return len(GRUPPEN) - 1


def woerter(stichpunkte: list[str]) -> list[str]:
    return [w for s in stichpunkte for w in re.findall(r"[\wäöüÄÖÜß]+", s.lower()) if len(w) > 1]


def schreibweisen(db, ws: list[str]) -> dict[str, list[str]]:
    """Aehnliche Woerter aus dem Index-Wortschatz (Tippfehler, Wortformen, zusammen/getrennt)."""
    out = {}
    for w in ws:
        if len(w) < 5:
            continue
        # Nur bei seltenen Woertern (vermutlich Tippfehler oder eigene Schreibweise) erweitern — haeufige Woerter
        # wie „teams“ finden genug und wuerden nur Rauschen („terms“, „temps“) einsammeln.
        haeufig = db.execute("SELECT doc FROM woerter WHERE term = ?", (w,)).fetchone()
        if haeufig and haeufig[0] >= 15:
            continue
        kand = [r[0] for r in db.execute(
            "SELECT term FROM woerter WHERE term >= ? AND term < ? AND length(term) BETWEEN ? AND ?",
            (w[:2], w[:2] + "￿", len(w) - 2, len(w) + 3))]
        nah = [k for k in difflib.get_close_matches(w, kand, n=6, cutoff=0.82) if k != w and not k.startswith(w)]
        if nah:
            out[w] = nah
    return out


def fts_ausdruck(stichpunkte: list[str], varianten: dict[str, list[str]]) -> str:
    teile = []
    for s in stichpunkte:
        ws = woerter([s])
        if not ws:
            continue
        glieder = []
        for w in ws:
            alt = [f'"{w}"*'] + [f'"{v}"' for v in varianten.get(w, [])]
            glieder.append("(" + " OR ".join(alt) + ")")
        teile.append("(" + " AND ".join(glieder) + ")")    # ein Stichpunkt = alle seine Woerter
        if len(ws) > 1:
            teile.append("(" + " OR ".join(glieder) + ")")  # schwacher Ersatz: eines davon
    return " OR ".join(teile)


def filter_sql(a) -> tuple[str, list]:
    w, p = [], []
    if a.quelle:
        qs = a.quelle.split(",")
        w.append("(" + " OR ".join("quelle = ? OR quelle LIKE ?" for _ in qs) + ")")
        for q in qs:
            p += [q, q + ":%"]
    if a.seit:
        w.append("(datum = '' OR datum >= ?)"); p.append(a.seit)
    if a.bis:
        w.append("(datum = '' OR datum <= ?)"); p.append(a.bis)
    return (" AND " + " AND ".join(w)) if w else "", p


def suche_fts(db, ausdruck: str, a, n=300) -> list[int]:
    if not ausdruck:
        return []
    f, p = filter_sql(a)
    try:
        return [r[0] for r in db.execute(
            f"SELECT rowid FROM stuecke WHERE stuecke MATCH ? {f} ORDER BY bm25(stuecke, 0,0,0,0,0, 4.0, 1.0) LIMIT ?",
            [ausdruck] + p + [n])]
    except sqlite3.OperationalError as e:
        print(f"(Volltext: {e})", file=sys.stderr)
        return []


def suche_vektor(db, stichpunkte: list[str], a, n=300) -> list[int]:
    try:
        import numpy as np
        from fastembed import TextEmbedding
    except ImportError:
        return []
    if not db.execute("SELECT name FROM sqlite_master WHERE name = 'vektoren'").fetchone():
        return []
    f, p = filter_sql(a)
    zeilen = db.execute(f"SELECT s.rowid, v.v FROM stuecke s JOIN vektoren v ON v.h = s.h WHERE 1=1 {f}", p).fetchall()
    if not zeilen:
        return []
    ids = np.array([r[0] for r in zeilen])
    M = np.frombuffer(b"".join(r[1] for r in zeilen), dtype=np.float16).reshape(len(zeilen), -1).astype(np.float32)
    m = TextEmbedding("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                      cache_dir=str(DB.parent / "modelle"), threads=4)
    q = np.array(list(m.embed([", ".join(stichpunkte)] + stichpunkte)), dtype=np.float32)
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    score = (M @ q.T).max(axis=1) * 0.5 + (M @ q[0]) * 0.5
    top = np.argsort(-score)[:n]
    return [int(ids[i]) for i in top if score[i] > 0.45]


def zusammen(fts: list[int], vek: list[int], k=60) -> list[int]:
    """Reciprocal Rank Fusion; der Volltext zaehlt etwas mehr (genaue Woerter schlagen „klingt aehnlich“)."""
    s: dict[int, float] = {}
    for liste, gewicht in ((fts, 1.0), (vek, 0.7)):
        for r, i in enumerate(liste):
            s[i] = s.get(i, 0) + gewicht / (k + r)
    return sorted(s, key=lambda i: -s[i])


def kurz(text: str, ws: list[str], laenge=150) -> str:
    t = re.sub(r"\s+", " ", text)
    pos = min([p for p in (t.lower().find(w) for w in ws) if p >= 0] or [0])
    start = max(0, pos - 40)
    return ("…" if start else "") + t[start:start + laenge] + ("…" if len(t) > start + laenge else "")


def uebersicht(db, ids: list[int], ws: list[str], mehr: int) -> None:
    gesehen_pfad: dict[str, int] = {}
    je_gruppe: list[list] = [[] for _ in GRUPPEN]
    for i in ids:
        r = db.execute("SELECT rowid, quelle, pfad, zeile, datum, titel, text FROM stuecke WHERE rowid = ?", (i,)).fetchone()
        if r is None:   # waehrend der Abfrage neu gebaut
            continue
        g = gruppe(r[1])
        if len(je_gruppe[g]) >= GRUPPEN[g][2] * mehr:
            continue
        # hoechstens zwei Abschnitte je Datei, sonst frisst ein langes Dokument die Liste
        if gesehen_pfad.get(r[2], 0) >= 2 and r[1] not in ("git", "api", "i18n", "env", "web-route"):
            continue
        gesehen_pfad[r[2]] = gesehen_pfad.get(r[2], 0) + 1
        je_gruppe[g].append(r)
    for (name, _, _), treffer in zip(GRUPPEN, je_gruppe):
        if not treffer:
            continue
        print(f"\n== {name}")
        for rid, quelle, pfad, zeile, datum, titel, text in treffer:
            ort = f"{pfad}:{zeile}" if zeile else pfad
            q = "" if quelle in ("repo", "memory", "git") else f"[{quelle}] "
            print(f"  #{rid:<6} {q}{titel[:80]}  — {ort}" + (f"  ({datum})" if datum else ""))
            print(f"          {kurz(text, ws)}")


def kurzliste(db, ids: list[int], n: int) -> None:
    """Eine Zeile je Treffer, hoechstens einer je Datei und zwei Commits — fuer den UserPromptSubmit-Hook."""
    pfade, git, zeilen = set(), 0, []
    for i in ids:
        r = db.execute("SELECT rowid, quelle, pfad, zeile, datum, titel FROM stuecke WHERE rowid = ?", (i,)).fetchone()
        if r is None or r[2] in pfade or r[1] == "i18n":
            continue
        if r[1] == "git":
            git += 1
            if git > 2:
                continue
        pfade.add(r[2])
        rid, quelle, pfad, zeile, datum, titel = r
        ort = f"{pfad}:{zeile}" if zeile else pfad
        zeilen.append(f"  #{rid} [{quelle}] {titel[:70]} — {ort}" + (f" ({datum})" if datum else ""))
        if len(zeilen) >= n:
            break
    print("\n".join(zeilen))


def voll(db, ids: str) -> None:
    for i in ids.split(","):
        r = db.execute("SELECT quelle, pfad, zeile, datum, titel, text FROM stuecke WHERE rowid = ?", (int(i),)).fetchone()
        if not r:
            print(f"#{i}: gibt es nicht (Index neu gebaut? dann neu suchen)")
            continue
        quelle, pfad, zeile, datum, titel, text = r
        print(f"\n===== #{i} [{quelle}] {titel}\n{pfad}{':' + str(zeile) if zeile else ''}  {datum}\n")
        print(text)


# Aelter als das: vor der Abfrage still nachbauen (Volltext ~1 s; Vektoren rechnet der Lauf im Hintergrund nach).
# Der SessionStart-Hook allein reicht nicht: in langen Sitzungen veraltet der Index, und auf Rechnern ohne Hook
# (Jans Mac, 06.11.2026: „atlas.db fehlt") gab es gar keinen.
NACHBAU_S = 15 * 60


def nachbauen() -> None:
    import subprocess
    import time
    bauen = Path(__file__).resolve().parent / "atlas" / "bauen.py"
    if DB.exists() and time.time() - DB.stat().st_mtime < NACHBAU_S:
        return
    erst = not DB.exists()
    if erst:
        print("Atlas fehlt — wird gebaut (einmalig, einige Sekunden) …", file=sys.stderr)
    # Volltext sofort, Vektoren danach im Hintergrund (die erste Vektor-Rechnung dauert Minuten).
    subprocess.run([sys.executable, str(bauen), "--leise", "--ohne-vektoren"])
    if VENV.exists():
        subprocess.Popen([sys.executable, str(bauen), "--leise"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0], epilog=textwrap.dedent(__doc__.split("\n", 2)[2]),
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stichpunkte", nargs="*")
    ap.add_argument("--voll", help="Volltext der Treffer-Nummern (Komma)")
    ap.add_argument("--quelle", help="nur diese Quellen: memory, skill, repo, code, api, web-route, env, i18n, watch, git, sdk")
    ap.add_argument("--seit", help="Datum YYYY-MM-DD")
    ap.add_argument("--bis", help="Datum YYYY-MM-DD (Stichtag)")
    ap.add_argument("--mehr", type=int, default=1, help="Faktor fuer mehr Treffer je Gruppe")
    ap.add_argument("--kurz", type=int, metavar="N", help="nur die N besten Treffer, eine Zeile je Treffer (fuer den Hook)")
    a = ap.parse_args()
    nachbauen()
    if not DB.exists():
        sys.exit(f"Kein Atlas unter {DB} — Bau fehlgeschlagen: python3 scripts/atlas/bauen.py")
    db = sqlite3.connect(DB, timeout=30)
    if a.voll:
        voll(db, a.voll)
        return
    stichpunkte = [s.strip() for s in " ".join(a.stichpunkte).split(",") if s.strip()]
    if not stichpunkte:
        ap.print_help()
        return
    ws = woerter(stichpunkte)
    var = schreibweisen(db, ws)
    vek = suche_vektor(db, stichpunkte, a)
    ids = zusammen(suche_fts(db, fts_ausdruck(stichpunkte, var), a), vek)
    if a.kurz:
        kurzliste(db, ids, a.kurz)
        return
    gebaut = (db.execute("SELECT v FROM info WHERE k = 'gebaut'").fetchone() or ["?"])[0]
    print(f"Atlas vom {gebaut} · {len(ids)} Treffer für: {' | '.join(stichpunkte)}"
          + ("" if vek else "  (ohne Vektorsuche — venv fehlt?)"))
    if var:
        print("Schreibweisen mitgesucht: " + "; ".join(f"{w} → {', '.join(v)}" for w, v in var.items()))
    uebersicht(db, ids, ws + [v for vs in var.values() for v in vs], a.mehr)
    print("\nVolltext: scripts/kontext.py --voll <nr>[,<nr>]")


if __name__ == "__main__":
    main()
