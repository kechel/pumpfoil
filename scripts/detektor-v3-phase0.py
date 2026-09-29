#!/usr/bin/env python3
"""Erkennung v3, Phase 0: Ausgangsstand einfrieren + Label-Satz sammeln. REIN LESEND.

Schreibt NUR nach server/data/ml/ (gitignored, liegt im Backup) — nie in die Datenbank:

  baseline-<datum>.json.gz   heutige Ergebnisse JEDER Session (Laeufe in Session-ms, Summen,
                             Erkennung, Sportart + Herkunft, Empfindlichkeit des Nutzers, die
                             Ergebnisse unter den anderen Empfindlichkeiten, Fremdkraft-Laeufe)
  labels-<datum>.json.gz     alles, was ein MENSCH ueber Laeufe/Sessions gesagt hat, je Quelle
                             mit Vertrauensstufe — plus die maschinellen Kandidaten, klar getrennt

Plan und Entscheidungen: docs/DETECTION-V3.md.

Aufruf (aus server/, DATABASE_URL muss im Env stehen — s. CLAUDE.md):
  DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" .venv/bin/python ../scripts/detektor-v3-phase0.py
"""
import datetime as dt
import gzip
import hashlib
import json
import os
import pathlib
import sys

import sqlalchemy as sa

WURZEL = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WURZEL / "server"))
AUS = WURZEL / "server" / "data" / "ml"

# Vertrauensstufen der Sportart-Herkunft (`sessions.sport_source`).
VERTRAUEN_SPORT = {"owner": "mensch", "admin": "mensch", "file": "datei", "auto": "maschine",
                   "default": "profil"}


