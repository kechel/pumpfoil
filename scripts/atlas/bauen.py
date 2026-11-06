#!/usr/bin/env python3
"""Projekt-Atlas: ein Suchindex ueber alles, was es zum Projekt zu wissen gibt (06.11.2026).

WARUM: Das Wissen steht verstreut — CLAUDE.md, docs/, READMEs, Memories, Git-Log, Code-Kommentare,
die SDK-Dokus der Uhren-Plattformen. Von Hand gepflegte Uebersichten veralten. Dieser Index wird
nur GEBAUT, nie gepflegt: was in den Quellen steht, ist auffindbar; was dort fehlt, gehoert dort
nachgetragen (Memory, Doku-Absatz), nicht hier.

Die Datenbank liegt AUSSERHALB des Repos (Standard ~/pumpfoil-atlas/atlas.db, ATLAS_DB ueberschreibt):
die Memories nennen Nutzer, das Repo ist oeffentlich. Sie ist jederzeit neu baubar, also kein
Backup-Gut.

Inkrementell: je Datei werden mtime und Groesse gemerkt, nur Geaendertes wird neu gelesen (der
SessionStart-Hook ruft das bei jedem Start). `--neu` baut alles von vorn.

Abfrage: scripts/atlas/wo.py
"""
from __future__ import annotations

import argparse
import hashlib
import html.parser
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOME = Path.home()
DB = Path(os.environ.get("ATLAS_DB", HOME / "pumpfoil-atlas" / "atlas.db"))
MEMORY = HOME / ".claude/projects/-home-jan-garmin-connect-iq/memory"
CIQ = (HOME / "connectiq-sdk").resolve()
STUECK = 1800   # Zeichen je Treffer-Abschnitt, ungefaehr
# Hochzaehlen, wenn sich das Zerlegen aendert: dann wird jede Datei neu gelesen (Vektoren bleiben, s. vektoren.py).
BAU_VERSION = "2"

SCHEMA = """
CREATE TABLE IF NOT EXISTS dateien (pfad TEXT PRIMARY KEY, quelle TEXT, mtime REAL, groesse INTEGER);
CREATE VIRTUAL TABLE IF NOT EXISTS stuecke USING fts5(
    quelle UNINDEXED, pfad UNINDEXED, zeile UNINDEXED, datum UNINDEXED, h UNINDEXED, titel, text,
    tokenize = "unicode61 remove_diacritics 2");
CREATE TABLE IF NOT EXISTS info (k TEXT PRIMARY KEY, v TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS woerter USING fts5vocab(stuecke, row);
"""


# ---------------------------------------------------------------- Zerlegen

def md_stuecke(text: str) -> list[tuple[int, str, str]]:
    """Markdown/Text nach Ueberschriften, lange Abschnitte nach Absaetzen. -> (zeile, titel, text)."""
    out, titel, puffer, start = [], "", [], 1
    pfad_titel: list[str] = []

    def weg():
        t = "\n".join(puffer).strip()
        if t:
            # zu lange Abschnitte an Leerzeilen teilen
            teile, akt, akt_start, z = [], [], start, start
            for zeile in puffer:
                akt.append(zeile)
                if not zeile.strip() and sum(len(a) for a in akt) > STUECK:
                    teile.append((akt_start, "\n".join(akt).strip())); akt, akt_start = [], z + 1
                z += 1
            if akt and "\n".join(akt).strip():
                teile.append((akt_start, "\n".join(akt).strip()))
            for s, tx in teile:
                out.append((s, titel, tx))

    for i, zeile in enumerate(text.splitlines(), 1):
        m = re.match(r"^(#{1,4})\s+(.*)", zeile)
        if m:
            weg()
            tiefe = len(m.group(1))
            pfad_titel = pfad_titel[:tiefe - 1] + [m.group(2).strip()]
            titel, puffer, start = " › ".join(pfad_titel), [zeile], i
        else:
            puffer.append(zeile)
    weg()
    return out


class _Html(html.parser.HTMLParser):
    BLOCK = {"p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4", "pre", "section", "dt", "dd", "table"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.teile: list[str] = []
        self.weg = 0
        self.titel = ""
        self._im_titel = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "header", "footer"):
            self.weg += 1
        if tag in ("h1", "h2", "h3"):
            self.teile.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag in self.BLOCK:
            self.teile.append("\n")
        if tag == "title":
            self._im_titel = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "header", "footer") and self.weg:
            self.weg -= 1
        if tag in ("h1", "h2", "h3"):
            self.teile.append("\n")
        if tag == "title":
            self._im_titel = False

    def handle_data(self, data):
        if self._im_titel:
            self.titel += data
        elif not self.weg:
            self.teile.append(data)


