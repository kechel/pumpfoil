#!/usr/bin/env python3
"""Alle Eingangskanaele auf einmal — 1:1-Chats, oeffentliche Erwaehnungen, Feedback.

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" \
        .venv/bin/python ../scripts/posteingang.py

REIN LESEND. GitHub ist NICHT dabei: dort gibt es keinen DB-Zugang, das laeuft ueber die
oeffentliche API (s. .claude/skills/posteingang/SKILL.md) — `gh` ist auf dieser VM nicht da.

WARUM (Jan, 13.09.2026): „das muessen wir ja alles regelmaessig checken." Anlass war, dass vier
GitHub-Vorgaenge monatelang unbeantwortet lagen und eine Nutzerfrage im Chat zehn Stunden.
Kein Kanal meldet sich von selbst.
"""
from __future__ import annotations

import os
import sys

ASSISTENT = 230          # Konto „Claude Code AI"
# Antworten, die keine sind. Endet ein Chat damit, ist er erledigt.
SCHLUSSWORTE = ("danke", "thanks", "merci", "grazie", "gracias", "thank you", "perfekt",
                "perfect", "ok", "super", "top", "cheers", "bedankt", "dank je")


def main() -> int:
    if not os.environ.get("DATABASE_URL"):
        sys.exit("DATABASE_URL fehlt — s. Kopfzeile.")
    sys.path.insert(0, ".")
    from sqlalchemy import create_engine, text

    e = create_engine(os.environ["DATABASE_URL"])
    offen = 0
    with e.connect() as c:
        print("=" * 78)
        print("1:1-CHATS an das Assistenten-Konto — offen = der andere war zuletzt dran")
        print("=" * 78)
        scopes = [r[0] for r in c.execute(text(
            "SELECT DISTINCT scope FROM chat_messages WHERE scope LIKE 'dm:%' "
            "AND (scope LIKE :a OR scope LIKE :b)"), {"a": f"dm:{ASSISTENT}-%", "b": f"%-{ASSISTENT}"})]
        treffer = []
        for sc in scopes:
            r = c.execute(text(
                "SELECT m.user_id, u.display_name, m.text, m.created_at FROM chat_messages m "
                "JOIN users u ON u.id = m.user_id WHERE m.scope = :s AND m.hidden IS NOT TRUE "
                "ORDER BY m.id DESC LIMIT 1"), {"s": sc}).fetchone()
            if not r or r[0] == ASSISTENT:
                continue
            kurz = " ".join((r[2] or "").split())
            # „Danke!" beendet ein Gespraech, es eroeffnet keins.
            hoeflich = len(kurz) <= 40 and any(w in kurz.lower() for w in SCHLUSSWORTE)
            treffer.append((r[3], sc, r[1], kurz, hoeflich))
        for zeit, sc, name, kurz, hoeflich in sorted(treffer, reverse=True):
            art = "nur Dank" if hoeflich else "ANTWORT NOETIG"
            if not hoeflich:
                offen += 1
            print(f"  [{art:14}] {str(zeit)[:16]} {sc:15} {name[:20]:22} {kurz[:90]}")
        if not treffer:
            print("  nichts offen")

        print()
        print("=" * 78)
        print("OEFFENTLICHE CHATS — Erwaehnungen des Assistenten (14 Tage)")
        print("=" * 78)
        leer = True
        for r in c.execute(text(
                "SELECT m.scope, u.display_name, m.text, m.created_at FROM chat_messages m "
                "JOIN users u ON u.id = m.user_id WHERE m.created_at > now() - interval '14 days' "
                "AND m.user_id <> :me AND m.scope NOT LIKE 'dm:%' "
                "AND (m.text ILIKE '%claude%' OR m.text ILIKE '%assistent%') "
                "ORDER BY m.id DESC LIMIT 10"), {"me": ASSISTENT}):
            leer = False
            print(f"  {str(r[3])[:16]} {r[0]:14} {r[1][:18]:20} {' '.join((r[2] or '').split())[:80]}")
        if leer:
            print("  keine")

        print()
        print("=" * 78)
        print("FEEDBACK-FORMULAR — Achtung: bearbeitete Meldungen loescht Jan, die Tabelle")
        print("ist kein Archiv. Leer heisst 'nichts Neues'.")
        print("=" * 78)
        leer = True
        for r in c.execute(text(
                "SELECT f.id, f.created_at, f.user_id, u.display_name, f.starred, f.url, f.text "
                "FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 20")):
            leer = False
            marke = "markiert" if r[4] else "OFFEN   "
            if not r[4]:
                offen += 1
            print(f"  [{marke}] #{r[0]:<4} {str(r[1])[:16]} u{str(r[2]):>4} {str(r[3])[:16]:18} {str(r[5] or '')[:22]}")
            print(f"             {' '.join((r[6] or '').split())[:110]}")
        if leer:
            print("  leer — nichts Unbearbeitetes")

    print()
    print("=" * 78)
    print(f"{offen} Vorgang/Vorgaenge brauchen eine Reaktion.")
    print("GitHub FEHLT hier und muss von Hand nachgesehen werden:")
    print("  https://api.github.com/repos/kechel/pumpfoil/issues?state=open&sort=updated"
          "&direction=desc&per_page=20")
    print("  (liefert Issues UND Pull Requests · comments=0 heisst: nie beantwortet)")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
