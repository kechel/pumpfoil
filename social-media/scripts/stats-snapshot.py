#!/usr/bin/env python3
"""Friert die Kanalzahlen lokal ein — Facebook, Instagram, YouTube, TikTok.

Hintergrund: Meta gibt die Länder-Demografie von Instagram nur noch für
`this_week` / `this_month` heraus (`last_30_days` & Co. sind abgeschafft), und
auch die reinen Aufrufzahlen sind bei jeder Plattform jederzeit widerrufbar.
Dieses Skript holt in einem Lauf alles, was die APIs hergeben, und schreibt es
mit Zeitstempel in eine SQLite-Datei. Die Historie entsteht dadurch, dass es
regelmäßig läuft (launchd-Timer, siehe stats-snapshot.plist).

Bewusst großzügig: neben den ausgewerteten Spalten landet jede Roh-Antwort als
JSON in `raw_blob`. Was wir heute nicht auswerten können, ist trotzdem da.

**Dedupliziert.** Die Läufe kommen nie zur exakt gleichen Zeit und liefern
meist dieselben Zahlen. Gespeichert wird deshalb nur, was sich gegenüber dem
letzten bekannten Stand GEÄNDERT hat — pro Kennzahl, nicht pro Lauf. Aus
`post_stat` wird so eine echte Änderungshistorie statt 158 identischer Zeilen
pro Tag; Roh-JSON wird über seinen SHA-256 nur einmal abgelegt. Der Snapshot
selbst wird immer vermerkt, auch wenn er nichts Neues brachte — dann weiß man
später, dass zu dem Zeitpunkt geprüft wurde und alles unverändert war.

    ./stats-snapshot.py                  # ein Snapshot, alle Plattformen
    ./stats-snapshot.py --only instagram # nur eine Plattform
    ./stats-snapshot.py --list           # was liegt schon in der DB?

Rein lesend gegenüber den APIs; die DB wird nur ergänzt, nie überschrieben.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
DB_PATH = BASE / ".stats.sqlite3"

# Das Studio-Skript bringt die ganze Auth (Token-Refresh, Graph-Paginierung)
# schon mit — hier nur importieren statt duplizieren.
_spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sm)

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshot (
    id          INTEGER PRIMARY KEY,
    captured_at TEXT NOT NULL,              -- ISO-8601, UTC
    note        TEXT
);
-- Stammdaten je Beitrag: aendern sich praktisch nie, stehen genau einmal da.
CREATE TABLE IF NOT EXISTS post (
    platform     TEXT NOT NULL,
    post_id      TEXT NOT NULL,
    number       INTEGER,                   -- laufende Videonummer, wenn erkennbar
    published_at TEXT,
    title        TEXT,
    first_seen   INTEGER NOT NULL,          -- snapshot.id
    last_seen    INTEGER NOT NULL,
    PRIMARY KEY (platform, post_id)
);
-- Aenderungshistorie der Zahlen: neue Zeile NUR bei abweichendem Wert.
CREATE TABLE IF NOT EXISTS post_stat (
    platform    TEXT NOT NULL,
    post_id     TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL,
    views INTEGER, likes INTEGER, comments INTEGER, shares INTEGER,
    PRIMARY KEY (platform, post_id, snapshot_id)
);
CREATE TABLE IF NOT EXISTS channel_stat (
    platform    TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL,
    posts INTEGER, views INTEGER, likes INTEGER, comments INTEGER,
    followers INTEGER,
    PRIMARY KEY (platform, snapshot_id)
);
CREATE TABLE IF NOT EXISTS channel_error (
    platform    TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL,
    error       TEXT NOT NULL,
    PRIMARY KEY (platform, snapshot_id)
);
CREATE TABLE IF NOT EXISTS demographic (
    platform    TEXT NOT NULL,
    metric      TEXT NOT NULL,              -- z.B. follower_demographics
    timeframe   TEXT NOT NULL,              -- lifetime | this_week | this_month
    breakdown   TEXT NOT NULL,              -- country | city | age | gender
    dimension   TEXT NOT NULL,              -- DE, IR, …
    snapshot_id INTEGER NOT NULL,
    value       INTEGER NOT NULL,
    PRIMARY KEY (platform, metric, timeframe, breakdown, dimension, snapshot_id)
);
-- Roh-JSON inhaltsadressiert: gleiche Antwort = ein Blob, egal wie oft geholt.
CREATE TABLE IF NOT EXISTS raw_blob (
    sha256  TEXT PRIMARY KEY,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw_ref (
    snapshot_id INTEGER NOT NULL,
    platform    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, platform, kind)
);
CREATE INDEX IF NOT EXISTS post_by_number ON post (platform, number);
CREATE INDEX IF NOT EXISTS stat_series    ON post_stat (platform, post_id, snapshot_id);
CREATE INDEX IF NOT EXISTS demo_series    ON demographic (platform, metric, dimension, snapshot_id);
"""