def html_text(roh: str) -> tuple[str, str]:
    p = _Html()
    p.feed(roh)
    text = re.sub(r"[ \t]+", " ", "".join(p.teile))
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return p.titel.strip(), text.strip()


# ---------------------------------------------------------------- Quellen

def git_daten() -> dict[str, str]:
    """Letzter Commit je Datei (YYYY-MM-DD), in einem Durchlauf."""
    r = subprocess.run(["git", "-C", str(ROOT), "log", "--format=\x01%cs", "--name-only"],
                       capture_output=True, text=True, check=True).stdout
    daten: dict[str, str] = {}
    datum = ""
    for zeile in r.splitlines():
        if zeile.startswith("\x01"):
            datum = zeile[1:]
        elif zeile and zeile not in daten:
            daten[zeile] = datum
    return daten


def repo_dateien() -> list[str]:
    r = subprocess.run(["git", "-C", str(ROOT), "ls-files"], capture_output=True, text=True, check=True)
    return r.stdout.splitlines()


DOKU = re.compile(r"(\.md|README[^/]*|\.txt)$")
DOKU_NICHT = re.compile(r"(node_modules|/build/|requirements|LICENSE|\.datenleck|/fixtures?/|testdata)")


def quellen_dateien() -> list[tuple[str, Path, str]]:
    """-> (quelle, pfad, art) fuer alle Datei-Quellen."""
    out = []
    for p in repo_dateien():
        if DOKU.search(p) and not DOKU_NICHT.search(p):
            out.append(("repo", ROOT / p, "md"))
    out.append(("repo", ROOT / "server/app/data/sportarten_stand.json", "json"))
    if MEMORY.exists():
        for f in sorted(MEMORY.glob("*.md")):
            out.append(("memory", f, "md"))
    for f in sorted((ROOT / ".claude/skills").glob("*/SKILL.md")):
        out.append(("skill", f, "md"))
    # SDK-Dokus (lokal installiert)
    if CIQ.exists():
        for f in sorted(CIQ.glob("*.html")):
            out.append((f"sdk:connectiq-{CIQ.name.split('-')[-1]}", f, "html"))
        for f in sorted((CIQ / "doc").rglob("*.html")):
            out.append((f"sdk:connectiq-{CIQ.name.split('-')[-1]}", f, "html"))
    for f in sorted((HOME / "garmin-doku").rglob("*.txt")):
        out.append(("sdk:garmin-connect-api", f, "md"))
    ext = HOME / "suuntoplus-editor/entpackt/extension"
    for f in sorted(ext.rglob("*.md")) if ext.exists() else []:
        if "node_modules" not in str(f):
            out.append(("sdk:suuntoplus", f, "md"))
    for f in sorted((HOME / "pumpfoil-atlas/web").rglob("*")) if (HOME / "pumpfoil-atlas/web").exists() else []:
        # von Hand abgelegte Web-Dokus (Store-Richtlinien usw.): <quelle>/<datum>-<name>.md|html
        if f.suffix in (".md", ".txt", ".html"):
            out.append((f"sdk:{f.parent.name}", f, "html" if f.suffix == ".html" else "md"))
    return out


def datei_stuecke(quelle: str, f: Path, art: str, gdatum: dict[str, str]) -> list[tuple]:
    try:
        roh = f.read_text(errors="replace")
    except OSError:
        return []
    try:
        rel = str(f.relative_to(ROOT))
        datum = gdatum.get(rel) or time.strftime("%Y-%m-%d", time.localtime(f.stat().st_mtime))
    except ValueError:
        rel = str(f).replace(str(HOME), "~")
        datum = time.strftime("%Y-%m-%d", time.localtime(f.stat().st_mtime))
    if quelle == "memory":
        m = re.search(r"modified:\s*(\d{4}-\d\d-\d\d)", roh)
        datum = m.group(1) if m else datum
        # Kopf: nur Name + Beschreibung behalten, die Verwaltungsfelder sind Rauschen
        k = re.match(r"---\n(.*?)\n---\n", roh, re.S)
        if k:
            name = re.search(r"^name:\s*(.+)$", k.group(1), re.M)
            besch = re.search(r"^description:\s*(.+)$", k.group(1), re.M)
            kopf = besch.group(1).strip().strip('"') if besch else ""
            # Leerzeilen auffuellen, damit die Zeilennummern stimmen
            roh = (f"# {name.group(1).strip() if name else f.stem}\n{kopf}\n"
                   + "\n" * (k.group(0).count("\n") - 2) + roh[k.end():])
    if art == "html":
        titel, text = html_text(roh)
        teile = md_stuecke(text)
        return [(quelle, rel, z, datum, (titel + " › " + t) if t else titel, tx) for z, t, tx in teile]
    if art == "json":
        try:
            d = json.loads(roh)
        except ValueError:
            return []
        out = []
        for k, v in (d.items() if isinstance(d, dict) else enumerate(d)):
            out.append((quelle, rel, 0, datum, f"{f.stem} › {k}", json.dumps(v, ensure_ascii=False, indent=1)[:6000]))
        return out
    erste = f.stem
    return [(quelle, rel, z, datum, t or erste, tx) for z, t, tx in md_stuecke(roh)]


