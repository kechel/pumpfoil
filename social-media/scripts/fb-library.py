#!/usr/bin/env python3
"""fb-library.py — die Facebook-Content-Library-Tabelle lokal mitschreiben.

Die Tabelle unter facebook.com/content/ zeigt Kennzahlen, die die Graph-API
nicht herausgibt, solange der Scope `read_insights` fehlt:

  Betrachter · Interaktionen · **Netto-Follower je Beitrag** · Impressionen ·
  Distribution (Faktor gegen den Kanalschnitt) · Wiedergabedauer · 3-Sek-
  und 1-Min-Aufrufe

Und sie enthaelt die **Gruppen-Beitraege**, die ueber die API voellig
unsichtbar sind (Metas Groups-API ist zu).

    # im Browser: Tabelle markieren, Rechtsklick → Untersuchen → <table>
    # kopieren ("Copy outerHTML") und in eine Datei sichern
    ./fb-library.py --import ~/Downloads/library.html
    ./fb-library.py --list
    ./fb-library.py --series 077     # Zeitverlauf eines Beitrags

Geschrieben wird in dieselbe .stats.sqlite3 wie die uebrigen Kennzahlen, mit
derselben Regel: **eine Zeile nur bei geaenderten Werten.** Zweimal dieselbe
Tabelle einlesen erzeugt also keine Dubletten.
"""
import argparse
import datetime as dt
import hashlib
import re
import sqlite3
import sys
from html.parser import HTMLParser
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DB = BASE / ".stats.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS library_post (
    key        TEXT PRIMARY KEY,   -- content_id, sonst Hash aus Text+Zeit
    surface    TEXT,               -- 'seite' oder der Gruppenname
    caption    TEXT,
    published  TEXT,               -- ISO, aus "Heute um 05:01" aufgeloest
    number     INTEGER,            -- Videonummer, falls zuordenbar
    first_seen TEXT, last_seen TEXT
);
CREATE TABLE IF NOT EXISTS library_stat (
    key TEXT NOT NULL, seen_at TEXT NOT NULL,
    views INTEGER, viewers INTEGER, interactions INTEGER,
    net_followers INTEGER, impressions INTEGER, comments INTEGER,
    distribution REAL,              -- +4,5x -> 4.5
    watch_seconds INTEGER, avg_watch_seconds INTEGER,
    views_3s INTEGER, views_60s INTEGER,
    PRIMARY KEY (key, seen_at)
);
CREATE INDEX IF NOT EXISTS library_series ON library_stat (key, seen_at);
"""

# Spaltenreihenfolge der Tabelle (aria-colindex 4 aufwaerts)
COLS = ["views", "viewers", "interactions", "net_followers", "impressions",
        "comments", "distribution", "watch_seconds", "avg_watch_seconds",
        "views_3s", "views_60s"]


class TableParser(HTMLParser):
    """Zieht die Zeilen aus dem <table>. Bewusst ohne Fremdbibliothek —
    die Struktur ist regelmaessig: role="row", darin aria-colindex-Zellen."""

    def __init__(self):
        super().__init__()
        self.rows, self.cur, self.cell = [], None, None
        self.href = None
        self.depth_group = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("role") == "row" and "gridcell" not in str(a):
            self.cur = {"cells": {}, "href": None}
        if self.cur is not None:
            if a.get("role") == "gridcell":
                self.cell = a.get("aria-colindex")
                self.cur["cells"].setdefault(self.cell, [])
            if tag == "a" and a.get("href"):
                self.cur["href"] = a["href"]
            # Das Gruppen-Icon (Personen-Symbol) steht nur bei Gruppenposts.
            # HTMLParser schreibt Attributnamen klein -> "viewbox", nicht "viewBox".
            if tag == "svg" and a.get("viewbox") == "0 0 12 12":
                self.cur["is_group"] = True

    def handle_endtag(self, tag):
        if tag == "tr" and self.cur is not None:
            if self.cur["cells"]:
                self.rows.append(self.cur)
            self.cur = None
        if tag == "td":
            self.cell = None

    def handle_data(self, data):
        if self.cur is not None and self.cell:
            t = data.strip()
            if t:
                self.cur["cells"][self.cell].append(t)


def num(s):
    """'21.832' -> 21832 · '--' -> None · '+4,5x' -> 4.5"""
    if s is None:
        return None
    s = s.strip().replace("‑", "-")
    if not s or set(s) <= {"-", "–", "—"}:
        return None
    if s.endswith("x"):
        try:
            return float(s[:-1].replace("+", "").replace(",", "."))
        except ValueError:
            return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return int(float(s))
    except ValueError:
        return None


def duration(s):
    """'28 Min. 16 Sek.' / '7 Tag(e), 17 Std.' / '9 Sek.' -> Sekunden"""
    if not s or "‑‑" in s or s.strip() == "--":
        return None
    total, found = 0, False
    for val, unit in re.findall(r"(\d+)\s*(Tag|Std|Min|Sek)", s):
        found = True
        total += int(val) * {"Tag": 86400, "Std": 3600, "Min": 60, "Sek": 1}[unit]
    return total if found else None


REL_TODAY = re.compile(r"Heute um (\d{1,2}):(\d{2})")
REL_YEST = re.compile(r"Gestern um (\d{1,2}):(\d{2})")
ABS_DATE = re.compile(r"(\d{1,2})\.\s*([A-Za-zä]+)\.?\s*um (\d{1,2}):(\d{2})")
MONTHS = {"Jan": 1, "Feb": 2, "Mär": 3, "Mar": 3, "Apr": 4, "Mai": 5, "Jun": 6,
          "Jul": 7, "Aug": 8, "Sep": 9, "Okt": 10, "Nov": 11, "Dez": 12}


def when(text, today):
    """Loest die relativen Angaben gegen den Import-Tag auf."""
    m = REL_TODAY.search(text)
    if m:
        return dt.datetime.combine(today, dt.time(int(m.group(1)), int(m.group(2))))
    m = REL_YEST.search(text)
    if m:
        return dt.datetime.combine(today - dt.timedelta(days=1),
                                   dt.time(int(m.group(1)), int(m.group(2))))
    m = ABS_DATE.search(text)
    if m:
        mon = MONTHS.get(m.group(2)[:3])
        if mon:
            year = today.year - (1 if mon > today.month else 0)
            return dt.datetime(year, mon, int(m.group(1)),
                               int(m.group(3)), int(m.group(4)))
    return None


CONTENT_ID = re.compile(r"content_id=([^&]+)")
NUM_IN_TEXT = re.compile(r"^(\d{1,3})\s+[Pp]umpfoil")


def parse(html: str, today: dt.date) -> list:
    p = TableParser()
    p.feed(html)
    out = []
    for r in p.rows:
        c = r["cells"]
        if "4" not in c:            # Kopfzeile
            continue
        head = " ".join(c.get("2", []))
        pub = when(head, today)
        # Oberflaeche: bei Gruppenposts steht der Name vor dem Datum
        surface = "seite"
        if r.get("is_group"):
            # Reihenfolge in der Zelle: [URL, "<Gruppenname> •", "<Datum> Uhr"]
            # -> der Gruppenname ist der Eintrag, der auf "•" endet.
            names = [x.strip().rstrip("•").strip() for x in c.get("2", [])
                     if x.strip().endswith("•") and "Veröffentlicht" not in x]
            surface = names[0] if names else "gruppe"
        cap = next((x for x in c.get("2", []) if len(x) > 25), "")
        cid = CONTENT_ID.search(r.get("href") or "")
        key = cid.group(1) if cid else hashlib.sha256(
            (surface + cap[:120] + (pub.isoformat() if pub else "")).encode()
        ).hexdigest()[:24]
        vals = {}
        for i, name in enumerate(COLS, start=4):
            raw = " ".join(c.get(str(i), []))
            vals[name] = duration(raw) if name.endswith("seconds") else num(raw)
        m = NUM_IN_TEXT.match(cap)
        out.append({"key": key, "surface": surface, "caption": cap,
                    "published": pub.isoformat() if pub else None,
                    "number": int(m.group(1)) if m else None, **vals})
    return out


def db():
    d = sqlite3.connect(DB)
    d.executescript(SCHEMA)
    return d


def do_import(path: Path, today: dt.date, dry=False):
    rows = parse(path.read_text(encoding="utf-8", errors="replace"), today)
    if not rows:
        print("Keine Zeilen erkannt — ist das wirklich das <table>-Element?")
        return
    d = db()
    now = dt.datetime.now().astimezone().replace(microsecond=0).isoformat()
    # Vergleich als Tupel, nicht als zusammengeklebter String: eine echte 0
    # darf nicht wie ein fehlender Wert aussehen.
    last = {r[0]: (r[1], r[2], r[3]) for r in d.execute(
        """SELECT key, views, interactions, net_followers
           FROM library_stat WHERE (key, seen_at) IN
           (SELECT key, MAX(seen_at) FROM library_stat GROUP BY key)""")}
    new = skip = 0
    for r in rows:
        sig = (r["views"], r["interactions"], r["net_followers"])
        d.execute("""INSERT INTO library_post VALUES (?,?,?,?,?,?,?)
                     ON CONFLICT(key) DO UPDATE SET last_seen=excluded.last_seen,
                       number=COALESCE(excluded.number, library_post.number)""",
                  (r["key"], r["surface"], r["caption"], r["published"],
                   r["number"], now, now))
        if last.get(r["key"]) == sig:
            skip += 1
            continue
        d.execute("INSERT OR REPLACE INTO library_stat VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (r["key"], now, r["views"], r["viewers"], r["interactions"],
                   r["net_followers"], r["impressions"], r["comments"],
                   r["distribution"], r["watch_seconds"], r["avg_watch_seconds"],
                   r["views_3s"], r["views_60s"]))
        new += 1
    if dry:
        d.rollback()
    else:
        d.commit()
    print(f"{len(rows)} Zeilen gelesen · {new} neu · {skip} unverändert"
          + ("  (--dry-run: nichts geschrieben)" if dry else ""))
    for r in rows:
        print(f"  {r['surface'][:26]:<27}{(r['caption'] or '')[:38]:<39}"
              f"{r['views'] or 0:>8}{r['interactions'] or 0:>7}"
              f"{r['net_followers'] or 0:>6} Foll.")


def do_list():
    d = db()
    rows = list(d.execute(
        """SELECT p.surface, p.caption, p.published, s.views, s.interactions,
                  s.net_followers, s.distribution, s.seen_at
           FROM library_post p JOIN library_stat s ON s.key = p.key
           WHERE (s.key, s.seen_at) IN (SELECT key, MAX(seen_at) FROM library_stat
                                        GROUP BY key)
           ORDER BY s.views DESC"""))
    if not rows:
        print("Noch nichts importiert.")
        return
    print(f"{'Oberfläche':<28}{'Aufrufe':>9}{'Inter.':>7}{'%':>7}{'Foll.':>6}{'Dist.':>7}  Beitrag")
    for sf, cap, pub, v, i, f, dist, seen in rows:
        pct = (i / v * 100) if v and i else 0
        print(f"{sf[:27]:<28}{v or 0:>9,}{i or 0:>7}{pct:>6.2f}%{f or 0:>6}"
              .replace(",", ".")
              + f"{('%+.1fx' % dist) if dist is not None else '  —':>7}  {(cap or '')[:40]}")


def do_series(q):
    d = db()
    keys = [r[0] for r in d.execute(
        "SELECT key FROM library_post WHERE caption LIKE ? OR number = ?",
        (f"%{q}%", num(q)))]
    if not keys:
        print(f"Nichts gefunden zu {q!r}")
        return
    for k in keys:
        p = d.execute("SELECT surface, caption FROM library_post WHERE key=?", (k,)).fetchone()
        print(f"\n{p[0]} · {p[1][:60]}")
        print(f"  {'gemessen':<18}{'Aufrufe':>9}{'Inter.':>7}{'Foll.':>6}")
        for at, v, i, f in d.execute(
                "SELECT seen_at, views, interactions, net_followers FROM library_stat"
                " WHERE key=? ORDER BY seen_at", (k,)):
            print(f"  {at[:16].replace('T',' '):<18}{v or 0:>9,}{i or 0:>7}{f or 0:>6}".replace(",", "."))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--import", dest="imp", metavar="DATEI")
    ap.add_argument("--date", help="Bezugstag für 'Heute/Gestern' (YYYY-MM-DD)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--series", metavar="NR-ODER-TEXT")
    a = ap.parse_args()
    day = dt.date.fromisoformat(a.date) if a.date else dt.date.today()
    if a.imp:
        do_import(Path(a.imp).expanduser(), day, a.dry_run)
    elif a.series:
        do_series(a.series)
    else:
        do_list()