def connect():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    return db


class Sink:
    """Sammelt die Zeilen eines Laufs, vergleicht sie gegen den letzten Stand
    und schreibt nur die Abweichungen — am Ende in einer Transaktion, ein halb
    geschriebener Snapshot waere schlimmer als gar keiner."""

    def __init__(self, db, snap_id):
        self.db, self.id = db, snap_id
        self.posts, self.stats, self.demos = {}, [], []
        self.chans, self.errs, self.blobs, self.refs = [], [], {}, []
        self.skipped = 0
        # letzter bekannter Stand, einmal geladen statt pro Zeile abgefragt
        self._last_stat = {
            (p, i): (v, l, c, s) for p, i, v, l, c, s in db.execute(
                "SELECT platform, post_id, views, likes, comments, shares "
                "FROM post_stat WHERE (platform, post_id, snapshot_id) IN "
                "(SELECT platform, post_id, MAX(snapshot_id) FROM post_stat "
                " GROUP BY platform, post_id)")}
        self._last_demo = {
            (p, m, t, b, d): v for p, m, t, b, d, v in db.execute(
                "SELECT platform, metric, timeframe, breakdown, dimension, value "
                "FROM demographic WHERE (platform, metric, timeframe, breakdown, "
                "dimension, snapshot_id) IN (SELECT platform, metric, timeframe, "
                "breakdown, dimension, MAX(snapshot_id) FROM demographic "
                "GROUP BY platform, metric, timeframe, breakdown, dimension)")}
        self._last_chan = {
            p: (a, b, c, d, e) for p, a, b, c, d, e in db.execute(
                "SELECT platform, posts, views, likes, comments, followers "
                "FROM channel_stat WHERE (platform, snapshot_id) IN "
                "(SELECT platform, MAX(snapshot_id) FROM channel_stat "
                " GROUP BY platform)")}

    def raw(self, platform, kind, payload):
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256(blob.encode()).hexdigest()
        self.blobs[h] = blob
        self.refs.append((self.id, platform, kind, h))

    def post(self, platform, post_id, **kw):
        pid = str(post_id)
        self.posts[(platform, pid)] = (platform, pid, kw.get("number"),
                                       kw.get("published_at"), kw.get("title"),
                                       self.id, self.id)
        cur = (kw.get("views"), kw.get("likes"), kw.get("comments"), kw.get("shares"))
        if self._last_stat.get((platform, pid)) == cur:
            self.skipped += 1
            return
        self.stats.append((platform, pid, self.id) + cur)

    def demo(self, platform, metric, timeframe, breakdown, dimension, value):
        key = (platform, metric, timeframe, breakdown, dimension)
        if self._last_demo.get(key) == int(value):
            self.skipped += 1
            return
        self.demos.append(key + (self.id, int(value)))

    def channel(self, platform, **kw):
        cur = (kw.get("posts"), kw.get("views"), kw.get("likes"),
               kw.get("comments"), kw.get("followers"))
        if self._last_chan.get(platform) == cur:
            self.skipped += 1
            return
        self.chans.append((platform, self.id) + cur)

    def error(self, platform, msg):
        self.errs.append((platform, self.id, str(msg)[:400]))

    def flush(self):
        with self.db:
            # Stammdaten: einmal anlegen, danach nur last_seen fortschreiben
            self.db.executemany(
                "INSERT INTO post VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT (platform, post_id) DO UPDATE SET last_seen=excluded.last_seen,"
                " number=COALESCE(excluded.number, post.number),"
                " title=COALESCE(excluded.title, post.title)",
                list(self.posts.values()))
            self.db.executemany("INSERT OR REPLACE INTO post_stat VALUES (?,?,?,?,?,?,?)",
                                self.stats)
            self.db.executemany("INSERT OR REPLACE INTO demographic VALUES (?,?,?,?,?,?,?)",
                                self.demos)
            self.db.executemany("INSERT OR REPLACE INTO channel_stat VALUES (?,?,?,?,?,?,?)",
                                self.chans)
            self.db.executemany("INSERT OR REPLACE INTO channel_error VALUES (?,?,?)",
                                self.errs)
            self.db.executemany("INSERT OR IGNORE INTO raw_blob VALUES (?,?)",
                                list(self.blobs.items()))
            self.db.executemany("INSERT OR REPLACE INTO raw_ref VALUES (?,?,?,?)", self.refs)