# ---------------------------------------------------------------- Abgeleitete Verzeichnisse (immer neu)

def api_routen() -> list[tuple]:
    out = []
    praefix_main = {}
    main = (ROOT / "server/app/main.py").read_text()
    for m in re.finditer(r"include_router\((\w+)\.(\w+)(?:,\s*prefix=\"([^\"]*)\")?", main):
        praefix_main[(m.group(1), m.group(2))] = m.group(3) or ""
    for f in sorted((ROOT / "server/app/api").glob("*.py")) + [ROOT / "server/app/main.py"]:
        src = f.read_text()
        router_praefix = {m.group(1): m.group(2) or "" for m in re.finditer(
            r"^(\w+)\s*=\s*APIRouter\((?:[^)]*?prefix=\"([^\"]*)\")?", src, re.M)}
        zeilen = src.splitlines()
        for i, z in enumerate(zeilen):
            m = re.match(r"\s*@(\w+)\.(get|post|put|patch|delete|websocket)\(\s*\"([^\"]*)\"", z)
            if not m:
                continue
            obj, verb, pfad = m.groups()
            voll = praefix_main.get((f.stem, obj), "") + router_praefix.get(obj, "") + pfad
            # Funktion + erste Docstring-Zeile
            fn, doc = "", ""
            for j in range(i + 1, min(i + 8, len(zeilen))):
                fm = re.match(r"\s*(?:async\s+)?def\s+(\w+)", zeilen[j])
                if fm:
                    fn = fm.group(1)
                    for k in range(j + 1, min(j + 12, len(zeilen))):
                        dm = re.match(r'\s*"""(.*)', zeilen[k])
                        if dm:
                            doc = dm.group(1).strip().rstrip('"')
                            break
                        if zeilen[k].strip().endswith(":") is False and zeilen[k].strip() and ")" in zeilen[k]:
                            continue
                    break
            out.append(("api", f"server/app/{'api/' if f.parent.name == 'api' else ''}{f.name}", i + 1, "",
                        f"{verb.upper()} {voll}", f"{verb.upper()} {voll} → {fn}()\n{doc}"))
    return out


def web_seiten() -> list[tuple]:
    out = []
    f = ROOT / "web/src/main.tsx"
    for i, z in enumerate(f.read_text().splitlines(), 1):
        m = re.search(r"path:\s*\"([^\"]+)\".*?element:\s*<(\w+)", z)
        if m:
            out.append(("web-route", "web/src/main.tsx", i, "", f"Seite {m.group(1)}",
                        f"Route {m.group(1)} → {m.group(2)} (web/src/pages/{m.group(2)}.tsx?)\n{z.strip()}"))
    return out


def env_variablen() -> list[tuple]:
    """Env-Variablen, die der Code liest — nur NAMEN, nie Werte."""
    funde: dict[str, list[str]] = {}
    muster = re.compile(r"(?:os\.environ(?:\.get)?\(|os\.getenv\(|environ\[)\s*[\"']([A-Z][A-Z0-9_]+)[\"']")
    for p in repo_dateien():
        if p.endswith((".py", ".sh")) or p.endswith(".service") or "/deploy/" in f"/{p}":
            try:
                src = (ROOT / p).read_text(errors="replace")
            except (OSError, IsADirectoryError):
                continue
            for i, z in enumerate(src.splitlines(), 1):
                for m in muster.finditer(z):
                    funde.setdefault(m.group(1), []).append(f"{p}:{i}")
                for m in re.finditer(r"\$\{?([A-Z][A-Z0-9_]{3,})\}?", z) if p.endswith(".sh") else []:
                    pass
    # pydantic-Settings in app/config.py: Feldnamen in Grossschrift sind Env-Namen
    cfg = ROOT / "server/app/config.py"
    if cfg.exists():
        for i, z in enumerate(cfg.read_text().splitlines(), 1):
            m = re.match(r"\s{4}([a-z_][a-z0-9_]+)\s*:\s*[\w\[\]| ]+\s*=", z)
            if m:
                funde.setdefault(m.group(1).upper(), []).append(f"server/app/config.py:{i}")
    out = []
    for name, orte in sorted(funde.items()):
        out.append(("env", orte[0].split(":")[0], int(orte[0].split(":")[1]), "", f"Env {name}",
                    f"Umgebungsvariable {name} (Wert nur in server/.env bzw. Unit, nie im Repo)\ngelesen in: "
                    + ", ".join(orte[:12])))
    return out


