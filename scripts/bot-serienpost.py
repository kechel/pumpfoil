#!/usr/bin/env python3
"""Vorbereitete 1:1-Nachrichten an MEHRERE Nutzer senden — unter dem Konto des Assistenten.

    cd server && .venv/bin/python ../scripts/bot-serienpost.py --plan plan.json
    cd server && .venv/bin/python ../scripts/bot-serienpost.py --plan plan.json --echt

Der Plan ist eine JSON-Liste: [{"user_id": 123, "text": "…"}, …] — je Empfaenger ein eigener
Text, damit Sprache und Anrede stimmen. SENDET nur mit --echt; ohne das ein Trockenlauf.

WARUM ES DIESES SKRIPT GIBT und nicht `bot-post.py` in einer Schleife (Memory
`bulk-dm-rate-limits`): jenes loggt sich bei JEDEM Aufruf neu ein. Beim Update-Hinweis an 36
Nutzer am 17.08.2026 war nach 10 Nachrichten Schluss — am LOGIN-Limit (10 pro 300 s je IP,
Fehlversuche zaehlen mit), nicht am Chat-Limit. Nur 5 kamen an. Hier wird EINMAL eingeloggt.

Die Chat-Grenzen (app/api/chat.py): 5 Nachrichten pro 10 s UND 30 pro 300 s je Konto. Der
Standardabstand von 13 s haelt beide mit Reserve; bei 429 wird gewartet und wiederholt, nicht
abgebrochen.

DOPPELTE: vor jedem Senden wird der Verlauf geholt und geprueft, ob DIESER Text dort schon vom
eigenen Konto steht. Ein Neustart nach einem Abbruch schickt deshalb niemandem zweimal
dasselbe — die Liste muss dafuer nicht von Hand gekuerzt werden.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASIS = os.environ.get("FOIL_BASE_URL", "http://localhost:8090")


def zugang() -> tuple[str, str]:
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    email = (env.get("BOT_EMAIL") or "").strip().strip('"')
    pw = (env.get("BOT_PASSWORD") or "").strip().strip('"')
    if not email or not pw:
        sys.exit("BOT_EMAIL/BOT_PASSWORD fehlen in server/.env")
    return email, pw


def anfrage(pfad, daten=None, token=None, methode="GET"):
    """-> (status, json). Wirft NICHT: 429 und Fehler gehoeren hier zum Ablauf."""
    kopf = {"Content-Type": "application/json"}
    if token:
        kopf["Authorization"] = f"Bearer {token}"
    rumpf = json.dumps(daten).encode() if daten is not None else None
    req = urllib.request.Request(BASIS + pfad, data=rumpf, headers=kopf, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True, help="JSON: [{user_id, text}, …]")
    ap.add_argument("--echt", action="store_true", help="wirklich senden")
    ap.add_argument("--abstand", type=float, default=13.0, help="Sekunden zwischen Nachrichten")
    args = ap.parse_args()

    plan = json.loads(open(args.plan, encoding="utf-8").read())
    if not isinstance(plan, list) or not plan:
        sys.exit("Plan ist leer oder keine Liste.")
    for e in plan:
        if len(e["text"]) > 2000:
            sys.exit(f"u{e['user_id']}: Text zu lang ({len(e['text'])}), Server kappt bei 2000.")

    email, pw = zugang()
    st, tok = anfrage("/api/auth/login", {"email": email, "password": pw}, methode="POST")
    if st != 200:
        sys.exit(f"Login fehlgeschlagen (HTTP {st}): {tok}")
    token = tok.get("access_token") or tok.get("token")
    _, ich = anfrage("/api/auth/me", token=token)
    print(f"angemeldet als {ich.get('display_name')!r} (id {ich.get('id')})"
          f"{'' if args.echt else '   [TROCKENLAUF]'}")

    gesendet = uebersprungen = fehler = 0
    for i, e in enumerate(plan, 1):
        uid, text = int(e["user_id"]), e["text"]
        st, dm = anfrage(f"/api/chat/dm?user_id={uid}", token=token)
        if st != 200:
            print(f"  u{uid}: Chat nicht erreichbar (HTTP {st}) — uebersprungen"); fehler += 1; continue
        if dm.get("blocked"):
            print(f"  u{uid}: blockiert — uebersprungen"); uebersprungen += 1; continue
        scope = dm["scope"]
        _, verlauf = anfrage(f"/api/chat?scope={urllib.parse.quote(scope)}", token=token)
        alt = verlauf if isinstance(verlauf, list) else (verlauf.get("messages") or [])
        meine = [(m.get("text") or "").strip() for m in alt
                 if (m.get("name") or m.get("display_name")) == ich.get("display_name")]
        if text.strip() in meine:
            print(f"  u{uid}: steht schon da — uebersprungen"); uebersprungen += 1; continue
        if not args.echt:
            print(f"  u{uid}: wuerde {len(text)} Zeichen an {scope} senden"); continue
        for versuch in range(4):
            st, res = anfrage(f"/api/chat?scope={urllib.parse.quote(scope)}", {"text": text},
                              token=token, methode="POST")
            if st in (200, 201):
                gesendet += 1
                print(f"  u{uid}: gesendet ({len(text)} Zeichen)")
                break
            if st == 429:
                warte = 20 * (versuch + 1)
                print(f"  u{uid}: Limit erreicht, warte {warte}s …")
                time.sleep(warte)
                continue
            print(f"  u{uid}: FEHLER HTTP {st}: {str(res)[:160]}"); fehler += 1
            break
        else:
            print(f"  u{uid}: nach vier Versuchen aufgegeben"); fehler += 1
        if i < len(plan):
            time.sleep(args.abstand)

    print(f"\nFERTIG: {gesendet} gesendet, {uebersprungen} uebersprungen, {fehler} Fehler"
          f"{'' if args.echt else '  — TROCKENLAUF, nichts gesendet'}")


if __name__ == "__main__":
    main()
