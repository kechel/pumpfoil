#!/usr/bin/env python3
"""Feedback-Beitraege erfassen (Tabelle feedback_beitraege, Grundlage des Supporter-Badges, Jan 23.10.2026).

    cd server && .venv/bin/python ../scripts/feedback-beitraege.py --nachtragen [--alt-feedback datei.json] [--echt]
    cd server && .venv/bin/python ../scripts/feedback-beitraege.py --add 244 --quelle mail --notiz "…" [--am 2026-10-23] --echt
    cd server && .venv/bin/python ../scripts/feedback-beitraege.py --liste

--nachtragen liest alles, was in der DB steht, und ist wiederholbar (quelle+ref eindeutig):
  feedback     Feedback-Formular (+ geloeschte aus den DB-Backups via --alt-feedback, s. unten)
  chat_jan     Nachricht eines Nutzers im 1:1 mit Jan oder dem Assistenten-Konto, je Nutzer und Tag
  dank         Antwort des Assistenten-Kontos, die sich bedankt (Foil/Stab eingetragen, Spot geaendert,
               Fehler geprueft) — Massen-Hinweise ohne Dank (z. B. Suunto-Verfuegbarkeit) zaehlen nicht
  meldung      „Sieht nicht nach Pumpfoil aus" (session_flags)
  spot_info    Spot-Beschreibung (spot_notes, nicht versteckt)
  brett        Session mit Handy am Brett (Vergleichsdaten fuer die Erkennung), je Session
  bewertung    „Rate this analysis"
  git          (mit --git) Nutzer, die in Commit-Nachrichten vorkommen („u244" oder eindeutiger Anzeigename),
               je Nutzer und Tag — Meldungen und Tests, die wir umgesetzt haben
Alles andere (Mails, GitHub, Tests, Hinweise im oeffentlichen Chat) per --add.
--alt-feedback: JSON {id: {user_id, at, url, text}} aus pg_restore der Backups (geloeschte Formular-Feedbacks).
"""
import argparse
import json
import os
import pathlib
import re
import sys
from datetime import datetime, timezone

DANK = re.compile(r"thank|danke|merci|gracias|grazie|obrigad|dzięk|dziek|kiitos|takk|děkuj|dekuj|dank je|спасибо|ありがと|谢谢|terima kasih",
                  re.I)


# Anzeigenamen, die zugleich gewoehnliche Woerter/Marken sind — nur ueber „u<id>" zaehlen.
NAME_NICHT = {"foiler", "foiler2", "anzeigename", "slingshot"}
BEITRAG_WORT = re.compile(r"meldung|gemeldet|feedback|wunsch|vorschlag|hinweis|tipp|frage|bug|report|"
                          r"getestet|testet|tester|feldtest|request|suggest|idee|schrieb|anfrage|danke", re.I)