def uebersetzungen() -> list[tuple]:
    """i18n-Schluessel mit deutschem und englischem Text: aus einem UI-Text findet man den Schluessel."""
    def lesen(sprache):
        d = {}
        f = ROOT / f"web/src/i18n/locales/{sprache}.ts"
        for i, z in enumerate(f.read_text().splitlines(), 1):
            m = re.match(r'\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"', z)
            if m:
                d[m.group(1)] = (i, m.group(2))
        return d
    de, en = lesen("de"), lesen("en")
    out = []
    for k, (i, t) in de.items():
        out.append(("i18n", "web/src/i18n/locales/de.ts", i, "", f"i18n {k}",
                    f"{k}\nde: {t}\nen: {en.get(k, (0, ''))[1]}"))
    return out


def uhren() -> list[tuple]:
    src = (ROOT / "watch/manifest.xml").read_text()
    ids = re.findall(r'iq:product id="([^"]+)"', src)
    return [("watch", "watch/manifest.xml", 0, "", "Garmin-Geraete im Manifest",
             f"{len(ids)} Connect-IQ-Produkte: " + ", ".join(ids))]


def commits() -> list[tuple]:
    r = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%x1e%h%x1f%cs%x1f%s%x1f%b"],
                       capture_output=True, text=True, check=True).stdout
    out = []
    for c in r.split("\x1e")[1:]:
        h, datum, betreff, rumpf = (c.split("\x1f") + ["", "", "", ""])[:4]
        rumpf = "\n".join(z for z in rumpf.splitlines() if not z.startswith(("Co-Authored-By", "Claude-Session")))
        out.append(("git", f"commit {h}", 0, datum, betreff, (betreff + "\n" + rumpf).strip()))
    return out


CODE_ENDUNG = (".py", ".ts", ".tsx", ".kt", ".swift", ".mc", ".js", ".sh")
SYMBOL = re.compile(
    r"^(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)"   # TS
    r"|(?:async\s+)?def\s+([a-zA-Z]\w+)|class\s+(\w+)"                                           # Python
    r"|(?:(?:private|internal|public|data|sealed|suspend|enum)\s+)*(?:fun|class|object)\s+(?:[\w.<>]+\.)?(\w+)"  # Kotlin
    r"|(?:(?:public|private|fileprivate|final)\s+)*(?:struct|enum|func|protocol)\s+(\w+)"          # Swift
    r"|(?:module|function)\s+(\w+))")                                                             # Monkey C
KOMMENTAR = ("#", "//", "/*", "*", '"""', "'''")


def code_dateien() -> list[tuple]:
    """Je Quelltextdatei ein Eintrag: Kopfkommentar + Namen der obersten Funktionen/Klassen/Komponenten.
    Damit findet `kontext.py` z. B. TeamIcon -> web/src/components/Icons.tsx; den Rest macht grep."""
    out = []
    for p in repo_dateien():
        if not p.endswith(CODE_ENDUNG) or DOKU_NICHT.search(p):
            continue
        try:
            zeilen = (ROOT / p).read_text(errors="replace").splitlines()
        except (OSError, IsADirectoryError):
            continue
        kopf = []
        for z in zeilen[:40]:
            zs = z.strip()
            if not zs:
                if kopf:
                    break
                continue
            if zs.startswith(("#!", "import ", "from ", "package ")):
                continue
            if zs.startswith(KOMMENTAR) or (kopf and kopf[0].startswith(('"""', "'''")) and '"""' not in kopf[-1][3:]):
                kopf.append(zs)
            else:
                break
        kopf_text = re.sub(r"(^|\s)(#|//|/\*+|\*/|\*|\"\"\"|''')", " ", " ".join(kopf))
        eingerueckt_ok = p.endswith((".kt", ".swift", ".mc"))
        syms: list[str] = []
        for z in zeilen:
            if not eingerueckt_ok and z[:1] in (" ", "\t"):
                continue
            m = SYMBOL.match(z.strip())
            if m:
                n = next(g for g in m.groups() if g)
                if n not in syms:
                    syms.append(n)
        if syms or kopf_text.strip():
            out.append(("code", p, 1, "", p,
                        (re.sub(r"\s+", " ", kopf_text).strip()[:900] + "\nSymbole: " + ", ".join(syms[:150])).strip()))
    return out


