#!/usr/bin/env python3
"""Event-Wache: meldet je Zeile neue/geaenderte Sessions im Fenster eines globalen Events und jeden Wechsel in den Top 5.
Nur lesend. Gedacht als Monitor (jede Zeile = Meldung), laeuft bis zum Einfrieren (Ende + 4 h) oder --bis.

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" .venv/bin/python -u ../scripts/event-wache.py --event 11

AUFFAELLIG = zaehlt und (fremde Aufnahme-Sportart, generic/open_water sind normale Garmin-Profile | Schnitt > 18 | max > 30 | 100 m > 25 | 1 min > 22 km/h | Konto < 2 Tage).
Erster Einsatz Flying Sprint 15.11.2026 (Wingfoil-Session kurz auf Platz 1, bis Jan sie aussortierte). docs/TEAMS.md.
"""
import pathlib
import os, sys, time, json, urllib.request, datetime as dt
import psycopg
import argparse
ap = argparse.ArgumentParser(); ap.add_argument("--event", type=int, required=True); ap.add_argument("--slug", default="pumpfoil")
ap.add_argument("--takt", type=int, default=120); args = ap.parse_args()
db = os.environ["DATABASE_URL"].replace("+psycopg", "")
with psycopg.connect(db) as _c:
    EV_START, EV_ENDE = _c.execute("select start, ende from team_events where id=%s", (args.event,)).fetchone()
ENDE = EV_ENDE + dt.timedelta(hours=4)       # Einfrieren
start = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=2)
gesehen = {}
top = {}
import importlib.util
_spec = importlib.util.spec_from_file_location("bp", str(pathlib.Path(__file__).resolve().parent / "bot-post.py"))
bp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(bp)
def token():
    e, p = bp.lade_zugang(); t = bp.anfrage("/api/auth/login", {"email": e, "password": p}, methode="POST")
    return t.get("access_token") or t.get("token")
TOK = [None]
def boards():
    out = {}
    for eid in (args.event,):
        try:
            if not TOK[0]: TOK[0] = token()
            try:
                d = bp.anfrage(f"/api/teams/{args.slug}/events/{eid}?mix=1&sprint=1", token=TOK[0])
            except Exception:
                TOK[0] = token(); d = bp.anfrage(f"/api/teams/{args.slug}/events/{eid}?mix=1&sprint=1", token=TOK[0])
        except Exception as e:
            print(f"FEHLER Abruf Event {eid}: {e}", flush=True); continue
        for x in d.get("tafeln") or []:
            k = f"E{eid}:{x.get('kennzahl') or x.get('titel')}"
            if k in out: continue
            out[k] = [f"{z.get('name')} {round((z.get('value') or 0)*3.6,2)} km/h" for z in (x.get("zeilen") or [])[:5]]
    return out
erst = True
while dt.datetime.now(dt.timezone.utc) < ENDE:
    try:
        c = psycopg.connect(db)
        rows = c.execute("""select s.id,s.user_id,u.display_name,u.created_at,s.sport,s.sport_class,s.is_pumpfoil,s.needs_classification,
              s.place_name,s.device_model,s.app_version,s.started_at,a.num_runs,a.max_speed_mps,(a.metrics_json::jsonb->>'avg_speed_mps')::float,
              a.sprint_100m_mps,a.sprint_60s_mps,a.foiling_distance_m,coalesce(s.updated_at,s.created_at),a.created_at
            from sessions s join users u on u.id=s.user_id left join analysis_results a on a.session_id=s.id
            where not s.deleted and s.merged_into is null and s.status='analyzed'
              and s.started_at >= %s and s.started_at < %s
              and greatest(coalesce(s.updated_at,s.created_at), coalesce(a.created_at,s.created_at)) > %s""", (EV_START, EV_ENDE, start)).fetchall()
        c.close()
        for r in rows:
            (sid,uid,name,ucr,sport,scl,pf,nc,ort,dev,app,st,n,mx,avg,s100,s60,fd,upd,acr) = r
            key = (sid, str(upd), str(acr), pf, nc)
            if gesehen.get(sid) == key: continue
            gesehen[sid] = key
            kmh = lambda v: round((v or 0)*3.6, 1)
            fl = []
            if sport and sport not in ("pumpfoil", "generic", "open_water"): fl.append(f"Sportart-Aufnahme {sport}")
            if scl and scl not in ("pumpfoil", "foil_scoot"): fl.append(f"Klasse {scl}")
            if (avg or 0)*3.6 > 18: fl.append("Schnitt>18")
            if (mx or 0)*3.6 > 30: fl.append("max>30")
            if (s100 or 0)*3.6 > 25: fl.append("100m>25")
            if (s60 or 0)*3.6 > 22: fl.append("1min>22")
            if ucr and (dt.datetime.now(dt.timezone.utc) - ucr).days < 2: fl.append("Konto neu")
            zaehlt = pf and not nc and (scl in (None, "pumpfoil", "foil_scoot"))
            tag = ("AUFFAELLIG" if fl and zaehlt else "neu") + (" (zaehlt)" if zaehlt else " (zaehlt nicht)")
            print(f"{tag}: session {sid} u{uid} {name} | {st.astimezone().strftime('%d.%m %H:%M')} {ort} {dev or ''} {app or ''} | "
                  f"{n} Laeufe, {round((fd or 0)/1000,2)} km, Schnitt {kmh(avg)}, max {kmh(mx)}, 100m {kmh(s100)}, 1min {kmh(s60)} "
                  f"| {', '.join(fl) or 'ok'}", flush=True)
    except Exception as e:
        print(f"FEHLER DB: {e}", flush=True)
    b = boards()
    for k, v in b.items():
        if erst: top[k] = v; continue
        if top.get(k) != v:
            print(f"TOP5 {k}: {' / '.join(v)}", flush=True)
            top[k] = v
    erst = False
    time.sleep(args.takt)
print("Wache beendet (Einfrieren).", flush=True)