def _number(text):
    m = sm.NUM_TITLE_RE.match((text or "").strip())
    return int(m.group(1)) if m else None


# ----------------------------------------------------------------- Meta -----

def meta_ids():
    tok = sm.meta_access_token()
    pid = sm.meta_client()["page_id"]
    pg = sm._http_json(f"{sm.GRAPH}/{pid}?fields=access_token,fan_count,followers_count,"
                       f"instagram_business_account&access_token={tok}")
    return pid, pg["access_token"], pg, (pg.get("instagram_business_account") or {}).get("id")


def collect_facebook(sink, pid, ptok, page):
    sink.raw("facebook", "page", page)
    # Wichtig: die Liste schlank halten. Nimmt man likes.summary in denselben
    # Feldsatz, bricht Graph die Paginierung stillschweigend ab (60 -> 45).
    reels = sm._graph_all(f"{sm.GRAPH}/{pid}/video_reels"
                          "?fields=id,description,created_time,views,permalink_url"
                          f"&limit=100&access_token={ptok}", 600)
    sink.raw("facebook", "video_reels", reels)
    total_v = total_l = 0
    for r in reels:
        likes = None
        try:
            d = sm._http_json(f"{sm.GRAPH}/{r['id']}?fields=likes.summary(true)"
                              f"&access_token={ptok}")
            likes = ((d.get("likes") or {}).get("summary") or {}).get("total_count")
        except Exception:
            pass                       # comments.summary braucht read_insights
        v = int(r.get("views") or 0)
        total_v += v
        total_l += likes or 0
        sink.post("facebook", r["id"], number=_number(r.get("description")),
                  published_at=r.get("created_time"), title=r.get("description"),
                  views=v, likes=likes)
    # Laendermetriken brauchen read_insights. Versuch trotzdem protokollieren,
    # damit spaeter sichtbar ist, ab wann der Scope da war.
    if reels:
        top = max(reels, key=lambda r: r.get("views") or 0)
        for metric in ("post_video_views_by_country_id",
                       "post_video_view_time_by_region_id"):
            try:
                d = sm._http_json(f"{sm.GRAPH}/{top['id']}/video_insights/{metric}"
                                  f"?access_token={ptok}")
                sink.raw("facebook", f"insights_{metric}", d)
                for item in d.get("data", []):
                    val = (item.get("values") or [{}])[0].get("value") or {}
                    for k, n in val.items():
                        sink.demo("facebook", metric, "lifetime", "country", k, n)
            except Exception as e:
                sink.raw("facebook", f"insights_{metric}_error", {"error": str(e)[:400]})
    sink.channel("facebook", posts=len(reels), views=total_v, likes=total_l,
                 followers=page.get("followers_count") or page.get("fan_count"))
    return len(reels), total_v


IG_DEMOGRAPHICS = [("follower_demographics", "lifetime"),
                   ("reached_audience_demographics", "this_week"),
                   ("reached_audience_demographics", "this_month"),
                   ("engaged_audience_demographics", "this_week"),
                   ("engaged_audience_demographics", "this_month")]
IG_BREAKDOWNS = ("country", "city", "age", "gender")


