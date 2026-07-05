"""Einmal-Loeschung der beiden Store-Testkonten (google-tester@ / apple-tester@).

Vollstaendig: alle session- und user-referenzierenden Zeilen (kein DB-Cascade!)
+ Storage-Dirs + Avatar-Media, in EINER Transaktion. Sicherheitscheck: bricht ab,
wenn die Ziel-IDs nicht exakt diese zwei E-Mails sind.

Aufruf:
  DATABASE_URL=... .venv/bin/python -m scripts.delete_test_accounts          # Dry-run (zeigt nur)
  DATABASE_URL=... .venv/bin/python -m scripts.delete_test_accounts --commit  # loescht
"""
from __future__ import annotations

import shutil
import sys

from sqlalchemy import text

from app.db import SessionLocal
from app import models, storage

EXPECTED = {6: "google-tester@kechel.de", 7: "apple-tester@kechel.de"}
SESSION_TABLES = ["ingest_chunks", "analysis_results", "labels", "session_likes",
                  "session_votes", "session_photos", "pump_truth"]
USER_TABLES = ["device_pairings", "device_tokens", "pairing_codes", "push_subscriptions",
               "oauth_identities", "feedback", "chat_messages", "chat_reports",
               "chat_room_state", "polar_links", "coros_links", "suunto_links",
               "strava_links", "password_resets", "session_likes", "session_votes"]


def main():
    commit = "--commit" in sys.argv
    db = SessionLocal()
    ids = list(EXPECTED)
    users = db.query(models.User).filter(models.User.id.in_(ids)).all()
    # Sicherheitscheck: exakt die zwei erwarteten Konten
    got = {u.id: u.email for u in users}
    if got != EXPECTED:
        print(f"ABBRUCH: Ziel-Konten != erwartet.\n  erwartet: {EXPECTED}\n  gefunden: {got}")
        return

    sessions = db.query(models.Session).filter(models.Session.user_id.in_(ids)).all()
    sids = [s.id for s in sessions]
    print(f"Loesche Konten {got}")
    print(f"  Sessions: {len(sids)} -> {sids}")

    # Storage-Dirs + Avatare (Dateisystem)
    for s in sessions:
        try:
            d = storage.session_dir(s.session_uuid)
            print(f"  rmtree {d}" + (" (existiert)" if d.exists() else " (fehlt)"))
            if commit and d.exists():
                shutil.rmtree(d, ignore_errors=True)
        except ValueError:
            pass
    for u in users:
        if u.avatar_url:
            print(f"  avatar {u.avatar_url}")

    # Session-Fotos-Media vor SQL entfernen
    photos = db.query(models.SessionPhoto).filter(models.SessionPhoto.session_id.in_(sids)).all() if sids else []
    print(f"  Session-Fotos: {len(photos)}")

    if not commit:
        print("\nDRY-RUN (nichts geloescht). Mit --commit ausfuehren.")
        return

    from app.media import delete_media
    for p in photos:
        delete_media(p.url)
    for u in users:
        if u.avatar_url:
            delete_media(u.avatar_url)

    # SQL in einer Transaktion — Reihenfolge: session-scoped -> sessions ->
    # user-scoped (device_tokens etc., von sessions.device_id referenziert!) -> users
    if sids:
        for t in SESSION_TABLES:
            db.execute(text(f"DELETE FROM {t} WHERE session_id = ANY(:sids)"), {"sids": sids})
    db.execute(text("DELETE FROM sessions WHERE user_id = ANY(:ids)"), {"ids": ids})
    for t in USER_TABLES:
        db.execute(text(f"DELETE FROM {t} WHERE user_id = ANY(:ids)"), {"ids": ids})
    db.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": ids})
    db.commit()
    print("\nCOMMIT ok — beide Testkonten geloescht.")


if __name__ == "__main__":
    main()
