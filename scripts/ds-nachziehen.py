"""Ø Speed im Bestand auf „ueber die fertigen Laeufe" nachziehen (16.11.2026, Jans OK).

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" .venv/bin/python ../scripts/ds-nachziehen.py [--echt]

Aendert NUR `analysis_results.metrics_json.avg_speed_mps` — aus den gespeicherten Laeufen (`segments_json`), mit derselben
Funktion wie die Pipeline (`app.analysis.ds_ueber_laeufe`). Keine Neuauswertung, Laeufe/Wertungen bleiben unberuehrt.
Nur Auswertungen mit Lauferkennung (`detection` != none; ohne bleibt der Strecken-Ø). Sessions mit `auswertung_fest` werden ausgelassen (von Hand festgehalten). Ohne --echt nur zaehlen. Mit --echt vorher
Sicherung der alten Werte nach data/analyse-notizen/<datum>-ds/ (neue Datei), dann blockweise committen.
"""
import datetime, json, os, pathlib, sys

import psycopg

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))
from app.analysis import ds_ueber_laeufe  # noqa: E402

ECHT = "--echt" in sys.argv
BLOCK = 500
db = psycopg.connect(os.environ["DATABASE_URL"].strip('"').replace("+psycopg", ""))
rows = db.execute("""select a.id, a.session_id, a.metrics_json, a.segments_json from analysis_results a
                     join sessions s on s.id = a.session_id where not coalesce(s.auswertung_fest, false)
                     and coalesce(a.detection, 'none') <> 'none'""").fetchall()
fest = db.execute("select count(*) from sessions where coalesce(auswertung_fest, false)").fetchone()[0]
aenderungen = []
for aid, sid, mj, sj in rows:
    m = json.loads(mj) if isinstance(mj, str) else (mj or {})
    segs = json.loads(sj) if isinstance(sj, str) else (sj or [])
    alt, neu = m.get("avg_speed_mps"), ds_ueber_laeufe(segs)
    if alt != neu:
        aenderungen.append((aid, sid, alt, neu))
print(f"{len(rows)} Auswertungen geprueft, {len(aenderungen)} mit anderem Ø, {fest} festgehaltene ausgelassen")
if not ECHT:
    db.rollback()
    sys.exit(0)
ziel = pathlib.Path("data/analyse-notizen") / f"{datetime.date.today():%Y-%m-%d}-ds"
ziel.mkdir(parents=True, exist_ok=True)
datei = ziel / f"avg_speed-vorher-{datetime.datetime.now():%H%M%S}.json"
datei.write_text(json.dumps([{"analysis_id": a, "session_id": s, "avg_speed_mps": alt} for a, s, alt, _ in aenderungen]))
print("Sicherung:", datei)
for i in range(0, len(aenderungen), BLOCK):
    with db.transaction():
        for aid, _, _, neu in aenderungen[i:i + BLOCK]:
            db.execute("""update analysis_results set metrics_json =
                          jsonb_set(metrics_json::jsonb, '{avg_speed_mps}', %s::jsonb)::text where id = %s""",
                       (json.dumps(neu), aid))
    print(f"  {min(i + BLOCK, len(aenderungen))}/{len(aenderungen)}")
db.commit()
