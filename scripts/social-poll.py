#!/usr/bin/env python3
"""Holt die YouTube-Feeds aller freigegebenen Kanaele und legt neue Videos ab.

Aufruf (stuendlich per systemd-Timer):
    cd server && .venv/bin/python ../scripts/social-poll.py

Wichtig: **es wird nie geloescht.** Der RSS-Feed zeigt nur die letzten 15 Videos; was wir einmal
geholt haben, bleibt in `social_items` stehen. Genau daraus waechst die Historie (Jan, 30.08.) —
der Feed reicht mit der Zeit weiter zurueck als YouTubes eigener.

Kein API-Schluessel, kein Vertrag: `feeds/videos.xml?channel_id=UC…` ist oeffentlich.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

# .env von Hand lesen — `set -a; . .env` exportiert nicht zuverlaessig, und ohne DATABASE_URL
# laeuft das Skript gegen den SQLite-Dev-Fallback (s. CLAUDE.md).
_ENV = Path(__file__).resolve().parent.parent / "server" / ".env"
if _ENV.exists():
    for zeile in _ENV.read_text().splitlines():
        m = re.match(r"\s*([A-Z_]+)\s*=\s*(.*)", zeile)
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from app.db import SessionLocal          # noqa: E402
from app import models                   # noqa: E402

RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36")
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
      "media": "http://search.yahoo.com/mrss/"}


def eintraege(channel_id: str) -> list[dict]:
    r = requests.get(RSS.format(cid=channel_id), headers={"User-Agent": UA}, timeout=25)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    wurzel = ET.fromstring(r.content)
    out = []
    for e in wurzel.findall("a:entry", NS):
        vid = (e.findtext("yt:videoId", "", NS) or "").strip()
        if not vid:
            continue
        gruppe = e.find("media:group", NS)
        thumb = None
        if gruppe is not None:
            t = gruppe.find("media:thumbnail", NS)
            if t is not None:
                thumb = t.get("url")
        pub = e.findtext("a:published", "", NS)
        try:
            wann = datetime.fromisoformat(pub.replace("Z", "+00:00")) if pub else None
        except ValueError:
            wann = None
        out.append({
            "external_id": vid,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "title": (e.findtext("a:title", "", NS) or "").strip()[:300] or None,
            "thumb_url": thumb or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "published_at": wann,
        })
    return out


def main() -> int:
    db = SessionLocal()
    kanaele = (db.query(models.SocialChannel)
               .filter(models.SocialChannel.url.isnot(None),
                       models.SocialChannel.channel_id.isnot(None),
                       models.SocialChannel.blocked.is_(False)).all())
    neu = gesamt = fehler = 0
    for k in kanaele:
        try:
            posten = eintraege(k.channel_id)
        except Exception as e:                                   # noqa: BLE001
            print(f"  Kanal {k.channel_id} (uid {k.user_id}): FEHLER {e}")
            fehler += 1
            continue
        for p in posten:
            gesamt += 1
            vorhanden = (db.query(models.SocialItem)
                         .filter_by(external_id=p["external_id"]).first())
            if vorhanden:
                # Titel/Thumb koennen sich aendern — auffrischen, aber nie loeschen.
                vorhanden.title = p["title"] or vorhanden.title
                vorhanden.thumb_url = p["thumb_url"] or vorhanden.thumb_url
                continue
            db.add(models.SocialItem(user_id=k.user_id, platform="youtube", **p))
            neu += 1
        k.fetched_at = datetime.now(timezone.utc)
        db.commit()
    print(f"{len(kanaele)} Kanal/Kanaele geprueft, {gesamt} Eintraege gesehen, "
          f"{neu} neu, {fehler} Fehler")
    db.close()
    return 1 if fehler and not neu else 0


if __name__ == "__main__":
    raise SystemExit(main())