def collect_instagram(sink, ig, ptok):
    user = sm._http_json(f"{sm.GRAPH}/{ig}?fields=followers_count,media_count,username"
                         f"&access_token={ptok}")
    sink.raw("instagram", "user", user)
    media = sm._graph_all(f"{sm.GRAPH}/{ig}/media?fields=id,caption,media_type,timestamp,"
                          f"permalink,like_count,comments_count,insights.metric(views)"
                          f"&limit=100&access_token={ptok}", 600)
    sink.raw("instagram", "media", media)
    total_v = total_l = total_c = 0
    for m in media:
        views = None
        for x in ((m.get("insights") or {}).get("data") or []):
            if x["name"] == "views":
                views = x["values"][0]["value"]
        total_v += views or 0
        total_l += m.get("like_count") or 0
        total_c += m.get("comments_count") or 0
        sink.post("instagram", m["id"], number=_number(m.get("caption")),
                  published_at=m.get("timestamp"), title=m.get("caption"),
                  views=views, likes=m.get("like_count"),
                  comments=m.get("comments_count"))
    # Der eigentliche Grund fuer dieses Skript: diese Zahlen gibt es nur fuer
    # den laufenden Monat, danach sind sie unwiederbringlich weg.
    for metric, timeframe in IG_DEMOGRAPHICS:
        for bd in IG_BREAKDOWNS:
            q = f"metric={metric}&period=lifetime&breakdown={bd}&metric_type=total_value"
            if timeframe != "lifetime":
                q += f"&timeframe={timeframe}"
            try:
                d = sm._http_json(f"{sm.GRAPH}/{ig}/insights?{q}&access_token={ptok}")
            except Exception as e:
                sink.raw("instagram", f"demo_{metric}_{timeframe}_{bd}_error",
                         {"error": str(e)[:400]})
                continue
            sink.raw("instagram", f"demo_{metric}_{timeframe}_{bd}", d)
            for entry in d.get("data", []):
                for b in (entry.get("total_value") or {}).get("breakdowns", []):
                    for res in b.get("results", []):
                        sink.demo("instagram", metric, timeframe, bd,
                                  "|".join(res["dimension_values"]), res["value"])
    sink.channel("instagram", posts=len(media), views=total_v, likes=total_l,
                 comments=total_c, followers=user.get("followers_count"))
    return len(media), total_v


# -------------------------------------------------------------- YouTube -----

def collect_youtube(sink):
    import urllib.parse
    auth = {"Authorization": f"Bearer {sm.yt_access_token()}"}
    ch = sm._http_json("https://www.googleapis.com/youtube/v3/channels"
                       "?part=statistics,snippet&mine=true", headers=auth)
    sink.raw("youtube", "channel", ch)
    st = ch["items"][0]["statistics"]
    vids = sm.yt_numbered_stats()
    sink.raw("youtube", "videos", vids)
    total = 0
    for n, v in vids.items():
        total += v["views"]
        sink.post("youtube", v["video_id"], number=n, title=v["title"],
                  views=v["views"], likes=v.get("likes"))
    # Braucht yt-analytics.readonly UND die aktivierte Analytics-API im
    # Google-Projekt. Solange eins fehlt, wird nur der Fehler protokolliert.
    today = dt.date.today().isoformat()
    try:
        d = sm._http_json("https://youtubeanalytics.googleapis.com/v2/reports?"
                          + urllib.parse.urlencode({
                              "ids": "channel==MINE", "startDate": "2026-01-01",
                              "endDate": today,
                              "metrics": "views,estimatedMinutesWatched,likes",
                              "dimensions": "country", "sort": "-views",
                              "maxResults": "200"}), headers=auth)
        sink.raw("youtube", "analytics_country", d)
        for row in d.get("rows", []):
            sink.demo("youtube", "views_by_country", "2026-01-01/" + today,
                      "country", row[0], row[1])
    except Exception as e:
        sink.raw("youtube", "analytics_country_error", {"error": str(e)[:400]})
    sink.channel("youtube", posts=len(vids), views=total,
                 followers=int(st.get("subscriberCount") or 0))
    return len(vids), total


# --------------------------------------------------------------- TikTok -----

def collect_tiktok(sink):
    vids = sm.tt_videos(limit=500)
    sink.raw("tiktok", "videos", vids)
    total_v = total_l = total_c = 0
    for v in vids:
        total_v += int(v.get("view_count") or 0)
        total_l += int(v.get("like_count") or 0)
        total_c += int(v.get("comment_count") or 0)
        ts = v.get("create_time")
        sink.post("tiktok", v["id"], number=_number(v.get("video_description")),
                  published_at=(dt.datetime.fromtimestamp(int(ts), dt.timezone.utc)
                                .isoformat() if ts else None),
                  title=v.get("video_description"),
                  views=int(v.get("view_count") or 0),
                  likes=int(v.get("like_count") or 0),
                  comments=int(v.get("comment_count") or 0),
                  shares=int(v.get("share_count") or 0))
    sink.channel("tiktok", posts=len(vids), views=total_v, likes=total_l,
                 comments=total_c)
    return len(vids), total_v


# ------------------------------------------------------------------ CLI -----

ALL = ("facebook", "instagram", "youtube", "tiktok")


