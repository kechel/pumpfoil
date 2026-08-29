#!/usr/bin/env python3
"""fb-schedule.py — Backlog-Videos als Facebook-Reel terminieren.

NUR Facebook. Instagram wird nicht angefasst: die Alt-Videos liegen dort
laengst, ein Cross-Post wuerde sie doppeln.

Der Weg ist dreistufig (Reels-API der Seite):
  1. `upload_phase=start`  -> video_id + upload_url
  2. Binaerdatei an rupload.facebook.com
  3. `upload_phase=finish` mit `video_state=SCHEDULED` und
     `scheduled_publish_time` (Unix-Sekunden)

Der Plan steht in fb-plan.json daneben: eine Liste aus Datum, Videonummer,
Dateiname und Beschreibungstext. Uhrzeit ist fest 13:00 Ortszeit — die
normalen neuen Reels laufen um 5:00, das haelt beides auseinander.

    ./fb-schedule.py --dry-run          # zeigen, was terminiert wuerde
    ./fb-schedule.py --only 044         # ein einzelnes Video
    ./fb-schedule.py                    # alle faelligen aus dem Plan

Was schon terminiert ist, wird uebersprungen — die Video-IDs stehen in
.fb-scheduled.json. Zweimal laufen lassen postet also nichts doppelt.
"""
import argparse
import datetime as dt
import importlib.util
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sm)

BASE = sm.BASE
PLAN_FILE = HERE / "fb-plan.json"
STATE_FILE = BASE / ".fb-scheduled.json"
VIDEO_DIR = BASE / "shorts-mit-musik" / "instagram"
POST_HOUR = 13          # 5:00 gehoert den neuen Reels
# Facebook nimmt Termine zwischen 10 Minuten und 75 Tagen in der Zukunft an.
MIN_LEAD = dt.timedelta(minutes=20)
MAX_LEAD = dt.timedelta(days=75)


def page_token():
    tok = sm.meta_access_token()
    pid = sm.meta_client()["page_id"]
    pg = sm._http_json(f"{sm.GRAPH}/{pid}?fields=access_token,name&access_token={tok}")
    return pid, pg["access_token"], pg.get("name")


def upload_binary(upload_url: str, path: Path, token: str):
    """Rohe Datei an rupload.facebook.com. Kein Multipart — der Body IST die Datei."""
    data = path.read_bytes()
    req = urllib.request.Request(upload_url, data=data, method="POST", headers={
        "Authorization": f"OAuth {token}",
        "offset": "0",
        "file_size": str(len(data)),
        "Content-Type": "application/octet-stream",
    })
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Upload HTTP {e.code}: {e.read().decode()[:400]}")


def _as_epoch(v):
    """Unix-Sekunden aus dem, was Graph gerade zurueckgibt (Zahl oder ISO)."""
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        pass
    try:
        return int(dt.datetime.strptime(str(v), "%Y-%m-%dT%H:%M:%S%z").timestamp())
    except ValueError:
        return None


