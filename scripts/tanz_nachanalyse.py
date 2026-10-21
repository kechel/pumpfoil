"""Jans Tanz-Sessions so auswerten, als haette die aktuelle Erkennung (app/tanz_analyse.py = Tanz.mc)
sie schon auf der Uhr gemacht, und das Ergebnis als Tabelle „Taenze" ablegen (data/<uuid>/tanz.json).
Schreibt NUR diese Datei; das Original der Uhr bleibt unter "uhr" erhalten. Keine DB-Schreibzugriffe.
Jan, 21.10.2026: „tu einfach so als waeren meine vergangenen sessions schon mit der neuen version
analysiert worden, dann sehen wir doch was die erkannt haette in der tabelle".

  cd server && .venv/bin/python ../scripts/tanz_nachanalyse.py            # nur zeigen
  cd server && .venv/bin/python ../scripts/tanz_nachanalyse.py --schreiben
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from app import models, storage, tanz, tanz_analyse as ta  # noqa: E402
from app.db import SessionLocal  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "server" / "app" / "data"
IDS = [16753, 16863, 16875, 16884, 16976, 17604, 17613, 17685, 17688, 17689]


def main():
    w = json.loads((DATA / "tanz_wahrheit.json").read_text())
    wahr = {e["id"]: e for e in w["sessions"]}
    db = SessionLocal()
    for sid in IDS:
        s = db.get(models.Session, sid)
        a = storage.load_accel(s.session_uuid).astype(float) / (s.accel_scale or 1000)
        g = storage.load_gyro(s.session_uuid).astype(float)
        g = g[:len(a)] / 1024 * 180 / math.pi if len(g) else None
        fs = ta.fenster(a, g)
        alt = tanz.laden(s.session_uuid) or {}
        uhr = alt.get("uhr") or ([] if alt.get("quelle") == "nachanalyse" else alt.get("abschnitte")) or []
        marker = [(m["start_ms"], m["gewaehlt"]) for m in uhr if m.get("quelle") == "marker" and m.get("gewaehlt")]
        gedeutet = ta.marker_deuten(marker, fs)
        rows = []
        # Ein erkannter Abschnitt ohne Pause kann mehrere Taenze enthalten (#17689: Wiener Walzer,
        # Quickstep, Cha-Cha-Cha am Stueck) — an Jans Markern teilen.
        teile = []
        for von, bis, ws in ta.abschnitte(fs):
            schnitte = [von] + sorted(ms for ms, _k in marker if von < ms < bis) + [bis]
            for v2, b2 in zip(schnitte, schnitte[1:]):
                w2 = [f for f in ws if v2 <= f["t_ms"] < b2]
                if w2:
                    teile.append((v2, b2, w2))
        for von, bis, ws in teile:
            m = ta.merkmale(ws)
            row = {"start_ms": von, "ende_ms": bis, "vorschlag": ta.vorschlag(ws), "gewaehlt": None,
                   "quelle": "nachanalyse", "tempo": int(m["tempo"]), "dreh": m["dreh"]}
            # Wahrheit: Marker-Deutung (meiste Ueberlappung) oder Jans Angabe zur Session
            best, ov = None, 0
            for mv, mb, key in gedeutet:
                o = min(bis, mb) - max(von, mv)
                if o > ov:
                    best, ov = key, o
            if best:
                row["gewaehlt"], row["quelle"] = best, "marker"
            elif sid in wahr:
                for wv, wb, key in wahr[sid]["abschnitte"]:
                    if von >= wv and (wb is None or von < wb):
                        row["gewaehlt"], row["quelle"] = key, "beschreibung"
            rows.append(row)
        # Marker-Strecken, die die Erkennung gar nicht gefunden hat, trotzdem zeigen
        for mv, mb, key in gedeutet:
            if not any(min(r["ende_ms"], mb) - max(r["start_ms"], mv) > 0 for r in rows):
                ws = [f for f in fs if mv <= f["t_ms"] < mb]
                m = ta.merkmale(ws)
                rows.append({"start_ms": mv, "ende_ms": mb, "vorschlag": ta.vorschlag(ws), "gewaehlt": key,
                             "quelle": "marker_ohne_erkennung", "tempo": int(m["tempo"]), "dreh": m["dreh"]})
        rows.sort(key=lambda r: r["start_ms"])
        ok = sum(1 for r in rows if r["gewaehlt"] and r["gewaehlt"] == r["vorschlag"])
        mit = sum(1 for r in rows if r["gewaehlt"])
        print(f"\n#{sid} ({s.caption or '-'}): {len(rows)} Abschnitte, Vorschlag richtig {ok}/{mit}")
        for r in rows:
            print(f"   {r['start_ms']/60000:6.1f}-{(r['ende_ms'] or 0)/60000:6.1f} min  Uhr: {r['vorschlag'] or '-':10} "
                  f"wahr: {r['gewaehlt'] or '-':10} {r['quelle']:22} tempo {r['tempo']} dreh {r['dreh']}")
        if "--schreiben" in sys.argv:
            d = {"abschnitte": rows, "quelle": "nachanalyse", "uhr": uhr if uhr else None,
                 "muster": "app/data/tanz_muster.json"}
            p = storage.ensure_session_dir(s.session_uuid) / "tanz.json"
            p.write_text(json.dumps(d, ensure_ascii=False))
    if "--schreiben" in sys.argv:
        print("\ngeschrieben.")


if __name__ == "__main__":
    main()