ABGELEITET = {"code": code_dateien, "api": api_routen, "web-route": web_seiten, "env": env_variablen, "i18n": uebersetzungen,
              "watch": uhren, "git": commits}


# ---------------------------------------------------------------- Bauen

def einfuegen(db, zeilen) -> None:
    """(quelle, pfad, zeile, datum, titel, text) + Inhalts-Hash h — daran haengen die Vektoren (vektoren.py)."""
    db.executemany("INSERT INTO stuecke VALUES (?,?,?,?,?,?,?)", [
        (q, p, z, d, hashlib.sha1(f"{t}\n{x}".encode()).hexdigest()[:16], t, x) for q, p, z, d, t, x in zeilen])


def bauen(neu: bool, leise: bool, vektoren: bool = True) -> None:
    DB.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(DB.parent, 0o700)
    # Nur ein Lauf zugleich (der Hook startet bei jeder Sitzung, auch bei mehreren parallel).
    import fcntl
    sperre = open(DB.parent / "bauen.lock", "w")
    try:
        fcntl.flock(sperre, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        if not leise:
            print("atlas: ein anderer Lauf baut gerade")
        return
    if neu and DB.exists():
        DB.unlink()
    db = sqlite3.connect(DB)
    db.executescript(SCHEMA)
    t0 = time.time()
    gdatum = git_daten()
    alt = db.execute("SELECT v FROM info WHERE k = 'version'").fetchone()
    if not alt or alt[0] != BAU_VERSION:
        db.execute("DELETE FROM dateien")
        db.execute("DELETE FROM stuecke")
        db.execute("INSERT OR REPLACE INTO info VALUES ('version', ?)", (BAU_VERSION,))
    bekannt = {p: (m, g) for p, m, g in db.execute("SELECT pfad, mtime, groesse FROM dateien")}
    gesehen, geaendert = set(), 0
    for quelle, f, art in quellen_dateien():
        key = str(f)
        gesehen.add(key)
        try:
            st = f.stat()
        except OSError:
            continue
        if bekannt.get(key) == (st.st_mtime, st.st_size):
            continue
        stuecke = datei_stuecke(quelle, f, art, gdatum)
        rel = stuecke[0][1] if stuecke else key
        db.execute("DELETE FROM stuecke WHERE pfad = ? AND quelle = ?", (rel, quelle))
        einfuegen(db, stuecke)
        db.execute("INSERT OR REPLACE INTO dateien VALUES (?,?,?,?)", (key, quelle, st.st_mtime, st.st_size))
        geaendert += 1
    # verschwundene Dateien
    for key in set(bekannt) - gesehen:
        f = Path(key)
        try:
            rel = str(f.relative_to(ROOT))
        except ValueError:
            rel = key.replace(str(HOME), "~")
        db.execute("DELETE FROM stuecke WHERE pfad = ?", (rel,))
        db.execute("DELETE FROM dateien WHERE pfad = ?", (key,))
    # abgeleitete Verzeichnisse: billig, immer frisch
    for quelle, fn in ABGELEITET.items():
        db.execute("DELETE FROM stuecke WHERE quelle = ?", (quelle,))
        try:
            einfuegen(db, fn())
        except Exception as e:   # eine kaputte Quelle darf den Rest nicht verhindern
            print(f"atlas: {quelle} fehlgeschlagen: {e}", file=sys.stderr)
    db.execute("INSERT OR REPLACE INTO info VALUES ('gebaut', ?)", (time.strftime("%Y-%m-%d %H:%M"),))
    db.commit()
    n = db.execute("SELECT count(*) FROM stuecke").fetchone()[0]
    db.close()
    if not leise:
        print(f"atlas: {geaendert} Dateien neu gelesen, {n} Abschnitte, {time.time() - t0:.1f} s → {DB}")
    # Vektoren (aehnliche Themen, Deutsch<->Englisch) nur, wenn die venv dafuer da ist (s. vektoren.py)
    vpy = DB.parent / "venv/bin/python"
    if vektoren and vpy.exists():
        subprocess.run([str(vpy), str(Path(__file__).with_name("vektoren.py"))] + (["--leise"] if leise else []))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--neu", action="store_true", help="alles von vorn bauen")
    ap.add_argument("--leise", action="store_true")
    ap.add_argument("--ohne-vektoren", action="store_true")
    a = ap.parse_args()
    bauen(a.neu, a.leise, not a.ohne_vektoren)