def schedule(pid, ptok, path: Path, description: str, when: dt.datetime):
    start = sm._http_json(f"{sm.GRAPH}/{pid}/video_reels",
                          {"upload_phase": "start", "access_token": ptok})
    vid, url = start["video_id"], start["upload_url"]
    up = upload_binary(url, path, ptok)
    if not up.get("success", True):
        raise RuntimeError(f"Upload nicht bestaetigt: {up}")
    # Die Parameter MUESSEN in den POST-Body. Haengt man sie an die URL, nimmt
    # Graph den Upload an, ignoriert aber Termin und Text stillschweigend — das
    # Reel liegt dann als "veroeffentlicht, aber ohne Text" fest und laesst sich
    # nachtraeglich nicht mehr terminieren.
    fin = sm._http_json(f"{sm.GRAPH}/{pid}/video_reels", {
        "upload_phase": "finish",
        "video_id": vid,
        "video_state": "SCHEDULED",
        "scheduled_publish_time": int(when.timestamp()),
        "description": description,
        "access_token": ptok,
    }, form=True)
    # Zurueckgelesen statt geglaubt: sitzt der Termin wirklich, und steht der
    # Text da? Wenn nicht, den Upload wieder wegraeumen, sonst geht er
    # irgendwann leer hoch.
    chk = sm._http_json(f"{sm.GRAPH}/{vid}?fields=scheduled_publish_time,description"
                        f"&access_token={ptok}")
    # Graph liefert den Termin je nach Endpunkt als Unix-Sekunden ODER als
    # ISO-8601-String — beides annehmen, sonst scheitert die Pruefung an einem
    # Erfolg.
    got = _as_epoch(chk.get("scheduled_publish_time"))
    if not got or abs(got - int(when.timestamp())) > 90 or not chk.get("description"):
        sm._http_json(f"{sm.GRAPH}/{vid}?access_token={ptok}", method="DELETE")
        raise RuntimeError(f"Termin/Text nicht uebernommen (Antwort: {fin}) — "
                           "Upload wieder geloescht")
    return vid, chk


def load(p, default):
    return json.loads(p.read_text()) if p.is_file() else default


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", metavar="NR", help="nur diese Videonummer")
    a = ap.parse_args()

    plan = load(PLAN_FILE, [])
    if not plan:
        print(f"Kein Plan unter {PLAN_FILE}")
        return
    state = load(STATE_FILE, {})
    now = dt.datetime.now().astimezone()

    todo = []
    for e in plan:
        if a.only and e["number"] != a.only:
            continue
        if e["number"] in state:
            print(f"  {e['number']}  schon terminiert am {state[e['number']]['for']} "
                  f"(ID {state[e['number']]['video_id']}) — übersprungen")
            continue
        day = dt.datetime.strptime(e["date"], "%Y-%m-%d").replace(hour=POST_HOUR)
        when = day.astimezone()
        path = VIDEO_DIR / e["file"]
        if not path.is_file():
            print(f"  {e['number']}  DATEI FEHLT: {path}")
            continue
        if when - now < MIN_LEAD:
            print(f"  {e['number']}  Termin {when:%d.%m. %H:%M} liegt zu nah/in der "
                  f"Vergangenheit — übersprungen")
            continue
        if when - now > MAX_LEAD:
            print(f"  {e['number']}  Termin {when:%d.%m.} über 75 Tage voraus — "
                  "Facebook nimmt das nicht an")
            continue
        todo.append((e, path, when))

    if not todo:
        print("\nNichts zu tun.")
        return
    total = sum(p.stat().st_size for _, p, _ in todo) / 1048576
    print(f"\n{len(todo)} Videos, {total:.0f} MB")
    for e, path, when in todo:
        print(f"  {e['number']}  {when:%a %d.%m. %H:%M}  {path.name[:56]} "
              f"({path.stat().st_size/1048576:.1f} MB)")
    if a.dry_run:
        print("\n--dry-run: nichts hochgeladen.")
        return

    pid, ptok, name = page_token()
    print(f"\nZiel-Seite: {name} ({pid})\n")
    ok = 0
    for e, path, when in todo:
        try:
            vid, fin = schedule(pid, ptok, path, e["caption"], when)
            state[e["number"]] = {"video_id": vid, "for": when.isoformat(),
                                  "file": e["file"],
                                  "scheduled_at": now.isoformat()}
            STATE_FILE.write_text(json.dumps(state, indent=1, ensure_ascii=False))
            print(f"  ✓ {e['number']}  {when:%a %d.%m. %H:%M}  video_id {vid}")
            ok += 1
        except (RuntimeError, OSError, KeyError) as ex:
            print(f"  ✗ {e['number']}  {str(ex)[:220]}")
    print(f"\n{ok}/{len(todo)} terminiert → {STATE_FILE}")


if __name__ == "__main__":
    main()