def _j(s, leer):
    if not s:
        return leer
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return leer


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL fehlt (s. CLAUDE.md)")
    e = sa.create_engine(url)
    heute = dt.date.today().isoformat()
    AUS.mkdir(parents=True, exist_ok=True)

    # Nur lesen: die Verbindung laeuft in einer Transaktion, die nie committet wird.
    with e.connect() as c:
        c.execute(sa.text("SET TRANSACTION READ ONLY"))
        rows = c.execute(sa.text("""
            select s.id, s.user_id, s.device_id, s.started_at, s.ended_at, s.device_model,
                   s.app_version, s.accel_hz, s.placement, s.sport_class, s.sport_source,
                   s.is_pumpfoil, s.pumpfoil_override, s.trim_start_ms, s.trim_end_ms, s.trim_auto,
                   s.excluded_ranges, s.fremdkraft_keep, s.session_uuid, s.place_lat, s.place_lon,
                   s.sport_auto_json,
                   u.foil_sensitivity,
                   a.algo_version, a.detection, a.num_runs, a.foiling_time_s, a.foiling_distance_m,
                   a.pump_count, a.segments_json, a.metrics_json, a.sensitivity_json
            from sessions s
            join users u on u.id = s.user_id
            left join analysis_results a on a.session_id = s.id
            where not coalesce(s.deleted, false) and s.merged_into is null
            order by s.id""")).mappings().all()

        baseline = []
        for r in rows:
            segs = _j(r["segments_json"], [])
            m = _j(r["metrics_json"], {})
            sens = _j(r["sensitivity_json"], {})
            baseline.append({
                "id": r["id"], "user_id": r["user_id"], "device_id": r["device_id"],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "ended_at": r["ended_at"].isoformat() if r["ended_at"] else None,
                "device_model": r["device_model"], "app_version": r["app_version"],
                "accel_hz": r["accel_hz"], "accel_hz_measured": m.get("accel_hz_measured"),
                "time_base": m.get("time_base"), "placement": r["placement"],
                "sport_class": r["sport_class"], "sport_source": r["sport_source"],
                "is_pumpfoil": r["is_pumpfoil"], "pumpfoil_override": r["pumpfoil_override"],
                "trim": [r["trim_start_ms"], r["trim_end_ms"]], "trim_auto": r["trim_auto"],
                "sensitivity": r["foil_sensitivity"],
                # Eigenes Sportart-Urteil der Erkennung (sportauto), unabhaengig vom Menschen.
                "sport_auto": (_j(r["sport_auto_json"], {}) or {}).get("hinweis"),
                "place": [r["place_lat"], r["place_lon"]], "uuid": r["session_uuid"],
                "algo_version": r["algo_version"], "detection": r["detection"],
                "num_runs": r["num_runs"], "foiling_time_s": r["foiling_time_s"],
                "foiling_distance_m": r["foiling_distance_m"], "pump_count": r["pump_count"],
                # Laeufe in SESSION-ms (nicht auf den Trim bezogen), s. DATA-PIPELINE.md.
                "runs": [{"t0": s.get("t_start_session_ms"), "t1": s.get("t_end_session_ms"),
                          "dist_m": s.get("distance_m"), "dur_s": s.get("duration_s"),
                          "pumps": s.get("pumps"), "pump_hz": s.get("avg_pump_hz"),
                          "avg_mps": s.get("avg_speed_mps"), "max_mps": s.get("max_speed_mps")}
                         for s in segs],
                "powered_ranges_ms": m.get("powered_ranges_ms") or [],
                "fremdkraft_laeufe": m.get("fremdkraft_laeufe") or [],
                "andere_empfindlichkeit": {k: {"num_runs": v.get("num_runs"),
                                               "foiling_time_s": v.get("foiling_time_s"),
                                               "foiling_distance_m": v.get("foiling_distance_m")}
                                           for k, v in sens.items() if isinstance(v, dict)},
            })

        # --- Labels ---------------------------------------------------------------------
        labels = {"_meta": {
            "stand": heute,
            "regel": "Menschliche Quellen und maschinelle Kandidaten getrennt. Zeiten in "
                     "SESSION-ms. Vertrauen: mensch > datei > profil > maschine.",
        }}
        labels["sportart_je_session"] = [
            {"session": r["id"], "user": r["user_id"], "sport": r["sport_class"] or "pumpfoil",
             "quelle": r["sport_source"], "vertrauen": VERTRAUEN_SPORT.get(r["sport_source"], "?")}
            for r in rows if r["sport_source"] in ("owner", "admin", "file")]
        labels["pumpfoil_override"] = [
            {"session": r["id"], "user": r["user_id"], "pumpfoil": r["pumpfoil_override"]}
            for r in rows if r["pumpfoil_override"] is not None]
        labels["nutzer_aussortiert"] = [
            {"session": r["id"], "user": r["user_id"], "bereiche": _j(r["excluded_ranges"], [])}
            for r in rows if _j(r["excluded_ranges"], [])]
        labels["nutzer_zurueckgeholt"] = [
            {"session": r["id"], "user": r["user_id"], "bereiche": _j(r["fremdkraft_keep"], [])}
            for r in rows if _j(r["fremdkraft_keep"], [])]
        labels["bereiche_labels_tabelle"] = [
            dict(session=x[0], t0=x[1], t1=x[2], label=x[3])
            for x in c.execute(sa.text("select session_id, t_start_ms, t_end_ms, label from labels"))]
        labels["pump_tipps"] = [
            dict(session=x[0], t_ms=x[1], lauf=x[2], take=x[3])
            for x in c.execute(sa.text("select session_id, t_ms, run_idx, take from pump_truth"))]
        rj = WURZEL / "server" / "data" / "ground-truth" / "runs.json"
        labels["laeufe_runs_json"] = json.loads(rj.read_text())["laeufe"] if rj.exists() else []
        labels["handy_am_brett"] = [
            {"session": r["id"], "user": r["user_id"], "device_model": r["device_model"]}
            for r in rows if r["placement"] == "board"]

    def schreiben(name, obj):
        p = AUS / f"{name}-{heute}.json.gz"
        roh = json.dumps(obj, ensure_ascii=False, default=str).encode()
        with gzip.open(p, "wb") as f:
            f.write(roh)
        print(f"{p.relative_to(WURZEL)}  {len(roh) / 1e6:.1f} MB roh  sha256 {hashlib.sha256(roh).hexdigest()[:16]}")

    schreiben("baseline", baseline)
    schreiben("labels", labels)
    mit_accel = sum(1 for b in baseline if (b["accel_hz"] or 0) >= 15
                    and b["detection"] not in (None, "gps_only", "none"))
    print(f"Sessions {len(baseline)} · mit Beschleunigung {mit_accel} · "
          f"Laeufe {sum(len(b['runs']) for b in baseline)}")
    for k, v in labels.items():
        if k != "_meta":
            print(f"  {k:26s} {len(v)}")


if __name__ == "__main__":
    main()
