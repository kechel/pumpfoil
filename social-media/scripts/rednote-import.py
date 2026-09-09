#!/usr/bin/env python3
"""rednote-import.py — die Beitragsliste von Xiaohongshu/RedNote mitschreiben.

RedNote hat **keine API**. Die Zahlen stehen nur im Creator-Bereich unter
笔记管理, und zwar als Kartenliste mit fuenf Symbolen je Beitrag:

    👁 Aufrufe · 💬 Kommentare · ❤️ Likes · ⭐ 收藏 (Speichern) · ↗️ Geteilt

Derselbe Weg wie bei der Facebook Content Library (`fb-library.py`):

    # im Browser: creator.rednote.com → 笔记管理 → ganz nach unten scrollen,
    # damit ALLE Karten nachgeladen sind. Dann Rechtsklick auf die Liste →
    # Untersuchen → das <div class="panel"> kopieren ("Copy outerHTML")
    ./rednote-import.py --import ~/Downloads/rednote.html
    ./rednote-import.py --list
    ./rednote-import.py --series 132        # Zeitverlauf eines Beitrags

Geschrieben wird in dieselbe `.stats.sqlite3` wie die uebrigen Kennzahlen, in
dieselben Tabellen `post` / `post_stat` wie YouTube, TikTok, Instagram und
Facebook — RedNote steht damit im Auswertungs-Tab neben den anderen.

Zwei Eigenheiten gegenueber den API-Plattformen:

* **收藏 braucht eine eigene Spalte.** Auf einer Such-Plattform ist Speichern
  die wertvollste Aktion, und `post_stat` kannte nur views/likes/comments/
  shares. Die Spalte `saves` kommt additiv dazu; die anderen Plattformen
  lassen sie leer.
* **Die laufende Nummer steht nicht im Titel.** Sie wird ueber die
  chinesischen Titel aus dem Caption-Cache zurueckgerechnet. Wurde ein Titel
  auf RedNote von Hand geaendert, findet die Zuordnung ihn nicht mehr —
  deshalb bleibt eine einmal gefundene Nummer stehen, und `--nummer` setzt
  sie notfalls direkt.
"""
import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util

BASE = Path(__file__).resolve().parent.parent
# STATS_DB nur zum Ausprobieren gegen eine Kopie — normal ist die echte DB.
DB = Path(os.environ.get("STATS_DB") or BASE / ".stats.sqlite3")
PLATTFORM = "rednote"

# Reihenfolge der fuenf Zahlen unter jeder Karte, so wie RedNote sie zeichnet.
FELDER = ("views", "comments", "likes", "saves", "shares")


