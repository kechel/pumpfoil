#!/usr/bin/env python3
"""Aeltere Suunto-Workouts zum Nachholen vormerken — Trockenlauf per Vorgabe.

    cd server && .venv/bin/python ../scripts/suunto-nachholen-vormerken.py
    cd server && .venv/bin/python ../scripts/suunto-nachholen-vormerken.py --schreiben

WOZU
Der Suunto-Sync holt nur, was seit dem letzten Lauf dazugekommen ist. Alles, was ein Nutzer VOR
dem Verknuepfen aufgezeichnet hat, ist damit nie bei uns angekommen. Am 07.09.2026 nachgezaehlt:
ueber 1200 Workouts fehlen, darunter 146, die fuers Foilen ueberhaupt in Frage kommen (69x
Surfing bei einem Nutzer, 59x Standup paddling bei einem anderen).

WIE — und warum kein neuer Mechanismus
Es gibt bereits eine kontingent-bewusste Warteschlange (`models.SuuntoPending`, geleert von
`suunto._nachholen`: fuenf je Lauf, bricht bei 403 ab, haengt sich an jeden Sync und Webhook).
Dieses Skript FUELLT sie nur — gedrosselt wird weiter dort.

DAS KONTINGENT IST DER ENGPASS: 200 Abrufe je WOCHE fuer ALLE Nutzer zusammen. Wer die
Warteschlange mit tausend Alt-Workouts fuellt, nimmt den FRISCHEN Aufnahmen wochenlang das
Kontingent weg. Deshalb drei Grenzen:

1. Nur wasser-relevante Sportarten. Die Liste ist aus `suunto.AKTIVITAETEN` ABGELEITET, nicht
   geraten — beim ersten Versuch hatte ich die IDs aus dem Kopf gesetzt und dabei „Surfing" und
   „Standup paddling" vergessen, also genau die zwei groessten Posten.
2. Nur was `suunto._vorfilter` durchlaesst (Bewegungsprofil: nicht ueber 60 km, nicht unter einer
   Minute, kein 30er-Schnitt ueber zehn Minuten). Der Filter ist bewusst grosszuegig.
3. Nur was wir nicht schon haben (Vergleich der Startzeiten, drei Sekunden Toleranz).

Die frischen Aufnahmen behalten Vorrang, ohne dass es dafuer etwas zu tun gab: `_nachholen`
laeuft in jedem Sync NACH dem regulaeren Durchgang.

`--alle-sportarten` merkt zusaetzlich den Rest vor. Das sind ueber tausend Abrufe, also mehr als
sechs Wochen Kontingent — nur mit Bedacht.
"""
import argparse
import os
import pathlib
import re
import sys
from collections import Counter

WASSER_MUSTER = re.compile(
    r"surf|paddl|sup|kite|sail|wind|water|swim|canoe|kayak|row|foil|wake|mermaid|spearfish",
    re.I)
# Hallen-Rudern hat nie eine Position.
NICHT = {57}


def env_laden() -> None:
    for zeile in pathlib.Path(".env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def startzeit(w: dict) -> int | None:
    for k in ("startTime", "starttime", "startEpoch", "startTimeMillis"):
        v = w.get(k)
        if isinstance(v, (int, float)) and v > 1e11:
            return int(v / 1000)
        if isinstance(v, (int, float)) and v > 1e9:
            return int(v)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schreiben", action="store_true", help="wirklich vormerken")
    ap.add_argument("--alle-sportarten", action="store_true",
                    help="auch alles Nicht-Wassersportliche (ueber 1200 Abrufe!)")
    ap.add_argument("--je-nutzer", type=int, default=0,
                    help="hoechstens so viele je Nutzer (0 = alle)")
    args = ap.parse_args()

    if not pathlib.Path(".env").exists():
        print("Bitte aus dem Ordner server/ starten.", file=sys.stderr)
        return 2
    env_laden()
    sys.path.insert(0, ".")

    import httpx
    from sqlalchemy import text

    from app import models
    from app.api.suunto import (AKTIVITAETEN, WORKOUTS_URL_V2, WORKOUTS_URL_V3, _fresh_token,
                                _liste_lesen, _sub_key, _v3_aktiv, _vorfilter, _workout_key)
    from app.db import SessionLocal

    wasser = {i for i, n in AKTIVITAETEN.items() if WASSER_MUSTER.search(n)} - NICHT
    db = SessionLocal()
    gesamt = 0
    try:
        for l in db.query(models.SuuntoLink).all():
            wer = db.execute(text("SELECT display_name FROM users WHERE id=:u"),
                             {"u": l.user_id}).scalar()
            hab = {int(t.timestamp()) for (t,) in db.execute(text(
                "SELECT started_at FROM sessions WHERE user_id=:u AND started_at IS NOT NULL"),
                {"u": l.user_id}).all() if t}
            try:
                tok = _fresh_token(l, db)
                url = WORKOUTS_URL_V3 if _v3_aktiv() else WORKOUTS_URL_V2
                r = httpx.get(url, headers={"Authorization": f"Bearer {tok}",
                                            "Ocp-Apim-Subscription-Key": _sub_key(),
                                            "Accept": "application/json"},
                              params={"since": 0, "limit": 500}, timeout=45)
                if r.status_code != 200:
                    print(f"  {wer}: Liste HTTP {r.status_code} — uebersprungen")
                    continue
                liste = _liste_lesen(r.json())
            except Exception as exc:  # noqa: BLE001
                print(f"  {wer}: {type(exc).__name__}: {exc}")
                continue

            kandidaten = []
            for w in liste:
                if not isinstance(w, dict):
                    continue
                ts = startzeit(w)
                if ts is None or any((ts + d) in hab for d in range(-3, 4)):
                    continue                      # haben wir schon
                if _vorfilter(w) is not None:
                    continue                      # Bewegungsprofil spricht dagegen
                if not args.alle_sportarten and w.get("activityId") not in wasser:
                    continue
                key = _workout_key(w)
                if key:
                    kandidaten.append((ts, key, w.get("activityId")))
            kandidaten.sort(reverse=True)         # neueste zuerst — die interessieren am meisten
            if args.je_nutzer:
                kandidaten = kandidaten[:args.je_nutzer]

            schon = {p.workout_key for p in db.query(models.SuuntoPending)
                     .filter_by(user_id=l.user_id).all()}
            neu = [k for k in kandidaten if k[1] not in schon]
            arten = Counter(AKTIVITAETEN.get(a, a) for _, _, a in neu)
            print(f"  {str(wer)[:20]:20s} {len(neu):4d} vorzumerken"
                  + (f"   ({', '.join(f'{n}x {a}' for a, n in arten.most_common(4))})" if neu else ""))
            gesamt += len(neu)
            if not args.schreiben:
                continue
            for ts, key, _aid in neu:
                db.add(models.SuuntoPending(user_id=l.user_id, workout_key=key, tries=0))
            db.commit()

        print(f"\ngesamt: {gesamt}")
        print(f"in der Warteschlange jetzt: {db.query(models.SuuntoPending).count()}")
        if not args.schreiben and gesamt:
            print("Zum Uebernehmen erneut mit --schreiben starten.")
            print("Geleert wird sie dann vom taeglichen Sync — fuenf je Lauf und Nutzer, "
                  "frische Aufnahmen behalten Vorrang.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
