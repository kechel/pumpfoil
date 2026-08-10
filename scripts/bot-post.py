#!/usr/bin/env python3
"""Schreibt eine Chat-Nachricht unter dem Konto des Assistenten ("Claude Code AI").

    cd server && .venv/bin/python ../scripts/bot-post.py --dm 171 --text "Hallo …"
    cd server && .venv/bin/python ../scripts/bot-post.py --dm 171 --file nachricht.txt
    cd server && .venv/bin/python ../scripts/bot-post.py --scope session:1814 --text "…"
    cd server && .venv/bin/python ../scripts/bot-post.py --dm 171 --lesen        # nur mitlesen

Zugang steht in `server/.env` (BOT_EMAIL / BOT_PASSWORD) — die Datei ist gitignored und liegt
GPG-verschlüsselt in der Backup-Kette (deploy/backup-secrets.sh). Wird das Passwort neu gesetzt,
nur dort ändern.

WICHTIG — die Regeln fuer dieses Konto (Memory `chat-account-claude`, `never-post-only-draft`):
Von sich aus antwortet der Assistent NUR auf Fragen nach fehlenden Foils/Stabs, die er selbst
recherchiert und eingetragen hat — in der Sprache des Nutzers. Alles andere schreibt er nur, wenn
Jan es ausdruecklich sagt. Nie Persoenliches ueber Dritte, nie Namen anderer Nutzer.

Geht ueber die oeffentliche API (localhost), damit alles Nachgelagerte greift: Anti-Spam,
Benachrichtigungen, Blockier-Pruefung. NIE direkt in die DB schreiben.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("FOIL_BASE_URL", "http://localhost:8090")


def lade_zugang() -> tuple[str, str]:
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    email = (env.get("BOT_EMAIL") or "").strip().strip('"')
    pw = (env.get("BOT_PASSWORD") or "").strip().strip('"')
    if not email or not pw:
        sys.exit("BOT_EMAIL/BOT_PASSWORD fehlen in server/.env")
    return email, pw


def anfrage(pfad: str, daten: dict | None = None, token: str | None = None, methode: str = "GET"):
    kopf = {"Content-Type": "application/json"}
    if token:
        kopf["Authorization"] = f"Bearer {token}"
    rumpf = json.dumps(daten).encode() if daten is not None else None
    req = urllib.request.Request(BASIS + pfad, data=rumpf, headers=kopf, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"{methode} {pfad} -> HTTP {e.code}: {e.read().decode()[:300]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ziel = ap.add_mutually_exclusive_group(required=True)
    ziel.add_argument("--dm", type=int, help="User-ID fuer den 1:1-Chat")
    ziel.add_argument("--scope", help="z. B. session:1814, spot:…, global:…")
    inhalt = ap.add_mutually_exclusive_group()
    inhalt.add_argument("--text")
    inhalt.add_argument("--file", help="Textdatei (UTF-8), Inhalt wird gesendet")
    ap.add_argument("--lesen", action="store_true", help="nur den Verlauf zeigen, nichts senden")
    args = ap.parse_args()

    email, pw = lade_zugang()
    tok = anfrage("/api/auth/login", {"email": email, "password": pw}, methode="POST")
    token = tok.get("access_token") or tok.get("token")
    if not token:
        sys.exit(f"Login ohne Token: {tok}")
    ich = anfrage("/api/auth/me", token=token)
    print(f"angemeldet als {ich.get('display_name')!r} <{ich.get('email')}>")

    if args.dm:
        # Den Scope vom Server bestimmen lassen (dm:<min>-<max>), nicht selbst zusammenbauen.
        dm = anfrage(f"/api/chat/dm?user_id={int(args.dm)}", token=token)
        scope = dm["scope"]
        gegen = dm.get("other") or {}
        if dm.get("blocked"):
            sys.exit(f"Blockiert — an {gegen.get('name')} kann nicht geschrieben werden.")
        print(f"1:1-Chat mit {gegen.get('name')!r} (ID {gegen.get('id')})")
    else:
        scope = args.scope

    verlauf = anfrage(f"/api/chat?scope={urllib.parse.quote(scope)}", token=token)
    nachrichten = verlauf if isinstance(verlauf, list) else verlauf.get("messages") or []
    print(f"Scope {scope} — {len(nachrichten)} Nachricht(en)")
    for m in nachrichten[-6:]:
        wer = m.get("display_name") or m.get("user_id")
        print(f"   [{m.get('created_at', '')[:16]}] {wer}: {(m.get('text') or '')[:160]}")

    if args.lesen:
        return
    text = args.text if args.text else (open(args.file, encoding="utf-8").read() if args.file else None)
    if not text or not text.strip():
        sys.exit("Kein Text — --text oder --file angeben (oder --lesen).")
    if len(text) > 2000:
        sys.exit(f"Text zu lang ({len(text)} Zeichen, Server kappt bei 2000) — bitte kuerzen.")
    print(f"\nsende {len(text)} Zeichen an {scope} …")
    res = anfrage(f"/api/chat?scope={urllib.parse.quote(scope)}", {"text": text},
                  token=token, methode="POST")
    print("gesendet:", json.dumps(res, ensure_ascii=False)[:300])


if __name__ == "__main__":
    import urllib.parse
    main()