def studio():
    """shorts-musik.py laden — der Dateiname hat einen Bindestrich."""
    spec = importlib.util.spec_from_file_location(
        "shorts_musik", Path(__file__).resolve().parent / "shorts-musik.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------- Parser -----

class Liste(HTMLParser):
    """Liest die Karten aus 笔记管理.

    Bewusst zustandsbehaftet statt mit Regex: die Karten sind tief
    verschachtelt, und die Zahlen stehen in namenlosen <span> innerhalb von
    `.note-card__stat` — ihre Bedeutung ergibt sich allein aus der Reihenfolge.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.karten = []
        self.geplant = []           # 定时发布 — noch keine Zahlen, aber ein Datum
        self.unvollstaendig = []    # 审核中 / 未通过 — keine vergleichbare Zeile
        self.gesamt = None          # aus dem Reiter "全部 12"
        self.tiefe = 0              # div-Tiefe innerhalb der aktuellen Karte
        self.karte = None
        self.sammeln = None         # welches Feld gerade Text bekommt
        self.im_stat = False
        self._aktiv_tab = False

    @staticmethod
    def _klassen(attrs):
        return dict(attrs).get("class", "").split()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        kl = self._klassen(attrs)

        if "tab-item--active" in kl:
            self._aktiv_tab = True

        if self.karte is not None and tag == "div":
            self.tiefe += 1

        if "note-card" in kl and self.karte is None:
            note_id = None
            try:
                imp = json.loads(a.get("data-impression") or "{}")
                note_id = imp["noteTarget"]["value"]["noteId"]
            except (ValueError, KeyError, TypeError):
                pass
            self.karte = {"note_id": note_id, "tag": None}
            self.tiefe = 1
            self.zahlen = []
            return

        if self.karte is None:
            return

        if "note-card__stat" in kl:
            self.im_stat = True
        elif "note-card__title" in kl:
            self.sammeln = "title"
        elif "note-card__time" in kl:
            self.sammeln = "time"
        elif "note-card__schedule" in kl:
            self.sammeln = "schedule"
        elif "note-card__tag" in kl:
            self.sammeln = "tag"
        elif "play_time" in kl and "play_time_wrap" not in kl:
            self.sammeln = "dauer"
        elif self.im_stat and tag == "span":
            self.sammeln = "zahl"

    def handle_data(self, data):
        if self._aktiv_tab:
            m = re.search(r"(\d+)", data)
            if m:
                self.gesamt = int(m.group(1))
            self._aktiv_tab = False
        if self.karte is None or not self.sammeln:
            return
        text = data.strip()
        if not text:
            return
        if self.sammeln == "zahl":
            self.zahlen.append(text)
        else:
            self.karte[self.sammeln] = (self.karte.get(self.sammeln) or "") + text

    def handle_endtag(self, tag):
        if self.sammeln:
            self.sammeln = None
        if self.karte is None:
            return
        if tag == "div":
            if self.im_stat:
                self.im_stat = False
            self.tiefe -= 1
            if self.tiefe == 0:
                self._karte_fertig()

    def _karte_fertig(self):
        k, self.karte = self.karte, None
        if not k.get("note_id"):
            return
        if len(self.zahlen) == len(FELDER):
            for feld, wert in zip(FELDER, self.zahlen):
                k[feld] = _zahl(wert)
            self.karten.append(k)
        elif k.get("schedule"):
            # 定时发布: geplant, aber noch nicht draussen. Kein Messpunkt — die
            # Karte hat keine Zahlenzeile —, aber der Termin ist es wert,
            # mitgeschrieben zu werden: geht der Beitrag live, haengen die
            # Zahlen an derselben noteId.
            k["time"] = _pekingzeit(k.get("time"))
            self.geplant.append(k)
        else:
            # 审核中 / 未通过 — weder Zahlen noch Termin.
            self.unvollstaendig.append(k)


def _pekingzeit(text):
    """'2026-09-20 05:00 （GMT+8:00 北京时间）' -> '2026-09-20 05:00'.

    Der Zusatz steht NUR bei geplanten Beitraegen. Veroeffentlichte Karten
    zeigen dieselbe Zeitzone ohne Hinweis (Beleg: die ersten fuenf Beitraege
    stehen laut REDNOTE.md seit dem 07.09. online und tragen hier
    '2026-09-08 02:5x' — das geht nur als Pekinger Zeit auf). Beide Faelle
    landen damit in derselben Zeitzone in der Spalte.
    """
    return re.sub(r"\s*（.*$", "", (text or "")).strip() or None


def _zahl(text):
    """'1.2万' und '3,4k' kommen bei groesseren Konten vor."""
    t = text.strip().replace(",", "")
    m = re.match(r"^([\d.]+)\s*([万kKwW]?)$", t)
    if not m:
        return None
    wert = float(m.group(1))
    if m.group(2) in ("万", "w", "W"):
        wert *= 10_000
    elif m.group(2) in ("k", "K"):
        wert *= 1_000
    return int(wert)


# ------------------------------------------------------------ Nummern -----

def _stamm(titel: str) -> str:
    """Titel auf das Vergleichbare eindampfen: ohne Nummernpraefix, ohne den
    angehaengten Suchbegriff, ohne Satzzeichen und Emoji."""
    t = re.sub(r"^-?\d{1,3}\s+[Pp]umpfoil\s+\d{4}\s*", "", titel or "")
    t = t.split("｜")[0].split("|")[0]
    return re.sub(r"[^\w一-鿿]", "", t)


def finde_nummer(idx, titel):
    """Nummer zu einem RedNote-Titel — exakt, sonst ueber den Anfang.

    RedNote schneidet Titel bei 20 Zeichen ab, unsere Captions sind oft laenger.
    Ein eindeutiger Praefix-Treffer ist deshalb genauso gut wie ein exakter
    ("Success or Fail 2" -> "Success or Fail 2 — 每次尝试都是进步"). Mehrdeutig
    oder zu kurz heisst weiterhin: keine Nummer, dann setzt --nummer sie.
    """
    s = _stamm(titel)
    if not s:
        return None
    if s in idx:
        return idx[s]
    if len(s) >= 6:
        treffer = {n for stamm, n in idx.items() if stamm.startswith(s)}
        if len(treffer) == 1:
            return treffer.pop()
    return None


def nummern_index(sm):
    """zh-Titel → laufende Nummer, aus beiden Caption-Caches."""
    idx = {}

    def merken(titel, nummer):
        s = _stamm(titel)
        if s and nummer and s not in idx:
            idx[s] = nummer

    for name, eintrag in sm._load_json(sm.CAPTIONS_CACHE_FILE, {}).items():
        m = sm.NUM_RE.match(name)
        if m:
            zh = sm.zh_begriffe(eintrag).get("titles", {}).get("zh")
            merken(zh, int(m.group(1)))

    fortschritt = sm._load_json(sm.YT_BATCH_PROGRESS_FILE, {})
    batch = sm._load_json(sm.YT_BATCH_CACHE_FILE, {})
    for vid, eintrag in fortschritt.items():
        m = sm.NUM_TITLE_RE.match(str(eintrag.get("title", "")))
        if m and vid in batch:
            zh = sm.zh_begriffe(batch[vid]).get("titles", {}).get("zh")
            merken(zh, int(m.group(1)))
    return idx


# ------------------------------------------------------------------ DB -----

def connect():
    if not DB.exists():
        sys.exit(f"{DB} fehlt — erst stats-snapshot.py laufen lassen.")
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    spalten = {r["name"] for r in db.execute("PRAGMA table_info(post_stat)")}
    if "saves" not in spalten:
        # 收藏 hat auf RedNote keinen Platz in views/likes/comments/shares und
        # ist dort die wichtigste Zahl. Additiv: die anderen Plattformen
        # schreiben weiter NULL hinein.
        db.execute("ALTER TABLE post_stat ADD COLUMN saves INTEGER")
        db.commit()
        print("post_stat: Spalte 'saves' ergaenzt (收藏)")
    return db


def letzte_werte(db):
    """Je Beitrag der zuletzt gespeicherte Stand — fuer die Regel
    'eine Zeile nur bei geaenderten Werten'."""
    rows = db.execute(
        "SELECT post_id, views, likes, comments, shares, saves FROM post_stat s "
        "WHERE platform=? AND snapshot_id = (SELECT MAX(snapshot_id) FROM post_stat "
        "  WHERE platform=s.platform AND post_id=s.post_id)", (PLATTFORM,))
    return {r["post_id"]: (r["views"], r["likes"], r["comments"], r["shares"], r["saves"])
            for r in rows}


def importieren(pfad, note=None):
    roh = Path(pfad).read_text(encoding="utf-8") if pfad != "-" else sys.stdin.read()
    p = Liste()
    p.feed(roh)
    if not p.karten and not p.geplant:
        sys.exit("Keine Karten gefunden — wurde das <div class=\"panel\"> kopiert?")

    sm = studio()
    idx = nummern_index(sm)
    db = connect()
    jetzt = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    cur = db.execute("INSERT INTO snapshot (captured_at, note) VALUES (?,?)",
                     (jetzt, note or "rednote 笔记管理 von Hand"))
    snap = cur.lastrowid
    alt = letzte_werte(db)

    neu = unveraendert = 0
    ohne_nummer = []

    def post_zeile(k, nummer):
        db.execute(
            "INSERT INTO post VALUES (?,?,?,?,?,?,?) "
            "ON CONFLICT (platform, post_id) DO UPDATE SET last_seen=excluded.last_seen,"
            # Titel duerfen sich aendern (auf RedNote wird nachbearbeitet),
            # eine einmal gefundene Nummer nicht — nach einer Umbenennung
            # findet die Titel-Zuordnung sie sonst nicht mehr wieder.
            " title=COALESCE(excluded.title, post.title),"
            " published_at=COALESCE(excluded.published_at, post.published_at),"
            " number=COALESCE(post.number, excluded.number)",
            (PLATTFORM, k["note_id"], nummer, k.get("time"), k.get("title"), snap, snap))
    for k in p.karten + p.geplant:
        nummer = finde_nummer(idx, k.get("title", ""))
        post_zeile(k, nummer)
        if nummer is None and db.execute(
                "SELECT number FROM post WHERE platform=? AND post_id=?",
                (PLATTFORM, k["note_id"])).fetchone()["number"] is None:
            ohne_nummer.append(k)

        if "views" not in k:            # geplant: Termin ja, Zahlen nein
            continue
        werte = (k["views"], k["likes"], k["comments"], k["shares"], k["saves"])
        if alt.get(k["note_id"]) == werte:
            unveraendert += 1
            continue
        db.execute("INSERT OR REPLACE INTO post_stat "
                   "(platform, post_id, snapshot_id, views, likes, comments, shares, saves)"
                   " VALUES (?,?,?,?,?,?,?,?)",
                   (PLATTFORM, k["note_id"], snap) + werte)
        neu += 1
    db.commit()

    print(f"Snapshot #{snap} · {jetzt}")
    print(f"{len(p.karten)} Karten gelesen · {neu} neue Messpunkte · "
          f"{unveraendert} unveraendert")
    if p.geplant:
        print(f"{len(p.geplant)} geplant (定时发布), Termine in Pekinger Zeit:")
        for k in sorted(p.geplant, key=lambda x: x.get("time") or ""):
            nr = db.execute("SELECT number FROM post WHERE platform=? AND post_id=?",
                            (PLATTFORM, k["note_id"])).fetchone()["number"]
            print(f"   {k.get('time')}  {f'{nr:03d}' if nr else '  —'}  {k.get('title')}")
    if p.unvollstaendig:
        print(f"{len(p.unvollstaendig)} ohne Zahlenzeile (审核中 / 未通过) — "
              f"kein vergleichbarer Messpunkt, deshalb uebersprungen.")
    gelesen = len(p.karten) + len(p.geplant) + len(p.unvollstaendig)
    if p.gesamt and p.gesamt > gelesen:
        print(f"⚠️  Der Reiter meldet {p.gesamt} Beitraege, gelesen wurden "
              f"{gelesen}. Vor dem Kopieren ganz nach unten scrollen, damit "
              f"alle Karten nachgeladen sind.")
    for k in ohne_nummer:
        print(f"   ohne Nummer: {k['note_id']}  {k.get('title')}"
              f"   → ./rednote-import.py --nummer {k['note_id']}=<nr>")


def nummer_setzen(zuweisungen):
    db = connect()
    for z in zuweisungen:
        note_id, _, nr = z.partition("=")
        if not nr.isdigit():
            sys.exit(f"'{z}' — erwartet wird <noteId>=<nummer>")
        n = db.execute("UPDATE post SET number=? WHERE platform=? AND post_id=?",
                       (int(nr), PLATTFORM, note_id)).rowcount
        print(f"{note_id} → {nr}" if n else f"{note_id}: nicht in der DB")
    db.commit()


def vergessen(note_ids):
    """Einen Beitrag aus der DB nehmen, der auf RedNote geloescht wurde.

    Kommt bei geplanten Beitraegen vor: Termin abgesagt, die Zeile bleibt aber
    stehen und taucht weiter in der Dublettenpruefung auf. Messpunkte werden
    NICHT stillschweigend mitgeloescht — hat der Beitrag welche, bricht es ab.
    """
    db = connect()
    for note_id in note_ids:
        n = db.execute("SELECT COUNT(*) c FROM post_stat WHERE platform=? AND post_id=?",
                       (PLATTFORM, note_id)).fetchone()["c"]
        if n:
            sys.exit(f"{note_id} hat {n} Messpunkte — nicht geloescht. "
                     f"Gemessene Zahlen wirft dieses Skript nicht weg.")
        row = db.execute("SELECT title FROM post WHERE platform=? AND post_id=?",
                         (PLATTFORM, note_id)).fetchone()
        if not row:
            print(f"{note_id}: nicht in der DB")
            continue
        db.execute("DELETE FROM post WHERE platform=? AND post_id=?", (PLATTFORM, note_id))
        print(f"entfernt: {note_id}  {row['title']}")
    db.commit()


def liste():
    db = connect()
    rows = db.execute(
        "SELECT p.number, p.title, p.published_at, s.views, s.likes, s.comments,"
        "       s.saves, s.shares "
        "FROM post p JOIN post_stat s ON s.platform=p.platform AND s.post_id=p.post_id "
        "WHERE p.platform=? AND s.snapshot_id = (SELECT MAX(snapshot_id) FROM post_stat"
        "  WHERE platform=p.platform AND post_id=p.post_id) "
        "ORDER BY s.views DESC", (PLATTFORM,)).fetchall()
    if not rows:
        sys.exit("Noch nichts importiert.")
    print(f"{'nr':>4}  {'👁':>6} {'❤':>4} {'💬':>4} {'⭐':>4} {'↗':>4}  Titel")
    for r in rows:
        nr = f"{r['number']:03d}" if r["number"] else "—"
        print(f"{nr:>4}  {r['views'] or 0:6d} {r['likes'] or 0:4d} {r['comments'] or 0:4d} "
              f"{r['saves'] or 0:4d} {r['shares'] or 0:4d}  {r['title']}")
    print(f"\n{len(rows)} Beitraege · Summe {sum(r['views'] or 0 for r in rows)} Aufrufe · "
          f"{sum(r['saves'] or 0 for r in rows)} 收藏")


def serie(wen):
    db = connect()
    if wen.isdigit() and len(wen) <= 3:
        wo, arg = "p.number=?", int(wen)
    else:
        wo, arg = "p.post_id=?", wen
    rows = db.execute(
        "SELECT n.captured_at, p.title, s.views, s.likes, s.comments, s.saves, s.shares "
        "FROM post p JOIN post_stat s ON s.platform=p.platform AND s.post_id=p.post_id "
        "JOIN snapshot n ON n.id=s.snapshot_id "
        f"WHERE p.platform=? AND {wo} ORDER BY s.snapshot_id", (PLATTFORM, arg)).fetchall()
    if not rows:
        sys.exit(f"Nichts gefunden zu '{wen}'.")
    print(rows[-1]["title"])
    print(f"{'Stand':<21} {'👁':>6} {'❤':>4} {'💬':>4} {'⭐':>4} {'↗':>4}")
    for r in rows:
        print(f"{r['captured_at'][:19]:<21} {r['views'] or 0:6d} {r['likes'] or 0:4d} "
              f"{r['comments'] or 0:4d} {r['saves'] or 0:4d} {r['shares'] or 0:4d}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--import", dest="datei", metavar="HTML",
                    help="kopiertes <div class=\"panel\"> aus 笔记管理 ('-' = stdin)")
    ap.add_argument("--note", help="Bemerkung zum Snapshot")
    ap.add_argument("--vergessen", nargs="+", metavar="NOTE_ID",
                    help="auf RedNote geloeschte Beitraege aus der DB nehmen "
                         "(nur solche ohne Messpunkte)")
    ap.add_argument("--nummer", nargs="+", metavar="ID=NR",
                    help="laufende Nummer von Hand zuordnen")
    ap.add_argument("--list", action="store_true", help="aktueller Stand")
    ap.add_argument("--series", metavar="NR|ID", help="Zeitverlauf eines Beitrags")
    a = ap.parse_args()
    if a.datei:
        importieren(a.datei, a.note)
    elif a.vergessen:
        vergessen(a.vergessen)
    elif a.nummer:
        nummer_setzen(a.nummer)
    elif a.series:
        serie(a.series)
    elif a.list:
        liste()
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