def _git(db, models, merke, intern):
    import subprocess
    from datetime import date as _date
    log = subprocess.run(["git", "log", "--format=@@%H %aI%n%s%n%b"], capture_output=True, text=True,
                         cwd=pathlib.Path(__file__).resolve().parents[1]).stdout
    users = {u.id: u.display_name for u in db.query(models.User).filter(models.User.hidden.isnot(True)).all()}
    namen = {uid: n for uid, n in users.items()
             if n and len(n) >= 6 and not re.search(r"\s", n.strip()) and n.lower() not in NAME_NICHT}
    for blk in log.split("@@")[1:]:
        kopf, _, text = blk.partition("\n")
        h, d = kopf.split(" ")
        tag = d[:10]
        # Nur Commits, die von einem Beitrag sprechen — sonst zaehlten Nutzer, deren Daten wir nur
        # untersucht haben (z. B. „u477 SM-L330 6 Sessions" im Wear-Befund), als Feedback-Geber.
        if not BEITRAG_WORT.search(text):
            continue
        treffer = {int(m.group(1)) for m in re.finditer(r"\bu(\d{1,4})\b", text)}
        treffer |= {uid for uid, n in namen.items() if re.search(r"(?<!\w)" + re.escape(n) + r"(?!\w)", text)}
        for uid in treffer:
            if uid in users and uid not in intern:
                merke(uid, "git", f"{uid}:{tag}", datetime.fromisoformat(d), f"Commit {h[:8]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--nachtragen", action="store_true")
    ap.add_argument("--alt-feedback")
    ap.add_argument("--git", action="store_true", help="beim Nachtragen auch die Commit-Nachrichten auswerten")
    ap.add_argument("--add", type=int, help="user_id fuer einen Beitrag von Hand")
    ap.add_argument("--quelle", default="hand")
    ap.add_argument("--notiz")
    ap.add_argument("--am", help="Datum YYYY-MM-DD (Standard: jetzt)")
    ap.add_argument("--liste", action="store_true")
    ap.add_argument("--echt", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    env = {}
    for line in pathlib.Path(".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"').strip("'")
    os.environ["DATABASE_URL"] = env["DATABASE_URL"]
    sys.path.insert(0, ".")
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    B = models.FeedbackBeitrag
    vorhanden = {(q, r) for q, r in db.query(B.quelle, B.ref).all()}
    neu: list = []

    def merke(uid, quelle, ref, at, notiz=None):
        if uid is None or (quelle, str(ref)) in vorhanden:
            return
        vorhanden.add((quelle, str(ref)))
        neu.append(B(user_id=uid, quelle=quelle, ref=str(ref)[:80], at=at, notiz=(notiz or "")[:300] or None))

    bot = db.query(models.User).filter_by(email=env.get("BOT_EMAIL", "")).one_or_none()
    jan, bot_id = 2, (bot.id if bot else -1)
    intern = {jan, bot_id}
    if a.nachtragen:
        uids = {u for (u,) in db.query(models.User.id).all()}
        for f in db.query(models.Feedback).all():
            merke(f.user_id, "feedback", f.id, f.created_at, f"{f.url or ''} {f.text[:120]}")
        if a.alt_feedback:
            for fid, f in json.loads(pathlib.Path(a.alt_feedback).read_text()).items():
                if f["user_id"] in uids:
                    at = datetime.fromisoformat(f["at"].replace("+02", "+02:00").replace("+01", "+01:00"))
                    merke(f["user_id"], "feedback", fid, at, f"{f.get('url') or ''} {f.get('text') or ''}")
        for m in db.query(models.ChatMessage).filter(models.ChatMessage.scope.like("dm:%")).all():
            try:
                x, y = (int(v) for v in m.scope[3:].split("-"))
            except ValueError:
                continue
            if not ({x, y} & intern):
                continue
            if m.user_id in intern:
                anderer = y if x in intern else x
                if m.user_id == bot_id and anderer not in intern and DANK.search(m.text or ""):
                    merke(anderer, "dank", m.id, m.created_at, m.text[:120])
            else:
                merke(m.user_id, "chat_jan", f"{m.user_id}:{m.created_at.date()}", m.created_at, m.text[:120])
        for fl in db.query(models.SessionFlag).all():
            merke(fl.user_id, "meldung", fl.id, fl.created_at, f"#{fl.session_id} {fl.note or ''}")
        for n in db.query(models.SpotNote).filter(models.SpotNote.hidden.isnot(True)).all():
            merke(n.user_id, "spot_info", n.id, n.created_at, f"Spot {n.spot_id}")
        for s in db.query(models.Session).filter(models.Session.placement == "board", models.Session.deleted.isnot(True)).all():
            merke(s.user_id, "brett", s.id, s.started_at, f"#{s.id}")
        for b in db.query(models.SessionBewertung).all():
            merke(b.user_id, "bewertung", b.id, b.created_at, f"#{b.session_id}")
        if a.git:
            _git(db, models, merke, intern)
        neu[:] = [n for n in neu if n.user_id not in intern]
    if a.add:
        at = datetime.fromisoformat(a.am).replace(tzinfo=timezone.utc) if a.am else datetime.now(timezone.utc)
        merke(a.add, a.quelle, f"{a.add}:{at.isoformat()}", at, a.notiz)
    if neu:
        from collections import Counter
        print(f"{len(neu)} neue Beitraege:", dict(Counter(n.quelle for n in neu)))
    if a.echt and neu:
        db.add_all(neu)
        db.commit()
        print("Geschrieben.")
    elif neu:
        print("TROCKENLAUF — mit --echt schreiben.")
    if a.liste or a.nachtragen:
        from sqlalchemy import func
        rows = (db.query(B.user_id, models.User.display_name, func.count(func.distinct(func.date(B.at))), func.max(B.at))
                .join(models.User, models.User.id == B.user_id).group_by(B.user_id, models.User.display_name)
                .order_by(func.max(B.at).desc()).all()) if a.echt or a.liste else []
        for uid, name, tage, zuletzt in rows:
            print(f"  u{uid:<4} {str(name)[:22]:22} Tage {tage:3}  zuletzt {zuletzt:%Y-%m-%d}")


if __name__ == "__main__":
    main()