def run(only=None, note=None):
    db = connect()
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    cur = db.execute("INSERT INTO snapshot (captured_at, note) VALUES (?,?)", (now, note))
    db.commit()
    sink = Sink(db, cur.lastrowid)
    want = set(only) if only else set(ALL)
    print(f"Snapshot #{sink.id} · {now}")

    ptok = ig = pid = None
    if want & {"facebook", "instagram"}:
        try:
            pid, ptok, page, ig = meta_ids()
        except Exception as e:
            print(f"  Meta        FEHLER {str(e)[:110]}")
            for p in sorted(want & {"facebook", "instagram"}):
                sink.error(p, e)
    if ptok and "facebook" in want:
        try:
            n, v = collect_facebook(sink, pid, ptok, page)
            print(f"  facebook   {n:>4} Beiträge · {v:>9,} Views".replace(",", "."))
        except Exception as e:
            sink.error("facebook", e)
            print(f"  facebook    FEHLER {str(e)[:110]}")
    if ptok and ig and "instagram" in want:
        try:
            n, v = collect_instagram(sink, ig, ptok)
            print(f"  instagram  {n:>4} Beiträge · {v:>9,} Views".replace(",", "."))
        except Exception as e:
            sink.error("instagram", e)
            print(f"  instagram   FEHLER {str(e)[:110]}")
    for name, fn in (("youtube", collect_youtube), ("tiktok", collect_tiktok)):
        if name not in want:
            continue
        try:
            n, v = fn(sink)
            print(f"  {name:<10} {n:>4} Beiträge · {v:>9,} Views".replace(",", "."))
        except Exception as e:
            sink.error(name, e)
            print(f"  {name:<11} FEHLER {str(e)[:110]}")

    sink.flush()
    print(f"\nneu: {len(sink.stats)} Beitrags-Änderungen · {len(sink.demos)} Demografie-Werte "
          f"· {len(sink.chans)} Kanal-Summen · {len(sink.blobs)} Roh-Antworten"
          f"\nunverändert übersprungen: {sink.skipped}   →  {DB_PATH}")


def show():
    if not DB_PATH.exists():
        print(f"Noch keine Datenbank unter {DB_PATH}")
        return
    db = connect()
    snaps = db.execute("SELECT id, captured_at, note FROM snapshot "
                       "ORDER BY id DESC LIMIT 12").fetchall()
    n_snap = db.execute("SELECT COUNT(*) FROM snapshot").fetchone()[0]
    size = DB_PATH.stat().st_size / 1024
    print(f"{DB_PATH}  ({size:,.0f} KB · {n_snap} Snapshots)".replace(",", "."))
    for tbl in ("post", "post_stat", "demographic", "channel_stat", "raw_blob"):
        n = db.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        print(f"   {tbl:<14} {n:>7,} Zeilen".replace(",", "."))
    print("\nletzter Stand je Kanal:")
    for p, posts, views, foll, at in db.execute(
            "SELECT c.platform, c.posts, c.views, c.followers, s.captured_at "
            "FROM channel_stat c JOIN snapshot s ON s.id = c.snapshot_id "
            "WHERE (c.platform, c.snapshot_id) IN (SELECT platform, MAX(snapshot_id) "
            "FROM channel_stat GROUP BY platform) ORDER BY c.views DESC"):
        d = db.execute("SELECT COUNT(*) FROM demographic WHERE platform=?", (p,)).fetchone()[0]
        print(f"   {p:<10} {posts or 0:>4} Beiträge · {views or 0:>9,} Views · "
              f"{foll if foll is not None else 0:>5} Follower · {d:>4} Demografie-Zeilen"
              f"  ({at[:16].replace('T',' ')})".replace(",", "."))
    print("\nletzte Läufe:")
    for sid, at, note in snaps:
        ch = db.execute("SELECT COUNT(*) FROM post_stat WHERE snapshot_id=?", (sid,)).fetchone()[0]
        dm = db.execute("SELECT COUNT(*) FROM demographic WHERE snapshot_id=?", (sid,)).fetchone()[0]
        er = [r[0] for r in db.execute("SELECT platform FROM channel_error WHERE snapshot_id=?", (sid,))]
        print(f"   #{sid:<4} {at[:16].replace('T',' ')}  {ch:>4} Änderungen · {dm:>4} Demografie"
              + (f"  FEHLER: {','.join(er)}" if er else "")
              + (f"  [{note}]" if note else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="+", metavar="PLATTFORM", choices=list(ALL))
    ap.add_argument("--note", help="Freitext zum Snapshot (z.B. 'nach read_insights')")
    ap.add_argument("--list", action="store_true", help="Inhalt der DB zeigen")
    a = ap.parse_args()
    if a.list:
        show()
    else:
        run(a.only, a.note)
        print()
        show()
